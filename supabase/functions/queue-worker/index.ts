import { createClient } from 'npm:@supabase/supabase-js@2.53.0';
import puppeteer from 'npm:puppeteer@22.12.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

// Optional: maximum number of fix iterations, defaults to 5 if not set
const MAX_HTML_FIX_ITER = Number(Deno.env.get('MAX_HTML_FIX_ITER') || 5);

console.log('Queue worker starting with environment:', {
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
  hasOpenAIKey: !!OPENAI_API_KEY
});

// Create Supabase client with service role key for full access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface QueueItem {
  id: string;
  infographic_page_id: string;
  user_id: string;
  status: string;
  user_comment: string;
  requested_at: string;
}

interface InfographicPage {
  id: string;
  title: string;
  content_markdown: string;
  generated_html: string;
  last_generation_comment: string;
  infographic_id: string;
}

interface Infographic {
  id: string;
  name: string;
  description: string;
  style_description: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function processQueueItem(queueItem: QueueItem): Promise<void> {
  console.log(`Processing queue item ${queueItem.id} for page ${queueItem.infographic_page_id}`);
  
  try {
    // Mark as processing
    await supabase
      .from('generation_queue')
      .update({ 
        status: 'processing',
        processed_at: new Date().toISOString()
      })
      .eq('id', queueItem.id);

    // Fetch page data
    const { data: page, error: pageError } = await supabase
      .from('infographic_pages')
      .select('*')
      .eq('id', queueItem.infographic_page_id)
      .single();

    if (pageError || !page) {
      throw new Error(`Failed to fetch page: ${pageError?.message || 'Page not found'}`);
    }

    // Fetch infographic data
    const { data: infographic, error: infographicError } = await supabase
      .from('infographics')
      .select('*')
      .eq('id', page.infographic_id)
      .single();

    if (infographicError || !infographic) {
      throw new Error(`Failed to fetch infographic: ${infographicError?.message || 'Infographic not found'}`);
    }

    // If there's existing HTML and this is a regeneration with a comment, save current version to history
    if (page.generated_html && queueItem.user_comment) {
      console.log('Saving current version to history before regeneration');
      const { error: historyError } = await supabase
        .from('infographic_pages_history')
        .insert({
          infographic_page_id: page.id,
          generated_html: page.generated_html,
          user_comment: page.last_generation_comment || 'Initial generation',
          user_id: queueItem.user_id
        });
      
      if (historyError) {
        console.error('Failed to save to history:', historyError);
        // Do not fail the generation
      }
    }

    // Generate HTML using OpenAI (main agent)
    const generatedHtml = await generateHtmlWithOpenAI({
      title: page.title,
      contentMarkdown: page.content_markdown,
      styleDescription: infographic.style_description,
      projectDescription: infographic.description,
      previousHtml: page.generated_html,
      previousComment: page.last_generation_comment,
      userComment: queueItem.user_comment,
    });

    // Validate and repair HTML using the secondary agent loop until zero errors
    const finalHtml = await validateAndRepairHtmlLoop(generatedHtml);

    // Update page with final HTML
    const { error: updatePageError } = await supabase
      .from('infographic_pages')
      .update({ 
        generated_html: finalHtml,
        last_generation_comment: queueItem.user_comment || ''
      })
      .eq('id', queueItem.infographic_page_id);

    if (updatePageError) {
      throw new Error(`Failed to update page: ${updatePageError.message}`);
    }

    // Mark as completed
    await supabase
      .from('generation_queue')
      .update({ 
        status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('id', queueItem.id);

    console.log(`Successfully processed queue item ${queueItem.id}`);

  } catch (error) {
    console.error(`Error processing queue item ${queueItem.id}:`, error);
    
    // Mark as failed
    await supabase
      .from('generation_queue')
      .update({ 
        status: 'failed',
        processed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', queueItem.id);
  }
}

async function generateHtmlWithOpenAI(params: {
  title: string;
  contentMarkdown: string;
  styleDescription: string;
  projectDescription: string;
  previousHtml?: string;
  previousComment?: string;
  userComment?: string;
}): Promise<string> {
  const { title, contentMarkdown, styleDescription, projectDescription, previousHtml, previousComment, userComment } = params;

  let prompt = `
You are an expert infographic designer. Create a beautiful, modern HTML page for an infographic slide.

Project Context:
- Project Description: {{{
${projectDescription}
}}}
- Style Guidelines: {{{
${styleDescription}
}}}
- Page Title: {{{${title}}}}

Content to Transform:
{{{
${contentMarkdown}
}}}`;

  // If this is a regeneration with user feedback, include context
  if (previousHtml && userComment) {
    prompt += `

REGENERATION REQUEST:
This is a regeneration of an existing page. The user has provided feedback for improvements.

Previous Version Context:
- Previous Comment: {{{${previousComment || 'Initial generation'}}}}
- User Feedback: {{{${userComment}}}}

Please take the user's feedback into account and improve the page accordingly. The user wants you to modify the existing design based on their specific requests.`;
  }

  prompt += `

Requirements:
1. Create a complete HTML page with embedded CSS
2. Use modern, clean design principles
3. Make it visually appealing with proper typography, colors, and spacing
4. Include the content in a structured, easy-to-read format
5. Use CSS Grid or Flexbox for layout
6. Make it responsive
7. Follow the style guidelines provided
8. Use appropriate icons, charts, or visual elements where relevant
9. Ensure high contrast and readability
10. The page should be self-contained (no external dependencies)${userComment ? `
11. IMPORTANT: Address the user's specific feedback: ${userComment}` : ''}`;

  const requestBody = {
    model: 'o4-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert infographic & data-visualization designer.

Output MUST be valid JSON following the provided schema, where \`generatedHtml\` contains a full, production-ready HTML5 document.

Design guidelines:
• Visual polish: clean, spacious, modern typography.
• Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>).
• Include Lucide icons via CDN (<script src="https://cdn.jsdelivr.net/npm/lucide@latest"></script>) and initialize with \`lucide.createIcons()\`.
• For mathematical equations (when applicable to context): Use MathJax via CDN (<script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script> and <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>) to render beautiful LaTeX equations. Configure MathJax with proper delimiters and display options.
• For animations (when applicable): Use Framer Motion via CDN (<script src="https://cdn.jsdelivr.net/npm/framer-motion@latest/dist/framer-motion.js"></script>) to create smooth, professional animations and transitions where appropriate.
• Bring data to life with interactive charts with Chart.js via CDN(<script src="https://cdn.jsdelivr.net/npm/chart.js@latest/dist/chart.umd.min.js"></script>) and dynamic graphs and timelines using vis-timeline via CDN (https://cdn.jsdelivr.net/npm/vis-timeline@latest/dist/vis-timeline-graph2d.min.js, https://cdn.jsdelivr.net/npm/vis-timeline@latest/styles/vis-timeline-graph2d.min.css).
• Source high-resolution royalty-free hero/illustration images from Pexels URLs that match the page topic and add descriptive alt text.
• Employ semantic HTML5 sections (header, main, section, article, figure, footer) and ARIA labels for accessibility.
• Ensure a mobile-first, responsive layout using Flexbox or CSS Grid with sensible breakpoints.
• Keep JavaScript scoped at the end of <body>; separate content, presentation, and behavior.
• Do NOT include any explanatory text outside the JSON object.
• Never break the JSON schema or return partial/empty content.
• Never badd an external link to a ressource, under any circonstance: the page must be self contained.
• Make sure the page renders correctly when opened directly in a browser.
• Make sure the page always ends with a footer mentionning "Presentation made by InfogrAIphics by P2Enjoy SAS - Copyright 2025"`
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_completion_tokens: 100000,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'infographic_html',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            generatedHtml: {
              type: 'string',
              description: 'Complete HTML page with embedded CSS for the infographic'
            }
          },
          required: ['generatedHtml'],
          additionalProperties: false
        }
      }
    }
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const responseContent = data.choices[0]?.message?.content || '';
  
  if (!responseContent) {
    throw new Error('No response content from OpenAI');
  }

  const parsedResponse = JSON.parse(responseContent);
  
  if (!parsedResponse.generatedHtml) {
    throw new Error('No HTML content generated by AI');
  }

  return parsedResponse.generatedHtml;
}

/* ----------------------
   VALIDATION AND REPAIR
   ---------------------- */

type NuValidatorMessage = {
  type: 'error' | 'info' | 'warning';
  message: string;
  extract?: string;
  lastLine?: number;
  lastColumn?: number;
  subType?: string;
};

// NEW: A specific type for runtime errors found by Puppeteer
type RuntimeError = {
    type: 'error';
    subType: 'javascript' | 'loading';
    message: string;
    extract?: string;
};

type ValidationResult = {
  valid: boolean;
  errors: NuValidatorMessage[];
  allMessages: NuValidatorMessage[];
};

// NEW: Validate JS and resource loading using a headless browser
async function validateJavaScriptAndLoading(html: string): Promise<{ errors: RuntimeError[] }> {
    let browser;
    try {
        console.log('Launching headless browser for JS and loading validation...');
        // Launch Puppeteer. These args are often needed in containerized environments.
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        const errors: RuntimeError[] = [];

        // Listen for JavaScript errors in the page's console
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('Captured JS Error:', msg.text());
                errors.push({
                    type: 'error',
                    subType: 'javascript',
                    message: `JavaScript console error: ${msg.text()}`,
                });
            }
        });

        // Listen for failed network requests (e.g., 404s for images, scripts)
        page.on('requestfailed', request => {
            console.log('Captured Loading Error:', request.url());
            errors.push({
                type: 'error',
                subType: 'loading',
                message: `Failed to load resource: ${request.failure()?.errorText}`,
                extract: `URL: ${request.url()}`
            });
        });

        // Load the HTML content. 'domcontentloaded' is generally safer than 'networkidle'.
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        
        // Wait a brief moment to allow any async scripts to execute and potentially fail.
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`JS and loading validation complete. Found ${errors.length} errors.`);
        return { errors };
    } catch (e) {
        console.error('Puppeteer validation failed unexpectedly:', e);
        // On a fatal Puppeteer error, return no errors to avoid blocking the pipeline.
        return { errors: [] };
    } finally {
        // Ensure the browser is always closed.
        if (browser) {
            await browser.close();
        }
    }
}


async function validateHtmlWithW3C(html: string): Promise<ValidationResult> {
  try {
    const res = await fetch('https://validator.w3.org/nu/?out=json', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'User-Agent': 'InfogrAIphics-Validator/1.0'
      },
      body: html,
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('W3C validator HTTP error:', res.status, txt);
      // On validator failure, do not block the pipeline
      return { valid: true, errors: [], allMessages: [] };
    }

    const payload = await res.json();
    const messages: NuValidatorMessage[] = payload?.messages || [];
    const errors = messages.filter((m: NuValidatorMessage) => m.type === 'error');
    const valid = errors.length === 0;

    return { valid, errors, allMessages: messages };
  } catch (e) {
    console.error('W3C validator fetch error:', e);
    // On network error, treat as valid to avoid deadlocks
    return { valid: true, errors: [], allMessages: [] };
  }
}

function truncateForPrompt(messages: (NuValidatorMessage | RuntimeError)[], maxChars = 6000): string {
  const json = JSON.stringify(messages);
  if (json.length <= maxChars) return json;
  // Truncate conservatively at message boundaries
  let acc: (NuValidatorMessage | RuntimeError)[] = [];
  let size = 0;
  for (const m of messages) {
    const piece = JSON.stringify(m);
    if (size + piece.length > maxChars) break;
    acc.push(m);
    size += piece.length;
  }
  return JSON.stringify(acc);
}

async function repairHtmlWithOpenAI(html: string, errors: (NuValidatorMessage | RuntimeError)[]): Promise<string> {
  const errorBlob = truncateForPrompt(errors);

  const requestBody = {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: [
          'You are a senior HTML correctness agent.',
          'Your job is to fix only the concrete validator errors provided.',
          'The errors can be HTML syntax errors from a W3C validator, JavaScript runtime errors, or resource loading errors (e.g., 404s).',
          'ONLY FIX THE ERROR AND DO NOT CHANGE ANYTHING ELSE.',
          'If you see a JavaScript error, analyze the script and fix the bug.',
          'If you see a loading error (e.g. 404), correct the resource URL. If it\'s an image from a service like Pexels, find a valid replacement URL on the same topic.',
          'Preserve content, structure, order, classes, ids, inline scripts and styles.',
          'Do not add or remove elements unless strictly necessary to resolve an error.',
          'Do not introduce external resources',
          'Do not reformat whitespace except where required by the fix.',
          'Return valid JSON that matches the schema with the single field fixedHtml.',
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          'Here is the current HTML to fix:',
          '---HTML START---',
          html,
          '---HTML END---',
          '',
          'Here are the validator errors you must address exactly and only:',
          errorBlob
        ].join('\n')
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'html_fix',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            fixedHtml: { type: 'string', description: 'The minimally fixed HTML string' }
          },
          required: ['fixedHtml'],
          additionalProperties: false
        }
      }
    }
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI Fixer API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';
  if (!content) {
    throw new Error('No response content from OpenAI fixer');
  }

  const parsed = JSON.parse(content);
  if (!parsed.fixedHtml) {
    throw new Error('Fixer did not return fixedHtml');
  }
  return parsed.fixedHtml;
}

// UPDATED: This loop now runs W3C, JS, and loading validations
async function validateAndRepairHtmlLoop(initialHtml: string): Promise<string> {
  let html = initialHtml;
  for (let i = 1; i <= MAX_HTML_FIX_ITER; i++) {
    // Run both W3C and Puppeteer validations in parallel for efficiency
    const [w3cValidation, runtimeValidation] = await Promise.all([
        validateHtmlWithW3C(html),
        validateJavaScriptAndLoading(html)
    ]);

    // Combine errors from both validators into a single list
    const allErrors = [...w3cValidation.errors, ...runtimeValidation.errors];

    console.log(`Validation pass ${i}:`, {
      valid: allErrors.length === 0,
      w3cErrorCount: w3cValidation.errors.length,
      runtimeErrorCount: runtimeValidation.errors.length
    });

    if (allErrors.length === 0) {
      console.log('HTML passed all validation checks (W3C, JS, Loading).');
      return html;
    }

    // Repair with the lightweight secondary agent, passing all found errors
    const before = html;
    html = await repairHtmlWithOpenAI(html, allErrors);

    // Guard against non progress
    if (html === before) {
      console.warn('Fixer returned identical HTML, stopping early to prevent loop');
      return html;
    }
  }

  console.warn(`Reached max iterations (${MAX_HTML_FIX_ITER}) with remaining errors`);
  return html;
}

async function processQueue(): Promise<void> {
  console.log('Checking for pending queue items...');
  
  try {
    // Get the next pending item (FIFO)
    const { data: queueItems, error } = await supabase
      .from('generation_queue')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Error fetching queue items:', error);
      return;
    }

    console.log('Queue query result:', {
      itemsFound: queueItems?.length || 0,
      items: queueItems
    });

    if (!queueItems || queueItems.length === 0) {
      console.log('No pending items in queue');
      return;
    }

    const queueItem = queueItems[0] as QueueItem;
    console.log('Processing queue item:', queueItem);
    await processQueueItem(queueItem);

  } catch (error) {
    console.error('Error in processQueue:', error);
  }
}

// Main worker function
async function runWorker(): Promise<void> {
  console.log('Starting generation queue worker...');
  
  while (true) {
    try {
      await processQueue();
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error('Worker error:', error);
      // Wait 10 seconds before retrying on error
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

// Edge function handler
Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method === 'POST') {
      const { action } = await req.json();
      
      if (action === 'start-worker') {
        // Start the worker continuously
        console.log('Starting continuous worker...');
        runWorker().catch(console.error);
        
        return new Response(
          JSON.stringify({ message: 'Worker started' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      if (action === 'process-once') {
        // Process one item from the queue
        console.log('Processing one queue item...');
        await processQueue();
        
        return new Response(
          JSON.stringify({ message: 'Queue processed' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (req.method === 'GET') {
      // Health check endpoint
      return new Response(
        JSON.stringify({ 
          status: 'healthy',
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2.53.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

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
  requested_at: string;
}

interface InfographicPage {
  id: string;
  title: string;
  content_markdown: string;
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

    // Generate HTML using OpenAI
    const generatedHtml = await generateHtmlWithOpenAI({
      title: page.title,
      contentMarkdown: page.content_markdown,
      styleDescription: infographic.style_description,
      projectDescription: infographic.description,
    });

    // Update page with generated HTML
    const { error: updatePageError } = await supabase
      .from('infographic_pages')
      .update({ generated_html: generatedHtml })
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
}): Promise<string> {
  const { title, contentMarkdown, styleDescription, projectDescription } = params;

  const prompt = `You are an expert infographic designer. Create a beautiful, modern HTML page for an infographic slide.

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
}}}

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
10. The page should be self-contained (no external dependencies)`;

  const requestBody = {
    model: 'o3',
    messages: [
      {
        role: 'system',
        content: `You are an expert infographic & data‑visualization designer.

Output MUST be valid JSON following the provided schema, where \`generatedHtml\` contains a full, production‑ready HTML5 document.

Design guidelines:
• Visual polish: clean, spacious, modern typography.
• Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>).
• Include Lucide icons via CDN (<script src="https://cdn.jsdelivr.net/npm/lucide@latest"></script>) and initialize with \`lucide.createIcons()\`.
• For mathematical equations (when applicable to context): Use MathJax via CDN (<script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script> and <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>) to render beautiful LaTeX equations. Configure MathJax with proper delimiters and display options.
• For animations (when applicable): Use Framer Motion via CDN (<script src="https://cdn.jsdelivr.net/npm/framer-motion@latest/dist/framer-motion.js"></script>) to create smooth, professional animations and transitions. Implement entrance animations, hover effects, and scroll-triggered animations where appropriate.
• Bring data to life with interactive charts (prefer Chart.js via CDN) and dynamic timelines (e.g., vis‑timeline or lightweight custom JS).
• Source high‑resolution royalty‑free hero/illustration images from Pexels URLs that match the page topic and add descriptive alt text.
• Employ semantic HTML5 sections (header, main, section, article, figure, footer) and ARIA labels for accessibility.
• Ensure a mobile‑first, responsive layout using Flexbox or CSS Grid with sensible breakpoints.
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
    max_completion_tokens: 32000,
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
        // Start the worker (this will run indefinitely)
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
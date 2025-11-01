import { createClient } from 'npm:@supabase/supabase-js@2.53.0';

//import puppeteer from 'npm:puppeteer@22.12.1';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_GENERATION_MODEL = Deno.env.get('OPENAI_GENERATION_MODEL') ?? 'gpt-4o-2024-08-06';
const OPENAI_FIX_MODEL = Deno.env.get('OPENAI_FIX_MODEL') ?? 'gpt-4o-mini-2024-07-18';
// Optional: maximum number of fix iterations, defaults to 5 if not set
const MAX_HTML_FIX_ITER = Number(Deno.env.get('MAX_HTML_FIX_ITER') || 5);

type ResponsesInputContent = {
  type: 'input_text';
  text: string;
};

type ResponsesMessageRole = 'system' | 'user' | 'assistant';

interface ResponsesMessage {
  role: ResponsesMessageRole;
  content: ResponsesInputContent[];
}

interface JsonSchemaFormat {
  type: 'json_schema';
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

interface JsonObjectFormat {
  type: 'json_object';
}

type ResponsesTextFormat = {
  format: JsonSchemaFormat | JsonObjectFormat;
};

interface OpenAIResponsesRequest {
  model: string;
  input: ResponsesMessage[];
  max_output_tokens?: number;
  text?: ResponsesTextFormat;
}

interface OpenAIResponsePayload extends Record<string, unknown> {
  status?: string;
  incomplete_details?: {
    reason?: string;
    [key: string]: unknown;
  };
  output_text?: string | string[];
  output?: Array<Record<string, unknown>>;
  choices?: Array<Record<string, unknown>>;
  refusal?: Record<string, unknown>;
  error?: {
    message?: string;
    [key: string]: unknown;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractResponseText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const outputText = root.output_text;
  if (typeof outputText === 'string' && outputText.trim().length > 0) {
    return outputText;
  }
  if (Array.isArray(outputText)) {
    for (const item of outputText) {
      if (typeof item === 'string' && item.trim().length > 0) {
        return item;
      }
    }
  }
  const output = root.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as Record<string, unknown>).content;
      if (Array.isArray(content)) {
        for (const chunk of content) {
          if (!chunk || typeof chunk !== 'object') continue;
          const text = (chunk as Record<string, unknown>).text;
          if (typeof text === 'string' && text.trim().length > 0) {
            return text;
          }
        }
      }
    }
  }
  const choices = root.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const legacyText = (message as Record<string, unknown>).content;
        if (typeof legacyText === 'string' && legacyText.trim().length > 0) {
          return legacyText;
        }
      }
    }
  }
  return null;
};

const extractRefusal = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const check = (entry: unknown): Record<string, unknown> | null => {
    if (!entry || typeof entry !== 'object') return null;
    const typed = entry as Record<string, unknown>;
    if (typed.type === 'refusal' || typed.reason === 'refusal' || typeof typed.refusal === 'string') {
      return typed;
    }
    return null;
  };
  const output = root.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const direct = check(item);
      if (direct) return direct;
      if (item && typeof item === 'object') {
        const content = (item as Record<string, unknown>).content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const nested = check(part);
            if (nested) return nested;
          }
        }
      }
    }
  }
  if ('refusal' in root && isRecord(root.refusal)) {
    return root.refusal;
  }
  return null;
};

const humanizeHint = (hint: string) =>
  hint
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || hint;

const GENERATION_HINT_PROMPTS: Record<string, string> = {
  introduction: 'Craft a captivating introduction that clearly states the topic, why it matters, and the expected outcomes for the audience.',
  agenda: 'Include a concise agenda/sommaire that lists the main sections or talking points of the presentation.',
  section_break: 'Design a bold transition slide that introduces the next section with minimal text and strong visuals.',
  dashboard: 'Create a data-rich dashboard with charts, key metrics, and calls-outs. Prioritize clarity, hierarchy, and legends.',
  timeline: 'Use a timeline or roadmap layout to communicate milestones, phases, or a chronological story.',
  process: 'Display a step-by-step process or workflow with numbered stages, icons, and short descriptions.',
  comparison: 'Compare multiple options (e.g., plans, competitors) side-by-side using tables or cards and highlight key differences.',
  persona: 'Present a user persona with demographics, goals, pain points, and relevant context in a visually engaging layout.',
  swot: 'Structure the slide around a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) with balanced emphasis on each quadrant.',
  budget: 'Show budget allocation, costs, or financial forecasts using tables/graphs and highlight the most important figures.',
  technology: 'Illustrate the technical architecture, stack, or integrations with diagrams, icons, and annotations.',
  quote: 'Feature a powerful quote or testimonial with strong typography and supporting imagery.',
  faq: 'Provide a clear FAQ with the top questions and succinct answers, using an easy-to-scan layout.',
  conclusion: 'Summarize the key takeaways and reinforce the core message, optionally listing next steps.',
  call_to_action: 'End with a compelling call to action, highlighting what the audience should do next along with contact or follow-up details.',
};
console.log('Queue worker starting with environment:', {
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
  hasOpenAIKey: !!OPENAI_API_KEY,
  generationModel: OPENAI_GENERATION_MODEL,
  fixModel: OPENAI_FIX_MODEL
});
// Create Supabase client with service role key for full access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

/** -------------------------
 * OpenAI Responses API helpers (API-call ONLY fixes)
 * ------------------------- */
async function callOpenAIResponses(body: OpenAIResponsesRequest): Promise<OpenAIResponsePayload> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();

  if (!res.ok) {
    // Try to surface a helpful message
    let msg = raw;
    try {
      const parsedError = JSON.parse(raw);
      if (
        isRecord(parsedError) &&
        'error' in parsedError &&
        isRecord(parsedError.error) &&
        typeof parsedError.error.message === 'string'
      ) {
        msg = parsedError.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(`OpenAI API error (${res.status}): ${msg}`);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error('OpenAI API returned a non-object payload');
    }
    return parsed as OpenAIResponsePayload;
  } catch {
    throw new Error('OpenAI API returned a non-JSON payload');
  }
}

/**
 * Try primary request (json_schema). If the model rejects json_schema,
 * retry once with JSON mode (text.format = json_object) WITHOUT changing your prompts.
 */
function buildJsonModeFallbackBody(primaryBody: OpenAIResponsesRequest): OpenAIResponsesRequest {
  const { text: _text, ...rest } = primaryBody;
  return {
    ...rest,
    text: {
      format: {
        type: 'json_object'
      }
    }
  };
}

async function callOpenAIWithFallback(primaryBody: OpenAIResponsesRequest) {
  try {
    return await callOpenAIResponses(primaryBody);
  } catch (error: unknown) {
    const msg = error instanceof Error ? String(error.message || '') : '';
    const looksLikeSchemaUnsupported =
      /json_schema/i.test(msg) ||
      /schema/i.test(msg) && /(unsupported|not supported|only available)/i.test(msg);

    if (looksLikeSchemaUnsupported) {
      const fb = buildJsonModeFallbackBody(primaryBody);
      return await callOpenAIResponses(fb);
    }
    throw error;
  }
}

// UPDATED: Added options parameter to pass down validation flags
async function processQueueItem(queueItem, options) {
  console.log(`Processing queue item ${queueItem.id} for page ${queueItem.infographic_page_id}`);
  try {
    // Mark as processing
    await supabase.from('generation_queue').update({
      status: 'processing',
      processed_at: new Date().toISOString()
    }).eq('id', queueItem.id);
    // Fetch page data
    const { data: page, error: pageError } = await supabase.from('infographic_pages').select('*').eq('id', queueItem.infographic_page_id).single();
    if (pageError || !page) {
      throw new Error(`Failed to fetch page: ${pageError?.message || 'Page not found'}`);
    }
    // Fetch infographic data
    const { data: infographic, error: infographicError } = await supabase.from('infographics').select('*').eq('id', page.infographic_id).single();
    if (infographicError || !infographic) {
      throw new Error(`Failed to fetch infographic: ${infographicError?.message || 'Infographic not found'}`);
    }
    // If there's existing HTML, always snapshot before regeneration
    if (page.generated_html) {
      console.log('Saving current version to history before regeneration');
      const historyComment =
        queueItem.user_comment ||
        page.last_generation_comment ||
        'Snapshot before regeneration';
      const { error: historyError } = await supabase
        .from('infographic_pages_history')
        .insert({
          infographic_page_id: page.id,
          generated_html: page.generated_html,
          user_comment: historyComment,
          user_id: queueItem.user_id
        });
      if (historyError) {
        console.error('Failed to save to history:', historyError);
      }
    }
    // Generate HTML using OpenAI (main agent)
    console.log('Generation hints applied:', Array.isArray(page.generation_hints) ? page.generation_hints : []);
    const generatedHtml = await generateHtmlWithOpenAI({
      title: page.title,
      contentMarkdown: page.content_markdown,
      styleDescription: infographic.style_description,
      projectDescription: infographic.description,
      previousHtml: page.generated_html,
      previousComment: page.last_generation_comment,
      userComment: queueItem.user_comment,
      generationHints: Array.isArray(page.generation_hints) ? page.generation_hints : []
    });
    // UPDATED: Determine which validation steps to run.
    // Flags from a direct POST request take precedence over flags on the queue item.
    // Defaults to true if no flags are provided anywhere.
    const validateW3C = options?.validateW3C ?? queueItem.validate_w3c ?? true;
    const validateRuntime = options?.validateRuntime ?? queueItem.validate_runtime ?? true;
    // Validate and repair HTML using the secondary agent loop until zero errors
    const finalHtml = await validateAndRepairHtmlLoop(generatedHtml, {
      validateW3C,
      validateRuntime
    });
    // Update page with final HTML
    const { error: updatePageError } = await supabase.from('infographic_pages').update({
      generated_html: finalHtml,
      last_generation_comment: queueItem.user_comment || ''
    }).eq('id', queueItem.infographic_page_id);
    if (updatePageError) {
      throw new Error(`Failed to update page: ${updatePageError.message}`);
    }
    // Mark as completed
    await supabase.from('generation_queue').update({
      status: 'completed',
      processed_at: new Date().toISOString()
    }).eq('id', queueItem.id);
    console.log(`Successfully processed queue item ${queueItem.id}`);
  } catch (error) {
    console.error(`Error processing queue item ${queueItem.id}:`, error);
    // Mark as failed
    await supabase.from('generation_queue').update({
      status: 'failed',
      processed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : 'Unknown error'
    }).eq('id', queueItem.id);
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
  generationHints?: string[];
}) {
  const {
    title,
    contentMarkdown,
    styleDescription,
    projectDescription,
    previousHtml,
    previousComment,
    userComment,
    generationHints = [],
  } = params;
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

  const activeHints = (generationHints || []).filter((hint) => typeof hint === 'string' && hint.trim().length > 0);
  if (activeHints.length > 0) {
    const hintNarrative = activeHints
      .map((hint) => {
        const normalized = hint.trim().toLowerCase();
        const mapped = GENERATION_HINT_PROMPTS[normalized];
        return mapped
          ? `- ${humanizeHint(normalized)}: ${mapped}`
          : `- ${humanizeHint(normalized)}: Emphasize this theme prominently in the layout and narrative.`;
      })
      .join('\n');

    prompt += `

Generation Hints:
${hintNarrative}

Incorporate every hint above. Blend them gracefully in one cohesive slide without fragmenting the content.`;
  }
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
10. Focus primarily on the supplied page content; use the project context only as supporting tone or framing guidance.
11. The page should be self-contained (no external dependencies)${userComment ? `
11. IMPORTANT: Address the user's specific feedback: ${userComment}` : ''}`;
  const requestBody = {
    model: OPENAI_GENERATION_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `You are an expert infographic & data-visualization designer.

Output MUST be valid JSON following the provided schema, where \`generatedHtml\` contains a full, production-ready HTML5 document.

Design guidelines:
• Visual polish: clean, spacious, modern typography.
• Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>).
• Include Lucide icons via CDN (<script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>) and initialize with \`lucide.createIcons()\`.
• For mathematical equations (when applicable to context): Use MathJax via CDN (<script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script> and <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>) to render beautiful LaTeX equations. Configure MathJax with proper delimiters and display options.
• For animations (when applicable): Use Framer Motion via CDN (<script src="https://cdn.jsdelivr.net/npm/framer-motion@latest/dist/framer-motion.js"></script>) to create smooth, professional animations and transitions where appropriate.
• Bring data to life with interactive charts with Chart.js via CDN(<script src="https://cdn.jsdelivr.net/npm/chart.js@latest/dist/chart.umd.min.js"></script>) and timelines using vis-timeline via CDN (https://unpkg.com/moment@latest,https://unpkg.com/vis-data@latest/peer/umd/vis-data.min.js,https://unpkg.com/vis-timeline@latest/peer/umd/vis-timeline-graph2d.min.js,https://unpkg.com/vis-timeline/styles/vis-timeline-graph2d.min.css).
• Source high-resolution royalty-free hero/illustration images from Pexels URLs that match the page topic and add descriptive alt text.
• Employ semantic HTML5 sections (header, main, section, article, figure, footer) and ARIA labels for accessibility.
• Ensure a mobile-first, responsive layout using Flexbox or CSS Grid with sensible breakpoints.
• Keep JavaScript scoped at the end of <body>; separate content, presentation, and behavior.
• Do NOT include any explanatory text outside the JSON object.
• Never badd an external link to a ressource, under any circonstance: the page must be self contained.
• Make sure the page renders correctly when opened directly in a browser.
• Make sure the page always ends with a footer mentionning "Presentation made by InfogrAIphics by P2Enjoy SAS - Copyright 2025"`,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt,
          },
        ],
      },
    ],
    max_output_tokens: 100000,
    text: {
      format: {
        type: 'json_schema',
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
          required: [
            'generatedHtml'
          ],
          additionalProperties: false
        }
      }
    }
  };

  // API call with graceful fallback if the model rejects json_schema
  const data = await callOpenAIWithFallback(requestBody);

  if (data?.status === 'incomplete') {
    const reason = data?.incomplete_details?.reason ?? 'unknown';
    throw new Error(`OpenAI response incomplete: ${reason}`);
  }
  const refusal = extractRefusal(data);
  if (refusal) {
    throw new Error(`OpenAI refused the request: ${JSON.stringify(refusal)}`);
  }
  const responseContent = extractResponseText(data) ?? '';
  if (!responseContent) {
    throw new Error('No response content from OpenAI');
  }
  const parsedResponse = JSON.parse(responseContent);
  if (!parsedResponse.generatedHtml) {
    throw new Error('No HTML content generated by AI');
  }
  return parsedResponse.generatedHtml;
}
/*
async function validateJavaScriptAndLoading(html) {
  
  let browser;
  try {
    Deno.env.set('PUPPETEER_CACHE_DIR', '/tmp/puppeteer');
    console.log('Launching headless browser for JS and loading validation...');
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (msg)=>{
      if (msg.type() === 'error') {
        console.log('Captured JS Error:', msg.text());
        errors.push({
          type: 'error',
          subType: 'javascript',
          message: `JavaScript console error: ${msg.text()}`
        });
      }
    });
    page.on('requestfailed', (request)=>{
      console.log('Captured Loading Error:', request.url());
      errors.push({
        type: 'error',
        subType: 'loading',
        message: `Failed to load resource: ${request.failure()?.errorText}`,
        extract: `URL: ${request.url()}`
      });
    });
    await page.setContent(html, {
      waitUntil: 'domcontentloaded'
    });
    await new Promise((resolve)=>setTimeout(resolve, 1000));
    console.log(`JS and loading validation complete. Found ${errors.length} errors.`);
    return {
      errors
    };
  } catch (e) {
    console.error('Puppeteer validation failed unexpectedly:', e);
    return {
      errors: []
    };
  } finally{
    if (browser) {
      await browser.close();
    }
  }
  
}
*/ async function validateHtmlWithW3C(html) {
  try {
    const res = await fetch('https://validator.w3.org/nu/?out=json', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'User-Agent': 'InfogrAIphics-Validator/1.0'
      },
      body: html
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('W3C validator HTTP error:', res.status, txt);
      return {
        valid: true,
        errors: [],
        allMessages: []
      };
    }
    const payload = await res.json();
    const messages = payload?.messages || [];
    const errors = messages.filter((m)=>m.type === 'error');
    const valid = errors.length === 0;
    return {
      valid,
      errors,
      allMessages: messages
    };
  } catch (e) {
    console.error('W3C validator fetch error:', e);
    return {
      valid: true,
      errors: [],
      allMessages: []
    };
  }
}
function truncateForPrompt(messages, maxChars = 6000) {
  const json = JSON.stringify(messages);
  if (json.length <= maxChars) return json;
  const acc = [];
  let size = 0;
  for (const m of messages){
    const piece = JSON.stringify(m);
    if (size + piece.length > maxChars) break;
    acc.push(m);
    size += piece.length;
  }
  return JSON.stringify(acc);
}
async function repairHtmlWithOpenAI(html, errors) {
  const errorBlob = truncateForPrompt(errors);
  const requestBody = {
    model: OPENAI_FIX_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
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
              'Return valid JSON that matches the schema with the single field fixedHtml.'
            ].join('\n'),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Here is the current HTML to fix:',
              '---HTML START---',
              html,
              '---HTML END---',
              '',
              'Here are the validator errors you must address exactly and only:',
              errorBlob
            ].join('\n'),
          },
        ],
      }
    ],
    max_output_tokens: 100000,
    text: {
      format: {
        type: 'json_schema',
        name: 'html_fix',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            fixedHtml: {
              type: 'string',
              description: 'The minimally fixed HTML string'
            }
          },
          required: [
            'fixedHtml'
          ],
          additionalProperties: false
        }
      }
    }
  };

  // API call with graceful fallback if the model rejects json_schema
  const data = await callOpenAIWithFallback(requestBody);

  if (data?.status === 'incomplete') {
    const reason = data?.incomplete_details?.reason ?? 'unknown';
    throw new Error(`OpenAI fixer response incomplete: ${reason}`);
  }
  const refusal = extractRefusal(data);
  if (refusal) {
    throw new Error(`OpenAI fixer refused the request: ${JSON.stringify(refusal)}`);
  }
  const content = extractResponseText(data) ?? '';
  if (!content) {
    throw new Error('No response content from OpenAI fixer');
  }
  const parsed = JSON.parse(content);
  if (!parsed.fixedHtml) {
    throw new Error('Fixer did not return fixedHtml');
  }
  return parsed.fixedHtml;
}
// UPDATED: This function now accepts options to conditionally run validation steps.
async function validateAndRepairHtmlLoop(initialHtml, options) {
  let html = initialHtml;
  const { validateW3C, validateRuntime } = options;
  // If both validation steps are disabled, skip the loop entirely.
  if (!validateW3C && !validateRuntime) {
    console.log('HTML validation skipped as per request.');
    return initialHtml;
  }
  for(let i = 1; i <= MAX_HTML_FIX_ITER; i++){
    // Conditionally create promises for the validation steps.
    const w3cValidationPromise = validateW3C ? validateHtmlWithW3C(html) : Promise.resolve({
      valid: true,
      errors: [],
      allMessages: []
    });
    const runtimeValidationPromise = /*validateRuntime ? validateJavaScriptAndLoading(html) :*/ Promise.resolve({
      errors: []
    });
    // Run enabled validations in parallel.
    const [w3cValidation, runtimeValidation] = await Promise.all([
      w3cValidationPromise,
      runtimeValidationPromise
    ]);
    const allErrors = [
      ...w3cValidation.errors,
      ...runtimeValidation.errors
    ];
    console.log(`Validation pass ${i}:`, {
      valid: allErrors.length === 0,
      w3cEnabled: validateW3C,
      runtimeEnabled: validateRuntime,
      w3cErrorCount: w3cValidation.errors.length,
      runtimeErrorCount: runtimeValidation.errors.length
    });
    if (allErrors.length === 0) {
      console.log('HTML passed all enabled validation checks.');
      return html;
    }
    const before = html;
    html = await repairHtmlWithOpenAI(html, allErrors);
    if (html === before) {
      console.warn('Fixer returned identical HTML, stopping early to prevent loop');
      return html;
    }
  }
  console.warn(`Reached max iterations (${MAX_HTML_FIX_ITER}) with remaining errors`);
  return html;
}
// UPDATED: Added options parameter to pass down validation flags
async function processQueue(options) {
  console.log('Checking for pending queue items...');
  try {
    const { data: queueItems, error } = await supabase.from('generation_queue').select('*').eq('status', 'pending').order('requested_at', {
      ascending: true
    }).limit(1);
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
    const queueItem = queueItems[0];
    console.log('Processing queue item:', queueItem);
    // Pass the options down to the item processor
    await processQueueItem(queueItem, options);
  } catch (error) {
    console.error('Error in processQueue:', error);
  }
}
async function runWorker() {
  console.log('Starting generation queue worker...');
  while(true){
    try {
      // The worker does not have request-specific flags, so it relies on
      // flags set on the queue item itself, or defaults to true.
      await processQueue();
      await new Promise((resolve)=>setTimeout(resolve, 5000));
    } catch (error) {
      console.error('Worker error:', error);
      await new Promise((resolve)=>setTimeout(resolve, 10000));
    }
  }
}
Deno.serve(async (req)=>{
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }
    if (req.method === 'POST') {
      // UPDATED: Destructure the new boolean flags from the JSON body.
      // They default to 'true' to maintain old behavior if not provided.
      const { action, validateW3C = true, validateRuntime = true } = await req.json();
      if (action === 'start-worker') {
        console.log('Starting continuous worker...');
        runWorker().catch(console.error);
        return new Response(JSON.stringify({
          message: 'Worker started'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (action === 'process-once') {
        console.log('Processing one queue item with options:', {
          validateW3C,
          validateRuntime
        });
        // Pass the flags to the queue processor.
        await processQueue({
          validateW3C,
          validateRuntime
        });
        return new Response(JSON.stringify({
          message: 'Queue processed'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

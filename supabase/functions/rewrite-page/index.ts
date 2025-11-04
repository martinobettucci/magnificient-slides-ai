import { z } from 'npm:zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';
import { OpenAIJsonClient } from '../_shared/openai-json.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ANALYSIS_MODEL = Deno.env.get('OPENAI_ANALYSIS_MODEL') ?? 'gpt-4o';

const requestSchema = z.object({
  projectName: z.string().min(1),
  projectDescription: z.string().min(1),
  pageTitle: z.string().min(1),
  existingMarkdown: z.string().min(1),
  useWebSearch: z.boolean().optional(),
});

// Using shared OpenAI client; no local response parsing needed

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let parsedBody: z.infer<typeof requestSchema>;
  try {
    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid payload', details: validation.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    parsedBody = validation.data;
  } catch (error) {
    console.error('Failed to parse JSON body', error);
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { projectName, projectDescription, pageTitle, existingMarkdown, useWebSearch } = parsedBody;

  const prompt = [
    `You are an expert presentation copywriter.` ,
    `Rewrite the slide content in polished, well-structured Markdown.`,
    `Improve clarity, organisation, readability, and storytelling while preserving the factual meaning.`,
    `Ensure headings and subheadings are consistent, add bullet or numbered lists where appropriate, highlight key figures, and keep the tone professional yet engaging.`,
    `If content feels thin, enhance it with concise supporting details based on the provided context.`,
    `Do not invent information that contradicts the original intent.`,
    `Prioritise the existing slide content; refer to project context only to adjust style or tone when necessary.`,
    `Return only the rewritten Markdown without explanations.`,
    '',
    `Project name: ${projectName}`,
    `Project description: ${projectDescription}`,
    `Page title: ${pageTitle}`,
    '',
    `Existing markdown content:`,
    existingMarkdown,
  ].join('\n');

  try {
    const client = new OpenAIJsonClient({
      apiKey: OPENAI_API_KEY,
      defaultModel: OPENAI_ANALYSIS_MODEL,
    });

    const parsed = await client.generateJSON<{ rewrittenMarkdown: string; summary: string }>({
      user: prompt,
      system: 'You rewrite slide content into clean, well-structured Markdown while preserving factual accuracy.',
      schemaName: 'page_rewrite',
      schema: {
        type: 'object',
        properties: {
          rewrittenMarkdown: { type: 'string', description: 'The rewritten page content as markdown.' },
          summary: { type: 'string', description: 'Short summary of the adjustments performed.' },
        },
        required: ['rewrittenMarkdown', 'summary'],
        additionalProperties: false,
      },
      maxOutputTokens: 2000,
      ...(useWebSearch ? { tools: [{ type: 'web_search' }] } : {}),
    });

    if (!parsed.rewrittenMarkdown || typeof parsed.rewrittenMarkdown !== 'string') {
      return new Response(
        JSON.stringify({ error: 'OpenAI response missing rewrittenMarkdown field' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        markdown: parsed.rewrittenMarkdown.trim(),
        summary: parsed.summary ?? '',
        usedWebSearch: !!useWebSearch,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Rewrite request failed:', error);
    return new Response(JSON.stringify({ error: 'Rewrite request failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

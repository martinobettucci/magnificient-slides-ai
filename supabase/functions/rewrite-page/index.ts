import { z } from 'npm:zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ANALYSIS_MODEL = Deno.env.get('OPENAI_ANALYSIS_MODEL') ?? 'gpt-4o';

const requestSchema = z.object({
  projectName: z.string().min(1),
  projectDescription: z.string().min(1),
  pageTitle: z.string().min(1),
  existingMarkdown: z.string().min(1),
  useWebSearch: z.boolean().optional(),
});

const extractResponseText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const outputText = root.output_text;
  if (typeof outputText === 'string' && outputText.trim().length > 0) {
    return outputText;
  }
  if (Array.isArray(outputText)) {
    for (const entry of outputText) {
      if (typeof entry === 'string' && entry.trim().length > 0) return entry;
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
    if (typed.type === 'refusal' || typed.reason === 'refusal') {
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
  if (root.refusal && typeof root.refusal === 'object') {
    return root.refusal as Record<string, unknown>;
  }
  return null;
};

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

  const requestBody: Record<string, unknown> = {
    model: OPENAI_ANALYSIS_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You rewrite slide content into clean, well-structured Markdown while preserving factual accuracy.',
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    temperature: 0.4,
    max_output_tokens: 2000,
    text: {
      format: {
        type: 'json_schema',
        name: 'page_rewrite',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            rewrittenMarkdown: {
              type: 'string',
              description: 'The rewritten page content as markdown.',
            },
            summary: {
              type: 'string',
              description: 'Short summary of the adjustments performed.',
            },
          },
          required: ['rewrittenMarkdown', 'summary'],
          additionalProperties: false,
        },
      },
    },
  };

  if (useWebSearch) {
    requestBody.tools = [{ type: 'web_search' }];
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({
          error: 'Failed to rewrite page content',
          details: errorText,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload = await response.json();

    if (payload?.status === 'incomplete') {
      const reason = payload?.incomplete_details?.reason ?? 'unknown';
      console.error('OpenAI response incomplete:', reason);
      return new Response(
        JSON.stringify({ error: 'OpenAI response incomplete', details: reason }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const refusal = extractRefusal(payload);
    if (refusal) {
      console.error('OpenAI refused the rewrite request:', refusal);
      return new Response(
        JSON.stringify({ error: 'OpenAI refused to rewrite content', details: refusal }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const text = extractResponseText(payload);
    if (!text) {
      console.error('OpenAI response missing content', payload);
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let parsed: { rewrittenMarkdown: string; summary: string };
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response JSON', parseError, text);
      return new Response(
        JSON.stringify({ error: 'Malformed OpenAI response payload' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

import { z } from 'npm:zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ANALYSIS_MODEL = Deno.env.get('OPENAI_ANALYSIS_MODEL') ?? 'gpt-4o';

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

const GENERATION_HINT_OPTIONS = [
  {
    value: 'introduction',
    label: 'Introduction',
    description:
      'Deliver a compelling opening that frames the topic, why it matters, and the outcome the audience should expect.',
  },
  {
    value: 'agenda',
    label: 'Agenda',
    description: 'Lay out the main sections or talking points of the presentation in a concise list.',
  },
  {
    value: 'section_break',
    label: 'Section Break',
    description: 'Design a bold transition slide that signals a new chapter with minimal text and strong visuals.',
  },
  {
    value: 'dashboard',
    label: 'Dashboard',
    description: 'Highlight metrics with charts and key figures using clear hierarchy, legends, and annotations.',
  },
  {
    value: 'timeline',
    label: 'Timeline',
    description: 'Show milestones or a roadmap using a chronological visual flow.',
  },
  {
    value: 'process',
    label: 'Process',
    description: 'Break down a workflow into clear steps with brief descriptors and supporting icons.',
  },
  {
    value: 'comparison',
    label: 'Comparison',
    description: 'Compare options side-by-side with a visual layout that emphasises differentiators.',
  },
  {
    value: 'persona',
    label: 'Persona',
    description: 'Present the target audience with needs, pain points, and motivating context.',
  },
  {
    value: 'swot',
    label: 'SWOT',
    description: 'Structure strengths, weaknesses, opportunities, and threats into a balanced quadrant.',
  },
  {
    value: 'budget',
    label: 'Budget',
    description: 'Explain costs or projections with tabular or chart-based visuals and clear highlights.',
  },
  {
    value: 'technology',
    label: 'Technology',
    description: 'Visualise the technical architecture, stack, or integrations with a diagram and callouts.',
  },
  {
    value: 'quote',
    label: 'Quote',
    description: 'Feature a powerful testimonial or statement with impactful typography and composition.',
  },
  {
    value: 'faq',
    label: 'FAQ',
    description: 'Answer recurring questions with a clean, scannable layout.',
  },
  {
    value: 'conclusion',
    label: 'Conclusion',
    description: 'Summarise the key takeaways and reinforce the overarching message.',
  },
  {
    value: 'call_to_action',
    label: 'Call to Action',
    description: 'End with specific next steps and contact or follow-up details.',
  },
] as const;

type GenerationHintValue = (typeof GENERATION_HINT_OPTIONS)[number]['value'];
const HINT_VALUES = GENERATION_HINT_OPTIONS.map((hint) => hint.value) as [
  GenerationHintValue,
  ...GenerationHintValue[]
];
const HintEnum = z.enum(HINT_VALUES);
const ConfidenceEnum = z.enum(['low', 'medium', 'high']);

const requestSchema = z.object({
  projectName: z.string().min(1),
  projectDescription: z.string().min(1),
  styleDescription: z.string().optional(),
  pageTitle: z.string().min(1),
  pageContentMarkdown: z.string().optional().default(''),
  existingHints: z.array(z.string()).optional(),
  maxSuggestions: z.number().int().min(1).max(5).optional(),
});

const openAiResponseSchema = z.object({
  hints: z
    .array(
      z.object({
        value: HintEnum,
        rationale: z.string().min(1),
        confidence: ConfidenceEnum.optional().default('medium'),
      }),
    )
    .max(5),
});

const sanitizeHints = (hints?: unknown): GenerationHintValue[] => {
  if (!Array.isArray(hints)) return [];
  const seen = new Set<GenerationHintValue>();
  const result: GenerationHintValue[] = [];
  for (const raw of hints) {
    if (typeof raw !== 'string') continue;
    const normalized = raw.toLowerCase() as GenerationHintValue;
    if ((HintEnum.options as readonly string[]).includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
};

const buildPrompt = (input: {
  projectName: string;
  projectDescription: string;
  styleDescription?: string;
  pageTitle: string;
  pageContentMarkdown: string;
  existingHints: GenerationHintValue[];
  maxSuggestions: number;
}) => {
  const { projectName, projectDescription, styleDescription, pageTitle, pageContentMarkdown, existingHints, maxSuggestions } = input;

  const hintCatalogue = GENERATION_HINT_OPTIONS.map(
    (hint) => `- ${hint.value}: ${hint.description}`,
  ).join('\n');

  const existingText = existingHints.length
    ? `Hints already selected for this page (do NOT suggest them again): ${existingHints.join(', ')}`
    : 'No hints have been selected yet.';

  const trimmedContent = pageContentMarkdown.trim().slice(0, 6000) || 'No specific page content has been drafted yet. Base your suggestions on the project context and page title.';

  return `You are an assistant that recommends which hints (presentation slide archetypes) should guide an AI-powered slide generator.

Allowed hint catalogue:
${hintCatalogue}

Context:
- Project name: ${projectName}
- Project description: ${projectDescription}
- Style guidelines: ${styleDescription || 'Not provided'}
- Page title: ${pageTitle}
- Page content (markdown excerpt):\n${trimmedContent}

${existingText}

Instructions:
- Propose up to ${maxSuggestions} hints from the allowed catalogue above.
- Only choose hints from the allowed catalogue. Never invent new hint names.
- Focus on the hints that will create the strongest, clearest slide for this specific page.
- Prioritise variety and the most relevant storytelling structures.
- Provide a short rationale (1-2 sentences) explaining why each hint fits the page.
- Include a confidence level (low, medium, high) for each hint.
- If no hint is appropriate, return an empty list.`;
};

const optionDetailsByValue = new Map(
  GENERATION_HINT_OPTIONS.map((option) => [option.value, option]),
);

const toConfidence = (value?: string) => {
  const normalized = value?.toLowerCase() ?? 'medium';
  return ConfidenceEnum.options.includes(normalized as any)
    ? (normalized as z.infer<typeof ConfidenceEnum>)
    : 'medium';
};

const handleRequest = async (req: Request): Promise<Response> => {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    console.error('Failed to parse JSON body', error);
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    console.error('Validation error', parsedBody.error.flatten());
    return new Response(
      JSON.stringify({ error: 'Invalid request payload', details: parsedBody.error.flatten() }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const { projectName, projectDescription, styleDescription, pageTitle, pageContentMarkdown, existingHints, maxSuggestions } = parsedBody.data;

  const existingHintSet = new Set(sanitizeHints(existingHints));
  const limit = maxSuggestions ?? 4;

  const prompt = buildPrompt({
    projectName,
    projectDescription,
    styleDescription,
    pageTitle,
    pageContentMarkdown,
    existingHints: Array.from(existingHintSet),
    maxSuggestions: limit,
  });

  const requestBody = {
    model: OPENAI_ANALYSIS_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You recommend slide-generation hints. Only respond with allowed hint values, provide rationales, and confidence levels. The output must strictly follow the provided JSON schema.',
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
    max_output_tokens: 1200,
    text: {
      format: {
        type: 'json_schema',
        name: 'hint_suggestions',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            hints: {
              type: 'array',
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  value: { type: 'string', enum: HintEnum.options },
                  rationale: { type: 'string' },
                  confidence: {
                    type: 'string',
                    enum: ConfidenceEnum.options,
                    default: 'medium',
                  },
                },
                required: ['value', 'rationale', 'confidence'],
                additionalProperties: false,
              },
            },
          },
          required: ['hints'],
          additionalProperties: false,
        },
      },
    },
  };

  let completion;
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
        JSON.stringify({ error: 'Failed to generate hint suggestions', details: errorText }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    completion = await response.json();
  } catch (error) {
    console.error('OpenAI request failed:', error);
    return new Response(JSON.stringify({ error: 'OpenAI request failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (completion?.status === 'incomplete') {
    const reason = completion?.incomplete_details?.reason ?? 'unknown';
    console.error('OpenAI response incomplete', reason);
    return new Response(JSON.stringify({ error: `OpenAI response incomplete: ${reason}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const refusal = extractRefusal(completion);
  if (refusal) {
    console.error('OpenAI refused to provide hint suggestions', refusal);
    return new Response(JSON.stringify({ error: 'OpenAI refused to provide hint suggestions', details: refusal }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawContent = extractResponseText(completion);
  if (typeof rawContent !== 'string') {
    console.error('OpenAI response missing content', completion);
    return new Response(JSON.stringify({ error: 'Invalid response from OpenAI' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let parsedResponse: unknown;
  try {
    parsedResponse = JSON.parse(rawContent);
  } catch (error) {
    console.error('Failed to parse OpenAI content as JSON', rawContent);
    return new Response(JSON.stringify({ error: 'Malformed OpenAI response payload' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const suggestions = openAiResponseSchema.safeParse(parsedResponse);
  if (!suggestions.success) {
    console.error('OpenAI response validation error', suggestions.error.flatten());
    return new Response(
      JSON.stringify({ error: 'OpenAI response did not match schema', details: suggestions.error.flatten() }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const filtered = [] as { value: GenerationHintValue; rationale: string; confidence: z.infer<typeof ConfidenceEnum> }[];
  const seen = new Set<GenerationHintValue>();
  for (const hint of suggestions.data.hints) {
    if (existingHintSet.has(hint.value) || seen.has(hint.value)) continue;
    const trimmedRationale = hint.rationale.trim();
    if (!trimmedRationale) continue;
    seen.add(hint.value);
    filtered.push({
      value: hint.value,
      rationale: trimmedRationale,
      confidence: toConfidence(hint.confidence),
    });
    if (filtered.length >= limit) break;
  }

  return new Response(
    JSON.stringify({
      hints: filtered.map((hint) => ({
        value: hint.value,
        label: optionDetailsByValue.get(hint.value)?.label ?? hint.value,
        rationale: hint.rationale,
        confidence: hint.confidence,
      })),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
};

Deno.serve(handleRequest);

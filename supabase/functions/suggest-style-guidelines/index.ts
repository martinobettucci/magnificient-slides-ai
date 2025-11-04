import { OpenAIJsonClient } from '../_shared/openai-json.ts';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
// Use a snapshot that supports json_schema strict mode
const OPENAI_ANALYSIS_MODEL = Deno.env.get('OPENAI_ANALYSIS_MODEL') ?? 'gpt-4o-2024-08-06';

// Using shared OpenAI client; no local response parsing needed

// Build a flattened recommendations list from the structured response fields
const buildRecommendations = (p) => {
  const items = [];

  // 1) Style guidelines free text
  if (typeof p.styleGuidelines === 'string' && p.styleGuidelines.trim()) {
    // Split on new lines to capture bullet-like content while preserving order
    const lines = p.styleGuidelines.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    // If the model wrote one big paragraph, keep it as a single item
    if (lines.length > 1) {
      items.push(...lines);
    } else {
      items.push(p.styleGuidelines.trim());
    }
  }

  // 2) Color palette normalization
  if (p.colorPalette && typeof p.colorPalette === 'object') {
    const cp = p.colorPalette;
    const colorKeys = ['primary','secondary','accent','neutral','background'];
    for (const k of colorKeys) {
      if (typeof cp[k] === 'string' && cp[k].trim()) {
        items.push(`Color ${k}: ${cp[k].trim()}`);
      }
    }
  }

  // 3) Typography normalization
  if (p.typography && typeof p.typography === 'object') {
    const ty = p.typography;
    if (typeof ty.headingFont === 'string' && ty.headingFont.trim()) {
      items.push(`Heading font: ${ty.headingFont.trim()}`);
    }
    if (typeof ty.bodyFont === 'string' && ty.bodyFont.trim()) {
      items.push(`Body font: ${ty.bodyFont.trim()}`);
    }
    if (ty.fontSizes && typeof ty.fontSizes === 'object') {
      const fs = ty.fontSizes;
      if (typeof fs.h1 === 'string' && fs.h1.trim()) items.push(`Font size H1: ${fs.h1.trim()}`);
      if (typeof fs.h2 === 'string' && fs.h2.trim()) items.push(`Font size H2: ${fs.h2.trim()}`);
      if (typeof fs.h3 === 'string' && fs.h3.trim()) items.push(`Font size H3: ${fs.h3.trim()}`);
      if (typeof fs.body === 'string' && fs.body.trim()) items.push(`Font size body: ${fs.body.trim()}`);
    }
  }

  // Deduplicate while preserving order
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = it.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  return {
    items: deduped,
    text: deduped.join('\n')
  };
};

interface SuggestStyleRequest {
  projectName: string;
  projectDescription: string;
  existingStyleDescription?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  try {
    console.log('=== Style Suggestions Edge Function Start ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

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
      console.error('OpenAI API key not configured');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { projectName, projectDescription, existingStyleDescription }: SuggestStyleRequest = await req.json();

    if (!projectName || !projectDescription) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: projectName and projectDescription are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = existingStyleDescription 
      ? `You are an expert UI/UX designer specializing in infographic design. Review and improve the existing style guidelines for this project.

Project Details:
- Name: ${projectName}
- Description: ${projectDescription}

Current Style Guidelines:
${existingStyleDescription}

Please provide improved and more detailed style guidelines that will help AI generate beautiful, consistent infographic pages. Focus on:

1. Color Palette, provide hex codes for primary, secondary, accent, neutral, and background
2. Typography, recommend font families, sizes, weights, and hierarchy
3. Layout and Spacing, define grid systems, margins, padding, and spacing rules
4. Visual Elements, describe icons, charts, graphics, and visual treatments
5. Brand Personality, define the visual tone and mood
6. Responsive Design, guidelines for different screen sizes
7. Accessibility, color contrast and readability considerations

Provide actionable, specific guidelines that an AI can follow.`
      : `You are an expert UI/UX designer specializing in infographic design. Create comprehensive style guidelines for this project.

Project Details:
- Name: ${projectName}
- Description: ${projectDescription}

Create detailed style guidelines that help AI generate beautiful, consistent infographic pages. Include:

1. Color Palette, hex codes for primary, secondary, accent, neutral, background based on the theme
2. Typography, font families, sizes, weights, and hierarchy
3. Layout and Spacing, grid systems, margins, padding, spacing rules
4. Visual Elements, icons, charts, graphics, visual treatment styles
5. Brand Personality, visual tone and mood
6. Responsive Design, guidelines by breakpoint
7. Accessibility, color contrast and readability`;

    let parsedResponse;
    try {
      const client = new OpenAIJsonClient({ apiKey: OPENAI_API_KEY, defaultModel: OPENAI_ANALYSIS_MODEL });
      parsedResponse = await client.generateJSON({
        system:
          'You are an expert UI/UX designer who creates comprehensive, actionable style guidelines for infographic projects. Always provide specific, detailed recommendations.',
        user: prompt,
        schemaName: 'style_guidelines',
        schema: {
          type: 'object',
          properties: {
            styleGuidelines: { type: 'string', description: 'Comprehensive style guidelines for the infographic project' },
            colorPalette: {
              type: 'object',
              properties: {
                primary: { type: 'string', description: 'Primary color hex code' },
                secondary: { type: 'string', description: 'Secondary color hex code' },
                accent: { type: 'string', description: 'Accent color hex code' },
                neutral: { type: 'string', description: 'Neutral color hex code' },
                background: { type: 'string', description: 'Background color hex code' }
              },
              required: ['primary', 'secondary', 'accent', 'neutral', 'background'],
              additionalProperties: false
            },
            typography: {
              type: 'object',
              properties: {
                headingFont: { type: 'string', description: 'Font family for headings' },
                bodyFont: { type: 'string', description: 'Font family for body text' },
                fontSizes: {
                  type: 'object',
                  properties: {
                    h1: { type: 'string', description: 'H1 font size' },
                    h2: { type: 'string', description: 'H2 font size' },
                    h3: { type: 'string', description: 'H3 font size' },
                    body: { type: 'string', description: 'Body text font size' }
                  },
                  required: ['h1', 'h2', 'h3', 'body'],
                  additionalProperties: false
                }
              },
              required: ['headingFont', 'bodyFont', 'fontSizes'],
              additionalProperties: false
            }
          },
          required: ['styleGuidelines', 'colorPalette', 'typography'],
          additionalProperties: false
        },
        maxOutputTokens: 2000,
      });
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to parse AI response',
          details: `${parseError.name}: ${parseError.message}`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!parsedResponse || !parsedResponse.styleGuidelines) {
      return new Response(
        JSON.stringify({ error: 'No style guidelines generated by AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build flattened recommendations
    const { items, text } = buildRecommendations(parsedResponse);

    const finalPayload = {
      ...parsedResponse,
      recommendations: items,            // Array<string>
      recommendationsText: text          // Single concatenated string
    };

    return new Response(JSON.stringify(finalPayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: `${error.name}: ${error.message}`,
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

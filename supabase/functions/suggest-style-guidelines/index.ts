const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

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
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Handling CORS preflight request');
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== 'POST') {
      console.log('Invalid method:', req.method);
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Parsing request body...');
    const { projectName, projectDescription, existingStyleDescription }: SuggestStyleRequest = await req.json();
    console.log('Request data:', {
      projectName: projectName?.substring(0, 50) + '...',
      projectDescription: projectDescription?.substring(0, 100) + '...',
      hasExistingStyle: !!existingStyleDescription,
      existingStyleLength: existingStyleDescription?.length || 0
    });

    if (!projectName || !projectDescription) {
      console.error('Missing required fields:', {
        hasProjectName: !!projectName,
        hasProjectDescription: !!projectDescription
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: projectName and projectDescription are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
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

1. **Color Palette**: Suggest specific colors (hex codes) for primary, secondary, accent, and neutral colors
2. **Typography**: Recommend font families, sizes, weights, and hierarchy
3. **Layout & Spacing**: Define grid systems, margins, padding, and spacing rules
4. **Visual Elements**: Describe icons, charts, graphics, and visual treatment styles
5. **Brand Personality**: Define the visual tone and mood
6. **Responsive Design**: Guidelines for different screen sizes
7. **Accessibility**: Color contrast and readability considerations

Provide actionable, specific guidelines that an AI can follow to create consistent, professional infographic designs.`
      : `You are an expert UI/UX designer specializing in infographic design. Create comprehensive style guidelines for this project.

Project Details:
- Name: ${projectName}
- Description: ${projectDescription}

Please create detailed style guidelines that will help AI generate beautiful, consistent infographic pages. Include:

1. **Color Palette**: Suggest specific colors (hex codes) for primary, secondary, accent, and neutral colors based on the project theme
2. **Typography**: Recommend font families, sizes, weights, and hierarchy that match the project's purpose
3. **Layout & Spacing**: Define grid systems, margins, padding, and spacing rules
4. **Visual Elements**: Describe appropriate icons, charts, graphics, and visual treatment styles
5. **Brand Personality**: Define the visual tone and mood that fits the project
6. **Responsive Design**: Guidelines for different screen sizes
7. **Accessibility**: Color contrast and readability considerations

Make the guidelines specific and actionable so an AI can follow them to create consistent, professional infographic designs that match the project's goals and audience.`;

    console.log('Making OpenAI API request with model: o3');
    console.log('Prompt length:', prompt.length);
    
    const requestBody = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert UI/UX designer who creates comprehensive, actionable style guidelines for infographic projects. You MUST always provide specific, detailed recommendations. Never return empty content or refuse to generate guidelines. Always create complete style guidelines that AI systems can follow to create consistent, beautiful designs.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: 2000,
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'style_guidelines',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              styleGuidelines: {
                type: 'string',
                description: 'Comprehensive style guidelines for the infographic project'
              },
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
          }
        }
      }
    };
    
    console.log('OpenAI request body structure:', {
      model: requestBody.model,
      messagesCount: requestBody.messages.length,
      maxTokens: requestBody.max_completion_tokens,
      hasResponseFormat: !!requestBody.response_format
    });
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('OpenAI API response status:', response.status);
    console.log('OpenAI API response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error details:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData
      });
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API error: ${response.status}`,
          details: `OpenAI API returned ${response.status} (${response.statusText}): ${errorData}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Parsing OpenAI response...');
    const data = await response.json();
    console.log('OpenAI response structure:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length || 0,
      hasUsage: !!data.usage,
      usage: data.usage
    });
    
    const responseContent = data.choices[0]?.message?.content || '';
    console.log('Response content length:', responseContent.length);
    console.log('Response content preview:', responseContent.substring(0, 200) + '...');
    
    let parsedResponse;
    try {
      console.log('Attempting to parse structured JSON response...');
      parsedResponse = JSON.parse(responseContent);
      console.log('Parsed response keys:', Object.keys(parsedResponse));
      console.log('Style guidelines length:', parsedResponse.styleGuidelines?.length || 0);
      console.log('Color palette keys:', Object.keys(parsedResponse.colorPalette || {}));
      console.log('Typography keys:', Object.keys(parsedResponse.typography || {}));
    } catch (parseError) {
      console.error('Failed to parse structured response:', {
        error: parseError.message,
        responseContent: responseContent.substring(0, 500)
      });
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse AI response',
          details: `JSON parsing failed: ${parseError.message}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!parsedResponse.styleGuidelines) {
      console.error('No style guidelines generated:', {
        responseContent: responseContent,
        parsedResponse: parsedResponse
      });
      return new Response(
        JSON.stringify({ error: 'No style guidelines generated by AI' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Successfully generated style guidelines:', {
      guidelinesLength: parsedResponse.styleGuidelines.length,
      hasColorPalette: !!parsedResponse.colorPalette,
      hasTypography: !!parsedResponse.typography
    });
    console.log('=== Style Suggestions Edge Function Success ===');
    
    return new Response(
      JSON.stringify(parsedResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('=== Style Suggestions Edge Function Error ===');
    console.error('Error in suggest-style-guidelines function:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: `${error.name}: ${error.message}`,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
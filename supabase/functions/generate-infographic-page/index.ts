const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface GeneratePageRequest {
  title: string;
  contentMarkdown: string;
  styleDescription: string;
  projectDescription: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  try {
    console.log('=== Edge Function Start ===');
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
    const { title, contentMarkdown, styleDescription, projectDescription }: GeneratePageRequest = await req.json();
    console.log('Request data:', {
      title: title?.substring(0, 50) + '...',
      contentMarkdown: contentMarkdown?.substring(0, 100) + '...',
      styleDescription: styleDescription?.substring(0, 100) + '...',
      projectDescription: projectDescription?.substring(0, 100) + '...'
    });

    if (!title || !contentMarkdown || !styleDescription || !projectDescription) {
      console.error('Missing required fields:', {
        hasTitle: !!title,
        hasContentMarkdown: !!contentMarkdown,
        hasStyleDescription: !!styleDescription,
        hasProjectDescription: !!projectDescription
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

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

    console.log('Making OpenAI API request with model: gpt-4o');
    console.log('Prompt length:', prompt.length);
    
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
    } as const;
    
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
      console.log('Generated HTML length:', parsedResponse.generatedHtml?.length || 0);
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
    
    if (!parsedResponse.generatedHtml) {
      console.error('No HTML content generated:', {
        responseContent: responseContent,
        parsedResponse: parsedResponse
      });
      return new Response(
        JSON.stringify({ error: 'No HTML content generated by AI' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const generatedHtml = parsedResponse.generatedHtml;

    console.log('Successfully generated HTML content:', {
      htmlLength: generatedHtml.length,
      htmlPreview: generatedHtml.substring(0, 200) + '...'
    });
    console.log('=== Edge Function Success ===');
    
    return new Response(
      JSON.stringify({ generatedHtml }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('=== Edge Function Error ===');
    console.error('Error in generate-infographic-page function:', {
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
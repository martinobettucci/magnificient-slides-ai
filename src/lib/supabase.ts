import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth functions
export const authService = {
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthStateChange(callback: (user: any) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user || null);
    });
  }
};

// Types
export interface Infographic {
  id: string;
  name: string;
  description: string;
  style_description: string;
  created_at: string;
  updated_at: string;
}

export interface InfographicPage {
  id: string;
  infographic_id: string;
  title: string;
  content_markdown: string;
  generated_html: string;
  page_order: number;
  created_at: string;
  updated_at: string;
}

// Database functions
export const infographicsService = {
  // Infographics
  async getInfographics() {
    const { data, error } = await supabase
      .from('infographics')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    return data as Infographic[];
  },

  async getInfographic(id: string) {
    const { data, error } = await supabase
      .from('infographics')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Infographic;
  },

  async createInfographic(infographic: Omit<Infographic, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('infographics')
      .insert(infographic)
      .select()
      .single();
    
    if (error) throw error;
    return data as Infographic;
  },

  async updateInfographic(id: string, updates: Partial<Omit<Infographic, 'id' | 'created_at' | 'updated_at'>>) {
    const { data, error } = await supabase
      .from('infographics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data as Infographic;
  },

  async deleteInfographic(id: string) {
    const { error } = await supabase
      .from('infographics')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Pages
  async getPages(infographicId: string) {
    const { data, error } = await supabase
      .from('infographic_pages')
      .select('*')
      .eq('infographic_id', infographicId)
      .order('page_order');
    
    if (error) throw error;
    return data as InfographicPage[];
  },

  async getPage(id: string) {
    const { data, error } = await supabase
      .from('infographic_pages')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as InfographicPage;
  },

  async createPage(page: Omit<InfographicPage, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('infographic_pages')
      .insert(page)
      .select()
      .single();
    
    if (error) throw error;
    return data as InfographicPage;
  },

  async updatePage(id: string, updates: Partial<Omit<InfographicPage, 'id' | 'created_at' | 'updated_at'>>) {
    const { data, error } = await supabase
      .from('infographic_pages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data as InfographicPage;
  },

  async deletePage(id: string) {
    const { error } = await supabase
      .from('infographic_pages')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Generate page HTML using the edge function
  async generatePageHtml(pageId: string) {
    console.log('=== generatePageHtml Start ===');
    console.log('Page ID:', pageId);
    
    try {
      console.log('Fetching page data...');
    const page = await this.getPage(pageId);
      console.log('Page data:', {
        id: page.id,
        title: page.title,
        contentLength: page.content_markdown?.length || 0,
        infographicId: page.infographic_id
      });
      
      console.log('Fetching infographic data...');
    const infographic = await this.getInfographic(page.infographic_id);
      console.log('Infographic data:', {
        id: infographic.id,
        name: infographic.name,
        descriptionLength: infographic.description?.length || 0,
        styleDescriptionLength: infographic.style_description?.length || 0
      });

      const requestPayload = {
        title: page.title,
        contentMarkdown: page.content_markdown,
        styleDescription: infographic.style_description,
        projectDescription: infographic.description,
      };
      
      console.log('Request payload:', {
        title: requestPayload.title,
        contentMarkdownLength: requestPayload.contentMarkdown?.length || 0,
        styleDescriptionLength: requestPayload.styleDescription?.length || 0,
        projectDescriptionLength: requestPayload.projectDescription?.length || 0
      });
      
      const apiUrl = `${supabaseUrl}/functions/v1/generate-infographic-page`;
      console.log('Making request to:', apiUrl);
      
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-infographic-page`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
        body: JSON.stringify(requestPayload),
    });

      console.log('Edge function response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge function error response:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
        
        let errorDetails = 'Unknown error';
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.details || errorJson.error || errorText;
        } catch (parseError) {
          console.error('Failed to parse error response as JSON:', parseError);
          errorDetails = errorText;
        }
        
        throw new Error(`Failed to generate page HTML (${response.status}): ${errorDetails}`);
    }

      console.log('Parsing successful response...');
    const { generatedHtml } = await response.json();
      console.log('Generated HTML received:', {
        length: generatedHtml?.length || 0,
        preview: generatedHtml?.substring(0, 200) + '...' || 'No content'
      });

      if (!generatedHtml) {
        throw new Error('No HTML content received from edge function');
      }
      
    // Update the page with generated HTML
      console.log('Updating page with generated HTML...');
    await this.updatePage(pageId, { generated_html: generatedHtml });
      console.log('Page updated successfully');
      console.log('=== generatePageHtml Success ===');

    return generatedHtml;
    } catch (error) {
      console.error('=== generatePageHtml Error ===');
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  },

  // Generate style guidelines using the edge function
  async generateStyleGuidelines(projectName: string, projectDescription: string, existingStyleDescription?: string) {
    console.log('=== generateStyleGuidelines Start ===');
    console.log('Project:', { projectName, projectDescription, hasExisting: !!existingStyleDescription });
    
    try {
      const requestPayload = {
        projectName,
        projectDescription,
        existingStyleDescription,
      };
      
      console.log('Request payload:', {
        projectName: requestPayload.projectName,
        projectDescriptionLength: requestPayload.projectDescription?.length || 0,
        existingStyleDescriptionLength: requestPayload.existingStyleDescription?.length || 0
      });
      
      const apiUrl = `${supabaseUrl}/functions/v1/suggest-style-guidelines`;
      console.log('Making request to:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      console.log('Edge function response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge function error response:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          url: apiUrl
        });
        
        let errorDetails = 'Unknown error';
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.details || errorJson.error || errorText;
        } catch (parseError) {
          console.error('Failed to parse error response as JSON:', parseError);
          errorDetails = errorText;
        }
        
        throw new Error(`Failed to generate style guidelines (${response.status}): ${errorDetails}`);
      }

      console.log('Parsing successful response...');
      const result = await response.json();
      console.log('Generated style guidelines received:', {
        guidelinesLength: result.styleGuidelines?.length || 0,
        hasColorPalette: !!result.colorPalette,
        hasTypography: !!result.typography,
        colorPaletteKeys: Object.keys(result.colorPalette || {}),
        typographyKeys: Object.keys(result.typography || {})
      });

      if (!result.styleGuidelines) {
        throw new Error('No style guidelines received from edge function');
      }
      
      console.log('=== generateStyleGuidelines Success ===');
      return result;
    } catch (error) {
      console.error('=== generateStyleGuidelines Error ===');
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  },
};
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

export interface GenerationQueueItem {
  id: string;
  infographic_page_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: string;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
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
    console.log('Enqueueing generation for page ID:', pageId);
    
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      
      // Check if there's already a pending/processing request for this page
      const { data: existingQueue, error: queueCheckError } = await supabase
        .from('generation_queue')
        .select('*')
        .eq('infographic_page_id', pageId)
        .in('status', ['pending', 'processing'])
        .maybeSingle();
      
      if (queueCheckError) {
        console.error('Error checking existing queue:', queueCheckError);
      }
      
      if (existingQueue) {
        console.log('Generation already queued for this page:', existingQueue.status);
        return { queued: true, queueId: existingQueue.id, status: existingQueue.status };
      }
      
      // Add to generation queue
      const { data: queueItem, error: queueError } = await supabase
        .from('generation_queue')
        .insert({
          infographic_page_id: pageId,
          user_id: user.id,
          status: 'pending'
        })
        .select()
        .single();
      
      if (queueError) {
        throw new Error(`Failed to enqueue generation: ${queueError.message}`);
      }
      
      console.log('Generation request enqueued:', queueItem.id);
      console.log('=== generatePageHtml Success (Enqueued) ===');
      
      return { queued: true, queueId: queueItem.id, status: 'pending' };
      
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

  // Get generation queue status for pages
  async getGenerationQueueStatus(pageIds: string[]) {
    if (pageIds.length === 0) return [];
    
    const { data, error } = await supabase
      .from('generation_queue')
      .select('*')
      .in('infographic_page_id', pageIds)
      .order('requested_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching queue status:', error);
      return [];
    }
    
    return data as GenerationQueueItem[];
  },

  // Get user's generation queue items
  async getUserGenerationQueue() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('generation_queue')
      .select(`
        *,
        infographic_pages (
          title,
          infographics (
            name
          )
        )
      `)
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // Manually trigger the queue worker
  async triggerQueueWorker() {
    console.log('=== triggerQueueWorker Start ===');
    
    try {
      const apiUrl = `${supabaseUrl}/functions/v1/queue-worker`;
      console.log('Triggering queue worker at:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start-worker' }),
      });

      console.log('Queue worker response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Queue worker error response:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
        
        throw new Error(`Failed to trigger queue worker (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log('Queue worker triggered successfully:', result);
      console.log('=== triggerQueueWorker Success ===');
      
      return result;
    } catch (error) {
      console.error('=== triggerQueueWorker Error ===');
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
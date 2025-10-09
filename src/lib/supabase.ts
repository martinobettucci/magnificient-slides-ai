import { createClient } from '@supabase/supabase-js';
import {
  sanitizeHints,
  GenerationHintSuggestion,
  GenerationHintValue,
  GENERATION_HINT_CONFIDENCE,
} from './generationHints';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

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
  last_generation_comment: string;
  page_order: number;
  created_at: string;
  updated_at: string;
  generation_hints: GenerationHintValue[];
}

export interface InfographicPageHistory {
  id: string;
  infographic_page_id: string;
  generated_html: string;
  user_comment: string;
  user_id: string;
  created_at: string;
}

export interface GenerationQueueItem {
  id: string;
  infographic_page_id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  user_comment: string;
  requested_at: string;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// Database functions
const normalizePage = (page: any): InfographicPage => ({
  ...page,
  generation_hints: sanitizeHints(page?.generation_hints),
} as InfographicPage);

const buildCombinedStyleDescription = (result: {
  styleGuidelines?: string;
  colorPalette?: Record<string, string>;
  typography?: {
    headingFont?: string;
    bodyFont?: string;
    fontSizes?: Record<string, string>;
  };
  recommendationsText?: string;
  recommendations?: string[];
}) => {
  const sections: string[] = [];

  if (typeof result.styleGuidelines === 'string' && result.styleGuidelines.trim()) {
    sections.push(result.styleGuidelines.trim());
  }

  if (result.colorPalette && typeof result.colorPalette === 'object') {
    const entries = Object.entries(result.colorPalette)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0);
    if (entries.length > 0) {
      const paletteLines = entries.map(([key, value]) => `- ${key}: ${value.trim()}`);
      sections.push(['Color Palette:', ...paletteLines].join('\n'));
    }
  }

  if (result.typography && typeof result.typography === 'object') {
    const typographyLines: string[] = [];
    const { headingFont, bodyFont, fontSizes } = result.typography;
    if (typeof headingFont === 'string' && headingFont.trim()) {
      typographyLines.push(`- Heading font: ${headingFont.trim()}`);
    }
    if (typeof bodyFont === 'string' && bodyFont.trim()) {
      typographyLines.push(`- Body font: ${bodyFont.trim()}`);
    }
    if (fontSizes && typeof fontSizes === 'object') {
      for (const [key, value] of Object.entries(fontSizes)) {
        if (typeof value === 'string' && value.trim()) {
          typographyLines.push(`- ${key.toUpperCase()} size: ${value.trim()}`);
        }
      }
    }
    if (typographyLines.length > 0) {
      sections.push(['Typography:', ...typographyLines].join('\n'));
    }
  }

  if (Array.isArray(result.recommendations) && result.recommendations.length > 0) {
    const recLines = result.recommendations
      .map((item) => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean);
    if (recLines.length > 0) {
      sections.push(['Actionable Guidelines:', ...recLines.map((line) => `- ${line}`)].join('\n'));
    }
  } else if (typeof result.recommendationsText === 'string' && result.recommendationsText.trim()) {
    sections.push(result.recommendationsText.trim());
  }

  return sections.join('\n\n').trim();
};

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
    return (data || []).map((page) => normalizePage(page));
  },

  async getPage(id: string) {
    const { data, error } = await supabase
      .from('infographic_pages')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return normalizePage(data);
  },

  async createPage(page: Omit<InfographicPage, 'id' | 'created_at' | 'updated_at'> & { generation_hints?: GenerationHintValue[] }) {
    const { data, error } = await supabase
      .from('infographic_pages')
      .insert({
        ...page,
        generation_hints: sanitizeHints(page.generation_hints),
      })
      .select()
      .single();
    
    if (error) throw error;
    return normalizePage(data);
  },

  async updatePage(id: string, updates: Partial<Omit<InfographicPage, 'id' | 'created_at' | 'updated_at'>>) {
    const payload: Record<string, unknown> = { ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, 'generation_hints')) {
      payload.generation_hints = sanitizeHints(updates.generation_hints as string[]);
    }

    const { data, error } = await supabase
      .from('infographic_pages')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return normalizePage(data);
  },

  async deletePage(id: string) {
    const { error } = await supabase
      .from('infographic_pages')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  async rewritePageContent(params: {
    pageId: string;
    pageTitle: string;
    projectName: string;
    projectDescription: string;
    existingMarkdown: string;
    useWebSearch?: boolean;
  }) {
    if (!supabaseUrl) {
      throw new Error('Supabase URL is not configured.');
    }
    if (!supabaseAnonKey) {
      throw new Error('Supabase anonymous key is not configured.');
    }

    const apiUrl = `${supabaseUrl}/functions/v1/rewrite-page`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectName: params.projectName,
        projectDescription: params.projectDescription,
        pageTitle: params.pageTitle,
        existingMarkdown: params.existingMarkdown,
        useWebSearch: params.useWebSearch ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let message = errorText;
      try {
        const parsed = JSON.parse(errorText);
        message = parsed.details || parsed.error || errorText;
      } catch {
        // ignore
      }
      throw new Error(`Failed to rewrite page content (${response.status}): ${message}`);
    }

    const payload = await response.json();
    const newMarkdown = typeof payload?.markdown === 'string' ? payload.markdown : '';
    if (!newMarkdown) {
      throw new Error('Rewrite function returned empty markdown content');
    }

    const updatedPage = await this.updatePage(params.pageId, {
      content_markdown: newMarkdown,
    });

    return {
      markdown: newMarkdown,
      page: updatedPage,
      summary: payload?.summary ?? '',
      usedWebSearch: !!payload?.usedWebSearch,
    };
  },

  async suggestGenerationHints(params: {
    projectName: string;
    projectDescription: string;
    styleDescription?: string | null;
    pageTitle: string;
    pageContentMarkdown: string;
    existingHints?: GenerationHintValue[];
    maxSuggestions?: number;
  }): Promise<GenerationHintSuggestion[]> {
    if (!supabaseUrl) {
      throw new Error('Supabase URL is not configured.');
    }
    if (!supabaseAnonKey) {
      throw new Error('Supabase anonymous key is not configured.');
    }

    const payload = {
      projectName: params.projectName,
      projectDescription: params.projectDescription,
      styleDescription: params.styleDescription ?? undefined,
      pageTitle: params.pageTitle,
      pageContentMarkdown: params.pageContentMarkdown ?? '',
      existingHints: sanitizeHints(params.existingHints),
      maxSuggestions: params.maxSuggestions ?? 4,
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/suggest-hints`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText || `Failed to fetch hint suggestions (status ${response.status})`;
      throw new Error(message);
    }

    const data = await response.json();
    const hints = Array.isArray(data?.hints) ? data.hints : [];

    const sanitized = hints
      .map((hint: any) => ({
        value: typeof hint?.value === 'string' ? hint.value : '',
        rationale: typeof hint?.rationale === 'string' ? hint.rationale : '',
        confidence: typeof hint?.confidence === 'string' ? hint.confidence.toLowerCase() : 'medium',
      }))
      .filter((hint) => hint.value && hint.rationale);

    const allowedValues = sanitizeHints(sanitized.map((hint) => hint.value));
    const normalized: GenerationHintSuggestion[] = allowedValues.map((value) => {
      const original = sanitized.find((hint) => hint.value.toLowerCase() === value);
      const confidenceRaw = original?.confidence ?? 'medium';
      const confidence = GENERATION_HINT_CONFIDENCE.includes(confidenceRaw as any)
        ? (confidenceRaw as GenerationHintSuggestion['confidence'])
        : 'medium';

      return {
        value,
        rationale: original?.rationale ?? '',
        confidence,
      };
    });

    return normalized;
  },

  // Generate page HTML using the edge function
  async generatePageHtml(pageId: string, userComment?: string) {
    console.log('=== generatePageHtml Start ===');
    console.log('Enqueueing generation for page ID:', pageId, 'with comment:', userComment);
    
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
          user_comment: userComment || '',
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
    
    // Validate environment variables before making the request
    if (!supabaseUrl) {
      console.warn('VITE_SUPABASE_URL is not configured. Queue worker cannot be triggered.');
      return { success: false, message: 'Supabase URL not configured' };
    }
    
    if (!supabaseAnonKey) {
      console.warn('VITE_SUPABASE_ANON_KEY is not configured. Queue worker cannot be triggered.');
      return { success: false, message: 'Supabase anonymous key not configured' };
    }
    
    // Validate URL format
    try {
      new URL(supabaseUrl);
    } catch (error) {
      console.warn('Invalid VITE_SUPABASE_URL format:', supabaseUrl);
      return { success: false, message: 'Invalid Supabase URL format' };
    }
    
    try {
      const apiUrl = `${supabaseUrl}/functions/v1/queue-worker`;
      console.log('Triggering queue worker at:', apiUrl);
      
      // Fire and forget - don't wait for completion
      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'process-once' }),
      }).catch(error => {
        console.warn('Queue worker request failed (background job):', error.message);
      });
      
      console.log('Queue worker triggered successfully (background job)');
      console.log('=== triggerQueueWorker Success ===');
      
      return { success: true, message: 'Queue worker triggered as background job' };
    } catch (error) {
      console.error('=== triggerQueueWorker Error ===');
      console.warn('Failed to trigger queue worker:', error.message);
      return { success: false, message: 'Failed to trigger queue worker' };
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

      const compiledDescription = buildCombinedStyleDescription(result);
      
      console.log('=== generateStyleGuidelines Success ===');
      return {
        ...result,
        combinedStyleDescription: compiledDescription,
      };
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

  // Get page history
  async getPageHistory(pageId: string) {
    const { data, error } = await supabase
      .from('infographic_pages_history')
      .select('*')
      .eq('infographic_page_id', pageId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data as InfographicPageHistory[];
  },

  // Create page history entry
  async createPageHistory(historyEntry: Omit<InfographicPageHistory, 'id' | 'created_at' | 'user_id'>) {
    // Get current user for RLS policy
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }
    
    // Add user_id to the history entry
    const historyEntryWithUser = {
      ...historyEntry,
      user_id: user.id
    };
    
    const { data, error } = await supabase
      .from('infographic_pages_history')
      .insert(historyEntryWithUser)
      .select()
      .single();
    
    if (error) throw error;
    return data as InfographicPageHistory;
  },
};

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Play, Settings, Zap, Upload, FileDown } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage, supabase } from '../../lib/supabase';
import { InfographicSlideshow } from '../InfographicSlideshow';
import { PagesSidebar } from './PagesSidebar';
import { PageEditor } from './PageEditor';
import { PageFormModal } from './PageFormModal';
import { MarkdownImporter } from './MarkdownImporter';

interface InfographicEditorProps {
  infographic: Infographic;
  onBack: () => void;
  onEdit: () => void;
}

export function InfographicEditor({ infographic, onBack, onEdit }: InfographicEditorProps) {
  const [pages, setPages] = useState<InfographicPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<InfographicPage | null>(null);
  const [showPageForm, setShowPageForm] = useState(false);
  const [showMarkdownImporter, setShowMarkdownImporter] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [pageRecentStatusMap, setPageRecentStatusMap] = useState<Map<string, string>>(new Map());
  const [activeQueueCount, setActiveQueueCount] = useState(0);
  const [triggeringWorker, setTriggeringWorker] = useState(false);
  const [realtimeSubscription, setRealtimeSubscription] = useState<any>(null);

  useEffect(() => {
    loadPages();
  }, [infographic.id]);

  // Set up real-time subscription after pages are loaded
  useEffect(() => {
    if (pages.length > 0) {
      pollQueueStatus();
      setupRealtimeSubscription();
    }
    
    return () => {
      if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
      }
    };
  }, [pages.length, infographic.id]);

  const loadPages = async () => {
    try {
      setLoading(true);
      const data = await infographicsService.getPages(infographic.id);
      console.log('Loaded pages:', data.length);
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (realtimeSubscription) {
      realtimeSubscription.unsubscribe();
    }

    const pageIds = pages.map(p => p.id);
    console.log('Setting up real-time subscription for pages:', pageIds);

    const subscription = supabase
      .channel('generation_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_queue'
        },
        async (payload) => {
          console.log('Real-time queue update:', payload);
          
          // Only process updates for pages in this infographic
          if (payload.new?.infographic_page_id && pageIds.includes(payload.new.infographic_page_id)) {
            console.log('Processing relevant queue update for page:', payload.new.infographic_page_id);
            
            // Refresh queue status
            await pollQueueStatus();
            
            // If a page was completed, reload only that specific page's HTML
            if (payload.eventType === 'UPDATE' && payload.new?.status === 'completed') {
              console.log('Page generation completed, reloading page HTML:', payload.new.infographic_page_id);
              await reloadPageHtml(payload.new.infographic_page_id);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Real-time subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to generation queue updates');
        } else if (status === 'SUBSCRIPTION_ERROR') {
          console.error('Subscription error, retrying in 5 seconds...');
          setTimeout(() => setupRealtimeSubscription(), 5000);
        }
      });

    setRealtimeSubscription(subscription);
  };

  const reloadPageHtml = async (pageId: string) => {
    try {
      console.log('Reloading HTML for page:', pageId);
      const updatedPage = await infographicsService.getPage(pageId);
      
      // Update the page in the pages array
      setPages(prevPages => 
        prevPages.map(page => 
          page.id === pageId ? updatedPage : page
        )
      );
      
      // Update selected page if it's the one that was updated
      if (selectedPage && selectedPage.id === pageId) {
        setSelectedPage(updatedPage);
      }
      
      console.log('Successfully reloaded page HTML');
    } catch (err) {
      console.error('Error reloading page HTML:', err);
    }
  };

  const pollQueueStatus = async () => {
    try {
      console.log('Polling queue status for pages:', pages.map(p => p.id));
      if (pages.length === 0) return;
      
      const pageIds = pages.map(p => p.id);
      const queueItems = await infographicsService.getGenerationQueueStatus(pageIds);
      console.log('Queue items found:', queueItems);
      
      const recentStatusMap = new Map<string, string>();
      let activeCount = 0;
      
      queueItems.forEach(item => {
        if (!recentStatusMap.has(item.infographic_page_id)) {
          recentStatusMap.set(item.infographic_page_id, item.status);
        }
        
        if (item.status === 'pending' || item.status === 'processing') {
          activeCount++;
        }
      });
      
      setPageRecentStatusMap(recentStatusMap);
      setActiveQueueCount(activeCount);
      console.log('Updated queue status:', {
        recentStatusMap: Object.fromEntries(recentStatusMap),
        activeCount
      });
      
    } catch (err) {
      console.error('Error polling queue status:', err);
    }
  };

  const handleTriggerWorker = async () => {
    try {
      setTriggeringWorker(true);
      setError(null);
      
      console.log('Triggering queue worker to process all pending items...');
      
      let processed = 0;
      const maxAttempts = 10;
      
      while (processed < maxAttempts && activeQueueCount > 0) {
        console.log(`Processing attempt ${processed + 1}...`);
        await infographicsService.triggerQueueWorker();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        await pollQueueStatus();
        processed++;
        
        if (activeQueueCount === 0) {
          console.log('All queue items processed');
          break;
        }
      }
      
    } catch (err) {
      console.error('Error triggering queue worker:', err);
      setError(err instanceof Error ? err.message : 'Failed to trigger queue worker');
    } finally {
      setTriggeringWorker(false);
    }
  };

  const handleGenerateHtml = async (pageId: string) => {
    try {
      console.log('Generating HTML for page:', pageId);
      setError(null);
      
      await infographicsService.generatePageHtml(pageId);
      console.log('HTML generation queued successfully');
      
      // Immediate UI feedback
      setTimeout(() => {
        pollQueueStatus();
      }, 100);
      
    } catch (err) {
      console.error('Error generating HTML:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate HTML';
      setError(`HTML Generation Error: ${errorMessage}`);
    }
  };

  const handleGenerateAllHtml = async () => {
    const pagesToGenerate = selectedPageIds.size > 0 
      ? pages.filter(page => selectedPageIds.has(page.id))
      : pages.filter(page => !page.generated_html && !pageRecentStatusMap.has(page.id));
    
    if (pagesToGenerate.length === 0) {
      setError(selectedPageIds.size > 0 ? 'No pages selected for generation' : 'All pages already have generated HTML or are queued');
      return;
    }

    try {
      setError(null);
      const promises = pagesToGenerate.map(page => handleGenerateHtml(page.id));
      await Promise.allSettled(promises);
    } catch (err) {
      console.error('Error in batch generation:', err);
      setError('Some pages failed to generate. Check individual page status.');
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (confirm('Are you sure you want to delete this page?')) {
      try {
        await infographicsService.deletePage(pageId);
        await loadPages();
        if (selectedPage?.id === pageId) {
          setSelectedPage(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete page');
      }
    }
  };

  const handleSelectPage = (pageId: string, selected: boolean) => {
    setSelectedPageIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(pageId);
      } else {
        newSet.delete(pageId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPageIds.size === pages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(pages.map(p => p.id)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-gray-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="group mr-4 inline-flex items-center p-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all duration-300 overflow-hidden"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                Back
              </span>
            </button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {infographic.name}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {infographic.description.length > 300 
                  ? infographic.description.substring(0, 300) + '...'
                  : infographic.description
                }
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onEdit}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium overflow-hidden"
            >
              <Settings className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                Edit Project
              </span>
            </button>
            <button
              onClick={() => setShowSlideshow(true)}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-white bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 font-medium overflow-hidden"
            >
              <Play className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                Slideshow
              </span>
            </button>
            {activeQueueCount > 0 && (
              <button
                onClick={handleTriggerWorker}
                disabled={triggeringWorker}
                className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-white bg-gradient-to-r from-orange-500 to-red-600 rounded-xl hover:from-orange-600 hover:to-red-700 disabled:opacity-50 transition-all duration-300 font-medium overflow-hidden"
              >
                {triggeringWorker ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                  {triggeringWorker ? 'Processing...' : `Process Queue (${activeQueueCount})`}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowPageForm(true)}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 font-medium overflow-hidden"
            >
              <Plus className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                Add Page
              </span>
            </button>
            <button
              onClick={() => setShowMarkdownImporter(true)}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium overflow-hidden"
            >
              <FileDown className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                Import
              </span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <PagesSidebar
          pages={pages}
          selectedPage={selectedPage}
          selectedPageIds={selectedPageIds}
          pageRecentStatusMap={pageRecentStatusMap}
          activeQueueCount={activeQueueCount}
          onShowMarkdownImporter={() => setShowMarkdownImporter(true)}
          onSelectPage={setSelectedPage}
          onSelectPageId={handleSelectPage}
          onSelectAll={handleSelectAll}
          onDeletePage={handleDeletePage}
          onGenerateAllHtml={handleGenerateAllHtml}
          onUpdatePages={loadPages}
        />

        <div className="flex-1 overflow-hidden">
          {selectedPage ? (
            <PageEditor
              page={selectedPage}
              infographic={infographic}
              queueStatus={pageRecentStatusMap.get(selectedPage.id)}
              onUpdate={loadPages}
              onGenerateHtml={() => handleGenerateHtml(selectedPage.id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 overflow-hidden">
              <div className="text-center">
                <div className="w-16 h-16 text-gray-300 mx-auto mb-4">📄</div>
                <p>Select a page to edit or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPageForm && (
        <PageFormModal
          infographicId={infographic.id}
          onSave={() => {
            setShowPageForm(false);
            loadPages();
          }}
          onCancel={() => setShowPageForm(false)}
        />
      )}

      {showMarkdownImporter && (
        <MarkdownImporter
          infographicId={infographic.id}
          onImport={() => {
            setShowMarkdownImporter(false);
            loadPages();
          }}
          onCancel={() => setShowMarkdownImporter(false)}
        />
      )}

      {showSlideshow && (
        <InfographicSlideshow
          infographic={infographic}
          onClose={() => setShowSlideshow(false)}
        />
      )}
    </div>
  );
}
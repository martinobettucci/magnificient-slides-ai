import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Plus, Play, Settings, Zap, FileDown, Sparkles } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage } from '../lib/supabase';
import { InfographicSlideshow } from './InfographicSlideshow';
import { MarkdownImporter } from './InfographicEditor/MarkdownImporter';
import { PagesSidebar } from './InfographicEditor/PagesSidebar';
import { PageEditor } from './InfographicEditor/PageEditor';
import { PageFormModal } from './InfographicEditor/PageFormModal';

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
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [pageRecentStatusMap, setPageRecentStatusMap] = useState<Map<string, string>>(new Map());
  const pageStatusRef = useRef<Map<string, string>>(new Map());
  const pagesRef = useRef<InfographicPage[]>([]);
  const selectedPageRef = useRef<InfographicPage | null>(null);
  const [activeQueueCount, setActiveQueueCount] = useState(0);
  const [triggeringWorker, setTriggeringWorker] = useState(false);
  const [showMarkdownImporter, setShowMarkdownImporter] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);

  // Calculate page status counts
  const pageStatusCounts = React.useMemo(() => {
    let drafts = 0;
    let queued = 0;
    let generated = 0;
    
    pages.forEach(page => {
      const status = pageRecentStatusMap.get(page.id);
      if (status === 'pending' || status === 'processing') {
        queued++;
      } else if (page.generated_html) {
        generated++;
      } else {
        drafts++;
      }
    });
    
    return { drafts, queued, generated, total: pages.length };
  }, [pages, pageRecentStatusMap]);

  const allPagesGenerated = pageStatusCounts.total > 0 && pageStatusCounts.generated === pageStatusCounts.total;

  const loadPages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await infographicsService.getPages(infographic.id);
      console.log('Loaded pages:', data.length);
      pagesRef.current = data;
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, [infographic.id]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    selectedPageRef.current = selectedPage;
  }, [selectedPage]);

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

  const pollQueueStatus = useCallback(async (): Promise<number> => {
    try {
      const currentPages = pagesRef.current;
      console.log('Polling queue status for pages:', currentPages.map(p => p.id));
      if (currentPages.length === 0) {
        pageStatusRef.current = new Map();
        setPageRecentStatusMap(new Map());
        setActiveQueueCount(prev => (prev === 0 ? prev : 0));
        return 0;
      }
      
      const pageIds = currentPages.map(p => p.id);
      const queueItems = await infographicsService.getGenerationQueueStatus(pageIds);
      console.log('Queue items found:', queueItems);
      
      const recentStatusMap = new Map<string, string>();
      let activeCount = 0;
      const completedPageIds = new Set<string>();
      const previousMap = pageStatusRef.current;
      
      queueItems.forEach(item => {
        // Only set the status if we haven't seen this page yet (most recent due to ordering)
        if (!recentStatusMap.has(item.infographic_page_id)) {
          recentStatusMap.set(item.infographic_page_id, item.status);
        }
        
        // Count active jobs (pending or processing)
        if (item.status === 'pending' || item.status === 'processing') {
          activeCount++;
        }
        
        const previousStatus = previousMap.get(item.infographic_page_id);
        if (item.status === 'completed' && previousStatus !== 'completed') {
          completedPageIds.add(item.infographic_page_id);
        }
      });

      const mapsEqual = () => {
        if (recentStatusMap.size !== previousMap.size) return false;
        for (const [key, value] of recentStatusMap.entries()) {
          if (previousMap.get(key) !== value) {
            return false;
          }
        }
        return true;
      };

      if (!mapsEqual()) {
        pageStatusRef.current = recentStatusMap;
        setPageRecentStatusMap(recentStatusMap);
      }

      setActiveQueueCount(prev => (prev === activeCount ? prev : activeCount));
      console.log('Updated queue status:', {
        recentStatusMap: Object.fromEntries(recentStatusMap),
        activeCount
      });

      if (completedPageIds.size > 0) {
        console.log('Detected pages that completed generation, refreshing them individually');
        const refreshedPages = await Promise.all(
          Array.from(completedPageIds).map(async (pageId) => {
            try {
              return await infographicsService.getPage(pageId);
            } catch (pageErr) {
              console.error(`Failed to refresh page ${pageId}:`, pageErr);
              return null;
            }
          }),
        );

        const refreshedMap = new Map(
          refreshedPages
            .filter((page): page is InfographicPage => page !== null)
            .map((page) => [page.id, page]),
        );

        if (refreshedMap.size > 0) {
          setPages((prev) => {
            let hasChanges = false;
            const next = prev.map((page) => {
              const updated = refreshedMap.get(page.id);
              if (!updated) {
                return page;
              }
              if (updated.updated_at === page.updated_at) {
                return page;
              }
              hasChanges = true;
              return updated;
            });
            if (hasChanges) {
              pagesRef.current = next;
            }
            return hasChanges ? next : prev;
          });

          const currentSelected = selectedPageRef.current;
          if (currentSelected && refreshedMap.has(currentSelected.id)) {
            const updatedSelected = refreshedMap.get(currentSelected.id)!;
            if (updatedSelected.updated_at !== currentSelected.updated_at) {
              selectedPageRef.current = updatedSelected;
              setSelectedPage(updatedSelected);
            }
          }
        }
      }
      
      return activeCount;
      
    } catch (err) {
      console.error('Error polling queue status:', err);
      const fallbackCount = Array.from(pageStatusRef.current.values()).reduce((count, status) => {
        return status === 'pending' || status === 'processing' ? count + 1 : count;
      }, 0);
      setActiveQueueCount(prev => (prev === fallbackCount ? prev : fallbackCount));
      return fallbackCount;
    }
  }, []);

  // Poll for queue status changes using HTTP requests instead of WebSockets
  useEffect(() => {
    if (pages.length === 0) {
      return;
    }

    // Kick off an immediate poll so the UI is current
    void pollQueueStatus();

    const POLL_INTERVAL_MS = 5000;
    const intervalId = window.setInterval(() => {
      void pollQueueStatus();
    }, POLL_INTERVAL_MS);

    pollingIntervalRef.current = intervalId;

    return () => {
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [pages.length, infographic.id, pollQueueStatus]);

  const handleTriggerWorker = async () => {
    try {
      setTriggeringWorker(true);
      setError(null);
      
      console.log('Triggering queue worker to process all pending items...');
      
      // Process items one by one until queue is empty
      let processed = 0;
      const maxAttempts = 10; // Prevent infinite loops
      let pending = activeQueueCount > 0 ? activeQueueCount : await pollQueueStatus();
      
      while (processed < maxAttempts && pending > 0) {
        console.log(`Processing attempt ${processed + 1}...`);
        try {
          await infographicsService.triggerQueueWorker();
        } catch (workerError) {
          console.error(`Worker attempt ${processed + 1} failed:`, workerError);
          // If it's a network error, show a user-friendly message and stop trying
          if (workerError.message.includes('Network error') || workerError.message.includes('timeout')) {
            setError(`Queue processing unavailable: ${workerError.message.split('\n')[0]}`);
            break;
          }
          throw workerError;
        }
        
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if there are still pending items
        pending = await pollQueueStatus();
        processed++;
        
        if (pending === 0) {
          console.log('All queue items processed');
          break;
        }
      }
      
    } catch (err) {
      console.error('Error triggering queue worker:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to trigger queue worker';
      // Only show the first line of multi-line error messages for better UX
      setError(errorMessage.split('\n')[0]);
    } finally {
      setTriggeringWorker(false);
    }
  };

  const handleGenerateHtml = async (pageId: string, userComment?: string) => {
    try {
      console.log('=== handleGenerateHtml Start ===');
      console.log('Generating HTML for page:', pageId, 'with comment:', userComment);
      setError(null);
      
      // Ensure userComment is actually a string to prevent circular reference errors
      const safeUserComment = typeof userComment === 'string' ? userComment : undefined;
      
      const result = await infographicsService.generatePageHtml(pageId, safeUserComment);
      console.log('HTML generation completed successfully');
      
      // Real-time subscription will handle the updates automatically,
      // but let's also refresh immediately for better UX
      setTimeout(() => {
        void pollQueueStatus();
      }, 100);
      
      console.log('=== handleGenerateHtml Success ===');
    } catch (err) {
      console.error('=== handleGenerateHtml Error ===');
      console.error('Error generating HTML for pageId:', pageId);
      console.error('Error object details:', { name: err?.name, message: err?.message, stack: err?.stack });
      console.error('Error message:', err instanceof Error ? err.message : 'Unknown error');
      console.error('Error stack:', err instanceof Error ? err.stack : undefined);
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate HTML';
      // Show user-friendly error message
      if (errorMessage.includes('Network error')) {
        setError('HTML generation is currently unavailable due to network issues. Please try again later.');
      } else {
        setError(`HTML Generation Error: ${errorMessage.split('\n')[0]}`);
      }
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
      
      // Start all generations concurrently
      const promises = pagesToGenerate.map(page => handleGenerateHtml(page.id));
      
      // Wait for all to complete
      await Promise.allSettled(promises);
      
    } catch (err) {
      console.error('Error in batch generation:', err);
      setError('Some pages failed to generate. Check individual page status.');
    }
  };

  const handleSelectPageId = (pageId: string, selected: boolean) => {
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

  const handleUpdatePages = () => {
    void loadPages();
  };

  const handleSelectedPageUpdated = useCallback(
    async (pageId: string) => {
      await loadPages();
      try {
        const updatedPage = await infographicsService.getPage(pageId);
        setSelectedPage((current) => (current?.id === pageId ? updatedPage : current));
      } catch (err) {
        console.error('Failed to refresh selected page after update:', err);
      }
    },
    [loadPages],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-gradient-to-br from-slate-50 to-gray-100">
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
              
              {/* Page Status Indicators */}
              {pages.length > 0 && (
                <div className="flex items-center space-x-4 mt-3 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span className="text-gray-600">{pageStatusCounts.drafts} drafts</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-gray-600">{pageStatusCounts.queued} queued</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-gray-600">{pageStatusCounts.generated} ready</span>
                  </div>
                </div>
              )}
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
              className={`group inline-flex items-center justify-center px-3 py-2.5 h-10 text-white rounded-xl transition-all duration-300 font-medium overflow-hidden ${
                allPagesGenerated 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ring-2 ring-green-200' 
                  : 'bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600'
              }`}
            >
              <Play className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                {allPagesGenerated ? 'Ready to Present!' : 'Slideshow'}
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
              onClick={handleGenerateAllHtml}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-white bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl hover:from-purple-600 hover:to-pink-700 transition-all duration-300 font-medium overflow-hidden"
            >
              <Sparkles className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                {selectedPageIds.size > 0 ? `Generate Selected (${selectedPageIds.size})` : 'Generate All'}
              </span>
            </button>
            <button
              onClick={() => setShowMarkdownImporter(true)}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium overflow-hidden"
            >
              <FileDown className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                Import Markdown
              </span>
            </button>
            <button
              onClick={() => setShowPageForm(true)}
              className="group inline-flex items-center justify-center px-3 py-2.5 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 font-medium overflow-hidden"
            >
              <Plus className="w-4 h-4" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                Add Page
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

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Pages Sidebar */}
        <PagesSidebar
          pages={pages}
          selectedPage={selectedPage}
          selectedPageIds={selectedPageIds}
          pageRecentStatusMap={pageRecentStatusMap}
          activeQueueCount={activeQueueCount}
          onSelectPage={setSelectedPage}
          onSelectPageId={handleSelectPageId}
          onSelectAll={handleSelectAll}
          onDeletePage={handleDeletePage}
          onGenerateAllHtml={handleGenerateAllHtml}
          onUpdatePages={handleUpdatePages}
          onShowMarkdownImporter={() => setShowMarkdownImporter(true)}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {selectedPage ? (
            <PageEditor
              page={selectedPage}
              infographic={infographic}
              onUpdate={handleSelectedPageUpdated}
              onGenerateHtml={(userComment) => 
                userComment 
                  ? handleGenerateHtml(selectedPage.id, userComment)
                  : handleGenerateHtml(selectedPage.id)
              }
              queueStatus={pageRecentStatusMap.get(selectedPage.id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 overflow-hidden">
              <div className="text-center">
                <div className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p>Select a page to edit or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page Form Modal */}
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

      {/* Slideshow Modal */}
      {showSlideshow && (
        <InfographicSlideshow
          infographic={infographic}
          onClose={() => setShowSlideshow(false)}
        />
      )}

      {/* Markdown Importer Modal */}
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
    </div>
  );
}

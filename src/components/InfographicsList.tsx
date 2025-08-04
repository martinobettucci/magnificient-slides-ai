import React, { useState, useEffect } from 'react';
import { Plus, FileText, Calendar, Edit, Trash2, Play, Sparkles, Layers, X } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage, GenerationQueueItem } from '../lib/supabase';
import { InfographicSlideshow } from './InfographicSlideshow';

interface InfographicWithStatus extends Infographic {
  pages: InfographicPage[];
  queueItems: GenerationQueueItem[];
  statusCounts: {
    drafts: number;
    queued: number;
    generated: number;
    total: number;
  };
}

interface InfographicsListProps {
  onSelectInfographic: (infographic: Infographic) => void;
  onCreateNew: () => void;
}

export function InfographicsList({ onSelectInfographic, onCreateNew }: InfographicsListProps) {
  const [infographics, setInfographics] = useState<InfographicWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSlideshow, setShowSlideshow] = useState<Infographic | null>(null);

  useEffect(() => {
    loadInfographics();
  }, []);

  const loadInfographics = async () => {
    try {
      setLoading(true);
      const infographicsData = await infographicsService.getInfographics();
      
      // Load pages and queue status for each infographic
      const infographicsWithStatus = await Promise.all(
        infographicsData.map(async (infographic) => {
          try {
            const pages = await infographicsService.getPages(infographic.id);
            const pageIds = pages.map(p => p.id);
            const queueItems = pageIds.length > 0 
              ? await infographicsService.getGenerationQueueStatus(pageIds)
              : [];
            
            // Calculate status counts
            const queueStatusMap = new Map<string, string>();
            queueItems.forEach(item => {
              if (!queueStatusMap.has(item.infographic_page_id)) {
                queueStatusMap.set(item.infographic_page_id, item.status);
              }
            });
            
            let drafts = 0;
            let queued = 0;
            let generated = 0;
            
            pages.forEach(page => {
              const status = queueStatusMap.get(page.id);
              if (status === 'pending' || status === 'processing') {
                queued++;
              } else if (page.generated_html) {
                generated++;
              } else {
                drafts++;
              }
            });
            
            return {
              ...infographic,
              pages,
              queueItems,
              statusCounts: {
                drafts,
                queued,
                generated,
                total: pages.length
              }
            };
          } catch (err) {
            console.error(`Error loading data for infographic ${infographic.id}:`, err);
            return {
              ...infographic,
              pages: [],
              queueItems: [],
              statusCounts: {
                drafts: 0,
                queued: 0,
                generated: 0,
                total: 0
              }
            };
          }
        })
      );
      
      setInfographics(infographicsWithStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load infographics');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this infographic?')) {
      try {
        await infographicsService.deleteInfographic(id);
        await loadInfographics();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete infographic');
      }
    }
  };

  const handleShowSlideshow = async (infographic: Infographic, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSlideshow(infographic);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadInfographics}
          className="mt-2 text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="h-full bg-gradient-to-br from-indigo-50 via-white to-purple-50 overflow-y-auto">
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                InforgrAIphics
              </h1>
              <p className="text-gray-600 text-sm">Create stunning infographics with AI</p>
            </div>
          </div>
        <button
          onClick={onCreateNew}
          className="group inline-flex items-center px-3 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 overflow-hidden"
        >
          <Plus className="w-5 h-5 mr-2" />
          <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap group-hover:mr-0">
            New Infographic
          </span>
        </button>
        </div>

      {infographics.length === 0 ? (
        <div className="text-center py-20">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full blur-3xl opacity-30"></div>
            <div className="relative p-8 bg-white rounded-2xl shadow-xl border border-gray-100">
              <Layers className="w-20 h-20 text-indigo-400 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gray-900 mb-3">No infographics yet</h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">Create your first infographic to get started with AI-powered visual storytelling</p>
          <button
            onClick={onCreateNew}
            className="group inline-flex items-center px-4 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 overflow-hidden"
          >
            <Plus className="w-5 h-5 mr-2" />
            <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap group-hover:mr-0">
              Create Infographic
            </span>
          </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {infographics.map((infographic) => (
            <div
              key={infographic.id}
              onClick={() => onSelectInfographic(infographic)}
              className="bg-white rounded-2xl border border-gray-100 hover:shadow-2xl transition-all duration-300 cursor-pointer group transform hover:-translate-y-1 hover:border-indigo-200 relative overflow-hidden flex flex-col h-full"
            >
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full -translate-y-12 translate-x-12 opacity-50 group-hover:opacity-100 transition-opacity"></div>
              
              {/* Header with title and delete button */}
              <div className="p-6 pb-4 flex items-start justify-between relative z-10">
                <div className="flex-1 min-w-0 pr-3">
                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-tight mb-2">
                    {infographic.name}
                  </h3>
                </div>
                <button
                  onClick={(e) => handleDelete(infographic.id, e)}
                  className="opacity-0 group-hover:opacity-100 group/btn inline-flex items-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0 overflow-hidden"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="max-w-0 group-hover/btn:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover/btn:ml-2">
                    Delete
                  </span>
                </button>
              </div>
              
              {/* Description */}
              <div className="px-6 pb-4 flex-1 relative z-10">
                <p className="text-gray-600 text-sm line-clamp-3 leading-relaxed">
                  {infographic.description}
                </p>
              </div>
              
              {/* Status indicators */}
              <div className="px-6 pb-4 relative z-10">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full flex-shrink-0"></div>
                      <span className="text-gray-700 font-semibold">{infographic.statusCounts.drafts}</span>
                      <span className="text-gray-500 font-medium">drafts</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2.5 h-2.5 bg-blue-400 rounded-full flex-shrink-0"></div>
                      <span className="text-gray-700 font-semibold">{infographic.statusCounts.queued}</span>
                      <span className="text-gray-500 font-medium">queued</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2.5 h-2.5 bg-green-400 rounded-full flex-shrink-0"></div>
                      <span className="text-gray-700 font-semibold">{infographic.statusCounts.generated}</span>
                      <span className="text-gray-500 font-medium">ready</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Footer with date and actions */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 relative z-10 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm text-gray-500">
                  <Calendar className="w-4 h-4 mr-2" />
                  {new Date(infographic.updated_at).toLocaleDateString()}
                </div>
                
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700">
                      <Edit className="w-3 h-3 mr-1" />
                      Project
                    </span>
                    
                    {/* Enhanced Play Button */}
                    <button
                      onClick={(e) => handleShowSlideshow(infographic, e)}
                      className={`group/btn inline-flex items-center px-3 py-1.5 text-white rounded-lg transition-all shadow-sm hover:shadow-md transform hover:-translate-y-0.5 overflow-hidden text-xs font-medium ${
                    infographic.statusCounts.total > 0 && infographic.statusCounts.generated === infographic.statusCounts.total
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 ring-1 ring-green-300'
                        : 'bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600'
                    }`}
                    >
                      <Play className="w-3 h-3" />
                      <span className="max-w-0 group-hover/btn:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover/btn:ml-1.5">
                        {infographic.statusCounts.total > 0 && infographic.statusCounts.generated === infographic.statusCounts.total
                          ? 'Present!'
                          : 'Slideshow'
                        }
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      </div>

      {/* Slideshow Modal */}
      {showSlideshow && (
        <InfographicSlideshow
          infographic={showSlideshow}
          onClose={() => setShowSlideshow(null)}
        />
      )}
    </>
  );
}
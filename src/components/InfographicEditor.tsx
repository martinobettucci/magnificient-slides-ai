import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, FileText, Eye, Code, Trash2, Edit3, Play, Sparkles } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage } from '../lib/supabase';
import { InfographicSlideshow } from './InfographicSlideshow';

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
  const [generatingHtml, setGeneratingHtml] = useState<Set<string>>(new Set());
  const [showSlideshow, setShowSlideshow] = useState(false);

  useEffect(() => {
    loadPages();
  }, [infographic.id]);

  const loadPages = async () => {
    try {
      setLoading(true);
      const data = await infographicsService.getPages(infographic.id);
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoading(false);
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

  const handleGenerateHtml = async (pageId: string) => {
    try {
      console.log('=== handleGenerateHtml Start ===');
      console.log('Generating HTML for page:', pageId);
      setGeneratingHtml(prev => new Set([...prev, pageId]));
      setError(null);
      
      await infographicsService.generatePageHtml(pageId);
      console.log('HTML generation completed successfully');
      
      await loadPages();
      
      // Update selected page if it's the one we just generated
      if (selectedPage?.id === pageId) {
        console.log('Updating selected page with new data');
        const updatedPage = await infographicsService.getPage(pageId);
        setSelectedPage(updatedPage);
      }
      
      console.log('=== handleGenerateHtml Success ===');
    } catch (err) {
      console.error('=== handleGenerateHtml Error ===');
      console.error('Error generating HTML:', {
        pageId,
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      });
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate HTML';
      setError(`HTML Generation Error: ${errorMessage}`);
    } finally {
      setGeneratingHtml(prev => {
        const newSet = new Set(prev);
        newSet.delete(pageId);
        return newSet;
      });
    }
  };

  const handleGenerateAllHtml = async () => {
    const pagesToGenerate = pages.filter(page => !page.generated_html);
    
    if (pagesToGenerate.length === 0) {
      setError('All pages already have generated HTML');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="mr-4 p-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{infographic.name}</h1>
              <p className="text-sm text-gray-600">
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
              className="inline-flex items-center px-3 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit Project
            </button>
            <button
              onClick={() => setShowSlideshow(true)}
              className="inline-flex items-center px-3 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4 mr-2" />
              Show
            </button>
            {pages.some(page => !page.generated_html) && (
              <button
                onClick={handleGenerateAllHtml}
                disabled={generatingHtml.size > 0}
                className="inline-flex items-center px-3 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {generatingHtml.size > 0 ? `Generating ${generatingHtml.size}...` : 'Generate All'}
              </button>
            )}
            <button
              onClick={() => setShowPageForm(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Page
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Pages Sidebar */}
        <div className="w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pages ({pages.length})</h2>
            
            {pages.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No pages yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    onClick={() => setSelectedPage(page)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedPage?.id === page.id
                        ? 'bg-blue-100 border-blue-200'
                        : 'bg-white hover:bg-gray-100'
                    } border`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center mb-1">
                          <span className="text-xs font-medium text-gray-500 mr-2">
                            {index + 1}
                          </span>
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {page.title}
                          </h3>
                        </div>
                        {page.content_markdown && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {page.content_markdown.length > 300 
                              ? page.content_markdown.substring(0, 300) + '...'
                              : page.content_markdown
                            }
                          </p>
                        )}
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            generatingHtml.has(page.id)
                              ? 'bg-blue-100 text-blue-800'
                              : page.generated_html 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {generatingHtml.has(page.id) 
                              ? 'Generating...' 
                              : page.generated_html 
                                ? 'Generated' 
                                : 'Draft'
                            }
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePage(page.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {selectedPage ? (
            <PageEditor
              page={selectedPage}
              infographic={infographic}
              onUpdate={loadPages}
              onGenerateHtml={() => handleGenerateHtml(selectedPage.id)}
              isGenerating={generatingHtml.has(selectedPage.id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
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
    </div>
  );
}

// Page Editor Component
function PageEditor({ 
  page, 
  infographic, 
  onUpdate, 
  onGenerateHtml, 
  isGenerating 
}: {
  page: InfographicPage;
  infographic: Infographic;
  onUpdate: () => void;
  onGenerateHtml: () => void;
  isGenerating: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [formData, setFormData] = useState({
    title: page.title,
    content_markdown: page.content_markdown,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await infographicsService.updatePage(page.id, formData);
      onUpdate();
    } catch (err) {
      console.error('Failed to save page:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'edit'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Code className="w-4 h-4 mr-1 inline" />
                Edit
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Eye className="w-4 h-4 mr-1 inline" />
                Preview
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={onGenerateHtml}
              disabled={isGenerating}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isGenerating ? 'Generating...' : 'Generate HTML'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'edit' ? (
          <div className="h-full p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content (Markdown)
              </label>
              <textarea
                value={formData.content_markdown}
                onChange={(e) => setFormData(prev => ({ ...prev, content_markdown: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="Enter your content in Markdown format..."
              />
            </div>
          </div>
        ) : (
          <div className="h-full">
            {page.generated_html ? (
              <iframe
                srcDoc={page.generated_html}
                className="w-full h-full border-0"
                title={`Preview of ${page.title}`}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Eye className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="mb-2">No HTML generated yet</p>
                  <button
                    onClick={onGenerateHtml}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isGenerating ? 'Generating...' : 'Generate HTML'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Page Form Modal Component
function PageFormModal({ 
  infographicId, 
  onSave, 
  onCancel 
}: {
  infographicId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    title: '',
    content_markdown: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) return;

    try {
      setSaving(true);
      await infographicsService.createPage({
        infographic_id: infographicId,
        title: formData.title,
        content_markdown: formData.content_markdown,
        page_order: 0,
        generated_html: '',
      });
      onSave();
    } catch (err) {
      console.error('Failed to create page:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Page</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Page Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter page title"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Initial Content (Optional)
            </label>
            <textarea
              value={formData.content_markdown}
              onChange={(e) => setFormData(prev => ({ ...prev, content_markdown: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter initial content in Markdown..."
            />
          </div>
          
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
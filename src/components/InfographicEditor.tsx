import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, FileText, Eye, Code, Trash2, Edit3, Play, Sparkles, Save, X, Settings, CheckSquare, Square } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [originalPages, setOriginalPages] = useState<InfographicPage[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!isEditingOrder) return;
    
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = pages.findIndex(page => page.id === active.id);
      const newIndex = pages.findIndex(page => page.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newPages = arrayMove(pages, oldIndex, newIndex);
        setPages(newPages);
      }
    }
  };

  const handleStartEditOrder = () => {
    setOriginalPages([...pages]);
    setIsEditingOrder(true);
  };

  const handleSaveOrder = async () => {
    try {
      // Update page orders in the database
      await Promise.all(
        pages.map((page, index) =>
          infographicsService.updatePage(page.id, { page_order: index })
        )
      );
      setIsEditingOrder(false);
      setOriginalPages([]);
    } catch (err) {
      console.error('Failed to update page order:', err);
      setError('Failed to save page order');
      // Revert to original order
      setPages(originalPages);
      setIsEditingOrder(false);
      setOriginalPages([]);
    }
  };

  const handleCancelOrder = () => {
    setPages(originalPages);
    setIsEditingOrder(false);
    setOriginalPages([]);
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
    const pagesToGenerate = selectedPageIds.size > 0 
      ? pages.filter(page => selectedPageIds.has(page.id))
      : pages.filter(page => !page.generated_html);
    
    if (pagesToGenerate.length === 0) {
      setError(selectedPageIds.size > 0 ? 'No pages selected for generation' : 'All pages already have generated HTML');
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
            {(selectedPageIds.size > 0 || pages.some(page => !page.generated_html)) && (
              <button
                onClick={handleGenerateAllHtml}
                disabled={generatingHtml.size > 0}
                className="group inline-flex items-center justify-center px-3 py-2.5 h-10 text-white bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 transition-all duration-300 font-medium overflow-hidden"
              >
                <Sparkles className="w-4 h-4" />
                <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                  {generatingHtml.size > 0 
                    ? `Generating ${generatingHtml.size}...` 
                    : selectedPageIds.size > 0 
                      ? `Generate Selected (${selectedPageIds.size})`
                      : 'Generate All'
                  }
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
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Pages Sidebar */}
        <div className="w-80 bg-white/50 backdrop-blur-sm border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Pages ({pages.length})</h2>
              <div className="flex items-center space-x-2">
                {isEditingOrder ? (
                  <>
                    <button
                      onClick={handleCancelOrder}
                      className="group text-xs text-gray-600 hover:text-gray-800 transition-all duration-300 px-2 py-1.5 border border-gray-300 rounded-lg font-medium overflow-hidden inline-flex items-center"
                    >
                      <X className="w-3 h-3" />
                      <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                        Cancel
                      </span>
                    </button>
                    <button
                      onClick={handleSaveOrder}
                      className="group text-xs text-blue-600 hover:text-blue-800 transition-all duration-300 px-2 py-1.5 bg-blue-100 rounded-lg font-medium overflow-hidden inline-flex items-center"
                    >
                      <Save className="w-3 h-3" />
                      <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                        Save Order
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    {pages.length > 1 && (
                      <button
                        onClick={handleStartEditOrder}
                        className="group text-xs text-gray-600 hover:text-gray-800 transition-all duration-300 px-2 py-1.5 bg-gray-100 rounded-lg font-medium overflow-hidden inline-flex items-center"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                          Edit Order
                        </span>
                      </button>
                    )}
                    {pages.length > 0 && (
                      <button
                        onClick={handleSelectAll}
                        className="group text-xs text-indigo-600 hover:text-indigo-800 transition-all duration-300 px-2 py-1.5 bg-indigo-50 rounded-lg font-medium overflow-hidden inline-flex items-center"
                      >
                        {selectedPageIds.size === pages.length ? (
                          <CheckSquare className="w-3 h-3" />
                        ) : (
                          <Square className="w-3 h-3" />
                        )}
                        <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                          {selectedPageIds.size === pages.length ? 'Deselect All' : 'Select All'}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {isEditingOrder && (
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
                <p className="text-sm text-blue-800 font-medium">
                  <strong>Reorder Mode:</strong> Drag pages to reorder them, then click "Save Order" to confirm changes.
                </p>
              </div>
            )}
            
            {pages.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border-2 border-dashed border-gray-200">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No pages yet</p>
                  <p className="text-gray-400 text-sm mt-1">Click "Add Page" to get started</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    {pages.map((page, index) => (
                      <SortablePageItem
                        key={page.id}
                        page={page}
                        index={index}
                        isSelected={selectedPage?.id === page.id}
                        isChecked={selectedPageIds.has(page.id)}
                        isGenerating={generatingHtml.has(page.id)}
                        isEditingOrder={isEditingOrder}
                        onSelect={() => !isEditingOrder && setSelectedPage(page)}
                        onCheck={(checked) => handleSelectPage(page.id, checked)}
                        onDelete={(e) => {
                          e.stopPropagation();
                          handleDeletePage(page.id);
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
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
            <div className="flex items-center justify-center h-full text-gray-500 overflow-hidden">
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

// Sortable Page Item Component
function SortablePageItem({
  page,
  index,
  isSelected,
  isChecked,
  isGenerating,
  isEditingOrder,
  onSelect,
  onCheck,
  onDelete,
}: {
  page: InfographicPage;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  isGenerating: boolean;
  isEditingOrder: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 rounded-xl transition-all duration-200 border-2 ${
        isSelected && !isEditingOrder
          ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 shadow-md'
          : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300 hover:shadow-lg'
      } ${isDragging ? 'opacity-50 shadow-2xl scale-105' : ''} ${isEditingOrder ? 'cursor-move hover:shadow-xl' : 'cursor-pointer'} transform hover:-translate-y-0.5`}
    >
      <div className="flex items-start space-x-4">
        {!isEditingOrder && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              e.stopPropagation();
              onCheck(e.target.checked);
            }}
            className="mt-1.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded flex-shrink-0"
          />
        )}
        
        <div 
          className="flex-1 min-w-0"
          {...(isEditingOrder ? { ...attributes, ...listeners } : {})}
          onClick={!isEditingOrder ? onSelect : undefined}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center min-w-0 flex-1">
              <span className="text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-500 px-2 py-1 rounded-full mr-3 flex-shrink-0 shadow-sm">
                {index + 1}
              </span>
              <h3 className="text-sm font-bold text-gray-900 truncate">
                {page.title}
              </h3>
            </div>
            {!isEditingOrder && (
                <button
                  onClick={onDelete}
                  className="group/btn p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-300 flex-shrink-0 inline-flex items-center overflow-hidden"
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="max-w-0 group-hover/btn:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover/btn:ml-1 text-xs">
                    Delete
                  </span>
                </button>
            )}
          </div>
          
          {page.content_markdown && (
            <p className="text-xs text-gray-600 mb-3 line-clamp-2 leading-relaxed">
              {page.content_markdown.length > 120 
                ? page.content_markdown.substring(0, 120) + '...'
                : page.content_markdown
              }
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
              isGenerating
                ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800'
                : page.generated_html 
                  ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800' 
                  : 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800'
            }`}>
              {isGenerating 
                ? 'Generating...' 
                : page.generated_html 
                  ? 'Generated' 
                  : 'Draft'
              }
            </span>
          </div>
        </div>
      </div>
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

  // Update form data when page changes
  useEffect(() => {
    setFormData({
      title: page.title,
      content_markdown: page.content_markdown,
    });
  }, [page.id, page.title, page.content_markdown]);

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('edit')}
                className={`group inline-flex items-center p-3 rounded-lg transition-all duration-300 overflow-hidden ${
                  activeTab === 'edit'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                <Code className="w-5 h-5" />
                <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                  Edit Content
                </span>
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`group inline-flex items-center p-3 rounded-lg transition-all duration-300 overflow-hidden ${
                  activeTab === 'preview'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                <Eye className="w-5 h-5" />
                <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                  Preview Page
                </span>
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="group p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-300 disabled:opacity-50 inline-flex items-center overflow-hidden"
            >
              <Save className="w-5 h-5" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                {saving ? 'Saving...' : 'Save'}
              </span>
            </button>
            <button
              onClick={onGenerateHtml}
              disabled={isGenerating}
              className="group p-3 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-sm inline-flex items-center overflow-hidden"
            >
              <Sparkles className="w-5 h-5" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                {isGenerating ? 'Generating...' : 'Generate HTML'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {activeTab === 'edit' ? (
          <div className="flex-1 flex flex-col p-6 bg-gradient-to-br from-gray-50 to-white overflow-hidden min-h-0">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                Page Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white shadow-sm"
              />
            </div>
            <div className="flex-1 flex flex-col mt-6 min-h-0 overflow-hidden">
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                Content (Markdown)
              </label>
              <textarea
                value={formData.content_markdown}
                onChange={(e) => setFormData(prev => ({ ...prev, content_markdown: e.target.value }))}
                className="flex-1 w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm transition-all bg-white shadow-sm resize-none min-h-0 h-full"
                placeholder="Enter your content in Markdown format..."
              />
            </div>
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            {page.generated_html ? (
              <iframe
                srcDoc={page.generated_html}
                className="w-full h-full border-0"
                title={`Preview of ${page.title}`}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 bg-gradient-to-br from-gray-50 to-white overflow-hidden">
                <div className="text-center p-12 bg-white rounded-2xl shadow-xl border border-gray-100">
                  <div className="p-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                    <Eye className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">No HTML generated yet</h3>
                  <p className="text-gray-600 mb-6">Generate HTML to see the preview of your page</p>
                  <button
                    onClick={onGenerateHtml}
                    disabled={isGenerating}
                    className="group px-3 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium inline-flex items-center overflow-hidden"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                      {isGenerating ? 'Generating...' : 'Generate HTML'}
                    </span>
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
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl border border-gray-100">
        <div className="flex items-center mb-6">
          <div className="p-3 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-xl mr-4">
            <Plus className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Add New Page</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              Page Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
              placeholder="Enter page title"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              Initial Content (Optional)
            </label>
            <textarea
              value={formData.content_markdown}
              onChange={(e) => setFormData(prev => ({ ...prev, content_markdown: e.target.value }))}
              rows={5}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white resize-none"
              placeholder="Enter initial content in Markdown..."
            />
          </div>
          
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="group px-3 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium inline-flex items-center overflow-hidden"
            >
              <X className="w-5 h-5" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                Cancel
              </span>
            </button>
            <button
              type="submit"
              disabled={saving || !formData.title.trim()}
              className="group px-3 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium inline-flex items-center overflow-hidden"
            >
              <Plus className="w-5 h-5" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                {saving ? 'Creating...' : 'Create Page'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
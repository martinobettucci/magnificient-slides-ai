import React, { useState } from 'react';
import { FileText, Edit3, Save, X, CheckSquare, Square, Sparkles } from 'lucide-react';
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
import { InfographicPage, infographicsService } from '../../lib/supabase';
import { SortablePageItem } from './SortablePageItem';

interface PagesSidebarProps {
  pages: InfographicPage[];
  selectedPage: InfographicPage | null;
  selectedPageIds: Set<string>;
  pageRecentStatusMap: Map<string, string>;
  activeQueueCount: number;
  onSelectPage: (page: InfographicPage) => void;
  onSelectPageId: (pageId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onDeletePage: (pageId: string) => void;
  onGenerateAllHtml: () => void;
  onUpdatePages: () => void;
  onShowMarkdownImporter: () => void;
}

export function PagesSidebar({
  pages,
  selectedPage,
  selectedPageIds,
  pageRecentStatusMap,
  activeQueueCount,
  onSelectPage,
  onSelectPageId,
  onSelectAll,
  onDeletePage,
  onGenerateAllHtml,
  onUpdatePages,
  onShowMarkdownImporter,
}: PagesSidebarProps) {
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [originalPages, setOriginalPages] = useState<InfographicPage[]>([]);
  const [localPages, setLocalPages] = useState<InfographicPage[]>(pages);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update local pages when props change
  React.useEffect(() => {
    setLocalPages(pages);
  }, [pages]);

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!isEditingOrder) return;
    
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localPages.findIndex(page => page.id === active.id);
      const newIndex = localPages.findIndex(page => page.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newPages = arrayMove(localPages, oldIndex, newIndex);
        setLocalPages(newPages);
      }
    }
  };

  const handleStartEditOrder = () => {
    setOriginalPages([...pages]);
    setIsEditingOrder(true);
  };

  const handleSaveOrder = async () => {
    try {
      await Promise.all(
        localPages.map((page, index) =>
          infographicsService.updatePage(page.id, { page_order: index })
        )
      );
      setIsEditingOrder(false);
      setOriginalPages([]);
      onUpdatePages();
    } catch (err) {
      console.error('Failed to update page order:', err);
      setLocalPages(originalPages);
      setIsEditingOrder(false);
      setOriginalPages([]);
    }
  };

  const handleCancelOrder = () => {
    setLocalPages(originalPages);
    setIsEditingOrder(false);
    setOriginalPages([]);
  };

  const pagesToShow = isEditingOrder ? localPages : pages;

  return (
    <div className="w-80 bg-white/50 backdrop-blur-sm border-r border-gray-200 overflow-y-auto flex-shrink-0">
        </div>
        
        <div className="flex items-center justify-between mb-4">
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
                    onClick={onSelectAll}
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
              <SortableContext items={pagesToShow.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {pagesToShow.map((page, index) => (
                  <SortablePageItem
                    key={page.id}
                    page={page}
                    index={index}
                    isSelected={selectedPage?.id === page.id}
                    isChecked={selectedPageIds.has(page.id)}
                    queueStatus={pageRecentStatusMap.get(page.id)}
                    isEditingOrder={isEditingOrder}
                    hasGeneratedHtml={!!page.generated_html}
                    onSelect={() => !isEditingOrder && onSelectPage(page)}
                    onCheck={(checked) => onSelectPageId(page.id, checked)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      onDeletePage(page.id);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
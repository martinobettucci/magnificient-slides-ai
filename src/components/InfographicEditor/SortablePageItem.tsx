import React from 'react';
import { Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { InfographicPage } from '../../lib/supabase';

interface SortablePageItemProps {
  page: InfographicPage;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  queueStatus?: string;
  hasGeneratedHtml: boolean;
  isEditingOrder: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function SortablePageItem({
  page,
  index,
  isSelected,
  isChecked,
  queueStatus,
  hasGeneratedHtml,
  isEditingOrder,
  onSelect,
  onCheck,
  onDelete,
}: SortablePageItemProps) {
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
            {/* Debug info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="text-xs text-gray-400 mb-1">
                Queue: {queueStatus || 'none'} | HTML: {hasGeneratedHtml ? 'yes' : 'no'}
              </div>
            )}
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
              queueStatus === 'pending' || queueStatus === 'processing' || queueStatus === 'failed'
                ? queueStatus === 'pending'
                ? 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800'
                  : queueStatus === 'processing'
                  ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800'
                  : 'bg-gradient-to-r from-red-100 to-pink-100 text-red-800'
                : hasGeneratedHtml 
                  ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800' 
                  : 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800'
            }`}>
              {queueStatus === 'pending' || queueStatus === 'processing' || queueStatus === 'failed'
                ? queueStatus === 'pending'
                ? 'Queued'
                  : queueStatus === 'processing'
                  ? 'Processing...'
                  : 'Failed'
                : hasGeneratedHtml 
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
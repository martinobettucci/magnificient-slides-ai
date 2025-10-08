import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { infographicsService } from '../../lib/supabase';

interface PageFormModalProps {
  infographicId: string;
  onSave: () => void;
  onCancel: () => void;
}

export function PageFormModal({ 
  infographicId, 
  onSave, 
  onCancel 
}: PageFormModalProps) {
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
        generation_hints: [],
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

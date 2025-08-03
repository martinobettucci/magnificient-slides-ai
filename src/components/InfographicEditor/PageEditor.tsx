import React, { useState, useEffect } from 'react';
import { Code, Eye, Save, Sparkles } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage } from '../../lib/supabase';

interface PageEditorProps {
  page: InfographicPage;
  infographic: Infographic;
  queueStatus?: string;
  onUpdate: () => void;
  onGenerateHtml: () => void;
}

export function PageEditor({ 
  page, 
  infographic, 
  onUpdate, 
  onGenerateHtml, 
  queueStatus
}: PageEditorProps) {
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
              disabled={!!queueStatus}
              className="group p-3 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-sm inline-flex items-center overflow-hidden"
            >
              <Sparkles className="w-5 h-5" />
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                {queueStatus === 'pending' ? 'Queued' : queueStatus === 'processing' ? 'Processing...' : 'Generate HTML'}
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
                    disabled={!!queueStatus}
                    className="group px-3 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium inline-flex items-center overflow-hidden"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                      {queueStatus === 'pending' ? 'Queued' : queueStatus === 'processing' ? 'Processing...' : 'Generate HTML'}
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
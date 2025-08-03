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
              <div className="h-full flex flex-col">
                {/* History Selector and Regenerate Controls */}
                <div className="bg-white/90 backdrop-blur-sm border-b border-gray-200 p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* History Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                        className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all text-sm font-medium"
                      >
                        <History className="w-4 h-4" />
                        <span>
                          {selectedHistoryId === 'current' 
                            ? 'Current Version' 
                            : `Version ${new Date(pageHistory.find(h => h.id === selectedHistoryId)?.created_at || '').toLocaleDateString()}`
                          }
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      
                      {showHistoryDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-64">
                          <button
                            onClick={() => {
                              setSelectedHistoryId('current');
                              setShowHistoryDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-all border-b border-gray-100 ${
                              selectedHistoryId === 'current' ? 'bg-indigo-50 text-indigo-700' : ''
                            }`}
                          >
                            <div className="font-medium">Current Version</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {page.last_generation_comment || 'Latest generated version'}
                            </div>
                          </button>
                          {pageHistory.map((historyItem) => (
                            <button
                              key={historyItem.id}
                              onClick={() => {
                                setSelectedHistoryId(historyItem.id);
                                setShowHistoryDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-all ${
                                selectedHistoryId === historyItem.id ? 'bg-indigo-50 text-indigo-700' : ''
                              }`}
                            >
                              <div className="font-medium">
                                {new Date(historyItem.created_at).toLocaleDateString()} at {new Date(historyItem.created_at).toLocaleTimeString()}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 truncate">
                                {historyItem.user_comment || 'No comment'}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600">
                      {getSelectedComment()}
                    </div>
                  </div>
                  
                  {/* Regenerate Button */}
                  {selectedHistoryId === 'current' && (
                    <button
                      onClick={() => setShowRegeneratePrompt(!showRegeneratePrompt)}
                      disabled={!!queueStatus}
                      className="flex items-center space-x-2 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-all text-sm font-medium disabled:opacity-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Regenerate with Feedback</span>
                    </button>
                  )}
                </div>
                
                {/* Regenerate Prompt */}
                {showRegeneratePrompt && (
                  <div className="bg-purple-50 border-b border-purple-200 p-4">
                    <div className="mb-3">
                      <label className="block text-sm font-semibold text-purple-800 mb-2">
                        What changes would you like to make?
                      </label>
                      <textarea
                        value={regenerateComment}
                        onChange={(e) => setRegenerateComment(e.target.value)}
                        className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-none"
                        rows={3}
                        placeholder="Describe the changes you'd like to see in the regenerated page..."
                      />
                    </div>
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => {
                          setShowRegeneratePrompt(false);
                          setRegenerateComment('');
                        }}
                        className="px-3 py-2 text-gray-600 hover:text-gray-800 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRegenerateWithComment}
                        disabled={!regenerateComment.trim() || !!queueStatus}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 text-sm font-medium"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Preview iframe */}
                <div className="flex-1 overflow-hidden">
                  <iframe
                    key={selectedHistoryId} // Force re-render when selection changes
                    srcDoc={getSelectedHtml()}
                    className="w-full h-full border-0"
                    title={`Preview of ${page.title}`}
                  />
                </div>
              </div>
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
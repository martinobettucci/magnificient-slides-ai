import React, { useState, useEffect } from 'react';
import { Code, Eye, Save, Sparkles, History, ChevronDown, MessageSquare, RotateCcw, Plus, X, Wand2 } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage, InfographicPageHistory } from '../../lib/supabase';
import { MarkdownEditor } from './MarkdownEditor';
import {
  GENERATION_HINT_OPTIONS,
  GenerationHintValue,
  sanitizeHints,
  getGenerationHintDetails,
  GenerationHintSuggestion,
} from '../../lib/generationHints';

const CONFIDENCE_LABELS: Record<GenerationHintSuggestion['confidence'], string> = {
  low: 'Confiance faible',
  medium: 'Confiance moyenne',
  high: 'Confiance élevée',
};

const NO_SUGGESTION_MESSAGE = "Aucune suggestion trouvée pour l'instant. Ajoutez davantage de contexte puis réessayez.";

interface PageEditorProps {
  page: InfographicPage;
  infographic: Infographic;
  queueStatus?: string;
  onUpdate: (pageId: string) => Promise<void>;
  onGenerateHtml: (userComment?: string) => void;
}

type PageFormState = {
  title: string;
  content_markdown: string;
  generation_hints: GenerationHintValue[];
};

export function PageEditor({ 
  page, 
  infographic, 
  onUpdate, 
  onGenerateHtml, 
  queueStatus
}: PageEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [formData, setFormData] = useState<PageFormState>({
    title: page.title,
    content_markdown: page.content_markdown,
    generation_hints: sanitizeHints(page.generation_hints),
  });
  const [saving, setSaving] = useState(false);
  const [pageHistory, setPageHistory] = useState<InfographicPageHistory[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('current');
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [regenerateComment, setRegenerateComment] = useState('');
  const [showRegeneratePrompt, setShowRegeneratePrompt] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreVersionId, setRestoreVersionId] = useState<string>('');
  const [hintPanelExpanded, setHintPanelExpanded] = useState(false);
  const [hintSuggestions, setHintSuggestions] = useState<GenerationHintSuggestion[]>([]);
  const [isSuggestingHints, setIsSuggestingHints] = useState(false);
  const [hintSuggestionError, setHintSuggestionError] = useState<string | null>(null);
  const [showRewriteModal, setShowRewriteModal] = useState(false);
  const [rewriteUseWebSearch, setRewriteUseWebSearch] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [rewriteSummary, setRewriteSummary] = useState<string | null>(null);

  // Check if current page has active queue jobs
  const hasActiveQueueJob = queueStatus === 'pending' || queueStatus === 'processing';
  const pageHints = React.useMemo(() => sanitizeHints(page.generation_hints), [page.generation_hints]);
  const pageHintsSet = React.useMemo(() => new Set(pageHints), [pageHints]);
  const hintsAreEqual = React.useMemo(() => {
    const current = new Set(formData.generation_hints);
    const original = new Set(pageHints);
    if (current.size !== original.size) return false;
    for (const value of current) {
      if (!original.has(value)) return false;
    }
    return true;
  }, [formData.generation_hints, pageHints]);

  const hasUnsavedChanges =
    formData.title !== page.title ||
    formData.content_markdown !== page.content_markdown ||
    !hintsAreEqual;
  const removedHints = React.useMemo(
    () => pageHints.filter((hint) => !formData.generation_hints.includes(hint)),
    [pageHints, formData.generation_hints],
  );
  const unappliedSuggestions = React.useMemo(
    () => hintSuggestions.filter((hint) => !formData.generation_hints.includes(hint.value)),
    [hintSuggestions, formData.generation_hints],
  );

  const toggleHint = (value: GenerationHintValue) => {
    setFormData((prev) => {
      const exists = prev.generation_hints.includes(value);
      return {
        ...prev,
        generation_hints: exists
          ? prev.generation_hints.filter((hint) => hint !== value)
          : [...prev.generation_hints, value],
      };
    });
  };

  const addHint = (value: GenerationHintValue) => {
    setFormData((prev) => {
      if (prev.generation_hints.includes(value)) {
        return prev;
      }
      return {
        ...prev,
        generation_hints: [...prev.generation_hints, value],
      };
    });
  };

  const clearAllHints = () => {
    setFormData((prev) => ({
      ...prev,
      generation_hints: [],
    }));
  };

  const handleSuggestHints = async () => {
    try {
      setIsSuggestingHints(true);
      setHintSuggestionError(null);

      const suggestions = await infographicsService.suggestGenerationHints({
        projectName: infographic.name,
        projectDescription: infographic.description,
        styleDescription: infographic.style_description,
        pageTitle: formData.title,
        pageContentMarkdown: formData.content_markdown?.trim().length
          ? formData.content_markdown
          : page.content_markdown ?? '',
        existingHints: formData.generation_hints,
        maxSuggestions: 4,
      });

      setHintSuggestions(suggestions);
      if (suggestions.length === 0) {
        setHintSuggestionError(NO_SUGGESTION_MESSAGE);
      }
      if (suggestions.length > 0 && !hintPanelExpanded) {
        setHintPanelExpanded(true);
      }
    } catch (err) {
      console.error('Failed to suggest hints:', err);
      setHintSuggestionError(
        err instanceof Error
          ? err.message
          : 'Impossible de récupérer des suggestions pour le moment.',
      );
    } finally {
      setIsSuggestingHints(false);
    }
  };

  const handleApplySuggestedHint = (value: GenerationHintValue) => {
    addHint(value);
  };

  const handleApplyAllSuggestedHints = () => {
    if (unappliedSuggestions.length === 0) return;
    setFormData((prev) => ({
      ...prev,
      generation_hints: sanitizeHints([
        ...prev.generation_hints,
        ...unappliedSuggestions.map((hint) => hint.value),
      ]),
    }));
  };

  const handleRewriteContent = async () => {
    try {
      setIsRewriting(true);
      setRewriteError(null);
      const result = await infographicsService.rewritePageContent({
        pageId: page.id,
        pageTitle: formData.title || page.title,
        projectName: infographic.name,
        projectDescription: infographic.description,
        existingMarkdown: formData.content_markdown || page.content_markdown,
        useWebSearch: rewriteUseWebSearch,
      });
      setFormData((prev) => ({
        ...prev,
        content_markdown: result.markdown,
      }));
      setRewriteSummary(result.summary || null);
      setShowRewriteModal(false);
      setRewriteUseWebSearch(false);
      await onUpdate(page.id);
    } catch (err) {
      console.error('Failed to rewrite page content:', err);
      setRewriteError(err instanceof Error ? err.message : "La réécriture a échoué.");
    } finally {
      setIsRewriting(false);
    }
  };

  useEffect(() => {
    setRewriteSummary(null);
  }, [page.id]);

  // Update form data when page changes
  useEffect(() => {
    setFormData({
      title: page.title,
      content_markdown: page.content_markdown,
      generation_hints: sanitizeHints(page.generation_hints),
    });
    setHintSuggestions([]);
    setHintSuggestionError(null);
    setIsSuggestingHints(false);
  }, [page.id, page.title, page.content_markdown, page.generation_hints]);

  // Load page history when page changes
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await infographicsService.getPageHistory(page.id);
        setPageHistory(history);
        setSelectedHistoryId('current');
      } catch (err) {
        console.error('Failed to load page history:', err);
      }
    };

    loadHistory();
  }, [page.id]);

  const getSelectedHtml = () => {
    if (selectedHistoryId === 'current') {
      return page.generated_html || '';
    }
    const historyItem = pageHistory.find(h => h.id === selectedHistoryId);
    return historyItem?.generated_html || '';
  };

  const getSelectedComment = () => {
    if (selectedHistoryId === 'current') {
      return page.last_generation_comment || 'Latest generated version';
    }
    const historyItem = pageHistory.find(h => h.id === selectedHistoryId);
    return historyItem?.user_comment || 'No comment';
  };

  const handleRegenerateWithComment = async () => {
    try {
      await infographicsService.generatePageHtml(page.id, regenerateComment.trim());
      setShowRegeneratePrompt(false);
      setRegenerateComment('');
      await onUpdate(page.id);
    } catch (err) {
      console.error('Failed to regenerate with comment:', err);
    }
  };

  const handleRestoreVersion = async () => {
    const historyItem = pageHistory.find(h => h.id === restoreVersionId);
    if (!historyItem) return;
    
    try {
      // Save current version to history before restoring
      if (page.generated_html) {
        await infographicsService.createPageHistory({
          infographic_page_id: page.id,
          generated_html: page.generated_html,
          user_comment: page.last_generation_comment || 'Version before restore',
        });
      }
      
      // Update page with restored HTML
      await infographicsService.updatePage(page.id, {
        generated_html: historyItem.generated_html,
        last_generation_comment: `Restored from ${new Date(historyItem.created_at).toLocaleDateString()}: ${historyItem.user_comment}`
      });
      
      // Refresh all data
      await onUpdate(page.id);
      
      // Reload the page history
      const updatedHistory = await infographicsService.getPageHistory(page.id);
      setPageHistory(updatedHistory);
      
      // Reset selection to current and close modal
      setSelectedHistoryId('current');
      setShowRestoreModal(false);
      setRestoreVersionId('');
      
    } catch (err) {
      console.error('Failed to restore version:', err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await infographicsService.updatePage(page.id, formData);
      await onUpdate(page.id);
    } catch (err) {
      console.error('Failed to save page:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
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
            {activeTab === 'edit' && (
              <>
                <button
                  onClick={() => {
                    setRewriteError(null);
                    setRewriteSummary(null);
                    setRewriteUseWebSearch(false);
                    setShowRewriteModal(true);
                  }}
                  disabled={isRewriting}
                  className="group inline-flex items-center p-3 text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {isRewriting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-2">
                    {isRewriting ? 'Rewriting…' : 'Rewrite with AI'}
                  </span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !hasUnsavedChanges}
                  className="group inline-flex items-center p-3 text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-2">
                    {saving ? 'Saving…' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                  </span>
                </button>
              </>
            )}
            <button
                onClick={() => onGenerateHtml()}
                disabled={hasActiveQueueJob}
                className="group p-3 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-sm inline-flex items-center overflow-hidden"
              >
                <Sparkles className="w-5 h-5" />
                <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
                  {queueStatus === 'pending' ? 'Queued' : queueStatus === 'processing' ? 'Processing...' : 'Generate HTML'}
                </span>
              </button>
        </div>
      </div>
      {rewriteSummary && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-start justify-between">
          <p className="text-sm mr-4">
            <strong>Résumé de la réécriture :</strong> {rewriteSummary}
          </p>
          <button
            type="button"
            onClick={() => setRewriteSummary(null)}
            className="text-emerald-600 hover:text-emerald-800"
            aria-label="Fermer le résumé"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide uppercase text-gray-500">
              Hints actifs
            </span>
            {formData.generation_hints.length > 0 && (
              <button
                type="button"
                onClick={clearAllHints}
                className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
              >
                <X className="w-3 h-3 mr-1" />
                Réinitialiser
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {formData.generation_hints.length > 0 ? (
              formData.generation_hints.map((value) => {
                const option = getGenerationHintDetails(value);
                const isPersisted = pageHintsSet.has(value);
                return (
                  <span
                    key={value}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 ${isPersisted ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}
                    title={option?.description}
                  >
                    {option?.label ?? value}
                    {!isPersisted && <span className="text-[10px] uppercase tracking-wide">nouveau</span>}
                  </span>
                );
              })
            ) : (
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                Aucun hint sélectionné
              </span>
            )}
          </div>
          {removedHints.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {removedHints.map((value) => {
                const option = getGenerationHintDetails(value);
                return (
                  <span
                    key={`removed-${value}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-100"
                  >
                    {option?.label ?? value}
                    <span className="ml-2 text-[10px] uppercase tracking-wide">retiré</span>
                  </span>
                );
              })}
            </div>
          )}
          {hintSuggestionError && (
            <p
              className={`mt-3 text-sm ${
                hintSuggestionError === NO_SUGGESTION_MESSAGE ? 'text-gray-600' : 'text-rose-600'
              }`}
            >
              {hintSuggestionError}
            </p>
          )}
          {hintSuggestions.length > 0 && (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs font-semibold tracking-wide uppercase text-indigo-600">
                    Suggestions IA
                  </span>
                  <p className="text-xs text-indigo-900/80 mt-1">
                    Sélectionne les hints proposés pour enrichir la génération.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyAllSuggestedHints}
                  disabled={unappliedSuggestions.length === 0}
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border border-indigo-300 text-indigo-700 hover:bg-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ajouter tout
                </button>
              </div>
              <div className="space-y-3">
                {hintSuggestions.map((suggestion) => {
                  const option = getGenerationHintDetails(suggestion.value);
                  const isSelected = formData.generation_hints.includes(suggestion.value);
                  return (
                    <div
                      key={`suggestion-${suggestion.value}`}
                      className={`rounded-lg border bg-white/90 p-4 transition-all shadow-sm ${
                        isSelected ? 'border-indigo-200' : 'border-indigo-100 hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-indigo-700">
                              {option?.label ?? suggestion.value}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide bg-indigo-100/70 text-indigo-600 px-2 py-0.5 rounded-full">
                              {CONFIDENCE_LABELS[suggestion.confidence]}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                            {suggestion.rationale}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          {isSelected ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              Ajouté
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplySuggestedHint(suggestion.value)}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-indigo-300 text-indigo-700 hover:bg-indigo-100 transition-all"
                            >
                              Ajouter
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
              <p className="text-xs text-gray-500 mt-2">
                Markdown is stripped from the title on save.
              </p>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-800">
                  Generation hints
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSuggestHints}
                    disabled={isSuggestingHints}
                    className="inline-flex items-center px-3 py-2 rounded-full text-xs font-medium border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isSuggestingHints ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600 mr-2" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    Suggestions IA
                  </button>
                  <button
                    type="button"
                    onClick={() => setHintPanelExpanded((prev) => !prev)}
                    className="inline-flex items-center px-2.5 py-2 rounded-full text-xs font-medium border border-indigo-200 bg-transparent text-indigo-600 hover:bg-indigo-50 transition-all"
                  >
                    <Plus className={`w-4 h-4 mr-1 transition-transform ${hintPanelExpanded ? 'rotate-45' : ''}`} />
                    {hintPanelExpanded ? 'Masquer' : 'Détails'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {GENERATION_HINT_OPTIONS.map((option) => {
                  const isActive = formData.generation_hints.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleHint(option.value)}
                      className={`px-3 py-2 rounded-full text-xs font-medium border transition-all duration-200 ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
                      }`}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {hintPanelExpanded && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {GENERATION_HINT_OPTIONS.map((option) => {
                    const isActive = formData.generation_hints.includes(option.value);
                    return (
                      <div
                        key={`hint-detail-${option.value}`}
                        className={`rounded-xl border bg-white/80 p-4 text-sm transition-all ${
                          isActive ? 'border-indigo-200 shadow-sm' : 'border-gray-200'
                        }`}
                      >
                        <div className="font-semibold text-gray-800 flex items-center justify-between">
                          <span>{option.label}</span>
                          {isActive && (
                            <span className="text-[10px] uppercase tracking-wide text-indigo-500">
                              sélectionné
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-gray-600 text-sm leading-relaxed">
                          {option.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col mt-6 min-h-0 overflow-hidden">
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                Content (Markdown)
              </label>
              <MarkdownEditor
                value={formData.content_markdown}
                onChange={(value) => setFormData((prev) => ({ ...prev, content_markdown: value }))}
                placeholder="Enter your content in Markdown format..."
                className="flex-1 min-h-0"
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
                      className="flex items-center space-x-2 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-all text-sm font-medium disabled:opacity-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Regenerate with Feedback</span>
                    </button>
                  )}
                  
                  {/* Restore Button */}
                  {selectedHistoryId !== 'current' && (
                    <button
                      onClick={() => {
                        setRestoreVersionId(selectedHistoryId);
                        setShowRestoreModal(true);
                      }}
                      className="flex items-center space-x-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-all text-sm font-medium"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Restore as Current</span>
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
                        disabled={!regenerateComment.trim() || hasActiveQueueJob}
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
                    onClick={() => onGenerateHtml()}
                    disabled={hasActiveQueueJob}
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

        {/* Restore Confirmation Modal */}
        {showRestoreModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl border border-gray-100">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl mr-4">
                  <RotateCcw className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Restore Version</h2>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to restore this version as the current version?
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 text-sm font-medium">
                    ⚠️ This will replace the current HTML content. The current version will be saved to history before restoring.
                  </p>
                </div>
                {restoreVersionId && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Restoring version from:</strong> {new Date(pageHistory.find(h => h.id === restoreVersionId)?.created_at || '').toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Comment:</strong> {pageHistory.find(h => h.id === restoreVersionId)?.user_comment || 'No comment'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-end space-x-4">
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    setRestoreVersionId('');
                  }}
                  className="px-6 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreVersion}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all font-medium"
                >
                  Restore Version
                </button>
              </div>
            </div>
          </div>
        )}

        {showRewriteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Réécrire le contenu avec l'IA</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    L'IA va réorganiser et reformater cette page en Markdown soigné tout en conservant l'intention originale.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isRewriting) return;
                    setShowRewriteModal(false);
                    setRewriteError(null);
                    setRewriteUseWebSearch(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <label className="flex items-start space-x-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    checked={rewriteUseWebSearch}
                    onChange={(e) => setRewriteUseWebSearch(e.target.checked)}
                    disabled={isRewriting}
                  />
                  <span>
                    Autoriser la recherche web pour compléter les informations avec des sources récentes.
                    <span className="block text-xs text-gray-500 mt-1">Peut rallonger légèrement la génération.</span>
                  </span>
                </label>

                {rewriteError && (
                  <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                    {rewriteError}
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isRewriting) return;
                    setShowRewriteModal(false);
                    setRewriteError(null);
                    setRewriteUseWebSearch(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleRewriteContent}
                  disabled={isRewriting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-60"
                >
                  {isRewriting ? 'Réécriture…' : 'Réécrire maintenant'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

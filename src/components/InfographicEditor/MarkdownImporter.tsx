import React, { useState } from 'react';
import { Upload, FileText, X, Plus, Hash } from 'lucide-react';
import { infographicsService } from '../../lib/supabase';

interface MarkdownImporterProps {
  infographicId: string;
  onImport: () => void;
  onCancel: () => void;
}

interface ParsedPage {
  title: string;
  content: string;
  level: number;
}

export function MarkdownImporter({ infographicId, onImport, onCancel }: MarkdownImporterProps) {
  const [markdownContent, setMarkdownContent] = useState('');
  const [splitLevel, setSplitLevel] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [parsedPages, setParsedPages] = useState<ParsedPage[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseMarkdown = (content: string, level: number): ParsedPage[] => {
    if (!content.trim()) return [];

    const lines = content.split('\n');
    const pages: ParsedPage[] = [];
    let currentPage: ParsedPage | null = null;
    let currentContent: string[] = [];

    const headingRegex = new RegExp(`^#{1,${level}}\\s+(.+)$`);
    const targetLevelRegex = new RegExp(`^#{${level}}\\s+(.+)$`);

    for (const line of lines) {
      const headingMatch = line.match(headingRegex);
      
      if (headingMatch) {
        const headingLevel = line.match(/^#+/)?.[0].length || 0;
        
        // If this is our target level, start a new page
        if (headingLevel === level) {
          // Save previous page if it exists
          if (currentPage) {
            currentPage.content = currentContent.join('\n').trim();
            if (currentPage.title || currentPage.content) {
              pages.push(currentPage);
            }
          }
          
          // Start new page
          currentPage = {
            title: headingMatch[1].trim(),
            content: '',
            level: headingLevel
          };
          currentContent = [];
        } else {
          // Add this heading to current page content
          currentContent.push(line);
        }
      } else {
        // Add regular content line
        currentContent.push(line);
      }
    }

    // Don't forget the last page
    if (currentPage) {
      currentPage.content = currentContent.join('\n').trim();
      if (currentPage.title || currentPage.content) {
        pages.push(currentPage);
      }
    }

    // If no pages were created (no headings at target level), create one page with all content
    if (pages.length === 0 && content.trim()) {
      pages.push({
        title: 'Imported Content',
        content: content.trim(),
        level: 1
      });
    }

    return pages;
  };

  const handleContentChange = (content: string) => {
    setMarkdownContent(content);
    setError(null);
    
    if (content.trim()) {
      try {
        const parsed = parseMarkdown(content, splitLevel);
        setParsedPages(parsed);
      } catch (err) {
        setError('Error parsing markdown content');
        setParsedPages([]);
      }
    } else {
      setParsedPages([]);
    }
  };

  const handleSplitLevelChange = (level: 1 | 2 | 3 | 4 | 5) => {
    setSplitLevel(level);
    if (markdownContent.trim()) {
      try {
        const parsed = parseMarkdown(markdownContent, level);
        setParsedPages(parsed);
      } catch (err) {
        setError('Error parsing markdown content');
        setParsedPages([]);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.markdown')) {
      setError('Please select a Markdown file (.md or .markdown)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleContentChange(content);
    };
    reader.onerror = () => {
      setError('Error reading file');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedPages.length === 0) {
      setError('No pages to import');
      return;
    }

    try {
      setImporting(true);
      setError(null);

      // Create pages in sequence to maintain order
      for (let i = 0; i < parsedPages.length; i++) {
        const page = parsedPages[i];
        await infographicsService.createPage({
          infographic_id: infographicId,
          title: page.title,
          content_markdown: page.content,
          page_order: i,
          generated_html: '',
          generation_hints: [],
        });
      }

      onImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import pages');
    } finally {
      setImporting(false);
    }
  };

  const getLevelDescription = (level: number) => {
    const descriptions = {
      1: 'Split by main headings (# Title)',
      2: 'Split by section headings (## Section)',
      3: 'Split by subsection headings (### Subsection)',
      4: 'Split by sub-subsection headings (#### Sub-subsection)',
      5: 'Split by paragraph headings (##### Paragraph)'
    };
    return descriptions[level as keyof typeof descriptions];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-gray-100 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="p-3 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl mr-4">
              <Upload className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import from Markdown</h2>
              <p className="text-gray-600 text-sm">Split your markdown content into pages by heading levels</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Input */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-800 mb-3">
                  Upload Markdown File
                </label>
                <input
                  type="file"
                  accept=".md,.markdown"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-800 mb-3">
                  Split Level
                </label>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <label key={level} className="flex items-center">
                      <input
                        type="radio"
                        name="splitLevel"
                        value={level}
                        checked={splitLevel === level}
                        onChange={() => handleSplitLevelChange(level as 1 | 2 | 3 | 4 | 5)}
                        className="mr-3"
                      />
                      <div className="flex items-center">
                        <div className="flex">
                          {Array.from({ length: level }, (_, i) => (
                            <Hash key={i} className="w-3 h-3 text-gray-400" />
                          ))}
                        </div>
                        <span className="ml-2 text-sm text-gray-700">
                          {getLevelDescription(level)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-hidden">
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                Markdown Content
              </label>
              <textarea
                value={markdownContent}
                onChange={(e) => handleContentChange(e.target.value)}
                className="w-full h-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm transition-all bg-gray-50 focus:bg-white resize-none"
                placeholder="Paste your markdown content here or upload a file..."
              />
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Preview ({parsedPages.length} pages)
              </h3>
              <p className="text-sm text-gray-600">
                Pages will be created in the order shown below
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {parsedPages.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No pages to preview</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Add markdown content to see the page split preview
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {parsedPages.map((page, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-center mb-3">
                        <span className="text-xs font-bold text-white bg-blue-500 px-2 py-1 rounded-full mr-3">
                          {index + 1}
                        </span>
                        <h4 className="font-bold text-gray-900 truncate">
                          {page.title}
                        </h4>
                      </div>
                      <div className="text-xs text-gray-600 font-mono bg-white p-3 rounded-lg border max-h-32 overflow-y-auto">
                        {page.content.length > 200 
                          ? page.content.substring(0, 200) + '...'
                          : page.content || '(No content)'
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-6 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || parsedPages.length === 0}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all font-medium inline-flex items-center"
          >
            {importing ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            ) : (
              <Plus className="w-5 h-5 mr-2" />
            )}
            {importing ? 'Importing...' : `Import ${parsedPages.length} Pages`}
          </button>
        </div>
      </div>
    </div>
  );
}

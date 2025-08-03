import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, X, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { infographicsService, Infographic, InfographicPage } from '../lib/supabase';

interface InfographicSlideshowProps {
  infographic: Infographic;
  onClose: () => void;
}

export function InfographicSlideshow({ infographic, onClose }: InfographicSlideshowProps) {
  const [pages, setPages] = useState<InfographicPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPages();
  }, [infographic.id]);

  const loadPages = async () => {
    try {
      setLoading(true);
      const data = await infographicsService.getPages(infographic.id);
      // Only show pages that have generated HTML
      const generatedPages = data.filter(page => page.generated_html);
      setPages(generatedPages);
      
      if (generatedPages.length === 0) {
        setError('No generated pages found. Please generate HTML for at least one page first.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  };

  const goToNextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  const goToPage = (index: number) => {
    if (index >= 0 && index < pages.length) {
      setCurrentPageIndex(index);
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      goToPreviousPage();
    } else if (e.key === 'ArrowRight') {
      goToNextPage();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [currentPageIndex, pages.length, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading slideshow...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md mx-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Cannot Show Slideshow</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={onClose}
            className="group w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 inline-flex items-center justify-center overflow-hidden"
          >
            <Home className="w-5 h-5" />
            <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
              Back to Editor
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md mx-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">No Pages to Show</h2>
          <p className="text-gray-600 mb-6">
            This infographic doesn't have any generated pages yet. Please generate HTML for at least one page first.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const currentPage = pages[currentPageIndex];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-black bg-opacity-50 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-semibold">{infographic.name}</h1>
          <span className="text-sm text-gray-300">
            {currentPageIndex + 1} of {pages.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="group p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-all duration-300 inline-flex items-center overflow-hidden"
        >
          <X className="w-6 h-6" />
          <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
            Close
          </span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Previous Button */}
        <button
          onClick={goToPreviousPage}
          disabled={currentPageIndex === 0}
          className="group absolute left-4 z-10 p-3 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center overflow-hidden"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
            Previous
          </span>
        </button>

        {/* Page Content */}
        <div className="w-full h-full max-w-6xl max-h-full mx-8 bg-white rounded-lg shadow-2xl overflow-hidden">
          <iframe
            key={currentPage.id}
            srcDoc={currentPage.generated_html}
            className="w-full h-full border-0"
            title={currentPage.title}
          />
        </div>

        {/* Next Button */}
        <button
          onClick={goToNextPage}
          disabled={currentPageIndex === pages.length - 1}
          className="group absolute right-4 z-10 p-3 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center overflow-hidden"
        >
          <ChevronRight className="w-6 h-6" />
          <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
            Next
          </span>
        </button>
      </div>

      {/* Footer with Page Indicators */}
      <div className="bg-black bg-opacity-50 p-4">
        <div className="flex items-center justify-center space-x-2">
          {pages.map((page, index) => (
            <button
              key={page.id}
              onClick={() => goToPage(index)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                index === currentPageIndex
                  ? 'bg-white text-black'
                  : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="text-center mt-2">
          <p className="text-white text-sm font-medium">{currentPage.title}</p>
          <p className="text-gray-300 text-xs mt-1">
            Use arrow keys or click buttons to navigate • Press ESC to exit
          </p>
        </div>
      </div>
    </div>
  );
}
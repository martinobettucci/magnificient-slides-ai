import React, { useState, useEffect } from 'react';
import { Plus, FileText, Calendar, Edit, Trash2, Play } from 'lucide-react';
import { infographicsService, Infographic } from '../lib/supabase';
import { InfographicSlideshow } from './InfographicSlideshow';

interface InfographicsListProps {
  onSelectInfographic: (infographic: Infographic) => void;
  onCreateNew: () => void;
}

export function InfographicsList({ onSelectInfographic, onCreateNew }: InfographicsListProps) {
  const [infographics, setInfographics] = useState<Infographic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSlideshow, setShowSlideshow] = useState<Infographic | null>(null);

  useEffect(() => {
    loadInfographics();
  }, []);

  const loadInfographics = async () => {
    try {
      setLoading(true);
      const data = await infographicsService.getInfographics();
      setInfographics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load infographics');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this infographic?')) {
      try {
        await infographicsService.deleteInfographic(id);
        await loadInfographics();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete infographic');
      }
    }
  };

  const handleShowSlideshow = async (infographic: Infographic, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSlideshow(infographic);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadInfographics}
          className="mt-2 text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">InforgrAIphics</h1>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Infographic
        </button>
      </div>

      {infographics.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No infographics yet</h3>
          <p className="text-gray-500 mb-6">Create your first infographic to get started</p>
          <button
            onClick={onCreateNew}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Infographic
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {infographics.map((infographic) => (
            <div
              key={infographic.id}
              onClick={() => onSelectInfographic(infographic)}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {infographic.name}
                  </h3>
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {infographic.description}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(infographic.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleShowSlideshow(infographic, e)}
                  className="p-1 text-gray-400 hover:text-green-500 transition-colors"
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="w-4 h-4 mr-1" />
                {new Date(infographic.updated_at).toLocaleDateString()}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <Edit className="w-3 h-3 mr-1" />
                  Project
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slideshow Modal */}
      {showSlideshow && (
        <InfographicSlideshow
          infographic={showSlideshow}
          onClose={() => setShowSlideshow(null)}
        />
      )}
    </div>
  );
}
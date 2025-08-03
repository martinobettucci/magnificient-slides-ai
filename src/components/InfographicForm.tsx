import React, { useState } from 'react';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { infographicsService, Infographic } from '../lib/supabase';

interface InfographicFormProps {
  infographic?: Infographic;
  onSave: (infographic: Infographic) => void;
  onCancel: () => void;
}

export function InfographicForm({ infographic, onSave, onCancel }: InfographicFormProps) {
  const [formData, setFormData] = useState({
    name: infographic?.name || '',
    description: infographic?.description || '',
    style_description: infographic?.style_description || '',
  });
  const [loading, setLoading] = useState(false);
  const [generatingStyle, setGeneratingStyle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let savedInfographic: Infographic;
      
      if (infographic) {
        savedInfographic = await infographicsService.updateInfographic(infographic.id, formData);
      } else {
        savedInfographic = await infographicsService.createInfographic(formData);
      }

      onSave(savedInfographic);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save infographic');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleGenerateStyleGuidelines = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      setError('Project name and description are required to generate style guidelines');
      return;
    }

    try {
      setGeneratingStyle(true);
      setError(null);

      console.log('Generating style guidelines for:', {
        name: formData.name,
        description: formData.description,
        hasExistingStyle: !!formData.style_description
      });

      const result = await infographicsService.generateStyleGuidelines(
        formData.name,
        formData.description,
        formData.style_description || undefined
      );

      console.log('Style guidelines generated successfully:', result);
      
      // Update the form with the generated style guidelines
      setFormData(prev => ({ 
        ...prev, 
        style_description: result.styleGuidelines 
      }));

    } catch (err) {
      console.error('Error generating style guidelines:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate style guidelines');
    } finally {
      setGeneratingStyle(false);
    }
  };
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center mb-6">
        <button
          onClick={onCancel}
          className="mr-4 p-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {infographic ? 'Edit Infographic' : 'New Infographic'}
        </h1>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Project Name *
          </label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter project name"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Project Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Describe your infographic project..."
          />
        </div>

        <div>
          <label htmlFor="style_description" className="block text-sm font-medium text-gray-700 mb-2">
            Style Guidelines
            <button
              type="button"
              onClick={handleGenerateStyleGuidelines}
              disabled={generatingStyle || !formData.name.trim() || !formData.description.trim()}
              className="ml-2 inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generatingStyle ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b border-purple-700 mr-1"></div>
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              {generatingStyle ? 'Generating...' : 'AI Suggest'}
            </button>
          </label>
          <textarea
            id="style_description"
            value={formData.style_description}
            onChange={(e) => handleChange('style_description', e.target.value)}
            disabled={generatingStyle}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Describe the visual style, colors, fonts, layout preferences..."
          />
          <p className="mt-1 text-sm text-gray-500">
            These guidelines will be used by AI to generate consistent page designs. Use the AI Suggest button to get professional recommendations.
          </p>
        </div>

        <div className="flex items-center justify-end space-x-4 pt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {infographic ? 'Update' : 'Create'} Infographic
          </button>
        </div>
      </form>
    </div>
  );
}
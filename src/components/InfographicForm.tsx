import React, { useState } from 'react';
import { ArrowLeft, Save, Sparkles, X } from 'lucide-react';
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
      const compiledGuidelines =
        (typeof result.combinedStyleDescription === 'string' && result.combinedStyleDescription.trim().length > 0)
          ? result.combinedStyleDescription.trim()
          : result.styleGuidelines;

      setFormData(prev => ({
        ...prev,
        style_description: compiledGuidelines,
      }));

    } catch (err) {
      console.error('Error generating style guidelines:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate style guidelines');
    } finally {
      setGeneratingStyle(false);
    }
  };
  return (
    <div className="h-full bg-gradient-to-br from-indigo-50 via-white to-purple-50 overflow-y-auto">
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center mb-8">
        <button
          onClick={onCancel}
          className="group mr-4 inline-flex items-center p-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all duration-300 overflow-hidden"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2">
            Back
          </span>
        </button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {infographic ? 'Edit Infographic' : 'New Infographic'}
              </h1>
              <p className="text-gray-600 mt-1">
                {infographic ? 'Update your project settings' : 'Create a new AI-powered infographic project'}
              </p>
            </div>
          </div>

      {error && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6 shadow-sm">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <label htmlFor="name" className="block text-sm font-semibold text-gray-800 mb-3">
            Project Name *
          </label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
            placeholder="Enter project name"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-800 mb-3">
            Project Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={5}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white resize-none"
            placeholder="Describe your infographic project..."
          />
        </div>

        <div>
          <label htmlFor="style_description" className="block text-sm font-semibold text-gray-800 mb-3">
            Style Guidelines
            <button
              type="button"
              onClick={handleGenerateStyleGuidelines}
              disabled={generatingStyle || !formData.name.trim() || !formData.description.trim()}
              className="group ml-3 inline-flex items-center px-2 py-1.5 text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-lg hover:from-purple-200 hover:to-pink-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-sm overflow-hidden"
            >
              {generatingStyle ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-700 mr-1.5"></div>
              ) : (
                <Sparkles className="w-3 h-3 mr-1.5" />
              )}
              <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
                {generatingStyle ? 'Generating...' : 'AI Suggest'}
              </span>
            </button>
          </label>
          <textarea
            id="style_description"
            value={formData.style_description}
            onChange={(e) => handleChange('style_description', e.target.value)}
            disabled={generatingStyle}
            rows={6}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white resize-none disabled:opacity-60"
            placeholder="Describe the visual style, colors, fonts, layout preferences..."
          />
          <p className="mt-3 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
            <strong>💡 Tip:</strong> 
            These guidelines will be used by AI to generate consistent page designs. Use the AI Suggest button to get professional recommendations.
          </p>
        </div>

              <div className="flex items-center justify-end space-x-4 pt-8 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="group inline-flex items-center px-3 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-300 font-medium overflow-hidden"
          >
            <X className="w-5 h-5 mr-2" />
            <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
              Cancel
            </span>
          </button>
          <button
            type="submit"
            disabled={loading}
            className="group inline-flex items-center px-3 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium overflow-hidden"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap">
              {infographic ? 'Update' : 'Create'} Infographic
            </span>
          </button>
        </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

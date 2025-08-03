import React, { useState } from 'react';
import { InfographicsList } from './components/InfographicsList';
import { InfographicForm } from './components/InfographicForm';
import { InfographicEditor } from './components/InfographicEditor';
import { Infographic } from './lib/supabase';

type AppState = 
  | { view: 'list' }
  | { view: 'form'; infographic?: Infographic }
  | { view: 'editor'; infographic: Infographic };

function App() {
  const [appState, setAppState] = useState<AppState>({ view: 'list' });

  const handleSelectInfographic = (infographic: Infographic) => {
    setAppState({ view: 'editor', infographic });
  };

  const handleCreateNew = () => {
    setAppState({ view: 'form' });
  };

  const handleEditInfographic = (infographic: Infographic) => {
    setAppState({ view: 'form', infographic });
  };

  const handleSaveInfographic = (infographic: Infographic) => {
    setAppState({ view: 'editor', infographic });
  };

  const handleBackToList = () => {
    setAppState({ view: 'list' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        {appState.view === 'list' && (
          <InfographicsList
            onSelectInfographic={handleSelectInfographic}
            onCreateNew={handleCreateNew}
          />
        )}

        {appState.view === 'form' && (
          <InfographicForm
            infographic={appState.infographic}
            onSave={handleSaveInfographic}
            onCancel={handleBackToList}
          />
        )}

        {appState.view === 'editor' && (
          <InfographicEditor
            infographic={appState.infographic}
            onBack={handleBackToList}
            onEdit={() => handleEditInfographic(appState.infographic)}
          />
        )}
      </div>
      
      {/* App Footer */}
      <footer className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 text-white py-6 border-t border-gray-800">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-center space-x-2 text-sm">
            <span className="text-gray-300">Made by</span>
            <span className="font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              P2Enjoy SAS
            </span>
            <span className="text-gray-300">proudly with</span>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              <span className="text-gray-300">and</span>
              <span className="font-semibold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                AI
              </span>
            </div>
            <span className="text-gray-400">•</span>
            <span className="text-gray-400">Copyright 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
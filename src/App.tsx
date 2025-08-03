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
    <div className="min-h-screen">
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
  );
}

export default App;
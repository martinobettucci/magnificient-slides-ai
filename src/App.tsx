import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { InfographicsList } from './components/InfographicsList';
import { InfographicForm } from './components/InfographicForm';
import { InfographicEditor } from './components/InfographicEditor';
import { LandingPage } from './components/LandingPage';
import { Infographic, authService } from './lib/supabase';
import { LogOut } from 'lucide-react';

type AppState = 
  | { view: 'list' }
  | { view: 'form'; infographic?: Infographic }
  | { view: 'editor'; infographic: Infographic };

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [appState, setAppState] = useState<AppState>({ view: 'list' });

  useEffect(() => {
    // Check current user
    authService.getCurrentUser().then(user => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = authService.onAuthStateChange((user) => {
      setUser(user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setAppState({ view: 'list' });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={() => setLoading(true)} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* User Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {user.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-gray-600">
              Welcome, {user.email}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="group inline-flex items-center p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-300 overflow-hidden"
          >
            <LogOut className="w-4 h-4" />
            <span className="max-w-0 group-hover:max-w-xs transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 group-hover:ml-2 text-sm">
              Sign Out
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
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
      <footer className="bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 text-white py-4 border-t border-gray-800 h-20 flex-shrink-0">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-center space-x-2 text-sm h-full">
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

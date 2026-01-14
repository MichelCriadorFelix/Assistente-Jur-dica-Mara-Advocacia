import React, { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import ChatInterface from './components/ChatInterface';
import DashboardLayout from './components/DashboardLayout';
import DashboardStats from './components/DashboardStats';
import ChatMonitor from './components/ChatMonitor';
import SettingsScreen from './components/SettingsScreen';
import { ViewState, AppConfig } from './types';
import { INITIAL_CONFIG } from './constants';
import { Smartphone } from 'lucide-react';

function App() {
  const [view, setView] = useState<ViewState>(ViewState.LOGIN);
  const [dashboardPage, setDashboardPage] = useState('stats');
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  
  // Simple "Router"
  const renderView = () => {
    switch (view) {
      case ViewState.LOGIN:
        return <LoginScreen onLogin={() => setView(ViewState.DASHBOARD)} />;
      
      case ViewState.CLIENT_DEMO:
        return (
          <div className="h-screen w-full max-w-md mx-auto shadow-2xl border-x border-gray-200">
             <ChatInterface 
               onBack={() => setView(ViewState.DASHBOARD)} 
               config={config}
             />
          </div>
        );

      case ViewState.DASHBOARD:
        return (
          <DashboardLayout 
            onLogout={() => setView(ViewState.LOGIN)}
            currentPage={dashboardPage}
            onNavigate={setDashboardPage}
          >
            {dashboardPage === 'stats' && <DashboardStats />}
            {dashboardPage === 'chat' && (
              <ChatMonitor 
                config={config}
                onUpdateConfig={setConfig}
              />
            )}
            {dashboardPage === 'settings' && (
              <SettingsScreen />
            )}
            
            {/* Floating Action Button to launch Client Demo */}
            <button
               onClick={() => setView(ViewState.CLIENT_DEMO)}
               className="fixed bottom-8 right-8 bg-whatsapp-green hover:bg-emerald-600 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2 z-50"
               title="Simular Cliente"
            >
               <Smartphone className="w-6 h-6" />
               <span className="font-semibold">Testar IA (Cliente)</span>
            </button>
          </DashboardLayout>
        );
      
      default:
        return <div>404</div>;
    }
  };

  return (
    <>
      {renderView()}
    </>
  );
}

export default App;
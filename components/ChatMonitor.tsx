import React, { useState } from 'react';
import { Message, Contact, AppConfig } from '../types';
import { Search, MoreHorizontal, Bot, User, Bell } from 'lucide-react';
import { MOCK_CONTACTS } from '../constants';

interface ChatMonitorProps {
  currentLiveMessages: Message[];
  config: AppConfig;
  onUpdateConfig: (cfg: AppConfig) => void;
}

const ChatMonitor: React.FC<ChatMonitorProps> = ({ currentLiveMessages, config, onUpdateConfig }) => {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [promptEditable, setPromptEditable] = useState(config.systemPrompt);
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');

  // If selecting "João da Silva", show live demo messages, otherwise mock
  const activeMessages = selectedContactId === '1' ? currentLiveMessages : [];

  const handleSavePrompt = () => {
    onUpdateConfig({ ...config, systemPrompt: promptEditable });
    alert('Prompt do Sistema atualizado! A próxima interação usará as novas regras.');
  };

  return (
    <div className="flex h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm border dark:border-gray-700">
      
      {/* Sidebar List */}
      <div className="w-full md:w-1/3 border-r dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar conversa..." 
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-whatsapp-green outline-none" 
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
           {MOCK_CONTACTS.map(contact => (
             <div 
               key={contact.id}
               onClick={() => { setSelectedContactId(contact.id); setActiveTab('chat'); }}
               className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition ${selectedContactId === contact.id ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
             >
               <div className="relative">
                 <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full object-cover" />
                 {contact.status === 'urgent' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
               </div>
               <div className="flex-1 min-w-0">
                 <div className="flex justify-between items-center mb-1">
                   <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{contact.name}</h4>
                   <span className="text-xs text-gray-500">{contact.time}</span>
                 </div>
                 <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{contact.lastMessage}</p>
               </div>
             </div>
           ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="hidden md:flex flex-1 flex-col bg-gray-50 dark:bg-gray-900/50">
        {selectedContactId ? (
          <>
            {/* Header */}
            <div className="h-16 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center px-6">
              <div className="flex items-center gap-3">
                 <div className="font-semibold text-lg dark:text-white">
                   {MOCK_CONTACTS.find(c => c.id === selectedContactId)?.name}
                 </div>
                 <div className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                   Modo Automático (IA)
                 </div>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setActiveTab('settings')} className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${activeTab === 'settings' ? 'text-emerald-600' : 'text-gray-500'}`}>
                   Configurações da IA
                 </button>
                 <button onClick={() => setActiveTab('chat')} className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${activeTab === 'chat' ? 'text-emerald-600' : 'text-gray-500'}`}>
                   Chat
                 </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
               {activeTab === 'chat' ? (
                 selectedContactId === '1' && activeMessages.length > 0 ? (
                    <div className="space-y-4">
                      {activeMessages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                           <div className={`flex items-start max-w-xl gap-2 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-gray-300' : 'bg-emerald-600'}`}>
                                 {msg.role === 'user' ? <User className="w-5 h-5 text-gray-600" /> : <Bot className="w-5 h-5 text-white" />}
                              </div>
                              <div className={`p-3 rounded-lg shadow-sm text-sm ${msg.role === 'user' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200' : 'bg-emerald-600 text-white'}`}>
                                 {msg.content}
                              </div>
                           </div>
                        </div>
                      ))}
                    </div>
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <Bot className="w-12 h-12 mb-2 opacity-20" />
                      <p>Nenhuma mensagem em tempo real para este contato simulado.</p>
                      <p className="text-xs">Selecione "João da Silva" para ver o teste ao vivo.</p>
                    </div>
                 )
               ) : (
                 <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border dark:border-gray-700">
                      <h3 className="text-lg font-medium mb-4 dark:text-white flex items-center gap-2">
                        <Bot className="w-5 h-5" /> Instruções do Sistema (Persona)
                      </h3>
                      <p className="text-sm text-gray-500 mb-2">Edite como a Mara se comporta em tempo real.</p>
                      <textarea 
                        className="w-full h-64 p-3 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 font-mono"
                        value={promptEditable}
                        onChange={(e) => setPromptEditable(e.target.value)}
                      />
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={handleSavePrompt}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                        >
                          Salvar Alterações
                        </button>
                      </div>
                    </div>
                 </div>
               )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <p>Selecione um contato para monitorar</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMonitor;
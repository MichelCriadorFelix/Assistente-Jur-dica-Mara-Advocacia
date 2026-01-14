import React, { useState, useEffect } from 'react';
import { Message, Contact, AppConfig } from '../types';
import { Search, Bot, User, RefreshCw, Save, Filter } from 'lucide-react';
import { chatService } from '../services/chatService';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface ChatMonitorProps {
  config: AppConfig;
  onUpdateConfig: (cfg: AppConfig) => void;
  initialFilter?: 'all' | 'urgent' | 'triaged' | 'new';
}

const ChatMonitor: React.FC<ChatMonitorProps> = ({ config, onUpdateConfig, initialFilter = 'all' }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  
  // Estado local do filtro, iniciado pela prop mas mutável pelo usuário
  const [activeFilter, setActiveFilter] = useState(initialFilter);

  const [promptEditable, setPromptEditable] = useState(config.systemPrompt);
  const [showPromptEdit, setShowPromptEdit] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load Contacts on Mount and Refresh
  const fetchContacts = async () => {
    setLoading(true);
    const data = await chatService.getAllContacts();
    setContacts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
    const interval = setInterval(fetchContacts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Atualiza o filtro se a prop mudar (ex: navegação vinda do dashboard)
  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  // Load messages when contact is selected
  useEffect(() => {
    if (selectedContactId) {
      chatService.loadMessages(selectedContactId).then(setMessages);
    }
  }, [selectedContactId]);

  const handleSavePrompt = () => {
    onUpdateConfig({ ...config, systemPrompt: promptEditable });
    setShowPromptEdit(false);
    alert('Persona da IA atualizada!');
  };

  // Lógica de Filtragem
  const filteredContacts = contacts.filter(contact => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'urgent') return contact.status === 'urgent' || contact.status === 'new'; // 'new' geralmente requer atenção
    if (activeFilter === 'new') return contact.status === 'new';
    return contact.status === activeFilter;
  });

  return (
    <div className="flex h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm border dark:border-gray-700">
      
      {/* Sidebar List */}
      <div className="w-full md:w-1/3 border-r dark:border-gray-700 flex flex-col">
        
        {/* Header da Sidebar */}
        <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar conversa..." 
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-whatsapp-green outline-none" 
              />
            </div>
            <button onClick={fetchContacts} className="p-2 text-gray-500 hover:text-emerald-600" title="Atualizar">
               <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Abas de Filtro */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'urgent', label: 'Atenção' },
              { id: 'triaged', label: 'Finalizados' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id as any)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                  activeFilter === filter.id 
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto">
           {filteredContacts.length === 0 ? (
             <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center">
                <Filter className="w-8 h-8 mb-2 opacity-20" />
                <p>Nenhum atendimento encontrado para este filtro.</p>
                {!isSupabaseConfigured && (
                   <span className="text-xs text-blue-500 mt-2 bg-blue-50 px-2 py-1 rounded">
                     Modo Local (Offline) Ativo
                   </span>
                )}
             </div>
           ) : (
             filteredContacts.map(contact => (
               <div 
                 key={contact.id}
                 onClick={() => { setSelectedContactId(contact.id); setShowPromptEdit(false); }}
                 className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b dark:border-gray-700/50 ${selectedContactId === contact.id ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
               >
                 <div className="relative">
                   <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full object-cover" />
                   {contact.status === 'urgent' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
                   {contact.status === 'triaged' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full"></span>}
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-center mb-1">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{contact.name}</h4>
                     <span className="text-xs text-gray-500">{contact.time}</span>
                   </div>
                   <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{contact.lastMessage}</p>
                 </div>
               </div>
             ))
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="hidden md:flex flex-1 flex-col bg-gray-50 dark:bg-gray-900/50">
        {selectedContactId || showPromptEdit ? (
          <>
            {/* Header */}
            <div className="h-16 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center px-6">
              <div className="flex items-center gap-3">
                 <div className="font-semibold text-lg dark:text-white">
                   {showPromptEdit ? 'Editar Persona (Instruções)' : contacts.find(c => c.id === selectedContactId)?.name}
                 </div>
                 {!isSupabaseConfigured && (
                    <div className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                      Armazenamento Local
                    </div>
                 )}
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setShowPromptEdit(!showPromptEdit)} className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${showPromptEdit ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500'}`}>
                   <Bot className="w-5 h-5" />
                 </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
               {showPromptEdit ? (
                  <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border dark:border-gray-700">
                      <h3 className="text-lg font-medium mb-4 dark:text-white flex items-center gap-2">
                        Como a Mara deve se comportar?
                      </h3>
                      <textarea 
                        className="w-full h-96 p-4 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 font-mono leading-relaxed resize-none"
                        value={promptEditable}
                        onChange={(e) => setPromptEditable(e.target.value)}
                      />
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={handleSavePrompt}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" /> Atualizar Persona
                        </button>
                      </div>
                  </div>
               ) : (
                 messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map(msg => (
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
                      <p>Nenhuma mensagem encontrada para este contato.</p>
                    </div>
                 )
               )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Bot className="w-16 h-16 mb-4 opacity-10" />
            <p>Selecione um contato para monitorar</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMonitor;
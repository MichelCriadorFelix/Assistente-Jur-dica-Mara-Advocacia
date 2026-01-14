import React, { useState, useEffect } from 'react';
import { Message, Contact, AppConfig } from '../types';
import { Search, Bot, User, RefreshCw, Save, Filter, FileText, Check } from 'lucide-react';
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
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [promptEditable, setPromptEditable] = useState(config.systemPrompt);
  const [showPromptEdit, setShowPromptEdit] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estado do Prontuário (Case Status)
  const [caseStatusText, setCaseStatusText] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);

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

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  // Load messages and status when contact is selected
  useEffect(() => {
    if (selectedContact) {
      chatService.loadMessages(selectedContact.id).then(setMessages);
      setCaseStatusText(selectedContact.caseStatus || '');
    }
  }, [selectedContact]);

  const handleSavePrompt = () => {
    onUpdateConfig({ ...config, systemPrompt: promptEditable });
    setShowPromptEdit(false);
    alert('Persona da IA atualizada!');
  };

  const handleSaveCaseStatus = async () => {
    if (!selectedContact) return;
    setIsSavingStatus(true);
    await chatService.updateCaseStatus(selectedContact.id, caseStatusText);
    
    // Atualiza lista localmente para refletir a mudança
    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, caseStatus: caseStatusText } : c));
    setIsSavingStatus(false);
  };

  const filteredContacts = contacts.filter(contact => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'urgent') return contact.status === 'urgent' || contact.status === 'new';
    if (activeFilter === 'new') return contact.status === 'new';
    return contact.status === activeFilter;
  });

  return (
    <div className="flex h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm border dark:border-gray-700">
      
      {/* Sidebar List */}
      <div className="w-full md:w-1/3 border-r dark:border-gray-700 flex flex-col">
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

        <div className="flex-1 overflow-y-auto">
           {filteredContacts.length === 0 ? (
             <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center">
                <Filter className="w-8 h-8 mb-2 opacity-20" />
                <p>Nenhum atendimento encontrado.</p>
             </div>
           ) : (
             filteredContacts.map(contact => (
               <div 
                 key={contact.id}
                 onClick={() => { setSelectedContact(contact); setShowPromptEdit(false); }}
                 className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b dark:border-gray-700/50 ${selectedContact?.id === contact.id ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
               >
                 <div className="relative">
                   <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full object-cover" />
                   {contact.status === 'urgent' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
                   {contact.caseStatus && <span className="absolute top-0 right-0 w-3 h-3 bg-yellow-400 border-2 border-white rounded-full" title="Possui status atualizado"></span>}
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
        {selectedContact || showPromptEdit ? (
          <>
            <div className="h-16 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center px-6 shadow-sm z-10">
              <div className="flex items-center gap-3">
                 <div className="font-semibold text-lg dark:text-white">
                   {showPromptEdit ? 'Configurar IA' : selectedContact?.name}
                 </div>
                 {selectedContact?.caseStatus && !showPromptEdit && (
                   <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200 flex items-center gap-1">
                     <FileText className="w-3 h-3" /> Info Processual Ativa
                   </span>
                 )}
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setShowPromptEdit(!showPromptEdit)} className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${showPromptEdit ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500'}`} title="Configurar Prompt">
                   <Bot className="w-5 h-5" />
                 </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Chat History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                   {showPromptEdit ? (
                      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border dark:border-gray-700">
                          <h3 className="text-lg font-medium mb-4 dark:text-white">Prompt do Sistema</h3>
                          <textarea 
                            className="w-full h-96 p-4 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 resize-none"
                            value={promptEditable}
                            onChange={(e) => setPromptEditable(e.target.value)}
                          />
                          <button onClick={handleSavePrompt} className="mt-4 bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-medium float-right">Salvar</button>
                      </div>
                   ) : messages.length > 0 ? (
                        messages.map(msg => (
                          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                             <div className={`flex items-start max-w-xl gap-2 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-gray-300' : 'bg-emerald-600'}`}>
                                   {msg.role === 'user' ? <User className="w-5 h-5 text-gray-600" /> : <Bot className="w-5 h-5 text-white" />}
                                </div>
                                <div className={`p-3 rounded-lg shadow-sm text-sm ${msg.role === 'user' ? 'bg-white dark:bg-gray-800' : 'bg-emerald-600 text-white'}`}>
                                   {msg.content}
                                </div>
                             </div>
                          </div>
                        ))
                   ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400"><p>Sem mensagens.</p></div>
                   )}
                </div>

                {/* Right Panel: Case Status / Prontuário */}
                {!showPromptEdit && (
                  <div className="w-80 bg-white dark:bg-gray-800 border-l dark:border-gray-700 p-4 flex flex-col shadow-xl z-20">
                     <div className="flex items-center gap-2 mb-4 text-gray-700 dark:text-gray-200 font-semibold border-b pb-2 dark:border-gray-700">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <h3>Status do Caso</h3>
                     </div>
                     
                     <div className="flex-1 flex flex-col">
                        <p className="text-xs text-gray-500 mb-2">
                           Escreva aqui atualizações (audiências, perícias, valores). 
                           <br/><strong className="text-emerald-600">A Mara lerá isso automaticamente</strong> e responderá ao cliente quando perguntado.
                        </p>
                        <textarea
                           className="flex-1 w-full p-3 text-sm border rounded-lg bg-yellow-50 dark:bg-gray-900 border-yellow-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-yellow-400 outline-none resize-none mb-3"
                           placeholder="Ex: Perícia agendada para 25/10. Processo aguardando cálculo."
                           value={caseStatusText}
                           onChange={(e) => setCaseStatusText(e.target.value)}
                        />
                        <button 
                          onClick={handleSaveCaseStatus}
                          disabled={isSavingStatus}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition"
                        >
                          {isSavingStatus ? 'Salvando...' : <><Save className="w-4 h-4" /> Atualizar Informação</>}
                        </button>
                        {selectedContact?.caseStatus && (
                           <div className="mt-3 text-xs text-green-600 flex items-center gap-1 justify-center">
                              <Check className="w-3 h-3" /> Informação disponível para IA
                           </div>
                        )}
                     </div>
                  </div>
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
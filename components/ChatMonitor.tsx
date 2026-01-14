import React, { useState, useEffect } from 'react';
import { Message, Contact, AppConfig } from '../types';
import { Search, Bot, User, RefreshCw, Key, Save, Database } from 'lucide-react';
import { chatService } from '../services/chatService';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface ChatMonitorProps {
  config: AppConfig;
  onUpdateConfig: (cfg: AppConfig) => void;
}

const ChatMonitor: React.FC<ChatMonitorProps> = ({ config, onUpdateConfig }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  
  const [promptEditable, setPromptEditable] = useState(config.systemPrompt);
  const [manualApiKey, setManualApiKey] = useState('');
  
  // Supabase Manual Config
  const [manualSupabaseUrl, setManualSupabaseUrl] = useState('');
  const [manualSupabaseKey, setManualSupabaseKey] = useState('');

  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
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
    // Simple polling every 10 seconds to keep list fresh
    const interval = setInterval(fetchContacts, 10000);
    
    // Load existing manual keys
    const savedKey = localStorage.getItem('mara_gemini_api_key');
    if (savedKey) setManualApiKey(savedKey);
    
    const savedUrl = localStorage.getItem('mara_supabase_url');
    if (savedUrl) setManualSupabaseUrl(savedUrl);
    
    const savedSbKey = localStorage.getItem('mara_supabase_key');
    if (savedSbKey) setManualSupabaseKey(savedSbKey);

    return () => clearInterval(interval);
  }, []);

  // Load messages when contact is selected
  useEffect(() => {
    if (selectedContactId) {
      chatService.loadMessages(selectedContactId).then(setMessages);
    }
  }, [selectedContactId]);

  const handleSavePrompt = () => {
    onUpdateConfig({ ...config, systemPrompt: promptEditable });
    alert('Configurações salvas!');
  };

  const handleSaveApiKey = () => {
    if (manualApiKey.trim()) {
        localStorage.setItem('mara_gemini_api_key', manualApiKey.trim());
        alert('Chave de IA salva!');
    } else {
        localStorage.removeItem('mara_gemini_api_key');
        alert('Chave removida.');
    }
  };

  const handleSaveSupabase = () => {
    if (manualSupabaseUrl.trim() && manualSupabaseKey.trim()) {
        localStorage.setItem('mara_supabase_url', manualSupabaseUrl.trim());
        localStorage.setItem('mara_supabase_key', manualSupabaseKey.trim());
        alert('Credenciais do Banco salvas! Recarregue a página para conectar.');
        window.location.reload();
    } else {
        localStorage.removeItem('mara_supabase_url');
        localStorage.removeItem('mara_supabase_key');
        alert('Credenciais removidas.');
        window.location.reload();
    }
  };

  return (
    <div className="flex h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm border dark:border-gray-700">
      
      {/* Sidebar List */}
      <div className="w-full md:w-1/3 border-r dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
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
        <div className="flex-1 overflow-y-auto">
           {!isSupabaseConfigured ? (
             <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center">
                <Database className="w-8 h-8 mb-2 text-yellow-500" />
                <p>Banco de dados desconectado.</p>
                <p className="text-xs mt-2">Configure em "Configurações"</p>
             </div>
           ) : contacts.length === 0 ? (
             <div className="p-8 text-center text-gray-500 text-sm">Nenhum atendimento iniciado.</div>
           ) : (
             contacts.map(contact => (
               <div 
                 key={contact.id}
                 onClick={() => { setSelectedContactId(contact.id); setActiveTab('chat'); }}
                 className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition ${selectedContactId === contact.id ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
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
        {selectedContactId || activeTab === 'settings' ? (
          <>
            {/* Header */}
            <div className="h-16 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center px-6">
              <div className="flex items-center gap-3">
                 <div className="font-semibold text-lg dark:text-white">
                   {activeTab === 'chat' ? contacts.find(c => c.id === selectedContactId)?.name : 'Configurações'}
                 </div>
                 {activeTab === 'chat' && isSupabaseConfigured && (
                    <div className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Supabase Online
                    </div>
                 )}
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
               ) : (
                 <div className="max-w-2xl mx-auto space-y-8">
                    
                    {/* API Key Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border dark:border-gray-700">
                       <h3 className="text-lg font-medium mb-4 dark:text-white flex items-center gap-2">
                         <Key className="w-5 h-5" /> Chave de API (Gemini)
                       </h3>
                       <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded mb-4 text-xs text-yellow-800 dark:text-yellow-200">
                          Se o app não estiver conseguindo ler a variável da Vercel (API_KEY_1), cole sua chave aqui manualmente.
                       </div>
                       <div className="flex gap-2">
                         <input 
                           type="password" 
                           placeholder="Cole sua API Key aqui (AIza...)" 
                           className="flex-1 p-2 text-sm border rounded outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                           value={manualApiKey}
                           onChange={(e) => setManualApiKey(e.target.value)}
                         />
                         <button 
                           onClick={handleSaveApiKey}
                           className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-black"
                         >
                           Salvar
                         </button>
                       </div>
                    </div>

                    {/* Supabase Config Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border dark:border-gray-700">
                       <h3 className="text-lg font-medium mb-4 dark:text-white flex items-center gap-2">
                         <Database className="w-5 h-5" /> Configuração do Banco (Supabase)
                       </h3>
                       <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded mb-4 text-xs text-blue-800 dark:text-blue-200">
                          Cole abaixo as credenciais do seu projeto Supabase se a conexão automática falhar.
                       </div>
                       <div className="space-y-3">
                         <div>
                            <label className="text-xs text-gray-500 block mb-1">URL do Projeto</label>
                            <input 
                              type="text" 
                              placeholder="https://xxx.supabase.co" 
                              className="w-full p-2 text-sm border rounded outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                              value={manualSupabaseUrl}
                              onChange={(e) => setManualSupabaseUrl(e.target.value)}
                            />
                         </div>
                         <div>
                            <label className="text-xs text-gray-500 block mb-1">Chave Pública (Anon Key)</label>
                            <input 
                              type="password" 
                              placeholder="eyJxh..." 
                              className="w-full p-2 text-sm border rounded outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                              value={manualSupabaseKey}
                              onChange={(e) => setManualSupabaseKey(e.target.value)}
                            />
                         </div>
                         <div className="flex justify-end">
                            <button 
                              onClick={handleSaveSupabase}
                              className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-black"
                            >
                              Salvar e Conectar
                            </button>
                         </div>
                       </div>
                    </div>

                    {/* Persona Section */}
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
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" /> Salvar Prompt
                        </button>
                      </div>
                    </div>

                 </div>
               )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <p>Selecione um contato ou vá em Configurações</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMonitor;
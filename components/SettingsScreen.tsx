import React, { useState, useEffect } from 'react';
import { Database, Key, Users, Save, Trash2, Plus, Bot, Phone, CheckCircle, AlertCircle, Server, Globe, ShieldCheck, Cpu, ExternalLink, ChevronDown, ChevronUp, Copy, Terminal } from 'lucide-react';
import { chatService } from '../services/chatService';
import { getAvailableApiKeys, testConnection, getAvailableApiKeysMap } from '../services/geminiService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { AppConfig, TeamMember } from '../types';
import { INITIAL_CONFIG, DEFAULT_TEAM } from '../constants';

const SettingsScreen: React.FC = () => {
  // Configuração Geral (Prompt + Team)
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const [activeTab, setActiveTab] = useState<'team' | 'ai' | 'whatsapp'>('team');
  
  // API Keys States
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [keysMap, setKeysMap] = useState<Record<string, string>>({});
  
  // WhatsApp Integration States
  const [waConfig, setWaConfig] = useState({
     apiUrl: '',
     apiToken: '',
     instanceName: ''
  });
  const [showTutorial, setShowTutorial] = useState(false);
  
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
    // Carregar Configurações de Equipe
    const savedTeam = localStorage.getItem('mara_team_config');
    if (savedTeam) {
      setConfig(prev => ({ ...prev, team: JSON.parse(savedTeam) }));
    } else {
       setConfig(prev => ({ ...prev, team: DEFAULT_TEAM }));
    }

    // Carregar Chaves
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);
    
    // Se tiver manual, carrega, senão deixa vazio (pois usa a automática)
    const sbk = localStorage.getItem('mara_supabase_key');
    if (sbk) setSbKey(sbk);
    
    // Carregar config WhatsApp
    const wa = localStorage.getItem('mara_whatsapp_config');
    if (wa) setWaConfig(JSON.parse(wa));

    refreshKeyCount();
  }, []);

  const refreshKeyCount = () => {
    setKeysMap(getAvailableApiKeysMap());
  };

  // --- TEAM MANAGEMENT ---
  const handleUpdateMember = (id: string, field: keyof TeamMember, value: string) => {
    const newTeam = config.team.map(m => m.id === id ? { ...m, [field]: value } : m);
    setConfig({ ...config, team: newTeam });
  };

  const handleAddMember = () => {
    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: 'Novo Membro',
      role: 'Função',
      phone: '',
      active: true
    };
    setConfig({ ...config, team: [...config.team, newMember] });
  };

  const handleRemoveMember = (id: string) => {
    if (confirm('Remover este membro da equipe?')) {
      setConfig({ ...config, team: config.team.filter(m => m.id !== id) });
    }
  };

  const handleSaveTeam = () => {
    localStorage.setItem('mara_team_config', JSON.stringify(config.team));
    alert('Equipe e números de WhatsApp atualizados com sucesso!');
  };

  // --- CONNECTION TESTS ---
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult('Verificando pool de chaves...');
    localStorage.removeItem('mara_working_model'); 
    
    try {
      const result = await testConnection();
      if (result.success) {
        setTestResult(`✅ ${result.message}`);
      } else {
        setTestResult(`❌ ERRO: ${result.message}`);
      }
    } catch (e: any) {
      setTestResult(`Erro: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveApi = () => {
    if (apiKey.trim()) localStorage.setItem('mara_gemini_api_key', apiKey.trim());
    else localStorage.removeItem('mara_gemini_api_key');
    alert('Salvo!');
    refreshKeyCount();
  };

  const handleSaveSupabase = () => {
    if (sbKey.trim()) {
      localStorage.setItem('mara_supabase_key', sbKey.trim());
      localStorage.setItem('mara_supabase_url', sbUrlDisplay); 
      alert('Configuração manual salva! Recarregando...');
      window.location.reload();
    } else {
      localStorage.removeItem('mara_supabase_key');
      localStorage.removeItem('mara_supabase_url');
      alert('Configuração manual removida. Tentando reconectar via variáveis de ambiente...');
      window.location.reload();
    }
  };
  
  const handleSaveWhatsapp = () => {
     // Pequena limpeza na URL para evitar erros comuns
     let cleanUrl = waConfig.apiUrl.trim();
     if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
     
     const finalConfig = { ...waConfig, apiUrl: cleanUrl };
     
     localStorage.setItem('mara_whatsapp_config', JSON.stringify(finalConfig));
     setWaConfig(finalConfig);
     alert("Configuração de Gateway salva.");
  };

  const handleClearLocalData = () => {
    if (confirm("Apagar dados locais (cache)? Isso não apaga o Supabase.")) {
      chatService.clearLocalData();
      alert("Limpo.");
      window.location.reload();
    }
  };

  const detectedKeysCount = Object.keys(keysMap).length;
  const isSupabaseManual = !!localStorage.getItem('mara_supabase_key');

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <h1 className="text-2xl font-bold dark:text-white mb-6">Configurações do Sistema</h1>

      {/* Tabs */}
      <div className="flex border-b dark:border-gray-700 mb-6 overflow-x-auto">
        {[
          { id: 'team', label: 'Equipe', icon: Users },
          { id: 'ai', label: 'IA & Chaves', icon: Bot },
          { id: 'whatsapp', label: 'Integração WhatsApp', icon: Phone },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* TAB: TEAM MANAGEMENT */}
      {activeTab === 'team' && (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" /> Membros & Telefones
             </h2>
             <button onClick={handleSaveTeam} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium">
               <Save className="w-4 h-4" /> Salvar Alterações
             </button>
          </div>
          
          <p className="text-sm text-gray-500 mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-blue-800 dark:text-blue-200">
            Estes números receberão os relatórios de triagem via link direto do WhatsApp.
          </p>
  
          <div className="space-y-4">
            {config.team.map((member) => (
              <div key={member.id} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                 <div className="flex-1 w-full">
                   <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Nome</label>
                   <input 
                     type="text" 
                     value={member.name}
                     onChange={(e) => handleUpdateMember(member.id, 'name', e.target.value)}
                     className="w-full bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none text-gray-800 dark:text-gray-200 font-medium py-1"
                   />
                 </div>
                 <div className="flex-1 w-full">
                   <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Função</label>
                   <input 
                     type="text" 
                     value={member.role}
                     onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                     className="w-full bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none text-sm text-gray-600 dark:text-gray-300 py-1"
                   />
                 </div>
                 <div className="flex-1 w-full">
                   <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Phone className="w-3 h-3" /> WhatsApp (DDD+Num)
                   </label>
                   <input 
                     type="text" 
                     value={member.phone || ''}
                     onChange={(e) => handleUpdateMember(member.id, 'phone', e.target.value)}
                     className="w-full bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none text-sm text-gray-600 dark:text-gray-300 py-1 font-mono"
                     placeholder="5511999999999"
                   />
                 </div>
                 <button 
                   onClick={() => handleRemoveMember(member.id)}
                   className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
              </div>
            ))}
            <button 
              onClick={handleAddMember}
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-400 hover:text-blue-500 hover:border-blue-400 transition flex items-center justify-center gap-2 font-medium"
            >
              <Plus className="w-4 h-4" /> Adicionar Membro
            </button>
          </div>
        </div>
      )}

      {/* TAB: AI & KEYS */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {/* Gemini Section */}
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2 mb-4">
               <Bot className="w-5 h-5 text-emerald-600" /> Inteligência Artificial (Gemini)
            </h2>
            
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
               <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-gray-700 dark:text-gray-300">
                    {detectedKeysCount} Chave(s) Detectada(s)
                  </span>
                  <button onClick={handleTestConnection} disabled={isTesting} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-700 font-bold shadow">
                    {isTesting ? 'Testando...' : 'Testar Conexão'}
                  </button>
               </div>
               
               {testResult && (
                 <div className={`p-3 mb-3 rounded text-sm font-mono border break-words ${testResult.includes('SUCESSO') || testResult.includes('✅') ? 'bg-green-100 text-green-900 border-green-200' : 'bg-red-100 text-red-900 border-red-200'}`}>
                   {testResult}
                 </div>
               )}
            </div>
            
            <div className="flex gap-4 items-end">
               <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adicionar Chave Manualmente (Override)</label>
                  <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Cole sua API Key aqui..."
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                  />
               </div>
               <button onClick={handleSaveApi} className="bg-gray-800 text-white px-4 py-2 rounded h-10 hover:bg-black">
                  Salvar
               </button>
            </div>
          </div>

          {/* Supabase Section */}
          <div className={`p-8 rounded-xl shadow-md border-l-4 ${isSupabaseConfigured ? 'border-green-500' : 'border-yellow-500'} bg-white dark:bg-gray-800`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5" /> Banco de Dados (Supabase)
              </h2>
              
              {isSupabaseConfigured ? (
                 <span className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-1 rounded-full text-xs font-bold border border-green-200 dark:border-green-800">
                    <CheckCircle className="w-4 h-4" /> 
                    {isSupabaseManual ? 'Conectado (Manual)' : 'Conectado (Automático)'}
                 </span>
              ) : (
                 <span className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full text-xs font-bold border border-yellow-200">
                    <AlertCircle className="w-4 h-4" /> Modo Local (Offline)
                 </span>
              )}
            </div>

            <div className="flex gap-4 items-end opacity-90 hover:opacity-100 transition-opacity">
               <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                     {isSupabaseConfigured && !isSupabaseManual ? 'Sobrescrever Chave Anon (Opcional)' : 'Chave Anon'}
                  </label>
                  <input 
                    type="password" 
                    value={sbKey}
                    onChange={(e) => setSbKey(e.target.value)}
                    placeholder="Chave pública do Supabase"
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                  />
               </div>
               <button onClick={handleSaveSupabase} className={`${sbKey ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600'} text-white px-4 py-2 rounded h-10 transition-colors`}>
                  {sbKey ? 'Conectar' : 'Remover Manual'}
               </button>
            </div>
            
            <div className="mt-6 pt-6 border-t dark:border-gray-700 flex justify-end">
                <button onClick={handleClearLocalData} className="text-gray-400 text-xs hover:text-red-500 hover:underline">
                   Limpar Cache Local do Navegador
                </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: WHATSAPP INTEGRATION */}
      {activeTab === 'whatsapp' && (
         <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
             
             {/* Info Cards */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-500">
                    <div className="flex items-center gap-2 mb-2 font-bold">
                       <Server className="w-5 h-5" />
                       <h3>Opção Paga (Z-API/Twilio)</h3>
                    </div>
                    <p className="text-sm">Mais fácil de configurar, mas tem mensalidade. Ideal se você não quer lidar com servidores.</p>
                </div>

                <div className={`p-4 border rounded-lg transition-all cursor-pointer ${showTutorial ? 'bg-emerald-100 border-emerald-300 ring-2 ring-emerald-500' : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`} onClick={() => setShowTutorial(!showTutorial)}>
                    <div className="flex items-center justify-between gap-2 mb-2 font-bold text-emerald-800 dark:text-emerald-500">
                       <div className="flex items-center gap-2">
                          <Cpu className="w-5 h-5" />
                          <h3>Opção Gratuita (Docker)</h3>
                       </div>
                       {showTutorial ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                    </div>
                    <p className="text-sm text-emerald-700">Clique para ver o guia de como instalar a Evolution API no seu PC.</p>
                </div>
             </div>

             {/* TUTORIAL EXPANDABLE */}
             {showTutorial && (
               <div className="mb-8 bg-gray-900 text-gray-300 p-6 rounded-lg font-mono text-sm border border-gray-700 shadow-inner animate-in slide-in-from-top-4">
                  <h4 className="text-white font-bold mb-4 flex items-center gap-2"><Terminal className="w-4 h-4"/> Guia de Instalação Local</h4>
                  
                  <ol className="list-decimal pl-5 space-y-4">
                     <li>
                        <p>Instale o <strong>Docker Desktop</strong> no Windows.</p>
                     </li>
                     <li>
                        <p>Crie um arquivo chamado <span className="text-yellow-400">docker-compose.yml</span> com este conteúdo:</p>
                        <div className="bg-black p-3 rounded mt-2 text-xs overflow-x-auto border border-gray-800">
                           <pre>{`version: '3.3'
services:
  evolution-api:
    image: attias/evolution-api:latest
    restart: always
    ports: ["8080:8080"]
    environment:
      - SERVER_URL=http://localhost:8080
      - API_KEY=marasecretkey123
      - AUTHENTICATION_API_KEY=marasecretkey123`}</pre>
                        </div>
                     </li>
                     <li>
                        <p>Abra o CMD na pasta e rode: <span className="text-green-400">docker-compose up -d</span></p>
                     </li>
                     <li>
                        <p>Instale o <strong>Ngrok</strong> e rode: <span className="text-green-400">ngrok http 8080</span></p>
                     </li>
                     <li>
                        <p>Copie o link HTTPS do Ngrok e cole abaixo em "URL Base".</p>
                     </li>
                  </ol>
               </div>
             )}

             <h2 className="text-lg font-bold dark:text-white flex items-center gap-2 mb-6">
                <Globe className="w-5 h-5 text-purple-600" /> Configuração do Gateway
             </h2>

             <div className="space-y-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Instância</label>
                   <input 
                     type="text" 
                     placeholder="Ex: Escritorio"
                     className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                     value={waConfig.instanceName}
                     onChange={e => setWaConfig({...waConfig, instanceName: e.target.value})}
                   />
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL Base da API (Ngrok ou Z-API)</label>
                   <input 
                     type="text" 
                     placeholder="Ex: https://a1b2.ngrok-free.app (Sem /message no final)"
                     className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                     value={waConfig.apiUrl}
                     onChange={e => setWaConfig({...waConfig, apiUrl: e.target.value})}
                   />
                   <p className="text-xs text-gray-400 mt-1">Cole apenas a raiz da URL (ex: o link do Ngrok).</p>
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Token de Acesso (API Key)</label>
                   <input 
                     type="password" 
                     placeholder="Ex: marasecretkey123"
                     className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                     value={waConfig.apiToken}
                     onChange={e => setWaConfig({...waConfig, apiToken: e.target.value})}
                   />
                </div>
                
                <div className="pt-4">
                   <button 
                     onClick={handleSaveWhatsapp}
                     className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold shadow transition flex items-center justify-center gap-2"
                   >
                      <ShieldCheck className="w-5 h-5" /> Salvar Configuração de API
                   </button>
                   <p className="text-xs text-center text-gray-400 mt-3">
                      * Certifique-se de configurar o Webhook na Evolution API apontando para cá (se estiver usando backend).
                   </p>
                </div>
             </div>
         </div>
      )}
    </div>
  );
};

export default SettingsScreen;
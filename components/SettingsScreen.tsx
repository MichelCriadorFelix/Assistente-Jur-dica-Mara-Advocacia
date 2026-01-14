import React, { useState, useEffect } from 'react';
import { Database, Key, Users, Save, Trash2, Plus, Bot } from 'lucide-react';
import { chatService } from '../services/chatService';
import { getAvailableApiKeys, testConnection, getAvailableApiKeysMap } from '../services/geminiService';
import { AppConfig, TeamMember } from '../types';
import { INITIAL_CONFIG, DEFAULT_TEAM } from '../constants';

const SettingsScreen: React.FC = () => {
  // Configuração Geral (Prompt + Team)
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  
  // API Keys States
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [workingModel, setWorkingModel] = useState<string>('');
  const [keysMap, setKeysMap] = useState<Record<string, string>>({});
  
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
    // Carregar Configurações de Equipe (simulado via localStorage para persistência simples neste demo)
    const savedTeam = localStorage.getItem('mara_team_config');
    if (savedTeam) {
      setConfig(prev => ({ ...prev, team: JSON.parse(savedTeam) }));
    } else {
       setConfig(prev => ({ ...prev, team: DEFAULT_TEAM }));
    }

    // Carregar Chaves
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);
    const sbk = localStorage.getItem('mara_supabase_key');
    if (sbk) setSbKey(sbk);
    const wm = localStorage.getItem('mara_working_model');
    if (wm) setWorkingModel(wm);

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
    // Atualiza também o prompt no localStorage para que a IA pegue os nomes novos
    // (Num app real, isso seria reconstruído no backend)
    alert('Equipe atualizada! A Mara agora conhece esses profissionais.');
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
        const wm = localStorage.getItem('mara_working_model');
        if (wm) setWorkingModel(wm);
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
      alert('Salvo! Recarregando...');
      window.location.reload();
    } else {
      localStorage.removeItem('mara_supabase_key');
      alert('Removido.');
      window.location.reload();
    }
  };

  const handleClearLocalData = () => {
    if (confirm("Apagar dados locais?")) {
      chatService.clearLocalData();
      alert("Limpo.");
      window.location.reload();
    }
  };

  const detectedKeysCount = Object.keys(keysMap).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      {/* SECTION 1: TEAM MANAGEMENT */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-l-4 border-blue-500">
        <div className="flex justify-between items-center mb-6">
           <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600" /> Equipe do Escritório
           </h2>
           <button onClick={handleSaveTeam} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium">
             <Save className="w-4 h-4" /> Salvar Equipe
           </button>
        </div>
        
        <p className="text-sm text-gray-500 mb-4">
          A Mara usará essas informações para direcionar os clientes corretamente. Mantenha atualizado.
        </p>

        <div className="space-y-3">
          {config.team.map((member) => (
            <div key={member.id} className="flex flex-col md:flex-row gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
               <div className="flex-1 w-full">
                 <label className="text-xs text-gray-400 font-bold uppercase">Nome</label>
                 <input 
                   type="text" 
                   value={member.name}
                   onChange={(e) => handleUpdateMember(member.id, 'name', e.target.value)}
                   className="w-full bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none text-gray-800 dark:text-gray-200 font-medium"
                 />
               </div>
               <div className="flex-1 w-full">
                 <label className="text-xs text-gray-400 font-bold uppercase">Função / Especialidade</label>
                 <input 
                   type="text" 
                   value={member.role}
                   onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                   className="w-full bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none text-sm text-gray-600 dark:text-gray-300"
                 />
               </div>
               <button 
                 onClick={() => handleRemoveMember(member.id)}
                 className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition"
                 title="Remover"
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

      {/* SECTION 2: AI SETTINGS */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-l-4 border-emerald-500">
        <h2 className="text-xl font-bold dark:text-white flex items-center gap-2 mb-4">
           <Bot className="w-6 h-6 text-emerald-600" /> Inteligência Artificial (Gemini)
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
             <div className={`p-3 mb-3 rounded text-sm font-mono border break-words ${testResult.includes('SUCESSO') ? 'bg-green-100 text-green-900 border-green-200' : 'bg-red-100 text-red-900 border-red-200'}`}>
               {testResult}
             </div>
           )}

           <div className="mb-4 text-xs text-gray-500">
              <p>Chaves disponíveis no ambiente:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.keys(keysMap).map((k) => (
                  <span key={k} className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-mono">{k}</span>
                ))}
              </div>
           </div>
        </div>
        
        <div className="flex gap-4 items-end">
           <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adicionar Chave Manualmente</label>
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

      {/* SECTION 3: DATABASE */}
      <div className="p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
          <Database className="w-5 h-5" /> Banco de Dados (Supabase)
        </h2>
        <div className="flex gap-4 items-end">
           <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave Anon</label>
              <input 
                type="password" 
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="Chave pública do Supabase"
                className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
              />
           </div>
           <button onClick={handleSaveSupabase} className="bg-blue-600 text-white px-4 py-2 rounded h-10 hover:bg-blue-700">
              Conectar
           </button>
        </div>
        <div className="mt-6 pt-6 border-t dark:border-gray-700 flex justify-end">
            <button onClick={handleClearLocalData} className="text-red-600 text-xs font-bold hover:underline">
               LIMPAR DADOS LOCAIS (RESET)
            </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
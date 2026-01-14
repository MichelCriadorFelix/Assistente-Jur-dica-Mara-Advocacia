import React, { useState, useEffect } from 'react';
import { Save, Database, Key, Trash2, CheckCircle, AlertTriangle, Cpu, ExternalLink, RefreshCw, Info } from 'lucide-react';
import { chatService } from '../services/chatService';
import { getAvailableApiKeys } from '../services/geminiService';

const SettingsScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [modelName, setModelName] = useState('gemini-2.0-flash');
  const [envKeysDetected, setEnvKeysDetected] = useState(0);
  
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
    // Carregar configurações manuais
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);

    const sbk = localStorage.getItem('mara_supabase_key');
    if (sbk) setSbKey(sbk);

    const mod = localStorage.getItem('mara_gemini_model');
    if (mod) setModelName(mod);

    // Verificar chaves do ambiente
    checkEnvKeys();
  }, []);

  const checkEnvKeys = () => {
    const keys = getAvailableApiKeys();
    // Filtra chaves que NÃO são do localStorage para saber se vieram do ambiente
    const local = localStorage.getItem('mara_gemini_api_key');
    const envOnly = keys.filter(k => k !== local);
    setEnvKeysDetected(envOnly.length);
  };

  const handleSaveApi = () => {
    if (apiKey.trim()) {
      localStorage.setItem('mara_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('mara_gemini_api_key');
    }
    
    if (modelName.trim()) {
      localStorage.setItem('mara_gemini_model', modelName.trim());
    } else {
      localStorage.setItem('mara_gemini_model', 'gemini-2.0-flash');
    }

    alert('Configurações salvas!');
    checkEnvKeys(); // Recalcula
  };

  const handleSaveSupabase = () => {
    if (sbKey.trim()) {
      localStorage.setItem('mara_supabase_key', sbKey.trim());
      localStorage.setItem('mara_supabase_url', sbUrlDisplay); 
      alert('Banco de Dados Conectado! A página será recarregada.');
      window.location.reload();
    } else {
      localStorage.removeItem('mara_supabase_key');
      alert('Banco desconectado. Voltando para modo Local.');
      window.location.reload();
    }
  };

  const handleClearLocalData = () => {
    if (confirm("Tem certeza? Isso apagará todas as conversas salvas LOCALMENTE neste navegador.")) {
      chatService.clearLocalData();
      alert("Dados limpos.");
      window.location.reload();
    }
  };

  const isSupabaseActive = !!localStorage.getItem('mara_supabase_key');

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      {/* SECTION 1: AI SETTINGS */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-l-4 border-emerald-500">
        <h2 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
          <Key className="w-6 h-6 text-emerald-600" /> 
          Chaves de API (Vercel & Manual)
        </h2>
        
        {/* Environment Status Indicator */}
        <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${envKeysDetected > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
           {envKeysDetected > 0 ? (
             <>
               <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
               <div>
                 <p className="font-bold text-sm">Conectado: {envKeysDetected} chave(s) detectada(s) do servidor.</p>
                 <p className="text-xs mt-1">O sistema encontrou suas chaves (API_KEY_1, VITE_API_KEY, etc) com sucesso.</p>
               </div>
             </>
           ) : (
             <>
               <AlertTriangle className="w-5 h-5 text-amber-500 mt-1" />
               <div>
                 <p className="font-bold text-sm">Nenhuma chave de ambiente visível.</p>
                 <p className="text-xs mt-1 leading-relaxed">
                   Se você definiu <code>API_KEY_1</code> na Vercel e ela não aparece aqui, é porque o Vite está bloqueando por segurança.
                   <br/><br/>
                   <strong>Solução:</strong> Renomeie na Vercel para <code>VITE_API_KEY_1</code>. 
                   <br/>
                   <em>(Pode ignorar o aviso da Vercel sobre "expor dados". Para este App funcionar no navegador, a chave PRECISA ser pública).</em>
                 </p>
               </div>
             </>
           )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Chave Manual (Opcional)
            </label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Só preencha se a Vercel falhar"
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
               <Cpu className="w-3 h-3"/> Modelo IA
            </label>
            <input 
              type="text" 
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Ex: gemini-2.0-flash"
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 gap-2">
            <button onClick={checkEnvKeys} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Verificar Novamente
            </button>
            <button onClick={handleSaveApi} className="bg-emerald-600 text-white px-6 py-2 rounded hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium shadow-sm">
              <Save className="w-4 h-4" /> Salvar
            </button>
        </div>
      </div>

      {/* SECTION 2: DATABASE */}
      <div className={`p-8 rounded-xl shadow-sm border transition-colors ${isSupabaseActive ? 'bg-white border-green-200 dark:bg-gray-800 dark:border-green-900' : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}>
        <h2 className="text-xl font-bold mb-6 dark:text-white flex items-center gap-2">
          <Database className={`w-5 h-5 ${isSupabaseActive ? 'text-green-600' : 'text-gray-400'}`} /> 
          Banco de Dados (Supabase)
        </h2>
        
        <div className="space-y-6">
          <div className={`p-4 rounded text-sm flex items-center gap-3 ${isSupabaseActive ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
             {isSupabaseActive ? <CheckCircle className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>}
             <div>
               <strong>Status:</strong> {isSupabaseActive ? 'Conectado' : 'Desconectado (Modo Local)'}
             </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Chave Supabase (anon)
            </label>
            <input 
              type="password" 
              value={sbKey}
              onChange={(e) => setSbKey(e.target.value)}
              placeholder="Cole aqui a chave 'anon'..."
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleSaveSupabase} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 flex items-center gap-2 shadow-sm font-medium text-sm">
              <Save className="w-4 h-4" /> 
              {isSupabaseActive ? 'Atualizar Conexão' : 'Conectar Banco'}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: DANGER ZONE */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30">
        <h2 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2">
          <Trash2 className="w-5 h-5" /> 
          Resetar Sistema
        </h2>
        <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
            Limpar todas as conversas e configurações salvas neste navegador.
            </p>
            <button onClick={handleClearLocalData} className="border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded transition text-xs font-bold uppercase tracking-wide">
            Limpar Tudo
            </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
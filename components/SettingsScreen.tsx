import React, { useState, useEffect } from 'react';
import { Save, Database, Key, Trash2, CheckCircle, AlertTriangle, Cpu, RefreshCw, Copy, Info, ExternalLink, Activity } from 'lucide-react';
import { chatService } from '../services/chatService';
import { getAvailableApiKeys, testConnection } from '../services/geminiService';

const SettingsScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [envKeysDetected, setEnvKeysDetected] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
    // Carregar configurações manuais
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);

    const sbk = localStorage.getItem('mara_supabase_key');
    if (sbk) setSbKey(sbk);

    checkEnvKeys();
  }, []);

  const checkEnvKeys = () => {
    const keys = getAvailableApiKeys();
    const local = localStorage.getItem('mara_gemini_api_key');
    const envOnly = keys.filter(k => k !== local);
    setEnvKeysDetected(envOnly.length);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await testConnection();
      if (result.success) {
        alert(`✅ SUCESSO ABSOLUTO!\n\nConectado usando: ${result.message}\nFinal da Chave: ...${result.keyUsed}`);
      } else {
        alert(`❌ FALHA GERAL:\n\n${result.message}`);
      }
    } catch (e) {
      alert("Erro crítico ao executar teste.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveApi = () => {
    if (apiKey.trim()) {
      localStorage.setItem('mara_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('mara_gemini_api_key');
    }
    
    // Força limpeza de configurações antigas que possam estar bugando
    localStorage.removeItem('mara_gemini_model');

    alert('Configurações salvas e cache limpo!');
    checkEnvKeys();
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

  const varsToDiagnose = [
    { name: "VITE_ux_config", val: (import.meta as any).env?.VITE_ux_config },
    { name: "VITE_APP_PARAM_1", val: (import.meta as any).env?.VITE_APP_PARAM_1 },
    { name: "VITE_APP_PARAM_2", val: (import.meta as any).env?.VITE_APP_PARAM_2 },
    { name: "VITE_APP_PARAM_3", val: (import.meta as any).env?.VITE_APP_PARAM_3 }, // Nova variável
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      {/* SECTION 1: AI SETTINGS */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-l-4 border-emerald-500">
        <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
            <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
            <Key className="w-6 h-6 text-emerald-600" /> 
            Chaves de API (Google Gemini)
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={handleTestConnection}
                disabled={isTesting}
                className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1 transition font-bold ${isTesting ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm'}`}
              >
                {isTesting ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Activity className="w-3 h-3"/>}
                {isTesting ? "Testando Chaves..." : "Testar Conexão Agora"}
              </button>
            </div>
        </div>
        
        <div className={`mb-6 p-4 rounded-lg border flex flex-col gap-3 ${envKeysDetected > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-600'}`}>
           <div className="flex items-start gap-3">
             {envKeysDetected > 0 ? <CheckCircle className="w-5 h-5 text-green-600 mt-1" /> : <AlertTriangle className="w-5 h-5 text-red-500 mt-1" />}
             <div>
               <p className="font-bold text-sm">Status: {envKeysDetected > 0 ? `${envKeysDetected} chaves carregadas do servidor (Vercel).` : "ERRO CRÍTICO: Nenhuma chave encontrada."}</p>
             </div>
           </div>

           <div className="bg-white/80 p-3 rounded text-xs font-mono space-y-1 mt-2 border border-gray-200">
              <p className="font-bold text-gray-500 mb-2 uppercase tracking-wide">Painel de Diagnóstico:</p>
              {varsToDiagnose.map(v => (
                <div key={v.name} className="flex justify-between border-b border-dashed border-gray-300 pb-1">
                  <span>{v.name}</span>
                  <span className={v.val ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                    {v.val ? `OK (...${v.val.slice(-4)})` : "MISSING"}
                  </span>
                </div>
              ))}
              <div className="pt-2 text-[10px] text-gray-500 italic flex flex-col gap-1 mt-2 bg-yellow-50 p-2 rounded border border-yellow-100">
                <p className="font-bold text-yellow-700"><Info className="w-3 h-3 inline"/> Motor de IA Ativo:</p>
                <p>Primário: <strong>gemini-2.0-flash</strong> (Versão mais atual)</p>
                <p>Backup: <strong>gemini-1.5-flash</strong> (Fallback de segurança)</p>
              </div>
           </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Forçar Chave Manual (Emergência)
            </label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole aqui apenas se as do servidor falharem"
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 gap-2">
            <button onClick={checkEnvKeys} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Atualizar Lista
            </button>
            <button onClick={handleSaveApi} className="bg-emerald-600 text-white px-6 py-2 rounded hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium shadow-sm">
              <Save className="w-4 h-4" /> Salvar & Reiniciar
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
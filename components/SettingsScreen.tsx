import React, { useState, useEffect } from 'react';
import { Save, Database, Key, Trash2, CheckCircle, AlertTriangle, RefreshCw, Info, Activity } from 'lucide-react';
import { chatService } from '../services/chatService';
import { getAvailableApiKeys, testConnection } from '../services/geminiService';

const SettingsScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [envKeysDetected, setEnvKeysDetected] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [workingModel, setWorkingModel] = useState<string>('');
  
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);

    const sbk = localStorage.getItem('mara_supabase_key');
    if (sbk) setSbKey(sbk);
    
    const wm = localStorage.getItem('mara_working_model');
    if (wm) setWorkingModel(wm);

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
    setTestResult('Diagnosticando chaves e modelos...');
    try {
      const result = await testConnection();
      if (result.success) {
        setTestResult(`✅ SUCESSO! ${result.message} | Chave: ...${result.keyUsed}`);
        // Atualiza a UI com o modelo descoberto
        const wm = localStorage.getItem('mara_working_model');
        if (wm) setWorkingModel(wm);
      } else {
        setTestResult(`❌ ERRO: ${result.message}`);
      }
    } catch (e: any) {
      setTestResult(`Erro Crítico: ${e.message}`);
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
    alert('Configurações salvas!');
    checkEnvKeys();
  };

  const handleSaveSupabase = () => {
    if (sbKey.trim()) {
      localStorage.setItem('mara_supabase_key', sbKey.trim());
      localStorage.setItem('mara_supabase_url', sbUrlDisplay); 
      alert('Banco conectado! Recarregando...');
      window.location.reload();
    } else {
      localStorage.removeItem('mara_supabase_key');
      alert('Banco desconectado.');
      window.location.reload();
    }
  };

  const handleClearLocalData = () => {
    if (confirm("Apagar dados locais?")) {
      chatService.clearLocalData();
      localStorage.removeItem('mara_working_model');
      alert("Limpo.");
      window.location.reload();
    }
  };

  const isSupabaseActive = !!localStorage.getItem('mara_supabase_key');

  const varsToDiagnose = [
    { name: "VITE_APP_PARAM_3", val: (import.meta as any).env?.VITE_APP_PARAM_3 },
    { name: "VITE_ux_config", val: (import.meta as any).env?.VITE_ux_config },
    { name: "VITE_APP_PARAM_1", val: (import.meta as any).env?.VITE_APP_PARAM_1 },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      {/* SECTION 1: AI SETTINGS */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-l-4 border-emerald-500">
        <h2 className="text-xl font-bold dark:text-white flex items-center gap-2 mb-4">
           <Key className="w-6 h-6 text-emerald-600" /> Chaves de API
        </h2>
        
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
           <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-gray-700 dark:text-gray-300">Diagnóstico de Conexão:</span>
              <button onClick={handleTestConnection} disabled={isTesting} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-bold shadow">
                {isTesting ? 'Buscando Modelo...' : 'Testar & Descobrir Modelo'}
              </button>
           </div>
           
           {testResult && (
             <div className={`p-3 mb-3 rounded text-sm font-mono border ${testResult.includes('SUCESSO') ? 'bg-green-100 text-green-900 border-green-200' : 'bg-red-100 text-red-900 border-red-200'}`}>
               {testResult}
             </div>
           )}

           <div className="space-y-1 text-xs font-mono text-gray-600 dark:text-gray-400">
              {varsToDiagnose.map(v => (
                <div key={v.name} className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-1">
                  <span>{v.name}</span>
                  <span className={v.val ? "text-green-600 font-bold" : "text-red-500"}>
                    {v.val ? `Encontrada (...${v.val.slice(-4)})` : "Não Encontrada"}
                  </span>
                </div>
              ))}
           </div>
           
           {workingModel && (
             <div className="mt-4 text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-100 flex items-center gap-2">
               <Activity className="w-4 h-4" />
               <span>Modelo Ativo: <strong>{workingModel}</strong> (Auto-Detectado)</span>
             </div>
           )}
        </div>
        
        <div className="flex gap-4 items-end">
           <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave Manual (Alternativa)</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
              />
           </div>
           <button onClick={handleSaveApi} className="bg-emerald-600 text-white px-4 py-2 rounded h-10 hover:bg-emerald-700">
              Salvar
           </button>
        </div>
      </div>

      {/* SECTION 2: DATABASE */}
      <div className={`p-8 rounded-xl shadow-sm border transition-colors ${isSupabaseActive ? 'bg-white border-green-200 dark:bg-gray-800' : 'bg-white border-gray-200 dark:bg-gray-800'}`}>
        <h2 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
          <Database className="w-5 h-5" /> Banco de Dados
        </h2>
        <div className="flex gap-4 items-end">
           <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave Supabase (Anon)</label>
              <input 
                type="password" 
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="eyJ..."
                className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
              />
           </div>
           <button onClick={handleSaveSupabase} className="bg-blue-600 text-white px-4 py-2 rounded h-10 hover:bg-blue-700">
              {isSupabaseActive ? 'Atualizar' : 'Conectar'}
           </button>
        </div>
      </div>

      {/* SECTION 3: DANGER ZONE */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border border-red-100">
        <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400 text-sm">Problemas com o chat?</span>
            <button onClick={handleClearLocalData} className="text-red-600 border border-red-200 px-3 py-1 rounded text-xs font-bold hover:bg-red-50">
               LIMPAR DADOS LOCAIS
            </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
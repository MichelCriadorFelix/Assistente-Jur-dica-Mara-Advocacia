import React, { useState, useEffect } from 'react';
import { Database, Key, Activity, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { chatService } from '../services/chatService';
import { getAvailableApiKeys, testConnection, getAvailableApiKeysMap } from '../services/geminiService';

const SettingsScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [workingModel, setWorkingModel] = useState<string>('');
  const [keysMap, setKeysMap] = useState<Record<string, string>>({});
  
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
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

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult('Testando chaves...');
    localStorage.removeItem('mara_working_model'); 
    
    try {
      const result = await testConnection();
      if (result.success) {
        setTestResult(`✅ SUCESSO! ${result.message} (Chave final ...${result.keyUsed})`);
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

  const handleResetModel = () => {
    localStorage.removeItem('mara_working_model');
    setWorkingModel('');
    alert('Resetado.');
  };

  const handleSaveApi = () => {
    if (apiKey.trim()) {
      localStorage.setItem('mara_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('mara_gemini_api_key');
    }
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
      localStorage.removeItem('mara_working_model');
      alert("Limpo.");
      window.location.reload();
    }
  };

  const isSupabaseActive = !!localStorage.getItem('mara_supabase_key');
  const detectedKeysCount = Object.keys(keysMap).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      {/* SECTION 1: AI SETTINGS */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-l-4 border-emerald-500">
        <h2 className="text-xl font-bold dark:text-white flex items-center gap-2 mb-4">
           <Key className="w-6 h-6 text-emerald-600" /> Diagnóstico de API (Gemini)
        </h2>
        
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
           <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-gray-700 dark:text-gray-300">
                {detectedKeysCount} Chave(s) Detectada(s)
              </span>
              <button onClick={handleTestConnection} disabled={isTesting} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-bold shadow">
                {isTesting ? 'Testando...' : 'Testar Conexão'}
              </button>
           </div>
           
           {testResult && (
             <div className={`p-3 mb-3 rounded text-sm font-mono border break-words ${testResult.includes('SUCESSO') ? 'bg-green-100 text-green-900 border-green-200' : 'bg-red-100 text-red-900 border-red-200'}`}>
               {testResult}
             </div>
           )}

           <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">Variáveis de Ambiente Detectadas:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(keysMap).map(([name, val], i) => (
                  <div key={i} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded font-mono flex justify-between">
                    <span className="font-bold">{name}</span>
                    <span className="opacity-70">...{val.slice(-4)}</span>
                  </div>
                ))}
              </div>
           </div>
           
           {workingModel && (
             <div className="flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-100">
               <span>Modelo Ativo: <strong>{workingModel}</strong></span>
               <button onClick={handleResetModel} className="underline">Resetar</button>
             </div>
           )}
        </div>
        
        <div className="flex gap-4 items-end opacity-60 hover:opacity-100 transition-opacity">
           <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entrada Manual (Prioritária)</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole uma chave AIza aqui para teste rápido..."
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
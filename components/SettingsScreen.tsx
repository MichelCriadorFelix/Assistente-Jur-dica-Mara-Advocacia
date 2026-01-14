import React, { useState, useEffect } from 'react';
import { Save, Database, Key, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { chatService } from '../services/chatService';

const SettingsScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [sbKey, setSbKey] = useState('');
  
  // URL já vem hardcoded do services/supabaseClient.ts, mas mostramos aqui apenas para confirmação visual
  const sbUrlDisplay = 'https://drcxpekguouqsoinaoeb.supabase.co';

  useEffect(() => {
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);

    const sbk = localStorage.getItem('mara_supabase_key');
    if (sbk) setSbKey(sbk);
  }, []);

  const handleSaveApi = () => {
    if (apiKey.trim()) {
      localStorage.setItem('mara_gemini_api_key', apiKey.trim());
      alert('Chave de IA salva com sucesso!');
    } else {
      localStorage.removeItem('mara_gemini_api_key');
    }
  };

  const handleSaveSupabase = () => {
    if (sbKey.trim()) {
      // Salva apenas a KEY, pois a URL já está fixa no código
      localStorage.setItem('mara_supabase_key', sbKey.trim());
      // Opcional: Salva a URL também caso o código mude no futuro, mas o hardcoded tem prioridade
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
      
      {/* SECTION 1: DATABASE */}
      <div className={`p-8 rounded-xl shadow-sm border transition-colors ${isSupabaseActive ? 'bg-white border-green-200 dark:bg-gray-800 dark:border-green-900' : 'bg-white border-yellow-200 dark:bg-gray-800 dark:border-yellow-900'}`}>
        <h2 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
          <Database className={`w-6 h-6 ${isSupabaseActive ? 'text-green-600' : 'text-yellow-500'}`} /> 
          Banco de Dados (Supabase)
        </h2>
        
        <div className="space-y-6">
          <div className={`p-4 rounded text-sm flex items-center gap-3 ${isSupabaseActive ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200' : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'}`}>
             {isSupabaseActive ? <CheckCircle className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>}
             <div>
               <strong>Status:</strong> {isSupabaseActive ? 'Conectado e Operacional' : 'Modo Offline (Local)'}
               <p className="text-xs opacity-80 mt-1">
                 {isSupabaseActive 
                   ? 'Seus leads estão sendo salvos na nuvem.' 
                   : 'ATENÇÃO: Os dados estão salvos apenas no seu navegador. Conecte o Supabase para persistência real.'}
               </p>
             </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL do Projeto (Detectada)</label>
            <input 
              type="text" 
              value={sbUrlDisplay}
              disabled
              className="w-full p-2 border rounded bg-gray-100 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Chave API (anon public)
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input 
              type="password" 
              value={sbKey}
              onChange={(e) => setSbKey(e.target.value)}
              placeholder="Cole aqui a chave 'anon' do Supabase..."
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Encontrada em: Supabase Dashboard &gt; Project Settings &gt; API</p>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleSaveSupabase} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 flex items-center gap-2 shadow-sm font-medium">
              <Save className="w-4 h-4" /> 
              {isSupabaseActive ? 'Atualizar Conexão' : 'Conectar Agora'}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: AI KEYS */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border dark:border-gray-700 opacity-80 hover:opacity-100 transition-opacity">
        <h2 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
          <Key className="w-5 h-5 text-gray-400" /> 
          Chave da IA (Opcional)
        </h2>
        
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm">
             O sistema já possui chaves configuradas internamente. Use este campo apenas se desejar substituir pela sua própria chave pessoal do Google AI Studio.
          </p>
          <div className="flex gap-2">
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy... (Deixe vazio para usar a padrão)"
              className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
            />
            <button onClick={handleSaveApi} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm">
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: DANGER ZONE */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30">
        <h2 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2">
          <Trash2 className="w-5 h-5" /> 
          Limpar Cache Local
        </h2>
        <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
            Se o app estiver lento ou com dados antigos presos no navegador.
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
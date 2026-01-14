import React, { useState, useEffect } from 'react';
import { Save, Database, Key, Trash2 } from 'lucide-react';
import { chatService } from '../services/chatService';

const SettingsScreen: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');

  useEffect(() => {
    const k = localStorage.getItem('mara_gemini_api_key');
    if (k) setApiKey(k);

    const sbu = localStorage.getItem('mara_supabase_url');
    if (sbu) setSbUrl(sbu);

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
    if (sbUrl.trim() && sbKey.trim()) {
      localStorage.setItem('mara_supabase_url', sbUrl.trim());
      localStorage.setItem('mara_supabase_key', sbKey.trim());
      alert('Configurações do Supabase salvas! Recarregue a página.');
      window.location.reload();
    } else {
      localStorage.removeItem('mara_supabase_url');
      localStorage.removeItem('mara_supabase_key');
      alert('Configurações do Supabase removidas. Usando modo Local.');
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border dark:border-gray-700">
        <h2 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
          <Key className="w-6 h-6 text-emerald-600" /> 
          Configuração da IA (Gemini)
        </h2>
        
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            O sistema rotaciona automaticamente entre chaves configuradas. Se quiser forçar uma chave específica (pessoal), insira abaixo.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave de API Personalizada</label>
            <div className="flex gap-2">
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <button onClick={handleSaveApi} className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 flex items-center gap-2">
                <Save className="w-4 h-4" /> Salvar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border dark:border-gray-700">
        <h2 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-600" /> 
          Banco de Dados (Opcional)
        </h2>
        
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded text-sm text-blue-800 dark:text-blue-200">
            <strong>Status Atual:</strong> {localStorage.getItem('mara_supabase_url') ? 'Configurado (Supabase)' : 'Modo Local (Offline)'}
            <br/>
            Se não configurar o Supabase, os dados ficam salvos apenas neste navegador.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL do Projeto Supabase</label>
            <input 
              type="text" 
              value={sbUrl}
              onChange={(e) => setSbUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave Pública (Anon Key)</label>
            <input 
              type="password" 
              value={sbKey}
              onChange={(e) => setSbKey(e.target.value)}
              placeholder="eyJ..."
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleSaveSupabase} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Save className="w-4 h-4" /> Salvar Conexão
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30">
        <h2 className="text-xl font-bold mb-4 text-red-600 flex items-center gap-2">
          <Trash2 className="w-5 h-5" /> 
          Zona de Perigo
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Isso apagará todos os contatos e mensagens criados no Modo Local. Não afeta o Supabase se estiver conectado.
        </p>
        <button onClick={handleClearLocalData} className="border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded transition text-sm font-medium">
          Limpar Dados Locais
        </button>
      </div>
    </div>
  );
};

export default SettingsScreen;
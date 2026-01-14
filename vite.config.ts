import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega TODAS as variáveis de ambiente disponíveis no sistema
  const env = loadEnv(mode, process.cwd(), '');

  // Objeto que será injetado no código cliente
  const processEnv: Record<string, string> = {};

  // Copia QUALQUER variável que pareça uma chave importante
  // Isso resolve o problema da API_KEY_5 não aparecer se não tiver prefixo VITE_
  Object.keys(env).forEach(key => {
    // Filtro permissivo: Pega tudo que tem KEY, API, GEMINI, GOOGLE ou comece com VITE_
    if (
      key.includes('KEY') || 
      key.includes('API') || 
      key.includes('GEMINI') || 
      key.includes('GOOGLE') || 
      key.startsWith('VITE_') ||
      key.startsWith('NEXT_PUBLIC_') // Compatibilidade
    ) {
      processEnv[key] = env[key];
    }
  });

  console.log("Variáveis injetadas no Build:", Object.keys(processEnv));

  return {
    plugins: [react()],
    define: {
      // Substitui globalmente 'process.env' pelo objeto filtrado
      'process.env': JSON.stringify(processEnv),
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'lucide-react'],
            'vendor-google': ['@google/genai'],
            'vendor-supabase': ['@supabase/supabase-js']
          }
        }
      }
    }
  };
});
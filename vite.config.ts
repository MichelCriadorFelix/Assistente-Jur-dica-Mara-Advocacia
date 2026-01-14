import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega todas as variáveis de ambiente, ignorando o prefixo padrão
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // HACK: Força a injeção de variáveis comuns que o usuário pode ter criado sem 'VITE_'
      // Isso garante que se você criou 'API_KEY' ou 'GOOGLE_API_KEY', o app vai ler.
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.GOOGLE_API_KEY': JSON.stringify(env.GOOGLE_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
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
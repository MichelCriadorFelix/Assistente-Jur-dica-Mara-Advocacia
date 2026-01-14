import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 1. Carrega TODAS as variáveis do sistema/Vercel
  const env = loadEnv(mode, process.cwd(), '');

  // 2. Filtra apenas as que nos interessam (Segurança: não expor chaves da AWS ou banco sem querer)
  // Aceita: API_KEY, API_KEY_1, API_KEY_50, GOOGLE_API_KEY, GEMINI_KEY, etc.
  const safeEnv: Record<string, string> = {};
  
  Object.keys(env).forEach(key => {
    if (
      key.startsWith('API_') || 
      key.startsWith('GOOGLE_') || 
      key.startsWith('GEMINI_') ||
      key.startsWith('VITE_') // Mantém compatibilidade caso sobre alguma antiga
    ) {
      safeEnv[key] = env[key];
    }
  });

  return {
    plugins: [react()],
    define: {
      // 3. Injeta esse objeto filtrado no código do navegador
      // Isso faz com que 'process.env.API_KEY_1' funcione magicamente!
      'process.env': JSON.stringify(safeEnv),
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
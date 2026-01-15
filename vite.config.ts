import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // INJEÇÃO BRUTA E EXPLÍCITA DAS CHAVES
      // Isso garante que o Vite substitua "process.env.API_KEY_X" pelo valor real da Vercel
      'process.env.API_KEY_1': JSON.stringify(env.API_KEY_1 || ''),
      'process.env.API_KEY_2': JSON.stringify(env.API_KEY_2 || ''),
      'process.env.API_KEY_3': JSON.stringify(env.API_KEY_3 || ''),
      'process.env.API_KEY_4': JSON.stringify(env.API_KEY_4 || ''),
      'process.env.API_KEY_5': JSON.stringify(env.API_KEY_5 || ''),
      'process.env.API_KEY_6': JSON.stringify(env.API_KEY_6 || ''),
      'process.env.API_KEY_7': JSON.stringify(env.API_KEY_7 || ''),
      'process.env.API_KEY_8': JSON.stringify(env.API_KEY_8 || ''),
      'process.env.API_KEY_9': JSON.stringify(env.API_KEY_9 || ''),
      'process.env.API_KEY_10': JSON.stringify(env.API_KEY_10 || ''),
      
      // Fallback para chaves antigas ou com prefixo VITE
      'process.env': JSON.stringify({
        ...env, // Tenta passar tudo que for possível
        NODE_ENV: mode
      }),
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'lucide-react'],
            'vendor-google': ['@google/genai'],
          }
        }
      }
    }
  };
});
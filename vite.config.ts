import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Aumenta o limite do aviso para 1000kb (1MB) para silenciar o alerta na Vercel
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Força a separação das bibliotecas pesadas em arquivos distintos
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'lucide-react'],
          'vendor-google': ['@google/genai'],
          'vendor-supabase': ['@supabase/supabase-js']
        }
      }
    }
  }
});
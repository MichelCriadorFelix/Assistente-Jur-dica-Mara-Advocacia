import { createClient } from '@supabase/supabase-js';

// Helper to safely get env vars across different environments (Vite, Next.js, CRA)
const getEnvVar = (key: string, prefixlessKey?: string) => {
  // 1. Try Vite's import.meta.env
  // Fix TS error: Property 'env' does not exist on type 'ImportMeta'
  const metaEnv = (import.meta as any).env;
  
  if (typeof import.meta !== 'undefined' && metaEnv) {
    // Check specific key
    if (metaEnv[key]) return metaEnv[key];
    // Check VITE_ prefix version if looking for generic
    if (prefixlessKey && metaEnv[`VITE_${prefixlessKey}`]) return metaEnv[`VITE_${prefixlessKey}`];
  }

  // 2. Try process.env (Node/Next.js/CRA)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key];
    if (prefixlessKey) {
       // Check common prefixes
       if (process.env[`NEXT_PUBLIC_${prefixlessKey}`]) return process.env[`NEXT_PUBLIC_${prefixlessKey}`];
       if (process.env[`REACT_APP_${prefixlessKey}`]) return process.env[`REACT_APP_${prefixlessKey}`];
       if (process.env[`VITE_${prefixlessKey}`]) return process.env[`VITE_${prefixlessKey}`];
    }
  }
  
  return undefined;
};

// Attempt to find the URL and Key using various naming conventions
const supabaseUrl = 
  getEnvVar('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL') || 
  getEnvVar('VITE_SUPABASE_URL') || 
  getEnvVar('REACT_APP_SUPABASE_URL');

const supabaseAnonKey = 
  getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY') || 
  getEnvVar('VITE_SUPABASE_ANON_KEY') || 
  getEnvVar('REACT_APP_SUPABASE_ANON_KEY');

// Log guidance if missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "%c[Supabase] Erro Crítico: Credenciais não encontradas.", 
    "color: red; font-weight: bold; font-size: 14px"
  );
  console.warn(
    "DICA DE IMPLANTAÇÃO: Se estiver usando Vercel com Vite, renomeie suas variáveis de ambiente para começar com 'VITE_'. Ex: 'VITE_SUPABASE_URL'."
  );
}

// Prevent app crash by using fallback if keys are missing
// This allows the UI to load (even if DB calls fail later)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);
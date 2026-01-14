import { createClient } from '@supabase/supabase-js';

// Helper to check for manual overrides in LocalStorage (set via UI)
const getLocalConfig = (key: string) => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

// Access variables prioritizing Vercel/Supabase integration naming
const getSupabaseUrl = () => {
  // 1. Manual Override
  const local = getLocalConfig('mara_supabase_url');
  if (local) return local;

  // 2. Hardcoded Fallback from your screenshot (Guarantee connection)
  const hardcodedUrl = 'https://drcxpekguouqsoinaoeb.supabase.co';
  
  // 3. Env Vars
  // Check import.meta.env (Vite) and window.process.env (Vercel injection sometimes ends up here)
  const envs = [
    (import.meta as any).env,
    (window as any).process?.env
  ];

  for (const env of envs) {
     if (!env) continue;
     if (env.NEXT_PUBLIC_SUPABASE_URL) return env.NEXT_PUBLIC_SUPABASE_URL;
     if (env.VITE_SUPABASE_URL) return env.VITE_SUPABASE_URL;
  }

  return hardcodedUrl;
};

const getSupabaseKey = () => {
  // 1. Manual Override
  const local = getLocalConfig('mara_supabase_key');
  if (local) return local;

  // 2. Env Vars
  const envs = [
    (import.meta as any).env,
    (window as any).process?.env
  ];

  for (const env of envs) {
     if (!env) continue;
     if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
     if (env.VITE_SUPABASE_ANON_KEY) return env.VITE_SUPABASE_ANON_KEY;
     // Sometimes Vercel pulls it as just 'SUPABASE_ANON_KEY' in backend contexts, but we check anyway
  }
  
  // Se não encontrar a chave ANON, retornamos vazio para forçar o isSupabaseConfigured a ser falso
  // e cair no modo LocalStorage, evitando que o app quebre tentando conectar sem chave.
  return '';
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseKey();

// Check if configured to avoid network errors
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder') && supabaseAnonKey.length > 10);

if (!isSupabaseConfigured) {
  console.log("Supabase Offline: Usando modo LocalStorage. (URL OK, mas Chave Anon não encontrada nas variáveis)");
} else {
  console.log("Supabase Conectado:", supabaseUrl);
}

// Fallback to avoid crash during initialization
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
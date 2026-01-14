import { createClient } from '@supabase/supabase-js';

// Helper to check for manual overrides in LocalStorage (set via UI)
const getLocalConfig = (key: string) => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

const getSupabaseUrl = () => {
  // 1. Manual Override
  const local = getLocalConfig('mara_supabase_url');
  if (local) return local;

  // 2. SUA URL DO SUPABASE (Fixa conforme print)
  return 'https://drcxpekguouqsoinaoeb.supabase.co';
};

const getSupabaseKey = () => {
  // 1. Manual Override (Configurada na tela de Configurações)
  const local = getLocalConfig('mara_supabase_key');
  if (local) return local;

  // 2. Env Vars (Vercel)
  const envs = [
    (import.meta as any).env,
    (window as any).process?.env
  ];

  for (const env of envs) {
     if (!env) continue;
     if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
     if (env.VITE_SUPABASE_ANON_KEY) return env.VITE_SUPABASE_ANON_KEY;
  }
  
  return '';
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseKey();

// Check if configured to avoid network errors
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder') && supabaseAnonKey.length > 10);

if (!isSupabaseConfigured) {
  console.log("Supabase Parcialmente Configurado: URL encontrada, mas falta a CHAVE ANON.");
} else {
  console.log("Supabase Conectado:", supabaseUrl);
}

// Fallback to avoid crash during initialization
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
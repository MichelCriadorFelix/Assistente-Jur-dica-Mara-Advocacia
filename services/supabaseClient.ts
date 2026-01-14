import { createClient } from '@supabase/supabase-js';

// Helper to check for manual overrides in LocalStorage (set via UI)
const getLocalConfig = (key: string) => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

// EXPLICIT ACCESS to variables as seen in your Vercel Screenshots
const getSupabaseUrl = () => {
  // 1. Manual Override
  const local = getLocalConfig('mara_supabase_url');
  if (local) return local;

  // 2. Vite Access (import.meta.env)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    // Your screenshot specifically shows NEXT_PUBLIC_SUPABASE_URL
    if (env.NEXT_PUBLIC_SUPABASE_URL) return env.NEXT_PUBLIC_SUPABASE_URL;
    if (env.VITE_SUPABASE_URL) return env.VITE_SUPABASE_URL;
  }
  return '';
};

const getSupabaseKey = () => {
  // 1. Manual Override
  const local = getLocalConfig('mara_supabase_key');
  if (local) return local;

  // 2. Vite Access (import.meta.env)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    // Your screenshot specifically shows NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (env.SUPABASE_ANON_KEY) return env.SUPABASE_ANON_KEY;
  }
  return '';
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseKey();

// Check if configured to avoid network errors
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'));

if (!isSupabaseConfigured) {
  console.warn("Supabase não configurado corretamente. Verifique as variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

// Fallback to avoid crash during initialization
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
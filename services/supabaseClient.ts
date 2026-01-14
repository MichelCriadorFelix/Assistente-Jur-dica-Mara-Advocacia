import { createClient } from '@supabase/supabase-js';

// Helper para ler configurações
const getEnvVar = (key: string) => {
  // 1. Tenta ler do import.meta.env (Vite standard)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  // 2. Tenta ler do process.env (Vercel/Node fallback)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

// Configuração Automática
const getSupabaseUrl = () => {
  // Prioridade: Configuração LocalStorage (Manual) > VITE > NEXT_PUBLIC (Vercel Default)
  const local = typeof window !== 'undefined' ? localStorage.getItem('mara_supabase_url') : null;
  if (local) return local;

  return getEnvVar('VITE_SUPABASE_URL') || getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
};

const getSupabaseKey = () => {
  const local = typeof window !== 'undefined' ? localStorage.getItem('mara_supabase_key') : null;
  if (local) return local;

  return getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseKey();

// Validação de segurança e conexão
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

if (!isSupabaseConfigured) {
  console.warn("⚠️ Supabase não detectado automaticamente. O app funcionará em modo LOCAL (apenas no navegador).");
  console.log("Verifique se as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão definidas no Vercel.");
} else {
  console.log("✅ Supabase Conectado via Variáveis de Ambiente.");
}

// Cliente Supabase (usa placeholder se não configurado para não quebrar o app)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
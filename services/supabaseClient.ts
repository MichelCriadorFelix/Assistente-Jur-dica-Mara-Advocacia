import { createClient } from '@supabase/supabase-js';

// Helper para ler configurações
const getEnvVar = (key: string) => {
  // 1. Tenta ler do process.env (Injetado pelo Vite define)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  // 2. Tenta ler do import.meta.env (Vite standard)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  return '';
};

// Configuração Automática
const getSupabaseUrl = () => {
  // Prioridade 1: Manual (LocalStorage) - caso o usuário queira sobrescrever
  const local = typeof window !== 'undefined' ? localStorage.getItem('mara_supabase_url') : null;
  if (local) return local;

  // Prioridade 2: Variável Injetada (Vite Config tratou de unificar os nomes)
  return getEnvVar('VITE_SUPABASE_URL');
};

const getSupabaseKey = () => {
  const local = typeof window !== 'undefined' ? localStorage.getItem('mara_supabase_key') : null;
  if (local) return local;

  return getEnvVar('VITE_SUPABASE_ANON_KEY');
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseKey();

// Validação de segurança e conexão
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

if (!isSupabaseConfigured) {
  console.warn("⚠️ Supabase não detectado automaticamente. O app funcionará em modo LOCAL (apenas no navegador).");
} else {
  // Log discreto para debug
  const maskedUrl = supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : 'N/A';
  console.log(`✅ Supabase Conectado Automaticamente: ${maskedUrl}`);
}

// Cliente Supabase (usa placeholder se não configurado para não quebrar o app)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);
import { createClient } from '@supabase/supabase-js';

// Helper function to safely read environment variables across different build systems (Vite, Next, Create React App)
const getEnvVar = (key: string, prefixlessKey?: string): string | undefined => {
  let value: string | undefined;

  // 1. Try standard process.env (Next.js / CRA / Node)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) value = process.env[key];
    // Check common prefixes if direct key fails
    if (!value && prefixlessKey) {
      if (process.env[`NEXT_PUBLIC_${prefixlessKey}`]) value = process.env[`NEXT_PUBLIC_${prefixlessKey}`];
      else if (process.env[`VITE_${prefixlessKey}`]) value = process.env[`VITE_${prefixlessKey}`];
      else if (process.env[`REACT_APP_${prefixlessKey}`]) value = process.env[`REACT_APP_${prefixlessKey}`];
    }
  }

  // 2. Try Vite's import.meta.env (if process.env failed)
  if (!value && typeof import.meta !== 'undefined') {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      if (metaEnv[key]) value = metaEnv[key];
      if (!value && prefixlessKey) {
        if (metaEnv[`VITE_${prefixlessKey}`]) value = metaEnv[`VITE_${prefixlessKey}`];
        else if (metaEnv[`NEXT_PUBLIC_${prefixlessKey}`]) value = metaEnv[`NEXT_PUBLIC_${prefixlessKey}`];
      }
    }
  }

  return value;
};

// Specifically look for the variables shown in your Vercel screenshots
const supabaseUrl = 
  getEnvVar('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');

const supabaseAnonKey = 
  getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY') ||
  getEnvVar('SUPABASE_PUBLISHABLE_KEY') || // Matches your Vercel Screenshot
  getEnvVar('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'); 

// Fallback values to prevent "supabaseUrl is required" crash
const finalUrl = supabaseUrl || 'https://placeholder.supabase.co';
const finalKey = supabaseAnonKey || 'placeholder';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "%c[Supabase Warning] Credenciais não encontradas. Verifique se 'NEXT_PUBLIC_SUPABASE_URL' está definido na Vercel.", 
    "color: orange; font-weight: bold;"
  );
}

export const supabase = createClient(finalUrl, finalKey);
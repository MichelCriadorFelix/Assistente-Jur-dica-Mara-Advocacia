import { createClient } from '@supabase/supabase-js';

// Vercel Environment Variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Check your Vercel Environment Variables.");
}

export const supabase = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || ''
);
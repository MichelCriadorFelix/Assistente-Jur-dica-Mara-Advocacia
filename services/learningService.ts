import { supabase, isSupabaseConfigured } from './supabaseClient';
import { AiMemory } from '../types';

const LOCAL_MEM_KEY = 'mara_ai_memory';

export const learningService = {
  
  // Adiciona um novo conhecimento à base
  addMemory: async (content: string, category: AiMemory['category']): Promise<void> => {
    console.log(`[Mara Learning] Memorizando: ${content} (${category})`);

    if (!isSupabaseConfigured) {
      const currentMemories = learningService.getLocalMemories();
      const newMemory: AiMemory = {
        id: Date.now().toString(),
        content,
        category,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem(LOCAL_MEM_KEY, JSON.stringify([...currentMemories, newMemory]));
      return;
    }

    // Se tiver Supabase, salva na tabela 'ai_knowledge' (precisa criar no SQL)
    await supabase.from('ai_knowledge').insert([{
      content,
      category,
      created_at: new Date().toISOString()
    }]);
  },

  // Recupera todo o conhecimento acumulado para injetar no prompt
  getAllMemories: async (): Promise<AiMemory[]> => {
    if (!isSupabaseConfigured) {
      return learningService.getLocalMemories();
    }

    const { data, error } = await supabase
      .from('ai_knowledge')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !data) return learningService.getLocalMemories(); // Fallback

    return data.map((row: any) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      createdAt: row.created_at
    }));
  },

  // Helper local
  getLocalMemories: (): AiMemory[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(LOCAL_MEM_KEY);
    return data ? JSON.parse(data) : [];
  },

  clearMemory: () => {
    localStorage.removeItem(LOCAL_MEM_KEY);
  }
};
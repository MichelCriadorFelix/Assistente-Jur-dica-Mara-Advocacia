import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Message, Contact } from '../types';

// === SISTEMA DE BANCO DE DADOS LOCAL (FALLBACK) ===
const LOCAL_STORAGE_KEY = 'mara_local_db';

interface LocalDB {
  contacts: Contact[];
  messages: Record<string, Message[]>; 
}

const getLocalDB = (): LocalDB => {
  if (typeof window === 'undefined') return { contacts: [], messages: {} };
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : { contacts: [], messages: {} };
};

const saveLocalDB = (db: LocalDB) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
  }
};

const mapDbContact = (row: any): Contact => ({
  id: row.id,
  name: row.name,
  lastMessage: row.last_message,
  time: new Date(row.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  avatar: row.avatar,
  unreadCount: row.unread_count,
  status: row.status as any,
  caseStatus: row.case_status || '',
  legalSummary: row.legal_summary || '', // Mapeia o novo campo
  aiPaused: row.ai_paused || false
});

const mapDbMessage = (row: any): Message => ({
  id: row.id,
  role: row.role as 'user' | 'model',
  content: row.content,
  type: row.type as 'text' | 'audio',
  timestamp: new Date(row.created_at),
  audioUrl: row.audio_url
});

export const chatService = {
  
  getOrCreateContact: async (contactId: string | null): Promise<string> => {
    if (!isSupabaseConfigured) {
      const db = getLocalDB();
      if (contactId && db.contacts.find(c => c.id === contactId)) return contactId;

      const newContact: Contact = {
        id: 'local-' + Date.now(),
        name: 'Novo Cliente',
        lastMessage: 'Iniciou conversa',
        time: new Date().toLocaleTimeString(),
        avatar: `https://ui-avatars.com/api/?name=Cliente&background=random`,
        unreadCount: 0,
        status: 'new',
        aiPaused: false
      };
      
      db.contacts.unshift(newContact);
      db.messages[newContact.id] = [];
      saveLocalDB(db);
      return newContact.id;
    }

    if (contactId && !contactId.startsWith('local-')) {
       const { data } = await supabase.from('contacts').select('id').eq('id', contactId).single();
       if (data) return data.id;
    }

    const { data, error } = await supabase.from('contacts').insert([{
       name: 'Novo Cliente',
       last_message: 'Iniciou conversa',
       avatar: `https://ui-avatars.com/api/?name=User&background=random`
    }]).select().single();

    if (error) throw error;
    return data.id;
  },

  getContactDetails: async (contactId: string): Promise<Contact | null> => {
     if (!isSupabaseConfigured || contactId.startsWith('local-')) {
       return getLocalDB().contacts.find(c => c.id === contactId) || null;
     }
     const { data, error } = await supabase.from('contacts').select('*').eq('id', contactId).single();
     if (error || !data) return null;
     return mapDbContact(data);
  },

  loadMessages: async (contactId: string): Promise<Message[]> => {
    if (!isSupabaseConfigured || contactId.startsWith('local-')) {
      const db = getLocalDB();
      const msgs = db.messages[contactId] || [];
      return msgs.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    }

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });
    
    return data ? data.map(mapDbMessage) : [];
  },

  saveMessage: async (contactId: string, message: Partial<Message>) => {
    if (!isSupabaseConfigured || contactId.startsWith('local-')) {
       const db = getLocalDB();
       const newMessage: Message = {
         id: message.id || Date.now().toString(),
         role: message.role!,
         content: message.content || '',
         type: message.type || 'text',
         timestamp: new Date(),
         audioUrl: message.audioUrl
       };
       if (!db.messages[contactId]) db.messages[contactId] = [];
       db.messages[contactId].push(newMessage);
       
       const idx = db.contacts.findIndex(c => c.id === contactId);
       if (idx >= 0) {
         db.contacts[idx].lastMessage = message.type === 'audio' ? '🎵 Áudio' : (message.content || '');
         db.contacts[idx].time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
         const c = db.contacts.splice(idx, 1)[0];
         db.contacts.unshift(c);
       }
       saveLocalDB(db);
       return;
    }

    await supabase.from('messages').insert([{
      contact_id: contactId,
      role: message.role,
      content: message.content,
      type: message.type || 'text',
      audio_url: message.audioUrl
    }]);

    await supabase.from('contacts').update({
      last_message: message.type === 'audio' ? '🎵 Áudio' : message.content,
      updated_at: new Date().toISOString(),
      unread_count: 0
    }).eq('id', contactId);
  },

  updateContactStatus: async (contactId: string, status: string, name?: string, legalSummary?: string) => {
     const updateData: any = { status };
     if (name) updateData.name = name;
     if (legalSummary) updateData.legal_summary = legalSummary;

     if (!isSupabaseConfigured || contactId.startsWith('local-')) {
        const db = getLocalDB();
        const contact = db.contacts.find(c => c.id === contactId);
        if (contact) {
          Object.assign(contact, updateData);
          saveLocalDB(db);
        }
        return;
     }
     await supabase.from('contacts').update(updateData).eq('id', contactId);
  },

  updateCaseStatus: async (contactId: string, notes: string) => {
    if (!isSupabaseConfigured || contactId.startsWith('local-')) {
       const db = getLocalDB();
       const contact = db.contacts.find(c => c.id === contactId);
       if (contact) {
         contact.caseStatus = notes;
         saveLocalDB(db);
       }
       return;
    }
    await supabase.from('contacts').update({ case_status: notes }).eq('id', contactId);
  },

  toggleAiStatus: async (contactId: string, paused: boolean) => {
    if (!isSupabaseConfigured || contactId.startsWith('local-')) {
       const db = getLocalDB();
       const contact = db.contacts.find(c => c.id === contactId);
       if (contact) {
         contact.aiPaused = paused;
         saveLocalDB(db);
       }
       return;
    }
    await supabase.from('contacts').update({ ai_paused: paused }).eq('id', contactId);
  },

  getAllContacts: async (): Promise<Contact[]> => {
    if (!isSupabaseConfigured) return getLocalDB().contacts;
    const { data } = await supabase.from('contacts').select('*').order('updated_at', { ascending: false });
    return data ? data.map(mapDbContact) : [];
  },

  getDashboardStats: async () => {
    const contacts = await chatService.getAllContacts();
    return {
      total: contacts.length,
      triaged: contacts.filter(c => c.status === 'triaged').length,
      urgent: contacts.filter(c => c.status === 'urgent').length,
      new: contacts.filter(c => c.status === 'new').length
    };
  },
  
  clearLocalData: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('mara_contact_id');
    }
  }
};
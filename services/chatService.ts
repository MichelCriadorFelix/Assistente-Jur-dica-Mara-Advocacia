import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Message, Contact } from '../types';

// === SISTEMA DE BANCO DE DADOS LOCAL (FALLBACK) ===
const LOCAL_STORAGE_KEY = 'mara_local_db';

interface LocalDB {
  contacts: Contact[];
  messages: Record<string, Message[]>; // contactId -> messages[]
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

// ===================================================

const mapDbMessage = (row: any): Message => ({
  id: row.id,
  role: row.role as 'user' | 'model',
  content: row.content,
  type: row.type as 'text' | 'audio',
  timestamp: new Date(row.created_at),
  audioUrl: row.audio_url
});

const mapDbContact = (row: any): Contact => ({
  id: row.id,
  name: row.name,
  lastMessage: row.last_message,
  time: new Date(row.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  avatar: row.avatar,
  unreadCount: row.unread_count,
  status: row.status as any
});

export const chatService = {
  
  getOrCreateContact: async (contactId: string | null): Promise<string> => {
    // 1. MODO LOCAL (Se Supabase estiver OFF ou falhar)
    if (!isSupabaseConfigured) {
      const db = getLocalDB();
      
      if (contactId && db.contacts.find(c => c.id === contactId)) {
        return contactId;
      }

      const newContact: Contact = {
        id: 'local-' + Date.now(),
        name: 'Novo Cliente (Local)',
        lastMessage: 'Iniciou conversa',
        time: new Date().toLocaleTimeString(),
        avatar: `https://ui-avatars.com/api/?name=Cliente+${Math.floor(Math.random() * 100)}&background=random`,
        unreadCount: 0,
        status: 'new'
      };
      
      db.contacts.unshift(newContact);
      db.messages[newContact.id] = [];
      saveLocalDB(db);
      return newContact.id;
    }

    // 2. MODO SUPABASE
    if (contactId && !contactId.startsWith('local-')) {
       // Verifica se o ID existe no banco
       const { data } = await supabase.from('contacts').select('id').eq('id', contactId).single();
       if (data) return data.id;
    }

    try {
      // CORREÇÃO CRÍTICA: Gerar o ID manualmente pois a tabela é 'text primary key'
      const newId = crypto.randomUUID(); 

      const { data, error } = await supabase.from('contacts').insert([{
         id: newId,
         name: 'Novo Cliente',
         last_message: 'Iniciou conversa',
         avatar: `https://ui-avatars.com/api/?name=User+${Math.floor(Math.random() * 100)}&background=random`
      }]).select().single();

      if (error) {
        console.error("Erro ao criar contato no Supabase:", error);
        throw error;
      }
      return data.id;
    } catch (err) {
      console.warn("Falha crítica no Supabase, ativando modo local de emergência.", err);
      return chatService.getOrCreateContact('force-local'); 
    }
  },

  loadMessages: async (contactId: string): Promise<Message[]> => {
    // MODO LOCAL
    if (!isSupabaseConfigured || contactId.startsWith('local-')) {
      const db = getLocalDB();
      const msgs = db.messages[contactId] || [];
      return msgs.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    }

    // MODO SUPABASE
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error("Erro ao carregar mensagens:", error);
      return [];
    }
    return data ? data.map(mapDbMessage) : [];
  },

  saveMessage: async (contactId: string, message: Partial<Message>) => {
    // MODO LOCAL
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

       const contactIndex = db.contacts.findIndex(c => c.id === contactId);
       if (contactIndex >= 0) {
         db.contacts[contactIndex].lastMessage = message.type === 'audio' ? '🎵 Áudio' : (message.content || '');
         db.contacts[contactIndex].time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
         const contact = db.contacts.splice(contactIndex, 1)[0];
         db.contacts.unshift(contact);
       }

       saveLocalDB(db);
       return;
    }

    // MODO SUPABASE
    const { error: msgError } = await supabase.from('messages').insert([{
      contact_id: contactId,
      role: message.role,
      content: message.content,
      type: message.type || 'text',
      audio_url: message.audioUrl
    }]);

    if (msgError) {
      console.error("Erro ao salvar mensagem:", msgError);
    } else {
        await supabase.from('contacts').update({
          last_message: message.type === 'audio' ? '🎵 Áudio' : message.content,
          updated_at: new Date().toISOString(),
          unread_count: 0 
        }).eq('id', contactId);
    }
  },

  updateContactStatus: async (contactId: string, status: string, name?: string) => {
     // MODO LOCAL
     if (!isSupabaseConfigured || contactId.startsWith('local-')) {
        const db = getLocalDB();
        const contact = db.contacts.find(c => c.id === contactId);
        if (contact) {
          contact.status = status as any;
          if (name) contact.name = name;
          saveLocalDB(db);
        }
        return;
     }

     // MODO SUPABASE
     const updateData: any = { status };
     if (name) updateData.name = name;
     await supabase.from('contacts').update(updateData).eq('id', contactId);
  },

  getAllContacts: async (): Promise<Contact[]> => {
    // MODO LOCAL
    if (!isSupabaseConfigured) {
      return getLocalDB().contacts;
    }

    // MODO SUPABASE
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      return getLocalDB().contacts;
    }
    return data ? data.map(mapDbContact) : [];
  },

  getDashboardStats: async () => {
    // MODO LOCAL
    if (!isSupabaseConfigured) {
      const contacts = getLocalDB().contacts;
      return {
        total: contacts.length,
        triaged: contacts.filter(c => c.status === 'triaged').length,
        urgent: contacts.filter(c => c.status === 'urgent').length,
        new: contacts.filter(c => c.status === 'new').length
      };
    }

    // MODO SUPABASE
    try {
      const { data, error } = await supabase.from('contacts').select('status');
      if (error || !data) throw error;

      return {
        total: data.length,
        triaged: data.filter(c => c.status === 'triaged').length,
        urgent: data.filter(c => c.status === 'urgent').length,
        new: data.filter(c => c.status === 'new').length
      };
    } catch (e) {
      const contacts = getLocalDB().contacts;
      return {
        total: contacts.length,
        triaged: contacts.filter(c => c.status === 'triaged').length,
        urgent: contacts.filter(c => c.status === 'urgent').length,
        new: contacts.filter(c => c.status === 'new').length
      };
    }
  },
  
  clearLocalData: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('mara_contact_id');
    }
  }
};
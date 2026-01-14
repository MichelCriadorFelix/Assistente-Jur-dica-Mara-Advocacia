import { supabase } from './supabaseClient';
import { Message, Contact } from '../types';

// Map DB row to Frontend Message Type
const mapDbMessage = (row: any): Message => ({
  id: row.id,
  role: row.role as 'user' | 'model',
  content: row.content,
  type: row.type as 'text' | 'audio',
  timestamp: new Date(row.created_at),
  audioUrl: row.audio_url
});

// Map DB row to Contact Type
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
  // Ensure a contact exists for the current user (Client View)
  getOrCreateContact: async (contactId: string | null): Promise<string> => {
    if (contactId) {
       // Verify it exists
       const { data } = await supabase.from('contacts').select('id').eq('id', contactId).single();
       if (data) return data.id;
    }

    // Create new
    const { data, error } = await supabase.from('contacts').insert([{
       name: 'Novo Cliente',
       last_message: 'Iniciou conversa',
       avatar: `https://ui-avatars.com/api/?name=User+${Math.floor(Math.random() * 100)}&background=random`
    }]).select().single();

    if (error) {
        // Fallback for "offline" or configured incorrectly mode
        console.error("Error creating contact", error);
        return 'temp-id-' + Date.now();
    }
    return data.id;
  },

  loadMessages: async (contactId: string): Promise<Message[]> => {
    if (contactId.startsWith('temp-id')) return [];

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });
    
    if (error) {
        console.error("Error loading messages", error);
        return [];
    }
    return data.map(mapDbMessage);
  },

  saveMessage: async (contactId: string, message: Partial<Message>) => {
    if (contactId.startsWith('temp-id')) return;

    // 1. Insert Message
    const { error: msgError } = await supabase.from('messages').insert([{
      contact_id: contactId,
      role: message.role,
      content: message.content,
      type: message.type || 'text',
      audio_url: message.audioUrl
    }]);

    if (msgError) console.error("Error saving message", msgError);

    // 2. Update Contact Metadata (Last Message)
    await supabase.from('contacts').update({
      last_message: message.type === 'audio' ? '🎵 Áudio' : message.content,
      updated_at: new Date().toISOString(),
      unread_count: 0 
    }).eq('id', contactId);
  },

  updateContactStatus: async (contactId: string, status: string, name?: string) => {
     if (contactId.startsWith('temp-id')) return;

     const updateData: any = { status };
     if (name) updateData.name = name;
     
     await supabase.from('contacts').update(updateData).eq('id', contactId);
  },

  getAllContacts: async (): Promise<Contact[]> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) return [];
    return data.map(mapDbContact);
  }
};
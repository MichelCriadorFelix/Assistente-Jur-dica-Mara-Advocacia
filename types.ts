export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  type: 'text' | 'audio';
  timestamp: Date;
  audioUrl?: string; // For playback
}

export interface Contact {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  avatar: string;
  unreadCount: number;
  status: 'new' | 'triaged' | 'urgent';
}

export interface AppConfig {
  systemPrompt: string;
  lawyers: {
    name: string;
    specialty: string;
  }[];
}

export enum ViewState {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  CLIENT_DEMO = 'CLIENT_DEMO'
}

export interface LeadStat {
  label: string;
  value: number;
  color: string;
}
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
  caseStatus?: string; // NOVO: Informações sobre andamento processual (visível apenas para Adm/IA)
}

export interface TeamMember {
  id: string;
  name: string;
  role: string; // ex: Advogado Previdenciário, Secretária
  phone?: string;
  active: boolean;
}

export interface AppConfig {
  systemPrompt: string;
  team: TeamMember[];
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
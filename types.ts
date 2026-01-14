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
  caseStatus?: string; // Informações sobre andamento processual (Advogado -> Cliente)
  legalSummary?: string; // Memória da IA sobre o caso (IA -> IA)
  aiPaused?: boolean; // Se true, a IA não responde automaticamente
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone?: string;
  active: boolean;
}

export interface AiMemory {
  id: string;
  content: string; // O fato aprendido
  category: 'preference' | 'legal_rule' | 'correction' | 'vocabulary';
  createdAt: string;
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
export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  type: 'text' | 'audio' | 'file';
  timestamp: Date;
  audioUrl?: string; // Para áudio
  fileUrl?: string; // Para imagens/PDFs
  fileName?: string; // Nome do arquivo
  mimeType?: string; // Tipo do arquivo (image/png, application/pdf)
}

export interface Contact {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  avatar: string;
  unreadCount: number;
  status: 'new' | 'triaged' | 'urgent';
  clientType?: 'new' | 'returning'; // Novo Cliente ou Cliente Antigo
  cpf?: string; // Dado crítico para o previdenciário
  benefitType?: string; // BPC, Aposentadoria, Auxílio-Doença
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
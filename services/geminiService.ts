import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// IMPORTANTE: Removemos chaves hardcoded para evitar erro de "Key Leaked".
// O sistema deve depender exclusivamente das chaves do usuário (LocalStorage) ou Vercel.
const BACKUP_KEYS: string[] = [];

// Helper para pegar o modelo configurado ou usar o padrão
const getModelName = (): string => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('mara_gemini_model');
    if (local && local.trim().length > 0) return local.trim();
  }
  return 'gemini-2.0-flash';
};

// Helper para coletar TODAS as chaves disponíveis no ambiente
const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // 1. Local Storage (Definido pelo usuário na UI - Prioridade Máxima)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) keys.push(localKey.trim());
  }

  // 2. Variáveis de Ambiente (Vercel / Build Time)
  const possibleEnvKeys = [
    // Next.js / Standard Node
    process.env.API_KEY_3,
    process.env.API_KEY_2,
    process.env.API_KEY_1,
    process.env.NEXT_PUBLIC_API_KEY_3,
    process.env.NEXT_PUBLIC_API_KEY_2,
    process.env.NEXT_PUBLIC_API_KEY_1,
    
    // Vite Prefix
    (import.meta as any).env?.VITE_API_KEY_3,
    (import.meta as any).env?.VITE_API_KEY_2,
    (import.meta as any).env?.VITE_API_KEY_1,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.NEXT_PUBLIC_API_KEY
  ];

  possibleEnvKeys.forEach(k => {
    if (k && typeof k === 'string' && k.length > 10) {
      keys.push(k.trim());
    }
  });

  // 3. Backups (Se houver)
  BACKUP_KEYS.forEach(k => {
    if (!keys.includes(k)) keys.push(k);
  });

  // Remove duplicatas e valores vazios
  return [...new Set(keys)].filter(k => !!k);
};

const notifyTeamFunction: FunctionDeclaration = {
  name: 'notificar_equipe',
  description: 'Notifica o advogado responsável sobre um novo caso triado.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING, description: 'Nome do cliente' },
      summary: { type: Type.STRING, description: 'Resumo do problema jurídico relatado' },
      lawyerName: { type: Type.STRING, description: 'Nome do advogado responsável' },
      priority: { type: Type.STRING, description: 'Prioridade (Baixa, Média, Alta)' }
    },
    required: ['clientName', 'summary', 'lawyerName', 'priority'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  const modelName = getModelName();
  
  if (apiKeys.length === 0) {
    return "⚠️ Erro Crítico: Nenhuma chave de API válida encontrada. Por favor, adicione uma chave nas Configurações ou verifique as variáveis de ambiente da Vercel (prefixo VITE_ ou NEXT_PUBLIC_).";
  }

  console.log(`[Mara System] Iniciando processamento. ${apiKeys.length} chaves de API disponíveis.`);

  // Preparar o histórico
  const chatHistory: Content[] = history
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      parts: m.type === 'text' 
        ? [{ text: m.content }] 
        : [{ text: '[Áudio enviado pelo usuário]' }]
    }));

  const currentParts: Part[] = [];
  if (newMessage.audioBase64) {
    currentParts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'audio/webm;codecs=opus',
        data: newMessage.audioBase64
      }
    });
  }
  if (newMessage.text) {
    currentParts.push({ text: newMessage.text });
  }

  // === ROTAÇÃO DE CHAVES (LOAD BALANCER) ===
  let lastError: any = null;
  let attempts = 0;

  for (const apiKey of apiKeys) {
    attempts++;
    try {
      console.log(`[Tentativa ${attempts}/${apiKeys.length}] Conectando com chave final ...${apiKey.slice(-4)}`);
      
      const ai = new GoogleGenAI({ apiKey });

      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      const response = result;

      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (onToolCall) onToolCall({ name: call.name, args: call.args });

        const functionResponse = { result: "Sucesso. Equipe notificada." };
        const finalResult = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: functionResponse } }]
        });
        return finalResult.text || "";
      }

      return response.text || "";

    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || JSON.stringify(error);
      
      // Erros de Cota (429) ou Exaustão
      const isQuotaError = errorMsg.includes('429') || 
                           errorMsg.includes('Quota') || 
                           errorMsg.includes('Resource has been exhausted');
      
      // Erros de Chave Inválida/Vazada/Permissão (403)
      // Se a chave vazou, temos que pular para a próxima imediatamente
      const isKeyError = errorMsg.includes('403') || 
                         errorMsg.includes('PERMISSION_DENIED') || 
                         errorMsg.includes('leaked') ||
                         errorMsg.includes('key expired') ||
                         errorMsg.includes('not valid');
      
      if (isQuotaError || isKeyError) {
        console.warn(`[Chave Falhou] Chave ...${apiKey.slice(-4)} rejeitada (Cota ou Permissão). Tentando próxima...`);
        continue; // PULA para a próxima chave
      }

      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
         return `⚠️ Erro de Configuração (404): O modelo '${modelName}' não foi encontrado. Vá em Configurações e mude para 'gemini-1.5-flash-8b'.`;
      }

      console.warn(`[Erro Técnico Genérico] Falha na chave ...${apiKey.slice(-4)}:`, errorMsg);
      // Tenta a próxima chave mesmo em erro genérico para garantir resiliência
      continue;
    }
  }
  
  console.error("[FALHA TOTAL] Todas as chaves de API falharam.");
  
  // Tratamento de mensagem final para o usuário
  if (lastError?.message?.includes('403') || lastError?.message?.includes('PERMISSION_DENIED')) {
      return "⚠️ Erro de Autenticação: Todas as chaves de API fornecidas foram rejeitadas pelo Google (Vazamento ou Permissão). Verifique as Configurações.";
  }

  if (lastError?.message?.includes('429')) {
    return "⚠️ Mara indisponível momentaneamente (Alto tráfego). Tente novamente em 1 minuto.";
  }

  return `⚠️ Erro Técnico: ${lastError?.message || 'Falha na conexão com IA'}`;
};
import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Lista de chaves de fallback (Sua nova chave está em primeiro lugar)
const FALLBACK_KEYS = [
  "AIzaSyD-8oeV2Ojwl3a5q9Fe7RkdQ2QROehlljY", // Nova Chave (Prioridade Máxima)
  "AIzaSyAKn6TpoKlcyuLESez4GMSMeconldxfYNk"  // Chave antiga (Backup)
];

// Helper para coletar TODAS as chaves disponíveis
const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // 1. Local Storage (Definido pelo usuário na UI)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) keys.push(localKey);
  }

  // 2. Variáveis de Ambiente (Vite/Next)
  const envs = [
    (import.meta as any).env,
    (window as any).process?.env
  ];

  envs.forEach(env => {
    if (!env) return;
    // Tenta capturar todas as variações possíveis
    if (env.VITE_API_KEY_2) keys.push(env.VITE_API_KEY_2);
    if (env.VITE_API_KEY_1) keys.push(env.VITE_API_KEY_1);
    if (env.VITE_API_KEY) keys.push(env.VITE_API_KEY);
    if (env.NEXT_PUBLIC_API_KEY) keys.push(env.NEXT_PUBLIC_API_KEY);
  });

  // 3. Adicionar Fallbacks Hardcoded
  FALLBACK_KEYS.forEach(k => {
    if (!keys.includes(k)) keys.push(k);
  });

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
  
  if (apiKeys.length === 0) {
    return "⚠️ Erro Crítico: Nenhuma chave de API encontrada.";
  }

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

  // ROTAÇÃO DE CHAVES
  let lastError: any = null;

  for (const apiKey of apiKeys) {
    try {
      // Log discreto para debug (mostra apenas final da chave)
      console.log(`Tentando conectar com IA usando chave ...${apiKey.slice(-4)}`);
      
      const ai = new GoogleGenAI({ apiKey });

      // IMPORTANTE: Forçando gemini-1.5-flash pois o 2.0-flash-exp tem limite muito baixo
      const modelName = 'gemini-1.5-flash'; 

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
      console.warn(`Falha na chave ...${apiKey.slice(-4)}:`, errorMsg);

      // Continua para a próxima chave se for erro de cota (429)
      if (errorMsg.includes('429') || errorMsg.includes('403') || errorMsg.includes('Quota')) {
        continue; 
      }
    }
  }
  
  if (lastError?.message?.includes('429')) {
    return "⚠️ Mara indisponível momentaneamente (Muitos acessos simultâneos ao Google Gemini). Tente novamente em 1 minuto.";
  }

  return `⚠️ Erro Técnico na IA: ${lastError?.message || 'Falha na conexão'}`;
};
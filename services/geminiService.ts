import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Lista de chaves de fallback hardcoded (segurança para demo)
const FALLBACK_KEYS = [
  "AIzaSyD-8oeV2Ojwl3a5q9Fe7RkdQ2QROehlljY", // Key 2 (New - Priority)
  "AIzaSyAKn6TpoKlcyuLESez4GMSMeconldxfYNk"  // Key 1 (Old - Backup)
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
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (env.VITE_API_KEY_2) keys.push(env.VITE_API_KEY_2);
    if (env.VITE_API_KEY_1) keys.push(env.VITE_API_KEY_1);
    if (env.VITE_API_KEY) keys.push(env.VITE_API_KEY);
  }

  // 3. Adicionar Fallbacks Hardcoded (garantindo que não duplique se já estiver no env)
  FALLBACK_KEYS.forEach(k => {
    if (!keys.includes(k)) keys.push(k);
  });

  return keys; // Retorna lista de chaves para rotação
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
    return "⚠️ Erro Crítico: Nenhuma chave de API configurada no sistema.";
  }

  // Preparar o histórico e a nova mensagem uma única vez
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

  // ROTAÇÃO DE CHAVES (Retry Logic)
  let lastError: any = null;

  for (const apiKey of apiKeys) {
    try {
      console.log(`Tentando conectar com chave: ...${apiKey.slice(-4)}`);
      const ai = new GoogleGenAI({ apiKey });

      // Tenta primeiro o modelo mais inteligente (2.0 Flash)
      // Se der erro 404, cai no catch e tenta o 1.5 Flash
      const modelName = 'gemini-2.0-flash-exp'; 

      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      const response = result;

      // Se funcionou, processa tools e retorna
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
      console.warn(`Falha com a chave ...${apiKey.slice(-4)}:`, errorMsg);

      // Se for erro de COTA (429) ou Permissão (403), continua o loop para a próxima chave
      if (errorMsg.includes('429') || errorMsg.includes('403') || errorMsg.includes('Quota')) {
        continue; 
      }

      // Se for erro de Modelo não encontrado (404), tenta fallback de modelo na MESMA chave antes de trocar
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
         try {
            console.log("Tentando fallback para gemini-1.5-flash...");
            const aiFallback = new GoogleGenAI({ apiKey });
            const chatFallback = aiFallback.chats.create({
                model: 'gemini-1.5-flash',
                config: { systemInstruction, tools },
                history: chatHistory
            });
            const fbResult = await chatFallback.sendMessage({ message: currentParts });
            return fbResult.text || "";
         } catch (fbError) {
            console.warn("Fallback de modelo também falhou.");
            continue; // Tenta próxima chave
         }
      }

      // Outros erros técnicos podem ser permanentes, mas vamos tentar rodar as chaves mesmo assim
    }
  }

  // Se saiu do loop, todas as chaves falharam
  console.error("Todas as chaves de API falharam.");
  
  if (lastError?.message?.includes('429')) {
    return "⚠️ Sistema sobrecarregado (Erro 429). Todas as chaves de API atingiram o limite de uso gratuito. Tente novamente em alguns minutos.";
  }

  return `⚠️ Erro Técnico: Não foi possível processar sua mensagem após tentar várias conexões. Detalhe: ${lastError?.message || 'Desconhecido'}`;
};
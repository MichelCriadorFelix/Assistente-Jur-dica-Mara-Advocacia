import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// ============================================================================
// CONFIGURAÇÃO DE MODELOS (FIXA E ESTÁVEL)
// ============================================================================
// O modelo 1.5 Flash é a versão de PRODUÇÃO. 
// O modelo 2.0 (que apareceu no seu erro) é experimental e causa erro 429/404 frequente.
const PRIMARY_MODEL = 'gemini-1.5-flash';

// Helper: Pausa para não sobrecarregar a API (Evita erro 429 em loop)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Limpeza de chaves
const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

export const getAvailableApiKeys = (): string[] => {
  const rawKeys = [
    (import.meta as any).env?.VITE_APP_PARAM_3, // Prioridade 1 (Sua nova chave)
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
    localStorage.getItem('mara_gemini_api_key')
  ];

  const validKeys = rawKeys
    .map(k => cleanKey(k))
    .filter(k => k.length > 30 && k.startsWith('AIza'));

  return [...new Set(validKeys)];
};

const notifyTeamFunction: FunctionDeclaration = {
  name: 'notificar_equipe',
  description: 'Notifica o advogado responsável.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      summary: { type: Type.STRING },
      lawyerName: { type: Type.STRING },
      priority: { type: Type.STRING }
    },
    required: ['clientName', 'summary', 'lawyerName', 'priority'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Nenhuma chave configurada." };

  for (const apiKey of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({ model: PRIMARY_MODEL, history: [] });
      // Mensagem curta para economizar tokens no teste
      await chat.sendMessage({ message: [{ text: "." }] });
      return { success: true, message: `OK (${PRIMARY_MODEL})`, keyUsed: apiKey.slice(-4) };
    } catch (e: any) {
      console.warn(`Teste falhou na chave ...${apiKey.slice(-4)}`);
    }
  }
  return { success: false, message: "Falha na conexão. Verifique se a chave é válida." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  
  if (apiKeys.length === 0) {
    return "⚠️ **Erro**: Nenhuma chave de API encontrada.";
  }

  // Prepara histórico
  const chatHistory: Content[] = history
    .filter(m => m.role !== 'system' && !m.content.includes('⚠️'))
    .map(m => ({
      role: m.role,
      parts: [{ text: m.type === 'audio' ? '(Áudio do usuário)' : m.content }]
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
  if (newMessage.text) currentParts.push({ text: newMessage.text });

  let lastError = "";

  // TENTA CADA CHAVE COM PAUSA
  for (const apiKey of apiKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: PRIMARY_MODEL,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      
      let responseText = result.text || "";

      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        if (onToolCall) onToolCall({ name: call.name, args: call.args });
        
        const fnResp = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
        });
        responseText = fnResp.text || "";
      }

      return responseText;

    } catch (error: any) {
      const msg = error.message || "";
      lastError = `${PRIMARY_MODEL} error: ${msg}`;
      console.error(`[Mara] Erro na chave ...${apiKey.slice(-4)}: ${msg}`);
      
      // Se for 429 (Muitas requisições), espera 2 segundos antes de tentar a próxima chave
      // Isso evita que o Google bloqueie seu IP por spam de requisições
      if (msg.includes('429') || msg.includes('Quota')) {
         await sleep(2000); 
      }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nMotivo: ${lastError.slice(0, 100)}\n\nDica: Se a chave é nova, aguarde 5 minutos para propagação.`;
};
import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS (Auto-Descoberta)
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-1.0-pro'
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

export const getAvailableApiKeys = (): string[] => {
  // Coleta chaves de todas as fontes possíveis
  const allPossibleValues: string[] = [];

  // 1. Variáveis injetadas pelo Vite (process.env agora contém API_KEY_1, API_KEY_2, etc.)
  if (typeof process !== 'undefined' && process.env) {
    Object.values(process.env).forEach(val => {
      if (typeof val === 'string') allPossibleValues.push(val);
    });
  }

  // 2. Fallback para import.meta.env (padrão Vite)
  if ((import.meta as any).env) {
     Object.values((import.meta as any).env).forEach((val: any) => {
       if (typeof val === 'string') allPossibleValues.push(val);
     });
  }

  // 3. LocalStorage (Manual)
  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) allPossibleValues.push(localKey);

  // FILTRO INTELIGENTE:
  // Só aceita strings que parecem chaves do Google (Começam com 'AIza' e são longas)
  const validKeys = allPossibleValues
    .map(k => cleanKey(k))
    .filter(k => k && k.length > 20 && k.startsWith('AIza'));

  // Remove duplicatas
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
  if (keys.length === 0) return { success: false, message: "Nenhuma chave válida (AIza...) encontrada nas variáveis API_KEY_*." };

  for (const apiKey of keys) {
    const ai = new GoogleGenAI({ apiKey });
    
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({ model: modelName, history: [] });
        await chat.sendMessage({ message: [{ text: "Ping" }] });
        
        localStorage.setItem('mara_working_model', modelName);
        
        return { 
          success: true, 
          message: `Conectado! Modelo: ${modelName}`, 
          keyUsed: apiKey.slice(-4) 
        };
      } catch (e: any) {
        console.warn(`Modelo ${modelName} falhou...`);
      }
    }
  }
  return { success: false, message: "Todas as chaves falharam. Verifique se a API está ativa no Google AI Studio." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ **Erro de Configuração**: Nenhuma chave de API encontrada (API_KEY_*).";

  const preferredModel = localStorage.getItem('mara_working_model') || MODEL_CANDIDATES[0];
  const modelsToTry = [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)];

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

  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelsToTry) {
        try {
            const chat = ai.chats.create({
                model: model,
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

            if (model !== preferredModel) {
                localStorage.setItem('mara_working_model', model);
            }

            return responseText;

        } catch (error: any) {
            const msg = error.message || "";
            lastError = `${model} erro: ${msg}`;
            
            if (msg.includes('429') || msg.includes('Quota')) {
                await sleep(2000); // Backoff para tentar próxima chave
                break; // Sai do loop de modelos, tenta próxima chave
            }
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nErro: ${lastError.slice(0, 100)}\n\nNenhuma das ${apiKeys.length} chaves respondeu.`;
};
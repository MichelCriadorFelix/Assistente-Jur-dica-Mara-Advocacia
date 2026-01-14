import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS (ORDEM DE PRIORIDADE ALTERADA PARA ESTABILIDADE)
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',          // PRINCIPAL: Mais rápido, estável e gratuito
  'gemini-1.5-flash-latest',   // Fallback seguro
  'gemini-2.0-flash-exp',      // Experimental (Pode dar erro 404/403 dependendo da conta)
  'gemini-1.5-pro',            // Mais inteligente, mas com rate limit menor
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

export const getAvailableApiKeys = (): string[] => {
  const allPossibleValues: string[] = [];

  // 1. Process Env (Vite Injected)
  if (typeof process !== 'undefined' && process.env) {
    Object.values(process.env).forEach(val => {
      if (typeof val === 'string') allPossibleValues.push(val);
    });
  }

  // 2. Import Meta Env
  if ((import.meta as any).env) {
     Object.values((import.meta as any).env).forEach((val: any) => {
       if (typeof val === 'string') allPossibleValues.push(val);
     });
  }

  // 3. LocalStorage
  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) allPossibleValues.push(localKey);

  const validKeys = allPossibleValues
    .map(k => cleanKey(k))
    .filter(k => k && k.length > 20 && k.startsWith('AIza'));

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
  if (keys.length === 0) return { success: false, message: "Nenhuma chave AIza encontrada." };

  let lastDetailedError = "";

  for (const apiKey of keys) {
    const ai = new GoogleGenAI({ apiKey });
    
    // Tenta conectar com o modelo mais estável primeiro
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({ model: modelName, history: [] });
        await chat.sendMessage({ message: "Ping" }); 
        
        localStorage.setItem('mara_working_model', modelName);
        
        return { 
          success: true, 
          message: `CONECTADO! Modelo: ${modelName}`, 
          keyUsed: apiKey.slice(-4) 
        };
      } catch (e: any) {
        console.error(`Falha ao testar chave ...${apiKey.slice(-4)} no modelo ${modelName}:`, e);
        // Captura o erro real do Google para mostrar ao usuário se tudo falhar
        lastDetailedError = e.message || JSON.stringify(e);
      }
    }
  }

  // Se chegou aqui, nada funcionou. Retorna o erro real.
  return { 
    success: false, 
    message: `Falha Google: ${lastDetailedError.slice(0, 150)}...` 
  };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ **Erro**: Nenhuma chave API encontrada.";

  const savedModel = localStorage.getItem('mara_working_model');
  const preferredModel = savedModel && MODEL_CANDIDATES.includes(savedModel) ? savedModel : MODEL_CANDIDATES[0];
  
  // Lista de tentativas: Preferido -> Flash -> Resto
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
                config: { 
                  systemInstruction, 
                  tools,
                  thinkingConfig: { thinkingBudget: 0 } 
                },
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

            if (model !== savedModel) localStorage.setItem('mara_working_model', model);
            return responseText;

        } catch (error: any) {
            lastError = error.message || "Erro desconhecido";
            // Se erro for 429 (Cota), tenta próxima chave imediatamente
            if (lastError.includes('429') || lastError.includes('Quota')) break;
        }
    }
  }

  return `⚠️ **Erro de Conexão**\n\nO Google recusou a conexão.\nDetalhe: ${lastError.slice(0, 100)}`;
};
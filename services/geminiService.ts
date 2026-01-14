import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS (ORDEM DE PRIORIDADE PARA ESTABILIDADE)
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',          // PRIORIDADE 1: Tier Gratuito Ilimitado (High Rate Limit)
  'gemini-1.5-flash-latest',   // Fallback
  'gemini-2.0-flash-exp',      // Experimental (Pode ser instável)
  'gemini-1.5-pro',            // Backup Pro
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

// Algoritmo de Fisher-Yates para embaralhar as chaves (Load Balancing)
const shuffleArray = (array: string[]) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
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

  // Retorna chaves únicas
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

  // No teste, não embaralhamos para testar consistência, ou podemos testar todas
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
        console.warn(`[Teste] Falha chave ...${apiKey.slice(-4)} modelo ${modelName}`, e.message);
        lastDetailedError = e.message || JSON.stringify(e);
      }
    }
  }

  return { 
    success: false, 
    message: `Falha Geral: ${lastDetailedError.slice(0, 150)}...` 
  };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  let apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ **Erro**: Nenhuma chave API encontrada.";

  // LOAD BALANCING: Embaralha as chaves para não bater sempre na primeira (que pode estar sem cota)
  apiKeys = shuffleArray(apiKeys);

  const savedModel = localStorage.getItem('mara_working_model');
  const preferredModel = savedModel && MODEL_CANDIDATES.includes(savedModel) ? savedModel : MODEL_CANDIDATES[0];
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

  // Loop principal: Tenta cada CHAVE
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });
    console.log(`[Mara] Tentando chave final ...${apiKey.slice(-4)}`);

    // Loop secundário: Tenta modelos com essa chave
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
            
            // Sucesso! Retorna imediatamente.
            return responseText;

        } catch (error: any) {
            lastError = error.message || "Erro desconhecido";
            console.warn(`[Mara] Erro na chave ...${apiKey.slice(-4)} / Modelo ${model}:`, lastError);

            // Se erro for 429 (Cota Excedida) ou 403 (Permissão),
            // SAÍMOS do loop de modelos e pulamos IMEDIATAMENTE para a próxima CHAVE.
            if (lastError.includes('429') || lastError.includes('Quota') || lastError.includes('403')) {
                break; // Break inner loop -> vai para o próximo 'apiKey'
            }
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nTodas as chaves (${apiKeys.length}) retornaram erro de cota ou falha.\n\nDica: Se adicionou chaves novas na Vercel agora, faça um REDEPLOY do projeto.`;
};
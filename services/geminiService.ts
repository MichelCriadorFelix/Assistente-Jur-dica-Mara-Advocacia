import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS (ORDEM DE PRIORIDADE)
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',          
  'gemini-1.5-flash-latest',   
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro'      
];

const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

const shuffleArray = (array: string[]) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// Mapeia chaves explicitamente para garantir leitura
export const getAvailableApiKeysMap = (): Record<string, string> => {
  const keysMap: Record<string, string> = {};

  // 1. Tenta ler diretamente do process.env injetado pelo Vite (Define)
  // O TypeScript pode reclamar, mas o Vite substituirá isso no build
  const explicitKeys = [
    { name: 'API_KEY_1', val: process.env.API_KEY_1 },
    { name: 'API_KEY_2', val: process.env.API_KEY_2 },
    { name: 'API_KEY_3', val: process.env.API_KEY_3 },
    { name: 'API_KEY_4', val: process.env.API_KEY_4 },
    { name: 'API_KEY_5', val: process.env.API_KEY_5 },
    { name: 'API_KEY_6', val: process.env.API_KEY_6 },
  ];

  explicitKeys.forEach(k => {
    if (k.val && k.val.length > 20 && k.val.startsWith('AIza')) {
      keysMap[k.name] = k.val;
    }
  });

  // 2. Fallback: Varredura genérica (caso use VITE_ prefixo)
  const envSources = [
    typeof process !== 'undefined' ? process.env : {},
    (import.meta as any).env || {}
  ];

  envSources.forEach(source => {
    if (!source) return;
    Object.entries(source).forEach(([key, val]) => {
      // Evita duplicar o que já pegamos explicitamente
      if (keysMap[key]) return;

      if (typeof val === 'string' && val.startsWith('AIza') && val.length > 20) {
        keysMap[key] = val;
      }
    });
  });

  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) keysMap['LOCAL_STORAGE'] = localKey;

  return keysMap;
};

export const getAvailableApiKeys = (): string[] => {
  const map = getAvailableApiKeysMap();
  return [...new Set(Object.values(map))].map(cleanKey);
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
  const keysMap = getAvailableApiKeysMap();
  const keys = Object.values(keysMap);
  
  if (keys.length === 0) return { success: false, message: "Nenhuma chave AIza encontrada." };

  let lastDetailedError = "";

  // Tenta cada chave
  for (const [keyName, apiKey] of Object.entries(keysMap)) {
    const ai = new GoogleGenAI({ apiKey });
    
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({ model: modelName, history: [] });
        await chat.sendMessage({ message: "Ping" }); 
        
        localStorage.setItem('mara_working_model', modelName);
        
        return { 
          success: true, 
          message: `CONECTADO! (${keyName} -> ${modelName})`, 
          keyUsed: apiKey.slice(-4) 
        };
      } catch (e: any) {
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
  if (apiKeys.length === 0) return "⚠️ **Erro Crítico**: Nenhuma chave API detectada. Faça Redeploy na Vercel.";

  // Randomiza para balancear carga
  apiKeys = shuffleArray(apiKeys);

  const savedModel = localStorage.getItem('mara_working_model');
  const preferredModel = savedModel && MODEL_CANDIDATES.includes(savedModel) ? savedModel : MODEL_CANDIDATES[0];
  const modelsToTry = [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)];

  // Limita histórico para evitar estouro de tokens (causa principal do erro 429 em conversas longas)
  const recentHistory = history.slice(-6); 

  const chatHistory: Content[] = recentHistory
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

  let errorsLog = [];

  // TENTA CHAVES EM CASCATA
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    // TENTA MODELOS EM CASCATA
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
            
            // SUCESSO - RETORNA E ENCERRA
            return responseText;

        } catch (error: any) {
            const isQuotaError = error.message?.includes('429') || error.message?.includes('Quota');
            
            // Se for cota, não tente outro modelo nesta chave, pule para PRÓXIMA CHAVE
            if (isQuotaError) {
                console.warn(`[Mara] Cota excedida na chave ...${apiKey.slice(-4)}`);
                break; 
            }
        }
    }
  }

  return `⚠️ **Mara Indisponível (Erro de Cota)**\n\nO sistema tentou usar ${apiKeys.length} chaves diferentes e todas estão sem limite no momento. Aguarde 1 minuto.`;
};
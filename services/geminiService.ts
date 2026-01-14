import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS (ORDEM DE PRIORIDADE)
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',          
  'gemini-1.5-flash-latest',   
  'gemini-2.0-flash-exp',      
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

// Retorna chaves e seus NOMES (para debug)
export const getAvailableApiKeysMap = (): Record<string, string> => {
  const keysMap: Record<string, string> = {};

  const envSources = [
    typeof process !== 'undefined' ? process.env : {},
    (import.meta as any).env || {}
  ];

  envSources.forEach(source => {
    if (!source) return;
    Object.entries(source).forEach(([key, val]) => {
      if (typeof val === 'string' && val.startsWith('AIza') && val.length > 20) {
        // Salva: "API_KEY_5": "AIza..."
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
  return [...new Set(Object.values(map))].map(cleanKey); // Remove duplicatas de valor
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
  if (apiKeys.length === 0) return "⚠️ **Erro Crítico**: Nenhuma chave API detectada no sistema. Verifique as configurações.";

  apiKeys = shuffleArray(apiKeys); // Tenta chaves em ordem aleatória

  const savedModel = localStorage.getItem('mara_working_model');
  const preferredModel = savedModel && MODEL_CANDIDATES.includes(savedModel) ? savedModel : MODEL_CANDIDATES[0];
  const modelsToTry = [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)];

  // OTIMIZAÇÃO DE TOKENS: Pega apenas as últimas 8 mensagens
  // Isso impede que conversas longas estourem a cota da API Gratuita
  const recentHistory = history.slice(-8);

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
            const errCode = error.message?.includes('429') ? 'QUOTA_EXCEEDED' : 'ERROR';
            errorsLog.push(`${model} (${apiKey.slice(-4)}): ${errCode}`);
            
            // Se for erro de Cota (429), tenta a próxima chave imediatamente
            if (error.message?.includes('429') || error.message?.includes('Quota')) {
                break; // Sai do loop de modelos e vai para próxima chave
            }
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nTodas as chaves falharam.\nLogs: ${errorsLog.join('\n')}`;
};
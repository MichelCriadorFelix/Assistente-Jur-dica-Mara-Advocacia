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

  // SCANNER DE CHAVES AGRESSIVO
  // Procura em QUALQUER lugar por algo que pareça uma chave AIza
  
  const envSources = [
    typeof process !== 'undefined' ? process.env : {},
    (import.meta as any).env || {}
  ];

  envSources.forEach(source => {
    if (!source) return;
    Object.entries(source).forEach(([key, val]) => {
      // Se a chave começar com AIza, pega direto, não importa o nome da variável
      if (typeof val === 'string' && val.startsWith('AIza') && val.length > 30) {
        allPossibleValues.push(val);
      }
      // Se o nome da variável sugerir uma chave (API_KEY_5, GEMINI_KEY, etc)
      else if (key.toUpperCase().includes('KEY') || key.toUpperCase().includes('GEMINI')) {
        if (typeof val === 'string' && val.startsWith('AIza')) {
           allPossibleValues.push(val);
        }
      }
    });
  });

  // 3. LocalStorage
  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) allPossibleValues.push(localKey);

  // Retorna chaves únicas e válidas
  const validKeys = [...new Set(allPossibleValues.map(cleanKey))];
  
  console.log(`[Mara] Chaves carregadas: ${validKeys.length}`);
  return validKeys;
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
  if (apiKeys.length === 0) return "⚠️ **Erro**: Nenhuma chave API encontrada.";

  apiKeys = shuffleArray(apiKeys);

  const savedModel = localStorage.getItem('mara_working_model');
  const preferredModel = savedModel && MODEL_CANDIDATES.includes(savedModel) ? savedModel : MODEL_CANDIDATES[0];
  const modelsToTry = [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)];

  // Formata histórico corretamente para a API
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
            console.log(`[Mara] Tentando conectar: ${model} com chave ...${apiKey.slice(-4)}`);
            
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
                console.log(`[Mara] Tool Call Detectado: ${call.name}`);
                
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
            console.warn(`[Mara] Erro na chave ...${apiKey.slice(-4)} / Modelo ${model}:`, lastError);

            if (lastError.includes('429') || lastError.includes('Quota') || lastError.includes('403')) {
                break; 
            }
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nTodas as chaves (${apiKeys.length}) retornaram erro de cota ou falha. Tente novamente em instantes.`;
};
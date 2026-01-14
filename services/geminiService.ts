import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Helper para embaralhar chaves (Evita que a chave 1 bloqueie sempre se estiver sem cota)
const shuffleArray = (array: string[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// MODELO NATIVO PADRÃO
// O usuário solicitou "Gemini 2.5". O equivalente técnico atual público é o 2.0 Flash.
const PRIMARY_MODEL = 'gemini-2.0-flash'; 
const FALLBACK_MODEL = 'gemini-1.5-flash'; // O "Tanque de Guerra" que assume se o 2.0 falhar

const getModelName = (): string => {
  // Ignora configuração manual antiga para forçar o que o usuário pediu, 
  // mas ainda permite override se realmente necessário via localStorage
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('mara_gemini_model');
    if (local && local.trim().length > 0) return local.trim();
  }
  return PRIMARY_MODEL;
};

// Helper para coletar chaves. 
export const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // Variáveis de Ambiente
  const envVars = [
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_APP_PARAM_3,
    (import.meta as any).env?.VITE_PUBLIC_DATA_1,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
    (import.meta as any).env?.VITE_API_KEY, 
    process.env.NEXT_PUBLIC_API_KEY,
    (import.meta as any).env?.API_KEY_1
  ];

  envVars.forEach(k => {
    if (k && typeof k === 'string' && k.length > 20 && !k.includes('placeholder')) {
      const cleanKey = k.replace(/["']/g, '').trim();
      keys.push(cleanKey);
    }
  });

  // Local Storage
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) {
      keys.unshift(localKey.trim());
    }
  }

  const uniqueKeys = [...new Set(keys)].filter(k => !!k);
  
  // Embaralha para distribuir a carga
  return shuffleArray(uniqueKeys);
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  const model = getModelName();
  
  if (keys.length === 0) return { success: false, message: "Nenhuma chave encontrada." };

  for (const apiKey of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({ model, history: [] });
      await chat.sendMessage({ message: [{ text: "Oi" }] });
      return { success: true, message: "Conexão OK!", keyUsed: apiKey.slice(-4) };
    } catch (e: any) {
      console.warn(`Teste falhou para chave ...${apiKey.slice(-4)}: ${e.message}`);
    }
  }
  
  return { success: false, message: "Todas as chaves falharam." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  let modelName = getModelName(); // Tenta começar com o 2.0
  
  const minThinkingTime = 5000;
  const maxThinkingTime = 10000;
  const targetThinkingTime = Math.floor(Math.random() * (maxThinkingTime - minThinkingTime + 1) + minThinkingTime);
  const startTime = Date.now();

  if (apiKeys.length === 0) {
    return "⚠️ **Erro Crítico**\n\nNenhuma chave de API configurada. O sistema não pode responder.";
  }

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

  let lastError = "";

  // LOOP DE ROTAÇÃO DE CHAVES
  for (const apiKey of apiKeys) {
    const isLastKey = apiKeys.indexOf(apiKey) === apiKeys.length - 1;
    const keySuffix = apiKey.slice(-4);
    
    // TENTATIVA 1: Modelo Principal (2.0)
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      
      // Se chegou aqui, funcionou. Processa resposta.
      let finalResponseText = result.text || "";

      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        if (onToolCall) onToolCall({ name: call.name, args: call.args });
        const finalResult = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
        });
        finalResponseText = finalResult.text || "";
      }

      // Delay Humano
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < targetThinkingTime) {
        await sleep(targetThinkingTime - elapsedTime);
      }
      
      return finalResponseText;

    } catch (error: any) {
      const msg = error.message || JSON.stringify(error);
      lastError = msg;
      
      console.warn(`[Mara] Falha no modelo ${modelName} com chave ...${keySuffix}. Erro: ${msg}`);

      // LÓGICA DE FALLBACK INTELIGENTE
      // Se o erro for COTA (429) ou SOBRECARGA (503) e estávamos usando o modelo 2.0,
      // tentamos IMEDIATAMENTE o modelo 1.5 (mais estável) com a MESMA chave.
      const isQuotaError = msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED');
      
      if (isQuotaError && modelName === PRIMARY_MODEL) {
          console.log(`[Mara Fallback] Cota excedida no 2.0. Tentando fallback para ${FALLBACK_MODEL}...`);
          try {
             const aiFallback = new GoogleGenAI({ apiKey });
             const chatFallback = aiFallback.chats.create({
                model: FALLBACK_MODEL,
                config: { systemInstruction, tools },
                history: chatHistory
             });
             const resultFallback = await chatFallback.sendMessage({ message: currentParts });
             
             // Sucesso no Fallback!
             const elapsedTime = Date.now() - startTime;
             if (elapsedTime < targetThinkingTime) await sleep(targetThinkingTime - elapsedTime);
             return resultFallback.text || "";

          } catch (fallbackError: any) {
             console.warn(`[Mara Fallback] Falhou também no 1.5. Chave ...${keySuffix} está morta.`);
             // Se falhou no fallback, continua o loop para a PRÓXIMA chave
          }
      }

      // Se não foi possível recuperar com fallback, tenta a próxima chave da lista
      if (!isLastKey) {
          console.log(`🔄 Rotação: Tentando próxima chave API...`);
          continue; 
      }
    }
  }

  // Se tudo falhar
  return `⚠️ **Sistema Indisponível**\n\nTodas as chaves de API atingiram o limite ou estão inválidas.\n\nDetalhe Técnico: ${lastError.slice(0, 100)}`;
};
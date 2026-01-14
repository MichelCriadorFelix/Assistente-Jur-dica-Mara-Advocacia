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

// MODELO NATIVO DEFINITIVO
// O usuário solicitou "Gemini 2.5 Flash". Como este modelo de texto ainda não existe publicamente na API (gerando erro 404),
// utilizamos o "gemini-1.5-flash" que é a versão Flash mais atual, ESTÁVEL e com maior cota gratuita.
// O 'gemini-2.0-flash' fica como fallback caso o 1.5 falhe.
const PRIMARY_MODEL = 'gemini-1.5-flash'; 
const FALLBACK_MODEL = 'gemini-2.0-flash'; 

const getModelName = (): string => {
  // Prioriza sempre o modelo estável definido no código
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
    // Validação robusta para chaves
    if (k && typeof k === 'string' && k.length > 20 && !k.includes('placeholder')) {
      const cleanKey = k.replace(/["']/g, '').trim();
      keys.push(cleanKey);
    }
  });

  // Local Storage (Adiciona chaves manuais se houver)
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

  // Tenta testar apenas a primeira chave válida para rapidez
  for (const apiKey of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({ model, history: [] });
      await chat.sendMessage({ message: [{ text: "Oi" }] });
      return { success: true, message: `Conexão OK com modelo ${model}!`, keyUsed: apiKey.slice(-4) };
    } catch (e: any) {
      console.warn(`Teste falhou para chave ...${apiKey.slice(-4)}: ${e.message}`);
      // Se for erro de cota, tenta a próxima. Se for erro de modelo (404), aborta.
      if (e.message.includes('404') || e.message.includes('not found')) {
         return { success: false, message: `Erro Crítico: O modelo '${model}' não existe na API do Google.` };
      }
    }
  }
  
  return { success: false, message: "Todas as chaves falharam no teste." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  let modelName = getModelName();
  
  const minThinkingTime = 2000; // Tempo reduzido para resposta mais rápida
  const maxThinkingTime = 5000;
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
    
    // TENTATIVA PRINCIPAL
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      
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

      const isQuotaError = msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED');
      const isNotFoundError = msg.includes('404') || msg.includes('not found');

      // FALLBACK DE EMERGÊNCIA
      // Se o modelo principal falhar (seja por cota ou por não existir), tenta o Fallback
      if ((isQuotaError || isNotFoundError) && modelName === PRIMARY_MODEL) {
          console.log(`[Mara Fallback] Erro no principal. Tentando fallback para ${FALLBACK_MODEL}...`);
          try {
             const aiFallback = new GoogleGenAI({ apiKey });
             const chatFallback = aiFallback.chats.create({
                model: FALLBACK_MODEL,
                config: { systemInstruction, tools },
                history: chatHistory
             });
             const resultFallback = await chatFallback.sendMessage({ message: currentParts });
             
             return resultFallback.text || "";

          } catch (fallbackError: any) {
             console.warn(`[Mara Fallback] Falhou também no ${FALLBACK_MODEL}.`);
             // Continua para a próxima chave
          }
      }

      // Se não foi possível recuperar, tenta a próxima chave
      if (!isLastKey) {
          continue; 
      }
    }
  }

  // Se tudo falhar
  return `⚠️ **Sistema Indisponível**\n\nNão foi possível conectar à IA.\n\nDetalhe Técnico: ${lastError.slice(0, 150)}`;
};
import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Helper para pegar o modelo configurado ou usar o padrão
const getModelName = (): string => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('mara_gemini_model');
    if (local && local.trim().length > 0) return local.trim();
  }
  // Padrão mais estável atualmente
  return 'gemini-2.0-flash';
};

// Helper para coletar chaves. 
export const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // Variáveis de Ambiente
  // O Vite SÓ inclui variáveis que começam com VITE_ no build final.
  const envVars = [
    // 1. Prioridade Máxima (Exatamente como no seu print da Vercel)
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_APP_PARAM_3,

    // 2. Legado / Outras tentativas
    (import.meta as any).env?.VITE_PUBLIC_DATA_1,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
    (import.meta as any).env?.VITE_API_KEY, 
    
    // 3. Fallbacks
    process.env.NEXT_PUBLIC_API_KEY,
    (import.meta as any).env?.API_KEY_1
  ];

  envVars.forEach(k => {
    // Validação básica e LIMPEZA
    if (k && typeof k === 'string' && k.length > 10 && !k.includes('placeholder')) {
      // Remove aspas simples ou duplas que o usuário possa ter colado sem querer e espaços
      const cleanKey = k.replace(/["']/g, '').trim();
      keys.push(cleanKey);
    }
  });

  // Local Storage (Override manual do usuário pela tela de Configurações)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) {
      keys.unshift(localKey.trim());
    }
  }

  // Remove duplicatas e vazios
  const uniqueKeys = [...new Set(keys)].filter(k => !!k);
  
  if (uniqueKeys.length > 0) {
    // Console log silencioso para não poluir
  } else {
    console.warn("[Mara System] Nenhuma chave encontrada.");
  }

  return uniqueKeys;
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

// Helper para simular delay humano
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
      // Continua para a próxima chave
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
  const modelName = getModelName();
  
  // Definição do Tempo de Raciocínio (5 a 10 segundos)
  const minThinkingTime = 5000;
  const maxThinkingTime = 10000;
  const targetThinkingTime = Math.floor(Math.random() * (maxThinkingTime - minThinkingTime + 1) + minThinkingTime);
  const startTime = Date.now();

  if (apiKeys.length === 0) {
    return "⚠️ **Erro de Sincronização**\n\nNenhuma chave de API encontrada. Vá em Configurações para adicionar uma.";
  }

  // Preparar o histórico
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

  // Tentar conectar com as chaves disponíveis (Rotação em caso de erro)
  for (const apiKey of apiKeys) {
    const isLastKey = apiKeys.indexOf(apiKey) === apiKeys.length - 1;
    const keySuffix = apiKey.slice(-4);
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      let finalResponseText = result.text || "";

      // Checa chamadas de função (Tools)
      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        if (onToolCall) onToolCall({ name: call.name, args: call.args });
        
        const finalResult = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
        });
        finalResponseText = finalResult.text || "";
      }

      // === SIMULAÇÃO DE RACIOCÍNIO HUMANO ===
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < targetThinkingTime) {
        await sleep(targetThinkingTime - elapsedTime);
      }
      
      return finalResponseText;

    } catch (error: any) {
      const msg = error.message || '';
      lastError = msg;
      console.warn(`[Mara Rotation] Chave ...${keySuffix} falhou. Motivo:`, msg);

      // LÓGICA DE ROTAÇÃO OTIMIZADA
      const isRetryable = msg.includes('429') || 
                          msg.includes('503') || 
                          msg.includes('RESOURCE_EXHAUSTED') || 
                          msg.includes('Overloaded');

      const isAuthError = msg.includes('403') || 
                          msg.includes('PERMISSION_DENIED') || 
                          msg.includes('key not valid') ||
                          msg.includes('API_KEY_INVALID');

      // Se for um erro recuperável e não for a última chave, tenta a próxima
      if ((isRetryable || isAuthError) && !isLastKey) {
          console.log(`🔄 Rotação: Chave ...${keySuffix} falhou. Tentando próxima...`);
          continue; 
      }
    }
  }

  // Se chegou aqui, todas falharam. Retorna mensagem amigável com erro técnico.
  if (lastError.includes('429') || lastError.includes('RESOURCE_EXHAUSTED')) {
      return `⏳ **Sistema Sobrecarregado**\n\nA IA atingiu o limite de requisições gratuitas do Google.\n\n*Erro Técnico: ${lastError.slice(0, 100)}...*`;
  }
  
  if (lastError.includes('403') || lastError.includes('API_KEY')) {
      return `🚫 **Chave Inválida**\n\nO Google rejeitou a chave de acesso. Verifique as configurações.\n\n*Erro Técnico: ${lastError.slice(0, 100)}...*`;
  }

  return `⚠️ **Erro de Conexão**\n\nNão foi possível contatar a IA.\n\n*Erro Técnico: ${lastError.slice(0, 150)}*`;
};
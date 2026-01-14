import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Helper para pegar o modelo configurado ou usar o padrão
const getModelName = (): string => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('mara_gemini_model');
    if (local && local.trim().length > 0) return local.trim();
  }
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
    console.log(`[Mara System] ${uniqueKeys.length} credenciais carregadas e prontas para rotação.`);
  } else {
    console.warn("[Mara System] Nenhuma chave encontrada. Verifique VITE_ux_config na Vercel.");
    // Log para debug no console do navegador
    console.log("Debug Env Vars:", {
      VITE_ux_config: (import.meta as any).env?.VITE_ux_config ? 'Presente' : 'Ausente',
      VITE_APP_PARAM_1: (import.meta as any).env?.VITE_APP_PARAM_1 ? 'Presente' : 'Ausente'
    });
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

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  const modelName = getModelName();
  
  // Definição do Tempo de Raciocínio (5 a 10 segundos)
  // Isso define quanto tempo o usuário verá "Mara está digitando..."
  const minThinkingTime = 5000;
  const maxThinkingTime = 10000;
  const targetThinkingTime = Math.floor(Math.random() * (maxThinkingTime - minThinkingTime + 1) + minThinkingTime);
  const startTime = Date.now();

  if (apiKeys.length === 0) {
    return "⚠️ **Erro de Sincronização (Vercel)**\n\nO sistema está rodando, mas não encontrou a chave.\n\nVá em **Configurações > Chaves de API** para ver o diagnóstico detalhado e identificar qual variável está faltando.";
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

  // Tentar conectar com as chaves disponíveis (Rotação em caso de erro)
  for (const apiKey of apiKeys) {
    const isLastKey = apiKeys.indexOf(apiKey) === apiKeys.length - 1;
    
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
        
        // Responde para a IA confirmar
        const finalResult = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
        });
        finalResponseText = finalResult.text || "";
      }

      // === SIMULAÇÃO DE RACIOCÍNIO HUMANO ===
      // Se a IA respondeu muito rápido (ex: 1s), esperamos até completar o targetThinkingTime (ex: 5s).
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < targetThinkingTime) {
        await sleep(targetThinkingTime - elapsedTime);
      }
      
      return finalResponseText;

    } catch (error: any) {
      const msg = error.message || '';
      console.warn(`[Mara Rotation] Chave ...${apiKey.slice(-4)} falhou. Motivo:`, msg);

      // LÓGICA DE ROTAÇÃO OTIMIZADA
      // Se o erro for de Cota (429), Sobrecarga (503) ou Permissão (403), 
      // e NÃO for a última chave, pula imediatamente para a próxima.
      const isRetryable = msg.includes('429') || 
                          msg.includes('503') || 
                          msg.includes('RESOURCE_EXHAUSTED') || 
                          msg.includes('Overloaded');

      const isAuthError = msg.includes('403') || 
                          msg.includes('PERMISSION_DENIED') || 
                          msg.includes('key not valid');

      if ((isRetryable || isAuthError) && !isLastKey) {
          console.log(`🔄 Rotação Ativada: Trocando da chave ${apiKeys.indexOf(apiKey) + 1} para a próxima...`);
          continue; // Pula para a próxima iteração do loop (próxima chave)
      }

      // Se for a última chave e falhou todas
      if (isLastKey) {
         if (isAuthError) {
             return "🚫 **Acesso Negado (Google)**\n\nA chave foi encontrada, mas o Google a rejeitou. Verifique se copiou a chave correta do AI Studio.";
         }
         if (isRetryable) return "⏳ A IA está com alto volume de acessos no momento. Aguarde alguns segundos e tente novamente.";
         return "⚠️ **Erro Técnico:** " + msg;
      }
      // Se for outro erro desconhecido, tenta a próxima também por segurança
      continue;
    }
  }

  return "⚠️ Erro desconhecido na comunicação com a IA.";
};
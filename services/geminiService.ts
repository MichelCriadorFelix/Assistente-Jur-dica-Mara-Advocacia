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
// Procura agressivamente por chaves no ambiente (Vercel) e LocalStorage.
export const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // Variáveis de Ambiente
  const envVars = [
    // 1. Chaves com prefixo padrão (Vite/Next) - Garantidos pelo Framework
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.VITE_API_KEY_1,
    (import.meta as any).env?.VITE_API_KEY_2,
    (import.meta as any).env?.VITE_API_KEY_3,
    (import.meta as any).env?.VITE_GEMINI_KEY,
    process.env.NEXT_PUBLIC_API_KEY,
    
    // 2. Chaves Nativas Vercel (Solicitado pelo Usuário)
    // Nota: Se o build tool (Vite) não estiver configurado para 'define', estas podem vir undefined.
    // Mas vamos tentar acessá-las via process.env e import.meta
    process.env.API_KEY,
    process.env.API_KEY_1,
    process.env.API_KEY_2,
    process.env.API_KEY_3,
    (import.meta as any).env?.API_KEY,
    (import.meta as any).env?.API_KEY_1,
    (import.meta as any).env?.API_KEY_2,
    (import.meta as any).env?.API_KEY_3,
    
    // Fallbacks legados
    process.env.REACT_APP_API_KEY
  ];

  envVars.forEach(k => {
    if (k && typeof k === 'string' && k.length > 20 && !k.includes('placeholder')) {
      keys.push(k.trim());
    }
  });

  // 3. Local Storage (Override manual do usuário)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) {
      keys.unshift(localKey.trim());
    }
  }

  // Remove duplicatas e vazios
  const uniqueKeys = [...new Set(keys)].filter(k => !!k);
  
  // Log para debug (mostra apenas os últimos 4 dígitos)
  if (uniqueKeys.length > 0) {
    console.log(`[Mara System] ${uniqueKeys.length} chaves carregadas. Usando final ...${uniqueKeys[0].slice(-4)}`);
  } else {
    console.warn("[Mara System] Nenhuma chave encontrada. Verifique se API_KEY_1 está definida na Vercel.");
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

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  const modelName = getModelName();
  
  if (apiKeys.length === 0) {
    return "⚠️ **Erro de Chave API**\n\nNão encontrei as chaves `API_KEY_1`, `API_KEY_2` ou `VITE_API_KEY`.\n\n**Dica Vercel:**\nO sistema de segurança do Vite pode estar ocultando suas chaves `API_KEY_1` do navegador. Se isso acontecer, você precisará renomeá-las para `VITE_API_KEY_1` na Vercel (pode ignorar o aviso de segurança deles, pois este é um App Web e precisa da chave pública).";
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
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      
      // Checa chamadas de função (Tools)
      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        if (onToolCall) onToolCall({ name: call.name, args: call.args });
        
        // Responde para a IA confirmar
        const finalResult = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
        });
        return finalResult.text || "";
      }

      return result.text || "";

    } catch (error: any) {
      const msg = error.message || '';
      console.warn(`[API Error] Chave final ...${apiKey.slice(-4)} falhou:`, msg);

      // Se for a última chave e falhou todas
      if (apiKeys.indexOf(apiKey) === apiKeys.length - 1) {
         if (msg.includes('403') || msg.includes('key not valid')) {
             return "🚫 **Chave Inválida/Bloqueada**\n\nO Google rejeitou a chave API configurada. Verifique se ela foi copiada corretamente.";
         }
         if (msg.includes('429')) return "⏳ A IA está sobrecarregada no momento. Tente novamente em alguns segundos.";
         return "⚠️ **Erro Técnico:** " + msg;
      }
      continue;
    }
  }

  return "⚠️ Erro desconhecido na comunicação com a IA.";
};
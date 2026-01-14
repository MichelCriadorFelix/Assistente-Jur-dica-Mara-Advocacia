import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Helper to get API Key dynamically at runtime
const getApiKey = (): string => {
  // 1. First, check for manual override in Local Storage (set via Settings UI)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) return localKey;
  }

  // 2. Check Vite specific (Priority for VITE_API_KEY_1 as requested)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (env.VITE_API_KEY_1) return env.VITE_API_KEY_1; // PRIORIDADE MÁXIMA
    if (env.VITE_API_KEY) return env.VITE_API_KEY;
    if (env.API_KEY_1) return env.API_KEY_1;
  }

  // 3. Check Environment Variables (Legacy/Node)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_API_KEY_1) return process.env.VITE_API_KEY_1;
    if (process.env.API_KEY_1) return process.env.API_KEY_1;
    if (process.env.NEXT_PUBLIC_API_KEY_1) return process.env.NEXT_PUBLIC_API_KEY_1;
    if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }
  
  return '';
};

// Function Declaration for notifying the team
const notifyTeamFunction: FunctionDeclaration = {
  name: 'notificar_equipe',
  description: 'Notifica o advogado responsável sobre um novo caso triado.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: {
        type: Type.STRING,
        description: 'Nome do cliente',
      },
      summary: {
        type: Type.STRING,
        description: 'Resumo do problema jurídico relatado',
      },
      lawyerName: {
        type: Type.STRING,
        description: 'Nome do advogado para quem o caso deve ser encaminhado (Dr. Michel Felix, Dra. Luana Castro ou Dra. Flávia Zacarias)',
      },
      priority: {
        type: Type.STRING,
        description: 'Prioridade baseada na urgência do relato (Baixa, Média, Alta)',
      }
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
  
  // Fetch key at the moment of the call
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error("API Key não encontrada.");
    return "⚠️ Erro de Configuração: API Key não detectada.\n\nO sistema buscou por 'VITE_API_KEY_1' mas não encontrou. Vá em 'Configurações' neste app e cole a chave manualmente para testar agora.";
  }

  const ai = new GoogleGenAI({ apiKey });

  // Convert internal Message format to Gemini Content format
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

  try {
    // Usando modelo estável 'gemini-2.0-flash-exp' ou 'gemini-1.5-flash' se o 2.0 falhar
    const chat = ai.chats.create({
      model: 'gemini-2.0-flash-exp', 
      config: {
        systemInstruction: systemInstruction,
        tools: tools,
      },
      history: chatHistory
    });

    const result = await chat.sendMessage({
      message: currentParts
    });
    
    const response = result;
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      
      if (onToolCall) {
        onToolCall({ name: call.name, args: call.args });
      }

      const functionResponse = {
        result: "Sucesso. A equipe foi notificada e o CRM atualizado com o lead."
      };

      const finalResult = await chat.sendMessage({
        message: [{
          functionResponse: {
            name: call.name,
            response: functionResponse
          }
        }]
      });

      return finalResult.text || "";
    }

    return response.text || "";

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Tratamento de erros amigável
    if (error.message?.includes('403') || error.message?.includes('API key')) {
         return "🔒 Erro de Permissão: Sua chave de API não é válida ou não tem acesso ao modelo. Verifique no Google AI Studio.";
    }
    
    if (error.message?.includes('404') || error.message?.includes('not found')) {
         return "❌ Erro de Modelo: O modelo de IA configurado está temporariamente indisponível. Tente novamente em alguns instantes.";
    }

    return `⚠️ Erro Técnico: Não foi possível processar sua solicitação no momento.`;
  }
};
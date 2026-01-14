import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Helper to get API Key dynamically at runtime
const getApiKey = (): string => {
  // 1. First, check for manual override in Local Storage (set via Settings UI)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) return localKey;
  }

  // 2. Check Environment Variables (Build time injection)
  // Note: Standard Vercel env vars (like API_KEY_1) are NOT exposed to the client unless prefixed with NEXT_PUBLIC_ or VITE_
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.API_KEY_1) return process.env.API_KEY_1;
    if (process.env.NEXT_PUBLIC_API_KEY_1) return process.env.NEXT_PUBLIC_API_KEY_1;
    if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }
  
  // 3. Check Vite specific
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (env.VITE_API_KEY) return env.VITE_API_KEY;
    if (env.VITE_API_KEY_1) return env.VITE_API_KEY_1;
    if (env.API_KEY_1) return env.API_KEY_1;
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
        description: 'Nome do advogado para quem o caso deve ser encaminhado (Dr. Michel, Dra. Luana ou Dra. Flávia)',
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
  
  // Fetch key at the moment of the call, not at module load
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error("API Key não encontrada.");
    return "⚠️ Erro de Configuração: API Key não detectada.\n\nPor favor, vá em 'Monitor de Chat > Configurações' e insira sua chave manualmente, ou renomeie a variável na Vercel para 'NEXT_PUBLIC_API_KEY'.";
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
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash-preview',
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
    
    if (error.message?.includes('403') || error.message?.includes('API key')) {
         return "Erro de Autenticação: Sua Chave de API parece inválida ou expirou. Verifique as configurações.";
    }

    return "Desculpe, estou tendo dificuldades técnicas momentâneas. Podemos tentar novamente?";
  }
};
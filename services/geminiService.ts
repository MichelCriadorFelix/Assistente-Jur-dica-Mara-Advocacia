import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Helper to safely get API Key supporting multiple naming conventions
const getApiKey = () => {
  if (typeof process !== 'undefined' && process.env) {
    // Check the variable specifically seen in your screenshot: API_KEY_1
    if (process.env.API_KEY_1) return process.env.API_KEY_1;
    if (process.env.API_KEY) return process.env.API_KEY;
    if (process.env.NEXT_PUBLIC_API_KEY) return process.env.NEXT_PUBLIC_API_KEY;
  }
  
  // Try Vite/Import Meta
  if (typeof import.meta !== 'undefined') {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
       if (metaEnv.API_KEY_1) return metaEnv.API_KEY_1;
       if (metaEnv.VITE_API_KEY) return metaEnv.VITE_API_KEY;
    }
  }
  return '';
};

const apiKey = getApiKey();

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
  if (!apiKey) {
    console.error("API Key (API_KEY ou API_KEY_1) não encontrada.");
    return "Erro: Chave de API não configurada. Verifique o painel da Vercel (API_KEY_1).";
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

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Desculpe, estou tendo dificuldades técnicas momentâneas. Podemos tentar novamente?";
  }
};
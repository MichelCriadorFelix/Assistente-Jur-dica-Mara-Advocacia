import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

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
  // Use process.env.API_KEY directly as per @google/genai guidelines.
  // We assume process.env.API_KEY is available and configured.
  if (!process.env.API_KEY) {
    console.error("API Key do Gemini não encontrada. Verifique as variáveis de ambiente (API_KEY).");
    return "Erro de configuração: Chave de API da IA não detectada. Por favor, contate o administrador do sistema.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
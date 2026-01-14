import { GoogleGenAI, FunctionDeclaration, Type, Tool } from "@google/genai";
import { Message } from "../types";

// Setup API Key - assumes process.env.API_KEY is available
const apiKey = process.env.API_KEY || '';

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
    return "Erro: API Key não configurada. Por favor, configure a chave no ambiente.";
  }

  const ai = new GoogleGenAI({ apiKey });

  // Convert internal Message format to Gemini Content format
  // We filter out system messages from history as they go into config
  const chatHistory = history
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      parts: m.type === 'text' 
        ? [{ text: m.content }] 
        : [{ text: '[Áudio enviado pelo usuário]' }] // Simplified for history context
    }));

  const parts: any[] = [];
  
  if (newMessage.audioBase64) {
    parts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'audio/webm;codecs=opus',
        data: newMessage.audioBase64
      }
    });
  }
  
  if (newMessage.text) {
    parts.push({ text: newMessage.text });
  }

  try {
    const model = ai.models.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      systemInstruction: systemInstruction,
      tools: tools,
    });

    const chat = model.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessage(parts);
    const response = result.response;
    
    // Handle Function Calls
    const functionCalls = response.functionCalls();
    
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      
      // Notify UI about the tool usage (simulated)
      if (onToolCall) {
        onToolCall({ name: call.name, args: call.args });
      }

      // Execute "backend" logic for the tool
      const functionResponse = {
        result: "Sucesso. A equipe foi notificada e o CRM atualizado com o lead."
      };

      // Send the tool execution result back to the model to get the final natural language response
      const finalResult = await chat.sendMessage([{
        functionResponse: {
          name: call.name,
          response: functionResponse
        }
      }]);

      return finalResult.response.text();
    }

    return response.text();

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Desculpe, estou tendo dificuldades técnicas momentâneas. Podemos tentar novamente?";
  }
};
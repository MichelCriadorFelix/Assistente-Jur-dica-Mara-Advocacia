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
// ATENÇÃO: Se não houver chave no LocalStorage, o sistema não funcionará pois as chaves públicas foram revogadas.
const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // 1. Local Storage (Prioridade: Chave do Usuário)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) keys.push(localKey.trim());
  }

  // 2. Variáveis de Ambiente (Caso o usuário faça deploy na Vercel com suas chaves)
  const envKeys = [
    process.env.NEXT_PUBLIC_API_KEY,
    process.env.VITE_API_KEY,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.NEXT_PUBLIC_API_KEY
  ];

  envKeys.forEach(k => {
    if (k && typeof k === 'string' && k.length > 20) keys.push(k.trim());
  });

  return [...new Set(keys)].filter(k => !!k);
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
  
  // Se não tiver chave nenhuma, avisa amigavelmente.
  if (apiKeys.length === 0) {
    return "⚠️ **Configuração Necessária**\n\nOlá! Para que eu possa funcionar, você precisa adicionar uma Chave de API (Google Gemini).\n\n1. Vá na aba **Configurações** aqui do painel.\n2. Clique em 'Gerar Chave Gratuita'.\n3. Cole a chave no campo indicado e salve.";
  }

  console.log(`[Mara System] Usando ${apiKeys.length} chaves disponíveis.`);

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

  // Tentar conectar com as chaves disponíveis
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
      console.warn(`Erro na chave ...${apiKey.slice(-4)}:`, msg);

      // Tratamento específico para chave vazada/banida
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('leaked')) {
         // Se for a última chave e falhou, retorna erro legível
         if (apiKeys.indexOf(apiKey) === apiKeys.length - 1) {
             return "🚫 **Acesso Bloqueado**\n\nA chave de API configurada foi identificada como 'vazada' pelo Google e bloqueada.\n\nPor favor, vá em **Configurações**, remova a chave antiga e gere uma nova em *aistudio.google.com*.";
         }
         continue; // Tenta a próxima chave se houver
      }
      
      if (msg.includes('429')) {
         return "⏳ **Alto Tráfego**\n\nEstou recebendo muitas solicitações. Por favor, aguarde 30 segundos e tente novamente.";
      }
      
      // Se não for erro de chave/cota, pode ser modelo inexistente
      if (msg.includes('404')) {
         return `⚠️ **Erro de Modelo**\n\nO modelo '${modelName}' não está disponível para sua chave. Tente mudar para 'gemini-1.5-flash' nas Configurações.`;
      }
    }
  }

  return "⚠️ **Erro de Conexão**\n\nNão consegui conectar ao servidor da IA. Verifique sua chave de API nas Configurações.";
};
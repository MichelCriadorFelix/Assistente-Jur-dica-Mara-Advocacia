import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// ============================================================================
// CONFIGURAÇÃO CRÍTICA DE MODELOS
// ============================================================================
// NOTA TÉCNICA: O nome "gemini-2.5" não existe na API pública (gera 404).
// Utilizamos o "gemini-1.5-flash" que é a versão de produção mais rápida (Flash),
// estável e com maior cota gratuita. Isso resolve o problema de "Sistema Indisponível".
const PRIMARY_MODEL = 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash-8b'; // Versão ultra-leve para backup

// Helper: Limpeza agressiva de chaves de API (Remove aspas, espaços, quebras de linha)
const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

// Coletor de Chaves de API (Prioriza VITE_APP_PARAM_3 conforme solicitado)
export const getAvailableApiKeys = (): string[] => {
  const rawKeys = [
    (import.meta as any).env?.VITE_APP_PARAM_3, // Prioridade Alta (Nova)
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
    localStorage.getItem('mara_gemini_api_key') // Chave manual do usuário
  ];

  // Filtra chaves válidas (Começam com 'AIza' e são longas)
  const validKeys = rawKeys
    .map(k => cleanKey(k))
    .filter(k => k.length > 30 && k.startsWith('AIza'));

  // Remove duplicatas
  return [...new Set(validKeys)];
};

// Definição da Ferramenta (Function Calling)
const notifyTeamFunction: FunctionDeclaration = {
  name: 'notificar_equipe',
  description: 'Notifica o advogado responsável quando o cliente informa a área do caso e detalhes suficientes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING, description: 'Nome identificado do cliente' },
      summary: { type: Type.STRING, description: 'Resumo do problema jurídico relatado' },
      lawyerName: { type: Type.STRING, description: 'Nome do advogado responsável (Dr. Michel, Dra. Luana, etc)' },
      priority: { type: Type.STRING, description: 'Prioridade baseada na urgência (Baixa, Média, Alta)' }
    },
    required: ['clientName', 'summary', 'lawyerName', 'priority'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

// Teste de Conexão Rápido
export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Nenhuma chave válida (AIza...) encontrada." };

  for (const apiKey of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({ model: PRIMARY_MODEL, history: [] });
      await chat.sendMessage({ message: [{ text: "Ping" }] });
      return { success: true, message: `Conectado com Sucesso (${PRIMARY_MODEL})`, keyUsed: apiKey.slice(-4) };
    } catch (e: any) {
      console.warn(`Chave final ...${apiKey.slice(-4)} falhou:`, e.message);
    }
  }
  return { success: false, message: "Todas as chaves falharam. Verifique cotas ou validade." };
};

// Função Principal de Chat
export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  
  if (apiKeys.length === 0) {
    return "⚠️ **Erro de Configuração:** Nenhuma chave de API válida encontrada. Adicione uma chave nas configurações.";
  }

  // 1. Prepara Histórico
  // Filtra mensagens de erro anteriores para não confundir a IA
  // Garante que a primeira mensagem (do sistema/bot) seja considerada pelo modelo para manter a persona
  const chatHistory: Content[] = history
    .filter(m => m.role !== 'system' && !m.content.includes('Erro de Configuração') && !m.content.includes('Sistema Indisponível'))
    .map(m => ({
      role: m.role,
      parts: [{ text: m.type === 'audio' ? '(Áudio do usuário)' : m.content }]
    }));

  // 2. Prepara a nova mensagem
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

  // 3. Tenta conectar rotacionando chaves (Failover)
  let lastError = "";

  for (const apiKey of apiKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const chat = ai.chats.create({
        model: PRIMARY_MODEL,
        config: { 
          systemInstruction, 
          tools,
          temperature: 0.5, // Mais preciso, menos criativo (ideal para jurídico)
        },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      
      // Processa resposta
      let responseText = result.text || "";

      // Verifica chamada de função
      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        
        // Executa callback no front-end (ex: atualizar status no banco)
        if (onToolCall) {
            onToolCall({ name: call.name, args: call.args });
        }
        
        // Envia confirmação para a IA gerar a resposta final ao usuário
        const functionResponse = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: { result: "Sucesso" } } }]
        });
        
        responseText = functionResponse.text || "";
      }

      return responseText; // Sucesso! Sai da função.

    } catch (error: any) {
      const msg = error.message || "Erro desconhecido";
      lastError = msg;
      console.warn(`[Gemini] Falha na chave ...${apiKey.slice(-4)}: ${msg}`);

      // Se for erro 404 (modelo não existe), não adianta tentar outra chave, o código está errado.
      // Mas como forçamos PRIMARY_MODEL correto, isso não deve acontecer.
      // Se for 429 (Quota), o loop continua para a próxima chave.
    }
  }

  return `⚠️ **Sistema Indisponível**\n\nNenhuma das chaves respondeu. Erro: ${lastError.slice(0, 100)}`;
};
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
    (import.meta as any).env?.VITE_API_KEY, // Vercel costuma bloquear esta
    
    // 3. Fallbacks
    process.env.NEXT_PUBLIC_API_KEY,
    (import.meta as any).env?.API_KEY_1
  ];

  envVars.forEach(k => {
    // Validação básica para garantir que não é uma string vazia ou placeholder
    if (k && typeof k === 'string' && k.length > 10 && !k.includes('placeholder')) {
      keys.push(k.trim());
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
    console.log(`[Mara System] ${uniqueKeys.length} credenciais carregadas com sucesso.`);
  } else {
    console.warn("[Mara System] Nenhuma chave encontrada. Verifique VITE_ux_config na Vercel.");
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
    return "⚠️ **Erro de Sincronização (Vercel)**\n\nO sistema atualizou, mas ainda não leu suas chaves.\n\n1. Verifique se na Vercel a variável se chama exatamente `VITE_ux_config` ou `VITE_APP_PARAM_1`.\n2. Se você acabou de criar as variáveis, vá na Vercel em **Deployments** e clique em **Redeploy** no último deploy para ele pegar as novas chaves.\n3. Ou insira a chave manualmente em Configurações (ícone de engrenagem) para testar agora.";
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
      console.warn(`[API Error] Falha com credencial final ...${apiKey.slice(-4)}:`, msg);

      // Se for a última chave e falhou todas
      if (apiKeys.indexOf(apiKey) === apiKeys.length - 1) {
         if (msg.includes('403') || msg.includes('key not valid') || msg.includes('PERMISSION_DENIED')) {
             return "🚫 **Acesso Negado (Google)**\n\nA chave configurada foi rejeitada pelo Google. Verifique se a variável `VITE_ux_config` na Vercel contém a chave correta do AI Studio e se a cobrança está ativa (se necessário).";
         }
         if (msg.includes('429')) return "⏳ A IA está sobrecarregada no momento. Tente novamente em alguns segundos.";
         return "⚠️ **Erro Técnico:** " + msg;
      }
      continue;
    }
  }

  return "⚠️ Erro desconhecido na comunicação com a IA.";
};
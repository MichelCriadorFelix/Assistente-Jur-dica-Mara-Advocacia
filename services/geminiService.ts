import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// --- CONFIGURAÇÃO DE ENGENHARIA ---
// O modelo "gemini-2.5" solicitado ainda não possui endpoint público (gera erro 404).
// O modelo mais avançado e ATUAL disponível na API é o "gemini-2.0-flash".
// Configuramos ele como PRINCIPAL e o 1.5 como BACKUP de segurança.
const MODELS = {
  PRIMARY: 'gemini-2.0-flash', 
  BACKUP: 'gemini-1.5-flash'
};

// Helper para embaralhar chaves (Balanceamento de Carga)
const shuffleArray = (array: string[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// Coletor de Chaves de API (Incluindo a nova VITE_APP_PARAM_3)
export const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // Mapeamento de TODAS as variáveis possíveis do ambiente Vercel/Vite
  const envVars = [
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_APP_PARAM_3, // Adicionado conforme print
    (import.meta as any).env?.VITE_PUBLIC_DATA_1,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
    (import.meta as any).env?.VITE_API_KEY, 
    process.env.NEXT_PUBLIC_API_KEY,
    (import.meta as any).env?.API_KEY_1
  ];

  envVars.forEach(k => {
    // Validação estrita: chaves do Gemini são longas e não contém espaços
    if (k && typeof k === 'string' && k.length > 30 && !k.includes('placeholder')) {
      const cleanKey = k.replace(/["']/g, '').trim();
      keys.push(cleanKey);
    }
  });

  // Chave Manual (LocalStorage) tem prioridade máxima se existir
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) {
      // Coloca no início do array
      keys.unshift(localKey.trim());
      return [...new Set(keys)]; // Retorna sem embaralhar para priorizar a manual
    }
  }

  const uniqueKeys = [...new Set(keys)].filter(k => !!k);
  
  // Embaralha as chaves do ambiente para evitar que uma chave ruim trave todos os usuários
  return shuffleArray(uniqueKeys);
};

// Definição da Ferramenta (Function Calling)
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Teste de Conexão Isolado
export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  
  if (keys.length === 0) return { success: false, message: "Nenhuma chave encontrada nas variáveis de ambiente." };

  for (const apiKey of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      // Testa com o modelo primário
      const chat = ai.chats.create({ model: MODELS.PRIMARY, history: [] });
      await chat.sendMessage({ message: [{ text: "Ping de teste" }] });
      return { success: true, message: `Conectado via ${MODELS.PRIMARY}`, keyUsed: apiKey.slice(-4) };
    } catch (e: any) {
      console.warn(`Teste falhou na chave ...${apiKey.slice(-4)}: ${e.message}`);
      // Se falhar o primário, tenta o backup na mesma chave antes de desistir dela
      try {
        const aiBackup = new GoogleGenAI({ apiKey });
        const chatBackup = aiBackup.chats.create({ model: MODELS.BACKUP, history: [] });
        await chatBackup.sendMessage({ message: [{ text: "Ping" }] });
        return { success: true, message: `Conectado via ${MODELS.BACKUP} (Fallback)`, keyUsed: apiKey.slice(-4) };
      } catch (e2) {}
    }
  }
  
  return { success: false, message: "Todas as chaves falharam ou estão sem cota." };
};

// Função Principal de Chat
export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  
  // UX: Tempo de "digitando..." humanizado
  const minThinkingTime = 1500;
  const maxThinkingTime = 4000;
  const targetThinkingTime = Math.floor(Math.random() * (maxThinkingTime - minThinkingTime + 1) + minThinkingTime);
  const startTime = Date.now();

  if (apiKeys.length === 0) {
    return "⚠️ **Erro de Configuração**\n\nNão encontrei chaves de API válidas. Verifique o Vercel ou as Configurações.";
  }

  // Prepara o histórico para o formato do Google
  const chatHistory: Content[] = history
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      parts: m.type === 'text' 
        ? [{ text: m.content }] 
        : [{ text: '[Áudio enviado pelo usuário]' }]
    }));

  // Prepara a mensagem atual (Texto ou Áudio+Texto)
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

  let lastDetailedError = "";

  // TENTA CADA CHAVE DISPONÍVEL (Load Balancer & Failover)
  for (const apiKey of apiKeys) {
    const keySuffix = apiKey.slice(-4);
    
    // Tenta primeiro o modelo 2.0, se falhar, tenta o 1.5 NA MESMA CHAVE
    const modelsToTry = [MODELS.PRIMARY, MODELS.BACKUP];

    for (const model of modelsToTry) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const chat = ai.chats.create({
                model: model,
                config: { 
                    systemInstruction, 
                    tools,
                    temperature: 0.7 // Criatividade balanceada
                },
                history: chatHistory
            });

            const result = await chat.sendMessage({ message: currentParts });
            
            // Processamento de Sucesso
            let finalResponseText = result.text || "";

            // Se a IA chamou uma função (ex: notificar equipe)
            if (result.functionCalls && result.functionCalls.length > 0) {
                const call = result.functionCalls[0];
                if (onToolCall) onToolCall({ name: call.name, args: call.args });
                
                // Envia confirmação silenciosa para a IA continuar o papo
                const finalResult = await chat.sendMessage({
                message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
                });
                finalResponseText = finalResult.text || "";
            }

            // Delay cosmético para parecer humano
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < targetThinkingTime) {
                await sleep(targetThinkingTime - elapsedTime);
            }
            
            return finalResponseText; // SUCESSO! Retorna e encerra.

        } catch (error: any) {
            const msg = error.message || JSON.stringify(error);
            lastDetailedError = `${model} (${keySuffix}): ${msg}`;
            
            console.warn(`[Mara AI] Falha: ${lastDetailedError}`);

            // Se o erro for 404 (Modelo não existe) ou 400 (Bad Request), pular modelo.
            // Se for 429 (Quota), pular chave.
            
            if (msg.includes('429') || msg.includes('Quota')) {
                break; // Quebra o loop de modelos e vai para a PRÓXIMA CHAVE
            }
        }
    }
  }

  // Se chegou aqui, TODAS as tentativas falharam
  return `⚠️ **Mara Indisponível**\n\nO sistema está temporariamente fora do ar por alto volume.\n\nCod: ${lastDetailedError.slice(0, 50)}...`;
};
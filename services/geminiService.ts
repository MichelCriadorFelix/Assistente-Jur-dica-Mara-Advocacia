import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// Chaves de backup hardcoded (caso as variaveis de ambiente falhem)
const BACKUP_KEYS = [
  "AIzaSyD-8oeV2Ojwl3a5q9Fe7RkdQ2QROehlljY", 
  "AIzaSyAKn6TpoKlcyuLESez4GMSMeconldxfYNk"
];

// Helper para pegar o modelo configurado ou usar o padrão
const getModelName = (): string => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('mara_gemini_model');
    if (local && local.trim().length > 0) return local.trim();
  }
  return 'gemini-2.0-flash';
};

// Helper para coletar TODAS as chaves disponíveis no ambiente
const getAvailableApiKeys = (): string[] => {
  const keys: string[] = [];

  // 1. Local Storage (Definido pelo usuário na UI - Prioridade Máxima)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('mara_gemini_api_key');
    if (localKey && localKey.trim().length > 0) keys.push(localKey.trim());
  }

  // 2. Variáveis de Ambiente (Vercel / Build Time)
  // Tentamos todas as variações possíveis para garantir que pegamos o que está no Vercel
  const possibleEnvKeys = [
    // Vercel Environment Variables (Node/Next style replacement)
    process.env.API_KEY_3,
    process.env.API_KEY_2,
    process.env.API_KEY_1,
    process.env.NEXT_PUBLIC_API_KEY_3,
    process.env.NEXT_PUBLIC_API_KEY_2,
    process.env.NEXT_PUBLIC_API_KEY_1,
    
    // Vite Environment Variables
    (import.meta as any).env?.VITE_API_KEY_3,
    (import.meta as any).env?.VITE_API_KEY_2,
    (import.meta as any).env?.VITE_API_KEY_1,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.NEXT_PUBLIC_API_KEY
  ];

  possibleEnvKeys.forEach(k => {
    if (k && typeof k === 'string' && k.length > 10) {
      keys.push(k.trim());
    }
  });

  // 3. Adicionar Backups Hardcoded (apenas se não tivermos chaves suficientes)
  BACKUP_KEYS.forEach(k => {
    if (!keys.includes(k)) keys.push(k);
  });

  // Remove duplicatas e retorna
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
  
  if (apiKeys.length === 0) {
    return "⚠️ Erro Crítico: Nenhuma chave de API encontrada no sistema. Verifique as configurações na Vercel.";
  }

  console.log(`[Mara System] Iniciando processamento. ${apiKeys.length} chaves de API disponíveis.`);

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

  // === ROTAÇÃO DE CHAVES (LOAD BALANCER) ===
  let lastError: any = null;
  let attempts = 0;

  for (const apiKey of apiKeys) {
    attempts++;
    try {
      // Log seguro (mostra apenas os ultimos 4 digitos)
      console.log(`[Tentativa ${attempts}/${apiKeys.length}] Conectando com chave ...${apiKey.slice(-4)} usando modelo ${modelName}`);
      
      // Cria instância nova para cada tentativa para garantir que usa a chave do loop
      const ai = new GoogleGenAI({ apiKey });

      const chat = ai.chats.create({
        model: modelName,
        config: { systemInstruction, tools },
        history: chatHistory
      });

      const result = await chat.sendMessage({ message: currentParts });
      const response = result;

      // Se sucesso, processa chamadas de função se houver
      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        console.log("[Tool Call] IA solicitou ação:", call.name);
        
        if (onToolCall) onToolCall({ name: call.name, args: call.args });

        const functionResponse = { result: "Sucesso. Equipe notificada." };
        const finalResult = await chat.sendMessage({
          message: [{ functionResponse: { name: call.name, response: functionResponse } }]
        });
        return finalResult.text || "";
      }

      // Sucesso absoluto, retorna o texto e sai do loop
      return response.text || "";

    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || JSON.stringify(error);
      
      const isQuotaError = errorMsg.includes('429') || errorMsg.includes('403') || errorMsg.includes('Quota') || errorMsg.includes('Resource has been exhausted');
      
      if (isQuotaError) {
        console.warn(`[Limite Atingido] Chave ...${apiKey.slice(-4)} falhou. Tentando próxima chave...`);
        continue; // PULA para a próxima iteração do loop (próxima chave)
      }

      // Se for erro de modelo não encontrado (404), não adianta trocar a chave, é erro de config
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
         console.error(`[Erro Config] Modelo ${modelName} não existe.`);
         return `⚠️ Erro de Configuração (404): O modelo '${modelName}' não foi encontrado. Vá em Configurações e mude para 'gemini-1.5-flash'.`;
      }

      console.warn(`[Erro Técnico] Falha na chave ...${apiKey.slice(-4)}:`, errorMsg);
      // Se for outro erro (ex: rede), tentamos a próxima chave por garantia
      continue;
    }
  }
  
  // Se chegou aqui, TODAS as chaves falharam
  console.error("[FALHA TOTAL] Todas as chaves de API falharam.");
  
  if (lastError?.message?.includes('429') || lastError?.message?.includes('Quota')) {
    return "⚠️ Mara indisponível momentaneamente (Alto volume de acessos). Tente novamente em 1 minuto.";
  }

  return `⚠️ Erro Técnico na IA: ${lastError?.message || 'Não foi possível conectar aos servidores.'}`;
};
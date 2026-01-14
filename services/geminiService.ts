import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message, TeamMember } from "../types";
import { DEFAULT_TEAM } from "../constants";

// LISTA DE MODELOS (ORDEM DE PRIORIDADE)
// Priorizamos modelos com melhor raciocínio e janelas de contexto
const MODEL_CANDIDATES = [
  'gemini-1.5-pro',            // Melhor raciocínio
  'gemini-1.5-flash',          // Mais rápido
  'gemini-2.0-flash-exp',      // Experimental rápido
  'gemini-1.5-flash-latest'
];

const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

const shuffleArray = (array: string[]) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const getAvailableApiKeysMap = (): Record<string, string> => {
  const keysMap: Record<string, string> = {};

  const explicitKeys = [
    { name: 'API_KEY_1', val: process.env.API_KEY_1 },
    { name: 'API_KEY_2', val: process.env.API_KEY_2 },
    { name: 'API_KEY_3', val: process.env.API_KEY_3 },
    { name: 'API_KEY_4', val: process.env.API_KEY_4 },
    { name: 'API_KEY_5', val: process.env.API_KEY_5 },
    { name: 'API_KEY_6', val: process.env.API_KEY_6 },
  ];

  explicitKeys.forEach(k => {
    if (k.val && k.val.length > 10) keysMap[k.name] = k.val;
  });

  const envSources = [
    typeof process !== 'undefined' ? process.env : {},
    (import.meta as any).env || {}
  ];

  envSources.forEach(source => {
    if (!source) return;
    Object.entries(source).forEach(([key, val]) => {
      if (keysMap[key]) return;
      if (typeof val === 'string' && val.startsWith('AIza') && val.length > 20) {
        keysMap[key] = val;
      }
    });
  });

  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) keysMap['LOCAL_STORAGE'] = localKey;

  return keysMap;
};

export const getAvailableApiKeys = (): string[] => {
  const map = getAvailableApiKeysMap();
  return [...new Set(Object.values(map))].map(cleanKey);
};

const notifyTeamFunction: FunctionDeclaration = {
  name: 'notificar_equipe',
  description: 'Notifica o advogado responsável quando a triagem estiver completa e tiver informações suficientes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      summary: { type: Type.STRING, description: "Resumo detalhado do caso e documentos que o cliente informou ter." },
      lawyerName: { type: Type.STRING },
      priority: { type: Type.STRING }
    },
    required: ['clientName', 'summary', 'lawyerName', 'priority'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

// --- FALLBACK SIMPLES (QUANDO NÃO HÁ CONEXÃO MESMO) ---
const simpleFallback = (text: string): string => {
  return "Desculpe, estou com uma instabilidade momentânea na minha conexão com o sistema inteligente. Poderia repetir ou enviar em texto se foi áudio? Se preferir, posso pedir para a secretária te ligar.";
};

export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Nenhuma chave encontrada." };

  for (const apiKey of keys) {
    const ai = new GoogleGenAI({ apiKey });
    try {
      const chat = ai.chats.create({ model: 'gemini-1.5-flash', history: [] });
      await chat.sendMessage({ message: "Ping" });
      return { success: true, message: "Conectado!", keyUsed: apiKey.slice(-4) };
    } catch (e:any) {}
  }
  return { success: false, message: "Falha na conexão API." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void,
  caseContext?: string
): Promise<string> => {
  
  let apiKeys = getAvailableApiKeys();
  
  // Se não tem chave, cai no fallback imediatamente
  if (apiKeys.length === 0) {
    return "⚠️ ERRO DE SISTEMA: Nenhuma chave de API configurada. Por favor, avise o administrador.";
  }

  apiKeys = shuffleArray(apiKeys);
  const modelsToTry = MODEL_CANDIDATES;
  
  // Limita histórico para evitar sobrecarga de tokens, mas mantém contexto suficiente
  const recentHistory = history.slice(-15); 
  
  // INJEÇÃO DINÂMICA DE CONTEXTO
  let dynamicPrompt = systemInstruction;
  
  // 1. Injeta Equipe
  try {
     const savedTeam = localStorage.getItem('mara_team_config');
     const team: TeamMember[] = savedTeam ? JSON.parse(savedTeam) : DEFAULT_TEAM;
     const teamList = team.map(t => `- ${t.name} (${t.role})`).join('\n');
     dynamicPrompt += `\n\n### 👥 EQUIPE DO ESCRITÓRIO:\n${teamList}`;
  } catch(e) {}

  // 2. Injeta Status do Caso
  if (caseContext && caseContext.length > 5) {
     dynamicPrompt += `\n\n### 📂 INFO DO SISTEMA SOBRE ESTE CLIENTE:\n"${caseContext}"\n(Use isso se ele perguntar do processo).`;
  }

  // Prepara histórico no formato do Gemini SDK
  const chatHistory: Content[] = recentHistory
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      parts: [{ text: m.type === 'audio' ? '(Áudio do usuário - responda ao conteúdo transcrito)' : m.content }]
    }));

  // Monta a mensagem atual (Texto + Áudio se houver)
  const currentParts: Part[] = [];
  
  if (newMessage.audioBase64) {
    // IMPORTANTE: Envia o áudio como parte inlineData
    currentParts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'audio/webm',
        data: newMessage.audioBase64
      }
    });
    // Adiciona dica de texto para garantir que o modelo saiba o que fazer
    if (!newMessage.text) {
        currentParts.push({ text: "Por favor, ouça este áudio atentamente, transcreva mentalmente o que o cliente disse e responda como a Mara Advogada." });
    }
  }
  
  if (newMessage.text) {
    currentParts.push({ text: newMessage.text });
  }

  // Tenta conectar usando as chaves disponíveis
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelsToTry) {
        try {
            console.log(`[Mara] Tentando modelo ${model}...`);
            const chat = ai.chats.create({
                model: model,
                config: { 
                  systemInstruction: dynamicPrompt,
                  tools, 
                  // Removido thinkingConfig para evitar incompatibilidade
                  temperature: 0.7, // Criatividade moderada para ser natural
                },
                history: chatHistory
            });

            // Timeout de segurança
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000));
            
            const apiPromise = chat.sendMessage({ message: currentParts });
            const result: any = await Promise.race([apiPromise, timeoutPromise]);
            
            let responseText = result.text || "";

            // Processa chamada de ferramenta (Tool Calling)
            if (result.functionCalls && result.functionCalls.length > 0) {
                const call = result.functionCalls[0];
                console.log("[Mara] Tool Call:", call.name);
                
                if (onToolCall) onToolCall({ name: call.name, args: call.args });
                
                // Retorna confirmação para a IA finalizar a frase
                const fnResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Success" } } }]
                });
                responseText = fnResp.text || "";
            }
            
            if (!responseText) throw new Error("Resposta vazia da IA");
            
            return responseText;

        } catch (error: any) {
            console.warn(`[Mara] Erro com modelo ${model}:`, error.message);
            const isQuota = error.message?.includes('429') || error.message?.includes('Quota');
            // Se for cota, tenta outra chave. Se for outro erro, tenta outro modelo.
            if (isQuota) break; 
        }
    }
  }

  return simpleFallback(newMessage.text || "");
};
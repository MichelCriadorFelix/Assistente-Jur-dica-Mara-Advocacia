import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message, TeamMember } from "../types";
import { DEFAULT_TEAM } from "../constants";

// LISTA DE MODELOS (ORDEM DE PRIORIDADE)
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',          
  'gemini-1.5-flash-latest',   
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro'      
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
  description: 'Notifica o advogado responsável com o relatório completo.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      summary: { type: Type.STRING },
      lawyerName: { type: Type.STRING },
      priority: { type: Type.STRING }
    },
    required: ['clientName', 'summary', 'lawyerName', 'priority'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

// --- IA NATIVA 4.0 (FLUXO NATURAL) ---
// Tenta "adivinhar" o que o usuário quer sem depender de números
const runNativeMara = async (
  history: Message[], 
  lastUserText: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  console.log("[Mara Native] Analisando intenção natural...");
  
  const lower = lastUserText.toLowerCase().trim();
  const lastBotMsg = [...history].reverse().find(m => m.role === 'model')?.content || "";
  
  // 1. SAUDAÇÃO / INÍCIO (Se for a primeira interação ou 'oi')
  if (history.length < 3 || ['oi', 'olá', 'bom dia', 'tarde', 'noite'].some(x => lower.includes(x))) {
    return "Olá! Sou a Mara, assistente da Felix e Castro. ⚖️\n\nEm vez de opções, prefiro que você me conte: **O que aconteceu ou qual é sua dúvida hoje?** (Pode mandar áudio se preferir).";
  }

  // 2. DETECÇÃO DE CONTEXTO (Palavras-Chave de Intent)
  const intentINSS = lower.match(/(inss|aposenta|benefício|loas|doença|encostado|perícia|auxílio)/);
  const intentLabor = lower.match(/(trabalh|empresa|patrão|demi|verba|justa causa|fgts|carteira)/);
  const intentFamily = lower.match(/(família|divórcio|separação|pensão|guarda|inventário|herança)/);

  // Contexto anterior mantido
  const ctxINSS = lastBotMsg.includes("INSS") || lastBotMsg.includes("Michel") || intentINSS;
  const ctxLabor = lastBotMsg.includes("Trabalhista") || lastBotMsg.includes("Luana") || intentLabor;
  const ctxFamily = lastBotMsg.includes("Família") || lastBotMsg.includes("Flávia") || intentFamily;

  // --- FLUXO INSS ---
  if (ctxINSS) {
    if (!lastBotMsg.includes("idade") && !lastBotMsg.includes("tempo")) {
      return "Entendi, parece ser um caso previdenciário (INSS). \n\nPara eu explicar ao Dr. Michel, me diga: Qual a sua idade e, se souber, quanto tempo de contribuição você tem?";
    }
    if (lastBotMsg.includes("idade") && !lastBotMsg.includes("Gov.br")) {
      return "Certo. E você tem a senha do **Meu INSS (Gov.br)**? Se for caso de doença, você tem laudos médicos recentes?";
    }
    if (lastBotMsg.includes("Gov.br")) {
      if (onToolCall) performHandover(history, lastUserText, "Dr. Michel Felix", onToolCall);
      return "Perfeito. Já reuni o básico. \n\nPassei seu caso para a equipe do Dr. Michel. A Fabrícia (secretária) vai te chamar para agendar a análise dos laudos. Obrigada!";
    }
  }

  // --- FLUXO TRABALHISTA ---
  if (ctxLabor) {
    if (!lastBotMsg.includes("saiu")) {
      return "Certo, questão trabalhista. \n\nMe conte: Você ainda está trabalhando ou já saiu da empresa? Se saiu, foi demitido ou pediu conta?";
    }
    if (lastBotMsg.includes("saiu") && !lastBotMsg.includes("assinada")) {
      return "Entendido. A carteira era assinada corretamente? Você tem provas (mensagens, testemunhas) do que ocorreu?";
    }
    if (lastBotMsg.includes("assinada")) {
      if (onToolCall) performHandover(history, lastUserText, "Dra. Luana Castro", onToolCall);
      return "Ok, a questão das provas é essencial. \n\nJá passei seu relato para a Dra. Luana. Vamos analisar se cabe uma ação e te retornamos em breve.";
    }
  }

  // --- FLUXO FAMÍLIA ---
  if (ctxFamily) {
    if (!lastBotMsg.includes("filhos")) {
      return "Entendi, área de família. \n\nHá filhos menores de idade envolvidos? E existem bens a partilhar (casa, carro)?";
    }
    if (lastBotMsg.includes("filhos") && !lastBotMsg.includes("acordo")) {
      return "Ok. E a relação com a outra parte: Vocês conversam e existe chance de **acordo**, ou está havendo briga (litígio)?";
    }
    if (lastBotMsg.includes("acordo")) {
      if (onToolCall) performHandover(history, lastUserText, "Dra. Flávia Zacarias", onToolCall);
      return "Anotado. O tipo de conflito define a estratégia. \n\nRelatei tudo para a Dra. Flávia. Aguarde nosso contato para agendamento!";
    }
  }

  // Se não entendeu nada, pede esclarecimento
  return "Desculpe, não entendi se é um caso de INSS, Trabalho ou Família. Poderia me explicar um pouco melhor o que houve?";
};

// Helper para finalizar o atendimento no modo nativo
const performHandover = (history: Message[], lastText: string, lawyer: string, onToolCall: (t: any) => void) => {
  const fullSummary = history.filter(m => m.role === 'user').map(m => m.content).join(" | ") + " | " + lastText;
  onToolCall({
    name: 'notificar_equipe',
    args: {
      clientName: 'Cliente (Triagem Natural)',
      summary: `TRIAGEM AUTOMÁTICA:\n${fullSummary}`,
      lawyerName: lawyer,
      priority: 'Alta'
    }
  });
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
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  let apiKeys = getAvailableApiKeys();
  
  if (apiKeys.length === 0) {
    return runNativeMara(history, newMessage.text || "", onToolCall);
  }

  apiKeys = shuffleArray(apiKeys);
  const modelsToTry = MODEL_CANDIDATES;
  const recentHistory = history.slice(-10); 
  
  // Tenta injetar os nomes da equipe no Prompt dinamicamente
  let dynamicPrompt = systemInstruction;
  try {
     const savedTeam = localStorage.getItem('mara_team_config');
     const team: TeamMember[] = savedTeam ? JSON.parse(savedTeam) : DEFAULT_TEAM;
     const teamList = team.map(t => `- ${t.name} (${t.role})`).join('\n');
     dynamicPrompt += `\n\n### 👥 EQUIPE ATUAL DO ESCRITÓRIO:\n${teamList}\nUse estes nomes para direcionar o cliente.`;
  } catch(e) {}

  const chatHistory: Content[] = recentHistory
    .filter(m => m.role !== 'system' && !m.content.includes('⚠️'))
    .map(m => ({
      role: m.role,
      parts: [{ text: m.type === 'audio' ? '(Áudio do usuário)' : m.content }]
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
  const textToSend = newMessage.text || "(Áudio)";
  if (newMessage.text) currentParts.push({ text: newMessage.text });

  // MODO 2: Tenta API do Google
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelsToTry) {
        try {
            const chat = ai.chats.create({
                model: model,
                config: { 
                  systemInstruction: dynamicPrompt,
                  tools, 
                  thinkingConfig: { thinkingBudget: 0 } 
                },
                history: chatHistory
            });

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 12000));
            const apiPromise = chat.sendMessage({ message: currentParts });

            const result: any = await Promise.race([apiPromise, timeoutPromise]);
            
            let responseText = result.text || "";

            if (result.functionCalls && result.functionCalls.length > 0) {
                const call = result.functionCalls[0];
                if (onToolCall) onToolCall({ name: call.name, args: call.args });
                const fnResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
                });
                responseText = fnResp.text || "";
            }
            
            return responseText;

        } catch (error: any) {
            const isQuota = error.message?.includes('429') || error.message?.includes('Quota');
            if (isQuota) break; 
        }
    }
  }

  return runNativeMara(history, textToSend, onToolCall);
};
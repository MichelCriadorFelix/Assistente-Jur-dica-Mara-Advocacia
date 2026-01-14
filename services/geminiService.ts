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

// --- CÉREBRO NATIVO (INTELIGÊNCIA DE CONTINGÊNCIA) ---
// Esta função substitui a IA quando há falhas, mas agora com MEMÓRIA.

interface ConversationState {
  area: 'INSS' | 'TRABALHISTA' | 'FAMILIA' | 'UNKNOWN';
  hasAge: boolean;
  hasContribution: boolean;
  hasJobStatus: boolean; // Se trabalha ou saiu
  hasChildrenInfo: boolean;
  detectedName: string;
}

const analyzeHistory = (history: Message[], currentText: string): ConversationState => {
  const fullText = history.filter(m => m.role === 'user').map(m => m.content).join(' ') + ' ' + currentText;
  const lower = fullText.toLowerCase();

  const state: ConversationState = {
    area: 'UNKNOWN',
    hasAge: false,
    hasContribution: false,
    hasJobStatus: false,
    hasChildrenInfo: false,
    detectedName: 'Cliente'
  };

  // 1. Detecção de Área
  if (lower.match(/(inss|aposenta|benefício|loas|doença|perícia|auxílio|contribuição|idade)/)) state.area = 'INSS';
  else if (lower.match(/(trabalh|patrão|empresa|demi|verba|fgts|salário|justa causa)/)) state.area = 'TRABALHISTA';
  else if (lower.match(/(família|divórcio|separação|pensão|guarda|inventário|pai|mãe)/)) state.area = 'FAMILIA';

  // 2. Extração de Dados (Regex Inteligente)
  // Idade: "65 anos", "tenho 65", "minha idade é 65"
  if (lower.match(/(\d+)\s*(anos|idade)/) || lower.match(/(tenho)\s*(\d+)/)) state.hasAge = true;
  
  // Contribuição: "16 anos de contribuição", "contribui 15 anos", "tempo de casa"
  if (lower.match(/(\d+)\s*(anos|meses)\s*(de)?\s*(contribui|carteira|registro|tempo)/)) state.hasContribution = true;

  // Status Trabalho: "estou trabalhando", "sai da empresa", "fui demitido", "mandaram embora"
  if (lower.match(/(sai|demiti|trabalhando|ainda estou|mandou|justa causa)/)) state.hasJobStatus = true;

  // Filhos: "tenho filhos", "dois filhos", "criança"
  if (lower.match(/(filho|criança|menor)/)) state.hasChildrenInfo = true;

  return state;
};

const runNativeMara = async (
  history: Message[], 
  lastUserText: string,
  onToolCall?: (toolCall: any) => void,
  caseContext?: string
): Promise<string> => {
  console.log("[Mara Native] Cérebro Lógico Ativado...");
  
  const lower = lastUserText.toLowerCase().trim();
  
  // 1. Prioridade Absoluta: Respostas diretas ao Prontuário
  if (caseContext && lower.match(/(como está|andamento|novidades|processo|status)/)) {
     return `Oi! Consultei aqui o sistema rapidinho. \n\n${caseContext}\n\nFique tranquilo, estamos monitorando!`;
  }

  // 2. Analisa o estado atual da conversa (MEMÓRIA)
  const state = analyzeHistory(history, lastUserText);

  // 3. Verifica se é Saudações/Small Talk (Apenas no início)
  if (history.length < 2 && /(oi|ola|olá|bom dia|tarde|noite|tudo bem)/.test(lower)) {
    return "Olá! Tudo bem? Sou a Mara, da Felix e Castro Advocacia. 👋\n\nEstou aqui para te ajudar. Pode me contar o que aconteceu?";
  }

  // 4. LÓGICA DE DECISÃO BASEADA NO ESTADO (STATE MACHINE)

  // --- ROTEIRO INSS ---
  if (state.area === 'INSS') {
    // Se tem idade E contribuição -> Finaliza
    if (state.hasAge && state.hasContribution) {
       if (onToolCall) performHandover(history, lastUserText, "Dr. Michel Felix", onToolCall);
       return "Perfeito. Vi aqui que você já tem a idade e o tempo de contribuição. É um caso excelente para o Dr. Michel analisar. \n\nVocê tem a senha do 'Meu INSS'? Se tiver, já agiliza muito. Vou pedir para a secretária te chamar para agendar.";
    }
    // Se tem idade mas falta contribuição
    if (state.hasAge && !state.hasContribution) {
      return "Entendi. A idade você já tem. \n\nE sobre o tempo de trabalho: você sabe mais ou menos quantos anos tem de carteira assinada ou carnê?";
    }
    // Se falta idade (mas sabemos que é INSS)
    if (!state.hasAge) {
      return "Certo, questão previdenciária. \n\nPara o Dr. Michel fazer o cálculo, qual a sua idade exata hoje?";
    }
  }

  // --- ROTEIRO TRABALHISTA ---
  if (state.area === 'TRABALHISTA') {
    if (state.hasJobStatus) {
       if (onToolCall) performHandover(history, lastUserText, "Dra. Luana Castro", onToolCall);
       return "Entendido. Situações trabalhistas têm prazos curtos. \n\nJá registrei seu relato para a Dra. Luana. Como você já informou sua situação na empresa, vamos analisar se cabe um pedido de rescisão indireta ou indenização. Aguarde nosso contato ainda hoje.";
    }
    return "Compreendo. Problemas no trabalho são estressantes. \n\nMe diga uma coisa importante: Você ainda está trabalhando na empresa ou já saiu (foi demitido ou pediu conta)?";
  }

  // --- ROTEIRO FAMÍLIA ---
  if (state.area === 'FAMILIA') {
     if (state.hasChildrenInfo) {
        if (onToolCall) performHandover(history, lastUserText, "Dra. Flávia Zacarias", onToolCall);
        return "Certo. Quando envolve crianças, a prioridade é total. \n\nPassei o caso para a Dra. Flávia. Ela vai analisar a questão da pensão e guarda com todo cuidado. Nossa equipe vai te chamar.";
     }
     return "Entendi. Para questões de família, a Dra. Flávia precisa saber: Existem filhos menores de idade envolvidos ou bens (casa, carro) para dividir?";
  }

  // --- ÁREA DESCONHECIDA (GENÉRICO INTELIGENTE) ---
  // Se chegou aqui, o usuário falou algo, mas não detectamos a área.
  // Evita perguntar "que detalhes?" se o usuário já falou muito.
  if (lastUserText.length > 50) {
     return "Li seu relato. Parece ser uma situação que precisamos resolver logo. \n\nÉ algo mais voltado para direitos trabalhistas, INSS ou questão familiar? Me confirme para eu chamar o advogado certo.";
  }

  return "Entendo. Estou te ouvindo. \n\nIsso que você mencionou tem a ver com seu Trabalho, com o INSS ou é algo de Família? Me conte um pouquinho mais.";
};

// Helper para finalizar o atendimento no modo nativo
const performHandover = (history: Message[], lastText: string, lawyer: string, onToolCall: (t: any) => void) => {
  const fullSummary = history.filter(m => m.role === 'user').map(m => m.content).join(" | ") + " | " + lastText;
  onToolCall({
    name: 'notificar_equipe',
    args: {
      clientName: 'Cliente (Via Chat)',
      summary: fullSummary,
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
  onToolCall?: (toolCall: any) => void,
  caseContext?: string // NOVO PARAMETRO
): Promise<string> => {
  
  let apiKeys = getAvailableApiKeys();
  
  if (apiKeys.length === 0) {
    return runNativeMara(history, newMessage.text || "", onToolCall, caseContext);
  }

  apiKeys = shuffleArray(apiKeys);
  const modelsToTry = MODEL_CANDIDATES;
  const recentHistory = history.slice(-10); 
  
  // INJEÇÃO DINÂMICA DE CONTEXTO
  let dynamicPrompt = systemInstruction;
  
  // 1. Injeta Equipe
  try {
     const savedTeam = localStorage.getItem('mara_team_config');
     const team: TeamMember[] = savedTeam ? JSON.parse(savedTeam) : DEFAULT_TEAM;
     const teamList = team.map(t => `- ${t.name} (${t.role})`).join('\n');
     dynamicPrompt += `\n\n### 👥 EQUIPE ATUAL DO ESCRITÓRIO:\n${teamList}\nUse estes nomes para direcionar o cliente.`;
  } catch(e) {}

  // 2. Injeta Status do Caso (Prontuário)
  if (caseContext && caseContext.length > 5) {
     dynamicPrompt += `\n\n### 📂 PRONTUÁRIO/STATUS ATUAL DO CLIENTE (MUITO IMPORTANTE):\nO advogado deixou a seguinte nota sobre o andamento deste caso:\n"${caseContext}"\n\nSE O CLIENTE PERGUNTAR SOBRE ANDAMENTO, DATA DE PERÍCIA OU STATUS, USE ESTA INFORMAÇÃO PARA RESPONDER. SEJA CLARO E TRANQUILIZE O CLIENTE.`;
  }

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

  return runNativeMara(history, textToSend, onToolCall, caseContext);
};
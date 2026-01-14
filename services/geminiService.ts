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

// --- IA NATIVA 4.0 (FLUXO NATURAL & CONTEXTUAL) ---
const runNativeMara = async (
  history: Message[], 
  lastUserText: string,
  onToolCall?: (toolCall: any) => void,
  caseContext?: string
): Promise<string> => {
  console.log("[Mara Native] Analisando intenção natural...");
  
  // 1. Resposta sobre Prontuário (Contexto Prioritário)
  if (caseContext && lastUserText.toLowerCase().match(/(como está|andamento|novidades|processo|perícia|audiência|status)/)) {
     return `Verifiquei aqui no sistema sobre o seu caso:\n\n"${caseContext}"\n\nQualquer outra dúvida sobre isso, pode me perguntar.`;
  }
  
  const lower = lastUserText.toLowerCase().trim();
  const lastBotMsg = [...history].reverse().find(m => m.role === 'model')?.content || "";
  
  // 2. Detecção de Intent e Sentimento Simples
  // Se for apenas saudação, seja receptiva
  if (history.length < 3 || ['oi', 'olá', 'bom dia', 'tarde', 'noite', 'tudo bem'].some(x => lower === x || lower.startsWith(x + ' '))) {
    return "Olá! Aqui é a Mara. ⚖️\n\nEstou pronta para te ouvir. Pode me contar o que aconteceu ou qual sua dúvida hoje?";
  }

  // 3. Lógica Contextual (Simulada sem LLM)
  
  // --- INSS ---
  if (lower.match(/(inss|aposenta|benefício|loas|doença|encostado|perícia|auxílio)/)) {
      if (lower.includes("negado") || lower.includes("cortaram")) {
          return "Poxa, ter o benefício negado é muito frustrante. 😟 Mas podemos reverter.\n\nVocê tem os laudos médicos atuais e a carta de indeferimento do INSS?";
      }
      return "Entendo, questões com o INSS exigem cuidado. \n\nPara o Dr. Michel analisar, me diga: Qual a sua idade hoje e há quanto tempo você contribui?";
  }

  // --- TRABALHISTA ---
  if (lower.match(/(trabalh|empresa|patrão|demi|verba|justa causa|fgts|carteira|salário)/)) {
      if (lower.includes("não pagou") || lower.includes("atrasado")) {
          return "Isso é grave. O salário é sagrado. \n\nEsse atraso acontece há muito tempo? Sua carteira é assinada?";
      }
      if (lower.includes("demiti") || lower.includes("mandou embora")) {
         return "Sinto muito por isso. Perder o emprego é difícil. \n\nVocê sabe se eles vão pagar todos os seus direitos na rescisão? Você tinha carteira assinada?";
      }
      return "Certo, assunto trabalhista. \n\nPara eu passar para a Dra. Luana: Você ainda está trabalhando lá ou já saiu?";
  }

  // --- FAMÍLIA ---
  if (lower.match(/(família|divórcio|separação|pensão|guarda|inventário|herança|ex-marido|ex-mulher)/)) {
      if (lower.includes("não paga") && lower.includes("pensão")) {
          return "Entendo perfeitamente sua preocupação. A pensão é direito da criança. \n\nJá existe um valor fixado pelo juiz ou era apenas um acordo de boca?";
      }
      return "Compreendo. Assuntos de família mexem com a gente. \n\nPara a Dra. Flávia te orientar melhor: Existem filhos menores de idade envolvidos nesse caso?";
  }

  // Continuidade de conversa (Memória Curta Simulada)
  if (lastBotMsg.includes("idade") && lower.match(/\d+/)) {
      return "Certo. E você tem acesso à senha do site 'Meu INSS' (Gov.br)? Isso ajuda muito na análise do Dr. Michel.";
  }
  if (lastBotMsg.includes("carteira") && (lower.includes("sim") || lower.includes("não"))) {
      if (onToolCall) performHandover(history, lastUserText, "Dra. Luana Castro", onToolCall);
      return "Entendido. A falta de registro ou pagamento errado gera muitos direitos. \n\nJá passei seu relato para a Dra. Luana. Vamos analisar se cabe uma ação urgente. A Fabrícia vai entrar em contato para agendar.";
  }

  // Fallback genérico, mas educado
  return "Entendi. Pode me dar mais alguns detalhes sobre isso? Quanto mais você me contar, melhor consigo explicar para o advogado responsável.";
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
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

// --- IA NATIVA 4.0 (LÓGICA CONSULTIVA & FLUIDA) ---
// Essa função roda quando a API do Google falha, garantindo que a Mara não fique "burra".
const runNativeMara = async (
  history: Message[], 
  lastUserText: string,
  onToolCall?: (toolCall: any) => void,
  caseContext?: string
): Promise<string> => {
  console.log("[Mara Native] Modo Consultivo Ativado...");
  
  const lower = lastUserText.toLowerCase().trim();
  const cleanText = lower.replace(/[!?.s]/g, ' ').trim(); 
  
  // Recupera a última coisa que a MARA disse para manter o contexto
  const lastBotMsgRaw = [...history].reverse().find(m => m.role === 'model')?.content || "";
  const lastBotMsg = lastBotMsgRaw.toLowerCase();

  // 1. PRIORIDADE: CONTEXTO DO CASO (PRONTUÁRIO)
  if (caseContext && lower.match(/(como está|andamento|novidades|processo|perícia|audiência|status|notícias)/)) {
     return `Oi! Consultei aqui o sistema rapidinho. \n\n${caseContext}\n\nFique tranquilo, qualquer novidade extra te avisamos!`;
  }

  // 2. DETECÇÃO DE PERGUNTA DO USUÁRIO (EVITA O LOOP "QUE DETALHES?")
  if (lower.includes('que detalhes') || lower.includes('quais detalhes') || lower.includes('como assim') || lower.includes('o que falar')) {
    return "Ah, desculpe! 😅 Eu preciso saber um pouco sobre o que aconteceu para chamar o advogado certo.\n\nPor exemplo: é sobre demissão no trabalho? Benefício do INSS negado? Ou pensão alimentícia?";
  }

  // 3. SAUDAÇÕES (Respondendo com educação)
  if (/(oi|ola|olá|bom dia|boa tarde|boa noite|tudo bem|ei|opa)\b/.test(lower) && history.length < 3) {
    return "Olá! Tudo bem? Sou a Mara, assistente virtual da Felix e Castro. 👋\n\nPode me contar o que houve? Estou aqui para te ouvir.";
  }

  // 4. LÓGICA DE CONTEXTO (Respondendo perguntas anteriores)
  
  // Se a Mara perguntou idade antes...
  if (lastBotMsg.includes('idade') || lastBotMsg.includes('anos')) {
    if (lower.match(/\d+/)) {
       return "Certo, anotei sua idade. E você sabe me dizer quanto tempo de contribuição (registro) você tem mais ou menos?";
    }
  }

  // Se a Mara perguntou se trabalha ou saiu...
  if ((lastBotMsg.includes('trabalhando') || lastBotMsg.includes('saiu')) && (lower.includes('sai') || lower.includes('trabalho') || lower.includes('ainda'))) {
     return "Entendi. E sua carteira de trabalho foi assinada direitinho ou não registraram?";
  }

  // 5. DETECÇÃO DE ÁREA (INTENT RECOGNITION)

  // --- INSS ---
  if (lower.match(/(inss|aposenta|benefício|loas|doença|encostado|perícia|auxílio|bpc|deficiente)/)) {
      return "Entendi, é uma questão previdenciária. O Dr. Michel é especialista nisso. \n\nVocê já deu entrada no pedido e foi negado, ou quer dar entrada agora?";
  }

  // --- TRABALHISTA ---
  if (lower.match(/(trabalh|empresa|patrão|demi|verba|justa causa|fgts|carteira|salário|acerto|rescisão)/)) {
      return "Compreendo, parece ser um caso trabalhista para a Dra. Luana. \n\nMe diga uma coisa: você ainda está trabalhando na empresa ou já saiu?";
  }

  // --- FAMÍLIA ---
  if (lower.match(/(família|divórcio|separação|pensão|guarda|inventário|herança|ex-marido|ex-mulher|visita)/)) {
      return "Certo, assuntos de família precisam de atenção especial da Dra. Flávia. \n\nNesse caso, existem filhos menores de idade envolvidos?";
  }

  // 6. ENCERRAMENTO DE TRIAGEM (HANDOVER)
  // Se o usuário já falou bastante (heurística simples)
  if (history.length > 6) {
      if (onToolCall) {
        const fullSummary = history.filter(m => m.role === 'user').map(m => m.content).join(" | ");
        onToolCall({
          name: 'notificar_equipe',
          args: {
            clientName: 'Cliente (Via Chat)',
            summary: fullSummary,
            lawyerName: 'A Definir na Triagem',
            priority: 'Média'
          }
        });
      }
      return "Obrigada pelas informações! 🙏\n\nJá passei tudo para a nossa equipe. Como seu caso tem detalhes importantes, vou pedir para a secretária analisar a agenda dos advogados e entrar em contato com você ainda hoje.";
  }

  // 7. FALLBACK INTELIGENTE (QUANDO NÃO ENTENDE)
  // Em vez de "Não entendi", ela oferece opções.
  return "Entendi que você precisa de ajuda jurídica. \n\nPara eu chamar o especialista certo, me fale só mais uma coisa: \nIsso é sobre algum problema no **Trabalho**, com o **INSS** ou questão de **Família**?";
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
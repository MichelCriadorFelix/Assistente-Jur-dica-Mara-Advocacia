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
// Esta função substitui a IA quando há falhas, mas agora com MEMÓRIA, IDENTIDADE E CAPACIDADE EXPLICATIVA.

interface ConversationState {
  area: 'INSS' | 'TRABALHISTA' | 'FAMILIA' | 'UNKNOWN';
  hasAge: boolean;
  hasContribution: boolean;
  hasJobStatus: boolean; 
  hasChildrenInfo: boolean;
  userName: string | null;
  honorific: string; // Sr. ou Sra.
  isQuestioning: boolean; // O usuário está fazendo uma pergunta?
}

const analyzeHistory = (history: Message[], currentText: string): ConversationState => {
  const fullText = history.filter(m => m.role === 'user').map(m => m.content).join(' ') + ' ' + currentText;
  const lower = fullText.toLowerCase();
  const currentLower = currentText.toLowerCase();

  const state: ConversationState = {
    area: 'UNKNOWN',
    hasAge: false,
    hasContribution: false,
    hasJobStatus: false,
    hasChildrenInfo: false,
    userName: null,
    honorific: '',
    isQuestioning: false
  };

  // 1. Detecção de Dúvida/Pergunta do Usuário
  if (currentLower.match(/(o que é|como funciona|pra que serve|tenho direito|não entendi|explica|dúvida|que senha|que isso)/)) {
    state.isQuestioning = true;
  }

  // 2. Detecção de Nome (Simples)
  const nameMatch = fullText.match(/(?:sou|chamo|nome é|aqui é|fala o|fala a)\s+([A-Z][a-zà-ú]+)/);
  if (nameMatch) {
    state.userName = nameMatch[1];
    if (state.userName.endsWith('a') || state.userName.endsWith('e')) state.honorific = 'Sra.';
    else state.honorific = 'Sr.';
  }

  // 3. Detecção de Área
  if (lower.match(/(inss|aposenta|benefício|loas|doença|perícia|auxílio|contribuição|idade|encostado|bpc|laudo|senha)/)) state.area = 'INSS';
  else if (lower.match(/(trabalh|patrão|empresa|demi|verba|fgts|salário|justa causa|botar no pau|acionar|direitos|acerto)/)) state.area = 'TRABALHISTA';
  else if (lower.match(/(família|divórcio|separação|pensão|guarda|inventário|pai|mãe|marido|esposa|filhos)/)) state.area = 'FAMILIA';

  // 4. Extração de Dados
  if (lower.match(/(\d+)\s*(anos|idade)/) || lower.match(/(tenho)\s*(\d+)/)) state.hasAge = true;
  if (lower.match(/(\d+)\s*(anos|meses)\s*(de)?\s*(contribui|carteira|registro|tempo)/)) state.hasContribution = true;
  if (lower.match(/(sai|demiti|trabalhando|ainda estou|mandou|justa causa|assinada)/)) state.hasJobStatus = true;
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
  const state = analyzeHistory(history, lastUserText);
  const treatment = state.userName ? `${state.honorific} ${state.userName}` : "Sr(a).";

  // 0. Prioridade: Responder Dúvidas (EDUCAÇÃO)
  // Se o usuário fez uma pergunta, EXPLICAMOS antes de seguir o script.
  if (state.isQuestioning) {
     if (lower.includes('senha') || lower.includes('gov') || lower.includes('inss')) {
        return `Boa pergunta, ${treatment}. \n\nA senha do 'Meu INSS' (ou Gov.br) é aquele cadastro único do governo. Nós precisamos dela para puxar seu extrato de contribuições (CNIS). Sem ela, o cálculo fica incompleto. \n\nO(A) senhor(a) lembra de ter feito esse cadastro ou tem anotado?`;
     }
     if (lower.includes('direito') || lower.includes('consigo')) {
        return `Essa é a dúvida de muita gente, ${treatment}. \n\nPara saber se tem direito exato, precisamos analisar os documentos. Cada caso é único. Mas fique tranquilo(a), nosso escritório é especialista nisso. \n\nPode me contar mais detalhes para eu ajudar?`;
     }
     if (lower.includes('carteira') || lower.includes('sujar')) {
        return `Não se preocupe com isso, ${treatment}. Buscar seus direitos na justiça não 'suja' sua carteira de trabalho para futuros empregos. Isso é um mito. O importante agora é não perder o prazo.`;
     }
     return `Entendi sua dúvida, ${treatment}. É um ponto importante. Vou pedir para o advogado explicar isso detalhadamente para você no atendimento presencial ou ligação, pode ser? \n\nEnquanto isso, me diga apenas mais uma coisa para eu adiantar o caso...`;
  }

  // 1. Prioridade: Identidade
  if (!state.userName && history.length < 4 && !lower.match(/(nome|chamo|sou)/)) {
     return "Olá! Sou a Mara, assistente da Felix e Castro Advocacia. 👋\n\nAntes de conversarmos, qual é o seu nome, por favor? Assim posso te chamar corretamente.";
  }

  // 2. Prioridade: Prontuário
  if (caseContext && lower.match(/(como está|andamento|novidades|processo|status)/)) {
     return `Oi ${treatment}! Consultei aqui o sistema. \n\n${caseContext}\n\nQualquer novidade te avisamos na hora!`;
  }

  // 3. LÓGICA DE DECISÃO POR ÁREA

  // --- ROTEIRO INSS ---
  if (state.area === 'INSS') {
    if (state.hasAge && state.hasContribution) {
       if (onToolCall) performHandover(history, lastUserText, "Dr. Michel Felix", onToolCall);
       return `Entendi tudo, ${treatment}. \n\nCom sua idade e esse tempo de contribuição, temos boas chances de conseguir um benefício melhor. O Dr. Michel é 'expert' nisso. \n\nJá anotei tudo aqui. A Fabrícia vai te chamar para agendar o cálculo, ok?`;
    }
    if (!state.hasAge) {
      return `Certo, ${treatment}. Para aposentadoria, cada mês conta. \n\nQual a sua idade exata hoje?`;
    }
    return `Entendi. E sobre o tempo de carteira assinada ou carnê: ${treatment}, o(a) senhor(a) sabe mais ou menos quantos anos somados já pagou ao INSS?`;
  }

  // --- ROTEIRO TRABALHISTA ---
  if (state.area === 'TRABALHISTA') {
    if (state.hasJobStatus) {
       if (onToolCall) performHandover(history, lastUserText, "Dra. Luana Castro", onToolCall);
       return `Compreendo, ${treatment}. \n\nNesses casos trabalhistas, temos prazos para entrar com a ação. Já passei seu relato com urgência para a Dra. Luana Castro. Vamos lutar pelos seus direitos. Aguarde nosso contato.`;
    }
    return `Situação chata essa com a empresa, né ${treatment}? Sinto muito. \n\nMas me diga: você ainda está trabalhando lá ou já saiu (foi mandado embora)?`;
  }

  // --- ROTEIRO FAMÍLIA ---
  if (state.area === 'FAMILIA') {
     if (state.hasChildrenInfo) {
        if (onToolCall) performHandover(history, lastUserText, "Dra. Flávia Zacarias", onToolCall);
        return `Pode deixar comigo, ${treatment}. \n\nQuestões de família exigem delicadeza. A Dra. Flávia vai cuidar disso pessoalmente para proteger seus interesses. Nossa equipe vai entrar em contato.`;
     }
     return `Entendi, ${treatment}. Para a Dra. Flávia te orientar sobre pensão ou guarda: Tem crianças menores de idade envolvidas?`;
  }

  // --- GENÉRICO INTELIGENTE ---
  if (lastUserText.length > 30) {
     return `Li com atenção seu relato, ${treatment}. \n\nPara eu chamar o especialista certo: Isso é mais sobre o seu Trabalho, sobre o INSS/Aposentadoria ou questão de Família?`;
  }

  return `Entendo, ${treatment}. Estou te ouvindo atentamente. \n\nIsso que você falou é sobre Trabalho, INSS ou Família? Me conte um pouco mais.`;
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
  caseContext?: string
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

  // 3. TRUQUE DE ÁUDIO: Se houver áudio, adiciona instrução específica para transcrição
  if (newMessage.audioBase64) {
    dynamicPrompt += `\n\n### 🎤 INSTRUÇÃO DE ÁUDIO CRÍTICA:\nO usuário enviou um áudio. Você DEVE ouvir, transcrever internamente e analisar o conteúdo. Se o áudio for confuso ou contiver gírias (ex: "encostado", "pôs no pau"), interprete o significado jurídico e responda com empatia.`;
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
        mimeType: newMessage.mimeType || 'audio/webm;codecs=opus', // Fallback seguro
        data: newMessage.audioBase64
      }
    });
  }
  const textToSend = newMessage.text || "(Áudio enviado)";
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
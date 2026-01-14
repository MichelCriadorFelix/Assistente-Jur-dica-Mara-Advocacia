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
  description: 'Notifica o advogado responsável com o relatório completo e estruturado.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      summary: { type: Type.STRING, description: "Resumo detalhado do caso, documentos que possui e histórico." },
      lawyerName: { type: Type.STRING },
      priority: { type: Type.STRING }
    },
    required: ['clientName', 'summary', 'lawyerName', 'priority'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

// --- CÉREBRO NATIVO (INTELIGÊNCIA DE CONTINGÊNCIA) ---
// Atualizado para seguir o fluxo de 6 etapas e entender nuances do INSS

interface ConversationState {
  area: 'INSS_GERAL' | 'INSS_DOENCA' | 'INSS_BPC' | 'TRABALHISTA' | 'FAMILIA' | 'UNKNOWN';
  hasName: boolean;
  hasSummary: boolean;
  hasDocsInfo: boolean; // Sabe se tem senha/laudos/docs
  hasSystemAccess: boolean; // Sabe se tem Gov.br ou já tentou antes
  userName: string | null;
  honorific: string; // Sr. ou Sra.
  isQuestioning: boolean;
}

const analyzeHistory = (history: Message[], currentText: string): ConversationState => {
  const fullText = history.filter(m => m.role === 'user').map(m => m.content).join(' ') + ' ' + currentText;
  const lower = fullText.toLowerCase();
  const currentLower = currentText.toLowerCase();

  const state: ConversationState = {
    area: 'UNKNOWN',
    hasName: false,
    hasSummary: fullText.length > 50, // Heurística básica
    hasDocsInfo: false,
    hasSystemAccess: false,
    userName: null,
    honorific: '',
    isQuestioning: false
  };

  // 1. Detecção de Dúvida
  if (currentLower.match(/(o que é|como funciona|pra que serve|tenho direito|não entendi|explica|dúvida|que senha|que isso)/)) {
    state.isQuestioning = true;
  }

  // 2. Detecção de Nome
  const nameMatch = fullText.match(/(?:sou|chamo|nome é|aqui é|fala o|fala a)\s+([A-Z][a-zà-ú]+)/);
  if (nameMatch) {
    state.userName = nameMatch[1];
    state.hasName = true;
    if (state.userName.endsWith('a') || state.userName.endsWith('e')) state.honorific = 'Sra.';
    else state.honorific = 'Sr.';
  }

  // 3. Detecção de Área Refinada
  if (lower.match(/(doen[çc]a|laudo|médico|encostad|doente|dor|cirurgia|incapaz)/)) state.area = 'INSS_DOENCA';
  else if (lower.match(/(loas|bpc|idoso sem renda|deficiente)/)) state.area = 'INSS_BPC';
  else if (lower.match(/(inss|aposenta|tempo|contribui|cnis)/)) state.area = 'INSS_GERAL';
  else if (lower.match(/(trabalh|patrão|empresa|demi|verba|fgts|botar no pau|acerto)/)) state.area = 'TRABALHISTA';
  else if (lower.match(/(família|divórcio|separação|pensão|guarda|filhos)/)) state.area = 'FAMILIA';

  // 4. Detecção de Documentos/Sistemas
  if (lower.match(/(senha|gov\.br|meu inss|laudo|carteira|papel|documento|rg|cpf|certidão)/)) state.hasDocsInfo = true;
  if (lower.match(/(já tentei|negado|advogado antes|nunca|primeira vez|site|sistema)/)) state.hasSystemAccess = true;

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

  // FASE 0: Educação (Responder Dúvidas)
  if (state.isQuestioning) {
     if (lower.includes('senha') || lower.includes('gov')) {
        return `Boa pergunta, ${treatment}. A senha do Gov.br é sua identidade digital. Precisamos dela para acessar o sistema do INSS e ver seu histórico (CNIS) ou agendar perícias. O Sr(a). sabe se tem essa senha ativa?`;
     }
     if (lower.includes('laudo')) {
        return `O laudo médico é o documento que o doutor entrega explicando sua doença. Para o INSS, ele precisa ser recente e ter o código da doença (CID). O Sr(a). tem algum papel assim dos seus médicos?`;
     }
     return `Entendo sua dúvida, ${treatment}. Vou pedir para o advogado te explicar isso em detalhes. Mas antes, para eu deixar tudo pronto: Você tem os documentos básicos do seu caso aí?`;
  }

  // FASE 1: Identificação
  if (!state.hasName && history.length < 3 && !lower.match(/(nome|chamo|sou)/)) {
     return "Olá! Sou a Mara, assistente jurídica da Felix e Castro Advocacia. ⚖️\n\nPara eu iniciar seu atendimento, qual é o seu nome, por favor?";
  }

  // FASE 2: Entendimento do Caso (Se já temos nome, mas não sabemos a área ou detalhes)
  if (state.area === 'UNKNOWN' && lastUserText.length < 20) {
      return `Obrigada, ${treatment}. \n\nPara eu chamar o especialista correto, me conte um pouco sobre o que está acontecendo. É sobre INSS (Aposentadoria/Doença), Problema no Trabalho ou Família?`;
  }

  // FASE 3 e 4: Análise de Direito e Documentos (Específico por Área)
  
  // --- INSS DOENÇA/INCAPACIDADE ---
  if (state.area === 'INSS_DOENCA') {
      if (!state.hasDocsInfo) {
          return `Entendi, ${treatment}. Questões de saúde são delicadas. \n\nPara o Dr. Michel analisar se cabe o Auxílio-Doença, precisamos saber: O Sr(a). tem laudos médicos recentes e a senha do 'Meu INSS' (Gov.br)?`;
      }
      if (!state.hasSystemAccess) {
          return `Certo. E me diga: O Sr(a). já chegou a marcar perícia no INSS sozinho ou teve o pedido negado recentemente?`;
      }
      // FASE 5: Fechamento
      if (onToolCall) performHandover(history, lastUserText, "Dr. Michel Felix", onToolCall);
      return `Perfeito, ${treatment}. Anotei tudo sobre sua saúde e os documentos. \n\nJá estou enviando seu relatório para o Dr. Michel. A Fabrícia vai entrar em contato para agendar a análise dos seus laudos.`;
  }

  // --- INSS GERAL (APOSENTADORIA) ---
  if (state.area === 'INSS_GERAL') {
      if (!state.hasDocsInfo) {
          return `Compreendo, ${treatment}. Para calcularmos sua aposentadoria corretamente, o acesso ao CNIS é vital. \n\nO Sr(a). possui a senha do Gov.br (Meu INSS) e a Carteira de Trabalho em mãos?`;
      }
      // FASE 5: Fechamento
      if (onToolCall) performHandover(history, lastUserText, "Dr. Michel Felix", onToolCall);
      return `Ótimo, ${treatment}. Com a senha e a carteira, o Dr. Michel consegue fazer o Planejamento Previdenciário. Já repassei seu caso e a Fabrícia vai te chamar.`;
  }

  // --- TRABALHISTA ---
  if (state.area === 'TRABALHISTA') {
      if (!state.hasDocsInfo) {
          return `Entendido, ${treatment}. Para a Dra. Luana ver seus direitos: O Sr(a). tem provas do ocorrido (conversas, fotos) ou o contrato de trabalho? Ainda está na empresa ou já saiu?`;
      }
      // FASE 5: Fechamento
      if (onToolCall) performHandover(history, lastUserText, "Dra. Luana Castro", onToolCall);
      return `Certo, ${treatment}. Situações trabalhistas têm prazo curto. Já notifiquei a Dra. Luana com seu relato. Aguarde nosso contato breve.`;
  }

  // Fallback Genérico se tiver muita informação
  if (history.length > 6) {
      if (onToolCall) performHandover(history, lastUserText, "Advogado Responsável", onToolCall);
      return `Entendi todo o contexto, ${treatment}. \n\nPara não tomarmos mais seu tempo, já compilei as informações e passei para o advogado especialista analisar seu direito. Entraremos em contato em breve!`;
  }

  return `Entendi, ${treatment}. Pode me dar mais alguns detalhes sobre isso? Quanto mais você me contar, melhor consigo explicar para o advogado responsável.`;
};

// Helper para finalizar o atendimento no modo nativo
const performHandover = (history: Message[], lastText: string, lawyer: string, onToolCall: (t: any) => void) => {
  const fullSummary = history.filter(m => m.role === 'user').map(m => m.content).join(" | ") + " | " + lastText;
  onToolCall({
    name: 'notificar_equipe',
    args: {
      clientName: 'Cliente (Via Chat)',
      summary: `RELATÓRIO NATIVO: ${fullSummary}`,
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

  // 3. TRUQUE DE ÁUDIO E FONÉTICA: Instrução robusta para erros comuns
  if (newMessage.audioBase64) {
    dynamicPrompt += `\n\n### 🎤 INSTRUÇÃO DE ÁUDIO CRÍTICA:\nO usuário enviou um áudio. Você DEVE ouvir, transcrever internamente e analisar o conteúdo.\n\n⚠️ CORREÇÃO FONÉTICA OBRIGATÓRIA:\nSe ouvir "Mio INSS" -> Entenda "Meu INSS".\nSe ouvir "Qnis" -> Entenda "CNIS".\nSe ouvir "Encostado" -> Entenda "Auxílio-Doença".\nSe ouvir "Loas" -> Entenda "BPC".\n\nNão mencione que corrigiu o termo, apenas responda com o termo jurídico correto.`;
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
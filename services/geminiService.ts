import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

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

// --- IA NATIVA 3.0 (CHECKLIST JURÍDICO ROBUSTO) ---
// Opera como uma máquina de estados baseada no histórico da conversa
const runNativeMara = async (
  history: Message[], 
  lastUserText: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  console.log("[Mara Native] Executando checklist jurídico...");
  
  const lower = lastUserText.toLowerCase().trim();
  
  // Analisa a última mensagem do BOT para saber em qual "fase" estamos
  const lastBotMsg = [...history].reverse().find(m => m.role === 'model')?.content || "";
  
  // === FASE 0: BOAS VINDAS ===
  if (['oi', 'olá', 'ola', 'bom dia', 'tarde', 'noite', 'começar'].some(x => lower.includes(x)) && history.length < 3) {
    return "Olá! Sou a Mara, assistente jurídica da Felix e Castro. ⚖️\n\nPara agilizar seu atendimento, preciso saber qual a área do seu caso:\n\n1. INSS / Aposentadoria (Dr. Michel)\n2. Trabalhista (Dra. Luana)\n3. Família / Divórcio (Dra. Flávia)";
  }

  // === FASE 1: ROTEIRO INSS (DR. MICHEL) ===
  const isInssContext = lower.match(/(1|inss|aposenta|benefício|loas)/) || lastBotMsg.includes("INSS") || lastBotMsg.includes("Michel");
  
  if (isInssContext) {
    // Passo 1: Idade e Tempo (se ainda não perguntou)
    if (!lastBotMsg.includes("idade") && !lastBotMsg.includes("Gov.br")) {
      return "Certo, Previdenciário (Dr. Michel). Para verificarmos seu direito, responda:\n\nQual a sua idade exata e quanto tempo (aproximado) de contribuição você possui?";
    }
    // Passo 2: Gov.br e Senha (Crucial)
    if (lastBotMsg.includes("idade") && !lastBotMsg.includes("Gov.br")) {
      return "Entendido. Para analisar seu extrato CNIS, precisamos saber:\n\nVocê possui acesso ao **Portal Meu INSS (Gov.br)**? Tem a senha atualizada ou precisa recuperar?";
    }
    // Passo 3: Histórico de Pedidos
    if (lastBotMsg.includes("Gov.br") && !lastBotMsg.includes("negado")) {
      return "Ok. Você já tentou fazer esse pedido sozinho antes? Teve algum benefício negado recentemente pelo INSS?";
    }
    // Fim INSS
    if (lastBotMsg.includes("negado")) {
      if (onToolCall) performHandover(history, lastUserText, "Dr. Michel Felix", onToolCall);
      return "Perfeito. Coletei as informações iniciais. \n\nEstou gerando um relatório para o Dr. Michel com seus dados de acesso e histórico. A secretaria entrará em contato para a análise técnica dos documentos. Obrigada!";
    }
  }

  // === FASE 2: ROTEIRO TRABALHISTA (DRA. LUANA) ===
  const isLaborContext = lower.match(/(2|trabalh|empresa|patrão|demi)/) || lastBotMsg.includes("Trabalhista") || lastBotMsg.includes("Luana");

  if (isLaborContext) {
    if (!lastBotMsg.includes("empresa") && !lastBotMsg.includes("assinada")) {
      return "Área Trabalhista (Dra. Luana). Vamos lá:\n\nVocê ainda está trabalhando na empresa ou já saiu? Se saiu, foi demitido ou pediu conta?";
    }
    if (lastBotMsg.includes("saiu") && !lastBotMsg.includes("assinada")) {
      return "Certo. Sua carteira de trabalho era assinada corretamente? O valor do salário no contracheque era o real?";
    }
    if (lastBotMsg.includes("assinada") && !lastBotMsg.includes("provas")) {
      return "Ponto importante: Você possui **provas** do que aconteceu? \n(Ex: Conversas de WhatsApp, áudios, testemunhas ou documentos da empresa)?";
    }
    // Fim Trabalhista
    if (lastBotMsg.includes("provas")) {
      if (onToolCall) performHandover(history, lastUserText, "Dra. Luana Castro", onToolCall);
      return "Entendi. A questão das provas é fundamental. \n\nJá passei seu relato para a Dra. Luana. Vamos analisar a viabilidade da ação e te chamamos em breve.";
    }
  }

  // === FASE 3: ROTEIRO FAMÍLIA (DRA. FLÁVIA) ===
  const isFamilyContext = lower.match(/(3|família|divórcio|separação|pensão)/) || lastBotMsg.includes("Família") || lastBotMsg.includes("Flávia");

  if (isFamilyContext) {
    if (!lastBotMsg.includes("filhos") && !lastBotMsg.includes("bens")) {
      return "Área de Família (Dra. Flávia). \n\nPrimeiro: Existem filhos menores de idade envolvidos? Se sim, qual a idade deles?";
    }
    if (lastBotMsg.includes("filhos") && !lastBotMsg.includes("bens")) {
      return "Ok. Existem bens a serem partilhados (Casa, carro, terrenos) ou dívidas em comum?";
    }
    if (lastBotMsg.includes("bens") && !lastBotMsg.includes("acordo")) {
      return "Última pergunta importante: Existe possibilidade de **acordo** (consenso) com a outra parte, ou está havendo briga (litígio)?";
    }
    // Fim Família
    if (lastBotMsg.includes("acordo")) {
      if (onToolCall) performHandover(history, lastUserText, "Dra. Flávia Zacarias", onToolCall);
      return "Certo, isso muda a estratégia. \n\nPreparei o resumo do caso para a Dra. Flávia. Ela vai analisar se cabe uma mediação ou ação judicial. Aguarde nosso contato!";
    }
  }

  // === FALLBACK GENÉRICO (Se perder o fio da meada) ===
  return "Entendi. Para que eu possa preparar o relatório para o advogado, você poderia me dar mais detalhes sobre documentos ou provas que você já possui?";
};

// Helper para finalizar o atendimento no modo nativo
const performHandover = (history: Message[], lastText: string, lawyer: string, onToolCall: (t: any) => void) => {
  const fullSummary = history.filter(m => m.role === 'user').map(m => m.content).join(" | ") + " | " + lastText;
  onToolCall({
    name: 'notificar_equipe',
    args: {
      clientName: 'Cliente (Triagem Completa)',
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
  
  // MODO 1: Se não tiver chaves, usa IA Nativa direto
  if (apiKeys.length === 0) {
    return runNativeMara(history, newMessage.text || "", onToolCall);
  }

  apiKeys = shuffleArray(apiKeys);
  const modelsToTry = MODEL_CANDIDATES;
  const recentHistory = history.slice(-8); // Aumentei o contexto para 8 para caber a entrevista
  
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
                  systemInstruction, // Usa o novo prompt detalhado
                  tools, 
                  thinkingConfig: { thinkingBudget: 0 } 
                },
                history: chatHistory
            });

            // Timeout de 10 segundos (aumentei um pouco pois a resposta agora é mais complexa)
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000));
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

  // MODO 3: FALLBACK TOTAL (IA Nativa com Checklist)
  return runNativeMara(history, textToSend, onToolCall);
};
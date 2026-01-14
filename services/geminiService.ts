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
  description: 'Notifica o advogado responsável.',
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

// --- IA NATIVA (FALLBACK) ---
// Um sistema especialista simples que garante funcionamento offline/sem cota
const runNativeMara = async (
  history: Message[], 
  lastUserText: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  console.log("[Mara Native] Ativando modo de contingência...");
  const lower = lastUserText.toLowerCase();

  // 1. Identificação de Tópico
  if (lower.includes('1') || lower.includes('inss') || lower.includes('aposenta') || lower.includes('benefício')) {
    return "Entendido. Para casos de INSS (Dr. Michel), preciso saber: \n\nQual a sua idade e quanto tempo de contribuição você possui aproximadamente?";
  }
  if (lower.includes('2') || lower.includes('trabalh') || lower.includes('empresa') || lower.includes('demissão')) {
    return "Certo, área Trabalhista (Dra. Luana). \n\nVocê foi demitido recentemente? Sua carteira era assinada?";
  }
  if (lower.includes('3') || lower.includes('famíli') || lower.includes('divórci') || lower.includes('pensão')) {
    return "Ok, área de Família (Dra. Flávia). \n\nTrata-se de divórcio, guarda ou pensão alimentícia?";
  }

  // 2. Análise de Profundidade para Conclusão
  // Se já trocamos mais de 3 mensagens, assumimos que o cliente já explicou o caso
  const userMsgCount = history.filter(m => m.role === 'user').length;
  
  if (userMsgCount >= 2) {
    if (onToolCall) {
      // Simula a extração de dados
      let lawyer = "Equipe Geral";
      if (history.some(m => m.content.includes('INSS') || m.content.includes('Michel'))) lawyer = "Dr. Michel Felix";
      if (history.some(m => m.content.includes('Trabalhista') || m.content.includes('Luana'))) lawyer = "Dra. Luana Castro";
      if (history.some(m => m.content.includes('Família') || m.content.includes('Flávia'))) lawyer = "Dra. Flávia Zacarias";

      onToolCall({
        name: 'notificar_equipe',
        args: {
          clientName: 'Cliente (Via Chat)',
          summary: lastUserText,
          lawyerName: lawyer,
          priority: 'Normal'
        }
      });
    }
    return "Perfeito. Já anotei todos os detalhes e passei seu caso diretamente para a equipe jurídica. \n\nNossa secretária entrará em contato em breve para agendar sua consulta. Obrigado! ⚖️";
  }

  // 3. Resposta Genérica de Continuação
  return "Entendo. Poderia me dar mais alguns detalhes sobre isso para que eu possa orientar o advogado corretamente?";
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
  // Se não houver chaves, vai direto para o modo nativo
  if (apiKeys.length === 0) {
    return runNativeMara(history, newMessage.text || "", onToolCall);
  }

  apiKeys = shuffleArray(apiKeys);
  const modelsToTry = MODEL_CANDIDATES;
  const recentHistory = history.slice(-6); 
  
  // Prepara conteúdo
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

  // TENTA USAR A API
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelsToTry) {
        try {
            const chat = ai.chats.create({
                model: model,
                config: { systemInstruction, tools, thinkingConfig: { thinkingBudget: 0 } },
                history: chatHistory
            });

            const result = await chat.sendMessage({ message: currentParts });
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
            // Continua tentando silenciosamente...
            const isQuota = error.message?.includes('429') || error.message?.includes('Quota');
            if (isQuota) break; // Troca de chave
        }
    }
  }

  // SE TUDO FALHAR (API DOWN, COTA, ETC), USA A IA NATIVA
  // Isso garante que o usuário NUNCA veja um erro.
  return runNativeMara(history, textToSend, onToolCall);
};
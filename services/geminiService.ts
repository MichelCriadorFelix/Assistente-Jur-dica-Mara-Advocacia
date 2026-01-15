import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message, TeamMember, Contact } from "../types";
import { DEFAULT_TEAM } from "../constants";
import { learningService } from "./learningService";

// LISTA DE MODELOS ATUALIZADA - GEMINI 3 SERIES
const MODEL_CANDIDATES = [
  'gemini-3-flash-preview',    // Padrão para chat rápido e inteligente
  'gemini-3-pro-preview',      // Raciocínio complexo se o flash falhar
  'gemini-2.0-flash-exp'       // Fallback legado
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
  
  if (process.env.API_KEY && process.env.API_KEY.length > 20) {
    keysMap['ENV_API_KEY'] = cleanKey(process.env.API_KEY);
  }

  const explicitKeys = [
    { key: 'API_KEY_1', val: process.env.API_KEY_1 },
    { key: 'API_KEY_2', val: process.env.API_KEY_2 },
    { key: 'API_KEY_3', val: process.env.API_KEY_3 },
    { key: 'API_KEY_4', val: process.env.API_KEY_4 },
    { key: 'API_KEY_5', val: process.env.API_KEY_5 },
    { key: 'API_KEY_6', val: process.env.API_KEY_6 }
  ];

  explicitKeys.forEach(({ key, val }) => {
    if (val && val.length > 20) keysMap[key] = cleanKey(val);
  });

  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) keysMap['LOCAL'] = cleanKey(localKey);

  return keysMap;
};

export const getAvailableApiKeys = (): string[] => {
  const map = getAvailableApiKeysMap();
  return [...new Set(Object.values(map))];
};

// --- DEFINIÇÃO DE TOOLS ---

const notifyTeamFunction: FunctionDeclaration = {
  name: 'notificar_equipe',
  description: 'Gera o relatório final de triagem para o Dr. Michel e Fabrícia após entender o caso e solicitar Gov.br.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      processStage: { 
        type: Type.STRING, 
        enum: ["ADMINISTRATIVO", "JUDICIAL", "CONSULTORIA/PLANEJAMENTO", "INCERTO"],
        description: "Administrativo (vai dar entrada) ou Judicial (já foi negado/cortado)."
      },
      summary: { type: Type.STRING, description: "História do cliente detalhada." },
      hasGovBr: { type: Type.BOOLEAN, description: "Se o cliente confirmou ter ou saber recuperar a senha Gov.br" },
      missingDocs: { type: Type.STRING, description: "Documentos que faltam." },
      urgency: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] },
    },
    required: ['clientName', 'processStage', 'summary', 'urgency', 'hasGovBr'],
  },
};

const saveKnowledgeFunction: FunctionDeclaration = {
  name: 'save_knowledge',
  description: 'Memoriza uma nova regra, correção do usuário ou preferência ensinada durante o chat.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: { type: Type.STRING, description: "O que foi aprendido." },
      category: { type: Type.STRING, enum: ["preference", "legal_rule", "correction", "vocabulary"] }
    },
    required: ['fact', 'category'],
  },
};

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction, saveKnowledgeFunction] }];

// --- SERVIÇO PRINCIPAL ---

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void,
  contactContext?: Contact | null 
): Promise<string> => {
  
  let apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ Erro de Sistema: Nenhuma chave de API configurada. Contate o administrador.";
  apiKeys = shuffleArray(apiKeys);

  const memories = await learningService.getAllMemories();
  const knowledgeBase = memories.map(m => `- ${m.content}`).join('\n');

  let finalPrompt = systemInstruction;

  // Contexto Dinâmico de Identificação
  const clientName = (contactContext?.name && contactContext.name !== 'Novo Cliente' && contactContext.name !== 'User') 
    ? contactContext.name 
    : "DESCONHECIDO (Novo Cliente)";

  finalPrompt += `\n\n### DADOS DO CONTATO (WHATSAPP):\nNome Identificado: **"${clientName}"**\n(Se for DESCONHECIDO, pergunte o nome. Se tiver nome, use-o e pule essa etapa.)`;

  if (knowledgeBase) {
    finalPrompt += `\n\n### APRENDIZADO CONTÍNUO (REGRAS APRENDIDAS):\n${knowledgeBase}\n(Use isso para não cometer os mesmos erros).`;
  }

  if (contactContext?.legalSummary) {
    finalPrompt += `\n\n### O QUE JÁ SABEMOS DESTE CASO:\n"${contactContext.legalSummary}"\n(Continue a investigação a partir daqui)`;
  }
  
  if (contactContext?.caseStatus) {
    finalPrompt += `\n\n### STATUS DO PROCESSO (PRONTUÁRIO):\n"${contactContext.caseStatus}"`;
  }

  // Prepara histórico (limita para manter foco)
  const recentHistory = history.slice(-20).map(m => ({
    role: m.role,
    parts: [{ text: m.type === 'audio' ? '[O USUÁRIO ENVIOU UM ÁUDIO]' : m.content }]
  }));

  const currentParts: Part[] = [];
  
  if (newMessage.audioBase64) {
    currentParts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'audio/webm',
        data: newMessage.audioBase64
      }
    });
    currentParts.push({ text: "O usuário enviou este ÁUDIO. Transcreva mentalmente a intenção, ignore erros de português e responda como uma advogada humana e empática." });
  }
  
  if (newMessage.text) {
    currentParts.push({ text: newMessage.text });
  }

  let lastError = null;

  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({
          model: modelName,
          config: { 
            systemInstruction: finalPrompt,
            tools,
            temperature: 0.4, 
          },
          history: recentHistory
        });

        // Timeout de segurança
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000));
        const apiPromise = chat.sendMessage({ message: currentParts });
        
        const result: any = await Promise.race([apiPromise, timeoutPromise]);
        
        let responseText = result.text || "";

        if (result.functionCalls && result.functionCalls.length > 0) {
           for (const call of result.functionCalls) {
             if (call.name === 'save_knowledge') {
                await learningService.addMemory(call.args.fact, call.args.category);
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Aprendido e salvo com sucesso." } } }]
                });
                responseText = toolResp.text; // A IA deve confirmar sutilmente que entendeu
             }
             else if (call.name === 'notificar_equipe' && onToolCall) {
                const stage = call.args.processStage || 'INCERTO';
                const hasGov = call.args.hasGovBr ? 'COM ACESSO' : 'SEM ACESSO';
                onToolCall({ 
                  name: call.name, 
                  args: {
                    ...call.args,
                    legalSummary: `[${stage}] ${call.args.summary} | Gov.br: ${hasGov}`, 
                    area: 'PREVIDENCIÁRIO',
                    priority: call.args.urgency
                  } 
                });
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Relatório Salvo. Encerre o atendimento educadamente." } } }]
                });
                responseText = toolResp.text;
             }
           }
        }

        if (responseText) return responseText;

      } catch (e: any) {
        console.warn(`Falha no modelo ${modelName}:`, e.message);
        lastError = e;
        if (e.message?.includes('429')) break; 
      }
    }
  }

  console.error("Todas as tentativas falharam.", lastError);
  return "Desculpe, o sinal falhou. Pode enviar novamente?";
};

export const testConnection = async (): Promise<{ success: boolean; message: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Sem chaves configuradas." };

  try {
    const ai = new GoogleGenAI({ apiKey: keys[0] });
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Ping",
    });
    return { success: true, message: "Conexão Gemini 3 Estabelecida!" };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};
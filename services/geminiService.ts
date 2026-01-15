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
  description: 'Gera o relatório final para o Dr. Michel (Jurídico) e notifica a Fabrícia (Administrativo) para iniciar a papelada.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      benefitType: { type: Type.STRING },
      summary: { type: Type.STRING, description: "Resumo do caso + Status do Gov.br" },
      missingDocs: { type: Type.STRING, description: "Lista de documentos que o cliente confirmou ou negou ter." },
      urgency: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] },
      analysis: { type: Type.STRING }
    },
    required: ['clientName', 'benefitType', 'summary', 'urgency'],
  },
};

const saveKnowledgeFunction: FunctionDeclaration = {
  name: 'save_knowledge',
  description: 'Memoriza uma nova regra ou preferência.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: { type: Type.STRING },
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

  // Contexto Dinâmico
  const clientType = contactContext?.clientType === 'returning' ? 'CLIENTE DA CARTEIRA (JÁ É CLIENTE)' : 'POSSÍVEL NOVO CLIENTE';
  finalPrompt += `\n\n### CONTEXTO ATUAL:\nStatus: **${clientType}**`;

  if (knowledgeBase) {
    finalPrompt += `\n\n### REGRAS INTERNAS APRENDIDAS:\n${knowledgeBase}`;
  }

  if (contactContext?.legalSummary) {
    finalPrompt += `\n\n### O QUE JÁ SABEMOS DESTE CASO:\n"${contactContext.legalSummary}"\n(Use isso para mostrar que você tem memória)`;
  }
  
  if (contactContext?.caseStatus) {
    finalPrompt += `\n\n### STATUS DO PROCESSO (RESPONDER SE PERGUNTADO):\n"${contactContext.caseStatus}"`;
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
            temperature: 0.8, // Mais alta para naturalidade e "ginga" humana
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
                // Resposta invisível para confirmar ação
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "OK" } } }]
                });
                responseText = toolResp.text;
             }
             else if (call.name === 'notificar_equipe' && onToolCall) {
                onToolCall({ 
                  name: call.name, 
                  args: {
                    ...call.args,
                    legalSummary: `${call.args.summary} | Docs Confirmados: ${call.args.missingDocs}`, 
                    area: 'PREVIDENCIÁRIO',
                    priority: call.args.urgency
                  } 
                });
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Relatório Enviado para Dr. Michel e Fabrícia." } } }]
                });
                responseText = toolResp.text;
             }
           }
        }

        if (responseText) return responseText;

      } catch (e: any) {
        console.warn(`Falha no modelo ${modelName}:`, e.message);
        lastError = e;
        // Se for erro de cota (429), tenta próxima chave. Se for outro, tenta próximo modelo.
        if (e.message?.includes('429')) break; 
      }
    }
  }

  console.error("Todas as tentativas falharam.", lastError);
  return "Desculpe, o sistema do escritório está momentaneamente fora do ar. Poderia me enviar novamente sua mensagem em instantes?";
};

export const testConnection = async (): Promise<{ success: boolean; message: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Sem chaves configuradas." };

  try {
    const ai = new GoogleGenAI({ apiKey: keys[0] });
    // Teste com Gemini 3 Flash para garantir compatibilidade
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Ping",
    });
    return { success: true, message: "Conexão Gemini 3 Estabelecida!" };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};
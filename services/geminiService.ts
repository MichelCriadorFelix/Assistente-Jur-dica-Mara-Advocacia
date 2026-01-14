import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message, TeamMember, Contact } from "../types";
import { DEFAULT_TEAM } from "../constants";
import { learningService } from "./learningService";

// LISTA DE MODELOS - ORDEM DE INTELIGÊNCIA
// Usamos o Flash Preview mais recente para chat rápido e fluido
const MODEL_CANDIDATES = [
  'gemini-2.0-flash-exp',      // Extremamente rápido e inteligente para chat
  'gemini-1.5-pro',            // Backup de raciocínio
  'gemini-1.5-flash'           // Backup de estabilidade
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
  description: 'Gera o relatório final de triagem para os advogados e marca o atendimento como concluído.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      legalSummary: { type: Type.STRING, description: "Resumo jurídico técnico (Fatos + Direito) para o advogado." },
      area: { type: Type.STRING, description: "Área do direito: Previdenciário, Trabalhista, Família ou Cível." },
      priority: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] }
    },
    required: ['clientName', 'legalSummary', 'area', 'priority'],
  },
};

const saveKnowledgeFunction: FunctionDeclaration = {
  name: 'save_knowledge',
  description: 'Use esta função para MEMORIZAR uma nova regra, correção ou preferência ensinada pelo usuário.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: { type: Type.STRING, description: "O fato ou regra a ser memorizada." },
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
  if (apiKeys.length === 0) return "⚠️ Erro: Chave de API não configurada.";
  apiKeys = shuffleArray(apiKeys);

  const memories = await learningService.getAllMemories();
  const knowledgeBase = memories.map(m => `- [APRENDIZADO]: ${m.content}`).join('\n');

  let finalPrompt = systemInstruction;

  if (memories.length > 0) {
    finalPrompt += `\n\n### 🧠 MINHA MEMÓRIA EVOLUTIVA:\n${knowledgeBase}`;
  }

  try {
     const savedTeam = localStorage.getItem('mara_team_config');
     const team: TeamMember[] = savedTeam ? JSON.parse(savedTeam) : DEFAULT_TEAM;
     const teamList = team.filter(t => t.active).map(t => `- ${t.name} (${t.role})`).join('\n');
     finalPrompt += `\n\n### 👥 NOSSA EQUIPE:\n${teamList}`;
  } catch(e) {}

  if (contactContext?.legalSummary) {
    finalPrompt += `\n\n### 📂 MEMÓRIA DO CASO:\n"${contactContext.legalSummary}"`;
  }
  
  if (contactContext?.caseStatus) {
    finalPrompt += `\n\n### ⚖️ STATUS PROCESSUAL:\n"${contactContext.caseStatus}"`;
  }

  // Prepara histórico
  const recentHistory = history.slice(-30).map(m => ({
    role: m.role,
    parts: [{ text: m.type === 'audio' ? '[ÁUDIO ENVIADO PELO CLIENTE]' : m.content }]
  }));

  const currentParts: Part[] = [];
  
  if (newMessage.audioBase64) {
    currentParts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'audio/webm',
        data: newMessage.audioBase64
      }
    });
    // Instrução reforçada para áudio
    currentParts.push({ text: "O usuário enviou este ÁUDIO. Ouça, entenda o tom de voz e responda naturalmente." });
  }
  
  if (newMessage.text) {
    currentParts.push({ text: newMessage.text });
  }

  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({
          model: modelName,
          config: { 
            systemInstruction: finalPrompt,
            tools,
            temperature: 0.7, // Aumentado para maior fluidez e naturalidade na conversa
          },
          history: recentHistory
        });

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
        const apiPromise = chat.sendMessage({ message: currentParts });
        const result: any = await Promise.race([apiPromise, timeoutPromise]);
        
        let responseText = result.text || "";

        if (result.functionCalls && result.functionCalls.length > 0) {
           for (const call of result.functionCalls) {
             if (call.name === 'save_knowledge') {
                await learningService.addMemory(call.args.fact, call.args.category);
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Memorizado." } } }]
                });
                responseText = toolResp.text;
             }
             else if (call.name === 'notificar_equipe' && onToolCall) {
                onToolCall({ name: call.name, args: call.args });
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Success" } } }]
                });
                responseText = toolResp.text;
             }
           }
        }

        if (responseText) return responseText;

      } catch (e: any) {
        if (e.message?.includes('429')) break; 
      }
    }
  }

  // Fallback se tudo falhar, mas tenta não deixar vazio
  return "Olá! Tive uma pequena oscilação no sinal, mas já voltei. Poderia repetir a última parte?";
};

export const testConnection = async (): Promise<{ success: boolean; message: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Sem chaves configuradas." };

  try {
    const ai = new GoogleGenAI({ apiKey: keys[0] });
    await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: "Ping",
    });
    return { success: true, message: "Conexão OK!" };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};
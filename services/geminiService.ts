import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message, TeamMember, Contact } from "../types";
import { DEFAULT_TEAM } from "../constants";

// LISTA DE MODELOS - ORDEM DE INTELIGÊNCIA
// Usamos o PRO como primário para garantir o "Raciocínio Jurídico Avançado"
// O Flash entra como backup se o Pro falhar ou estiver lento demais.
const MODEL_CANDIDATES = [
  'gemini-3-pro-preview',      // Raciocínio Superior
  'gemini-3-flash-preview',    // Velocidade
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
  
  // Include standard process.env.API_KEY if available
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

const tools: Tool[] = [{ functionDeclarations: [notifyTeamFunction] }];

// --- SERVIÇO PRINCIPAL ---

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void,
  contactContext?: Contact | null // Contexto completo do contato
): Promise<string> => {
  
  let apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ Erro: Chave de API não configurada.";
  
  apiKeys = shuffleArray(apiKeys);

  // 1. CONSTRUÇÃO DO CONTEXTO AVANÇADO
  let finalPrompt = systemInstruction;

  // Injeta nomes da equipe para ela saber quem citar
  try {
     const savedTeam = localStorage.getItem('mara_team_config');
     const team: TeamMember[] = savedTeam ? JSON.parse(savedTeam) : DEFAULT_TEAM;
     const teamList = team.filter(t => t.active).map(t => `- ${t.name} (${t.role})`).join('\n');
     finalPrompt += `\n\n### 👥 NOSSA EQUIPE:\n${teamList}`;
  } catch(e) {}

  // Injeta memória de longo prazo (Resumo Jurídico anterior)
  if (contactContext?.legalSummary) {
    finalPrompt += `\n\n### 📂 MEMÓRIA DO CASO (O que já sabemos):\n"${contactContext.legalSummary}"\n(Use isso para não perguntar coisas repetidas).`;
  }
  
  // Injeta Status Processual (Se houver)
  if (contactContext?.caseStatus) {
    finalPrompt += `\n\n### ⚖️ STATUS PROCESSUAL ATUAL:\n"${contactContext.caseStatus}"\n(Informe isso ao cliente se ele perguntar do processo).`;
  }

  // 2. PREPARAÇÃO DO HISTÓRICO
  // Aumentamos o slice para 30 mensagens para suportar conversas longas
  const recentHistory = history.slice(-30).map(m => ({
    role: m.role,
    parts: [{ text: m.type === 'audio' ? '[ÁUDIO ENVIADO PELO CLIENTE]' : m.content }]
  }));

  // 3. PREPARAÇÃO DA MENSAGEM ATUAL
  const currentParts: Part[] = [];
  
  if (newMessage.audioBase64) {
    currentParts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'audio/webm',
        data: newMessage.audioBase64
      }
    });
    // Instrução reforçada para áudio
    currentParts.push({ text: "O usuário enviou este ÁUDIO. Ouça com atenção aos detalhes jurídicos, tom de voz e fatos narrados. Responda de forma acolhedora e direta." });
  }
  
  if (newMessage.text) {
    currentParts.push({ text: newMessage.text });
  }

  // 4. EXECUÇÃO DA IA (TENTATIVA E ERRO INTELIGENTE)
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({
          model: modelName,
          config: { 
            systemInstruction: finalPrompt,
            tools,
            temperature: 0.5, // Equilíbrio entre criatividade e precisão jurídica
          },
          history: recentHistory
        });

        // Timeout maior para o modelo PRO pensar
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
        const apiPromise = chat.sendMessage({ message: currentParts });
        
        const result: any = await Promise.race([apiPromise, timeoutPromise]);
        
        let responseText = result.text || "";

        // Lida com Tools (Geração de Relatório)
        if (result.functionCalls && result.functionCalls.length > 0) {
           const call = result.functionCalls[0];
           
           if (call.name === 'notificar_equipe' && onToolCall) {
              onToolCall({ 
                name: call.name, 
                args: call.args 
              });
              
              // A IA confirma para o cliente
              const toolResp = await chat.sendMessage({
                message: [{ functionResponse: { name: call.name, response: { result: "Success" } } }]
              });
              responseText = toolResp.text;
           }
        }

        if (responseText) return responseText;

      } catch (e: any) {
        console.warn(`Tentativa falha com ${modelName}:`, e.message);
        // Se for erro de quota (429), tenta próxima chave. Se for outro erro, tenta próximo modelo.
        if (e.message?.includes('429')) break; 
      }
    }
  }

  return "Desculpe, estamos com uma altíssima demanda agora. Poderia repetir sua dúvida por texto, por favor?";
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
    return { success: true, message: "Conexão Estabelecida com Sucesso." };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};
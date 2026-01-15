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
  description: 'Gera o Relatório Técnico Previdenciário detalhado para o Dr. Michel e Fabrícia.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clientName: { type: Type.STRING },
      clientAge: { type: Type.STRING, description: "Idade informada" },
      workStatus: { type: Type.STRING, description: "Trabalhando (CLT), Carnê ou Desempregado?" },
      timeSinceLastContribution: { type: Type.STRING, description: "Tempo sem pagar (para cálculo de Periodo de Graça)" },
      estimatedContributionTime: { type: Type.STRING, description: "Tempo total estimado pelo cliente" },
      govBrCredentials: { type: Type.STRING, description: "CPF e Senha (se fornecidos) ou 'PRECISA RECUPERAR SENHA'" },
      documentsStatus: { type: Type.STRING, description: "Quais documentos o cliente confirmou ter (PPP, Laudos, Carteira)? Se não sabe, PERGUNTE ANTES de chamar esta função." },
      summary: { type: Type.STRING, description: "Resumo narrativo do problema" },
      urgency: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] },
    },
    required: ['clientName', 'summary', 'urgency', 'govBrCredentials', 'workStatus', 'documentsStatus'],
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

export interface GeminiInput {
  text?: string;
  mediaBase64?: string; // Unificado para Audio/Imagem/PDF
  mimeType?: string;
}

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: GeminiInput,
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
    finalPrompt += `\n\n### O QUE JÁ SABEMOS DESTE CASO (EM ANDAMENTO):\n"${contactContext.legalSummary}"\n(Continue a investigação a partir daqui, não pergunte o que já sabe.)`;
  }
  
  if (contactContext?.caseStatus) {
    finalPrompt += `\n\n### STATUS DO PROCESSO (PRONTUÁRIO):\n"${contactContext.caseStatus}"`;
  }

  // Prepara histórico (limita para manter foco)
  const recentHistory = history.slice(-20).map(m => {
    // Se a mensagem histórica tinha arquivo, indicamos isso no texto pois o histórico simples do Gemini SDK não suporta reenvio de blobs antigos facilmente sem cache
    let content = m.content;
    if (m.type === 'file') content = `[USUÁRIO ENVIOU ARQUIVO: ${m.fileName}] ${m.content}`;
    if (m.type === 'audio') content = `[USUÁRIO ENVIOU ÁUDIO]`;
    
    return {
      role: m.role,
      parts: [{ text: content }]
    };
  });

  const currentParts: Part[] = [];
  
  if (newMessage.mediaBase64) {
    currentParts.push({
      inlineData: {
        mimeType: newMessage.mimeType || 'application/octet-stream',
        data: newMessage.mediaBase64
      }
    });

    if (newMessage.mimeType?.startsWith('audio')) {
       currentParts.push({ text: "O usuário enviou este ÁUDIO. Transcreva mentalmente a intenção e responda." });
    } else if (newMessage.mimeType?.startsWith('image')) {
       currentParts.push({ text: "O usuário enviou esta IMAGEM. Analise o conteúdo visual (documento, foto) para ajudar no atendimento." });
    } else if (newMessage.mimeType === 'application/pdf') {
       currentParts.push({ text: "O usuário enviou este PDF. Analise o conteúdo do documento." });
    }
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
            temperature: 0.3,
          },
          history: recentHistory
        });

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000)); // Mais tempo para imagens/PDF
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
                responseText = toolResp.text;
             }
             else if (call.name === 'notificar_equipe' && onToolCall) {
                const args = call.args;
                const richSummary = `
[RELATÓRIO TRIAGEM]
- Nome: ${args.clientName}
- Idade: ${args.clientAge || '?'}
- Status: ${args.workStatus || '?'}
- Tempo Contrib.: ~${args.estimatedContributionTime || '?'}
- Pausa: ${args.timeSinceLastContribution || 'N/A'}
- Gov.br: ${args.govBrCredentials || 'PENDENTE'}
- Docs: ${args.documentsStatus || 'PENDENTE'}
- Resumo: ${args.summary}
                `.trim();

                onToolCall({ 
                  name: call.name, 
                  args: {
                    ...call.args,
                    legalSummary: richSummary, 
                    area: 'PREVIDENCIÁRIO',
                    priority: call.args.urgency
                  } 
                });
                
                // Resposta final do bot após gerar o relatório
                const toolResp = await chat.sendMessage({
                  message: [{ functionResponse: { name: call.name, response: { result: "Relatório salvo com sucesso." } } }]
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
  return "Desculpe, não consegui processar a mensagem no momento.";
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
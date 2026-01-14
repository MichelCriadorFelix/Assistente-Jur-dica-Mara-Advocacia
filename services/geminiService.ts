import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS ESTENDIDA (AUTO-DESCOBERTA)
// Adicionamos versões numeradas específicas (-001, -002) pois às vezes os aliases genéricos falham em chaves novas.
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-1.5-pro-001',
  'gemini-pro',
  'gemini-1.0-pro'
];

// Helper: Pausa para evitar bloqueio por spam (429)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Limpeza Agressiva de Chave
const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

export const getAvailableApiKeys = (): string[] => {
  // Agora lemos também as variáveis injetadas via 'define' no vite.config.ts
  // process.env.* agora funcionará para essas chaves específicas
  const rawKeys = [
    (import.meta as any).env?.VITE_APP_PARAM_3,
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
    // Chaves sem prefixo VITE (Injetadas manualmente)
    (process.env as any).API_KEY,
    (process.env as any).GOOGLE_API_KEY,
    (process.env as any).GEMINI_API_KEY,
    // Armazenamento local
    localStorage.getItem('mara_gemini_api_key')
  ];

  // Filtra chaves válidas (Começam com 'AIza')
  const validKeys = rawKeys
    .map(k => cleanKey(k))
    .filter(k => k && k.length > 20 && k.startsWith('AIza'));

  return [...new Set(validKeys)];
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

// --- FUNÇÃO DE TESTE E DESCOBERTA ---
export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Nenhuma chave (AIza...) encontrada. Verifique suas variáveis de ambiente." };

  for (const apiKey of keys) {
    const ai = new GoogleGenAI({ apiKey });
    
    // Tenta cada modelo da lista até conectar
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({ model: modelName, history: [] });
        await chat.sendMessage({ message: [{ text: "Ping" }] });
        
        localStorage.setItem('mara_working_model', modelName);
        
        return { 
          success: true, 
          message: `Conectado! Modelo aceito: ${modelName}`, 
          keyUsed: apiKey.slice(-4) 
        };
      } catch (e: any) {
        console.warn(`Modelo ${modelName} falhou na chave ...${apiKey.slice(-4)}: ${e.message}`);
      }
    }
  }
  return { success: false, message: "Todas as tentativas falharam. Verifique se a API 'Google Generative AI' está ativada no console do Google Cloud." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ **Erro**: Nenhuma chave de API configurada.";

  const preferredModel = localStorage.getItem('mara_working_model') || MODEL_CANDIDATES[0];
  const modelsToTry = [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)];

  const chatHistory: Content[] = history
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
  if (newMessage.text) currentParts.push({ text: newMessage.text });

  let lastError = "";

  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelsToTry) {
        try {
            const chat = ai.chats.create({
                model: model,
                config: { systemInstruction, tools },
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

            if (model !== preferredModel) {
                localStorage.setItem('mara_working_model', model);
            }

            return responseText;

        } catch (error: any) {
            const msg = error.message || "";
            lastError = `${model} erro: ${msg}`;
            console.error(`[Mara] Falha: ${lastError}`);
            
            if (msg.includes('429') || msg.includes('Quota')) {
                await sleep(2000);
                break; 
            }
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nNão consegui conectar.\nÚltimo erro: ${lastError.slice(0, 100)}\n\nDica: Vá em Configurações > Testar Conexão.`;
};
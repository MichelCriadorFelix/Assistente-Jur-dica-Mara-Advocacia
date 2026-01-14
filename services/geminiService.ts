import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS PARA TENTATIVA (AUTO-DESCOBERTA)
// Se o Google rejeitar o primeiro, tentamos o próximo automaticamente.
// Isso resolve o erro 404 "Model Not Found".
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-pro',       // Versão 1.0 (Legado, mas muito estável)
  'gemini-1.0-pro'
];

// Helper: Pausa para evitar bloqueio por spam (429)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Limpeza Agressiva de Chave
const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  // Remove aspas, espaços, quebras de linha e caracteres ocultos
  return key.replace(/["'\s\n\r]/g, '').trim();
};

export const getAvailableApiKeys = (): string[] => {
  const rawKeys = [
    (import.meta as any).env?.VITE_APP_PARAM_3, // Prioridade
    (import.meta as any).env?.VITE_ux_config,
    (import.meta as any).env?.VITE_APP_PARAM_1,
    (import.meta as any).env?.VITE_APP_PARAM_2,
    (import.meta as any).env?.VITE_API_KEY,
    (import.meta as any).env?.VITE_G_CREDENTIAL,
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
  if (keys.length === 0) return { success: false, message: "Nenhuma chave (AIza...) encontrada." };

  for (const apiKey of keys) {
    const ai = new GoogleGenAI({ apiKey });
    
    // Tenta cada modelo da lista até conectar
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({ model: modelName, history: [] });
        await chat.sendMessage({ message: [{ text: "Ping" }] });
        
        // Se passar daqui, funcionou!
        // Salvamos o modelo que funcionou no localStorage para usar sempre
        localStorage.setItem('mara_working_model', modelName);
        
        return { 
          success: true, 
          message: `Conectado! Modelo aceito: ${modelName}`, 
          keyUsed: apiKey.slice(-4) 
        };
      } catch (e: any) {
        console.warn(`Modelo ${modelName} falhou na chave ...${apiKey.slice(-4)}: ${e.message}`);
        // Continua para o próximo modelo...
      }
    }
  }
  return { success: false, message: "Falha Total: Nenhuma chave e nenhum modelo funcionaram. Verifique se a API 'Google Generative AI' está ativada no Google Cloud." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ **Erro**: Nenhuma chave de API configurada.";

  // Define qual modelo usar (Tenta recuperar o que funcionou no teste, ou usa o padrão)
  const preferredModel = localStorage.getItem('mara_working_model') || MODEL_CANDIDATES[0];
  
  // Coloca o modelo preferido no topo da lista, seguido pelos outros como backup
  const modelsToTry = [preferredModel, ...MODEL_CANDIDATES.filter(m => m !== preferredModel)];

  // Prepara histórico
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

  // TENTA CADA CHAVE
  for (const apiKey of apiKeys) {
    const ai = new GoogleGenAI({ apiKey });

    // TENTA CADA MODELO (Auto-Descoberta em tempo real)
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

            // Se funcionou, salva esse modelo como preferido para a próxima vez ser mais rápida
            if (model !== preferredModel) {
                localStorage.setItem('mara_working_model', model);
            }

            return responseText;

        } catch (error: any) {
            const msg = error.message || "";
            lastError = `${model} erro: ${msg}`;
            console.error(`[Mara] Falha: ${lastError}`);
            
            // Se for erro de COTA (429), pausa e tenta outra CHAVE (break o loop de modelos)
            if (msg.includes('429') || msg.includes('Quota')) {
                await sleep(2000);
                break; // Sai do loop de modelos, vai para a próxima chave
            }
            // Se for erro 404 (Modelo não existe), continua o loop para o PRÓXIMO MODELO na mesma chave
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nNão consegui conectar com nenhum modelo de IA.\nÚltimo erro: ${lastError.slice(0, 100)}\n\nDica: Vá em Configurações e clique em 'Testar Conexão' para descobrir qual modelo sua chave aceita.`;
};
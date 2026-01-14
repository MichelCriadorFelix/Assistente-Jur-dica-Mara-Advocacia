import { GoogleGenAI, FunctionDeclaration, Type, Tool, Content, Part } from "@google/genai";
import { Message } from "../types";

// LISTA DE MODELOS OTIMIZADA (Prioridade: Gratuito, Rápido, Recente)
// 'gemini-2.0-flash-exp' é a versão mais nova, rápida e inteligente do tier gratuito.
const MODEL_CANDIDATES = [
  'gemini-2.0-flash-exp',      // Geração 2.0 (Mais atual)
  'gemini-1.5-flash',          // Estável e Rápido
  'gemini-1.5-flash-latest',   // Alias para a última versão estável
  'gemini-1.5-flash-8b',       // Versão leve (baixa latência)
  'gemini-1.5-pro-latest',     // Versão Pro (se a Flash falhar)
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanKey = (key: string | undefined): string => {
  if (!key) return '';
  return key.replace(/["'\s\n\r]/g, '').trim();
};

export const getAvailableApiKeys = (): string[] => {
  // Coleta chaves de todas as fontes possíveis
  const allPossibleValues: string[] = [];

  // 1. Variáveis injetadas pelo Vite (process.env agora contém API_KEY_1, API_KEY_2, etc.)
  if (typeof process !== 'undefined' && process.env) {
    Object.values(process.env).forEach(val => {
      if (typeof val === 'string') allPossibleValues.push(val);
    });
  }

  // 2. Fallback para import.meta.env (padrão Vite)
  if ((import.meta as any).env) {
     Object.values((import.meta as any).env).forEach((val: any) => {
       if (typeof val === 'string') allPossibleValues.push(val);
     });
  }

  // 3. LocalStorage (Manual)
  const localKey = localStorage.getItem('mara_gemini_api_key');
  if (localKey) allPossibleValues.push(localKey);

  // FILTRO INTELIGENTE:
  // Só aceita strings que parecem chaves do Google (Começam com 'AIza' e são longas)
  const validKeys = allPossibleValues
    .map(k => cleanKey(k))
    .filter(k => k && k.length > 20 && k.startsWith('AIza'));

  // Remove duplicatas
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

export const testConnection = async (): Promise<{ success: boolean; message: string; keyUsed?: string }> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) return { success: false, message: "Nenhuma chave válida (AIza...) encontrada nas variáveis API_KEY_*." };

  for (const apiKey of keys) {
    // Configuração otimizada para Gemini 2.0/1.5
    const ai = new GoogleGenAI({ apiKey });
    
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const chat = ai.chats.create({ model: modelName, history: [] });
        await chat.sendMessage({ message: "Ping" }); // Simplificado
        
        localStorage.setItem('mara_working_model', modelName);
        
        return { 
          success: true, 
          message: `Conectado! Modelo Otimizado: ${modelName}`, 
          keyUsed: apiKey.slice(-4) 
        };
      } catch (e: any) {
        // Ignora erros silenciosamente no loop de teste, tenta o próximo
      }
    }
  }
  return { success: false, message: "Todas as chaves falharam. Verifique se a API 'Google Generative AI' está ativa no Google Cloud." };
};

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: { text?: string; audioBase64?: string; mimeType?: string },
  systemInstruction: string,
  onToolCall?: (toolCall: any) => void
): Promise<string> => {
  
  const apiKeys = getAvailableApiKeys();
  if (apiKeys.length === 0) return "⚠️ **Erro de Configuração**: Nenhuma chave de API encontrada (API_KEY_*).";

  // Lógica de Preferência com Fallback Robusto
  const savedModel = localStorage.getItem('mara_working_model');
  // Se tiver um modelo salvo, tenta ele primeiro. Se não, começa do topo da lista (Gemini 2.0)
  // Removemos duplicatas para não tentar o mesmo modelo duas vezes
  const preferredModel = savedModel && MODEL_CANDIDATES.includes(savedModel) ? savedModel : MODEL_CANDIDATES[0];
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
                config: { 
                  systemInstruction, 
                  tools,
                  // Configurações de Otimização (Thinking Budget desativado para latência baixa em Flash)
                  thinkingConfig: { thinkingBudget: 0 } 
                },
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

            // Sucesso! Atualiza o modelo preferido se mudou
            if (model !== savedModel) {
                localStorage.setItem('mara_working_model', model);
                console.log(`[Mara] Modelo atualizado para: ${model}`);
            }

            return responseText;

        } catch (error: any) {
            const msg = error.message || "";
            lastError = msg;
            
            // Se o modelo salvo falhar (ex: 404), limpa a preferência imediatamente para não tentar de novo
            if (model === savedModel) {
               localStorage.removeItem('mara_working_model');
            }

            // Se for erro de cota (429), pausa breve e tenta outra chave/modelo
            if (msg.includes('429') || msg.includes('Quota')) {
                await sleep(1000);
                break; // Sai do loop de modelos desta chave, vai para próxima chave
            }
            
            // Se for 404 (Modelo não encontrado), apenas continua o loop para o próximo modelo
        }
    }
  }

  return `⚠️ **Mara Indisponível**\n\nNão consegui conectar com nenhum modelo (Gemini 2.0/1.5).\nErro final: ${lastError.slice(0, 100)}`;
};
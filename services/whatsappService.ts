import { Message } from "../types";

const getWaConfig = () => {
  if (typeof window === 'undefined') return null;
  const configStr = localStorage.getItem('mara_whatsapp_config');
  if (!configStr) return null;
  return JSON.parse(configStr) as { apiUrl: string; apiToken: string; instanceName: string };
};

export const whatsappService = {
  
  sendMessage: async (phone: string, message: string): Promise<boolean> => {
    const config = getWaConfig();
    if (!config || !config.apiUrl || !config.instanceName) {
      console.warn("Gateway WhatsApp não configurado. Mensagem não enviada externamente.");
      return false;
    }

    // Limpeza do telefone (apenas números)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Constrói a URL. Tenta ser inteligente se o usuário colocou ou não a barra no final
    const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
    const url = `${baseUrl}/message/sendText/${config.instanceName}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiToken
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message,
          delay: 1200 // Delay humano de 1.2s
        })
      });

      if (!response.ok) {
        console.error("Erro ao enviar para WhatsApp:", await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error("Falha na conexão com Gateway WhatsApp:", error);
      return false;
    }
  },

  sendAudio: async (phone: string, audioBase64: string): Promise<boolean> => {
    const config = getWaConfig();
    if (!config || !config.apiUrl || !config.instanceName) return false;

    const cleanPhone = phone.replace(/\D/g, '');
    const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
    const url = `${baseUrl}/message/sendWhatsAppAudio/${config.instanceName}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiToken
        },
        body: JSON.stringify({
          number: cleanPhone,
          audio: audioBase64,
          delay: 1200
        })
      });

      return response.ok;
    } catch (error) {
      console.error("Falha ao enviar áudio:", error);
      return false;
    }
  }
};
import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import AudioRecorder from './AudioRecorder';
import { Message, AppConfig, Contact } from '../types';
import { sendMessageToGemini } from '../services/geminiService';
import { chatService } from '../services/chatService';

interface ChatInterfaceProps {
  onBack: () => void;
  config: AppConfig;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onBack, config }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactDetails, setContactDetails] = useState<Contact | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initSession = async () => {
      const storedId = localStorage.getItem('mara_contact_id');
      try {
        const id = await chatService.getOrCreateContact(storedId);
        setContactId(id);
        localStorage.setItem('mara_contact_id', id);

        const details = await chatService.getContactDetails(id);
        setContactDetails(details);

        const history = await chatService.loadMessages(id);
        if (history.length > 0) {
          setMessages(history);
        } else {
           // Boas-vindas Especialista Previdenciário
           const isReturning = details?.clientType === 'returning' || (details?.caseStatus && details.caseStatus.length > 5);
           
           let welcomeText = '';
           if (details?.name && details.name !== 'Novo Cliente' && details.name !== 'User') {
              welcomeText = `Olá, ${details.name}. Sou a assistente virtual do Dr. Michel Felix. Estamos à disposição.\n\nVocê tem alguma dúvida sobre o andamento do seu processo ou gostaria de tratar de um novo benefício?`;
           } else {
              welcomeText = `Olá! Seja bem-vindo(a) ao atendimento digital do **Dr. Michel Felix**, especialista em Direito Previdenciário (INSS).\n\nSou a assistente virtual e estou aqui para fazer sua triagem inicial.\n\nVocê busca informações sobre Aposentadoria, Auxílio-Doença, LOAS/BPC ou outro benefício? Pode me contar por áudio se preferir. 🎙️`;
           }

           const initialMsg: Message = {
             id: 'init-welcome', 
             role: 'model', 
             content: welcomeText, 
             type: 'text', 
             timestamp: new Date()
           };
           setMessages([initialMsg]);
        }
      } catch (e) {
        console.error("Falha ao iniciar sessão", e);
      }
    };
    initSession();

    const interval = setInterval(async () => {
      const storedId = localStorage.getItem('mara_contact_id');
      if (storedId) {
        const history = await chatService.loadMessages(storedId);
        setMessages(prev => {
          if (history.length > prev.length) return history;
          return prev;
        });
        const det = await chatService.getContactDetails(storedId);
        setContactDetails(det);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleResetConversation = () => {
    if (confirm("Deseja iniciar um novo atendimento?")) {
      localStorage.removeItem('mara_contact_id');
      window.location.reload();
    }
    setShowMenu(false);
  };

  const handleSendMessage = async (text?: string, audioBlob?: Blob, mimeType?: string) => {
    if ((!text && !audioBlob) || !contactId || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || 'Áudio enviado',
      type: audioBlob ? 'audio' : 'text',
      timestamp: new Date(),
      audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      await chatService.saveMessage(contactId, userMsg);

      // Atualiza contexto para garantir que a IA tenha os dados mais recentes do banco
      const freshDetails = await chatService.getContactDetails(contactId);
      setContactDetails(freshDetails);

      if (freshDetails?.aiPaused) {
        setIsLoading(false);
        return; 
      }

      let audioBase64: string | undefined;
      let cleanMime = 'audio/webm';

      if (audioBlob) {
        if (mimeType) cleanMime = mimeType.split(';')[0].trim();
        audioBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
             const base64 = reader.result as string;
             resolve(base64.split(',')[1]); 
          };
        });
      }

      // Filtra mensagens de sistema puras
      const historyForAI = messages.filter(m => m.id !== 'init-welcome');

      const responseText = await sendMessageToGemini(
        historyForAI, 
        { text, audioBase64, mimeType: cleanMime }, 
        config.systemPrompt,
        async (toolCall) => {
          if (toolCall.name === 'notificar_equipe') {
             const { clientName, priority, legalSummary } = toolCall.args;
             // Atualiza status e salva o resumo jurídico gerado pela IA
             await chatService.updateContactStatus(contactId, 'triaged', clientName, legalSummary);
             // Atualiza localmente para refletir nome
             setContactDetails(prev => prev ? ({ ...prev, name: clientName, status: 'triaged' }) : null);
          }
        },
        freshDetails // Passa o contexto completo (incluindo resumo anterior e status processual)
      );

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        type: 'text',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
      await chatService.saveMessage(contactId, botMsg);

    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        content: "Desculpe, tive uma pequena falha de conexão. Pode repetir?",
        type: 'text',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#efeae2] relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}>
      </div>

      <div className="bg-[#008069] p-3 flex items-center justify-between shadow-md z-50 text-white relative">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          <div className="w-10 h-10 rounded-full bg-white overflow-hidden p-0.5">
             <img src="https://ui-avatars.com/api/?name=Assistente+Dr+Michel&background=0D8ABC&color=fff" alt="Assistente" className="w-full h-full rounded-full" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-semibold text-base leading-tight">
               {contactDetails?.name && contactDetails.name !== 'Novo Cliente' ? contactDetails.name : 'Assistente Dr. Michel Felix'}
            </h1>
            <span className="text-xs text-white/90 font-medium">
              {contactDetails?.aiPaused ? '🔴 Dr. Michel Digitado...' : (isLoading ? 'Analisando caso...' : 'Online')}
            </span>
          </div>
        </div>
        <div className="flex gap-4 pr-2 opacity-80 relative">
          <Video className="w-5 h-5 cursor-not-allowed" />
          <Phone className="w-5 h-5 cursor-not-allowed" />
          <button onClick={() => setShowMenu(!showMenu)} className="hover:bg-white/10 rounded-full p-1 transition">
            <MoreVertical className="w-5 h-5 cursor-pointer" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-12 bg-white rounded-lg shadow-xl py-2 w-56 z-50 animate-in fade-in slide-in-from-top-2 border border-gray-100 text-gray-800">
              <button 
                onClick={handleResetConversation}
                className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors font-medium"
              >
                <Trash2 className="w-4 h-4" /> Novo Atendimento
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 z-10 space-y-3 pb-20 scroll-smooth">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] rounded-lg p-2 px-3 shadow-sm relative text-sm md:text-base ${
                  isUser ? 'bg-[#d9fdd3] rounded-tr-none text-gray-800' : 'bg-white rounded-tl-none text-gray-800'
                }`}
              >
                {msg.type === 'audio' && msg.audioUrl ? (
                  <div className="min-w-[200px] flex items-center gap-2">
                    <span className="text-xl">🎤</span>
                    <audio controls src={msg.audioUrl} className="h-8 w-48" />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
                <span className="text-[10px] text-gray-500 block text-right mt-1 opacity-70">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {isUser && <span className="ml-1 text-blue-500 font-bold">✓✓</span>}
                </span>
              </div>
            </div>
          );
        })}
        
        {isLoading && (
          <div className="flex justify-start animate-pulse">
             <div className="bg-white rounded-lg p-3 shadow-sm rounded-tl-none flex gap-1 items-center">
               <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
               <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
               <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 w-full bg-[#f0f2f5] p-2 flex items-center gap-2 z-20 border-t border-gray-200">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
          placeholder="Mensagem..."
          className="flex-1 rounded-lg border-none px-4 py-3 focus:ring-1 focus:ring-[#00a884] outline-none bg-white shadow-sm text-gray-700 placeholder-gray-400"
          disabled={isLoading}
        />
        
        {inputText.length > 0 ? (
          <button 
            onClick={() => handleSendMessage(inputText)}
            disabled={isLoading}
            className="p-3 bg-[#00a884] rounded-full text-white shadow-md hover:bg-[#008f6f] transition disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        ) : (
          <AudioRecorder 
            onAudioRecorded={(blob, mime) => handleSendMessage(undefined, blob, mime)} 
            disabled={isLoading} 
          />
        )}
      </div>
      
      {showMenu && (
        <div 
          className="absolute inset-0 z-40 bg-transparent"
          onClick={() => setShowMenu(false)}
        ></div>
      )}
    </div>
  );
};

export default ChatInterface;
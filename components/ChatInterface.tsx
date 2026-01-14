import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, ArrowLeft } from 'lucide-react';
import AudioRecorder from './AudioRecorder';
import { Message, AppConfig } from '../types';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Session (Get or Create Contact ID)
  useEffect(() => {
    const initSession = async () => {
      // Try to recover session from local storage to keep history on refresh
      const storedId = localStorage.getItem('mara_contact_id');
      try {
        const id = await chatService.getOrCreateContact(storedId);
        setContactId(id);
        localStorage.setItem('mara_contact_id', id);

        // Load History
        const history = await chatService.loadMessages(id);
        if (history.length > 0) {
          setMessages(history);
        } else {
           // Initial greeting if new
           const initialMsg: Message = {
             id: 'init', role: 'model', content: 'Olá! Sou a Mara, assistente virtual da Justiça & Associados. Como posso ajudar você hoje?', type: 'text', timestamp: new Date()
           };
           setMessages([initialMsg]);
           // We don't save the initial hardcoded message to DB to save space, but you could.
        }
      } catch (e) {
        console.error("Failed to init chat session", e);
      }
    };
    initSession();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text?: string, audioBlob?: Blob) => {
    if ((!text && !audioBlob) || !contactId) return;

    const newMessage: Message = {
      id: Date.now().toString(), // Temp ID
      role: 'user',
      content: text || 'Áudio enviado',
      type: audioBlob ? 'audio' : 'text',
      timestamp: new Date(),
      audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined
    };

    // Optimistic UI update
    const newHistory = [...messages, newMessage];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);

    // Persist User Message
    await chatService.saveMessage(contactId, newMessage);

    try {
      let audioBase64: string | undefined;
      
      if (audioBlob) {
        audioBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
             const base64 = reader.result as string;
             resolve(base64.split(',')[1]); 
          };
        });
      }

      // Call AI
      const responseText = await sendMessageToGemini(
        newHistory, 
        { text, audioBase64 }, 
        config.systemPrompt,
        async (toolCall) => {
          // If the AI calls 'notificar_equipe', we update the contact status in DB
          if (toolCall.name === 'notificar_equipe') {
             const { clientName, summary, priority } = toolCall.args;
             console.log("Tool Triggered:", toolCall.args);
             // Update contact name if AI detected it
             await chatService.updateContactStatus(contactId, 'triaged', clientName);
          }
        }
      );

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        type: 'text',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
      
      // Persist Bot Message
      await chatService.saveMessage(contactId, botMessage);

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#efeae2] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}></div>

      {/* Header */}
      <div className="bg-[#00a884] p-3 flex items-center justify-between shadow-md z-10 text-white">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full bg-white overflow-hidden p-1">
             <img src="https://ui-avatars.com/api/?name=Mara+AI&background=0D8ABC&color=fff" alt="Mara" className="w-full h-full rounded-full" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-semibold text-base leading-tight">Mara (IA Jurídica)</h1>
            <span className="text-xs text-white/80">Online</span>
          </div>
        </div>
        <div className="flex gap-4 pr-2">
          <Video className="w-5 h-5 cursor-pointer" />
          <Phone className="w-5 h-5 cursor-pointer" />
          <MoreVertical className="w-5 h-5 cursor-pointer" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 z-10 space-y-3">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] rounded-lg p-2 px-3 shadow-sm relative ${
                  isUser ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'
                }`}
              >
                {msg.type === 'audio' && msg.audioUrl ? (
                  <div className="min-w-[200px] flex flex-col gap-1">
                    <span className="text-xs text-gray-500 uppercase font-bold flex items-center gap-1">
                      🎤 Áudio
                    </span>
                    <audio controls src={msg.audioUrl} className="w-full h-8" />
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
                <span className="text-[10px] text-gray-500 block text-right mt-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {isUser && <span className="ml-1 text-blue-500">✓✓</span>}
                </span>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white rounded-lg p-2 shadow-sm rounded-tl-none">
               <span className="text-gray-500 text-xs italic">Mara está digitando...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-gray-100 p-2 flex items-center gap-2 z-20">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
          placeholder="Digite uma mensagem..."
          className="flex-1 rounded-lg border-none px-4 py-2 focus:ring-1 focus:ring-whatsapp-green outline-none bg-white shadow-sm"
          disabled={isLoading}
        />
        
        {inputText.length > 0 ? (
          <button 
            onClick={() => handleSendMessage(inputText)}
            disabled={isLoading}
            className="p-3 bg-whatsapp-green rounded-full text-white shadow-sm hover:bg-emerald-600 transition"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <AudioRecorder onAudioRecorded={(blob) => handleSendMessage(undefined, blob)} disabled={isLoading} />
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
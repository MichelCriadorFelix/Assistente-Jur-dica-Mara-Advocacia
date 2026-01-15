import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, ArrowLeft, Loader2, Trash2, Paperclip, FileText, X, Lock } from 'lucide-react';
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
  
  // File Upload State
  const [selectedFile, setSelectedFile] = useState<{ blob: Blob, name: string, type: string, previewUrl?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Ref para evitar duplicação do relatório
  const lastReportRef = useRef<number>(0);

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
           let welcomeText = '';
           if (details?.name && details.name !== 'Novo Cliente' && details.name !== 'User') {
              welcomeText = `Bom falar com você novamente, ${details.name}!\n\nO senhor pode resumir o seu caso? Pode ser por escrito ou por áudio, como preferir.`;
           } else {
              welcomeText = `Olá! Sou a Mara, assistente do Dr. Michel Felix.\n\nPara começar, qual é o seu nome?`;
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
  }, [messages, isLoading, selectedFile]);

  const handleResetConversation = () => {
    if (confirm("Deseja iniciar um novo atendimento?")) {
      localStorage.removeItem('mara_contact_id');
      window.location.reload();
    }
    setShowMenu(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isImage = file.type.startsWith('image/');
      setSelectedFile({
        blob: file,
        name: file.name,
        type: file.type,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined
      });
    }
  };

  const clearFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSelectedFile(null);
  };

  const handleSendMessage = async (text?: string, audioBlob?: Blob, mimeType?: string) => {
    if ((!text && !audioBlob && !selectedFile) || !contactId || isLoading) return;

    let mediaUrl: string | undefined = undefined;
    let finalType: Message['type'] = 'text';
    let fileName: string | undefined = undefined;
    let finalMime = 'text/plain';

    if (audioBlob) {
      finalType = 'audio';
      mediaUrl = URL.createObjectURL(audioBlob);
      finalMime = mimeType || 'audio/webm';
    } else if (selectedFile) {
      finalType = 'file';
      mediaUrl = URL.createObjectURL(selectedFile.blob);
      fileName = selectedFile.name;
      finalMime = selectedFile.type;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || (selectedFile ? `Arquivo: ${selectedFile.name}` : 'Áudio enviado'),
      type: finalType,
      timestamp: new Date(),
      audioUrl: finalType === 'audio' ? mediaUrl : undefined,
      fileUrl: finalType === 'file' ? mediaUrl : undefined,
      fileName: fileName,
      mimeType: finalMime
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    const fileToSend = selectedFile; 
    clearFile(); // Limpa UI
    setIsLoading(true);

    try {
      await chatService.saveMessage(contactId, userMsg);
      const freshDetails = await chatService.getContactDetails(contactId);
      setContactDetails(freshDetails);

      if (freshDetails?.aiPaused) {
        setIsLoading(false);
        return; 
      }

      let mediaBase64: string | undefined;

      // Process Audio or File
      if (audioBlob) {
        mediaBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        });
      } else if (fileToSend) {
        mediaBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(fileToSend.blob);
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        });
      }

      const historyForAI = messages.filter(m => m.id !== 'init-welcome');

      const responseText = await sendMessageToGemini(
        historyForAI, 
        { text, mediaBase64, mimeType: finalMime }, 
        config.systemPrompt,
        async (toolCall) => {
          if (toolCall.name === 'notificar_equipe') {
             // Debounce para evitar relatório duplicado em curto espaço de tempo (5 segundos)
             const now = Date.now();
             if (now - lastReportRef.current < 5000) return;
             lastReportRef.current = now;

             const { clientName, legalSummary } = toolCall.args;
             
             // 1. Atualiza Status
             await chatService.updateContactStatus(contactId, 'triaged', clientName, legalSummary);
             setContactDetails(prev => prev ? ({ ...prev, name: clientName, status: 'triaged' }) : null);

             // 2. Simula o Relatório no Chat para o Teste
             const reportMsg: Message = {
               id: Date.now().toString() + '-report',
               role: 'system',
               // Adicionando cabeçalho explícito
               content: `🔒 **SISTEMA (Visível apenas para Admin):**\n📄 **RELATÓRIO ENVIADO**\n\n**Para:** Dr. Michel, Fabrícia\n**Cliente:** ${clientName}\n\n${legalSummary}`,
               type: 'text',
               timestamp: new Date()
             };
             setMessages(prev => [...prev, reportMsg]);
             await chatService.saveMessage(contactId, reportMsg);
          }
        },
        freshDetails 
      );

      // Algumas vezes o gemini manda texto vazio se só chamou a tool, filtramos aqui
      if (responseText && responseText.trim().length > 0) {
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: responseText,
          type: 'text',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, botMsg]);
        await chatService.saveMessage(contactId, botMsg);
      }

    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        content: "O sinal oscilou um pouco. O senhor(a) pode repetir?",
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
              {contactDetails?.aiPaused ? '🔴 Dr. Michel Digitado...' : (isLoading ? 'Digitando...' : 'Online')}
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
          const isSystem = msg.role === 'system';
          
          if (isSystem) {
             return (
               <div key={msg.id} className="flex justify-center my-4 animate-in fade-in zoom-in duration-300">
                  <div className="bg-yellow-50 border border-yellow-200 text-gray-700 p-4 rounded-lg shadow-sm max-w-sm text-xs font-mono whitespace-pre-wrap relative">
                     <div className="absolute -top-3 -left-3 bg-white p-1 rounded-full border border-yellow-200 shadow-sm" title="Invisível para o cliente">
                        <Lock className="w-4 h-4 text-yellow-600" />
                     </div>
                     {msg.content}
                  </div>
               </div>
             )
          }

          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] rounded-lg p-2 px-3 shadow-sm relative text-sm md:text-base ${
                  isUser ? 'bg-[#d9fdd3] rounded-tr-none text-gray-800' : 'bg-white rounded-tl-none text-gray-800'
                }`}
              >
                {/* Audio Bubble */}
                {msg.type === 'audio' && msg.audioUrl && (
                  <div className="min-w-[200px] flex items-center gap-2">
                    <span className="text-xl">🎤</span>
                    <audio controls src={msg.audioUrl} className="h-8 w-48" />
                  </div>
                )}
                
                {/* File Bubble */}
                {msg.type === 'file' && (
                  <div className="mb-2">
                    {msg.mimeType?.startsWith('image') && msg.fileUrl ? (
                      <img src={msg.fileUrl} alt="Anexo" className="max-w-[200px] max-h-[200px] rounded-lg border border-gray-200 my-1 object-cover" />
                    ) : (
                       <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg border border-gray-200">
                          <FileText className="w-8 h-8 text-red-500" />
                          <div className="flex flex-col overflow-hidden">
                             <span className="font-medium truncate max-w-[150px]">{msg.fileName || 'Documento'}</span>
                             <span className="text-xs text-gray-500 uppercase">{msg.mimeType?.split('/')[1] || 'FILE'}</span>
                          </div>
                       </div>
                    )}
                  </div>
                )}

                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
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

      {/* Input Area */}
      <div className="absolute bottom-0 w-full bg-[#f0f2f5] p-2 flex items-center gap-2 z-20 border-t border-gray-200">
        
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          className="hidden" 
          accept="image/*,application/pdf"
        />

        {/* Paperclip Button */}
        <button 
           onClick={() => fileInputRef.current?.click()}
           className="p-3 bg-gray-200 rounded-full text-gray-600 hover:bg-gray-300 transition"
           disabled={isLoading}
        >
           <Paperclip className="w-5 h-5" />
        </button>

        {selectedFile && (
           <div className="absolute bottom-16 left-4 bg-white p-2 rounded-lg shadow-lg border border-gray-200 flex items-center gap-3 animate-in slide-in-from-bottom-2">
              {selectedFile.type.startsWith('image') && selectedFile.previewUrl ? (
                 <img src={selectedFile.previewUrl} className="w-10 h-10 object-cover rounded" />
              ) : (
                 <FileText className="w-10 h-10 text-red-500" />
              )}
              <div className="flex flex-col">
                 <span className="text-xs font-bold truncate max-w-[150px]">{selectedFile.name}</span>
                 <span className="text-[10px] text-gray-500">Pronto para enviar</span>
              </div>
              <button onClick={clearFile} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-4 h-4" /></button>
           </div>
        )}

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
          placeholder={selectedFile ? "Adicione uma legenda..." : "Mensagem..."}
          className="flex-1 rounded-lg border-none px-4 py-3 focus:ring-1 focus:ring-[#00a884] outline-none bg-white shadow-sm text-gray-700 placeholder-gray-400"
          disabled={isLoading}
        />
        
        {inputText.length > 0 || selectedFile ? (
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
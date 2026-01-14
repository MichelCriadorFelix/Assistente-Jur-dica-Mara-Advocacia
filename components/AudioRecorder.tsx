import React, { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface AudioRecorderProps {
  onAudioRecorded: (blob: Blob, mimeType: string) => void;
  disabled?: boolean;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioRecorded, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4', // Safari
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm'; // Fallback padrão
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      // 128kbps para boa qualidade de voz sem ficar pesado
      const options = { mimeType, audioBitsPerSecond: 128000 };
      
      try {
        mediaRecorderRef.current = new MediaRecorder(stream, options);
      } catch (e) {
        // Fallback sem options se o navegador não suportar bitrate
        mediaRecorderRef.current = new MediaRecorder(stream);
      }
      
      chunksRef.current = [];

      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          const type = mimeTypeRef.current || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          
          if (blob.size < 500) {
             console.warn("Áudio muito curto ou vazio descartado.");
          } else {
             onAudioRecorded(blob, type);
          }
          
          // Limpeza das faixas para desligar o microfone (ícone vermelho do navegador)
          stream.getTracks().forEach(track => track.stop());
        };

        // Timeslice de 1000ms para garantir coleta de dados em pedaços
        mediaRecorderRef.current.start(1000);
        setIsRecording(true);
      }
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Erro ao acessar microfone. Verifique permissões.");
    }
  }, [onAudioRecorded]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <div className="flex items-center">
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        className={`p-3 rounded-full transition-all duration-300 shadow-md ${
          isRecording 
            ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110' 
            : 'bg-whatsapp-green hover:bg-emerald-600'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isRecording ? "Enviar Áudio" : "Gravar Áudio"}
      >
        {isRecording ? (
          <Square className="w-5 h-5 text-white" fill="currentColor" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </button>
      {isRecording && (
        <span className="ml-2 text-red-500 text-xs font-semibold animate-pulse">
          Gravando...
        </span>
      )}
    </div>
  );
};

export default AudioRecorder;
import React, { useEffect, useState } from 'react';
import { Smartphone, Lock, AlertTriangle, Info, Server } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    // Generate a QR code that points to the current URL of the app
    const currentUrl = window.location.href;
    setAppUrl(currentUrl);
    // Use a public API to generate the QR code image
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentUrl)}`);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col font-sans">
      {/* Header */}
      <div className="bg-[#00a884] w-full py-6 shadow-md">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6" />
            <span className="font-semibold text-lg tracking-wide">Mara Admin</span>
          </div>
          <span className="text-xs bg-white/20 px-3 py-1 rounded-full uppercase font-bold tracking-wider">Painel Web</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full p-6 gap-6">
        
        {/* Card Principal: Acesso ao Painel */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 overflow-hidden flex flex-col">
           <div className="p-8 flex-1">
              <h1 className="text-3xl font-light text-gray-800 dark:text-gray-100 mb-6">Acesso Administrativo</h1>
              
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                   <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400">
                      <Lock className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="font-bold text-gray-700 dark:text-gray-200">Painel do Advogado</h3>
                      <p className="text-gray-500 text-sm mt-1">
                        Acesse para configurar a IA, ver relatórios de triagem e monitorar atendimentos.
                      </p>
                   </div>
                </div>

                <div className="flex gap-4 items-start">
                   <div className="bg-blue-100 p-3 rounded-full text-blue-600 dark:bg-blue-900 dark:text-blue-400">
                      <Smartphone className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="font-bold text-gray-700 dark:text-gray-200">Acesso Mobile</h3>
                      <p className="text-gray-500 text-sm mt-1">
                        Leia o QR Code ao lado com a <strong>Câmera do Celular</strong> para abrir este painel no seu smartphone.
                      </p>
                   </div>
                </div>
              </div>

              <div className="mt-10">
                 <button 
                   onClick={onLogin}
                   className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white py-4 rounded-lg font-bold shadow-lg transition-transform transform hover:-translate-y-1 flex items-center justify-center gap-2"
                 >
                   <Lock className="w-5 h-5" />
                   ENTRAR NO SISTEMA
                 </button>
              </div>
           </div>
           
           <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-t dark:border-gray-700 text-center text-xs text-gray-400">
              Versão Web 1.5.0 • Powered by Gemini Flash 2.0
           </div>
        </div>

        {/* Card Lateral: QR Code e Aviso */}
        <div className="w-full md:w-96 flex flex-col gap-6">
           
           {/* QR Code de Acesso */}
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 flex flex-col items-center justify-center border dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Abrir no Celular</h3>
              <div className="bg-white p-2 rounded-lg border shadow-sm">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 object-contain" />
                ) : (
                  <div className="w-48 h-48 bg-gray-100 animate-pulse rounded"></div>
                )}
              </div>
              <p className="text-xs text-center text-gray-400 mt-4 max-w-[200px]">
                Aponte a câmera do seu celular para abrir o app.
              </p>
           </div>

           {/* Aviso Importante sobre Conexão WhatsApp */}
           <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-500 font-bold mb-2">
                 <AlertTriangle className="w-5 h-5" />
                 <h4>Atenção: Conexão WhatsApp</h4>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 leading-relaxed">
                 Este QR Code <strong>NÃO CONECTA</strong> o WhatsApp Web. 
              </p>
              <div className="mt-3 text-xs text-yellow-800/80 dark:text-yellow-400/80 space-y-2">
                 <p>
                   🤖 <strong>Para a IA responder no seu número real:</strong> É necessário contratar uma API de conexão (Gateway) ou configurar um servidor.
                 </p>
                 <div className="flex items-center gap-2 mt-2 font-semibold cursor-help" title="Vá em Configurações > Integração">
                    <Server className="w-3 h-3" />
                    <span>Configure na aba "Configurações"</span>
                 </div>
              </div>
           </div>

        </div>

      </div>
    </div>
  );
};

export default LoginScreen;
import React, { useEffect, useState } from 'react';
import { Smartphone, Lock, ExternalLink } from 'lucide-react';

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="h-48 bg-[#00a884] w-full absolute top-0 z-0">
        <div className="max-w-5xl mx-auto p-5 flex items-center gap-3 text-white">
          <Smartphone className="w-6 h-6" />
          <span className="font-semibold text-sm uppercase tracking-wider">Mara WEB</span>
        </div>
      </div>

      {/* Card */}
      <div className="z-10 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl mx-auto mt-20 w-full h-[75vh] flex flex-col md:flex-row overflow-hidden border dark:border-gray-700">
        
        {/* Left Side: Instructions */}
        <div className="p-8 md:p-10 flex-1 flex flex-col justify-center text-gray-700 dark:text-gray-200">
          <h1 className="text-3xl font-light mb-8">Conectar ao Mara Admin</h1>
          <ol className="list-decimal pl-5 space-y-4 text-lg">
            <li>Abra a <strong>Câmera</strong> ou leitor de QR no seu celular</li>
            <li>Aponte seu celular para esta tela</li>
            <li>Toque no link para abrir a <strong>Mara IA</strong> no smartphone</li>
            <li>Para entrar no painel administrativo aqui, clique no botão abaixo</li>
          </ol>
          
          <div className="mt-8 pt-6 border-t dark:border-gray-700">
             <button 
               onClick={onLogin}
               className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-2"
             >
               <Lock className="w-4 h-4" />
               Acessar Painel Administrativo (Sem QR Code)
             </button>
             <p className="text-xs text-gray-400 mt-2">
               * Este QR Code abre a aplicação móvel da Mara. Para conectar ao WhatsApp Real (Meta), seria necessário uma integração de API Business paga.
             </p>
          </div>
        </div>
        
        {/* Right Side: QR Code */}
        <div className="flex-1 flex flex-col items-center justify-center border-l dark:border-gray-700 p-10 bg-white dark:bg-gray-800 relative">
          <div className="relative group p-2 bg-white rounded-lg shadow-md border border-gray-100">
             {qrCodeUrl ? (
               <img src={qrCodeUrl} alt="QR Code de Acesso" className="w-64 h-64 object-contain" />
             ) : (
               <div className="w-64 h-64 bg-gray-200 animate-pulse flex items-center justify-center">Carregando QR...</div>
             )}
             
             {/* Logo overlay in center */}
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white p-1 rounded-full shadow-lg">
                   <Smartphone className="w-8 h-8 text-emerald-600" />
                </div>
             </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
             <p className="font-mono text-xs opacity-75 max-w-xs text-center truncate">{appUrl}</p>
             <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" defaultChecked className="accent-emerald-600 w-4 h-4" />
                <label>Mantenha-me conectado</label>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
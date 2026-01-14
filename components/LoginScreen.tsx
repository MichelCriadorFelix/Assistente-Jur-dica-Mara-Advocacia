import React from 'react';
import { Smartphone, Lock } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
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
      <div className="z-10 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl mx-auto mt-20 w-full h-[70vh] flex overflow-hidden border dark:border-gray-700">
        <div className="p-10 flex-1 flex flex-col justify-center text-gray-700 dark:text-gray-200">
          <h1 className="text-3xl font-light mb-8">Conectar ao Mara Admin</h1>
          <ol className="list-decimal pl-5 space-y-4 text-lg">
            <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
            <li>Toque em <strong>Menu</strong> ou <strong>Configurações</strong></li>
            <li>Selecione <strong>Aparelhos conectados</strong></li>
            <li>Toque em <strong>Conectar um aparelho</strong></li>
            <li>Aponte seu celular para esta tela</li>
          </ol>
          <div className="mt-8 text-emerald-600 dark:text-emerald-400 cursor-pointer hover:underline" onClick={onLogin}>
            Precisa de ajuda para conectar?
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center border-l dark:border-gray-700 p-10 bg-white dark:bg-gray-800">
          <div className="relative group cursor-pointer" onClick={onLogin}>
             {/* Fake QR Code */}
             <div className="w-64 h-64 bg-gray-900 p-2 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-white m-2 grid grid-cols-6 grid-rows-6 gap-1 p-2">
                   {Array.from({length: 36}).map((_, i) => (
                     <div key={i} className={`bg-black ${Math.random() > 0.5 ? 'opacity-100' : 'opacity-0'}`}></div>
                   ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-emerald-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Entrar
                    </div>
                </div>
             </div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
             <input type="checkbox" defaultChecked className="accent-emerald-600" />
             <label>Mantenha-me conectado</label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
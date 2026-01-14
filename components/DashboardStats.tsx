import React, { useEffect, useState } from 'react';
import { Users, CheckCircle, Clock, AlertTriangle, BarChart2, Database, ArrowRight } from 'lucide-react';
import { chatService } from '../services/chatService';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface DashboardStatsProps {
  onNavigateToChat: (filter: 'all' | 'urgent' | 'triaged' | 'new') => void;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ onNavigateToChat }) => {
  const [stats, setStats] = useState({ total: 0, triaged: 0, urgent: 0, new: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      const data = await chatService.getDashboardStats();
      setStats(data);
      setLoading(false);
    };
    loadStats();
    
    // Refresh stats every 30s
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { 
      id: 'all',
      title: 'Total de Leads', 
      value: stats.total, 
      icon: Users, 
      color: 'bg-blue-500', 
      hover: 'hover:border-blue-300 hover:bg-blue-50',
      action: () => onNavigateToChat('all')
    },
    { 
      id: 'triaged',
      title: 'Triagem Completa', 
      value: stats.triaged, 
      icon: CheckCircle, 
      color: 'bg-green-500',
      hover: 'hover:border-green-300 hover:bg-green-50',
      action: () => onNavigateToChat('triaged')
    },
    { 
      id: 'urgent',
      title: 'Atenção Necessária', 
      value: stats.urgent + stats.new, 
      icon: AlertTriangle, 
      color: 'bg-red-500',
      hover: 'hover:border-red-300 hover:bg-red-50',
      action: () => onNavigateToChat('urgent')
    },
    { 
      id: 'time',
      title: 'Tempo Médio', 
      value: '2.5m', 
      icon: Clock, 
      color: 'bg-yellow-500',
      hover: '', // Não clicável para filtro
      action: null 
    }, 
  ];

  if (loading) {
    return <div className="p-10 text-center text-gray-400">Carregando métricas...</div>;
  }

  return (
    <div className="space-y-6">
      
      {/* Aviso de Configuração se estiver vazio e sem Supabase */}
      {!isSupabaseConfigured && stats.total === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex items-center justify-between text-yellow-800">
           <div className="flex items-center gap-3">
             <Database className="w-5 h-5" />
             <span>O Banco de dados não está conectado. Os dados estão sendo salvos apenas no seu navegador (Local).</span>
           </div>
        </div>
      )}

      {/* Metric Cards - Agora Clicáveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <button 
            key={idx} 
            onClick={stat.action || undefined}
            disabled={!stat.action}
            className={`
              w-full text-left bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 
              flex items-center gap-4 transition-all duration-200 
              ${stat.action ? `cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${stat.hover} dark:hover:bg-gray-750` : 'cursor-default'}
            `}
          >
            <div className={`p-3 rounded-lg ${stat.color} text-white shadow-sm`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{stat.title}</p>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stat.value}</h3>
            </div>
            {stat.action && (
              <ArrowRight className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Lead Distribution */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-gray-400" />
            Status dos Atendimentos
          </h3>
          {stats.total === 0 ? (
             <div className="h-40 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed dark:border-gray-700">
                <p>Nenhum dado registrado ainda.</p>
                <p className="text-xs mt-1">Inicie uma conversa no "Testar IA"</p>
             </div>
          ) : (
             <div className="space-y-4">
               {[
                 { label: 'Triados (Finalizados)', val: stats.triaged, color: 'bg-emerald-500', code: 'triaged' },
                 { label: 'Urgentes', val: stats.urgent, color: 'bg-red-500', code: 'urgent' },
                 { label: 'Novos / Em Aberto', val: stats.new, color: 'bg-blue-500', code: 'new' },
               ].map((item) => {
                 const percent = stats.total > 0 ? Math.round((item.val / stats.total) * 100) : 0;
                 return (
                   <div 
                     key={item.label} 
                     onClick={() => onNavigateToChat(item.code as any)}
                     className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 p-2 rounded transition-colors"
                   >
                     <div className="flex justify-between text-sm mb-1 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white font-medium">
                       <span>{item.label}</span>
                       <span className="font-mono">{item.val} ({percent}%)</span>
                     </div>
                     <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                       <div className={`${item.color} h-2.5 rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
                     </div>
                   </div>
                 );
               })}
             </div>
          )}
        </div>

        {/* Weekly Volume */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 dark:text-white">Volume Recente (Simulado)</h3>
          {stats.total === 0 ? (
             <div className="h-40 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed dark:border-gray-700">
                <p>Aguardando primeiros acessos.</p>
             </div>
          ) : (
            <div className="flex items-end justify-between h-40 space-x-2">
              {[0, 0, 0, 0, 0, stats.total > 5 ? 5 : stats.total, stats.total].map((h, i) => (
                <div key={i} className="flex flex-col items-center flex-1 group">
                  <div 
                     className="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-t-sm relative transition-all duration-500 hover:bg-indigo-500" 
                     style={{ height: `${h > 0 ? (h * 10) + '%' : '4px'}` }}
                  >
                  </div>
                  <span className="text-xs text-gray-500 mt-2">
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Hoje'][i]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
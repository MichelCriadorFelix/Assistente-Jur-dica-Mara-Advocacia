import React from 'react';
import { Users, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const DashboardStats: React.FC = () => {
  // Mock Data
  const stats = [
    { title: 'Novos Leads (Hoje)', value: '12', icon: Users, color: 'bg-blue-500' },
    { title: 'Triagem Completa', value: '8', icon: CheckCircle, color: 'bg-green-500' },
    { title: 'Tempo Médio (min)', value: '3.5', icon: Clock, color: 'bg-yellow-500' },
    { title: 'Atenção Humana', value: '2', icon: AlertTriangle, color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${stat.color} text-white`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.title}</p>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* CSS-based Bar Chart Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 dark:text-white">Leads por Especialidade</h3>
          <div className="space-y-4">
            {[
              { label: 'Previdenciário', percent: 65, color: 'bg-emerald-500' },
              { label: 'Trabalhista', percent: 25, color: 'bg-blue-500' },
              { label: 'Família', percent: 10, color: 'bg-purple-500' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1 dark:text-gray-300">
                  <span>{item.label}</span>
                  <span>{item.percent}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div className={`${item.color} h-2.5 rounded-full`} style={{ width: `${item.percent}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 dark:text-white">Volume Semanal</h3>
          <div className="flex items-end justify-between h-40 space-x-2">
            {[40, 65, 30, 85, 50, 20, 90].map((h, i) => (
              <div key={i} className="flex flex-col items-center flex-1 group">
                <div 
                   className="w-full bg-indigo-200 dark:bg-indigo-900 rounded-t-sm relative transition-all duration-500 hover:bg-indigo-500" 
                   style={{ height: `${h}%` }}
                >
                   <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded">
                     {h}
                   </div>
                </div>
                <span className="text-xs text-gray-500 mt-2">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
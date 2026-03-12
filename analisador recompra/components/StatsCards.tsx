import React from 'react';

interface StatsCardsProps {
    opportunitiesCount: number;
    totalSavings: number;
    analyzedProcesses: number;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);
};

// FIX: Replaced JSX.Element with React.ReactElement to resolve "Cannot find namespace 'JSX'".
const StatCard: React.FC<{ title: string; value: string; icon: React.ReactElement }> = ({ title, value, icon }) => (
    <div className="bg-gray-800/60 p-6 rounded-lg shadow-lg border border-gray-700 flex items-center space-x-4">
        <div className="flex-shrink-0 bg-gray-700 p-3 rounded-full">
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

export const StatsCards: React.FC<StatsCardsProps> = ({ opportunitiesCount, totalSavings, analyzedProcesses }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard 
                title="Economia Total Potencial"
                value={formatCurrency(totalSavings)}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>}
            />
            <StatCard 
                title="Oportunidades Encontradas"
                value={opportunitiesCount.toString()}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
            />
            <StatCard 
                title="Processos Analisados"
                value={analyzedProcesses.toString()}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
            />
        </div>
    );
};
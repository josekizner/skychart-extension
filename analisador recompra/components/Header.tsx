
import React from 'react';
import type { AnalysisResult } from '../types';

interface HeaderProps {
    onRefresh: () => void;
    isRefreshing: boolean;
    rawCsvData: { tarifas: string } | null;
    operacionalLastUpdated: Date | null;
    tarifarioLastUpdated: Date | null;
    analysisResults?: AnalysisResult[];
}

const formatTimestamp = (date: Date | null): string => {
    if (!date) return 'Não disponível';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};


export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing, rawCsvData, operacionalLastUpdated, tarifarioLastUpdated, analysisResults }) => {
    
    // Função para exportar o Tarifário original
    const handleExportTarifario = () => {
        if (!rawCsvData) return;
        downloadFile(rawCsvData.tarifas, 'tarifario_original.csv', 'text/csv;charset=utf-8;');
    };

    // Função genérica de download
    const downloadFile = (content: string, fileName: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Função para exportar o Relatório de Análise
    const handleExportAnalysis = () => {
        if (!analysisResults || analysisResults.length === 0) return;

        // 1. Definição das colunas
        const columns = [
            "Status",
            "Processo",
            "Cliente",
            "Prontidão Carga",
            "Previsão Embarque",
            "Transit Time (Dias)",
            "Free Time (Dias)",
            "Origem",
            "Destino",
            "Container",
            "Qtd.",
            "Valor Pago (USD)",
            "Armador Atual",
            "Agente Atual",
            "Melhor Tarifa (USD)",
            "Diferença / Economia (USD)",
            "Validade Tarifa",
            "Armador (Tarifário)",
            "Agente (Tarifário)",
            "Free Time (Tarifário)",
            "Descrição (Tarifário)"
        ];

        // 2. Helper para escapar campos CSV (com ponto e vírgula)
        const escape = (field: any): string => {
            if (field === null || field === undefined || field === 'N/A') return 'N/A';
            const str = String(field).trim();
            // Se tiver ponto e vírgula, aspas ou quebra de linha, coloca entre aspas
            if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        // 3. Helper para formatar números para Excel BR (trocar ponto por vírgula)
        const fmtNum = (val: number | 'N/A'): string => {
            if (typeof val !== 'number' || isNaN(val)) return '';
            return val.toFixed(2).replace('.', ',');
        };

        // 4. Construção do conteúdo CSV
        // Adicionamos o BOM (\uFEFF) para o Excel reconhecer acentos UTF-8
        let csvContent = '\uFEFF'; 
        
        // Cabeçalho
        csvContent += columns.join(';') + '\n';

        // Linhas
        analysisResults.forEach(row => {
            const line = [
                escape(row.status),
                escape(row.processoId),
                escape(row.cliente),
                escape(row.dataProntidao),
                escape(row.dataEmissao),
                escape(row.transitTime),
                escape(row.freeTime),
                escape(row.origem),
                escape(row.destino),
                escape(row.tipoContainer),
                escape(row.quantidadeContainers),
                fmtNum(row.valorProcesso),
                escape(row.armadorAtual),
                escape(row.agenteAtual),
                fmtNum(row.melhorTarifa),
                fmtNum(row.diferenca),
                escape(row.validadeMelhorTarifa),
                escape(row.armadorNovo),
                escape(row.agenteNovo),
                escape(row.freeTimeTarifa),
                escape(row.descricaoTarifa)
            ];
            csvContent += line.join(';') + '\n';
        });

        const dateStr = new Date().toISOString().split('T')[0];
        downloadFile(csvContent, `relatorio_analise_fretes_${dateStr}.csv`, 'text/csv;charset=utf-8;');
    };

    return (
        <header className="mb-8 p-4 bg-gray-800/50 rounded-lg shadow-lg backdrop-blur-sm border border-gray-700">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
                        Analisador de Recompras
                    </h1>
                    <p className="text-gray-400 mt-1">Base: Recompras (Comparativo Tarifário x Processos).</p>
                     <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center" title="Data da última consulta aos dados operacionais em tempo real.">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Operacional: <strong className="font-semibold text-gray-400">{formatTimestamp(operacionalLastUpdated)}</strong></span>
                        </div>
                        <div className="flex items-center" title="Data da última modificação do arquivo ou, se indisponível, do momento em que uma alteração no conteúdo foi detectada.">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            <span>Tarifário: <strong className="font-semibold text-gray-400">{formatTimestamp(tarifarioLastUpdated)}</strong></span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-4 flex-wrap gap-2">
                     <button
                        onClick={handleExportAnalysis}
                        disabled={isRefreshing || !analysisResults || analysisResults.length === 0}
                        title="Exportar relatório completo em formato compatível com Excel"
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-600/50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Exportar Relatório
                    </button>

                    <button
                        onClick={handleExportTarifario}
                        disabled={isRefreshing || !rawCsvData}
                        title="Exportar o tarifário CSV original"
                        className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-500/50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Exportar Tarifário
                    </button>
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-opacity-50"
                    >
                        <svg
                            className={`w-5 h-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0120.5 15M20 20l-1.5-1.5A9 9 0 003.5 9"
                            />
                        </svg>
                        {isRefreshing ? 'Analisando...' : 'Analisar Novamente'}
                    </button>
                </div>
            </div>
        </header>
    );
};

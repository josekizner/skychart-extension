
import React, { useState, useEffect, useMemo } from 'react';
import type { AnalysisResult, OpportunityGroup, Tarifa, RouteComparison, Processo } from '../types';
import { ManualCrossReferenceView } from './ManualCrossReferenceView';

interface OpportunitiesTableProps {
    opportunityGroups: OpportunityGroup[];
    fullAnalysisResults: AnalysisResult[];
    tarifas: Tarifa[];
    routeComparisons: RouteComparison[];
    // Props for manual cross-reference
    processosByRoute: Map<string, Processo[]>;
    tarifasByRoute: Map<string, Tarifa[]>;
    allUniqueRoutes: string[];
}

const formatCurrency = (value: number | 'N/A') => {
    if (typeof value !== 'number' || isNaN(value)) {
        return value;
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);
};

// --- Helper para gerar o e-mail visual ---
const generateAndSendEmail = async (opportunities: any[], title: string, dashboardLink?: string) => {
    if (opportunities.length === 0) {
        alert("Nenhuma oportunidade selecionada para enviar.");
        return;
    }

    let totalEconomy = 0;
    opportunities.forEach(op => totalEconomy += (typeof op.economy === 'number' ? op.economy : 0));

    // Link block logic - Agora com texto clicável também
    const dashboardButton = dashboardLink ? `
        <div style="margin-top: 30px; margin-bottom: 20px; text-align: center;">
            <!-- Botão Principal -->
            <a href="${dashboardLink}" target="_blank" style="background-color: #059669; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-family: 'Segoe UI', sans-serif; font-size: 14px; display: inline-block; border: 1px solid #047857;">
                Ver Outras Opções no Dashboard
            </a>
            
            <!-- Link em Texto (Backup e UX) -->
            <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">
                Ou acesse diretamente pelo link:<br/>
                <a href="${dashboardLink}" target="_blank" style="color: #059669; text-decoration: underline; font-weight: bold;">
                    Clique aqui para ver todos os armadores e detalhes desta rota no sistema.
                </a>
            </p>
        </div>
    ` : '';

    // HTML Table Layout - Clean, Professional, High Contrast
    const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1f2937; max-width: 1000px;">
            <div style="border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="color: #059669; margin: 0; font-size: 24px;">${title}</h2>
                <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Relatório de Análise de Recompra de Frete</p>
            </div>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px;"><strong>Resumo da Análise:</strong></p>
                <ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 14px; color: #374151;">
                    <li>Processos Identificados: <strong>${opportunities.length}</strong></li>
                    <li>Economia Potencial Total: <strong style="color: #059669; font-size: 16px;">${formatCurrency(totalEconomy)}</strong></li>
                </ul>
            </div>
            
            <table style="border-collapse: collapse; width: 100%; font-size: 12px; border: 1px solid #e5e7eb;">
                <thead>
                    <tr style="background-color: #f3f4f6; color: #111827; text-align: left; border-bottom: 2px solid #d1d5db;">
                        <th style="padding: 10px; border: 1px solid #e5e7eb;">Processo / Cliente</th>
                        <th style="padding: 10px; border: 1px solid #e5e7eb;">Rota / Container</th>
                        <th style="padding: 10px; border: 1px solid #e5e7eb;">Situação Atual</th>
                        <th style="padding: 10px; border: 1px solid #e5e7eb;">Melhor Oportunidade (Tarifário)</th>
                        <th style="padding: 10px; border: 1px solid #e5e7eb;">Validade Tarifa</th>
                        <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: right;">Economia</th>
                    </tr>
                </thead>
                <tbody>
                    ${opportunities.map((op, idx) => `
                        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'}; border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 8px; border: 1px solid #e5e7eb; vertical-align: top;">
                                <strong>${op.processoId}</strong><br/>
                                <span style="color: #6b7280;">${op.cliente}</span><br/>
                                <span style="font-size: 10px; color: #4b5563;">Prontidão: ${op.dataProntidao || 'N/A'}</span><br/>
                                <span style="font-size: 10px; color: #4b5563;">TT: ${op.transitTime ? op.transitTime + ' dias' : 'N/A'}</span><br/>
                                <span style="font-size: 10px; color: #4b5563;">FT: ${op.freeTime !== 'N/A' ? op.freeTime + ' dias' : 'N/A'}</span>
                            </td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb; vertical-align: top;">
                                ${op.origem} &rarr; ${op.destino}<br/>
                                <span style="background-color: #e5e7eb; padding: 2px 4px; border-radius: 4px; font-size: 10px;">${op.tipoContainer} (${op.quantidadeContainers}x)</span>
                            </td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb; vertical-align: top;">
                                <div style="font-weight: bold; color: #4b5563;">${formatCurrency(op.valorProcesso)}</div>
                                <div style="font-size: 11px; color: #6b7280;">${op.armadorAtual}</div>
                                <div style="font-size: 10px; color: #9ca3af;">${op.agenteAtual}</div>
                            </td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb; vertical-align: top; background-color: #f0fdfa;">
                                <div style="font-weight: bold; color: #0891b2;">${formatCurrency(op.bestTariff['FRETE POR CNTR'])}</div>
                                <div style="font-size: 11px; color: #4b5563;">${op.bestTariff.ARMADOR}</div>
                                <div style="font-size: 10px; color: #6b7280;">${op.bestTariff.AGENTE || '-'}</div>
                                <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">FT: ${op.bestTariff['FREE TIME'] ? op.bestTariff['FREE TIME'] + ' dias' : 'N/A'}</div>
                                ${op.bestTariff.DESCRICAO && op.bestTariff.DESCRICAO !== 'N/A' ? `<div style="font-size: 9px; color: #d97706; margin-top: 2px; font-style: italic;">Obs: ${op.bestTariff.DESCRICAO}</div>` : ''}
                            </td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb; vertical-align: top; text-align: center;">
                                <span style="font-weight: bold; color: #d97706;">${op.bestTariff['FIM VALIDADE'] || 'Indefinida'}</span>
                            </td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb; vertical-align: middle; text-align: right;">
                                <strong style="color: #059669; font-size: 13px;">${formatCurrency(op.economy)}</strong>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${dashboardButton}
            <br/>
            <p style="font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                Relatório gerado automaticamente pelo Sistema de Análise de Fretes.
            </p>
        </div>
    `;

    try {
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob(["Seu cliente de e-mail não suporta HTML rico. Use o anexo."], { type: 'text/plain' });
        
        const data = [new ClipboardItem({ 
            ["text/html"]: blobHtml,
            ["text/plain"]: blobText
        })];
        
        await navigator.clipboard.write(data);

        const subject = encodeURIComponent(`${title} - ${new Date().toLocaleDateString('pt-BR')}`);
        // Corpo do email simples indicando ação
        const body = encodeURIComponent("Olá Larissa,\n\nSegue a notificação das oportunidades de recompra identificadas.\n\n--> COLE A TABELA AQUI (CTRL+V) <--\n\nAtt,");
        
        // Pequeno delay visual
        setTimeout(() => {
            alert("✅ Relatório Visual Copiado!\n\nO seu e-mail será aberto automaticamente.\n\nBasta pressionar 'Ctrl + V' (Colar) no corpo da mensagem para inserir a tabela formatada com todas as validades e valores.");
            window.location.href = `mailto:larissa.kruger@mondshipping.com.br?subject=${subject}&body=${body}`;
        }, 100);

    } catch (err) {
        console.error("Erro clipboard:", err);
        alert("Erro ao gerar relatório visual automático. Tente exportar o CSV.");
    }
};

const StatusBadge: React.FC<{ status: AnalysisResult['status'] | RouteComparison['status'] }> = ({ status }) => {
    const statusInfo: Record<string, {text: string; className: string; tooltip: string;}> = {
        'Oportunidade': {
            text: 'Oportunidade',
            className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            tooltip: 'Economia potencial encontrada ao comparar com o tarifário.'
        },
        'Não Econômico': {
            text: 'Não Econômico',
            className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
            tooltip: 'O valor pago já é menor ou igual à melhor tarifa encontrada no tarifário.'
        },
        'Sem Tarifa': {
            text: 'Sem Tarifa',
            className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            tooltip: 'Não foi encontrada uma rota correspondente (Origem-Destino e Tipo de Container) no tarifário.'
        },
        'Dados Inválidos': {
            text: 'Dados Inválidos',
            className: 'bg-red-500/20 text-red-300 border-red-500/30',
            tooltip: 'Dados ausentes ou mal formatados na planilha de processos (Ex: Origem, Destino ou Valor).'
        },
        'Potencial de Economia': {
            text: 'Potencial de Economia',
            className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            tooltip: 'A média paga nesta rota é maior que a melhor tarifa encontrada no acordo.'
        },
        'Custo Otimizado': {
            text: 'Custo Otimizado',
            className: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
            tooltip: 'A média paga nesta rota já é igual ou inferior à melhor tarifa do acordo.'
        },
        'Sem Tarifa no Acordo': {
            text: 'Sem Tarifa no Acordo',
            className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
            tooltip: 'Esta rota (incluindo tipo de container) não foi encontrada no seu tarifário para comparação.'
        }
    };

    const info = statusInfo[status];
    if (!info) return null;

    return (
        <span title={info.tooltip} className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${info.className}`}>
            {info.text}
        </span>
    );
};

const CopyToClipboardButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
        }, (err) => {
            console.error('Could not copy text: ', err);
        });
    };

    return (
        <button onClick={handleCopy} title={copied ? 'Copiado!' : 'Copiar'} className="ml-2 text-gray-400 hover:text-white transition-colors duration-200">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {copied ? (
                     <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
            </svg>
        </button>
    );
};


// --- Sorting Infrastructure ---
type SortConfig<T> = {
    key: keyof T;
    direction: 'asc' | 'desc';
} | null;

const SortableHeader: React.FC<{
    title: string;
    sortKey: keyof AnalysisResult;
    sortConfig: SortConfig<AnalysisResult> | null;
    requestSort: (key: keyof AnalysisResult) => void;
    className?: string;
}> = ({ title, sortKey, sortConfig, requestSort, className }) => {
    const isSorted = sortConfig?.key === sortKey;
    const directionIcon = sortConfig?.direction === 'asc' ? '↑' : '↓';

    return (
        <th scope="col" className={className || "p-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"}>
            <button
                type="button"
                onClick={() => requestSort(sortKey)}
                className="flex items-center space-x-1 group"
            >
                <span>{title}</span>
                <span className={`transition-opacity duration-200 ${isSorted ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>
                    {directionIcon}
                </span>
            </button>
        </th>
    );
};
// --- End Sorting Infrastructure ---


const RouteComparisonTable: React.FC<{ comparisons: RouteComparison[] }> = ({ comparisons }) => (
     <div>
        <h3 className="text-xl font-medium text-white mb-1">Cruzamento Automático por Rota</h3>
        <p className="text-sm text-gray-400 mb-4">Análise agregada de cada rota e tipo de container, comparando a média de valor pago nos seus processos com a melhor tarifa disponível.</p>
        <div className="overflow-x-auto bg-gray-800/50 rounded-lg shadow-lg border border-gray-700 backdrop-blur-sm">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/70">
                    <tr>
                        {['Status do Cruzamento', 'Rota (Origem → Destino)', 'Tipo de Container', 'Nº de Processos', 'Média Presente (Processos)', 'Melhor Tarifa (Tarifário)', 'Diferença Média'].map(header => (
                            <th key={header} scope="col" className="p-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {comparisons.map(comp => (
                        <tr key={comp.routeId} className="hover:bg-gray-700/50 transition-colors duration-200">
                            <td className="p-4 whitespace-nowrap text-sm"><StatusBadge status={comp.status} /></td>
                            <td className="p-4 whitespace-nowrap text-sm font-bold text-white">{comp.origem} → {comp.destino}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{comp.tipoContainer}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{comp.processCount}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{formatCurrency(comp.avgPaid)}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-cyan-400">{formatCurrency(comp.bestTariff)}</td>
                            <td className={`p-4 whitespace-nowrap text-sm font-bold ${comp.status === 'Potencial de Economia' ? 'text-emerald-400' : comp.status === 'Custo Otimizado' ? 'text-red-400' : 'text-gray-400'}`}>{formatCurrency(comp.avgDifference)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);


const FullAnalysisTable: React.FC<{
    results: AnalysisResult[];
    sortConfig: SortConfig<AnalysisResult> | null;
    requestSort: (key: keyof AnalysisResult) => void;
}> = ({ results, sortConfig, requestSort }) => (
    <div>
        <h3 className="text-xl font-medium text-white mb-1">Análise Comparativa Completa</h3>
        <p className="text-sm text-gray-400 mb-4">Abaixo a análise detalhada de todos os processos comparados com o tarifário. Clique nos cabeçalhos das colunas para ordenar.</p>
        <div className="overflow-x-auto bg-gray-800/50 rounded-lg shadow-lg border border-gray-700 backdrop-blur-sm">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/70">
                    <tr>
                        <SortableHeader title="Status/Motivo" sortKey="status" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Processo" sortKey="processoId" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Cliente" sortKey="cliente" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Prontidão Carga" sortKey="dataProntidao" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Transit Time" sortKey="transitTime" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Free Time (Processo)" sortKey="freeTime" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Previsão de Embarque" sortKey="dataEmissao" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Origem" sortKey="origem" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Destino" sortKey="destino" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Tipo de Container" sortKey="tipoContainer" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Qtd. Cntr" sortKey="quantidadeContainers" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Valor Presente" sortKey="valorProcesso" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Armador Atual" sortKey="armadorAtual" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Agente Atual" sortKey="agenteAtual" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Melhor Tarifa" sortKey="melhorTarifa" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Validade Tarifa" sortKey="validadeMelhorTarifa" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Diferença" sortKey="diferenca" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Armador (Tarifário)" sortKey="armadorNovo" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Agente (Tarifário)" sortKey="agenteNovo" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Free Time (Tarifário)" sortKey="freeTimeTarifa" sortConfig={sortConfig} requestSort={requestSort} />
                        <SortableHeader title="Obs. Tarifa" sortKey="descricaoTarifa" sortConfig={sortConfig} requestSort={requestSort} />
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {results.map((res, index) => (
                        <tr key={`${res.processoId}-${index}`} className="hover:bg-gray-700/50 transition-colors duration-200">
                            <td className="p-4 whitespace-nowrap text-sm"><StatusBadge status={res.status} /></td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">
                                <div className="flex items-center">
                                    <span>{res.processoId}</span>
                                    <CopyToClipboardButton text={res.processoId} />
                                </div>
                            </td>
                             <td className="p-4 whitespace-nowrap text-sm text-gray-300">{res.cliente}</td>
                             <td className="p-4 whitespace-nowrap text-sm text-gray-300">{res.dataProntidao}</td>
                             <td className="p-4 whitespace-nowrap text-sm text-gray-300 text-center">{res.transitTime ? `${res.transitTime} dias` : 'N/A'}</td>
                             <td className="p-4 whitespace-nowrap text-sm text-gray-300 text-center">{res.freeTime !== 'N/A' ? `${res.freeTime} dias` : 'N/A'}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{res.dataEmissao}</td>
                            <td className="p-4 whitespace-nowrap text-sm font-medium text-gray-200">{res.origem}</td>
                            <td className="p-4 whitespace-nowrap text-sm font-medium text-gray-200">{res.destino}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{res.tipoContainer}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300 text-center">{res.quantidadeContainers}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{formatCurrency(res.valorProcesso)}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-400">{res.armadorAtual}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-400">{res.agenteAtual}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-cyan-400">{formatCurrency(res.melhorTarifa)}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-400">{res.validadeMelhorTarifa}</td>
                            <td className={`p-4 whitespace-nowrap text-sm font-bold ${res.status === 'Oportunidade' ? 'text-emerald-400' : res.status === 'Não Econômico' ? 'text-red-400' : 'text-gray-400'}`}>{formatCurrency(res.diferenca)}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-400">{res.armadorNovo}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-400">{res.agenteNovo}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300 text-center">{res.freeTimeTarifa !== 'N/A' ? `${res.freeTimeTarifa} dias` : 'N/A'}</td>
                            <td className="p-4 text-sm text-gray-400 min-w-[200px]">{res.descricaoTarifa !== 'N/A' ? res.descricaoTarifa : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const TarifarioTable: React.FC<{ tarifas: Tarifa[] }> = ({ tarifas }) => (
    <div>
        <h3 className="text-xl font-medium text-white mb-1">Tabela de Tarifas Carregada</h3>
        <p className="text-sm text-gray-400 mb-4">Estes são os dados carregados da planilha de tarifário, usados como base para a análise.</p>
        <div className="overflow-x-auto bg-gray-800/50 rounded-lg shadow-lg border border-gray-700 backdrop-blur-sm">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/70">
                    <tr>
                        {['Origem', 'Destino', 'Container', 'Vl. Total Frete', 'Fim Validade', 'Armador', 'Agente', 'Free Time', 'Observações'].map(header => (
                            <th key={header} scope="col" className="p-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {tarifas.map((tarifa, index) => (
                        <tr key={`${tarifa.ORIGEM}-${tarifa.DESTINO}-${index}`} className="hover:bg-gray-700/50 transition-colors duration-200">
                            <td className="p-4 whitespace-nowrap text-sm font-medium text-gray-200">{tarifa.ORIGEM}</td>
                            <td className="p-4 whitespace-nowrap text-sm font-medium text-gray-200">{tarifa.DESTINO}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{tarifa.TIPO_CONTAINER}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-cyan-400">{formatCurrency(tarifa['FRETE POR CNTR'])}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{tarifa['FIM VALIDADE'] || 'N/A'}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{tarifa.ARMADOR}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{tarifa.AGENTE || 'N/A'}</td>
                            <td className="p-4 whitespace-nowrap text-sm text-gray-300">{tarifa['FREE TIME'] ? `${tarifa['FREE TIME']} dias` : 'N/A'}</td>
                            <td className="p-4 text-sm text-gray-400 min-w-[150px]">{tarifa.DESCRICAO || ''}</td>
                        </tr>
                    ))}
                     {tarifas.length === 0 && (
                        <tr>
                            <td colSpan={9} className="text-center p-8 text-gray-400">Nenhum dado de tarifário foi carregado.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);


const OpportunityGroupRow: React.FC<{ group: OpportunityGroup }> = ({ group }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig<AnalysisResult>>({ key: 'diferenca', direction: 'desc' });
    const bestOption = group.tariffOptions.length > 0 ? group.tariffOptions[0] : null;

    const requestSort = (key: keyof AnalysisResult) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (
            sortConfig &&
            sortConfig.key === key &&
            sortConfig.direction === 'asc'
        ) {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleRouteNotification = () => {
        if (!bestOption) return;
        
        const opportunities = group.processos
            .filter(p => p.status === 'Oportunidade')
            .map(p => ({
                ...p,
                bestTariff: bestOption.tarifa,
                economy: typeof p.diferenca === 'number' ? p.diferenca : 0
            }));

        const routeString = `${group.origem} → ${group.destino}`;
        const dashboardLink = `${window.location.origin}${window.location.pathname}?route=${encodeURIComponent(routeString)}`;

        generateAndSendEmail(
            opportunities, 
            `Oportunidade: ${routeString} (${group.tipoContainer})`,
            dashboardLink
        );
    };

    const sortedProcessos = useMemo(() => {
        let sortableItems = [...group.processos];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const { key, direction } = sortConfig;
                const aVal = a[key];
                const bVal = b[key];

                const isANotApplicable = aVal === 'N/A' || aVal === null || aVal === undefined;
                const isBNotApplicable = bVal === 'N/A' || bVal === null || bVal === undefined;
                
                if (isANotApplicable) return 1;
                if (isBNotApplicable) return -1;

                const dir = direction === 'asc' ? 1 : -1;

                if (key === 'dataEmissao' || key === 'validadeMelhorTarifa' || key === 'dataProntidao') {
                    const parseDMY = (dateString: string): Date | null => {
                        if (!dateString || typeof dateString !== 'string' || dateString === 'N/A') return null;
                        const parts = dateString.split('/');
                        if (parts.length !== 3) return null;
                        const [day, month, year] = parts.map(Number);
                        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
                        return new Date(year, month - 1, day);
                    };
                    const dateA = parseDMY(aVal as string);
                    const dateB = parseDMY(bVal as string);

                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    
                    return (dateA.getTime() - dateB.getTime()) * dir;
                }

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return (aVal - bVal) * dir;
                }

                return String(aVal).localeCompare(String(bVal)) * dir;
            });
        }
        return sortableItems;
    }, [group.processos, sortConfig]);

    if (!bestOption) {
        return null;
    }

    return (
        <div className="bg-gray-800 rounded-lg mb-3 transition-all duration-300 hover:bg-gray-700/50 border border-gray-700">
            <div className="flex items-start p-4 flex-wrap gap-4">
                <div className="flex-grow min-w-[300px]">
                    <div className="flex items-center gap-3 mb-1">
                        <p className="font-bold text-lg text-white">{group.origem} → {group.destino}</p>
                        <button
                            onClick={handleRouteNotification}
                            className="flex items-center px-2 py-1 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white text-xs rounded transition-colors"
                            title="Notificar apenas esta rota"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                            </svg>
                            Notificar
                        </button>
                    </div>
                    <p className="text-sm text-gray-400">
                        {group.processos.length} processo(s) com potencial de economia em {group.tariffOptions.length} opçōes de tarifa.
                    </p>
                    <div className="mt-2">
                        <p className="text-xs text-gray-400">Container</p>
                        <p className="font-semibold text-gray-200">{group.tipoContainer}</p>
                    </div>
                </div>

                <div className="flex-shrink-0 ml-auto text-right">
                    <p className="text-xs text-gray-400">Economia Total (Melhor Opção)</p>
                    <p className="font-bold text-2xl text-emerald-400">{formatCurrency(group.economiaTotalAgregada)}</p>
                    <p className="text-sm text-gray-400 mt-1">
                        com <span className="font-semibold text-gray-200">{bestOption.tarifa.ARMADOR}</span> por <span className="font-semibold text-cyan-400">{formatCurrency(bestOption.tarifa['FRETE POR CNTR'])}</span>
                    </p>
                </div>
            </div>

            <div className="px-4 pb-2">
                <h4 className="text-sm font-semibold text-gray-300 mb-2 border-t border-gray-700 pt-3">Opções de Tarifa Mais Econômicas</h4>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-gray-400 uppercase">
                                <th className="py-1 pr-3 font-medium">Armador / Agente</th>
                                <th className="py-1 px-3 font-medium">Valor Tarifa</th>
                                <th className="py-1 px-3 font-medium">Fim Validade</th>
                                <th className="py-1 px-3 font-medium">Free Time</th>
                                <th className="py-1 px-3 font-medium">Observações</th>
                                <th className="py-1 pl-3 font-medium text-right">Economia Potencial</th>
                            </tr>
                        </thead>
                        <tbody>
                            {group.tariffOptions.map((option, index) => (
                                <tr key={index} className={`border-t border-gray-700/60 ${index === 0 ? 'bg-emerald-900/40' : ''}`}>
                                    <td className="py-2 pr-3 whitespace-nowrap">
                                        <p className="font-semibold text-white">{option.tarifa.ARMADOR}</p>
                                        <p className="text-xs text-gray-400">{option.tarifa.AGENTE || 'N/A'}</p>
                                    </td>
                                    <td className="py-2 px-3 whitespace-nowrap font-semibold text-cyan-400">{formatCurrency(option.tarifa['FRETE POR CNTR'])}</td>
                                    <td className="py-2 px-3 whitespace-nowrap text-gray-300">{option.tarifa['FIM VALIDADE'] || 'N/A'}</td>
                                    <td className="py-2 px-3 whitespace-nowrap text-gray-300">{option.tarifa['FREE TIME'] ? `${option.tarifa['FREE TIME']} dias` : 'N/A'}</td>
                                    <td className="py-2 px-3 text-gray-400 min-w-[150px]">{option.tarifa.DESCRICAO || '-'}</td>
                                    <td className="py-2 pl-3 whitespace-nowrap font-bold text-emerald-400 text-right">{formatCurrency(option.economiaPotencial)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="px-4 py-2 border-t border-gray-700 text-center">
                <button onClick={() => setIsOpen(!isOpen)} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center justify-center w-full">
                    <span>{isOpen ? 'Ocultar' : 'Mostrar'} {group.processos.length} Processo(s) Detalhado(s)</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-1 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="http://www.w3.org/2000/svg" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {isOpen && (
                <div className="p-4 border-t border-gray-700">
                     <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="text-left">
                                    <SortableHeader title="Processo" sortKey="processoId" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Cliente" sortKey="cliente" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Prontidão Carga" sortKey="dataProntidao" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Transit Time" sortKey="transitTime" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Free Time" sortKey="freeTime" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Previsão de Embarque" sortKey="dataEmissao" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Qtd. Cntr" sortKey="quantidadeContainers" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Armador Atual" sortKey="armadorAtual" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Agente Atual" sortKey="agenteAtual" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Valor Presente" sortKey="valorProcesso" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                    <SortableHeader title="Diferença (Melhor Tarifa)" sortKey="diferenca" sortConfig={sortConfig} requestSort={requestSort} className="pb-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"/>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedProcessos.map((p, i) => (
                                    <tr key={i} className="border-b border-gray-700/50 last:border-b-0">
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <span>{p.processoId}</span>
                                                <CopyToClipboardButton text={p.processoId} />
                                            </div>
                                        </td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">{p.cliente}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">{p.dataProntidao}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap text-center">{p.transitTime ? `${p.transitTime} dias` : 'N/A'}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap text-center">{p.freeTime !== 'N/A' ? `${p.freeTime} dias` : 'N/A'}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">{p.dataEmissao}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap text-center">{p.quantidadeContainers}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">{p.armadorAtual}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">{p.agenteAtual}</td>
                                        <td className="py-2 text-sm text-gray-300 whitespace-nowrap">{formatCurrency(p.valorProcesso)}</td>
                                        <td className="py-2 text-sm font-bold text-emerald-400 whitespace-nowrap">{formatCurrency(p.diferenca)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export const OpportunitiesTable: React.FC<OpportunitiesTableProps> = ({
    opportunityGroups,
    fullAnalysisResults,
    tarifas,
    routeComparisons,
    processosByRoute,
    tarifasByRoute,
    allUniqueRoutes
}) => {
    const [activeTab, setActiveTab] = useState<'opportunities' | 'routes' | 'full' | 'manual' | 'tarifario'>('opportunities');
    const [sortConfig, setSortConfig] = useState<SortConfig<AnalysisResult>>({ key: 'diferenca', direction: 'desc' });
    
    // Deep linking for Manual View
    const [initialRoute, setInitialRoute] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const routeParam = params.get('route');
        if (routeParam) {
            setInitialRoute(routeParam);
            setActiveTab('manual');
        }
    }, []);

    const requestSort = (key: keyof AnalysisResult) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (
            sortConfig &&
            sortConfig.key === key &&
            sortConfig.direction === 'asc'
        ) {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedResults = useMemo(() => {
        let sortableItems = [...fullAnalysisResults];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                 const { key, direction } = sortConfig;
                const aVal = a[key];
                const bVal = b[key];

                const isANotApplicable = aVal === 'N/A' || aVal === null || aVal === undefined;
                const isBNotApplicable = bVal === 'N/A' || bVal === null || bVal === undefined;
                
                if (isANotApplicable) return 1;
                if (isBNotApplicable) return -1;

                const dir = direction === 'asc' ? 1 : -1;

                if (key === 'dataEmissao' || key === 'validadeMelhorTarifa' || key === 'dataProntidao') {
                    const parseDMY = (dateString: string): Date | null => {
                        if (!dateString || typeof dateString !== 'string' || dateString === 'N/A') return null;
                        const parts = dateString.split('/');
                        if (parts.length !== 3) return null;
                        const [day, month, year] = parts.map(Number);
                        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
                        return new Date(year, month - 1, day);
                    };
                    const dateA = parseDMY(aVal as string);
                    const dateB = parseDMY(bVal as string);

                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    
                    return (dateA.getTime() - dateB.getTime()) * dir;
                }

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return (aVal - bVal) * dir;
                }

                return String(aVal).localeCompare(String(bVal)) * dir;
            });
        }
        return sortableItems;
    }, [fullAnalysisResults, sortConfig]);

    return (
        <div>
           {/* Tabs Navigation */}
           <div className="flex flex-wrap border-b border-gray-700 mb-6">
                <button
                    className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'opportunities' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('opportunities')}
                >
                    Oportunidades ({opportunityGroups.length})
                </button>
                <button
                    className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'routes' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('routes')}
                >
                    Cruzamento por Rota
                </button>
                <button
                     className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'full' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('full')}
                >
                    Análise Completa ({fullAnalysisResults.length})
                </button>
                 <button
                    className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'manual' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('manual')}
                >
                    Cruzamento Manual
                </button>
                <button
                    className={`py-2 px-4 text-sm font-medium focus:outline-none ${activeTab === 'tarifario' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('tarifario')}
                >
                    Tarifário Carregado ({tarifas.length})
                </button>
           </div>

           {/* Tab Content */}
           <div className="animate-fade-in">
                {activeTab === 'opportunities' && (
                    <div>
                         {opportunityGroups.length === 0 ? (
                            <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h3 className="text-xl font-medium text-white">Nenhuma oportunidade de economia encontrada</h3>
                                <p className="text-gray-400 mt-2">Todos os processos analisados já estão com valores otimizados ou não possuem tarifas correspondentes melhores.</p>
                            </div>
                         ) : (
                             <div>
                                <h3 className="text-xl font-medium text-white mb-4">Oportunidades de Recompra Agrupadas</h3>
                                {opportunityGroups.map(group => (
                                    <OpportunityGroupRow key={group.id} group={group} />
                                ))}
                             </div>
                         )}
                    </div>
                )}

                {activeTab === 'routes' && (
                     <RouteComparisonTable comparisons={routeComparisons} />
                )}

                {activeTab === 'full' && (
                    <FullAnalysisTable 
                        results={sortedResults} 
                        sortConfig={sortConfig} 
                        requestSort={requestSort} 
                    />
                )}
                
                 {activeTab === 'manual' && (
                    <ManualCrossReferenceView 
                        routes={allUniqueRoutes}
                        processosByRoute={processosByRoute}
                        tarifasByRoute={tarifasByRoute}
                        initialRoute={initialRoute}
                    />
                )}

                {activeTab === 'tarifario' && (
                    <TarifarioTable tarifas={tarifas} />
                )}
           </div>
        </div>
    );
};

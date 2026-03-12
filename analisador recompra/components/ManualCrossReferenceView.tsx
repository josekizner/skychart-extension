
import React, { useState, useEffect, useMemo } from 'react';
import type { Processo, Tarifa } from '../types';

type SortConfig<T> = {
    key: keyof T;
    direction: 'asc' | 'desc';
} | null;

interface ManualCrossReferenceViewProps {
    routes: string[];
    processosByRoute: Map<string, Processo[]>;
    tarifasByRoute: Map<string, Tarifa[]>;
    initialRoute?: string | null; // New prop for Deep Linking
}

const formatCurrency = (value: number | undefined) => {
    if (typeof value !== 'number' || isNaN(value)) {
        return 'N/A';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);
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

const SortableHeader: React.FC<{
    title: string;
    sortKey: string;
    sortConfig: SortConfig<any> | null;
    requestSort: (key: string) => void;
}> = ({ title, sortKey, sortConfig, requestSort }) => {
    const isSorted = sortConfig?.key === sortKey;
    const directionIcon = sortConfig?.direction === 'asc' ? '↑' : '↓';

    return (
        <th scope="col" className="p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
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


export const ManualCrossReferenceView: React.FC<ManualCrossReferenceViewProps> = ({ routes, processosByRoute, tarifasByRoute, initialRoute }) => {
    const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
    const [processosSortConfig, setProcessosSortConfig] = useState<SortConfig<Processo>>(null);
    const [tarifasSortConfig, setTarifasSortConfig] = useState<SortConfig<Tarifa>>({ key: 'FRETE POR CNTR', direction: 'asc' });
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyMatches, setShowOnlyMatches] = useState(false);
    
    // Updated logic to handle initialRoute or default to first route
    useEffect(() => {
        if (routes.length > 0) {
            if (initialRoute && routes.includes(initialRoute)) {
                setSelectedRoute(initialRoute);
            } else if (!selectedRoute) {
                setSelectedRoute(routes[0]);
            }
        }
    }, [routes, initialRoute]);
    
    const filteredRoutes = useMemo(() => {
        let tempRoutes = routes;

        if (showOnlyMatches) {
            tempRoutes = tempRoutes.filter(route => {
                const hasProcessos = processosByRoute.has(route) && (processosByRoute.get(route)?.length ?? 0) > 0;
                const hasTarifas = tarifasByRoute.has(route) && (tarifasByRoute.get(route)?.length ?? 0) > 0;
                return hasProcessos && hasTarifas;
            });
        }

        if (searchTerm) {
            return tempRoutes.filter(route =>
                route.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        return tempRoutes;
    }, [routes, searchTerm, showOnlyMatches, processosByRoute, tarifasByRoute]);

    const selectedProcessos = useMemo(() => {
        const items = selectedRoute ? processosByRoute.get(selectedRoute) || [] : [];
        if (processosSortConfig !== null) {
            return [...items].sort((a, b) => {
                const { key, direction } = processosSortConfig;
                const aVal = a[key];
                const bVal = b[key];
                
                const isANull = aVal === null || aVal === undefined;
                const isBNull = bVal === null || bVal === undefined;
                if(isANull) return 1;
                if(isBNull) return -1;
                
                const dir = direction === 'asc' ? 1 : -1;

                if (key === 'DT_PREVISAO_EMBARQUE' || key === 'DT_PRONTIDAO_CARGA') {
                    // Helper to parse DD/MM/YYYY dates
                    const parseDMY = (dateString: string): Date | null => {
                        if (!dateString || typeof dateString !== 'string') return null;
                        const parts = dateString.split('/');
                        if (parts.length !== 3) return null;
                        const [day, month, year] = parts.map(Number);
                        // Note: Month is 0-indexed in JS Date
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
        return items;
    }, [selectedRoute, processosByRoute, processosSortConfig]);

    const selectedTarifas = useMemo(() => {
        const items = selectedRoute ? tarifasByRoute.get(selectedRoute) || [] : [];
        if (tarifasSortConfig !== null) {
            return [...items].sort((a, b) => {
                const { key, direction } = tarifasSortConfig;
                const aVal = a[key];
                const bVal = b[key];

                const isANull = aVal === null || aVal === undefined;
                const isBNull = bVal === null || bVal === undefined;
                if (isANull) return 1;
                if (isBNull) return -1;

                const dir = direction === 'asc' ? 1 : -1;

                if (key === 'FIM VALIDADE') {
                    const parseDMY = (dateString: string): Date | null => {
                        if (!dateString || typeof dateString !== 'string') return null;
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
        return items;
    }, [selectedRoute, tarifasByRoute, tarifasSortConfig]);

    const requestSort = <T,>(key: keyof T, config: SortConfig<T>, setConfig: React.Dispatch<React.SetStateAction<SortConfig<T>>>) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (config && config.key === key && config.direction === 'asc') {
            direction = 'desc';
        }
        setConfig({ key, direction });
    };

    if (routes.length === 0) {
        return <div className="text-center text-gray-400 py-8">Nenhuma rota encontrada para comparação.</div>
    }

    return (
        <div>
            <h3 className="text-xl font-medium text-white mb-1">Cruzamento Manual por Rota</h3>
            <p className="text-sm text-gray-400 mb-4">Selecione uma rota para comparar seus processos com as tarifas lado a lado. Clique nos cabeçalhos para ordenar.</p>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Route List */}
                <div className="lg:col-span-1">
                    <div className="bg-gray-800/50 rounded-lg p-3 max-h-[600px] flex flex-col border border-gray-700">
                         <div className="relative mb-2 px-1">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <svg className="h-4 w-4 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="http://www.w3.org/2000/svg">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar rota..."
                                className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-1.5 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
                            />
                        </div>
                        <div className="px-1 mb-2">
                            <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={showOnlyMatches}
                                    onChange={(e) => setShowOnlyMatches(e.target.checked)}
                                    className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                                />
                                <span>Mostrar apenas rotas com match</span>
                            </label>
                        </div>
                        <ul className="overflow-y-auto flex-grow border-t border-gray-700 pt-2">
                            {filteredRoutes.map(route => {
                                const hasProcessos = processosByRoute.has(route) && (processosByRoute.get(route)?.length ?? 0) > 0;
                                const hasTarifas = tarifasByRoute.has(route) && (tarifasByRoute.get(route)?.length ?? 0) > 0;

                                let indicatorClass = 'bg-gray-500';
                                let indicatorTooltip = 'Rota presente em apenas uma das fontes de dados.';

                                if (hasProcessos && hasTarifas) {
                                    indicatorClass = 'bg-emerald-500';
                                    indicatorTooltip = 'Match: Rota encontrada nos Processos e no Tarifário.';
                                } else if (hasProcessos) {
                                    indicatorTooltip = 'Apenas Processos: Rota encontrada somente nos seus processos.';
                                } else if (hasTarifas) {
                                    indicatorTooltip = 'Apenas Tarifário: Rota encontrada somente no tarifário.';
                                }

                                return (
                                <li key={route}>
                                    <button
                                        onClick={() => setSelectedRoute(route)}
                                        className={`w-full text-left text-sm p-2 rounded-md transition-colors duration-200 flex items-center space-x-2 ${
                                            selectedRoute === route
                                                ? 'bg-emerald-600/50 text-white font-semibold'
                                                : 'text-gray-300 hover:bg-gray-700/60'
                                        }`}
                                    >
                                        <span title={indicatorTooltip} className={`flex-shrink-0 inline-block w-2.5 h-2.5 rounded-full ${indicatorClass}`}></span>
                                        <span>{route}</span>
                                    </button>
                                </li>
                                );
                            })}
                            {filteredRoutes.length === 0 && (
                                <li className="p-4 text-center text-sm text-gray-500">Nenhuma rota encontrada.</li>
                            )}
                        </ul>
                    </div>
                </div>

                {/* Data Tables */}
                <div className="lg:col-span-3">
                    {!selectedRoute ? (
                         <div className="flex items-center justify-center h-full text-gray-400 bg-gray-800/50 rounded-lg p-3 border border-gray-700">Selecione uma rota para começar</div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                           {/* Processos Table */}
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Seus Processos ({selectedProcessos.length})</h4>
                                <div className="overflow-x-auto bg-gray-800/50 rounded-lg shadow-md border border-gray-700 max-h-[550px] overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-700">
                                        <thead className="bg-gray-800/70 sticky top-0">
                                            <tr>
                                                <SortableHeader title="Processo" sortKey="PROCESSO" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Cliente" sortKey="CLIENTE" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Prontidão" sortKey="DT_PRONTIDAO_CARGA" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Transit Time" sortKey="TRANSIT_TIME" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Free Time" sortKey="FREE_TIME" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Qtd. Cntr" sortKey="QUANTIDADE_CONTAINERS" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Tipo Container" sortKey="TIPO_CONTAINER" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Armador" sortKey="ARMADOR" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                                <SortableHeader title="Frete" sortKey="FRETE POR CNTR" sortConfig={processosSortConfig} requestSort={(k) => requestSort(k as keyof Processo, processosSortConfig, setProcessosSortConfig)} />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {selectedProcessos.map((p, index) => (
                                                <tr key={`${p.PROCESSO}-${index}`} className="hover:bg-gray-700/50">
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">
                                                         <div className="flex items-center">
                                                            <span>{p.PROCESSO}</span>
                                                            <CopyToClipboardButton text={p.PROCESSO} />
                                                        </div>
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{p.CLIENTE}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-400">{p['DT_PRONTIDAO_CARGA']}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{p.TRANSIT_TIME} dias</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{p.FREE_TIME !== 'N/A' ? `${p.FREE_TIME} dias` : 'N/A'}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300 text-center">{p.QUANTIDADE_CONTAINERS}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{p.TIPO_CONTAINER}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{p.ARMADOR}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm font-bold text-emerald-300">{formatCurrency(p['FRETE POR CNTR'])}</td>
                                                </tr>
                                            ))}
                                            {selectedProcessos.length === 0 && (
                                                <tr><td colSpan={9} className="text-center p-6 text-gray-500">Nenhum processo encontrado para esta rota.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                             {/* Tarifas Table */}
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Tarifas no Acordo ({selectedTarifas.length})</h4>
                                 <div className="overflow-x-auto bg-gray-800/50 rounded-lg shadow-md border border-gray-700 max-h-[550px] overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-700">
                                        <thead className="bg-gray-800/70 sticky top-0">
                                            <tr>
                                                <SortableHeader title="Vl. Total Frete" sortKey="FRETE POR CNTR" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                                <SortableHeader title="Fim Validade" sortKey="FIM VALIDADE" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                                <SortableHeader title="Free Time" sortKey="FREE TIME" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                                <SortableHeader title="Obs." sortKey="DESCRICAO" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                                <SortableHeader title="Container" sortKey="TIPO_CONTAINER" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                                <SortableHeader title="Armador" sortKey="ARMADOR" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                                <SortableHeader title="Agente" sortKey="AGENTE" sortConfig={tarifasSortConfig} requestSort={(k) => requestSort(k as keyof Tarifa, tarifasSortConfig, setTarifasSortConfig)} />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {selectedTarifas.map((t, index) => (
                                                <tr key={`${t.ARMADOR}-${index}`} className="hover:bg-gray-700/50">
                                                    <td className="p-3 whitespace-nowrap text-sm font-bold text-cyan-300">{formatCurrency(t['FRETE POR CNTR'])}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{t['FIM VALIDADE'] || 'N/A'}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{t['FREE TIME'] ? `${t['FREE TIME']} dias` : 'N/A'}</td>
                                                    <td className="p-3 text-sm text-gray-400 min-w-[150px]">{t.DESCRICAO || '-'}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{t.TIPO_CONTAINER}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{t.ARMADOR}</td>
                                                    <td className="p-3 whitespace-nowrap text-sm text-gray-300">{t.AGENTE || 'N/A'}</td>
                                                </tr>
                                            ))}
                                            {selectedTarifas.length === 0 && (
                                                <tr><td colSpan={7} className="text-center p-6 text-gray-500">Nenhuma tarifa encontrada para esta rota.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

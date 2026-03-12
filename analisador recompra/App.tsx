
import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { OpportunitiesTable } from './components/OpportunitiesTable';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorDisplay } from './components/ErrorDisplay';
import { StatsCards } from './components/StatsCards';
import type { Processo, Tarifa, AnalysisResult, OpportunityGroup, RouteComparison, TariffOption } from './types';

const TARIFARIO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSyYYzHyP8DWLOP8tPJhXeTZZuDq2DgPDtQ1aJM2vyL6O6IwWb5EVxBUPkSFu74uXGhFO_VUIsPyNWB/pub?output=csv';
const OPERACIONAL_API_URL = 'https://server-mond.tail46f98e.ts.net/api/operacional';
const CUSTO_API_URL = 'https://server-mond.tail46f98e.ts.net/api/custo';
const COMERCIAL_API_URL = 'https://server-mond.tail46f98e.ts.net/api/comercial';
const EQUIPAMENTO_API_URL = 'https://server-mond.tail46f98e.ts.net/api/equipamento';
const API_TOKEN = 'b2e7c1f4-8a2d-4e3b-9c6a-7f1e2d5a9b3c';


const parseCurrency = (value: string): number => {
    if (!value || typeof value !== 'string') return NaN;
    const cleanedValue = value
        .replace(/R?\$ ?/g, '') 
        .replace(/\./g, '')       
        .replace(',', '.');      

    if (cleanedValue === '') return NaN;
    const number = parseFloat(cleanedValue);
    return isNaN(number) ? NaN : number;
};

const parseCsv = <T extends Record<string, any>>(csvText: string, currencyFields: (keyof T)[]): T[] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    const normalizedText = csvText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < normalizedText.length; i++) {
        const char = normalizedText[i];
        const nextChar = normalizedText[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++; 
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }

    currentRow.push(currentField);
    rows.push(currentRow);
    
    if (rows.length < 2) {
        console.warn("CSV has less than 2 rows (header + data).")
        return [];
    }

    const headers = rows[0].map(h => h.trim().toUpperCase());
    const dataRows = rows.slice(1);

    const data: T[] = [];
    for (const row of dataRows) {
        if (row.length === 0 || (row.length === 1 && row[0] === '')) continue; 

        const entry = headers.reduce((obj, header, idx) => {
            if (idx < row.length) {
                let key = header;
                if (header === 'VL. TOTAL FRETE') {
                    key = 'FRETE POR CNTR';
                }
                 if (header === 'CONTAINER') {
                    key = 'TIPO_CONTAINER';
                }

                const finalKey = key as keyof T;
                const value = (row[idx] || '').trim();

                obj[finalKey] = currencyFields.includes(finalKey)
                    ? parseCurrency(value) as any
                    : value as any;
            }
            return obj;
        }, {} as T);

        data.push(entry);
    }
    return data;
};

const normalizeString = (str: string | undefined | null): string => {
    if (!str) return '';
    return str
      .toString()
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
};

const shortenName = (name: string | undefined | null): string => {
    if (!name) return 'N/A';
    const parts = name.trim().split(/\s+/);
    if (parts.length > 2) {
        return `${parts[0]} ${parts[1]}`;
    }
    return name;
};

// Robust key normalization to ensure matching works across different data types/formatting
const safeKey = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val).trim().toUpperCase();
};


const App: React.FC = () => {
    const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
    const [opportunityGroups, setOpportunityGroups] = useState<OpportunityGroup[]>([]);
    const [routeComparisons, setRouteComparisons] = useState<RouteComparison[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [totalSavings, setTotalSavings] = useState<number>(0);
    const [opportunitiesCount, setOpportunitiesCount] = useState<number>(0);
    const [analyzedProcesses, setAnalyzedProcesses] = useState<number>(0);
    const [rawCsvData, setRawCsvData] = useState<{ tarifas: string } | null>(null);
    const [tarifasData, setTarifasData] = useState<Tarifa[]>([]);
    
    const [operacionalLastUpdated, setOperacionalLastUpdated] = useState<Date | null>(null);
    const [tarifarioLastUpdated, setTarifarioLastUpdated] = useState<Date | null>(null);
    const [previousTarifarioCsv, setPreviousTarifarioCsv] = useState<string | null>(null);


    const [processosByRoute, setProcessosByRoute] = useState<Map<string, Processo[]>>(new Map());
    const [tarifasByRoute, setTarifasByRoute] = useState<Map<string, Tarifa[]>>(new Map());
    const [allUniqueRoutes, setAllUniqueRoutes] = useState<string[]>([]);


    const analyzeData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            const analysisTime = new Date();

            const apiHeaders = {
                'Authorization': `Bearer ${API_TOKEN}`
            };

            // Função helper para fazer fetch com contexto de erro melhor e sem cache forçado
            const fetchWithContext = async (url: string, options: RequestInit = {}, name: string) => {
                try {
                    const res = await fetch(url, options);
                    if (!res.ok) {
                        throw new Error(`${name} retornou erro ${res.status}`);
                    }
                    return res;
                } catch (e) {
                     // Propaga o erro original para ser capturado pelo Promise.all
                     throw new Error(`Falha ao conectar com ${name}: ${e instanceof Error ? e.message : 'Erro de rede desconhecido'}`);
                }
            };

            // Executa em paralelo
            const [operacionalResponse, custoResponse, tarifarioResponse, comercialResponse, equipamentoResponse] = await Promise.all([
                fetchWithContext(OPERACIONAL_API_URL, { headers: apiHeaders }, 'Operacional'),
                fetchWithContext(CUSTO_API_URL, { headers: apiHeaders }, 'Custo'),
                fetchWithContext(TARIFARIO_URL, {}, 'Tarifário'),
                fetchWithContext(COMERCIAL_API_URL, { headers: apiHeaders }, 'Comercial'),
                fetchWithContext(EQUIPAMENTO_API_URL, { headers: apiHeaders }, 'Equipamento'),
            ]);
            
            // --- Success path ---
            setAnalysisResults([]);
            setOpportunityGroups([]);
            setRouteComparisons([]);
            setAnalyzedProcesses(0);
            setOpportunitiesCount(0);
            setTotalSavings(0);
            setRawCsvData(null);
            setTarifasData([]);
            setProcessosByRoute(new Map());
            setTarifasByRoute(new Map());
            setAllUniqueRoutes([]);

            const [operacionalJson, custoJson, tarifarioCsv, comercialJson, equipamentoJson] = await Promise.all([
                operacionalResponse.json(),
                custoResponse.json(),
                tarifarioResponse.text(),
                comercialResponse.json(),
                equipamentoResponse.json(),
            ]);

            setOperacionalLastUpdated(analysisTime);

            if (previousTarifarioCsv === null) {
                setTarifarioLastUpdated(analysisTime);
            } else if (tarifarioCsv.trim() !== previousTarifarioCsv.trim()) {
                setTarifarioLastUpdated(analysisTime);
            }
            setPreviousTarifarioCsv(tarifarioCsv);

            const operacionalData = Array.isArray(operacionalJson) ? operacionalJson : operacionalJson.data;
            const custoData = Array.isArray(custoJson) ? custoJson : custoJson.data;
            const comercialData = Array.isArray(comercialJson) ? comercialJson : comercialJson.data;
            const equipamentoData = Array.isArray(equipamentoJson) ? equipamentoJson : equipamentoJson.data;

            if (!Array.isArray(operacionalData) || !Array.isArray(custoData) || !Array.isArray(comercialData) || !Array.isArray(equipamentoData)) {
                console.error("API response format error.");
                throw new Error('Os dados recebidos das APIs não estão em um formato de lista válido.');
            }

            setRawCsvData({ tarifas: tarifarioCsv });
            
            // 1. Create a cost map from custoData
            const custoMap = new Map<string, number>();
            for (const item of custoData) {
                if (item.DS_TAXA === 'Frete Maritimo' && item.CD_MOVIMENTO && item.VL_TOTAL_COMPRA != null) {
                    const currentCost = custoMap.get(item.CD_MOVIMENTO) || 0;
                    const costValue = parseFloat(String(item.VL_TOTAL_COMPRA).replace(',', '.'));
                    if (!isNaN(costValue)) {
                        custoMap.set(item.CD_MOVIMENTO, currentCost + costValue);
                    }
                }
            }

            // 1.5 Create a Comercial Offer Map for Transit Time lookup
            const ofertaMap = new Map<string, string>();
            for (const item of comercialData) {
                const transitTimeVal = item.NR_TRANSIT_TIME;
                let transitTime = 'N/A';
                if (transitTimeVal !== undefined && transitTimeVal !== null && String(transitTimeVal).trim() !== '') {
                    transitTime = String(transitTimeVal).trim();
                }
                if (item.CD_OFERTA) {
                    ofertaMap.set(safeKey(item.CD_OFERTA), transitTime);
                }
                if (item.NR_OFERTA) {
                     ofertaMap.set(safeKey(item.NR_OFERTA), transitTime);
                }
            }

            // 1.6 Create an Equipment Map for Free Time lookup via CD_MOVIMENTO
            const freeTimeMap = new Map<string, number>();
            for (const item of equipamentoData) {
                if (item.CD_MOVIMENTO && item.NR_FREE_TIME_ARMADOR) {
                    const movKey = safeKey(item.CD_MOVIMENTO);
                    const freeTime = parseInt(String(item.NR_FREE_TIME_ARMADOR), 10);
                    if (!isNaN(freeTime)) {
                        freeTimeMap.set(movKey, freeTime);
                    }
                }
            }

            // 2. Filter and map operacionalData to create processos array
            const processos: Processo[] = operacionalData
                .filter((item: any) => {
                    const embarqueConfirmado = item.DT_CONFIRMACAO_EMBARQUE;
                    const isCancelled = item.DS_STATUS && normalizeString(item.DS_STATUS) === 'CANCELADO';

                    return (
                        item.PRODUTO === 'Importação Marítima' &&
                        item.DS_TIPO_FRETE === 'FCL' &&
                        !isCancelled &&
                        (!embarqueConfirmado || String(embarqueConfirmado).trim() === '')
                    );
                })
                .map((item: any) => {
                    const totalFrete = custoMap.get(item.CD_MOVIMENTO);
                    
                    const quantidadeStr = String(item.DS_QUANTIDADE_CONTAINERS || '1');
                    const numContainers = parseInt(quantidadeStr, 10);
                    const divisor = (numContainers > 0) ? numContainers : 1;
                    
                    const fretePorCntr = (totalFrete !== undefined) ? totalFrete / divisor : NaN;

                    let tipoContainer = 'N/A';
                    const match = quantidadeStr.match(/^\d+\s*x\s*(.*)$/);
                    if (match && match[1]) {
                        tipoContainer = match[1].trim();
                    }

                    // --- MATCHING LOGIC START ---
                    const rawOfertaId = item.OFERTA || item.NR_OFERTA;
                    const ofertaId = safeKey(rawOfertaId);
                    const transitTime = ofertaMap.get(ofertaId) || 'N/A';

                    const movId = safeKey(item.CD_MOVIMENTO);
                    const freeTimeVal = freeTimeMap.get(movId);
                    const freeTime: number | 'N/A' = freeTimeVal !== undefined ? freeTimeVal : 'N/A';
                    // --- MATCHING LOGIC END ---

                    return {
                        PROCESSO: item.PROCESSO,
                        CLIENTE: shortenName(item.CLIENTE),
                        'DT_PRONTIDAO_CARGA': item.DT_PRONTIDAO_CARGA || 'N/A',
                        ORIGEM: item.ORIGEM,
                        DESTINO: item.DESTINO,
                        TIPO_CONTAINER: tipoContainer,
                        'DT_PREVISAO_EMBARQUE': item.DT_PREVISAO_EMBARQUE,
                        'FRETE POR CNTR': fretePorCntr,
                        ARMADOR: item.ARMADOR || 'N/A',
                        AGENTE: shortenName(item.AGENTE),
                        QUANTIDADE_CONTAINERS: divisor,
                        TRANSIT_TIME: transitTime,
                        FREE_TIME: freeTime, 
                    };
                })
                .filter((p: Processo) => !isNaN(p['FRETE POR CNTR']) && p['FRETE POR CNTR'] > 0);


            const rawTarifas = parseCsv<Tarifa>(tarifarioCsv, ['FRETE POR CNTR']);
            const tarifas: Tarifa[] = rawTarifas.map(t => ({
                ...t,
                ORIGEM: (t.ORIGEM || '').split(' - ')[0].trim(),
                DESTINO: (t.DESTINO || '').split(' - ')[0].trim(),
                AGENTE: shortenName(t.AGENTE),
                // Parse Free Time from CSV if it exists
                'FREE TIME': t['FREE TIME'] ? parseInt(String(t['FREE TIME']).replace(/\D/g, ''), 10) || 'N/A' : 'N/A',
                // Parse Descrição/Observações. Try common headers.
                DESCRICAO: t['DESCRIÇÃO'] || t['DESCRICAO'] || t['OBSERVAÇÕES'] || t['OBS'] || 'N/A'
            }));
            setTarifasData(tarifas);
            
            if (processos.length === 0) {
              setError("Não foi possível carregar ou filtrar dados de processos das APIs. Verifique se existem processos do tipo 'Importação Marítima' e 'FCL' com custos de 'Frete Maritimo' associados e sem data de confirmação de embarque (DT_CONFIRMACAO_EMBARQUE).");
              setIsLoading(false);
              return;
            }

            setAnalyzedProcesses(processos.length);

            // --- Data preparation for all views ---
            const routeSet = new Set<string>();
            const tempProcessosByRoute = new Map<string, Processo[]>();
            const tempTarifasByRoute = new Map<string, Tarifa[]>();

            processos.forEach(p => {
                if (p.ORIGEM && p.DESTINO) {
                    const displayRoute = `${p.ORIGEM.trim()} → ${p.DESTINO.trim()}`;
                    routeSet.add(displayRoute);
                    if (!tempProcessosByRoute.has(displayRoute)) {
                        tempProcessosByRoute.set(displayRoute, []);
                    }
                    tempProcessosByRoute.get(displayRoute)!.push(p);
                }
            });

            tarifas.forEach(t => {
                const frete = t['FRETE POR CNTR'];
                if (t.ORIGEM && t.DESTINO && typeof frete === 'number' && !isNaN(frete)) {
                     const displayRoute = `${t.ORIGEM.trim()} → ${t.DESTINO.trim()}`;
                     routeSet.add(displayRoute);
                     if (!tempTarifasByRoute.has(displayRoute)) {
                        tempTarifasByRoute.set(displayRoute, []);
                    }
                    tempTarifasByRoute.get(displayRoute)!.push(t);
                }
            });
            
            setProcessosByRoute(tempProcessosByRoute);
            setTarifasByRoute(tempTarifasByRoute);
            setAllUniqueRoutes(Array.from(routeSet).sort());


            // --- Automated analysis logic ---
            const tarifarioMap = new Map<string, Tarifa[]>();
            for (const tarifa of tarifas) {
                const frete = tarifa['FRETE POR CNTR'];
                if (!tarifa.ORIGEM || !tarifa.DESTINO || !tarifa.TIPO_CONTAINER || isNaN(frete) || frete <= 0) continue;
                
                const key = `${normalizeString(tarifa.ORIGEM)}-${normalizeString(tarifa.DESTINO)}-${normalizeString(tarifa.TIPO_CONTAINER)}`;
                
                if (!tarifarioMap.has(key)) {
                    tarifarioMap.set(key, []);
                }
                tarifarioMap.get(key)!.push(tarifa);
            }

            for (const tariffs of tarifarioMap.values()) {
                tariffs.sort((a, b) => a['FRETE POR CNTR'] - b['FRETE POR CNTR']);
            }
            
            const results: AnalysisResult[] = [];
            const routeData = new Map<string, { totalPaid: number, count: number, origem: string, destino: string, tipoContainer: string }>();

            for (const processo of processos) {
                const valorValido = typeof processo['FRETE POR CNTR'] === 'number' && !isNaN(processo['FRETE POR CNTR']);
                const rotaValida = processo.ORIGEM && processo.DESTINO && processo.TIPO_CONTAINER;

                if (!rotaValida || !valorValido) {
                    results.push({
                        processoId: processo.PROCESSO || 'N/A',
                        cliente: processo.CLIENTE,
                        dataProntidao: processo['DT_PRONTIDAO_CARGA'],
                        origem: processo.ORIGEM || 'Inválido',
                        destino: processo.DESTINO || 'Inválido',
                        tipoContainer: processo.TIPO_CONTAINER,
                        quantidadeContainers: processo.QUANTIDADE_CONTAINERS,
                        valorProcesso: valorValido ? processo['FRETE POR CNTR'] : 'N/A',
                        dataEmissao: processo['DT_PREVISAO_EMBARQUE'] || 'N/A',
                        melhorTarifa: 'N/A',
                        validadeMelhorTarifa: 'N/A',
                        armadorNovo: 'N/A',
                        agenteNovo: 'N/A',
                        diferenca: 'N/A',
                        status: 'Dados Inválidos',
                        armadorAtual: processo.ARMADOR || 'N/A',
                        agenteAtual: processo.AGENTE || 'N/A',
                        transitTime: processo.TRANSIT_TIME,
                        freeTime: processo.FREE_TIME,
                        freeTimeTarifa: 'N/A',
                        descricaoTarifa: 'N/A'
                    });
                    continue;
                }
                
                const key = `${normalizeString(processo.ORIGEM)}-${normalizeString(processo.DESTINO)}-${normalizeString(processo.TIPO_CONTAINER)}`;
                const bestTariffs = tarifarioMap.get(key);
                const bestTarifa = bestTariffs && bestTariffs.length > 0 ? bestTariffs[0] : undefined;


                if (!routeData.has(key)) {
                    routeData.set(key, { totalPaid: 0, count: 0, origem: processo.ORIGEM, destino: processo.DESTINO, tipoContainer: processo.TIPO_CONTAINER });
                }
                const currentRoute = routeData.get(key)!;
                currentRoute.totalPaid += processo['FRETE POR CNTR'];
                currentRoute.count += 1;


                const diferenca = bestTarifa ? processo['FRETE POR CNTR'] - bestTarifa['FRETE POR CNTR'] : 'N/A';
                let status: AnalysisResult['status'];
                if (bestTarifa) {
                    if (typeof diferenca === 'number' && diferenca > 0) {
                        status = 'Oportunidade';
                    } else {
                        status = 'Não Econômico';
                    }
                } else {
                    status = 'Sem Tarifa';
                }

                results.push({
                    processoId: processo.PROCESSO,
                    cliente: processo.CLIENTE,
                    dataProntidao: processo['DT_PRONTIDAO_CARGA'],
                    origem: processo.ORIGEM,
                    destino: processo.DESTINO,
                    tipoContainer: processo.TIPO_CONTAINER,
                    quantidadeContainers: processo.QUANTIDADE_CONTAINERS,
                    valorProcesso: processo['FRETE POR CNTR'],
                    dataEmissao: processo['DT_PREVISAO_EMBARQUE'],
                    melhorTarifa: bestTarifa?.['FRETE POR CNTR'] ?? 'N/A',
                    validadeMelhorTarifa: bestTarifa?.['FIM VALIDADE'] ?? 'N/A',
                    armadorNovo: bestTarifa?.ARMADOR ?? 'N/A',
                    agenteNovo: bestTarifa?.AGENTE ?? 'N/A',
                    diferenca,
                    status,
                    armadorAtual: processo.ARMADOR,
                    agenteAtual: processo.AGENTE,
                    transitTime: processo.TRANSIT_TIME,
                    freeTime: processo.FREE_TIME,
                    freeTimeTarifa: bestTarifa?.['FREE TIME'] ?? 'N/A',
                    descricaoTarifa: bestTarifa?.DESCRICAO ?? 'N/A',
                });
            }

            const comparisons: RouteComparison[] = Array.from(routeData.entries()).map(([key, data]) => {
                const bestTariffs = tarifarioMap.get(key);
                const bestTariff = bestTariffs && bestTariffs.length > 0 ? bestTariffs[0] : undefined;
                const avgPaid = data.totalPaid / data.count;
                const difference = bestTariff ? avgPaid - bestTariff['FRETE POR CNTR'] : 'N/A';
                
                let status: RouteComparison['status'];
                if (bestTariff) {
                    if (typeof difference === 'number' && difference > 0.01) {
                        status = 'Potencial de Economia';
                    } else {
                        status = 'Custo Otimizado';
                    }
                } else {
                    status = 'Sem Tarifa no Acordo';
                }

                const comparison: RouteComparison = {
                    routeId: key,
                    origem: data.origem,
                    destino: data.destino,
                    tipoContainer: data.tipoContainer,
                    processCount: data.count,
                    avgPaid: avgPaid,
                    bestTariff: bestTariff?.['FRETE POR CNTR'] ?? 'N/A',
                    avgDifference: difference,
                    status: status
                };
                return comparison;
            }).sort((a,b) => {
                 const aDiff = typeof a.avgDifference === 'number' ? a.avgDifference : -Infinity;
                 const bDiff = typeof b.avgDifference === 'number' ? b.avgDifference : -Infinity;
                 return bDiff - aDiff;
            });
            setRouteComparisons(comparisons);
            
            results.sort((a, b) => {
                const aDiff = typeof a.diferenca === 'number' ? a.diferenca : -Infinity;
                const bDiff = typeof b.diferenca === 'number' ? b.diferenca : -Infinity;
                return bDiff - aDiff;
            });
            
            const foundOpportunities = results.filter(r => r.status === 'Oportunidade');
            const total = foundOpportunities.reduce((sum, op) => sum + (op.diferenca as number), 0);

            const opportunityProcessesByRoute = new Map<string, AnalysisResult[]>();
            for (const op of foundOpportunities) {
                const key = `${normalizeString(op.origem)}-${normalizeString(op.destino)}-${normalizeString(op.tipoContainer)}`;
                if (!opportunityProcessesByRoute.has(key)) {
                    opportunityProcessesByRoute.set(key, []);
                }
                opportunityProcessesByRoute.get(key)!.push(op);
            }

            const grouped: OpportunityGroup[] = [];
            for (const [key, processesInGroup] of opportunityProcessesByRoute.entries()) {
                const routeTariffs = tarifarioMap.get(key) || [];
                if (routeTariffs.length === 0) continue;

                const applicableTariffs = new Set<Tarifa>();
                for (const processo of processesInGroup) {
                    if (typeof processo.valorProcesso !== 'number') continue;
                    for (const tarifa of routeTariffs) {
                        if (tarifa['FRETE POR CNTR'] < processo.valorProcesso) {
                            applicableTariffs.add(tarifa);
                        }
                    }
                }

                if (applicableTariffs.size === 0) continue;

                const tariffOptions: TariffOption[] = Array.from(applicableTariffs).map(tarifa => {
                    const economiaPotencial = processesInGroup.reduce((total, processo) => {
                        if (typeof processo.valorProcesso === 'number' && processo.valorProcesso > tarifa['FRETE POR CNTR']) {
                            return total + (processo.valorProcesso - tarifa['FRETE POR CNTR']);
                        }
                        return total;
                    }, 0);
                    return { tarifa, economiaPotencial };
                });

                tariffOptions.sort((a, b) => a.tarifa['FRETE POR CNTR'] - b.tarifa['FRETE POR CNTR']);

                const firstProcess = processesInGroup[0];
                const bestOptionEconomy = tariffOptions.length > 0 ? tariffOptions[0].economiaPotencial : 0;

                grouped.push({
                    id: `${firstProcess.origem}-${firstProcess.destino}-${firstProcess.tipoContainer}`,
                    origem: firstProcess.origem,
                    destino: firstProcess.destino,
                    tipoContainer: firstProcess.tipoContainer,
                    processos: processesInGroup,
                    tariffOptions: tariffOptions,
                    economiaTotalAgregada: bestOptionEconomy,
                });
            }

            grouped.sort((a, b) => b.economiaTotalAgregada - a.economiaTotalAgregada);
            
            setAnalysisResults(results);
            setOpportunityGroups(grouped);
            setTotalSavings(total);
            setOpportunitiesCount(foundOpportunities.length);

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.');
        } finally {
            setIsLoading(false);
        }
    }, [previousTarifarioCsv]);

    useEffect(() => {
        analyzeData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Determines if there is any data to display, to avoid showing empty states.
    const hasData = analysisResults.length > 0 || opportunityGroups.length > 0 || allUniqueRoutes.length > 0;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <div className="container mx-auto p-4 md:p-8">
                <Header 
                    onRefresh={analyzeData} 
                    isRefreshing={isLoading} 
                    rawCsvData={rawCsvData}
                    operacionalLastUpdated={operacionalLastUpdated}
                    tarifarioLastUpdated={tarifarioLastUpdated}
                    analysisResults={analysisResults}
                />
                <main>
                    {/* Display error as a banner above content, without replacing it on refresh */}
                    {error && (
                        <div className="mb-6">
                            <ErrorDisplay message={error} />
                        </div>
                    )}

                    {/* Show spinner only on initial load */}
                    {isLoading && !hasData ? (
                        <LoadingSpinner />
                    ) : (
                        // Render content if we have data, even if a refresh is loading or failed.
                        // The OpportunitiesTable component handles its own "no data" state internally.
                        hasData && (
                            <>
                                <StatsCards
                                    opportunitiesCount={opportunitiesCount}
                                    totalSavings={totalSavings}
                                    analyzedProcesses={analyzedProcesses}
                                />
                                <div className="my-6 p-4 bg-sky-900/50 border border-sky-700 text-sky-300 rounded-lg flex items-center space-x-3 text-sm" role="alert">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>
                                        <strong>Atualização:</strong> Análise aprimorada com dados de <strong>Transit Time</strong> e <strong>Free Time</strong>.
                                    </span>
                                </div>
                                <OpportunitiesTable 
                                    opportunityGroups={opportunityGroups}
                                    fullAnalysisResults={analysisResults}
                                    tarifas={tarifasData}
                                    routeComparisons={routeComparisons}
                                    // Pass new props for manual view
                                    processosByRoute={processosByRoute}
                                    tarifasByRoute={tarifasByRoute}
                                    allUniqueRoutes={allUniqueRoutes}
                                />
                            </>
                        )
                    )}

                    {/* If there was a failed initial load (error is set but hasData is false) */}
                    {error && !hasData && !isLoading && (
                         <div className="text-center py-16 px-4 bg-gray-800/50 rounded-lg shadow-lg border border-gray-700">
                             <h3 className="mt-2 text-lg font-medium text-white">Não foi possível carregar os dados</h3>
                             <p className="mt-1 text-sm text-gray-400">
                                Por favor, verifique sua conexão ou a fonte de dados e tente novamente.
                             </p>
                         </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;

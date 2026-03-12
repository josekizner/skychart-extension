
export interface Processo {
  PROCESSO: string;
  CLIENTE: string;
  DT_PRONTIDAO_CARGA: string;
  ORIGEM: string;
  DESTINO: string;
  'FRETE POR CNTR': number;
  'DT_PREVISAO_EMBARQUE': string;
  TIPO_CONTAINER: string;
  ARMADOR: string;
  AGENTE: string;
  QUANTIDADE_CONTAINERS: number;
  TRANSIT_TIME: string;
  FREE_TIME: number | 'N/A'; // Novo campo vindo da API Equipamento
}

export interface Tarifa {
  ORIGEM: string;
  DESTINO: string;
  'FRETE POR CNTR': number;
  ARMADOR: string;
  TIPO_CONTAINER: string;
  AGENTE?: string;
  'FIM VALIDADE'?: string;
  'FREE TIME'?: number | string;
  DESCRICAO?: string; // Novo campo de observações/descrição
}

export interface AnalysisResult {
  processoId: string;
  cliente: string;
  dataProntidao: string;
  origem: string;
  destino: string;
  tipoContainer: string;
  quantidadeContainers: number;
  valorProcesso: number | 'N/A';
  dataEmissao: string;
  melhorTarifa: number | 'N/A';
  validadeMelhorTarifa: string | 'N/A';
  armadorNovo: string | 'N/A';
  agenteNovo: string | 'N/A';
  diferenca: number | 'N/A';
  status: 'Oportunidade' | 'Sem Tarifa' | 'Não Econômico' | 'Dados Inválidos';
  armadorAtual: string | 'N/A';
  agenteAtual: string | 'N/A';
  transitTime: string | 'N/A';
  freeTime: number | 'N/A'; 
  freeTimeTarifa: number | string | 'N/A';
  descricaoTarifa: string | 'N/A'; // Novo campo para a análise
}

export interface TariffOption {
    tarifa: Tarifa;
    economiaPotencial: number;
}

export interface OpportunityGroup {
    id: string;
    origem: string;
    destino: string;
    tipoContainer: string;
    processos: AnalysisResult[];
    tariffOptions: TariffOption[];
    economiaTotalAgregada: number;
}

export interface RouteComparison {
    routeId: string;
    origem: string;
    destino: string;
    tipoContainer: string;
    processCount: number;
    avgPaid: number;
    bestTariff: number | 'N/A';
    avgDifference: number | 'N/A';
    status: 'Potencial de Economia' | 'Custo Otimizado' | 'Sem Tarifa no Acordo';
}

const GEMINI_API_KEY = "AIzaSyAUJQghRHkjEnM4HQCeVF_6LuS2iTQy-KQ";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ===== AUTO-UPDATE =====
const CURRENT_VERSION = "1.0.0";
// IMPORTANTE: Mude esta URL após criar o repo no GitHub
// Formato: https://raw.githubusercontent.com/SEU-USER/skychart-extension/main/version.json
const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/josekizner/skychart-extension/main/version.json";
const UPDATE_CHECK_INTERVAL = 2 * 60 * 60 * 1000; // 2 horas

// Checa updates periodicamente
if (UPDATE_CHECK_URL) {
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
  // Check inicial após 30 segundos
  setTimeout(checkForUpdates, 30000);
}

async function checkForUpdates() {
  if (!UPDATE_CHECK_URL) return;
  try {
    const response = await fetch(UPDATE_CHECK_URL + '?t=' + Date.now());
    const remote = await response.json();
    if (remote.version && remote.version !== CURRENT_VERSION) {
      console.log("[AutoUpdate] Nova versão:", remote.version, "(atual:", CURRENT_VERSION + ")");
      // Notifica todas as abas do Skychart
      const tabs = await chrome.tabs.query({ url: "*://app2.skychart.com.br/*" });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          action: "updateAvailable",
          newVersion: remote.version,
          currentVersion: CURRENT_VERSION,
          changelog: remote.changelog || ""
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.log("[AutoUpdate] Check falhou:", e.message);
  }
}

// ===== BOOKING TRACKING =====
var pendingTrackingTabs = {}; // { maerskTabId: skychartTabId }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Skychart AI Background: Mensagem recebida:", request.action);

  // Tracking: Skychart pede pra abrir Maersk e scrapear
  if (request.action === "trackBooking") {
    const booking = request.bookingNumber;
    const skychartTabId = sender.tab.id;
    const carrier = request.carrier || 'maersk';

    console.log("[Tracking] Abrindo tracking para:", booking, "carrier:", carrier);

    let trackingUrl = '';
    if (carrier === 'maersk') {
      trackingUrl = 'https://www.maersk.com/tracking/' + encodeURIComponent(booking);
    }
    // Futuros armadores aqui...

    if (trackingUrl) {
      chrome.tabs.create({ url: trackingUrl, active: true }, (tab) => {
        pendingTrackingTabs[tab.id] = skychartTabId;
        console.log("[Tracking] Tab aberta:", tab.id, "-> Skychart tab:", skychartTabId);
      });
    }

    sendResponse({ success: true, message: 'Tracking aberto' });
    return true;
  }

  // Tracking: Maersk scraper envia dados de volta
  if (request.action === "maerskTrackingData") {
    const maerskTabId = sender.tab.id;
    const skychartTabId = pendingTrackingTabs[maerskTabId];

    console.log("[Tracking] Dados recebidos do Maersk, enviando pra Skychart tab:", skychartTabId);

    if (skychartTabId) {
      // Volta pra aba do Skychart pra usuario supervisionar
      chrome.tabs.update(skychartTabId, { active: true }).catch(() => {});

      chrome.tabs.sendMessage(skychartTabId, {
        action: 'trackingDataReady',
        data: request.data,
        error: request.error || null
      }).catch(err => console.error("[Tracking] Erro enviando dados:", err));

      // Fecha a aba da Maersk após 3 segundos
      setTimeout(() => {
        chrome.tabs.remove(maerskTabId).catch(() => {});
      }, 3000);

      delete pendingTrackingTabs[maerskTabId];
    }

    sendResponse({ success: true });
    return true;
  }

  // Extração completa de todos os campos do contrato de câmbio
  if (request.action === "extractAllFieldsBase64") {
    extractAllFieldsFromPDF(request.pdfBase64)
      .then(fields => {
        console.log("Skychart AI Background: Campos extraídos:", fields);
        sendResponse({ success: true, fields });
      })
      .catch(error => {
        console.error("Skychart AI Background: Erro:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Mantém compatibilidade com extração simples
  if (request.action === "extractContractNumberBase64") {
    processPDFWithGemini(request.pdfBase64)
      .then(number => {
        console.log("Skychart AI Background: Número extraído:", number);
        sendResponse({ success: true, number });
      })
      .catch(error => {
        console.error("Skychart AI Background: Erro no Gemini:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "extractContractNumberText") {
    processTextWithGemini(request.text)
      .then(number => {
        console.log("Skychart AI Background (texto): Número extraído:", number);
        sendResponse({ success: true, number });
      })
      .catch(error => {
        console.error("Skychart AI Background (texto): Erro:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // SERASA: Captura URL da aba nova que abrir, fecha ela, e retorna URL
  if (request.action === "captureNewTabUrl") {
    const senderTabId = sender.tab ? sender.tab.id : null;
    
    (async () => {
      try {
        // Registra listener ANTES do clique
        const tabPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onCreated.removeListener(listener);
            resolve(null);
          }, 15000);

          function listener(tab) {
            clearTimeout(timeout);
            chrome.tabs.onCreated.removeListener(listener);
            // Espera aba carregar pra URL ficar disponível
            setTimeout(async () => {
              try {
                const t = await chrome.tabs.get(tab.id);
                resolve({ tabId: tab.id, url: t.url || t.pendingUrl });
              } catch(e) {
                resolve({ tabId: tab.id, url: tab.pendingUrl || tab.url });
              }
            }, 3000);
          }
          chrome.tabs.onCreated.addListener(listener);
        });

        // Manda content clicar
        if (senderTabId) {
          chrome.tabs.sendMessage(senderTabId, { action: 'clickSerasaDownload' }).catch(() => {});
        }

        const newTab = await tabPromise;

        if (!newTab || !newTab.url) {
          sendResponse({ success: false, error: 'Nenhuma aba nova em 15s' });
          return;
        }

        console.log("[Serasa] URL capturada:", newTab.url);

        // Fecha a aba do PDF
        chrome.tabs.remove(newTab.tabId).catch(() => {});

        // Volta foco pro Skychart
        if (senderTabId) {
          chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
        }

        sendResponse({ success: true, url: newTab.url });
      } catch(err) {
        console.error("[Serasa] Erro:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true;
  }

  // SERASA: Extrai Score + Limite de Crédito do PDF Serasa
  if (request.action === "extractSerasaData") {
    extractSerasaFromPDF(request.pdfBase64)
      .then(result => {
        console.log("Skychart AI Background: Serasa extraído:", result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error("Skychart AI Background: Serasa erro:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // AUTO-HEAL: Analisa fragmento DOM com Gemini para encontrar como interagir
  if (request.action === "analyzeDOM") {
    analyzeDOMWithGemini(request)
      .then(result => {
        console.log("Skychart AI Background: DOM analysis result:", result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error("Skychart AI Background: DOM analysis error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // FRETE: Análise de comparação de frete por processo
  if (request.action === "analyzeFreight") {
    analyzeProcess(request.processoId)
      .then(result => {
        console.log("[Freight] Resultado:", request.processoId, result.status);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error("[Freight] Erro:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

const SERASA_PROMPT = `
Você é um extrator de dados especializado em relatórios de crédito Serasa.
Extraia os seguintes campos deste documento PDF e retorne em formato JSON puro (sem markdown, sem \`\`\`):

{
  "score": "score de crédito (número inteiro)",
  "limiteCredito": "limite de crédito sugerido (número decimal, sem R$ ou BRL)"
}

REGRAS:
- Para "score": procure por "Score Serasa" e pegue o número inteiro ao lado.
- Para "limiteCredito": procure por "Limite de Crédito Sugerido" e pegue o valor numérico.
- Retorne APENAS o JSON, nada mais.
`;

// Prompt para extração COMPLETA de todos os campos do contrato de câmbio
const FULL_EXTRACTION_PROMPT = `
Você é um extrator de dados especializado em contratos de câmbio brasileiros.
Extraia os seguintes campos deste documento PDF e retorne em formato JSON puro (sem markdown, sem \`\`\`):

{
  "numeroContrato": "número do contrato de câmbio (9 dígitos, ex: 561873722)",
  "dataContrato": "data do contrato no formato DD/MM/YYYY (está no cabeçalho ao lado do número do contrato)",
  "cnpjFornecedor": "CNPJ da instituição autorizada a operar no mercado de câmbio (formato XX.XXX.XXX/XXXX-XX)",
  "valorVET": "Valor Efetivo Total (VET) - número decimal completo",
  "despesaBancaria": "valor da Despesa bancária em BRL (número, sem R$ ou BRL)"
}

REGRAS:
- Para "dataContrato": procure a data que está no cabeçalho, na mesma linha do número do contrato
- Para "cnpjFornecedor": é o CNPJ que aparece logo após o nome da corretora/banco (ex: FRENTE CORRETORA DE CAMBIO → 71.677.850/0001-77)  
- Para "valorVET": procure "Valor Efetivo Total(VET)" e pegue o número decimal
- Para "despesaBancaria": procure "Despesa bancária" na segunda página e pegue o valor numérico após "BRL"
- Retorne APENAS o JSON, nada mais
`;

const CONTRACT_PROMPT = `
  Você é um extrator de dados especializado em documentos financeiros brasileiros.
  Encontre o "Número do contrato de câmbio" neste documento.
  Ele tipicamente fica no cabeçalho da página, possui 9 dígitos (ex: 557670390).
  Retorne APENAS os dígitos, sem espaços ou texto adicional.
  Se não encontrar, retorne somente o texto: NAO_ENCONTRADO
`;

async function extractAllFieldsFromPDF(base64data) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: FULL_EXTRACTION_PROMPT },
            { inlineData: { mimeType: "application/pdf", data: base64data } }
          ]
        }]
      })
    });

    const data = await response.json();
    console.log("[Gemini Full RAW]", JSON.stringify(data).substring(0, 800));

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Sem candidatos do Gemini");
    }

    let result = data.candidates[0].content.parts[0].text.trim();
    console.log("[Gemini Full] Resultado bruto:", result);

    // Remove markdown code fences se presentes
    result = result.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const fields = JSON.parse(result);
    return fields;
  } catch (error) {
    console.error("[Gemini Full] Erro:", error);
    throw error;
  }
}

async function extractSerasaFromPDF(base64data) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SERASA_PROMPT },
            { inlineData: { mimeType: "application/pdf", data: base64data } }
          ]
        }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ],
        generationConfig: {
          temperature: 0.1
        }
      })
    });

    const data = await response.json();
    console.log("[Gemini Serasa] Status:", response.status);
    console.log("[Gemini Serasa] Response completa:", JSON.stringify(data).substring(0, 1500));

    // Checa se foi bloqueado por safety
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error("Bloqueado por safety: " + data.promptFeedback.blockReason);
    }

    if (!data.candidates || data.candidates.length === 0) {
      // Log completo pra debug
      console.error("[Gemini Serasa] Response sem candidatos:", JSON.stringify(data));
      throw new Error("Sem candidatos - response: " + JSON.stringify(data).substring(0, 300));
    }

    let result = data.candidates[0].content.parts[0].text.trim();
    console.log("[Gemini Serasa] Resultado:", result);

    result = result.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const fields = JSON.parse(result);
    return fields;
  } catch (error) {
    console.error("[Gemini Serasa] Erro:", error);
    throw error;
  }
}

async function processPDFWithGemini(base64data) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: CONTRACT_PROMPT },
            { inlineData: { mimeType: "application/pdf", data: base64data } }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      return "NAO_ENCONTRADO";
    }
    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error("[Gemini] Erro HTTP:", error);
    throw error;
  }
}

async function processTextWithGemini(text) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${CONTRACT_PROMPT}\n\nTexto do PDF:\n${text}`
          }]
        }]
      })
    });

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      return "NAO_ENCONTRADO";
    }
    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error("[Gemini Text] Erro:", error);
    throw error;
  }
}

// ===== AUTO-HEAL: Analisa DOM com Gemini para resolver interações falhadas =====
const DOM_ANALYSIS_PROMPT = `Você é um especialista em automação web, especificamente com PrimeNG + Angular.
Analise o fragmento HTML abaixo e responda em JSON puro (sem markdown, sem backticks).

CONTEXTO:
- Estou automatizando um formulário PrimeNG
- O campo alvo tem title="{INPUT_TITLE}"
- Tentei: {FAILED_ACTION}
- Valor que preciso salvar: {VALUE}

TAREFA:
Olhe o HTML e me diga o seletor CSS correto do botão de salvar/confirmar, OU se não existir no HTML, descreva os passos necessários.

RESPONDA APENAS em JSON:
{"selector": "css-selector-do-botao"} se encontrar o botão no HTML
{"steps": ["passo1...", "passo2..."]} se precisar de ações específicas
{"selector": null, "reason": "explicação"} se realmente não existir

HTML:
{DOM_FRAGMENT}`;

async function analyzeDOMWithGemini(request) {
  try {
    const prompt = DOM_ANALYSIS_PROMPT
      .replace('{INPUT_TITLE}', request.inputTitle || 'desconhecido')
      .replace('{FAILED_ACTION}', request.failedAction || 'clicar salvar')
      .replace('{VALUE}', request.currentValue || '')
      .replace('{DOM_FRAGMENT}', request.domFragment || '');

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();
    console.log("[Gemini DOM] Raw:", JSON.stringify(data).substring(0, 500));

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Sem candidatos do Gemini");
    }

    let result = data.candidates[0].content.parts[0].text.trim();
    result = result.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    return JSON.parse(result);
  } catch (error) {
    console.error("[Gemini DOM] Erro:", error);
    throw error;
  }
}

// ========================================================================
// FRETE: Comparação de frete (Analisador de Recompras)
// ========================================================================

const FREIGHT_API_TOKEN = 'b2e7c1f4-8a2d-4e3b-9c6a-7f1e2d5a9b3c';
const FREIGHT_OPERACIONAL_URL = 'https://server-mond.tail46f98e.ts.net/api/operacional';
const FREIGHT_CUSTO_URL = 'https://server-mond.tail46f98e.ts.net/api/custo';
const FREIGHT_TARIFARIO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSyYYzHyP8DWLOP8tPJhXeTZZuDq2DgPDtQ1aJM2vyL6O6IwWb5EVxBUPkSFu74uXGhFO_VUIsPyNWB/pub?output=csv';

// Cache de 5 minutos
let freightCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function parseCsvSimple(csvText, currencyFields) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  const text = csvText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { currentField += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField); currentField = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = '';
    } else {
      currentField += char;
    }
  }
  currentRow.push(currentField); rows.push(currentRow);

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toUpperCase());
  return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      let key = h;
      if (h === 'VL. TOTAL FRETE') key = 'FRETE POR CNTR';
      if (h === 'CONTAINER') key = 'TIPO_CONTAINER';
      const val = (row[idx] || '').trim();
      if (currencyFields.includes(key)) {
        const cleaned = val.replace(/R?\$ ?/g, '').replace(/\./g, '').replace(',', '.');
        obj[key] = parseFloat(cleaned) || NaN;
      } else {
        obj[key] = val;
      }
    });
    return obj;
  });
}

async function fetchFreightData() {
  const now = Date.now();
  if (freightCache.data && (now - freightCache.timestamp) < CACHE_TTL) {
    console.log("[Freight] Usando cache");
    return freightCache.data;
  }

  console.log("[Freight] Buscando dados das APIs...");
  const headers = { 'Authorization': `Bearer ${FREIGHT_API_TOKEN}` };

  const [opRes, custoRes, tarifRes] = await Promise.all([
    fetch(FREIGHT_OPERACIONAL_URL, { headers }),
    fetch(FREIGHT_CUSTO_URL, { headers }),
    fetch(FREIGHT_TARIFARIO_URL)
  ]);

  if (!opRes.ok) throw new Error('API Operacional falhou: ' + opRes.status);
  if (!custoRes.ok) throw new Error('API Custo falhou: ' + custoRes.status);
  if (!tarifRes.ok) throw new Error('Tarifário falhou: ' + tarifRes.status);

  const [opJson, custoJson, tarifCsv] = await Promise.all([
    opRes.json(), custoRes.json(), tarifRes.text()
  ]);

  const operacional = Array.isArray(opJson) ? opJson : opJson.data;
  const custos = Array.isArray(custoJson) ? custoJson : custoJson.data;
  const tarifas = parseCsvSimple(tarifCsv, ['FRETE POR CNTR']);

  // Mapa de custos (Frete Maritimo) por CD_MOVIMENTO
  const custoMap = new Map();
  for (const item of custos) {
    if (item.DS_TAXA === 'Frete Maritimo' && item.CD_MOVIMENTO && item.VL_TOTAL_COMPRA != null) {
      const current = custoMap.get(item.CD_MOVIMENTO) || 0;
      const val = parseFloat(String(item.VL_TOTAL_COMPRA).replace(',', '.'));
      if (!isNaN(val)) custoMap.set(item.CD_MOVIMENTO, current + val);
    }
  }

  // Mapa de tarifas por rota (ORIGEM-DESTINO-TIPO_CONTAINER)
  const tarifaMap = new Map();
  for (const t of tarifas) {
    const origem = (t.ORIGEM || '').split(' - ')[0].trim().toUpperCase();
    const destino = (t.DESTINO || '').split(' - ')[0].trim().toUpperCase();
    const tipo = (t.TIPO_CONTAINER || '').trim().toUpperCase();
    const frete = t['FRETE POR CNTR'];
    if (!origem || !destino || !tipo || isNaN(frete) || frete <= 0) continue;

    const key = `${origem}-${destino}-${tipo}`;
    if (!tarifaMap.has(key)) tarifaMap.set(key, []);
    tarifaMap.get(key).push({
      frete, armador: t.ARMADOR || 'N/A', agente: t.AGENTE || 'N/A',
      validade: t['FIM VALIDADE'] || 'N/A', freeTime: t['FREE TIME'] || 'N/A'
    });
  }
  // Ordena por menor frete
  for (const arr of tarifaMap.values()) arr.sort((a, b) => a.frete - b.frete);

  const result = { operacional, custoMap, tarifaMap };
  freightCache = { data: result, timestamp: now };
  console.log("[Freight] Cache atualizado:", operacional.length, "processos,", tarifaMap.size, "rotas");
  return result;
}

async function analyzeProcess(processoId) {
  const { operacional, custoMap, tarifaMap } = await fetchFreightData();

  // Busca o processo
  const proc = operacional.find(p => p.PROCESSO === processoId);
  if (!proc) return { found: false, error: 'Processo não encontrado na API' };

  // Info básica
  const origem = (proc.ORIGEM || '').trim().toUpperCase();
  const destino = (proc.DESTINO || '').trim().toUpperCase();
  const armador = proc.ARMADOR || 'N/A';
  const produto = proc.PRODUTO || '';
  const tipoFrete = proc.DS_TIPO_FRETE || '';

  // Não é FCL ou não é marítima? Sem análise
  if (produto !== 'Importação Marítima' || tipoFrete !== 'FCL') {
    return { found: true, applicable: false, reason: 'Não é Importação Marítima FCL' };
  }

  // Calcula frete pago
  const totalFrete = custoMap.get(proc.CD_MOVIMENTO);
  if (totalFrete === undefined) {
    return { found: true, applicable: true, noFreight: true, origem, destino, armador };
  }

  const qtdStr = String(proc.DS_QUANTIDADE_CONTAINERS || '1');
  const numContainers = parseInt(qtdStr, 10) || 1;
  const fretePorCntr = totalFrete / numContainers;

  // Tipo de container
  let tipoContainer = 'N/A';
  const match = qtdStr.match(/^\d+\s*x\s*(.*)$/);
  if (match && match[1]) tipoContainer = match[1].trim().toUpperCase();

  // Busca melhor tarifa
  const key = `${origem}-${destino}-${tipoContainer}`;
  const tarifas = tarifaMap.get(key) || [];
  const melhorTarifa = tarifas.length > 0 ? tarifas[0] : null;

  const diferenca = melhorTarifa ? fretePorCntr - melhorTarifa.frete : null;
  const status = melhorTarifa
    ? (diferenca > 0 ? 'acima' : 'otimizado')
    : 'sem_tarifa';

  return {
    found: true,
    applicable: true,
    processoId,
    origem, destino, armador, tipoContainer,
    fretePago: fretePorCntr,
    numContainers,
    melhorTarifa: melhorTarifa ? melhorTarifa.frete : null,
    melhorArmador: melhorTarifa ? melhorTarifa.armador : null,
    melhorAgente: melhorTarifa ? melhorTarifa.agente : null,
    validade: melhorTarifa ? melhorTarifa.validade : null,
    diferenca,
    status,
    alternativas: tarifas.slice(0, 3) // Top 3 opções
  };
}

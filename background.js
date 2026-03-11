const GEMINI_API_KEY = "AIzaSyByqiMDFdNrGOKLb-1BmId2ne_PcVCE1Ew";
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

  // SERASA: Captura URL da aba nova, busca PDF, extrai dados, e fecha aba
  if (request.action === "fetchPdfFromNewTab") {
    const senderTabId = sender.tab ? sender.tab.id : null;
    
    (async () => {
      try {
        // Escuta criação de nova aba
        const newTab = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onCreated.removeListener(listener);
            resolve(null);
          }, 10000);

          function listener(tab) {
            clearTimeout(timeout);
            chrome.tabs.onCreated.removeListener(listener);
            setTimeout(async () => {
              try {
                const updatedTab = await chrome.tabs.get(tab.id);
                resolve({ tabId: tab.id, url: updatedTab.url || updatedTab.pendingUrl });
              } catch(e) {
                resolve({ tabId: tab.id, url: tab.pendingUrl || tab.url });
              }
            }, 2000);
          }
          chrome.tabs.onCreated.addListener(listener);
        });

        // Diz pro content script clicar agora
        if (senderTabId) {
          chrome.tabs.sendMessage(senderTabId, { action: 'clickSerasaDownload' }).catch(() => {});
        }

        if (!newTab || !newTab.url) {
          sendResponse({ success: false, error: 'Nenhuma aba nova aberta em 10s' });
          return;
        }

        console.log("[Serasa] Nova aba URL:", newTab.url);

        // Fetch o PDF
        const pdfResponse = await fetch(newTab.url);
        const pdfBlob = await pdfResponse.blob();
        
        // Converte pra base64
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        console.log("[Serasa] PDF carregado:", Math.round(base64.length / 1024) + "KB");

        // Extrai dados via Gemini
        const serasaData = await extractSerasaFromPDF(base64);

        // Fecha a aba do PDF
        chrome.tabs.remove(newTab.tabId).catch(() => {});

        // Volta foco pra aba do Skychart
        if (senderTabId) {
          chrome.tabs.update(senderTabId, { active: true }).catch(() => {});
        }

        sendResponse({ success: true, result: serasaData });
      } catch(err) {
        console.error("[Serasa] Erro:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep message channel open
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
        }]
      })
    });

    const data = await response.json();
    console.log("[Gemini Serasa RAW]", JSON.stringify(data).substring(0, 800));

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Sem candidatos do Gemini");
    }

    let result = data.candidates[0].content.parts[0].text.trim();
    console.log("[Gemini Serasa] Resultado bruto:", result);

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

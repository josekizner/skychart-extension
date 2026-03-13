// API config
const _b = 'QUl6YVN5QTVwOU41a1hLQ1hYRm9aZ3FZcl9HMjNwTkFLZERHYUhV';
const GEMINI_API_KEY = atob(_b);
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ===== PERFIL / PERMISSOES =====
const PROFILES = {
  master: ['cambio','serasa','frete','tracking','cotacao'],
  financeiro: ['cambio','serasa'],
  operacional: ['tracking','frete'],
  comercial: ['cotacao','frete']
};

function loadProfileFromConfig() {
  fetch(chrome.runtime.getURL('local-config.json'))
    .then(r => r.json())
    .then(cfg => {
      var agents = PROFILES[cfg.profile] || PROFILES.master;
      chrome.storage.local.set({ userProfile: cfg.profile, enabledAgents: agents, configLoaded: true });
      console.log('[Atom] Perfil configurado:', cfg.profile, agents);
    })
    .catch(() => {
      // Sem local-config.json — popup vai mostrar seletor de departamento
      console.log('[Atom] Sem local-config.json, popup vai pedir departamento');
    });
}

chrome.runtime.onInstalled.addListener(loadProfileFromConfig);
chrome.runtime.onStartup.addListener(loadProfileFromConfig);

// ===== AUTO-UPDATE COM AUTO-RELOAD =====
const CURRENT_VERSION = "2.2.0";
const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/josekizner/skychart-extension/main/version.json";
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

// Checa updates periodicamente
if (UPDATE_CHECK_URL) {
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
  // Check inicial após 60 segundos
  setTimeout(checkForUpdates, 60000);
}

async function checkForUpdates() {
  if (!UPDATE_CHECK_URL) return;
  try {
    const response = await fetch(UPDATE_CHECK_URL + '?t=' + Date.now());
    const remote = await response.json();
    if (remote.version && remote.version !== CURRENT_VERSION) {
      console.log("[AutoUpdate] Nova versão detectada:", remote.version, "(atual:", CURRENT_VERSION + ") — RECARREGANDO...");
      // Recarrega a extensão inteira (content scripts, popup, tudo)
      chrome.runtime.reload();
    }
  } catch (e) {
    console.log("[AutoUpdate] Check falhou:", e.message);
  }
}

// ===== BOOKING TRACKING =====
var pendingTrackingTabs = {}; // { maerskTabId: skychartTabId }
var pendingHmmTabs = {};      // { hmmTabId: skychartTabId }

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

  // HMM Schedule: abre site e busca sailings
  if (request.action === "open_hmm_schedule") {
    const from = request.from;
    const to = request.to;
    const skychartTabId = sender.tab.id;
    const hmmUrl = 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do';

    console.log("[HMM] Abrindo schedule:", from, "→", to);

    chrome.tabs.create({ url: hmmUrl, active: false }, (tab) => {
      // Guarda mapeamento HMM tab → Skychart tab
      pendingHmmTabs[tab.id] = skychartTabId;
      console.log("[HMM] Tab criada:", tab.id, "→ Skychart:", skychartTabId);

      // Espera a página carregar e envia os parâmetros
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'hmm_search_schedule',
          from: from,
          to: to
        }, (response) => {
          console.log('[HMM] Scraper respondeu:', response);
        });
      }, 3000);
    });

    sendResponse({ success: true, message: 'HMM schedule aberto' });
    return true;
  }

  // HMM: Resultados do scraper — relay pro Skychart
  if (request.action === "hmm_schedule_results") {
    const hmmTabId = sender.tab ? sender.tab.id : null;
    const skychartTabId = hmmTabId ? pendingHmmTabs[hmmTabId] : null;

    console.log("[HMM] Resultados recebidos:", request.results ? request.results.length : 0, "sailings. HMM tab:", hmmTabId, "→ Skychart:", skychartTabId);

    if (skychartTabId) {
      chrome.tabs.sendMessage(skychartTabId, {
        action: 'hmm_schedule_results',
        results: request.results
      }, (response) => {
        console.log("[HMM] Relay pro Skychart OK");
      });
      delete pendingHmmTabs[hmmTabId];
    } else {
      // Fallback: envia pra todas as tabs do Skychart
      console.log("[HMM] Sem mapeamento, enviando pra todas tabs Skychart");
      chrome.tabs.query({ url: 'https://app2.skychart.com.br/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'hmm_schedule_results',
            results: request.results
          });
        });
      });
    }
    return true;
  }

  // HMM: Verificação visual antes de clicar Retrieve
  if (request.action === "hmm_verify_screenshot") {
    const tabId = sender.tab.id;
    console.log("[HMM] Capturando screenshot pra verificação...");

    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (!dataUrl) {
        console.log("[HMM] Screenshot falhou, assumindo OK");
        chrome.tabs.sendMessage(tabId, { action: 'hmm_vision_result', verified: true });
        return;
      }

      // Envia pro Gemini pra verificar
      const prompt = `Olhe esta screenshot de um site de schedule de navios.
Os campos "From" e "To" devem estar preenchidos com:
- From: porta/cidade que CONTENHA "${request.expectedFrom}"
- To: porta/cidade que CONTENHA "${request.expectedTo}"

Atualmente os campos mostram:
- From: "${request.currentFrom}"
- To: "${request.currentTo}"

Os valores estão corretos? Responda APENAS com JSON:
{"verified": true/false, "suggestion": "o que corrigir", "correctedFrom": "texto correto pra buscar no From se errado", "correctedTo": "texto correto pra buscar no To se errado"}`;

      const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

      fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/png', data: base64 } }
            ]
          }]
        })
      })
      .then(r => r.json())
      .then(data => {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        try {
          const result = JSON.parse(clean);
          console.log("[HMM] Gemini verificou:", result);
          chrome.tabs.sendMessage(tabId, { action: 'hmm_vision_result', ...result });
        } catch(e) {
          console.log("[HMM] Erro parse Gemini:", e.message, 'raw:', clean.substring(0, 100));
          // Se não conseguiu parsear, assume OK
          chrome.tabs.sendMessage(tabId, { action: 'hmm_vision_result', verified: true });
        }
      })
      .catch(err => {
        console.error("[HMM] Erro Gemini:", err);
        chrome.tabs.sendMessage(tabId, { action: 'hmm_vision_result', verified: true });
      });
    });

    return true;
  }

  // HMM: Precisa verificação manual
  if (request.action === "hmm_needs_manual") {
    console.log("[HMM] Verificação manual necessária:", request.message);
    // Notifica todas as tabs do Skychart
    chrome.tabs.query({ url: 'https://app2.skychart.com.br/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'hmm_manual_needed',
          from: request.from,
          to: request.to,
          message: request.message
        });
      });
    });
    return true;
  }
  if (request.action === "maerskTrackingData") {
    const maerskTabId = sender.tab.id;
    const skychartTabId = pendingTrackingTabs[maerskTabId];

    console.log("[Tracking] Dados recebidos do Maersk, enviando pra Skychart tab:", skychartTabId);

    if (skychartTabId) {
      // Volta pra aba do Skychart pra usuario supervisionar
      chrome.tabs.update(skychartTabId, { active: true }).catch(() => { });

      chrome.tabs.sendMessage(skychartTabId, {
        action: 'trackingDataReady',
        data: request.data,
        error: request.error || null
      }).catch(err => console.error("[Tracking] Erro enviando dados:", err));

      // Fecha a aba da Maersk após 3 segundos
      setTimeout(() => {
        chrome.tabs.remove(maerskTabId).catch(() => { });
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

  // CHECK AGENT: Captura URL da aba nova (cotação PDF) — mesmo padrão do Serasa
  if (request.action === "captureNewTabUrl_check") {
    const senderTabId = sender.tab ? sender.tab.id : null;

    (async () => {
      try {
        const tabPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onCreated.removeListener(listener);
            resolve(null);
          }, 15000);

          function listener(tab) {
            clearTimeout(timeout);
            chrome.tabs.onCreated.removeListener(listener);
            setTimeout(async () => {
              try {
                const t = await chrome.tabs.get(tab.id);
                resolve({ tabId: tab.id, url: t.url || t.pendingUrl });
              } catch (e) {
                resolve({ tabId: tab.id, url: tab.pendingUrl || tab.url });
              }
            }, 3000);
          }
          chrome.tabs.onCreated.addListener(listener);
        });

        // Manda content clicar o botão de download
        if (senderTabId) {
          chrome.tabs.sendMessage(senderTabId, { action: 'clickCheckDownload' }).catch(() => { });
        }

        const newTab = await tabPromise;

        if (!newTab || !newTab.url) {
          sendResponse({ success: false, error: 'Nenhuma aba nova em 15s' });
          return;
        }

        console.log("[Check] URL capturada:", newTab.url);
        chrome.tabs.remove(newTab.tabId).catch(() => { });

        if (senderTabId) {
          chrome.tabs.update(senderTabId, { active: true }).catch(() => { });
        }

        sendResponse({ success: true, url: newTab.url });
      } catch (err) {
        console.error("[Check] Erro:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

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
              } catch (e) {
                resolve({ tabId: tab.id, url: tab.pendingUrl || tab.url });
              }
            }, 3000);
          }
          chrome.tabs.onCreated.addListener(listener);
        });

        // Manda content clicar
        if (senderTabId) {
          chrome.tabs.sendMessage(senderTabId, { action: 'clickSerasaDownload' }).catch(() => { });
        }

        const newTab = await tabPromise;

        if (!newTab || !newTab.url) {
          sendResponse({ success: false, error: 'Nenhuma aba nova em 15s' });
          return;
        }

        console.log("[Serasa] URL capturada:", newTab.url);

        // Fecha a aba do PDF
        chrome.tabs.remove(newTab.tabId).catch(() => { });

        // Volta foco pro Skychart
        if (senderTabId) {
          chrome.tabs.update(senderTabId, { active: true }).catch(() => { });
        }

        sendResponse({ success: true, url: newTab.url });
      } catch (err) {
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

  // SERASA CONSULTA: Abre aba do Serasa Empreendedor com CNPJ
  if (request.action === "openSerasaConsulta") {
    console.log("[Serasa Consulta] Abrindo para CNPJ:", request.cnpj);
    chrome.tabs.create({
      url: "https://www.serasaempreendedor.com.br/v2/consulta-serasa/new",
      active: true
    });
    sendResponse({ success: true });
    return false;
  }

  // SERASA: Click real via chrome.debugger (isTrusted = true)
  if (request.action === "serasaRealClick") {
    var tabId = sender.tab.id;
    var x = request.x;
    var y = request.y;
    console.log("[Serasa] Real click at", x, y, "on tab", tabId);

    function doRealClick(tid, cx, cy) {
      chrome.debugger.sendCommand({ tabId: tid }, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: cx, y: cy, button: "left", clickCount: 1
      }, function() {
        if (chrome.runtime.lastError) {
          console.error("[Serasa] mousePressed error:", chrome.runtime.lastError.message);
        }
        chrome.debugger.sendCommand({ tabId: tid }, "Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: cx, y: cy, button: "left", clickCount: 1
        }, function() {
          console.log("[Serasa] Real click OK at", cx, cy);
          sendResponse({ success: true });
        });
      });
    }

    chrome.debugger.attach({ tabId: tabId }, "1.3", function() {
      if (chrome.runtime.lastError) {
        // Ja esta attached — tenta clicar mesmo assim
        console.log("[Serasa] Debugger ja attached, clicando...");
      }
      doRealClick(tabId, x, y);
    });
    return true;
  }

  // OUTLOOK: Analisa email de cotacao via Gemini
  if (request.action === "analyzeQuotationEmail") {
    var emailText = "ASSUNTO: " + (request.subject || "") + "\n\nDE: " + (request.from || "") + "\n\nCORPO:\n" + (request.body || "");
    
    console.log("[Email Agent] Analisando cotacao...");

    var quotationPrompt = QUOTATION_PROMPT + "\n\nEMAIL:\n" + emailText;

    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: quotationPrompt }] }],
        generationConfig: { temperature: 0.1 }
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var text = result.candidates[0].content.parts[0].text;
      // Limpa markdown
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      var data = JSON.parse(text);
      console.log("[Email Agent] Dados extraidos:", data);
      sendResponse({ success: true, data: data });
    })
    .catch(function(err) {
      console.error("[Email Agent] Erro Gemini:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // OUTLOOK: Abre Skychart na tela de ofertas (usa tab existente)
  if (request.action === "openSkychartOferta") {
    chrome.tabs.query({ url: "https://app2.skychart.com.br/*" }, function(tabs) {
      if (tabs && tabs.length > 0) {
        // Usa tab existente — navega via hash (SPA)
        var tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true }, function() {
          chrome.tabs.sendMessage(tab.id, {
            action: "navigateToOferta"
          });
        });
        console.log("[Email Agent] Usando tab Skychart existente:", tab.id);
      } else {
        // Sem tab Skychart aberta — abre nova
        chrome.tabs.create({
          url: "https://app2.skychart.com.br/skyline-mond-83474/#/app/oferta",
          active: true
        });
        console.log("[Email Agent] Abrindo nova tab Skychart");
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // ====================================================
  // CHECK AGENT — PDF Text Extraction via Gemini
  // ====================================================

  if (request.action === "check_extract_pdf") {
    // Encontra a aba do PDF (a mais recente que não é a do Skychart)
    chrome.tabs.query({ active: false, currentWindow: true }, function(tabs) {
      // Procura tab com URL de PDF ou a última aberta
      var pdfTab = null;
      for (var i = tabs.length - 1; i >= 0; i--) {
        var url = tabs[i].url || '';
        if (url.indexOf('.pdf') >= 0 || url.indexOf('blob:') >= 0 || url.indexOf('/api/') >= 0) {
          pdfTab = tabs[i];
          break;
        }
      }

      if (!pdfTab) {
        // Tenta a última aba aberta (que não é skychart)
        for (var j = tabs.length - 1; j >= 0; j--) {
          if ((tabs[j].url || '').indexOf('skychart') < 0) {
            pdfTab = tabs[j];
            break;
          }
        }
      }

      if (!pdfTab) {
        sendResponse({ success: false, error: 'PDF tab not found' });
        return;
      }

      console.log('[Check] PDF tab encontrado:', pdfTab.id, pdfTab.url);

      // Ativa a tab do PDF, tira screenshot, e envia pro Gemini extrair texto
      chrome.tabs.update(pdfTab.id, { active: true }, function() {
        setTimeout(function() {
          chrome.tabs.captureVisibleTab(null, { format: 'png' }, function(dataUrl) {
            if (chrome.runtime.lastError || !dataUrl) {
              console.log('[Check] Screenshot falhou:', chrome.runtime.lastError);
              sendResponse({ success: false, error: 'screenshot failed' });
              return;
            }

            var base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');

            // Manda pro Gemini extrair TEXTO do PDF
            fetch(GEMINI_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inlineData: { mimeType: 'image/png', data: base64Data } },
                    { text: 'Extraia TODAS as linhas de custos/taxas deste PDF de cotação de frete.\n\nPara cada taxa, retorne: nome da taxa, moeda (USD/BRL/%), e valor total.\n\nFormato de resposta (APENAS o texto puro, uma linha por taxa):\nTAXA|MOEDA|VALOR\n\nExemplo:\nFrete Maritimo|USD|995,00\nTHC no Destino (Capatazia)|BRL|1.160,00\n\nSe houver seções como "CUSTOS DE FRETE", "CUSTOS NO DESTINO", "CUSTOS NA ORIGEM", mantenha todas as taxas.\nNÃO inclua headers, comentários ou explicações — apenas as linhas TAXA|MOEDA|VALOR.' }
                  ]
                }]
              })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
              var text = '';
              try {
                text = data.candidates[0].content.parts[0].text;
              } catch(e) { text = ''; }

              console.log('[Check] Gemini extraiu:', text.substring(0, 300));

              // Fecha a aba do PDF e volta pro Skychart
              chrome.tabs.remove(pdfTab.id);

              sendResponse({ success: true, text: text });
            })
            .catch(function(err) {
              console.error('[Check] Gemini erro:', err);
              sendResponse({ success: false, error: err.message });
            });
          });
        }, 2000); // Espera 2s pro PDF renderizar
      });
    });
    return true;
  }

  // ====================================================
  // VISION AGENT — Screenshot + Gemini Multimodal
  // ====================================================

  // VISION: Captura screenshot da aba ativa
  if (request.action === "visionScreenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, function(dataUrl) {
      if (chrome.runtime.lastError) {
        console.error("[Vision] Screenshot erro:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      console.log("[Vision] Screenshot capturado");
      sendResponse({ success: true, image: dataUrl });
    });
    return true;
  }

  // VISION: Analisa screenshot via Gemini multimodal
  if (request.action === "visionAnalyze") {
    var screenshot = request.screenshot; // data:image/png;base64,...
    var instruction = request.instruction;
    var viewport = request.viewport || {};

    // Extrai base64 puro (remove o prefixo data:image/png;base64,)
    var base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

    var visionPrompt = VISION_ANALYZE_PROMPT
      .replace('{INSTRUCTION}', instruction)
      .replace('{WIDTH}', viewport.width || 1920)
      .replace('{HEIGHT}', viewport.height || 1080);

    console.log("[Vision] Analisando com Gemini multimodal...");

    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data
              }
            },
            {
              text: visionPrompt
            }
          ]
        }],
        generationConfig: { temperature: 0.1 }
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var text = result.candidates[0].content.parts[0].text;
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      var data = JSON.parse(text);
      console.log("[Vision] Análise completa:", data);
      sendResponse({ success: true, data: data });
    })
    .catch(function(err) {
      console.error("[Vision] Erro Gemini:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // VISION: Click em coordenadas via debugger
  if (request.action === "visionClick") {
    var vx = request.x;
    var vy = request.y;
    console.log("[Vision] Click em", vx, vy);

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length > 0) {
        doRealClick(tabs[0].id, vx, vy);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Sem aba ativa" });
      }
    });
    return true;
  }

  // AGENTIC: Gera plano via Gemini
  if (request.action === "agenticPlan") {
    console.log("[Agentic] Gerando plano...");

    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var text = result.candidates[0].content.parts[0].text;
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      var data = JSON.parse(text);
      console.log("[Agentic] Plano gerado:", data.steps.length, "steps");
      sendResponse({ success: true, data: data });
    })
    .catch(function(err) {
      console.error("[Agentic] Erro:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

const VISION_ANALYZE_PROMPT = `
Voce e um agente visual inteligente. Analise o screenshot da tela e execute a instrucao.

INSTRUCAO: {INSTRUCTION}

VIEWPORT: {WIDTH}x{HEIGHT} pixels

Retorne APENAS JSON puro (sem markdown, sem backticks):

{
  "found": true ou false (se encontrou o que foi pedido),
  "description": "descricao do que voce ve na tela",
  "action": {
    "type": "click" ou "type" ou "scroll" ou "wait" ou null,
    "x": coordenada_x_em_pixels (centro do elemento),
    "y": coordenada_y_em_pixels (centro do elemento),
    "text": "texto a digitar (se type)"
  },
  "success": true ou false (se e uma verificacao),
  "suggestion": "sugestao do que fazer a seguir",
  "elements_found": ["lista de elementos relevantes que voce identificou na tela"]
}

REGRAS:
- As coordenadas X,Y devem ser o CENTRO do elemento alvo em pixels.
- O viewport tem {WIDTH}x{HEIGHT} pixels, use isso pra calcular posicoes.
- Se a instrucao pede pra clicar num botao, retorne type="click" com x,y do centro do botao.
- Se pede pra digitar, retorne type="type" com x,y do campo e text com o valor.
- Se o elemento nao esta visivel, sugira scroll.
- Se e uma verificacao, foque em responder success true/false.
- NUNCA retorne coordenadas fora do viewport.
- Retorne APENAS o JSON.
`;

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

const QUOTATION_PROMPT = `
Voce e um extrator de dados especializado em cotacoes de frete maritimo/aereo.
Analise o email abaixo e extraia os dados da cotacao. Retorne APENAS JSON puro (sem markdown, sem \`\`\`).

{
  "cliente": "nome do CLIENTE/empresa que SOLICITA a cotacao — ver regras abaixo",
  "empresa_cliente": "nome da empresa do cliente (da assinatura ORIGINAL, nao do encaminhador)",
  "remetente": "nome da pessoa que enviou/encaminhou o email",
  "empresa_remetente": "empresa do remetente que encaminhou (ex: Mond Shipping)",
  "processo_ref": "numero de referencia/processo mencionado (ex: IDB-20857/26, UNL884, DAMA#2026-064)",
  "incoterm": "FOB, CIF, EXW, etc",
  "equipamento": "tipo de container (40HC, 20DV, 20DRY, NOR, etc)",
  "quantidade_containers": "numero de containers (ex: '3 X 20 dry' = 3, '4 x 40HC' = 4, '1 container' = 1)",
  "origem": "porto/cidade de origem",
  "destino": "porto/cidade de destino",
  "mercadoria": "descricao da mercadoria/carga",
  "ncm": "codigos NCM mencionados",
  "peso_bruto": "peso bruto total em KG",
  "valor_mercadoria": "valor da mercadoria (incluir moeda)",
  "modal_tipo": "tipo de operacao para o Skychart",
  "observacoes": "notas adicionais relevantes"
}

REGRAS DE IDENTIFICACAO DO CLIENTE (MUITO IMPORTANTE):
- Use SEMPRE o nome COMPLETO da empresa como aparece na assinatura ou logo (ex: "IDB do Brasil", NAO apenas "IDB").
- EMAILS ENCAMINHADOS (assunto com "ENC:", "FW:", "FWD:"): O email foi ENCAMINHADO por alguem (freight forwarder, agente, funcionario). O CLIENTE nao e quem encaminhou!
  - Procure a ASSINATURA ORIGINAL dentro do corpo (abaixo de "De:", "From:", etc.)
  - O CLIENTE e a EMPRESA na assinatura ORIGINAL (ex: se assinatura tem logo "IDB DO BRASIL TRADING", cliente = "IDB do Brasil")
  - Se a assinatura tem o dominio @idbdobrasil.com.br → cliente = "IDB do Brasil"
  - Mond Shipping, Skyline, Mond = sao VOCE (agente/forwarder), NUNCA sao o cliente
  - Se a referencia comeca com "IDB-" → cliente = "IDB do Brasil"
  - Se a referencia comeca com "UNL" → cliente provavelmente = "Unitermi"
  - Se a referencia comeca com "DAMA" → cliente provavelmente = "Damacomex"
- EMAILS DIRETOS: Use o remetente como cliente, com nome COMPLETO da empresa.
- Se o assunto contem "CLIENTE:" use esse nome como cliente.
- Se nao conseguir identificar, use o nome COMPLETO da empresa da assinatura ORIGINAL ou dominio do email ORIGINAL.
- NUNCA abrevie o nome do cliente. Use o nome como o cliente se identifica (ex: "Unitermi", "IDB do Brasil", "Damacomex").

REGRAS PARA ORIGEM E DESTINO:
- Para origem e destino, SEMPRE use o nome do PORTO (ex: NINGBO, NAVEGANTES, SHANGHAI).
- Se equipamento diz "ou NOR", inclua ambas opcoes.

REGRAS PARA modal_tipo (MUITO IMPORTANTE - deduzir pelo contexto):
- Se menciona CONTAINER, TEU, FCL, LCL, POL, POD, frete maritimo = transporte MARITIMO
- Se menciona AWB, aereo, aerea, kg bruto sem container = transporte AEREO
- Se menciona rodoviario, caminhao, carreta = transporte RODOVIARIO
- Se a ORIGEM e no exterior e DESTINO no Brasil = IMPORTACAO
- Se a ORIGEM e no Brasil e DESTINO no exterior = EXPORTACAO
- Se ambos no Brasil = use "Cabotagem" (maritimo) ou "Rodoviario Nacional" (rodoviario)
- Portos brasileiros: Santos, Paranagua, Itajai, Itapoa, Navegantes, Rio Grande, Suape, Salvador, etc.
- Valores validos para modal_tipo: "Importacao Maritima", "Importacao Aerea", "Importacao Rodoviaria", "Exportacao Maritima", "Exportacao Aerea", "Exportacao Rodoviaria", "Cabotagem", "Rodoviario Nacional", "Armazenagem"
- Use EXATAMENTE um desses valores, com acento.

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

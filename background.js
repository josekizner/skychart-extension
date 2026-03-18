// API config
const _b = 'QUl6YVN5QTVwOU41a1hLQ1hYRm9aZ3FZcl9HMjNwTkFLZERHYUhV';
const GEMINI_API_KEY = atob(_b);
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ===== PERFIL / PERMISSOES =====
const PROFILES = {
  master: ['cambio','serasa','frete','tracking','cotacao','frequencia','chequeio-fin','chequeio-op'],
  financeiro: ['cambio','serasa','chequeio-fin'],
  'financeiro-demurrage': ['cambio','serasa','demurrage','tracking','frete','chequeio-fin'],
  operacional: ['tracking','frete','chequeio-op'],
  comercial: ['cotacao','frete','frequencia'],
  demurrage: ['demurrage','tracking','frete']
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

// ===== MESSAGE ROUTING =====
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    // Open a new tab (used by agenda agent)
    if (msg.action === 'openTab') {
        chrome.tabs.create({ url: msg.url, active: false });
        sendResponse({ ok: true });
        return;
    }
});

// ===== AUTO-UPDATE COM AUTO-RELOAD =====
const CURRENT_VERSION = "2.4.0";
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
        // Persiste no storage pra sobreviver restart do service worker
        chrome.storage.local.get('pendingTrackingTabs', function(d) {
          var pending = d.pendingTrackingTabs || {};
          pending[tab.id] = skychartTabId;
          chrome.storage.local.set({ pendingTrackingTabs: pending });
          console.log("[Tracking] Tab aberta:", tab.id, "-> Skychart tab:", skychartTabId, "(persistido)");
        });
      });
    }

    sendResponse({ success: true, message: 'Tracking aberto' });
    return true;
  }

  // Booking Agent: cross-check Maersk (abre visível pro analista ver)
  if (request.action === "openMaerskTracking") {
    const booking = request.bookingNumber;
    const skychartTabId = sender.tab.id;

    console.log("[Booking Cross-check] Abrindo Maersk tracking visível:", booking);

    const trackingUrl = 'https://www.maersk.com/tracking/' + encodeURIComponent(booking);
    chrome.tabs.create({ url: trackingUrl, active: true }, (tab) => {
      chrome.storage.local.get('pendingTrackingTabs', function(d) {
        var pending = d.pendingTrackingTabs || {};
        pending[tab.id] = { skychartTab: skychartTabId, crossCheck: true };
        chrome.storage.local.set({ pendingTrackingTabs: pending, crossCheckMaerskTab: tab.id, crossCheckSkychartTab: skychartTabId });
        console.log("[Booking Cross-check] Tab visível:", tab.id, "-> Skychart tab:", skychartTabId, "(persistido)");
      });
    });

    sendResponse({ success: true });
    return true;
  }

  // Booking Agent: fecha aba Maersk e volta pro Skychart
  if (request.action === "closeMaerskAndReturn") {
    var maerskTab = request.maerskTab;
    var skychartTab = request.skychartTab;

    console.log("[Booking Cross-check] Fechando Maersk tab:", maerskTab, "voltando para:", skychartTab);

    if (maerskTab) {
      try { chrome.tabs.remove(maerskTab); } catch(e) {}
    }
    if (skychartTab) {
      chrome.tabs.update(skychartTab, { active: true });
    }

    chrome.storage.local.remove(['crossCheckMaerskTab', 'crossCheckSkychartTab']);
    sendResponse({ success: true });
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

    // Lê do storage (persiste entre restarts do service worker)
    chrome.storage.local.get('pendingTrackingTabs', function(d) {
      var allPending = d.pendingTrackingTabs || {};
      var pending = allPending[maerskTabId];

      // Verifica se é cross-check do booking ou tracking normal
      const isCrossCheck = pending && typeof pending === 'object' && pending.crossCheck;
      const skychartTabId = isCrossCheck ? pending.skychartTab : pending;

      console.log("[Tracking] Dados recebidos do Maersk", isCrossCheck ? '(cross-check)' : '(tracking)', "-> Skychart tab:", skychartTabId);

      if (skychartTabId) {
        if (isCrossCheck) {
          // Cross-check: volta pro Skychart e envia dados separados
          chrome.tabs.update(skychartTabId, { active: true }).catch(() => { });
          chrome.tabs.sendMessage(skychartTabId, {
            action: 'bookingCrossCheckData',
            data: request.data,
            error: request.error || null
          }).catch(err => console.error("[CrossCheck] Erro enviando dados:", err));
          // Fecha a Maersk após 3s (analista já viu)
          setTimeout(() => {
            chrome.tabs.remove(maerskTabId).catch(() => { });
          }, 3000);
        } else {
          // Tracking normal: volta pra Skychart e preenche campos
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
        }

        // Limpa do storage
        delete allPending[maerskTabId];
        chrome.storage.local.set({ pendingTrackingTabs: allPending });
      }
    });

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
        var tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true }, function() {
          chrome.tabs.sendMessage(tab.id, {
            action: "navigateToOferta"
          });
        });
        console.log("[Email Agent] Usando tab Skychart existente:", tab.id);
      } else {
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

  // OUTLOOK: Analisa email de booking via Gemini
  if (request.action === "analyzeBookingEmail") {
    var bookingEmailText = "ASSUNTO: " + (request.subject || "") + "\n\nDE: " + (request.from || "") + "\n\nCORPO:\n" + (request.body || "");
    
    console.log("[Email Agent] Analisando booking...");

    var bookingPrompt = BOOKING_PROMPT + "\n\nEMAIL:\n" + bookingEmailText;

    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: bookingPrompt }] }],
        generationConfig: { temperature: 0.1 }
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var text = result.candidates[0].content.parts[0].text;
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      var data = JSON.parse(text);
      console.log("[Email Agent] Booking extraido:", data);
      sendResponse({ success: true, data: data });
    })
    .catch(function(err) {
      console.error("[Email Agent] Erro Gemini booking:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // OUTLOOK: Abre Skychart na tela operacional (booking)
  if (request.action === "openSkychartBooking") {
    chrome.tabs.query({ url: "https://app2.skychart.com.br/*" }, function(tabs) {
      if (tabs && tabs.length > 0) {
        var tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true }, function() {
          chrome.tabs.sendMessage(tab.id, {
            action: "navigateToBooking"
          });
        });
        console.log("[Email Agent] Usando tab Skychart existente para booking:", tab.id);
      } else {
        chrome.tabs.create({
          url: "https://app2.skychart.com.br/skyline-mond-83474/#/app/operacional",
          active: true
        });
        console.log("[Email Agent] Abrindo nova tab Skychart operacional");
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

  // HEALTH CHECK: Recebe alertas de problemas detectados
  if (request.action === "healthCheckAlert") {
    const d = request.data || {};
    console.log("[Health] Alerta recebido:", d.modulo, d.failures);

    // 1. Chrome Notification (aparece no sistema, mesmo com aba minimizada)
    chrome.notifications.create('health-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: '⚠ Atom Health Check — ' + (d.modulo || 'Geral'),
      message: (d.failures || []).join('\n') + '\n\nPerfil: ' + (d.profile || '?') + ' | ' + (d.timestamp || ''),
      priority: 2
    }, function() {
      if (chrome.runtime.lastError) console.log('[Health] Notification error:', chrome.runtime.lastError.message);
    });

    // 2. Broadcast pra todas as tabs Skychart (Master vê independente de onde veio)
    chrome.tabs.query({ url: 'https://app2.skychart.com.br/*' }, function(tabs) {
      (tabs || []).forEach(function(tab) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'healthCheckBroadcast',
          data: d
        }).catch(function() {});
      });
    });

    // 3. Salva histórico de alertas
    chrome.storage.local.get(['healthAlertLog'], function(store) {
      var log = store.healthAlertLog || [];
      log.push(d);
      if (log.length > 50) log = log.slice(-50); // Max 50 registros
      chrome.storage.local.set({ healthAlertLog: log });
    });

    sendResponse({ success: true });
    return true;
  }

  // ===== FREQUENCY AGENT: Busca dados da API comercial =====
  if (request.action === "fetchFrequencyData") {
    const COMMERCIAL_URL = 'https://server-mond.tail46f98e.ts.net/api/comercial';
    const COMMERCIAL_TOKEN = 'b2e7c1f4-8a2d-4e3b-9c6a-7f1e2d5a9b3c';

    fetch(COMMERCIAL_URL, {
      headers: {
        'Authorization': `Bearer ${COMMERCIAL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    .then(r => {
      if (!r.ok) throw new Error('API returned ' + r.status);
      return r.json();
    })
    .then(result => {
      const data = Array.isArray(result) ? result : (result.data || []);
      console.log('[Freq] Dados comerciais:', data.length, 'cotações');
      sendResponse({ success: true, data: data });
    })
    .catch(err => {
      console.error('[Freq] Erro ao buscar dados:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // ===== ATOM ANALYTICS: Log de inteligência no Firebase =====
  const FIREBASE_URL = 'https://mond-atom-default-rtdb.firebaseio.com';

  if (request.action === 'logAtomEvent') {
    const evt = request.event;
    if (!evt || !evt.agent) return;
    const path = `analytics/${evt.agent}`;
    fetch(`${FIREBASE_URL}/${path}.json`, {
      method: 'POST',
      body: JSON.stringify(evt)
    }).catch(() => {}); // fire-and-forget
    return; // não precisa de sendResponse
  }

  // ===== FIREBASE: Sync de processos resolvidos (demurrage) =====

  if (request.action === 'getDemurrageResolved') {
    fetch(`${FIREBASE_URL}/demurrage/resolved.json`)
      .then(r => r.json())
      .then(data => {
        try { sendResponse({ success: true, data: data || {} }); } catch(e) {}
      })
      .catch(err => {
        console.error('[Firebase] Erro ao ler resolved:', err);
        try { sendResponse({ success: false, error: err.message }); } catch(e) {}
      });
    return true;
  }

  // ===== FIREBASE: Cache compartilhado de dados demurrage =====
  if (request.action === 'getDemurrageCache') {
    fetch(`${FIREBASE_URL}/demurrage/cache.json`)
      .then(r => r.json())
      .then(data => {
        if (data && data.items && data.items.length > 0) {
          console.log('[Firebase] Cache demurrage:', data.items.length, 'processos, idade:', Math.round((Date.now() - data.timestamp) / 60000), 'min');
          try { sendResponse({ success: true, data: data.items, timestamp: data.timestamp }); } catch(e) {}
        } else {
          try { sendResponse({ success: false, reason: 'empty' }); } catch(e) {}
        }
      })
      .catch(err => {
        console.error('[Firebase] Erro ao ler cache:', err);
        try { sendResponse({ success: false, error: err.message }); } catch(e) {}
      });
    return true;
  }

  if (request.action === 'setDemurrageResolved') {
    const proc = request.processo;
    const payload = {
      resolvedAt: new Date().toISOString(),
      resolvedBy: request.user || 'unknown',
      motivo: request.motivo || 'CNTR devolvido (manual)'
    };
    fetch(`${FIREBASE_URL}/demurrage/resolved/${encodeURIComponent(proc.replace(/\//g, '_'))}.json`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(() => {
        console.log('[Firebase] Processo', proc, 'marcado como resolvido');
        try { sendResponse({ success: true }); } catch(e) {}
      })
      .catch(err => {
        console.error('[Firebase] Erro ao salvar resolved:', err);
        try { sendResponse({ success: false, error: err.message }); } catch(e) {}
      });
    return true;
  }

  if (request.action === 'removeDemurrageResolved') {
    const proc = request.processo;
    fetch(`${FIREBASE_URL}/demurrage/resolved/${encodeURIComponent(proc.replace(/\//g, '_'))}.json`, {
      method: 'DELETE'
    })
      .then(() => {
        console.log('[Firebase] Processo', proc, 'desmarcado');
        try { sendResponse({ success: true }); } catch(e) {}
      })
      .catch(err => {
        try { sendResponse({ success: false, error: err.message }); } catch(e) {}
      });
    return true;
  }

  // ===== FIREBASE: Serasa Score compartilhado =====
  if (request.action === 'saveSerasaScore') {
    const key = encodeURIComponent(request.clientKey);
    const payload = {
      score: request.score,
      limiteCredito: request.limiteCredito || null,
      savedBy: request.savedBy || 'unknown',
      savedAt: new Date().toISOString()
    };
    fetch(`${FIREBASE_URL}/serasa/${key}.json`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(() => {
        console.log('[Firebase] Serasa score salvo para', request.clientKey);
        try { sendResponse({ success: true }); } catch(e) {}
      })
      .catch(err => {
        console.error('[Firebase] Erro ao salvar Serasa:', err);
        try { sendResponse({ success: false, error: err.message }); } catch(e) {}
      });
    return true;
  }

  if (request.action === 'getSerasaScore') {
    const key = encodeURIComponent(request.clientKey);
    fetch(`${FIREBASE_URL}/serasa/${key}.json`)
      .then(r => r.json())
      .then(data => {
        try { sendResponse({ success: true, data: data }); } catch(e) {}
      })
      .catch(err => {
        try { sendResponse({ success: false, error: err.message }); } catch(e) {}
      });
    return true;
  }

  // ===== DEMURRAGE AGENT: Busca operacional + equipamento e calcula risco =====
  // Logic copied EXACTLY from dashboard api.service.ts processData()
  if (request.action === "fetchDemurrageData") {
    const API_BASE = 'https://server-mond.tail46f98e.ts.net/api';
    const API_TOKEN = 'b2e7c1f4-8a2d-4e3b-9c6a-7f1e2d5a9b3c';
    const headers = { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' };

    // Helper: parse date — handles ISO and DD/MM/YYYY (same as api.service.ts parseDate)
    function parseDate(dateStr) {
      if (!dateStr) return null;
      // ISO string (contains '-')
      if (typeof dateStr === 'string' && dateStr.includes('-')) {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      }
      // DD/MM/YYYY
      const parts = ('' + dateStr).split('/');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    console.log('[Demurrage] Recebido fetchDemurrageData, buscando APIs...');
    
    // Timeout de 15s pra cada fetch (evita ficar pendurado pra sempre)
    function fetchWithTimeout(url, opts, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || 15000);
      return fetch(url, { ...opts, signal: controller.signal })
        .then(r => { clearTimeout(timer); return r; })
        .catch(err => { clearTimeout(timer); throw err; });
    }

    Promise.all([
      fetchWithTimeout(`${API_BASE}/operacional`, { headers }, 15000).then(r => {
        console.log('[Demurrage] API operacional:', r.status, r.statusText);
        if (!r.ok) throw new Error('API operacional retornou ' + r.status);
        return r.json();
      }),
      fetchWithTimeout(`${API_BASE}/equipamento`, { headers }, 15000).then(r => {
        console.log('[Demurrage] API equipamento:', r.status, r.statusText);
        if (!r.ok) throw new Error('API equipamento retornou ' + r.status);
        return r.json();
      })
    ])
    .then(([opJson, eqJson]) => {
      const operacional = opJson.data || opJson || [];
      const equipamento = eqJson.data || eqJson || [];

      // Build equipment map by CD_MOVIMENTO (array per movement, same as dashboard)
      const equipMap = {};
      equipamento.forEach(eq => {
        if (!equipMap[eq.CD_MOVIMENTO]) equipMap[eq.CD_MOVIMENTO] = [];
        equipMap[eq.CD_MOVIMENTO].push(eq);
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const results = [];

      // Filter: Importação Marítima FCL, not cancelled, not duplicate D
      const filtered = operacional.filter(op =>
        op.PRODUTO === 'Importação Marítima' &&
        (op.DS_TIPO_FRETE || '').includes('FCL') &&
        (op.DS_STATUS || '').toUpperCase() !== 'CANCELADO' &&
        !(op.PROCESSO || '').trim().toUpperCase().endsWith(' D')
      );

      // Process per OP (one result per process)
      filtered.forEach(op => {
        const equipmentsList = equipMap[op.CD_MOVIMENTO] || [];

        // Require docking date
        if (!op.DT_CONFIRMACAO_ATRACACAO) return;

        // Parse atracação date
        const dataAtracacao = parseDate(op.DT_CONFIRMACAO_ATRACACAO);
        if (!dataAtracacao) return;

        let freeTime = 0;
        let dataDevolucao = null;
        let allContainers = '—';
        let qtdContainers = 0;

        if (equipmentsList.length > 0) {
          // Has equipment data — use it
          const mainEquip = equipmentsList[0];
          freeTime = mainEquip.NR_FREE_TIME_NOSSO || 0;
          
          // Verifica DT_DEVOLUCAO de TODOS os containers
          const devolvidos = equipmentsList.filter(e => parseDate(e.DT_DEVOLUCAO));
          const todosDevolvidos = devolvidos.length > 0 && devolvidos.length === equipmentsList.length;
          
          if (todosDevolvidos) {
            // Pega a data de devolução mais recente (último container devolvido)
            const datas = devolvidos.map(e => parseDate(e.DT_DEVOLUCAO)).filter(d => d);
            dataDevolucao = new Date(Math.max.apply(null, datas));
          }
          
          if (dataDevolucao) dataDevolucao.setHours(0, 0, 0, 0);
          allContainers = equipmentsList
            .map(e => e.DS_IDENTIFICACAO)
            .filter(id => id)
            .join(', ') || '—';
          qtdContainers = mainEquip.NR_QTD || equipmentsList.length;
        }

        // Calculate free time end date
        const freeTimeEnd = new Date(dataAtracacao);
        freeTimeEnd.setDate(dataAtracacao.getDate() + freeTime);
        freeTimeEnd.setHours(0, 0, 0, 0);

        // Status logic
        let daysRemaining;
        let status;

        if (dataDevolucao) {
          // Todos containers devolvidos → finalizado
          const timeDiff = freeTimeEnd.getTime() - dataDevolucao.getTime();
          daysRemaining = Math.floor(timeDiff / (1000 * 3600 * 24));
          status = 'finalizado';
        } else {
          // Not returned — check risk vs today
          const timeDiff = freeTimeEnd.getTime() - today.getTime();
          daysRemaining = Math.floor(timeDiff / (1000 * 3600 * 24));
          if (daysRemaining < 0) {
            status = 'expirado';
          } else if (daysRemaining <= 5) {
            status = 'alerta';
          } else {
            status = 'ok';
          }
        }

        results.push({
          processo: op.PROCESSO,
          cliente: op.CLIENTE || '',
          armador: op.ARMADOR || '',
          container: allContainers,
          booking: op.BOOKING || '',
          atracacao: dataAtracacao.toLocaleDateString('pt-BR'),
          freeTime: freeTime,
          freeTimeEnd: freeTimeEnd.toLocaleDateString('pt-BR'),
          devolucao: dataDevolucao ? dataDevolucao.toLocaleDateString('pt-BR') : '',
          diasRestantes: Math.max(0, daysRemaining),
          diasAtrasados: Math.max(0, -daysRemaining),
          status: status,
          qtdContainers: qtdContainers
        });
      });

      // Sort: expirados first (most days overdue), then alerta, then ok
      results.sort((a, b) => {
        const order = { expirado: 0, alerta: 1, ok: 2, finalizado: 3 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        if (a.status === 'expirado') return b.diasAtrasados - a.diasAtrasados;
        return a.diasRestantes - b.diasRestantes;
      });

      console.log('[Demurrage] Processed:', results.length, 'processos');
      console.log('[Demurrage] Breakdown:', {
        expirado: results.filter(r => r.status === 'expirado').length,
        alerta: results.filter(r => r.status === 'alerta').length,
        ok: results.filter(r => r.status === 'ok').length,
        finalizado: results.filter(r => r.status === 'finalizado').length
      });
      // Salva no storage ao invés de sendResponse (Chrome MV3 fecha o canal IPC antes)
      var activeResults = results.filter(r => r.status !== 'finalizado');
      console.log('[Demurrage] Salvando', activeResults.length, 'processos no storage...');
      chrome.storage.local.set({ demurrageData: activeResults, demurrageTimestamp: Date.now() }, () => {
        console.log('[Demurrage] Dados salvos no storage! Enviando ACK...');
        try { sendResponse({ success: true, fromStorage: true, count: activeResults.length }); } catch(e) { /* port closed, content script vai ler do storage */ }

        // Salva no Firebase pra todos os PCs
        try {
          fetch(`${FIREBASE_URL}/demurrage/cache.json`, {
            method: 'PUT',
            body: JSON.stringify({ items: activeResults, timestamp: Date.now() })
          }).then(() => {
            console.log('[Firebase] Cache demurrage atualizado —', activeResults.length, 'processos');
          }).catch(err => console.error('[Firebase] Erro ao salvar cache:', err));
        } catch(e) {}
      });
    })
    .catch(err => {
      console.error('[Demurrage] Erro ao buscar dados:', err);
      try { sendResponse({ success: false, error: err.message }); } catch(e) { /* port closed */ }
    });
    return true;
  }

  // ===== FREQUENCY AGENT: Gera email de churn via Gemini =====
  if (request.action === "generateChurnEmail") {
    const c = request.client || {};
    const prompt = `Você é um inside sales de uma empresa de logística internacional (Mond Shipping).
Gere um email curto e profissional em português para um cliente que está com frequência de cotação abaixo do esperado.

DADOS DO CLIENTE:
- Nome: ${c.name}
- Frequência média de cotação: a cada ${c.avgGapDays} dias
- Dias sem cotar: ${c.daysSinceLast} dias
- Vendedor responsável: ${c.vendedor}
- Origem principal: ${c.origin}
- Destino principal: ${c.dest}
- Total de cotações históricas: ${c.totalQuotes}
- Cotações aprovadas: ${c.approved}

REGRAS:
- Seja sutil e consultivo, NÃO pressione
- Mencione que tem novas condições de mercado
- Ofereça uma cotação atualizada
- Tom profissional mas próximo
- Máximo 5 parágrafos curtos
- NÃO use emojis

Retorne APENAS JSON puro (sem markdown):
{
  "subject": "assunto do email",
  "body": "corpo do email"
}`;

    fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    })
    .then(r => r.json())
    .then(result => {
      let text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      try {
        const data = JSON.parse(text);
        sendResponse({ success: true, data: data });
      } catch(e) {
        sendResponse({ success: true, data: { subject: 'Acompanhamento de cotação — Mond Shipping', body: text } });
      }
    })
    .catch(err => {
      console.error('[Freq] Erro Gemini:', err);
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

const BOOKING_PROMPT = `
Voce e um extrator de dados especializado em confirmações de booking de frete maritimo.
Analise o email abaixo e extraia os dados do booking. Retorne APENAS JSON puro (sem markdown, sem \`\`\`).

{
  "processo": "numero do processo (sempre começa com IM, ex: IM00230/26). Procure no assunto e corpo do email",
  "booking_number": "codigo do booking/reserva (ex: 263769577, SQM266242862). SEMPRE pegar o do CORPO do email, nao do assunto. Se houver varios, pegar o ULTIMO mencionado no corpo. Pode aparecer apos 'SC:', 'BKG:', 'BOOKING:' etc",
  "armador": "nome do armador/carrier (Maersk, MSC, Hapag-Lloyd, CMA CGM, etc). Se mencionar MSK = Maersk",
  "navio": "nome do navio se mencionado no email (ex: MAERSK ELBA). Pode nao estar presente",
  "viagem": "numero da viagem se mencionado (ex: 611W). Pode nao estar presente",
  "origem": "porto de origem (ex: QINGDAO, SHANGHAI, NINGBO)",
  "destino": "porto de destino (ex: ITAPOA, NAVEGANTES, SANTOS)",
  "container_tipo": "tipo de container (40HQ, 40HC, 20DV, etc)",
  "container_qtd": "quantidade de containers",
  "etd": "previsao de embarque/ETD no formato DD/MM/YYYY. Se vier como '21/MAR' converta para 21/03/2026. Use o ano correto do email",
  "eta": "previsao de chegada/ETA no formato DD/MM/YYYY se mencionada",
  "free_time": "dias de free time (ex: '21 DAYS' = '21 dias')",
  "rate": "valor do frete com moeda (ex: USD 2600/40HQ)",
  "observacoes": "notas adicionais relevantes"
}

REGRAS:
- O PROCESSO (IM) geralmente aparece no assunto do email. Formato: IM + 5 digitos + /ano (ex: IM00230/26).
- O BOOKING NUMBER e o codigo de reserva do armador. E alfanumerico, geralmente 9+ caracteres.
- Se o armador nao for mencionado explicitamente, deduza: MSK/MAERSK = Maersk, MSC = MSC, ONE = Ocean Network Express.
- Se ETD vier como dia/mes abreviado (ex: 21/MAR), converta para DD/MM/YYYY usando o ano do email.
- FREE TIME pode aparecer como "FREE TIME 21 DAYS" ou "FT: 21D" ou similar.
- O email pode conter muitos forwards e respostas. Foque nos dados mais recentes (ULTIMO email do corpo).
- BOOKING NUMBER: PRIORIZE SEMPRE o numero que aparece no CORPO do email, NAO no assunto. O assunto pode ter bookings antigos de forwards anteriores. Se o corpo tiver 'SC: 263769577' ou 'BKG: 12345', use esse.
- Se um campo nao estiver presente no email, retorne string vazia "".
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

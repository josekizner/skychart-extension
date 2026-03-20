/**
 * WORKFLOW EXECUTOR v6 — Agent-Driven Replay
 * 
 * A gravação captura a INTENÇÃO. Os agentes executam.
 * 
 * Para navigate_menu/navigate_section:
 *   1. Chama window.__atomSiteScan() (Radar)
 *   2. Busca na lista de links por text ou ID
 *   3. .click() nativo no <a> encontrado
 * 
 * Para type:
 *   1. Busca inputs visíveis na página
 *   2. Usa nthIndex pra pegar o campo certo
 *   3. Preenche char-by-char (PrimeNG calendar pattern)
 * 
 * Para click (botões):
 *   1. Busca em buttons do Radar por texto
 *   2. .click() nativo
 * 
 * Fallback: Gemini Vision (VisionAgent)
 */
(function() {
    'use strict';
    var TAG = '[Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;

    console.log(TAG, 'v6 Carregado (agent-driven)');

    // ========================================================================
    // CONTROLE
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'replay_workflow') {
            if (replaying) { sendResponse({ success: false }); return; }
            startReplay(msg.sessionId, msg.params || {});
            sendResponse({ success: true });
        }
        if (msg.action === 'replay_status') {
            sendResponse({ replaying: replaying, step: currentStep, total: totalSteps });
        }
        if (msg.action === 'stop_replay') {
            replaying = false; showIndicator(false);
            sendResponse({ success: true });
        }
    });

    // ========================================================================
    // START REPLAY
    // ========================================================================
    async function startReplay(sessionId, params) {
        replaying = true;
        currentStep = 0;
        showIndicator(true, 'Carregando...');
        console.log(TAG, '▶️ Replay:', sessionId);

        try {
            var resp = await fetch(FIREBASE_BASE + '/atom_recordings/' + sessionId + '.json');
            var rec = await resp.json();
            if (!rec || !rec.actions) {
                console.error(TAG, 'Gravação não encontrada');
                showIndicator(false); replaying = false; return;
            }

            var actions = rec.actions.filter(isExecutable);
            var label = '';
            for (var k = 0; k < rec.actions.length; k++) {
                if (rec.actions[k].type === 'session_start' && rec.actions[k].label) {
                    label = rec.actions[k].label; break;
                }
            }

            totalSteps = actions.length;
            console.log(TAG, 'Gravação:', label || sessionId, '|', totalSteps, 'passos');

            // Escape pra fechar possíveis modais (seguro pro Angular)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await delay(500);

            for (var i = 0; i < actions.length; i++) {
                if (!replaying) break;

                currentStep = i + 1;
                var action = applyParams(actions[i], params, i, actions);
                var desc = (action.text || action.value || action.selector || '').substring(0, 40);
                showIndicator(true, currentStep + '/' + totalSteps + ': ' + desc);
                console.log(TAG, '➡️', currentStep + '/' + totalSteps, action.type, '|', desc);

                var result;
                switch (action.type) {
                    case 'navigate_menu':
                    case 'navigate_section':
                        result = await executeNav(action);
                        break;
                    case 'type':
                        result = await executeType(action);
                        break;
                    case 'click':
                    case 'select':
                        result = await executeClick(action);
                        break;
                    default:
                        result = { ok: false, method: 'unknown-type' };
                }

                var status = result.ok ? '✅' : '❌';
                console.log(TAG, status, currentStep, 'via', result.method);

                if (!result.ok) {
                    showIndicator(true, '❌ ' + currentStep + ': ' + desc);
                    await delay(2000);
                }

                await delay(getDelay(action, i, actions));
            }

            showIndicator(true, '✅ Concluído! (' + totalSteps + ' passos)');
            console.log(TAG, '✅ CONCLUÍDO');
            setTimeout(function() { showIndicator(false); replaying = false; }, 3000);

        } catch(e) {
            console.error(TAG, 'Erro:', e);
            showIndicator(false); replaying = false;
        }
    }

    function isExecutable(a) {
        var validTypes = ['click', 'type', 'select', 'navigate_menu', 'navigate_section'];
        if (validTypes.indexOf(a.type) < 0) return false;
        if (a.id && a.id.indexOf('atom-') === 0) return false;
        if (a.selector && a.selector.indexOf('#atom-') === 0) return false;
        if (a.text && a.text.indexOf('PARAR') >= 0) return false;
        return true;
    }

    // ========================================================================
    // EXECUTE NAV — Usa o Radar pra encontrar links/menus
    // ========================================================================
    async function executeNav(action) {
        var text = (action.text || '').trim();
        var selector = action.selector || '';

        // Polling: espera até 12s pelo elemento
        var el = null;
        var start = Date.now();
        while (Date.now() - start < 12000) {
            // ESTRATÉGIA 1: Radar — busca na lista de links escaneados
            el = findViaRadar(text, selector);
            if (el) { 
                console.log(TAG, '📡 Achado via Radar:', el.tagName, el.id || el.textContent.trim().substring(0, 20));
                break; 
            }

            // ESTRATÉGIA 2: Selector direto (pra seletores com ID, ex: #Utilidades)
            if (selector) {
                try {
                    var bysel = document.querySelector(selector);
                    if (bysel && isVisible(bysel)) {
                        // Sobe pra <a> se é span
                        el = getClickableParent(bysel);
                        console.log(TAG, '🎯 Achado via selector:', selector);
                        break;
                    }
                } catch(e) {}
            }

            // ESTRATÉGIA 3: Busca por texto em links <a> visíveis
            if (text) {
                el = findLinkByText(text);
                if (el) {
                    console.log(TAG, '🔤 Achado via link text:', text);
                    break;
                }
            }

            await delay(500);
        }

        if (el) {
            highlight(el);
            el.click(); // .click() nativo — Angular reage
            await waitForMutation(2500);
            return { ok: true, method: 'agent' };
        }

        // FALLBACK: Gemini Vision
        return await tryGeminiVision(action);
    }

    // Busca via dados do Radar (site-scanner)
    function findViaRadar(text, selector) {
        // Chama o Radar pra scan fresco
        var scan = null;
        try {
            if (typeof window.__atomSiteScan === 'function') {
                scan = window.__atomSiteScan();
            }
        } catch(e) {}

        if (!scan || !scan.links) return null;

        var searchText = text.toLowerCase().trim();

        // Busca exata por texto nos links
        for (var i = 0; i < scan.links.length; i++) {
            var link = scan.links[i];
            var linkText = (link.text || '').toLowerCase().trim();
            
            if (linkText === searchText) {
                // Encontrou! Agora pega o elemento real pelo selector ou ID
                var el = null;
                if (link.id) {
                    el = document.getElementById(link.id);
                } else if (link.selector) {
                    try { el = document.querySelector(link.selector); } catch(e) {}
                }
                if (el && isVisible(el)) return el;
            }
        }

        // Busca parcial
        for (var j = 0; j < scan.links.length; j++) {
            var link2 = scan.links[j];
            var lt = (link2.text || '').toLowerCase().trim();
            if (lt.indexOf(searchText) >= 0 && lt.length < searchText.length * 2) {
                var el2 = null;
                if (link2.id) {
                    el2 = document.getElementById(link2.id);
                } else if (link2.selector) {
                    try { el2 = document.querySelector(link2.selector); } catch(e) {}
                }
                if (el2 && isVisible(el2)) return el2;
            }
        }

        // Também busca nos buttons
        if (scan.buttons) {
            for (var k = 0; k < scan.buttons.length; k++) {
                var btn = scan.buttons[k];
                var btnText = (btn.text || '').toLowerCase().trim();
                if (btnText === searchText || btnText.indexOf(searchText) >= 0) {
                    var el3 = null;
                    if (btn.selector) {
                        try { el3 = document.querySelector(btn.selector); } catch(e) {}
                    }
                    if (el3 && isVisible(el3)) return el3;
                }
            }
        }

        return null;
    }

    // Busca links <a> diretamente no DOM por texto
    function findLinkByText(text) {
        var search = text.toLowerCase().trim();
        var links = document.querySelectorAll('a, [role="menuitem"], [role="treeitem"]');
        
        // Match exato primeiro
        for (var i = 0; i < links.length; i++) {
            var lt = (links[i].textContent || '').trim().toLowerCase();
            if (lt === search && isVisible(links[i])) return links[i];
        }

        // Match quase exato (link text é ligeiramente diferente)
        for (var j = 0; j < links.length; j++) {
            var lt2 = (links[j].textContent || '').trim().toLowerCase();
            if (lt2.indexOf(search) >= 0 && lt2.length < search.length * 1.5 && isVisible(links[j])) {
                return links[j];
            }
        }

        // Match em spans/tds (fallback), mas sobe pro <a> pai
        var spans = document.querySelectorAll('span, td, li');
        for (var k = 0; k < spans.length; k++) {
            var st = (spans[k].textContent || '').trim().toLowerCase();
            if (st === search && isVisible(spans[k])) {
                return getClickableParent(spans[k]);
            }
        }

        return null;
    }

    // Sobe de SPAN/TD para o A/BUTTON/LI pai mais próximo
    function getClickableParent(el) {
        if (!el) return el;
        if (el.tagName === 'A' || el.tagName === 'BUTTON') return el;
        var parent = el.closest('a, button, li, [role="menuitem"], [role="treeitem"]');
        return parent || el;
    }

    // ========================================================================
    // EXECUTE TYPE — Usa DOMScanner pra encontrar inputs
    // ========================================================================
    async function executeType(action) {
        var value = (action.value || '').trim();
        if (!value) return { ok: false, method: 'no-value' };

        // Polling: espera input aparecer
        var el = null;
        var start = Date.now();
        while (Date.now() - start < 10000) {
            el = findInputForAction(action);
            if (el) break;
            await delay(500);
        }

        if (!el) return await tryGeminiVision(action);

        highlight(el);

        // Preenche com a estratégia correta
        // Detecta se é calendar (PrimeNG) pelo contexto
        var isCalendar = el.closest('.ui-calendar, .p-calendar') ||
                         (el.className && el.className.indexOf('ui-inputtext') >= 0 && /\d{2}\/\d{2}\/\d{4}/.test(value));

        if (isCalendar) {
            await typeCharByChar(el, value);
        } else {
            await typeNativeSet(el, value);
        }

        return { ok: true, method: 'agent' };
    }

    function findInputForAction(action) {
        var selector = action.selector || '';
        var nthIndex = action.nthIndex;
        var label = action.label || '';

        // Por selector + nthIndex (mais preciso pra campos duplicados como datas)
        if (selector) {
            try {
                var all = document.querySelectorAll(selector);
                var visible = [];
                for (var i = 0; i < all.length; i++) {
                    if (isVisible(all[i])) visible.push(all[i]);
                }
                
                if (nthIndex != null && visible.length > 0) {
                    // Tenta index direto e index-1 (1-based vs 0-based)
                    if (nthIndex < visible.length) return visible[nthIndex];
                    if (nthIndex > 0 && (nthIndex - 1) < visible.length) return visible[nthIndex - 1];
                }
                if (visible.length > 0) return visible[0];
            } catch(e) {}
        }

        // Por label via SkScanner (DOMScanner)
        if (label && typeof SkScanner !== 'undefined') {
            var field = SkScanner.getField(label);
            if (field && field.selector) {
                try {
                    var el = document.querySelector(field.selector);
                    if (el && isVisible(el)) return el;
                } catch(e) {}
            }
        }

        // Por fieldName/formcontrolname
        if (action.fieldName) {
            var el2 = document.querySelector('[formcontrolname="' + action.fieldName + '"]') ||
                      document.querySelector('[name="' + action.fieldName + '"]');
            if (el2 && isVisible(el2)) return el2;
        }

        return null;
    }

    async function typeCharByChar(el, value) {
        el.focus();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        await delay(100);
        if (el.select) el.select();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(100);
        for (var c = 0; c < value.length; c++) {
            el.value += value[c];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: value[c], bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: value[c], bubbles: true }));
            await delay(25);
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    async function typeNativeSet(el, value) {
        el.focus();
        await delay(100);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // ========================================================================
    // EXECUTE CLICK — Botões e elementos genéricos
    // ========================================================================
    async function executeClick(action) {
        var el = null;
        var start = Date.now();

        while (Date.now() - start < 10000) {
            // Radar buttons
            el = findViaRadar(action.text || '', action.selector || '');
            if (el) break;

            // Selector direto
            if (action.selector) {
                try {
                    el = document.querySelector(action.selector);
                    if (el && isVisible(el)) { el = getClickableParent(el); break; }
                    el = null;
                } catch(e) {}
            }

            // Inputs (pra cliques em campos de data que precedem typing)
            if (action.selector && action.selector.indexOf('input') >= 0) {
                try {
                    var inputs = document.querySelectorAll(action.selector);
                    for (var i = 0; i < inputs.length; i++) {
                        if (isVisible(inputs[i])) { el = inputs[i]; break; }
                    }
                    if (el) break;
                } catch(e) {}
            }

            await delay(500);
        }

        if (el) {
            highlight(el);
            el.click();
            return { ok: true, method: 'agent' };
        }

        return await tryGeminiVision(action);
    }

    // ========================================================================
    // GEMINI VISION FALLBACK
    // ========================================================================
    async function tryGeminiVision(action) {
        if (typeof VisionAgent === 'undefined') {
            console.warn(TAG, '⚠️ VisionAgent não disponível');
            return { ok: false, method: 'no-vision' };
        }

        console.log(TAG, '🤖 Tentando Gemini Vision...');
        showIndicator(true, '🤖 ' + currentStep + ': Gemini Vision...');

        try {
            var desc = 'Encontre o ';
            var types = { navigate_menu: 'item de menu', navigate_section: 'item de seção', type: 'campo de input', click: 'botão', select: 'dropdown' };
            desc += (types[action.type] || 'elemento');
            if (action.text) desc += ' com texto "' + action.text + '"';
            if (action.label) desc += ' com label "' + action.label + '"';

            var vr = await VisionAgent.findElement(desc);
            if (vr && vr.found && vr.x && vr.y) {
                console.log(TAG, '🎯 Gemini:', vr.x, vr.y);
                await VisionAgent.act({ type: 'click', x: vr.x, y: vr.y });
                if (action.type === 'type' && action.value) {
                    await delay(500);
                    var focused = document.activeElement;
                    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
                        await typeCharByChar(focused, action.value.trim());
                    }
                }
                return { ok: true, method: 'gemini' };
            }
        } catch(e) {
            console.error(TAG, 'Gemini erro:', e.message);
        }

        return { ok: false, method: 'not-found' };
    }

    // ========================================================================
    // MUTATION OBSERVER — Espera Angular renderizar
    // ========================================================================
    function waitForMutation(timeoutMs) {
        return new Promise(function(resolve) {
            var resolved = false;
            var observer = new MutationObserver(function(mutations) {
                var significant = false;
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0) {
                        significant = true; break;
                    }
                }
                if (significant && !resolved) {
                    resolved = true;
                    observer.disconnect();
                    setTimeout(resolve, 500);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(function() {
                if (!resolved) { resolved = true; observer.disconnect(); resolve(); }
            }, timeoutMs);
        });
    }

    // ========================================================================
    // HELPERS
    // ========================================================================
    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
        try { var s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; } catch(e) {}
        return false;
    }

    function applyParams(action, params, idx, all) {
        if (!params || Object.keys(params).length === 0) return action;
        var mod = JSON.parse(JSON.stringify(action));
        if (params.dates && mod.type === 'type' && mod.value && /\d{2}\/\d{2}\/\d{4}/.test(mod.value)) {
            var dateActs = all.filter(function(a) { return a.type === 'type' && /\d{2}\/\d{2}\/\d{4}/.test(a.value); });
            var di = dateActs.indexOf(action);
            if (di >= 0 && params.dates[di]) mod.value = params.dates[di];
        }
        return mod;
    }

    function getDelay(action, idx, all) {
        var next = all[idx + 1];
        if (action.type === 'navigate_menu' || action.type === 'navigate_section') {
            if (next && next.type !== 'navigate_menu' && next.type !== 'navigate_section') return 2500;
            return 1200;
        }
        if (action.type === 'type') return 400;
        if (action.type === 'click') return 1000;
        return 800;
    }

    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
    function highlight(el) {
        if (!el || !el.style) return;
        var o = el.style.outline;
        el.style.outline = '3px solid #F59E0B';
        setTimeout(function() { el.style.outline = o; }, 800);
    }

    function showIndicator(show, msg) {
        var e = document.getElementById('atom-replay-indicator');
        if (e) e.remove();
        if (!show) return;
        var d = document.createElement('div');
        d.id = 'atom-replay-indicator';
        d.textContent = '▶ ' + (msg || 'Executando...');
        d.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999999;' +
            'background:rgba(245,158,11,0.95);color:#000;padding:10px 24px;border-radius:20px;' +
            'font-size:13px;font-weight:bold;font-family:Arial;box-shadow:0 4px 12px rgba(0,0,0,0.3);' +
            'cursor:pointer;max-width:80%;text-align:center;';
        d.onclick = function() { replaying = false; showIndicator(false); };
        document.body.appendChild(d);
    }

})();

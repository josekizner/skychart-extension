/**
 * WORKFLOW EXECUTOR v3 — Replay à prova de falhas
 * 
 * Cadeia de busca (6 níveis):
 * 1. Seletor CSS direto (com Nth-match pra duplicados)
 * 2. ID  
 * 3. Texto visível exato
 * 4. Texto parcial / label
 * 5. Classe parcial
 * 6. GEMINI VISION — screenshot + IA identifica o elemento visualmente
 * 
 * + waitForElement com polling até 8s
 * + Delays inteligentes pós-navegação (Angular render)
 */
(function() {
    'use strict';
    var TAG = '[Workflow Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;

    console.log(TAG, 'v3 Carregado (com Gemini Vision fallback)');

    // ========================================================================
    // CONTROLE
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'replay_workflow') {
            if (replaying) {
                sendResponse({ success: false, error: 'Já executando' });
                return;
            }
            startReplay(msg.sessionId, msg.params || {});
            sendResponse({ success: true });
        }
        if (msg.action === 'replay_status') {
            sendResponse({ replaying: replaying, step: currentStep, total: totalSteps });
        }
        if (msg.action === 'stop_replay') {
            replaying = false;
            showIndicator(false);
            sendResponse({ success: true });
        }
    });

    // ========================================================================
    // START
    // ========================================================================
    async function startReplay(sessionId, params) {
        replaying = true;
        currentStep = 0;
        showIndicator(true, 'Carregando gravação...');
        console.log(TAG, '▶️ Replay:', sessionId);

        try {
            var resp = await fetch(FIREBASE_BASE + '/atom_recordings/' + sessionId + '.json');
            var rec = await resp.json();
            if (!rec || !rec.actions) {
                console.error(TAG, 'Gravação não encontrada');
                showIndicator(false); replaying = false;
                return;
            }

            var allActions = rec.actions;

            // Filtra executáveis + remove o click no próprio botão PARAR
            var actions = allActions.filter(function(a) {
                // Tipos não-executáveis
                if (a.type !== 'click' && a.type !== 'type' && a.type !== 'select' &&
                    a.type !== 'navigate_menu' && a.type !== 'navigate_section') return false;
                // Nossos próprios botões
                if (a.id && a.id.indexOf('atom-') === 0) return false;
                if (a.selector && a.selector.indexOf('#atom-') === 0) return false;
                // Botão PARAR com texto
                if (a.text && (a.text.indexOf('PARAR') >= 0 || a.text.indexOf('REC') >= 0 || a.text.indexOf('PLAY') >= 0)) return false;
                // Seletor nth-child genérico sem texto nem ID (lixo)
                if (a.selector && a.selector.indexOf(':nth-child') >= 0 && !a.text && !a.id) return false;
                return true;
            });

            // Descobre o label
            var label = '';
            for (var k = 0; k < allActions.length; k++) {
                if (allActions[k].type === 'session_start' && allActions[k].label) {
                    label = allActions[k].label; break;
                }
            }

            // Nth-match: pra seletores duplicados, atribui índice
            var selCount = {}, selIdx = {};
            actions.forEach(function(a) { if (a.selector) selCount[a.selector] = (selCount[a.selector] || 0) + 1; });
            actions.forEach(function(a) {
                if (a.selector && selCount[a.selector] > 1) {
                    selIdx[a.selector] = selIdx[a.selector] || 0;
                    a._nthMatch = selIdx[a.selector]++;
                }
            });

            totalSteps = actions.length;
            console.log(TAG, 'Gravação:', label || sessionId, '|', totalSteps, 'passos');

            for (var i = 0; i < actions.length; i++) {
                if (!replaying) { console.log(TAG, '⏹ Interrompido'); break; }

                currentStep = i + 1;
                var action = applyParams(actions[i], params, i, actions);
                var desc = describeAction(action);
                showIndicator(true, 'Passo ' + currentStep + '/' + totalSteps + ': ' + desc);
                console.log(TAG, '➡️', currentStep + '/' + totalSteps, ':', action.type, '|', action.text || action.value || action.selector);

                // BUSCA INTELIGENTE: DOM primeiro, Gemini como fallback
                var result = await smartExecute(action);

                if (result.method === 'gemini') {
                    console.log(TAG, '🤖 Gemini Vision resolveu!');
                } else if (result.ok) {
                    console.log(TAG, '✅ Passo', currentStep, 'OK via', result.method);
                } else {
                    console.warn(TAG, '⚠️ Passo', currentStep, 'falhou em TODOS os níveis');
                }

                await delay(getDelay(action, i, actions));
            }

            showIndicator(true, '✅ Replay concluído! (' + totalSteps + ' passos)');
            console.log(TAG, '✅ CONCLUÍDO');
            setTimeout(function() { showIndicator(false); replaying = false; }, 3000);

        } catch(e) {
            console.error(TAG, 'Erro:', e);
            showIndicator(false); replaying = false;
        }
    }

    // ========================================================================
    // SMART EXECUTE — Tenta DOM, depois Gemini Vision
    // ========================================================================
    async function smartExecute(action) {
        // Nível 1-5: Espera até 8s pelo elemento no DOM
        var el = await waitForElement(action, 8000);

        if (el) {
            var ok = await executeOnElement(action, el);
            return { ok: ok, method: 'dom' };
        }

        // Nível 6: GEMINI VISION FALLBACK
        console.log(TAG, '🤖 DOM falhou, ativando Gemini Vision...');
        showIndicator(true, '🤖 Passo ' + currentStep + ': Gemini Vision buscando...');

        try {
            if (typeof VisionAgent === 'undefined') {
                console.warn(TAG, 'VisionAgent não disponível');
                return { ok: false, method: 'none' };
            }

            var description = buildVisionDescription(action);
            console.log(TAG, '🔭 Pedindo ao Gemini:', description);

            var visionResult = await VisionAgent.findElement(description);

            if (visionResult && visionResult.found && visionResult.x && visionResult.y) {
                console.log(TAG, '🎯 Gemini encontrou em x:', visionResult.x, 'y:', visionResult.y);

                if (action.type === 'type') {
                    // Clica na posição + digita
                    await VisionAgent.act({ type: 'click', x: visionResult.x, y: visionResult.y });
                    await delay(500);
                    var activeEl = document.activeElement;
                    if (activeEl && activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                        await typeInElement(activeEl, action.value || '');
                    } else {
                        await VisionAgent.act({ type: 'type', x: visionResult.x, y: visionResult.y, text: action.value || '' });
                    }
                } else {
                    // Click na posição
                    await VisionAgent.act({ type: 'click', x: visionResult.x, y: visionResult.y });
                }

                return { ok: true, method: 'gemini' };
            } else {
                console.warn(TAG, '🤖 Gemini não encontrou o elemento');
                return { ok: false, method: 'gemini-failed' };
            }

        } catch(e) {
            console.error(TAG, 'Gemini Vision erro:', e.message);
            return { ok: false, method: 'gemini-error' };
        }
    }

    // Constrói descrição em linguagem natural pro Gemini
    function buildVisionDescription(action) {
        var parts = [];

        if (action.text && action.text.length > 1) {
            parts.push('com texto "' + action.text + '"');
        }
        if (action.label && action.label.length > 1) {
            parts.push('com label "' + action.label + '"');
        }

        var typeMap = {
            'click': 'botão ou link clicável',
            'navigate_menu': 'item de menu ou link de navegação',
            'navigate_section': 'seção ou item de árvore',
            'type': 'campo de input/texto',
            'select': 'campo dropdown/select'
        };

        var elementType = typeMap[action.type] || 'elemento interativo';

        if (action.type === 'type' && action.value) {
            parts.push('onde eu possa digitar "' + action.value.substring(0, 20) + '"');
        }

        var desc = 'Encontre o ' + elementType;
        if (parts.length > 0) desc += ' ' + parts.join(' ');

        // Adiciona contexto do selector se tiver
        if (action.selector) {
            desc += '. O seletor CSS original era: ' + action.selector;
        }

        return desc;
    }

    // ========================================================================
    // WAIT FOR ELEMENT — Polling com espera progressiva
    // ========================================================================
    async function waitForElement(action, timeoutMs) {
        var start = Date.now();
        var attempts = 0;

        while (Date.now() - start < timeoutMs) {
            attempts++;
            var el = findElement(action);
            if (el) {
                if (attempts > 1) console.log(TAG, '⏳ Encontrado após', (Date.now() - start) + 'ms');
                return el;
            }
            await delay(attempts < 3 ? 200 : attempts < 6 ? 400 : 600);
        }
        return null;
    }

    // ========================================================================
    // EXECUTE ON ELEMENT — Executa ação no elemento DOM encontrado
    // ========================================================================
    async function executeOnElement(action, el) {
        switch (action.type) {
            case 'click':
            case 'navigate_menu':
            case 'navigate_section':
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);
                highlight(el);
                // Click completo (Angular-safe)
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                await delay(50);
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                await delay(50);
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                try { el.click(); } catch(e) {}
                return true;

            case 'type':
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);
                highlight(el);
                await typeInElement(el, (action.value || '').trim());
                return true;

            case 'select':
                el.value = action.value || '';
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;

            default:
                return false;
        }
    }

    async function typeInElement(el, value) {
        el.focus();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        await delay(100);
        // Limpa
        el.select && el.select();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(100);
        // Digita char por char
        for (var c = 0; c < value.length; c++) {
            el.value += value[c];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: value[c], bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: value[c], bubbles: true }));
            await delay(30);
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // ========================================================================
    // FIND ELEMENT — 5 níveis de busca no DOM
    // ========================================================================
    function findElement(action) {
        var el;

        // 1. Seletor CSS (com Nth pra duplicados)
        if (action.selector) {
            try {
                if (action._nthMatch !== undefined) {
                    var all = document.querySelectorAll(action.selector);
                    var visible = [];
                    for (var m = 0; m < all.length; m++) {
                        if (isVisible(all[m])) visible.push(all[m]);
                    }
                    if (visible.length > action._nthMatch) return visible[action._nthMatch];
                    if (visible.length > 0) return visible[0];
                } else {
                    el = document.querySelector(action.selector);
                    if (el && isVisible(el)) return el;
                }
            } catch(e) {}
        }

        // 2. ID
        if (action.id && action.id.length > 0) {
            el = document.getElementById(action.id);
            if (el && isVisible(el)) return el;
        }

        // 3. Texto exato
        if (action.text && action.text.length > 1) {
            el = findByText(action.text, action.tagName);
            if (el) return el;
        }

        // 4. Label
        if (action.label && action.label.length > 1) {
            el = findByText(action.label);
            if (el) return el;
        }

        // 5. Classe parcial
        if (action.classes) {
            var cls = (action.classes || '').split(' ').filter(function(c) {
                return c.length > 4 && !c.startsWith('ng-') && !c.startsWith('ui-state');
            });
            for (var i = 0; i < cls.length && i < 3; i++) {
                try {
                    var byC = document.querySelectorAll('.' + cls[i]);
                    for (var j = 0; j < byC.length; j++) {
                        if (isVisible(byC[j])) return byC[j];
                    }
                } catch(e) {}
            }
        }

        return null;
    }

    function findByText(text, tagName) {
        if (!text || text.length < 2) return null;
        var search = text.trim().toLowerCase().replace(/\s+$/, '');
        var tags = tagName ? [tagName.toUpperCase()] : ['SPAN', 'BUTTON', 'A', 'LI', 'DIV', 'TD', 'LABEL', 'INPUT'];

        // Exato
        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                var tx = (els[i].textContent || els[i].value || '').trim().toLowerCase();
                if (tx === search && isVisible(els[i])) return els[i];
            }
        }
        // Parcial
        for (var t2 = 0; t2 < tags.length; t2++) {
            var els2 = document.querySelectorAll(tags[t2]);
            for (var j = 0; j < els2.length; j++) {
                var tx2 = (els2[j].textContent || '').trim().toLowerCase();
                if (tx2.indexOf(search) >= 0 && tx2.length < search.length * 2.5 && isVisible(els2[j])) return els2[j];
            }
        }
        return null;
    }

    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
        try { var s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; } catch(e) {}
        return false;
    }

    // ========================================================================
    // DYNAMIC PARAMS
    // ========================================================================
    function applyParams(action, params, idx, all) {
        if (!params || Object.keys(params).length === 0) return action;
        var mod = JSON.parse(JSON.stringify(action));
        if (params.dates && mod.type === 'type' && mod.value && /\d{2}\/\d{2}\/\d{4}/.test(mod.value)) {
            var dateActs = all.filter(function(a) { return a.type === 'type' && /\d{2}\/\d{2}\/\d{4}/.test(a.value); });
            var di = dateActs.indexOf(action);
            if (di >= 0 && params.dates[di]) {
                console.log(TAG, '🔄 Data:', mod.value, '→', params.dates[di]);
                mod.value = params.dates[di];
            }
        }
        if (params.fields && mod.fieldName && params.fields[mod.fieldName]) mod.value = params.fields[mod.fieldName];
        return mod;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================
    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    function getDelay(action, idx, all) {
        var next = all[idx + 1];
        switch(action.type) {
            case 'navigate_menu':
            case 'navigate_section':
                if (next && (next.type === 'navigate_menu' || next.type === 'navigate_section')) return 1500;
                return 3000; // Espera Angular renderizar
            case 'type': return 500;
            case 'click': return 1500;
            default: return 1000;
        }
    }

    function describeAction(a) {
        var d = { click: 'Click', navigate_menu: 'Menu', navigate_section: 'Seção', type: 'Digitando', select: 'Selecionando' };
        return (d[a.type] || a.type) + ': ' + (a.text || a.value || a.selector || '').substring(0, 40);
    }

    function highlight(el) {
        var o = el.style.outline, t = el.style.transition;
        el.style.transition = 'outline 0.2s'; el.style.outline = '3px solid #F59E0B';
        setTimeout(function() { el.style.outline = o; el.style.transition = t; }, 800);
    }

    // ========================================================================
    // INDICATOR
    // ========================================================================
    function showIndicator(show, msg) {
        var e = document.getElementById('atom-replay-indicator');
        if (e) e.remove();
        if (!show) return;
        var d = document.createElement('div');
        d.id = 'atom-replay-indicator';
        d.innerHTML = '▶️ ' + (msg || 'Executando...');
        d.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999999;background:rgba(245,158,11,0.95);color:#000;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;max-width:80%;text-align:center;';
        d.addEventListener('click', function() { replaying = false; showIndicator(false); });
        document.body.appendChild(d);
    }

})();

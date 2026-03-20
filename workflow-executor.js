/**
 * WORKFLOW EXECUTOR v4 — TEXT-FIRST finding + Gemini Vision fallback
 * 
 * O problema anterior: seletores genéricos (span:nth-child(2)) achavam
 * o elemento ERRADO e diziam "OK". Agora:
 * 
 * Para navigate_menu/navigate_section → TEXTO PRIMEIRO
 * Para type/click com nthIndex → usa posição entre irmãos
 * Fallback final → Gemini Vision (screenshot + IA)
 * 
 * Também fecha modais que estejam bloqueando.
 */
(function() {
    'use strict';
    var TAG = '[Workflow Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;

    console.log(TAG, 'v4 Carregado (text-first + Gemini Vision)');

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
        showIndicator(true, 'Carregando...');
        console.log(TAG, '▶️ Replay:', sessionId);

        try {
            var resp = await fetch(FIREBASE_BASE + '/atom_recordings/' + sessionId + '.json');
            var rec = await resp.json();
            if (!rec || !rec.actions) {
                console.error(TAG, 'Gravação não encontrada');
                showIndicator(false); replaying = false; return;
            }

            var allActions = rec.actions;

            // Filtra executáveis + remove lixo
            var actions = allActions.filter(function(a) {
                if (a.type !== 'click' && a.type !== 'type' && a.type !== 'select' &&
                    a.type !== 'navigate_menu' && a.type !== 'navigate_section') return false;
                if (a.id && a.id.indexOf('atom-') === 0) return false;
                if (a.selector && a.selector.indexOf('#atom-') === 0) return false;
                if (a.text && (a.text.indexOf('PARAR') >= 0 || a.text.indexOf('⏹') >= 0)) return false;
                if (a.selector && a.selector.indexOf(':nth-child') >= 0 && !a.text && !a.id && !a.label) return false;
                return true;
            });

            // Label
            var label = '';
            for (var k = 0; k < allActions.length; k++) {
                if (allActions[k].type === 'session_start' && allActions[k].label) {
                    label = allActions[k].label; break;
                }
            }

            totalSteps = actions.length;
            console.log(TAG, 'Gravação:', label || sessionId, '|', totalSteps, 'passos');

            // Fecha modais que possam estar bloqueando
            await dismissModals();

            for (var i = 0; i < actions.length; i++) {
                if (!replaying) break;

                currentStep = i + 1;
                var action = applyParams(actions[i], params, i, actions);
                var desc = describeAction(action);
                showIndicator(true, 'Passo ' + currentStep + '/' + totalSteps + ': ' + desc);
                console.log(TAG, '➡️', currentStep + '/' + totalSteps, action.type, '|',
                    action.text || action.value || action.selector, '| nth:', action.nthIndex || 0);

                var result = await smartExecute(action);

                var status = result.ok ? '✅' : '❌';
                console.log(TAG, status, 'Passo', currentStep, 'via', result.method);

                if (!result.ok) {
                    showIndicator(true, '❌ Passo ' + currentStep + ' FALHOU: ' + desc);
                    await delay(2000);
                }

                await delay(getDelay(action, i, actions));

                // Fecha modais que apareçam após uma ação
                await dismissModals();
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
    // DISMISS MODALS — Fecha diálogos/modais que bloqueiam
    // ========================================================================
    async function dismissModals() {
        // PrimeNG Dialog close buttons
        var closeBtns = document.querySelectorAll('.ui-dialog-titlebar-close, .p-dialog-header-close, button.close, [aria-label="Close"]');
        for (var i = 0; i < closeBtns.length; i++) {
            if (isVisible(closeBtns[i])) {
                console.log(TAG, '🚪 Fechando modal...');
                closeBtns[i].click();
                await delay(500);
            }
        }
        // Overlay: clica fora pra fechar
        var overlays = document.querySelectorAll('.ui-widget-overlay, .p-dialog-mask, .modal-backdrop');
        for (var j = 0; j < overlays.length; j++) {
            if (isVisible(overlays[j])) {
                overlays[j].click();
                await delay(300);
            }
        }
    }

    // ========================================================================
    // SMART EXECUTE — DOM (text-first) + Gemini Vision fallback
    // ========================================================================
    async function smartExecute(action) {
        // Espera até 10s pelo elemento (polling inteligente)
        var el = await waitForElement(action, 10000);

        if (el) {
            // VERIFICA se o elemento achado faz sentido
            if (action.text && action.text.length > 1) {
                var elText = (el.textContent || el.value || '').trim().toLowerCase();
                var actionText = action.text.trim().toLowerCase();
                if (elText.indexOf(actionText) < 0 && actionText.indexOf(elText) < 0) {
                    console.warn(TAG, '⚠️ Elemento achado mas texto não bate:', elText, '≠', action.text);
                    // Tenta de novo só por texto
                    var byText = findByText(action.text, action.tagName);
                    if (byText) {
                        console.log(TAG, '🔄 Corrigido via texto');
                        el = byText;
                    }
                }
            }
            var ok = await executeOnElement(action, el);
            return { ok: ok, method: 'dom' };
        }

        // GEMINI VISION FALLBACK
        console.log(TAG, '🤖 DOM falhou, ativando Gemini Vision...');
        showIndicator(true, '🤖 Passo ' + currentStep + ': Gemini Vision...');

        try {
            if (typeof VisionAgent === 'undefined') {
                console.warn(TAG, 'VisionAgent não disponível');
                return { ok: false, method: 'no-vision' };
            }
            var desc = buildVisionDescription(action);
            console.log(TAG, '🔭 Gemini:', desc);
            var vr = await VisionAgent.findElement(desc);
            if (vr && vr.found && vr.x && vr.y) {
                console.log(TAG, '🎯 Gemini:', vr.x, vr.y);
                if (action.type === 'type') {
                    await VisionAgent.act({ type: 'click', x: vr.x, y: vr.y });
                    await delay(500);
                    var ae = document.activeElement;
                    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
                        await typeInElement(ae, action.value || '');
                    } else {
                        await VisionAgent.act({ type: 'type', x: vr.x, y: vr.y, text: action.value || '' });
                    }
                } else {
                    await VisionAgent.act({ type: 'click', x: vr.x, y: vr.y });
                }
                return { ok: true, method: 'gemini' };
            }
            return { ok: false, method: 'gemini-notfound' };
        } catch(e) {
            console.error(TAG, 'Gemini erro:', e.message);
            return { ok: false, method: 'gemini-error' };
        }
    }

    function buildVisionDescription(action) {
        var parts = [];
        if (action.text) parts.push('com texto "' + action.text + '"');
        if (action.label) parts.push('com label "' + action.label + '"');
        var types = { click: 'botão/link', navigate_menu: 'item de menu lateral', navigate_section: 'item de árvore/seção', type: 'campo de input', select: 'dropdown' };
        var desc = 'Encontre o ' + (types[action.type] || 'elemento');
        if (parts.length) desc += ' ' + parts.join(' ');
        if (action.type === 'type' && action.value) desc += ' onde digitar "' + action.value.substring(0, 20) + '"';
        return desc;
    }

    // ========================================================================
    // WAIT FOR ELEMENT — Polling inteligente
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
            await delay(attempts < 3 ? 300 : attempts < 6 ? 500 : 800);
        }
        return null;
    }

    // ========================================================================
    // FIND ELEMENT — TEXT FIRST para navegação, SELECTOR para inputs
    // ========================================================================
    function findElement(action) {
        var el;
        var isNav = (action.type === 'navigate_menu' || action.type === 'navigate_section' || action.type === 'click');

        // Para NAVEGAÇÃO: TEXTO PRIMEIRO (mais confiável que seletores genéricos)
        if (isNav && action.text && action.text.length > 1) {
            el = findByText(action.text, action.tagName);
            if (el) return el;
        }

        // Para TYPE: usa nthIndex pra pegar o input certo
        if (action.type === 'type' && action.nthIndex !== undefined && action.selector) {
            try {
                var inputs = document.querySelectorAll(action.selector);
                var visibleInputs = [];
                for (var m = 0; m < inputs.length; m++) {
                    if (isVisible(inputs[m])) visibleInputs.push(inputs[m]);
                }
                if (visibleInputs.length > action.nthIndex) return visibleInputs[action.nthIndex];
                if (visibleInputs.length > 0) return visibleInputs[0];
            } catch(e) {}
        }

        // Selector direto (com validação)
        if (action.selector) {
            try {
                el = document.querySelector(action.selector);
                if (el && isVisible(el)) return el;
            } catch(e) {}
        }

        // ID
        if (action.id && action.id.length > 0) {
            el = document.getElementById(action.id);
            if (el && isVisible(el)) return el;
        }

        // Texto (pra ações que não são nav — já tentou acima)
        if (!isNav && action.text && action.text.length > 1) {
            el = findByText(action.text, action.tagName);
            if (el) return el;
        }

        // Label
        if (action.label && action.label.length > 1) {
            el = findByText(action.label);
            if (el) return el;
        }

        // Section name
        if (action.sectionName) {
            el = findByText(action.sectionName);
            if (el) return el;
        }

        return null;
    }

    function findByText(text, tagName) {
        if (!text || text.length < 2) return null;
        var search = text.trim().toLowerCase();
        var tags = tagName ? [tagName.toUpperCase()] : ['SPAN', 'A', 'BUTTON', 'LI', 'DIV', 'TD', 'LABEL'];

        // Match exato
        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                // Pega texto DIRETO do elemento (não dos filhos) pra evitar match com container
                var directText = getDirectText(els[i]).toLowerCase();
                if (directText === search && isVisible(els[i])) return els[i];
            }
        }

        // Match textContent completo
        for (var t2 = 0; t2 < tags.length; t2++) {
            var els2 = document.querySelectorAll(tags[t2]);
            for (var j = 0; j < els2.length; j++) {
                var fullText = (els2[j].textContent || '').trim().toLowerCase();
                if (fullText === search && isVisible(els2[j])) return els2[j];
            }
        }

        // Match parcial (contém, mas não é longo demais)
        for (var t3 = 0; t3 < tags.length; t3++) {
            var els3 = document.querySelectorAll(tags[t3]);
            for (var k = 0; k < els3.length; k++) {
                var tx = (els3[k].textContent || '').trim().toLowerCase();
                if (tx.indexOf(search) >= 0 && tx.length < search.length * 2.5 && isVisible(els3[k])) {
                    return els3[k];
                }
            }
        }

        return null;
    }

    // Pega texto diretamente do nó (sem filhos) — mais preciso
    function getDirectText(el) {
        var text = '';
        for (var n = 0; n < el.childNodes.length; n++) {
            if (el.childNodes[n].nodeType === 3) { // TEXT_NODE
                text += el.childNodes[n].textContent;
            }
        }
        return text.trim();
    }

    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
        try { var s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; } catch(e) {}
        return false;
    }

    // ========================================================================
    // EXECUTE ON ELEMENT
    // ========================================================================
    async function executeOnElement(action, el) {
        switch (action.type) {
            case 'click':
            case 'navigate_menu':
            case 'navigate_section':
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);
                highlight(el);
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

            default: return false;
        }
    }

    async function typeInElement(el, value) {
        el.focus();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        await delay(100);
        el.select && el.select();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(100);
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
                return 3000;
            case 'type': return 500;
            case 'click': return 1500;
            default: return 1000;
        }
    }

    function describeAction(a) {
        var d = { click: 'Click', navigate_menu: 'Menu', navigate_section: 'Seção', type: 'Digitando', select: 'Select' };
        return (d[a.type] || a.type) + ': ' + (a.text || a.value || a.selector || '').substring(0, 40);
    }

    function highlight(el) {
        var o = el.style.outline, t = el.style.transition;
        el.style.transition = 'outline 0.2s'; el.style.outline = '3px solid #F59E0B';
        setTimeout(function() { el.style.outline = o; el.style.transition = t; }, 800);
    }

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

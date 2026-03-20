/**
 * WORKFLOW EXECUTOR v7 — Verified Navigation + Full-Element Search
 *
 * Gravação = INTENÇÃO. Executor = AGENTE INTELIGENTE.
 *
 * Para navegação:
 *   1. Agrupa nav consecutivos em PATH
 *   2. Para cada item: busca em TODOS os tipos de elemento (a, td, span, li...)
 *   3. Após click: VERIFICA se próximo item ficou visível
 *   4. Se não: retry com estratégias diferentes
 *
 * Para inputs:
 *   1. Selector + nthIndex → campo correto
 *   2. Char-by-char pra calendars PrimeNG
 *
 * Para botões:
 *   1. Radar → texto → selector
 */
(function() {
    'use strict';
    var TAG = '[Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;
    var _visionCalls = 0;
    var MAX_VISION_CALLS = 2; // Limite de chamadas Vision por workflow (custo API)
    var _consecutiveFails = 0;
    var MAX_CONSECUTIVE_FAILS = 2; // Aborta se 2 steps falharem seguidos

    console.log(TAG, 'v7 Carregado (verified navigation)');

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
    // START
    // ========================================================================
    async function startReplay(sessionId, params) {
        replaying = true;
        currentStep = 0;
        _visionCalls = 0;
        _consecutiveFails = 0;
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
            var label = getLabel(rec.actions);
            totalSteps = actions.length;
            console.log(TAG, 'Gravação:', label, '|', totalSteps, 'passos');

            // Escape pra fechar modais
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await delay(500);

            // Agrupa em plano de alto nível
            var plan = buildPlan(actions, params);
            console.log(TAG, '📋 Plano:', plan.length, 'tarefas');

            for (var t = 0; t < plan.length; t++) {
                if (!replaying) break;
                var task = plan[t];

                if (task.type === 'nav_path') {
                    await executeNavPath(task.steps);
                } else if (task.type === 'fill') {
                    currentStep = task.stepNum;
                    showIndicator(true, currentStep + '/' + totalSteps + ': ' + task.value);
                    console.log(TAG, '➡️', currentStep + '/' + totalSteps, 'type |', task.value);
                    var fillOk = await executeFill(task);
                    console.log(TAG, fillOk ? '✅' : '❌', currentStep);
                    if (!fillOk) { showIndicator(true, '❌ ' + currentStep); await delay(2000); }
                    await delay(400);
                } else if (task.type === 'click') {
                    currentStep = task.stepNum;
                    showIndicator(true, currentStep + '/' + totalSteps + ': ' + (task.text || task.selector));
                    console.log(TAG, '➡️', currentStep + '/' + totalSteps, 'click |', task.text || task.selector);
                    var clickOk = await executeGenericClick(task);
                    console.log(TAG, clickOk ? '✅' : '❌', currentStep);
                    if (!clickOk) { showIndicator(true, '❌ ' + currentStep); await delay(2000); }
                    await delay(1000);
                } else if (task.type === 'action') {
                    currentStep = task.stepNum;
                    showIndicator(true, currentStep + '/' + totalSteps + ': ' + task.text);
                    console.log(TAG, '➡️', currentStep + '/' + totalSteps, 'action |', task.text);
                    var actOk = await executeActionButton(task);
                    console.log(TAG, actOk ? '✅' : '❌', currentStep);
                    if (!actOk) { showIndicator(true, '❌ ' + currentStep); await delay(2000); }
                    await delay(1000);
                }
            }

            showIndicator(true, '✅ Concluído!');
            console.log(TAG, '✅ CONCLUÍDO');
            setTimeout(function() { showIndicator(false); replaying = false; }, 3000);

        } catch(e) {
            console.error(TAG, 'Erro:', e);
            showIndicator(false); replaying = false;
        }
    }

    // ========================================================================
    // BUILD PLAN — Agrupa ações em tarefas de alto nível
    // ========================================================================
    function buildPlan(actions, params) {
        var plan = [];
        var i = 0;

        while (i < actions.length) {
            var a = actions[i];

            // Agrupa nav consecutivos em PATH
            if (a.type === 'navigate_menu' || a.type === 'navigate_section') {
                var path = [];
                while (i < actions.length && (actions[i].type === 'navigate_menu' || actions[i].type === 'navigate_section')) {
                    path.push({ text: actions[i].text, selector: actions[i].selector, stepNum: i + 1, action: actions[i] });
                    i++;
                }
                plan.push({ type: 'nav_path', steps: path });
                continue;
            }

            // Click em input (precede type — foca o campo)
            if (a.type === 'click' && i + 1 < actions.length && actions[i + 1].type === 'type') {
                // O click foca, o type preenche — combina em fill
                var typeAction = applyParams(actions[i + 1], params, i + 1, actions);
                plan.push({
                    type: 'fill',
                    clickSelector: a.selector,
                    selector: typeAction.selector,
                    value: (typeAction.value || '').trim(),
                    nthIndex: typeAction.nthIndex,
                    label: typeAction.label,
                    fieldName: typeAction.fieldName,
                    stepNum: i + 2 // step number do type
                });
                i += 2;
                continue;
            }

            // Type solo (sem click prévio)
            if (a.type === 'type') {
                var ta = applyParams(a, params, i, actions);
                plan.push({
                    type: 'fill',
                    selector: ta.selector,
                    value: (ta.value || '').trim(),
                    nthIndex: ta.nthIndex,
                    label: ta.label,
                    fieldName: ta.fieldName,
                    stepNum: i + 1
                });
                i++;
                continue;
            }

            // Click genérico (botão, link, etc)
            plan.push({
                type: a.text && a.text.length > 1 ? 'action' : 'click',
                text: a.text,
                selector: a.selector,
                id: a.id,
                tagName: a.tagName,
                stepNum: i + 1,
                action: a
            });
            i++;
        }

        return plan;
    }

    // ========================================================================
    // EXECUTE NAV PATH — Navega menu com verificação
    // ========================================================================
    async function executeNavPath(path) {
        console.log(TAG, '🧭 Nav path:', path.map(function(p) { return p.text || p.selector; }).join(' → '));

        for (var i = 0; i < path.length; i++) {
            if (!replaying) break;
            var step = path[i];
            var nextStep = path[i + 1];
            currentStep = step.stepNum;

            var desc = step.text || step.selector || '';
            showIndicator(true, currentStep + '/' + totalSteps + ': ' + desc);
            console.log(TAG, '➡️', currentStep + '/' + totalSteps, 'nav |', desc);

            var clicked = false;
            var retries = 0;
            var maxRetries = 3;

            while (!clicked && retries < maxRetries) {
                retries++;
                // Encontra o elemento
                var el = await findAnyElement(step.text, step.selector, 8000);

                if (!el) {
                    console.warn(TAG, '⚠️ Não achei:', desc, '(tentativa', retries + ')');
                    await delay(1500);
                    continue;
                }

                // Clica DIRETO no elemento — .click() borbulha naturalmente pro pai
                // NÃO sobe pra ancestral (ia pro <a> errado)
                console.log(TAG, '🖱️ Clicando:', el.tagName,
                    'id=' + (el.id || 'sem'),
                    'text=' + (el.textContent || '').trim().substring(0, 25));

                highlight(el);
                el.click();
                await delay(300);

                // Espera DOM mudar
                await waitForMutation(2000);

                // VERIFICAÇÃO: próximo item do path está visível?
                if (nextStep && nextStep.text) {
                    var nextVisible = isTextVisible(nextStep.text);
                    if (nextVisible) {
                        console.log(TAG, '✅', currentStep, '| Verificado:', nextStep.text, 'visível');
                        clicked = true;
                    } else {
                        console.warn(TAG, '⚠️ Click ok mas', nextStep.text, 'não apareceu (retry', retries + ')');
                        await delay(1000);
                        // Retry: tenta ancestrais diferentes
                        var tryTargets = [
                            el.closest('a'),
                            el.closest('td'),
                            el.closest('tr'),
                            el.closest('li'),
                            el.parentElement
                        ];
                        // PrimeNG tree: tenta clicar no toggler
                        var toggler = el.closest('li') ? el.closest('li').querySelector('.ui-tree-toggler, .ui-treenode-icon, .p-tree-toggler') : null;
                        if (toggler) tryTargets.unshift(toggler);
                        var content = el.closest('.ui-treenode-content, .p-treenode-content');
                        if (content) tryTargets.unshift(content);
                        for (var rt = 0; rt < tryTargets.length; rt++) {
                            var tt = tryTargets[rt];
                            if (!tt || !isVisible(tt)) continue;
                            console.log(TAG, '🔄 Retry click em', tt.tagName, 'id=' + (tt.id || 'sem'));
                            tt.click();
                            await waitForMutation(2000);
                            if (isTextVisible(nextStep.text)) {
                                console.log(TAG, '✅', currentStep, '| Expandiu via', tt.tagName);
                                clicked = true;
                                break;
                            }
                        }
                    }
                } else {
                    // Último item do path ou sem verificação
                    console.log(TAG, '✅', currentStep);
                    clicked = true;
                }
            }

            if (!clicked) {
                console.error(TAG, '❌', currentStep, 'FALHOU após', maxRetries, 'tentativas');
                // Tenta Gemini Vision como último recurso
                if (typeof VisionAgent !== 'undefined' && _visionCalls < MAX_VISION_CALLS) {
                    _visionCalls++;
                    console.log(TAG, '🤖 Gemini Vision fallback (' + _visionCalls + '/' + MAX_VISION_CALLS + ')...');
                    try {
                        var vr = await VisionAgent.findElement('Encontre o item de menu "' + desc + '" na tela');
                        if (vr && vr.found && vr.x && vr.y) {
                            await VisionAgent.act({ type: 'click', x: vr.x, y: vr.y });
                            await waitForMutation(2000);
                            console.log(TAG, '✅ Gemini clickou:', desc);
                        }
                    } catch(e) { console.error(TAG, 'Gemini erro:', e.message); }
                }
            }

            // Delay entre nav steps
            await delay(1200);
        }
    }

    // ========================================================================
    // FIND ANY ELEMENT — Busca em TODOS os tipos (a, td, span, li, div...)
    // ========================================================================
    async function findAnyElement(text, selector, timeoutMs) {
        var start = Date.now();
        while (Date.now() - start < timeoutMs) {
            var el;

            // 1. Selector direto — mas VALIDA texto (td.undefined pega qualquer td)
            if (selector) {
                try {
                    el = document.querySelector(selector);
                    if (el && isVisible(el)) {
                        // Se tem texto esperado, verifica se bate
                        if (text && text.length > 1) {
                            var selText = (el.textContent || '').trim().toLowerCase();
                            var searchText = text.trim().toLowerCase();
                            if (selText === searchText || selText.indexOf(searchText) >= 0) {
                                return el;
                            }
                            // Texto não bate — selector genérico, ignora
                            console.log(TAG, '⚠️ Selector achou', selText.substring(0, 20), 'mas buscava', searchText.substring(0, 20));
                        } else {
                            return el;
                        }
                    }
                } catch(e) {}
            }

            // 2. getElementById (pra items com ID)
            if (text) {
                el = document.getElementById(text);
                if (el && isVisible(el)) return el;
            }

            // 3. Texto em QUALQUER elemento visível (pra td/span sem ID)
            if (text && text.length > 1) {
                el = findByTextUniversal(text);
                if (el) return el;
            }

            await delay(500);
        }
        return null;
    }

    // Busca texto em absolutamente qualquer elemento visível
    function findByTextUniversal(text) {
        var search = text.trim().toLowerCase();
        var tags = ['A', 'SPAN', 'TD', 'LI', 'BUTTON', 'DIV', 'LABEL'];
        var best = null;
        var bestLen = Infinity;

        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                if (!isVisible(els[i])) continue;
                // Skip nossos próprios elementos
                if (els[i].closest('#atom-widget, #atom-replay-indicator, #atom-modal-overlay, #atom-rec-button, #atom-play-button')) continue;
                var et = (els[i].textContent || '').trim().toLowerCase();

                // Match exato — pega o MENOR (mais específico)
                if (et === search && et.length < bestLen) {
                    best = els[i];
                    bestLen = et.length;
                }
            }
        }
        if (best) return best;

        // Match parcial (contains, mas curto)
        for (var t2 = 0; t2 < tags.length; t2++) {
            var els2 = document.querySelectorAll(tags[t2]);
            for (var j = 0; j < els2.length; j++) {
                if (!isVisible(els2[j])) continue;
                if (els2[j].closest('#atom-widget, #atom-replay-indicator, #atom-modal-overlay, #atom-rec-button, #atom-play-button')) continue;
                var et2 = (els2[j].textContent || '').trim().toLowerCase();
                if (et2.indexOf(search) >= 0 && et2.length < search.length * 2) {
                    return els2[j];
                }
            }
        }
        return null;
    }

    // Sobe de SPAN/TD para o ancestral clicável mais próximo
    function getClickableAncestor(el) {
        if (!el) return el;
        var tag = el.tagName;
        // Se já é A ou BUTTON, usa direto
        if (tag === 'A' || tag === 'BUTTON') return el;
        // Sobe pro link/button pai
        var parent = el.closest('a, button, [role="menuitem"], [role="treeitem"]');
        if (parent) return parent;
        // Se é TD, pode ter um link dentro
        if (tag === 'TD') {
            var innerLink = el.querySelector('a, button');
            if (innerLink) return innerLink;
        }
        // Caso contrário, retorna o próprio (vai tentar .click() nele)
        return el;
    }

    // Verifica se um texto está visível na página
    function isTextVisible(text) {
        var search = text.trim().toLowerCase();
        var all = document.querySelectorAll('a, span, td, li, button, div, label');
        for (var i = 0; i < all.length; i++) {
            var et = (all[i].textContent || '').trim().toLowerCase();
            if (et === search && isVisible(all[i])) return true;
        }
        return false;
    }

    // ========================================================================
    // EXECUTE FILL — Preenche um campo
    // ========================================================================
    async function executeFill(task) {
        if (!task.value) return false;

        // Primeiro clica no campo (se tem clickSelector)
        if (task.clickSelector) {
            try {
                var clickInputs = document.querySelectorAll(task.clickSelector);
                var visible = [];
                for (var c = 0; c < clickInputs.length; c++) {
                    if (isVisible(clickInputs[c])) visible.push(clickInputs[c]);
                }
                // Usa nthIndex pra pegar o certo
                var idx = task.nthIndex || 0;
                if (idx > 0 && idx >= visible.length) idx = idx - 1;
                if (visible.length > idx) {
                    visible[idx].click();
                    visible[idx].focus();
                    await delay(300);
                }
            } catch(e) {}
        }

        // Encontra o input
        var el = findInput(task);
        if (!el) {
            console.warn(TAG, '⚠️ Input não encontrado:', task.selector, 'nth:', task.nthIndex);
            return false;
        }

        highlight(el);

        // Calendar detection
        var isCalendar = el.closest('.ui-calendar, .p-calendar') ||
                         /\d{2}\/\d{2}\/\d{4}/.test(task.value);

        if (isCalendar) {
            await typeCharByChar(el, task.value);
        } else {
            await typeNative(el, task.value);
        }

        return true;
    }

    function findInput(task) {
        if (!task.selector) return null;
        try {
            var all = document.querySelectorAll(task.selector);
            var visible = [];
            for (var i = 0; i < all.length; i++) {
                if (isVisible(all[i])) visible.push(all[i]);
            }
            var idx = task.nthIndex || 0;
            if (idx >= visible.length && idx > 0) idx = idx - 1;
            if (visible.length > idx && idx >= 0) return visible[idx];
            if (visible.length > 0) return visible[0];
        } catch(e) {}
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

    async function typeNative(el, value) {
        el.focus();
        await delay(100);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // ========================================================================
    // EXECUTE GENERIC CLICK — Click em elemento qualquer
    // ========================================================================
    async function executeGenericClick(task) {
        var el = await findAnyElement(task.text, task.selector, 8000);
        if (!el) return false;
        var clickTarget = getClickableAncestor(el);
        highlight(clickTarget);
        clickTarget.click();
        return true;
    }

    // ========================================================================
    // EXECUTE ACTION BUTTON — Botão de ação (Solicitar, Salvar, etc)
    // ========================================================================
    async function executeActionButton(task) {
        var el = null;
        var start = Date.now();
        while (Date.now() - start < 10000) {
            // Radar
            try {
                if (typeof window.__atomSiteScan === 'function') {
                    var scan = window.__atomSiteScan();
                    if (scan && scan.buttons) {
                        var search = (task.text || '').toLowerCase().trim();
                        for (var b = 0; b < scan.buttons.length; b++) {
                            var bt = (scan.buttons[b].text || '').toLowerCase().trim();
                            if (bt.indexOf(search) >= 0 && scan.buttons[b].selector) {
                                try { el = document.querySelector(scan.buttons[b].selector); } catch(e) {}
                                if (el && isVisible(el)) break;
                                el = null;
                            }
                        }
                    }
                }
            } catch(e) {}

            // Selector direto
            if (!el && task.selector) {
                try { el = document.querySelector(task.selector); } catch(e) {}
                if (el && isVisible(el)) { el = getClickableAncestor(el); break; }
                el = null;
            }

            // Texto universal
            if (!el && task.text) {
                el = findByTextUniversal(task.text);
                if (el) { el = getClickableAncestor(el); break; }
            }

            await delay(500);
        }

        if (el) {
            highlight(el);
            el.click();
            return true;
        }

        // Gemini Vision
        if (typeof VisionAgent !== 'undefined' && task.text) {
            try {
                var vr = await VisionAgent.findElement('Encontre o botão "' + task.text + '"');
                if (vr && vr.found && vr.x && vr.y) {
                    await VisionAgent.act({ type: 'click', x: vr.x, y: vr.y });
                    return true;
                }
            } catch(e) {}
        }

        return false;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================
    function isExecutable(a) {
        if (['click', 'type', 'select', 'navigate_menu', 'navigate_section'].indexOf(a.type) < 0) return false;
        if (a.id && a.id.indexOf('atom-') === 0) return false;
        if (a.selector && a.selector.indexOf('#atom-') === 0) return false;
        if (a.text && a.text.indexOf('PARAR') >= 0) return false;
        return true;
    }

    function getLabel(allActions) {
        for (var k = 0; k < allActions.length; k++) {
            if (allActions[k].type === 'session_start' && allActions[k].label) return allActions[k].label;
        }
        return '';
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

    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
        try { var s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; } catch(e) {}
        return false;
    }

    function waitForMutation(timeoutMs) {
        return new Promise(function(resolve) {
            var done = false;
            var obs = new MutationObserver(function(muts) {
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].addedNodes.length > 0 || muts[i].removedNodes.length > 0) {
                        if (!done) { done = true; obs.disconnect(); setTimeout(resolve, 500); }
                        return;
                    }
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(function() { if (!done) { done = true; obs.disconnect(); resolve(); } }, timeoutMs);
        });
    }

    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
    function highlight(el) {
        if (!el || !el.style) return;
        var o = el.style.outline; el.style.outline = '3px solid #F59E0B';
        setTimeout(function() { el.style.outline = o; }, 800);
    }

    var _execStarted = false;

    function showIndicator(show, msg) {
        var e = document.getElementById('atom-replay-indicator');
        if (e) e.remove();
        // Dispatch events para o ATOM Learn panel
        if (show) {
            if (!_execStarted) {
                _execStarted = true;
                document.dispatchEvent(new CustomEvent('atom-exec-start'));
            }
            if (msg) {
                var stepMatch = msg.match(/^(\d+)\/(\d+)/);
                if (stepMatch) {
                    document.dispatchEvent(new CustomEvent('atom-exec-step', { detail: { current: parseInt(stepMatch[1]), total: parseInt(stepMatch[2]), text: msg } }));
                }
                if (msg.indexOf('✅ Concluído') >= 0) {
                    document.dispatchEvent(new CustomEvent('atom-exec-done'));
                    _execStarted = false;
                }
            }
        } else {
            _execStarted = false;
        }
        if (!show) return;
        var d = document.createElement('div');
        d.id = 'atom-replay-indicator';
        d.textContent = '▶ ' + (msg || 'Executando...');
        d.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999999;' +
            'background:rgba(9,12,20,0.95);color:#F59E0B;padding:10px 24px;border-radius:20px;' +
            'font-size:12px;font-weight:600;font-family:Oswald,DM Sans,Arial;box-shadow:0 4px 12px rgba(0,0,0,0.5);' +
            'border:1px solid rgba(245,158,11,0.2);cursor:pointer;max-width:80%;text-align:center;letter-spacing:0.05em;';
        d.onclick = function() { replaying = false; showIndicator(false); };
        document.body.appendChild(d);
    }
})();

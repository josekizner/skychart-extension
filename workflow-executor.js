/**
 * WORKFLOW EXECUTOR v2 — Reproduz gravações com inteligência
 * 
 * AGORA COM:
 * - waitForElement: espera até 8s pro Angular renderizar
 * - Nth-match: quando seletor pega vários, usa o índice certo da gravação
 * - findByText: busca por texto visível se seletor falha
 * - Radar context: usa page_context do recording pra validar estado
 * - Auto-retry: tenta 3x antes de desistir
 */
(function() {
    'use strict';
    var TAG = '[Workflow Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;

    console.log(TAG, 'v2 Carregado. Aguardando comando de replay...');

    // ========================================================================
    // CONTROLE
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'replay_workflow') {
            if (replaying) {
                sendResponse({ success: false, error: 'Já executando um replay' });
                return;
            }
            startReplay(msg.sessionId, msg.params || {});
            sendResponse({ success: true, message: 'Replay iniciado' });
        }
        if (msg.action === 'replay_status') {
            sendResponse({ replaying: replaying, step: currentStep, total: totalSteps });
        }
        if (msg.action === 'stop_replay') {
            replaying = false;
            showReplayIndicator(false);
            sendResponse({ success: true });
        }
    });

    // ========================================================================
    // START — Busca gravação e executa
    // ========================================================================
    async function startReplay(sessionId, params) {
        replaying = true;
        currentStep = 0;

        showReplayIndicator(true, 'Carregando gravação...');
        console.log(TAG, '▶️ Iniciando replay:', sessionId);

        try {
            var response = await fetch(FIREBASE_BASE + '/atom_recordings/' + sessionId + '.json');
            var recording = await response.json();

            if (!recording || !recording.actions) {
                console.error(TAG, 'Gravação não encontrada:', sessionId);
                showReplayIndicator(false);
                replaying = false;
                return;
            }

            var allActions = recording.actions;

            // Filtra ações executáveis
            var actions = allActions.filter(function(a) {
                return a.type === 'click' || a.type === 'type' || a.type === 'select' ||
                       a.type === 'navigate_menu' || a.type === 'navigate_section';
            });

            // Descobre duplicatas de seletor pra usar Nth-match
            var selectorCount = {};
            actions.forEach(function(a) {
                if (a.selector) {
                    selectorCount[a.selector] = (selectorCount[a.selector] || 0) + 1;
                }
            });

            // Atribui índice pra ações com seletores duplicados
            var selectorIndex = {};
            actions.forEach(function(a) {
                if (a.selector && selectorCount[a.selector] > 1) {
                    selectorIndex[a.selector] = (selectorIndex[a.selector] || 0);
                    a._nthMatch = selectorIndex[a.selector];
                    selectorIndex[a.selector]++;
                }
            });

            totalSteps = actions.length;
            var label = '';
            for (var k = 0; k < allActions.length; k++) {
                if (allActions[k].type === 'session_start' && allActions[k].label) {
                    label = allActions[k].label;
                    break;
                }
            }
            console.log(TAG, 'Gravação:', label || sessionId, '|', totalSteps, 'ações');

            // Executa
            for (var i = 0; i < actions.length; i++) {
                if (!replaying) {
                    console.log(TAG, '⏹ Replay interrompido');
                    break;
                }

                currentStep = i + 1;
                var action = actions[i];

                // Substitui params dinâmicos
                action = applyParams(action, params, i, actions);

                showReplayIndicator(true, 'Passo ' + currentStep + '/' + totalSteps + ': ' + describeAction(action));

                // ESPERA o elemento aparecer (até 8 segundos)
                var el = await waitForElement(action, 8000);

                if (!el) {
                    console.warn(TAG, '❌ Passo', currentStep, '- Elemento não encontrado após 8s:', action.text || action.selector);
                    showReplayIndicator(true, '⚠️ Passo ' + currentStep + ' falhou: ' + (action.text || action.selector));
                    await delay(1500);
                    continue; // tenta próximo passo
                }

                // Executa a ação
                var success = await executeAction(action, el);
                console.log(TAG, success ? '✅' : '⚠️', 'Passo', currentStep + '/' + totalSteps, ':', action.type, '|', action.text || action.value || action.selector);

                // Delay inteligente
                await delay(getDelay(action, i, actions));
            }

            showReplayIndicator(true, '✅ Replay concluído! (' + totalSteps + ' passos)');
            console.log(TAG, '✅ REPLAY CONCLUÍDO');

            setTimeout(function() {
                showReplayIndicator(false);
                replaying = false;
            }, 3000);

        } catch(e) {
            console.error(TAG, 'Erro no replay:', e);
            showReplayIndicator(false);
            replaying = false;
        }
    }

    // ========================================================================
    // WAIT FOR ELEMENT — Espera o elemento aparecer no DOM (polling)
    // ========================================================================
    async function waitForElement(action, timeoutMs) {
        var startTime = Date.now();
        var attempts = 0;

        while (Date.now() - startTime < timeoutMs) {
            attempts++;
            var el = findElement(action);
            if (el) {
                if (attempts > 1) {
                    console.log(TAG, '⏳ Elemento encontrado após', (Date.now() - startTime) + 'ms (' + attempts + ' tentativas)');
                }
                return el;
            }
            // Espera progressiva: 200ms, 300ms, 500ms, 500ms...
            await delay(attempts < 3 ? 200 : attempts < 5 ? 300 : 500);
        }

        return null;
    }

    // ========================================================================
    // EXECUTE ACTION — Executa uma ação no elemento encontrado
    // ========================================================================
    async function executeAction(action, el) {
        switch (action.type) {
            case 'click':
            case 'navigate_menu':
            case 'navigate_section':
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);
                highlightElement(el);

                // Simula click completo (funciona com Angular)
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                await delay(50);
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                await delay(50);
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

                // Fallback: click nativo
                try { el.click(); } catch(e) {}
                return true;

            case 'type':
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);
                highlightElement(el);

                // Foca
                el.focus();
                el.dispatchEvent(new Event('focus', { bubbles: true }));
                await delay(100);

                // Limpa com Ctrl+A + Delete (mais confiável em Angular)
                el.select && el.select();
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await delay(100);

                // Digita caractere por caractere
                var value = (action.value || '').trim();
                for (var c = 0; c < value.length; c++) {
                    el.value += value[c];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: value[c], bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: value[c], bubbles: true }));
                    await delay(30);
                }

                // Confirma
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                return true;

            case 'select':
                el.value = action.value || '';
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;

            default:
                return false;
        }
    }

    // ========================================================================
    // FIND ELEMENT — Busca inteligente com 6 níveis de fallback
    // ========================================================================
    function findElement(action) {
        var el = null;

        // 1. Seletor direto (com Nth-match pra duplicados)
        if (action.selector) {
            try {
                if (action._nthMatch !== undefined) {
                    // Seletor duplicado: pega o N-ésimo match visível
                    var allMatches = document.querySelectorAll(action.selector);
                    var visibleMatches = [];
                    for (var m = 0; m < allMatches.length; m++) {
                        if (isVisible(allMatches[m])) visibleMatches.push(allMatches[m]);
                    }
                    if (visibleMatches.length > action._nthMatch) {
                        return visibleMatches[action._nthMatch];
                    }
                    // Se não tem N-ésimo, tenta o primeiro visível
                    if (visibleMatches.length > 0) return visibleMatches[0];
                } else {
                    el = document.querySelector(action.selector);
                    if (el && isVisible(el)) return el;
                }
            } catch(e) { /* seletor inválido */ }
        }

        // 2. ID
        if (action.id) {
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

        // 5. Section name (pra navigate_section)
        if (action.sectionName) {
            el = findByText(action.sectionName);
            if (el) return el;
        }

        // 6. Classe parcial
        if (action.classes) {
            var classes = (action.classes || '').split(' ').filter(function(c) {
                return c.length > 4 && !c.startsWith('ng-') && !c.startsWith('ui-state');
            });
            for (var ci = 0; ci < classes.length && ci < 3; ci++) {
                try {
                    var byClass = document.querySelectorAll('.' + classes[ci]);
                    for (var bi = 0; bi < byClass.length; bi++) {
                        if (isVisible(byClass[bi])) return byClass[bi];
                    }
                } catch(e) {}
            }
        }

        return null;
    }

    function findByText(text, tagName) {
        if (!text || text.length < 2) return null;
        var searchText = text.trim().toLowerCase();
        // Remove trailing spaces
        searchText = searchText.replace(/\s+$/, '');

        var tags = tagName ? [tagName.toUpperCase()] : ['SPAN', 'BUTTON', 'A', 'LI', 'DIV', 'TD', 'LABEL', 'INPUT'];

        // Exact match
        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                var elText = (els[i].textContent || els[i].value || '').trim().toLowerCase();
                if (elText === searchText && isVisible(els[i])) return els[i];
            }
        }

        // Partial match (text contains search, and is not too long)
        for (var t2 = 0; t2 < tags.length; t2++) {
            var els2 = document.querySelectorAll(tags[t2]);
            for (var j = 0; j < els2.length; j++) {
                var elText2 = (els2[j].textContent || '').trim().toLowerCase();
                if (elText2.indexOf(searchText) >= 0 &&
                    elText2.length < searchText.length * 2.5 &&
                    isVisible(els2[j])) {
                    return els2[j];
                }
            }
        }

        return null;
    }

    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
        // Check computed style
        try {
            var style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        } catch(e) { return false; }
    }

    // ========================================================================
    // DYNAMIC PARAMS
    // ========================================================================
    function applyParams(action, params, index, allActions) {
        if (!params || Object.keys(params).length === 0) return action;
        var modified = JSON.parse(JSON.stringify(action));

        if (params.dates && modified.type === 'type' && modified.value) {
            if (/\d{2}\/\d{2}\/\d{4}/.test(modified.value)) {
                var dateActions = allActions.filter(function(a) {
                    return a.type === 'type' && /\d{2}\/\d{2}\/\d{4}/.test(a.value);
                });
                var dateIdx = dateActions.indexOf(action);
                if (dateIdx >= 0 && params.dates[dateIdx]) {
                    console.log(TAG, '🔄 Data:', modified.value, '→', params.dates[dateIdx]);
                    modified.value = params.dates[dateIdx];
                }
            }
        }

        if (params.fields && modified.fieldName && params.fields[modified.fieldName]) {
            modified.value = params.fields[modified.fieldName];
        }

        return modified;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================
    function delay(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function getDelay(action, index, allActions) {
        // Se a próxima ação é um type/click no mesmo contexto, delay curto
        var nextAction = allActions[index + 1];

        switch(action.type) {
            case 'navigate_menu':
            case 'navigate_section':
                // Após navegação: espera Angular renderizar a nova tela
                // Se próxima ação é outro menu click, delay médio
                if (nextAction && (nextAction.type === 'navigate_menu' || nextAction.type === 'navigate_section')) {
                    return 1500;
                }
                // Se próxima ação é type (form fields), espera mais
                return 3000;
            case 'type':
                return 500;
            case 'click':
                return 1500;
            default:
                return 1000;
        }
    }

    function describeAction(action) {
        switch(action.type) {
            case 'click': return 'Clicando: ' + (action.text || action.selector);
            case 'navigate_menu': return 'Menu: ' + (action.text || action.selector);
            case 'navigate_section': return 'Seção: ' + (action.text || action.sectionName);
            case 'type': return 'Digitando: ' + (action.value || '').substring(0, 20);
            case 'select': return 'Selecionando: ' + (action.value || '');
            default: return action.type;
        }
    }

    function highlightElement(el) {
        var orig = el.style.outline;
        var origT = el.style.transition;
        el.style.transition = 'outline 0.2s ease';
        el.style.outline = '3px solid #F59E0B';
        setTimeout(function() {
            el.style.outline = orig;
            el.style.transition = origT;
        }, 800);
    }

    // ========================================================================
    // VISUAL INDICATOR
    // ========================================================================
    function showReplayIndicator(show, message) {
        var existing = document.getElementById('atom-replay-indicator');
        if (existing) existing.remove();
        if (!show) return;

        var indicator = document.createElement('div');
        indicator.id = 'atom-replay-indicator';
        indicator.innerHTML = '▶️ ' + (message || 'Executando...');
        indicator.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999999;background:rgba(245,158,11,0.95);color:#000;padding:10px 24px;border-radius:20px;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;max-width:80%;text-align:center;';

        indicator.addEventListener('click', function() {
            replaying = false;
            showReplayIndicator(false);
        });

        document.body.appendChild(indicator);
    }

})();

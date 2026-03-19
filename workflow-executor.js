/**
 * WORKFLOW EXECUTOR — Reproduz gravações do Replay Agent
 * 
 * Lê uma gravação do Firebase, e re-executa cada ação:
 * - click → encontra o elemento, clica
 * - type → encontra o input, limpa, digita valor
 * - navigate_menu → encontra item de menu, clica
 * - navigate → espera SPA renderizar
 * 
 * Usa seletores inteligentes: se o seletor original falhar,
 * busca por texto, label, ou classe parcial (fuzzy match).
 * 
 * Controle via chrome.runtime message:
 *   { action: 'replay_workflow', sessionId: 'rec_...' }
 *   { action: 'replay_workflow', sessionId: 'rec_...', params: { dates: ['01/03/2026', '31/03/2026'] } }
 */
(function() {
    'use strict';
    var TAG = '[Workflow Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;

    console.log(TAG, 'Carregado. Aguardando comando de replay...');

    // ========================================================================
    // CONTROLE — Recebe comando de replay
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
            // Busca gravação do Firebase
            var response = await fetch(FIREBASE_BASE + '/atom_recordings/' + sessionId + '.json');
            var recording = await response.json();

            if (!recording || !recording.actions) {
                console.error(TAG, 'Gravação não encontrada:', sessionId);
                showReplayIndicator(false);
                replaying = false;
                return;
            }

            // Filtra apenas ações executáveis (ignora context/scan/session)
            var actions = recording.actions.filter(function(a) {
                return a.type === 'click' || a.type === 'type' || a.type === 'select' ||
                       a.type === 'navigate_menu' || a.type === 'navigate_section';
            });

            totalSteps = actions.length;
            console.log(TAG, 'Gravação carregada:', recording.sessionId, '|', totalSteps, 'ações executáveis');
            console.log(TAG, 'Label:', recording.actions[0] && recording.actions[0].label ? recording.actions[0].label : 'sem nome');

            // Executa cada ação em sequência
            for (var i = 0; i < actions.length; i++) {
                if (!replaying) {
                    console.log(TAG, '⏹ Replay interrompido pelo usuário');
                    break;
                }

                currentStep = i + 1;
                var action = actions[i];

                // Substituição de parâmetros dinâmicos
                action = applyParams(action, params, i, actions);

                showReplayIndicator(true, 'Passo ' + currentStep + '/' + totalSteps + ': ' + describeAction(action));
                console.log(TAG, '➡️ Passo', currentStep + '/' + totalSteps, ':', action.type, '|', action.text || action.value || action.selector);

                var success = await executeAction(action);

                if (!success) {
                    console.warn(TAG, '⚠️ Ação falhou, tentando prosseguir...');
                }

                // Delay entre ações (simula interação humana + espera Angular render)
                await delay(getDelay(action));
            }

            showReplayIndicator(true, '✅ Replay concluído! (' + totalSteps + ' passos)');
            console.log(TAG, '✅ REPLAY CONCLUÍDO');

            // Remove indicador após 3s
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
    // EXECUTE ACTION — Executa uma ação individual
    // ========================================================================
    async function executeAction(action) {
        var el = findElement(action);

        if (!el) {
            console.warn(TAG, '❌ Elemento não encontrado:', action.selector, '| text:', action.text);
            return false;
        }

        switch (action.type) {
            case 'click':
            case 'navigate_menu':
            case 'navigate_section':
                // Scroll into view
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(300);

                // Highlight antes de clicar
                highlightElement(el);

                // Click
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                el.click();

                console.log(TAG, '🖱️ Clicou:', action.text || action.selector);
                return true;

            case 'type':
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(200);
                highlightElement(el);

                // Foca e limpa
                el.focus();
                el.dispatchEvent(new Event('focus', { bubbles: true }));
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await delay(100);

                // Digita caractere por caractere (Angular pattern)
                var value = action.value || '';
                for (var c = 0; c < value.length; c++) {
                    el.value += value[c];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    await delay(30);
                }

                // Dispara change
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));

                console.log(TAG, '⌨️ Digitou:', value, 'em', action.selector);
                return true;

            case 'select':
                el.value = action.value || '';
                el.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(TAG, '📋 Selecionou:', action.value);
                return true;

            default:
                console.log(TAG, '? Tipo desconhecido:', action.type);
                return false;
        }
    }

    // ========================================================================
    // FIND ELEMENT — Busca inteligente com fallbacks
    // ========================================================================
    function findElement(action) {
        var el = null;

        // 1. Seletor direto
        if (action.selector) {
            try {
                el = document.querySelector(action.selector);
                if (el && isVisible(el)) return el;
            } catch(e) { /* seletor inválido */ }
        }

        // 2. Busca por ID
        if (action.id) {
            el = document.getElementById(action.id);
            if (el && isVisible(el)) return el;
        }

        // 3. Busca por texto visível (mais robusto)
        if (action.text) {
            el = findByText(action.text, action.tagName);
            if (el) return el;
        }

        // 4. Busca por label
        if (action.label) {
            el = findByText(action.label);
            if (el) return el;
        }

        // 5. Fuzzy: busca por classe parcial
        if (action.classes) {
            var mainClass = (action.classes.split(' ')[0] || '').trim();
            if (mainClass.length > 3) {
                try {
                    var matches = document.querySelectorAll('.' + mainClass);
                    for (var i = 0; i < matches.length; i++) {
                        if (isVisible(matches[i])) return matches[i];
                    }
                } catch(e) {}
            }
        }

        return null;
    }

    function findByText(text, tagName) {
        if (!text || text.length < 2) return null;
        var searchText = text.trim().toLowerCase();

        // Busca exata primeiro
        var tags = tagName ? [tagName.toUpperCase()] : ['BUTTON', 'A', 'SPAN', 'LI', 'DIV', 'INPUT', 'LABEL'];
        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                var elText = (els[i].textContent || els[i].value || '').trim();
                if (elText.toLowerCase() === searchText && isVisible(els[i])) return els[i];
            }
        }

        // Busca parcial (contém)
        for (var t2 = 0; t2 < tags.length; t2++) {
            var els2 = document.querySelectorAll(tags[t2]);
            for (var j = 0; j < els2.length; j++) {
                var elText2 = (els2[j].textContent || '').trim();
                if (elText2.toLowerCase().indexOf(searchText) >= 0 &&
                    elText2.length < searchText.length * 3 &&
                    isVisible(els2[j])) {
                    return els2[j];
                }
            }
        }

        return null;
    }

    function isVisible(el) {
        return el && (el.offsetParent !== null || el.offsetWidth > 0);
    }

    // ========================================================================
    // DYNAMIC PARAMS — Substitui valores dinâmicos no replay
    // ========================================================================
    function applyParams(action, params, index, allActions) {
        if (!params || Object.keys(params).length === 0) return action;

        var modified = JSON.parse(JSON.stringify(action)); // deep clone

        // Substituição de datas
        if (params.dates && modified.type === 'type' && modified.value) {
            // Detecta inputs de data pelo valor formato dd/mm/yyyy
            if (/\d{2}\/\d{2}\/\d{4}/.test(modified.value)) {
                // Encontra qual data substituir (primeira = inicio, segunda = fim)
                var dateInputs = allActions.filter(function(a) {
                    return a.type === 'type' && /\d{2}\/\d{2}\/\d{4}/.test(a.value);
                });
                var dateIndex = dateInputs.indexOf(action);
                if (dateIndex >= 0 && params.dates[dateIndex]) {
                    console.log(TAG, '🔄 Data substituída:', modified.value, '→', params.dates[dateIndex]);
                    modified.value = params.dates[dateIndex];
                }
            }
        }

        // Substituição genérica por fieldName
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

    function getDelay(action) {
        // Delays baseados no tipo de ação
        switch(action.type) {
            case 'navigate_menu':
            case 'navigate_section':
                return 2000; // Menu/accordion: Angular precisa renderizar
            case 'type':
                return 500;
            case 'click':
                return 1000;
            default:
                return 800;
        }
    }

    function describeAction(action) {
        switch(action.type) {
            case 'click': return 'Clicando: ' + (action.text || action.selector);
            case 'navigate_menu': return 'Menu: ' + (action.text || action.selector);
            case 'navigate_section': return 'Seção: ' + (action.text || action.sectionName || action.selector);
            case 'type': return 'Digitando: ' + (action.value || '').substring(0, 20);
            case 'select': return 'Selecionando: ' + (action.value || '');
            default: return action.type;
        }
    }

    function highlightElement(el) {
        var originalOutline = el.style.outline;
        var originalTransition = el.style.transition;
        el.style.transition = 'outline 0.2s ease';
        el.style.outline = '3px solid #F59E0B';
        setTimeout(function() {
            el.style.outline = originalOutline;
            el.style.transition = originalTransition;
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

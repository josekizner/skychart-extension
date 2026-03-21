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
    var MAX_VISION_CALLS = 5; // Aumentado — Gemini é parte do fluxo, não fallback
    var _consecutiveFails = 0;
    var MAX_CONSECUTIVE_FAILS = 3; // Mais tolerante com Gemini ajudando
    var _executionLog = []; // Histórico de execução pra contexto Gemini
    var _workflowLabel = ''; // Nome do workflow pra contexto
    var _allPlanSteps = []; // Todos os steps do plano pra contexto

    console.log(TAG, 'v8 Carregado (Gemini decision engine)');

    // ========================================================================
    // GEMINI RESOLVE — Resolve qualquer falha/ambiguidade com contexto
    // ========================================================================
    async function geminiResolve(task, reason, extraContext) {
        if (typeof VisionAgent === 'undefined') {
            console.error(TAG, '🧠 VisionAgent não disponível');
            return null;
        }
        if (_visionCalls >= MAX_VISION_CALLS) {
            console.warn(TAG, '🧠 Limite de chamadas Gemini atingido');
            return null;
        }
        _visionCalls++;

        // Monta contexto rico
        var lastSteps = _executionLog.slice(-5).map(function(l) {
            return l.status + ': ' + l.description;
        }).join('\n');

        var nextSteps = '';
        var currentIdx = _allPlanSteps.indexOf(task);
        if (currentIdx >= 0) {
            nextSteps = _allPlanSteps.slice(currentIdx + 1, currentIdx + 3).map(function(s) {
                return s.type + ': ' + (s.text || s.value || s.rule || '');
            }).join(' → ');
        }

        var prompt = 'CONTEXTO DO WORKFLOW:\n' +
            'Workflow: "' + _workflowLabel + '"\n' +
            'URL atual: ' + window.location.href + '\n' +
            'Step atual: ' + currentStep + '/' + totalSteps + '\n\n' +
            'HISTÓRICO (últimos steps):\n' + (lastSteps || 'nenhum') + '\n\n' +
            'OBJETIVO AGORA: ' + (task.text || task.value || task.rule || task.selector || 'ação') + '\n' +
            'TIPO: ' + task.type + '\n' +
            'PROBLEMA: ' + reason + '\n' +
            (extraContext ? 'INFO EXTRA: ' + extraContext + '\n' : '') +
            (nextSteps ? 'PRÓXIMOS STEPS: ' + nextSteps + '\n' : '') +
            '\nANALISE O SCREENSHOT e encontre o elemento correto.\n' +
            'Responda APENAS com JSON: {"found": true/false, "x": coordX_centro, "y": coordY_centro, ' +
            '"type": "button"|"input"|"link"|"text", "text": "texto do elemento", ' +
            '"reasoning": "por que este elemento é o correto"}';

        console.log(TAG, '🧠 Gemini resolve (' + _visionCalls + '/' + MAX_VISION_CALLS + '):', reason);

        try {
            var result = await VisionAgent.see(prompt);
            if (result && result.found && result.x && result.y) {
                console.log(TAG, '🧠 Gemini encontrou:', result.text, 'em', result.x + ',' + result.y);
                if (result.reasoning) {
                    console.log(TAG, '🧠 Raciocínio:', result.reasoning);
                }

                // USA elementFromPoint — pega o DOM REAL e clica nativamente
                // (VisionAgent.act usa debugger que Angular IGNORA)
                var domEl = document.elementFromPoint(result.x, result.y);
                if (domEl) {
                    console.log(TAG, '🧠 DOM element:', domEl.tagName, domEl.textContent.substring(0, 30));
                    // Sobe pra ancestral clicável se necessário
                    var clickTarget = domEl.closest('a, button, td, span[class*="clickable"], [role="treeitem"], [role="menuitem"], li') || domEl;
                    highlight(clickTarget);
                    // Dispara click nativo + MouseEvent (Angular precisa)
                    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    clickTarget.click();
                    console.log(TAG, '🧠 Click NATIVO disparado em:', clickTarget.tagName, clickTarget.textContent.substring(0, 30));
                    result._clickedElement = clickTarget;
                } else {
                    // Fallback: VisionAgent.act (debugger)
                    console.log(TAG, '🧠 elementFromPoint falhou, usando VisionAgent.act');
                    await VisionAgent.act({ type: 'click', x: result.x, y: result.y });
                }

                return result;
            }
            console.log(TAG, '🧠 Gemini não encontrou elemento');
            return null;
        } catch(e) {
            console.error(TAG, '🧠 Gemini erro:', e.message);
            return null;
        }
    }

    // Registra no log de execução
    function logExecution(status, description) {
        _executionLog.push({
            step: currentStep,
            status: status, // ✅ ❌ ⚠️ 🧠
            description: description,
            timestamp: Date.now()
        });
        // Mantém só os últimos 20
        if (_executionLog.length > 20) _executionLog.shift();
    }

    // ========================================================================
    // DOWNLOAD RECEIVER — Recebe arquivo do background (chrome.downloads API)
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'download_file_ready') {
            console.log(TAG, '📥 Arquivo recebido do background:', msg.filename, '|', (msg.fileSize || 0), 'bytes');
            if (msg.fileData && msg.fileData.length > 0) {
                // Converte array de bytes de volta pra Blob
                var uint8 = new Uint8Array(msg.fileData);
                var blob = new Blob([uint8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                window._atomLastDownloadBlob = blob;
                console.log(TAG, '📥 Blob criado:', blob.size, 'bytes — pronto pro smart step');
            } else {
                console.log(TAG, '📥 Arquivo sem data, path:', msg.downloadPath);
            }
        }
    });

    // ========================================================================
    // CONTROLE
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'replay_workflow') {
            if (replaying) { sendResponse({ success: false }); return; }
            startReplay(msg.sessionId, msg.params || {});
            sendResponse({ success: true });
        }
        if (msg.action === 'resume_workflow') {
            if (replaying) { sendResponse({ success: false, reason: 'already replaying' }); return; }
            console.log(TAG, '🔄 Resuming workflow from step', msg.startFrom);
            startReplay(msg.sessionId, msg.params || {}, msg.startFrom || 0);
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
    async function startReplay(sessionId, params, startFrom) {
        replaying = true;
        currentStep = startFrom || 0;
        _visionCalls = 0;
        _consecutiveFails = 0;
        showIndicator(true, 'Carregando...');
        console.log(TAG, '▶️ Replay:', sessionId, startFrom ? '(resuming from ' + startFrom + ')' : '');

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

            // Escape pra fechar modais (só se não é resume)
            if (!startFrom) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await delay(500);
            }

            // Agrupa em plano de alto nível
            var plan = buildPlan(actions, params);
            _allPlanSteps = plan; // Salva pra contexto Gemini
            _workflowLabel = label; // Salva pra contexto
            console.log(TAG, '📋 Plano:', plan.length, 'tarefas');

            // Se resuming, pula tasks até o startFrom
            var startTask = 0;
            if (startFrom) {
                for (var s = 0; s < plan.length; s++) {
                    if (plan[s].stepNum >= startFrom) { startTask = s; break; }
                }
                console.log(TAG, '⏩ Pulando para task', startTask, 'de', plan.length);
            }

            var currentHost = window.location.hostname;

            for (var t = startTask; t < plan.length; t++) {
                if (!replaying) break;
                var task = plan[t];

                // CROSS-SITE: se o próximo step é em outro domínio, handoff pro background
                var stepHost = task.hostname || null;
                if (stepHost && stepHost !== currentHost) {
                    console.log(TAG, '🌐 Cross-site detectado:', currentHost, '→', stepHost);
                    showIndicator(true, '🌐 Navegando para ' + stepHost + '...');
                    chrome.runtime.sendMessage({
                        action: 'cross_site_navigate',
                        hostname: stepHost,
                        url: task.url || ('https://' + stepHost),
                        sessionId: sessionId,
                        startFrom: task.stepNum,
                        params: params
                    });
                    // Para a execução nessa aba — o background vai continuar na outra
                    replaying = false;
                    showIndicator(false);
                    return;
                }

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
                } else if (task.type === 'smart_step') {
                    currentStep = task.stepNum;
                    showIndicator(true, currentStep + '/' + totalSteps + ': ⚡ ' + (task.rule || 'smart step'));
                    console.log(TAG, '⚡', currentStep + '/' + totalSteps, 'smart_step |', task.rule);
                    var smartOk = await executeSmartStep(task);
                    console.log(TAG, smartOk ? '✅' : '❌', 'smart_step');
                    if (!smartOk) { showIndicator(true, '❌ smart step'); await delay(2000); }
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
                plan.push({ type: 'nav_path', steps: path, hostname: path[0].action.hostname, url: path[0].action.url, stepNum: path[0].stepNum });
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
                    stepNum: i + 2, // step number do type
                    hostname: a.hostname,
                    url: a.url
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
                    stepNum: i + 1,
                    hostname: a.hostname,
                    url: a.url
                });
                i++;
                continue;
            }

            // Smart step (XLSX filter, etc)
            if (a.type === 'smart_step') {
                plan.push({
                    type: 'smart_step',
                    stepType: a.stepType,
                    rule: a.rule,
                    filename: a.filename,
                    downloadUrl: a.downloadUrl,
                    stepNum: i + 1,
                    hostname: a.hostname,
                    url: a.url,
                    action: a
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
                action: a,
                hostname: a.hostname,
                url: a.url
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
                logExecution('❌', 'nav falhou: ' + desc);
                console.error(TAG, '❌', currentStep, 'FALHOU após', maxRetries, 'tentativas — chamando Gemini');
                // Gemini decision engine com contexto completo
                var resolved = await geminiResolve(
                    step, 
                    'Não encontrei o item "' + desc + '" após ' + maxRetries + ' tentativas. Seletores CSS e busca por texto falharam.',
                    'Buscando na tree de navegação/menu da página. O elemento pode estar dentro de um submenu que precisa ser expandido.'
                );
                if (resolved) {
                    await waitForMutation(2000);
                    logExecution('🧠', 'Gemini resolveu: ' + desc + ' → ' + (resolved.reasoning || ''));
                    console.log(TAG, '✅ Gemini resolveu:', desc);
                }
            } else {
                logExecution('✅', 'nav ok: ' + desc);
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
            if (selector && selector.indexOf('undefined') < 0) { // Skip selectors com 'undefined' (Angular lixo)
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

            // 2. getElementById — MAS pula se está dentro de nav/sidebar (evita duplicatas)
            if (text) {
                el = document.getElementById(text);
                if (el && isVisible(el)) {
                    // Se NÃO é um item de menu/sidebar, usa direto
                    var isInNav = el.closest('[class*="menu"], [class*="sidebar"], [role="navigation"], .layout-sidebar, .layout-menu');
                    if (!isInNav) {
                        return el;
                    }
                    // Se É da sidebar, só usa se não achamos nada melhor no content
                    var contentEl = findByTextInContent(text);
                    if (contentEl) {
                        console.log(TAG, '⚡ Preferindo elemento do conteúdo sobre sidebar');
                        return contentEl;
                    }
                    // Fallback: usa o da sidebar mesmo
                    return el;
                }
            }

            // 3. Texto em QUALQUER elemento visível — prioriza content area
            if (text && text.length > 1) {
                el = findByTextUniversal(text);
                if (el) return el;
            }

            await delay(500);
        }
        return null;
    }

    // Busca texto FORA do sidebar/menu (na área de conteúdo)
    function findByTextInContent(text) {
        var search = text.trim().toLowerCase();
        var tags = ['TD', 'SPAN', 'LI', 'DIV', 'LABEL', 'A'];
        var SIDEBAR_SELECTORS = '.layout-sidebar, .layout-menu, [role="navigation"], nav, .ui-panelmenu';

        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                if (!isVisible(els[i])) continue;
                // EXCLUI sidebar/nav/menu
                if (els[i].closest(SIDEBAR_SELECTORS)) continue;
                // EXCLUI nossos widgets
                if (els[i].closest('#atom-widget, #atom-replay-indicator, #atom-modal-overlay')) continue;
                var et = (els[i].textContent || '').trim().toLowerCase();
                if (et === search) return els[i];
            }
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

        // PrimeNG autocomplete detection
        var isAutocomplete = el.classList.contains('ui-autocomplete-input') ||
                             el.closest('.ui-autocomplete') ||
                             el.getAttribute('role') === 'listbox' ||
                             (el.getAttribute('autocomplete') === 'off' && el.closest('p-autocomplete, [class*="autocomplete"]'));

        if (isCalendar || isAutocomplete) {
            console.log(TAG, isCalendar ? 'Calendar' : 'Autocomplete', 'detectado, digitando char-by-char');
            await typeCharByChar(el, task.value);
            // Para autocomplete: espera dropdown aparecer e seleciona primeiro item
            if (isAutocomplete && !isCalendar) {
                await delay(1500); // Espera API do autocomplete responder
                var dropdownItem = document.querySelector('.ui-autocomplete-list-item, .ui-autocomplete-panel li');
                if (dropdownItem) {
                    console.log(TAG, 'Autocomplete dropdown item encontrado, clicando...');
                    dropdownItem.click();
                    await delay(500);
                }
            }
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
            logExecution('✅', 'action ok: ' + (task.text || task.selector));
            return true;
        }

        // Gemini decision engine
        logExecution('⚠️', 'action não encontrada: ' + (task.text || task.selector));
        var resolved = await geminiResolve(
            task,
            'Não encontrei o botão/ação "' + (task.text || '') + '" por seletor nem por texto visível.',
            'Seletor tentado: ' + (task.selector || 'nenhum') + '. TagName esperado: ' + (task.tagName || 'desconhecido')
        );
        if (resolved) {
            logExecution('🧠', 'Gemini resolveu action: ' + (resolved.text || task.text));
            return true;
        }

        logExecution('❌', 'action falhou definitivo: ' + (task.text || task.selector));
        return false;
    }

    // ========================================================================
    // EXECUTE SMART STEP — Processar XLSX com filtro
    // ========================================================================
    async function executeSmartStep(task) {
        if (task.stepType !== 'xlsx_filter') {
            console.log(TAG, '⚡ Smart step tipo desconhecido:', task.stepType);
            return false;
        }

        console.log(TAG, '⚡ Executando XLSX filter:', task.rule);
        showIndicator(true, '⚡ Aguardando download...');

        // Espera o download mais recente (até 120s — arquivos pesados)
        var blob = null;
        var attempts = 0;
        var MAX_WAIT = 120; // 120 tentativas x 1s = 2 minutos
        while (!blob && attempts < MAX_WAIT) {
            // Verifica se tem blob capturado pelo interceptor
            if (window._atomLastDownloadBlob) {
                blob = window._atomLastDownloadBlob;
                break;
            }
            // Verifica se último link de download criado tem blob
            var downloadLinks = document.querySelectorAll('a[download], a[href^="blob:"]');
            for (var d = downloadLinks.length - 1; d >= 0; d--) {
                var href = downloadLinks[d].href;
                if (href && href.indexOf('blob:') === 0) {
                    try {
                        var resp = await fetch(href);
                        blob = await resp.blob();
                        break;
                    } catch(e) {}
                }
            }
            if (!blob) {
                if (attempts % 5 === 0) {
                    showIndicator(true, '⚡ Aguardando download... ' + attempts + 's');
                }
                await delay(1000);
                attempts++;
            }
        }

        if (!blob) {
            console.error(TAG, '⚡ Nenhum arquivo encontrado para processar');
            return false;
        }

        console.log(TAG, '⚡ Arquivo capturado:', blob.size, 'bytes');
        showIndicator(true, '⚡ Processando planilha...');

        try {
            // Lê o XLSX com SheetJS
            var arrayBuf = await blob.arrayBuffer();
            if (typeof XLSX === 'undefined') {
                console.error(TAG, '⚡ SheetJS não carregado');
                return false;
            }
            var wb = XLSX.read(arrayBuf, { type: 'array' });
            var sheetName = wb.SheetNames[0];
            var ws = wb.Sheets[sheetName];
            var data = XLSX.utils.sheet_to_json(ws, { header: 1 }); // Array de arrays
            var originalRows = data.length;
            console.log(TAG, '⚡ Planilha:', sheetName, '|', originalRows, 'linhas');

            // Parseia a regra do smart step
            var rule = (task.rule || '').toLowerCase();
            var filterOut = true; // remover por padrão
            var keyword = '';

            // Detecta intenção
            if (rule.indexOf('remover') >= 0 || rule.indexOf('excluir') >= 0 || rule.indexOf('deletar') >= 0 || rule.indexOf('tirar') >= 0) {
                filterOut = true;
                keyword = rule.replace(/remover|excluir|deletar|tirar|linhas|que|contenham|com|conteúdo|conteudo|com\s+/gi, '').trim();
            } else if (rule.indexOf('manter') >= 0 || rule.indexOf('apenas') >= 0) {
                filterOut = false;
                keyword = rule.replace(/manter|apenas|linhas|que|contenham|com/gi, '').trim();
            } else {
                // Assume remover
                keyword = rule.trim();
            }

            console.log(TAG, '⚡ Filtro:', filterOut ? 'REMOVER' : 'MANTER', 'keyword:', keyword);

            if (!keyword) {
                console.error(TAG, '⚡ Nenhuma keyword extraída da regra');
                return false;
            }

            // Filtra as linhas
            var header = data[0]; // Preserva header
            var filtered = [header];
            var removed = 0;

            for (var r = 1; r < data.length; r++) {
                var row = data[r];
                var rowText = row.join(' ').toLowerCase();
                var matchesKeyword = rowText.indexOf(keyword.toLowerCase()) >= 0;

                if (filterOut) {
                    // Remover linhas com keyword
                    if (!matchesKeyword) {
                        filtered.push(row);
                    } else {
                        removed++;
                    }
                } else {
                    // Manter apenas linhas com keyword
                    if (matchesKeyword) {
                        filtered.push(row);
                    } else {
                        removed++;
                    }
                }
            }

            console.log(TAG, '⚡ Resultado:', filtered.length, 'linhas (removidas:', removed, ')');
            showIndicator(true, '⚡ ' + removed + ' linhas removidas');

            // Gera novo XLSX
            var newWs = XLSX.utils.aoa_to_sheet(filtered);
            var newWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
            var outBuf = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
            var outBlob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            // Auto-download do arquivo limpo
            var cleanName = (task.filename || 'relatorio').replace(/\.(xlsx?|csv)$/i, '') + '_FILTRADO.xlsx';
            var url = URL.createObjectURL(outBlob);
            var a = document.createElement('a');
            a.href = url;
            a.download = cleanName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

            // Salva referência pro próximo step (ex: anexar no Outlook)
            window._atomLastProcessedFile = outBlob;
            window._atomLastProcessedName = cleanName;

            showIndicator(true, '✅ ' + cleanName + ' baixado!');
            await delay(2000);
            return true;

        } catch(e) {
            console.error(TAG, '⚡ Erro processando XLSX:', e);
            return false;
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================
    function isExecutable(a) {
        if (['click', 'type', 'select', 'navigate_menu', 'navigate_section', 'smart_step'].indexOf(a.type) < 0) return false;
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

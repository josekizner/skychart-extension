/**
 * WORKFLOW EXECUTOR v5 — Context-Aware + MutationObserver
 * 
 * Princípio: cada ação executa no CONTEXTO do que a anterior produziu.
 * 
 * Para navigate_menu/navigate_section:
 *   1. Busca por texto ESCOPADO (dentro do menu/sidebar ativos)
 *   2. Busca por selector com contexto
 *   3. Busca global por texto (fallback)
 *   4. Gemini Vision (último recurso)
 * 
 * Após cada click de navegação:
 *   - waitForMutation: espera o DOM mudar antes de prosseguir
 *   - Garante que Angular renderizou o submenu/seção
 * 
 * Para type:
 *   - nthIndex: distingue inputs irmãos com mesmo selector
 * 
 * SEM dismissModals (crashava Angular). Usa Escape 1x no início.
 */
(function() {
    'use strict';
    var TAG = '[Executor]';
    var FIREBASE_BASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var replaying = false;
    var currentStep = 0;
    var totalSteps = 0;

    // Contexto: último elemento clicado (pra busca escopada)
    var lastClickedEl = null;

    console.log(TAG, 'v5 Carregado (context-aware)');

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
        lastClickedEl = null;
        showIndicator(true, 'Carregando...');
        console.log(TAG, '▶️ Replay:', sessionId);

        try {
            var resp = await fetch(FIREBASE_BASE + '/atom_recordings/' + sessionId + '.json');
            var rec = await resp.json();
            if (!rec || !rec.actions) {
                console.error(TAG, 'Gravação não encontrada');
                showIndicator(false); replaying = false; return;
            }

            // Filtra executáveis
            var actions = rec.actions.filter(isExecutable);

            // Label
            var label = '';
            for (var k = 0; k < rec.actions.length; k++) {
                if (rec.actions[k].type === 'session_start' && rec.actions[k].label) {
                    label = rec.actions[k].label; break;
                }
            }

            totalSteps = actions.length;
            console.log(TAG, 'Gravação:', label || sessionId, '|', totalSteps, 'passos');

            // Fecha modal com Escape (seguro pro Angular)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await delay(500);

            for (var i = 0; i < actions.length; i++) {
                if (!replaying) break;

                currentStep = i + 1;
                var action = applyParams(actions[i], params, i, actions);
                var desc = (action.text || action.value || action.selector || '').substring(0, 40);
                showIndicator(true, currentStep + '/' + totalSteps + ': ' + desc);
                console.log(TAG, '➡️', currentStep + '/' + totalSteps, action.type, '|', desc);

                var result = await executeAction(action);

                if (result.ok) {
                    console.log(TAG, '✅', currentStep, 'via', result.method);
                } else {
                    console.error(TAG, '❌', currentStep, 'FALHOU (' + result.method + ')');
                    showIndicator(true, '❌ ' + currentStep + ': ' + desc);
                    await delay(2000);
                }

                // Delay pós-ação
                var waitMs = getDelay(action, i, actions);
                await delay(waitMs);
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
        if (a.text && (a.text.indexOf('PARAR') >= 0 || a.text.indexOf('⏹') >= 0)) return false;
        return true;
    }

    // ========================================================================
    // EXECUTE ACTION — Orquestra busca + execução + espera
    // ========================================================================
    async function executeAction(action) {
        var isNav = (action.type === 'navigate_menu' || action.type === 'navigate_section');
        var isType = (action.type === 'type');

        // BUSCA: Espera até 10s pelo elemento
        var el = await waitForElement(action, 10000);

        if (el) {
            // Executa
            if (isType) {
                await doType(el, (action.value || '').trim());
            } else {
                await doClick(el);
            }

            // Se foi navegação, espera DOM mudar (Angular renderizar)
            if (isNav) {
                lastClickedEl = el;
                await waitForMutation(2000);
            }

            return { ok: true, method: 'dom' };
        }

        // FALLBACK: Gemini Vision
        if (typeof VisionAgent !== 'undefined') {
            console.log(TAG, '🤖 Tentando Gemini Vision...');
            showIndicator(true, '🤖 ' + currentStep + ': Gemini Vision...');
            try {
                var desc = buildVisionDesc(action);
                var vr = await VisionAgent.findElement(desc);
                if (vr && vr.found && vr.x && vr.y) {
                    console.log(TAG, '🎯 Gemini:', vr.x, vr.y);
                    await VisionAgent.act({ type: 'click', x: vr.x, y: vr.y });
                    if (isType) {
                        await delay(400);
                        var focused = document.activeElement;
                        if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
                            await doType(focused, (action.value || '').trim());
                        }
                    }
                    if (isNav) await waitForMutation(2000);
                    return { ok: true, method: 'gemini' };
                }
            } catch(e) {
                console.error(TAG, 'Gemini erro:', e.message);
            }
        }

        return { ok: false, method: 'not-found' };
    }

    // ========================================================================
    // WAIT FOR ELEMENT — Polling com busca inteligente
    // ========================================================================
    async function waitForElement(action, timeoutMs) {
        var start = Date.now();
        var attempts = 0;

        while (Date.now() - start < timeoutMs) {
            attempts++;
            var el = findElement(action);
            if (el) {
                if (attempts > 1) console.log(TAG, '⏳', (Date.now() - start) + 'ms');
                return el;
            }
            await delay(attempts < 3 ? 300 : attempts < 6 ? 500 : 800);
        }

        console.warn(TAG, '⏰ Timeout após', timeoutMs + 'ms buscando:', action.text || action.selector);
        return null;
    }

    // ========================================================================
    // FIND ELEMENT — 4 níveis, busca escopada
    // ========================================================================
    function findElement(action) {
        var el;

        // NÍVEL 1: Para TYPE com nthIndex → pega o input certo por posição
        if (action.type === 'type' && action.nthIndex != null && action.selector) {
            el = findByNth(action.selector, action.nthIndex);
            if (el) return el;
        }

        // NÍVEL 2: Selector direto (IDs como #Utilidades são confiáveis)
        if (action.selector) {
            try {
                el = document.querySelector(action.selector);
                if (el && isVisible(el)) {
                    // Verifica se o texto bate (evita falso positivo)
                    if (!action.text || textMatches(el, action.text)) return el;
                }
            } catch(e) {}
        }

        // NÍVEL 3: Texto ESCOPADO — busca dentro do contexto de navegação
        if (action.text && action.text.length > 1) {
            // 3a: Dentro do menu lateral / sidebar
            el = findByTextScoped(action.text, getSidebarContainer());
            if (el) return el;

            // 3b: Dentro do último elemento clicado (submenu expandido)
            if (lastClickedEl) {
                var expandedContainer = findExpandedContainer(lastClickedEl);
                if (expandedContainer) {
                    el = findByTextScoped(action.text, expandedContainer);
                    if (el) return el;
                }
            }

            // 3c: Busca global (mas com preferência por elementos menores/mais específicos)
            el = findByTextGlobal(action.text);
            if (el) return el;
        }

        // NÍVEL 4: ID direto
        if (action.id && action.id.length > 0) {
            el = document.getElementById(action.id);
            if (el && isVisible(el)) return el;
        }

        // NÍVEL 5: Label / sectionName
        if (action.label && action.label.length > 1) {
            el = findByTextGlobal(action.label);
            if (el) return el;
        }
        if (action.sectionName) {
            el = findByTextGlobal(action.sectionName);
            if (el) return el;
        }

        return null;
    }

    // ========================================================================
    // FIND HELPERS
    // ========================================================================

    // Retorna o container do sidebar/menu lateral
    function getSidebarContainer() {
        // PrimeNG sidebar patterns
        var selectors = [
            '.ui-panelmenu', '.ui-menu', '.ui-tree',
            '.p-panelmenu', '.p-menu', '.p-tree',
            '[class*="sidebar"]', '[class*="menu-lateral"]',
            'nav', '.nav'
        ];
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el && isVisible(el)) return el;
        }
        return null;
    }

    // Encontra o container expandido mais próximo do último click
    function findExpandedContainer(el) {
        var current = el;
        var maxUp = 5;
        while (current && current !== document.body && maxUp-- > 0) {
            // PrimeNG tree expanded children
            var children = current.querySelector(
                '.ui-treenode-children, .ui-submenu-list, .ui-panelmenu-content, ' +
                '.p-treenode-children, .p-submenu-list, .p-panelmenu-content, ' +
                '[class*="submenu"], [class*="children"]'
            );
            if (children && isVisible(children)) return children;

            // O próprio parent que tem filhos visíveis
            var sibling = current.nextElementSibling;
            if (sibling && isVisible(sibling)) {
                var hasInteractive = sibling.querySelector('a, span, li, button');
                if (hasInteractive) return sibling;
            }

            current = current.parentElement;
        }
        return null;
    }

    // Busca por texto DENTRO de um container específico
    function findByTextScoped(text, container) {
        if (!container || !text) return null;
        var search = text.trim().toLowerCase();
        var tags = ['SPAN', 'A', 'BUTTON', 'LI', 'TD', 'LABEL', 'DIV'];

        for (var t = 0; t < tags.length; t++) {
            var els = container.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                var elText = (els[i].textContent || '').trim().toLowerCase();
                // Match exato ou quase exato (texto do elemento ≈ texto buscado)
                if (elText === search && isVisible(els[i])) return els[i];
                if (elText.length > 0 && elText.length < search.length * 1.5 &&
                    elText.indexOf(search) >= 0 && isVisible(els[i])) return els[i];
            }
        }
        return null;
    }

    // Busca global: prefere elementos mais específicos (menor textContent)
    function findByTextGlobal(text) {
        if (!text || text.length < 2) return null;
        var search = text.trim().toLowerCase();
        var tags = ['SPAN', 'A', 'BUTTON', 'LI', 'TD', 'LABEL'];
        var bestMatch = null;
        var bestLen = Infinity;

        for (var t = 0; t < tags.length; t++) {
            var els = document.querySelectorAll(tags[t]);
            for (var i = 0; i < els.length; i++) {
                if (!isVisible(els[i])) continue;
                var elText = (els[i].textContent || '').trim().toLowerCase();
                // Match exato
                if (elText === search) {
                    if (elText.length < bestLen) {
                        bestMatch = els[i];
                        bestLen = elText.length;
                    }
                }
            }
        }

        // Se achou match exato, retorna o mais curto (mais específico)
        if (bestMatch) return bestMatch;

        // Match parcial
        for (var t2 = 0; t2 < tags.length; t2++) {
            var els2 = document.querySelectorAll(tags[t2]);
            for (var j = 0; j < els2.length; j++) {
                if (!isVisible(els2[j])) continue;
                var tx = (els2[j].textContent || '').trim().toLowerCase();
                if (tx.indexOf(search) >= 0 && tx.length < search.length * 2) {
                    return els2[j];
                }
            }
        }
        return null;
    }

    // Busca por nthIndex entre elementos com mesmo selector
    function findByNth(selector, nthIndex) {
        try {
            var all = document.querySelectorAll(selector);
            var visible = [];
            for (var i = 0; i < all.length; i++) {
                if (isVisible(all[i])) visible.push(all[i]);
            }
            // Tenta index direto e index-1 (1-based vs 0-based)
            if (nthIndex < visible.length) return visible[nthIndex];
            if (nthIndex > 0 && (nthIndex - 1) < visible.length) return visible[nthIndex - 1];
            if (visible.length > 0) return visible[0];
        } catch(e) {}
        return null;
    }

    function textMatches(el, text) {
        if (!text) return true;
        var elText = (el.textContent || el.value || '').trim().toLowerCase();
        var search = text.trim().toLowerCase();
        return elText.indexOf(search) >= 0 || search.indexOf(elText) >= 0;
    }

    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
        try {
            var s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden';
        } catch(e) {}
        return false;
    }

    // ========================================================================
    // WAIT FOR MUTATION — Espera o DOM mudar (Angular renderizar)
    // ========================================================================
    function waitForMutation(timeoutMs) {
        return new Promise(function(resolve) {
            var resolved = false;
            var observer = new MutationObserver(function(mutations) {
                // Só resolve se houve adição de nós significativa
                var significant = false;
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0) {
                        significant = true;
                        break;
                    }
                }
                if (significant && !resolved) {
                    resolved = true;
                    observer.disconnect();
                    // Delay extra pra Angular terminar rendering
                    setTimeout(resolve, 500);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Timeout: se nada mudar, segue mesmo assim
            setTimeout(function() {
                if (!resolved) {
                    resolved = true;
                    observer.disconnect();
                    resolve();
                }
            }, timeoutMs);
        });
    }

    // ========================================================================
    // ACTIONS: Click & Type
    // ========================================================================
    async function doClick(el) {
        // REGRA FUNDAMENTAL: Se é SPAN/I/EM dentro de A/BUTTON/LI, clica no PAI
        // PrimeNG SEMPRE coloca o handler no <a>, nunca no <span> interno
        var clickTarget = el;
        var tag = el.tagName;
        if (tag === 'SPAN' || tag === 'I' || tag === 'EM' || tag === 'STRONG' || tag === 'B') {
            var parent = el.closest('a, button, li, [role="menuitem"], [role="treeitem"], td');
            if (parent) {
                console.log(TAG, '⬆️ Subindo de', tag, 'para', parent.tagName, 
                    '(id:', parent.id || 'sem', '| classes:', (parent.className || '').substring(0, 40) + ')');
                clickTarget = parent;
            }
        }

        clickTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(200);
        highlight(clickTarget);

        // Click nativo (melhor pra Angular change detection)
        try { clickTarget.click(); } catch(e) {}
        await delay(100);

        // Também dispara eventos sintéticos (redundância)
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await delay(30);
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        await delay(30);
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    async function doType(el, value) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(200);
        highlight(el);
        el.focus();
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        await delay(100);
        // Limpa
        if (el.select) el.select();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(100);
        // Digita char por char
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

    // ========================================================================
    // GEMINI VISION DESCRIPTION
    // ========================================================================
    function buildVisionDesc(action) {
        var parts = [];
        if (action.text) parts.push('com texto "' + action.text + '"');
        if (action.label) parts.push('com label "' + action.label + '"');
        var types = {
            click: 'botão ou link',
            navigate_menu: 'item de menu lateral',
            navigate_section: 'item de árvore/seção',
            type: 'campo de input',
            select: 'dropdown'
        };
        return 'Encontre o ' + (types[action.type] || 'elemento') +
               (parts.length ? ' ' + parts.join(' ') : '') +
               (action.selector ? '. Selector CSS original: ' + action.selector : '');
    }

    // ========================================================================
    // PARAMS & HELPERS
    // ========================================================================
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
            // Mais tempo se próximo é tipo diferente (mudou de seção)
            if (next && next.type !== 'navigate_menu' && next.type !== 'navigate_section') return 2500;
            return 1200;
        }
        if (action.type === 'type') return 400;
        if (action.type === 'click') return 1000;
        return 800;
    }

    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    function highlight(el) {
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

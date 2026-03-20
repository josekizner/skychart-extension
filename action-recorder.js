/**
 * ACTION RECORDER — Grava workflows do usuário NO Skychart
 * 
 * Captura: clicks, inputs, seleções, navegação SPA (hashchange)
 * Salva: cada ação como { timestamp, tipo, seletor, valor, label, pageUrl }
 * Controle: ativa/desativa via mensagem do popup (action: 'start_recording' / 'stop_recording')
 * Storage: Firebase atom_recordings/{sessionId}
 * 
 * Também re-escaneia a página quando detecta mudança de seção (SPA)
 */
(function() {
    'use strict';
    var TAG = '[Action Recorder]';
    var recording = false;
    var actions = [];
    var sessionId = null;
    var lastHash = window.location.hash;
    var lastPageScan = null;
    var BLACKLIST_TYPES = ['password', 'token', 'secret']; // Nunca grava esses

    console.log(TAG, 'Carregado. Use o botão REC ou Ctrl+Shift+R para gravar.');

    // ========================================================================
    // BOTÃO FLUTUANTE + ATALHO DE TECLADO — Controle sem console
    // ========================================================================
    function createRecButton() {
        var btn = document.createElement('div');
        btn.id = 'atom-rec-button';
        btn.innerHTML = '⬤ REC';
        btn.title = 'Ctrl+Shift+R — Inicia gravação de workflow';
        btn.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:999999;background:rgba(50,50,50,0.9);color:#ff4444;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:bold;font-family:Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.4);user-select:none;transition:all 0.3s ease;border:2px solid #555;';
        btn.addEventListener('mouseenter', function() { btn.style.transform = 'scale(1.1)'; });
        btn.addEventListener('mouseleave', function() { btn.style.transform = 'scale(1)'; });
        btn.addEventListener('click', function() {
            toggleRecording();
        });
        document.body.appendChild(btn);

        // PLAY button
        var playBtn = document.createElement('div');
        playBtn.id = 'atom-play-button';
        playBtn.innerHTML = '▶ PLAY';
        playBtn.title = 'Ctrl+Shift+P — Reproduz um workflow gravado';
        playBtn.style.cssText = 'position:fixed;bottom:40px;right:16px;z-index:999999;background:rgba(50,50,50,0.9);color:#F59E0B;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:bold;font-family:Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.4);user-select:none;transition:all 0.3s ease;border:2px solid #555;';
        playBtn.addEventListener('mouseenter', function() { playBtn.style.transform = 'scale(1.1)'; });
        playBtn.addEventListener('mouseleave', function() { playBtn.style.transform = 'scale(1)'; });
        playBtn.addEventListener('click', function() {
            showRecordingPicker();
        });
        document.body.appendChild(playBtn);
    }

    // Atalho Ctrl+Shift+P pro play
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            showRecordingPicker();
        }
    });

    // Picker: mostra lista de gravações disponíveis
    async function showRecordingPicker() {
        try {
            var resp = await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings.json?shallow=true');
            var keys = await resp.json();
            if (!keys || Object.keys(keys).length === 0) {
                alert('Nenhuma gravação encontrada. Use o botão REC primeiro.');
                return;
            }

            // Busca detalhes de cada gravação
            var ids = Object.keys(keys);
            var options = [];
            for (var i = 0; i < ids.length; i++) {
                try {
                    var detResp = await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + ids[i] + '/actions/1.json');
                    var firstAction = await detResp.json();
                    var label = (firstAction && firstAction.label) ? firstAction.label : ids[i];
                    options.push({ id: ids[i], label: label });
                } catch(e) {
                    options.push({ id: ids[i], label: ids[i] });
                }
            }

            // Monta lista
            var msg = 'Escolha uma gravação pra reproduzir:\n\n';
            for (var j = 0; j < options.length; j++) {
                msg += (j + 1) + '. ' + options[j].label + '\n';
            }
            msg += '\nDigite o número (ou 0 pra cancelar):';

            var choice = prompt(msg);
            if (!choice || choice === '0') return;

            var idx = parseInt(choice) - 1;
            if (idx < 0 || idx >= options.length) {
                alert('Opção inválida.');
                return;
            }

            // Pergunta se quer mudar datas
            var customDates = prompt('Datas personalizadas? (formato: dd/mm/yyyy,dd/mm/yyyy)\nOu deixe vazio pra usar as datas originais:');
            var params = {};
            if (customDates && customDates.trim()) {
                params.dates = customDates.split(',').map(function(d) { return d.trim(); });
            }

            // Dispara replay via chrome.runtime (mesmo contexto da extensão)
            chrome.runtime.sendMessage({
                action: 'replay_workflow_proxy',
                sessionId: options[idx].id,
                params: params
            });

        } catch(e) {
            console.error(TAG, 'Erro buscando gravações:', e);
            alert('Erro ao buscar gravações: ' + e.message);
        }
    }

    function updateRecButton() {
        var btn = document.getElementById('atom-rec-button');
        if (!btn) return;
        if (recording) {
            btn.innerHTML = '⏹ PARAR (' + actions.length + ')';
            btn.style.background = 'rgba(220,20,20,0.95)';
            btn.style.color = '#fff';
            btn.style.border = '2px solid #ff6666';
            btn.title = 'Clique pra parar a gravação';
        } else {
            btn.innerHTML = '⬤ REC';
            btn.style.background = 'rgba(50,50,50,0.9)';
            btn.style.color = '#ff4444';
            btn.style.border = '2px solid #555';
            btn.title = 'Ctrl+Shift+R — Inicia gravação de workflow';
        }
    }

    function toggleRecording() {
        if (recording) {
            stopRecording();
        } else {
            var label = prompt('Nome da gravação (ex: Relatório Financeiro):');
            if (label === null) return; // Cancelou
            startRecording(label || 'Gravação sem nome');
        }
    }

    // Atalho Ctrl+Shift+R
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            toggleRecording();
        }
    });

    // Cria o botão assim que o DOM carrega
    if (document.body) {
        createRecButton();
    } else {
        document.addEventListener('DOMContentLoaded', createRecButton);
    }

    // ========================================================================
    // CONTROLE — Start/Stop via mensagem do background/popup
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'start_recording') {
            startRecording(msg.label || 'Gravação sem nome');
            sendResponse({ success: true, sessionId: sessionId });
        }
        if (msg.action === 'stop_recording') {
            var result = stopRecording();
            sendResponse({ success: true, result: result });
        }
        if (msg.action === 'recording_status') {
            sendResponse({ recording: recording, sessionId: sessionId, actionCount: actions.length });
        }
    });

    // ========================================================================
    // START — Começa a gravar
    // ========================================================================
    function startRecording(label) {
        if (recording) {
            console.log(TAG, 'Já gravando! Session:', sessionId);
            return;
        }

        sessionId = 'rec_' + Date.now();
        actions = [];
        recording = true;

        // Grava contexto inicial (tela atual)
        recordPageContext();

        // Instala listeners
        document.addEventListener('click', onUserClick, true);
        document.addEventListener('change', onUserChange, true);
        document.addEventListener('input', onUserInput, true);
        window.addEventListener('hashchange', onHashChange);

        // MutationObserver pra detectar mudanças de seção no SPA
        startSPAObserver();

        console.log(TAG, '🔴 GRAVAÇÃO INICIADA:', label, '| Session:', sessionId);

        // Salva metadata
        actions.push({
            type: 'session_start',
            label: label,
            url: window.location.href,
            timestamp: Date.now(),
            pageTitle: document.title
        });

        // Indicador visual
        showRecordingIndicator(true);
        updateRecButton();
    }

    // ========================================================================
    // STOP — Para a gravação e salva
    // ========================================================================
    function stopRecording() {
        if (!recording) return null;

        recording = false;

        // Remove listeners
        document.removeEventListener('click', onUserClick, true);
        document.removeEventListener('change', onUserChange, true);
        document.removeEventListener('input', onUserInput, true);
        window.removeEventListener('hashchange', onHashChange);
        stopSPAObserver();

        actions.push({
            type: 'session_end',
            url: window.location.href,
            timestamp: Date.now(),
            totalActions: actions.length
        });

        showRecordingIndicator(false);
        updateRecButton();

        console.log(TAG, '⏹️ GRAVAÇÃO FINALIZADA:', actions.length, 'ações');
        console.log(TAG, 'Resumo:');
        console.table(actions.map(function(a) {
            return { tipo: a.type, seletor: (a.selector || '').substring(0, 40), valor: (a.value || '').substring(0, 30), label: (a.label || '').substring(0, 30) };
        }));

        var result = {
            sessionId: sessionId,
            actions: actions,
            totalActions: actions.length,
            duration: actions.length > 1 ? actions[actions.length - 1].timestamp - actions[0].timestamp : 0
        };

        // Envia pro background → Firebase
        chrome.runtime.sendMessage({
            action: 'saveRecording',
            data: result
        });

        return result;
    }

    // ========================================================================
    // CLICK HANDLER — Captura clicks do usuário
    // ========================================================================
    function onUserClick(e) {
        if (!recording) return;
        var el = e.target;

        // FILTRO 1: Ignora clicks nos nossos próprios botões
        if (el.closest('#atom-rec-button') || el.closest('#atom-play-button') || el.closest('#atom-replay-indicator')) {
            return;
        }

        // Sobe na árvore até achar algo clicável
        var clickable = findClickable(el);
        if (!clickable) return;

        // FILTRO 2: Ignora clicks em elementos sem significado (nth-child genéricos sem texto)
        var text = getVisibleText(clickable);
        var id = clickable.id || '';
        var selector = buildSelector(clickable);

        // Se seletor é nth-child puro e não tem texto nem ID, pega texto do pai
        if (selector.indexOf(':nth-child') >= 0 && !text && !id) {
            var parent = clickable.parentElement;
            while (parent && parent !== document.body) {
                var parentText = (parent.textContent || '').trim();
                if (parentText.length > 0 && parentText.length < 80) {
                    text = parentText;
                    break;
                }
                parent = parent.parentElement;
            }
            // Se mesmo o pai não tem texto útil, ignora (provavelmente lixo)
            if (!text) {
                console.log(TAG, '🗑️ Click ignorado (sem texto/ID, seletor genérico):', selector);
                return;
            }
        }

        var info = {
            type: 'click',
            timestamp: Date.now(),
            selector: selector,
            tagName: clickable.tagName.toLowerCase(),
            text: text,
            label: getLabel(clickable),
            classes: (clickable.className || '').substring(0, 100),
            id: id,
            url: window.location.href,
            section: getCurrentSection()
        };

        // Se é um accordion/tab, marca como navegação
        if (clickable.closest('.ui-accordion-header') || clickable.closest('[role="tab"]')) {
            info.type = 'navigate_section';
            info.sectionName = text;
        }

        // Se é link do menu (MAS NÃO se é INPUT/SELECT — esses ficam como click)
        var tag = clickable.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
            if (clickable.closest('.ui-menu, .nav, [class*="menu"]')) {
                info.type = 'navigate_menu';
            }
        }

        // PrimeNG tree items — marcamos como navigate_section
        if (clickable.closest('.ui-treenode, .p-treenode, [role="treeitem"]')) {
            info.type = 'navigate_section';
            info.sectionName = text;
        }

        actions.push(info);
        updateRecButton();
        console.log(TAG, '🖱️', info.type, '|', info.text || info.selector);

        // Re-escaneia após navegação (com delay pra SPA renderizar)
        if (info.type === 'navigate_section' || info.type === 'navigate_menu') {
            setTimeout(recordPageContext, 1500);
        }
    }

    // ========================================================================
    // INPUT/CHANGE HANDLERS — Captura digitação e seleção
    // ========================================================================
    var inputDebounce = {};

    function onUserInput(e) {
        if (!recording) return;
        var el = e.target;
        if (isBlacklisted(el)) return;
        // Ignora nossos próprios elementos
        if (el.closest('#atom-rec-button, #atom-play-button, #atom-replay-indicator')) return;

        // Debounce: espera o usuário parar de digitar (300ms — era 800, perdia valores rápidos)
        var key = buildSelector(el);
        clearTimeout(inputDebounce[key]);
        inputDebounce[key] = setTimeout(function() {
            recordInput(el, 'input');
        }, 300);
    }

    function onUserChange(e) {
        if (!recording) return;
        var el = e.target;
        if (isBlacklisted(el)) return;
        recordInput(el, 'change');
    }

    function recordInput(el, eventType) {
        var value = el.value || '';
        // Trunca valores muito longos
        if (value.length > 200) value = value.substring(0, 200) + '...';

        var info = {
            type: el.tagName === 'SELECT' ? 'select' : 'type',
            timestamp: Date.now(),
            selector: buildSelector(el),
            value: value,
            label: getLabel(el),
            fieldName: el.getAttribute('name') || el.getAttribute('formcontrolname') || el.id || '',
            tagName: el.tagName.toLowerCase(),
            inputType: el.type || '',
            url: window.location.href,
            section: getCurrentSection()
        };

        // Evita duplicatas consecutivas no mesmo campo
        var lastAction = actions[actions.length - 1];
        if (lastAction && lastAction.selector === info.selector && lastAction.type === info.type) {
            // Atualiza o valor ao invés de adicionar novo
            lastAction.value = info.value;
            lastAction.timestamp = info.timestamp;
            return;
        }

        actions.push(info);
        updateRecButton();
        console.log(TAG, '⌨️', info.type, '|', info.label || info.fieldName, '=', value.substring(0, 30));
    }

    // ========================================================================
    // SPA NAVIGATION — Detecta mudanças de hash/seção
    // ========================================================================
    function onHashChange() {
        if (!recording) return;

        actions.push({
            type: 'navigate',
            timestamp: Date.now(),
            from: lastHash,
            to: window.location.hash,
            url: window.location.href
        });

        lastHash = window.location.hash;
        console.log(TAG, '🔀 Navegação:', window.location.hash);

        // Re-escaneia nova página (SPA)
        setTimeout(recordPageContext, 2000);
    }

    var spaObserver = null;

    function startSPAObserver() {
        // Observa mudanças grandes no DOM (indicam mudança de tela no Angular)
        spaObserver = new MutationObserver(function(mutations) {
            var bigChange = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 5 || mutations[i].removedNodes.length > 5) {
                    bigChange = true;
                    break;
                }
            }
            if (bigChange && recording) {
                // Debounce: espera SPA terminar de renderizar
                clearTimeout(spaObserver._debounce);
                spaObserver._debounce = setTimeout(function() {
                    var newHash = window.location.hash;
                    if (newHash !== lastHash) {
                        onHashChange();
                    }
                }, 1000);
            }
        });

        spaObserver.observe(document.body, { childList: true, subtree: true });
    }

    function stopSPAObserver() {
        if (spaObserver) {
            spaObserver.disconnect();
            spaObserver = null;
        }
    }

    // ========================================================================
    // PAGE CONTEXT — Escaneia a tela atual e salva como contexto
    // ========================================================================
    function recordPageContext() {
        if (!recording) return;

        var context = {
            type: 'page_context',
            timestamp: Date.now(),
            url: window.location.href,
            section: getCurrentSection(),
            title: document.title,
            visibleFields: [],
            visibleButtons: []
        };

        // Campos visíveis
        var inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
        for (var i = 0; i < inputs.length && context.visibleFields.length < 30; i++) {
            var el = inputs[i];
            if (!el.offsetParent && el.type !== 'checkbox') continue;
            context.visibleFields.push({
                selector: buildSelector(el),
                label: getLabel(el),
                type: el.type || el.tagName.toLowerCase(),
                value: (el.value || '').substring(0, 50)
            });
        }

        // Botões visíveis
        var buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
        for (var b = 0; b < buttons.length && context.visibleButtons.length < 15; b++) {
            var btn = buttons[b];
            if (!btn.offsetParent) continue;
            var text = (btn.textContent || '').trim();
            if (!text || text.length > 50) continue;
            context.visibleButtons.push({
                selector: buildSelector(btn),
                text: text
            });
        }

        actions.push(context);
        console.log(TAG, '📸 Contexto:', context.section, '|', context.visibleFields.length, 'campos |', context.visibleButtons.length, 'botões');

        // Dispara Radar (site-scanner) pra capturar estrutura completa da página
        triggerRadarScan();
    }

    function triggerRadarScan() {
        // Envia mensagem pro site-scanner.js que roda na mesma página
        // O scanner já salva no Firebase via background, mas aqui pegamos inline também
        try {
            if (typeof window.__atomSiteScan === 'function') {
                // Se o scanner expôs a função global
                var scanResult = window.__atomSiteScan();
                if (scanResult) {
                    actions.push({
                        type: 'radar_scan',
                        timestamp: Date.now(),
                        url: window.location.href,
                        inputCount: (scanResult.inputs || []).length,
                        buttonCount: (scanResult.buttons || []).length,
                        tableCount: (scanResult.tables || []).length,
                        formCount: (scanResult.forms || []).length,
                        techStack: scanResult.techStack || '',
                        scan: scanResult
                    });
                    console.log(TAG, '🔭 Radar integrado:', (scanResult.inputs || []).length, 'inputs,', (scanResult.buttons || []).length, 'botões');
                }
            } else {
                // Fallback: dispara scan via chrome.runtime
                chrome.runtime.sendMessage({ action: 'scan_page' }, function() {
                    console.log(TAG, '🔭 Radar disparado via background');
                });
            }
        } catch(e) {
            console.log(TAG, 'Radar scan skip:', e.message);
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    function buildSelector(el) {
        if (el.id) return '#' + el.id;
        var fcn = el.getAttribute('formcontrolname');
        if (fcn) return '[formcontrolname="' + fcn + '"]';
        if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
        var dataCy = el.getAttribute('data-cy');
        if (dataCy) return '[data-cy="' + dataCy + '"]';
        // Class-based
        var unique = Array.from(el.classList || []).filter(function(c) {
            return c.length > 2 && !c.startsWith('ng-') && !c.startsWith('ui-state');
        }).slice(0, 3);
        if (unique.length > 0) return el.tagName.toLowerCase() + '.' + unique.join('.');
        // nth-child
        var parent = el.parentElement;
        if (parent) {
            var idx = Array.from(parent.children).indexOf(el);
            return el.tagName.toLowerCase() + ':nth-child(' + (idx + 1) + ')';
        }
        return el.tagName.toLowerCase();
    }

    function getLabel(el) {
        if (el.id) {
            var lbl = document.querySelector('label[for="' + el.id + '"]');
            if (lbl) return lbl.textContent.trim().substring(0, 50);
        }
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').substring(0, 50);
        if (el.title) return el.title.substring(0, 50);
        if (el.placeholder) return el.placeholder.substring(0, 50);
        // TD anterior (Skychart pattern)
        var td = el.closest('td');
        if (td && td.previousElementSibling) {
            var prev = td.previousElementSibling.textContent.trim();
            if (prev.length < 50) return prev;
        }
        return '';
    }

    function getVisibleText(el) {
        return (el.textContent || el.value || '').trim().substring(0, 80);
    }

    function findClickable(el) {
        var maxDepth = 8;
        var current = el;
        while (current && current !== document.body && maxDepth-- > 0) {
            var tag = current.tagName;
            // Standard interactive elements
            if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT') return current;

            // Role-based (PrimeNG, Angular Material, etc)
            var role = current.getAttribute('role') || '';
            if (role === 'button' || role === 'tab' || role === 'menuitem' || 
                role === 'option' || role === 'treeitem' || role === 'listitem' ||
                role === 'row' || role === 'link' || role === 'checkbox' ||
                role === 'radio' || role === 'switch') return current;

            // PrimeNG / Angular specific classes
            var cls = current.className || '';
            if (cls.indexOf('ui-accordion-header') >= 0 ||
                cls.indexOf('ui-treenode') >= 0 ||
                cls.indexOf('ui-listbox-item') >= 0 ||
                cls.indexOf('ui-dropdown-item') >= 0 ||
                cls.indexOf('ui-menuitem') >= 0 ||
                cls.indexOf('ui-selectbutton') >= 0 ||
                cls.indexOf('ui-tabview-nav') >= 0 ||
                cls.indexOf('ui-tree-toggler') >= 0 ||
                cls.indexOf('p-treenode') >= 0 ||
                cls.indexOf('p-listbox-item') >= 0 ||
                cls.indexOf('p-menuitem') >= 0 ||
                cls.indexOf('p-dropdown-item') >= 0) return current;

            // List items com texto (menus, dropdowns, sidebars)
            if (tag === 'LI' && (current.textContent || '').trim().length > 0 && 
                (current.textContent || '').trim().length < 100) return current;

            // Angular event binding
            if (current.getAttribute('(click)') || current.getAttribute('ng-click') || 
                current.onclick) return current;

            // Cursor pointer = provavelmente clicável
            try {
                var style = window.getComputedStyle(current);
                if (style.cursor === 'pointer') return current;
            } catch(e) {}

            current = current.parentElement;
        }
        // Fallback: retorna o elemento original se tem texto curto (provavelmente um label/item clicável)
        var text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 100) return el;
        return null;
    }

    function isBlacklisted(el) {
        var type = (el.type || '').toLowerCase();
        var name = (el.name || el.id || '').toLowerCase();
        for (var i = 0; i < BLACKLIST_TYPES.length; i++) {
            if (type.indexOf(BLACKLIST_TYPES[i]) >= 0 || name.indexOf(BLACKLIST_TYPES[i]) >= 0) return true;
        }
        return false;
    }

    function getCurrentSection() {
        var open = document.querySelector('.ui-accordion-content-wrapper[style*="block"]');
        if (open && open.previousElementSibling) {
            return open.previousElementSibling.textContent.trim().substring(0, 80);
        }
        var title = document.querySelector('.ui-panel-title, h1, h2');
        return title ? title.textContent.trim().substring(0, 80) : window.location.hash;
    }

    // ========================================================================
    // VISUAL INDICATOR — Mostra que está gravando
    // ========================================================================
    function showRecordingIndicator(show) {
        var existing = document.getElementById('atom-recording-indicator');
        if (existing) existing.remove();

        if (!show) return;

        var indicator = document.createElement('div');
        indicator.id = 'atom-recording-indicator';
        indicator.innerHTML = '🔴 ATOM Gravando...';
        indicator.style.cssText = 'position:fixed;top:8px;right:8px;z-index:999999;background:rgba(220,20,20,0.95);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;animation:pulse 1.5s infinite;';

        // CSS animation
        var style = document.createElement('style');
        style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }';
        indicator.appendChild(style);

        // Click pra parar
        indicator.addEventListener('click', function() {
            stopRecording();
        });

        document.body.appendChild(indicator);
    }

})();

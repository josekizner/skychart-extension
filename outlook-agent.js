// outlook-agent.js — Atom Email Agent para Outlook Web
// Atalhos de teclado para classificar emails e processar via Gemini

(function() {
    'use strict';

    console.log('[Atom Email] Content script carregado em:', location.href);

    // ==========================================
    // PAINEL VISUAL
    // ==========================================

    function createPanel() {
        if (document.getElementById('atom-outlook-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'atom-outlook-panel';
        panel.innerHTML = [
            '<div id="atom-outlook-bar">',
            '  <div class="atom-logo">A</div>',
            '  <span class="atom-title">ATOM AGENT</span>',
            '  <div class="atom-shortcuts">',
            '    <div class="atom-shortcut" data-action="quote" title="Processar como cotacao">',
            '      <span class="key">S</span>',
            '      <span class="label">Cotacao</span>',
            '    </div>',
            '    <div class="atom-shortcut" data-action="booking" title="Processar como booking">',
            '      <span class="key">W</span>',
            '      <span class="label">Booking</span>',
            '    </div>',
            '    <div class="atom-shortcut demurrage" data-action="demurrage" title="Painel de Demurrage">',
            '      <span class="key">D</span>',
            '      <span class="label">Demurrage</span>',
            '    </div>',
            '  </div>',
            '  <span class="atom-status" id="atom-email-status">Pronto</span>',
            '</div>',
            '<div id="atom-demurrage-panel" style="display:none;"></div>'
        ].join('\n');

        document.body.appendChild(panel);

        // Click nos shortcuts
        var shortcuts = panel.querySelectorAll('.atom-shortcut');
        shortcuts.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var action = btn.getAttribute('data-action');
                if (action === 'quote') processQuotation();
                if (action === 'booking') processBooking();
                if (action === 'demurrage') toggleDemurragePanel();
            });
        });

        // Resize handles
        setupResize(panel);

        console.log('[Atom Email] Painel criado');
    }

    // ==========================================
    // RESIZE — Drag handles pra redimensionar
    // ==========================================

    function setupResize(panel) {
        // Cria handles
        var topHandle = document.createElement('div');
        topHandle.className = 'atom-resize-top';

        var rightHandle = document.createElement('div');
        rightHandle.className = 'atom-resize-right';

        var cornerHandle = document.createElement('div');
        cornerHandle.className = 'atom-resize-corner';

        panel.appendChild(topHandle);
        panel.appendChild(rightHandle);
        panel.appendChild(cornerHandle);

        // Drag logic
        function makeDraggable(handle, axis) {
            var startY, startX, startH, startW;

            handle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();

                if (!panel.classList.contains('expanded')) return;

                startY = e.clientY;
                startX = e.clientX;
                startH = panel.offsetHeight;
                startW = panel.offsetWidth;

                function onMove(ev) {
                    if (axis === 'y' || axis === 'both') {
                        var dy = startY - ev.clientY;
                        var newH = Math.max(150, Math.min(window.innerHeight - 60, startH + dy));
                        panel.style.height = newH + 'px';
                    }
                    if (axis === 'x' || axis === 'both') {
                        var dx = ev.clientX - startX;
                        var newW = Math.max(180, Math.min(600, startW + dx));
                        panel.style.width = newW + 'px';
                    }
                }

                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    // Salva tamanho
                    savePanelSize(panel);
                }

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }

        makeDraggable(topHandle, 'y');
        makeDraggable(rightHandle, 'x');
        makeDraggable(cornerHandle, 'both');
    }

    function savePanelSize(panel) {
        var size = {
            width: panel.offsetWidth,
            height: panel.offsetHeight
        };
        chrome.storage.local.set({ atomPanelSize: size });
        console.log('[Atom Email] Tamanho salvo:', size.width + 'x' + size.height);
    }

    function restorePanelSize(panel) {
        chrome.storage.local.get('atomPanelSize', function(data) {
            if (data.atomPanelSize) {
                panel.style.width = data.atomPanelSize.width + 'px';
                panel.style.height = data.atomPanelSize.height + 'px';
                console.log('[Atom Email] Tamanho restaurado:', data.atomPanelSize.width + 'x' + data.atomPanelSize.height);
            }
        });
    }

    // ==========================================
    // LEITURA DO EMAIL
    // ==========================================

    function getSelectedEmailContent() {
        // Outlook Web: email aberto fica num container com role="main"
        // O body do email fica dentro de um div[aria-label] com class que contem "ReadingPane"
        var emailBody = null;
        var subject = '';
        var from = '';

        // Tenta pegar o assunto
        var subjectEl = document.querySelector('[aria-label*="Assunto"], [aria-label*="Subject"]');
        if (!subjectEl) {
            // Tenta pelo header do email
            var headerEls = document.querySelectorAll('span[title]');
            headerEls.forEach(function(el) {
                var title = el.getAttribute('title') || '';
                if (title.indexOf('COTA') >= 0 || title.indexOf('FRETE') >= 0 || title.indexOf('RE:') >= 0) {
                    subject = title;
                }
            });
        } else {
            subject = subjectEl.textContent || '';
        }

        // Pega o remetente
        var fromEl = document.querySelector('[aria-label*="De:"], [aria-label*="From:"]');
        if (fromEl) {
            from = fromEl.textContent || '';
        }
        // Fallback: pega do item selecionado na lista
        if (!from) {
            var selectedItem = document.querySelector('[aria-selected="true"], .customScrollBar div[tabindex="0"]');
            if (selectedItem) {
                from = selectedItem.textContent || '';
            }
        }

        // Pega o corpo do email — reading pane
        // Outlook Web usa um iframe ou div pra renderizar o body
        var readingPane = document.querySelector('[role="main"] [aria-label*="Mensagem"], [role="main"] [aria-label*="Message body"], div[aria-label*="corpo da mensagem"], div[aria-label*="message body"]');
        
        if (!readingPane) {
            // Tenta encontrar pelo container do email
            readingPane = document.querySelector('.customScrollBar div[role="document"]');
        }

        if (!readingPane) {
            // Fallback mais amplo - pega todo conteudo visivel apos o header
            var allText = document.querySelector('[role="main"]');
            if (allText) readingPane = allText;
        }

        if (readingPane) {
            emailBody = readingPane.innerText || readingPane.textContent || '';
        }

        // Se nao achou subject pelo aria-label, tenta do titulo da aba
        if (!subject) {
            // Pega pelo first line do email que parece assunto
            var possibleSubject = document.querySelector('h2, [role="heading"]');
            if (possibleSubject) subject = possibleSubject.textContent || '';
        }

        // Assunto como fallback final
        if (!subject) {
            // Tenta do titulo da pagina
            subject = document.title.replace(' - Outlook', '').replace(' - Microsoft Outlook', '');
        }

        return {
            subject: subject.trim(),
            from: from.trim(),
            body: emailBody ? emailBody.trim() : ''
        };
    }

    // ==========================================
    // PROCESSAMENTO DE COTACAO
    // ==========================================

    function processQuotation() {
        var email = getSelectedEmailContent();

        if (!email.body || email.body.length < 20) {
            showToast('Selecione um email antes de pressionar S');
            return;
        }

        setStatus('Lendo email...', true);
        console.log('[Atom Email] Email capturado:', email.subject);
        console.log('[Atom Email] Body length:', email.body.length);

        // Expande o painel
        var panel = document.getElementById('atom-outlook-panel');
        panel.classList.add('expanded');
        restorePanelSize(panel);

        // Mostra loading
        showPreview('<div class="atom-loading"><div class="atom-spinner"></div>Analisando cotacao via Gemini...</div>');

        // Envia pro background processar via Gemini
        chrome.runtime.sendMessage({
            action: 'analyzeQuotationEmail',
            subject: email.subject,
            from: email.from,
            body: email.body
        }, function(response) {
            if (response && response.success && response.data) {
                console.log('[Atom Email] Dados extraidos:', response.data);
                showQuotationPreview(response.data);
                setStatus('Dados extraidos', true);
            } else {
                var error = response ? response.error : 'Erro desconhecido';
                showPreview('<div style="color:#ef4444;padding:20px;">Erro: ' + error + '</div>');
                setStatus('Erro na analise', false);
            }
        });
    }

    // ==========================================
    // PREVIEW DE DADOS
    // ==========================================

    function showQuotationPreview(data) {
        var html = [
            '<div id="atom-outlook-preview">',
            '  <h3>Cotacao Extraida</h3>',
            '  <div class="atom-data-grid">'
        ];

        var fields = [
            ['Cliente', data.cliente, true],
            ['Remetente', data.remetente, false],
            ['Processo Ref.', data.processo_ref, false],
            ['Incoterm', data.incoterm, false],
            ['Equipamento', data.equipamento, true],
            ['Qtd Containers', data.quantidade_containers, true],
            ['Origem', data.origem, true],
            ['Destino', data.destino, true],
            ['Mercadoria', data.mercadoria, false],
            ['NCM', data.ncm, false],
            ['Peso Bruto (KG)', data.peso_bruto, false],
            ['Valor Mercadoria', data.valor_mercadoria, false],
            ['Tipo Operacao', data.modal_tipo, true]
        ];

        fields.forEach(function(f) {
            if (f[1]) {
                html.push('    <span class="data-label">' + f[0] + '</span>');
                html.push('    <span class="data-value' + (f[2] ? ' highlight' : '') + '">' + f[1] + '</span>');
            }
        });

        html.push('  </div>');
        html.push('</div>');

        html.push('<div id="atom-outlook-actions">');
        html.push('  <button class="atom-btn atom-btn-primary" id="atom-confirm-quote">Criar Oferta no Skychart</button>');
        html.push('  <button class="atom-btn atom-btn-secondary" id="atom-cancel-quote">Cancelar</button>');
        html.push('</div>');

        var panel = document.getElementById('atom-outlook-panel');
        // Remove preview anterior se existir
        var oldPreview = panel.querySelector('#atom-outlook-preview');
        if (oldPreview) oldPreview.remove();
        var oldActions = panel.querySelector('#atom-outlook-actions');
        if (oldActions) oldActions.remove();
        var oldRules = panel.querySelector('#atom-client-rules');
        if (oldRules) oldRules.remove();

        panel.insertAdjacentHTML('beforeend', html.join('\n'));

        // Busca regras do cliente na memória e exibe
        loadClientRules(data.cliente);

        // Botao confirmar
        document.getElementById('atom-confirm-quote').addEventListener('click', function() {
            confirmQuotation(data);
        });

        // Botao cancelar
        document.getElementById('atom-cancel-quote').addEventListener('click', function() {
            collapsePanel();
        });
    }

    // Carrega e exibe regras do cliente na memória
    function loadClientRules(clienteName) {
        if (!clienteName) return;
        var clienteKey = 'acordo_' + clienteName.toLowerCase().replace(/\s+/g, '_');

        chrome.storage.local.get(clienteKey, function(data) {
            var rules = data[clienteKey];
            if (!rules) return;

            var panel = document.getElementById('atom-outlook-panel');
            if (!panel) return;

            // Remove anterior se existir
            var old = panel.querySelector('#atom-client-rules');
            if (old) old.remove();

            var rulesHtml = ['<div id="atom-client-rules" style="padding:10px 12px;margin:10px 8px 4px;background:rgba(255,152,0,0.12);border:1px solid rgba(255,152,0,0.25);border-radius:8px;font-size:11px;text-align:center;">'];
            rulesHtml.push('<div style="color:#ff9800;font-weight:bold;margin-bottom:4px;">⚠ Acordo Comercial — ' + (rules.cliente || clienteName) + '</div>');

            var hasContent = false;

            if (rules.incluirIOF) {
                rulesHtml.push('<div style="color:#ffcc02;">✦ IOF: INCLUIR na cotação</div>');
                hasContent = true;
            }

            if (rules.armadoresBloqueados && rules.armadoresBloqueados.length > 0) {
                rulesHtml.push('<div style="color:#ff5252;">✦ NÃO oferecer: ' + rules.armadoresBloqueados.join(', ') + '</div>');
                hasContent = true;
            }

            // Mostra observações do acordo (texto real)
            if (rules.observacoes && rules.observacoes.length > 0) {
                var maxShow = Math.min(rules.observacoes.length, 3);
                for (var oi = 0; oi < maxShow; oi++) {
                    rulesHtml.push('<div style="color:#ccc;font-size:10px;">• ' + rules.observacoes[oi] + '</div>');
                }
                if (rules.observacoes.length > 3) {
                    rulesHtml.push('<div style="color:#888;font-size:10px;">+ ' + (rules.observacoes.length - 3) + ' mais...</div>');
                }
                hasContent = true;
            }

            // Se nao tem observacoes mas tem texto completo, mostra resumo
            if (!hasContent && rules.textoCompleto && rules.textoCompleto.trim().length > 0) {
                rulesHtml.push('<div style="color:#ccc;font-size:10px;">' + rules.textoCompleto.substring(0, 150) + '...</div>');
                hasContent = true;
            }

            if (!hasContent) {
                rulesHtml.push('<div style="color:#888;font-size:10px;">Sem restrições específicas registradas</div>');
            }

            rulesHtml.push('<div style="color:#555;font-size:9px;margin-top:3px;">Atualizado: ' + (rules.lastUpdated || '').substring(0, 10) + '</div>');
            rulesHtml.push('</div>');

            // Insere DEPOIS dos botões de ação
            var actionsDiv = panel.querySelector('#atom-outlook-actions');
            if (actionsDiv) {
                actionsDiv.insertAdjacentHTML('afterend', rulesHtml.join('\n'));
            } else {
                panel.insertAdjacentHTML('beforeend', rulesHtml.join('\n'));
            }

            console.log('[Atom Email] Regras do cliente exibidas:', clienteKey);
        });
    }

    // Escuta mudanças no storage — quando Skychart salva regras do acordo, atualiza o painel
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (areaName !== 'local') return;
        for (var key in changes) {
            if (key.indexOf('acordo_') === 0) {
                console.log('[Atom Email] Regras atualizadas no storage:', key);
                // Remove regras antigas e exibe as novas
                var panel = document.getElementById('atom-outlook-panel');
                if (!panel) return;
                var oldRules = panel.querySelector('#atom-client-rules');
                if (oldRules) oldRules.remove();

                var rules = changes[key].newValue;
                if (!rules) return;

                var rulesHtml = ['<div id="atom-client-rules" style="padding:8px 10px;background:rgba(255,152,0,0.15);border-top:1px solid rgba(255,152,0,0.3);font-size:11px;">'];
                rulesHtml.push('<div style="color:#ff9800;font-weight:bold;margin-bottom:4px;">⚠ Acordo Comercial — ' + (rules.cliente || '') + '</div>');

                if (rules.incluirIOF) {
                    rulesHtml.push('<div style="color:#ffcc02;">✦ IOF: INCLUIR na cotação</div>');
                }

                if (rules.armadoresBloqueados && rules.armadoresBloqueados.length > 0) {
                    rulesHtml.push('<div style="color:#ff5252;">✦ NÃO oferecer: ' + rules.armadoresBloqueados.join(', ') + '</div>');
                }

                if (rules.observacoes && rules.observacoes.length > 0) {
                    var maxShow = Math.min(rules.observacoes.length, 4);
                    for (var oi = 0; oi < maxShow; oi++) {
                        rulesHtml.push('<div style="color:#ccc;font-size:10px;">• ' + rules.observacoes[oi] + '</div>');
                    }
                    if (rules.observacoes.length > 4) {
                        rulesHtml.push('<div style="color:#888;font-size:10px;">+ ' + (rules.observacoes.length - 4) + ' regras mais...</div>');
                    }
                }

                rulesHtml.push('</div>');

                // Insere DEPOIS dos botões ou no final
                var actionsDiv = panel.querySelector('#atom-outlook-actions');
                if (actionsDiv) {
                    actionsDiv.insertAdjacentHTML('afterend', rulesHtml.join('\n'));
                } else {
                    panel.insertAdjacentHTML('beforeend', rulesHtml.join('\n'));
                }

                console.log('[Atom Email] Regras do acordo exibidas em tempo real!');
            }
        }
    });

    function showPreview(html) {
        var panel = document.getElementById('atom-outlook-panel');
        var oldPreview = panel.querySelector('#atom-outlook-preview');
        if (oldPreview) oldPreview.remove();
        var oldActions = panel.querySelector('#atom-outlook-actions');
        if (oldActions) oldActions.remove();

        var previewDiv = document.createElement('div');
        previewDiv.id = 'atom-outlook-preview';
        previewDiv.innerHTML = html;
        panel.appendChild(previewDiv);
    }

    // ==========================================
    // CONFIRMAR E ENVIAR PRO SKYCHART
    // ==========================================

    function confirmQuotation(data) {
        setStatus('Abrindo Skychart...', true);

        // Salva dados no storage pra o content.js do Skychart processar
        chrome.storage.local.set({
            pendingQuotation: data
        }, function() {
            console.log('[Atom Email] Dados salvos, abrindo Skychart ofertas...');

            // Envia mensagem pro background abrir aba do Skychart
            chrome.runtime.sendMessage({
                action: 'openSkychartOferta',
                data: data
            });

            showToast('Abrindo Skychart - Ofertas...');
            collapsePanel();
        });
    }

    // ==========================================
    // PROCESSAMENTO DE BOOKING
    // ==========================================

    function processBooking() {
        var email = getSelectedEmailContent();

        if (!email.body || email.body.length < 20) {
            showToast('Selecione um email de booking antes de pressionar W');
            return;
        }

        setStatus('Lendo booking...', true);
        console.log('[Atom Email] Booking email capturado:', email.subject);

        var panel = document.getElementById('atom-outlook-panel');
        panel.classList.add('expanded');
        restorePanelSize(panel);

        showPreview('<div class="atom-loading"><div class="atom-spinner"></div>Analisando booking via Gemini...</div>');

        chrome.runtime.sendMessage({
            action: 'analyzeBookingEmail',
            subject: email.subject,
            from: email.from,
            body: email.body
        }, function(response) {
            if (response && response.success && response.data) {
                console.log('[Atom Email] Booking extraido:', response.data);
                showBookingPreview(response.data);
                setStatus('Booking extraido', true);
            } else {
                var error = response ? response.error : 'Erro desconhecido';
                showPreview('<div style="color:#ef4444;padding:20px;">Erro: ' + error + '</div>');
                setStatus('Erro na analise', false);
            }
        });
    }

    function showBookingPreview(data) {
        var html = [
            '<div id="atom-outlook-preview">',
            '  <h3>Booking Extraido</h3>',
            '  <div class="atom-data-grid">'
        ];

        var fields = [
            ['Processo', data.processo, true],
            ['Booking', data.booking_number, true],
            ['Armador', data.armador, true],
            ['Navio', data.navio, false],
            ['Viagem', data.viagem, false],
            ['Origem', data.origem, true],
            ['Destino', data.destino, true],
            ['Container', (data.container_qtd || '') + ' x ' + (data.container_tipo || ''), false],
            ['ETD', data.etd, true],
            ['ETA', data.eta, false],
            ['Free Time', data.free_time, true],
            ['Rate', data.rate, false]
        ];

        fields.forEach(function(f) {
            if (f[1]) {
                html.push('    <span class="data-label">' + f[0] + '</span>');
                html.push('    <span class="data-value' + (f[2] ? ' highlight' : '') + '">' + f[1] + '</span>');
            }
        });

        html.push('  </div>');
        html.push('</div>');

        html.push('<div id="atom-outlook-actions">');
        html.push('  <button class="atom-btn atom-btn-primary" id="atom-confirm-booking">Preencher Embarque</button>');
        html.push('  <button class="atom-btn atom-btn-secondary" id="atom-cancel-booking">Cancelar</button>');
        html.push('</div>');

        var panel = document.getElementById('atom-outlook-panel');
        var oldPreview = panel.querySelector('#atom-outlook-preview');
        if (oldPreview) oldPreview.remove();
        var oldActions = panel.querySelector('#atom-outlook-actions');
        if (oldActions) oldActions.remove();
        var oldRules = panel.querySelector('#atom-client-rules');
        if (oldRules) oldRules.remove();

        panel.insertAdjacentHTML('beforeend', html.join('\n'));

        document.getElementById('atom-confirm-booking').addEventListener('click', function() {
            confirmBooking(data);
        });

        document.getElementById('atom-cancel-booking').addEventListener('click', function() {
            collapsePanel();
        });
    }

    function confirmBooking(data) {
        setStatus('Abrindo Skychart...', true);

        chrome.storage.local.set({
            pendingBooking: data
        }, function() {
            console.log('[Atom Email] Booking salvo, abrindo Skychart operacional...');

            chrome.runtime.sendMessage({
                action: 'openSkychartBooking',
                data: data
            });

            showToast('Abrindo Skychart - Operacional...');
            collapsePanel();
        });
    }

    // ==========================================
    // UTILIDADES
    // ==========================================

    function collapsePanel() {
        var panel = document.getElementById('atom-outlook-panel');
        panel.classList.remove('expanded');
        // Limpa estilos inline pra voltar ao tamanho compacto do CSS
        panel.style.width = '';
        panel.style.height = '';
        var preview = panel.querySelector('#atom-outlook-preview');
        if (preview) preview.remove();
        var actions = panel.querySelector('#atom-outlook-actions');
        if (actions) actions.remove();
        var rules = panel.querySelector('#atom-client-rules');
        if (rules) rules.remove();
        setStatus('Pronto', false);
    }

    function setStatus(text, active) {
        var statusEl = document.getElementById('atom-email-status');
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.className = 'atom-status' + (active ? ' active' : '');
        }
    }

    function showToast(message) {
        var toast = document.createElement('div');
        toast.className = 'atom-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function() {
            toast.remove();
        }, 3000);
    }

    // ==========================================
    // KEYBOARD SHORTCUTS
    // ==========================================

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Ignora se estiver digitando num input/textarea
            var tag = (e.target.tagName || '').toLowerCase();
            var isEditable = e.target.isContentEditable || tag === 'input' || tag === 'textarea';
            if (isEditable) return;

            // S = Cotacao
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Atom Email] Atalho S pressionado - Cotacao');
                processQuotation();
            }

            // W = Booking
            if (e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Atom Email] Atalho W pressionado - Booking');
                processBooking();
            }
        }, true); // capture phase pra pegar antes do Outlook

        console.log('[Atom Email] Atalhos de teclado configurados');
    }

    // ==========================================
    // INIT
    // ==========================================

    function init() {
        createPanel();
        setupKeyboardShortcuts();
        setStatus('Pronto', false);
        console.log('[Atom Email] Agente inicializado');
    }

    function safeInit() {
        chrome.storage.local.get('enabledAgents', function(d) {
            var agents = d.enabledAgents || ['cambio','serasa','frete','tracking','cotacao'];
            if (agents.indexOf('cotacao') < 0) {
                console.log('[Atom Email] Agente desabilitado pelo perfil');
                return;
            }
            init();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(safeInit, 2000);
        });
    } else {
        setTimeout(safeInit, 2000);
    }

    // ==========================================
    // DEMURRAGE PANEL
    // ==========================================

    var _demurrageOpen = false;
    var _demurrageCache = null;
    var DEMURRAGE_EMAIL = 'jose.kizner@mondshipping.com.br';

    function toggleDemurragePanel() {
        var panel = document.getElementById('atom-demurrage-panel');
        if (!panel) return;

        _demurrageOpen = !_demurrageOpen;

        if (_demurrageOpen) {
            panel.style.display = 'block';
            panel.innerHTML = '<div style="padding:12px;color:#a5b4fc;font-size:12px;display:flex;align-items:center;gap:8px;"><div class="atom-spinner"></div>Carregando dados de demurrage...</div>';

            // Expand parent
            var mainPanel = document.getElementById('atom-outlook-panel');
            if (mainPanel) mainPanel.classList.add('expanded');

            chrome.runtime.sendMessage({ action: 'fetchDemurrageData' }, function(response) {
                if (response && response.success) {
                    _demurrageCache = response.data;
                    renderDemurragePanel(response.data);
                    autoSendDemurrageReport(response.data);
                } else {
                    panel.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Erro ao carregar dados: ' + (response ? response.error : 'sem resposta') + '</div>';
                }
            });
        } else {
            panel.style.display = 'none';
            var mainPanel2 = document.getElementById('atom-outlook-panel');
            if (mainPanel2) mainPanel2.classList.remove('expanded');
        }
    }

    function renderDemurragePanel(processes) {
        var panel = document.getElementById('atom-demurrage-panel');
        if (!panel) return;

        var expirados = processes.filter(function(p) { return p.status === 'expirado'; });
        var alerta = processes.filter(function(p) { return p.status === 'alerta'; });
        var ok = processes.filter(function(p) { return p.status === 'ok'; });
        var finalizado = processes.filter(function(p) { return p.status === 'finalizado'; });

        var html = [];
        html.push('<div style="padding:10px 12px;border-top:1px solid rgba(99,102,241,0.15);">');

        // Summary badges
        html.push('<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">');
        html.push('<span style="padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:rgba(239,68,68,0.15);color:#fca5a5;">' + expirados.length + ' Expirados</span>');
        html.push('<span style="padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:rgba(245,158,11,0.15);color:#fbbf24;">' + alerta.length + ' Alerta</span>');
        html.push('<span style="padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:rgba(34,197,94,0.15);color:#86efac;">' + ok.length + ' OK</span>');
        html.push('<span style="padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:rgba(148,163,184,0.1);color:#94a3b8;">' + finalizado.length + ' Devolvidos</span>');
        html.push('</div>');

        // Table of risky processes
        var risky = expirados.concat(alerta).slice(0, 20);
        if (risky.length > 0) {
            html.push('<div style="max-height:240px;overflow-y:auto;">');
            html.push('<table style="width:100%;border-collapse:collapse;font-size:10px;">');
            html.push('<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">');
            html.push('<th style="padding:4px 6px;color:#64748b;text-align:left;">Processo</th>');
            html.push('<th style="padding:4px 6px;color:#64748b;text-align:left;">Cliente</th>');
            html.push('<th style="padding:4px 6px;color:#64748b;text-align:center;">Dias</th>');
            html.push('<th style="padding:4px 6px;color:#64748b;text-align:center;">Status</th>');
            html.push('</tr>');

            risky.forEach(function(p) {
                var statusColor = p.status === 'expirado' ? '#ef4444' : '#f59e0b';
                var statusBg = p.status === 'expirado' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)';
                var statusLabel = p.status === 'expirado' ? p.diasAtrasados + 'd atrasado' : p.diasRestantes + 'd restante';

                html.push('<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">');
                html.push('<td style="padding:4px 6px;color:#e2e8f0;font-weight:600;">' + (p.processo || '?') + '</td>');
                html.push('<td style="padding:4px 6px;color:#cbd5e1;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (p.cliente || '?') + '</td>');
                html.push('<td style="padding:4px 6px;text-align:center;color:' + statusColor + ';font-weight:700;">' + (p.status === 'expirado' ? '-' + p.diasAtrasados : p.diasRestantes) + '</td>');
                html.push('<td style="padding:4px 6px;text-align:center;"><span style="padding:2px 6px;border-radius:8px;font-size:9px;background:' + statusBg + ';color:' + statusColor + ';">' + statusLabel + '</span></td>');
                html.push('</tr>');
            });

            html.push('</table></div>');
        } else {
            html.push('<div style="color:#86efac;font-size:11px;padding:10px;">Nenhum processo com risco de demurrage.</div>');
        }

        html.push('</div>');
        panel.innerHTML = html.join('');
    }

    function autoSendDemurrageReport(processes) {
        var expirados = processes.filter(function(p) { return p.status === 'expirado'; });
        var alerta = processes.filter(function(p) { return p.status === 'alerta'; });
        if (expirados.length === 0 && alerta.length === 0) return;

        var cooldownKey = 'demurrage_report_last';
        chrome.storage.local.get(cooldownKey, function(data) {
            var last = data[cooldownKey];
            if (last) {
                var diff = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
                if (diff < 24) return;
            }

            var today = new Date();
            var dateStr = today.toLocaleDateString('pt-BR');

            var lines = [];
            lines.push('DEMURRAGE REPORT - ' + dateStr);
            lines.push('');
            lines.push(expirados.length + ' expirados | ' + alerta.length + ' alerta | ' + processes.length + ' total');
            lines.push('');

            if (expirados.length > 0) {
                lines.push('EXPIRADOS:');
                expirados.slice(0, 15).forEach(function(p, i) {
                    lines.push((i + 1) + '. ' + p.processo + ' - ' + p.cliente + ' - ' + p.diasAtrasados + 'd atrasado - ' + (p.container || '?'));
                });
                if (expirados.length > 15) lines.push('... e mais ' + (expirados.length - 15));
            }

            if (alerta.length > 0) {
                lines.push('');
                lines.push('ALERTA:');
                alerta.slice(0, 10).forEach(function(p, i) {
                    lines.push((i + 1) + '. ' + p.processo + ' - ' + p.cliente + ' - ' + p.diasRestantes + 'd restante');
                });
            }

            lines.push('');
            lines.push('Atom - Mond Shipping');

            var body = lines.join('\n');
            var subject = 'Demurrage - ' + expirados.length + ' expirados | ' + dateStr;

            var composeUrl = 'https://outlook.office.com/mail/deeplink/compose?to=' +
                encodeURIComponent(DEMURRAGE_EMAIL) +
                '&subject=' + encodeURIComponent(subject) +
                '&body=' + encodeURIComponent(body);

            window.open(composeUrl, '_blank');

            var obj = {};
            obj[cooldownKey] = new Date().toISOString();
            chrome.storage.local.set(obj);
            console.log('[Atom Demurrage] Report aberto no Outlook');
        });
    }

})();

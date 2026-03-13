// outlook-agent.js — Atom Email Agent para Outlook Web
// Atalhos de teclado para classificar emails e processar via Gemini

(function() {
    'use strict';

    // Permission check (flag-based, nao modifica estrutura)
    var _agentAllowed = true;
    chrome.storage.local.get('enabledAgents', function(d) {
        if (d.enabledAgents && d.enabledAgents.indexOf('cotacao') < 0) {
            _agentAllowed = false;
            var panel = document.getElementById('atom-outlook-panel');
            if (panel) panel.remove();
            console.log('[Outlook] Agente desabilitado pelo perfil');
        }
    });

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
            '  </div>',
            '  <span class="atom-status" id="atom-email-status">Pronto</span>',
            '</div>'
        ].join('\n');

        document.body.appendChild(panel);

        // Click nos shortcuts
        var shortcuts = panel.querySelectorAll('.atom-shortcut');
        shortcuts.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var action = btn.getAttribute('data-action');
                if (action === 'quote') processQuotation();
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

            var rulesHtml = ['<div id="atom-client-rules" style="padding:8px 10px;background:rgba(255,152,0,0.15);border-top:1px solid rgba(255,152,0,0.3);font-size:11px;">'];
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

            // Insere antes dos botões de ação
            var actionsDiv = panel.querySelector('#atom-outlook-actions');
            if (actionsDiv) {
                actionsDiv.insertAdjacentHTML('beforebegin', rulesHtml.join('\n'));
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

                // Insere antes dos botões ou no final
                var actionsDiv = panel.querySelector('#atom-outlook-actions');
                if (actionsDiv) {
                    actionsDiv.insertAdjacentHTML('beforebegin', rulesHtml.join('\n'));
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
        }, true); // capture phase pra pegar antes do Outlook

        console.log('[Atom Email] Atalhos de teclado configurados');
    }

    // ==========================================
    // INIT
    // ==========================================

    function init() {
        if (!_agentAllowed) { console.log('[Outlook] Bloqueado pelo perfil'); return; }
        createPanel();
        setupKeyboardShortcuts();
        setStatus('Pronto', false);
        console.log('[Atom Email] Agente inicializado');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, 2000);
        });
    } else {
        setTimeout(init, 2000);
    }

})();

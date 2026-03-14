// ============================================================
// FREQUENCY AGENT — Monitor de Frequência de Cotação
// Roda em /app/oferta, analisa recência de cotação por cliente
// ============================================================
(function() {
    'use strict';

    var TAG = '[Freq Agent]';
    var API_URL = 'https://server-mond.tail46f98e.ts.net/api/comercial';
    var API_TOKEN = 'b2e7c1f4-8a2d-4e3b-9c6a-7f1e2d5a9b3c';
    var ALERT_EMAIL = 'jose.kizner@mondshipping.com.br';
    var COOLDOWN_DAYS = 7;
    var panelCreated = false;

    function isContextValid() {
        try { return !!chrome.runtime && !!chrome.runtime.id; } catch(e) { return false; }
    }

    // ===== DETECTA MÓDULO =====
    function isOfertaPage() {
        return location.href.indexOf('/app/oferta') >= 0;
    }

    // ===== CRIA PAINEL =====
    function createPanel() {
        if (panelCreated || document.getElementById('atom-freq-panel')) return;
        panelCreated = true;

        var panel = document.createElement('div');
        panel.id = 'atom-freq-panel';
        panel.innerHTML = [
            '<div id="atom-freq-bar">',
            '  <div class="freq-logo">F</div>',
            '  <span class="freq-title">FREQUÊNCIA</span>',
            '  <span class="freq-badge ok" id="freq-badge">—</span>',
            '  <span class="freq-minimize" id="freq-minimize" style="display:none;">▼</span>',
            '</div>',
            '<div id="atom-freq-content"></div>'
        ].join('\n');

        document.body.appendChild(panel);

        // Click na barra expande/colapsa
        document.getElementById('atom-freq-bar').addEventListener('click', function(e) {
            if (e.target.id === 'freq-minimize') return;
            togglePanel();
        });

        document.getElementById('freq-minimize').addEventListener('click', function(e) {
            e.stopPropagation();
            collapsePanel();
        });

        console.log(TAG, 'Painel criado');
    }

    function togglePanel() {
        var panel = document.getElementById('atom-freq-panel');
        if (panel.classList.contains('expanded')) {
            collapsePanel();
        } else {
            expandPanel();
        }
    }

    function expandPanel() {
        var panel = document.getElementById('atom-freq-panel');
        panel.classList.add('expanded');
        document.getElementById('freq-minimize').style.display = '';
        loadData();
    }

    function collapsePanel() {
        var panel = document.getElementById('atom-freq-panel');
        panel.classList.remove('expanded');
        document.getElementById('freq-minimize').style.display = 'none';
    }

    // ===== BUSCA DADOS DA API =====
    function loadData() {
        var content = document.getElementById('atom-freq-content');
        content.innerHTML = '<div class="freq-loading"><div class="freq-spinner"></div>Carregando dados da API comercial...</div>';

        // Pede pro background.js buscar
        chrome.runtime.sendMessage({ action: 'fetchFrequencyData' }, function(response) {
            if (!response || !response.success) {
                content.innerHTML = '<div style="color:#f87171;padding:16px;">Erro ao carregar dados: ' + (response ? response.error : 'sem resposta') + '</div>';
                return;
            }
            processAndRender(response.data);
        });
    }

    // ===== CALCULO DE FREQUÊNCIA =====
    function processAndRender(quotes) {
        // Agrupa por cliente
        var clientMap = {};
        quotes.forEach(function(q) {
            if (!q.DS_CLIENTE) return;
            var name = cleanName(q.DS_CLIENTE);
            if (!clientMap[name]) {
                clientMap[name] = {
                    name: name,
                    originalName: q.DS_CLIENTE,
                    dates: [],
                    vendedor: q.DS_RESPONSAVEL_VENDEDOR || '',
                    insideSales: q.DS_RESPONSAVEL_INSIDE_SALES || '',
                    totalQuotes: 0,
                    approved: 0,
                    lastOrigin: q.DS_ORIGEM_CARGA || '',
                    lastDest: q.DS_DESTINO || ''
                };
            }
            var c = clientMap[name];
            c.totalQuotes++;
            if (q.DT_ABERTURA) {
                var d = new Date(q.DT_ABERTURA);
                if (!isNaN(d.getTime())) c.dates.push(d);
            }
            if (q.DS_ANALISE && q.DS_ANALISE.indexOf('Aprovada') >= 0) c.approved++;
            if (q.DS_RESPONSAVEL_VENDEDOR) c.vendedor = q.DS_RESPONSAVEL_VENDEDOR;
            if (q.DS_RESPONSAVEL_INSIDE_SALES) c.insideSales = q.DS_RESPONSAVEL_INSIDE_SALES;
        });

        // Calcula frequência pra cada cliente
        var clients = [];
        var now = new Date();

        for (var name in clientMap) {
            var c = clientMap[name];
            if (c.dates.length < 2) continue; // Precisa de pelo menos 2 cotações

            // Ordena por data
            c.dates.sort(function(a, b) { return a - b; });

            // Calcula gaps
            var gaps = [];
            for (var i = 1; i < c.dates.length; i++) {
                var gap = (c.dates[i] - c.dates[i-1]) / (1000 * 60 * 60 * 24);
                if (gap > 0 && gap < 180) gaps.push(gap); // Ignora gaps > 6 meses
            }

            if (gaps.length === 0) continue;

            // Remove outliers (> 3x mediana)
            gaps.sort(function(a, b) { return a - b; });
            var median = gaps[Math.floor(gaps.length / 2)];
            var filtered = gaps.filter(function(g) { return g <= median * 3; });
            if (filtered.length === 0) filtered = gaps;

            // Média
            var avgGap = filtered.reduce(function(s, g) { return s + g; }, 0) / filtered.length;

            // Dias desde última cotação
            var lastDate = c.dates[c.dates.length - 1];
            var daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);

            // Status
            var status = 'ok';
            var ratio = daysSince / avgGap;
            if (ratio >= 1.3) status = 'atrasado';
            else if (ratio >= 0.9) status = 'atencao';

            clients.push({
                name: c.name,
                originalName: c.originalName,
                vendedor: c.vendedor,
                insideSales: c.insideSales,
                totalQuotes: c.totalQuotes,
                approved: c.approved,
                avgGapDays: Math.round(avgGap * 10) / 10,
                daysSinceLast: Math.round(daysSince * 10) / 10,
                lastDate: lastDate,
                ratio: ratio,
                status: status,
                origin: c.lastOrigin,
                dest: c.lastDest
            });
        }

        // Ordena: atrasados primeiro, depois por ratio decrescente
        clients.sort(function(a, b) {
            var sa = a.status === 'atrasado' ? 0 : a.status === 'atencao' ? 1 : 2;
            var sb = b.status === 'atrasado' ? 0 : b.status === 'atencao' ? 1 : 2;
            if (sa !== sb) return sa - sb;
            return b.ratio - a.ratio;
        });

        renderPanel(clients);

        // Auto-notifica atrasados
        autoNotify(clients.filter(function(c) { return c.status === 'atrasado'; }));
    }

    function cleanName(name) {
        if (!name) return 'DESCONHECIDO';
        var clean = name.toUpperCase().trim();
        clean = clean.split('-')[0].trim();
        clean = clean.split('(')[0].trim();
        var suffixes = [' LTDA', ' S.A.', ' S.A', ' S/A', ' SA', ' EIRELI', ' ME', ' EPP'];
        for (var i = 0; i < suffixes.length; i++) {
            if (clean.endsWith(suffixes[i])) {
                clean = clean.substring(0, clean.length - suffixes[i].length).trim();
                break;
            }
        }
        return clean;
    }

    // ===== RENDER =====
    function renderPanel(clients) {
        var atrasados = clients.filter(function(c) { return c.status === 'atrasado'; }).length;
        var atencao = clients.filter(function(c) { return c.status === 'atencao'; }).length;
        var ok = clients.filter(function(c) { return c.status === 'ok'; }).length;

        // Update badge
        var badge = document.getElementById('freq-badge');
        if (atrasados > 0) {
            badge.textContent = atrasados;
            badge.className = 'freq-badge';
        } else {
            badge.textContent = '✓';
            badge.className = 'freq-badge ok';
        }

        var html = [];

        // Stats
        html.push('<div class="freq-stats">');
        html.push('  <div class="freq-stat"><div class="freq-stat-value red">' + atrasados + '</div><div class="freq-stat-label">Atrasados</div></div>');
        html.push('  <div class="freq-stat"><div class="freq-stat-value yellow">' + atencao + '</div><div class="freq-stat-label">Atenção</div></div>');
        html.push('  <div class="freq-stat"><div class="freq-stat-value green">' + ok + '</div><div class="freq-stat-label">Em dia</div></div>');
        html.push('  <div class="freq-stat"><div class="freq-stat-value">' + clients.length + '</div><div class="freq-stat-label">Total</div></div>');
        html.push('</div>');

        // Tabela
        html.push('<table class="freq-table">');
        html.push('<thead><tr>');
        html.push('  <th>Cliente</th><th>Vendedor</th><th>Freq. Média</th><th>Última Cotação</th><th>Dias sem cotar</th><th>Status</th><th></th>');
        html.push('</tr></thead><tbody>');

        var max = Math.min(clients.length, 50); // Max 50 na view
        for (var i = 0; i < max; i++) {
            var c = clients[i];
            var rowClass = c.status === 'atrasado' ? 'risk-high' : c.status === 'atencao' ? 'risk-medium' : 'risk-ok';
            var statusLabel = c.status === 'atrasado' ? 'Atrasado' : c.status === 'atencao' ? 'Atenção' : 'OK';
            var statusClass = c.status;
            var lastDateStr = c.lastDate ? c.lastDate.toLocaleDateString('pt-BR') : '—';

            html.push('<tr class="' + rowClass + '" data-client="' + encodeURIComponent(JSON.stringify(c)) + '">');
            html.push('  <td title="' + c.originalName + '"><strong>' + c.name.substring(0, 28) + '</strong></td>');
            html.push('  <td>' + (c.vendedor || '—').split(' ')[0] + '</td>');
            html.push('  <td>' + c.avgGapDays + ' dias</td>');
            html.push('  <td>' + lastDateStr + '</td>');
            html.push('  <td><strong>' + Math.round(c.daysSinceLast) + '</strong> dias</td>');
            html.push('  <td><span class="freq-status ' + statusClass + '">' + statusLabel + '</span></td>');

            if (c.status === 'atrasado' || c.status === 'atencao') {
                html.push('  <td><button class="freq-email-btn" data-idx="' + i + '">📧 Email</button></td>');
            } else {
                html.push('  <td></td>');
            }

            html.push('</tr>');
        }

        html.push('</tbody></table>');

        // Container de email (escondido)
        html.push('<div id="freq-email-zone"></div>');

        var content = document.getElementById('atom-freq-content');
        content.innerHTML = html.join('\n');

        // Bind nos botões de email
        content.querySelectorAll('.freq-email-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var row = btn.closest('tr');
                var clientData = JSON.parse(decodeURIComponent(row.getAttribute('data-client')));
                openEmailDraft(clientData);
            });
        });

        // Salva dados pra referência
        window._freqClients = clients;
    }

    // ===== EMAIL DRAFT =====
    function openEmailDraft(client) {
        var zone = document.getElementById('freq-email-zone');
        zone.innerHTML = '<div class="freq-loading"><div class="freq-spinner"></div>Gemini gerando email para ' + client.name + '...</div>';

        // Manda pro Gemini gerar
        chrome.runtime.sendMessage({
            action: 'generateChurnEmail',
            client: {
                name: client.originalName,
                avgGapDays: client.avgGapDays,
                daysSinceLast: Math.round(client.daysSinceLast),
                vendedor: client.vendedor,
                origin: client.origin,
                dest: client.dest,
                totalQuotes: client.totalQuotes,
                approved: client.approved
            }
        }, function(response) {
            if (!response || !response.success) {
                zone.innerHTML = '<div style="color:#f87171;padding:12px;">Erro ao gerar email: ' + (response ? response.error : 'sem resposta') + '</div>';
                return;
            }

            var draft = response.data;
            var html = [
                '<div class="freq-email-draft">',
                '  <h4>📧 Email para: ' + client.originalName + '</h4>',
                '  <div style="color:#64748b;font-size:10px;margin-bottom:8px;">Assunto: ' + (draft.subject || 'Acompanhamento de cotação') + '</div>',
                '  <textarea id="freq-email-body">' + (draft.body || '') + '</textarea>',
                '  <div class="freq-email-actions">',
                '    <button class="freq-btn-send" id="freq-send-email">Enviar via Outlook</button>',
                '    <button class="freq-btn-cancel" id="freq-cancel-email">Cancelar</button>',
                '  </div>',
                '</div>'
            ].join('\n');

            zone.innerHTML = html;

            // Bind
            document.getElementById('freq-send-email').addEventListener('click', function() {
                sendViaOutlook(draft.subject || 'Acompanhamento de cotação', document.getElementById('freq-email-body').value, client);
            });
            document.getElementById('freq-cancel-email').addEventListener('click', function() {
                zone.innerHTML = '';
            });
        });
    }

    // ===== ENVIO VIA OUTLOOK WEB =====
    function sendViaOutlook(subject, body, client) {
        // Abre uma nova aba do Outlook Web com compose pré-preenchido
        var encodedSubject = encodeURIComponent(subject);
        var encodedBody = encodeURIComponent(body);
        // Outlook Web deeplink pra compose
        var composeUrl = 'https://outlook.office.com/mail/deeplink/compose?subject=' + encodedSubject + '&body=' + encodedBody;

        window.open(composeUrl, '_blank');

        // Salva que enviamos alerta pra esse cliente (cooldown)
        var cooldownKey = 'freq_alert_' + client.name.replace(/\s+/g, '_');
        var data = {};
        data[cooldownKey] = { sentAt: new Date().toISOString(), client: client.name };
        chrome.storage.local.set(data);

        console.log(TAG, 'Email draft aberto via Outlook pra:', client.name);
    }

    // ===== AUTO-NOTIFICAÇÃO PRO MASTER =====
    function autoNotify(atrasados) {
        if (atrasados.length === 0) return;

        // Verifica cooldown
        var keys = atrasados.map(function(c) { return 'freq_notify_' + c.name.replace(/\s+/g, '_'); });
        chrome.storage.local.get(keys, function(data) {
            var now = new Date();
            var toNotify = [];

            atrasados.forEach(function(c) {
                var key = 'freq_notify_' + c.name.replace(/\s+/g, '_');
                var last = data[key];
                if (last && last.sentAt) {
                    var diff = (now - new Date(last.sentAt)) / (1000 * 60 * 60 * 24);
                    if (diff < COOLDOWN_DAYS) return; // Cooldown ativo
                }
                toNotify.push(c);
            });

            if (toNotify.length === 0) return;

            // Monta resumo e envia pro master
            var lines = toNotify.map(function(c) {
                return c.name + ': cota a cada ' + c.avgGapDays + ' dias, está há ' + Math.round(c.daysSinceLast) + ' dias sem cotar';
            });

            var subject = '⚠ Atom Frequência: ' + toNotify.length + ' cliente(s) atrasado(s)';
            var body = 'Olá José,\n\nOs seguintes clientes estão com frequência de cotação abaixo do esperado:\n\n' + lines.join('\n') + '\n\nAcesse o Skychart > Ofertas para mais detalhes.\n\nAtom Agent';

            // Abre compose no Outlook em background
            var composeUrl = 'https://outlook.office.com/mail/deeplink/compose?to=' + encodeURIComponent(ALERT_EMAIL) + '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

            // Não abre automaticamente — salva pra notificação Chrome
            chrome.runtime.sendMessage({
                action: 'healthCheckAlert',
                data: {
                    modulo: 'Frequência',
                    total: atrasados.length,
                    passed: 0,
                    failures: lines.slice(0, 5),
                    profile: 'master',
                    url: location.href,
                    timestamp: now.toISOString()
                }
            });

            // Marca cooldown
            toNotify.forEach(function(c) {
                var key = 'freq_notify_' + c.name.replace(/\s+/g, '_');
                var obj = {};
                obj[key] = { sentAt: now.toISOString(), client: c.name };
                chrome.storage.local.set(obj);
            });

            console.log(TAG, 'Notificação enviada pro Master:', toNotify.length, 'clientes atrasados');
        });
    }

    // ===== INIT =====
    function init() {
        if (!isOfertaPage()) return;
        createPanel();
        console.log(TAG, 'Agente inicializado em /app/oferta');
    }

    function safeInit() {
        if (!isContextValid()) return;
        chrome.storage.local.get('enabledAgents', function(d) {
            var agents = d.enabledAgents || ['cambio','serasa','frete','tracking','cotacao','frequencia'];
            if (agents.indexOf('frequencia') < 0) {
                console.log(TAG, 'Agente desabilitado pelo perfil');
                return;
            }
            init();
        });
    }

    // Observer: detecta navegação SPA
    var lastUrl = location.href;
    var urlCheckInterval = setInterval(function() {
        if (!isContextValid()) { clearInterval(urlCheckInterval); return; }
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            panelCreated = false;
            var old = document.getElementById('atom-freq-panel');
            if (old) old.remove();
            if (isOfertaPage()) init();
        }
    }, 2000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(safeInit, 3000); });
    } else {
        setTimeout(safeInit, 3000);
    }

    console.log(TAG, 'Script carregado');

})();

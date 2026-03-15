// ============================================================
// FREQUENCY AGENT — Monitor de Frequência de Cotação
// Roda em /app/oferta, analisa recência de cotação por cliente
// v2 — cache local, ordenação por coluna, cot/mês
// ============================================================
(function() {
    'use strict';

    var TAG = '[Freq Agent]';
    var ALERT_EMAIL = 'jose.kizner@mondshipping.com.br';
    var COOLDOWN_DAYS = 7;
    var panelCreated = false;

    // ===== CACHE =====
    var _cachedClients = null;
    var _cacheTime = 0;
    var CACHE_TTL = 10 * 60 * 1000; // 10 minutos

    // ===== SORT STATE =====
    var _sortCol = 'daysSinceLast';
    var _sortDir = -1; // -1 = desc, 1 = asc

    // ===== FILTER STATE =====
    var _filterStatus = null; // null = todos, 'atrasado', 'atencao', 'ok'

    function isContextValid() {
        try { return !!chrome.runtime && !!chrome.runtime.id; } catch(e) { return false; }
    }

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

        // Se tem cache válido, renderiza direto
        if (_cachedClients && (Date.now() - _cacheTime < CACHE_TTL)) {
            console.log(TAG, 'Usando cache local (' + _cachedClients.length + ' clientes)');
            renderPanel(_cachedClients);
        } else {
            loadData();
        }
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

        chrome.runtime.sendMessage({ action: 'fetchFrequencyData' }, function(response) {
            if (!response || !response.success) {
                content.innerHTML = '<div style="color:#f87171;padding:16px;">Erro ao carregar dados: ' + (response ? response.error : 'sem resposta') + '</div>';
                return;
            }
            processData(response.data);
        });
    }

    // ===== CALCULO DE FREQUÊNCIA =====
    function processData(quotes) {
        var clientMap = {};
        var now = new Date();
        var thisMonth = now.getMonth();
        var thisYear = now.getFullYear();

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
                    rejected: 0,
                    openQuotes: 0,
                    totalValue: 0,
                    approvedValue: 0,
                    quotesThisMonth: 0,
                    lastOrigin: q.DS_ORIGEM_CARGA || '',
                    lastDest: q.DS_DESTINO || ''
                };
            }
            var c = clientMap[name];
            c.totalQuotes++;
            if (q.DT_ABERTURA) {
                var d = new Date(q.DT_ABERTURA);
                if (!isNaN(d.getTime())) {
                    c.dates.push(d);
                    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) c.quotesThisMonth++;
                }
            }
            // Status da cotação
            var analise = (q.DS_ANALISE || '').toLowerCase();
            if (analise.indexOf('aprovad') >= 0) c.approved++;
            else if (analise.indexOf('reprovad') >= 0 || analise.indexOf('recusad') >= 0 || analise.indexOf('perdid') >= 0) c.rejected++;
            else c.openQuotes++;
            // Valor
            var val = parseFloat(q.VL_MC) || 0;
            if (val) c.totalValue += val;
            if (analise.indexOf('aprovad') >= 0 && val) c.approvedValue += val;
            if (q.DS_RESPONSAVEL_VENDEDOR) c.vendedor = q.DS_RESPONSAVEL_VENDEDOR;
            if (q.DS_RESPONSAVEL_INSIDE_SALES) c.insideSales = q.DS_RESPONSAVEL_INSIDE_SALES;
        });

        var clients = [];
        var now = new Date();

        for (var name in clientMap) {
            var c = clientMap[name];
            if (c.dates.length < 2) continue;

            c.dates.sort(function(a, b) { return a - b; });

            var gaps = [];
            for (var i = 1; i < c.dates.length; i++) {
                var gap = (c.dates[i] - c.dates[i-1]) / (1000 * 60 * 60 * 24);
                if (gap > 0 && gap < 180) gaps.push(gap);
            }

            if (gaps.length === 0) continue;

            gaps.sort(function(a, b) { return a - b; });
            var median = gaps[Math.floor(gaps.length / 2)];
            var filtered = gaps.filter(function(g) { return g <= median * 3; });
            if (filtered.length === 0) filtered = gaps;

            var avgGap = filtered.reduce(function(s, g) { return s + g; }, 0) / filtered.length;

            var lastDate = c.dates[c.dates.length - 1];
            var firstDate = c.dates[0];
            var daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);

            // Cotações por mês
            var spanMonths = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 30.4));
            var quotesPerMonth = c.totalQuotes / spanMonths;
            var avgValuePerMonth = c.totalValue / spanMonths;
            var avgApprovedValuePerMonth = c.approvedValue / spanMonths;

            // Trend: cotações este mês vs média
            var monthTrend = c.quotesThisMonth >= quotesPerMonth ? 'up' : 'down';

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
                rejected: c.rejected,
                openQuotes: c.openQuotes,
                avgGapDays: Math.round(avgGap * 10) / 10,
                quotesPerMonth: Math.round(quotesPerMonth * 10) / 10,
                quotesThisMonth: c.quotesThisMonth,
                monthTrend: monthTrend,
                avgValuePerMonth: Math.round(avgValuePerMonth),
                totalValue: Math.round(c.totalValue),
                avgApprovedValuePerMonth: Math.round(avgApprovedValuePerMonth),
                daysSinceLast: Math.round(daysSince * 10) / 10,
                lastDate: lastDate,
                ratio: ratio,
                status: status,
                origin: c.lastOrigin,
                dest: c.lastDest
            });
        }

        // Cache
        _cachedClients = clients;
        _cacheTime = Date.now();
        console.log(TAG, 'Dados processados:', clients.length, 'clientes (cache atualizado)');

        // Sort padrão
        sortClients(clients);
        renderPanel(clients);

        // Auto-notifica (relatório consolidado por email)
        sendConsolidatedReport(clients);
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

    // ===== SORT =====
    function sortClients(clients) {
        var col = _sortCol;
        var dir = _sortDir;
        clients.sort(function(a, b) {
            var va = a[col], vb = b[col];
            if (typeof va === 'string') {
                va = va.toLowerCase(); vb = (vb || '').toLowerCase();
                return va < vb ? -dir : va > vb ? dir : 0;
            }
            if (va instanceof Date) {
                va = va.getTime(); vb = vb ? vb.getTime() : 0;
            }
            return ((va || 0) - (vb || 0)) * dir;
        });
    }

    function onHeaderClick(col) {
        if (_sortCol === col) {
            _sortDir *= -1; // Inverte direção
        } else {
            _sortCol = col;
            _sortDir = -1;
        }
        if (_cachedClients) {
            sortClients(_cachedClients);
            renderPanel(_cachedClients);
        }
    }

    // ===== FILTER =====
    function onFilterClick(status) {
        _filterStatus = (_filterStatus === status) ? null : status;
        if (_cachedClients) renderPanel(_cachedClients);
    }

    // ===== RENDER =====
    function renderPanel(clients) {
        var atrasados = clients.filter(function(c) { return c.status === 'atrasado'; }).length;
        var atencao = clients.filter(function(c) { return c.status === 'atencao'; }).length;
        var ok = clients.filter(function(c) { return c.status === 'ok'; }).length;

        // Filtra se necessário
        var filtered = _filterStatus ? clients.filter(function(c) { return c.status === _filterStatus; }) : clients;

        // Badge
        var badge = document.getElementById('freq-badge');
        if (atrasados > 0) {
            badge.textContent = atrasados;
            badge.className = 'freq-badge';
        } else {
            badge.textContent = '✓';
            badge.className = 'freq-badge ok';
        }

        function arrow(col) {
            if (_sortCol !== col) return '';
            return _sortDir === 1 ? ' ▲' : ' ▼';
        }

        function activeClass(status) {
            return _filterStatus === status ? ' freq-stat-active' : '';
        }

        var html = [];

        // Stats clicáveis
        html.push('<div class="freq-stats">');
        html.push('  <div class="freq-stat freq-stat-click' + activeClass('atrasado') + '" data-filter="atrasado"><div class="freq-stat-value">' + atrasados + '</div><div class="freq-stat-label red">● Atrasados</div></div>');
        html.push('  <div class="freq-stat freq-stat-click' + activeClass('atencao') + '" data-filter="atencao"><div class="freq-stat-value">' + atencao + '</div><div class="freq-stat-label yellow">● Atenção</div></div>');
        html.push('  <div class="freq-stat freq-stat-click' + activeClass('ok') + '" data-filter="ok"><div class="freq-stat-value">' + ok + '</div><div class="freq-stat-label green">● Em dia</div></div>');
        html.push('  <div class="freq-stat freq-stat-click' + activeClass(null) + '" data-filter="all"><div class="freq-stat-value">' + clients.length + '</div><div class="freq-stat-label">Clientes</div></div>');
        html.push('</div>');

        // Helper formata BRL
        function fmtBRL(v) {
            if (!v) return '—';
            if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1) + 'M';
            if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(1) + 'K';
            return 'R$ ' + v;
        }

        // Tabela com headers clicáveis
        html.push('<table class="freq-table">');
        html.push('<thead><tr>');
        html.push('  <th class="freq-th-sort freq-col-client" data-col="name">Cliente' + arrow('name') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="vendedor">Vendedor' + arrow('vendedor') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="totalQuotes">Total' + arrow('totalQuotes') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="quotesPerMonth">Cot./Mês' + arrow('quotesPerMonth') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="quotesThisMonth">Este Mês' + arrow('quotesThisMonth') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="avgGapDays">Freq. Média' + arrow('avgGapDays') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="avgValuePerMonth">Vol./Mês' + arrow('avgValuePerMonth') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="avgApprovedValuePerMonth">Aprov./Mês' + arrow('avgApprovedValuePerMonth') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="lastDate">Última Cot.' + arrow('lastDate') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="daysSinceLast">Dias s/ cotar' + arrow('daysSinceLast') + '</th>');
        html.push('  <th class="freq-th-sort" data-col="status">Status' + arrow('status') + '</th>');
        html.push('  <th></th>');
        html.push('</tr></thead><tbody>');

        for (var i = 0; i < filtered.length; i++) {
            var c = filtered[i];
            var rowClass = c.status === 'atrasado' ? 'risk-high' : c.status === 'atencao' ? 'risk-medium' : 'risk-ok';
            var statusLabel = c.status === 'atrasado' ? 'Atrasado' : c.status === 'atencao' ? 'Atenção' : 'OK';
            var statusClass = c.status;
            var trendIcon = c.monthTrend === 'up' ? '<span style="color:#22c55e">▲</span>' : '<span style="color:#f87171">▼</span>';
            var lastDateStr = c.lastDate ? c.lastDate.toLocaleDateString('pt-BR') : '—';
            var volumeTitle = 'Aprovadas: ' + c.approved + ' | Reprovadas: ' + c.rejected + ' | Abertas: ' + c.openQuotes + ' | Total: ' + fmtBRL(c.totalValue);

            html.push('<tr class="' + rowClass + '" data-client="' + encodeURIComponent(JSON.stringify(c)) + '">');
            html.push('  <td class="freq-col-client" title="' + c.originalName + '">' + c.name + '</td>');
            html.push('  <td>' + (c.vendedor || '—').split(' ')[0] + '</td>');
            html.push('  <td style="text-align:center">' + c.totalQuotes + '</td>');
            html.push('  <td style="text-align:center"><strong>' + c.quotesPerMonth + '</strong></td>');
            html.push('  <td style="text-align:center"><strong>' + c.quotesThisMonth + '</strong> ' + trendIcon + '</td>');
            html.push('  <td>' + c.avgGapDays + ' dias</td>');
            html.push('  <td title="' + volumeTitle + '">' + fmtBRL(c.avgValuePerMonth) + '</td>');
            html.push('  <td style="color:#a5b4fc">' + fmtBRL(c.avgApprovedValuePerMonth) + '</td>');
            html.push('  <td>' + lastDateStr + '</td>');
            html.push('  <td><strong>' + Math.round(c.daysSinceLast) + '</strong> dias</td>');
            html.push('  <td><span class="freq-status ' + statusClass + '">' + statusLabel + '</span></td>');

            if (c.status === 'atrasado' || c.status === 'atencao') {
                html.push('  <td><button class="freq-email-btn" data-idx="' + i + '">Notificar</button></td>');
            } else {
                html.push('  <td></td>');
            }
            html.push('</tr>');
        }

        html.push('</tbody></table>');

        // Email zone ANTES da tabela (visível)
        var fullHtml = '<div id="freq-email-zone"></div>' + html.join('\n');

        var content = document.getElementById('atom-freq-content');
        content.innerHTML = fullHtml;

        // Bind filter cards
        content.querySelectorAll('.freq-stat-click').forEach(function(card) {
            card.addEventListener('click', function() {
                var f = card.getAttribute('data-filter');
                onFilterClick(f === 'all' ? null : f);
            });
        });

        // Bind sort headers
        content.querySelectorAll('.freq-th-sort').forEach(function(th) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', function() {
                onHeaderClick(th.getAttribute('data-col'));
            });
        });

        // Bind email buttons
        content.querySelectorAll('.freq-email-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var row = btn.closest('tr');
                var clientData = JSON.parse(decodeURIComponent(row.getAttribute('data-client')));
                console.log(TAG, 'Notificar clicado para:', clientData.name);
                openEmailDraft(clientData);
            });
        });

        window._freqClients = clients;
    }

    // ===== EMAIL DRAFT =====
    function openEmailDraft(client) {
        var zone = document.getElementById('freq-email-zone');
        zone.innerHTML = '<div class="freq-loading"><div class="freq-spinner"></div>Gemini gerando email para ' + client.name + '...</div>';
        zone.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
                '  <h4>Email para: ' + client.originalName + '</h4>',
                '  <div style="color:#64748b;font-size:10px;margin-bottom:8px;">Assunto: ' + (draft.subject || 'Acompanhamento de cotação') + '</div>',
                '  <textarea id="freq-email-body">' + (draft.body || '') + '</textarea>',
                '  <div class="freq-email-actions">',
                '    <button class="freq-btn-send" id="freq-send-email">Enviar via Outlook</button>',
                '    <button class="freq-btn-cancel" id="freq-cancel-email">Cancelar</button>',
                '  </div>',
                '</div>'
            ].join('\n');

            zone.innerHTML = html;

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
        var encodedSubject = encodeURIComponent(subject);
        var encodedBody = encodeURIComponent(body);
        var composeUrl = 'https://outlook.office.com/mail/deeplink/compose?subject=' + encodedSubject + '&body=' + encodedBody;

        window.open(composeUrl, '_blank');

        var cooldownKey = 'freq_alert_' + client.name.replace(/\s+/g, '_');
        var data = {};
        data[cooldownKey] = { sentAt: new Date().toISOString(), client: client.name };
        chrome.storage.local.set(data);

        console.log(TAG, 'Email draft aberto via Outlook pra:', client.name);
    }

    // ===== EMAIL CONSOLIDADO AUTOMÁTICO =====
    function sendConsolidatedReport(allClients) {
        if (allClients.length === 0) return;

        // Cooldown: 1 email por dia
        var cooldownKey = 'freq_report_last';
        chrome.storage.local.get(cooldownKey, function(data) {
            var last = data[cooldownKey];
            if (last) {
                var diff = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
                if (diff < 24) {
                    console.log(TAG, 'Report já enviado há', Math.round(diff), 'horas. Cooldown 24h.');
                    return;
                }
            }

            var atrasados = allClients.filter(function(c) { return c.status === 'atrasado'; });
            var atencao = allClients.filter(function(c) { return c.status === 'atencao'; });
            var ok = allClients.filter(function(c) { return c.status === 'ok'; });

            var today = new Date();
            var dateStr = today.toLocaleDateString('pt-BR');

            // Monta corpo COMPACTO (cabe em URL)
            var lines = [];
            lines.push('FREQUENCIA DE COTACAO - ' + dateStr);
            lines.push('');
            lines.push('Resumo: ' + allClients.length + ' clientes | ' + atrasados.length + ' atrasados | ' + atencao.length + ' atencao | ' + ok.length + ' em dia');
            lines.push('');

            if (atrasados.length > 0) {
                lines.push('ATRASADOS:');
                var top = atrasados.slice(0, 15);
                top.forEach(function(c, i) {
                    lines.push((i + 1) + '. ' + c.name + ' - ' + Math.round(c.daysSinceLast) + 'd sem cotar (media ' + c.avgGapDays + 'd) - ' + (c.vendedor || '?'));
                });
                if (atrasados.length > 15) lines.push('... e mais ' + (atrasados.length - 15) + ' clientes atrasados');
            }

            if (atencao.length > 0) {
                lines.push('');
                lines.push('ATENCAO:');
                var topAt = atencao.slice(0, 10);
                topAt.forEach(function(c, i) {
                    lines.push((i + 1) + '. ' + c.name + ' - ' + Math.round(c.daysSinceLast) + 'd (media ' + c.avgGapDays + 'd)');
                });
                if (atencao.length > 10) lines.push('... e mais ' + (atencao.length - 10));
            }

            lines.push('');
            lines.push('Atom - Mond Shipping');

            var body = lines.join('\n');
            var subject = 'Frequencia - ' + atrasados.length + ' atrasados | ' + dateStr;

            // Abre Outlook compose
            var composeUrl = 'https://outlook.office.com/mail/deeplink/compose?to=' +
                encodeURIComponent(ALERT_EMAIL) +
                '&subject=' + encodeURIComponent(subject) +
                '&body=' + encodeURIComponent(body);

            window.open(composeUrl, '_blank');
            console.log(TAG, 'Relatório compacto aberto no Outlook (' + body.length + ' chars)');

            // Marca cooldown
            var obj = {};
            obj[cooldownKey] = new Date().toISOString();
            chrome.storage.local.set(obj);

            // Chrome notification também
            chrome.runtime.sendMessage({
                action: 'healthCheckAlert',
                data: {
                    modulo: 'Frequência',
                    total: allClients.length,
                    passed: ok.length,
                    failures: atrasados.slice(0, 5).map(function(c) {
                        return c.name + ': há ' + Math.round(c.daysSinceLast) + 'd sem cotar (média ' + c.avgGapDays + 'd)';
                    }),
                    profile: 'master',
                    url: location.href,
                    timestamp: today.toISOString()
                }
            });
        });
    }

    // ===== INIT =====
    function init() {
        if (!isOfertaPage()) return;
        createPanel();
        // Pre-load data em background pra abrir instantâneo
        if (!_cachedClients) {
            chrome.runtime.sendMessage({ action: 'fetchFrequencyData' }, function(response) {
                if (response && response.success) {
                    processData(response.data);
                    console.log(TAG, 'Dados pré-carregados em background');
                }
            });
        }
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

    var lastUrl = location.href;
    var urlCheckInterval = setInterval(function() {
        if (!isContextValid()) { clearInterval(urlCheckInterval); return; }
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            panelCreated = false;
            _cachedClients = null;
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

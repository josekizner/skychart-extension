// ============================================================
// ATOM Intelligence Dashboard — Engine
// White/Beige Theme + Tooltips + Interatividade
// ============================================================

(function() {
    'use strict';

    var FIREBASE_URL = 'https://mond-atom-default-rtdb.firebaseio.com';
    var refreshInterval = 60000;

    // ===== FETCH ALL DATA =====
    function fetchAll() {
        return Promise.all([
            fetch(FIREBASE_URL + '/analytics.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/demurrage/resolved.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/demurrage/cache.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/serasa.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/system/heartbeats.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/system/latestVersion.json').then(function(r) { return r.json(); })
        ]).then(function(results) {
            return {
                analytics: results[0] || {},
                resolved: results[1] || {},
                demurrageCache: results[2] || {},
                serasa: results[3] || {},
                heartbeats: results[4] || {},
                latestVersion: results[5] || '?'
            };
        });
    }

    // ===== PARSE EVENTS =====
    function parseEvents(agentData) {
        if (!agentData) return [];
        var events = [];
        Object.keys(agentData).forEach(function(key) {
            var evt = agentData[key];
            if (evt && evt.timestamp) {
                evt._key = key;
                events.push(evt);
            }
        });
        events.sort(function(a, b) { return b.timestamp - a.timestamp; });
        return events;
    }

    // ===== FORMAT HELPERS =====
    function timeAgo(ts) {
        var diff = Date.now() - ts;
        var min = Math.floor(diff / 60000);
        if (min < 1) return 'agora';
        if (min < 60) return min + 'min atras';
        var h = Math.floor(min / 60);
        if (h < 24) return h + 'h atras';
        var d = Math.floor(h / 24);
        return d + 'd atras';
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // ===== MODAL =====
    function showModal(title, contentHtml) {
        var existing = document.querySelector('.dash-modal-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.className = 'dash-modal-overlay';
        overlay.innerHTML = '<div class="dash-modal" style="position:relative;">'
            + '<button class="dash-modal-close" title="Fechar">&times;</button>'
            + '<h3>' + title + '</h3>'
            + '<div class="modal-body">' + contentHtml + '</div>'
            + '</div>';

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.classList.contains('dash-modal-close')) {
                overlay.remove();
            }
        });

        document.body.appendChild(overlay);
    }

    // Store data globally for click handlers
    var _dashData = {};

    // ===== BUILD DASHBOARD =====
    function render(data) {
        _dashData = data;
        var analytics = data.analytics;
        var checkEvents = parseEvents(analytics.check);
        var demurrageEvents = parseEvents(analytics.demurrage);
        var serasaEvents = parseEvents(analytics.serasa);
        var outlookEvents = parseEvents(analytics.outlook);
        var allEvents = [].concat(checkEvents, demurrageEvents, serasaEvents, outlookEvents);
        allEvents.sort(function(a, b) { return b.timestamp - a.timestamp; });

        // === KPI Calculations ===
        var totalEvents = allEvents.length;
        var totalChecks = checkEvents.filter(function(e) { return e.action === 'chequeio_concluido'; }).length;
        var avgAccuracy = 0;
        var checkResults = checkEvents.filter(function(e) { return e.action === 'chequeio_concluido' && e.data; });
        if (checkResults.length > 0) {
            var sumAcc = 0;
            checkResults.forEach(function(e) { sumAcc += (e.data.taxaAcerto || 0); });
            avgAccuracy = Math.round(sumAcc / checkResults.length);
        }

        var resolvedCount = Object.keys(data.resolved).length;
        var serasaCount = Object.keys(data.serasa).length;

        // Demurrage portfolio
        var portfolioSnaps = demurrageEvents.filter(function(e) { return e.action === 'portfolio_snapshot' && e.data; });
        var latestPortfolio = portfolioSnaps.length > 0 ? portfolioSnaps[0].data : null;

        // Armador ranking
        var armadorRanking = [];
        if (latestPortfolio && latestPortfolio.armadores) {
            Object.keys(latestPortfolio.armadores).forEach(function(arm) {
                armadorRanking.push({ name: arm, count: latestPortfolio.armadores[arm] });
            });
            armadorRanking.sort(function(a, b) { return b.count - a.count; });
        }

        // Outlook stats
        var emailsCaptured = outlookEvents.filter(function(e) { return e.action === 'email_capturado'; }).length;
        var cotacoesExtraidas = outlookEvents.filter(function(e) { return e.action === 'cotacao_extraida'; }).length;
        var bookingsExtraidos = outlookEvents.filter(function(e) { return e.action === 'booking_extraido'; }).length;

        // User activity
        var userStats = {};
        allEvents.forEach(function(e) {
            var u = e.user || 'unknown';
            if (!userStats[u]) userStats[u] = { total: 0, agents: {}, events: [] };
            userStats[u].total++;
            userStats[u].agents[e.agent] = (userStats[u].agents[e.agent] || 0) + 1;
            userStats[u].events.push(e);
        });
        var userRanking = Object.keys(userStats).map(function(u) {
            return { name: u, total: userStats[u].total, agents: userStats[u].agents, events: userStats[u].events };
        }).sort(function(a, b) { return b.total - a.total; });

        // Serasa scores
        var serasaList = [];
        Object.keys(data.serasa).forEach(function(key) {
            var s = data.serasa[key];
            if (s && s.score) {
                serasaList.push({ cliente: key.replace(/_/g, ' '), score: s.score, limite: s.limiteCredito });
            }
        });
        serasaList.sort(function(a, b) { return a.score - b.score; });

        // === RENDER HTML ===
        var html = '';

        // Header
        html += '<header class="dash-header">';
        html += '  <div>';
        html += '    <h1>ATOM Intelligence</h1>';
        html += '    <div class="subtitle">Mond Shipping — Centro de Inteligencia</div>';
        html += '  </div>';
        html += '  <div class="live-badge"><div class="live-dot"></div> Atualizacao automatica</div>';
        html += '</header>';

        // Grid
        html += '<div class="dash-grid">';

        // KPI ROW 1
        html += kpiCard('Total de Eventos', totalEvents, 'blue', 'Acoes registradas por todos os agentes');
        html += kpiCard('Chequeios', totalChecks, 'cyan', avgAccuracy > 0 ? 'Precisao media: ' + avgAccuracy + '%' : 'Sem dados de precisao',
            'Verifica se os valores de custos no Skychart batem com a oferta/cotacao original. Acerto = % de itens corretos.');
        html += kpiCard('Processos Resolvidos', resolvedCount, 'green', 'Containers devolvidos (demurrage)');
        html += kpiCard('Emails Processados', emailsCaptured, 'purple', cotacoesExtraidas + ' cotacoes, ' + bookingsExtraidos + ' bookings');

        // KPI ROW 2
        if (latestPortfolio) {
            html += kpiCard('Expirados', latestPortfolio.expirado || 0, 'red', 'Processos com free time vencido');
            html += kpiCard('Em Alerta', latestPortfolio.alerta || 0, 'amber', 'Processos proximos do vencimento');
        }
        html += kpiCard('Clientes Serasa', serasaCount, 'purple', 'Scores consultados e salvos');
        if (latestPortfolio) {
            html += kpiCard('Total Demurrage', latestPortfolio.total || 0, 'blue', 'Processos ativos no controle');
        }

        // HEARTBEATS — Status das extensoes
        var heartbeats = data.heartbeats || {};
        var latestVer = data.latestVersion || '?';
        var hbKeys = Object.keys(heartbeats);
        if (hbKeys.length > 0) {
            html += '<div class="section-card full">';
            html += '  <div class="section-title"><span class="icon">E</span> <span class="tooltip-trigger" data-tooltip="Mostra a versao da extensao de cada colaborador e se esta atualizada. Verde = atualizado. Vermelho = desatualizado. Cinza = offline ha mais de 10 min.">Extensoes Ativas</span> <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:auto;">Versao atual: ' + latestVer + '</span></div>';
            html += '<table class="stat-table">';
            html += '<tr><th></th><th>Usuario</th><th>Versao</th><th>Perfil</th><th>Ultima atividade</th></tr>';
            hbKeys.forEach(function(key) {
                var hb = heartbeats[key];
                if (!hb) return;
                var isUpToDate = hb.version === latestVer;
                var minAgo = Math.round((Date.now() - (hb.lastSeen || 0)) / 60000);
                var isOnline = minAgo < 10;
                var dotColor = !isOnline ? 'var(--text-muted)' : isUpToDate ? 'var(--accent-green)' : 'var(--accent-red)';
                var dotTitle = !isOnline ? 'Offline' : isUpToDate ? 'Atualizado' : 'Desatualizado!';
                var verClass = isUpToDate ? 'good' : 'bad';
                var timeStr = minAgo < 1 ? 'agora' : minAgo < 60 ? minAgo + ' min atras' : Math.floor(minAgo/60) + 'h atras';
                html += '<tr>';
                html += '<td style="width:20px;text-align:center;" title="' + dotTitle + '"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';"></span></td>';
                html += '<td class="val">' + (hb.user || key) + '</td>';
                html += '<td class="' + verClass + '">' + (hb.version || '?') + '</td>';
                html += '<td>' + (hb.profile || '-') + '</td>';
                html += '<td>' + timeStr + '</td>';
                html += '</tr>';
            });
            html += '</table>';
            html += '</div>';
        }
        // ARMADOR RANKING
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">⚓</span> <span class="tooltip-trigger" data-tooltip="Quantidade de processos de demurrage por companhia maritima (armador). Mostra quais armadores concentram mais processos com risco de demurrage.">Ranking de Armadores</span></div>';
        if (armadorRanking.length > 0) {
            var maxArm = armadorRanking[0].count;
            html += '<div class="bar-chart">';
            armadorRanking.slice(0, 8).forEach(function(arm, i) {
                var pct = Math.round((arm.count / maxArm) * 100);
                var colors = ['blue', 'purple', 'cyan', 'amber', 'green', 'red'];
                html += barRow(arm.name, arm.count, pct, colors[i % colors.length]);
            });
            html += '</div>';
        } else {
            html += emptyState('Dados de armadores aparecerao apos o carregamento do portfolio');
        }
        html += '</div>';

        // SERASA SCORES
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">S</span> Scores Serasa</div>';
        if (serasaList.length > 0) {
            html += '<table class="stat-table">';
            html += '<tr><th>Cliente</th><th>Score</th><th>Limite</th></tr>';
            serasaList.slice(0, 10).forEach(function(s) {
                var cls = s.score >= 700 ? 'good' : s.score >= 400 ? 'warn' : 'bad';
                html += '<tr>';
                html += '<td class="val">' + s.cliente + '</td>';
                html += '<td class="' + cls + '">' + s.score + '</td>';
                html += '<td>' + (s.limite ? s.limite.toLocaleString('pt-BR') : '-') + '</td>';
                html += '</tr>';
            });
            html += '</table>';
        } else {
            html += emptyState('Consultas Serasa aparecerao quando scores forem registrados');
        }
        html += '</div>';

        // CHECK AGENT RESULTS
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">✓</span> <span class="tooltip-trigger" data-tooltip="Compara os valores da oferta/cotacao com o que foi lancado no Skychart. Acerto = % de itens com valores corretos. Erros indicam divergencias.">Ultimos Chequeios</span></div>';
        if (checkResults.length > 0) {
            html += '<table class="stat-table" id="check-table">';
            html += '<tr><th>Quando</th><th>Modulo</th><th>Processo</th><th>Itens</th><th>Erros</th><th>Acerto</th></tr>';
            checkResults.slice(0, 10).forEach(function(e, idx) {
                var d = e.data || {};
                var cls = (d.taxaAcerto || 0) >= 90 ? 'good' : (d.taxaAcerto || 0) >= 70 ? 'warn' : 'bad';
                html += '<tr data-check-idx="' + idx + '">';
                html += '<td>' + formatDate(e.timestamp) + '</td>';
                html += '<td class="val">' + (d.modulo || '-') + '</td>';
                html += '<td class="val">' + (d.processo || '-') + '</td>';
                html += '<td>' + (d.totalItens || 0) + '</td>';
                html += '<td class="' + ((d.errosEncontrados || 0) > 0 ? 'bad' : 'good') + '">' + (d.errosEncontrados || 0) + '</td>';
                html += '<td class="' + cls + '">' + (d.taxaAcerto || 0) + '%</td>';
                html += '</tr>';
            });
            html += '</table>';
        } else {
            html += emptyState('Resultados do Check Agent aparecerao apos o primeiro chequeio');
        }
        html += '</div>';

        // USER ACTIVITY
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">U</span> Atividade por Usuario</div>';
        if (userRanking.length > 0) {
            var maxUser = userRanking[0].total;
            html += '<div class="bar-chart" id="user-chart">';
            userRanking.slice(0, 6).forEach(function(u, i) {
                var pct = Math.round((u.total / maxUser) * 100);
                var name = u.name.length > 18 ? u.name.substring(0, 18) + '...' : u.name;
                var colors = ['blue', 'purple', 'cyan', 'amber', 'green'];
                html += '<div class="bar-row" data-user="' + u.name + '">';
                html += '<span class="bar-label">' + name + '</span>';
                html += '<div class="bar-track">';
                html += '<div class="bar-fill ' + colors[i % colors.length] + '" style="width:' + Math.max(pct, 8) + '%">' + u.total + '</div>';
                html += '</div></div>';
            });
            html += '</div>';
        } else {
            html += emptyState('Atividade sera registrada conforme os agentes sao usados');
        }
        html += '</div>';

        // ACTIVITY TIMELINE
        html += '<div class="section-card full">';
        html += '  <div class="section-title"><span class="icon">T</span> Timeline de Atividade</div>';
        if (allEvents.length > 0) {
            html += '<div class="timeline">';
            allEvents.slice(0, 25).forEach(function(evt) {
                html += timelineItem(evt);
            });
            html += '</div>';
        } else {
            html += emptyState('A timeline sera populada automaticamente conforme os agentes trabalham');
        }
        html += '</div>';

        // Close grid
        html += '</div>';

        // Footer
        html += '<div class="dash-footer">';
        html += 'ATOM Intelligence v1.1 — Mond Shipping — Dados atualizados a cada 1 minuto';
        html += '</div>';

        var appEl = document.getElementById('app');
        appEl.className = '';
        appEl.innerHTML = html;
        window.scrollTo(0, 0);

        // === BIND INTERACTIVE EVENTS ===
        bindInteractiveEvents(userRanking, checkResults);
    }

    // ===== BIND CLICK HANDLERS =====
    function bindInteractiveEvents(userRanking, checkResults) {
        // User bars → click to see detail
        var userChart = document.getElementById('user-chart');
        if (userChart) {
            userChart.addEventListener('click', function(e) {
                var row = e.target.closest('.bar-row');
                if (!row) return;
                var userName = row.getAttribute('data-user');
                var user = userRanking.find(function(u) { return u.name === userName; });
                if (!user) return;

                var html = '<table class="stat-table">';
                html += '<tr><th>Agente</th><th>Acoes</th></tr>';
                Object.keys(user.agents).forEach(function(agent) {
                    html += '<tr><td class="val">' + agent + '</td><td>' + user.agents[agent] + '</td></tr>';
                });
                html += '</table>';

                // Last 10 events
                html += '<h4 style="margin-top:16px;margin-bottom:8px;font-size:13px;font-weight:600;">Ultimas atividades</h4>';
                html += '<div class="timeline" style="max-height:200px;">';
                user.events.slice(0, 10).forEach(function(evt) {
                    html += timelineItem(evt);
                });
                html += '</div>';

                showModal('Atividade: ' + userName, html);
            });
        }

        // Check rows → click to see detail
        var checkTable = document.getElementById('check-table');
        if (checkTable) {
            checkTable.addEventListener('click', function(e) {
                var row = e.target.closest('tr[data-check-idx]');
                if (!row) return;
                var idx = parseInt(row.getAttribute('data-check-idx'));
                var check = checkResults[idx];
                if (!check || !check.data) return;

                var d = check.data;
                var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
                html += '<div><strong>Modulo:</strong> ' + (d.modulo || '-') + '</div>';
                html += '<div><strong>Processo:</strong> ' + (d.processo || 'nao registrado') + '</div>';
                html += '<div><strong>Total itens:</strong> ' + (d.totalItens || 0) + '</div>';
                html += '<div><strong>Itens OK:</strong> <span style="color:var(--accent-green)">' + (d.itensOk || 0) + '</span></div>';
                html += '<div><strong>Erros:</strong> <span style="color:var(--accent-red)">' + (d.errosEncontrados || 0) + '</span></div>';
                html += '<div><strong>Taxa acerto:</strong> <span style="color:' + ((d.taxaAcerto || 0) >= 80 ? 'var(--accent-green)' : 'var(--accent-red)') + '">' + (d.taxaAcerto || 0) + '%</span></div>';
                html += '</div>';
                html += '<div style="font-size:11px;color:var(--text-muted);">Quando: ' + formatDate(check.timestamp) + ' — Usuario: ' + (check.user || 'unknown') + '</div>';

                showModal('Chequeio: ' + (d.processo || d.modulo), html);
            });
        }
    }

    // ===== COMPONENT BUILDERS =====
    function kpiCard(label, value, color, detail, tooltip) {
        var labelHtml = tooltip
            ? '<span class="tooltip-trigger" data-tooltip="' + tooltip + '">' + label + '</span>'
            : label;
        return '<div class="kpi-card ' + color + '">'
            + '<div class="kpi-label">' + labelHtml + '</div>'
            + '<div class="kpi-value ' + color + '">' + value + '</div>'
            + '<div class="kpi-detail">' + detail + '</div>'
            + '</div>';
    }

    function barRow(label, value, pct, color) {
        return '<div class="bar-row">'
            + '<span class="bar-label">' + label + '</span>'
            + '<div class="bar-track">'
            + '<div class="bar-fill ' + color + '" style="width:' + Math.max(pct, 8) + '%">' + value + '</div>'
            + '</div></div>';
    }

    function emptyState(text) {
        return '<div class="empty-state">' + text + '</div>';
    }

    function timelineItem(evt) {
        var agent = evt.agent || 'unknown';
        var descriptions = {
            'chequeio_concluido': function(d) {
                var ref = d.processo ? ' (' + d.processo + ')' : '';
                return 'Chequeio ' + (d.modulo || '') + ref + ': ' + (d.totalItens || 0) + ' itens, ' + (d.taxaAcerto || 0) + '% acerto';
            },
            'processo_resolvido': function(d) { return 'Processo ' + (d.processo || '?') + ' marcado como devolvido'; },
            'processo_reaberto': function(d) { return 'Processo ' + (d.processo || '?') + ' reaberto'; },
            'portfolio_snapshot': function(d) { return 'Portfolio: ' + (d.total || 0) + ' processos (' + (d.expirado || 0) + ' expirados, ' + (d.alerta || 0) + ' alertas)'; },
            'relatorio_enviado': function(d) { return 'Relatorio demurrage: ' + (d.totalProcessos || 0) + ' processos em risco'; },
            'score_salvo': function(d) { return 'Score Serasa: ' + (d.cliente || '?') + ' = ' + (d.score || '?'); },
            'email_capturado': function(d) { return 'Email lido: ' + (d.subject || 'sem assunto'); },
            'cotacao_extraida': function(d) { return 'Cotacao extraida (' + (d.campos || 0) + ' campos)'; },
            'booking_extraido': function(d) { return 'Booking extraido (' + (d.campos || 0) + ' campos)'; }
        };

        var descFn = descriptions[evt.action];
        var text = descFn ? descFn(evt.data || {}) : evt.action + ': ' + JSON.stringify(evt.data || {}).substring(0, 50);

        return '<div class="timeline-item">'
            + '<div class="timeline-dot ' + agent + '"></div>'
            + '<div class="timeline-content">'
            + '<div class="timeline-text">' + text + '</div>'
            + '<div class="timeline-meta">' + (evt.user || 'unknown') + ' — ' + timeAgo(evt.timestamp) + '</div>'
            + '</div></div>';
    }

    // ===== INIT =====
    function loadAndRender() {
        fetchAll()
            .then(render)
            .catch(function(err) {
                console.error('[Dashboard] Erro:', err);
                document.getElementById('app').innerHTML = '<div class="dash-loading"><div style="color:#dc2626">Erro ao carregar: ' + err.message + '</div></div>';
            });
    }

    loadAndRender();
    setInterval(loadAndRender, refreshInterval);

})();

// ============================================================
// ATOM Intelligence Dashboard — Engine
// Busca dados do Firebase Analytics e renderiza em tempo real
// ============================================================

(function() {
    'use strict';

    var FIREBASE_URL = 'https://mond-atom-default-rtdb.firebaseio.com';
    var refreshInterval = 60000; // 1 minuto

    // ===== FETCH ALL DATA =====
    function fetchAll() {
        return Promise.all([
            fetch(FIREBASE_URL + '/analytics.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/demurrage/resolved.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/demurrage/cache.json').then(function(r) { return r.json(); }),
            fetch(FIREBASE_URL + '/serasa.json').then(function(r) { return r.json(); })
        ]).then(function(results) {
            return {
                analytics: results[0] || {},
                resolved: results[1] || {},
                demurrageCache: results[2] || {},
                serasa: results[3] || {}
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
        if (min < 60) return min + 'min atrás';
        var h = Math.floor(min / 60);
        if (h < 24) return h + 'h atrás';
        var d = Math.floor(h / 24);
        return d + 'd atrás';
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // ===== BUILD DASHBOARD =====
    function render(data) {
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

        // Armador ranking from latest portfolio
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
            if (!userStats[u]) userStats[u] = { total: 0, agents: {} };
            userStats[u].total++;
            userStats[u].agents[e.agent] = (userStats[u].agents[e.agent] || 0) + 1;
        });
        var userRanking = Object.keys(userStats).map(function(u) {
            return { name: u, total: userStats[u].total, agents: userStats[u].agents };
        }).sort(function(a, b) { return b.total - a.total; });

        // Serasa scores
        var serasaList = [];
        Object.keys(data.serasa).forEach(function(key) {
            var s = data.serasa[key];
            if (s && s.score) {
                serasaList.push({ cliente: key.replace(/_/g, ' '), score: s.score, limite: s.limiteCredito });
            }
        });
        serasaList.sort(function(a, b) { return a.score - b.score; }); // piores primeiro

        // === RENDER HTML ===
        var html = '';

        // Header
        html += '<header class="dash-header">';
        html += '  <div>';
        html += '    <h1>ATOM Intelligence</h1>';
        html += '    <div class="subtitle">Mond Shipping — Centro de Inteligência</div>';
        html += '  </div>';
        html += '  <div class="live-badge"><div class="live-dot"></div> Atualização automática</div>';
        html += '</header>';

        // Grid
        html += '<div class="dash-grid">';

        // KPI ROW 1
        html += kpiCard('Total de Eventos', totalEvents, 'blue', 'Ações registradas por todos os agentes');
        html += kpiCard('Chequeios', totalChecks, 'cyan', avgAccuracy > 0 ? 'Precisão média: ' + avgAccuracy + '%' : 'Sem dados de precisão');
        html += kpiCard('Processos Resolvidos', resolvedCount, 'green', 'Containers devolvidos (demurrage)');
        html += kpiCard('Emails Processados', emailsCaptured, 'purple', cotacoesExtraidas + ' cotações, ' + bookingsExtraidos + ' bookings');

        // KPI ROW 2
        if (latestPortfolio) {
            html += kpiCard('Expirados', latestPortfolio.expirado || 0, 'red', 'Processos com free time vencido');
            html += kpiCard('Em Alerta', latestPortfolio.alerta || 0, 'amber', 'Processos próximos do vencimento');
        }
        html += kpiCard('Clientes Serasa', serasaCount, 'purple', 'Scores consultados e salvos');
        if (latestPortfolio) {
            html += kpiCard('Total Demurrage', latestPortfolio.total || 0, 'blue', 'Processos ativos no controle');
        }

        // ARMADOR RANKING
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">🚢</span> Ranking de Armadores</div>';
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
            html += emptyState('📊', 'Dados de armadores aparecerão após o primeiro carregamento');
        }
        html += '</div>';

        // SERASA SCORES
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">📋</span> Scores Serasa</div>';
        if (serasaList.length > 0) {
            html += '<table class="stat-table">';
            html += '<tr><th>Cliente</th><th>Score</th><th>Limite</th></tr>';
            serasaList.slice(0, 10).forEach(function(s) {
                var cls = s.score >= 700 ? 'good' : s.score >= 400 ? 'warn' : 'bad';
                html += '<tr>';
                html += '<td class="val">' + s.cliente + '</td>';
                html += '<td class="' + cls + '">' + s.score + '</td>';
                html += '<td>' + (s.limite || '-') + '</td>';
                html += '</tr>';
            });
            html += '</table>';
        } else {
            html += emptyState('🔍', 'Consultas Serasa aparecerão quando scores forem registrados');
        }
        html += '</div>';

        // CHECK AGENT RESULTS
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">✓</span> Últimos Chequeios</div>';
        if (checkResults.length > 0) {
            html += '<table class="stat-table">';
            html += '<tr><th>Quando</th><th>Módulo</th><th>Itens</th><th>Erros</th><th>Acerto</th></tr>';
            checkResults.slice(0, 8).forEach(function(e) {
                var d = e.data || {};
                var cls = (d.taxaAcerto || 0) >= 90 ? 'good' : (d.taxaAcerto || 0) >= 70 ? 'warn' : 'bad';
                html += '<tr>';
                html += '<td>' + formatDate(e.timestamp) + '</td>';
                html += '<td class="val">' + (d.modulo || '-') + '</td>';
                html += '<td>' + (d.totalItens || 0) + '</td>';
                html += '<td class="' + ((d.errosEncontrados || 0) > 0 ? 'bad' : 'good') + '">' + (d.errosEncontrados || 0) + '</td>';
                html += '<td class="' + cls + '">' + (d.taxaAcerto || 0) + '%</td>';
                html += '</tr>';
            });
            html += '</table>';
        } else {
            html += emptyState('✓', 'Resultados do Check Agent aparecerão após o primeiro chequeio');
        }
        html += '</div>';

        // USER ACTIVITY
        html += '<div class="section-card">';
        html += '  <div class="section-title"><span class="icon">👥</span> Atividade por Usuário</div>';
        if (userRanking.length > 0) {
            var maxUser = userRanking[0].total;
            html += '<div class="bar-chart">';
            userRanking.slice(0, 6).forEach(function(u, i) {
                var pct = Math.round((u.total / maxUser) * 100);
                var name = u.name.length > 15 ? u.name.substring(0, 15) + '...' : u.name;
                var colors = ['blue', 'purple', 'cyan', 'amber', 'green'];
                html += barRow(name, u.total, pct, colors[i % colors.length]);
            });
            html += '</div>';
        } else {
            html += emptyState('👥', 'Atividade será registrada conforme os agentes são usados');
        }
        html += '</div>';

        // ACTIVITY TIMELINE
        html += '<div class="section-card full">';
        html += '  <div class="section-title"><span class="icon">📡</span> Timeline de Atividade — Últimos Eventos</div>';
        if (allEvents.length > 0) {
            html += '<div class="timeline">';
            allEvents.slice(0, 25).forEach(function(evt) {
                html += timelineItem(evt);
            });
            html += '</div>';
        } else {
            html += emptyState('📡', 'A timeline será populada automaticamente conforme os agentes trabalham');
        }
        html += '</div>';

        // Close grid
        html += '</div>';

        // Footer
        html += '<div style="text-align:center;padding:16px;color:#475569;font-size:11px;">';
        html += 'ATOM Intelligence v1.0 — Mond Shipping — Dados atualizados a cada 1 minuto';
        html += '</div>';

        document.getElementById('app').innerHTML = html;
    }

    // ===== COMPONENT BUILDERS =====
    function kpiCard(label, value, color, detail) {
        return '<div class="kpi-card ' + color + '">'
            + '<div class="kpi-label">' + label + '</div>'
            + '<div class="kpi-value ' + color + '">' + value + '</div>'
            + '<div class="kpi-detail">' + detail + '</div>'
            + '</div>';
    }

    function barRow(label, value, pct, color) {
        return '<div class="bar-row">'
            + '<span class="bar-label">' + label + '</span>'
            + '<div class="bar-track">'
            + '<div class="bar-fill ' + color + '" style="width:' + Math.max(pct, 5) + '%">' + value + '</div>'
            + '</div></div>';
    }

    function emptyState(icon, text) {
        return '<div class="empty-state"><span class="icon">' + icon + '</span>' + text + '</div>';
    }

    function timelineItem(evt) {
        var agent = evt.agent || 'unknown';
        var descriptions = {
            'chequeio_concluido': function(d) { return 'Chequeio ' + (d.modulo || '') + ': ' + (d.totalItens || 0) + ' itens, ' + (d.errosEncontrados || 0) + ' erros (' + (d.taxaAcerto || 0) + '% acerto)'; },
            'processo_resolvido': function(d) { return 'Processo ' + (d.processo || '?') + ' marcado como devolvido'; },
            'processo_reaberto': function(d) { return 'Processo ' + (d.processo || '?') + ' reaberto'; },
            'portfolio_snapshot': function(d) { return 'Portfolio: ' + (d.total || 0) + ' processos (' + (d.expirado || 0) + ' expirados, ' + (d.alerta || 0) + ' alertas)'; },
            'relatorio_enviado': function(d) { return 'Relatório demurrage composto com ' + (d.totalProcessos || 0) + ' processos em risco'; },
            'score_salvo': function(d) { return 'Score Serasa: ' + (d.cliente || '?') + ' = ' + (d.score || '?'); },
            'email_capturado': function(d) { return 'Email lido: ' + (d.subject || 'sem assunto'); },
            'cotacao_extraida': function(d) { return 'Cotação extraída (' + (d.campos || 0) + ' campos)'; },
            'booking_extraido': function(d) { return 'Booking extraído (' + (d.campos || 0) + ' campos)'; }
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
                document.getElementById('app').innerHTML = '<div class="dash-loading"><div style="color:#ef4444">Erro ao carregar: ' + err.message + '</div></div>';
            });
    }

    loadAndRender();
    setInterval(loadAndRender, refreshInterval);

})();

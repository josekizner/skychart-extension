// ============================================================
// ATOM Intelligence Dashboard v2.0
// Design System: Bebas Neue + Barlow Condensed · Light Beige
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
        if (min < 60) return min + ' min atrás';
        var h = Math.floor(min / 60);
        if (h < 24) return h + 'h atrás';
        var d = Math.floor(h / 24);
        return d + 'd atrás';
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    // ===== ATOM LOGO SVG (inline) =====
    function atomLogoSvg(size) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 120 120" fill="none">'
            + '<defs>'
            + '<linearGradient id="vDash" x1="30" y1="50" x2="90" y2="60" gradientUnits="userSpaceOnUse">'
            + '<stop stop-color="#D97706"/><stop offset="1" stop-color="#B45309"/>'
            + '</linearGradient>'
            + '<filter id="gDash"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
            + '<filter id="gcDash"><feGaussianBlur stdDeviation="4.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
            + '</defs>'
            + '<path d="M60 10L95 34V76L74 106H46L25 76V34Z" fill="#94A3B8" stroke="#64748B" stroke-width="1.2"/>'
            + '<path d="M60 20L86 40V70L69 96H51L34 70V40Z" fill="#CBD5E1" stroke="#94A3B8" stroke-width="0.8"/>'
            + '<path d="M40 52L80 52L76 63H44Z" fill="url(#vDash)" filter="url(#gDash)"/>'
            + '<line x1="46" y1="57.5" x2="74" y2="57.5" stroke="#FDE68A" stroke-width="0.7" opacity="0.4"/>'
            + '<path d="M50 72H70L67 84H53Z" fill="#94A3B8"/>'
            + '<path d="M25 44L34 41V66L25 63Z" fill="#94A3B8"/><path d="M95 44L86 41V66L95 63Z" fill="#94A3B8"/>'
            + '<path d="M56 10L60 3L64 10" stroke="#D97706" stroke-width="1.5" fill="none" filter="url(#gDash)"/>'
            + '<line x1="27" y1="50" x2="32" y2="50" stroke="#D97706" stroke-width="1.5" filter="url(#gDash)"/>'
            + '<line x1="88" y1="50" x2="93" y2="50" stroke="#D97706" stroke-width="1.5" filter="url(#gDash)"/>'
            + '<circle cx="60" cy="90" r="2.5" fill="#D97706" filter="url(#gcDash)"/>'
            + '</svg>';
    }

    // ===== ATOM WORDMARK =====
    function atomWord(size) {
        var s = 'font-family:Bebas Neue,sans-serif;font-size:' + size + 'px;letter-spacing:0.12em;line-height:1;';
        return '<span style="' + s + 'color:#1A1A18">AT</span><span style="' + s + 'color:#C77D05">O</span><span style="' + s + 'color:#1A1A18">M</span>';
    }

    // ===== MODAL =====
    function showModal(title, contentHtml) {
        var existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = '<div class="modal-content">'
            + '<div class="modal-header"><span class="modal-title">' + title + '</span><button class="modal-close">&times;</button></div>'
            + '<div class="modal-body">' + contentHtml + '</div>'
            + '</div>';
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.classList.contains('modal-close')) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    // Store data globally
    var _dashData = {};

    // ===== AGENT CONFIG =====
    var AGENTS = [
        { l: 'C', n: 'Câmbio', d: 'Extração de PDF', c: '#C77D05', g: 'rgba(199,125,5,0.06)' },
        { l: 'S', n: 'Serasa', d: 'Score & crédito', c: '#0891B2', g: 'rgba(8,145,178,0.07)' },
        { l: 'F', n: 'Frete', d: 'Análise de mercado', c: '#059669', g: 'rgba(5,150,105,0.07)' },
        { l: 'T', n: 'Tracking', d: 'Rastreio Maersk', c: '#7C3AED', g: 'rgba(124,58,237,0.07)' },
        { l: 'Q', n: 'Cotação', d: 'Outlook & ofertas', c: '#EA580C', g: 'rgba(234,88,12,0.07)' },
        { l: 'V', n: 'Chequeio Op', d: 'Oferta vs Custos', c: '#0891B2', g: 'rgba(8,145,178,0.07)' },
        { l: 'V', n: 'Chequeio Fin', d: 'Oferta vs Itens', c: '#059669', g: 'rgba(5,150,105,0.07)' },
        { l: 'I', n: 'Frequência', d: 'Inside Sales Intel', c: '#DB2777', g: 'rgba(219,39,119,0.07)' },
        { l: 'B', n: 'Booking', d: 'Email → Skychart', c: '#7C3AED', g: 'rgba(124,58,237,0.07)' },
        { l: 'D', n: 'Demurrage', d: 'Free Time Control', c: '#DC2626', g: 'rgba(220,38,38,0.07)' }
    ];

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

        // Assertividade (Gemini audit)
        var auditEvents = checkEvents.filter(function(e) { return e.action === 'auditoria_assertividade' && e.data; });
        var globalAssertividade = -1;
        var totalAuditado = 0;
        if (auditEvents.length > 0) {
            var totalCorretos = 0;
            auditEvents.forEach(function(e) {
                totalAuditado += (e.data.totalAuditado || 0);
                totalCorretos += (e.data.corretos || 0);
            });
            globalAssertividade = totalAuditado > 0 ? Math.round((totalCorretos / totalAuditado) * 100) : -1;
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

        // Heartbeats
        var heartbeats = data.heartbeats || {};
        var latestVer = data.latestVersion || '?';
        var hbKeys = Object.keys(heartbeats);
        var onlineCount = 0;
        hbKeys.forEach(function(k) {
            var hb = heartbeats[k];
            if (hb && (Date.now() - (hb.lastSeen || 0)) < 600000) onlineCount++;
        });

        // ============================================================
        // RENDER HTML
        // ============================================================
        var html = '';

        // GRID BACKGROUND
        html += '<div class="grid-bg"></div>';

        // TOP BAR
        html += '<div class="top-bar">';
        html += '  <div class="top-bar-left">';
        html += '    ' + atomLogoSvg(28);
        html += '    <span>' + atomWord(18) + '</span>';
        html += '    <span class="top-bar-sub">CENTRO DE COMANDO</span>';
        html += '  </div>';
        html += '  <div class="top-bar-right">';
        html += '    <span class="badge badge-green"><span class="badge-dot"></span>' + onlineCount + ' EXTENSÕES ONLINE</span>';
        html += '    <span class="badge badge-muted">VERSÃO ' + latestVer + '</span>';
        html += '  </div>';
        html += '</div>';

        // MAIN CONTENT
        html += '<div class="dash-content">';

        // ── AGENTS GRID ──
        html += '<div class="agents-grid fade-up">';
        AGENTS.forEach(function(a) {
            html += '<div class="agent-card">';
            html += '  <div class="agent-icon" style="background:' + a.g + ';border:1px solid ' + a.c + '25;color:' + a.c + '">' + a.l + '</div>';
            html += '  <div>';
            html += '    <div class="agent-info-name">' + a.n + '</div>';
            html += '    <div class="agent-info-desc">' + a.d + '</div>';
            html += '  </div>';
            html += '</div>';
        });
        html += '</div>';

        // ── STAT CARDS ROW 1 ──
        html += '<div class="stat-grid">';
        html += statCard('Total de Eventos', totalEvents, 'amber', 'Ações registradas por todos os agentes', 1);
        html += statCard('Chequeios', totalChecks, null, avgAccuracy > 0 ? 'Divergência média: ' + avgAccuracy + '%' : 'Sem dados', 2);
        if (globalAssertividade >= 0) {
            html += statCard('Assertividade ATOM', globalAssertividade + '%', 'green', totalAuditado + ' leituras auditadas', 3);
        }
        html += statCard('Processos Resolvidos', resolvedCount, 'green', 'Containers devolvidos', 4);
        html += statCard('Emails Processados', emailsCaptured, 'purple', cotacoesExtraidas + ' cotações, ' + bookingsExtraidos + ' bookings', 5);
        html += '</div>';

        // ── STAT CARDS ROW 2 ──
        html += '<div class="stat-grid" style="margin-bottom:24px">';
        if (latestPortfolio) {
            html += statCard('Expirados', latestPortfolio.expirado || 0, 'red', 'Free time vencido', 1);
            html += statCard('Em Alerta', latestPortfolio.alerta || 0, 'amber', 'Próximos do vencimento', 2);
        }
        html += statCard('Clientes Serasa', serasaCount, 'purple', 'Scores consultados', 3);
        if (latestPortfolio) {
            html += statCard('Total Demurrage', latestPortfolio.total || 0, null, 'Processos ativos no controle', 4);
        }
        html += '</div>';

        // ── HEART BEATS ──
        if (hbKeys.length > 0) {
            html += '<div class="fade-up fade-up-3" style="margin-bottom:24px">';
            html += '<div class="panel">';
            html += '<div class="panel-header">';
            html += '  <div class="panel-title"><span class="panel-title-icon">⚡</span><span class="panel-title-text">Extensões Ativas</span></div>';
            html += '  <span class="panel-action">VERSÃO ATUAL: ' + latestVer + '</span>';
            html += '</div>';
            html += '<div class="panel-body no-pad">';
            html += '<table class="atom-table"><thead><tr>';
            html += '<th>Usuário</th><th style="width:80px">Versão</th><th>Perfil</th><th>Última Atividade</th>';
            html += '</tr></thead><tbody>';
            hbKeys.forEach(function(key) {
                var hb = heartbeats[key];
                if (!hb) return;
                var isUpToDate = hb.version === latestVer;
                var minAgo = Math.round((Date.now() - (hb.lastSeen || 0)) / 60000);
                var isOnline = minAgo < 10;
                var dotClass = !isOnline ? 'offline' : isUpToDate ? 'online pulse' : 'outdated';
                var timeStr = minAgo < 1 ? 'agora' : minAgo < 60 ? minAgo + ' min atrás' : Math.floor(minAgo/60) + 'h atrás';
                html += '<tr>';
                html += '<td><span style="display:inline-flex;align-items:center;gap:6px"><span class="status-dot ' + dotClass + '"></span>' + (hb.user || key) + '</span></td>';
                html += '<td class="accent">' + (hb.version || '?') + '</td>';
                html += '<td>' + (hb.profile || '-') + '</td>';
                html += '<td>' + timeStr + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
            html += '</div></div></div>';
        }

        // ── TWO COLUMN: RANKING + SERASA ──
        html += '<div class="two-col">';

        // Armador Ranking
        html += '<div class="fade-up fade-up-4"><div class="panel">';
        html += '<div class="panel-header"><div class="panel-title"><span class="panel-title-icon">⚓</span><span class="panel-title-text">Ranking de Armadores</span></div></div>';
        html += '<div class="panel-body">';
        if (armadorRanking.length > 0) {
            var maxArm = armadorRanking[0].count;
            var barColors = ['#C77D05', '#7C3AED', '#0891B2', '#059669', '#EA580C', '#DB2777', '#DC2626', '#0891B2'];
            armadorRanking.slice(0, 8).forEach(function(arm, i) {
                var pct = Math.round((arm.count / maxArm) * 100);
                html += '<div class="bar-row">';
                html += '<span class="bar-label">' + arm.name + '</span>';
                html += '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(pct, 8) + '%;background:' + barColors[i % barColors.length] + '"><span class="bar-fill-value">' + arm.count + '</span></div></div>';
                html += '</div>';
            });
        } else {
            html += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:11px">Dados aparecem após carregar o portfólio</div>';
        }
        html += '</div></div></div>';

        // Serasa Scores
        html += '<div class="fade-up fade-up-5"><div class="panel">';
        html += '<div class="panel-header"><div class="panel-title"><span class="panel-title-icon">📋</span><span class="panel-title-text">Scores Serasa</span></div></div>';
        if (serasaList.length > 0) {
            html += '<div class="panel-body no-pad">';
            html += '<table class="atom-table"><thead><tr>';
            html += '<th>Cliente</th><th style="width:70px">Score</th><th>Limite</th>';
            html += '</tr></thead><tbody>';
            serasaList.slice(0, 10).forEach(function(s) {
                var scoreColor = s.score >= 700 ? 'good' : s.score >= 400 ? 'accent' : 'danger';
                html += '<tr>';
                html += '<td>' + s.cliente + '</td>';
                html += '<td class="' + scoreColor + '">' + s.score + '</td>';
                html += '<td>' + (s.limite ? 'R$ ' + Number(s.limite).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-') + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
            html += '</div>';

            // Score ring for first client
            var firstScore = serasaList[0];
            if (firstScore) {
                var scoreVal = firstScore.score;
                var scorePct = Math.min(scoreVal / 1000, 1);
                var ringColor = scoreVal >= 700 ? '#059669' : scoreVal >= 400 ? '#C77D05' : '#DC2626';
                var riskLabel = scoreVal >= 700 ? 'Risco Muito Baixo' : scoreVal >= 400 ? 'Risco Moderado' : 'Risco Alto';
                html += '<div class="panel-body"><div class="score-ring-container">';
                html += '<div style="position:relative;width:56px;height:56px">';
                html += '<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="24" fill="none" stroke="var(--border)" stroke-width="4"/>'
                    + '<circle cx="28" cy="28" r="24" fill="none" stroke="' + ringColor + '" stroke-width="4" stroke-dasharray="' + (scorePct * 150.8) + ' 150.8" stroke-linecap="round" transform="rotate(-90 28 28)"/>'
                    + '</svg>';
                html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Bebas Neue,sans-serif;font-size:16px;color:' + ringColor + '">' + scoreVal + '</div>';
                html += '</div>';
                html += '<div><div class="score-ring-info-title">' + riskLabel + '</div><div class="score-ring-info-sub">Score consultado via agente Serasa</div></div>';
                html += '</div></div>';
            }
        } else {
            html += '<div class="panel-body"><div style="text-align:center;padding:20px;color:var(--text-muted);font-size:11px">Consultas aparecem quando scores forem registrados</div></div>';
        }
        html += '</div></div>';

        html += '</div>'; // close two-col

        // ── TWO COLUMN: CHEQUEIOS + ATIVIDADE ──
        html += '<div class="two-col">';

        // Chequeios
        html += '<div class="fade-up fade-up-6"><div class="panel">';
        html += '<div class="panel-header"><div class="panel-title"><span class="panel-title-icon">✓</span><span class="panel-title-text">Últimos Chequeios</span></div></div>';
        html += '<div class="panel-body no-pad">';
        if (checkResults.length > 0) {
            html += '<table class="atom-table" id="check-table"><thead><tr>';
            html += '<th>Quando</th><th>Módulo</th><th>Processo</th><th style="width:50px">Itens</th><th style="width:50px">Erros</th><th style="width:60px">Acerto</th>';
            html += '</tr></thead><tbody>';
            checkResults.slice(0, 10).forEach(function(e, idx) {
                var d = e.data || {};
                var acertoClass = (d.taxaAcerto || 0) >= 90 ? 'good' : (d.taxaAcerto || 0) >= 70 ? 'accent' : 'danger';
                var moduloBadgeClass = (d.modulo === 'operacional') ? 'badge-cyan' : 'badge-amber';
                html += '<tr data-check-idx="' + idx + '" style="cursor:pointer">';
                html += '<td>' + formatDate(e.timestamp) + '</td>';
                html += '<td><span class="badge ' + moduloBadgeClass + '"><span class="badge-dot"></span>' + (d.modulo || '-') + '</span></td>';
                html += '<td class="mono">' + (d.processo || '-') + '</td>';
                html += '<td>' + (d.totalItens || 0) + '</td>';
                html += '<td class="' + ((d.errosEncontrados || 0) > 0 ? 'danger' : 'good') + '">' + (d.errosEncontrados || 0) + '</td>';
                html += '<td class="' + acertoClass + '">' + (d.taxaAcerto || 0) + '%</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
        } else {
            html += '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:11px">Resultados aparecem após o primeiro chequeio</div>';
        }
        html += '</div></div></div>';

        // User Activity
        html += '<div class="fade-up fade-up-7"><div class="panel">';
        html += '<div class="panel-header"><div class="panel-title"><span class="panel-title-icon">👤</span><span class="panel-title-text">Atividade por Usuário</span></div></div>';
        html += '<div class="panel-body">';
        if (userRanking.length > 0) {
            var maxUser = userRanking[0].total;
            var userColors = ['#C77D05', '#0891B2', '#7C3AED', '#059669', '#DB2777'];
            html += '<div id="user-chart">';
            userRanking.slice(0, 6).forEach(function(u, i) {
                var pct = Math.round((u.total / maxUser) * 100);
                var name = u.name.length > 18 ? u.name.substring(0, 18) + '...' : u.name;
                html += '<div class="bar-row" data-user="' + u.name + '">';
                html += '<span class="bar-label">' + name + '</span>';
                html += '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(pct, 8) + '%;background:' + userColors[i % userColors.length] + '"><span class="bar-fill-value">' + u.total + '</span></div></div>';
                html += '</div>';
            });
            html += '</div>';

            // Sparkline
            html += '<div class="sparkline-area">';
            html += '<div class="sparkline-label">ATIVIDADE ÚLTIMAS 24H</div>';
            html += buildSparkline(allEvents);
            html += '</div>';
        } else {
            html += '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:11px">Atividade será registrada conforme os agentes são usados</div>';
        }
        html += '</div></div></div>';

        html += '</div>'; // close two-col

        // ── FOOTER ──
        html += '<div class="dash-footer">';
        html += '<div class="footer-left">' + atomLogoSvg(20) + '<span class="footer-text">ATOM · MOND SHIPPING · 2026</span></div>';
        html += '<div class="footer-right"><span class="footer-text">Atualização automática</span><span class="status-dot online" style="width:6px;height:6px"></span></div>';
        html += '</div>';

        html += '</div>'; // close dash-content

        // ============================================================
        // INJECT
        // ============================================================
        var appEl = document.getElementById('app');
        appEl.className = '';
        appEl.innerHTML = html;
        window.scrollTo(0, 0);

        bindInteractiveEvents(userRanking, checkResults);
    }

    // ===== SPARKLINE BUILDER =====
    function buildSparkline(events) {
        // Group events by hour in last 24h
        var now = Date.now();
        var hours = [];
        for (var i = 23; i >= 0; i--) {
            var start = now - (i + 1) * 3600000;
            var end = now - i * 3600000;
            var count = events.filter(function(e) { return e.timestamp >= start && e.timestamp < end; }).length;
            hours.push(count);
        }
        var maxH = Math.max.apply(null, hours) || 1;
        var points = [];
        var fillPoints = [];
        hours.forEach(function(v, i) {
            var x = Math.round((i / 23) * 300);
            var y = Math.round(48 - (v / maxH) * 40);
            points.push(x + ' ' + y);
            fillPoints.push(x + ' ' + y);
        });
        fillPoints.push('300 48');
        fillPoints.push('0 48');

        return '<svg width="100%" height="48" viewBox="0 0 300 48" preserveAspectRatio="none" style="display:block">'
            + '<defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C77D05" stop-opacity="0.15"/><stop offset="100%" stop-color="#C77D05" stop-opacity="0"/></linearGradient></defs>'
            + '<polygon points="' + fillPoints.join(' ') + '" fill="url(#sparkFill)"/>'
            + '<polyline points="' + points.join(' ') + '" fill="none" stroke="#C77D05" stroke-width="1.5"/>'
            + '</svg>';
    }

    // ===== BIND INTERACTIVE EVENTS =====
    function bindInteractiveEvents(userRanking, checkResults) {
        var userChart = document.getElementById('user-chart');
        if (userChart) {
            userChart.addEventListener('click', function(e) {
                var row = e.target.closest('.bar-row');
                if (!row) return;
                var userName = row.getAttribute('data-user');
                var user = userRanking.find(function(u) { return u.name === userName; });
                if (!user) return;

                var mhtml = '<table class="atom-table"><thead><tr><th>Agente</th><th>Ações</th></tr></thead><tbody>';
                Object.keys(user.agents).forEach(function(agent) {
                    mhtml += '<tr><td>' + agent + '</td><td class="accent">' + user.agents[agent] + '</td></tr>';
                });
                mhtml += '</tbody></table>';
                mhtml += '<div style="margin-top:16px;font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">ÚLTIMAS ATIVIDADES</div>';
                mhtml += '<div style="max-height:200px;overflow-y:auto">';
                user.events.slice(0, 10).forEach(function(evt) {
                    mhtml += timelineItem(evt);
                });
                mhtml += '</div>';
                showModal('ATIVIDADE: ' + userName.toUpperCase(), mhtml);
            });
        }

        var checkTable = document.getElementById('check-table');
        if (checkTable) {
            checkTable.addEventListener('click', function(e) {
                var row = e.target.closest('tr[data-check-idx]');
                if (!row) return;
                var idx = parseInt(row.getAttribute('data-check-idx'));
                var check = checkResults[idx];
                if (!check || !check.data) return;
                var d = check.data;
                var mhtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
                mhtml += '<div><span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">Módulo</span><div style="font-family:Bebas Neue,sans-serif;font-size:24px;margin-top:4px">' + (d.modulo || '-') + '</div></div>';
                mhtml += '<div><span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">Processo</span><div style="font-family:Bebas Neue,sans-serif;font-size:24px;margin-top:4px;color:var(--accent)">' + (d.processo || '-') + '</div></div>';
                mhtml += '<div><span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">Itens OK</span><div style="font-family:Bebas Neue,sans-serif;font-size:24px;margin-top:4px;color:var(--green)">' + (d.itensOk || 0) + '</div></div>';
                mhtml += '<div><span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">Erros</span><div style="font-family:Bebas Neue,sans-serif;font-size:24px;margin-top:4px;color:var(--red)">' + (d.errosEncontrados || 0) + '</div></div>';
                mhtml += '</div>';
                mhtml += '<div style="text-align:center;padding:12px;background:var(--bg-alt);border-radius:8px;margin-bottom:12px">';
                mhtml += '<span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">TAXA DE ACERTO</span>';
                mhtml += '<div style="font-family:Bebas Neue,sans-serif;font-size:48px;color:' + ((d.taxaAcerto || 0) >= 80 ? 'var(--green)' : 'var(--red)') + ';line-height:1;margin-top:4px">' + (d.taxaAcerto || 0) + '%</div>';
                mhtml += '</div>';
                mhtml += '<div style="font-size:10px;color:var(--text-muted);text-align:center">' + formatDate(check.timestamp) + ' · ' + (check.user || 'unknown') + '</div>';
                showModal('CHEQUEIO: ' + (d.processo || d.modulo), mhtml);
            });
        }
    }

    // ===== COMPONENT BUILDERS =====
    function statCard(label, value, accent, sub, delay) {
        var accentAttr = accent ? ' data-accent="' + accent + '"' : '';
        return '<div class="stat-card fade-up fade-up-' + delay + '"' + accentAttr + '>'
            + '<div class="stat-label">' + label + '</div>'
            + '<div class="stat-value">' + value + '</div>'
            + '<div class="stat-sub">' + sub + '</div>'
            + '</div>';
    }

    function timelineItem(evt) {
        var agent = evt.agent || 'unknown';
        var descriptions = {
            'chequeio_concluido': function(d) { var ref = d.processo ? ' (' + d.processo + ')' : ''; return 'Chequeio ' + (d.modulo || '') + ref + ': ' + (d.totalItens || 0) + ' itens, ' + (d.taxaAcerto || 0) + '% acerto'; },
            'processo_resolvido': function(d) { return 'Processo ' + (d.processo || '?') + ' marcado como devolvido'; },
            'portfolio_snapshot': function(d) { return 'Portfolio: ' + (d.total || 0) + ' processos (' + (d.expirado || 0) + ' expirados)'; },
            'score_salvo': function(d) { return 'Score Serasa: ' + (d.cliente || '?') + ' = ' + (d.score || '?'); },
            'email_capturado': function(d) { return 'Email lido: ' + (d.subject || 'sem assunto'); },
            'cotacao_extraida': function(d) { return 'Cotação extraída (' + (d.campos || 0) + ' campos)'; },
            'booking_extraido': function(d) { return 'Booking extraído (' + (d.campos || 0) + ' campos)'; }
        };
        var descFn = descriptions[evt.action];
        var text = descFn ? descFn(evt.data || {}) : evt.action;
        var agentColors = { check: '#0891B2', demurrage: '#DC2626', serasa: '#059669', outlook: '#7C3AED' };
        var dotColor = agentColors[agent] || '#C77D05';
        return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">'
            + '<span style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';flex-shrink:0;margin-top:5px"></span>'
            + '<div style="min-width:0"><div style="font-size:11px;color:var(--text)">' + text + '</div>'
            + '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">' + (evt.user || 'unknown') + ' · ' + timeAgo(evt.timestamp) + '</div>'
            + '</div></div>';
    }

    // ===== INIT =====
    function loadAndRender() {
        fetchAll()
            .then(render)
            .catch(function(err) {
                console.error('[Dashboard] Erro:', err);
                document.getElementById('app').innerHTML = '<div class="dash-loading"><div style="color:var(--red);font-family:Barlow Condensed,sans-serif">' + err.message + '</div></div>';
            });
    }

    loadAndRender();
    setInterval(loadAndRender, refreshInterval);

})();

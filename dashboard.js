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
            fetch(FIREBASE_URL + '/system/latestVersion.json').then(function(r) { return r.json(); }),
            fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL').then(function(r) { return r.json(); }).catch(function() { return null; })
        ]).then(function(results) {
            return {
                analytics: results[0] || {},
                resolved: results[1] || {},
                demurrageCache: results[2] || {},
                serasa: results[3] || {},
                heartbeats: results[4] || {},
                latestVersion: results[5] || '?',
                exchange: results[6] || null
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

    // ===== AGENT CONFIG (extended) =====
    var AGENTS = [
        {
            l: 'C', n: 'Câmbio', d: 'Extração de PDF', c: '#C77D05', g: 'rgba(199,125,5,0.06)',
            key: null, // no dedicated analytics bucket yet
            desc: 'Agente responsável por ler contratos de câmbio em PDF, extrair o número do contrato e preencher automaticamente o campo correspondente no Skychart. Utiliza Gemini para interpretar documentos.',
            tree: ['Recebe PDF do contrato', 'Envia ao Gemini para leitura', 'Extrai número do contrato', 'Localiza campo no Skychart', 'Preenche e confirma'],
            roadmap: ['Extrair mais campos (valor, vencimento)', 'Detectar tipo de contrato automaticamente', 'Validação cruzada com dados existentes']
        },
        {
            l: 'S', n: 'Serasa', d: 'Score & crédito', c: '#0891B2', g: 'rgba(8,145,178,0.07)',
            key: 'serasa',
            desc: 'Agente que consulta o score Serasa do cliente diretamente da página, extrai score, limite de crédito e salva no Firebase. Dados aparecem no dashboard para análise de risco.',
            tree: ['Detecta página de consulta Serasa', 'Lê score e limite de crédito do DOM', 'Formata e valida os dados', 'Salva no Firebase (serasa/)', 'Registra evento analytics'],
            roadmap: ['Alerta automático para scores abaixo de 400', 'Histórico de evolução de score', 'Integração com política de crédito']
        },
        {
            l: 'F', n: 'Frete', d: 'Análise de mercado', c: '#059669', g: 'rgba(5,150,105,0.07)',
            key: null,
            desc: 'Agente de inteligência de mercado para fretes marítimos. Analisa cotações, compara preços entre armadores e identifica tendências de custo.',
            tree: ['Coleta cotações de fretes', 'Compara por rota e armador', 'Calcula média de mercado', 'Identifica oportunidades', 'Gera análise comparativa'],
            roadmap: ['Previsão de preço com ML', 'Alertas de oportunidade em tempo real', 'Dashboard próprio de mercado']
        },
        {
            l: 'T', n: 'Tracking', d: 'Rastreio Maersk', c: '#7C3AED', g: 'rgba(124,58,237,0.07)',
            key: null,
            desc: 'Agente de rastreamento de containers via API Maersk. Monitora posição, status e ETA dos containers em trânsito, alertando sobre atrasos.',
            tree: ['Recebe BL/container do processo', 'Consulta API Maersk', 'Extrai status e ETA', 'Compara com deadline do free time', 'Alerta se risco de atraso'],
            roadmap: ['Integrar MSC e CMA CGM', 'Mapa visual de rotas', 'Previsão de atraso com IA']
        },
        {
            l: 'Q', n: 'Cotação', d: 'Outlook & ofertas', c: '#EA580C', g: 'rgba(234,88,12,0.07)',
            key: 'outlook',
            desc: 'Agente que monitora e-mails no Outlook, extrai dados de cotações e bookings automaticamente. Identifica campos como valores, rotas, armadores e prazos.',
            tree: ['Detecta novo e-mail no Outlook', 'Analisa conteúdo com Gemini', 'Identifica tipo (cotação/booking)', 'Extrai campos relevantes', 'Salva dados estruturados'],
            roadmap: ['Resposta automática de cotação', 'Classificação por urgência', 'Integração direta com Skychart']
        },
        {
            l: 'V', n: 'Chequeio Op', d: 'Oferta vs Custos', c: '#0891B2', g: 'rgba(8,145,178,0.07)',
            key: 'check', filterFn: function(e) { return !e.data || e.data.modulo !== 'financeiro'; },
            desc: 'Agente que verifica os custos lançados no Skychart operacional contra a oferta/cotação original. Identifica divergências de valores para prevenir prejuízos.',
            tree: ['Acessa aba de custos no Skychart', 'Lê todos os valores do DOM', 'Compara com oferta original', 'Calcula taxa de acerto', 'Destaca erros encontrados'],
            roadmap: ['Correção automática de valores', 'Relatório de divergências por período', 'Alerta preditivo antes do faturamento']
        },
        {
            l: 'V', n: 'Chequeio Fin', d: 'Oferta vs Itens', c: '#059669', g: 'rgba(5,150,105,0.07)',
            key: 'check', filterFn: function(e) { return e.data && e.data.modulo === 'financeiro'; },
            desc: 'Agente que verifica os itens financeiros no Skychart contra a oferta original. Foco em valores de faturamento, impostos e margens.',
            tree: ['Acessa aba financeira no Skychart', 'Lê itens e valores do DOM', 'Compara com oferta original', 'Calcula taxa de acerto', 'Destaca divergências'],
            roadmap: ['Verificação de impostos', 'Cálculo de margem real vs projetada', 'Integração com ERP']
        },
        {
            l: 'I', n: 'Frequência', d: 'Inside Sales Intel', c: '#DB2777', g: 'rgba(219,39,119,0.07)',
            key: null,
            desc: 'Agente de inteligência comercial que analisa a frequência de embarques por cliente. Classifica clientes em novos, retomados e tradicionais para estratégia de vendas.',
            tree: ['Coleta dados de embarques', 'Agrupa por cliente e período', 'Calcula frequência e recência', 'Classifica tipo de cliente', 'Gera Raio-X comercial'],
            roadmap: ['Score de propensão de churn', 'Sugestão automática de abordagem', 'Relatório semanal para comercial']
        },
        {
            l: 'B', n: 'Booking', d: 'Email → Skychart', c: '#7C3AED', g: 'rgba(124,58,237,0.07)',
            key: 'outlook', filterFn: function(e) { return e.action === 'booking_extraido'; },
            desc: 'Agente que extrai dados de bookings de e-mails no Outlook e prepara para lançamento no Skychart. Automatiza a digitação de dados operacionais.',
            tree: ['Detecta e-mail com booking', 'Extrai campos com Gemini', 'Valida dados obrigatórios', 'Prepara para Skychart', 'Registra extração'],
            roadmap: ['Lançamento direto no Skychart', 'Validação cruzada com cotação', 'Confirmação automática ao armador']
        },
        {
            l: 'D', n: 'Demurrage', d: 'Free Time Control', c: '#DC2626', g: 'rgba(220,38,38,0.07)',
            key: 'demurrage',
            desc: 'Agente de controle de demurrage e free time. Monitora prazos de devolução de containers, calcula dias restantes, identifica riscos e gera relatórios de portfólio.',
            tree: ['Escaneia lista de processos ativos', 'Calcula dias de free time restantes', 'Classifica: OK / Alerta / Expirado', 'Agrupa por armador/cliente', 'Gera relatório e snapshots'],
            roadmap: ['Cálculo automático de custo de demurrage', 'Alerta por e-mail ao responsável', 'Negociação automática de extensão']
        },
        {
            l: 'X', n: 'Site Scanner', d: 'Leitura de Estrutura', c: '#6366F1', g: 'rgba(99,102,241,0.07)',
            key: null,
            desc: 'Agente de infraestrutura que lê a estrutura completa de qualquer página web. Mapeia formulários, botões, inputs, tabelas e menus. Utilizado para integrar novos sites (CMA, HMM, Maersk, Time to Cargo) sem trabalho manual de outerHTML.',
            tree: ['Detecta framework da página (Angular, React, etc)', 'Escaneia todos os elementos interativos', 'Mapeia formulários e campos', 'Identifica botões e ações disponíveis', 'Exporta estrutura completa para os agentes'],
            roadmap: ['Auto-mapeamento de sites novos', 'Detecção de mudanças em layouts', 'Geração automática de seletores']
        },
        {
            l: 'L', n: 'Atom Learn', d: 'Gravar & Reproduzir', c: '#F59E0B', g: 'rgba(245,158,11,0.07)',
            key: null,
            desc: 'Sistema de aprendizado por observação. Grava ações do usuário (cliques, digitação, navegação) e reproduz automaticamente. Permite ensinar fluxos complexos sem código.',
            tree: ['Ativa gravação (REC)', 'Registra cada ação do usuário', 'Salva recording no Firebase', 'Reproduz ações passo-a-passo', 'Adapta seletores quando DOM muda'],
            roadmap: ['Workflows multi-site (Skychart → Drive → Gmail)', 'Agendamento de workflows', 'Execução em lote para múltiplos processos']
        },
        {
            l: 'W', n: 'Vision', d: 'Leitura Visual IA', c: '#8B5CF6', g: 'rgba(139,92,246,0.07)',
            key: null,
            desc: 'Agente de visão computacional que usa Gemini para interpretar telas visualmente. Quando seletores falham, o Vision analisa screenshots para encontrar elementos e executar ações.',
            tree: ['Captura screenshot da página', 'Envia ao Gemini Vision', 'Recebe coordenadas do elemento', 'Executa ação no ponto identificado', 'Verifica resultado visualmente'],
            roadmap: ['Leitura de PDFs visuais (faturas, BLs)', 'OCR de documentos escaneados', 'Verificação visual de preenchimento']
        },
        {
            l: 'A', n: 'Smart Agent', d: 'Motor de Automação', c: '#10B981', g: 'rgba(16,185,129,0.07)',
            key: null,
            desc: 'Agente central de automação do Skychart. Orquestra preenchimento de campos, extração de dados, e integração entre módulos. É o cérebro que coordena os outros agentes.',
            tree: ['Recebe tarefa do usuário ou trigger', 'Analisa contexto da tela atual', 'Seleciona estratégia de ação', 'Executa com fallback automático', 'Registra resultado e aprende'],
            roadmap: ['Planejamento autônomo de tarefas', 'Aprendizado por reforço', 'Execução proativa sem trigger']
        },
        {
            l: 'G', n: 'DOM Scanner', d: 'Leitura Profunda', c: '#64748B', g: 'rgba(100,116,139,0.07)',
            key: null,
            desc: 'Scanner profundo de DOM que extrai dados estruturados de grids, tabelas e formulários complexos do Skychart. Funciona em conjunto com o Site Scanner para leitura completa.',
            tree: ['Identifica grids e tabelas no DOM', 'Extrai headers e linhas de dados', 'Normaliza valores (moeda, data)', 'Mapeia relações entre campos', 'Exporta dados estruturados'],
            roadmap: ['Detecção de mudanças em tempo real', 'Cache inteligente de estruturas', 'Suporte a iframes e shadow DOM']
        }
    ];

    // ===== AGENT DETAIL MODAL =====
    function showAgentDetail(agentIdx, data) {
        var ag = AGENTS[agentIdx];
        if (!ag) return;

        var analytics = data.analytics || {};
        // Get events for this agent
        var agentEvents = [];
        if (ag.key) {
            var rawEvents = parseEvents(analytics[ag.key]);
            if (ag.filterFn) {
                agentEvents = rawEvents.filter(ag.filterFn);
            } else {
                agentEvents = rawEvents;
            }
        }

        // Metrics
        var totalEvents = agentEvents.length;
        var lastActivity = agentEvents.length > 0 ? timeAgo(agentEvents[0].timestamp) : 'sem registros';
        var uniqueUsers = {};
        agentEvents.forEach(function(e) { uniqueUsers[e.user || 'unknown'] = true; });
        var userCount = Object.keys(uniqueUsers).length;

        // Action breakdown
        var actionCounts = {};
        agentEvents.forEach(function(e) {
            var a = e.action || 'outro';
            actionCounts[a] = (actionCounts[a] || 0) + 1;
        });

        // Build modal HTML
        var h = '';

        // Agent header
        h += '<div class="agent-detail-header">';
        h += '<div class="agent-detail-icon" style="background:' + ag.g + ';border:2px solid ' + ag.c + '30;color:' + ag.c + '">' + ag.l + '</div>';
        h += '<div>';
        h += '<div class="agent-detail-name">' + ag.n + '</div>';
        h += '<div class="agent-detail-sub">' + ag.d + '</div>';
        h += '</div>';
        h += '</div>';

        // Description
        h += '<div class="agent-detail-desc">' + ag.desc + '</div>';

        // Metrics row
        h += '<div class="agent-metrics-row">';
        h += agentMetric('Eventos', totalEvents, ag.c);
        h += agentMetric('Usuários', userCount, ag.c);
        h += agentMetric('Última Atividade', lastActivity, ag.c);
        h += '</div>';

        // Action breakdown
        var actionKeys = Object.keys(actionCounts);
        if (actionKeys.length > 0) {
            h += '<div class="agent-section-label">AÇÕES REGISTRADAS</div>';
            h += '<div class="agent-action-list">';
            actionKeys.sort(function(a, b) { return actionCounts[b] - actionCounts[a]; });
            actionKeys.forEach(function(a) {
                h += '<div class="agent-action-row">';
                h += '<span class="agent-action-name">' + a.replace(/_/g, ' ') + '</span>';
                h += '<span class="agent-action-count" style="color:' + ag.c + '">' + actionCounts[a] + '</span>';
                h += '</div>';
            });
            h += '</div>';
        }

        // Decision tree
        h += '<div class="agent-section-label">ÁRVORE DE DECISÃO</div>';
        h += '<div class="agent-tree">';
        ag.tree.forEach(function(step, i) {
            h += '<div class="agent-tree-step">';
            h += '<div class="agent-tree-num" style="background:' + ag.g + ';color:' + ag.c + ';border:1px solid ' + ag.c + '25">' + (i + 1) + '</div>';
            h += '<div class="agent-tree-line"' + (i < ag.tree.length - 1 ? ' style="border-left:1px dashed ' + ag.c + '30"' : '') + '></div>';
            h += '<span class="agent-tree-text">' + step + '</span>';
            h += '</div>';
        });
        h += '</div>';

        // Roadmap
        h += '<div class="agent-section-label">ROADMAP</div>';
        h += '<div class="agent-roadmap">';
        ag.roadmap.forEach(function(item) {
            h += '<div class="agent-roadmap-item">';
            h += '<span class="agent-roadmap-dot" style="background:' + ag.c + '"></span>';
            h += '<span>' + item + '</span>';
            h += '</div>';
        });
        h += '</div>';

        // Last 10 logs
        if (agentEvents.length > 0) {
            h += '<div class="agent-section-label">ÚLTIMOS LOGS</div>';
            h += '<div class="agent-logs">';
            agentEvents.slice(0, 10).forEach(function(evt) {
                h += timelineItem(evt);
            });
            h += '</div>';
        }

        showModal(ag.n.toUpperCase(), h);
    }

    function agentMetric(label, value, color) {
        return '<div class="agent-metric">'
            + '<div class="agent-metric-label">' + label + '</div>'
            + '<div class="agent-metric-value" style="color:' + color + '">' + value + '</div>'
            + '</div>';
    }

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

        // User activity — normaliza aliases e resolve unknowns por perfil
        var USER_ALIASES = {
            'paulo zanella': 'José Kizner',
            'paulo zanella - mond': 'José Kizner',
            'josé kizner - mond shipping': 'José Kizner',
            'josé kizner - mondshipping': 'José Kizner',
            'jose kizner': 'José Kizner',
            'gerente de contas': 'José Kizner'
        };
        // Mapeia perfil → nome real (pra quem ainda não configurou nome)
        var PROFILE_NAMES = {
            'financeiro-demurrage': 'Gabriela Cordeiro',
            'financeiro': 'Bruna Paim'
        };
        function normalizeUser(name, profile) {
            if (!name) name = 'unknown';
            var lower = name.toLowerCase().trim();
            // Resolve unknown por perfil
            if (lower === 'unknown' && profile && PROFILE_NAMES[profile]) {
                return PROFILE_NAMES[profile];
            }
            // Checa alias direto
            if (USER_ALIASES[lower]) return USER_ALIASES[lower];
            // Checa prefixo
            for (var alias in USER_ALIASES) {
                if (lower.indexOf(alias) === 0) return USER_ALIASES[alias];
            }
            // Checa parcial
            if (lower.indexOf('paulo zanella') >= 0) return 'José Kizner';
            if (lower.indexOf('josé kizner') >= 0 || lower.indexOf('jose kizner') >= 0) return 'José Kizner';
            return name;
        }

        var userStats = {};
        allEvents.forEach(function(e) {
            var u = normalizeUser(e.user || 'unknown', e.profile);
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
        // Exchange rate badges
        var ex = data.exchange;
        if (ex && ex.USDBRL) {
            var usdBid = parseFloat(ex.USDBRL.bid).toFixed(4);
            var usdPct = parseFloat(ex.USDBRL.pctChange);
            var usdArrow = usdPct >= 0 ? '\u25B2' : '\u25BC';
            var usdColor = usdPct >= 0 ? 'badge-green' : 'badge-red';
            html += '    <span class="badge ' + usdColor + '" title="Dólar (' + ex.USDBRL.create_date + ')" style="cursor:default;font-size:10px;">USD ' + usdBid + ' <span style="font-size:8px;">' + usdArrow + ' ' + Math.abs(usdPct).toFixed(2) + '%</span></span>';
        }
        if (ex && ex.EURBRL) {
            var eurBid = parseFloat(ex.EURBRL.bid).toFixed(4);
            var eurPct = parseFloat(ex.EURBRL.pctChange);
            var eurArrow = eurPct >= 0 ? '\u25B2' : '\u25BC';
            var eurColor = eurPct >= 0 ? 'badge-green' : 'badge-red';
            html += '    <span class="badge ' + eurColor + '" title="Euro (' + ex.EURBRL.create_date + ')" style="cursor:default;font-size:10px;">EUR ' + eurBid + ' <span style="font-size:8px;">' + eurArrow + ' ' + Math.abs(eurPct).toFixed(2) + '%</span></span>';
        }
        html += '    <span class="badge badge-green"><span class="badge-dot"></span>' + onlineCount + ' EXTENSÕES ONLINE</span>';
        html += '    <span class="badge badge-muted">VERSÃO ' + latestVer + '</span>';
        html += '  </div>';
        html += '</div>';

        // LAYOUT: SIDEBAR + MAIN
        html += '<div class="dash-layout">';

        // ── AGENTS SIDEBAR ──
        html += '<div class="agents-sidebar fade-up">';
        html += '<div class="sidebar-header">';
        html += atomLogoSvg(28);
        html += '<div><span>' + atomWord(16) + '</span><div style="font-size:7px;font-weight:600;letter-spacing:0.12em;color:var(--text-muted);text-transform:uppercase;margin-top:1px">MOND SHIPPING</div></div>';
        html += '</div>';
        html += '<div class="sidebar-label">AGENTES</div>';
        html += '<div class="sidebar-agents">';
        AGENTS.forEach(function(a, idx) {
            html += '<div class="sidebar-agent" data-agent-idx="' + idx + '">';
            html += '<div class="sidebar-agent-icon" style="background:' + a.g + ';border:1px solid ' + a.c + '25;color:' + a.c + '">' + a.l + '</div>';
            html += '<div class="sidebar-agent-info"><div class="sidebar-agent-name">' + a.n + '</div><div class="sidebar-agent-desc">' + a.d + '</div></div>';
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';

        // MAIN CONTENT
        html += '<div class="dash-content">';

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

        // ── HEART BEATS + SUMMARY ──
        if (hbKeys.length > 0) {
            // Calculate extra metrics
            var outdatedCount = 0, totalHb = hbKeys.length;
            hbKeys.forEach(function(k) {
                var hb = heartbeats[k];
                if (hb && hb.version !== latestVer) outdatedCount++;
            });
            var uptimePct = totalHb > 0 ? Math.round((onlineCount / totalHb) * 100) : 0;

            html += '<div class="two-col fade-up fade-up-3" style="margin-bottom:16px">';

            // Left: compact table
            html += '<div><div class="panel">';
            html += '<div class="panel-header">';
            html += '  <div class="panel-title">' + panelIcon('E','var(--accent)','var(--accent-ghost)') + '<span class="panel-title-text">Extensões</span></div>';
            html += '  <span class="panel-action">v' + latestVer + '</span>';
            html += '</div>';
            html += '<div class="panel-body no-pad">';
            html += '<table class="atom-table compact"><thead><tr>';
            html += '<th>Usuário</th><th>Ver</th><th>Perfil</th><th>Atividade</th>';
            html += '</tr></thead><tbody>';
            // Merge heartbeats por nome normalizado (mais recente ganha)
            var mergedHb = {};
            hbKeys.forEach(function(key) {
                var hb = heartbeats[key];
                if (!hb) return;
                var displayName = normalizeUser(hb.user || 'unknown', hb.profile);
                if (!mergedHb[displayName] || (hb.lastSeen || 0) > (mergedHb[displayName].lastSeen || 0)) {
                    mergedHb[displayName] = { user: displayName, version: hb.version, profile: hb.profile, lastSeen: hb.lastSeen };
                }
            });
            Object.keys(mergedHb).forEach(function(name) {
                var hb = mergedHb[name];
                var isUpToDate = hb.version === latestVer;
                var minAgo = Math.round((Date.now() - (hb.lastSeen || 0)) / 60000);
                var isOnline = minAgo < 10;
                var dotClass = !isOnline ? 'offline' : isUpToDate ? 'online pulse' : 'outdated';
                var timeStr = minAgo < 1 ? 'agora' : minAgo < 60 ? minAgo + 'm' : Math.floor(minAgo/60) + 'h';
                html += '<tr>';
                html += '<td><span style="display:inline-flex;align-items:center;gap:5px"><span class="status-dot ' + dotClass + '"></span>' + name + '</span></td>';
                html += '<td class="accent">' + (hb.version || '?') + '</td>';
                html += '<td>' + (hb.profile || '-') + '</td>';
                html += '<td>' + timeStr + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
            html += '</div></div></div>';

            // Right: summary metrics
            html += '<div><div class="panel">';
            html += '<div class="panel-header"><div class="panel-title">' + panelIcon('M','var(--green)','var(--green-ghost)') + '<span class="panel-title-text">Resumo Operacional</span></div></div>';
            html += '<div class="panel-body">';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
            html += '<div class="agent-metric"><div class="agent-metric-label">UPTIME</div><div class="agent-metric-value" style="color:var(--green)">' + uptimePct + '%</div></div>';
            html += '<div class="agent-metric"><div class="agent-metric-label">ONLINE</div><div class="agent-metric-value" style="color:var(--accent)">' + onlineCount + '/' + totalHb + '</div></div>';
            html += '<div class="agent-metric"><div class="agent-metric-label">DESATUALIZADOS</div><div class="agent-metric-value" style="color:' + (outdatedCount > 0 ? 'var(--red)' : 'var(--green)') + '">' + outdatedCount + '</div></div>';
            html += '<div class="agent-metric"><div class="agent-metric-label">TOTAL AGENTES</div><div class="agent-metric-value" style="color:var(--accent)">' + AGENTS.length + '</div></div>';
            html += '</div>';

            // Today's activity summary
            var todayStart = new Date(); todayStart.setHours(0,0,0,0);
            var todayEvents = allEvents.filter(function(e) { return e.timestamp >= todayStart.getTime(); }).length;
            html += '<div style="margin-top:14px;padding:10px;background:var(--bg-alt);border-radius:8px;border:1px solid var(--border);text-align:center">';
            html += '<div style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">AÇÕES HOJE</div>';
            html += '<div style="font-family:Bebas Neue,sans-serif;font-size:32px;color:var(--accent);line-height:1">' + todayEvents + '</div>';
            html += '</div>';
            html += '</div></div></div>';

            html += '</div>'; // close two-col
        }

        // ── TWO COLUMN: RANKING + SERASA ──
        html += '<div class="two-col">';

        // Armador Ranking
        html += '<div class="fade-up fade-up-4"><div class="panel">';
        html += '<div class="panel-header"><div class="panel-title">' + panelIcon('R','#0891B2','rgba(8,145,178,0.07)') + '<span class="panel-title-text">Ranking de Armadores</span></div></div>';
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
        html += '<div class="panel-header"><div class="panel-title">' + panelIcon('S','#059669','rgba(5,150,105,0.07)') + '<span class="panel-title-text">Scores Serasa</span></div></div>';
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
        html += '<div class="panel-header"><div class="panel-title">' + panelIcon('V','#0891B2','rgba(8,145,178,0.07)') + '<span class="panel-title-text">Últimos Chequeios</span></div></div>';
        html += '<div class="panel-body no-pad">';
        if (checkResults.length > 0) {
            html += '<table class="atom-table" id="check-table"><thead><tr>';
            html += '<th>Quando</th><th>Usuário</th><th>Módulo</th><th>Processo</th><th style="width:50px">Itens</th><th style="width:50px">Erros</th><th style="width:60px">Acerto</th><th style="width:80px">ATOM</th>';
            html += '</tr></thead><tbody>';
            checkResults.slice(0, 10).forEach(function(e, idx) {
                var d = e.data || {};
                var acertoClass = (d.taxaAcerto || 0) >= 90 ? 'good' : (d.taxaAcerto || 0) >= 70 ? 'accent' : 'danger';
                var moduloBadgeClass = (d.modulo === 'operacional') ? 'badge-cyan' : 'badge-amber';
                // Find matching audit for this chequeio
                var auditStatus = '—';
                var auditClass = '';
                for (var ai = 0; ai < auditEvents.length; ai++) {
                    var aud = auditEvents[ai];
                    var timeDiff = Math.abs(aud.timestamp - e.timestamp);
                    if (timeDiff < 120000) { // within 2 min
                        var ad = aud.data || {};
                        var corretos = ad.corretos || 0;
                        var total = ad.totalAuditado || 0;
                        if (total > 0) {
                            var pct = Math.round((corretos / total) * 100);
                            auditStatus = pct + '%';
                            auditClass = pct >= 90 ? 'good' : pct >= 70 ? 'accent' : 'danger';
                        }
                        break;
                    }
                }
                html += '<tr data-check-idx="' + idx + '" style="cursor:pointer">';
                html += '<td>' + formatDate(e.timestamp) + '</td>';
                html += '<td style="font-size:10px;color:var(--text-secondary)">' + normalizeUser(e.user || 'unknown', e.profile) + '</td>';
                html += '<td><span class="badge ' + moduloBadgeClass + '"><span class="badge-dot"></span>' + (d.modulo || '-') + '</span></td>';
                html += '<td class="mono">' + (d.processo || '-') + '</td>';
                html += '<td>' + (d.totalItens || 0) + '</td>';
                html += '<td class="' + ((d.errosEncontrados || 0) > 0 ? 'danger' : 'good') + '">' + (d.errosEncontrados || 0) + '</td>';
                html += '<td class="' + acertoClass + '">' + (d.taxaAcerto || 0) + '%</td>';
                html += '<td class="' + auditClass + '" style="font-weight:600">' + auditStatus + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
        } else {
            html += '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:11px">Resultados aparecem após o primeiro chequeio</div>';
        }
        html += '</div></div></div>';

        // User Activity
        html += '<div class="fade-up fade-up-7"><div class="panel">';
        html += '<div class="panel-header"><div class="panel-title">' + panelIcon('U','var(--accent)','var(--accent-ghost)') + '<span class="panel-title-text">Atividade por Usuário</span></div></div>';
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
        html += '</div>'; // close dash-layout

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
        // Agent sidebar click
        var sidebarAgents = document.querySelector('.sidebar-agents');
        if (sidebarAgents) {
            sidebarAgents.addEventListener('click', function(e) {
                var agent = e.target.closest('.sidebar-agent');
                if (!agent) return;
                var idx = parseInt(agent.getAttribute('data-agent-idx'));
                if (!isNaN(idx)) showAgentDetail(idx, _dashData);
            });
        }

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
                // Acerto
                mhtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">';
                mhtml += '<div style="text-align:center;padding:12px;background:var(--bg-alt);border-radius:8px">';
                mhtml += '<span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">ACERTO (Oferta vs Sistema)</span>';
                mhtml += '<div style="font-family:Bebas Neue,sans-serif;font-size:38px;color:' + ((d.taxaAcerto || 0) >= 80 ? 'var(--green)' : 'var(--red)') + ';line-height:1;margin-top:4px">' + (d.taxaAcerto || 0) + '%</div>';
                mhtml += '</div>';
                // Assertividade ATOM
                var auditPct = -1;
                var analytics = _dashData.analytics || {};
                var auditEvts = parseEvents(analytics.check).filter(function(ae) { return ae.action === 'auditoria_assertividade' && ae.data; });
                for (var ai = 0; ai < auditEvts.length; ai++) {
                    if (Math.abs(auditEvts[ai].timestamp - check.timestamp) < 120000) {
                        var ad = auditEvts[ai].data;
                        if (ad.totalAuditado > 0) auditPct = Math.round((ad.corretos / ad.totalAuditado) * 100);
                        break;
                    }
                }
                mhtml += '<div style="text-align:center;padding:12px;background:var(--bg-alt);border-radius:8px">';
                mhtml += '<span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:var(--text-muted);text-transform:uppercase">ASSERTIVIDADE ATOM</span>';
                if (auditPct >= 0) {
                    mhtml += '<div style="font-family:Bebas Neue,sans-serif;font-size:38px;color:' + (auditPct >= 90 ? 'var(--green)' : 'var(--red)') + ';line-height:1;margin-top:4px">' + auditPct + '%</div>';
                } else {
                    mhtml += '<div style="font-family:Bebas Neue,sans-serif;font-size:22px;color:var(--text-muted);line-height:1;margin-top:6px">—</div>';
                    mhtml += '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">Pendente</div>';
                }
                mhtml += '</div>';
                mhtml += '</div>';
                mhtml += '<div style="font-size:10px;color:var(--text-muted);text-align:center">' + formatDate(check.timestamp) + ' · ' + (check.user || 'unknown') + '</div>';
                showModal('CHEQUEIO: ' + (d.processo || d.modulo), mhtml);
            });
        }
    }

    // ===== COMPONENT BUILDERS =====
    function panelIcon(letter, color, bg) {
        return '<span style="width:22px;height:22px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-family:Bebas Neue,sans-serif;font-size:11px;font-weight:600;color:' + color + ';background:' + bg + ';border:1px solid ' + color + '18;flex-shrink:0;margin-right:8px">' + letter + '</span>';
    }

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

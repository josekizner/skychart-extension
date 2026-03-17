// demurrage-agent.js — Painel standalone de Demurrage no Outlook
// Barra vermelha acima do ATOM AGENT, com dados completos de free time
(function() {
    'use strict';

    var TAG = '[Demurrage]';
    var _data = null;
    var _resolvedMap = {}; // Firebase: processos marcados como resolvidos

    function isContextValid() {
        try { return !!chrome.runtime && !!chrome.runtime.id; } catch(e) { return false; }
    }

    // ===== CRIA BARRA =====
    function createBar() {
        if (document.getElementById('atom-demurrage-bar')) return;

        var bar = document.createElement('div');
        bar.id = 'atom-demurrage-bar';
        bar.innerHTML = [
            '<div class="dm-bar-inner">',
            '  <div class="dm-logo">D</div>',
            '  <span class="dm-title">DEMURRAGE</span>',
            '  <span class="dm-badge" id="dm-badge">—</span>',
            '  <span class="dm-refresh" id="dm-refresh" title="Atualizar dados" style="display:none;">⟳</span>',
            '  <span class="dm-minimize" id="dm-minimize" title="Minimizar" style="display:none;">−</span>',
            '  <span class="dm-collapse" id="dm-collapse" title="Recolher" style="display:none;">▼</span>',
            '</div>',
            '<div id="dm-content"></div>'
        ].join('\n');

        document.body.appendChild(bar);
        injectStyles();

        // Click na barra = toggle expanded/collapsed
        document.querySelector('#atom-demurrage-bar .dm-bar-inner').addEventListener('click', function(e) {
            if (e.target.id === 'dm-collapse' || e.target.id === 'dm-minimize' || e.target.id === 'dm-refresh') return;
            var bar = document.getElementById('atom-demurrage-bar');
            if (bar.classList.contains('mini')) {
                // De mini → expandido
                bar.classList.remove('mini');
                expandPanel();
            } else {
                togglePanel();
            }
        });

        // ▼ = recolhe pra barra
        document.getElementById('dm-collapse').addEventListener('click', function(e) {
            e.stopPropagation();
            collapsePanel();
        });

        // − = minimiza pra só o "D" arrastável
        document.getElementById('dm-minimize').addEventListener('click', function(e) {
            e.stopPropagation();
            miniMode();
        });

        // ⟳ = força refresh da API
        document.getElementById('dm-refresh').addEventListener('click', function(e) {
            e.stopPropagation();
            loadData(true);
        });

        // Drag no modo mini
        initDrag(bar);

        console.log(TAG, 'Barra criada');
        loadData();
    }

    // ===== TOGGLE =====
    function togglePanel() {
        var bar = document.getElementById('atom-demurrage-bar');
        if (bar.classList.contains('expanded')) {
            collapsePanel();
        } else {
            expandPanel();
        }
    }

    function expandPanel() {
        var bar = document.getElementById('atom-demurrage-bar');
        bar.classList.remove('mini');
        bar.classList.add('expanded');
        document.getElementById('dm-collapse').style.display = '';
        document.getElementById('dm-minimize').style.display = '';
        document.getElementById('dm-refresh').style.display = '';
        if (_data) {
            renderTable(_data);
        } else {
            loadData();
        }
    }

    function collapsePanel() {
        var bar = document.getElementById('atom-demurrage-bar');
        bar.classList.remove('expanded');
        bar.classList.remove('mini');
        document.getElementById('dm-collapse').style.display = 'none';
        document.getElementById('dm-minimize').style.display = 'none';
        document.getElementById('dm-refresh').style.display = 'none';
        // Reset inline styles from resize/drag
        bar.style.width = '';
        bar.style.height = '';
    }

    function miniMode() {
        var bar = document.getElementById('atom-demurrage-bar');
        bar.classList.remove('expanded');
        bar.classList.add('mini');
        document.getElementById('dm-collapse').style.display = 'none';
        document.getElementById('dm-minimize').style.display = 'none';
        bar.style.width = '';
        bar.style.height = '';
    }

    // Drag (funciona só no mini mode)
    function initDrag(bar) {
        var isDragging = false, startX, startY, startLeft, startBottom;
        bar.addEventListener('mousedown', function(e) {
            if (!bar.classList.contains('mini')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            var rect = bar.getBoundingClientRect();
            startLeft = rect.left;
            startBottom = window.innerHeight - rect.bottom;
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            bar.style.left = (startLeft + dx) + 'px';
            bar.style.bottom = (startBottom - dy) + 'px';
        });
        document.addEventListener('mouseup', function() {
            isDragging = false;
        });
    }

    // ===== FETCH =====
    var _lastLoadTimestamp = 0;

    function loadData(forceRefresh) {
        var content = document.getElementById('dm-content');
        var refreshBtn = document.getElementById('dm-refresh');
        console.log(TAG, 'loadData chamado, forceRefresh:', !!forceRefresh);

        _lastLoadTimestamp = Date.now();

        // Feedback visual — CSS spin ao invés de emoji
        if (refreshBtn) { refreshBtn.classList.add('spinning'); refreshBtn.style.pointerEvents = 'none'; }

        // Carrega lista de resolvidos do Firebase
        try {
            chrome.runtime.sendMessage({ action: 'getDemurrageResolved' }, function(response) {
                if (chrome.runtime.lastError) return;
                if (response && response.success && response.data) {
                    _resolvedMap = response.data;
                    console.log(TAG, 'Resolvidos (Firebase):', Object.keys(_resolvedMap).length);
                }
            });
        } catch(e) {}

        // 1. CACHE-FIRST
        if (!forceRefresh) {
            chrome.storage.local.get(['demurrageData', 'demurrageTimestamp'], function(d) {
                if (d.demurrageData && d.demurrageData.length > 0) {
                    _data = d.demurrageData;
                    updateBadge(getActiveData());
                    renderTable(_data);
                    console.log(TAG, 'Cache:', _data.length, 'registros');
                } else {
                    content.innerHTML = '<div class="dm-loading"><div class="dm-spinner"></div>Carregando dados pela primeira vez...</div>';
                }
            });
        } else {
            content.innerHTML = '<div class="dm-loading"><div class="dm-spinner"></div>Atualizando...</div>';
        }

        // 2. REFRESH da API
        try {
            chrome.runtime.sendMessage({ action: 'fetchDemurrageData' }, function(response) {
                if (chrome.runtime.lastError) console.log(TAG, 'sendMessage error:', chrome.runtime.lastError.message);
                if (response && response.fromStorage) { applyNewData(); }
                else if (response && !response.success) {
                    resetRefreshBtn();
                    if (!_data) showError(response.error || 'Erro ao buscar dados');
                }
            });
        } catch(e) { console.log(TAG, 'sendMessage falhou:', e.message); }

        // 3. POLL fallback
        var pollInterval = setInterval(function() {
            chrome.storage.local.get(['demurrageData', 'demurrageTimestamp'], function(d) {
                if (d.demurrageTimestamp && d.demurrageTimestamp > _lastLoadTimestamp) {
                    clearInterval(pollInterval);
                    applyNewData();
                }
            });
        }, 3000);
        setTimeout(function() { clearInterval(pollInterval); resetRefreshBtn(); }, 120000);

        function applyNewData() {
            chrome.storage.local.get(['demurrageData'], function(d) {
                if (d.demurrageData && d.demurrageData.length > 0) {
                    _data = d.demurrageData;
                    updateBadge(getActiveData());
                    renderTable(_data);
                    console.log(TAG, 'Dados atualizados:', _data.length);
                }
                resetRefreshBtn();
            });
        }

        function resetRefreshBtn() {
            if (refreshBtn) { refreshBtn.classList.remove('spinning'); refreshBtn.style.pointerEvents = ''; }
        }

        function showError(msg) {
            if (_data) return;
            content.innerHTML = '<div style="padding:10px;color:#f87171;font-size:11px;">' + msg +
                '<br><button id="dm-retry" style="margin-top:6px;padding:4px 12px;background:#6C63FF;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Tentar novamente</button></div>';
            var retryBtn = document.getElementById('dm-retry');
            if (retryBtn) retryBtn.onclick = function() { loadData(true); };
        }
    }

    // Filtra processos resolvidos
    function getActiveData() {
        if (!_data) return [];
        return _data.filter(function(p) {
            var key = (p.processo || '').replace(/\//g, '_');
            return !_resolvedMap[key];
        });
    }

    // Marca/desmarca processo como resolvido no Firebase
    function resolveProcess(processo, resolve) {
        var action = resolve ? 'setDemurrageResolved' : 'removeDemurrageResolved';
        chrome.runtime.sendMessage({ action: action, processo: processo }, function(response) {
            if (chrome.runtime.lastError) return;
            if (response && response.success) {
                var key = processo.replace(/\//g, '_');
                if (resolve) {
                    _resolvedMap[key] = { resolvedAt: new Date().toISOString() };
                } else {
                    delete _resolvedMap[key];
                }
                // Re-render
                updateBadge(getActiveData());
                renderTable(_data);
                console.log(TAG, processo, resolve ? 'resolvido' : 'reaberto');
            }
        });
    }

    function updateBadge(data) {
        var expirados = data.filter(function(p) { return p.status === 'expirado'; });
        var alertas = data.filter(function(p) { return p.status === 'alerta'; });
        var badge = document.getElementById('dm-badge');

        // Count unique processes
        var procExp = {};
        expirados.forEach(function(p) { procExp[p.processo] = true; });
        var procAlt = {};
        alertas.forEach(function(p) { procAlt[p.processo] = true; });
        var nProcExp = Object.keys(procExp).length;
        var nProcAlt = Object.keys(procAlt).length;

        if (nProcExp > 0) {
            badge.textContent = nProcExp + ' proc / ' + expirados.length + ' cntrs expirados';
            badge.className = 'dm-badge danger';
        } else if (nProcAlt > 0) {
            badge.textContent = nProcAlt + ' proc em alerta';
            badge.className = 'dm-badge warning';
        } else {
            badge.textContent = 'OK';
            badge.className = 'dm-badge ok';
        }
    }

    // ===== RENDER TABLE =====
    var _currentItems = []; // track current filtered set for sorting
    var _sortCol = ''; 
    var _sortDir = 'asc';

    function renderTable(data) {
        var content = document.getElementById('dm-content');

        // Filtra resolvidos
        var active = getActiveData();

        // Count by process status (só ativos)
        var expirados = active.filter(function(p) { return p.status === 'expirado'; });
        var alerta = active.filter(function(p) { return p.status === 'alerta'; });
        var ok = active.filter(function(p) { return p.status === 'ok'; });
        var nResolved = Object.keys(_resolvedMap).length;

        var html = [];

        // Summary
        html.push('<div class="dm-summary">');
        html.push('<span class="dm-tag red dm-tag-filter" data-filter="expirado">' + expirados.length + ' Expirados</span>');
        html.push('<span class="dm-tag yellow dm-tag-filter" data-filter="alerta">' + alerta.length + ' Alerta</span>');
        html.push('<span class="dm-tag green dm-tag-filter" data-filter="ok">' + ok.length + ' OK</span>');
        if (nResolved > 0) html.push('<span class="dm-tag blue dm-tag-filter" data-filter="resolved">' + nResolved + ' Resolvidos</span>');
        html.push('</div>');

        // Filter buttons
        html.push('<div class="dm-filters">');
        html.push('<button class="dm-filter-btn active" data-filter="risk">Em Risco</button>');
        html.push('<button class="dm-filter-btn" data-filter="all">Todos</button>');
        html.push('<button class="dm-filter-btn" data-filter="ok">OK</button>');
        if (nResolved > 0) html.push('<button class="dm-filter-btn" data-filter="resolved">Resolvidos</button>');
        html.push('<button class="dm-email-btn" id="dm-send-email" title="Enviar relatório por e-mail">✉ Enviar Relatório</button>');
        html.push('</div>');

        // Default: em risco (só ativos)
        var riskItems = expirados.concat(alerta);
        _currentItems = riskItems.slice();
        _sortCol = '';
        html.push(buildTable(_currentItems));

        content.innerHTML = html.join('');

        // Helper to apply filter
        function applyFilter(items) {
            _currentItems = items;
            _sortCol = '';
            _sortDir = 'asc';
            var tableDiv = content.querySelector('.dm-table-wrap');
            if (tableDiv) tableDiv.innerHTML = buildTableInner(_currentItems);
            bindRowClicks(content);
            bindSortHeaders(content);
            bindResolveButtons(content);
        }

        // Bind filter buttons
        content.querySelectorAll('.dm-filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                content.querySelectorAll('.dm-filter-btn').forEach(function(b) { b.classList.remove('active'); });
                content.querySelectorAll('.dm-tag-filter').forEach(function(t) { t.classList.remove('dm-tag-active'); });
                btn.classList.add('active');
                var f = btn.getAttribute('data-filter');
                if (f === 'risk') applyFilter(expirados.concat(alerta));
                else if (f === 'ok') applyFilter(ok.slice());
                else if (f === 'resolved') applyFilter(getResolvedItems());
                else applyFilter(active.slice());
            });
        });

        // Bind clickable summary tags
        content.querySelectorAll('.dm-tag-filter').forEach(function(tag) {
            tag.addEventListener('click', function() {
                content.querySelectorAll('.dm-filter-btn').forEach(function(b) { b.classList.remove('active'); });
                content.querySelectorAll('.dm-tag-filter').forEach(function(t) { t.classList.remove('dm-tag-active'); });
                tag.classList.add('dm-tag-active');
                var f = tag.getAttribute('data-filter');
                if (f === 'expirado') applyFilter(expirados.slice());
                else if (f === 'alerta') applyFilter(alerta.slice());
                else if (f === 'ok') applyFilter(ok.slice());
                else if (f === 'resolved') applyFilter(getResolvedItems());
            });
        });

        bindRowClicks(content);
        bindSortHeaders(content);
        bindResolveButtons(content);

        // Init resize handle
        initResize();

        function getResolvedItems() {
            if (!_data) return [];
            return _data.filter(function(p) {
                var key = (p.processo || '').replace(/\//g, '_');
                return !!_resolvedMap[key];
            });
        }
    }

    function sortItems(items, col, dir) {
        return items.slice().sort(function(a, b) {
            var va, vb;

            // Status: usa valor numérico (expirado = negativo, alerta/ok = positivo)
            if (col === 'diasRestantes') {
                va = a.status === 'expirado' ? -(a.diasAtrasados || 0) : (a.diasRestantes || 0);
                vb = b.status === 'expirado' ? -(b.diasAtrasados || 0) : (b.diasRestantes || 0);
                return dir === 'asc' ? va - vb : vb - va;
            }

            // Datas (DD/MM/YYYY) → converte pra Date
            if (col === 'atracacao' || col === 'freeTimeEnd') {
                va = parseDate(a[col]);
                vb = parseDate(b[col]);
                if (va && vb) return dir === 'asc' ? va - vb : vb - va;
                if (va) return dir === 'asc' ? -1 : 1;
                if (vb) return dir === 'asc' ? 1 : -1;
                return 0;
            }

            va = a[col]; vb = b[col];
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (typeof va === 'number' && typeof vb === 'number') {
                return dir === 'asc' ? va - vb : vb - va;
            }
            va = ('' + va).toLowerCase();
            vb = ('' + vb).toLowerCase();
            if (va < vb) return dir === 'asc' ? -1 : 1;
            if (va > vb) return dir === 'asc' ? 1 : -1;
            return 0;
        });

        function parseDate(str) {
            if (!str || str === '—') return null;
            var parts = str.split('/');
            if (parts.length !== 3) return null;
            return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        }
    }

    // ===== TRACKING URL (same as process-list.component.ts) =====
    function getTrackingUrl(armador, booking) {
        if (!booking || booking.trim() === '') return null;
        var arm = (armador || '').toLowerCase();
        booking = booking.trim();
        if (arm.includes('maersk')) return 'https://www.maersk.com/tracking/search?searchNumber=' + encodeURIComponent(booking);
        if (arm.includes('msc')) {
            try { return 'https://www.msc.com/en/track-a-shipment?params=' + btoa('trackingNumber=' + booking + '&trackingMode=1'); } catch(e) { return 'https://www.msc.com/en/track-a-shipment'; }
        }
        if (arm.includes('cma')) return 'https://www.cma-cgm.com/ebusiness/tracking/search';
        if (arm.includes('hapag')) return 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?booking=' + encodeURIComponent(booking);
        if (arm.includes('evergreen')) return 'https://ct.shipmentlink.com/servlet/TDB1_PageFlow.do';
        if (arm.includes('one') || arm.includes('ocean network')) return 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trkNo=' + encodeURIComponent(booking);
        if (arm.includes('cosco')) return 'https://elines.coscoshipping.com/ebusiness/cargotracking?trackingNumber=' + encodeURIComponent(booking);
        if (arm.includes('hmm') || arm.includes('hyundai')) return 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?type=1&number=' + encodeURIComponent(booking);
        if (arm.includes('pil') || arm.includes('pacific international')) return 'https://www.pilship.com/en--/120.html';
        if (arm.includes('cssc') || arm.includes('transhipping') || arm.includes('zim')) return 'https://www.zim.com/tools/track-a-shipment';
        return null;
    }

    function buildTable(items) {
        return '<div class="dm-table-wrap">' + buildTableInner(items) + '</div>';
    }

    function buildTableInner(items) {
        if (items.length === 0) return '<div style="padding:10px;color:#86efac;font-size:11px;">Nenhum processo neste filtro.</div>';

        var cols = [
            { key: '', label: '', sortable: false },
            { key: 'processo', label: 'Processo', sortable: true },
            { key: 'cliente', label: 'Cliente', sortable: true },
            { key: 'armador', label: 'Armador', sortable: true },
            { key: 'qtdContainers', label: 'Cntrs', sortable: true },
            { key: 'atracacao', label: 'Atracação', sortable: true },
            { key: 'freeTime', label: 'FT', sortable: true },
            { key: 'freeTimeEnd', label: 'Vencimento', sortable: true },
            { key: 'devolucao', label: 'Devolução', sortable: true },
            { key: 'diasRestantes', label: 'Status', sortable: true },
            { key: '', label: '', sortable: false }
        ];

        var h = [];
        h.push('<table class="dm-table">');
        h.push('<thead><tr>');
        cols.forEach(function(c) {
            if (c.sortable) {
                var indicator = '';
                if (_sortCol === c.key) indicator = _sortDir === 'asc' ? ' ▲' : ' ▼';
                h.push('<th class="dm-sortable" data-sort="' + c.key + '">' + c.label + indicator + '</th>');
            } else {
                h.push('<th>' + c.label + '</th>');
            }
        });
        h.push('</tr></thead><tbody>');

        items.forEach(function(p, i) {
            var statusText, statusCls;
            if (p.status === 'expirado') {
                statusText = '-' + p.diasAtrasados + 'd';
                statusCls = 'dm-status red';
            } else if (p.status === 'alerta') {
                statusText = p.diasRestantes + 'd';
                statusCls = 'dm-status yellow';
            } else {
                statusText = p.diasRestantes + 'd';
                statusCls = 'dm-status green';
            }

            var ftDisplay = p.freeTime > 0 ? p.freeTime + 'd' : '—';
            var ftEndDisplay = p.freeTime > 0 ? (p.freeTimeEnd || '—') : '—';

            var isResolved = _resolvedMap[(p.processo || '').replace(/\//g, '_')];
            var rowCls = 'dm-row ' + p.status + (isResolved ? ' resolved' : '');

            h.push('<tr class="' + rowCls + '" data-idx="' + i + '">');
            h.push('<td class="dm-arrow">▶</td>');
            h.push('<td class="dm-proc"><span class="dm-proc-name">' + (p.processo || '?') + '</span>' +
                '<button class="dm-btn-copy" data-copy="' + (p.processo || '') + '" title="Copiar processo">📋</button>' +
                '<button class="dm-btn-open" data-proc="' + (p.processo || '') + '" title="Abrir no Skychart">↗</button></td>');
            h.push('<td class="dm-cli">' + (p.cliente || '?') + '</td>');
            h.push('<td>' + (p.armador || '—') + '</td>');
            h.push('<td style="text-align:center;">' + (p.qtdContainers || '—') + '</td>');
            h.push('<td>' + (p.atracacao || '—') + '</td>');
            h.push('<td>' + ftDisplay + '</td>');
            h.push('<td>' + ftEndDisplay + '</td>');

            // Coluna devolução: usa data da API ou data Firebase
            var devolDisplay = '—';
            if (p.devolucao) {
                devolDisplay = p.devolucao;
            } else if (isResolved && _resolvedMap[(p.processo || '').replace(/\//g, '_')]) {
                var rd = _resolvedMap[(p.processo || '').replace(/\//g, '_')].resolvedAt;
                if (rd) {
                    var d = new Date(rd);
                    devolDisplay = '<span style="color:#a5b4fc;">' + d.toLocaleDateString('pt-BR') + '</span>';
                }
            }
            h.push('<td>' + devolDisplay + '</td>');

            h.push('<td><span class="' + statusCls + '">' + statusText + '</span></td>');
            h.push('<td class="dm-resolve-td">');
            if (isResolved) {
                h.push('<button class="dm-btn-resolve resolved" data-proc="' + (p.processo || '') + '" title="Reabrir">↩</button>');
            } else {
                h.push('<button class="dm-btn-resolve" data-proc="' + (p.processo || '') + '" title="Marcar como devolvido">✓</button>');
            }
            h.push('</td>');
            h.push('</tr>');

            // Expandable detail row
            h.push('<tr class="dm-detail" id="dm-detail-' + i + '" style="display:none;">');
            h.push('<td colspan="11">');
            h.push('<div class="dm-cntr-wrap">');
            h.push('<div style="font-size:10px;color:#94a3b8;margin-bottom:4px;display:flex;gap:12px;align-items:center;">');
            var trackUrl = getTrackingUrl(p.armador, p.booking);
            if (trackUrl && p.booking) {
                h.push('<span>Booking: <a href="' + trackUrl + '" target="_blank" rel="noopener" class="dm-booking-link" title="Rastrear no site do armador">' + p.booking + ' ↗</a></span>');
            } else {
                h.push('<span>Booking: <b style="color:#e2e8f0;">' + (p.booking || '—') + '</b></span>');
            }
            h.push('</div>');
            if (p.container && p.container !== '—') {
                var cntrs = p.container.split(', ');
                h.push('<div style="font-size:9px;color:#64748b;margin-top:2px;">Containers:</div>');
                h.push('<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">');
                cntrs.forEach(function(c) {
                    h.push('<span class="dm-cnt" style="background:rgba(255,255,255,0.03);padding:1px 6px;border-radius:3px;">' + c + '</span>');
                });
                h.push('</div>');
            }
            if (p.status === 'expirado') {
                h.push('<div style="margin-top:4px;"><span style="color:#ef4444;font-weight:600;font-size:10px;">Expirado há ' + p.diasAtrasados + ' dias!</span></div>');
            }
            h.push('</div></td></tr>');
        });

        h.push('</tbody></table>');
        return h.join('');
    }

    function bindRowClicks(content) {
        content.querySelectorAll('.dm-row').forEach(function(row) {
            row.addEventListener('click', function(e) {
                // Don't toggle if clicking buttons
                if (e.target.closest('.dm-btn-resolve') || e.target.closest('.dm-btn-copy') || e.target.closest('.dm-btn-open') || e.target.tagName === 'A') return;
                var idx = row.getAttribute('data-idx');
                var detail = document.getElementById('dm-detail-' + idx);
                if (detail) {
                    var visible = detail.style.display !== 'none';
                    detail.style.display = visible ? 'none' : 'table-row';
                    row.classList.toggle('selected', !visible);
                    var arrow = row.querySelector('.dm-arrow');
                    if (arrow) arrow.textContent = visible ? '▶' : '▼';
                }
            });
        });
        // Bind copy buttons
        content.querySelectorAll('.dm-btn-copy').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var text = btn.getAttribute('data-copy');
                if (!text) return;
                navigator.clipboard.writeText(text).then(function() {
                    btn.textContent = '✓';
                    btn.style.color = '#86efac';
                    setTimeout(function() { btn.textContent = '📋'; btn.style.color = ''; }, 1500);
                });
            });
        });
        // Bind open-in-skychart buttons
        content.querySelectorAll('.dm-btn-open').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var proc = btn.getAttribute('data-proc');
                if (!proc) return;
                openProcessInSkychart(proc);
            });
        });
        // Bind email button
        var emailBtn = content.querySelector('#dm-send-email');
        if (emailBtn) {
            emailBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                sendEmailReport();
            });
        }
        // Prevent booking links from toggling row
        content.querySelectorAll('.dm-booking-link').forEach(function(a) {
            a.addEventListener('click', function(e) { e.stopPropagation(); });
        });
    }

    function bindResolveButtons(content) {
        content.querySelectorAll('.dm-btn-resolve').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var proc = btn.getAttribute('data-proc');
                if (!proc) return;
                var isResolved = btn.classList.contains('resolved');

                // Se já tá em modo confirmar, executa
                if (btn.dataset.confirming === 'true') {
                    btn.dataset.confirming = '';
                    btn.textContent = '...';
                    btn.style.pointerEvents = 'none';
                    resolveProcess(proc, !isResolved);
                    return;
                }

                // Primeiro click: pede confirmação
                btn.dataset.confirming = 'true';
                var original = btn.textContent;
                btn.textContent = isResolved ? 'Reabrir?' : 'Confirmar?';
                btn.style.fontSize = '8px';
                btn.classList.add('confirming');

                // Reset após 3s se não confirmar
                setTimeout(function() {
                    if (btn.dataset.confirming === 'true') {
                        btn.dataset.confirming = '';
                        btn.textContent = original;
                        btn.style.fontSize = '';
                        btn.classList.remove('confirming');
                    }
                }, 3000);
            });
        });
    }

    function bindSortHeaders(content) {
        content.querySelectorAll('.dm-sortable').forEach(function(th) {
            th.addEventListener('click', function(e) {
                e.stopPropagation();
                var col = th.getAttribute('data-sort');
                if (_sortCol === col) {
                    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    _sortCol = col;
                    _sortDir = 'asc';
                }
                _currentItems = sortItems(_currentItems, col, _sortDir);
                var tableDiv = content.querySelector('.dm-table-wrap');
                if (tableDiv) tableDiv.innerHTML = buildTableInner(_currentItems);
                bindRowClicks(content);
                bindSortHeaders(content);
            });
        });
    }

    // ===== ENVIAR RELATÓRIO POR E-MAIL =====
    function sendEmailReport() {
        var active = getActiveData();
        var riskItems = active.filter(function(p) { return p.status === 'expirado' || p.status === 'alerta'; });
        if (riskItems.length === 0) {
            alert('Não há processos em risco para enviar.');
            return;
        }

        var today = new Date().toLocaleDateString('pt-BR');
        var subject = 'Demurrage - Processos em Risco (' + today + ')';

        var body = 'Bom dia!\n\n';
        body += 'Segue relatório de demurrage com ' + riskItems.length + ' processo(s) em risco:\n\n';

        riskItems.forEach(function(p) {
            var statusLabel = p.status === 'expirado' ? 'EXPIRADO (-' + p.diasAtrasados + 'd)' : 'ALERTA (' + p.diasRestantes + 'd restantes)';
            body += p.processo + ' - ' + (p.cliente || '?') + '\n';
            body += '   Armador: ' + (p.armador || '-') + ' | Containers: ' + (p.qtdContainers || '-') + '\n';
            body += '   Atracacao: ' + (p.atracacao || '-') + ' | FT: ' + (p.freeTime || 0) + 'd | Vencimento: ' + (p.freeTimeEnd || '-') + '\n';
            body += '   Status: ' + statusLabel + '\n\n';
        });

        body += 'Total: ' + riskItems.length + ' processos em risco\n';
        body += 'Gerado por ATOM - Mond Shipping';

        var to = 'gabriela.cordeiro@mondshipping.com.br,raphaela.germano@mondshipping.com.br';

        // Compõe direto no Outlook Web
        var composeUrl = 'https://outlook.office.com/mail/deeplink/compose'
            + '?to=' + encodeURIComponent(to)
            + '&subject=' + encodeURIComponent(subject)
            + '&body=' + encodeURIComponent(body);

        window.open(composeUrl, '_blank');
        console.log(TAG, 'Relatório aberto no Outlook Web —', riskItems.length, 'processos');
    }

    // ===== ABRIR PROCESSO NO SKYCHART =====
    function openProcessInSkychart(processo) {
        if (!processo) return;
        // Abre na aba operacional do Skychart
        var url = 'https://app2.skychart.com.br/skyline-mond-83474/#/app/operacional';
        window.open(url, '_blank');
        // Armazena o processo pra o content.js preencher
        chrome.storage.local.set({ pendingDemurrageProcess: processo }, function() {
            console.log(TAG, 'Processo', processo, 'salvo — Skychart vai abrir e preencher');
        });
    }

    // ===== STYLES =====
    // ===== RESIZE HANDLE =====
    function initResize() {
        var bar = document.getElementById('atom-demurrage-bar');
        if (!bar || bar.querySelector('.dm-resize-handle')) return;
        var handle = document.createElement('div');
        handle.className = 'dm-resize-handle';
        bar.appendChild(handle);
        var startX = 0, startW = 0;
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault(); e.stopPropagation();
            startX = e.clientX; startW = bar.offsetWidth;
            bar.style.transition = 'none';
            function onMove(ev) { bar.style.width = Math.max(400, startW + (ev.clientX - startX)) + 'px'; }
            function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); bar.style.transition = ''; }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function injectStyles() {
        if (document.getElementById('dm-styles')) return;
        var style = document.createElement('style');
        style.id = 'dm-styles';
        style.textContent = [
            '#atom-demurrage-bar {',
            '  position: fixed; bottom: 52px; left: 8px; z-index: 99998;',
            '  height: 34px; width: auto;',
            '  background: linear-gradient(135deg, #1a0a0a 0%, #2a1015 100%);',
            '  border: 1px solid rgba(239,68,68,0.3);',
            '  border-radius: 10px;',
            '  font-family: "Segoe UI", Inter, system-ui, sans-serif;',
            '  transition: all 0.3s ease;',
            '  box-shadow: 0 4px 20px rgba(0,0,0,0.4);',
            '  overflow: hidden;',
            '}',
            '#atom-demurrage-bar.expanded {',
            '  height: auto; max-height: calc(100vh - 120px);',
            '  width: 620px; max-width: calc(100vw - 20px);',
            '  overflow-y: auto;',
            '}',
            '.dm-bar-inner {',
            '  display: flex; align-items: center; gap: 10px;',
            '  padding: 0 14px; height: 34px; cursor: pointer;',
            '}',
            '.dm-logo {',
            '  width: 22px; height: 22px;',
            '  background: linear-gradient(135deg, #ef4444, #dc2626);',
            '  border-radius: 5px;',
            '  display: flex; align-items: center; justify-content: center;',
            '  font-weight: 700; font-size: 11px; color: #fff;',
            '}',
            '.dm-title { color: #fca5a5; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; }',
            '.dm-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }',
            '.dm-badge.danger { background: rgba(239,68,68,0.2); color: #fca5a5; }',
            '.dm-badge.ok { background: rgba(34,197,94,0.15); color: #86efac; }',
            '.dm-collapse { color: #fca5a5; cursor: pointer; font-size: 10px; margin-left: 4px; }',
            '.dm-refresh { color: #94a3b8; cursor: pointer; font-size: 13px; margin-left: auto; padding: 0 4px; transition: all 0.2s; }',
            '.dm-refresh:hover { color: #6C63FF; transform: rotate(90deg); }',
            '.dm-refresh.spinning { animation: dm-spin 1s linear infinite; pointer-events: none; color: #6C63FF; }',
            '@keyframes dm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
            '.dm-minimize { color: #94a3b8; cursor: pointer; font-size: 14px; font-weight: 700; margin-left: 2px; padding: 0 4px; transition: color 0.15s; }',
            '.dm-minimize:hover { color: #fca5a5; }',
            '#atom-demurrage-bar.mini {',
            '  height: auto !important; width: auto !important;',
            '  border-radius: 50%; cursor: grab; padding: 0;',
            '}',
            '#atom-demurrage-bar.mini .dm-bar-inner { padding: 0; gap: 0; justify-content: center; }',
            '#atom-demurrage-bar.mini .dm-title,',
            '#atom-demurrage-bar.mini .dm-badge,',
            '#atom-demurrage-bar.mini .dm-collapse,',
            '#atom-demurrage-bar.mini .dm-minimize,',
            '#atom-demurrage-bar.mini .dm-refresh,',
            '#atom-demurrage-bar.mini #dm-content { display: none !important; }',
            '#atom-demurrage-bar.mini .dm-logo {',
            '  width: 30px; height: 30px; font-size: 14px; border-radius: 50%;',
            '}',
            '#atom-demurrage-bar.mini:active { cursor: grabbing; }',
            '',
            '.dm-summary { display: flex; gap: 6px; padding: 8px 12px; flex-wrap: wrap; }',
            '.dm-tag { padding: 3px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; }',
            '.dm-tag-filter { cursor: pointer; transition: all 0.15s; }',
            '.dm-tag-filter:hover { opacity: 0.8; transform: scale(1.05); }',
            '.dm-tag-active { outline: 2px solid currentColor; outline-offset: 1px; }',
            '.dm-tag.red { background: rgba(239,68,68,0.15); color: #fca5a5; }',
            '.dm-tag.yellow { background: rgba(245,158,11,0.15); color: #fbbf24; }',
            '.dm-tag.green { background: rgba(34,197,94,0.15); color: #86efac; }',
            '.dm-tag.blue { background: rgba(99,102,241,0.15); color: #a5b4fc; }',
            '.dm-tag.gray { background: rgba(148,163,184,0.1); color: #94a3b8; }',
            '',
            '.dm-btn-resolve { background: none; border: 1px solid rgba(134,239,172,0.3); color: #86efac; cursor: pointer; padding: 1px 5px; border-radius: 4px; font-size: 10px; transition: all 0.15s; }',
            '.dm-btn-resolve:hover { background: rgba(34,197,94,0.2); border-color: #86efac; }',
            '.dm-btn-resolve.resolved { border-color: rgba(148,163,184,0.3); color: #94a3b8; }',
            '.dm-btn-resolve.resolved:hover { background: rgba(239,68,68,0.15); border-color: #fca5a5; color: #fca5a5; }',
            '.dm-row.resolved { opacity: 0.4; }',
            '.dm-row.resolved .dm-proc-name { text-decoration: line-through; }',
            '',
            '.dm-filters { display: flex; gap: 4px; padding: 0 12px 6px; }',
            '.dm-filter-btn {',
            '  padding: 3px 10px; border: 1px solid rgba(239,68,68,0.2); border-radius: 6px;',
            '  background: transparent; color: #94a3b8; font-size: 10px; cursor: pointer;',
            '  font-family: inherit; transition: all 0.15s;',
            '}',
            '.dm-filter-btn.active { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.4); }',
            '.dm-filter-btn:hover { background: rgba(239,68,68,0.1); }',
            '.dm-email-btn {',
            '  padding: 3px 10px; border: 1px solid rgba(108,99,255,0.3); border-radius: 6px;',
            '  background: rgba(108,99,255,0.1); color: #a5b4fc; font-size: 10px; cursor: pointer;',
            '  font-family: inherit; transition: all 0.15s; margin-left: auto;',
            '}',
            '.dm-email-btn:hover { background: rgba(108,99,255,0.2); color: #c4b5fd; }',
            '',
            '.dm-btn-copy, .dm-btn-open {',
            '  background: none; border: none; cursor: pointer; font-size: 11px;',
            '  padding: 0 3px; opacity: 0.4; transition: all 0.15s; vertical-align: middle;',
            '}',
            '.dm-btn-copy:hover, .dm-btn-open:hover { opacity: 1; transform: scale(1.2); }',
            '.dm-proc { color: #e2e8f0 !important; font-weight: 600; white-space: nowrap; }',
            '.dm-proc-name { margin-right: 4px; }',
            '',
            '.dm-table-wrap { max-height: 320px; overflow-y: auto; padding: 0 6px 8px; scrollbar-width: thin; scrollbar-color: rgba(239,68,68,0.2) transparent; }',
            '.dm-table-wrap::-webkit-scrollbar { width: 4px; }',
            '.dm-table-wrap::-webkit-scrollbar-track { background: transparent; }',
            '.dm-table-wrap::-webkit-scrollbar-thumb { background: rgba(239,68,68,0.25); border-radius: 4px; }',
            '#atom-demurrage-bar.expanded { scrollbar-width: thin; scrollbar-color: rgba(239,68,68,0.2) transparent; }',
            '#atom-demurrage-bar.expanded::-webkit-scrollbar { width: 4px; }',
            '#atom-demurrage-bar.expanded::-webkit-scrollbar-track { background: transparent; }',
            '#atom-demurrage-bar.expanded::-webkit-scrollbar-thumb { background: rgba(239,68,68,0.25); border-radius: 4px; }',
            '.dm-table { width: 100%; border-collapse: collapse; font-size: 10px; }',
            '.dm-table th { padding: 5px 6px; color: #64748b; text-align: left; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; position: sticky; top: 0; background: #1a0a0a; }',
            '.dm-sortable { cursor: pointer; user-select: none; transition: color 0.15s; }',
            '.dm-sortable:hover { color: #fca5a5; }',
            '.dm-row { cursor: pointer; transition: background 0.15s; }',
            '.dm-row:hover { background: rgba(239,68,68,0.06); }',
            '.dm-row.selected { background: rgba(239,68,68,0.1); }',
            '.dm-row td { padding: 5px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #cbd5e1; }',
            '.dm-cli { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.dm-cnt { color: #94a3b8 !important; font-family: Consolas, monospace; font-size: 9px; }',
            '.dm-booking-link { color: #60a5fa; text-decoration: none; font-weight: 600; transition: all 0.15s; }',
            '.dm-booking-link:hover { color: #93c5fd; text-decoration: underline; }',
            '',
            '.dm-status { padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; }',
            '.dm-status.red { background: rgba(239,68,68,0.15); color: #ef4444; }',
            '.dm-status.yellow { background: rgba(245,158,11,0.15); color: #f59e0b; }',
            '.dm-status.green { background: rgba(34,197,94,0.15); color: #22c55e; }',
            '',
            '.dm-detail td { padding: 0 !important; border: none !important; }',
            '.dm-arrow { width: 16px; text-align: center; color: #64748b; font-size: 8px; transition: all 0.15s; }',
            '.dm-row.selected .dm-arrow { color: #fca5a5; }',
            '',
            '.dm-cntr-wrap {',
            '  padding: 4px 8px 8px 24px;',
            '  background: rgba(239,68,68,0.03); border-left: 3px solid rgba(239,68,68,0.25);',
            '}',
            '.dm-cntr-table { width: 100%; border-collapse: collapse; font-size: 9px; }',
            '.dm-cntr-table th { padding: 3px 6px; color: #64748b; text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }',
            '.dm-cntr-table td { padding: 3px 6px; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.03); }',
            '',
            '.dm-loading { padding: 12px; color: #fca5a5; font-size: 11px; display: flex; align-items: center; gap: 8px; }',
            '.dm-spinner {',
            '  width: 14px; height: 14px;',
            '  border: 2px solid rgba(239,68,68,0.2); border-top-color: #ef4444;',
            '  border-radius: 50%; animation: dm-spin 0.6s linear infinite;',
            '}',
            '@keyframes dm-spin { to { transform: rotate(360deg); } }',
            '',
            '.dm-resize-handle {',
            '  position: absolute; top: 0; right: 0; width: 6px; height: 100%;',
            '  cursor: ew-resize; z-index: 10;',
            '}',
            '.dm-resize-handle:hover { background: rgba(239,68,68,0.2); }'
        ].join('\n');
        document.head.appendChild(style);
    }

    // ===== INIT =====
    function init() {
        createBar();
    }

    function safeInit() {
        if (!isContextValid()) return;
        init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(safeInit, 2500); });
    } else {
        setTimeout(safeInit, 2500);
    }

    console.log(TAG, 'Script carregado');

})();

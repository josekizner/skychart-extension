// demurrage-agent.js — Painel standalone de Demurrage no Outlook
// Barra vermelha acima do ATOM AGENT, com dados completos de free time
(function() {
    'use strict';

    var TAG = '[Demurrage]';
    var _data = null;

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
            '  <span class="dm-collapse" id="dm-collapse" style="display:none;">▼</span>',
            '</div>',
            '<div id="dm-content"></div>'
        ].join('\n');

        document.body.appendChild(bar);
        injectStyles();

        document.querySelector('#atom-demurrage-bar .dm-bar-inner').addEventListener('click', function(e) {
            if (e.target.id === 'dm-collapse') return;
            togglePanel();
        });

        document.getElementById('dm-collapse').addEventListener('click', function(e) {
            e.stopPropagation();
            collapsePanel();
        });

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
        bar.classList.add('expanded');
        document.getElementById('dm-collapse').style.display = '';
        if (_data) {
            renderTable(_data);
        } else {
            loadData();
        }
    }

    function collapsePanel() {
        var bar = document.getElementById('atom-demurrage-bar');
        bar.classList.remove('expanded');
        document.getElementById('dm-collapse').style.display = 'none';
    }

    // ===== FETCH =====
    function loadData() {
        var content = document.getElementById('dm-content');
        content.innerHTML = '<div class="dm-loading"><div class="dm-spinner"></div>Carregando dados...</div>';

        chrome.runtime.sendMessage({ action: 'fetchDemurrageData' }, function(response) {
            if (response && response.success) {
                _data = response.data;
                updateBadge(_data);
                renderTable(_data);
                console.log(TAG, 'Dados carregados:', _data.length, 'registros');
            } else {
                content.innerHTML = '<div style="padding:10px;color:#f87171;font-size:11px;">Erro: ' + (response ? response.error : 'sem resposta') + '</div>';
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

        // Count by process status
        var expirados = data.filter(function(p) { return p.status === 'expirado'; });
        var alerta = data.filter(function(p) { return p.status === 'alerta'; });
        var ok = data.filter(function(p) { return p.status === 'ok'; });
        var finalizado = data.filter(function(p) { return p.status === 'finalizado'; });

        var html = [];

        // Summary (process counts)
        html.push('<div class="dm-summary">');
        html.push('<span class="dm-tag red">' + expirados.length + ' Expirados</span>');
        html.push('<span class="dm-tag yellow">' + alerta.length + ' Alerta</span>');
        html.push('<span class="dm-tag green">' + ok.length + ' OK</span>');
        html.push('<span class="dm-tag gray">' + finalizado.length + ' Finalizados</span>');
        html.push('</div>');

        // Filter buttons
        html.push('<div class="dm-filters">');
        html.push('<button class="dm-filter-btn active" data-filter="risk">Em Risco</button>');
        html.push('<button class="dm-filter-btn" data-filter="all">Todos</button>');
        html.push('<button class="dm-filter-btn" data-filter="ok">OK</button>');
        html.push('</div>');

        // Default: em risco
        var riskItems = expirados.concat(alerta);
        _currentItems = riskItems.slice();
        _sortCol = '';
        html.push(buildTable(_currentItems));

        content.innerHTML = html.join('');

        // Bind filters
        content.querySelectorAll('.dm-filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                content.querySelectorAll('.dm-filter-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                var f = btn.getAttribute('data-filter');
                if (f === 'risk') _currentItems = expirados.concat(alerta);
                else if (f === 'ok') _currentItems = ok.slice();
                else _currentItems = data.filter(function(p) { return p.status !== 'finalizado'; });
                _sortCol = '';
                _sortDir = 'asc';
                var tableDiv = content.querySelector('.dm-table-wrap');
                if (tableDiv) tableDiv.innerHTML = buildTableInner(_currentItems);
                bindRowClicks(content);
                bindSortHeaders(content);
            });
        });

        bindRowClicks(content);
        bindSortHeaders(content);
    }

    function sortItems(items, col, dir) {
        return items.slice().sort(function(a, b) {
            var va = a[col], vb = b[col];
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
            { key: 'diasRestantes', label: 'Status', sortable: true }
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

            h.push('<tr class="dm-row ' + p.status + '" data-idx="' + i + '">');
            h.push('<td class="dm-arrow">▶</td>');
            h.push('<td class="dm-proc">' + (p.processo || '?') + '</td>');
            h.push('<td class="dm-cli">' + (p.cliente || '?') + '</td>');
            h.push('<td>' + (p.armador || '—') + '</td>');
            h.push('<td style="text-align:center;">' + (p.qtdContainers || '—') + '</td>');
            h.push('<td>' + (p.atracacao || '—') + '</td>');
            h.push('<td>' + ftDisplay + '</td>');
            h.push('<td>' + ftEndDisplay + '</td>');
            h.push('<td><span class="' + statusCls + '">' + statusText + '</span></td>');
            h.push('</tr>');

            // Expandable detail row
            h.push('<tr class="dm-detail" id="dm-detail-' + i + '" style="display:none;">');
            h.push('<td colspan="9">');
            h.push('<div class="dm-cntr-wrap">');
            h.push('<div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">');
            h.push('<span>Booking: <b style="color:#e2e8f0;">' + (p.booking || '—') + '</b></span>');
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
            row.addEventListener('click', function() {
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

    // ===== STYLES =====
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
            '.dm-collapse { color: #fca5a5; cursor: pointer; font-size: 10px; margin-left: auto; }',
            '',
            '.dm-summary { display: flex; gap: 6px; padding: 8px 12px; flex-wrap: wrap; }',
            '.dm-tag { padding: 3px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; }',
            '.dm-tag.red { background: rgba(239,68,68,0.15); color: #fca5a5; }',
            '.dm-tag.yellow { background: rgba(245,158,11,0.15); color: #fbbf24; }',
            '.dm-tag.green { background: rgba(34,197,94,0.15); color: #86efac; }',
            '.dm-tag.gray { background: rgba(148,163,184,0.1); color: #94a3b8; }',
            '',
            '.dm-filters { display: flex; gap: 4px; padding: 0 12px 6px; }',
            '.dm-filter-btn {',
            '  padding: 3px 10px; border: 1px solid rgba(239,68,68,0.2); border-radius: 6px;',
            '  background: transparent; color: #94a3b8; font-size: 10px; cursor: pointer;',
            '  font-family: inherit; transition: all 0.15s;',
            '}',
            '.dm-filter-btn.active { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.4); }',
            '.dm-filter-btn:hover { background: rgba(239,68,68,0.1); }',
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
            '.dm-proc { color: #e2e8f0 !important; font-weight: 600; }',
            '.dm-cli { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.dm-cnt { color: #94a3b8 !important; font-family: Consolas, monospace; font-size: 9px; }',
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
            '@keyframes dm-spin { to { transform: rotate(360deg); } }'
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

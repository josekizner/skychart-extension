/**
 * AGENDA AGENT — Ações em massa na agenda operacional do Skychart
 * 
 * Detecta agendas duplicadas na lista de processos,
 * mostra mini-dashboard com contagens, e executa ações em massa.
 * 
 * DOM Elements (confirmados via console):
 * - Tabela: table thead th (col 6 = Agenda, col 1 = Processo)
 * - Sidebar processos: div.ng-star-inserted com IM00xxx/xx
 * - Accordion Embarque: .ui-accordion-header-text contendo "Embarque"
 * - Armador: texto do accordion após "|"
 * - Booking: #formularioEmbarque-dsReserva
 * - Data confirmação: #formularioEmbarque-dtConfirmacaoEmbarque
 * - Botão salvar: span.ui-button-text.ui-clickable "Atualizar"
 */

(function() {
    'use strict';
    var TAG = '[Agenda Agent]';
    var AGENDA_COL = 6;  // confirmed column index
    var PROCESSO_COL = 1;

    // State
    var _running = false;
    var _stop = false;
    var _dashboardEl = null;
    var _lastScan = '';

    console.log(TAG, 'Carregado');

    // ===== ENTRY POINT =====
    // Wait for DOM to stabilize, then start scanning
    var bootInterval = setInterval(function() {
        if (isProcessList()) {
            clearInterval(bootInterval);
            console.log(TAG, 'Lista de processos detectada');
            startDashboard();
        }
    }, 2000);

    // Re-check when URL changes (SPA navigation)
    var lastUrl = location.href;
    setInterval(function() {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (isProcessList()) {
                startDashboard();
            } else {
                removeDashboard();
            }
        }
    }, 1500);

    function isProcessList() {
        // Check if we're on a page with the process table
        var ths = document.querySelectorAll('table thead th');
        if (ths.length < 7) return false;
        var agendaTh = ths[AGENDA_COL];
        return agendaTh && (agendaTh.textContent || '').trim() === 'Agenda';
    }

    // ===== SCANNER =====
    function scanAgendas() {
        var rows = document.querySelectorAll('table tbody tr');
        var agendas = {};   // type -> [{processo, rowIndex}]

        rows.forEach(function(tr, idx) {
            var tds = tr.querySelectorAll('td');
            if (tds.length <= AGENDA_COL) return;

            var processo = (tds[PROCESSO_COL] ? tds[PROCESSO_COL].textContent.trim() : '');
            var agenda = (tds[AGENDA_COL] ? tds[AGENDA_COL].textContent.trim() : '');

            if (!agenda || !processo) return;

            if (!agendas[agenda]) agendas[agenda] = [];
            agendas[agenda].push({
                processo: processo,
                rowIndex: idx,
                row: tr
            });
        });

        return agendas;
    }

    // ===== DASHBOARD =====
    function startDashboard() {
        // Periodic re-scan
        setInterval(function() {
            if (!isProcessList()) return;
            var agendas = scanAgendas();
            var key = JSON.stringify(Object.keys(agendas).map(function(k) { return k + ':' + agendas[k].length; }));
            if (key !== _lastScan) {
                _lastScan = key;
                renderDashboard(agendas);
            }
        }, 3000);

        // Initial render
        var agendas = scanAgendas();
        _lastScan = JSON.stringify(Object.keys(agendas).map(function(k) { return k + ':' + agendas[k].length; }));
        renderDashboard(agendas);
    }

    function removeDashboard() {
        var el = document.getElementById('agenda-dashboard');
        if (el) el.remove();
        _dashboardEl = null;
    }

    function renderDashboard(agendas) {
        removeDashboard();

        var bar = document.createElement('div');
        bar.id = 'agenda-dashboard';
        bar.style.cssText = [
            'display:flex; align-items:center; gap:8px; flex-wrap:wrap;',
            'padding:8px 14px; margin:0 0 6px;',
            'background:linear-gradient(135deg, #0a1628 0%, #132040 100%);',
            'border:1px solid rgba(59,130,246,0.25);',
            'border-radius:8px;',
            'font-family:"Segoe UI", Inter, system-ui, sans-serif;',
            'box-shadow:0 2px 12px rgba(0,0,0,0.3);'
        ].join('');

        // Logo/label
        var label = document.createElement('span');
        label.style.cssText = 'color:#60a5fa;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-right:4px;';
        label.textContent = 'AGENDA';
        bar.appendChild(label);

        // Separator
        var sep = document.createElement('span');
        sep.style.cssText = 'width:1px;height:18px;background:rgba(59,130,246,0.2);';
        bar.appendChild(sep);

        // Color map for agenda types
        var colors = {
            'Confirmar Embarque': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
            'Confirmar Chegada': { bg: 'rgba(34,197,94,0.15)', color: '#86efac', border: 'rgba(34,197,94,0.3)' },
            'Confirmar Booking': { bg: 'rgba(168,85,247,0.15)', color: '#c4b5fd', border: 'rgba(168,85,247,0.3)' },
            'Confirmar Transbordo': { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
            'Courier': { bg: 'rgba(236,72,153,0.15)', color: '#f9a8d4', border: 'rgba(236,72,153,0.3)' }
        };
        var defaultColor = { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)' };

        // Render each agenda type as a badge
        var types = Object.keys(agendas);
        types.forEach(function(type) {
            var count = agendas[type].length;
            var c = colors[type] || defaultColor;

            var badge = document.createElement('button');
            badge.className = 'agenda-badge';
            badge.setAttribute('data-agenda', type);
            badge.style.cssText = [
                'background:' + c.bg + ';',
                'color:' + c.color + ';',
                'border:1px solid ' + c.border + ';',
                'border-radius:14px;',
                'padding:4px 12px;',
                'font-size:11px;',
                'font-weight:600;',
                'cursor:pointer;',
                'transition:all 0.2s;',
                'font-family:inherit;',
                'display:flex; align-items:center; gap:5px;'
            ].join('');

            badge.innerHTML = '<span style="font-weight:800;">' + count + '</span> ' + type;

            badge.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            });
            badge.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = 'none';
            });

            badge.addEventListener('click', function() {
                if (_running) {
                    showAgendaToast('Já tem uma ação em andamento!', 'warning');
                    return;
                }
                var processList = agendas[type];
                if (!processList || processList.length === 0) return;
                startBulkAction(type, processList);
            });

            bar.appendChild(badge);
        });

        // Progress container (hidden initially)
        var progress = document.createElement('div');
        progress.id = 'agenda-progress';
        progress.style.cssText = 'display:none; margin-left:auto; font-size:11px; color:#94a3b8; display:flex; align-items:center; gap:8px;';
        bar.appendChild(progress);

        // Stop button (hidden initially)
        var stopBtn = document.createElement('button');
        stopBtn.id = 'agenda-stop-btn';
        stopBtn.textContent = 'Parar';
        stopBtn.style.cssText = 'display:none; background:#ef4444; color:#fff; border:none; border-radius:6px; padding:4px 10px; font-size:10px; font-weight:700; cursor:pointer; margin-left:auto;';
        stopBtn.addEventListener('click', function() {
            _stop = true;
            stopBtn.style.display = 'none';
            showAgendaToast('Parando...', 'warning');
        });
        bar.appendChild(stopBtn);

        // Insert above process table
        var table = document.querySelector('table');
        if (table && table.parentElement) {
            table.parentElement.insertBefore(bar, table);
        }

        _dashboardEl = bar;
        console.log(TAG, 'Dashboard renderizado:', types.length, 'tipos de agenda');
    }

    // ===== BULK ACTION EXECUTOR =====
    function startBulkAction(agendaType, processList) {
        _running = true;
        _stop = false;

        var results = [];
        var total = processList.length;

        console.log(TAG, 'Iniciando ação em massa:', agendaType, '|', total, 'processos');

        // Show progress
        updateProgress('Iniciando ' + agendaType + '...', 0, total);
        var stopBtn = document.getElementById('agenda-stop-btn');
        if (stopBtn) stopBtn.style.display = 'inline-block';

        // Execute sequentially
        processNext(0);

        function processNext(idx) {
            if (_stop || idx >= total) {
                finishBulkAction(agendaType, results);
                return;
            }

            var item = processList[idx];
            updateProgress('Processando ' + item.processo + '...', idx, total);

            // Click on process in sidebar or table
            navigateToProcess(item.processo, function(success) {
                if (!success) {
                    results.push({ processo: item.processo, status: 'erro', msg: 'Não encontrou processo' });
                    setTimeout(function() { processNext(idx + 1); }, 500);
                    return;
                }

                // Wait for process to load
                waitForProcessLoad(function() {
                    executeAction(agendaType, item.processo, function(result) {
                        results.push(result);
                        console.log(TAG, 'Resultado [' + (idx + 1) + '/' + total + ']:', result.processo, '→', result.status);

                        // Small delay before next
                        setTimeout(function() { processNext(idx + 1); }, 1500);
                    });
                });
            });
        }
    }

    function finishBulkAction(agendaType, results) {
        _running = false;
        _stop = false;

        var stopBtn = document.getElementById('agenda-stop-btn');
        if (stopBtn) stopBtn.style.display = 'none';

        // Count results
        var ok = results.filter(function(r) { return r.status === 'ok'; }).length;
        var skip = results.filter(function(r) { return r.status === 'skip'; }).length;
        var fail = results.filter(function(r) { return r.status === 'erro'; }).length;

        var msg = agendaType + ' finalizado: ' + ok + ' confirmados, ' + skip + ' pulados, ' + fail + ' erros';
        console.log(TAG, msg);
        console.log(TAG, 'Detalhes:', JSON.stringify(results, null, 2));

        updateProgress(msg, results.length, results.length);
        showAgendaToast(msg, ok > 0 ? 'success' : 'warning');

        // Show detailed report
        showReport(agendaType, results);
    }

    // ===== NAVIGATION =====
    function navigateToProcess(processoName, callback) {
        // Try clicking on sidebar first
        var sidebarItems = document.querySelectorAll('div.ng-star-inserted');
        for (var i = 0; i < sidebarItems.length; i++) {
            var text = sidebarItems[i].textContent.trim();
            if (text === processoName) {
                sidebarItems[i].click();
                console.log(TAG, 'Clicou no sidebar:', processoName);
                setTimeout(function() { callback(true); }, 2000);
                return;
            }
        }

        // Fallback: try clicking on the table row
        var rows = document.querySelectorAll('table tbody tr');
        for (var r = 0; r < rows.length; r++) {
            var tds = rows[r].querySelectorAll('td');
            if (tds.length > PROCESSO_COL) {
                var proc = tds[PROCESSO_COL].textContent.trim();
                if (proc === processoName) {
                    rows[r].click();
                    console.log(TAG, 'Clicou na tabela:', processoName);
                    setTimeout(function() { callback(true); }, 2000);
                    return;
                }
            }
        }

        console.log(TAG, 'Processo não encontrado:', processoName);
        callback(false);
    }

    function waitForProcessLoad(callback) {
        var maxWait = 10000;
        var waited = 0;
        var interval = 500;

        var checker = setInterval(function() {
            waited += interval;
            // Check if accordion headers loaded
            var headers = document.querySelectorAll('.ui-accordion-header-text');
            if (headers.length > 2) {
                clearInterval(checker);
                callback();
                return;
            }
            if (waited >= maxWait) {
                clearInterval(checker);
                console.log(TAG, 'Timeout esperando processo carregar');
                callback();
            }
        }, interval);
    }

    // ===== ACTION DISPATCHER =====
    function executeAction(agendaType, processoName, callback) {
        switch (agendaType) {
            case 'Confirmar Embarque':
                actionConfirmarEmbarque(processoName, callback);
                break;
            default:
                // Placeholder for future agenda types
                callback({ processo: processoName, status: 'skip', msg: 'Tipo de agenda não implementado: ' + agendaType });
        }
    }

    // ===== FIELD SNAPSHOT (safety) =====
    function snapshotFields() {
        var snap = {};
        var inputs = document.querySelectorAll('input[id^="formularioEmbarque-"]');
        inputs.forEach(function(inp) {
            snap[inp.id] = inp.value || '';
        });
        return snap;
    }

    function verifySnapshot(before, after, allowedFields) {
        // Compare before/after, report any unexpected changes
        var issues = [];
        for (var id in before) {
            if (allowedFields.indexOf(id) >= 0) continue; // skip target field
            if (before[id] !== (after[id] || '')) {
                issues.push({ field: id, was: before[id], now: after[id] || '' });
            }
        }
        return issues;
    }

    function revertFields(before, issues) {
        issues.forEach(function(issue) {
            var inp = document.getElementById(issue.field);
            if (inp) {
                fillDateField(issue.field, issue.was);
                console.log(TAG, 'REVERTIDO:', issue.field, issue.now, '→', issue.was);
            }
        });
    }

    // ===== CONFIRMAR EMBARQUE =====
    function actionConfirmarEmbarque(processoName, callback) {
        // 1. Find and expand Embarque accordion
        var embarqueHeader = findAccordion('Embarque');
        if (!embarqueHeader) {
            callback({ processo: processoName, status: 'erro', msg: 'Accordion Embarque não encontrado' });
            return;
        }

        // Click to expand if collapsed
        var isExpanded = embarqueHeader.getAttribute('aria-expanded') === 'true' ||
                         embarqueHeader.classList.contains('ui-state-active');
        if (!isExpanded) {
            embarqueHeader.click();
            console.log(TAG, 'Expandindo accordion Embarque');
        }

        // 2. Wait for booking field to appear in DOM (Angular lazy render)
        waitForField('formularioEmbarque-dsReserva', 8000, function(bookingInput) {
            if (!bookingInput) {
                callback({ processo: processoName, status: 'erro', msg: 'Campo booking não carregou' });
                return;
            }

            // Take SNAPSHOT of all fields BEFORE any change
            var beforeSnap = snapshotFields();
            console.log(TAG, 'Snapshot tirado:', Object.keys(beforeSnap).length, 'campos');

            // 3. Check if already confirmed
            var dtConfirm = document.getElementById('formularioEmbarque-dtConfirmacaoEmbarque');
            if (dtConfirm && dtConfirm.value && dtConfirm.value.trim() !== '') {
                callback({ processo: processoName, status: 'skip', msg: 'Já confirmado: ' + dtConfirm.value });
                return;
            }

            // 4. Read booking
            var booking = (bookingInput.value || '').trim();
            if (!booking) {
                callback({ processo: processoName, status: 'skip', msg: 'Sem booking' });
                return;
            }

            // 5. Detect carrier from accordion header
            var carrier = detectCarrierFromAccordion();
            console.log(TAG, 'Booking:', booking, '| Armador:', carrier);

            if (carrier !== 'maersk') {
                // For non-Maersk: open tracking tab for manual verification
                var url = getAgendaTrackingUrl(carrier, booking);
                if (url) {
                    chrome.runtime.sendMessage({ action: 'openTab', url: url });
                }
                callback({ processo: processoName, status: 'skip', msg: 'Armador ' + carrier + ' — aberta aba para verificação manual' });
                return;
            }

            // 6. Maersk: open tracking tab and wait for scraper data
            var trackUrl = 'https://www.maersk.com/tracking/' + encodeURIComponent(booking);
            console.log(TAG, 'Abrindo tracking Maersk:', trackUrl);

            var responded = false;
            function onTrackingData(msg) {
                if (msg.action !== 'maerskTrackingData' || responded) return;
                responded = true;
                chrome.runtime.onMessage.removeListener(onTrackingData);

                if (!msg.data || !msg.data.departureDate) {
                    callback({ processo: processoName, status: 'skip', msg: 'Sem data de embarque no tracking' });
                    return;
                }

                var depDate = parseMaerskDate(msg.data.departureDate);
                if (!depDate) {
                    callback({ processo: processoName, status: 'skip', msg: 'Data inválida: ' + msg.data.departureDate });
                    return;
                }

                // Fill ONLY the confirmation date field
                console.log(TAG, 'Preenchendo dtConfirmacaoEmbarque =', depDate);
                fillDateField('formularioEmbarque-dtConfirmacaoEmbarque', depDate);

                // SAFETY CHECK: verify only target field changed
                setTimeout(function() {
                    var afterSnap = snapshotFields();
                    var issues = verifySnapshot(beforeSnap, afterSnap, ['formularioEmbarque-dtConfirmacaoEmbarque']);

                    if (issues.length > 0) {
                        console.log(TAG, 'ALERTA! Campos alterados inesperadamente:', JSON.stringify(issues));
                        revertFields(beforeSnap, issues);
                        showAgendaToast('Campos revertidos em ' + processoName + '!', 'error');
                    }

                    // Click Atualizar
                    clickAtualizar();
                    setTimeout(function() {
                        var safetyMsg = issues.length > 0
                            ? 'Confirmado: ' + depDate + ' (revertidos ' + issues.length + ' campos)'
                            : 'Confirmado: ' + depDate;
                        callback({ processo: processoName, status: 'ok', msg: safetyMsg });
                    }, 2000);
                }, 300);
            }

            chrome.runtime.onMessage.addListener(onTrackingData);
            chrome.runtime.sendMessage({ action: 'openTab', url: trackUrl });

            // Timeout after 35s
            setTimeout(function() {
                if (!responded) {
                    responded = true;
                    chrome.runtime.onMessage.removeListener(onTrackingData);
                    callback({ processo: processoName, status: 'erro', msg: 'Timeout aguardando tracking Maersk' });
                }
            }, 35000);
        });
    }

    function waitForField(fieldId, maxWait, callback) {
        var waited = 0;
        var interval = 500;
        var checker = setInterval(function() {
            waited += interval;
            var field = document.getElementById(fieldId);
            if (field) {
                clearInterval(checker);
                console.log(TAG, 'Campo encontrado:', fieldId, '(', waited, 'ms)');
                callback(field);
                return;
            }
            if (waited >= maxWait) {
                clearInterval(checker);
                console.log(TAG, 'Timeout esperando campo:', fieldId);
                callback(null);
            }
        }, interval);
    }

    // ===== HELPERS =====
    function findAccordion(keyword) {
        // Busca pelo texto direto do .ui-accordion-header-text (não do pai todo)
        // O accordion Embarque tem formato: "Embarque [ORIGEM] x [DESTINO] | [ARMADOR]"
        var headers = document.querySelectorAll('.ui-accordion-header');
        for (var i = 0; i < headers.length; i++) {
            var textEl = headers[i].querySelector('.ui-accordion-header-text');
            if (!textEl) continue;
            var txt = textEl.textContent.trim();
            // Match: texto que COMEÇA com "Embarque" e contém "|" (armador)
            if (txt.indexOf(keyword) === 0 && txt.indexOf('|') > 0) {
                console.log(TAG, 'Accordion encontrado [' + i + ']:', txt.substring(0, 50));
                return headers[i];
            }
        }
        // Fallback: aceita texto que COMEÇA com keyword (sem exigir pipe)
        for (var j = 0; j < headers.length; j++) {
            var textEl2 = headers[j].querySelector('.ui-accordion-header-text');
            if (!textEl2) continue;
            var txt2 = textEl2.textContent.trim();
            if (txt2.indexOf(keyword) === 0) {
                console.log(TAG, 'Accordion encontrado (fallback) [' + j + ']:', txt2.substring(0, 50));
                return headers[j];
            }
        }
        console.log(TAG, 'Accordion NÃO encontrado para:', keyword);
        // Debug: lista todos os headers
        headers.forEach(function(h, idx) {
            var t = h.querySelector('.ui-accordion-header-text');
            console.log(TAG, '  Header [' + idx + ']:', t ? t.textContent.trim().substring(0, 50) : '(sem texto)');
        });
        return null;
    }

    function detectCarrierFromAccordion() {
        var headers = document.querySelectorAll('.ui-accordion-header-text');
        for (var i = 0; i < headers.length; i++) {
            var txt = (headers[i].textContent || '').trim();
            if (txt.indexOf('Embarque') === 0 && txt.indexOf('|') > 0) {
                var armador = txt.split('|').pop().trim();
                var arm = armador.toUpperCase();
                if (arm.indexOf('MAERSK') >= 0 || arm.indexOf('MSK') >= 0) return 'maersk';
                if (arm.indexOf('MSC') >= 0) return 'msc';
                if (arm.indexOf('CMA') >= 0 || arm.indexOf('CGM') >= 0) return 'cma';
                if (arm.indexOf('HAPAG') >= 0) return 'hapag';
                if (arm.indexOf('EVERGREEN') >= 0 || arm.indexOf('EMC') >= 0) return 'evergreen';
                if (arm.indexOf('OCEAN NETWORK') >= 0 || arm.indexOf('ONE') >= 0) return 'one';
                if (arm.indexOf('COSCO') >= 0) return 'cosco';
                if (arm.indexOf('HMM') >= 0 || arm.indexOf('HYUNDAI') >= 0) return 'hmm';
                if (arm.indexOf('PIL') >= 0 || arm.indexOf('PACIFIC') >= 0) return 'pil';
                if (arm.indexOf('ZIM') >= 0) return 'zim';
                if (arm.indexOf('OOCL') >= 0) return 'oocl';
                return armador.toLowerCase();
            }
        }
        return 'unknown';
    }

    function getAgendaTrackingUrl(carrier, booking) {
        if (!booking) return null;
        booking = booking.trim();
        var urls = {
            'maersk': 'https://www.maersk.com/tracking/' + encodeURIComponent(booking),
            'msc': 'https://www.msc.com/en/track-a-shipment',
            'cma': 'https://www.cma-cgm.com/ebusiness/tracking/search',
            'hapag': 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?booking=' + encodeURIComponent(booking),
            'evergreen': 'https://ct.shipmentlink.com/servlet/TDB1_PageFlow.do',
            'one': 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trkNo=' + encodeURIComponent(booking),
            'cosco': 'https://elines.coscoshipping.com/ebusiness/cargotracking?trackingNumber=' + encodeURIComponent(booking),
            'hmm': 'https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?type=1&number=' + encodeURIComponent(booking),
            'pil': 'https://www.pilship.com/en--/120.html',
            'zim': 'https://www.zim.com/tools/track-a-shipment',
            'oocl': 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx'
        };
        return urls[carrier] || null;
    }

    function parseMaerskDate(dateStr) {
        // Maersk format: "15 Mar 2026 15:00" → "15/03/2026"
        if (!dateStr) return null;
        var months = {
            'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
            'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'
        };
        var m = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
        if (!m) return null;
        var day = m[1].padStart(2, '0');
        var month = months[m[2]];
        var year = m[3];
        if (!month) return null;
        return day + '/' + month + '/' + year;
    }

    function fillDateField(fieldId, dateStr) {
        var input = document.getElementById(fieldId);
        if (!input) {
            console.log(TAG, 'Campo não encontrado:', fieldId);
            return;
        }
        // Angular: set value + dispatch events
        var nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSet.call(input, dateStr);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log(TAG, 'Data preenchida:', fieldId, '=', dateStr);
    }

    function clickAtualizar() {
        var buttons = document.querySelectorAll('span.ui-button-text.ui-clickable');
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].textContent.trim() === 'Atualizar') {
                buttons[i].click();
                console.log(TAG, 'Clicou Atualizar');
                return true;
            }
        }
        console.log(TAG, 'Botão Atualizar não encontrado');
        return false;
    }

    // ===== UI HELPERS =====
    function updateProgress(msg, current, total) {
        var progress = document.getElementById('agenda-progress');
        if (!progress) return;
        progress.style.display = 'flex';

        var pct = total > 0 ? Math.round((current / total) * 100) : 0;
        progress.innerHTML = '<div style="width:120px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">' +
            '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:2px;transition:width 0.3s;"></div></div>' +
            '<span style="font-size:10px;white-space:nowrap;">' + msg + '</span>';
    }

    function showAgendaToast(msg, type) {
        var existing = document.getElementById('agenda-toast');
        if (existing) existing.remove();

        var colors = {
            success: { bg: 'rgba(34,197,94,0.9)', border: '#22c55e' },
            warning: { bg: 'rgba(245,158,11,0.9)', border: '#f59e0b' },
            error: { bg: 'rgba(239,68,68,0.9)', border: '#ef4444' },
            info: { bg: 'rgba(59,130,246,0.9)', border: '#3b82f6' }
        };
        var c = colors[type] || colors.info;

        var toast = document.createElement('div');
        toast.id = 'agenda-toast';
        toast.style.cssText = [
            'position:fixed; top:20px; right:20px; z-index:99999;',
            'background:' + c.bg + '; color:#fff;',
            'border:1px solid ' + c.border + ';',
            'border-radius:8px; padding:10px 16px;',
            'font-size:12px; font-weight:600;',
            'font-family:"Segoe UI",system-ui,sans-serif;',
            'box-shadow:0 4px 20px rgba(0,0,0,0.4);',
            'animation:agendaFadeIn 0.3s ease;'
        ].join('');
        toast.textContent = msg;
        document.body.appendChild(toast);

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(function() { toast.remove(); }, 300);
        }, 5000);
    }

    function showReport(agendaType, results) {
        var existing = document.getElementById('agenda-report');
        if (existing) existing.remove();

        var report = document.createElement('div');
        report.id = 'agenda-report';
        report.style.cssText = [
            'position:fixed; bottom:60px; right:20px; z-index:99998;',
            'background:linear-gradient(135deg, #0a1628, #132040);',
            'border:1px solid rgba(59,130,246,0.3);',
            'border-radius:10px; padding:12px 16px;',
            'font-family:"Segoe UI",system-ui,sans-serif;',
            'box-shadow:0 4px 24px rgba(0,0,0,0.5);',
            'max-width:360px; max-height:300px; overflow-y:auto;',
            'scrollbar-width:thin; scrollbar-color:rgba(59,130,246,0.2) transparent;'
        ].join('');

        var html = [];
        html.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">');
        html.push('<span style="color:#60a5fa;font-size:12px;font-weight:700;">' + agendaType + ' — Relatório</span>');
        html.push('<span id="agenda-report-close" style="color:#64748b;cursor:pointer;font-size:16px;">&times;</span>');
        html.push('</div>');

        results.forEach(function(r) {
            var icon = r.status === 'ok' ? '✓' : r.status === 'skip' ? '○' : '✕';
            var color = r.status === 'ok' ? '#86efac' : r.status === 'skip' ? '#fbbf24' : '#fca5a5';
            html.push('<div style="font-size:10px;color:' + color + ';padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04);">');
            html.push('<span style="font-weight:700;">' + icon + ' ' + r.processo + '</span>');
            html.push('<span style="color:#94a3b8;margin-left:6px;">' + r.msg + '</span>');
            html.push('</div>');
        });

        report.innerHTML = html.join('');
        document.body.appendChild(report);

        document.getElementById('agenda-report-close').addEventListener('click', function() {
            report.remove();
        });

        // Auto-close after 30s
        setTimeout(function() { if (report.parentElement) report.remove(); }, 30000);
    }

    // ===== MESSAGE HANDLING =====
    // Listen for tracking data from scrapers
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        // Messages are handled in the actionConfirmarEmbarque listener
    });

})();

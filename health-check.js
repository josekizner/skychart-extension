/**
 * ATOM Health Check — Validação automática de integridade dos agentes
 * 
 * Roda silenciosamente ao carregar a página (dentro de processo).
 * Se detectar problema, notifica o Master via toast E email.
 * Também pode ser chamado manualmente via window.__atomHealthCheck()
 */
(function() {
    'use strict';

    var TAG = '[Health]';
    var DELAY_MS = 6000; // Espera a página carregar

    // Guard: extensão ainda válida?
    function isContextValid() {
        try { return !!chrome.runtime && !!chrome.runtime.id; } catch(e) { return false; }
    }

    // ===== CHECKS POR MÓDULO =====
    var CHECKS = {
        operacional: [
            {
                agent: 'Chequeio Op',
                tests: [
                    { name: 'Accordion Custos', fn: function() { return !!findAccHeader('Custos'); } },
                    { name: 'Accordion Arquivos', fn: function() { return !!findAccHeader('Arquivos'); } },
                    { name: 'Tabela de custos', fn: function() { return hasCostTable(); } },
                    { name: 'Botão Recalcular', fn: function() { return hasButtonWith('recalcular'); } }
                ]
            },
            {
                agent: 'Smart Agent',
                tests: [
                    { name: 'findFieldSmart disponível', fn: function() { return typeof window.findFieldSmart === 'function'; } }
                ]
            }
        ],
        financeiro: [
            {
                agent: 'Chequeio Fin',
                tests: [
                    { name: 'APP-FATURA-IDENTIFICACAO', fn: function() { return !!document.querySelector('APP-FATURA-IDENTIFICACAO, app-fatura-identificacao'); } },
                    { name: 'Accordion Arquivos', fn: function() { return !!findAccHeader('Arquivos'); } },
                    { name: 'Tabela Itens', fn: function() { return hasTableWithHeader('Taxa') || hasTableWithHeader('Tipo'); } }
                ]
            }
        ],
        global: [
            {
                agent: 'PDF Parser',
                tests: [
                    { name: 'pdfjsLib carregado', fn: function() { return typeof pdfjsLib !== 'undefined'; } }
                ]
            },
            {
                agent: 'Chrome Runtime',
                tests: [
                    { name: 'Mensageria ativa', fn: function() { return isContextValid(); } }
                ]
            }
        ]
    };

    // ===== HELPERS =====
    function findAccHeader(name) {
        var spans = document.querySelectorAll('span, a');
        for (var i = 0; i < spans.length; i++) {
            var txt = (spans[i].textContent || '').trim();
            if (txt === name || txt.indexOf(name) >= 0) {
                var header = spans[i].closest('.ui-accordion-header, [role="tab"]');
                if (header) return header;
            }
        }
        return null;
    }

    function hasCostTable() {
        var ths = document.querySelectorAll('th');
        for (var h = 0; h < ths.length; h++) {
            if ((ths[h].textContent || '').trim().toLowerCase().indexOf('taxa') >= 0) return true;
        }
        return false;
    }

    function hasTableWithHeader(headerName) {
        var ths = document.querySelectorAll('th');
        for (var h = 0; h < ths.length; h++) {
            if ((ths[h].textContent || '').trim().toLowerCase().indexOf(headerName.toLowerCase()) >= 0) return true;
        }
        return false;
    }

    function hasButtonWith(text) {
        var btns = document.querySelectorAll('button');
        for (var b = 0; b < btns.length; b++) {
            if ((btns[b].textContent || '').trim().toLowerCase().indexOf(text) >= 0) return true;
        }
        return false;
    }

    function getModulo() {
        var url = window.location.href;
        if (url.indexOf('/app/operacional') >= 0) return 'operacional';
        if (url.indexOf('/app/financeiro') >= 0) return 'financeiro';
        return null;
    }

    // Detecta se estamos DENTRO de um processo (não na lista)
    function isInsideProcess() {
        // Processo aberto tem accordions (Custos, Documentos, BL, etc.)
        var accordions = document.querySelectorAll('.ui-accordion-header, [role="tab"]');
        return accordions.length >= 3; // Lista tem 0, processo tem muitos
    }

    // ===== EXECUTAR HEALTH CHECK =====
    function runHealthCheck(silent) {
        if (!isContextValid()) {
            console.log(TAG, 'Context invalidated, abortando.');
            return { failed: ['Context invalidated'] };
        }

        var modulo = getModulo();
        var checksToRun = (CHECKS.global || []).slice();

        if (modulo && CHECKS[modulo]) {
            checksToRun = checksToRun.concat(CHECKS[modulo]);
        }

        var totalTests = 0;
        var passedTests = 0;
        var failedTests = [];
        var results = [];

        for (var a = 0; a < checksToRun.length; a++) {
            var agentCheck = checksToRun[a];

            for (var t = 0; t < agentCheck.tests.length; t++) {
                totalTests++;
                var test = agentCheck.tests[t];
                var passed = false;
                try { passed = test.fn(); } catch (e) { passed = false; }

                if (passed) {
                    passedTests++;
                } else {
                    failedTests.push(agentCheck.agent + ': ' + test.name);
                }

                results.push({ agent: agentCheck.agent, test: test.name, passed: passed });

                var icon = passed ? '✅' : '❌';
                console.log(TAG, icon, agentCheck.agent, '—', test.name);
            }
        }

        // Resumo
        var moduloLabel = modulo ? (modulo.charAt(0).toUpperCase() + modulo.slice(1)) : 'Geral';
        console.log(TAG, '=== Resultado (' + moduloLabel + '): ' + passedTests + '/' + totalTests + ' OK ===');

        if (failedTests.length > 0) {
            console.warn(TAG, '⚠ Falhas:', failedTests.join(' | '));
            notifyMaster(failedTests, passedTests, totalTests, moduloLabel);
        } else if (!silent) {
            showHealthToast('✅ Health Check: ' + passedTests + '/' + totalTests + ' OK (' + moduloLabel + ')', 'success');
        }

        return { modulo: moduloLabel, total: totalTests, passed: passedTests, failed: failedTests, results: results };
    }

    // ===== NOTIFICAÇÃO PRO MASTER (toast + email) =====
    function notifyMaster(failures, passed, total, modulo) {
        if (!isContextValid()) return;

        chrome.storage.local.get(['userProfile'], function(data) {
            var isMaster = !data.userProfile || data.userProfile === 'master';

            // Toast só pra Master
            if (isMaster) {
                var msg = '⚠ Health Check (' + modulo + '): ' + failures.length + ' problema(s)\n';
                for (var i = 0; i < Math.min(failures.length, 3); i++) {
                    msg += '  • ' + failures[i] + '\n';
                }
                if (failures.length > 3) msg += '  + ' + (failures.length - 3) + ' mais...';
                showHealthToast(msg, 'warning');
            }

            // Email pro Master — SEMPRE (qualquer perfil detecta, master recebe)
            try {
                chrome.runtime.sendMessage({
                    action: 'healthCheckAlert',
                    data: {
                        modulo: modulo,
                        total: total,
                        passed: passed,
                        failures: failures,
                        profile: data.userProfile || 'unknown',
                        url: window.location.href,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch(e) { /* context gone */ }

            // Salva último resultado
            try {
                chrome.storage.local.set({
                    lastHealthCheck: {
                        timestamp: new Date().toISOString(),
                        modulo: modulo,
                        total: total,
                        passed: passed,
                        failures: failures
                    }
                });
            } catch(e) { /* context gone */ }
        });
    }

    // ===== TOAST VISUAL =====
    function showHealthToast(message, type) {
        var colors = {
            success: { bg: 'rgba(16,185,129,0.95)', border: '#10b981' },
            warning: { bg: 'rgba(245,158,11,0.95)', border: '#f59e0b' },
            error: { bg: 'rgba(239,68,68,0.95)', border: '#ef4444' }
        };
        var c = colors[type] || colors.warning;

        var toast = document.createElement('div');
        toast.style.cssText = [
            'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
            'background:' + c.bg, 'color:#fff', 'padding:12px 20px',
            'border-radius:10px', 'font-family:Inter,Arial,sans-serif',
            'font-size:13px', 'font-weight:500', 'box-shadow:0 8px 32px rgba(0,0,0,0.4)',
            'z-index:2147483647', 'white-space:pre-line',
            'border-left:4px solid ' + c.border, 'max-width:450px'
        ].join(';');

        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s';
            setTimeout(function() { toast.remove(); }, 500);
        }, 8000);
    }

    // ===== AUTO-RUN =====
    function autoRun() {
        var modulo = getModulo();
        if (!modulo) return;

        setTimeout(function() {
            if (!isInsideProcess()) {
                console.log(TAG, 'Na lista de processos, pulando. (Abra um processo pra checar)');
                return;
            }
            console.log(TAG, 'Auto-check (' + modulo + ')...');
            runHealthCheck(true);
        }, DELAY_MS);
    }

    // Expõe pra uso manual
    window.__atomHealthCheck = function() { return runHealthCheck(false); };

    autoRun();
    console.log(TAG, 'Carregado. Use __atomHealthCheck() no console pra check manual.');

})();

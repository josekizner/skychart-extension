/**
 * SKYCHART DEBUG PANEL — Painel de diagnóstico integrado ao HUD
 * 
 * Mostra logs estruturados no HUD, botão de copiar, DOM dumps automáticos.
 * Elimina a necessidade de prints/screenshots para debug.
 */

var SkDebug = (function () {
    'use strict';

    var logs = [];
    var panelEl = null;
    var logContainerEl = null;

    function init() {
        // Espera o HUD existir
        var content = document.getElementById('sk-main-content');
        if (!content) {
            setTimeout(init, 500);
            return;
        }

        // Cria o painel de debug
        panelEl = document.createElement('div');
        panelEl.id = 'sk-debug-panel';
        panelEl.style.cssText = 'display:none;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;font-size:10px;font-family:monospace;background:rgba(0,0,0,0.4);border-radius:8px;padding:8px;margin-top:5px;';

        // Container dos logs
        logContainerEl = document.createElement('div');
        logContainerEl.id = 'sk-debug-logs';
        logContainerEl.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
        panelEl.appendChild(logContainerEl);

        // Botão de copiar
        var copyBtn = document.createElement('button');
        copyBtn.id = 'sk-debug-copy';
        copyBtn.textContent = '📋 COPIAR LOG';
        copyBtn.style.cssText = 'background:#3498db;color:white;border:none;border-radius:6px;padding:6px 10px;font-size:10px;font-weight:bold;cursor:pointer;margin-top:6px;transition:all 0.2s;';
        copyBtn.onmouseenter = function () { copyBtn.style.background = '#2980b9'; };
        copyBtn.onmouseleave = function () { copyBtn.style.background = '#3498db'; };
        copyBtn.onclick = function (e) {
            e.stopPropagation();
            copyLogs();
        };
        panelEl.appendChild(copyBtn);

        content.appendChild(panelEl);
        console.log('Skychart AI: DebugPanel inicializado.');
    }

    function log(label, status, message) {
        var entry = {
            time: new Date().toLocaleTimeString('pt-BR'),
            label: label,
            status: status,
            message: message
        };
        logs.push(entry);
        console.log('Skychart AI: [' + status + '] ' + label + ': ' + message);

        // Adiciona ao painel visual
        if (logContainerEl) {
            var line = document.createElement('div');
            var color = '#aaa';
            var icon = '•';
            switch (status) {
                case 'OK': color = '#2ecc71'; icon = '✅'; break;
                case 'FAIL': color = '#e74c3c'; icon = '❌'; break;
                case 'EXEC': color = '#3498db'; icon = '⏳'; break;
                case 'SKIP': color = '#f39c12'; icon = '⏭️'; break;
                case 'INFO': color = '#9b59b6'; icon = 'ℹ️'; break;
                case 'DEBUG': color = '#7f8c8d'; icon = '🔍'; break;
            }
            line.style.cssText = 'color:' + color + ';line-height:1.4;word-break:break-all;';
            line.textContent = icon + ' ' + label + ': ' + message;
            logContainerEl.appendChild(line);

            // Auto-scroll
            panelEl.scrollTop = panelEl.scrollHeight;
        }
    }

    function show() {
        if (panelEl) panelEl.style.display = 'flex';
    }

    function hide() {
        if (panelEl) panelEl.style.display = 'none';
    }

    function clear() {
        logs = [];
        if (logContainerEl) logContainerEl.innerHTML = '';
    }

    function copyLogs() {
        var text = '=== SKYCHART AI DEBUG LOG ===\n';
        text += 'Gerado: ' + new Date().toLocaleString('pt-BR') + '\n';
        text += 'URL: ' + location.href + '\n';
        text += '===\n\n';

        logs.forEach(function (entry) {
            text += '[' + entry.time + '] [' + entry.status + '] ' + entry.label + ': ' + entry.message + '\n';
        });

        // Adiciona DOM snapshot dos campos de interesse
        text += '\n=== DOM SNAPSHOT ===\n';
        var interestingSelectors = [
            'input[title="Taxa"]',
            '#formularioFiltroPagamento-dtFechamento',
            '#dsContrato',
            '#formularioEmbarque-cdFornecedorIOF',
            '#formularioEmbarque-cdFornecedorContratCambio',
            '#formularioEmbarque-cdMoedaContrato',
            'span.fa-fw.fa-save',
            '.fa-pencil',
            '.fa-edit',
            '.ui-chkbox-icon.fa-check'
        ];

        interestingSelectors.forEach(function (sel) {
            var el = document.querySelector(sel);
            if (el) {
                var diag = window.SkAgent ? window.SkAgent.diagnose(el) : { exists: true, className: el.className };
                text += sel + ': ' + JSON.stringify(diag) + '\n';
            } else {
                text += sel + ': NÃO ENCONTRADO\n';
            }
        });

        // Memória do agente
        if (window.SkMemory) {
            text += '\n=== MEMÓRIA DO AGENTE ===\n';
            var stats = window.SkMemory.stats();
            text += 'Campos conhecidos: ' + stats.camposConhecidos + '\n';
            text += 'Total sucessos: ' + stats.totalSucessos + '\n';
            text += 'Total falhas: ' + stats.totalFalhas + '\n';
            text += 'Taxa acerto: ' + stats.taxaAcerto + '%\n';
            if (stats.camposProblematicos.length > 0) {
                text += 'Problemáticos: ' + stats.camposProblematicos.join(', ') + '\n';
            }
            var allMem = window.SkMemory.getAll();
            Object.keys(allMem).forEach(function (key) {
                var m = allMem[key];
                text += '\n' + key + ': ' + m.totalSucessos + ' OK, ' + m.totalFalhas + ' FAIL';
                if (m.seletoresQueFunc.length) text += ' | selOK: ' + m.seletoresQueFunc.join(', ');
                if (m.estrategiasQueFunc.length) text += ' | stratOK: ' + m.estrategiasQueFunc.join(', ');
                text += '\n';
            });
        }

        // Copia para clipboard
        navigator.clipboard.writeText(text).then(function () {
            var copyBtn = document.getElementById('sk-debug-copy');
            if (copyBtn) {
                var original = copyBtn.textContent;
                copyBtn.textContent = '✅ COPIADO!';
                copyBtn.style.background = '#2ecc71';
                setTimeout(function () {
                    copyBtn.textContent = original;
                    copyBtn.style.background = '#3498db';
                }, 2000);
            }
            console.log('Skychart AI: Debug log copiado para clipboard!');
        }).catch(function (err) {
            console.error('Skychart AI: Erro ao copiar:', err);
            // Fallback: abre em nova janela
            var w = window.open('', '_blank');
            if (w) { w.document.write('<pre>' + text + '</pre>'); }
        });
    }

    function getFullLog() {
        return logs;
    }

    return {
        init: init,
        log: log,
        show: show,
        hide: hide,
        clear: clear,
        copy: copyLogs,
        getLogs: getFullLog
    };
})();

// Expõe globalmente
window.SkDebug = SkDebug;
console.log('Skychart AI: DebugPanel carregado.');

// HMM Schedule Scraper - Content Script
// Roda em https://www.hmm21.com/*
// Usa modelo híbrido: DOM + Gemini Vision pra verificar preenchimento

(function() {
    'use strict';
    var TAG = '[HMM Scraper]';
    var MAX_RETRIES = 3;
    console.log(TAG, 'Script carregado');

    // Memória de portos aprendidos
    var portMemory = {};

    // Carrega memória salva
    chrome.storage.local.get('hmm_port_memory', function(data) {
        portMemory = data.hmm_port_memory || {};
        console.log(TAG, 'Memória carregada:', Object.keys(portMemory).length, 'portos');
    });

    function savePortMemory(key, value) {
        portMemory[key] = value;
        chrome.storage.local.set({ hmm_port_memory: portMemory });
        console.log(TAG, 'Porto aprendido:', key, '→', value);
    }

    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'hmm_search_schedule') {
            console.log(TAG, 'Buscando:', msg.from, '→', msg.to);
            runWithVerification(msg.from, msg.to, 0);
            sendResponse({ status: 'started' });
        }
        if (msg.action === 'hmm_vision_result') {
            handleVisionResult(msg);
        }
    });

    var currentState = { from: '', to: '', attempt: 0, phase: '' };
    var visionCallback = null;

    function runWithVerification(from, to, attempt) {
        currentState = { from: from, to: to, attempt: attempt, phase: 'filling' };

        if (attempt >= MAX_RETRIES) {
            console.log(TAG, 'MAX RETRIES atingido! Pedindo verificação manual');
            chrome.runtime.sendMessage({
                action: 'hmm_needs_manual',
                from: from,
                to: to,
                message: 'O agente não conseguiu preencher corretamente após ' + MAX_RETRIES + ' tentativas. Por favor verifique os campos From/To e clique Retrieve manualmente.'
            });
            return;
        }

        console.log(TAG, 'Tentativa', attempt + 1, '/', MAX_RETRIES);

        // Limpa campos primeiro
        var fromInput = document.querySelector('#srchPointFrom');
        var toInput = document.querySelector('#srchPointTo');
        if (!fromInput || !toInput) {
            console.log(TAG, 'Inputs não encontrados, esperando...');
            setTimeout(function() { runWithVerification(from, to, attempt); }, 1000);
            return;
        }

        // Passo 1: Limpar tudo
        clearField(fromInput);
        clearField(toInput);

        // Checa se temos uma memória pra esse porto
        var fromLearned = portMemory[from.toUpperCase()];
        var toLearned = portMemory[to.toUpperCase()];

        var fromSearch = fromLearned || from;
        var toSearch = toLearned || to;

        console.log(TAG, 'Buscando From:', fromSearch, fromLearned ? '(aprendido)' : '(original)');
        console.log(TAG, 'Buscando To:', toSearch, toLearned ? '(aprendido)' : '(original)');

        // Passo 2: Preencher From
        setTimeout(function() {
            fillAutocomplete(fromInput, fromSearch, from, function(selectedFrom) {
                console.log(TAG, 'From preenchido:', selectedFrom);

                // Passo 3: Preencher To
                setTimeout(function() {
                    fillAutocomplete(toInput, toSearch, to, function(selectedTo) {
                        console.log(TAG, 'To preenchido:', selectedTo);

                        // Passo 4: VERIFICAR com screenshot antes de clicar Retrieve
                        setTimeout(function() {
                            verifyBeforeRetrieve(from, to);
                        }, 1000);
                    });
                }, 1000);
            });
        }, 500);
    }

    function clearField(input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function fillAutocomplete(input, searchText, originalKey, callback) {
        input.focus();
        input.value = '';

        // Digita caractere por caractere
        var i = 0;
        var interval = setInterval(function() {
            if (i >= searchText.length) {
                clearInterval(interval);
                input.dispatchEvent(new Event('input', { bubbles: true }));

                // Espera dropdown aparecer
                setTimeout(function() {
                    selectBestMatch(input, originalKey, searchText, callback);
                }, 1500);
                return;
            }
            input.value += searchText[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: searchText[i], bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: searchText[i], bubbles: true }));
            i++;
        }, 80);
    }

    function selectBestMatch(input, originalKey, searchText, callback) {
        // Procura dropdown do jQuery autocomplete
        var dropdown = document.querySelector('.ac_results');
        if (!dropdown || dropdown.style.display === 'none') {
            console.log(TAG, 'Dropdown não apareceu, tentando Enter');
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            setTimeout(function() { callback(input.value); }, 500);
            return;
        }

        var items = dropdown.querySelectorAll('li');
        console.log(TAG, 'Dropdown tem', items.length, 'items');

        // Loga todos os items pra diagnóstico
        for (var d = 0; d < items.length; d++) {
            console.log(TAG, '  [' + d + ']', items[d].textContent.trim().substring(0, 60));
        }

        // Procura melhor match: texto que CONTÉM o nome original
        var bestItem = null;
        var searchUp = originalKey.toUpperCase();

        for (var j = 0; j < items.length; j++) {
            var itemText = items[j].textContent.trim().toUpperCase();
            if (itemText.indexOf(searchUp) >= 0) {
                bestItem = items[j];
                console.log(TAG, 'Match encontrado:', items[j].textContent.trim());
                break;
            }
        }

        // Se não achou match exato, procura parcial (primeiras 4 letras)
        if (!bestItem && searchUp.length >= 4) {
            var partial = searchUp.substring(0, 4);
            for (var k = 0; k < items.length; k++) {
                if (items[k].textContent.trim().toUpperCase().indexOf(partial) >= 0) {
                    bestItem = items[k];
                    console.log(TAG, 'Match parcial:', items[k].textContent.trim());
                    break;
                }
            }
        }

        if (bestItem) {
            bestItem.click();
            console.log(TAG, 'Item selecionado:', bestItem.textContent.trim());
            setTimeout(function() { callback(input.value); }, 500);
        } else {
            // Nenhum match — seleciona primeiro por fallback
            console.log(TAG, 'NENHUM MATCH! Selecionando primeiro item como fallback');
            if (items[0]) items[0].click();
            setTimeout(function() { callback(input.value); }, 500);
        }
    }

    function verifyBeforeRetrieve(expectedFrom, expectedTo) {
        console.log(TAG, 'Verificando preenchimento via screenshot...');

        // Lê os valores atuais dos campos
        var fromInput = document.querySelector('#srchPointFrom');
        var toInput = document.querySelector('#srchPointTo');
        var currentFrom = fromInput ? fromInput.value : '';
        var currentTo = toInput ? toInput.value : '';

        console.log(TAG, 'Campos atuais: From="' + currentFrom + '" To="' + currentTo + '"');
        console.log(TAG, 'Esperado: From="' + expectedFrom + '" To="' + expectedTo + '"');

        // Verificação simples por texto (sem precisar de Gemini)
        var fromOk = currentFrom.toUpperCase().indexOf(expectedFrom.toUpperCase()) >= 0;
        var toOk = currentTo.toUpperCase().indexOf(expectedTo.toUpperCase()) >= 0;

        if (fromOk && toOk) {
            console.log(TAG, 'Verificação textual OK! Clicando Retrieve...');
            clickRetrieve();
        } else {
            console.log(TAG, 'Verificação textual FALHOU. Pedindo visão ao Gemini...');
            
            // Pede screenshot ao background
            chrome.runtime.sendMessage({
                action: 'hmm_verify_screenshot',
                expectedFrom: expectedFrom,
                expectedTo: expectedTo,
                currentFrom: currentFrom,
                currentTo: currentTo,
                attempt: currentState.attempt
            });
        }
    }

    function handleVisionResult(msg) {
        if (msg.verified) {
            console.log(TAG, 'Gemini confirmou: tudo certo!');
            clickRetrieve();
        } else {
            console.log(TAG, 'Gemini diz que está errado:', msg.suggestion);

            // Aprende a sugestão do Gemini pra próxima vez
            if (msg.correctedFrom) {
                savePortMemory(currentState.from.toUpperCase(), msg.correctedFrom);
            }
            if (msg.correctedTo) {
                savePortMemory(currentState.to.toUpperCase(), msg.correctedTo);
            }

            // Tenta de novo
            runWithVerification(currentState.from, currentState.to, currentState.attempt + 1);
        }
    }

    function clickRetrieve() {
        var btn = document.querySelector('#btnRetrieve');
        if (btn) {
            console.log(TAG, 'Clicando Retrieve...');
            btn.click();

            // Espera resultados
            setTimeout(function() {
                var results = scrapeResults();
                console.log(TAG, 'Resultados:', results.length);
                chrome.runtime.sendMessage({
                    action: 'hmm_schedule_results',
                    results: results
                });
            }, 5000);
        } else {
            console.log(TAG, 'Botão Retrieve não encontrado!');
        }
    }

    function scrapeResults() {
        var results = [];

        // Procura a tabela de resultados baseado na screenshot real:
        // Colunas: Sel, Origin Point, Loading Port, Loading Terminal, Operator, Route, Vessel, Next Port, Discharging Port, Discharging Terminal, Destination Point, Total Transit Time, Click Here
        var allTables = document.querySelectorAll('table');
        var resultTable = null;

        for (var t = 0; t < allTables.length; t++) {
            var ths = allTables[t].querySelectorAll('th');
            for (var h = 0; h < ths.length; h++) {
                if ((ths[h].textContent || '').indexOf('Vessel') >= 0) {
                    resultTable = allTables[t];
                    break;
                }
            }
            if (resultTable) break;
        }

        if (!resultTable) {
            console.log(TAG, 'Tabela de resultados não encontrada');
            return results;
        }

        var rows = resultTable.querySelectorAll('tbody tr');
        console.log(TAG, 'Linhas encontradas:', rows.length);

        // Primeiro, encontra índices das colunas
        var headers = resultTable.querySelectorAll('th');
        var vesselCol = -1, transitCol = -1;
        for (var hi = 0; hi < headers.length; hi++) {
            var htxt = (headers[hi].textContent || '').trim();
            if (htxt.indexOf('Vessel') >= 0) vesselCol = hi;
            if (htxt.indexOf('Transit') >= 0) transitCol = hi;
        }

        for (var r = 0; r < Math.min(rows.length, 3); r++) {
            var cells = rows[r].querySelectorAll('td');
            if (cells.length < 5) continue;

            // Extrai dados baseado na estrutura real
            var vessel = vesselCol >= 0 && cells[vesselCol] ? cells[vesselCol].textContent.trim() : '';
            var transitTime = transitCol >= 0 && cells[transitCol] ? cells[transitCol].textContent.trim() : '';

            // ETD: procura no Origin Point (coluna 1) ou Loading Port
            var etd = '';
            var eta = '';
            for (var c = 0; c < cells.length; c++) {
                var cellText = cells[c].textContent || '';
                var etdMatch = cellText.match(/ETD\s*[:\s]?\s*(\d{4}-\d{2}-\d{2})/);
                var etaMatch = cellText.match(/ET[AB]\s*[:\s]?\s*(\d{4}-\d{2}-\d{2})/);
                if (etdMatch && !etd) etd = etdMatch[1];
                if (etaMatch && !etd) eta = etaMatch[1]; // ETA might also be ETB
            }

            if (vessel || etd) {
                results.push({
                    vessel: vessel.replace(/\[.*?\]/g, '').trim(),
                    etd: etd,
                    eta: eta,
                    transitTime: transitTime + (transitTime && !transitTime.match(/dia/i) ? ' dias' : '')
                });
                console.log(TAG, 'Sailing #' + (r + 1) + ':', vessel, '| ETD:', etd, '| ETA:', eta, '| TT:', transitTime);
            }
        }

        return results;
    }
})();

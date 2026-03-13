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

    // Guarda todos os matches do autocomplete pra poder tentar o próximo
    var fromMatches = []; // [{text, element}]
    var fromMatchIndex = 0;
    var toMatches = [];
    var toMatchIndex = 0;

    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'hmm_search_schedule') {
            console.log(TAG, 'Buscando:', msg.from, '→', msg.to);
            fromMatches = [];
            fromMatchIndex = 0;
            toMatches = [];
            toMatchIndex = 0;
            runWithVerification(msg.from, msg.to, 0);
            sendResponse({ status: 'started' });
        }
        if (msg.action === 'hmm_vision_result') {
            handleVisionResult(msg);
        }
    });

    var currentState = { from: '', to: '', attempt: 0, phase: '' };

    function runWithVerification(from, to, attempt) {
        currentState = { from: from, to: to, attempt: attempt, phase: 'filling' };

        if (attempt >= MAX_RETRIES) {
            console.log(TAG, 'MAX RETRIES atingido! Pedindo verificação manual');
            chrome.runtime.sendMessage({
                action: 'hmm_needs_manual',
                from: from,
                to: to,
                message: 'Não encontrou sailings após ' + MAX_RETRIES + ' tentativas. Verifique From/To e clique Retrieve manualmente.'
            });
            return;
        }

        console.log(TAG, 'Tentativa', attempt + 1, '/', MAX_RETRIES);

        var fromInput = document.querySelector('#srchPointFrom');
        var toInput = document.querySelector('#srchPointTo');
        if (!fromInput || !toInput) {
            console.log(TAG, 'Inputs não encontrados, esperando...');
            setTimeout(function() { runWithVerification(from, to, attempt); }, 1000);
            return;
        }

        // Checa se temos uma memória pra esse porto
        var fromLearned = portMemory[from.toUpperCase()];
        var toLearned = portMemory[to.toUpperCase()];

        var fromSearch = fromLearned || from;
        var toSearch = toLearned || to;

        console.log(TAG, 'Buscando From:', fromSearch, fromLearned ? '(aprendido)' : '(original)');
        console.log(TAG, 'Buscando To:', toSearch, toLearned ? '(aprendido)' : '(original)');

        // Limpa e preenche
        clearAllFields();

        setTimeout(function() {
            fillAutocomplete(fromInput, fromSearch, from, 'from', function(selectedFrom) {
                console.log(TAG, 'From preenchido:', selectedFrom);

                setTimeout(function() {
                    fillAutocomplete(toInput, toSearch, to, 'to', function(selectedTo) {
                        console.log(TAG, 'To preenchido:', selectedTo);

                        setTimeout(function() {
                            verifyAndRetrieve(from, to);
                        }, 1000);
                    });
                }, 1000);
            });
        }, 500);
    }

    function clearAllFields() {
        // Clica botão Clear do HMM pra resetar tudo
        var clearBtn = document.querySelector('button.btn');
        var allBtns = document.querySelectorAll('button, .btn');
        for (var b = 0; b < allBtns.length; b++) {
            if ((allBtns[b].textContent || '').trim() === 'Clear') {
                allBtns[b].click();
                console.log(TAG, 'Botão Clear clicado');
                break;
            }
        }
        var fromInput = document.querySelector('#srchPointFrom');
        var toInput = document.querySelector('#srchPointTo');
        if (fromInput) { fromInput.value = ''; fromInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (toInput) { toInput.value = ''; toInput.dispatchEvent(new Event('input', { bubbles: true })); }
    }

    function fillAutocomplete(input, searchText, originalKey, fieldType, callback) {
        input.focus();
        input.value = '';

        var i = 0;
        var interval = setInterval(function() {
            if (i >= searchText.length) {
                clearInterval(interval);
                input.dispatchEvent(new Event('input', { bubbles: true }));

                setTimeout(function() {
                    selectFromDropdown(input, originalKey, fieldType, callback);
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

    function selectFromDropdown(input, originalKey, fieldType, callback) {
        var dropdown = document.querySelector('.ac_results');
        var hasVisible = dropdown && dropdown.style.display !== 'none' && dropdown.querySelectorAll('li').length > 0;
        if (!hasVisible) {
            console.log(TAG, 'Dropdown não apareceu, tentando ArrowDown+Enter');
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
            setTimeout(function() {
                // Checa de novo se dropdown apareceu
                var dd2 = document.querySelector('.ac_results');
                if (dd2 && dd2.style.display !== 'none' && dd2.querySelectorAll('li').length > 0) {
                    // Tem dropdown agora!
                    selectFromDropdown(input, originalKey, fieldType, callback);
                    return;
                }
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                setTimeout(function() { callback(input.value); }, 500);
            }, 800);
            return;
        }

        var items = dropdown.querySelectorAll('li');
        console.log(TAG, 'Dropdown tem', items.length, 'items');

        // Coleta TODOS os matches
        var matches = [];
        var searchUp = originalKey.toUpperCase();

        for (var j = 0; j < items.length; j++) {
            var itemText = items[j].textContent.trim();
            console.log(TAG, '  [' + j + ']', itemText.substring(0, 60));
            if (itemText.toUpperCase().indexOf(searchUp) >= 0) {
                matches.push({ text: itemText, index: j });
            }
        }

        // Se não achou match exato, tenta parcial
        if (matches.length === 0 && searchUp.length >= 4) {
            var partial = searchUp.substring(0, 4);
            for (var k = 0; k < items.length; k++) {
                if (items[k].textContent.trim().toUpperCase().indexOf(partial) >= 0) {
                    matches.push({ text: items[k].textContent.trim(), index: k });
                }
            }
        }

        // Salva matches pro fieldType
        if (fieldType === 'from') {
            fromMatches = matches;
            console.log(TAG, 'From matches:', matches.length, matches.map(function(m) { return m.text.substring(0, 30); }));
        } else {
            toMatches = matches;
            console.log(TAG, 'To matches:', matches.length, matches.map(function(m) { return m.text.substring(0, 30); }));
        }

        // Seleciona o item correto (baseado no index atual)
        var matchIdx = fieldType === 'from' ? fromMatchIndex : toMatchIndex;
        if (matches.length > 0) {
            var selectedMatch = matches[Math.min(matchIdx, matches.length - 1)];
            items[selectedMatch.index].click();
            console.log(TAG, 'Item selecionado [' + matchIdx + ']:', selectedMatch.text);
            setTimeout(function() { callback(input.value); }, 500);
        } else {
            console.log(TAG, 'NENHUM MATCH! Selecionando primeiro item');
            if (items[0]) items[0].click();
            setTimeout(function() { callback(input.value); }, 500);
        }
    }

    function verifyAndRetrieve(expectedFrom, expectedTo) {
        var fromInput = document.querySelector('#srchPointFrom');
        var toInput = document.querySelector('#srchPointTo');
        var currentFrom = fromInput ? fromInput.value : '';
        var currentTo = toInput ? toInput.value : '';

        console.log(TAG, 'Campos atuais: From="' + currentFrom + '" To="' + currentTo + '"');
        console.log(TAG, 'Esperado: From~"' + expectedFrom + '" To~"' + expectedTo + '"');

        var fromOk = currentFrom.toUpperCase().indexOf(expectedFrom.toUpperCase()) >= 0;
        var toOk = currentTo.toUpperCase().indexOf(expectedTo.toUpperCase()) >= 0;

        if (fromOk && toOk) {
            console.log(TAG, 'Verificação textual OK! Clicando Retrieve...');
            clickRetrieve();
        } else {
            console.log(TAG, 'Verificação textual FALHOU. Pedindo visão ao Gemini...');
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
            console.log(TAG, 'Gemini diz errado:', msg.suggestion);
            if (msg.correctedFrom) savePortMemory(currentState.from.toUpperCase(), msg.correctedFrom);
            if (msg.correctedTo) savePortMemory(currentState.to.toUpperCase(), msg.correctedTo);
            runWithVerification(currentState.from, currentState.to, currentState.attempt + 1);
        }
    }

    function clickRetrieve() {
        var btn = document.querySelector('#btnRetrieve');
        if (!btn) {
            console.log(TAG, 'Botão Retrieve não encontrado!');
            return;
        }

        console.log(TAG, 'Clicando Retrieve...');
        btn.click();

        // Espera resultados carregarem (8s pra HMM que é lento)
        setTimeout(function() {
            var results = scrapeResults();
            console.log(TAG, 'Resultados:', results.length);

            if (results.length === 0) {
                // ZERO RESULTADOS — tenta próxima opção do autocomplete From
                console.log(TAG, '=== 0 resultados! Tentando próxima opção do From ===');
                console.log(TAG, 'fromMatches disponíveis:', fromMatches.length, '| fromMatchIndex atual:', fromMatchIndex);

                if (fromMatchIndex + 1 < fromMatches.length) {
                    fromMatchIndex++;
                    console.log(TAG, 'Tentando From match #' + fromMatchIndex + ':', fromMatches[fromMatchIndex].text);

                    // Aprende que esta opção não funcionou
                    // Tenta de novo com o próximo match
                    setTimeout(function() {
                        var fromInput = document.querySelector('#srchPointFrom');
                        var toInput = document.querySelector('#srchPointTo');
                        if (fromInput && toInput) {
                            clearAllFields();
                            setTimeout(function() {
                                fillAutocomplete(fromInput, currentState.from, currentState.from, 'from', function() {
                                    setTimeout(function() {
                                        fillAutocomplete(toInput, currentState.to, currentState.to, 'to', function() {
                                            setTimeout(function() {
                                                clickRetrieve();
                                            }, 1000);
                                        });
                                    }, 1000);
                                });
                            }, 500);
                        }
                    }, 1000);
                    return;
                }

                // Também tenta próxima opção do To
                if (toMatchIndex + 1 < toMatches.length) {
                    toMatchIndex++;
                    fromMatchIndex = 0; // Reset from
                    console.log(TAG, 'Tentando To match #' + toMatchIndex + ':', toMatches[toMatchIndex].text);

                    setTimeout(function() {
                        var fromInput = document.querySelector('#srchPointFrom');
                        var toInput = document.querySelector('#srchPointTo');
                        if (fromInput && toInput) {
                            clearAllFields();
                            setTimeout(function() {
                                fillAutocomplete(fromInput, currentState.from, currentState.from, 'from', function() {
                                    setTimeout(function() {
                                        fillAutocomplete(toInput, currentState.to, currentState.to, 'to', function() {
                                            setTimeout(function() {
                                                clickRetrieve();
                                            }, 1000);
                                        });
                                    }, 1000);
                                });
                            }, 500);
                        }
                    }, 1000);
                    return;
                }

                // Todas as combinações esgotadas
                console.log(TAG, 'Todas as combinações esgotadas, 0 resultados');
                chrome.runtime.sendMessage({
                    action: 'hmm_schedule_results',
                    results: []
                });
            } else {
                // TEM RESULTADOS! Aprende qual opção funcionou
                var successFrom = fromMatches[fromMatchIndex];
                if (successFrom) {
                    savePortMemory(currentState.from.toUpperCase(), successFrom.text.split('[')[0].trim());
                    console.log(TAG, 'Aprendeu From:', currentState.from, '→', successFrom.text);
                }

                chrome.runtime.sendMessage({
                    action: 'hmm_schedule_results',
                    results: results
                });
            }
        }, 8000);
    }

    function scrapeResults() {
        var results = [];

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

            var vessel = vesselCol >= 0 && cells[vesselCol] ? cells[vesselCol].textContent.trim() : '';
            var transitTime = transitCol >= 0 && cells[transitCol] ? cells[transitCol].textContent.trim() : '';

            var etd = '';
            var eta = '';
            for (var c = 0; c < cells.length; c++) {
                var cellText = cells[c].textContent || '';
                var etdMatch = cellText.match(/ETD\s*[:\s]?\s*(\d{4}-\d{2}-\d{2})/);
                var etaMatch = cellText.match(/ET[AB]\s*[:\s]?\s*(\d{4}-\d{2}-\d{2})/);
                if (etdMatch && !etd) etd = etdMatch[1];
                if (etaMatch && !eta) eta = etaMatch[1];
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

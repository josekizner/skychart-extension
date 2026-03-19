// HMM Schedule + Tracking Scraper - Content Script
// Roda em https://www.hmm21.com/*
// Schedule: modelo híbrido DOM + Gemini Vision
// Tracking: preenche booking, clica Retrieve, scrapa resultado

(function() {
    'use strict';
    var TAG = '[HMM Scraper]';
    var MAX_RETRIES = 3;
    console.log(TAG, 'Script carregado em:', window.location.pathname);

    // ========================================================================
    // TRACKING MODE — Detecta se está na página Track & Trace
    // ========================================================================
    var isTrackingPage = window.location.pathname.indexOf('trackNTrace') >= 0 || 
                         window.location.pathname.indexOf('TrackNTrace') >= 0;

    if (isTrackingPage) {
        console.log(TAG, 'Modo TRACKING ativo');
        
        // Verifica se tem booking pendente no storage
        chrome.storage.local.get('hmmPendingBooking', function(data) {
            var booking = data.hmmPendingBooking;
            if (booking) {
                console.log(TAG, 'Booking pendente encontrado:', booking);
                chrome.storage.local.remove('hmmPendingBooking');
                setTimeout(function() { startTrackingSearch(booking); }, 2000);
            } else {
                console.log(TAG, 'Sem booking pendente, aguardando mensagem...');
            }
        });

        // Backup: recebe booking via mensagem direta
        chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
            if (msg.action === 'hmm_search_booking') {
                console.log(TAG, 'Booking recebido via mensagem:', msg.booking);
                startTrackingSearch(msg.booking);
                sendResponse({ status: 'started' });
            }
        });
    }

    function startTrackingSearch(booking) {
        console.log(TAG, 'Iniciando busca de tracking para:', booking);

        // Scanner confirmou: input[name="srchBkgNo1"] é o campo de booking
        var bookingInput = document.querySelector('input[name="srchBkgNo1"]');
        if (!bookingInput) {
            console.log(TAG, 'Campo srchBkgNo1 não encontrado, aguardando...');
            setTimeout(function() { startTrackingSearch(booking); }, 1000);
            return;
        }

        // Preenche o booking character by character
        bookingInput.focus();
        bookingInput.value = '';
        var i = 0;
        var interval = setInterval(function() {
            if (i >= booking.length) {
                clearInterval(interval);
                bookingInput.dispatchEvent(new Event('input', { bubbles: true }));
                bookingInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(TAG, 'Booking preenchido:', bookingInput.value);

                // Clica Retrieve (scanner confirmou: button.btn.line.medium com texto "Retrieve")
                setTimeout(function() { clickTrackingRetrieve(booking); }, 1000);
                return;
            }
            bookingInput.value += booking[i];
            bookingInput.dispatchEvent(new Event('input', { bubbles: true }));
            i++;
        }, 50);
    }

    function clickTrackingRetrieve(booking) {
        var retrieveBtn = null;
        var btns = document.querySelectorAll('button');
        for (var b = 0; b < btns.length; b++) {
            if ((btns[b].textContent || '').trim() === 'Retrieve') {
                retrieveBtn = btns[b];
                break;
            }
        }

        if (!retrieveBtn) {
            console.log(TAG, 'Botão Retrieve não encontrado!');
            sendTrackingResult(null, 'Botão Retrieve não encontrado');
            return;
        }

        console.log(TAG, 'Clicando Retrieve...');
        retrieveBtn.click();

        // HMM é lento — espera até 15s pelos resultados
        waitForTrackingResults(booking, 0);
    }

    function waitForTrackingResults(booking, attempts) {
        if (attempts > 15) {
            console.log(TAG, 'Timeout esperando resultados');
            sendTrackingResult(null, 'Timeout esperando resultados de tracking');
            return;
        }

        setTimeout(function() {
            var result = scrapeTrackingResults(booking);
            if (result) {
                console.log(TAG, 'Tracking data extraída!', result);
                sendTrackingResult(result, null);
            } else {
                // Verifica se tem mensagem de erro
                var errorMsg = document.querySelector('.no-data, .noData, .alert-danger, .error');
                if (errorMsg) {
                    sendTrackingResult(null, 'HMM: ' + (errorMsg.textContent || '').trim().substring(0, 200));
                    return;
                }
                waitForTrackingResults(booking, attempts + 1);
            }
        }, 1000);
    }

    function scrapeTrackingResults(booking) {
        // Busca tabela de resultados
        var tables = document.querySelectorAll('table');
        var resultTable = null;

        for (var t = 0; t < tables.length; t++) {
            var ths = tables[t].querySelectorAll('th');
            for (var h = 0; h < ths.length; h++) {
                var thText = (ths[h].textContent || '').trim();
                if (thText.indexOf('POL') >= 0 || thText.indexOf('Vessel') >= 0 ||
                    thText.indexOf('Status') >= 0 || thText.indexOf('Container') >= 0 ||
                    thText.indexOf('ETA') >= 0 || thText.indexOf('ETD') >= 0) {
                    resultTable = tables[t];
                    break;
                }
            }
            if (resultTable) break;
        }

        if (!resultTable) {
            // Tenta outros padrões de dados
            var allText = document.body.innerText || '';
            if (allText.indexOf(booking) < 0 && allText.indexOf('No data') >= 0) {
                sendTrackingResult(null, 'Booking não encontrado no HMM');
                return null;
            }
            return null; // Ainda carregando
        }

        var rows = resultTable.querySelectorAll('tbody tr, tr');
        console.log(TAG, 'Tabela encontrada:', rows.length, 'linhas');

        var headers = [];
        var headerEls = resultTable.querySelectorAll('th');
        for (var hi = 0; hi < headerEls.length; hi++) {
            headers.push((headerEls[hi].textContent || '').trim());
        }

        var data = {
            booking: booking,
            container: '',
            vessel: '',
            voyage: '',
            pol: '',
            pod: '',
            etd: '',
            eta: '',
            status: '',
            moves: [],
            source: 'hmm'
        };

        // Extrai dados das linhas
        for (var r = 0; r < rows.length && r < 20; r++) {
            var cells = rows[r].querySelectorAll('td');
            if (cells.length < 2) continue;

            var rowData = {};
            for (var c = 0; c < cells.length && c < headers.length; c++) {
                rowData[headers[c]] = (cells[c].textContent || '').trim();
            }

            // Extrai campos principais da primeira linha de dados
            if (!data.container) {
                data.container = rowData['Container No.'] || rowData['CNTR No.'] || rowData['Container'] || '';
                data.vessel = rowData['Vessel'] || rowData['VSL'] || '';
                data.voyage = rowData['Voyage'] || rowData['VOY'] || '';
                data.pol = rowData['POL'] || rowData['From'] || rowData['Loading'] || '';
                data.pod = rowData['POD'] || rowData['To'] || rowData['Discharge'] || '';
                data.etd = rowData['ETD'] || rowData['Departure'] || '';
                data.eta = rowData['ETA'] || rowData['Arrival'] || '';
                data.status = rowData['Status'] || rowData['Last Status'] || '';
            }

            // Adiciona como move
            var moveDate = rowData['Date'] || rowData['ETD'] || rowData['ETA'] || '';
            var moveStatus = rowData['Status'] || rowData['Event'] || rowData['Move'] || '';
            var moveLocation = rowData['Location'] || rowData['Place'] || rowData['Port'] || rowData['POL'] || rowData['POD'] || '';
            if (moveDate || moveStatus) {
                data.moves.push({
                    date: moveDate,
                    status: moveStatus,
                    location: moveLocation,
                    vessel: rowData['Vessel'] || rowData['VSL'] || ''
                });
            }
        }

        // Extrai de texto da página se tabela não tinha certos campos
        if (!data.container) {
            var cntrMatch = (document.body.innerText || '').match(/(?:CNTR|Container)[:\s]*([A-Z]{4}\d{7})/i);
            if (cntrMatch) data.container = cntrMatch[1];
        }

        return (data.container || data.vessel || data.moves.length > 0) ? data : null;
    }

    function sendTrackingResult(data, error) {
        chrome.runtime.sendMessage({
            action: 'hmmTrackingData',
            data: data,
            error: error
        });
        console.log(TAG, error ? 'ERRO: ' + error : 'Dados enviados ao background');
    }

    // Se é tracking page, não prossegue pro schedule code
    if (isTrackingPage) return;
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
            var targetLi = items[selectedMatch.index];
            clickAutocompleteItem(targetLi);
            console.log(TAG, 'Item selecionado [' + matchIdx + ']:', selectedMatch.text);
            setTimeout(function() { callback(input.value); }, 800);
        } else {
            console.log(TAG, 'NENHUM MATCH! Selecionando primeiro item');
            if (items[0]) clickAutocompleteItem(items[0]);
            setTimeout(function() { callback(input.value); }, 800);
        }
    }

    // Simula click real no jQuery autocomplete (mouseenter → mousedown → mouseup → click)
    function clickAutocompleteItem(li) {
        li.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
        li.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        // jQuery autocomplete seleciona no mouseenter, depois confirma no click
        setTimeout(function() {
            li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            li.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            li.click();
        }, 100);
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

        // Escaneia TODAS as linhas, pega até 5 resultados válidos
        // HMM usa 2 linhas por resultado (principal + detalhe), por isso temos 10 linhas pra 5 resultados
        for (var r = 0; r < rows.length && results.length < 5; r++) {
            var cells = rows[r].querySelectorAll('td');
            if (cells.length < 5) continue;

            var vessel = vesselCol >= 0 && cells[vesselCol] ? cells[vesselCol].textContent.trim() : '';
            var transitTime = transitCol >= 0 && cells[transitCol] ? cells[transitCol].textContent.trim() : '';

            // Pula linhas vazias ou sub-linhas sem dados
            if (!vessel && !transitTime) continue;

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
                // Limpa nome do navio: remove códigos [KMP], [FIL] etc
                var cleanVessel = vessel.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim();
                // Pega só o primeiro navio se tem dois (transbordo)
                var vesselParts = cleanVessel.split(/\t|\n/);
                var mainVessel = vesselParts[0] ? vesselParts[0].trim() : cleanVessel;

                results.push({
                    vessel: mainVessel,
                    etd: etd,
                    eta: eta,
                    transitTime: transitTime ? (transitTime + (transitTime.match(/dia/i) ? '' : ' dias')) : ''
                });
                console.log(TAG, 'Sailing #' + results.length + ':', mainVessel, '| ETD:', etd, '| ETA:', eta, '| TT:', transitTime);
            }
        }

        return results;
    }
})();

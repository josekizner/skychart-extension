// HMM Schedule Scraper - Content Script
// Roda em https://www.hmm21.com/e-service/general/schedule/*
// Recebe mensagem do background.js com origem/destino, preenche e scrape

(function() {
    'use strict';
    console.log('[HMM Scraper] Script carregado');

    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'hmm_search_schedule') {
            console.log('[HMM Scraper] Buscando:', msg.from, '→', msg.to);
            searchSchedule(msg.from, msg.to);
            sendResponse({ status: 'started' });
        }
        if (msg.action === 'hmm_get_results') {
            var results = scrapeResults();
            sendResponse({ results: results });
        }
    });

    function searchSchedule(from, to) {
        // Aguarda a página carregar completamente
        var checkReady = setInterval(function() {
            var fromInput = document.querySelector('#srchPointFrom');
            var toInput = document.querySelector('#srchPointTo');
            if (fromInput && toInput) {
                clearInterval(checkReady);
                fillAndSearch(fromInput, toInput, from, to);
            }
        }, 500);

        // Timeout de 10s
        setTimeout(function() { clearInterval(checkReady); }, 10000);
    }

    function fillAndSearch(fromInput, toInput, from, to) {
        console.log('[HMM Scraper] Preenchendo From:', from);
        
        // Limpa e digita origem
        fromInput.value = '';
        fromInput.focus();
        typeText(fromInput, from, function() {
            // Espera dropdown e seleciona primeiro item
            setTimeout(function() {
                var autocomplete = document.querySelector('.ac_results, .ui-autocomplete, [class*="autocomplete"]');
                if (autocomplete) {
                    var firstItem = autocomplete.querySelector('li, .ac_even, .ac_odd');
                    if (firstItem) {
                        firstItem.click();
                        console.log('[HMM Scraper] Origem selecionada:', firstItem.textContent.trim().substring(0, 40));
                    }
                } else {
                    // Tenta simular Enter
                    fromInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
                    setTimeout(function() {
                        fromInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                    }, 300);
                }

                // Agora preenche destino
                setTimeout(function() {
                    console.log('[HMM Scraper] Preenchendo To:', to);
                    toInput.value = '';
                    toInput.focus();
                    typeText(toInput, to, function() {
                        setTimeout(function() {
                            var autocomplete2 = document.querySelector('.ac_results, .ui-autocomplete, [class*="autocomplete"]');
                            if (autocomplete2) {
                                var items = autocomplete2.querySelectorAll('li, .ac_even, .ac_odd');
                                if (items.length > 0) {
                                    items[0].click();
                                    console.log('[HMM Scraper] Destino selecionado:', items[0].textContent.trim().substring(0, 40));
                                }
                            } else {
                                toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
                                setTimeout(function() {
                                    toInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                                }, 300);
                            }

                            // Clica Retrieve
                            setTimeout(function() {
                                var retrieveBtn = document.querySelector('#btnRetrieve');
                                if (retrieveBtn) {
                                    console.log('[HMM Scraper] Clicando Retrieve...');
                                    retrieveBtn.click();

                                    // Espera resultados carregarem
                                    setTimeout(function() {
                                        var results = scrapeResults();
                                        console.log('[HMM Scraper] Resultados:', results.length);
                                        // Envia resultados pro background
                                        chrome.runtime.sendMessage({
                                            action: 'hmm_schedule_results',
                                            results: results
                                        });
                                    }, 5000);
                                } else {
                                    console.log('[HMM Scraper] Botão Retrieve não encontrado');
                                }
                            }, 1000);
                        }, 1500);
                    });
                }, 1000);
            }, 1500);
        });
    }

    function typeText(input, text, callback) {
        var i = 0;
        var interval = setInterval(function() {
            if (i >= text.length) {
                clearInterval(interval);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                if (callback) callback();
                return;
            }
            input.value += text[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            i++;
        }, 50);
    }

    function scrapeResults() {
        var results = [];
        // Procura tabela de resultados
        var rows = document.querySelectorAll('.tbl_schedule tbody tr, .result-table tbody tr, table.tbl_type01 tbody tr');
        
        if (rows.length === 0) {
            // Fallback: qualquer tabela com dados de schedule
            var allTables = document.querySelectorAll('table');
            for (var t = 0; t < allTables.length; t++) {
                var ths = allTables[t].querySelectorAll('th');
                for (var h = 0; h < ths.length; h++) {
                    if ((ths[h].textContent || '').indexOf('Vessel') >= 0) {
                        rows = allTables[t].querySelectorAll('tbody tr');
                        break;
                    }
                }
                if (rows.length > 0) break;
            }
        }

        for (var r = 0; r < Math.min(rows.length, 3); r++) {
            var cells = rows[r].querySelectorAll('td');
            if (cells.length < 5) continue;

            // Tenta extrair dados — adaptar baseado na estrutura real
            var vessel = '';
            var etd = '';
            var eta = '';
            var transitTime = '';

            // Procura por texto que parece navio, datas, etc.
            for (var c = 0; c < cells.length; c++) {
                var txt = cells[c].textContent.trim();
                // Vessel geralmente é a maior string não-numérica
                if (txt.match(/^[A-Z\s]+$/) && txt.length > 5 && !vessel) {
                    vessel = txt;
                }
                // ETD/ETA: formato de data
                if (txt.match(/\d{4}-\d{2}-\d{2}/) || txt.match(/\d{2}\/\d{2}\/\d{4}/)) {
                    if (!etd) etd = txt;
                    else if (!eta) eta = txt;
                }
                // Transit time: número + dias
                if (txt.match(/^\d+$/) && parseInt(txt) < 100 && parseInt(txt) > 5) {
                    transitTime = txt + ' dias';
                }
            }

            // Se não achou por padrão, pega por posição da screenshot
            // Baseado na screenshot: Origin, Loading Port, Loading Terminal, Operator, Route, Vessel, Next Port, Discharging Port, Discharging Terminal, Destination Point, Transit Time
            if (!vessel && cells.length >= 6) {
                vessel = cells[5] ? cells[5].textContent.trim() : '';
            }
            if (!etd && cells.length >= 2) {
                // ETD está geralmente no Origin Point com "ETD: 2026-03-XX"
                var originText = cells[1] ? cells[1].textContent : '';
                var etdMatch = originText.match(/ETD\s*[:\s]?\s*(\d{4}-\d{2}-\d{2})/);
                if (etdMatch) etd = etdMatch[1];
            }
            if (!eta && cells.length >= 8) {
                var dischText = cells[7] ? cells[7].textContent : '';
                var etaMatch = dischText.match(/ET[AB]\s*[:\s]?\s*(\d{4}-\d{2}-\d{2})/);
                if (etaMatch) eta = etaMatch[1];
            }
            if (!transitTime && cells.length >= 10) {
                transitTime = cells[10] ? cells[10].textContent.trim() : '';
            }

            if (vessel || etd) {
                results.push({
                    vessel: vessel,
                    etd: etd,
                    eta: eta,
                    transitTime: transitTime
                });
                console.log('[HMM Scraper] Sailing #' + (r + 1) + ':', vessel, '| ETD:', etd, '| ETA:', eta, '| TT:', transitTime);
            }
        }

        return results;
    }
})();

/**
 * CMA CGM SCRAPER — Content script que roda em cma-cgm.com/ebusiness/tracking/*
 * 
 * Fluxo:
 * 1. Recebe booking number via chrome.storage (cmaPendingBooking)
 * 2. Preenche #Reference, clica #btnTracking
 * 3. Aguarda resultado, extrai tracking data
 * 4. Envia de volta pro background.js → Skychart
 */
(function() {
    'use strict';

    var TAG = '[CMA Scraper]';
    console.log(TAG, 'Carregado em:', window.location.href);

    // Só executa na página de tracking
    if (window.location.href.indexOf('/ebusiness/tracking') < 0) return;

    // Permission check
    chrome.storage.local.get(['enabledAgents', 'cmaPendingBooking'], function(d) {
        var agents = d.enabledAgents || ['cambio','serasa','frete','tracking','cotacao'];
        if (agents.indexOf('tracking') < 0) {
            console.log(TAG, 'Agente desabilitado pelo perfil');
            return;
        }

        var booking = d.cmaPendingBooking;
        if (!booking) {
            console.log(TAG, 'Sem booking pendente, aguardando...');
            // Listen for future bookings
            chrome.storage.onChanged.addListener(function(changes) {
                if (changes.cmaPendingBooking && changes.cmaPendingBooking.newValue) {
                    startSearch(changes.cmaPendingBooking.newValue);
                }
            });
            return;
        }

        console.log(TAG, 'Booking pendente encontrado:', booking);
        // Clear pending immediately
        chrome.storage.local.remove('cmaPendingBooking');
        startSearch(booking);
    });

    function startSearch(booking) {
        console.log(TAG, 'Iniciando busca para:', booking);

        // Wait for input to be ready
        var maxWait = 15000;
        var waited = 0;
        var interval = 500;

        var checker = setInterval(function() {
            waited += interval;
            var input = document.getElementById('Reference');
            var btn = document.getElementById('btnTracking');

            if (input && btn) {
                clearInterval(checker);
                console.log(TAG, 'Elementos encontrados, preenchendo...');
                fillAndSearch(input, btn, booking);
            } else if (waited >= maxWait) {
                clearInterval(checker);
                console.log(TAG, 'Timeout — elementos não encontrados');
                sendResult(null, 'Elementos de busca não encontrados na CMA CGM');
            }
        }, interval);
    }

    function fillAndSearch(input, btn, booking) {
        // Clear and fill input
        input.focus();
        input.value = '';

        // Type character by character (some sites need this for validation)
        var i = 0;
        var typeInterval = setInterval(function() {
            if (i >= booking.length) {
                clearInterval(typeInterval);
                // Dispatch events for Kendo UI autocomplete
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

                console.log(TAG, 'Booking preenchido:', input.value);

                // Wait a bit for any autocomplete/validation, then click Search
                setTimeout(function() {
                    // Close any autocomplete dropdown that might be blocking
                    var autocompleteList = document.getElementById('reference_listbox');
                    if (autocompleteList) {
                        autocompleteList.style.display = 'none';
                    }

                    console.log(TAG, 'Clicando Search...');
                    btn.click();

                    // Also try form submit as fallback
                    var form = btn.closest('form');
                    if (form) {
                        setTimeout(function() {
                            // Check if page changed (form submitted)
                            if (window.location.href.indexOf('/search') < 0) {
                                console.log(TAG, 'Form submit fallback');
                                form.submit();
                            }
                        }, 1000);
                    }

                    // Wait for results
                    waitForResults();
                }, 800);
                return;
            }
            input.value += booking[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            i++;
        }, 30);
    }

    function waitForResults() {
        // After form submit, page navigates to /tracking/search
        // Wait for tracking data to appear
        var maxWait = 20000;
        var waited = 0;
        var interval = 1500;

        var checker = setInterval(function() {
            waited += interval;

            var trackingData = scrapeTrackingData();

            if (trackingData && (trackingData.events.length > 0 || trackingData.bookingNumber)) {
                clearInterval(checker);
                console.log(TAG, 'Dados encontrados:', trackingData);
                sendResult(trackingData, null);
            } else if (waited >= maxWait) {
                clearInterval(checker);
                console.log(TAG, 'Timeout — nenhum dado encontrado');
                sendResult(null, 'Timeout: dados de tracking CMA CGM não carregaram');
            }
        }, interval);
    }

    function scrapeTrackingData() {
        var result = {
            bookingNumber: '',
            containerNumber: '',
            from: '',
            to: '',
            eta: '',
            events: [],
            vessel: '',
            voyage: '',
            departureDate: '',
            arrivalDate: '',
            transshipments: [],
            carrier: 'CMA CGM'
        };

        var pageText = document.body.innerText || '';

        // Check if we have tracking results (look for "Tracking details")
        if (pageText.indexOf('Tracking details') < 0 && pageText.indexOf('Booking reference') < 0) {
            return null;
        }

        // Booking reference
        var bookingEl = document.querySelector('.booking-reference, [class*="booking"] .value');
        if (!bookingEl) {
            // Try finding "Booking reference" label and its value
            var allText = pageText;
            var bookingMatch = allText.match(/Booking reference\s*\n?\s*([A-Z0-9]+)/i);
            if (bookingMatch) result.bookingNumber = bookingMatch[1];
        } else {
            result.bookingNumber = bookingEl.textContent.trim();
        }

        // Container number
        var containerMatch = pageText.match(/Container\s+([A-Z]{4}\d{7})/i);
        if (containerMatch) result.containerNumber = containerMatch[1];
        // Also try: "CMAU3608730"
        var containerMatch2 = pageText.match(/([A-Z]{4}\d{7})/);
        if (containerMatch2 && !result.containerNumber) result.containerNumber = containerMatch2[1];

        // POL / POD (From / To)
        var polMatch = pageText.match(/POL\s*\n?\s*([A-Z\s]+(?:\([A-Z]{2}\)))/i);
        var podMatch = pageText.match(/POD\s*\n?\s*([A-Z\s]+(?:\([A-Z]{2}\)))/i);
        if (polMatch) result.from = polMatch[1].trim();
        if (podMatch) result.to = podMatch[1].trim();

        // ETA / Arrival
        var etaMatch = pageText.match(/ARRIVED AT POD[\s\S]*?(\w+\s+\d{1,2}-[A-Z]+-\d{4})/i);
        if (etaMatch) result.eta = etaMatch[1];
        var etaMatch2 = pageText.match(/(\w{3}\s+\d{1,2}-[A-Z]{3}-\d{4})\s*.*\d{1,2}:\d{2}\s*(AM|PM)/i);
        if (etaMatch2) result.eta = etaMatch2[1];

        // Moves table
        var tables = document.querySelectorAll('table');
        for (var t = 0; t < tables.length; t++) {
            var ths = tables[t].querySelectorAll('th');
            var hasDate = false, hasMoves = false, hasVessel = false;
            for (var h = 0; h < ths.length; h++) {
                var thText = (ths[h].textContent || '').trim();
                if (thText === 'Date') hasDate = true;
                if (thText === 'Moves') hasMoves = true;
                if (thText.indexOf('Vessel') >= 0) hasVessel = true;
            }

            if (hasDate && (hasMoves || hasVessel)) {
                var rows = tables[t].querySelectorAll('tbody tr');
                for (var r = 0; r < rows.length; r++) {
                    var cells = rows[r].querySelectorAll('td');
                    if (cells.length < 3) continue;

                    var date = (cells[0] ? cells[0].textContent.trim() : '');
                    var moves = (cells[1] ? cells[1].textContent.trim() : '');
                    var location = (cells[2] ? cells[2].textContent.trim() : '');
                    var vesselVoyage = (cells[3] ? cells[3].textContent.trim() : '');

                    if (date || moves) {
                        var event = {
                            date: date,
                            type: moves.toLowerCase().indexOf('departure') >= 0 ? 'departure' :
                                  moves.toLowerCase().indexOf('arrival') >= 0 || moves.toLowerCase().indexOf('discharge') >= 0 ? 'arrival' :
                                  moves.toLowerCase().indexOf('loading') >= 0 || moves.toLowerCase().indexOf('container') >= 0 ? 'loading' : 'other',
                            description: moves,
                            port: location,
                            vesselName: '',
                            voyage: ''
                        };

                        // Parse vessel/voyage: "VESSEL NAME (VOYAGE)"
                        if (vesselVoyage) {
                            var vvMatch = vesselVoyage.match(/^(.+?)\s*\(([^)]+)\)/);
                            if (vvMatch) {
                                event.vesselName = vvMatch[1].trim();
                                event.voyage = vvMatch[2].trim();
                            } else {
                                event.vesselName = vesselVoyage;
                            }
                        }

                        result.events.push(event);
                    }
                }
                break; // Found the tracking table
            }
        }

        // Process for Skychart format
        if (result.events.length > 0) {
            // First departure = main vessel/voyage
            for (var e = 0; e < result.events.length; e++) {
                if (result.events[e].type === 'departure' && !result.vessel) {
                    result.vessel = result.events[e].vesselName;
                    result.voyage = result.events[e].voyage;
                    result.departureDate = result.events[e].date;
                }
                if (result.events[e].type === 'arrival') {
                    result.arrivalDate = result.events[e].date;
                }
            }

            // Transshipments: intermediate arrival+departure pairs
            var departures = result.events.filter(function(e) { return e.type === 'departure'; });
            if (departures.length > 1) {
                for (var d = 1; d < departures.length; d++) {
                    result.transshipments.push({
                        port: departures[d].port || '',
                        vesselOut: departures[d].vesselName,
                        voyageOut: departures[d].voyage,
                        departureDate: departures[d].date
                    });
                }
            }
        }

        console.log(TAG, 'Scraped:', {
            booking: result.bookingNumber,
            container: result.containerNumber,
            vessel: result.vessel,
            voyage: result.voyage,
            events: result.events.length
        });

        return result;
    }

    function sendResult(data, error) {
        chrome.runtime.sendMessage({
            action: 'cmaTrackingData',
            data: data,
            error: error
        });
        console.log(TAG, 'Resultado enviado:', data ? 'com dados' : 'erro', error || '');
    }

    // Also handle messages from background (for when page is already loaded)
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'cma_search_booking' && msg.booking) {
            console.log(TAG, 'Mensagem recebida: buscar', msg.booking);
            startSearch(msg.booking);
        }
    });
})();

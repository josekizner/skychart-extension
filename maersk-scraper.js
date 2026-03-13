/**
 * MAERSK SCRAPER — Content script que roda em maersk.com/tracking/*
 * 
 * Aguarda a timeline carregar, extrai dados de tracking,
 * e envia de volta pro background.js → Skychart
 */

(function() {
    'use strict';
    chrome.storage.local.get('enabledAgents', function(d) {
        var e = d.enabledAgents || [];
        if (e.indexOf('tracking') < 0) { console.log('[Maersk] Desabilitado'); return; }
        _initMaersk();
    });
    function _initMaersk() {

    console.log('[Maersk Scraper] Carregado em:', window.location.href);

    // Só executa se foi aberto pela extensão (via flag na URL)
    if (!window.location.href.includes('/tracking/')) return;

    // Espera a timeline renderizar (React/NextJS leva um tempo)
    var maxWait = 30000; // 30 segundos max
    var checkInterval = 1500;
    var waited = 0;

    var checker = setInterval(function() {
        waited += checkInterval;

        // Busca eventos de tracking na página
        var trackingData = scrapeTrackingData();

        if (trackingData && trackingData.events.length > 0) {
            clearInterval(checker);
            console.log('[Maersk Scraper] Dados encontrados:', trackingData);
            
            // Envia pro background.js
            chrome.runtime.sendMessage({
                action: 'maerskTrackingData',
                data: trackingData
            });
        } else if (waited >= maxWait) {
            clearInterval(checker);
            console.log('[Maersk Scraper] Timeout — nenhum dado encontrado');
            chrome.runtime.sendMessage({
                action: 'maerskTrackingData',
                data: null,
                error: 'Timeout: dados de tracking não carregaram'
            });
        }
    }, checkInterval);

    function scrapeTrackingData() {
        var result = {
            bookingNumber: '',
            from: '',
            to: '',
            eta: '',
            containerNumber: '',
            events: [],
            // Dados processados
            vessel: '',
            voyage: '',
            departureDate: '',
            arrivalDate: '',
            transshipments: []
        };

        // Booking number da URL
        var urlParts = window.location.pathname.split('/');
        result.bookingNumber = urlParts[urlParts.length - 1];

        // Header: "From XINGANG To VILA DO CONDE"
        var pageText = document.body.innerText || '';

        // Tenta extrair From/To
        var fromToMatch = pageText.match(/From\s+([A-Z\s]+?)\s+To\s+([A-Z\s]+?)(?:\n|$)/i);
        if (fromToMatch) {
            result.from = fromToMatch[1].trim();
            result.to = fromToMatch[2].trim();
        }

        // ETA
        var etaMatch = pageText.match(/Estimated arrival date\s*[:\n]\s*(\d{1,2}\s+\w+\s+\d{4}\s*\d{0,2}:?\d{0,2})/i);
        if (etaMatch) {
            result.eta = etaMatch[1].trim();
        }

        // Container
        var containerMatch = pageText.match(/([A-Z]{4}\d{7})/);
        if (containerMatch) {
            result.containerNumber = containerMatch[1];
        }

        // Eventos de rastreamento — busca todos os "Vessel departure" e "Vessel arrival"
        // Formato: "Vessel departure (MAERSK ELBA / 611W)\n15 Mar 2026 15:00"
        var vesselEvents = pageText.match(/Vessel\s+(departure|arrival)\s*\(([^)]+)\)\s*\n?\s*(\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2})/gi);
        
        if (vesselEvents) {
            for (var i = 0; i < vesselEvents.length; i++) {
                var eventMatch = vesselEvents[i].match(/Vessel\s+(departure|arrival)\s*\(([^)]+)\)\s*\n?\s*(\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2})/i);
                if (eventMatch) {
                    var vesselVoyage = eventMatch[2].split('/');
                    result.events.push({
                        type: eventMatch[1].toLowerCase(), // departure ou arrival
                        vesselName: vesselVoyage[0].trim(),
                        voyage: vesselVoyage.length > 1 ? vesselVoyage[1].trim() : '',
                        date: eventMatch[3].trim()
                    });
                }
            }
        }

        // Também tenta pegar os nomes dos portos
        // Formato: "XINGANG\nTIANJIN PORT EUROASIA...\nVessel departure..."
        var portBlocks = pageText.match(/\n\s*([A-Z][A-Z\s]{2,})\n[^\n]*\n\s*Vessel\s+(departure|arrival)/g);
        if (portBlocks) {
            for (var pb = 0; pb < portBlocks.length; pb++) {
                var portMatch = portBlocks[pb].match(/\n\s*([A-Z][A-Z\s]{2,})\n/);
                // Associa porto ao evento correspondente
                if (portMatch && pb < result.events.length) {
                    result.events[pb].port = portMatch[1].trim();
                }
            }
        }

        // Se não achou eventos com regex, tenta abordagem DOM
        if (result.events.length === 0) {
            result.events = scrapeDOMEvents();
        }

        // Processa dados para formato Skychart
        processForSkychart(result);

        return result;
    }

    function scrapeDOMEvents() {
        var events = [];
        
        // Tenta encontrar elementos de timeline da Maersk
        // A página usa componentes React, então procuramos por padrões visuais
        var allElements = document.querySelectorAll('div, span, p, li');
        
        var currentPort = '';
        for (var i = 0; i < allElements.length; i++) {
            var text = allElements[i].textContent.trim();
            
            // Detecta "Vessel departure (NAVIO / VIAGEM)" ou "Vessel arrival (NAVIO / VIAGEM)"
            var vesselMatch = text.match(/^Vessel\s+(departure|arrival)\s*\(([^)]+)\)$/i);
            if (vesselMatch) {
                var vesselVoyage = vesselMatch[2].split('/');
                var nextEl = allElements[i].nextElementSibling || allElements[i + 1];
                var dateText = nextEl ? nextEl.textContent.trim() : '';
                var dateMatch = dateText.match(/(\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2})/);
                
                events.push({
                    type: vesselMatch[1].toLowerCase(),
                    vesselName: vesselVoyage[0].trim(),
                    voyage: vesselVoyage.length > 1 ? vesselVoyage[1].trim() : '',
                    date: dateMatch ? dateMatch[1] : dateText,
                    port: currentPort
                });
            }
            
            // Detecta nome de porto (texto em maiúsculas sozinho)
            if (/^[A-Z\s]{4,}$/.test(text) && text.length < 40) {
                currentPort = text;
            }
        }
        
        return events;
    }

    function processForSkychart(result) {
        if (result.events.length === 0) return;

        // Primeiro departure = navio e viagem principal
        var firstDeparture = null;
        var lastArrival = null;

        for (var i = 0; i < result.events.length; i++) {
            if (result.events[i].type === 'departure' && !firstDeparture) {
                firstDeparture = result.events[i];
            }
            if (result.events[i].type === 'arrival') {
                lastArrival = result.events[i];
            }
        }

        if (firstDeparture) {
            result.vessel = firstDeparture.vesselName;
            result.voyage = firstDeparture.voyage;
            result.departureDate = firstDeparture.date;
        }

        if (lastArrival) {
            result.arrivalDate = lastArrival.date;
        }

        // Transshipments: todos os portos intermediários (entre primeiro departure e último arrival)
        var departures = result.events.filter(function(e) { return e.type === 'departure'; });
        var arrivals = result.events.filter(function(e) { return e.type === 'arrival'; });

        // Se tem mais de 1 departure, tem transbordo
        if (departures.length > 1) {
            for (var t = 0; t < arrivals.length; t++) {
                // Pula o último arrival (é o destino final)
                if (t === arrivals.length - 1 && arrivals.length > 1) continue;
                // Pega o arrival e o próximo departure do mesmo porto
                var arrivalEvent = arrivals[t];
                var nextDep = departures.length > t + 1 ? departures[t + 1] : null;

                if (arrivalEvent && t > 0) { // Pula o primeiro se for a origem
                    result.transshipments.push({
                        port: arrivalEvent.port || '',
                        vesselIn: arrivalEvent.vesselName,
                        voyageIn: arrivalEvent.voyage,
                        arrivalDate: arrivalEvent.date,
                        vesselOut: nextDep ? nextDep.vesselName : '',
                        voyageOut: nextDep ? nextDep.voyage : '',
                        departureDate: nextDep ? nextDep.date : ''
                    });
                }
            }
        }

        console.log('[Maersk Scraper] Processado:', {
            vessel: result.vessel,
            voyage: result.voyage,
            departure: result.departureDate,
            arrival: result.arrivalDate,
            transshipments: result.transshipments.length
        });
    }
} })();

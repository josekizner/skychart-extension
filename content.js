/**
 * SKYCHART AI — Content Script Principal
 * 
 * Orquestra: HUD + PDF upload/leitura + SmartAgent + DebugPanel
 * Toda lógica de interação com campos está em smart-agent.js
 * Configuração de campos está em modules/cambio.json
 */

try {
    // GUARD: Não roda NADA em páginas de PDF/arquivo (evita câmbio ativar na aba do PDF Serasa)
    if (location.href.indexOf('/arquivos/') >= 0 || location.href.match(/\.pdf$/i)) {
        console.log("Skychart AI: Página de arquivo/PDF, ignorando.");
        throw new Error('SKIP_PDF_PAGE');
    }

    console.log("Skychart AI: Script carregado com sucesso.");

    // Listener para notificações de atualização, tracking data e navegacao
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'updateAvailable') {
            showToast(' Nova versão ' + msg.newVersion + ' disponível! Peça ao admin para atualizar. ' + (msg.changelog || ''), 'warning', 15000);
        }
        if (msg.action === 'trackingDataReady') {
            handleTrackingData(msg.data, msg.error);
        }
        // Navegacao SPA: email agent pede pra ir pra oferta
        if (msg.action === 'navigateToOferta') {
            console.log('[Atom] Navegando pra ofertas via SPA hash...');
            window.location.hash = '#/app/oferta';
            
            // Espera a pagina renderizar e processa cotacao pendente
            setTimeout(function() {
                chrome.storage.local.get('pendingQuotation', function(data) {
                    if (!data.pendingQuotation) {
                        console.log('[Atom] Sem cotacao pendente');
                        return;
                    }
                    var quote = data.pendingQuotation;
                    console.log('[Atom] Cotacao pendente encontrada:', quote);
                    window._atomQuote = quote;
                    
                    processOfertaFromEmail(quote);
                });
            }, 2000);
        }

        // Navegacao SPA: booking agent pede pra ir pra operacional
        if (msg.action === 'navigateToBooking') {
            console.log('[Atom Booking] Navegando pra operacional via SPA hash...');
            window.location.hash = '#/app/operacional';

            setTimeout(function() {
                chrome.storage.local.get('pendingBooking', function(data) {
                    if (!data.pendingBooking) {
                        console.log('[Atom Booking] Sem booking pendente');
                        return;
                    }
                    var booking = data.pendingBooking;
                    console.log('[Atom Booking] Booking pendente encontrado:', booking);
                    chrome.storage.local.remove('pendingBooking');

                    processBookingFromEmail(booking);
                });
            }, 2000);
        }
    });

    // ========================================================================
    // EMAIL AGENT — Processa cotacao vinda do Outlook
    // ========================================================================

    function processOfertaFromEmail(quote) {
        console.log('[Atom Oferta] Processando cotacao:', quote.cliente);

        // 1. Encontra o campo Cliente/Agente (autocomplete input)
        var clienteInput = document.querySelector('p-autocomplete input, input.ui-autocomplete-input');
        if (!clienteInput) {
            var labels = document.querySelectorAll('label');
            for (var i = 0; i < labels.length; i++) {
                if (labels[i].textContent.indexOf('Cliente') >= 0) {
                    var container = labels[i].closest('.ui-g-12, .ui-field, div');
                    if (container) {
                        clienteInput = container.querySelector('input');
                        break;
                    }
                }
            }
        }

        if (!clienteInput) {
            console.log('[Atom Oferta] Campo cliente nao encontrado');
            showToast('Campo cliente nao encontrado na tela de ofertas', 'error', 5000);
            return;
        }

        var clienteName = quote.cliente || quote.empresa_remetente || '';
        console.log('[Atom Oferta] Campo cliente encontrado, digitando:', clienteName);

        // Mesmo metodo do smart-agent.js: char-by-char com KeyboardEvents
        clienteInput.value = '';
        clienteInput.dispatchEvent(new Event('input', { bubbles: true }));
        clienteInput.focus();
        clienteInput.click();

        var idx = 0;
        var timer = setInterval(function() {
            if (idx < clienteName.length) {
                clienteInput.value += clienteName[idx];
                clienteInput.dispatchEvent(new Event('input', { bubbles: true }));
                clienteInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: clienteName[idx] }));
                clienteInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: clienteName[idx] }));
                idx++;
            } else {
                clearInterval(timer);
                console.log('[Atom Oferta] Nome digitado, forçando dropdown com ArrowDown...');

                // ArrowDown pra forçar o dropdown abrir (igual smart-agent.js)
                clienteInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
                clienteInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowDown' }));

                // Espera o dropdown aparecer (polling igual smart-agent.js)
                waitAndSelectClient(0, clienteInput, quote);
            }
        }, 60);
    }

    function waitAndSelectClient(attempt, input, quote) {
        if (attempt >= 25) {
            console.log('[Atom Oferta] Autocomplete nao abriu apos', attempt, 'tentativas');
            showToast('Dropdown de clientes nao apareceu. Selecione manualmente.', 'warning', 5000);
            return;
        }

        setTimeout(function() {
            var panels = document.querySelectorAll('.ui-autocomplete-panel, .p-autocomplete-panel, .ui-autocomplete-items');
            for (var p = 0; p < panels.length; p++) {
                if (panels[p].offsetHeight > 0) {
                    var items = panels[p].querySelectorAll('li');
                    if (items.length > 0) {
                        items[0].click();
                        console.log('[Atom Oferta] Cliente selecionado:', items[0].textContent.trim());
                        setTimeout(function() { clickNovaOferta(quote); }, 1000);
                        return;
                    }
                }
            }
            waitAndSelectClient(attempt + 1, input, quote);
        }, 600);
    }

    function clickNovaOferta(quote) {
        var buttons = document.querySelectorAll('button, .ui-button');
        var novaOfertaBtn = null;

        for (var i = 0; i < buttons.length; i++) {
            var text = buttons[i].textContent.trim().toLowerCase();
            if (text.indexOf('nova oferta') >= 0) {
                novaOfertaBtn = buttons[i];
                break;
            }
        }

        if (novaOfertaBtn) {
            console.log('[Atom Oferta] Clicando em Nova oferta...');
            novaOfertaBtn.click();
            
            // Espera modal de selecao de produto aparecer
            if (quote && quote.modal_tipo) {
                console.log('[Atom Oferta] Esperando modal pra selecionar:', quote.modal_tipo);
                setTimeout(function() { selectModalTipo(quote.modal_tipo, 0); }, 1000);
            }
        } else {
            console.log('[Atom Oferta] Botao Nova oferta nao encontrado');
            showToast('Botao "Nova oferta" nao encontrado.', 'warning', 5000);
        }
    }

    function selectModalTipo(modalTipo, attempt) {
        if (attempt >= 15) {
            console.log('[Atom Oferta] Modal de produto nao apareceu');
            showToast('Selecione o tipo de produto manualmente.', 'warning', 5000);
            return;
        }

        function normalize(str) {
            return (str || '').toLowerCase()
                .replace(/ã/g, 'a').replace(/á/g, 'a').replace(/â/g, 'a')
                .replace(/é/g, 'e').replace(/ê/g, 'e')
                .replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ô/g, 'o')
                .replace(/ú/g, 'u').replace(/ç/g, 'c')
                .trim();
        }

        var targetNorm = normalize(modalTipo);
        
        var allButtons = document.querySelectorAll('.ui-button-text, button, .ui-button');
        for (var i = 0; i < allButtons.length; i++) {
            var btnText = normalize(allButtons[i].textContent);
            if (btnText === targetNorm || btnText.indexOf(targetNorm) >= 0) {
                console.log('[Atom Oferta] Modal tipo encontrado:', allButtons[i].textContent.trim());
                allButtons[i].click();

                // Espera tela de oferta carregar e preenche campos obrigatorios
                setTimeout(function() {
                    fillOfertaFields();
                }, 2000);
                return;
            }
        }

        setTimeout(function() { selectModalTipo(modalTipo, attempt + 1); }, 500);
    }

    // Preenche campos obrigatorios da oferta (Modalidade de Frete e Incoterm)
    function fillOfertaFields() {
        chrome.storage.local.get('pendingQuotation', function(data) {
            // Se ja foi removido, pega do que foi salvo antes
            var quote = data.pendingQuotation || window._atomQuote || {};
            
            // Determina modalidade de frete
            var modalidade = 'FCL'; // default pra maritimo com container
            if (quote.equipamento && quote.equipamento.toLowerCase().indexOf('lcl') >= 0) {
                modalidade = 'LCL';
            }

            var incoterm = quote.incoterm || 'FOB';

            console.log('[Atom Oferta] Preenchendo: Modalidade=' + modalidade + ', Incoterm=' + incoterm);

            // 1. Preenche Modalidade de Frete
            var modalidadeInput = document.getElementById('cdModalidadeFrete');
            if (modalidadeInput) {
                fillAutocompleteById('cdModalidadeFrete', modalidade, function() {
                    // 2. Preenche Incoterm
                    setTimeout(function() {
                        fillAutocompleteById('cdIncoterm-oferta', incoterm, function() {
                            // 3. Preenche Pricing (Paulo Zanella pra marítimo)
                            setTimeout(function() {
                                fillAutocompleteById('cdPricing', 'Paulo Zanella', function() {
                                    // 4. Preenche Referência Cliente (processo_ref)
                                    setTimeout(function() {
                                        if (quote.processo_ref) {
                                            fillPlainInput('formularioIdentificacao-dsReferenciaPessoa', quote.processo_ref);
                                        }
                                        // 5. Clica em Cadastrar
                                        setTimeout(function() {
                                            clickButtonByText('Cadastrar');
                                            console.log('[Atom Oferta] Cadastrado!');

                                            // 6. Lê Acordo Comercial e salva regras
                                            setTimeout(function() {
                                                readAcordoComercial(quote);

                                                // 7. Clica em Adicionar rota via tarifário
                                                setTimeout(function() {
                                                    clickButtonByText('Adicionar rota via tarifário');
                                                    console.log('[Atom Oferta] Adicionar rota via tarifário clicado!');

                                                    // 8. Preenche Origem e Destino nos multiselects
                                                    setTimeout(function() {
                                                        fillTarifarioOrigemDestino(quote);
                                                    }, 2000);
                                                }, 2000);
                                            }, 3000);
                                        }, 1000);
                                    }, 500);
                                });
                            }, 1500);
                        });
                    }, 1500);
                });
            } else {
                console.log('[Atom Oferta] Campo Modalidade nao encontrado');
            }
        });
    }

    // ========================================================================
    // BOOKING AGENT — Processa booking vindo do Outlook
    // ========================================================================

    async function processBookingFromEmail(booking) {
        console.log('[Atom Booking] Processando booking:', booking.processo);
        showToast('Booking Agent: Buscando processo ' + booking.processo + '...', 'info', 5000);

        // ===== 1. Ctrl+Space → abre busca flutuante =====
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: ' ', code: 'Space', keyCode: 32, ctrlKey: true, bubbles: true
        }));
        await delay(800);

        // ===== 2. Digita o numero do processo na busca =====
        var searchInput = document.querySelector('#floating-search');
        if (!searchInput) {
            // Retry: tenta novamente o Ctrl+Space
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: ' ', code: 'Space', keyCode: 32, ctrlKey: true, bubbles: true
            }));
            await delay(1500);
            searchInput = document.querySelector('#floating-search');
        }

        if (!searchInput) {
            showToast('Erro: Campo de busca nao abriu. Pressione Ctrl+Space manualmente.', 'error', 8000);
            return;
        }

        searchInput.focus();
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(300);

        // Digita char-by-char para ativar o autocomplete Angular
        var processo = booking.processo || '';
        for (var ci = 0; ci < processo.length; ci++) {
            searchInput.value += processo[ci];
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: processo[ci], bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: processo[ci], bubbles: true }));
            await delay(80);
        }

        showToast('Buscando processo ' + processo + '...', 'info', 3000);
        await delay(2000);

        // ===== 3. Seleciona o resultado do dropdown =====
        var matchFound = false;
        var dropdownItems = document.querySelectorAll('.autocomplete-list li, .pesquisa-overlay li, span.match');
        for (var di = 0; di < dropdownItems.length; di++) {
            var itemText = dropdownItems[di].textContent || '';
            if (itemText.indexOf(processo) >= 0) {
                console.log('[Atom Booking] Match encontrado:', itemText);
                dropdownItems[di].click();

                // Se é um span.match, clica no pai (li)
                var parentLi = dropdownItems[di].closest('li');
                if (parentLi) parentLi.click();

                matchFound = true;
                break;
            }
        }

        if (!matchFound) {
            showToast('Processo ' + processo + ' nao encontrado no dropdown. Selecione manualmente.', 'warning', 8000);
            return;
        }

        showToast('Processo encontrado! Abrindo...', 'success', 3000);
        await delay(3000);

        // ===== 4. Abre a aba Embarque (mesmo padrão que check-agent/Serasa) =====
        var embarqueOpened = false;
        var allAccSpans = document.querySelectorAll('span.ui-accordion-header-text');
        for (var ah = 0; ah < allAccSpans.length; ah++) {
            var spanText = allAccSpans[ah].textContent.trim();
            if (spanText.indexOf('Embarque') >= 0) {
                var clickable = allAccSpans[ah].closest('a, .ui-accordion-header') || allAccSpans[ah];
                console.log('[Atom Booking] Clicando em Embarque (' + clickable.tagName + ')...');
                clickable.click();
                embarqueOpened = true;
                break;
            }
        }

        if (!embarqueOpened) {
            showToast('Aba Embarque nao encontrada. Abra manualmente.', 'warning', 8000);
        }

        await delay(2000);

        // ===== 5. Preenche os campos do Embarque =====
        showToast('Preenchendo campos do embarque...', 'info', 5000);

        // 5a. Booking (Reserva)
        var bookingInput = document.querySelector('#formularioEmbarque-dsReserva');
        if (bookingInput && booking.booking_number) {
            console.log('[Atom Booking] Preenchendo booking:', booking.booking_number);
            bookingInput.focus();
            bookingInput.value = booking.booking_number;
            bookingInput.dispatchEvent(new Event('input', { bubbles: true }));
            bookingInput.dispatchEvent(new Event('change', { bubbles: true }));
            bookingInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
            bookingInput.dispatchEvent(new Event('blur', { bubbles: true }));
            if (typeof SkAgent !== 'undefined') SkAgent.highlight(bookingInput);
            console.log('[Atom Booking] Booking preenchido OK');
        }
        await delay(600);

        // 5b. Navio (autocomplete — charByChar)
        if (booking.navio && typeof SkAgent !== 'undefined' && SkAgent.engine) {
            var navioInput = null;

            // Tenta achar autocomplete de navio na seção Embarque
            var viagemRef = document.querySelector('#formularioEmbarque-dsViagem');
            if (viagemRef) {
                var embarqueSection = viagemRef.closest('.ui-accordion-content, form, .ui-panel-content');
                if (embarqueSection) {
                    var acInputs = embarqueSection.querySelectorAll('input.ui-autocomplete-input');
                    if (acInputs.length > 0) navioInput = acInputs[0];
                }
            }

            if (navioInput) {
                console.log('[Atom Booking] Preenchendo navio:', booking.navio);
                var r1 = await SkAgent.engine.charByChar(navioInput, booking.navio, { selectFirst: true, tabAfter: true });
                if (r1.ok) {
                    console.log('[Atom Booking] Navio preenchido OK');
                } else {
                    console.log('[Atom Booking] Navio falhou:', r1.reason);
                }
            }
            await delay(600);
        }

        // 5c. Viagem
        if (booking.viagem) {
            var viagemInput = document.querySelector('#formularioEmbarque-dsViagem');
            if (viagemInput) {
                console.log('[Atom Booking] Preenchendo viagem:', booking.viagem);
                viagemInput.focus();
                viagemInput.click();
                if (typeof SkAgent !== 'undefined') {
                    SkAgent.engine.nativeSet(viagemInput, booking.viagem);
                } else {
                    viagemInput.value = booking.viagem;
                    viagemInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                viagemInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
                viagemInput.dispatchEvent(new Event('blur', { bubbles: true }));
                if (typeof SkAgent !== 'undefined') SkAgent.highlight(viagemInput);
                console.log('[Atom Booking] Viagem preenchida OK');
            }
            await delay(600);
        }

        // 5d. ETD (Previsao Embarque)
        if (booking.etd) {
            var etdInput = document.querySelector('#formularioEmbarque-dtPrevisaoEmbarque');
            if (etdInput) {
                console.log('[Atom Booking] Preenchendo ETD:', booking.etd);
                if (typeof SkAgent !== 'undefined' && SkAgent.engine) {
                    await SkAgent.engine.charByChar(etdInput, booking.etd, { selectFirst: false, tabAfter: true });
                } else {
                    etdInput.focus();
                    etdInput.value = booking.etd;
                    etdInput.dispatchEvent(new Event('input', { bubbles: true }));
                    etdInput.dispatchEvent(new Event('blur', { bubbles: true }));
                }
                console.log('[Atom Booking] ETD preenchido OK');
            }
            await delay(600);
        }

        // 5e. ETA (Previsao Atracacao)
        if (booking.eta) {
            var etaInput = document.querySelector('#formularioEmbarque-dtPrevisaoAtracacao');
            if (etaInput) {
                console.log('[Atom Booking] Preenchendo ETA:', booking.eta);
                if (typeof SkAgent !== 'undefined' && SkAgent.engine) {
                    await SkAgent.engine.charByChar(etaInput, booking.eta, { selectFirst: false, tabAfter: true });
                } else {
                    etaInput.focus();
                    etaInput.value = booking.eta;
                    etaInput.dispatchEvent(new Event('input', { bubbles: true }));
                    etaInput.dispatchEvent(new Event('blur', { bubbles: true }));
                }
                console.log('[Atom Booking] ETA preenchido OK');
            }
            await delay(600);
        }

        showToast('Campos preenchidos! Iniciando cross-check Maersk...', 'success', 5000);

        // ===== 6. Cross-check Maersk =====
        if (booking.booking_number && booking.armador && booking.armador.toLowerCase().indexOf('maersk') >= 0) {
            crossCheckMaersk(booking);
        } else if (booking.booking_number) {
            // Armador nao é Maersk — apenas confirma preenchimento
            showPersistentToast(
                '✓ Booking preenchido com sucesso!',
                'Processo: ' + booking.processo + ' | Booking: ' + booking.booking_number,
                'success'
            );
        }
    }

    // Cross-check Maersk: abre tracking visível, fecha, volta, compara tudo
    function crossCheckMaersk(booking) {
        console.log('[Atom Booking] Iniciando cross-check Maersk para:', booking.booking_number);
        showToast('Cross-check: Abrindo Maersk tracking...', 'info', 8000);

        // Abre Maersk tracking visível
        chrome.runtime.sendMessage({
            action: 'openMaerskTracking',
            bookingNumber: booking.booking_number
        });

        // Escuta resultado do tracking
        var crossCheckHandler = function(msg) {
            if (msg.action !== 'trackingDataReady') return;
            chrome.runtime.onMessage.removeListener(crossCheckHandler);

            // Auto-fechar aba Maersk e voltar pro Skychart
            chrome.storage.local.get(['crossCheckMaerskTab', 'crossCheckSkychartTab'], function(tabs) {
                if (tabs.crossCheckMaerskTab) {
                    // Aguarda 2s pra analista ver o resultado na Maersk
                    setTimeout(function() {
                        chrome.runtime.sendMessage({ action: 'closeMaerskAndReturn', maerskTab: tabs.crossCheckMaerskTab, skychartTab: tabs.crossCheckSkychartTab });
                    }, 2000);
                }
            });

            if (msg.error || !msg.data || !msg.data.events || msg.data.events.length === 0) {
                showPersistentToast(
                    '⚠ Cross-check Maersk: Sem dados de tracking',
                    'Booking ' + booking.booking_number + ' — dados de tracking nao disponiveis no site da Maersk.',
                    'warning'
                );
                return;
            }

            var maersk = msg.data;

            // Lê valores ATUAIS do sistema (o que realmente está nos campos)
            var sysViagem = '';
            var sysETD = '';
            var sysETA = '';
            var sysViagemEl = document.querySelector('#formularioEmbarque-dsViagem');
            var sysETDEl = document.querySelector('#formularioEmbarque-dtPrevisaoEmbarque');
            var sysETAEl = document.querySelector('#formularioEmbarque-dtPrevisaoAtracacao');
            if (sysViagemEl) sysViagem = sysViagemEl.value || '';
            if (sysETDEl) sysETD = sysETDEl.value || '';
            if (sysETAEl) sysETA = sysETAEl.value || '';

            // Converte datas Maersk pro formato DD/MM/YYYY
            function convertDate(dateStr) {
                if (!dateStr) return '';
                var months = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
                var match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
                if (match) return match[1].padStart(2, '0') + '/' + (months[match[2]] || '01') + '/' + match[3];
                return dateStr;
            }

            var maerskETD = convertDate(maersk.departureDate);
            var maerskETA = convertDate(maersk.arrivalDate);

            // Triple comparison: Email vs Sistema vs Maersk
            var checks = [];
            var allOk = true;

            // Viagem
            var emailViagem = booking.viagem || '—';
            var mkViagem = maersk.voyage || '—';
            var viagemOk = (!booking.viagem && !maersk.voyage) ||
                          (sysViagem && (sysViagem === mkViagem || !mkViagem || mkViagem === '—'));
            checks.push({ label: 'Viagem', email: emailViagem, sistema: sysViagem || '—', maersk: mkViagem, ok: viagemOk });
            if (!viagemOk) allOk = false;

            // Navio
            var emailNavio = booking.navio || '—';
            var mkNavio = maersk.vessel || '—';
            var navioOk = !maersk.vessel || !booking.navio ||
                          booking.navio.toUpperCase().indexOf(maersk.vessel.toUpperCase()) >= 0 ||
                          maersk.vessel.toUpperCase().indexOf(booking.navio.toUpperCase()) >= 0;
            checks.push({ label: 'Navio', email: emailNavio, sistema: '(autocomplete)', maersk: mkNavio, ok: navioOk });
            if (!navioOk) allOk = false;

            // ETD
            var emailETD = booking.etd || '—';
            var etdOk = !maerskETD || !sysETD || sysETD === maerskETD;
            checks.push({ label: 'ETD', email: emailETD, sistema: sysETD || '—', maersk: maerskETD || '—', ok: etdOk });
            if (!etdOk) allOk = false;

            // ETA
            var emailETA = booking.eta || '—';
            var etaOk = !maerskETA || !sysETA || sysETA === maerskETA;
            checks.push({ label: 'ETA', email: emailETA, sistema: sysETA || '—', maersk: maerskETA || '—', ok: etaOk });
            if (!etaOk) allOk = false;

            // Monta HTML da tabela de comparação
            var tableRows = '';
            for (var i = 0; i < checks.length; i++) {
                var chk = checks[i];
                var rowColor = chk.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.15)';
                var icon = chk.ok ? '✓' : '✗';
                var iconColor = chk.ok ? '#86efac' : '#fca5a5';
                tableRows += '<tr style="background:' + rowColor + '">' +
                    '<td style="padding:4px 8px;color:' + iconColor + ';font-weight:bold;">' + icon + '</td>' +
                    '<td style="padding:4px 8px;color:#e2e8f0;font-weight:600;">' + chk.label + '</td>' +
                    '<td style="padding:4px 8px;color:#94a3b8;">' + chk.email + '</td>' +
                    '<td style="padding:4px 8px;color:#c4b5fd;">' + chk.sistema + '</td>' +
                    '<td style="padding:4px 8px;color:#7dd3fc;">' + chk.maersk + '</td>' +
                    '</tr>';
            }

            var html = '<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:Segoe UI,sans-serif;">' +
                '<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">' +
                '<th style="padding:4px 8px;"></th>' +
                '<th style="padding:4px 8px;color:#94a3b8;text-align:left;">Campo</th>' +
                '<th style="padding:4px 8px;color:#94a3b8;text-align:left;">Email</th>' +
                '<th style="padding:4px 8px;color:#c4b5fd;text-align:left;">Sistema</th>' +
                '<th style="padding:4px 8px;color:#7dd3fc;text-align:left;">Maersk</th>' +
                '</tr>' + tableRows + '</table>';

            var title = allOk
                ? '✓ Cross-check: Email × Sistema × Maersk — TUDO OK!'
                : '✗ Cross-check: DIVERGÊNCIAS ENCONTRADAS!';

            showPersistentToast(title, html, allOk ? 'success' : 'error');
        };

        chrome.runtime.onMessage.addListener(crossCheckHandler);

        // Timeout de 45s
        setTimeout(function() {
            chrome.runtime.onMessage.removeListener(crossCheckHandler);
        }, 45000);
    }

    // Toast persistente premium — modal centralizado, impossível de perder
    function showPersistentToast(title, message, type) {
        var styles = {
            success: { bg: '#0f1f0f', border: '#2ecc71', titleBg: 'linear-gradient(135deg, #1B5E20, #2ecc71)' },
            warning: { bg: '#1f1a0f', border: '#f39c12', titleBg: 'linear-gradient(135deg, #E65100, #f39c12)' },
            error:   { bg: '#1f0f0f', border: '#e74c3c', titleBg: 'linear-gradient(135deg, #B71C1C, #e74c3c)' }
        };
        var s = styles[type] || styles.success;

        // Backdrop escuro
        var backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999998;';

        // Modal centralizado
        var toastDiv = document.createElement('div');
        toastDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;width:560px;' +
            'background:' + s.bg + ';border:2px solid ' + s.border + ';border-radius:14px;' +
            'box-shadow:0 20px 60px rgba(0,0,0,0.8);font-family:Segoe UI,sans-serif;overflow:hidden;';

        var headerDiv = '<div style="background:' + s.titleBg + ';padding:14px 20px;color:white;font-weight:700;font-size:14px;">' + title + '</div>';
        var bodyDiv = '<div style="padding:16px 20px;color:#e2e8f0;">' + message + '</div>';
        var footerDiv = '<div style="padding:10px 20px 14px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">' +
            '<button style="padding:8px 32px;background:' + s.border + ';color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;">Entendido</button></div>';

        toastDiv.innerHTML = headerDiv + bodyDiv + footerDiv;

        var closeAll = function() { backdrop.remove(); toastDiv.remove(); };
        backdrop.addEventListener('click', closeAll);
        toastDiv.querySelector('button').addEventListener('click', closeAll);

        document.body.appendChild(backdrop);
        document.body.appendChild(toastDiv);
    }

    function delay(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    // Preenche input simples (nao-autocomplete)
    function fillPlainInput(inputId, value) {
        var input = document.getElementById(inputId);
        if (!input) {
            console.log('[Atom Oferta] Input simples', inputId, 'nao encontrado');
            return;
        }
        console.log('[Atom Oferta] Preenchendo simples', inputId, ':', value);
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // Clica num botao pelo texto — pega o ULTIMO match (evita toolbar)
    function clickButtonByText(text) {
        var allBtns = document.querySelectorAll('.ui-button-text, button, .ui-button, span.ui-clickable');
        var matches = [];
        for (var i = 0; i < allBtns.length; i++) {
            if (allBtns[i].textContent.trim() === text) {
                matches.push(allBtns[i]);
            }
        }

        if (matches.length === 0) {
            console.log('[Atom Oferta] Botao "' + text + '" nao encontrado');
            return false;
        }

        // Pega o ULTIMO match (botoes de formulario ficam abaixo dos de toolbar)
        var elem = matches[matches.length - 1];
        console.log('[Atom Oferta] Clicando em:', text, '(' + matches.length + ' encontrados, usando ultimo)');

        // PrimeNG: precisa clicar no BUTTON pai, nao no span interno
        var clickTarget = elem;
        if (clickTarget.tagName === 'SPAN') {
            var parentBtn = clickTarget.closest('button') || clickTarget.closest('.ui-button') || clickTarget.closest('a');
            if (parentBtn) {
                clickTarget = parentBtn;
                console.log('[Atom Oferta] Subindo pro parent:', clickTarget.tagName, clickTarget.className.substring(0, 60));
            }
        }

        // Simula click completo (mousedown + mouseup + click) pra PrimeNG
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
    }

    // Lê o Acordo Comercial e salva regras na memória
    function readAcordoComercial(quote) {
        console.log('[Atom Oferta] Lendo Acordo Comercial...');

        // Encontra o accordion "Acordo comercial"
        var acordoHeader = null;
        var acordoTab = null;
        var accordions = document.querySelectorAll('.ui-accordion-header-text');
        for (var i = 0; i < accordions.length; i++) {
            if (accordions[i].textContent.trim().indexOf('Acordo comercial') >= 0) {
                acordoHeader = accordions[i];
                acordoTab = accordions[i].closest('p-accordiontab') || accordions[i].closest('.ui-accordion-header').parentElement;
                break;
            }
        }

        if (!acordoHeader) {
            console.log('[Atom Oferta] Accordion Acordo Comercial nao encontrado');
            return;
        }

        // Verifica se já está expandido (aria-expanded ou classe active)
        var headerEl = acordoHeader.closest('.ui-accordion-header') || acordoHeader.parentElement;
        var isExpanded = headerEl && (headerEl.getAttribute('aria-expanded') === 'true' || headerEl.classList.contains('ui-state-active'));

        if (!isExpanded) {
            // PrimeNG: o click precisa ser no <a> dentro do header, nao no div
            var anchorEl = headerEl ? (headerEl.querySelector('a') || headerEl) : acordoHeader;
            console.log('[Atom Oferta] Clicando no accordion via:', anchorEl.tagName);
            anchorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            anchorEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            anchorEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            console.log('[Atom Oferta] Accordion Acordo Comercial aberto');
        } else {
            console.log('[Atom Oferta] Accordion Acordo Comercial ja estava aberto');
        }

        // Espera conteúdo carregar (CKEditor iframe precisa de tempo)
        setTimeout(function() {
            var acordoContent = '';

            // O conteudo do Acordo Comercial está dentro de iframes CKEditor!
            // Procura iframes CKEditor dentro do accordion
            var searchRoot = acordoTab || (headerEl ? headerEl.parentElement : document);

            // Estratégia 1: Encontrar iframes CKEditor
            var iframes = searchRoot.querySelectorAll('iframe');
            if (!iframes.length) {
                // Se nao encontrou no tab, tenta no documento inteiro (seção acordo)
                iframes = document.querySelectorAll('.ui-accordion-content iframe, .ui-accordion-content-wrapper iframe');
            }

            for (var fi = 0; fi < iframes.length; fi++) {
                try {
                    var iframeDoc = iframes[fi].contentDocument || iframes[fi].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) {
                        var iframeText = iframeDoc.body.textContent || iframeDoc.body.innerText || '';
                        if (iframeText.trim().length > 5) {
                            acordoContent += iframeText.trim() + '\n';
                            console.log('[Atom Oferta] CKEditor iframe lido (' + iframeText.length + ' chars)');
                        }
                    }
                } catch (e) {
                    console.log('[Atom Oferta] Iframe bloqueado (cross-origin):', e.message);
                }
            }

            // Estratégia 2: Usar CKEDITOR API global (se disponível)
            if (!acordoContent && typeof CKEDITOR !== 'undefined' && CKEDITOR.instances) {
                for (var name in CKEDITOR.instances) {
                    var editor = CKEDITOR.instances[name];
                    // Procura editores que pertencem ao acordo comercial
                    if (editor.getData) {
                        var html = editor.getData();
                        // Remove HTML tags pra pegar texto puro
                        var div = document.createElement('div');
                        div.innerHTML = html;
                        var editorText = div.textContent || div.innerText || '';
                        if (editorText.trim().length > 10) {
                            acordoContent += editorText.trim() + '\n';
                            console.log('[Atom Oferta] CKEditor API lido:', name, '(' + editorText.length + ' chars)');
                        }
                    }
                }
            }

            // Estratégia 3: Fallback — textContent do accordion (se nao for CKEditor)
            if (!acordoContent) {
                if (acordoTab) {
                    var contentPanel = acordoTab.querySelector('.ui-accordion-content');
                    if (contentPanel) {
                        acordoContent = contentPanel.textContent || contentPanel.innerText || '';
                    }
                }
                if (!acordoContent && headerEl) {
                    var nextSibling = headerEl.nextElementSibling;
                    if (nextSibling) {
                        acordoContent = nextSibling.textContent || nextSibling.innerText || '';
                    }
                }
            }

            acordoContent = acordoContent.trim();
            console.log('[Atom Oferta] Conteúdo do acordo (' + acordoContent.length + ' chars):', acordoContent.substring(0, 300));

            // Extrai regras do acordo
            var rules = {
                cliente: quote.cliente || '',
                incluirIOF: false,
                armadoresBloqueados: [],
                observacoes: [],
                textoCompleto: acordoContent.substring(0, 500),
                lastUpdated: new Date().toISOString()
            };

            var text = acordoContent.toUpperCase();

            // Check IOF
            if (text.indexOf('IOF') >= 0 && (text.indexOf('INCLUIR') >= 0 || text.indexOf('INCLUSO') >= 0 || text.indexOf('INCLUI') >= 0)) {
                rules.incluirIOF = true;
                console.log('[Atom Oferta] ⚠ Regra: INCLUIR IOF na cotação');
            }

            // Check armadores bloqueados — busca padrões como "NÃO OFERECER MSC" ou "NÃO TRABALHA COM MSC"
            var armadores = ['MSC', 'MAERSK', 'CMA CGM', 'CMA', 'HAPAG', 'COSCO', 'ONE', 'EVERGREEN', 'ZIM', 'YANG MING', 'HMM', 'PIL'];
            for (var a = 0; a < armadores.length; a++) {
                if (text.indexOf(armadores[a]) >= 0) {
                    // Verifica contexto negativo perto do armador
                    var armIdx = text.indexOf(armadores[a]);
                    var nearbyText = text.substring(Math.max(0, armIdx - 80), Math.min(text.length, armIdx + 80));
                    if (nearbyText.indexOf('NÃO') >= 0 || nearbyText.indexOf('NAO') >= 0 || 
                        nearbyText.indexOf('NOT') >= 0 || nearbyText.indexOf('EXCETO') >= 0 ||
                        nearbyText.indexOf('BLOQUEADO') >= 0 || nearbyText.indexOf('PROIBIDO') >= 0) {
                        rules.armadoresBloqueados.push(armadores[a]);
                        console.log('[Atom Oferta] ⚠ Armador BLOQUEADO:', armadores[a]);
                    }
                }
            }

            // Extrai observações gerais do texto
            var lines = acordoContent.split('\n');
            for (var ln = 0; ln < lines.length; ln++) {
                var line = lines[ln].trim();
                if (line.length > 10 && line.length < 200) {
                    rules.observacoes.push(line);
                }
            }

            // Salva regras na memória por cliente
            var clienteKey = 'acordo_' + (quote.cliente || 'unknown').toLowerCase().replace(/\s+/g, '_');
            var storageObj = {};
            storageObj[clienteKey] = rules;
            chrome.storage.local.set(storageObj);
            console.log('[Atom Oferta] Regras salvas para', clienteKey, rules);

            // Toast com resumo
            var resumo = [];
            if (rules.incluirIOF) resumo.push('IOF: Incluir');
            if (rules.armadoresBloqueados.length > 0) resumo.push('Bloqueados: ' + rules.armadoresBloqueados.join(', '));
            if (rules.observacoes.length > 0) resumo.push(rules.observacoes.length + ' regras encontradas');
            if (resumo.length > 0) {
                showToast('Acordo: ' + resumo.join(' | '), 'warning', 6000);
            } else if (acordoContent.length > 0) {
                showToast('Acordo lido: ' + acordoContent.substring(0, 80) + '...', 'info', 4000);
            }
        }, 3500);
    }

    // Preenche Origem e Destino nos multiselects do tarifário
    function fillTarifarioOrigemDestino(quote) {
        var origem = quote.origem || '';
        var destino = quote.destino || '';

        console.log('[Atom Oferta] Tarifário — Origem:', origem, '| Destino:', destino);

        // Pega todos os multiselects na tela
        var multiselects = document.querySelectorAll('p-multiselect, .ui-multiselect');
        console.log('[Atom Oferta] Multiselects encontrados:', multiselects.length);

        // O primeiro é Origem, o segundo é País de Origem, terceiro Destino, etc.
        // Vamos procurar pelo label contextual
        var origemMulti = null;
        var destinoMulti = null;
        var containerMulti = null;

        var formGroups = document.querySelectorAll('.form-group, .ui-g-12, .ui-g-6, .ui-g-4, .ui-g-3, .ui-g-2, [class*="col"]');
        for (var g = 0; g < formGroups.length; g++) {
            var labelEl = formGroups[g].querySelector('label');
            if (!labelEl) continue;
            var labelText = labelEl.textContent.trim();

            if (labelText.indexOf('Origem') >= 0 && labelText.indexOf('País') < 0 && !origemMulti) {
                origemMulti = formGroups[g].querySelector('.ui-multiselect, p-multiselect');
            }
            if (labelText.indexOf('Destino') >= 0 && labelText.indexOf('País') < 0 && labelText.indexOf('DTA') < 0 && !destinoMulti) {
                destinoMulti = formGroups[g].querySelector('.ui-multiselect, p-multiselect');
            }
            if ((labelText.indexOf('Container') >= 0 || labelText.indexOf('Containers') >= 0) && !containerMulti) {
                containerMulti = formGroups[g].querySelector('.ui-multiselect, p-multiselect');
            }
        }

        if (!origemMulti || !destinoMulti) {
            if (multiselects.length >= 2) {
                origemMulti = origemMulti || multiselects[0];
                destinoMulti = destinoMulti || multiselects[1];
            }
        }

        // Mapeia equipamento do email pro formato Skychart
        var containerName = mapEquipmentToSkychart(quote.equipamento || '');

        // 1. Preenche Origem primeiro
        fillMultiselect(origemMulti, origem, function() {
            console.log('[Atom Oferta] Origem selecionada!');

            // 2. Depois preenche Destino
            setTimeout(function() {
                fillMultiselect(destinoMulti, destino, function() {
                    console.log('[Atom Oferta] Destino selecionado!');

                    // 3. Preenche Container
                    setTimeout(function() {
                        if (containerMulti && containerName) {
                            fillMultiselect(containerMulti, containerName, function() {
                                console.log('[Atom Oferta] Container selecionado:', containerName);

                                // 4. Clica em Filtrar
                                setTimeout(function() {
                                    clickButtonByText('Filtrar');
                                    console.log('[Atom Oferta] Filtrar clicado!');
                                    showToast('Tarifário filtrado! Analisando rotas...', 'info', 3000);

                                    // 5. Analisa tarifários: yellow rows, observações, seleção inteligente
                                    setTimeout(function() {
                                        analyzeTarifarios(quote);
                                    }, 3000);
                                }, 1000);
                            });
                        } else {
                            console.log('[Atom Oferta] Container multiselect nao encontrado, pulando...');
                            setTimeout(function() {
                                clickButtonByText('Filtrar');
                                showToast('Tarifário filtrado! Analisando rotas...', 'info', 3000);
                                setTimeout(function() {
                                    analyzeTarifarios(quote);
                                }, 3000);
                            }, 1000);
                        }
                    }, 2000);
                });
            }, 2000);
        });
    }

    // =============================================
    // ANÁLISE INTELIGENTE DE TARIFÁRIOS
    // Descobre estrutura do DOM automaticamente
    // =============================================

    // Helper: parse número brasileiro "1.925,00" → 1925.00
    function parseBR(str) {
        if (!str) return 0;
        var clean = str.replace(/[^\d.,-]/g, '');
        clean = clean.replace(/\./g, '').replace(',', '.');
        return parseFloat(clean) || 0;
    }

    function analyzeTarifarios(quote) {
        console.log('[Atom Oferta] === ANÁLISE INTELIGENTE DE TARIFÁRIOS ===');

        // === DIAGNÓSTICO RÁPIDO ===
        var allTables = document.querySelectorAll('table');
        console.log('[Atom Diag] Total tables:', allTables.length);

        // Encontra a tabela de HEADERS (tem th com "Armador")
        var headerTable = null;
        var headerTableIdx = -1;
        for (var ti = 0; ti < allTables.length; ti++) {
            var ths = allTables[ti].querySelectorAll('thead th');
            for (var hi = 0; hi < ths.length; hi++) {
                if ((ths[hi].textContent || '').trim().toLowerCase().indexOf('armador') >= 0) {
                    headerTable = allTables[ti];
                    headerTableIdx = ti;
                    break;
                }
            }
            if (headerTable) break;
        }

        if (!headerTable) {
            console.log('[Atom Diag] ERRO: Não encontrou tabela com header Armador');
            showToast('Erro: tabela de tarifários não encontrada', 'error', 5000);
            return;
        }

        // Body table = próxima tabela no DOM (tem rows sem headers)
        var bodyTable = allTables[headerTableIdx + 1] || null;
        if (!bodyTable || bodyTable.querySelectorAll('tbody tr').length === 0) {
            // Fallback: procura próxima tabela com rows
            for (var bi = headerTableIdx + 1; bi < allTables.length; bi++) {
                if (allTables[bi].querySelectorAll('tbody tr').length > 0) {
                    bodyTable = allTables[bi];
                    break;
                }
            }
        }

        if (!bodyTable) {
            console.log('[Atom Diag] ERRO: Não encontrou tabela de body após headers');
            showToast('Erro: dados de tarifários não encontrados', 'error', 5000);
            return;
        }

        // Mapeia colunas pelos headers
        var ths = headerTable.querySelectorAll('thead th');
        var armadorCol = -1, freteCol = -1, descCol = -1, codCol = -1;
        for (var h = 0; h < ths.length; h++) {
            var txt = (ths[h].textContent || '').trim().toLowerCase();
            if (txt.indexOf('armador') >= 0) armadorCol = h;
            if (txt.indexOf('descri') >= 0) descCol = h;
            if (txt === 'cod') codCol = h;
            // "Vl. Frete" mas NÃO "Vl. Taxa Frete" nem "Vl. Total Frete"
            if (txt.indexOf('frete') >= 0 && txt.indexOf('taxa') < 0 && txt.indexOf('total') < 0 && freteCol < 0) {
                freteCol = h;
            }
        }

        console.log('[Atom Diag] Header TABLE[' + headerTableIdx + '] → Body TABLE[' + (headerTableIdx + 1) + ']');
        console.log('[Atom Diag] Colunas: Desc=' + descCol + ' Cod=' + codCol + ' Armador=' + armadorCol + ' Frete=' + freteCol);

        var clienteKey = 'acordo_' + (quote.cliente || 'unknown').toLowerCase().replace(/\s+/g, '_');
        chrome.storage.local.get(clienteKey, function(data) {
            var clientRules = data[clienteKey] || { armadoresBloqueados: [], incluirIOF: false };
            
            // Usa bodyTable pra ler as rows (todas as colunas estão na mesma tabela)
            var mainRows = bodyTable.querySelectorAll('tbody tr');
            var tarifarios = [];
            var seen = {};

            for (var r = 0; r < mainRows.length; r++) {
                var row = mainRows[r];
                var cells = row.querySelectorAll('td');
                if (cells.length < 3) continue;

                // Cod do tarifário
                var cod = '';
                if (codCol >= 0 && cells[codCol]) {
                    cod = cells[codCol].textContent.trim();
                }
                if (!cod) {
                    var codMatch = row.textContent.match(/\b(\d{5,})\b/);
                    cod = codMatch ? codMatch[1] : '';
                }
                if (!cod || seen[cod]) continue;
                seen[cod] = true;

                // Armador (col 9)
                var armador = '';
                if (armadorCol >= 0 && cells[armadorCol]) {
                    armador = cells[armadorCol].textContent.trim();
                }

                // VL. Frete (col 15)
                var vlFrete = 0;
                if (freteCol >= 0 && cells[freteCol]) {
                    vlFrete = parseBR(cells[freteCol].textContent.trim());
                }

                // Botão "..." da Descrição (col 1)
                var dotsBtn = null;
                if (descCol >= 0 && cells[descCol]) {
                    var spans = cells[descCol].querySelectorAll('span');
                    for (var sp = 0; sp < spans.length; sp++) {
                        if (spans[sp].textContent.trim() === '...') {
                            dotsBtn = spans[sp];
                            break;
                        }
                    }
                }

                console.log('[Atom Oferta] Linha', cod, '| Armador:', armador, '| VL.Frete:', vlFrete, '| Desc btn:', !!dotsBtn);

                tarifarios.push({
                    rowIndex: r,
                    rowElement: row,
                    frozenRow: row,
                    scrollRow: row,
                    dotsButton: dotsBtn,
                    cod: cod,
                    armador: armador,
                    vlFrete: vlFrete,
                    isYellow: false,
                    observacao: '',
                    eligible: true,
                    rejectReason: ''
                });
            }

            console.log('[Atom Oferta] Tarifários encontrados:', tarifarios.length);

            if (tarifarios.length === 0) {
                showToast('Nenhum tarifário encontrado', 'warning', 4000);
                return;
            }

            // Filtra armadores bloqueados
            if (clientRules.armadoresBloqueados && clientRules.armadoresBloqueados.length > 0) {
                for (var b = 0; b < tarifarios.length; b++) {
                    var armUp = tarifarios[b].armador.toUpperCase();
                    for (var bl = 0; bl < clientRules.armadoresBloqueados.length; bl++) {
                        if (armUp.indexOf(clientRules.armadoresBloqueados[bl].toUpperCase()) >= 0) {
                            tarifarios[b].eligible = false;
                            tarifarios[b].rejectReason = 'Armador bloqueado: ' + clientRules.armadoresBloqueados[bl];
                            break;
                        }
                    }
                }
            }

            // Lê descrições dos elegíveis
            var withDots = tarifarios.filter(function(t) { return t.dotsButton && t.eligible; });
            showToast('Lendo descrições de ' + withDots.length + ' tarifários...', 'info', 3000);
            readAllObservations(withDots, 0, function() {
                var obsByCod = {};
                for (var w = 0; w < withDots.length; w++) {
                    obsByCod[withDots[w].cod] = withDots[w];
                }
                for (var t = 0; t < tarifarios.length; t++) {
                    if (obsByCod[tarifarios[t].cod]) {
                        tarifarios[t].observacao = obsByCod[tarifarios[t].cod].observacao;
                        tarifarios[t].isYellow = obsByCod[tarifarios[t].cod].isYellow;
                        tarifarios[t].eligible = obsByCod[tarifarios[t].cod].eligible;
                        tarifarios[t].rejectReason = obsByCod[tarifarios[t].cod].rejectReason || tarifarios[t].rejectReason;
                    }
                }
                var yellowCount = tarifarios.filter(function(t) { return t.isYellow; }).length;
                console.log('[Atom Oferta] === Total:', tarifarios.length, '| Com restrição:', yellowCount, '===');
                crossCheckAndSelect(tarifarios, quote, clientRules);
            });
        });
    }


    // Clica "..." de cada tarifário sequencialmente, lê conteúdo do dialog
    function readAllObservations(tarifarios, index, callback) {
        if (index >= tarifarios.length) {
            callback();
            return;
        }

        var tar = tarifarios[index];
        console.log('[Atom Oferta] Clicando "..." do', tar.cod, '(', index + 1, '/', tarifarios.length, ')');

        var dotsBtn = tar.dotsButton;
        if (!dotsBtn) {
            readAllObservations(tarifarios, index + 1, callback);
            return;
        }

        // Clica no botão (sobe pro button pai se for span)
        var clickTarget = dotsBtn;
        var parentBtn = clickTarget.closest('button') || clickTarget.closest('.ui-button');
        if (parentBtn) clickTarget = parentBtn;

        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        clickTarget.click();

        // Espera dialog abrir, lê conteúdo
        setTimeout(function() {
            // Procura QUALQUER dialog na página
            var dialog = document.querySelector('.ui-dialog, p-dialog, [role="dialog"], .ui-overlaypanel');
            
            if (!dialog) {
                // Tenta overlay panels do PrimeNG
                var overlays = document.querySelectorAll('.ui-overlaypanel, .cdk-overlay-pane, .ui-tooltip, [class*="overlay"], [class*="popup"]');
                for (var ov = 0; ov < overlays.length; ov++) {
                    if (overlays[ov].offsetHeight > 0 && overlays[ov].textContent.trim().length > 0) {
                        dialog = overlays[ov];
                        break;
                    }
                }
            }

            if (dialog) {
                // DIAGNÓSTICO: mostra o HTML do dialog pra não adivinhar
                console.log('[Atom Diag] Dialog encontrado. Tag:', dialog.tagName, 'Class:', dialog.className.substring(0, 60));
                console.log('[Atom Diag] Dialog HTML (500 chars):', dialog.innerHTML.substring(0, 500));

                // Tenta ler de VÁRIOS tipos de elementos
                var obsText = '';
                
                // 1. textarea
                var textarea = dialog.querySelector('textarea');
                if (textarea) {
                    obsText = (textarea.value || textarea.textContent || '').trim();
                    console.log('[Atom Diag] Leu via textarea:', obsText.substring(0, 80));
                }
                
                // 2. CKEditor iframe
                if (!obsText) {
                    var iframe = dialog.querySelector('iframe');
                    if (iframe) {
                        try {
                            var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                            obsText = (iframeDoc.body.textContent || '').trim();
                            console.log('[Atom Diag] Leu via CKEditor iframe:', obsText.substring(0, 80));
                        } catch(e) {
                            console.log('[Atom Diag] Erro ao ler iframe:', e.message);
                        }
                    }
                }
                
                // 3. div/p com conteúdo (.ui-dialog-content, qualquer div com texto)
                if (!obsText) {
                    var contentDiv = dialog.querySelector('.ui-dialog-content, .ui-overlaypanel-content, [class*="content"]');
                    if (contentDiv) {
                        obsText = contentDiv.textContent.trim();
                        console.log('[Atom Diag] Leu via content div:', obsText.substring(0, 80));
                    }
                }
                
                // 4. Fallback: todo o texto do dialog
                if (!obsText) {
                    obsText = dialog.textContent.trim();
                    // Remove texto de botões (Fechar, Atualizar, etc.)
                    obsText = obsText.replace(/Fechar|Atualizar|Close|Cancel/gi, '').trim();
                    console.log('[Atom Diag] Leu via fallback textContent:', obsText.substring(0, 80));
                }

                if (obsText.length > 0) {
                    tar.observacao = obsText;
                    tar.isYellow = true;
                    console.log('[Atom Oferta]', tar.cod, ':', obsText.substring(0, 80));

                    // NAC check
                    var obsUp = obsText.toUpperCase();
                    if (obsUp.indexOf('NAC') >= 0 && (obsUp.indexOf('QUIMIC') >= 0 || obsUp.indexOf('IMO') >= 0)) {
                        tar.eligible = false;
                        tar.rejectReason = 'NAC: carga quimica/IMO apenas';
                    }
                    if (obsUp.indexOf('SOBREPESO') >= 0 || obsUp.indexOf('OWS') >= 0) {
                        tar.observacao += ' [SOBREPESO]';
                    }
                } else {
                    console.log('[Atom Oferta]', tar.cod, '- Sem observacao');
                }

                // Fecha dialog
                var closeBtn = dialog.querySelector('.ui-dialog-titlebar-close, .ui-dialog-titlebar-icon, button[aria-label="Close"], .ui-overlaypanel-close');
                if (closeBtn) {
                    closeBtn.click();
                } else {
                    var btns = dialog.querySelectorAll('button, .ui-button-text');
                    for (var bi = 0; bi < btns.length; bi++) {
                        var btnText = btns[bi].textContent.trim();
                        if (btnText === 'Atualizar' || btnText === 'Fechar' || btnText === 'OK' || btnText === 'Close') {
                            btns[bi].click();
                            break;
                        }
                    }
                }
            } else {
                console.log('[Atom Oferta]', tar.cod, '- Dialog nao abriu');
                // DIAGNÓSTICO: mostra todos os elementos visíveis que podem ser o dialog
                var allVisible = document.querySelectorAll('[style*="display: block"], [style*="visibility: visible"], .ui-dialog, .ui-overlaypanel');
                console.log('[Atom Diag] Elementos visíveis candidatos:', allVisible.length);
                for (var av = 0; av < Math.min(allVisible.length, 5); av++) {
                    console.log('[Atom Diag]  ', allVisible[av].tagName, allVisible[av].className.substring(0, 40), 'text:', allVisible[av].textContent.substring(0, 50));
                }
            }

            setTimeout(function() {
                readAllObservations(tarifarios, index + 1, callback);
            }, 800);
        }, 1500);
    }



    // ===== PAINEL PERSISTENTE DE STATUS =====
    function showStatusPanel(eligible, ineligible, best, quote) {
        var panel = document.getElementById('atom-status-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'atom-status-panel';
            panel.innerHTML = '<div id="atom-status-header"><span>ATOM Cotacao</span><span class="toggle">−</span></div><div id="atom-status-body"></div>';
            document.body.appendChild(panel);

            // Toggle collapse
            panel.querySelector('#atom-status-header').addEventListener('click', function() {
                panel.classList.toggle('collapsed');
                panel.querySelector('.toggle').textContent = panel.classList.contains('collapsed') ? '+' : '−';
            });
        }

        var body = panel.querySelector('#atom-status-body');
        var html = '';

        // Seção: Seleção
        html += '<div class="section-title">Melhor Rota</div>';
        if (best) {
            var freteStr = best.vlFrete ? best.vlFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'N/A';
            html += '<div style="background:rgba(76,175,80,0.12);border-radius:8px;padding:8px;border-left:3px solid #4caf50;">';
            html += '<div style="font-size:14px;font-weight:700;color:#81c784;">' + best.armador + '</div>';
            html += '<div style="font-size:11px;color:#aaa;margin-top:2px;">Cod: ' + best.cod + ' | Frete: USD ' + freteStr + '</div>';
            if (best.observacao) {
                html += '<div style="font-size:10px;color:#ffd54f;margin-top:4px;">Obs: ' + best.observacao.substring(0, 60) + '</div>';
            }
            html += '</div>';
        }

        // Seção: Ranking
        html += '<div class="section-title">Ranking (' + eligible.length + ' elegíveis)</div>';
        html += '<table class="atom-rank-table"><thead><tr><th>#</th><th>Armador</th><th>Frete</th><th>Obs</th></tr></thead><tbody>';
        for (var i = 0; i < eligible.length; i++) {
            var rowClass = i === 0 ? 'best-row' : '';
            var fStr = eligible[i].vlFrete ? eligible[i].vlFrete.toLocaleString('pt-BR') : '-';
            var obsIcon = eligible[i].observacao ? '!' : '-';
            html += '<tr class="' + rowClass + '"><td>' + (i + 1) + '</td><td>' + eligible[i].armador + '</td><td>' + fStr + '</td><td>' + obsIcon + '</td></tr>';
        }
        html += '</tbody></table>';

        // Descartados
        if (ineligible.length > 0) {
            html += '<div class="section-title">Descartadas (' + ineligible.length + ')</div>';
            for (var d = 0; d < ineligible.length; d++) {
                html += '<div style="font-size:10px;opacity:0.5;text-decoration:line-through;margin:2px 0;">' + ineligible[d].armador + ' — ' + ineligible[d].rejectReason + '</div>';
            }
        }

        // Seção: Sailings (placeholder, preenchido depois pelo HMM scraper)
        html += '<div class="section-title">Sailings <span id="atom-sailing-status" class="atom-status-badge loading">Buscando...</span></div>';
        html += '<div id="atom-sailings-content">Abrindo site do armador...</div>';

        body.innerHTML = html;
    }

    function updateStatusSailings(results) {
        var container = document.getElementById('atom-sailings-content');
        var badge = document.getElementById('atom-sailing-status');
        if (!container) return;

        if (!results || results.length === 0) {
            container.innerHTML = '<div style="color:#ef9a9a;font-size:11px;">Nenhum sailing encontrado</div>';
            if (badge) { badge.className = 'atom-status-badge error'; badge.textContent = 'Vazio'; }
            return;
        }

        if (badge) { badge.className = 'atom-status-badge done'; badge.textContent = results.length + ' encontrados'; }

        var html = '';
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            html += '<div class="atom-sailing">';
            html += '<div class="vessel-name">' + (r.vessel || 'TBD') + '</div>';
            html += '<div class="sailing-detail">ETD: ' + (r.etd || '-') + ' | ETA: ' + (r.eta || '-') + ' | TT: ' + (r.transitTime || '-') + '</div>';
            html += '</div>';
        }
        container.innerHTML = html;
    }

    // Listener para receber resultados do HMM scraper
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'hmm_schedule_results') {
            console.log('[Atom Oferta] Sailings recebidos:', msg.results.length);
            updateStatusSailings(msg.results);
        }
    });


    function crossCheckAndSelect(tarifarios, quote, clientRules) {
        console.log('[Atom Oferta] === CROSS-CHECK E SELEÇÃO ===');

        var eligible = tarifarios.filter(function(t) { return t.eligible; });
        var ineligible = tarifarios.filter(function(t) { return !t.eligible; });

        console.log('[Atom Oferta] Elegíveis:', eligible.length, '| Inelegíveis:', ineligible.length);

        if (ineligible.length > 0) {
            var reasons = ineligible.map(function(t) { return t.cod + ' (' + t.armador + '): ' + t.rejectReason; });
            console.log('[Atom Oferta] Rotas descartadas:', reasons.join(' | '));
        }

        if (eligible.length === 0) {
            showToast('⚠ Nenhuma rota elegível! Todas filtradas por restrições.', 'error', 8000);
            return;
        }

        // Ordena elegíveis por VL. Frete (menor primeiro)
        eligible.sort(function(a, b) {
            // Se vlFrete = 0 (nao leu), coloca no final
            if (a.vlFrete === 0 && b.vlFrete === 0) return 0;
            if (a.vlFrete === 0) return 1;
            if (b.vlFrete === 0) return -1;
            return a.vlFrete - b.vlFrete;
        });

        console.log('[Atom Oferta] Ranking por frete:');
        for (var i = 0; i < eligible.length; i++) {
            console.log('  #' + (i + 1) + ' ' + eligible[i].cod + ' | ' + eligible[i].armador + ' | R$ ' + eligible[i].vlFrete);
        }

        // Mostra resumo
        var summary = '✓ ' + eligible.length + ' rotas elegíveis';
        if (ineligible.length > 0) {
            summary += ' | ✗ ' + ineligible.length + ' descartadas';
        }
        showToast(summary, 'info', 5000);

        var best = eligible[0];

        // Marca visualmente as inelegíveis
        for (var ie = 0; ie < ineligible.length; ie++) {
            if (ineligible[ie].rowElement) {
                ineligible[ie].rowElement.style.opacity = '0.35';
                ineligible[ie].rowElement.style.textDecoration = 'line-through';
                ineligible[ie].rowElement.title = '✗ ' + ineligible[ie].rejectReason;
            }
        }

        // Marca as elegíveis com borda verde, a melhor com borda mais grossa
        for (var el = 0; el < eligible.length; el++) {
            if (eligible[el].rowElement) {
                if (el === 0) {
                    eligible[el].rowElement.style.borderLeft = '4px solid #4caf50';
                    eligible[el].rowElement.style.background = 'rgba(76, 175, 80, 0.08)';
                } else {
                    eligible[el].rowElement.style.borderLeft = '2px solid rgba(76, 175, 80, 0.4)';
                }
            }
        }

        // Clica na mais barata
        if (best.rowElement) {
            best.rowElement.click();
            console.log('[Atom Oferta] Melhor rota selecionada:', best.cod, '| Armador:', best.armador, '| Frete:', best.vlFrete);

            // Mostra painel persistente
            showStatusPanel(eligible, ineligible, best, quote);

            setTimeout(function() {
                var freteStr = best.vlFrete ? ('R$ ' + best.vlFrete.toLocaleString('pt-BR')) : 'N/A';
                showToast('Melhor rota: ' + best.cod + ' (' + best.armador + ') — Frete: ' + freteStr + '. Revise e clique Vincular.', 'success', 8000);

                // Trigger HMM scraper se armador for HMM/Hyundai
                var armUp = (best.armador || '').toUpperCase();
                if (armUp.indexOf('HMM') >= 0 || armUp.indexOf('HYUNDAI') >= 0) {
                    console.log('[Atom Oferta] Abrindo HMM schedule...');
                    var origem = quote.origem || '';
                    var destino = quote.destino || '';
                    chrome.runtime.sendMessage({
                        action: 'open_hmm_schedule',
                        from: origem,
                        to: destino
                    });
                }
            }, 2000);
        }
    }

    // Mapeia código de equipamento pro nome no Skychart
    function mapEquipmentToSkychart(equip) {
        if (!equip) return '';
        var e = equip.toUpperCase().trim();

        var map = {
            '20DV': "20' Dry",
            '20DRY': "20' Dry",
            '20GP': "20' Dry",
            '20': "20' Dry",
            '20RF': "20' Reefer",
            '20OT': "20' Open Top",
            '20FR': "20' Flat Rack",
            '20FLAT': "20' Flat Rack",
            '20NOR': "20' Dry",
            '40DV': "40' Dry",
            '40GP': "40' Dry",
            '40': "40' Dry",
            '40HC': "40' High Cube",
            '40HQ': "40' High Cube",
            '40HIGH': "40' High Cube",
            '40RF': "40' Reefer",
            '40RH': "40' Reefer High Cube",
            '40OT': "40' Open Top",
            '40FR': "40' Flat Rack",
            '40FLAT': "40' Flat Rack (40L)",
            '40NOR': "40' High Cube",
            '20ISOTANK': "20' Isotank",
            '20MULTI': "20' Multi",
            'NOR': "40' High Cube"
        };

        // Tenta match direto
        if (map[e]) return map[e];

        // Tenta match parcial
        for (var key in map) {
            if (e.indexOf(key) >= 0) return map[key];
        }

        // Se não mapeou, retorna como está
        console.log('[Atom Oferta] Equipamento nao mapeado:', equip);
        return equip;
    }

    // Preenche um multiselect PrimeNG
    function fillMultiselect(multiEl, searchText, callback) {
        if (!multiEl) {
            console.log('[Atom Oferta] Multiselect nao encontrado');
            if (callback) callback();
            return;
        }

        console.log('[Atom Oferta] Abrindo multiselect, buscando:', searchText);

        // 1. Clica pra abrir o dropdown
        var clickTarget = multiEl.querySelector('.ui-multiselect-label') || multiEl.querySelector('label') || multiEl;
        clickTarget.click();

        // 2. Espera abrir e digita no campo de busca
        setTimeout(function() {
            // Procura o input de busca dentro do painel do multiselect
            var searchInput = null;
            var panels = document.querySelectorAll('.ui-multiselect-panel, .ui-multiselect-items-wrapper');
            for (var p = 0; p < panels.length; p++) {
                if (panels[p].offsetHeight > 0) {
                    searchInput = panels[p].querySelector('input[type="text"], input.ui-inputtext');
                    if (searchInput) break;
                }
            }

            // Também tenta dentro do próprio multiselect
            if (!searchInput) {
                searchInput = multiEl.querySelector('.ui-multiselect-filter-container input, input[role="textbox"]');
            }

            if (!searchInput) {
                // Tenta qualquer input visivel no panel aberto
                var allInputs = document.querySelectorAll('.ui-multiselect-panel input[type="text"]');
                for (var ai = 0; ai < allInputs.length; ai++) {
                    if (allInputs[ai].offsetHeight > 0) {
                        searchInput = allInputs[ai];
                        break;
                    }
                }
            }

            if (searchInput) {
                // Digita char por char
                var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                searchInput.focus();
                nativeSetter.call(searchInput, '');
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                var idx = 0;
                var timer = setInterval(function() {
                    if (idx < searchText.length) {
                        var val = searchInput.value + searchText[idx];
                        nativeSetter.call(searchInput, val);
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: searchText[idx] }));
                        searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: searchText[idx] }));
                        idx++;
                    } else {
                        clearInterval(timer);

                        // 3. Espera resultado filtrar e clica no primeiro checkbox
                        setTimeout(function() {
                            var checkboxes = null;
                            var visiblePanels = document.querySelectorAll('.ui-multiselect-panel, .ui-multiselect-items-wrapper');
                            for (var vp = 0; vp < visiblePanels.length; vp++) {
                                if (visiblePanels[vp].offsetHeight > 0) {
                                    checkboxes = visiblePanels[vp].querySelectorAll('.ui-chkbox-icon, .ui-multiselect-item .ui-chkbox');
                                    if (checkboxes && checkboxes.length > 0) break;
                                }
                            }

                            if (checkboxes && checkboxes.length > 0) {
                                // Clica no primeiro item (checkbox ou li)
                                var firstItem = checkboxes[0].closest('li') || checkboxes[0].closest('.ui-multiselect-item') || checkboxes[0];
                                firstItem.click();
                                console.log('[Atom Oferta] Item selecionado no multiselect');
                            } else {
                                console.log('[Atom Oferta] Nenhum item encontrado no multiselect');
                            }

                            // Fecha o multiselect clicando fora
                            setTimeout(function() {
                                document.body.click();
                                if (callback) callback();
                            }, 500);
                        }, 1500);
                    }
                }, 60);
            } else {
                console.log('[Atom Oferta] Input de busca do multiselect nao encontrado');
                if (callback) callback();
            }
        }, 800);
    }

    // Preenche validade da rota com data de hoje
    function fillValidadeRota() {
        var now = new Date();
        var dd = String(now.getDate()).padStart(2, '0');
        var mm = String(now.getMonth() + 1).padStart(2, '0');
        var yyyy = now.getFullYear();
        var today = dd + '/' + mm + '/' + yyyy;

        console.log('[Atom Oferta] Preenchendo validade:', today);

        // Procura input de validade:
        // 1. Procura label com "Validade" e pega o input mais proximo
        // 2. Ou pega p-calendar input vazio
        var validadeInput = findInputNearLabel('Validade');

        if (!validadeInput) {
            // Fallback: qualquer input de calendar vazio
            var allCalInputs = document.querySelectorAll('p-calendar input[type="text"], input[class*="ng-tns"][class*="ui-inputtext"]');
            for (var i = 0; i < allCalInputs.length; i++) {
                if (!allCalInputs[i].value || allCalInputs[i].value.trim() === '') {
                    validadeInput = allCalInputs[i];
                    break;
                }
            }
        }

        if (!validadeInput) {
            console.log('[Atom Oferta] Input de validade nao encontrado — usando Vision...');
            if (typeof VisionAgent !== 'undefined') {
                VisionAgent.findElement('campo de data "Validade da rota" que esta vazio, proximo ao texto Validade')
                .then(function(result) {
                    if (result.found && result.x && result.y) {
                        return VisionAgent.act({ type: 'type', x: result.x, y: result.y, text: today });
                    }
                });
            }
            return;
        }

        // Método Angular-compatible: nativeInputValueSetter + char-by-char
        typeIntoAngularInput(validadeInput, today, function() {
            // Verifica se realmente preencheu
            setTimeout(function() {
                if (validadeInput.value && validadeInput.value.trim() !== '') {
                    console.log('[Atom Oferta] ✓ Validade confirmada:', validadeInput.value);
                } else {
                    console.log('[Atom Oferta] ✗ Validade nao preencheu — Vision fallback...');
                    if (typeof VisionAgent !== 'undefined') {
                        VisionAgent.see('O campo de data "Validade" esta preenchido com a data de hoje? Se nao, encontre o campo e me diga as coordenadas.')
                        .then(function(analysis) {
                            if (!analysis.success && analysis.action) {
                                VisionAgent.act({ type: 'click', x: analysis.action.x, y: analysis.action.y })
                                .then(function() {
                                    return new Promise(function(r) { setTimeout(r, 300); });
                                })
                                .then(function() {
                                    var el = document.activeElement;
                                    if (el) typeIntoAngularInput(el, today);
                                });
                            }
                        });
                    }
                }
            }, 500);
        });
    }

    // Encontra input proximo a um label com texto especifico
    function findInputNearLabel(labelText) {
        var labels = document.querySelectorAll('label, span.ui-float-label > label, .form-group label');
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].textContent.trim().indexOf(labelText) >= 0) {
                // Procura input irmao ou proximo
                var parent = labels[i].parentElement;
                if (parent) {
                    var input = parent.querySelector('input[type="text"]');
                    if (input) return input;
                }
            }
        }
        return null;
    }

    // Digita num input Angular (PrimeNG) usando nativeInputValueSetter + eventos
    function typeIntoAngularInput(input, text, callback) {
        input.focus();
        input.click();

        // Limpa
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Digita char por char
        var idx = 0;
        var timer = setInterval(function() {
            if (idx < text.length) {
                var currentVal = input.value + text[idx];
                nativeSetter.call(input, currentVal);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[idx] }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[idx] }));
                idx++;
            } else {
                clearInterval(timer);
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
                console.log('[Atom Oferta] Validade digitada:', input.value);
                if (callback) callback();
            }
        }, 50);
    }

    // Preenche autocomplete por ID (reutilizavel)
    function fillAutocompleteById(inputId, value, callback) {
        var input = document.getElementById(inputId);
        if (!input) {
            console.log('[Atom Oferta] Input', inputId, 'nao encontrado — tentando Vision...');
            
            // FALLBACK: Vision Agent
            if (typeof VisionAgent !== 'undefined') {
                VisionAgent.findElement('campo de input com placeholder "Busque por algo" próximo ao label que contém "' + inputId.replace('cd', '').replace('-oferta', '') + '"')
                .then(function(result) {
                    if (result.found && result.x && result.y) {
                        console.log('[Vision Fallback] Encontrado em', result.x, result.y);
                        return VisionAgent.act({ type: 'click', x: result.x, y: result.y })
                        .then(function() {
                            return new Promise(function(resolve) { setTimeout(resolve, 300); });
                        })
                        .then(function() {
                            var activeEl = document.activeElement;
                            if (activeEl && activeEl.tagName === 'INPUT') {
                                return VisionAgent.typeText(activeEl, value);
                            }
                        })
                        .then(function() {
                            setTimeout(function() {
                                var panels = document.querySelectorAll('.ui-autocomplete-panel, .p-autocomplete-panel');
                                for (var p = 0; p < panels.length; p++) {
                                    if (panels[p].offsetHeight > 0) {
                                        var items = panels[p].querySelectorAll('li');
                                        if (items.length > 0) { items[0].click(); break; }
                                    }
                                }
                                if (callback) callback();
                            }, 2000);
                        });
                    } else {
                        console.log('[Vision Fallback] Elemento nao encontrado visualmente');
                        if (callback) callback();
                    }
                })
                .catch(function() { if (callback) callback(); });
            } else {
                if (callback) callback();
            }
            return;
        }

        console.log('[Atom Oferta] Preenchendo', inputId, 'com:', value);

        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.click();

        var idx = 0;
        var timer = setInterval(function() {
            if (idx < value.length) {
                input.value += value[idx];
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value[idx] }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value[idx] }));
                idx++;
            } else {
                clearInterval(timer);

                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowDown' }));

                // Espera dropdown e seleciona primeiro
                waitAndSelectFirst(0, input, callback);
            }
        }, 60);
    }

    function waitAndSelectFirst(attempt, input, callback) {
        if (attempt >= 20) {
            console.log('[Atom Oferta] Dropdown nao apareceu pra', input.id);
            if (callback) callback();
            return;
        }

        setTimeout(function() {
            var panels = document.querySelectorAll('.ui-autocomplete-panel, .p-autocomplete-panel, .ui-autocomplete-items');
            for (var p = 0; p < panels.length; p++) {
                if (panels[p].offsetHeight > 0) {
                    var items = panels[p].querySelectorAll('li');
                    if (items.length > 0) {
                        items[0].click();
                        console.log('[Atom Oferta]', input.id, 'selecionado:', items[0].textContent.trim());
                        if (callback) callback();
                        return;
                    }
                }
            }
            waitAndSelectFirst(attempt + 1, input, callback);
        }, 500);
    }


    // ========================================================================
    // BOOKING TRACKING — Botão  ao lado do campo Booking
    // ========================================================================

    function injectBookingButton() {
        if (document.querySelector('.sk-tracking-btn')) return;

        // Busca o INPUT do booking direto pelo ID (contém "Reserva" ou "booking")
        var bookingInput = null;
        var allInputs = document.querySelectorAll('input');

        for (var i = 0; i < allInputs.length; i++) {
            var inp = allInputs[i];
            var id = (inp.id || '').toLowerCase();
            var name = (inp.name || '').toLowerCase();
            var combined = id + ' ' + name;

            // Procura campos com "reserva" ou "booking" no ID/name
            if (combined.indexOf('reserva') >= 0 || combined.indexOf('booking') >= 0) {
                // EXCLUI campos tipo "previsaoReserva", "confirmacaoReserva", "dataReserva"
                if (combined.indexOf('previsao') >= 0 || combined.indexOf('confirmacao') >= 0 || combined.indexOf('data') >= 0) continue;
                // EXCLUI: "Previsão Booking", "Confirmação Booking" pelo label da row
                var parentTd = inp.closest('td');
                if (parentTd && parentTd.previousElementSibling) {
                    var labelText = parentTd.previousElementSibling.textContent.trim();
                    if (/previs|confirma/i.test(labelText)) continue;
                }
                bookingInput = inp;
                console.log('[Tracking] Input encontrado por ID:', inp.id || inp.name);
                break;
            }
        }

        // Fallback: busca input que vem LOGO depois de um TD cujo texto é somente "Booking:"
        if (!bookingInput) {
            var allTds = document.querySelectorAll('td');
            for (var t = 0; t < allTds.length; t++) {
                // Checa se o TD contém SOMENTE "Booking:" (sem sub-elementos com texto)
                if (allTds[t].children.length === 0 && allTds[t].textContent.trim() === 'Booking:') {
                    var nextTd = allTds[t].nextElementSibling;
                    if (nextTd) bookingInput = nextTd.querySelector('input');
                    if (bookingInput) break;
                }
            }
        }

        if (!bookingInput) {
            // Debug: mostra todos inputs com "reserva" ou "booking" no ID
            var debugIds = [];
            document.querySelectorAll('input').forEach(function(inp) {
                var id = (inp.id || '').toLowerCase();
                if (id.indexOf('reserva') >= 0 || id.indexOf('booking') >= 0) {
                    debugIds.push(inp.id + ' (label: ' + (inp.closest('td') && inp.closest('td').previousElementSibling ? inp.closest('td').previousElementSibling.textContent.trim() : '?') + ')');
                }
            });
            if (debugIds.length > 0) console.log('[Tracking] Inputs Reserva/Booking:', debugIds.join(' | '));
            return;
        }

        var btn = document.createElement('button');
        btn.className = 'sk-tracking-btn';
        btn.innerHTML = ' Rastrear';
        btn.title = 'Agente busca dados de tracking no armador';
        btn.style.cssText = 'background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;border:none;border-radius:6px;padding:6px 14px;margin-left:8px;cursor:pointer;font-size:12px;font-weight:bold;vertical-align:middle;box-shadow:0 3px 8px rgba(26,115,232,0.4);transition:all 0.2s ease;font-family:Arial,sans-serif;';
        btn.addEventListener('mouseenter', function() { this.style.transform = 'scale(1.05)'; this.style.boxShadow = '0 4px 12px rgba(26,115,232,0.6)'; });
        btn.addEventListener('mouseleave', function() { this.style.transform = 'scale(1)'; this.style.boxShadow = '0 3px 8px rgba(26,115,232,0.4)'; });
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            startBookingTracking(bookingInput);
        });
        bookingInput.parentElement.appendChild(btn);

        // Botão PARAR
        var stopBtn = document.createElement('button');
        stopBtn.className = 'sk-tracking-stop-btn';
        stopBtn.innerHTML = ' Parar';
        stopBtn.title = 'Para o agente de tracking';
        stopBtn.style.cssText = 'display:none;background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:6px 10px;margin-left:4px;cursor:pointer;font-size:11px;font-weight:bold;vertical-align:middle;transition:all 0.2s ease;font-family:Arial,sans-serif;';
        stopBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.skTrackingStop = true;
            stopBtn.style.display = 'none';
            showToast(' Tracking parado!', 'warning');
            SkDebug.log('Tracking', 'SKIP', ' Parado pelo usuário');
        });
        bookingInput.parentElement.appendChild(stopBtn);

        // Mostra/esconde stop btn quando tracking roda
        btn.addEventListener('click', function() {
            stopBtn.style.display = 'inline-block';
        });

        console.log('[Tracking] Botão  +  injetados!');
    }

    function startBookingTracking(bookingInputRef) {
        var bookingInput = bookingInputRef;

        // Fallback se não recebeu o input
        if (!bookingInput) {
            bookingInput = document.querySelector('input[id*="eserva" i]:not([id*="previsao" i]):not([id*="confirmacao" i])');
        }

        var bookingNumber = bookingInput ? (bookingInput.value || bookingInput.textContent || '').trim() : '';

        if (!bookingNumber) {
            showToast(' Preencha o campo Booking antes de rastrear!', 'warning');
            return;
        }

        // Detecta o armador
        var carrier = detectCarrier();

        SkDebug.show();
        SkDebug.log('Tracking', 'EXEC', ' Buscando: ' + bookingNumber + ' (' + carrier + ')');
        showToast(' Buscando tracking: ' + bookingNumber + ' (' + carrier + ')...', 'info');

        chrome.runtime.sendMessage({
            action: 'trackBooking',
            bookingNumber: bookingNumber,
            carrier: carrier
        });
    }

    function detectCarrier() {
        // Tenta detectar o armador pela página
        var pageText = document.body.innerText.toUpperCase();
        if (pageText.indexOf('MSK') >= 0 || pageText.indexOf('MAERSK') >= 0) return 'maersk';
        if (pageText.indexOf('HMM') >= 0 || pageText.indexOf('HYUNDAI') >= 0) return 'hmm';
        if (pageText.indexOf('YML') >= 0 || pageText.indexOf('YANG MING') >= 0) return 'yangming';
        if (pageText.indexOf('ONE') >= 0 || pageText.indexOf('OCEAN NETWORK') >= 0) return 'one';
        return 'maersk'; // default
    }

    function handleTrackingData(data, error) {
        if (error || !data) {
            SkDebug.log('Tracking', 'FAIL', ' Erro no tracking: ' + (error || 'Sem dados'));
            showToast(' Erro no tracking: ' + (error || 'Sem dados'), 'error');
            return;
        }

        if (!data.events || data.events.length === 0) {
            SkDebug.log('Tracking', 'FAIL', ' Nenhum evento de tracking encontrado');
            showToast(' Nenhum evento de tracking encontrado', 'warning');
            return;
        }

        SkDebug.log('Tracking', 'OK', ' Dados recebidos: Navio=' + data.vessel + ' Viagem=' + data.voyage);
        SkDebug.log('Tracking', 'INFO', ' Origem: ' + data.from + ' → Destino: ' + data.to);
        SkDebug.log('Tracking', 'INFO', ' Embarque: ' + data.departureDate + ' | ETA: ' + data.arrivalDate);
        SkDebug.log('Tracking', 'INFO', ' Transbordos: ' + (data.transshipments ? data.transshipments.length : 0));

        showToast(' Tracking: ' + data.vessel + ' / ' + data.voyage + ' — preenchendo campos...', 'success');

        fillTrackingFields(data);
    }

    async function fillTrackingFields(data) {
        window.skTrackingStop = false;

        function convertDate(dateStr) {
            if (!dateStr) return '';
            var months = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
            var match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
            if (match) {
                var day = match[1].padStart(2, '0');
                var month = months[match[2]] || '01';
                return day + '/' + month + '/' + match[3];
            }
            return dateStr;
        }

        function stopped() {
            if (window.skTrackingStop) {
                SkDebug.log('Tracking', 'SKIP', ' Parado pelo usuário');
                return true;
            }
            return false;
        }

        // ===== SELF-HEAL: Pede ajuda ao usuário quando não acha campo =====
        function askUserForField(fieldName) {
            return new Promise(function(resolve) {
                var memKey = 'tracking:' + fieldName;
                // SEM MEMÓRIA — memória causava match em campo errado

                // Mostra toast pedindo clique
                SkDebug.log(fieldName, 'INFO', ' Clique no campo "' + fieldName + '" para eu aprender!');
                showToast(' CLIQUE no campo "' + fieldName + '" para o agente aprender!', 'warning', 30000);

                // Highlight visual: borda piscando em todos os inputs
                document.body.style.cursor = 'crosshair';

                function onUserClick(e) {
                    var target = e.target;
                    // Aceita input, select, textarea, ou o container de autocomplete
                    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT' && target.tagName !== 'TEXTAREA') {
                        // Procura input filho mais perto
                        var nearInput = target.querySelector('input') || target.closest('td, div')?.querySelector('input');
                        if (nearInput) target = nearInput;
                    }

                    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
                        e.preventDefault();
                        e.stopPropagation();
                        document.removeEventListener('click', onUserClick, true);
                        document.body.style.cursor = '';

                        // Gera seletor estável (full CSS path até ancestor com ID)
                        var selector = '';
                        if (target.id) {
                            selector = '#' + CSS.escape(target.id);
                        } else {
                            // Checa se o parent p-autocomplete tem formcontrolname
                            var pAC = target.closest('p-autocomplete, p-autoComplete');
                            if (pAC && pAC.getAttribute('formcontrolname')) {
                                selector = 'p-autocomplete[formcontrolname="' + pAC.getAttribute('formcontrolname') + '"] input';
                            } else {
                                // Gera full CSS path até ancestor com ID
                                var path = [];
                                var cur = target;
                                while (cur && cur !== document.body && cur !== document.documentElement) {
                                    var seg = cur.tagName.toLowerCase();
                                    if (cur.id) {
                                        path.unshift('#' + CSS.escape(cur.id));
                                        break;
                                    }
                                    var par = cur.parentElement;
                                    if (par) {
                                        var sibs = Array.from(par.children).filter(function(c) { return c.tagName === cur.tagName; });
                                        if (sibs.length > 1) {
                                            seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
                                        }
                                    }
                                    path.unshift(seg);
                                    cur = cur.parentElement;
                                }
                                selector = path.join(' > ');
                            }
                        }

                        // Testa se o selector realmente acha o elemento
                        var testEl = null;
                        try { testEl = document.querySelector(selector); } catch(e) {}
                        if (testEl !== target) {
                            SkDebug.log(fieldName, 'INFO', ' CSS path não é único, salvando por ÍNDICE');
                            // Fallback: salva o ÍNDICE entre todos os autocompletes
                            var allAcInputs = document.querySelectorAll('input.ui-autocomplete-input');
                            var acIdx = Array.from(allAcInputs).indexOf(target);
                            if (acIdx >= 0) {
                                selector = 'AC_INDEX:' + acIdx;
                            }
                        }

                        // Salva na memória
                        SkMemory.remember(memKey, {
                            ok: true,
                            selector: selector,
                            strategy: 'learned'
                        });

                        SkDebug.log(fieldName, 'OK', ' Aprendido! selector="' + selector + '"');
                        showToast(' Aprendido: ' + fieldName + ' → ' + selector, 'success', 5000);
                        SkAgent.highlight(target);

                        resolve(target);
                    }
                }

                document.addEventListener('click', onUserClick, true);

                // Timeout de 30 segundos
                setTimeout(function() {
                    document.removeEventListener('click', onUserClick, true);
                    document.body.style.cursor = '';
                    resolve(null);
                }, 30000);
            });
        }

        // ===== AUTO-DIAGNÓSTICO: O agente "abre o F12" sozinho =====
        function diagnoseAndFind(labelToFind, labelToExclude) {
            var allACs = document.querySelectorAll('input.ui-autocomplete-input');
            SkDebug.log('Diagnóstico', 'INFO', ' ' + allACs.length + ' autocompletes na página');

            // SCOPE: acha a seção accordion que contém o Viagem (âncora segura)
            var viagemAnchor = document.querySelector('#formularioEmbarque-dsViagem');
            var embarqueSection = viagemAnchor ? viagemAnchor.closest('.ui-accordion-content-wrapper, .ui-accordion-content, .ui-panel-content, form') : null;
            SkDebug.log('Diagnóstico', 'DEBUG', ' Seção: ' + (embarqueSection ? embarqueSection.tagName + '.' + (embarqueSection.className || '').substring(0, 30) : 'NÃO ENCONTRADA'));

            var found = null;
            for (var i = 0; i < allACs.length; i++) {
                var ac = allACs[i];

                // GUARD: rejeita AC que NÃO está dentro da seção Embarque
                if (embarqueSection && !embarqueSection.contains(ac)) {
                    SkDebug.log('AC[' + i + ']', 'DEBUG', ' fora do Embarque — ignorado');
                    continue;
                }

                // Coleta labels INDIVIDUAIS
                var td = ac.closest('td');

                // Label 1: Texto do MESMO TD (sem valor/placeholder do input)
                var sameTd = '';
                if (td) {
                    sameTd = td.textContent.trim().toLowerCase();
                    // Tira valor e placeholder pra ficar só o label
                    if (ac.value) sameTd = sameTd.replace(ac.value.toLowerCase(), '');
                    if (ac.placeholder) sameTd = sameTd.replace(ac.placeholder.toLowerCase(), '');
                    sameTd = sameTd.trim();
                }

                // Label 2: Texto do TD ANTERIOR
                var prevTd = (td && td.previousElementSibling) ? td.previousElementSibling.textContent.trim().toLowerCase() : '';

                SkDebug.log('AC[' + i + ']', 'DEBUG', 'same="' + sameTd.substring(0,30) + '" prev="' + prevTd.substring(0,30) + '" val="' + (ac.value || '').substring(0,15) + '"');

                // MATCH: checa cada fonte INDIVIDUALMENTE (não junta tudo)
                // Se sameTd contém "navio" mas NÃO "feeder" → match
                if (!found && sameTd.indexOf(labelToFind) >= 0) {
                    if (!labelToExclude || sameTd.indexOf(labelToExclude) < 0) {
                        found = ac;
                        SkDebug.log('Diagnóstico', 'OK', ' MATCH! AC[' + i + '] same TD contém "' + labelToFind + '"');
                    }
                }
                // Se prevTd contém "navio" mas NÃO "feeder" → match
                if (!found && prevTd.indexOf(labelToFind) >= 0) {
                    if (!labelToExclude || prevTd.indexOf(labelToExclude) < 0) {
                        found = ac;
                        SkDebug.log('Diagnóstico', 'OK', ' MATCH! AC[' + i + '] prev TD contém "' + labelToFind + '"');
                    }
                }
            }
            return found;
        }

        // ===== 1. NAVIO — Autocomplete =====
        if (!stopped()) {
            SkDebug.log('Navio', 'EXEC', ' ' + data.vessel);
            var navioInput = null;

            // Seção embarque (pra validar memória)
            var viagemRef = document.querySelector('#formularioEmbarque-dsViagem');
            var embarqueSec = viagemRef ? viagemRef.closest('.ui-accordion-content-wrapper, .ui-accordion-content, .ui-panel-content, form') : null;

            // TENTATIVA 1: Auto-diagnóstico
            navioInput = diagnoseAndFind('navio', 'feeder');

            // TENTATIVA 2: Memória (com suporte a AC_INDEX e validação Embarque)
            if (!navioInput) {
                try {
                    var navioMem = SkMemory.getFieldMemory('tracking:Navio');
                    if (navioMem && navioMem.seletoresQueFunc && navioMem.seletoresQueFunc.length > 0) {
                        var navioSel = navioMem.seletoresQueFunc[navioMem.seletoresQueFunc.length - 1];
                        var memEl = null;

                        // Suporte a AC_INDEX:N
                        if (navioSel && navioSel.indexOf('AC_INDEX:') === 0) {
                            var savedIdx = parseInt(navioSel.split(':')[1]);
                            var allAcMem = document.querySelectorAll('input.ui-autocomplete-input');
                            if (savedIdx >= 0 && savedIdx < allAcMem.length) {
                                memEl = allAcMem[savedIdx];
                            }
                        } else if (navioSel) {
                            try { memEl = document.querySelector(navioSel); } catch(e) {}
                        }

                        // SÓ USA se tá dentro da seção Embarque
                        if (memEl && embarqueSec && embarqueSec.contains(memEl)) {
                            navioInput = memEl;
                            SkDebug.log('Navio', 'OK', ' Memória válida: ' + navioSel);
                        } else if (memEl) {
                            SkDebug.log('Navio', 'FAIL', ' Memória rejeitada (fora do Embarque): ' + navioSel);
                        }
                    }
                } catch(e) {}
            }

            // TENTATIVA 3: Pede ajuda
            if (!navioInput) {
                SkDebug.log('Navio', 'INFO', ' Não achei. Clique no campo Navio!');
                navioInput = await askUserForField('Navio');
            }

            // PREENCHE com charByChar (PrimeNG precisa digitação gradual pro dropdown)
            if (navioInput) {
                SkDebug.log('Navio', 'INFO', ' "' + data.vessel + '"...');
                var r1 = await SkAgent.engine.charByChar(navioInput, data.vessel, { selectFirst: true, tabAfter: true });
                if (r1.ok) {
                    SkDebug.log('Navio', 'OK', ' ' + data.vessel + (r1.selected ? ' → ' + r1.selected : ''));
                } else {
                    SkDebug.log('Navio', 'FAIL', ' ' + (r1.reason || 'Erro'));
                }
            } else {
                SkDebug.log('Navio', 'SKIP', ' Pulando');
            }
            await SkAgent.delay(600);
        }

        // ===== 2. VIAGEM — #formularioEmbarque-dsViagem =====
        if (!stopped()) {
            SkDebug.log('Viagem', 'EXEC', ' ' + data.voyage);
            var viagemInput = document.querySelector('#formularioEmbarque-dsViagem');
            if (viagemInput) {
                viagemInput.focus();
                viagemInput.click();
                SkAgent.engine.nativeSet(viagemInput, data.voyage);
                viagemInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
                viagemInput.dispatchEvent(new Event('blur', { bubbles: true }));
                SkAgent.highlight(viagemInput);
                SkDebug.log('Viagem', 'OK', ' ' + data.voyage);
            } else {
                SkDebug.log('Viagem', 'FAIL', ' #formularioEmbarque-dsViagem não existe');
            }
            await SkAgent.delay(600);
        }

        // ===== 3. PREVISÃO EMBARQUE — #formularioEmbarque-dtPrevisaoEmbarque =====
        if (!stopped()) {
            var embarqueDate = convertDate(data.departureDate);
            SkDebug.log('Prev. Embarque', 'EXEC', ' ' + embarqueDate);
            var embarqueInput = document.querySelector('#formularioEmbarque-dtPrevisaoEmbarque');
            if (embarqueInput) {
                var r3 = await SkAgent.engine.charByChar(embarqueInput, embarqueDate, { selectFirst: false, tabAfter: true });
                if (r3.ok) {
                    SkDebug.log('Prev. Embarque', 'OK', ' ' + embarqueDate);
                } else {
                    SkDebug.log('Prev. Embarque', 'FAIL', ' ' + (r3.reason || 'Erro'));
                }
            } else {
                SkDebug.log('Prev. Embarque', 'FAIL', ' #formularioEmbarque-dtPrevisaoEmbarque não existe');
            }
            await SkAgent.delay(600);
        }

        // ===== 4. PREVISÃO ATRACAÇÃO — #formularioEmbarque-dtPrevisaoAtracacao =====
        if (!stopped()) {
            var etaDate = convertDate(data.arrivalDate);
            SkDebug.log('Prev. Atracação', 'EXEC', ' ' + etaDate);
            var etaInput = document.querySelector('#formularioEmbarque-dtPrevisaoAtracacao');
            if (etaInput) {
                var r4 = await SkAgent.engine.charByChar(etaInput, etaDate, { selectFirst: false, tabAfter: true });
                if (r4.ok) {
                    SkDebug.log('Prev. Atracação', 'OK', ' ' + etaDate);
                } else {
                    SkDebug.log('Prev. Atracação', 'FAIL', ' ' + (r4.reason || 'Erro'));
                }
            } else {
                SkDebug.log('Prev. Atracação', 'FAIL', ' #formularioEmbarque-dtPrevisaoAtracacao não existe');
            }
            await SkAgent.delay(600);
        }

        // ===== 5. TRANSBORDOS =====
        if (!stopped() && data.transshipments && data.transshipments.length > 0) {
            SkDebug.log('Transbordos', 'INFO', ' ' + data.transshipments.length + ' transbordo(s):');
            for (var t = 0; t < data.transshipments.length; t++) {
                var ts = data.transshipments[t];
                SkDebug.log('Transbordo ' + (t + 1), 'INFO', ' ' + ts.port + ' | ' + ts.vesselIn + ' → ' + ts.vesselOut + ' | ' + convertDate(ts.arrivalDate) + ' → ' + convertDate(ts.departureDate));
            }
            showToast(' ' + data.transshipments.length + ' transbordo(s) detectado(s)', 'info', 5000);
        }

        // ===== 6. VERIFICAÇÃO + SELF-HEAL — Confere e corrige =====
        if (!stopped()) {
            await SkAgent.delay(800);
            SkDebug.log('Verificação', 'EXEC', ' Conferindo campos preenchidos...');

            var checks = [
                { label: 'Viagem', selector: '#formularioEmbarque-dsViagem', expected: data.voyage, strategy: 'native-set' },
                { label: 'Prev. Embarque', selector: '#formularioEmbarque-dtPrevisaoEmbarque', expected: convertDate(data.departureDate), strategy: 'char-by-char' },
                { label: 'Prev. Atracação', selector: '#formularioEmbarque-dtPrevisaoAtracacao', expected: convertDate(data.arrivalDate), strategy: 'char-by-char' }
            ];

            var allOk = true;
            for (var c = 0; c < checks.length; c++) {
                if (stopped()) break;
                var chk = checks[c];
                var chkEl = document.querySelector(chk.selector);
                var val = chkEl ? (chkEl.value || '') : '';

                if (val.length > 0) {
                    SkDebug.log('Verificação', 'OK', ' ' + chk.label + ' = "' + val + '"');
                } else {
                    SkDebug.log('Verificação', 'FAIL', ' ' + chk.label + ' VAZIO! Tentando corrigir...');
                    allOk = false;

                    // Self-heal: pede ao usuário
                    var healEl = chkEl || await askUserForField(chk.label);
                    if (healEl) {
                        if (chk.strategy === 'char-by-char') {
                            await SkAgent.engine.charByChar(healEl, chk.expected, { selectFirst: false, tabAfter: true });
                        } else {
                            healEl.focus();
                            healEl.click();
                            SkAgent.engine.nativeSet(healEl, chk.expected);
                            healEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
                            healEl.dispatchEvent(new Event('blur', { bubbles: true }));
                        }
                        await SkAgent.delay(500);
                        var newVal = healEl.value || '';
                        if (newVal.length > 0) {
                            SkDebug.log('Verificação', 'OK', ' ' + chk.label + ' corrigido! = "' + newVal + '"');
                        } else {
                            SkDebug.log('Verificação', 'FAIL', ' ' + chk.label + ' ainda vazio após correção');
                        }
                    }
                }
            }

            if (allOk) {
                SkDebug.log('Verificação', 'OK', ' Todos campos conferidos!');
            }
        }

        // ===== 7. ATUALIZAR — Clica no botão Atualizar pra salvar =====
        if (!stopped()) {
            await SkAgent.delay(500);
            SkDebug.log('Atualizar', 'EXEC', ' Clicando em Atualizar...');

            // Acha o botão Atualizar na SEÇÃO de Embarque (não outro Atualizar da página)
            var atualizarBtn = null;
            var embarqueHeader = null;
            var allAccHeaders = document.querySelectorAll('.ui-accordion-header, a[role="tab"]');
            for (var ah = 0; ah < allAccHeaders.length; ah++) {
                if (allAccHeaders[ah].textContent.indexOf('Embarque') >= 0) {
                    embarqueHeader = allAccHeaders[ah];
                    break;
                }
            }
            // Procura botão no content da seção, ou na página toda como fallback
            var btnScope = (embarqueHeader && embarqueHeader.nextElementSibling) ? embarqueHeader.nextElementSibling : document;
            var allBtnSpans = btnScope.querySelectorAll('span.ui-button-text.ui-clickable');
            for (var b = 0; b < allBtnSpans.length; b++) {
                if (allBtnSpans[b].textContent.trim() === 'Atualizar') {
                    atualizarBtn = allBtnSpans[b].closest('button') || allBtnSpans[b];
                    break;
                }
            }

            // Fallback: busca na página toda
            if (!atualizarBtn) {
                var allSpans = document.querySelectorAll('span.ui-button-text.ui-clickable');
                for (var b2 = 0; b2 < allSpans.length; b2++) {
                    if (allSpans[b2].textContent.trim() === 'Atualizar') {
                        atualizarBtn = allSpans[b2].closest('button') || allSpans[b2];
                        break;
                    }
                }
            }

            if (atualizarBtn) {
                SkDebug.log('Atualizar', 'INFO', ' Botão: ' + atualizarBtn.tagName + ' type=' + (atualizarBtn.type || '?'));
                atualizarBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await SkAgent.delay(800);

                // Clique NATIVO (dispara todos os handlers Angular)
                atualizarBtn.click();
                await SkAgent.delay(300);

                // Também dispara submit no form (pq é type="submit")
                var parentForm = atualizarBtn.closest('form');
                if (parentForm) {
                    parentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    SkDebug.log('Atualizar', 'INFO', ' Form submit disparado');
                }

                SkAgent.highlight(atualizarBtn);
                SkDebug.log('Atualizar', 'OK', ' Clicado + submit!');
                await SkAgent.delay(3000); // espera resposta do servidor
            } else {
                SkDebug.log('Atualizar', 'FAIL', ' Botão Atualizar não encontrado');
            }
        }

        if (!window.skTrackingStop) {
            SkDebug.log('Tracking', 'OK', ' Concluído! Preencher → Verificar → Atualizar ');
        }

        // Esconde botão parar
        var stopBtn = document.querySelector('.sk-tracking-stop-btn');
        if (stopBtn) stopBtn.style.display = 'none';
    }

    // Injeta o botão a cada 3 segundos (aguarda página operacional carregar)
    setInterval(function() {
        if (window.location.href.indexOf('/app/operacional') >= 0) {
            injectBookingButton();
        }
    }, 3000);

    // ========================================================================
    // HUD — Interface flutuante com drop zone
    // ========================================================================

    function createStatusHUD() {
        if (document.getElementById('sk-ai-hud')) return;
        var hud = document.createElement('div');
        hud.id = 'sk-ai-hud';
        hud.style.cssText = 'position:fixed;bottom:30px;right:30px;background:rgba(255,255,255,0.1);backdrop-filter:blur(15px) saturate(180%);-webkit-backdrop-filter:blur(15px) saturate(180%);background-color:rgba(17,25,40,0.85);border:1px dashed rgba(52,152,219,0.5);color:#fff;padding:20px;border-radius:20px;font-family:Outfit,Inter,sans-serif;font-size:13px;z-index:2147483647;box-shadow:0 8px 32px 0 rgba(0,0,0,0.5);transition:all 0.5s cubic-bezier(0.175,0.885,0.32,1.275);display:flex;flex-direction:column;gap:15px;width:300px;overflow:hidden;';
        hud.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;"><div style="display:flex;align-items:center;gap:12px;"><div style="width:12px;height:12px;background:#3498db;border-radius:50%;box-shadow:0 0 10px #3498db;" id="sk-ai-pulse"></div><div style="display:flex;flex-direction:column;"><span style="font-weight:700;letter-spacing:0.8px;color:#3498db;font-size:11px;text-transform:uppercase;">Skychart AI</span><span id="sk-ai-status" style="font-weight:400;color:#e0e0e0;">Pronto</span></div></div><div style="display:flex;gap:10px;align-items:center;"><button id="sk-stop-btn" style="display:none;background:#e74c3c;color:white;border:none;border-radius:6px;padding:4px 10px;font-size:10px;font-weight:bold;cursor:pointer;box-shadow:0 0 8px rgba(231,76,60,0.5);">PARAR</button><div id="sk-hud-toggle" style="cursor:pointer;padding:5px;font-size:18px;line-height:1;color:rgba(255,255,255,0.6);"><span id="sk-toggle-icon">-</span></div></div></div><div id="sk-main-content" style="display:flex;flex-direction:column;gap:15px;"><div id="sk-drop-zone" style="border:2px dashed rgba(255,255,255,0.2);border-radius:12px;padding:20px;text-align:center;background:rgba(255,255,255,0.05);transition:all 0.3s ease;"><div style="font-size:24px;margin-bottom:8px;">&#10024;</div><div style="font-weight:600;font-size:11px;color:#aac0ff;">ARRASTE O PDF AQUI</div><div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:4px;">Preenche TUDO automaticamente</div></div></div>';
        document.body.appendChild(hud);

        // Toggle minimizar/expandir
        var toggle = document.getElementById('sk-hud-toggle');
        var content = document.getElementById('sk-main-content');
        var icon = document.getElementById('sk-toggle-icon');
        var stopBtn = document.getElementById('sk-stop-btn');

        var isMin = false;
        toggle.onclick = function (e) {
            e.stopPropagation(); isMin = !isMin;
            if (isMin) { hud.style.width = '180px'; hud.style.padding = '12px 18px'; content.style.opacity = '0'; setTimeout(function () { content.style.display = 'none'; }, 300); icon.innerText = '+'; }
            else { content.style.display = 'flex'; setTimeout(function () { hud.style.width = '300px'; hud.style.padding = '20px'; content.style.opacity = '1'; }, 10); icon.innerText = '-'; }
        };

        // Stop button
        stopBtn.onclick = function (e) {
            e.stopPropagation();
            window.skStopActive = true;
            updateStatus("Processo abortado!");
            stopBtn.style.display = 'none';
        };

        // Drop zone
        var dz = document.getElementById('sk-drop-zone');
        hud.addEventListener('dragover', function (e) { e.preventDefault(); dz.style.background = 'rgba(52,152,219,0.2)'; dz.style.borderColor = '#3498db'; });
        hud.addEventListener('dragleave', function () { dz.style.background = 'rgba(255,255,255,0.05)'; dz.style.borderColor = 'rgba(255,255,255,0.2)'; });
        hud.addEventListener('drop', async function (e) {
            e.preventDefault(); dz.style.background = 'rgba(255,255,255,0.05)';
            var files = e.dataTransfer.files;
            var pdfs = [];

            for (var f = 0; f < files.length; f++) {
                if (files[f].type === 'application/pdf') {
                    pdfs.push(files[f]);
                } else if (files[f].name.toLowerCase().endsWith('.zip') || files[f].type === 'application/zip' || files[f].type === 'application/x-zip-compressed') {
                    // Extrai PDFs do ZIP
                    updateStatus(' Extraindo ZIP...');
                    try {
                        var extracted = await extractPdfsFromZip(files[f]);
                        pdfs = pdfs.concat(extracted);
                    } catch (err) {
                        updateStatus('Erro ZIP: ' + err.message);
                    }
                }
            }

            if (pdfs.length === 0) { updateStatus("Erro: Nenhum PDF encontrado!"); return; }
            window.skStopActive = false;
            stopBtn.style.display = 'block';
            if (pdfs.length === 1) {
                processMagicFlow(pdfs[0]);
            } else {
                processBatchFlow(pdfs);
            }
        });

        // Botão selecionar PDFs (file picker)
        var filePickerInput = document.createElement('input');
        filePickerInput.type = 'file';
        filePickerInput.accept = '.pdf,.zip';
        filePickerInput.multiple = true;
        filePickerInput.style.display = 'none';
        document.body.appendChild(filePickerInput);

        var pickBtn = document.createElement('div');
        pickBtn.style.cssText = 'text-align:center;cursor:pointer;padding:6px;background:rgba(52,152,219,0.2);border-radius:8px;font-size:11px;color:#aac0ff;margin-top:-5px;transition:all 0.3s;';
        pickBtn.innerHTML = ' <span style="font-weight:600;">Selecionar PDFs</span>';
        pickBtn.onmouseover = function() { pickBtn.style.background = 'rgba(52,152,219,0.4)'; };
        pickBtn.onmouseout = function() { pickBtn.style.background = 'rgba(52,152,219,0.2)'; };
        pickBtn.onclick = function() { filePickerInput.click(); };
        content.appendChild(pickBtn);

        filePickerInput.addEventListener('change', async function() {
            var files = filePickerInput.files;
            if (!files || files.length === 0) return;
            var pdfs = [];
            for (var f = 0; f < files.length; f++) {
                if (files[f].type === 'application/pdf') {
                    pdfs.push(files[f]);
                } else if (files[f].name.toLowerCase().endsWith('.zip')) {
                    try {
                        var extracted = await extractPdfsFromZip(files[f]);
                        pdfs = pdfs.concat(extracted);
                    } catch (err) { console.error('ZIP error:', err); }
                }
            }
            if (pdfs.length === 0) { updateStatus("Nenhum PDF!"); return; }
            window.skStopActive = false;
            stopBtn.style.display = 'block';
            if (pdfs.length === 1) { processMagicFlow(pdfs[0]); }
            else { processBatchFlow(pdfs); }
            filePickerInput.value = ''; // Reset
        });
        if (typeof SkDebug !== 'undefined') {
            SkDebug.init();
        }

        // Inicializa memória do agente
        if (typeof SkMemory !== 'undefined') {
            SkMemory.init();
        }
    }


    // ========================================================================
    // ZIP SUPPORT — Extrai PDFs de arquivos ZIP
    // ========================================================================

    async function extractPdfsFromZip(zipFile) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip não carregado');
        }
        var pdfs = [];
        var arrayBuffer = await zipFile.arrayBuffer();
        var zip = await JSZip.loadAsync(arrayBuffer);
        var fileNames = Object.keys(zip.files);

        for (var i = 0; i < fileNames.length; i++) {
            var name = fileNames[i];
            if (name.toLowerCase().endsWith('.pdf') && !zip.files[name].dir) {
                var blob = await zip.files[name].async('blob');
                var file = new File([blob], name.split('/').pop(), { type: 'application/pdf' });
                pdfs.push(file);
            }
        }

        console.log('Skychart AI: ZIP extraído — ' + pdfs.length + ' PDFs encontrados');
        return pdfs;
    }


    // ========================================================================
    // FLUXO PRINCIPAL — PDF → Extração → Smart Agent
    // ========================================================================

    async function processMagicFlow(file) {
        updateStatus("Iniciando...");
        SkDebug.clear();
        SkDebug.show();
        SkDebug.log('Sistema', 'EXEC', 'Processando PDF: ' + file.name);

        try {
            // 1. Upload do PDF no Skychart (input file nativo)
            triggerSkychartUpload(file);

            // 2. Leitura do PDF com pdf.js
            updateStatus("Lendo PDF...");
            var pdfText = "";
            if (typeof pdfjsLib !== 'undefined') {
                var arrayBuffer = await file.arrayBuffer();
                var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                for (var i = 1; i <= Math.min(pdf.numPages, 3); i++) {
                    var page = await pdf.getPage(i);
                    var cont = await page.getTextContent();
                    pdfText += cont.items.map(function (item) { return item.str; }).join(' ') + '\n';
                }
                console.log("Skychart AI: TEXTO PDF:", pdfText);
                SkDebug.log('PDF', 'OK', 'Lido: ' + pdfText.length + ' chars, ' + pdf.numPages + ' páginas');
            } else {
                updateStatus("pdf.js nao carregado");
                SkDebug.log('PDF', 'FAIL', 'pdf.js não está carregado');
                return;
            }

            // 3. Extração de campos
            updateStatus("Extraindo dados...");
            var fields = extractFields(pdfText);
            console.log("Skychart AI: Campos:", JSON.stringify(fields));
            SkDebug.log('Extração', 'OK', 'Campos: ' + Object.keys(fields).join(', '));

            // Espera a pagina estabilizar após upload (Angular re-render)
            updateStatus("Aguardando pagina...");
            await SkAgent.delay(2000);

            // Espera o campo de data existir no DOM (ate 5s)
            if (fields.dataContrato) {
                await waitForElement('#formularioFiltroPagamento-dtFechamento', 5000);
            }

            if (window.skStopActive) { updateStatus("Abortado!"); return; }

            // 4. Carrega a configuração do módulo
            updateStatus("Carregando módulo...");
            var moduleConfig = await loadModuleConfig();
            if (!moduleConfig) {
                SkDebug.log('Módulo', 'FAIL', 'Não foi possível carregar a configuração');
                updateStatus("Erro: módulo não carregado");
                return;
            }
            SkDebug.log('Módulo', 'OK', 'Carregado: ' + moduleConfig.modulo + ' (' + moduleConfig.steps.length + ' campos)');

            // 5. Executa o Smart Agent
            updateStatus("Preenchendo campos...");
            var results = await SkAgent.run(moduleConfig, fields);

            // 6. Resultado final
            var okCount = results.filter(function (r) { return r.status === 'OK'; }).length;
            var total = results.length;
            updateStatus("Pronto! " + okCount + "/" + total + " campos");
            showToast("Pronto! " + okCount + "/" + total + " campos!", okCount === total ? "success" : "warning");
            SkDebug.log('Sistema', okCount === total ? 'OK' : 'FAIL', 'Resultado: ' + okCount + '/' + total + ' campos preenchidos');
            document.getElementById('sk-stop-btn').style.display = 'none';

        } catch (err) {
            updateStatus("Erro: " + err.message);
            console.error("Skychart AI:", err);
            SkDebug.log('Sistema', 'FAIL', 'Erro: ' + err.message);
        }
    }


    // ========================================================================
    // BATCH MODE — Processa múltiplos PDFs em sequência
    // ========================================================================

    async function processBatchFlow(pdfFiles) {
        updateStatus(' Batch: ' + pdfFiles.length + ' PDFs');
        SkDebug.clear();
        SkDebug.show();
        SkDebug.log('Batch', 'EXEC', ' Modo batch: ' + pdfFiles.length + ' PDFs recebidos');

        try {
            // 1. Lê e classifica todos os PDFs
            var contratos = [];
            var swifts = [];

            for (var i = 0; i < pdfFiles.length; i++) {
                var file = pdfFiles[i];
                var pdfText = '';
                if (typeof pdfjsLib !== 'undefined') {
                    var arrayBuffer = await file.arrayBuffer();
                    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    for (var p = 1; p <= Math.min(pdf.numPages, 5); p++) {
                        var page = await pdf.getPage(p);
                        var cont = await page.getTextContent();
                        pdfText += cont.items.map(function (item) { return item.str; }).join(' ') + '\n';
                    }
                }

                var textLower = pdfText.toLowerCase();
                var isContrato = textLower.indexOf('contrato de c') >= 0 || textLower.indexOf('tipo do contrato') >= 0;

                if (isContrato) {
                    var fields = extractFields(pdfText);

                    // Extrai empresa estrangeira (Pagador/Recebedor no exterior)
                    var foreignCo = '';
                    // Busca empresa em MAIUSCULAS com sufixo corporativo
                    var coMatches = pdfText.match(/([A-Z][A-Z\s&.,]{3,}(?:CO|LTD|INC|LLC|CORP|LIMITED|GMBH)[A-Z\s.]*)/g) || [];
                    for (var cm = 0; cm < coMatches.length; cm++) {
                        var coName = coMatches[cm].trim();
                        // Ignora FRENTE CORRETORA (é o fornecedor brasileiro)
                        if (coName.indexOf('FRENTE') >= 0 || coName.indexOf('CORRETORA') >= 0) continue;
                        if (coName.length > 5) { foreignCo = coName; break; }
                    }

                    // Extrai valor USD do contrato
                    var usdMatch = pdfText.match(/USD\s*([0-9][0-9.,]+)/i);
                    var usdValor = usdMatch ? usdMatch[1].replace(/[^\d.,]/g, '') : '';

                    contratos.push({ file: file, text: pdfText, fields: fields, foreignCo: foreignCo, usdValor: usdValor, name: file.name });
                    SkDebug.log('Batch', 'INFO', ' Contrato: ' + file.name + ' (n:' + (fields.numeroContrato || '?') + ' co:' + (foreignCo.substring(0,30) || '?') + ' usd:' + (usdValor || '?') + ')');
                } else {
                    // Swift — extrai Creditor Name e Amount
                    var swiftAmount = '';
                    var amtMatch = pdfText.match(/Amount[\s:]*([0-9][0-9.,]+)/i);
                    if (amtMatch) swiftAmount = amtMatch[1].replace(/[^\d.,]/g, '');

                    var swiftCreditor = '';
                    var credMatch = pdfText.match(/Creditor[\s\S]{0,80}?Name[\s:]*([A-Z][A-Z\s&.,]+)/i);
                    if (credMatch) swiftCreditor = credMatch[1].trim();

                    swifts.push({ file: file, text: pdfText, valor: swiftAmount, creditor: swiftCreditor, name: file.name });
                    SkDebug.log('Batch', 'INFO', ' Swift: ' + file.name + ' (usd:' + swiftAmount + ' creditor:' + (swiftCreditor.substring(0,30) || '?') + ')');
                }
            }

            SkDebug.log('Batch', 'OK', 'Classificação: ' + contratos.length + ' contratos, ' + swifts.length + ' swifts');

            // 2. Pra cada contrato, pareia com Swift
            var pairs = [];
            for (var c = 0; c < contratos.length; c++) {
                var ct = contratos[c];
                var matchedSwift = null;
                var matchReason = '';

                for (var s = 0; s < swifts.length; s++) {
                    if (swifts[s].matched) continue;

                    // Estrategia 1: match por empresa estrangeira (palavras em comum com Creditor)
                    if (ct.foreignCo && swifts[s].creditor) {
                        var w1 = ct.foreignCo.toUpperCase().split(/[\s,&.]+/).filter(function(w) { return w.length > 2; });
                        var w2 = swifts[s].creditor.toUpperCase().split(/[\s,&.]+/).filter(function(w) { return w.length > 2; });
                        var common = w1.filter(function(w) { return w2.indexOf(w) >= 0; });
                        if (common.length >= 2) {
                            matchedSwift = swifts[s];
                            matchReason = 'empresa:' + common.join(' ');
                            swifts[s].matched = true;
                            break;
                        }
                    }

                    // Estrategia 2: match por valor USD
                    if (ct.usdValor && swifts[s].valor) {
                        var v1n = parseFloat(ct.usdValor.replace(/,/g, ''));
                        var v2n = parseFloat(swifts[s].valor.replace(/,/g, ''));
                        if (!isNaN(v1n) && !isNaN(v2n) && Math.abs(v1n - v2n) < 1) {
                            matchedSwift = swifts[s];
                            matchReason = 'usd:' + swifts[s].valor;
                            swifts[s].matched = true;
                            break;
                        }
                    }
                }

                pairs.push({ contrato: ct, swift: matchedSwift });
                SkDebug.log('Batch', 'INFO', ' Par ' + (c+1) + ': ' + ct.name + (matchedSwift ? ' + ' + matchedSwift.name + ' (' + matchReason + ')' : ' (sem par)'));
            }

            // Fallback: pareia restantes por ordem
            var unmatchedC = pairs.filter(function(p) { return !p.swift; });
            var unmatchedS = swifts.filter(function(s) { return !s.matched; });
            if (unmatchedC.length > 0 && unmatchedS.length > 0) {
                var fbCount = Math.min(unmatchedC.length, unmatchedS.length);
                SkDebug.log('Batch', 'INFO', ' Fallback por ordem: ' + fbCount + ' pares');
                for (var fb = 0; fb < fbCount; fb++) {
                    unmatchedC[fb].swift = unmatchedS[fb];
                    unmatchedS[fb].matched = true;
                    SkDebug.log('Batch', 'INFO', ' Fallback: ' + unmatchedC[fb].contrato.name + ' + ' + unmatchedS[fb].name);
                }
            }

            for (var s2 = 0; s2 < swifts.length; s2++) {
                if (!swifts[s2].matched) {
                    SkDebug.log('Batch', 'INFO', ' Swift sem par: ' + swifts[s2].name);
                }
            }

            // 3. Processa cada par
            var results = [];

            for (var pi = 0; pi < pairs.length; pi++) {
                if (window.skStopActive) { SkDebug.log('Batch', 'INFO', ' Batch abortado pelo usuário'); break; }

                var pair = pairs[pi];
                updateStatus(' Batch ' + (pi+1) + '/' + pairs.length + ': ' + (pair.contrato.fields.numeroContrato || pair.contrato.name));
                SkDebug.log('Batch', 'EXEC', '=== Processando par ' + (pi+1) + '/' + pairs.length + ' ===');

                // Navega pro agente CORRETO na sidebar (match por nome da empresa)
                var agentName = '';
                // Usa o creditor do Swift (mais confiável) ou foreignCo do contrato
                if (pair.swift && pair.swift.creditor) {
                    agentName = pair.swift.creditor;
                } else if (pair.contrato.foreignCo) {
                    agentName = pair.contrato.foreignCo;
                }

                if (agentName) {
                    var navigated = await navigateToAgent(agentName, pi === 0);
                    if (!navigated && pi > 0) {
                        SkDebug.log('Batch', 'FAIL', ' Não encontrou agente "' + agentName.substring(0,30) + '" na sidebar');
                        results.push({ num: pair.contrato.fields.numeroContrato || pair.contrato.name, status: 'FAIL', reason: 'Agente não encontrado: ' + agentName.substring(0,30) });
                        continue;
                    }
                } else if (pi > 0) {
                    // Fallback: se não tem nome do agente, clica no próximo
                    var sidebarRows = getSidebarRows();
                    var currentIdx = getCurrentSidebarIndex(sidebarRows);
                    if (currentIdx + 1 < sidebarRows.length) {
                        sidebarRows[currentIdx + 1].click();
                        await delay(3000);
                    }
                }

                // Upload: Swift PRIMEIRO (fica na linha 1), Contrato SEGUNDO (fica na linha 2)
                try {
                    if (pair.swift) {
                        triggerSkychartUpload(pair.swift.file);
                        await delay(2000);
                        SkDebug.log('Batch', 'OK', 'Swift uploaded PRIMEIRO: ' + pair.swift.name);
                    }

                    triggerSkychartUpload(pair.contrato.file);
                    await delay(1500);

                    // Espera DOM estabilizar
                    await waitForElement('#formularioFiltroPagamento-dtFechamento', 5000);

                    // Carrega módulo e executa
                    var moduleConfig = await loadModuleConfig();
                    if (!moduleConfig) {
                        results.push({ num: pair.contrato.fields.numeroContrato || pair.contrato.name, status: 'FAIL', reason: 'Módulo não carregou' });
                        continue;
                    }

                    var runResults = await SkAgent.run(moduleConfig, pair.contrato.fields);
                    var okCount = runResults.filter(function (r) { return r.status === 'OK'; }).length;
                    results.push({ num: pair.contrato.fields.numeroContrato || pair.contrato.name, status: okCount === runResults.length ? 'OK' : 'PARTIAL', ok: okCount, total: runResults.length });

                } catch (err) {
                    SkDebug.log('Batch', 'FAIL', ' Erro no par ' + (pi+1) + ': ' + err.message);
                    results.push({ num: pair.contrato.fields.numeroContrato || pair.contrato.name, status: 'FAIL', reason: err.message });
                }
            }

            // 4. Resumo final
            var okTotal = results.filter(function(r) { return r.status === 'OK'; }).length;
            var summary = ' Batch: ' + okTotal + '/' + results.length + ' fechamentos OK';
            SkDebug.log('Batch', okTotal === results.length ? 'OK' : 'FAIL', summary);
            results.forEach(function(r, i) {
                var icon = r.status === 'OK' ? '' : r.status === 'PARTIAL' ? '' : '';
                SkDebug.log('Batch', 'INFO', icon + ' #' + (r.num || (i+1)) + ': ' + r.status + (r.ok ? ' (' + r.ok + '/' + r.total + ')' : '') + (r.reason ? ' — ' + r.reason : ''));
            });

            updateStatus(summary);
            showToast(summary, okTotal === results.length ? 'success' : 'warning');
            document.getElementById('sk-stop-btn').style.display = 'none';

        } catch (err) {
            SkDebug.log('Batch', 'FAIL', 'Erro fatal no batch: ' + err.message);
            updateStatus('Erro batch: ' + err.message);
        }
    }

    // Navega para o agente correto na sidebar
    async function navigateToAgent(agentName, isFirst) {
        var rows = getSidebarRows();
        if (rows.length === 0) {
            SkDebug.log('Batch', 'FAIL', 'Sidebar vazia — nenhuma row encontrada');
            return false;
        }

        // Tokeniza o nome do agente (palavras significativas)
        var agentWords = agentName.toUpperCase().split(/[\s,&.]+/).filter(function(w) {
            return w.length > 2 && ['THE', 'AND', 'LTD', 'INC', 'LLC', 'CO.', 'ADDRESS', 'ROOM'].indexOf(w) < 0;
        });

        SkDebug.log('Batch', 'INFO', ' Buscando agente: ' + agentName.substring(0, 40) + ' (palavras: ' + agentWords.join(', ') + ')');

        var bestMatch = null;
        var bestScore = 0;
        var bestIdx = -1;

        for (var r = 0; r < rows.length; r++) {
            var rowText = rows[r].textContent.toUpperCase();
            var rowWords = rowText.split(/[\s,&.]+/).filter(function(w) { return w.length > 2; });

            var common = agentWords.filter(function(w) { return rowWords.indexOf(w) >= 0; });
            var score = common.length;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = rows[r];
                bestIdx = r;
            }
        }

        if (bestScore >= 2) {
            // Verifica se já está na row correta (highlighted)
            if (bestMatch.classList.contains('ui-state-highlight') || bestMatch.classList.contains('ui-state-active')) {
                SkDebug.log('Batch', 'OK', ' Já está no agente correto (row ' + bestIdx + ', score ' + bestScore + ')');
                return true;
            }
            SkDebug.log('Batch', 'INFO', '➡ Clicando no agente (row ' + bestIdx + ', score ' + bestScore + '): ' + bestMatch.textContent.trim().substring(0, 50));
            bestMatch.click();
            await delay(3000); // Espera o formulário carregar
            return true;
        } else if (isFirst) {
            // No primeiro item, assume que já está na tela certa
            SkDebug.log('Batch', 'INFO', ' Não encontrou match forte (score=' + bestScore + '), mas é o primeiro — assume tela atual');
            return true;
        } else {
            SkDebug.log('Batch', 'FAIL', ' Nenhum match na sidebar (melhor score=' + bestScore + ')');
            return false;
        }
    }

    // Retorna as rows clicáveis da sidebar
    function getSidebarRows() {
        var rows = [];
        // A sidebar é a tabela à esquerda com os fechamentos
        var allRows = document.querySelectorAll('table tbody tr, .ui-datatable-data tr');
        for (var r = 0; r < allRows.length; r++) {
            // Filtra rows que parecem ser de fechamento (têm número, agente, etc.)
            if (allRows[r].querySelectorAll('td').length >= 2 && allRows[r].closest('.ui-datatable')) {
                rows.push(allRows[r]);
            }
        }
        return rows;
    }

    // Acha a row ativa (highlighted) da sidebar
    function getCurrentSidebarIndex(rows) {
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].classList.contains('ui-state-highlight') || rows[i].classList.contains('ui-state-active')) {
                return i;
            }
        }
        return 0; // Se nenhuma está ativa, assume a primeira
    }


    // ========================================================================
    // EXTRAÇÃO DE CAMPOS DO PDF (mantém a lógica que já funciona)
    // ========================================================================

    function extractFields(text) {
        var fields = {};

        // Numero do contrato (9 dígitos)
        var nines = text.match(/\b(\d{9})\b/g) || [];
        for (var n = 0; n < nines.length; n++) {
            var idx = text.indexOf(nines[n]);
            var ctx = text.substring(Math.max(0, idx - 80), idx + 20).toLowerCase();
            if (ctx.indexOf('contrat') >= 0 || ctx.indexOf('numero') >= 0) { fields.numeroContrato = nines[n]; break; }
        }
        if (!fields.numeroContrato && nines.length > 0) fields.numeroContrato = nines[0];

        // Datas
        var dates = text.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
        if (dates.length > 0) fields.dataContrato = dates[0];

        // CNPJ do fornecedor
        var cnpjs = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
        for (var c = 0; c < cnpjs.length; c++) {
            var ci = text.indexOf(cnpjs[c]);
            var cc = text.substring(Math.max(0, ci - 200), ci).toLowerCase();
            if (cc.indexOf('frente') >= 0 || cc.indexOf('corretora') >= 0 || cc.indexOf('autorizada') >= 0) { fields.cnpjFornecedor = cnpjs[c]; break; }
        }
        if (!fields.cnpjFornecedor && cnpjs.length > 0) fields.cnpjFornecedor = cnpjs[0];

        // VET
        var vetMatch = text.match(/(?:Valor\s*Efetivo\s*Total|VET)[\s\S]{0,30}?(\d+[.,]\d{4,})/i);
        if (vetMatch) { fields.valorVET = vetMatch[1].replace(',', '.'); }
        else { var ld = text.match(/(\d+[.,]\d{10,})/g) || []; if (ld.length > 0) fields.valorVET = ld[0].replace(',', '.'); }

        // Taxa cambial
        var tc = text.match(/Taxa[\s-]*cambial[\s\S]{0,120}?(\d+[.,]\d{4,})/i);
        if (tc) { fields.taxaCambial = tc[1].replace(',', '.'); }
        else {
            var allLongDec = text.match(/\b\d+[.,]\d{4,}\b/g) || [];
            for (var m = 0; m < allLongDec.length; m++) {
                var val = allLongDec[m].replace(',', '.');
                if (val !== fields.valorVET && parseFloat(val) > 0) { fields.taxaCambial = val; break; }
            }
        }

        // Despesa bancaria
        var dm = text.match(/[Dd]espesa\s*banc[\s\S]{0,30}?(?:BRL\s*)?(\d+[\.,]?\d*)/i);
        if (dm) fields.despesaBancaria = dm[1].replace(',', '.');

        console.log("Skychart AI: Contrato:", fields.numeroContrato || "X", "Data:", fields.dataContrato || "X", "CNPJ:", fields.cnpjFornecedor || "X", "VET:", fields.valorVET || "X", "Taxa:", fields.taxaCambial || "X", "Despesa:", fields.despesaBancaria || "X");
        return fields;
    }


    // ========================================================================
    // CARREGAMENTO DO MÓDULO
    // ========================================================================

    async function loadModuleConfig() {
        try {
            var url = chrome.runtime.getURL('modules/cambio.json');
            var response = await fetch(url);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } catch (err) {
            console.error('Skychart AI: Erro ao carregar módulo:', err);
            // Fallback: retorna config inline caso o arquivo não carregue
            return getFallbackConfig();
        }
    }

    function getFallbackConfig() {
        return {
            modulo: "cambio",
            steps: [
                { id: "data_fechamento", label: "Data Fechamento", selector: "#formularioFiltroPagamento-dtFechamento", pdfField: "dataContrato", order: 1, delayAfter: 500 },
                { id: "contrato", label: "Contrato", selector: "#dsContrato, input[id*='dsContrato']", pdfField: "numeroContrato", order: 2, delayAfter: 300 },
                { id: "fornecedor_iof", label: "Fornecedor IOF", selector: "#formularioEmbarque-cdFornecedorIOF", pdfField: "cnpjFornecedor", order: 3, delayAfter: 800 },
                { id: "fornecedor_contrato", label: "Fornecedor Contrato", selector: "#formularioEmbarque-cdFornecedorContratCambio", pdfField: "cnpjFornecedor", order: 4, delayAfter: 800 },
                { id: "moeda_contrato", label: "Moeda Contrato", selector: "#formularioEmbarque-cdMoedaContrato", fixedValue: "BRL", order: 5, delayAfter: 800 },
                { id: "valor_conversao", label: "Valor Conversão", findByLabel: "Valor de convers", fixedValue: "1", order: 6, delayAfter: 300 },
                { id: "valor_contrato", label: "Valor Contrato", findByLabel: "Valor do contrato de c", pdfField: "despesaBancaria", formatBR: true, order: 7, delayAfter: 300 },
                { id: "taxa_vet", label: "Taxa VET", findByLabel: "Taxa VET", pdfField: "valorVET", formatBR: true, order: 8, delayAfter: 300 },
                { id: "atualizar_pre_taxa", label: "Atualizar (salvar campos)", actionType: "clickButton", actionLabel: "Atualizar", order: 9, delayAfter: 3000 },
                { id: "taxa_cambial", label: "Taxa Cambial", selector: "input[title='Taxa']", pdfField: "taxaCambial", formatBR: true, order: 10, delayAfter: 800 }
            ],
            postActions: [
                { action: "clickCheckbox", label: "Acordo lido", delay: 800, retryDelay: 2000 },
                { action: "clickButton", label: "Finalizar Câmbio", delay: 2000, retryDelay: 1500 },
                { action: "clickButton", label: "Gerar IOF", delay: 2000, retryDelay: 2000 },
                { action: "clickButton", label: "Gerar contrato de cambio", delay: 2000, retryDelay: 2000 },
                { action: "selectDropdown", label: "Tipo do arquivo", value: "Contrato de Câmbio", delay: 1500, retryDelay: 2000 },
                { action: "clickRowSave", label: "Salvar tipo arquivo", delay: 1500, retryDelay: 2000 },
                { action: "selectDropdown", label: "Tipo do arquivo (Swift)", value: "Swift", delay: 1500, retryDelay: 2000 },
                { action: "clickRowSave", label: "Salvar tipo arquivo (Swift)", delay: 1500, retryDelay: 2000 },
                { action: "selectBankAccount", label: "Selecionar Banco/Conta", matchText: "98424", delay: 2000, retryDelay: 2000 },
                { action: "clickButton", label: "Atualizar", delay: 2000, retryDelay: 1500 },
                { action: "visionVerify", label: "Verificação visual final", delay: 3000 }
            ]
        };
    }


    // ========================================================================
    // HELPERS
    // ========================================================================

    function triggerSkychartUpload(file) {
        updateStatus("Upload...");
        var fileInput = document.querySelector('input[type="file"]');
        if (!fileInput) { updateStatus("Input upload nao achado"); return; }
        var dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        SkDebug.log('Upload', 'OK', 'PDF enviado ao Skychart');
    }

    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function waitForElement(selector, timeout) {
        return new Promise(function (resolve) {
            var elapsed = 0;
            var check = setInterval(function () {
                var el = document.querySelector(selector);
                if (el) { clearInterval(check); resolve(true); return; }
                elapsed += 200;
                if (elapsed >= timeout) { clearInterval(check); resolve(false); }
            }, 200);
        });
    }

    function updateStatus(msg) { var el = document.getElementById('sk-ai-status'); if (el) el.innerText = msg; }

    function showToast(msg, type) {
        var t = document.createElement('div');
        var bg = type === 'success' ? '#2ecc71' : type === 'warning' ? '#f39c12' : '#3498db';
        t.style.cssText = 'position:fixed;top:10%;left:50%;transform:translate(-50%,-50%);background:' + bg + ';color:white;padding:15px 30px;border-radius:30px;z-index:100001;font-weight:bold;box-shadow:0 5px 15px rgba(0,0,0,0.3);';
        t.innerText = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 4000);
    }

    // ========================================================================
    // SERASA — Lê PDF Serasa e preenche Controle de Créditos
    // ========================================================================

    function injectSerasaButton() {
        if (document.querySelector('.sk-serasa-btn')) return;
        if (location.href.indexOf('/app/pessoa') < 0) return;

        // Acha a seção "Controle de créditos" (pra colocar o botão perto)
        var accHeaders = document.querySelectorAll('.ui-accordion-header, a[role="tab"]');
        var creditoHeader = null;
        for (var h = 0; h < accHeaders.length; h++) {
            if (accHeaders[h].textContent.indexOf('Controle de cr') >= 0) {
                creditoHeader = accHeaders[h];
                break;
            }
        }
        if (!creditoHeader) return;

        // Container para os botões
        var btnContainer = document.createElement('div');
        btnContainer.className = 'sk-serasa-btn';
        btnContainer.style.cssText = 'display:inline-flex;gap:6px;margin:5px 0 5px 10px;';

        // Botão "Check Score" (antigo "Analisar Serasa")
        var btnScore = document.createElement('button');
        btnScore.innerHTML = 'Check Score';
        btnScore.style.cssText = 'padding:6px 14px;background:linear-gradient(135deg,#1565C0,#42A5F5);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.2);transition:all 0.2s;';
        btnScore.title = 'Le o PDF Serasa e preenche Score + Limite no Controle de Creditos';
        btnScore.onmouseover = function() { this.style.filter = 'brightness(1.15)'; };
        btnScore.onmouseout = function() { this.style.filter = 'none'; };
        btnScore.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            startSerasaAnalysis();
        });

        // Botão "Consulta Serasa" (novo)
        var btnConsulta = document.createElement('button');
        btnConsulta.innerHTML = 'Consulta Serasa';
        btnConsulta.style.cssText = 'padding:6px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.2);transition:all 0.2s;';
        btnConsulta.title = 'Abre o Serasa Empreendedor e consulta o CNPJ deste cliente';
        btnConsulta.onmouseover = function() { this.style.filter = 'brightness(1.15)'; };
        btnConsulta.onmouseout = function() { this.style.filter = 'none'; };
        btnConsulta.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            startSerasaConsulta();
        });

        btnContainer.appendChild(btnScore);
        btnContainer.appendChild(btnConsulta);
        creditoHeader.parentElement.insertBefore(btnContainer, creditoHeader);
        SkDebug.log('Serasa', 'OK', 'Botoes Check Score + Consulta Serasa injetados');
    }

    // Extrai CNPJ do cliente na pagina /app/pessoa
    function extractClientCNPJ() {
        // Tenta pegar do campo CNPJ direto (label + input)
        var labels = document.querySelectorAll('label, span, td');
        for (var i = 0; i < labels.length; i++) {
            var text = (labels[i].textContent || '').trim();
            if (text === 'CNPJ' || text === 'CPF/CNPJ') {
                // Pega o input/span proximo
                var parent = labels[i].parentElement;
                if (parent) {
                    var input = parent.querySelector('input, span.ui-autocomplete-token-label');
                    if (input) {
                        var val = (input.value || input.textContent || '').trim();
                        var cnpjMatch = val.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
                        if (cnpjMatch) return cnpjMatch[1].replace(/\D/g, '');
                    }
                }
            }
        }

        // Fallback: pega do dropdown autocomplete (formato "NOME - CNPJ")
        var autoInput = document.querySelector('input.ui-autocomplete-input[placeholder="Busque por algo..."]');
        if (autoInput) {
            var val = autoInput.value || '';
            var cnpjMatch = val.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
            if (cnpjMatch) return cnpjMatch[1].replace(/\D/g, '');
        }

        // Fallback: qualquer texto na pagina que contenha CNPJ
        var allInputs = document.querySelectorAll('input[type="text"], span, td');
        for (var j = 0; j < allInputs.length; j++) {
            var content = (allInputs[j].value || allInputs[j].textContent || '').trim();
            var match = content.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
            if (match) return match[1].replace(/\D/g, '');
        }

        return null;
    }

    // Inicia consulta Serasa (abre tab com CNPJ)
    function startSerasaConsulta() {
        var cnpj = extractClientCNPJ();
        if (!cnpj) {
            showToast('CNPJ nao encontrado na pagina', 'warning', 5000);
            SkDebug.log('Serasa', 'FAIL', 'CNPJ nao encontrado');
            return;
        }

        SkDebug.log('Serasa', 'EXEC', 'Consulta Serasa: CNPJ ' + cnpj);
        showToast('Abrindo Serasa para CNPJ ' + cnpj + '...', 'info', 5000);

        // Salva CNPJ no storage e pede pro background abrir a aba
        chrome.storage.local.set({ serasaCNPJ: cnpj }, function() {
            chrome.runtime.sendMessage({
                action: 'openSerasaConsulta',
                cnpj: cnpj
            });
        });
    }

    async function startSerasaAnalysis() {
        SkDebug.log('Serasa', 'EXEC', ' Iniciando análise Serasa...');
        showToast(' Analisando Serasa...', 'info', 5000);

        // 0. Abre accordion "Documentos" se fechado (Angular não renderiza conteúdo quando fechado)
        var docHeaderSpans = document.querySelectorAll('span.ui-accordion-header-text');
        var docOpened = false;
        for (var dh = 0; dh < docHeaderSpans.length; dh++) {
            var spanText = docHeaderSpans[dh].textContent.trim();
            if (spanText === 'Documentos') {
                // Clica no header (ou no <a> pai)
                var clickable = docHeaderSpans[dh].closest('a, .ui-accordion-header') || docHeaderSpans[dh];
                SkDebug.log('Serasa', 'INFO', ' Clicando em "Documentos" (' + clickable.tagName + ')...');
                clickable.click();
                docOpened = true;
                await new Promise(function(resolve) { setTimeout(resolve, 2500); });
                break;
            }
        }
        if (!docOpened) {
            SkDebug.log('Serasa', 'FAIL', ' Accordion "Documentos" não encontrado. Spans: ' + 
                Array.from(docHeaderSpans).map(function(s) { return '"' + s.textContent.trim() + '"'; }).join(', '));
        }

        // 1. Busca DIRETA: link com href contendo "serasa" (mais confiável que buscar row)
        var pdfUrl = null;
        var allLinks = document.querySelectorAll('a[href]');
        for (var al = 0; al < allLinks.length; al++) {
            if (allLinks[al].href.toLowerCase().indexOf('serasa') >= 0) {
                pdfUrl = allLinks[al].href;
                SkDebug.log('Serasa', 'OK', ' Link direto: ' + pdfUrl.substring(0, 80));
                break;
            }
        }

        // 2. Fallback: busca row na grid com "Serasa" e pega o download icon
        if (!pdfUrl) {
            var docRows = document.querySelectorAll('tr');
            SkDebug.log('Serasa', 'DEBUG', ' ' + docRows.length + ' <tr> na página');
            var serasaRow = null;
            for (var r = 0; r < docRows.length; r++) {
                var rowText = docRows[r].textContent;
                if (rowText.indexOf('Serasa') >= 0 || rowText.indexOf('serasa') >= 0 || rowText.indexOf('SERASA') >= 0) {
                    serasaRow = docRows[r];
                    SkDebug.log('Serasa', 'OK', ' Row[' + r + ']: ' + rowText.trim().substring(0, 80));
                    break;
                }
            }

            if (serasaRow) {
                // Busca link de download na row
                var dlIcon = serasaRow.querySelector('.fa-download');
                var dlLink = dlIcon ? dlIcon.closest('a') : null;
                if (dlLink && dlLink.href) {
                    pdfUrl = dlLink.href;
                    SkDebug.log('Serasa', 'OK', ' Link do ícone: ' + pdfUrl.substring(0, 80));
                } else {
                    // Tenta qualquer <a> com href na row
                    var rowLinks = serasaRow.querySelectorAll('a[href]');
                    for (var rl = 0; rl < rowLinks.length; rl++) {
                        if (rowLinks[rl].href.indexOf('arquivo') >= 0 || rowLinks[rl].href.indexOf('pdf') >= 0 || 
                            rowLinks[rl].href.indexOf('permanente') >= 0 || rowLinks[rl].href.indexOf('download') >= 0) {
                            pdfUrl = rowLinks[rl].href;
                            break;
                        }
                    }
                    if (!pdfUrl && rowLinks.length > 0) {
                        pdfUrl = rowLinks[0].href;
                    }
                    if (pdfUrl) {
                        SkDebug.log('Serasa', 'OK', ' Link fallback: ' + pdfUrl.substring(0, 80));
                    }
                    // NÃO clica aqui! O clique acontece via background (captureNewTabUrl)
                }
            } else {
                SkDebug.log('Serasa', 'FAIL', ' Nenhuma row com "Serasa" encontrada');
                showToast(' PDF Serasa não encontrado na grid de Documentos', 'warning', 5000);
                return;
            }
        }

        // Se não achou link direto, usa background pra capturar URL da aba nova
        if (!pdfUrl) {
            var serasaRow2 = null;
            var docRows2 = document.querySelectorAll('tr');
            for (var r2 = 0; r2 < docRows2.length; r2++) {
                var rt2 = docRows2[r2].textContent;
                if (rt2.indexOf('Serasa') >= 0 || rt2.indexOf('serasa') >= 0 || rt2.indexOf('SERASA') >= 0) {
                    serasaRow2 = docRows2[r2];
                    break;
                }
            }
            if (serasaRow2) {
                var dlIcon2 = serasaRow2.querySelector('.fa-download');
                var dlBtn2 = dlIcon2 ? (dlIcon2.closest('button, a') || dlIcon2) : null;
                if (dlBtn2) {
                    window._serasaDlBtn = dlBtn2;
                    SkDebug.log('Serasa', 'INFO', ' Capturando URL via background...');

                    // Background: registra listener → manda clicar → captura URL → fecha aba
                    var urlResponse = await new Promise(function(resolve) {
                        chrome.runtime.sendMessage(
                            { action: 'captureNewTabUrl' },
                            function(response) { resolve(response); }
                        );
                    });

                    if (urlResponse && urlResponse.success && urlResponse.url) {
                        pdfUrl = urlResponse.url;
                        SkDebug.log('Serasa', 'OK', ' URL capturada: ' + pdfUrl.substring(0, 80));
                    } else {
                        SkDebug.log('Serasa', 'FAIL', ' ' + (urlResponse ? urlResponse.error : 'sem resposta'));
                        showToast(' Não consegui capturar URL do PDF', 'warning', 5000);
                        return;
                    }
                }
            }
            if (!pdfUrl) {
                SkDebug.log('Serasa', 'FAIL', ' Nenhuma forma de acessar o PDF');
                showToast(' Não consegui acessar o PDF Serasa', 'warning', 5000);
                return;
            }
        }

        // Fetch local (content script tem os cookies do Skychart!)
        try {
            SkDebug.log('Serasa', 'INFO', ' Baixando PDF (com cookies)...');
            var resp = await fetch(pdfUrl, { credentials: 'include' });
            var blob = await resp.blob();
            SkDebug.log('Serasa', 'INFO', ' Blob: ' + blob.size + ' bytes, tipo: ' + blob.type);

            var base64 = await new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload = function() { resolve(reader.result.split(',')[1]); };
                reader.readAsDataURL(blob);
            });

            SkDebug.log('Serasa', 'OK', ' PDF: ' + Math.round(base64.length / 1024) + 'KB');
            showToast(' Extraindo Score e Limite via regex...', 'info', 5000);

            // Decodifica base64 → Uint8Array pro pdf.js
            var binaryString = atob(base64);
            var pdfBytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
                pdfBytes[i] = binaryString.charCodeAt(i);
            }

            // Extrai texto de TODAS as páginas do PDF
            var pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
            var fullText = '';
            for (var pg = 1; pg <= pdfDoc.numPages; pg++) {
                var page = await pdfDoc.getPage(pg);
                var textContent = await page.getTextContent();
                var pageText = textContent.items.map(function(item) { return item.str; }).join(' ');
                fullText += pageText + '\n';
            }

            SkDebug.log('Serasa', 'INFO', ' Texto extraído: ' + fullText.substring(0, 200));

            // Regex: Score (ex: "Score 952 /1000" ou "Score 952")
            var scoreMatch = fullText.match(/Score\s+(\d{1,4})/i);
            var score = scoreMatch ? scoreMatch[1] : null;

            // Regex: Limite de Crédito (ex: "Total de R$ 13.256.268,00")
            // Procura "Limite de Crédito" e depois o primeiro "Total de R$" ou "R$" com valor
            var limiteSection = fullText.substring(fullText.search(/Limite de Cr[eé]dito/i));
            var limiteMatch = limiteSection.match(/(?:Total de\s*)?R\$\s*([\d.,]+)/i);
            var limiteCredito = limiteMatch ? limiteMatch[1] : null;

            SkDebug.log('Serasa', 'OK', ' Score: ' + score + ' | Limite: R$ ' + limiteCredito);

            var serasaData = null;

            if (score || limiteCredito) {
                // Regex funcionou!
                var limiteCreditoNumero = '0';
                if (limiteCredito) {
                    limiteCreditoNumero = limiteCredito.replace(/\./g, '').replace(',', '.');
                }
                serasaData = { score: score || 'N/A', limiteCredito: limiteCreditoNumero };
            } else {
                // PDF é imagem — fallback pro Gemini
                SkDebug.log('Serasa', 'INFO', ' Texto vazio, usando Gemini como fallback...');
                showToast(' PDF é imagem, enviando pro Gemini...', 'info', 10000);

                var geminiResponse = await new Promise(function(resolve) {
                    chrome.runtime.sendMessage(
                        { action: 'extractSerasaData', pdfBase64: base64 },
                        function(response) { resolve(response); }
                    );
                });

                if (!geminiResponse || !geminiResponse.success) {
                    SkDebug.log('Serasa', 'FAIL', ' Gemini: ' + (geminiResponse ? geminiResponse.error : 'sem resposta'));
                    showToast(' Gemini não conseguiu extrair dados', 'warning', 5000);
                    return;
                }

                serasaData = geminiResponse.result;
                SkDebug.log('Serasa', 'OK', ' Gemini: Score ' + serasaData.score + ' | Limite: R$ ' + serasaData.limiteCredito);
            }

            await fillSerasaFields(serasaData);

        } catch (err) {
            SkDebug.log('Serasa', 'FAIL', ' Erro: ' + err.message);
            showToast(' Erro: ' + err.message, 'warning', 5000);
        }
    }

    // Listener pro background pedir pra clicar no download
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'clickSerasaDownload' && window._serasaDlBtn) {
            SkDebug.log('Serasa', 'INFO', ' Background pediu: clicando download...');
            window._serasaDlBtn.click();
        }
    });

    // Preenche os campos de Controle Serasa
    async function fillSerasaFields(serasaData) {
        // Abre accordion "Controle de créditos" se fechado
        var accHeaders = document.querySelectorAll('span.ui-accordion-header-text');
        for (var ah = 0; ah < accHeaders.length; ah++) {
            if (accHeaders[ah].textContent.trim().indexOf('Controle de cr') >= 0) {
                var accLink = accHeaders[ah].closest('a, .ui-accordion-header');
                if (accLink) {
                    accLink.click();
                    await new Promise(function(resolve) { setTimeout(resolve, 1000); });
                }
                break;
            }
        }

        // #vlSerasa
        var vlSerasa = document.querySelector('#vlSerasa');
        if (vlSerasa) {
            var limite = String(serasaData.limiteCredito || '0').replace('.', ',');
            vlSerasa.focus();
            SkAgent.engine.nativeSet(vlSerasa, limite);
            vlSerasa.dispatchEvent(new Event('input', { bubbles: true }));
            vlSerasa.dispatchEvent(new Event('change', { bubbles: true }));
            vlSerasa.dispatchEvent(new Event('blur', { bubbles: true }));
            SkDebug.log('Serasa', 'OK', ' Valor Serasa: ' + limite);
        } else {
            SkDebug.log('Serasa', 'FAIL', ' #vlSerasa não encontrado');
        }

        // #dsObservacao (TEXTAREA — nativeSet usa HTMLInputElement, precisa de HTMLTextAreaElement)
        var dsObs = document.querySelector('#dsObservacao');
        if (dsObs) {
            var obsText = 'Score Serasa: ' + serasaData.score + '/1000\n';
            obsText += 'Limite de Crédito: R$ ' + Number(serasaData.limiteCredito || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '\n';
            obsText += 'Consulta: ' + new Date().toLocaleDateString('pt-BR') + '\n';
            obsText += 'Extraído automaticamente por IA';

            dsObs.focus();
            // Usa o setter do HTMLTextAreaElement (textarea não é HTMLInputElement)
            var textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
            textareaSetter.call(dsObs, obsText);
            dsObs.dispatchEvent(new Event('input', { bubbles: true }));
            dsObs.dispatchEvent(new Event('change', { bubbles: true }));
            dsObs.dispatchEvent(new Event('blur', { bubbles: true }));
            SkDebug.log('Serasa', 'OK', ' Observação preenchida');
        } else {
            SkDebug.log('Serasa', 'FAIL', ' #dsObservacao não encontrado');
        }

        // Clica Atualizar
        await new Promise(function(resolve) { setTimeout(resolve, 500); });
        var allBtnSpans = document.querySelectorAll('span.ui-button-text.ui-clickable');
        for (var b = 0; b < allBtnSpans.length; b++) {
            if (allBtnSpans[b].textContent.trim() === 'Atualizar') {
                var atzBtn = allBtnSpans[b].closest('button') || allBtnSpans[b];
                atzBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await new Promise(function(resolve) { setTimeout(resolve, 500); });
                atzBtn.click();
                SkDebug.log('Serasa', 'OK', ' Atualizar clicado');
                break;
            }
        }

        showToast(' Serasa: Score ' + serasaData.score + ' | Limite R$ ' + Number(serasaData.limiteCredito || 0).toLocaleString('pt-BR'), 'success', 8000);
        SkDebug.log('Serasa', 'OK', ' Concluído!');

        // Salva no chrome.storage pra badge instantâneo na próxima visita
        try {
            var tituloSpan = document.querySelector('div.titulo-accordion span');
            var clientName = tituloSpan ? tituloSpan.textContent.trim() : '';
            if (clientName && clientName.length >= 3) {
                var storageKey = 'serasa_' + clientName.substring(0, 50).replace(/\s+/g, '_');
                var saveData = {};
                saveData[storageKey] = {
                    score: parseInt(serasaData.score) || 0,
                    limiteCredito: serasaData.limiteCredito,
                    data: new Date().toISOString()
                };
                chrome.storage.local.set(saveData);
                SkDebug.log('Serasa', 'OK', ' Score salvo: ' + storageKey);
            }
        } catch(e) { /* ignora erro de storage */ }

        // Injeta badge imediatamente
        injectScoreBadge(parseInt(serasaData.score) || 0);
    }

    // Injeta o botão Serasa quando estiver na página de Pessoas
    function scanForSerasa() {
        if (location.href.indexOf('/app/pessoa') >= 0) {
            injectSerasaButton();
            scanForScoreBadge();
        } else {
            // Remove badge se saiu da página de pessoa
            var oldBadge = document.getElementById('sk-serasa-badge');
            if (oldBadge) oldBadge.remove();
        }
    }

    // Badge de Score: lê score do storage e mostra badge perto do nome do cliente
    function scanForScoreBadge() {
        // Pega o nome do cliente de div.titulo-accordion span
        var tituloSpan = document.querySelector('div.titulo-accordion span');
        if (!tituloSpan) return;
        var clientName = tituloSpan.textContent.trim();
        if (!clientName || clientName.length < 3) return;

        // Se já tem badge mas é de OUTRO cliente, remove
        var existingBadge = document.getElementById('sk-serasa-badge');
        if (existingBadge) {
            if (existingBadge.getAttribute('data-client') === clientName) return; // mesmo cliente, ok
            existingBadge.remove(); // cliente diferente, remove
        }

        // Checa storage primeiro (instantâneo!)
        var storageKey = 'serasa_' + clientName.substring(0, 50).replace(/\s+/g, '_');
        chrome.storage.local.get(storageKey, function(data) {
            if (document.getElementById('sk-serasa-badge')) return;
            
            var score = null;
            if (data[storageKey]) {
                score = data[storageKey].score;
            }

            // Se não tem no storage, tenta ler do dsObservacao (se visível)
            if (!score) {
                var dsObs = document.querySelector('#dsObservacao');
                if (dsObs) {
                    var obsText = dsObs.value || dsObs.textContent || '';
                    var scoreMatch = obsText.match(/Score\s+(?:Serasa:?\s*)?(\d{1,4})/i);
                    if (scoreMatch) score = parseInt(scoreMatch[1]);
                }
            }

            if (!score) return;
            injectScoreBadge(score);
        });
    }

    function injectScoreBadge(score) {
        if (document.getElementById('sk-serasa-badge')) return;

        var color, bg, emoji;
        if (score >= 700) {
            color = '#10b981'; bg = 'rgba(16, 185, 129, 0.15)'; emoji = '';
        } else if (score >= 400) {
            color = '#f59e0b'; bg = 'rgba(245, 158, 11, 0.15)'; emoji = '';
        } else {
            color = '#ef4444'; bg = 'rgba(239, 68, 68, 0.15)'; emoji = '';
        }

        var badge = document.createElement('span');
        badge.id = 'sk-serasa-badge';
        badge.innerHTML = emoji + ' Score: <strong>' + score + '</strong>/1000';
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;' +
            'padding:4px 12px;margin-left:12px;border-radius:14px;font-size:13px;' +
            'background:' + bg + ';color:' + color + ';border:1px solid ' + color + ';' +
            'font-weight:600;vertical-align:middle;cursor:default;';
        badge.title = 'Score Serasa extraído automaticamente';

        // Marca o cliente no badge pra detectar mudança
        var currentClient = document.querySelector('div.titulo-accordion span');
        badge.setAttribute('data-client', currentClient ? currentClient.textContent.trim() : '');

        // Insere dentro de div.titulo-accordion, ao lado do nome do cliente
        var tituloDiv = document.querySelector('div.titulo-accordion');
        if (tituloDiv) {
            tituloDiv.appendChild(badge);
        }

        SkDebug.log('Serasa', 'OK', ' Badge Score ' + score + ' injetado');
    }

    // ========================================================================
    // FRETE: Comparação de frete no operacional
    // ========================================================================

    var _lastFreightProcesso = null;
    var _freightAnalyzing = false;
    var _freightPreloaded = false;

    // Guard: extensão ainda válida?
    function _isCtxOk() { try { return !!chrome.runtime && !!chrome.runtime.id; } catch(e) { return false; } }

    function scanForFreight() {
        if (!_isCtxOk()) return; // Extension recarregada
        if (location.href.indexOf('/app/operacional') < 0) {
            var freightPanel = document.getElementById('sk-freight-panel');
            if (freightPanel) freightPanel.remove();
            _lastFreightProcesso = null;
            return;
        }

        // Pré-carrega dados na primeira vez (cache)
        if (!_freightPreloaded) {
            _freightPreloaded = true;
            try { chrome.runtime.sendMessage({ action: 'analyzeFreight', processoId: '__preload__' }, function() {}); } catch(e) {}
        }

        // Procura o header "Identificação: IMXXXXX/XX"
        var headers = document.querySelectorAll('span, div, td');
        var processoId = null;
        for (var h = 0; h < headers.length; h++) {
            var txt = headers[h].textContent || '';
            var match = txt.match(/Identifica[çc][aã]o:\s*(IM\d+\/\d+)/i);
            if (match) {
                processoId = match[1];
                break;
            }
        }

        if (!processoId) return;
        if (processoId === _lastFreightProcesso) return;
        _lastFreightProcesso = processoId;

        // Remove painel antigo
        var oldPanel = document.getElementById('sk-freight-panel');
        if (oldPanel) oldPanel.remove();

        if (_freightAnalyzing) return;
        _freightAnalyzing = true;

        SkDebug.log('Frete', 'INFO', ' Analisando ' + processoId + '...');

        try { chrome.runtime.sendMessage(
            { action: 'analyzeFreight', processoId: processoId },
            function(response) {
                _freightAnalyzing = false;
                if (!response || !response.success) {
                    SkDebug.log('Frete', 'FAIL', ' ' + (response ? response.error : 'sem resposta'));
                    return;
                }
                var result = response.result;
                if (!result.found) {
                    SkDebug.log('Frete', 'INFO', ' Processo não encontrado na API');
                    return;
                }
                if (!result.applicable) {
                    SkDebug.log('Frete', 'INFO', ' ' + result.reason);
                    return;
                }
                if (result.noFreight) {
                    SkDebug.log('Frete', 'INFO', ' Sem custo de frete marítimo');
                    return;
                }
                injectFreightPanel(result);
            }
        );
        } catch(e) { _freightAnalyzing = false; }
    }

    function injectFreightPanel(data) {
        if (document.getElementById('sk-freight-panel')) return;

        var color, bg, border, icon, statusText;
        if (data.status === 'otimizado') {
            color = '#10b981'; bg = '#0f2a1f'; border = 'rgba(16,185,129,0.5)';
            statusText = 'Frete Otimizado';
        } else if (data.status === 'acima') {
            color = '#ef4444'; bg = '#2a0f0f'; border = 'rgba(239,68,68,0.5)';
            statusText = 'Acima do Mercado';
        } else {
            color = '#f59e0b'; bg = '#2a1f0f'; border = 'rgba(245,158,11,0.5)';
            statusText = 'Sem Tarifa de Referência';
        }

        var fretePago = data.fretePago ? 'US$ ' + data.fretePago.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : 'N/A';
        var melhorTarifa = data.melhorTarifa ? 'US$ ' + data.melhorTarifa.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : 'N/A';
        var diferenca = (typeof data.diferenca === 'number') ? 'US$ ' + Math.abs(data.diferenca).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';

        var html = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
        html += '<span style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0;box-shadow:0 0 8px ' + color + ';"></span>';
        html += '<strong style="font-size:14px;color:' + color + ';letter-spacing:-0.3px;">' + statusText + '</strong>';
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;color:#ccc;">';
        html += '<span>Rota:</span><strong style="color:#fff;">' + data.origem + ' → ' + data.destino + '</strong>';
        html += '<span>Armador atual:</span><strong style="color:#fff;">' + data.armador + '</strong>';
        html += '<span>Frete pago/cntr:</span><strong style="color:#fff;">' + fretePago + '</strong>';

        if (data.melhorTarifa !== null) {
            html += '<span>Melhor tarifa:</span><strong style="color:' + color + ';">' + melhorTarifa + '</strong>';
            html += '<span>Armador melhor:</span><strong style="color:#fff;">' + (data.melhorArmador || 'N/A') + '</strong>';
            html += '<span>Agente:</span><strong style="color:#fff;">' + (data.melhorAgente || 'N/A') + '</strong>';
            if (data.diferenca > 0) {
                html += '<span>Diferença:</span><strong style="color:#ef4444;">+' + diferenca + ' por cntr</strong>';
            }
            if (data.validade) {
                html += '<span>Validade:</span><strong style="color:#fff;">' + data.validade + '</strong>';
            }
        }
        html += '</div>';

        // Alternativas
        if (data.alternativas && data.alternativas.length > 1) {
            html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#999;">';
            html += '<strong>Outras opções:</strong><br>';
            for (var i = 1; i < data.alternativas.length && i < 3; i++) {
                var alt = data.alternativas[i];
                html += alt.armador + ' via ' + alt.agente + ': <strong style="color:#fff;">US$ ' + alt.frete.toLocaleString('pt-BR', {minimumFractionDigits:2}) + '</strong><br>';
            }
            html += '</div>';
        }

        var panel = document.createElement('div');
        panel.id = 'sk-freight-panel';
        panel.innerHTML = html;
        panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;' +
            'background:' + bg + ';backdrop-filter:blur(12px);border:1px solid ' + border + ';' +
            'border-radius:12px;padding:14px 18px;max-width:380px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:Inter,sans-serif;';

        // Botão "Alertar Pricing" (só aparece se acima do mercado)
        if (data.status === 'acima') {
            var alertBtn = document.createElement('button');
            alertBtn.textContent = 'Alertar Pricing';
            alertBtn.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px 12px;' +
                'background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;' +
                'font-size:12px;font-weight:600;transition:background 0.2s;';
            alertBtn.onmouseover = function() { this.style.background = '#dc2626'; };
            alertBtn.onmouseout = function() { this.style.background = '#ef4444'; };
            alertBtn.onclick = function() {
                chrome.storage.local.get('pricingEmail', function(stored) {
                    var pricingEmail = stored.pricingEmail || 'paulo.zanella@mondshipping.com.br';
                    var subject = encodeURIComponent('[Atom] Alerta Frete: ' + data.processoId + ' - ' + data.origem + ' > ' + data.destino);
                    var body = encodeURIComponent(
                        'Ol\u00e1,\n\n' +
                        'O processo ' + data.processoId + ' est\u00e1 com frete acima do mercado.\n\n' +
                        'Rota: ' + data.origem + ' > ' + data.destino + '\n' +
                        'Container: ' + data.tipoContainer + ' (' + data.numContainers + 'x)\n' +
                        'Armador atual: ' + data.armador + '\n' +
                        'Frete pago/cntr: ' + fretePago + '\n' +
                        'Melhor tarifa: ' + melhorTarifa + ' (' + (data.melhorArmador || 'N/A') + ' via ' + (data.melhorAgente || 'N/A') + ')\n' +
                        'Diferenca: +' + diferenca + ' por container\n' +
                        'Validade: ' + (data.validade || 'N/A') + '\n\n' +
                        'Enviado automaticamente por Atom - Mond Shipping.'
                    );
                    window.open('mailto:' + pricingEmail + '?subject=' + subject + '&body=' + body);
                });
                alertBtn.textContent = 'E-mail aberto';
                alertBtn.style.background = '#10b981';
                setTimeout(function() {
                    alertBtn.textContent = 'Alertar Pricing';
                    alertBtn.style.background = '#ef4444';
                }, 3000);
            };
            panel.appendChild(alertBtn);
        }

        // Botão fechar
        var closeBtn = document.createElement('span');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;font-size:16px;color:#666;';
        closeBtn.onclick = function() { panel.remove(); };
        panel.appendChild(closeBtn);

        document.body.appendChild(panel);
        SkDebug.log('Frete', 'OK', 'Painel: ' + data.status + ' | Pago: ' + fretePago + ' | Melhor: ' + melhorTarifa);
    }

    // ========================================================================
    // INIT — Inicializa tudo
    // ========================================================================

    createStatusHUD();
    if (typeof pdfjsLib !== 'undefined') { pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js'); }

    // Scanner de URL: mostra/esconde HUD baseado na pagina
    var lastUrl = location.href;
    function scanTable() {
        var isCambio = location.href.indexOf('/app/cambio') >= 0 || document.body.innerText.indexOf('Cambio:') >= 0;
        var hud = document.getElementById('sk-ai-hud');
        if (hud) hud.style.display = isCambio ? 'flex' : 'none';
        if (lastUrl !== location.href) { lastUrl = location.href; updateStatus("Pronto"); }
        scanForSerasa();
        scanForFreight();
    }

    var scanTimeout = null;
    var observer = new MutationObserver(function () {
        if (!_isCtxOk()) { observer.disconnect(); return; }
        if (scanTimeout) clearTimeout(scanTimeout); scanTimeout = setTimeout(scanTable, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanTable, 1000);

} catch (e) {
    console.error("Skychart AI: Erro fatal:", e);
}

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

    // Listener para notificações de atualização e tracking data
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'updateAvailable') {
            showToast('🔄 Nova versão ' + msg.newVersion + ' disponível! Peça ao admin para atualizar. ' + (msg.changelog || ''), 'warning', 15000);
        }
        if (msg.action === 'trackingDataReady') {
            handleTrackingData(msg.data, msg.error);
        }
    });

    // ========================================================================
    // BOOKING TRACKING — Botão 🔍 ao lado do campo Booking
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
        btn.innerHTML = '🤖 Rastrear';
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
        stopBtn.innerHTML = '⛔ Parar';
        stopBtn.title = 'Para o agente de tracking';
        stopBtn.style.cssText = 'display:none;background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:6px 10px;margin-left:4px;cursor:pointer;font-size:11px;font-weight:bold;vertical-align:middle;transition:all 0.2s ease;font-family:Arial,sans-serif;';
        stopBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.skTrackingStop = true;
            stopBtn.style.display = 'none';
            showToast('⛔ Tracking parado!', 'warning');
            SkDebug.log('Tracking', 'SKIP', '⛔ Parado pelo usuário');
        });
        bookingInput.parentElement.appendChild(stopBtn);

        // Mostra/esconde stop btn quando tracking roda
        btn.addEventListener('click', function() {
            stopBtn.style.display = 'inline-block';
        });

        console.log('[Tracking] Botão 🤖 + ⛔ injetados!');
    }

    function startBookingTracking(bookingInputRef) {
        var bookingInput = bookingInputRef;

        // Fallback se não recebeu o input
        if (!bookingInput) {
            bookingInput = document.querySelector('input[id*="eserva" i]:not([id*="previsao" i]):not([id*="confirmacao" i])');
        }

        var bookingNumber = bookingInput ? (bookingInput.value || bookingInput.textContent || '').trim() : '';

        if (!bookingNumber) {
            showToast('⚠️ Preencha o campo Booking antes de rastrear!', 'warning');
            return;
        }

        // Detecta o armador
        var carrier = detectCarrier();

        SkDebug.show();
        SkDebug.log('Tracking', 'EXEC', '🔍 Buscando: ' + bookingNumber + ' (' + carrier + ')');
        showToast('🔍 Buscando tracking: ' + bookingNumber + ' (' + carrier + ')...', 'info');

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
            SkDebug.log('Tracking', 'FAIL', '❌ Erro no tracking: ' + (error || 'Sem dados'));
            showToast('❌ Erro no tracking: ' + (error || 'Sem dados'), 'error');
            return;
        }

        if (!data.events || data.events.length === 0) {
            SkDebug.log('Tracking', 'FAIL', '⚠️ Nenhum evento de tracking encontrado');
            showToast('⚠️ Nenhum evento de tracking encontrado', 'warning');
            return;
        }

        SkDebug.log('Tracking', 'OK', '✅ Dados recebidos: Navio=' + data.vessel + ' Viagem=' + data.voyage);
        SkDebug.log('Tracking', 'INFO', '📍 Origem: ' + data.from + ' → Destino: ' + data.to);
        SkDebug.log('Tracking', 'INFO', '📅 Embarque: ' + data.departureDate + ' | ETA: ' + data.arrivalDate);
        SkDebug.log('Tracking', 'INFO', '🔄 Transbordos: ' + (data.transshipments ? data.transshipments.length : 0));

        showToast('✅ Tracking: ' + data.vessel + ' / ' + data.voyage + ' — preenchendo campos...', 'success');

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
                SkDebug.log('Tracking', 'SKIP', '⛔ Parado pelo usuário');
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
                SkDebug.log(fieldName, 'INFO', '👆 Clique no campo "' + fieldName + '" para eu aprender!');
                showToast('👆 CLIQUE no campo "' + fieldName + '" para o agente aprender!', 'warning', 30000);

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
                            SkDebug.log(fieldName, 'INFO', '⚠️ CSS path não é único, salvando por ÍNDICE');
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

                        SkDebug.log(fieldName, 'OK', '🧠 Aprendido! selector="' + selector + '"');
                        showToast('🧠 Aprendido: ' + fieldName + ' → ' + selector, 'success', 5000);
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
            SkDebug.log('Diagnóstico', 'INFO', '🔍 ' + allACs.length + ' autocompletes na página');

            // SCOPE: acha a seção accordion que contém o Viagem (âncora segura)
            var viagemAnchor = document.querySelector('#formularioEmbarque-dsViagem');
            var embarqueSection = viagemAnchor ? viagemAnchor.closest('.ui-accordion-content-wrapper, .ui-accordion-content, .ui-panel-content, form') : null;
            SkDebug.log('Diagnóstico', 'DEBUG', '📐 Seção: ' + (embarqueSection ? embarqueSection.tagName + '.' + (embarqueSection.className || '').substring(0, 30) : 'NÃO ENCONTRADA'));

            var found = null;
            for (var i = 0; i < allACs.length; i++) {
                var ac = allACs[i];

                // GUARD: rejeita AC que NÃO está dentro da seção Embarque
                if (embarqueSection && !embarqueSection.contains(ac)) {
                    SkDebug.log('AC[' + i + ']', 'DEBUG', '⏭️ fora do Embarque — ignorado');
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
                        SkDebug.log('Diagnóstico', 'OK', '📍 MATCH! AC[' + i + '] same TD contém "' + labelToFind + '"');
                    }
                }
                // Se prevTd contém "navio" mas NÃO "feeder" → match
                if (!found && prevTd.indexOf(labelToFind) >= 0) {
                    if (!labelToExclude || prevTd.indexOf(labelToExclude) < 0) {
                        found = ac;
                        SkDebug.log('Diagnóstico', 'OK', '📍 MATCH! AC[' + i + '] prev TD contém "' + labelToFind + '"');
                    }
                }
            }
            return found;
        }

        // ===== 1. NAVIO — Autocomplete =====
        if (!stopped()) {
            SkDebug.log('Navio', 'EXEC', '🚢 ' + data.vessel);
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
                            SkDebug.log('Navio', 'OK', '🧠 Memória válida: ' + navioSel);
                        } else if (memEl) {
                            SkDebug.log('Navio', 'FAIL', '🧠 Memória rejeitada (fora do Embarque): ' + navioSel);
                        }
                    }
                } catch(e) {}
            }

            // TENTATIVA 3: Pede ajuda
            if (!navioInput) {
                SkDebug.log('Navio', 'INFO', '🤔 Não achei. Clique no campo Navio!');
                navioInput = await askUserForField('Navio');
            }

            // PREENCHE com charByChar (PrimeNG precisa digitação gradual pro dropdown)
            if (navioInput) {
                SkDebug.log('Navio', 'INFO', '⌨️ "' + data.vessel + '"...');
                var r1 = await SkAgent.engine.charByChar(navioInput, data.vessel, { selectFirst: true, tabAfter: true });
                if (r1.ok) {
                    SkDebug.log('Navio', 'OK', '✅ ' + data.vessel + (r1.selected ? ' → ' + r1.selected : ''));
                } else {
                    SkDebug.log('Navio', 'FAIL', '❌ ' + (r1.reason || 'Erro'));
                }
            } else {
                SkDebug.log('Navio', 'SKIP', '⏭️ Pulando');
            }
            await SkAgent.delay(600);
        }

        // ===== 2. VIAGEM — #formularioEmbarque-dsViagem =====
        if (!stopped()) {
            SkDebug.log('Viagem', 'EXEC', '🧭 ' + data.voyage);
            var viagemInput = document.querySelector('#formularioEmbarque-dsViagem');
            if (viagemInput) {
                viagemInput.focus();
                viagemInput.click();
                SkAgent.engine.nativeSet(viagemInput, data.voyage);
                viagemInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
                viagemInput.dispatchEvent(new Event('blur', { bubbles: true }));
                SkAgent.highlight(viagemInput);
                SkDebug.log('Viagem', 'OK', '✅ ' + data.voyage);
            } else {
                SkDebug.log('Viagem', 'FAIL', '❌ #formularioEmbarque-dsViagem não existe');
            }
            await SkAgent.delay(600);
        }

        // ===== 3. PREVISÃO EMBARQUE — #formularioEmbarque-dtPrevisaoEmbarque =====
        if (!stopped()) {
            var embarqueDate = convertDate(data.departureDate);
            SkDebug.log('Prev. Embarque', 'EXEC', '📅 ' + embarqueDate);
            var embarqueInput = document.querySelector('#formularioEmbarque-dtPrevisaoEmbarque');
            if (embarqueInput) {
                var r3 = await SkAgent.engine.charByChar(embarqueInput, embarqueDate, { selectFirst: false, tabAfter: true });
                if (r3.ok) {
                    SkDebug.log('Prev. Embarque', 'OK', '✅ ' + embarqueDate);
                } else {
                    SkDebug.log('Prev. Embarque', 'FAIL', '❌ ' + (r3.reason || 'Erro'));
                }
            } else {
                SkDebug.log('Prev. Embarque', 'FAIL', '❌ #formularioEmbarque-dtPrevisaoEmbarque não existe');
            }
            await SkAgent.delay(600);
        }

        // ===== 4. PREVISÃO ATRACAÇÃO — #formularioEmbarque-dtPrevisaoAtracacao =====
        if (!stopped()) {
            var etaDate = convertDate(data.arrivalDate);
            SkDebug.log('Prev. Atracação', 'EXEC', '📅 ' + etaDate);
            var etaInput = document.querySelector('#formularioEmbarque-dtPrevisaoAtracacao');
            if (etaInput) {
                var r4 = await SkAgent.engine.charByChar(etaInput, etaDate, { selectFirst: false, tabAfter: true });
                if (r4.ok) {
                    SkDebug.log('Prev. Atracação', 'OK', '✅ ' + etaDate);
                } else {
                    SkDebug.log('Prev. Atracação', 'FAIL', '❌ ' + (r4.reason || 'Erro'));
                }
            } else {
                SkDebug.log('Prev. Atracação', 'FAIL', '❌ #formularioEmbarque-dtPrevisaoAtracacao não existe');
            }
            await SkAgent.delay(600);
        }

        // ===== 5. TRANSBORDOS =====
        if (!stopped() && data.transshipments && data.transshipments.length > 0) {
            SkDebug.log('Transbordos', 'INFO', '📦 ' + data.transshipments.length + ' transbordo(s):');
            for (var t = 0; t < data.transshipments.length; t++) {
                var ts = data.transshipments[t];
                SkDebug.log('Transbordo ' + (t + 1), 'INFO', '📍 ' + ts.port + ' | ' + ts.vesselIn + ' → ' + ts.vesselOut + ' | ' + convertDate(ts.arrivalDate) + ' → ' + convertDate(ts.departureDate));
            }
            showToast('📦 ' + data.transshipments.length + ' transbordo(s) detectado(s)', 'info', 5000);
        }

        // ===== 6. VERIFICAÇÃO + SELF-HEAL — Confere e corrige =====
        if (!stopped()) {
            await SkAgent.delay(800);
            SkDebug.log('Verificação', 'EXEC', '🔎 Conferindo campos preenchidos...');

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
                    SkDebug.log('Verificação', 'OK', '✅ ' + chk.label + ' = "' + val + '"');
                } else {
                    SkDebug.log('Verificação', 'FAIL', '❌ ' + chk.label + ' VAZIO! Tentando corrigir...');
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
                            SkDebug.log('Verificação', 'OK', '🔧 ' + chk.label + ' corrigido! = "' + newVal + '"');
                        } else {
                            SkDebug.log('Verificação', 'FAIL', '❌ ' + chk.label + ' ainda vazio após correção');
                        }
                    }
                }
            }

            if (allOk) {
                SkDebug.log('Verificação', 'OK', '✅ Todos campos conferidos!');
            }
        }

        // ===== 7. ATUALIZAR — Clica no botão Atualizar pra salvar =====
        if (!stopped()) {
            await SkAgent.delay(500);
            SkDebug.log('Atualizar', 'EXEC', '💾 Clicando em Atualizar...');

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
                SkDebug.log('Atualizar', 'INFO', '📍 Botão: ' + atualizarBtn.tagName + ' type=' + (atualizarBtn.type || '?'));
                atualizarBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await SkAgent.delay(800);

                // Clique NATIVO (dispara todos os handlers Angular)
                atualizarBtn.click();
                await SkAgent.delay(300);

                // Também dispara submit no form (pq é type="submit")
                var parentForm = atualizarBtn.closest('form');
                if (parentForm) {
                    parentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    SkDebug.log('Atualizar', 'INFO', '📤 Form submit disparado');
                }

                SkAgent.highlight(atualizarBtn);
                SkDebug.log('Atualizar', 'OK', '✅ Clicado + submit!');
                await SkAgent.delay(3000); // espera resposta do servidor
            } else {
                SkDebug.log('Atualizar', 'FAIL', '❌ Botão Atualizar não encontrado');
            }
        }

        if (!window.skTrackingStop) {
            SkDebug.log('Tracking', 'OK', '🏁 Concluído! Preencher → Verificar → Atualizar ✅');
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
                    updateStatus('📦 Extraindo ZIP...');
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
        pickBtn.innerHTML = '📁 <span style="font-weight:600;">Selecionar PDFs</span>';
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
        updateStatus('📦 Batch: ' + pdfFiles.length + ' PDFs');
        SkDebug.clear();
        SkDebug.show();
        SkDebug.log('Batch', 'EXEC', '📦 Modo batch: ' + pdfFiles.length + ' PDFs recebidos');

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
                    SkDebug.log('Batch', 'INFO', '📄 Contrato: ' + file.name + ' (n:' + (fields.numeroContrato || '?') + ' co:' + (foreignCo.substring(0,30) || '?') + ' usd:' + (usdValor || '?') + ')');
                } else {
                    // Swift — extrai Creditor Name e Amount
                    var swiftAmount = '';
                    var amtMatch = pdfText.match(/Amount[\s:]*([0-9][0-9.,]+)/i);
                    if (amtMatch) swiftAmount = amtMatch[1].replace(/[^\d.,]/g, '');

                    var swiftCreditor = '';
                    var credMatch = pdfText.match(/Creditor[\s\S]{0,80}?Name[\s:]*([A-Z][A-Z\s&.,]+)/i);
                    if (credMatch) swiftCreditor = credMatch[1].trim();

                    swifts.push({ file: file, text: pdfText, valor: swiftAmount, creditor: swiftCreditor, name: file.name });
                    SkDebug.log('Batch', 'INFO', '📋 Swift: ' + file.name + ' (usd:' + swiftAmount + ' creditor:' + (swiftCreditor.substring(0,30) || '?') + ')');
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
                SkDebug.log('Batch', 'INFO', '🔗 Par ' + (c+1) + ': ' + ct.name + (matchedSwift ? ' + ' + matchedSwift.name + ' (' + matchReason + ')' : ' (sem par)'));
            }

            // Fallback: pareia restantes por ordem
            var unmatchedC = pairs.filter(function(p) { return !p.swift; });
            var unmatchedS = swifts.filter(function(s) { return !s.matched; });
            if (unmatchedC.length > 0 && unmatchedS.length > 0) {
                var fbCount = Math.min(unmatchedC.length, unmatchedS.length);
                SkDebug.log('Batch', 'INFO', '🔄 Fallback por ordem: ' + fbCount + ' pares');
                for (var fb = 0; fb < fbCount; fb++) {
                    unmatchedC[fb].swift = unmatchedS[fb];
                    unmatchedS[fb].matched = true;
                    SkDebug.log('Batch', 'INFO', '🔗 Fallback: ' + unmatchedC[fb].contrato.name + ' + ' + unmatchedS[fb].name);
                }
            }

            for (var s2 = 0; s2 < swifts.length; s2++) {
                if (!swifts[s2].matched) {
                    SkDebug.log('Batch', 'INFO', '⚠️ Swift sem par: ' + swifts[s2].name);
                }
            }

            // 3. Processa cada par
            var results = [];

            for (var pi = 0; pi < pairs.length; pi++) {
                if (window.skStopActive) { SkDebug.log('Batch', 'INFO', '⛔ Batch abortado pelo usuário'); break; }

                var pair = pairs[pi];
                updateStatus('📦 Batch ' + (pi+1) + '/' + pairs.length + ': ' + (pair.contrato.fields.numeroContrato || pair.contrato.name));
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
                        SkDebug.log('Batch', 'FAIL', '❌ Não encontrou agente "' + agentName.substring(0,30) + '" na sidebar');
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
                    SkDebug.log('Batch', 'FAIL', '❌ Erro no par ' + (pi+1) + ': ' + err.message);
                    results.push({ num: pair.contrato.fields.numeroContrato || pair.contrato.name, status: 'FAIL', reason: err.message });
                }
            }

            // 4. Resumo final
            var okTotal = results.filter(function(r) { return r.status === 'OK'; }).length;
            var summary = '📦 Batch: ' + okTotal + '/' + results.length + ' fechamentos OK';
            SkDebug.log('Batch', okTotal === results.length ? 'OK' : 'FAIL', summary);
            results.forEach(function(r, i) {
                var icon = r.status === 'OK' ? '✅' : r.status === 'PARTIAL' ? '⚠️' : '❌';
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

        SkDebug.log('Batch', 'INFO', '🔍 Buscando agente: ' + agentName.substring(0, 40) + ' (palavras: ' + agentWords.join(', ') + ')');

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
                SkDebug.log('Batch', 'OK', '✅ Já está no agente correto (row ' + bestIdx + ', score ' + bestScore + ')');
                return true;
            }
            SkDebug.log('Batch', 'INFO', '➡️ Clicando no agente (row ' + bestIdx + ', score ' + bestScore + '): ' + bestMatch.textContent.trim().substring(0, 50));
            bestMatch.click();
            await delay(3000); // Espera o formulário carregar
            return true;
        } else if (isFirst) {
            // No primeiro item, assume que já está na tela certa
            SkDebug.log('Batch', 'INFO', '⚠️ Não encontrou match forte (score=' + bestScore + '), mas é o primeiro — assume tela atual');
            return true;
        } else {
            SkDebug.log('Batch', 'FAIL', '❌ Nenhum match na sidebar (melhor score=' + bestScore + ')');
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
                { id: "valor_contrato", label: "Valor Contrato", findByLabel: "Valor do contrato de c", pdfField: "despesaBancaria", order: 7, delayAfter: 300 },
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
                { action: "clickRowSave", label: "Salvar tipo arquivo (Swift)", delay: 1500, retryDelay: 2000 }
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

        // Cria botão ao lado do accordion "Controle de créditos"
        var btn = document.createElement('button');
        btn.className = 'sk-serasa-btn';
        btn.innerHTML = '📊 Analisar Serasa';
        btn.style.cssText = 'margin:5px 0 5px 10px;padding:6px 14px;background:linear-gradient(135deg,#1565C0,#42A5F5);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        btn.title = 'Lê o PDF Serasa e preenche Score + Limite no Controle de Créditos';
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            startSerasaAnalysis();
        });
        creditoHeader.parentElement.insertBefore(btn, creditoHeader);
        SkDebug.log('Serasa', 'OK', '📊 Botão injetado (perto de Controle de Créditos)');
    }

    async function startSerasaAnalysis() {
        SkDebug.log('Serasa', 'EXEC', '📊 Iniciando análise Serasa...');
        showToast('📊 Analisando Serasa...', 'info', 5000);

        // 0. Abre accordion "Documentos" se fechado (Angular não renderiza conteúdo quando fechado)
        var docHeaderSpans = document.querySelectorAll('span.ui-accordion-header-text');
        var docOpened = false;
        for (var dh = 0; dh < docHeaderSpans.length; dh++) {
            var spanText = docHeaderSpans[dh].textContent.trim();
            if (spanText === 'Documentos') {
                // Clica no header (ou no <a> pai)
                var clickable = docHeaderSpans[dh].closest('a, .ui-accordion-header') || docHeaderSpans[dh];
                SkDebug.log('Serasa', 'INFO', '📂 Clicando em "Documentos" (' + clickable.tagName + ')...');
                clickable.click();
                docOpened = true;
                await new Promise(function(resolve) { setTimeout(resolve, 2500); });
                break;
            }
        }
        if (!docOpened) {
            SkDebug.log('Serasa', 'FAIL', '❌ Accordion "Documentos" não encontrado. Spans: ' + 
                Array.from(docHeaderSpans).map(function(s) { return '"' + s.textContent.trim() + '"'; }).join(', '));
        }

        // 1. Busca DIRETA: link com href contendo "serasa" (mais confiável que buscar row)
        var pdfUrl = null;
        var allLinks = document.querySelectorAll('a[href]');
        for (var al = 0; al < allLinks.length; al++) {
            if (allLinks[al].href.toLowerCase().indexOf('serasa') >= 0) {
                pdfUrl = allLinks[al].href;
                SkDebug.log('Serasa', 'OK', '🔗 Link direto: ' + pdfUrl.substring(0, 80));
                break;
            }
        }

        // 2. Fallback: busca row na grid com "Serasa" e pega o download icon
        if (!pdfUrl) {
            var docRows = document.querySelectorAll('tr');
            SkDebug.log('Serasa', 'DEBUG', '🔍 ' + docRows.length + ' <tr> na página');
            var serasaRow = null;
            for (var r = 0; r < docRows.length; r++) {
                var rowText = docRows[r].textContent;
                if (rowText.indexOf('Serasa') >= 0 || rowText.indexOf('serasa') >= 0 || rowText.indexOf('SERASA') >= 0) {
                    serasaRow = docRows[r];
                    SkDebug.log('Serasa', 'OK', '📄 Row[' + r + ']: ' + rowText.trim().substring(0, 80));
                    break;
                }
            }

            if (serasaRow) {
                // Busca link de download na row
                var dlIcon = serasaRow.querySelector('.fa-download');
                var dlLink = dlIcon ? dlIcon.closest('a') : null;
                if (dlLink && dlLink.href) {
                    pdfUrl = dlLink.href;
                    SkDebug.log('Serasa', 'OK', '🔗 Link do ícone: ' + pdfUrl.substring(0, 80));
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
                        SkDebug.log('Serasa', 'OK', '🔗 Link fallback: ' + pdfUrl.substring(0, 80));
                    }
                    // NÃO clica aqui! O clique acontece via background (captureNewTabUrl)
                }
            } else {
                SkDebug.log('Serasa', 'FAIL', '❌ Nenhuma row com "Serasa" encontrada');
                showToast('❌ PDF Serasa não encontrado na grid de Documentos', 'warning', 5000);
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
                    SkDebug.log('Serasa', 'INFO', '🔗 Capturando URL via background...');

                    // Background: registra listener → manda clicar → captura URL → fecha aba
                    var urlResponse = await new Promise(function(resolve) {
                        chrome.runtime.sendMessage(
                            { action: 'captureNewTabUrl' },
                            function(response) { resolve(response); }
                        );
                    });

                    if (urlResponse && urlResponse.success && urlResponse.url) {
                        pdfUrl = urlResponse.url;
                        SkDebug.log('Serasa', 'OK', '🔗 URL capturada: ' + pdfUrl.substring(0, 80));
                    } else {
                        SkDebug.log('Serasa', 'FAIL', '❌ ' + (urlResponse ? urlResponse.error : 'sem resposta'));
                        showToast('❌ Não consegui capturar URL do PDF', 'warning', 5000);
                        return;
                    }
                }
            }
            if (!pdfUrl) {
                SkDebug.log('Serasa', 'FAIL', '❌ Nenhuma forma de acessar o PDF');
                showToast('❌ Não consegui acessar o PDF Serasa', 'warning', 5000);
                return;
            }
        }

        // Fetch local (content script tem os cookies do Skychart!)
        try {
            SkDebug.log('Serasa', 'INFO', '📥 Baixando PDF (com cookies)...');
            var resp = await fetch(pdfUrl, { credentials: 'include' });
            var blob = await resp.blob();
            SkDebug.log('Serasa', 'INFO', '📥 Blob: ' + blob.size + ' bytes, tipo: ' + blob.type);

            var base64 = await new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload = function() { resolve(reader.result.split(',')[1]); };
                reader.readAsDataURL(blob);
            });

            SkDebug.log('Serasa', 'OK', '📥 PDF: ' + Math.round(base64.length / 1024) + 'KB');
            showToast('📊 Extraindo Score e Limite via regex...', 'info', 5000);

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

            SkDebug.log('Serasa', 'INFO', '📄 Texto extraído: ' + fullText.substring(0, 200));

            // Regex: Score (ex: "Score 952 /1000" ou "Score 952")
            var scoreMatch = fullText.match(/Score\s+(\d{1,4})/i);
            var score = scoreMatch ? scoreMatch[1] : null;

            // Regex: Limite de Crédito (ex: "Total de R$ 13.256.268,00")
            // Procura "Limite de Crédito" e depois o primeiro "Total de R$" ou "R$" com valor
            var limiteSection = fullText.substring(fullText.search(/Limite de Cr[eé]dito/i));
            var limiteMatch = limiteSection.match(/(?:Total de\s*)?R\$\s*([\d.,]+)/i);
            var limiteCredito = limiteMatch ? limiteMatch[1] : null;

            SkDebug.log('Serasa', 'OK', '📊 Score: ' + score + ' | Limite: R$ ' + limiteCredito);

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
                SkDebug.log('Serasa', 'INFO', '🤖 Texto vazio, usando Gemini como fallback...');
                showToast('🤖 PDF é imagem, enviando pro Gemini...', 'info', 10000);

                var geminiResponse = await new Promise(function(resolve) {
                    chrome.runtime.sendMessage(
                        { action: 'extractSerasaData', pdfBase64: base64 },
                        function(response) { resolve(response); }
                    );
                });

                if (!geminiResponse || !geminiResponse.success) {
                    SkDebug.log('Serasa', 'FAIL', '❌ Gemini: ' + (geminiResponse ? geminiResponse.error : 'sem resposta'));
                    showToast('❌ Gemini não conseguiu extrair dados', 'warning', 5000);
                    return;
                }

                serasaData = geminiResponse.result;
                SkDebug.log('Serasa', 'OK', '🤖 Gemini: Score ' + serasaData.score + ' | Limite: R$ ' + serasaData.limiteCredito);
            }

            await fillSerasaFields(serasaData);

        } catch (err) {
            SkDebug.log('Serasa', 'FAIL', '❌ Erro: ' + err.message);
            showToast('❌ Erro: ' + err.message, 'warning', 5000);
        }
    }

    // Listener pro background pedir pra clicar no download
    chrome.runtime.onMessage.addListener(function(msg) {
        if (msg.action === 'clickSerasaDownload' && window._serasaDlBtn) {
            SkDebug.log('Serasa', 'INFO', '🖱️ Background pediu: clicando download...');
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
            SkDebug.log('Serasa', 'OK', '💰 Valor Serasa: ' + limite);
        } else {
            SkDebug.log('Serasa', 'FAIL', '❌ #vlSerasa não encontrado');
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
            SkDebug.log('Serasa', 'OK', '📝 Observação preenchida');
        } else {
            SkDebug.log('Serasa', 'FAIL', '❌ #dsObservacao não encontrado');
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
                SkDebug.log('Serasa', 'OK', '💾 Atualizar clicado');
                break;
            }
        }

        showToast('✅ Serasa: Score ' + serasaData.score + ' | Limite R$ ' + Number(serasaData.limiteCredito || 0).toLocaleString('pt-BR'), 'success', 8000);
        SkDebug.log('Serasa', 'OK', '🏁 Concluído!');

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
                SkDebug.log('Serasa', 'OK', '💾 Score salvo: ' + storageKey);
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
            color = '#10b981'; bg = 'rgba(16, 185, 129, 0.15)'; emoji = '🟢';
        } else if (score >= 400) {
            color = '#f59e0b'; bg = 'rgba(245, 158, 11, 0.15)'; emoji = '🟡';
        } else {
            color = '#ef4444'; bg = 'rgba(239, 68, 68, 0.15)'; emoji = '🔴';
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

        SkDebug.log('Serasa', 'OK', '🏷️ Badge Score ' + score + ' injetado');
    }

    // ========================================================================
    // FRETE: Comparação de frete no operacional
    // ========================================================================

    var _lastFreightProcesso = null;
    var _freightAnalyzing = false;
    var _freightPreloaded = false;

    function scanForFreight() {
        if (location.href.indexOf('/app/operacional') < 0) {
            var freightPanel = document.getElementById('sk-freight-panel');
            if (freightPanel) freightPanel.remove();
            _lastFreightProcesso = null;
            return;
        }

        // Pré-carrega dados na primeira vez (cache)
        if (!_freightPreloaded) {
            _freightPreloaded = true;
            chrome.runtime.sendMessage({ action: 'analyzeFreight', processoId: '__preload__' }, function() {});
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

        SkDebug.log('Frete', 'INFO', '📊 Analisando ' + processoId + '...');

        chrome.runtime.sendMessage(
            { action: 'analyzeFreight', processoId: processoId },
            function(response) {
                _freightAnalyzing = false;
                if (!response || !response.success) {
                    SkDebug.log('Frete', 'FAIL', '❌ ' + (response ? response.error : 'sem resposta'));
                    return;
                }
                var result = response.result;
                if (!result.found) {
                    SkDebug.log('Frete', 'INFO', '⚠️ Processo não encontrado na API');
                    return;
                }
                if (!result.applicable) {
                    SkDebug.log('Frete', 'INFO', '⚠️ ' + result.reason);
                    return;
                }
                if (result.noFreight) {
                    SkDebug.log('Frete', 'INFO', '⚠️ Sem custo de frete marítimo');
                    return;
                }
                injectFreightPanel(result);
            }
        );
    }

    function injectFreightPanel(data) {
        if (document.getElementById('sk-freight-panel')) return;

        var color, bg, border, icon, statusText;
        if (data.status === 'otimizado') {
            color = '#10b981'; bg = '#0f2a1f'; border = 'rgba(16,185,129,0.5)';
            icon = '✅'; statusText = 'Frete Otimizado';
        } else if (data.status === 'acima') {
            color = '#ef4444'; bg = '#2a0f0f'; border = 'rgba(239,68,68,0.5)';
            icon = '🔴'; statusText = 'Acima do Mercado';
        } else {
            color = '#f59e0b'; bg = '#2a1f0f'; border = 'rgba(245,158,11,0.5)';
            icon = '⚠️'; statusText = 'Sem Tarifa de Referência';
        }

        var fretePago = data.fretePago ? 'US$ ' + data.fretePago.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : 'N/A';
        var melhorTarifa = data.melhorTarifa ? 'US$ ' + data.melhorTarifa.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : 'N/A';
        var diferenca = (typeof data.diferenca === 'number') ? 'US$ ' + Math.abs(data.diferenca).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';

        var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
        html += '<span style="font-size:18px;">' + icon + '</span>';
        html += '<strong style="font-size:14px;color:' + color + ';">' + statusText + '</strong>';
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
            alertBtn.textContent = '📧 Alertar Pricing';
            alertBtn.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px 12px;' +
                'background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;' +
                'font-size:12px;font-weight:600;transition:background 0.2s;';
            alertBtn.onmouseover = function() { this.style.background = '#dc2626'; };
            alertBtn.onmouseout = function() { this.style.background = '#ef4444'; };
            alertBtn.onclick = function() {
                chrome.storage.local.get('pricingEmail', function(stored) {
                    var pricingEmail = stored.pricingEmail || 'paulo.zanella@mondshipping.com.br';
                    var subject = encodeURIComponent('⚠️ Alerta Frete: ' + data.processoId + ' - ' + data.origem + ' → ' + data.destino);
                    var body = encodeURIComponent(
                        'Olá,\n\n' +
                        'O processo ' + data.processoId + ' está com frete acima do mercado.\n\n' +
                        '📍 Rota: ' + data.origem + ' → ' + data.destino + '\n' +
                        '📦 Container: ' + data.tipoContainer + ' (' + data.numContainers + 'x)\n' +
                        '🚢 Armador atual: ' + data.armador + '\n' +
                        '💰 Frete pago/cntr: ' + fretePago + '\n' +
                        '✅ Melhor tarifa: ' + melhorTarifa + ' (' + (data.melhorArmador || 'N/A') + ' via ' + (data.melhorAgente || 'N/A') + ')\n' +
                        '📊 Diferença: +' + diferenca + ' por container\n' +
                        '📅 Validade: ' + (data.validade || 'N/A') + '\n\n' +
                        'Enviado automaticamente pela extensão Skychart AI.'
                    );
                    window.open('mailto:' + pricingEmail + '?subject=' + subject + '&body=' + body);
                });
                alertBtn.textContent = '✅ E-mail aberto!';
                alertBtn.style.background = '#10b981';
                setTimeout(function() {
                    alertBtn.textContent = '📧 Alertar Pricing';
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
        SkDebug.log('Frete', 'OK', '📊 Painel: ' + data.status + ' | Pago: ' + fretePago + ' | Melhor: ' + melhorTarifa);
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
    var observer = new MutationObserver(function () { if (scanTimeout) clearTimeout(scanTimeout); scanTimeout = setTimeout(scanTable, 500); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanTable, 1000);

} catch (e) {
    console.error("Skychart AI: Erro fatal:", e);
}

// ============================================================
// CHECK AGENT — Cotação vs Custos/Itens
// Compara oferta PDF com aba Custos (operacional) ou Itens (financeiro)
// ============================================================
(function () {
    'use strict';

    var TAG = '[Check Agent]';
    var checkBtnInjected = false;

    // Guard: detecta se a extensão foi recarregada (evita "Extension context invalidated")
    function isContextValid() {
        try { return !!chrome.runtime && !!chrome.runtime.id; } catch (e) { return false; }
    }

    // Detecta qual módulo estamos
    function getModulo() {
        if (location.href.indexOf('/app/operacional') >= 0) return 'operacional';
        if (location.href.indexOf('/app/financeiro') >= 0) return 'financeiro';
        return null;
    }

    // Listener: background manda clicar o download (padrão Serasa)
    try {
        chrome.runtime.onMessage.addListener(function (request) {
            if (request.action === 'clickCheckDownload' && window._checkDlBtn) {
                console.log(TAG, 'Background pediu clique no download');
                window._checkDlBtn.click();
            }
        });
    } catch (e) { console.log(TAG, 'Context invalidated (listener), ignorando.'); }

    // ===== OBSERVER: Detecta quando Custos/Itens é aberto =====
    // Cache de permissões (atualiza a cada 10s ou no primeiro check)
    var _allowedAgents = null;
    var _lastPermCheck = 0;

    function checkPermission(modulo, callback) {
        if (!isContextValid()) return; // Extension foi recarregada
        var now = Date.now();
        if (_allowedAgents && (now - _lastPermCheck) < 10000) {
            var needed = modulo === 'operacional' ? 'chequeio-op' : 'chequeio-fin';
            callback(_allowedAgents.indexOf(needed) >= 0);
            return;
        }
        try {
            chrome.storage.local.get(['enabledAgents', 'userProfile'], function (d) {
                // Master ou sem perfil definido = tudo liberado
                if (!d.userProfile || d.userProfile === 'master' || !d.enabledAgents) {
                    _allowedAgents = ['chequeio-op', 'chequeio-fin'];
                } else {
                    _allowedAgents = d.enabledAgents || [];
                }
                _lastPermCheck = Date.now();
                var needed = modulo === 'operacional' ? 'chequeio-op' : 'chequeio-fin';
                callback(_allowedAgents.indexOf(needed) >= 0);
            });
        } catch (e) { console.log(TAG, 'Context invalidated (storage), ignorando.'); }
    }

    var observer = new MutationObserver(function () {
        // Guard: se extensão recarregou, para de observar
        if (!isContextValid()) {
            observer.disconnect();
            console.log(TAG, 'Context invalidated, observer desconectado.');
            return;
        }
        // Se botão foi removido do DOM (Angular re-renderiza), reseta flag
        if (checkBtnInjected && !document.getElementById('sk-check-btn')) {
            checkBtnInjected = false;
        }
        if (checkBtnInjected) return;

        var modulo = getModulo();
        if (!modulo) return;

        // Verifica permissão do perfil antes de injetar
        checkPermission(modulo, function (allowed) {
            if (!allowed) return;

            if (modulo === 'operacional') {
                // Procura o accordion de Custos expandido
                var custosHeader = findAccordionHeader('Custos');
                if (!custosHeader) return;

                var actionBtns = document.querySelectorAll('button');
                var anchorBtn = null;
                for (var i = 0; i < actionBtns.length; i++) {
                    var txt = (actionBtns[i].textContent || '').trim().toLowerCase();
                    if (txt.indexOf('recalcular') >= 0 || txt.indexOf('atualizar deb') >= 0 || txt.indexOf('chequeio') >= 0) {
                        anchorBtn = actionBtns[i];
                    }
                }
                if (anchorBtn) injectCheckButton(anchorBtn);
            }

            if (modulo === 'financeiro') {
                // Financeiro: busca Atualizar/Excluir DENTRO de APP-FATURA-IDENTIFICACAO
                var faturaIdent = document.querySelector('APP-FATURA-IDENTIFICACAO, app-fatura-identificacao');
                if (faturaIdent) {
                    var identBtns = faturaIdent.querySelectorAll('button');
                    var anchorBtn = null;
                    for (var j = 0; j < identBtns.length; j++) {
                        var btxt = (identBtns[j].textContent || '').trim().toLowerCase();
                        if (btxt === 'excluir') {
                            anchorBtn = identBtns[j];
                            break;
                        }
                    }
                    if (!anchorBtn) {
                        for (var j2 = 0; j2 < identBtns.length; j2++) {
                            var btxt2 = (identBtns[j2].textContent || '').trim().toLowerCase();
                            if (btxt2 === 'atualizar') {
                                anchorBtn = identBtns[j2];
                                break;
                            }
                        }
                    }
                    if (anchorBtn) injectCheckButton(anchorBtn);
                }
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log(TAG, 'Script carregado');

    // ===== INJETA BOTÃO CHEQUEIO =====
    function injectCheckButton(nearBtn) {
        if (checkBtnInjected) return;
        if (document.getElementById('sk-check-btn')) return;

        var btn = document.createElement('button');
        btn.id = 'sk-check-btn';
        btn.textContent = 'Chequeio';
        btn.style.cssText = 'margin-left:10px;padding:6px 18px;background:linear-gradient(135deg,#6C63FF,#4ECDC4);color:#fff;border:none;border-radius:6px;font-weight:bold;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(108,99,255,0.3);transition:all 0.2s;';
        btn.onmouseenter = function () { btn.style.transform = 'scale(1.05)'; btn.style.boxShadow = '0 4px 15px rgba(108,99,255,0.5)'; };
        btn.onmouseleave = function () { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 2px 8px rgba(108,99,255,0.3)'; };

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            runCheck();
        });

        nearBtn.parentElement.appendChild(btn);
        checkBtnInjected = true;
        console.log(TAG, 'Botão Chequeio injetado');
    }

    // ===== FLUXO PRINCIPAL =====
    async function runCheck() {
        var modulo = getModulo();
        console.log(TAG, '=== INICIANDO CHEQUEIO (' + modulo + ') ===');
        showLoadingPanel('Lendo ' + (modulo === 'financeiro' ? 'itens' : 'custos') + '...');

        // 1. Lê tabela de Custos/Itens
        var custos = readCustosTable(modulo);
        console.log(TAG, 'Itens lidos:', custos.length, 'linhas');
        custos.forEach(function (c) {
            console.log(TAG, '  Item:', c.taxa, '|', c.moeda, '|', c.totalVenda);
        });

        if (custos.length === 0) {
            showResultsPanel([{ status: 'error', message: 'Nenhum item encontrado na tabela' }]);
            return;
        }

        // 2. Vai pra aba Arquivos e busca Cotação Cliente
        updateLoadingPanel('Buscando cotação na aba Arquivos...');
        var pdfText = await findAndDownloadCotacao(modulo);

        if (!pdfText) {
            showResultsPanel([{ status: 'error', message: 'Cotação Cliente não encontrada na aba Arquivos' }]);
            return;
        }

        // 3. Parseia o PDF
        updateLoadingPanel('Analisando cotação...');
        var cotacaoItems = parseCotacaoPDF(pdfText);
        console.log(TAG, 'Cotação parseada:', cotacaoItems.length, 'itens');
        cotacaoItems.forEach(function (c) {
            console.log(TAG, '  Cotação:', c.taxa, '|', c.moeda, '|', c.valor);
        });

        // 4. Compara
        updateLoadingPanel('Comparando...');
        var results = compareLineByLine(custos, cotacaoItems);

        // 5. Exibe resultado
        showResultsPanel(results);
        console.log(TAG, '=== CHEQUEIO FINALIZADO ===');

        // Analytics: registra checagem
        try {
            var erros = results.filter(function (r) { return r.status === 'divergencia' || r.status === 'error' || r.status === 'warning'; }).length;
            var acertos = results.filter(function (r) { return r.status === 'ok'; }).length;
            var totalComparados = results.filter(function (r) { return r.status === 'ok' || r.status === 'divergencia'; }).length;
            // Captura processo/fatura do header, breadcrumb, ou URL
            var processoRef = '';
            // Try multiple selectors for process number
            var processSelectors = [
                '#identificacao .ui-accordion-header',          // Operacional accordion
                '.processo-header', '.header-processo',          // Generic headers
                'h1', 'h2',                                      // Page titles
                '.breadcrumb', '.breadcrumbs',                   // Breadcrumbs
                '.ui-accordion-header:first-child',              // First accordion
                '[class*="identificacao"]',                       // Anything identification
                'app-breadcrumb', 'app-header .title',           // Angular components
                '.page-title', '.processo-info'                  // More generic
            ];
            var processRegex = /(IM\d+\/\d+|EX\d+\/\d+|FA\d+\/?\d*|IM\d{5,})/i;
            for (var pi = 0; pi < processSelectors.length && !processoRef; pi++) {
                var els = document.querySelectorAll(processSelectors[pi]);
                for (var pe = 0; pe < els.length && !processoRef; pe++) {
                    var txt = els[pe].textContent || '';
                    var pm = txt.match(processRegex);
                    if (pm) processoRef = pm[1];
                }
            }
            if (!processoRef) {
                // Fallback: try document title
                var titleMatch = (document.title || '').match(processRegex);
                if (titleMatch) processoRef = titleMatch[1];
            }
            if (!processoRef) {
                var urlMatch = location.href.match(/\/(\d+)$/);
                if (urlMatch) processoRef = urlMatch[1];
            }
            AtomAnalytics.log('check', 'chequeio_concluido', {
                modulo: modulo,
                processo: processoRef,
                totalItens: totalComparados,
                errosEncontrados: erros,
                itensOk: acertos,
                taxaAcerto: totalComparados > 0 ? Math.round((acertos / totalComparados) * 100) : 100
            });
        } catch (e) { }

        // 6. Auditoria Gemini — verifica assertividade da leitura
        try {
            auditWithGemini(custos, modulo, processoRef, cotacaoItems, results);
        } catch (e) { console.log(TAG, 'Erro na auditoria:', e); }
    }

    // ===== AUDITORIA GEMINI (3-way: DOM + PDF + Resultado) =====
    // Re-lê o DOM independentemente, cruza com PDF e com o resultado do agente
    async function auditWithGemini(custos, modulo, processoRef, cotacaoItems, results) {
        if (!results || results.length < 2) return;
        console.log(TAG, '=== AUDITORIA GEMINI (3-WAY) ===');

        // Seleciona até 3 itens dos RESULTADOS que têm match
        var matchedResults = results.filter(function(r) { return r.status === 'ok' || r.status === 'divergencia'; });
        if (matchedResults.length < 1) return;
        var sampleSize = Math.min(3, matchedResults.length);
        var shuffled = matchedResults.slice().sort(function() { return 0.5 - Math.random(); });
        var samples = shuffled.slice(0, sampleSize);

        // 1. RE-LÊ O DOM — busca os valores diretamente da tabela visível
        var domSnapshot = [];
        try {
            var allRows = document.querySelectorAll('table tbody tr');
            samples.forEach(function(sample) {
                var found = false;
                for (var r = 0; r < allRows.length && !found; r++) {
                    var cells = allRows[r].querySelectorAll('td');
                    if (cells.length < 3) continue;
                    var rowText = allRows[r].textContent || '';
                    if (rowText.toLowerCase().indexOf(sample.taxaCustos.toLowerCase().substring(0, 8)) >= 0) {
                        var cellTexts = [];
                        for (var c = 0; c < cells.length; c++) {
                            cellTexts.push(cells[c].textContent.trim());
                        }
                        domSnapshot.push({
                            taxa: sample.taxaCustos,
                            rawCells: cellTexts.join(' | '),
                            taxaCotacao: sample.taxaCotacao,
                            valorCotacao: sample.valorCotacao,
                            valorSistema: sample.valorCustos,
                            agentMatch: sample.status
                        });
                        found = true;
                    }
                }
            });
        } catch(e) { console.log(TAG, 'Erro lendo DOM para auditoria:', e); }

        if (domSnapshot.length === 0) {
            console.log(TAG, 'Nao conseguiu re-ler linhas do DOM, abortando auditoria');
            return;
        }

        // 2. MONTA PROMPT — Gemini recebe as 3 fontes e audita
        var prompt = 'Voce e um auditor financeiro. Preciso que voce verifique se uma ferramenta de chequeio automatico esta lendo corretamente os valores.\n\n';
        prompt += 'Para cada item abaixo, voce recebe 3 fontes:\n';
        prompt += '- CELULAS DO DOM: texto bruto lido diretamente da tabela HTML do sistema\n';
        prompt += '- COTACAO (PDF): valor que veio da cotacao/oferta do cliente (PDF)\n';
        prompt += '- RESULTADO DO AGENTE: o que nossa ferramenta interpretou como valor do sistema\n\n';
        prompt += 'Verifique se o RESULTADO DO AGENTE leu corretamente o valor do DOM, e se o valor da COTACAO bate.\n';
        prompt += 'Responda APENAS em JSON: [{"taxa": "...", "domCorreto": true/false, "cotacaoCorreta": true/false}]\n\n';

        domSnapshot.forEach(function(d, i) {
            prompt += '--- Item ' + (i+1) + ' ---\n';
            prompt += 'Taxa: "' + d.taxa + '"\n';
            prompt += 'CELULAS DO DOM: "' + d.rawCells + '"\n';
            prompt += 'COTACAO (PDF): "' + d.valorCotacao + '" (taxa original: "' + d.taxaCotacao + '")\n';
            prompt += 'RESULTADO DO AGENTE: sistema=' + d.valorSistema + ' | status=' + d.agentMatch + '\n\n';
        });

        console.log(TAG, 'Enviando', domSnapshot.length, 'itens para auditoria 3-way');

        try {
            var geminiResult = await new Promise(function(resolve) {
                chrome.runtime.sendMessage({
                    action: 'askGemini',
                    prompt: prompt
                }, function(response) {
                    resolve(response);
                });
            });

            if (!geminiResult || !geminiResult.text) {
                console.log(TAG, 'Gemini nao respondeu na auditoria');
                return;
            }

            var responseText = geminiResult.text;
            var jsonMatch = responseText.match(/\[[\s\S]*?\]/);
            if (!jsonMatch) {
                console.log(TAG, 'Gemini nao retornou JSON valido:', responseText.substring(0, 200));
                return;
            }

            var geminiAudit = JSON.parse(jsonMatch[0]);
            var totalAudited = 0;
            var totalCorrect = 0;

            geminiAudit.forEach(function(item) {
                totalAudited++;
                var domOk = item.domCorreto === true;
                var cotOk = item.cotacaoCorreta === true;
                if (domOk && cotOk) totalCorrect++;
                console.log(TAG, '  Audit:', item.taxa, '| DOM:', domOk ? 'OK' : 'ERRO', '| Cotacao:', cotOk ? 'OK' : 'ERRO');
            });

            if (totalAudited > 0) {
                var assertividade = Math.round((totalCorrect / totalAudited) * 100);
                console.log(TAG, 'Assertividade 3-way:', assertividade + '% (' + totalCorrect + '/' + totalAudited + ')');

                AtomAnalytics.log('check', 'auditoria_assertividade', {
                    modulo: modulo,
                    processo: processoRef,
                    totalAuditado: totalAudited,
                    corretos: totalCorrect,
                    assertividade: assertividade,
                    method: '3way'
                });
            }
        } catch (e) {
            console.log(TAG, 'Erro auditoria Gemini:', e.message || e);
        }
    }


    // ===== LÊ TABELA DE CUSTOS (operacional) OU ITENS (financeiro) =====
    function readCustosTable(modulo) {
        var items = [];

        // PrimeNG datatable usa DUAS tabelas separadas:
        // Header: ui-datatable-scrollable-header-box > table (THs)
        // Body:   ui-datatable-scrollable-table-wrapper > table (TDs)

        var headerTable = null;
        var allTables = document.querySelectorAll('table');

        for (var t = 0; t < allTables.length; t++) {
            var headers = allTables[t].querySelectorAll('th');
            if (headers.length < 5) continue;

            var colNames = [];
            for (var h = 0; h < headers.length; h++) {
                colNames.push((headers[h].textContent || '').trim().toLowerCase());
            }
            var colStr = colNames.join('|');

            if (modulo === 'financeiro') {
                // Financeiro: procura "custo" + "total" nos THs
                if (colStr.indexOf('custo') >= 0 && colStr.indexOf('total') >= 0 && colStr.indexOf('moeda') >= 0) {
                    headerTable = allTables[t];
                    console.log(TAG, 'Header table (financeiro) encontrada! THs:', headers.length);
                    break;
                }
            } else {
                // Operacional: procura "taxa" + "venda" nos THs (>10 cols)
                if (headers.length >= 10 && colStr.indexOf('taxa') >= 0 && colStr.indexOf('venda') >= 0) {
                    headerTable = allTables[t];
                    console.log(TAG, 'Header table (operacional) encontrada! THs:', headers.length);
                    break;
                }
            }
        }

        if (!headerTable) {
            console.log(TAG, 'Header table não encontrada');
            return items;
        }

        // Mapeia colunas
        var ths = headerTable.querySelectorAll('th');
        var colMap = {};
        for (var ci = 0; ci < ths.length; ci++) {
            var colText = (ths[ci].textContent || '').trim().toLowerCase();

            if (modulo === 'financeiro') {
                // Financeiro: Custo = taxa, moeda = moeda, Total = totalVenda
                if (colText === 'custo' && colMap.taxa === undefined) colMap.taxa = ci;
                if (colText === 'moeda' && colMap.moeda === undefined) colMap.moeda = ci;
                if (colText === 'total' && colMap.totalVenda === undefined) colMap.totalVenda = ci;
            } else {
                // Operacional: mesma lógica de antes
                if (colText.indexOf('taxa') >= 0 && colMap.taxa === undefined) colMap.taxa = ci;
                if (colText.indexOf('tipo de cobran') >= 0 && colMap.tipoCobranca === undefined) colMap.tipoCobranca = ci;
                if (colText.indexOf('moeda venda') >= 0) colMap.moedaVenda = ci;
                if (colMap.moeda === undefined && colText === 'moeda') colMap.moeda = ci;
                if (colText.indexOf('total venda') >= 0) colMap.totalVenda = ci;
                if (colText === 'venda' && colMap.totalVenda === undefined && colMap.venda === undefined) colMap.venda = ci;
            }
        }

        // Operacional: prioriza moeda venda
        if (colMap.moedaVenda !== undefined) colMap.moeda = colMap.moedaVenda;
        if (colMap.totalVenda === undefined && colMap.venda !== undefined) colMap.totalVenda = colMap.venda;

        console.log(TAG, 'Colunas mapeadas:', JSON.stringify(colMap));

        // Encontra a tabela BODY (irmã do header)
        var bodyTable = null;
        var headerBox = headerTable.closest('.ui-datatable-scrollable-header-box, .ui-datatable-scrollable-header');

        if (headerBox) {
            var datatableContainer = headerBox.parentElement;
            if (datatableContainer) datatableContainer = datatableContainer.parentElement;
            if (!datatableContainer) datatableContainer = headerBox.parentElement;

            var bodyWrapper = datatableContainer ? datatableContainer.querySelector('.ui-datatable-scrollable-table-wrapper') : null;
            if (bodyWrapper) {
                bodyTable = bodyWrapper.querySelector('table');
            }
        }

        if (!bodyTable) {
            // Fallback: próxima tabela com TDs
            var foundHeader = false;
            for (var t2 = 0; t2 < allTables.length; t2++) {
                if (allTables[t2] === headerTable) { foundHeader = true; continue; }
                if (foundHeader && allTables[t2].querySelectorAll('td').length > 10) {
                    bodyTable = allTables[t2];
                    break;
                }
            }
        }

        if (!bodyTable) {
            // Fallback 2: tabela não-split (THs e TDs na mesma table)
            if (headerTable.querySelectorAll('td').length > 0) {
                bodyTable = headerTable;
            }
        }

        if (!bodyTable) {
            console.log(TAG, 'Body table não encontrada');
            return items;
        }

        // Lê rows de dados
        var dataRows = bodyTable.querySelectorAll('tr');
        console.log(TAG, 'Body table: TRs:', dataRows.length, 'TDs:', bodyTable.querySelectorAll('td').length);

        for (var r = 0; r < dataRows.length; r++) {
            var cells = dataRows[r].querySelectorAll('td');
            if (cells.length < 3) continue;

            var taxa = colMap.taxa !== undefined && cells[colMap.taxa] ? cells[colMap.taxa].textContent.trim() : '';
            var moeda = colMap.moeda !== undefined && cells[colMap.moeda] ? cells[colMap.moeda].textContent.trim() : '';
            var totalVenda = '';

            if (colMap.totalVenda !== undefined && cells[colMap.totalVenda]) {
                totalVenda = cells[colMap.totalVenda].textContent.trim();
            }

            if (!taxa || taxa.length < 2) continue;
            if (taxa.toLowerCase() === 'taxa' || taxa.toLowerCase() === 'custo') continue;

            items.push({
                taxa: taxa,
                moeda: moeda,
                totalVenda: totalVenda,
                totalVendaNum: parseNumBR(totalVenda)
            });

            console.log(TAG, '  Row', r, ':', taxa, '|', moeda, '|', totalVenda);
        }

        return items;
    }

    // ===== BUSCA E BAIXA COTAÇÃO (padrão Serasa: captureNewTabUrl + fetch + pdfjsLib) =====
    async function findAndDownloadCotacao(modulo) {
        // Clica na aba Arquivos
        var archivosTab = findAccordionHeader('Arquivos');
        if (!archivosTab) {
            console.log(TAG, 'Aba Arquivos não encontrada');
            return null;
        }
        // Checa se Arquivos já está aberto (no financeiro, fica aberto entre processos)
        var accHeader = archivosTab.closest('.ui-accordion-header') || archivosTab;
        var isAlreadyOpen = accHeader.classList.contains('ui-state-active') ||
            accHeader.getAttribute('aria-selected') === 'true' ||
            accHeader.getAttribute('aria-expanded') === 'true';

        if (isAlreadyOpen) {
            console.log(TAG, 'Arquivos já está aberto, não clica pra não fechar');
        } else {
            console.log(TAG, 'Abrindo aba Arquivos...');
            archivosTab.click();
        }
        await delay(1500);

        // Busca row com "Cotação Cliente" DENTRO da seção Arquivos (não na página toda)
        var targetRow = null;

        // Encontra o content panel do accordion Arquivos
        var arquivosScope = null;
        // archivosTab pode ser: .ui-accordion-header (div/li), ou um <a>/<span>
        var accHeader = archivosTab.closest('.ui-accordion-header') || archivosTab;
        // O content vem logo depois do header no PrimeNG
        var nextEl = accHeader.nextElementSibling;
        if (nextEl && (nextEl.classList.contains('ui-accordion-content-wrapper') || nextEl.classList.contains('ui-accordion-content') || nextEl.querySelector('table'))) {
            arquivosScope = nextEl;
        }
        // Fallback: sobe pro parent e pega o content wrapper
        if (!arquivosScope) {
            var accParent = accHeader.parentElement;
            if (accParent) {
                arquivosScope = accParent.querySelector('.ui-accordion-content-wrapper') || accParent.querySelector('.ui-accordion-content');
            }
        }
        if (!arquivosScope) arquivosScope = document;
        console.log(TAG, 'Scope de busca:', arquivosScope.tagName || 'document', 'classes:', (arquivosScope.className || '').substring(0, 50));

        for (var attempt = 0; attempt < 15; attempt++) {
            var scopeRows = arquivosScope.querySelectorAll('tr');

            // Se scope está vazio, o accordion pode não ter expandido — re-clica
            if (scopeRows.length === 0) {
                if (attempt > 0 && attempt % 3 === 0) {
                    console.log(TAG, 'Tentativa', attempt + 1, '- scope vazio, re-clicando Arquivos...');
                    // Re-acha o header (Angular pode ter re-renderizado)
                    var freshTab = findAccordionHeader('Arquivos');
                    if (freshTab) {
                        freshTab.click();
                        await delay(500);
                        freshTab.click(); // double click pra garantir toggle
                        await delay(1500);
                        // Re-acha o scope
                        var freshHeader = freshTab.closest('.ui-accordion-header') || freshTab;
                        var freshNext = freshHeader.nextElementSibling;
                        if (freshNext && freshNext.querySelectorAll('tr').length > 0) {
                            arquivosScope = freshNext;
                        }
                    }
                }
                console.log(TAG, 'Tentativa', attempt + 1, '- TRs no scope:', 0);
                await delay(1500);
                continue;
            }

            console.log(TAG, 'Tentativa', attempt + 1, '- TRs no scope:', scopeRows.length);
            for (var r = 0; r < scopeRows.length; r++) {
                var rowText = scopeRows[r].textContent || '';
                if (rowText.indexOf('Cotação Cliente') >= 0 || rowText.indexOf('Cotacao Cliente') >= 0) {
                    targetRow = scopeRows[r];
                    console.log(TAG, 'Cotação Cliente encontrada na row', r, '(tentativa', attempt + 1 + ')');
                    break;
                }
            }
            if (targetRow) break;

            console.log(TAG, 'Cotação Cliente não encontrada, tentativa', attempt + 1, '/ 15...');
            await delay(1500);
        }

        if (!targetRow) {
            console.log(TAG, 'Cotação Cliente não encontrada após 10 tentativas');
            return null;
        }

        // Encontra o botão/ícone de download nessa row
        var dlIcon = targetRow.querySelector('.fa-download');
        var dlBtn = dlIcon ? (dlIcon.closest('button, a, span') || dlIcon) : null;

        if (!dlBtn) {
            var btns = targetRow.querySelectorAll('button, a');
            for (var b = 0; b < btns.length; b++) {
                if ((btns[b].innerHTML || '').indexOf('download') >= 0) {
                    dlBtn = btns[b];
                    break;
                }
            }
        }

        if (!dlBtn) {
            console.log(TAG, 'Botão download não encontrado');
            return null;
        }

        // Tenta pegar URL diretamente do href
        var pdfUrl = null;
        var linkEl = dlBtn.closest('a[href]') || dlBtn.querySelector('a[href]');
        if (linkEl && linkEl.href) {
            pdfUrl = linkEl.href;
            console.log(TAG, 'URL direta do link:', pdfUrl.substring(0, 80));
        }

        // Se não tem link direto, usa captureNewTabUrl (padrão Serasa)
        if (!pdfUrl) {
            console.log(TAG, 'Sem link direto, usando captureNewTabUrl...');
            window._checkDlBtn = dlBtn;

            var urlResponse = await new Promise(function (resolve) {
                chrome.runtime.sendMessage(
                    { action: 'captureNewTabUrl_check' },
                    function (response) { resolve(response); }
                );
            });

            if (urlResponse && urlResponse.success && urlResponse.url) {
                pdfUrl = urlResponse.url;
                console.log(TAG, 'URL capturada via background:', pdfUrl.substring(0, 80));
            } else {
                console.log(TAG, 'captureNewTabUrl falhou:', urlResponse);
                return null;
            }
        }

        // Volta pra aba Custos (só no operacional — no financeiro Itens não é accordion)
        if (modulo === 'operacional') {
            var custosTab = findAccordionHeader('Custos');
            if (custosTab) {
                custosTab.click();
                await delay(800);
            }
        }

        // Fetch o PDF diretamente (content script tem os cookies!)
        console.log(TAG, 'Baixando PDF:', pdfUrl.substring(0, 80));
        try {
            var resp = await fetch(pdfUrl, { credentials: 'include' });
            var blob = await resp.blob();
            console.log(TAG, 'PDF blob:', blob.size, 'bytes, tipo:', blob.type);

            var base64 = await new Promise(function (resolve) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result.split(',')[1]); };
                reader.readAsDataURL(blob);
            });

            // Decodifica e extrai texto com pdf.js (já carregado)
            var binaryString = atob(base64);
            var pdfBytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
                pdfBytes[i] = binaryString.charCodeAt(i);
            }

            var pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
            var fullText = '';
            for (var pg = 1; pg <= pdfDoc.numPages; pg++) {
                var page = await pdfDoc.getPage(pg);
                var textContent = await page.getTextContent();
                var pageText = textContent.items.map(function (item) { return item.str; }).join('\n');
                fullText += pageText + '\n\n';
            }

            console.log(TAG, 'Texto extraído:', fullText.length, 'chars');
            console.log(TAG, 'Preview:', fullText.substring(0, 500));

            return fullText;
        } catch (err) {
            console.error(TAG, 'Erro ao baixar/parsear PDF:', err);
            return null;
        }
    }

    // ===== PARSEIA PDF DE COTAÇÃO =====
    // Abordagem: scan por moedas (USD/BRL) standalone, pega taxa olhando pra trás e total olhando pra frente
    function parseCotacaoPDF(text) {
        var items = [];

        // Primeiro tenta formato pipe-delimited (ex: Gemini)
        var allLines = text.split('\n');
        for (var p = 0; p < allLines.length; p++) {
            var parts = allLines[p].trim().split('|');
            if (parts.length >= 3) {
                var taxa = parts[0].trim();
                var moeda = parts[1].trim();
                var valor = parts[2].trim();
                if (taxa && (moeda === 'USD' || moeda === 'BRL' || moeda === '%') && valor.match(/[\d.,]/)) {
                    items.push({ taxa: taxa, moeda: moeda, valor: valor, valorNum: parseNumBR(valor) });
                }
            }
        }
        if (items.length > 0) {
            console.log(TAG, 'Parseado via pipe:', items.length, 'itens');
            return items;
        }

        // Abordagem: pega todas as linhas, procura cada ocorrência de USD/BRL standalone
        // Pra cada uma, olha pra trás pra achar o nome da taxa, e pra frente pra achar os números
        var lines = allLines.map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });

        // Palavras que NÃO são nomes de taxa
        var skipWords = ['taxa', 'tipo de cobrança', 'tipo de cobranca', 'equipamento', 'moeda',
            'mínimo', 'minimo', 'valor unitário', 'valor unitario', 'total',
            'por container', 'por bl', 'por ton', '-', 'custos de frete',
            'custos no destino', 'custos na origem', 'informações adicionais',
            'volume', 'equip/embalagem', 'commodity', 'observações', 'observacoes'];

        // Encontra a PRIMEIRA opção no PDF (pode ser Opção 1, 2, 3...)
        var firstOpcaoNum = 0;
        for (var fo = 0; fo < lines.length; fo++) {
            var opcaoMatch = lines[fo].match(/^Op[çc][ãa]o\s*:?\s*(\d+)/i) || lines[fo].match(/^Opção\s*:?\s*(\d+)/i);
            if (opcaoMatch) {
                firstOpcaoNum = parseInt(opcaoMatch[1]);
                console.log(TAG, 'Primeira opção detectada: Opção', firstOpcaoNum, '(linha', fo + ')');
                break;
            }
        }

        for (var m = 0; m < lines.length; m++) {
            var line = lines[m];

            // Para quando encontrar a PRÓXIMA opção (não a primeira)
            if (firstOpcaoNum > 0) {
                var nextOpcao = lines[m].match(/^Op[çc][ãa]o\s*:?\s*(\d+)/i) || lines[m].match(/^Opção\s*:?\s*(\d+)/i);
                if (nextOpcao && parseInt(nextOpcao[1]) > firstOpcaoNum) {
                    console.log(TAG, 'Parando parse na', line, '(linha', m + ')');
                    break;
                }
            }

            // Pula linhas que começam com "Total" (totais, não taxas)
            if (line.match(/^Total/i)) continue;

            // Procura moeda standalone
            if (line !== 'USD' && line !== 'BRL' && line !== '%') continue;

            var moeda = line;

            // Olha PRA TRÁS pra achar o nome da taxa (máx 5 linhas)
            // Pattern PDF normal: [Taxa] → [Tipo de Cobrança] → [Moeda] → [números]
            // Pattern PDF LCL:    [Taxa] → [Tipo de Cobrança] → [Equipamento] → [Moeda] → [números]
            var taxaName = '';
            for (var back = m - 1; back >= Math.max(0, m - 6); back--) {
                var candidate = lines[back];
                var candLower = candidate.toLowerCase();

                // Pula números, moedas, palavras de header, linhas curtas
                if (candidate.match(/^[\d.,]+$/) || candidate.match(/^\d/)) continue;
                if (candidate === 'USD' || candidate === 'BRL' || candidate === '%') continue;
                if (candidate === '-' || candidate.length < 3) continue;
                if (skipWords.indexOf(candLower) >= 0) continue;
                if (candLower.indexOf('total ') >= 0) continue;

                // Pula "Tipo de Cobrança" — padrões conhecidos do PDF
                if (candLower.match(/^por\s/)) continue;          // "Por Kg ou dm", "Por AWB", "Por BL", "Por ton ou m³"...
                if (candLower === 'fixo') continue;                // "Fixo"
                if (candLower.match(/^%/)) continue;               // "% do Custo de Frete + ..."

                // Pula "Equipamento" — coluna extra em cotações LCL
                if (candLower === 'lcl' || candLower === 'fcl') continue;
                if (candLower === 'carga solta') continue;

                taxaName = candidate;
                break;
            }

            if (!taxaName) { continue; }

            // Olha PRA FRENTE pra achar números (mín, unitário, total)
            // O total é o ÚLTIMO número da sequência
            var numbers = [];
            for (var fwd = m + 1; fwd < Math.min(m + 5, lines.length); fwd++) {
                if (lines[fwd].match(/^[\d][\d.,]*$/)) {
                    numbers.push(lines[fwd]);
                } else if (lines[fwd] === 'USD' || lines[fwd] === 'BRL' || lines[fwd] === '%') {
                    break; // Próxima moeda = próximo item
                } else if (!lines[fwd].match(/^[\d.,%-]+$/) && lines[fwd].length > 2) {
                    break; // Outro texto = próximo item
                }
            }

            var total = numbers.length > 0 ? numbers[numbers.length - 1] : '';

            if (total) {
                items.push({
                    taxa: taxaName,
                    moeda: moeda,
                    valor: total,
                    valorNum: parseNumBR(total)
                });
                console.log(TAG, '  PDF item:', taxaName, '|', moeda, '|', total);
            }
        }

        // Fallback genérico se nada foi encontrado
        if (items.length === 0) {
            items = parseGenericLines(allLines);
        }

        return items;
    }

    // Parse genérico para PDFs sem seções claras
    function parseGenericLines(lines) {
        var items = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            // Busca padrão: NomeTaxa ... MOEDA ... VALOR
            var match = line.match(/^(.+?)\s+(USD|BRL|%)\s+([\d.,]+)\s*$/);
            if (match) {
                items.push({
                    taxa: match[1].trim(),
                    moeda: match[2],
                    valor: match[3],
                    valorNum: parseNumBR(match[3])
                });
            }
        }
        return items;
    }

    // ===== COMPARA LINHA POR LINHA =====
    function compareLineByLine(custos, cotacao) {
        var results = [];
        var usedCustos = {}; // Marca itens do sistema já pareados (1-para-1)

        // Pra cada item da cotação, busca o MELHOR match NÃO-USADO nos custos
        for (var c = 0; c < cotacao.length; c++) {
            var cotItem = cotacao[c];
            var bestMatch = null;
            var bestScore = 0;
            var bestIdx = -1;
            var bestValueDiff = Infinity;

            for (var k = 0; k < custos.length; k++) {
                if (usedCustos[k]) continue;
                var score = fuzzyMatch(cotItem.taxa, custos[k].taxa);
                if (score < 0.5) continue;
                var valueDiff = Math.abs((cotItem.valorNum || 0) - (custos[k].totalVendaNum || 0));
                if (score > bestScore || (score === bestScore && valueDiff < bestValueDiff)) {
                    bestScore = score;
                    bestMatch = custos[k];
                    bestIdx = k;
                    bestValueDiff = valueDiff;
                }
            }

            if (bestMatch && bestScore >= 0.5) {
                usedCustos[bestIdx] = true; // Marca como usado
                var match = cotItem.valorNum === bestMatch.totalVendaNum;
                var moedaMatch = !cotItem.moeda || !bestMatch.moeda ||
                    cotItem.moeda.toUpperCase() === bestMatch.moeda.toUpperCase();

                results.push({
                    status: match && moedaMatch ? 'ok' : 'divergencia',
                    taxaCotacao: cotItem.taxa,
                    taxaCustos: bestMatch.taxa,
                    moedaCotacao: cotItem.moeda,
                    moedaCustos: bestMatch.moeda,
                    valorCotacao: cotItem.valor,
                    valorCustos: bestMatch.totalVenda,
                    valorCotacaoNum: cotItem.valorNum,
                    valorCustosNum: bestMatch.totalVendaNum,
                    matchScore: bestScore
                });
            } else {
                results.push({
                    status: 'faltando_custos',
                    taxaCotacao: cotItem.taxa,
                    moedaCotacao: cotItem.moeda,
                    valorCotacao: cotItem.valor,
                    message: 'Taxa da cotação não encontrada nos Custos'
                });
            }
        }

        // Verifica custos NÃO-USADOS que não estão na cotação
        for (var k2 = 0; k2 < custos.length; k2++) {
            if (usedCustos[k2]) continue; // Já pareado
            if (custos[k2].totalVendaNum <= 0) continue;

            results.push({
                status: 'extra_custos',
                taxaCustos: custos[k2].taxa,
                moedaCustos: custos[k2].moeda,
                valorCustos: custos[k2].totalVenda,
                message: 'Taxa nos Custos sem correspondente na cotação'
            });
        }

        return results;
    }

    // ===== FUZZY MATCH =====
    function fuzzyMatch(a, b) {
        if (!a || !b) return 0;
        a = normalize(a);
        b = normalize(b);

        if (a === b) return 1;
        // PDF extraction pode quebrar palavras ("W arehouse" vs "warehouse")
        // Compara removendo TODOS os espaços
        var aNoSpace = a.replace(/\s/g, '');
        var bNoSpace = b.replace(/\s/g, '');
        if (aNoSpace === bNoSpace) return 1;
        if (aNoSpace.indexOf(bNoSpace) >= 0 || bNoSpace.indexOf(aNoSpace) >= 0) return 0.9;
        if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.9;

        // Compara palavras
        var wordsA = a.split(/\s+/);
        var wordsB = b.split(/\s+/);
        var commonWords = 0;
        for (var i = 0; i < wordsA.length; i++) {
            for (var j = 0; j < wordsB.length; j++) {
                if (wordsA[i] === wordsB[j] && wordsA[i].length > 2) {
                    commonWords++;
                    break;
                }
            }
        }
        return commonWords / Math.max(wordsA.length, wordsB.length);
    }

    function normalize(text) {
        return (text || '').toLowerCase()
            .replace(/[áàâã]/g, 'a')
            .replace(/[éèê]/g, 'e')
            .replace(/[íìî]/g, 'i')
            .replace(/[óòôõ]/g, 'o')
            .replace(/[úùû]/g, 'u')
            .replace(/ç/g, 'c')
            .replace(/\s*\(.*?\)\s*/g, ' ') // Remove parênteses
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseNumBR(text) {
        if (!text) return 0;
        // Remove pontos de milhar, troca vírgula por ponto
        var clean = text.replace(/\./g, '').replace(',', '.');
        var num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }

    // ===== UI: PAINEL DE RESULTADOS =====
    function showLoadingPanel(msg) {
        removePanel();
        var panel = createPanel();
        panel.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:24px;margin-bottom:10px;">⏳</div><div style="font-size:14px;color:#aaa;">' + msg + '</div></div>';
        document.body.appendChild(panel);
    }

    function updateLoadingPanel(msg) {
        var panel = document.getElementById('sk-check-panel');
        if (panel) {
            var msgEl = panel.querySelector('div > div:last-child');
            if (msgEl) msgEl.textContent = msg;
        }
    }

    function showResultsPanel(results) {
        removePanel();
        var panel = createPanel();

        var okCount = results.filter(function (r) { return r.status === 'ok'; }).length;
        var divCount = results.filter(function (r) { return r.status === 'divergencia'; }).length;
        var missCount = results.filter(function (r) { return r.status === 'faltando_custos'; }).length;
        var extraCount = results.filter(function (r) { return r.status === 'extra_custos'; }).length;
        var errorCount = results.filter(function (r) { return r.status === 'error'; }).length;

        // Calcula totais por moeda
        var totais = { oferta: {}, sistema: {} };
        for (var t = 0; t < results.length; t++) {
            var r = results[t];
            if (r.moedaCotacao && r.valorCotacaoNum) {
                totais.oferta[r.moedaCotacao] = (totais.oferta[r.moedaCotacao] || 0) + r.valorCotacaoNum;
            }
            if (r.moedaCustos && r.valorCustosNum) {
                totais.sistema[r.moedaCustos] = (totais.sistema[r.moedaCustos] || 0) + r.valorCustosNum;
            }
        }

        var html = '<div id="sk-check-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        html += '<h3 style="margin:0;font-size:16px;color:#fff;">Chequeio: Oferta vs Sistema</h3>';
        html += '<div style="display:flex;gap:6px;">';
        html += '<button id="sk-check-minimize" style="background:none;border:none;color:#888;font-size:16px;cursor:pointer;line-height:1;padding:2px 4px;" title="Minimizar">▬</button>';
        html += '<button onclick="this.closest(\'#sk-check-panel\').remove()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;line-height:1;padding:2px 4px;" title="Fechar">✕</button>';
        html += '</div></div>';
        html += '<div id="sk-check-body">';

        // Resumo badges
        html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
        if (okCount > 0) html += '<span style="background:#2ecc7122;color:#2ecc71;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:bold;">✅ ' + okCount + ' Batendo</span>';
        if (divCount > 0) html += '<span style="background:#e7444422;color:#e74444;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:bold;">❌ ' + divCount + ' Divergente</span>';
        if (missCount > 0) html += '<span style="background:#f39c1222;color:#f39c12;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:bold;">⚠️ ' + missCount + ' Faltando no Sistema</span>';
        if (extraCount > 0) html += '<span style="background:#3498db22;color:#3498db;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:bold;">ℹ️ ' + extraCount + ' Só no Sistema</span>';
        if (errorCount > 0) html += '<span style="background:#e7444422;color:#e74444;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:bold;">⛔ Erro</span>';
        html += '</div>';

        // Tabela comparativa
        html += '<div style="max-height:320px;overflow-y:auto;margin-bottom:12px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<tr style="border-bottom:2px solid #444;position:sticky;top:0;background:#1a1a2e;">';
        html += '<th style="text-align:left;padding:6px 4px;color:#888;width:24px;"></th>';
        html += '<th style="text-align:left;padding:6px 4px;color:#888;">Taxa</th>';
        html += '<th style="text-align:right;padding:6px 4px;color:#6C63FF;font-weight:bold;">Oferta (PDF)</th>';
        html += '<th style="text-align:right;padding:6px 4px;color:#4ECDC4;font-weight:bold;">Sistema</th>';
        html += '<th style="text-align:center;padding:6px 4px;color:#888;width:70px;">Status</th>';
        html += '</tr>';

        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            var statusIcon, statusText, rowBg;

            if (r.status === 'ok') {
                statusIcon = '✅'; statusText = 'OK'; rowBg = 'transparent';
            } else if (r.status === 'divergencia') {
                statusIcon = '❌'; statusText = 'Diferente'; rowBg = '#e7444410';
            } else if (r.status === 'faltando_custos') {
                statusIcon = '⚠️'; statusText = 'Falta'; rowBg = '#f39c1210';
            } else if (r.status === 'extra_custos') {
                statusIcon = 'ℹ️'; statusText = 'Extra'; rowBg = '#3498db10';
            } else {
                statusIcon = '⛔'; statusText = 'Erro'; rowBg = '#e7444410';
            }

            var taxaLabel = r.taxaCotacao || r.taxaCustos || '';

            // Formata valores com moeda
            var ofertaVal = r.valorCotacao ? (r.moedaCotacao || '') + ' ' + r.valorCotacao : '-';
            var sistemaVal = r.valorCustos ? (r.moedaCustos || '') + ' ' + r.valorCustos : '-';

            // Cor do valor
            var ofertaColor = r.status === 'faltando_custos' ? '#f39c12' : '#6C63FF';
            var sistemaColor = r.status === 'extra_custos' ? '#3498db' : '#4ECDC4';

            html += '<tr style="border-bottom:1px solid #222;background:' + rowBg + ';">';
            html += '<td style="padding:5px 4px;font-size:13px;">' + statusIcon + '</td>';
            html += '<td style="padding:5px 4px;color:#ddd;">' + taxaLabel + '</td>';
            html += '<td style="text-align:right;padding:5px 4px;color:' + ofertaColor + ';">' + ofertaVal + '</td>';
            html += '<td style="text-align:right;padding:5px 4px;color:' + sistemaColor + ';">' + sistemaVal + '</td>';
            html += '<td style="text-align:center;padding:5px 4px;font-size:10px;color:#888;">' + statusText + '</td>';
            html += '</tr>';

            // Linha de divergência detalhada
            if (r.status === 'divergencia') {
                var diff = r.valorCustosNum - r.valorCotacaoNum;
                var diffSign = diff > 0 ? '+' : '';
                html += '<tr style="background:' + rowBg + ';border-bottom:1px solid #222;">';
                html += '<td></td>';
                html += '<td colspan="4" style="padding:2px 4px 6px;font-size:10px;color:#e74444;">';
                html += '↳ Oferta: ' + (r.moedaCotacao || '') + ' ' + (r.valorCotacao || '') + ' → Sistema: ' + (r.moedaCustos || '') + ' ' + (r.valorCustos || '');
                html += ' (dif: ' + diffSign + formatNumBR(diff) + ')';
                html += '</td></tr>';
            }

            if (r.status === 'faltando_custos') {
                html += '<tr style="background:' + rowBg + ';border-bottom:1px solid #222;">';
                html += '<td></td>';
                html += '<td colspan="4" style="padding:2px 4px 6px;font-size:10px;color:#f39c12;">↳ Existe na Oferta mas NÃO está nos Custos do sistema</td>';
                html += '</tr>';
            }

            if (r.status === 'extra_custos') {
                html += '<tr style="background:' + rowBg + ';border-bottom:1px solid #222;">';
                html += '<td></td>';
                html += '<td colspan="4" style="padding:2px 4px 6px;font-size:10px;color:#3498db;">↳ Existe nos Custos do sistema mas NÃO está na Oferta</td>';
                html += '</tr>';
            }
        }

        html += '</table></div>';

        // TOTAIS por moeda
        html += '<div style="border-top:2px solid #444;padding-top:10px;">';
        html += '<div style="font-size:12px;font-weight:bold;color:#888;margin-bottom:6px;">TOTAIS</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<tr style="border-bottom:1px solid #333;">';
        html += '<th style="text-align:left;padding:4px;color:#888;">Moeda</th>';
        html += '<th style="text-align:right;padding:4px;color:#6C63FF;">Oferta (PDF)</th>';
        html += '<th style="text-align:right;padding:4px;color:#4ECDC4;">Sistema</th>';
        html += '<th style="text-align:right;padding:4px;color:#888;">Diferença</th>';
        html += '</tr>';

        var allMoedas = {};
        for (var m in totais.oferta) allMoedas[m] = true;
        for (var m2 in totais.sistema) allMoedas[m2] = true;

        for (var moeda in allMoedas) {
            var ofTotal = totais.oferta[moeda] || 0;
            var sisTotal = totais.sistema[moeda] || 0;
            var diffTotal = sisTotal - ofTotal;
            var diffColor = Math.abs(diffTotal) < 0.01 ? '#2ecc71' : '#e74444';
            var diffPrefix = diffTotal > 0 ? '+' : '';

            html += '<tr>';
            html += '<td style="padding:4px;color:#fff;font-weight:bold;">' + moeda + '</td>';
            html += '<td style="text-align:right;padding:4px;color:#6C63FF;">' + formatNumBR(ofTotal) + '</td>';
            html += '<td style="text-align:right;padding:4px;color:#4ECDC4;">' + formatNumBR(sisTotal) + '</td>';
            html += '<td style="text-align:right;padding:4px;color:' + diffColor + ';font-weight:bold;">' + diffPrefix + formatNumBR(diffTotal) + '</td>';
            html += '</tr>';
        }

        html += '</table></div>';
        html += '</div>'; // close sk-check-body

        panel.innerHTML = html;
        document.body.appendChild(panel);

        // Minimize toggle
        var minBtn = document.getElementById('sk-check-minimize');
        if (minBtn) {
            minBtn.addEventListener('click', function () {
                var body = document.getElementById('sk-check-body');
                var p = document.getElementById('sk-check-panel');
                if (body.style.display === 'none') {
                    body.style.display = '';
                    p.style.width = '620px';
                    p.style.maxHeight = '550px';
                    minBtn.textContent = '▬';
                    minBtn.title = 'Minimizar';
                } else {
                    body.style.display = 'none';
                    p.style.width = '300px';
                    p.style.maxHeight = '';
                    minBtn.textContent = '▣';
                    minBtn.title = 'Expandir';
                }
            });
        }
    }

    function formatNumBR(num) {
        if (num === 0) return '0,00';
        return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function createPanel() {
        var panel = document.createElement('div');
        panel.id = 'sk-check-panel';
        panel.style.cssText = 'position:fixed;bottom:20px;right:20px;width:620px;max-height:550px;background:#1a1a2e;color:#fff;border-radius:12px;padding:20px;box-shadow:0 8px 40px rgba(0,0,0,0.6);z-index:2147483647;font-family:Arial,sans-serif;border:1px solid #333;';
        return panel;
    }

    function removePanel() {
        var existing = document.getElementById('sk-check-panel');
        if (existing) existing.remove();
    }

    // ===== HELPERS =====
    function findAccordionHeader(label) {
        var allSpans = document.querySelectorAll('span, a');
        for (var i = 0; i < allSpans.length; i++) {
            var txt = (allSpans[i].textContent || '').trim();
            if (txt === label || txt.indexOf(label) >= 0) {
                var header = allSpans[i].closest('.ui-accordion-header, [role="tab"]');
                if (header) return header;
                // Fallback: retorna o próprio span se parece ser clicável
                if (allSpans[i].closest('a') || allSpans[i].style.cursor === 'pointer') return allSpans[i];
            }
        }
        return null;
    }

    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

})();

// ============================================================
// CHECK AGENT — Cotação vs Custos
// Compara oferta PDF com aba Custos do Skychart operacional
// ============================================================
(function() {
    'use strict';

    var TAG = '[Check Agent]';
    var checkBtnInjected = false;

    // ===== OBSERVER: Detecta quando a aba Custos é aberta =====
    var observer = new MutationObserver(function() {
        if (checkBtnInjected) return;
        
        // Verifica se estamos na página operacional
        if (location.href.indexOf('/app/operacional') < 0) return;
        
        // Procura o accordion de Custos expandido
        var custosHeader = findAccordionHeader('Custos');
        if (!custosHeader) return;

        // Procura os botões existentes (Atualizar debito, Recalcular custos)
        var actionBtns = document.querySelectorAll('button');
        var recalcBtn = null;
        for (var i = 0; i < actionBtns.length; i++) {
            var txt = (actionBtns[i].textContent || '').trim().toLowerCase();
            if (txt.indexOf('recalcular') >= 0 || txt.indexOf('atualizar deb') >= 0) {
                recalcBtn = actionBtns[i];
            }
        }

        if (recalcBtn) {
            injectCheckButton(recalcBtn);
        }
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
        btn.onmouseenter = function() { btn.style.transform = 'scale(1.05)'; btn.style.boxShadow = '0 4px 15px rgba(108,99,255,0.5)'; };
        btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 2px 8px rgba(108,99,255,0.3)'; };

        btn.addEventListener('click', function(e) {
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
        console.log(TAG, '=== INICIANDO CHEQUEIO ===');
        showLoadingPanel('Lendo custos...');

        // 1. Lê tabela de Custos
        var custos = readCustosTable();
        console.log(TAG, 'Custos lidos:', custos.length, 'linhas');
        custos.forEach(function(c) {
            console.log(TAG, '  Custo:', c.taxa, '|', c.moeda, '|', c.totalVenda);
        });

        if (custos.length === 0) {
            showResultsPanel([{ status: 'error', message: 'Nenhum custo encontrado na tabela' }]);
            return;
        }

        // 2. Vai pra aba Arquivos e busca Cotação Cliente
        updateLoadingPanel('Buscando cotação na aba Arquivos...');
        var pdfText = await findAndDownloadCotacao();

        if (!pdfText) {
            showResultsPanel([{ status: 'error', message: 'Cotação Cliente não encontrada na aba Arquivos' }]);
            return;
        }

        // 3. Parseia o PDF
        updateLoadingPanel('Analisando cotação...');
        var cotacaoItems = parseCotacaoPDF(pdfText);
        console.log(TAG, 'Cotação parseada:', cotacaoItems.length, 'itens');
        cotacaoItems.forEach(function(c) {
            console.log(TAG, '  Cotação:', c.taxa, '|', c.moeda, '|', c.valor);
        });

        // 4. Compara
        updateLoadingPanel('Comparando...');
        var results = compareLineByLine(custos, cotacaoItems);

        // 5. Exibe resultado
        showResultsPanel(results);
        console.log(TAG, '=== CHEQUEIO FINALIZADO ===');
    }

    // ===== LÊ TABELA DE CUSTOS =====
    function readCustosTable() {
        var items = [];
        
        // Encontra a tabela dentro do accordion Custos
        var tables = document.querySelectorAll('table');
        var custosTable = null;

        for (var t = 0; t < tables.length; t++) {
            var headers = tables[t].querySelectorAll('th');
            for (var h = 0; h < headers.length; h++) {
                var htxt = (headers[h].textContent || '').trim().toLowerCase();
                if (htxt.indexOf('taxa') >= 0 || htxt.indexOf('total venda') >= 0) {
                    custosTable = tables[t];
                    break;
                }
            }
            if (custosTable) break;
        }

        if (!custosTable) {
            console.log(TAG, 'Tabela de custos não encontrada');
            return items;
        }

        // Detecta colunas
        var ths = custosTable.querySelectorAll('thead th, tr:first-child th');
        var colMap = {};
        for (var ci = 0; ci < ths.length; ci++) {
            var colText = (ths[ci].textContent || '').trim().toLowerCase();
            if (colText.indexOf('taxa') >= 0 && !colMap.taxa) colMap.taxa = ci;
            if (colText.indexOf('tipo de cobran') >= 0) colMap.tipoCobranca = ci;
            if (colText.indexOf('moeda') >= 0 && colText.indexOf('compra') < 0 && colText.indexOf('venda') < 0) colMap.moeda = ci;
            if (colText.indexOf('total venda') >= 0 || (colText.indexOf('venda') >= 0 && colText.indexOf('total') >= 0)) colMap.totalVenda = ci;
            if (colText === 'venda') colMap.venda = ci;
        }

        console.log(TAG, 'Colunas mapeadas:', JSON.stringify(colMap));

        // Se não achou totalVenda, tenta pegar a última coluna "venda" ou usar a coluna "Venda"
        if (colMap.totalVenda === undefined && colMap.venda !== undefined) {
            colMap.totalVenda = colMap.venda;
        }

        var rows = custosTable.querySelectorAll('tbody tr');
        for (var r = 0; r < rows.length; r++) {
            var cells = rows[r].querySelectorAll('td');
            if (cells.length < 3) continue;

            var taxa = colMap.taxa !== undefined ? (cells[colMap.taxa] ? cells[colMap.taxa].textContent.trim() : '') : '';
            var moeda = colMap.moeda !== undefined ? (cells[colMap.moeda] ? cells[colMap.moeda].textContent.trim() : '') : '';
            var totalVenda = '';

            // Pega Total venda — tenta coluna mapeada, senão busca a última coluna com valor numérico significativo
            if (colMap.totalVenda !== undefined && cells[colMap.totalVenda]) {
                totalVenda = cells[colMap.totalVenda].textContent.trim();
            }

            // Pula linhas sem taxa
            if (!taxa || taxa.length < 2) continue;

            items.push({
                taxa: taxa,
                moeda: moeda,
                totalVenda: totalVenda,
                totalVendaNum: parseNumBR(totalVenda)
            });
        }

        return items;
    }

    // ===== BUSCA E BAIXA COTAÇÃO =====
    async function findAndDownloadCotacao() {
        // Clica na aba Arquivos
        var archivosTab = findAccordionHeader('Arquivos');
        if (!archivosTab) {
            console.log(TAG, 'Aba Arquivos não encontrada');
            return null;
        }

        // Clica pra abrir
        archivosTab.click();
        await delay(1500);

        // Busca a tabela de Tipos de Arquivo
        var tables = document.querySelectorAll('table');
        var fileTable = null;
        for (var t = 0; t < tables.length; t++) {
            var ths = tables[t].querySelectorAll('th');
            for (var h = 0; h < ths.length; h++) {
                if ((ths[h].textContent || '').indexOf('Nome do Arquivo') >= 0 ||
                    (ths[h].textContent || '').indexOf('Tipo arquivo') >= 0) {
                    fileTable = tables[t];
                    break;
                }
            }
            if (fileTable) break;
        }

        if (!fileTable) {
            console.log(TAG, 'Tabela de arquivos não encontrada');
            return null;
        }

        // Busca row com "Cotação Cliente" na coluna Tipo
        var rows = fileTable.querySelectorAll('tbody tr');
        var targetRow = null;
        for (var r = 0; r < rows.length; r++) {
            var rowText = rows[r].textContent || '';
            if (rowText.indexOf('Cotação Cliente') >= 0 || rowText.indexOf('Cotacao Cliente') >= 0) {
                targetRow = rows[r];
                console.log(TAG, 'Cotação Cliente encontrada na row', r);
                break;
            }
        }

        if (!targetRow) {
            console.log(TAG, 'Nenhuma row com "Cotação Cliente"');
            return null;
        }

        // Encontra o botão de download nessa row
        var downloadBtn = targetRow.querySelector('.fa-download, [class*="download"]');
        if (downloadBtn) {
            downloadBtn = downloadBtn.closest('button, a') || downloadBtn;
        }

        if (!downloadBtn) {
            // Tenta qualquer botão na row
            var btns = targetRow.querySelectorAll('button, a');
            for (var b = 0; b < btns.length; b++) {
                if ((btns[b].innerHTML || '').indexOf('download') >= 0) {
                    downloadBtn = btns[b];
                    break;
                }
            }
        }

        if (!downloadBtn) {
            console.log(TAG, 'Botão download não encontrado na row da Cotação');
            return null;
        }

        console.log(TAG, 'Clicando download...');
        downloadBtn.click();
        await delay(3000);

        // O PDF abre em nova aba — pede pro background capturar o texto
        var pdfText = await getPDFTextFromTab();
        
        // Volta pra aba Custos
        var custosTab = findAccordionHeader('Custos');
        if (custosTab) {
            custosTab.click();
            await delay(800);
        }

        return pdfText;
    }

    // Pega texto do PDF — tenta via Gemini
    function getPDFTextFromTab() {
        return new Promise(function(resolve) {
            // Tenta achar a aba do PDF
            chrome.runtime.sendMessage({
                action: 'check_extract_pdf'
            }, function(response) {
                if (response && response.success && response.text) {
                    console.log(TAG, 'PDF extraído:', response.text.length, 'chars');
                    resolve(response.text);
                } else {
                    console.log(TAG, 'Extração PDF falhou, tentando DOM da nova aba');
                    // Fallback: tenta ler o fileName e pedir Gemini
                    resolve(null);
                }
            });

            // Timeout de 15s
            setTimeout(function() { resolve(null); }, 15000);
        });
    }

    // ===== PARSEIA PDF DE COTAÇÃO =====
    function parseCotacaoPDF(text) {
        var items = [];

        // Primeiro tenta formato pipe-delimited do Gemini: TAXA|MOEDA|VALOR
        var lines = text.split('\n');
        for (var p = 0; p < lines.length; p++) {
            var parts = lines[p].trim().split('|');
            if (parts.length >= 3) {
                var taxa = parts[0].trim();
                var moeda = parts[1].trim();
                var valor = parts[2].trim();
                if (taxa && (moeda === 'USD' || moeda === 'BRL' || moeda === '%') && valor.match(/[\d.,]/)) {
                    items.push({
                        taxa: taxa,
                        moeda: moeda,
                        valor: valor,
                        valorNum: parseNumBR(valor)
                    });
                }
            }
        }

        if (items.length > 0) {
            console.log(TAG, 'Parseado via formato pipe:', items.length, 'itens');
            return items;
        }

        // Fallback: parser de seções do PDF bruto
        var sections = text.split(/CUSTOS\s+(?:DE\s+FRETE|NO\s+DESTINO|NA\s+ORIGEM)/i);

        // Se não encontrou seções, tenta parsear o texto todo
        if (sections.length <= 1) {
            // Parse genérico: procura padrões taxa + moeda + valor
            var lines = text.split('\n');
            items = parseGenericLines(lines);
            return items;
        }

        // Parse cada seção (pula a primeira que é header)
        for (var s = 1; s < sections.length; s++) {
            var sectionText = sections[s];
            var sectionEnd = sectionText.indexOf('Total custo');
            if (sectionEnd > 0) sectionText = sectionText.substring(0, sectionEnd);

            var lines = sectionText.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });

            // Pula header da seção (Taxa, Tipo de Cobrança, etc.)
            var startIdx = 0;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === 'Total' || lines[i] === 'Valor Unitário' || lines[i] === 'Valor unitário') {
                    startIdx = i + 1;
                    break;
                }
            }

            // Parse em blocos: cada item de custo tem ~7 linhas
            // Taxa, Tipo de Cobrança, Equipamento, Moeda, Mínimo, Valor Unitário, Total
            var idx = startIdx;
            while (idx < lines.length) {
                var taxaName = lines[idx];
                
                // Se parece com nome de taxa (não é número, não é moeda curta)
                if (taxaName && !taxaName.match(/^\d/) && taxaName.length > 2 && 
                    taxaName !== 'BRL' && taxaName !== 'USD' && taxaName !== '%' &&
                    taxaName !== '-' && taxaName !== 'Por Container' && taxaName !== 'Por BL') {
                    
                    // Procura moeda e valor total nos próximos ~6 linhas
                    var moeda = '';
                    var total = '';
                    var blockEnd = Math.min(idx + 8, lines.length);
                    
                    for (var j = idx + 1; j < blockEnd; j++) {
                        if (lines[j] === 'USD' || lines[j] === 'BRL' || lines[j] === '%') {
                            moeda = lines[j];
                        }
                        // O último número é o Total
                        if (lines[j].match(/^\d[\d.,]*$/)) {
                            total = lines[j];
                        }
                    }

                    if (moeda && total) {
                        items.push({
                            taxa: taxaName,
                            moeda: moeda,
                            valor: total,
                            valorNum: parseNumBR(total)
                        });
                        // Avança pro próximo bloco
                        idx = idx + 4; // pula pelo menos 4 linhas
                        continue;
                    }
                }
                idx++;
            }
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

        // Pra cada item da cotação, busca match nos custos
        for (var c = 0; c < cotacao.length; c++) {
            var cotItem = cotacao[c];
            var bestMatch = null;
            var bestScore = 0;

            for (var k = 0; k < custos.length; k++) {
                var score = fuzzyMatch(cotItem.taxa, custos[k].taxa);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = custos[k];
                }
            }

            if (bestMatch && bestScore >= 0.5) {
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

        // Verifica custos que não estão na cotação
        for (var k2 = 0; k2 < custos.length; k2++) {
            if (custos[k2].totalVendaNum <= 0) continue; // Pula custos zerados
            
            var found = false;
            for (var c2 = 0; c2 < cotacao.length; c2++) {
                if (fuzzyMatch(custos[k2].taxa, cotacao[c2].taxa) >= 0.5) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                results.push({
                    status: 'extra_custos',
                    taxaCustos: custos[k2].taxa,
                    moedaCustos: custos[k2].moeda,
                    valorCustos: custos[k2].totalVenda,
                    message: 'Taxa nos Custos sem correspondente na cotação'
                });
            }
        }

        return results;
    }

    // ===== FUZZY MATCH =====
    function fuzzyMatch(a, b) {
        if (!a || !b) return 0;
        a = normalize(a);
        b = normalize(b);

        if (a === b) return 1;
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

        var okCount = results.filter(function(r) { return r.status === 'ok'; }).length;
        var divCount = results.filter(function(r) { return r.status === 'divergencia'; }).length;
        var missCount = results.filter(function(r) { return r.status === 'faltando_custos'; }).length;
        var extraCount = results.filter(function(r) { return r.status === 'extra_custos'; }).length;
        var errorCount = results.filter(function(r) { return r.status === 'error'; }).length;

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">';
        html += '<h3 style="margin:0;font-size:16px;color:#fff;">Chequeio: Cotação vs Custos</h3>';
        html += '<button onclick="this.closest(\'#sk-check-panel\').remove()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">✕</button>';
        html += '</div>';

        // Resumo
        html += '<div style="display:flex;gap:12px;margin-bottom:15px;">';
        if (okCount > 0) html += '<span style="background:#2ecc7133;color:#2ecc71;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;">✅ ' + okCount + ' OK</span>';
        if (divCount > 0) html += '<span style="background:#e7444433;color:#e74444;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;">❌ ' + divCount + ' Divergência</span>';
        if (missCount > 0) html += '<span style="background:#f39c1233;color:#f39c12;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;">⚠️ ' + missCount + ' Faltando</span>';
        if (extraCount > 0) html += '<span style="background:#3498db33;color:#3498db;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;">ℹ️ ' + extraCount + ' Extra</span>';
        if (errorCount > 0) html += '<span style="background:#e7444433;color:#e74444;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;">⛔ Erro</span>';
        html += '</div>';

        // Tabela de resultados
        html += '<div style="max-height:350px;overflow-y:auto;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<tr style="border-bottom:1px solid #333;">';
        html += '<th style="text-align:left;padding:6px;color:#888;">Status</th>';
        html += '<th style="text-align:left;padding:6px;color:#888;">Taxa</th>';
        html += '<th style="text-align:right;padding:6px;color:#888;">Cotação</th>';
        html += '<th style="text-align:right;padding:6px;color:#888;">Custos</th>';
        html += '</tr>';

        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            var statusIcon = r.status === 'ok' ? '✅' : r.status === 'divergencia' ? '❌' : r.status === 'faltando_custos' ? '⚠️' : r.status === 'extra_custos' ? 'ℹ️' : '⛔';
            var rowColor = r.status === 'ok' ? '#2ecc71' : r.status === 'divergencia' ? '#e74444' : r.status === 'faltando_custos' ? '#f39c12' : '#3498db';
            var taxaLabel = r.taxaCotacao || r.taxaCustos || r.message || '';

            html += '<tr style="border-bottom:1px solid #222;color:' + rowColor + ';">';
            html += '<td style="padding:6px;">' + statusIcon + '</td>';
            html += '<td style="padding:6px;color:#ddd;">' + taxaLabel + '</td>';
            html += '<td style="text-align:right;padding:6px;">' + (r.valorCotacao ? (r.moedaCotacao || '') + ' ' + r.valorCotacao : '-') + '</td>';
            html += '<td style="text-align:right;padding:6px;">' + (r.valorCustos ? (r.moedaCustos || '') + ' ' + r.valorCustos : '-') + '</td>';
            html += '</tr>';

            // Se divergência, mostra detalhe
            if (r.status === 'divergencia') {
                html += '<tr style="border-bottom:1px solid #222;">';
                html += '<td></td>';
                html += '<td colspan="3" style="padding:3px 6px;font-size:11px;color:#e74444;">';
                html += 'Esperado: ' + (r.moedaCotacao || '') + ' ' + (r.valorCotacao || '') + ' → Sistema: ' + (r.moedaCustos || '') + ' ' + (r.valorCustos || '');
                html += '</td></tr>';
            }
        }

        html += '</table></div>';

        panel.innerHTML = html;
        document.body.appendChild(panel);
    }

    function createPanel() {
        var panel = document.createElement('div');
        panel.id = 'sk-check-panel';
        panel.style.cssText = 'position:fixed;bottom:20px;right:20px;width:500px;max-height:500px;background:#1a1a2e;color:#fff;border-radius:12px;padding:20px;box-shadow:0 8px 40px rgba(0,0,0,0.6);z-index:2147483647;font-family:Arial,sans-serif;border:1px solid #333;';
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

    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

})();

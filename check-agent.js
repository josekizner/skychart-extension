// ============================================================
// CHECK AGENT — Cotação vs Custos
// Compara oferta PDF com aba Custos do Skychart operacional
// ============================================================
(function() {
    'use strict';

    var TAG = '[Check Agent]';
    var checkBtnInjected = false;

    // Listener: background manda clicar o download (padrão Serasa)
    chrome.runtime.onMessage.addListener(function(request) {
        if (request.action === 'clickCheckDownload' && window._checkDlBtn) {
            console.log(TAG, 'Background pediu clique no download');
            window._checkDlBtn.click();
        }
    });
    // ===== OBSERVER: Detecta quando a aba Custos é aberta =====
    var observer = new MutationObserver(function() {
        // Se botão foi removido do DOM (Angular re-renderiza), reseta flag
        if (checkBtnInjected && !document.getElementById('sk-check-btn')) {
            checkBtnInjected = false;
        }
        if (checkBtnInjected) return;
        
        // Verifica se estamos na página operacional
        if (location.href.indexOf('/app/operacional') < 0) return;
        
        // Procura o accordion de Custos expandido
        var custosHeader = findAccordionHeader('Custos');
        if (!custosHeader) return;

        // Procura os botões existentes (Atualizar debito, Recalcular custos, Chequeio)
        var actionBtns = document.querySelectorAll('button');
        var recalcBtn = null;
        for (var i = 0; i < actionBtns.length; i++) {
            var txt = (actionBtns[i].textContent || '').trim().toLowerCase();
            if (txt.indexOf('recalcular') >= 0 || txt.indexOf('atualizar deb') >= 0 || txt.indexOf('chequeio') >= 0) {
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
        
        // PrimeNG datatable usa DUAS tabelas separadas:
        // Header: ui-datatable-scrollable-header-box > table (THs)
        // Body:   ui-datatable-scrollable-table-wrapper > table (TDs)
        
        // 1. Encontra a tabela HEADER que tem "Taxa" e "Venda" nos THs
        var headerTable = null;
        var allTables = document.querySelectorAll('table');

        for (var t = 0; t < allTables.length; t++) {
            var headers = allTables[t].querySelectorAll('th');
            if (headers.length < 10) continue; // Custos tem muitas colunas (~34)
            
            var hasTaxa = false;
            var hasVenda = false;
            for (var h = 0; h < headers.length; h++) {
                var htxt = (headers[h].textContent || '').trim().toLowerCase();
                if (htxt.indexOf('taxa') >= 0) hasTaxa = true;
                if (htxt.indexOf('venda') >= 0) hasVenda = true;
            }
            if (hasTaxa && hasVenda) {
                headerTable = allTables[t];
                console.log(TAG, 'Header table encontrada! THs:', headers.length);
                break;
            }
        }

        if (!headerTable) {
            console.log(TAG, 'Header table de custos não encontrada');
            return items;
        }

        // 2. Mapeia colunas do header
        var ths = headerTable.querySelectorAll('th');
        var colMap = {};
        for (var ci = 0; ci < ths.length; ci++) {
            var colText = (ths[ci].textContent || '').trim().toLowerCase();
            if (colText.indexOf('taxa') >= 0 && colMap.taxa === undefined) colMap.taxa = ci;
            if (colText.indexOf('tipo de cobran') >= 0 && colMap.tipoCobranca === undefined) colMap.tipoCobranca = ci;
            // Moeda VENDA é a que queremos (não moeda compra)
            if (colText.indexOf('moeda venda') >= 0 || colText === 'moeda venda') colMap.moedaVenda = ci;
            if (colMap.moeda === undefined && colText === 'moeda') colMap.moeda = ci;
            if (colText.indexOf('total venda') >= 0) colMap.totalVenda = ci;
            if (colText === 'venda' && colMap.totalVenda === undefined && colMap.venda === undefined) colMap.venda = ci;
        }

        // Prioriza moeda venda sobre moeda genérica
        if (colMap.moedaVenda !== undefined) colMap.moeda = colMap.moedaVenda;

        if (colMap.totalVenda === undefined && colMap.venda !== undefined) {
            colMap.totalVenda = colMap.venda;
        }

        console.log(TAG, 'Colunas mapeadas:', JSON.stringify(colMap));

        // 3. Encontra a tabela BODY (irmã do header)
        // Sobe até o container do datatable e busca a table-wrapper
        var bodyTable = null;
        var headerBox = headerTable.closest('.ui-datatable-scrollable-header-box, .ui-datatable-scrollable-header');
        
        if (headerBox) {
            // Sobe mais um nível para encontrar o wrapper irmão
            var datatableContainer = headerBox.parentElement;
            if (datatableContainer) datatableContainer = datatableContainer.parentElement;
            if (!datatableContainer) datatableContainer = headerBox.parentElement;
            
            // Busca a table dentro de ui-datatable-scrollable-table-wrapper
            var bodyWrapper = datatableContainer ? datatableContainer.querySelector('.ui-datatable-scrollable-table-wrapper') : null;
            if (bodyWrapper) {
                bodyTable = bodyWrapper.querySelector('table');
            }
        }
        
        if (!bodyTable) {
            // Fallback: busca a próxima tabela com TDs após a header table
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
            console.log(TAG, 'Body table de custos não encontrada');
            return items;
        }

        // 4. Lê as rows de dados
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

            // Pula linhas sem taxa
            if (!taxa || taxa.length < 2) continue;
            if (taxa.toLowerCase() === 'taxa') continue;

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
    async function findAndDownloadCotacao() {
        // Clica na aba Arquivos
        var archivosTab = findAccordionHeader('Arquivos');
        if (!archivosTab) {
            console.log(TAG, 'Aba Arquivos não encontrada');
            return null;
        }

        archivosTab.click();
        await delay(2000);

        // Busca row com "Cotação Cliente" na tabela de Tipos de Arquivo
        var allRows = document.querySelectorAll('tr');
        var targetRow = null;
        for (var r = 0; r < allRows.length; r++) {
            var rowText = allRows[r].textContent || '';
            if (rowText.indexOf('Cotação Cliente') >= 0 || rowText.indexOf('Cotacao Cliente') >= 0) {
                targetRow = allRows[r];
                console.log(TAG, 'Cotação Cliente encontrada na row', r);
                break;
            }
        }

        if (!targetRow) {
            console.log(TAG, 'Nenhuma row com "Cotação Cliente"');
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

            var urlResponse = await new Promise(function(resolve) {
                chrome.runtime.sendMessage(
                    { action: 'captureNewTabUrl_check' },
                    function(response) { resolve(response); }
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

        // Volta pra aba Custos
        var custosTab = findAccordionHeader('Custos');
        if (custosTab) {
            custosTab.click();
            await delay(800);
        }

        // Fetch o PDF diretamente (content script tem os cookies!)
        console.log(TAG, 'Baixando PDF:', pdfUrl.substring(0, 80));
        try {
            var resp = await fetch(pdfUrl, { credentials: 'include' });
            var blob = await resp.blob();
            console.log(TAG, 'PDF blob:', blob.size, 'bytes, tipo:', blob.type);

            var base64 = await new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload = function() { resolve(reader.result.split(',')[1]); };
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
                var pageText = textContent.items.map(function(item) { return item.str; }).join('\n');
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
        var lines = allLines.map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
        
        // Palavras que NÃO são nomes de taxa
        var skipWords = ['taxa', 'tipo de cobrança', 'tipo de cobranca', 'equipamento', 'moeda', 
                         'mínimo', 'minimo', 'valor unitário', 'valor unitario', 'total',
                         'por container', 'por bl', 'por ton', '-', 'custos de frete', 
                         'custos no destino', 'custos na origem', 'informações adicionais',
                         'volume', 'equip/embalagem', 'commodity', 'observações', 'observacoes'];

        console.log(TAG, 'PDF linhas totais:', lines.length);

        for (var m = 0; m < lines.length; m++) {
            var line = lines[m];

            // Pula linhas que começam com "Total" (totais, não taxas)
            if (line.match(/^Total/i)) continue;

            // Procura moeda standalone
            if (line !== 'USD' && line !== 'BRL' && line !== '%') continue;

            var moeda = line;
            
            // Olha PRA TRÁS pra achar o nome da taxa (máx 5 linhas)
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

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        html += '<h3 style="margin:0;font-size:16px;color:#fff;">Chequeio: Oferta vs Sistema</h3>';
        html += '<button onclick="this.closest(\'#sk-check-panel\').remove()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;line-height:1;">✕</button>';
        html += '</div>';

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

        panel.innerHTML = html;
        document.body.appendChild(panel);
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

    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

})();

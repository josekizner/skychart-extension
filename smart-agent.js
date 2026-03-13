/**
 * SKYCHART SUPER AGENT — Smart Detector + Interaction Engine
 * 
 * Detecta automaticamente componentes PrimeNG e aplica a estratégia correta.
 * Não precisa saber antecipadamente o tipo de cada campo — descobre sozinho.
 */

var SkAgent = (function () {
    'use strict';

    // ========================================================================
    // SMART DETECTOR — Descobre o tipo de componente PrimeNG de qualquer elemento
    // ========================================================================

    function detectComponent(element) {
        if (!element) return { type: 'unknown', strategy: 'none', element: null };

        var result = {
            type: 'unknown',
            strategy: 'none',
            element: element,
            editBtn: null,
            saveBtn: null,
            cancelBtn: null,
            wrapper: null
        };

        // 1. File input
        if (element.type === 'file' || element.closest('input[type="file"]')) {
            result.type = 'file-upload';
            result.strategy = 'data-transfer';
            return result;
        }

        // 2. Checkbox (PrimeNG p-checkbox ou ui-chkbox)
        var chkWrapper = element.closest('p-checkbox, .ui-chkbox');
        if (chkWrapper || element.classList.contains('ui-chkbox-icon') || element.classList.contains('ui-chkbox-box')) {
            result.type = 'checkbox';
            result.strategy = 'click';
            result.wrapper = chkWrapper || element;
            return result;
        }

        // 3. Grid cell (dentro de p-cellEditor, p-table com edição)
        var cellEditor = element.closest('p-celleditor, [pcelleditor], .ui-cell-editor');
        var tableRow = element.closest('tr');
        if (cellEditor || (tableRow && tableRow.querySelector('.fa-save, .fa-pencil, .ui-row-editor'))) {
            result.type = 'grid-cell';
            result.strategy = 'grid-edit';
            result.wrapper = cellEditor || tableRow;

            // Encontra botões de edição na mesma linha
            if (tableRow) {
                var allBtnsInRow = tableRow.querySelectorAll('span[class*="fa-"], button, a');
                for (var b = 0; b < allBtnsInRow.length; b++) {
                    var cls = allBtnsInRow[b].className || '';
                    if (cls.indexOf('fa-pencil') >= 0 || cls.indexOf('fa-edit') >= 0) {
                        result.editBtn = allBtnsInRow[b].closest('button, a') || allBtnsInRow[b];
                    }
                    if (cls.indexOf('fa-save') >= 0 || cls.indexOf('pi-save') >= 0) {
                        result.saveBtn = allBtnsInRow[b].closest('button, a') || allBtnsInRow[b];
                    }
                    if (cls.indexOf('fa-times') >= 0 || cls.indexOf('pi-times') >= 0) {
                        result.cancelBtn = allBtnsInRow[b].closest('button, a') || allBtnsInRow[b];
                    }
                }
            }
            return result;
        }

        // 4. Autocomplete (PrimeNG p-autocomplete)
        var autoWrapper = element.closest('p-autocomplete, .ui-autocomplete');
        if (autoWrapper) {
            result.type = 'autocomplete';
            result.strategy = 'char-by-char';
            result.wrapper = autoWrapper;
            return result;
        }

        // 5. Calendar/Date (PrimeNG p-calendar)
        var calWrapper = element.closest('p-calendar, .ui-calendar');
        if (calWrapper) {
            result.type = 'calendar';
            result.strategy = 'char-by-char';
            result.wrapper = calWrapper;
            return result;
        }

        // 6. InputNumber (PrimeNG p-inputnumber)
        var numWrapper = element.closest('p-inputnumber, .p-inputnumber');
        if (numWrapper || element.classList.contains('p-inputnumber-input')) {
            result.type = 'input-number';
            result.strategy = 'native-set';
            result.wrapper = numWrapper || element;
            return result;
        }

        // 7. Dropdown (PrimeNG p-dropdown)
        var dropWrapper = element.closest('p-dropdown, .ui-dropdown');
        if (dropWrapper) {
            result.type = 'dropdown';
            result.strategy = 'click';
            result.wrapper = dropWrapper;
            return result;
        }

        // 8. Text input genérico
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            result.type = 'text-input';
            result.strategy = 'native-set';
            return result;
        }

        // 9. Button
        if (element.tagName === 'BUTTON' || element.closest('button')) {
            result.type = 'button';
            result.strategy = 'click';
            return result;
        }

        return result;
    }

    // Gera relatório detalhado de um elemento para debug
    function diagnose(element) {
        if (!element) return { exists: false };
        var comp = detectComponent(element);
        var rect = element.getBoundingClientRect();
        return {
            exists: true,
            tag: element.tagName,
            id: element.id || null,
            title: element.getAttribute('title') || null,
            classes: element.className,
            type: comp.type,
            strategy: comp.strategy,
            visible: element.offsetParent !== null,
            inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
            rect: { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) },
            editBtn: comp.editBtn ? { class: comp.editBtn.className, visible: comp.editBtn.offsetParent !== null } : null,
            saveBtn: comp.saveBtn ? { class: comp.saveBtn.className, visible: comp.saveBtn.offsetParent !== null } : null,
            cancelBtn: comp.cancelBtn ? { class: comp.cancelBtn.className, visible: comp.cancelBtn.offsetParent !== null } : null,
            parentClasses: element.parentElement ? element.parentElement.className : null,
            wrapperTag: comp.wrapper ? comp.wrapper.tagName : null
        };
    }


    // ========================================================================
    // INTERACTION ENGINE — Executa a estratégia correta por tipo de componente
    // ========================================================================

    var Engine = {};

    // Helpers compartilhados
    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function nativeSet(input, value) {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function nativeSetWithBlur(input, value) {
        nativeSet(input, value);
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function highlight(el) {
        if (!el) return;
        el.style.border = '2px solid #00ff00';
        el.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
        setTimeout(function () { el.style.border = ''; el.style.backgroundColor = ''; }, 4000);
    }

    // ---- Estratégia: native-set (input simples, input-number) ----
    Engine.nativeSet = function (input, value) {
        if (!input) return { ok: false, reason: 'Input não encontrado' };
        input.focus();
        nativeSetWithBlur(input, value);
        highlight(input);
        return { ok: true, finalValue: input.value };
    };

    // ---- Estratégia: char-by-char (autocomplete, calendar) ----
    Engine.charByChar = function (input, value, options) {
        options = options || {};
        var selectFirst = options.selectFirst !== false; // default: true pra autocomplete
        var tabAfter = options.tabAfter !== false;       // default: true

        return new Promise(function (resolve) {
            if (!input) { resolve({ ok: false, reason: 'Input não encontrado' }); return; }

            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
            input.click();

            var idx = 0;
            var timer = setInterval(function () {
                if (window.skStopActive) { clearInterval(timer); resolve({ ok: false, reason: 'Abortado' }); return; }
                if (idx < value.length) {
                    input.value += value[idx];
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value[idx] }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value[idx] }));
                    idx++;
                } else {
                    clearInterval(timer);

                    if (selectFirst) {
                        // Força dropdown abrir e seleciona primeiro item
                        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
                        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowDown' }));
                        setTimeout(function () { waitAndSelectAutocomplete(0, resolve, input, value); }, 300);
                    } else if (tabAfter) {
                        setTimeout(function () {
                            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
                            input.dispatchEvent(new Event('blur', { bubbles: true }));
                            highlight(input);
                            resolve({ ok: true, finalValue: input.value });
                        }, 300);
                    } else {
                        highlight(input);
                        resolve({ ok: true, finalValue: input.value });
                    }
                }
            }, 60);
        });
    };

    function waitAndSelectAutocomplete(attempt, resolve, input, value) {
        if (window.skStopActive) { resolve({ ok: false, reason: 'Abortado' }); return; }
        if (attempt >= 25) { resolve({ ok: false, reason: 'Autocomplete não abriu após ' + attempt + ' tentativas' }); return; }

        setTimeout(function () {
            var panels = document.querySelectorAll('.ui-autocomplete-panel, .p-autocomplete-panel, .ui-autocomplete-items');
            for (var p = 0; p < panels.length; p++) {
                if (panels[p].offsetHeight > 0) {
                    var items = panels[p].querySelectorAll('li');
                    if (items.length > 0) {
                        items[0].click();
                        highlight(input);
                        resolve({ ok: true, finalValue: input.value, selected: items[0].textContent.trim().substring(0, 60) });
                        return;
                    }
                }
            }
            waitAndSelectAutocomplete(attempt + 1, resolve, input, value);
        }, 600);
    }

    // ---- Estratégia: grid-edit (grid cells com edit/save/cancel buttons) ----
    // IMPORTANTE: Os botões edit/save podem estar no CABEÇALHO DA SEÇÃO, não na linha!
    // Ex: Na seção "Taxas", os botões ficam na header bar, não no <tr>
    Engine.gridEdit = function (input, value, comp) {
        return new Promise(async function (resolve) {
            if (!input) { resolve({ ok: false, reason: 'Input não encontrado' }); return; }

            var diag = { steps: [] };

            // ===== PASSO 1: Encontrar botões de edição na SEÇÃO (não só na linha) =====
            var editBtn = comp.editBtn;
            var saveBtn = comp.saveBtn;

            // Se não achou na linha, procura na seção/container pai (header da tabela)
            if (!editBtn || !saveBtn) {
                var searchResult = findSectionButtons(input);
                if (!editBtn && searchResult.editBtn) editBtn = searchResult.editBtn;
                if (!saveBtn && searchResult.saveBtn) saveBtn = searchResult.saveBtn;
                diag.steps.push('Busca na seção: editBtn=' + (editBtn ? 'SIM (' + (editBtn.className || editBtn.tagName).substring(0, 40) + ')' : 'NÃO') +
                    ' saveBtn=' + (saveBtn ? 'SIM (' + (saveBtn.className || saveBtn.tagName).substring(0, 40) + ')' : 'NÃO'));
            }

            // ===== PASSO 2: Ativar modo edição =====
            if (editBtn) {
                editBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await delay(300);
                editBtn.click();
                diag.steps.push('Clicou editBtn da seção');
                await delay(800);
            } else {
                // Fallback: clica no TD visível (não no input oculto) para ativar edição inline
                var td = input.closest('td');
                if (td) {
                    td.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    await delay(300);
                    td.click();
                    diag.steps.push('Clicou no TD (fallback sem editBtn)');
                    await delay(400);
                    td.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                    diag.steps.push('Dblclick no TD');
                    await delay(600);
                } else {
                    // Último recurso: triple-click no input
                    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    await delay(300);
                    var rect = input.getBoundingClientRect();
                    var cx = rect.left + rect.width / 2;
                    var cy = rect.top + rect.height / 2;
                    var o = { bubbles: true, clientX: cx, clientY: cy };
                    for (var c = 0; c < 3; c++) {
                        input.dispatchEvent(new MouseEvent('mousedown', o));
                        input.dispatchEvent(new MouseEvent('mouseup', o));
                        input.dispatchEvent(new MouseEvent('click', o));
                        await delay(150);
                    }
                    diag.steps.push('Triple-click no input (sem TD, sem editBtn)');
                    await delay(600);
                }
            }

            if (window.skStopActive) { resolve({ ok: false, reason: 'Abortado' }); return; }

            // ===== PASSO 3: Espera o input ficar visível (até 3s) =====
            var freshInput = input;
            var inputVisible = false;
            for (var wait = 0; wait < 15; wait++) {
                freshInput = document.querySelector(input.getAttribute('title') ? 'input[title="' + input.getAttribute('title') + '"]' : null) || input;
                var freshRect = freshInput.getBoundingClientRect();
                if (freshRect.width > 0 && freshRect.height > 0) {
                    inputVisible = true;
                    break;
                }
                await delay(200);
            }
            diag.steps.push('Input visível após edição: ' + (inputVisible ? 'SIM (' + Math.round(freshInput.getBoundingClientRect().width) + 'x' + Math.round(freshInput.getBoundingClientRect().height) + ')' : 'NÃO'));

            // ===== PASSO 4: Setar o valor com execCommand (Angular reconhece como input real) =====
            // IMPORTANTE: nativeSet NÃO funciona para p-inputnumber no PrimeNG!
            // Angular só reconhece InputEvent nativo gerado por execCommand('insertText').
            freshInput.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            await delay(100);
            document.execCommand('insertText', false, value);
            highlight(freshInput);
            diag.steps.push('Valor inserido via execCommand: "' + freshInput.value + '"');
            await delay(300);

            if (window.skStopActive) { resolve({ ok: false, reason: 'Abortado' }); return; }

            // ===== PASSO 5: Pressiona Enter para salvar (confirmado pelo usuário) =====
            // NÃO procura botão de salvar — o fallback anterior clicava o botão errado (Estornar)
            freshInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            freshInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
            diag.steps.push('Enter pressionado para salvar');
            await delay(800);

            // Verifica se o valor persistiu
            var postInput = document.querySelector(input.getAttribute('title') ? 'input[title="' + input.getAttribute('title') + '"]' : null) || freshInput;
            var postValue = postInput.value;
            diag.steps.push('Valor pós-Enter: "' + postValue + '"');

            if (postValue && postValue !== '0' && postValue !== '0,0000') {
                resolve({ ok: true, finalValue: postValue, diag: diag });
            } else {
                // Valor zerou — Enter não funcionou, tenta auto-heal com Gemini
                diag.steps.push('ALERTA: Valor zerou pós-Enter! Tentando auto-heal com Gemini...');
                var healResult = await autoHealWithGemini(freshInput, value, 'valor zerou após Enter', diag);
                if (healResult.ok) {
                    resolve({ ok: true, finalValue: freshInput.value, diag: diag, autoHealed: true });
                } else {
                    dumpSectionDOM(freshInput, diag);
                    resolve({ ok: false, reason: 'Taxa digitada mas valor zerou após salvar', diag: diag });
                }
            }
        });
    };

    // Procura botões de edição/salvar na SEÇÃO inteira (não só na linha)
    function findSectionButtons(input) {
        var result = { editBtn: null, saveBtn: null, cancelBtn: null };
        
        // Sobe na hierarquia procurando containers com botões
        var searchContainers = [];
        var el = input;
        for (var up = 0; up < 10 && el; up++) {
            el = el.parentElement;
            if (el) searchContainers.push(el);
        }

        for (var i = 0; i < searchContainers.length; i++) {
            var container = searchContainers[i];
            var allBtns = container.querySelectorAll('span[class*="fa-"], button, a');
            for (var b = 0; b < allBtns.length; b++) {
                var cls = allBtns[b].className || '';
                if (!result.editBtn && (cls.indexOf('fa-pencil') >= 0 || cls.indexOf('fa-edit') >= 0 || cls.indexOf('pi-pencil') >= 0)) {
                    result.editBtn = allBtns[b].closest('button, a') || allBtns[b];
                }
                if (!result.saveBtn && (cls.indexOf('fa-save') >= 0 || cls.indexOf('pi-save') >= 0)) {
                    result.saveBtn = allBtns[b].closest('button, a') || allBtns[b];
                }
                if (!result.cancelBtn && (cls.indexOf('fa-times') >= 0 || cls.indexOf('pi-times') >= 0)) {
                    result.cancelBtn = allBtns[b].closest('button, a') || allBtns[b];
                }
            }
            // Se achou pelo menos editBtn ou saveBtn, para
            if (result.editBtn || result.saveBtn) break;
        }

        return result;
    }

    // Dump do DOM da seção inteira para debug
    function dumpSectionDOM(input, diag) {
        var container = input;
        for (var u = 0; u < 8 && container.parentElement; u++) container = container.parentElement;
        var allBtns = container.querySelectorAll('span[class*="fa-"], button');
        var items = [];
        allBtns.forEach(function (b) {
            items.push((b.tagName + '.' + (b.className || '').replace(/\s+/g, '.').substring(0, 60)) + ' vis=' + (b.offsetParent !== null));
        });
        diag.steps.push('DOM dump seção (' + items.length + ' elementos): ' + items.slice(0, 15).join(' | '));
    }

    // ===== AUTO-HEAL COM GEMINI =====
    // Quando uma estratégia estática falha, envia o DOM ao Gemini
    // e pede instruções de como interagir. Executa o JS retornado.
    async function autoHealWithGemini(input, value, action, diag) {
        try {
            // Captura contexto DOM ao redor do input
            var container = input;
            for (var u = 0; u < 6 && container.parentElement; u++) container = container.parentElement;
            var domFragment = container.outerHTML.substring(0, 3000); // limita a 3KB

            // Envia pro Gemini via background.js
            var response = await new Promise(function (res) {
                chrome.runtime.sendMessage({
                    action: 'analyzeDOM',
                    domFragment: domFragment,
                    inputTitle: input.getAttribute('title') || input.id || 'sem-titulo',
                    currentValue: value,
                    failedAction: action,
                    question: 'O input tem title="' + (input.getAttribute('title') || '') + '". Preciso clicar o botão de salvar após editar o valor. Analise o HTML e retorne APENAS um seletor CSS do botão de salvar, ou se não existir, descreva o que preciso fazer. Responda em formato JSON: {"selector": "css-selector-aqui"} ou {"steps": ["passo1", "passo2"]}'
                }, function (resp) { res(resp); });
            });

            if (response && response.success && response.result) {
                diag.steps.push('Gemini respondeu: ' + JSON.stringify(response.result).substring(0, 200));

                // Tenta usar o seletor que o Gemini retornou
                if (response.result.selector) {
                    var geminiBtn = document.querySelector(response.result.selector);
                    if (geminiBtn) {
                        var clickTarget = geminiBtn.closest('button, a') || geminiBtn;
                        clickTarget.click();
                        diag.steps.push('AUTO-HEAL: Clicou seletor do Gemini: ' + response.result.selector);
                        await delay(800);
                        return { ok: true };
                    } else {
                        diag.steps.push('AUTO-HEAL: Seletor do Gemini não encontrou elemento: ' + response.result.selector);
                    }
                }
                if (response.result.steps) {
                    diag.steps.push('AUTO-HEAL: Gemini sugeriu passos: ' + response.result.steps.join(' → '));
                }
            } else {
                diag.steps.push('AUTO-HEAL: Gemini não respondeu ou erro: ' + JSON.stringify(response || 'sem resposta').substring(0, 200));
            }
        } catch (err) {
            diag.steps.push('AUTO-HEAL: Erro: ' + err.message);
        }
        return { ok: false };
    }

    // ---- Estratégia: click (checkbox, button) ----
    Engine.click = function (element) {
        if (!element) return { ok: false, reason: 'Elemento não encontrado' };
        element.click();
        highlight(element);
        return { ok: true };
    };

    // ---- Estratégia: data-transfer (file upload) ----
    Engine.dataTransfer = function (fileInput, file) {
        if (!fileInput) return { ok: false, reason: 'Input file não encontrado' };
        var dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
    };


    // ========================================================================
    // FIND FIELD SMART — Busca semântica com 6 níveis de fallback
    // ========================================================================

    function findFieldSmart(step) {
        var input = null;
        var source = null;

        // Nível 1: Seletor do JSON config
        if (step.selector) {
            var selectors = step.selector.split(',');
            for (var s = 0; s < selectors.length; s++) {
                var sel = selectors[s].trim();
                if (typeof SkMemory !== 'undefined' && SkMemory.isKnownBadSelector(step.id, sel)) {
                    continue;
                }
                input = document.querySelector(sel);
                if (input) { source = 'config'; break; }
            }
        }

        // Nível 2: Seletor da memória (qualificado)
        if (!input && typeof SkMemory !== 'undefined') {
            var memSel = SkMemory.bestSelector(step.id);
            if (memSel && memSel.length > 5 && (memSel.indexOf('#') >= 0 || memSel.indexOf('[') >= 0)) {
                try { input = document.querySelector(memSel); } catch(e) { input = null; }
                if (input) {
                    source = 'memória';
                    SkDebug.log(step.label, 'INFO', '🧠 Seletor memória: ' + memSel);
                }
            }
        }

        // Nível 3: findByLabel do JSON config
        if (!input && step.findByLabel) {
            input = findInputByLabel(step.findByLabel);
            if (input) source = 'label-config';
        }

        // Nível 4: Busca por label genérico baseado no nome
        if (!input && step.label) {
            input = findInputByLabel(step.label);
            if (input) source = 'label-nome';
        }

        // Nível 5: Busca por title/aria/placeholder
        if (!input && step.label) {
            var titleSearch = step.label.toLowerCase();
            var allInputs = document.querySelectorAll('input, textarea, select');
            for (var t = 0; t < allInputs.length; t++) {
                var title = (allInputs[t].getAttribute('title') || '').toLowerCase();
                var placeholder = (allInputs[t].getAttribute('placeholder') || '').toLowerCase();
                var ariaLabel = (allInputs[t].getAttribute('aria-label') || '').toLowerCase();
                if (title.indexOf(titleSearch) >= 0 || placeholder.indexOf(titleSearch) >= 0 || ariaLabel.indexOf(titleSearch) >= 0) {
                    input = allInputs[t];
                    source = 'title/aria/placeholder';
                    break;
                }
            }
        }

        // Nível 6: Solução Gemini
        if (!input && typeof SkMemory !== 'undefined') {
            var geminiSel = SkMemory.geminiSolution(step.id);
            if (geminiSel) {
                try { input = document.querySelector(geminiSel); } catch(e) { input = null; }
                if (input) {
                    source = 'gemini-memória';
                }
            }
        }

        // ===== VALIDAÇÃO DE CONTEXTO: o elemento encontrado está PERTO do texto correto? =====
        if (input && step.findByLabel) {
            var contextOk = verifyContext(input, step.findByLabel || step.label);
            if (!contextOk) {
                SkDebug.log(step.label, 'INFO', '⛔ Elemento encontrado via ' + source + ' mas contexto NÃO bate! Rejeitando.');
                input = null;
                source = null;
                // Tenta findByLabel de novo como último recurso
                if (step.findByLabel) {
                    input = findInputByLabel(step.findByLabel);
                    if (input) {
                        source = 'label-config (re-busca)';
                        var recheck = verifyContext(input, step.findByLabel || step.label);
                        if (!recheck) {
                            SkDebug.log(step.label, 'INFO', '⛔ Re-busca também falhou contexto');
                            input = null;
                        }
                    }
                }
            }
        }

        if (input && source) {
            SkDebug.log(step.label, 'INFO', 'Encontrado via: ' + source);
        }

        return input;
    }

    // ===== VERIFICAÇÃO DE CONTEXTO =====
    // Verifica se o texto perto do elemento (labels, td vizinhos, parent text) bate com o que esperamos
    function verifyContext(element, expectedLabel) {
        if (!element || !expectedLabel) return true; // sem label pra verificar = ok
        var expected = expectedLabel.toLowerCase();

        // 1. Verifica texto no próprio elemento (title, placeholder, aria-label)
        var title = (element.getAttribute('title') || '').toLowerCase();
        var placeholder = (element.getAttribute('placeholder') || '').toLowerCase();
        var ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
        if (title.indexOf(expected) >= 0 || placeholder.indexOf(expected) >= 0 || ariaLabel.indexOf(expected) >= 0) return true;

        // 2. Verifica texto nos pais (até 5 níveis acima)
        var parent = element.parentElement;
        for (var i = 0; i < 5 && parent; i++) {
            // Pega texto direto (não dos filhos profundos) — máximo 200 chars
            var directText = '';
            for (var c = 0; c < parent.childNodes.length; c++) {
                if (parent.childNodes[c].nodeType === 3) { // TEXT_NODE
                    directText += parent.childNodes[c].textContent;
                } else if (parent.childNodes[c].nodeType === 1 && parent.childNodes[c].tagName === 'LABEL') {
                    directText += parent.childNodes[c].textContent;
                }
            }
            directText = directText.toLowerCase().substring(0, 200);
            if (directText.indexOf(expected) >= 0) return true;
            parent = parent.parentElement;
        }

        // 3. Verifica siblings (irmãos antes do elemento)
        var prev = element.previousElementSibling;
        for (var j = 0; j < 3 && prev; j++) {
            if (prev.textContent.toLowerCase().indexOf(expected) >= 0) return true;
            prev = prev.previousElementSibling;
        }

        // 4. Verifica TD vizinhos na mesma row (pra tabelas)
        var td = element.closest('td');
        if (td) {
            var prevTD = td.previousElementSibling;
            if (prevTD && prevTD.textContent.toLowerCase().indexOf(expected) >= 0) return true;
        }

        // 5. Verifica se o for do label aponta pro elemento
        if (element.id) {
            var linkedLabel = document.querySelector('label[for="' + element.id + '"]');
            if (linkedLabel && linkedLabel.textContent.toLowerCase().indexOf(expected) >= 0) return true;
        }

        return false; // contexto NÃO bate
    }

    // ========================================================================
    // EXECUTE WITH RETRY — Self-correction com múltiplas tentativas
    // ========================================================================

    async function executeWithRetry(input, value, comp, step) {
        // Tentativa 1: Estratégia detectada
        var result;
        try {
            result = await executeStrategy(input, value, comp);
        } catch (err) {
            result = { ok: false, reason: err.message };
        }

        // Validação pós-ação: o valor persistiu?
        if (result.ok && comp.strategy !== 'grid-edit' && comp.strategy !== 'click') {
            await delay(400);
            var currentVal = input.value;
            if (!currentVal || currentVal === '0' || currentVal === '0,0000') {
                SkDebug.log(step.label, 'INFO', '⚠️ Valor zerou pós-ação! Tentando auto-correção...');
                result.ok = false;
                result.reason = 'Valor zerou pós-ação (era: ' + value + ', agora: ' + currentVal + ')';
            }
        }

        if (result.ok) return result;

        // Tentativa 2: Se falhou, tenta outra estratégia
        SkDebug.log(step.label, 'INFO', '🔄 Tentativa 2: alternativa via char-by-char');
        if (comp.strategy !== 'char-by-char') {
            try {
                result = await Engine.charByChar(input, value, { selectFirst: false, tabAfter: false });
                if (result.ok) {
                    await delay(300);
                    if (input.value && input.value !== '0') return result;
                }
            } catch (e) { /* continua */ }
        }

        // Tentativa 3: execCommand direto
        SkDebug.log(step.label, 'INFO', '🔄 Tentativa 3: execCommand insertText');
        try {
            input.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            await delay(100);
            document.execCommand('insertText', false, value);
            await delay(300);
            if (input.value && input.value !== '0') {
                return { ok: true, finalValue: input.value };
            }
        } catch (e) { /* continua */ }

        // Tentativa 4: Gemini auto-heal
        SkDebug.log(step.label, 'INFO', '🤖 Tentativa 4: Gemini auto-heal');
        var diag = { steps: [] };
        var healResult = await autoHealWithGemini(input, value, 'valor não persistiu com nenhuma estratégia para campo "' + step.label + '"', diag);
        if (healResult.ok) {
            result = { ok: true, finalValue: input.value, autoHealed: true, geminiSelector: healResult.geminiSelector, diag: diag };
            return result;
        }

        // Tudo falhou
        result.diag = diag;
        return result;
    }

    async function executeStrategy(input, value, comp) {
        switch (comp.strategy) {
            case 'native-set':
                return Engine.nativeSet(input, value);
            case 'char-by-char':
                return await Engine.charByChar(input, value, {
                    selectFirst: comp.type === 'autocomplete',
                    tabAfter: comp.type === 'calendar'
                });
            case 'grid-edit':
                return await Engine.gridEdit(input, value, comp);
            case 'click':
                return Engine.click(input);
            default:
                return Engine.nativeSet(input, value);
        }
    }


    // ========================================================================
    // SMART AGENT — Orquestrador principal
    // ========================================================================

    async function runModule(moduleConfig, pdfFields) {
        var results = [];
        var steps = (moduleConfig.steps || []).sort(function (a, b) { return a.order - b.order; });

        for (var i = 0; i < steps.length; i++) {
            if (window.skStopActive) break;

            var step = steps[i];

            // ===== Ações inline (clique de botão/checkbox no meio do fluxo) =====
            if (step.actionType) {
                SkDebug.log(step.label, 'EXEC', 'Ação: ' + step.actionType + ' → ' + (step.actionLabel || step.label));
                var actionOk = false;
                if (step.actionType === 'clickButton') {
                    actionOk = clickButtonByLabel(step.actionLabel || step.label);
                } else if (step.actionType === 'clickCheckbox') {
                    actionOk = clickCheckboxByLabel(step.actionLabel || step.label);
                }
                SkDebug.log(step.label, actionOk ? 'OK' : 'FAIL', actionOk ? 'Feito' : 'Não encontrado');
                results.push({ id: step.id, label: step.label, status: actionOk ? 'OK' : 'FAIL' });
                await delay(step.delayAfter || 500);
                continue;
            }

            var value = null;

            // Determina o valor a usar
            if (step.fixedValue) {
                value = step.fixedValue;
            } else if (step.pdfField && pdfFields[step.pdfField]) {
                value = pdfFields[step.pdfField];
                if (step.formatBR) value = value.replace('.', ',');
            }

            if (!value) {
                results.push({ id: step.id, label: step.label, status: 'SKIP', reason: 'Sem valor' });
                SkDebug.log(step.label, 'SKIP', 'Sem valor do PDF');
                continue;
            }

            SkDebug.log(step.label, 'EXEC', 'Preenchendo: ' + value);

            // ===== BUSCA INTELIGENTE DO CAMPO (findFieldSmart) =====
            var input = findFieldSmart(step);

            if (!input) {
                // Self-correction: pede pro Gemini encontrar o campo
                SkDebug.log(step.label, 'INFO', 'Campo não encontrado — pedindo Gemini...');
                var healResult = await autoHealWithGemini(document.body, value, 'encontrar campo "' + step.label + '"', { steps: [] });
                if (healResult.ok && healResult.geminiSelector) {
                    input = document.querySelector(healResult.geminiSelector);
                    if (input) SkDebug.log(step.label, 'INFO', 'Gemini encontrou: ' + healResult.geminiSelector);
                }
            }

            if (!input) {
                SkMemory.remember(step.id, { ok: false, reason: 'Elemento não encontrado', selector: step.selector || step.findByLabel });
                results.push({ id: step.id, label: step.label, status: 'FAIL', reason: 'Elemento não encontrado' });
                SkDebug.log(step.label, 'FAIL', 'Elemento não encontrado em nenhuma busca');
                continue;
            }

            // Gera seletor CSS real — NUNCA salva strings genéricas como 'label'
            var usedSelector = null;
            if (input.id) {
                usedSelector = '#' + input.id;
            } else if (input.getAttribute('title')) {
                usedSelector = 'input[title="' + input.getAttribute('title') + '"]';
            } else if (input.getAttribute('name')) {
                usedSelector = '[name="' + input.getAttribute('name') + '"]';
            } else if (step.selector && step.selector.indexOf('#') >= 0) {
                usedSelector = step.selector;
            }
            // Se não conseguiu gerar seletor real, não salva na memória

            // ===== DETECTA E EXECUTA COM SELF-CORRECTION =====
            var comp = detectComponent(input);
            SkDebug.log(step.label, 'INFO', 'Tipo: ' + comp.type + ' | Estratégia: ' + comp.strategy);

            var result = await executeWithRetry(input, value, comp, step);

            // ===== REGISTRA NA MEMÓRIA =====
            if (usedSelector) {
                result.selector = usedSelector;
            }
            result.strategy = comp.strategy;
            SkMemory.remember(step.id, result);

            var status = result.ok ? 'OK' : 'FAIL';
            results.push({ id: step.id, label: step.label, status: status, result: result });
            SkDebug.log(step.label, status, result.ok ? 'Valor: ' + (result.finalValue || value) : result.reason);
            if (result.diag) {
                result.diag.steps.forEach(function (s) { SkDebug.log(step.label, 'DEBUG', s); });
            }

            await delay(step.delayAfter || 500);
        }

        // Stats de memória no final
        var memStats = SkMemory.stats();
        SkDebug.log('Memória', 'INFO', 'Conhece ' + memStats.camposConhecidos + ' campos | Taxa acerto: ' + memStats.taxaAcerto + '%');

        // Post-Actions (Atualizar, Acordo lido, Finalizar Câmbio, etc.)
        var postActions = moduleConfig.postActions || [];
        for (var p = 0; p < postActions.length; p++) {
            if (window.skStopActive) break;

            var action = postActions[p];
            SkDebug.log(action.label || action.action, 'EXEC', 'Executando: ' + action.action);

            var actionResult = await executePostAction(action);
            var actionStatus = actionResult ? 'OK' : 'FAIL';
            SkDebug.log(action.label || action.action, actionStatus, actionResult ? 'Feito' : 'Não encontrado');

            if (!actionResult && action.retryDelay) {
                await delay(action.retryDelay);
                var retry = await executePostAction(action);
                SkDebug.log(action.label || action.action, retry ? 'OK' : 'FAIL', retry ? 'Feito (retry)' : 'Falhou no retry também');
            }

            await delay(action.delay || 500);
        }

        return results;
    }

    // ========================================================================
    // TOAST DETECTION — Espera confirmação visual do sistema antes de continuar
    // ========================================================================

    async function waitForToast(label, successText, timeout) {
        successText = successText || 'sucesso';
        timeout = timeout || 15000;
        SkDebug.log(label, 'INFO', '⏳ Aguardando toast de confirmação (' + successText + ')...');

        return new Promise(function(resolve) {
            var resolved = false;
            var checkInterval = null;

            // Função que verifica se o toast apareceu
            function checkToasts() {
                // PrimeNG usa: .ui-toast, .ui-growl, p-toast, .ui-messages
                var toasts = document.querySelectorAll('.ui-toast-message, .ui-growl-message, .ui-toast-detail, .ui-toast-summary, .ui-messages-info, p-toastitem, .ui-toast');
                for (var i = 0; i < toasts.length; i++) {
                    var text = toasts[i].textContent.trim().toLowerCase();
                    if (!text) continue;

                    // Detecta sucesso
                    if (text.indexOf('sucesso') >= 0 || text.indexOf('success') >= 0 || text.indexOf('atualizado') >= 0 || text.indexOf('finalizado') >= 0 || text.indexOf(successText.toLowerCase()) >= 0) {
                        if (!resolved) {
                            resolved = true;
                            clearInterval(checkInterval);
                            SkDebug.log(label, 'OK', '✅ Toast detectado: "' + text.substring(0, 60) + '"');
                            resolve(true);
                        }
                        return;
                    }

                    // Detecta erro
                    if (text.indexOf('erro') >= 0 || text.indexOf('error') >= 0 || text.indexOf('falha') >= 0) {
                        if (!resolved) {
                            resolved = true;
                            clearInterval(checkInterval);
                            SkDebug.log(label, 'FAIL', '❌ Toast de ERRO: "' + text.substring(0, 60) + '"');
                            resolve(false);
                        }
                        return;
                    }
                }
            }

            // Checa a cada 300ms
            checkInterval = setInterval(checkToasts, 300);

            // Timeout — se não aparecer nada, continua mesmo assim
            setTimeout(function() {
                if (!resolved) {
                    resolved = true;
                    clearInterval(checkInterval);
                    SkDebug.log(label, 'INFO', '⏰ Timeout aguardando toast — continuando...');
                    resolve(true); // Continua mesmo sem toast
                }
            }, timeout);

            // Check imediato
            checkToasts();
        });
    }

    // Espera um campo ter valor não-vazio (pra pré-condições)
    async function waitForFieldNotEmpty(label, selector, timeout) {
        timeout = timeout || 10000;
        SkDebug.log(label, 'INFO', '⏳ Aguardando campo ' + selector + ' ter valor...');

        var startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            var el = document.querySelector(selector);
            if (el) {
                var val = (el.value || el.textContent || '').trim();
                if (val && val !== '0' && val !== '0,00' && val !== '0.00') {
                    SkDebug.log(label, 'OK', '✅ Campo preenchido: ' + val.substring(0, 30));
                    return true;
                }
            }
            await delay(500);
        }
        SkDebug.log(label, 'INFO', '⏰ Timeout aguardando campo — continuando...');
        return true;
    }

    async function executePostAction(action) {
        switch (action.action) {
            case 'clickButton':
                return clickButtonByLabel(action.label);
            case 'clickCheckbox':
                return clickCheckboxByLabel(action.label);
            case 'selectDropdown':
                return await selectDropdownInRow(action.label, action.value, action.rowMatch);
            case 'clickRowSave':
                return clickRowSaveBtn(action.rowMatch);
            case 'waitToast':
                return await waitForToast(action.label, action.successText, action.timeout || 15000);
            case 'waitField':
                return await waitForFieldNotEmpty(action.label, action.selector, action.timeout || 10000);
            case 'selectBankAccount':
                return await selectBankAccount(action.matchText || '98424', action.label);
            case 'visionVerify':
                return await visionVerifyPage(action.label);
            default:
                console.warn('Skychart AI: Ação desconhecida:', action.action);
                return false;
        }
    }

    // ===== SELECT BANK ACCOUNT: Seleciona conta bancária pelo texto parcial =====
    async function selectBankAccount(matchText, label) {
        SkDebug.log(label, 'INFO', 'Buscando dropdown banco/conta com: ' + matchText);

        // Procura o dropdown que contém o texto "Conta" ou "Banco" no label
        var allLabels = document.querySelectorAll('.ui-dropdown-label, label');
        var targetDropdown = null;

        for (var i = 0; i < allLabels.length; i++) {
            var text = (allLabels[i].textContent || '').trim();
            if (text.indexOf('Conta') >= 0 || text.indexOf('Banco') >= 0) {
                // Encontra o p-dropdown pai
                targetDropdown = allLabels[i].closest('p-dropdown, .ui-dropdown');
                if (targetDropdown) {
                    SkDebug.log(label, 'INFO', 'Dropdown encontrado: ' + text.substring(0, 40));
                    break;
                }
            }
        }

        if (!targetDropdown) {
            SkDebug.log(label, 'FAIL', 'Dropdown banco/conta não encontrado');
            return false;
        }

        // Abre o dropdown
        targetDropdown.click();
        await delay(800);

        // Procura o item com o texto que bate (98424)
        var panels = document.querySelectorAll('.ui-dropdown-panel, .ui-dropdown-items-wrapper');
        var found = false;

        for (var p = 0; p < panels.length; p++) {
            if (panels[p].style.display === 'none' || panels[p].offsetHeight === 0) continue;

            var items = panels[p].querySelectorAll('li, .ui-dropdown-item');
            for (var j = 0; j < items.length; j++) {
                var itemText = (items[j].textContent || '').trim();
                if (itemText.indexOf(matchText) >= 0) {
                    SkDebug.log(label, 'INFO', 'Selecionando: ' + itemText.substring(0, 50));
                    items[j].click();
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        if (!found) {
            // Tenta com overlay aberto em outro container
            var allItems = document.querySelectorAll('.ui-dropdown-item, li.ui-dropdown-item');
            for (var k = 0; k < allItems.length; k++) {
                var txt = (allItems[k].textContent || '').trim();
                if (txt.indexOf(matchText) >= 0) {
                    SkDebug.log(label, 'INFO', 'Selecionando (fallback): ' + txt.substring(0, 50));
                    allItems[k].click();
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            SkDebug.log(label, 'OK', 'Conta selecionada com: ' + matchText);
            await delay(500);
        } else {
            SkDebug.log(label, 'FAIL', 'Item com "' + matchText + '" não encontrado no dropdown');
        }

        return found;
    }

    // ===== VISION VERIFY: Screenshot + Gemini analisa se tudo tá correto =====
    // Fallback: se screenshot falhar, verifica pelo DOM diretamente
    async function visionVerifyPage(label) {
        SkDebug.log(label, 'INFO', 'Tirando screenshot pra Gemini revisar...');

        // Primeiro tenta screenshot + Gemini
        var screenshotOk = await tryVisionScreenshot(label);
        
        if (!screenshotOk) {
            // Fallback: verificação por DOM
            SkDebug.log(label, 'INFO', 'Fallback: verificando pelo DOM...');
            await domBasedVerify(label);
        }
        
        return true;
    }

    function tryVisionScreenshot(label) {
        return new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'visionScreenshot' }, function(screenshotResponse) {
                if (chrome.runtime.lastError) {
                    SkDebug.log(label, 'INFO', 'Screenshot erro: ' + chrome.runtime.lastError.message);
                    resolve(false);
                    return;
                }
                if (!screenshotResponse || !screenshotResponse.success || !screenshotResponse.image) {
                    SkDebug.log(label, 'INFO', 'Screenshot falhou: ' + JSON.stringify(screenshotResponse || 'sem resposta').substring(0, 100));
                    resolve(false);
                    return;
                }

                SkDebug.log(label, 'INFO', 'Screenshot capturado, enviando ao Gemini...');

                var prompt = 'Analise esta tela do sistema Skychart de câmbio.\n\n' +
                    'Verifique se TUDO está preenchido corretamente:\n' +
                    '1. "Total IOF" deve ter um valor NÃO ZERO\n' +
                    '2. "Total contrato de Câmbio" ou "Total Contrato" deve ter um valor NÃO ZERO\n' +
                    '3. Os campos de contrato, data, fornecedor, valor devem estar preenchidos\n' +
                    '4. Verifique se há algo visivelmente errado ou faltando\n\n' +
                    'Responda APENAS com JSON:\n' +
                    '{\n' +
                    '  "allOk": true/false,\n' +
                    '  "issues": ["descricao do problema 1", "descricao do problema 2"],\n' +
                    '  "totalIOF": "valor encontrado ou ZERO",\n' +
                    '  "totalContrato": "valor encontrado ou ZERO",\n' +
                    '  "actions": ["gerarIOF", "gerarContrato"]\n' +
                    '}';

                chrome.runtime.sendMessage({
                    action: 'visionAnalyze',
                    screenshot: screenshotResponse.image,
                    instruction: prompt,
                    viewport: { width: window.innerWidth, height: window.innerHeight }
                }, async function(analysisResponse) {
                    if (!analysisResponse || !analysisResponse.success || !analysisResponse.data) {
                        SkDebug.log(label, 'INFO', 'Gemini não respondeu, usando fallback DOM');
                        resolve(false);
                        return;
                    }

                    var result = analysisResponse.data;
                    SkDebug.log(label, 'INFO', 'Gemini analisou: ' + JSON.stringify(result).substring(0, 200));

                    if (result.allOk) {
                        SkDebug.log(label, 'OK', '✅ Gemini confirmou: tudo OK!');
                        resolve(true);
                        return;
                    }

                    // Tem problemas — tenta corrigir
                    SkDebug.log(label, 'INFO', '⚠️ Problemas: ' + (result.issues || []).join(', '));
                    await executeVisionCorrections(result.actions || [], label);
                    resolve(true);
                });
            });
        });
    }

    // Verificação por DOM: lê os valores diretamente da tela
    async function domBasedVerify(label) {
        SkDebug.log(label, 'INFO', 'Lendo valores do DOM...');
        
        var issues = [];
        
        // Procura Total IOF
        var totalIOF = findValueNearLabel('Total IOF', 'Total de Iof');
        SkDebug.log(label, 'INFO', 'Total IOF: "' + totalIOF + '"');
        if (!totalIOF || totalIOF === '0' || totalIOF === '0,00' || totalIOF === '0.00') {
            issues.push('Total IOF está zerado');
        }

        // Procura Total Contrato de Câmbio
        var totalContrato = findValueNearLabel('Total Contrato', 'Total contrato de Câmbio', 'Total contrato');
        SkDebug.log(label, 'INFO', 'Total Contrato: "' + totalContrato + '"');
        if (!totalContrato || totalContrato === '0' || totalContrato === '0,00' || totalContrato === '0.00') {
            issues.push('Total Contrato de Câmbio está zerado');
        }

        if (issues.length === 0) {
            SkDebug.log(label, 'OK', '✅ Verificação DOM: tudo OK! IOF=' + totalIOF + ' Contrato=' + totalContrato);
            return;
        }

        SkDebug.log(label, 'INFO', '⚠️ Problemas DOM: ' + issues.join(', '));

        // Corrige
        if (issues.some(function(i) { return i.indexOf('IOF') >= 0; })) {
            SkDebug.log(label, 'EXEC', 'Re-clicando Gerar IOF...');
            clickButtonByLabel('Gerar IOF');
            await delay(3000);
            await waitForToast('IOF retry', 'sucesso', 10000);
            await delay(1000);
        }

        if (issues.some(function(i) { return i.indexOf('Contrato') >= 0; })) {
            SkDebug.log(label, 'EXEC', 'Re-clicando Gerar contrato de cambio...');
            clickButtonByLabel('Gerar contrato de cambio');
            await delay(3000);
        }

        SkDebug.log(label, 'OK', 'Correções aplicadas');
    }

    // Busca valor perto de um label no DOM
    function findValueNearLabel() {
        var labels = Array.prototype.slice.call(arguments);
        
        var allEls = document.querySelectorAll('label, span, td, div');
        for (var i = 0; i < allEls.length; i++) {
            var text = (allEls[i].textContent || '').trim();
            
            for (var l = 0; l < labels.length; l++) {
                if (text.toLowerCase().indexOf(labels[l].toLowerCase()) >= 0 && text.length < 60) {
                    // Encontrou o label — procura o valor perto
                    var next = allEls[i].nextElementSibling;
                    if (next) {
                        var val = getNumericValue(next);
                        if (val) return val;
                    }
                    var input = allEls[i].querySelector('input');
                    if (!input) input = allEls[i].parentElement ? allEls[i].parentElement.querySelector('input') : null;
                    if (input && input.value) return input.value.trim();
                    var parent = allEls[i].parentElement;
                    if (parent) {
                        var children = parent.children;
                        var foundSelf = false;
                        for (var c = 0; c < children.length; c++) {
                            if (children[c] === allEls[i]) { foundSelf = true; continue; }
                            if (foundSelf) {
                                var v = getNumericValue(children[c]);
                                if (v) return v;
                            }
                        }
                    }
                    var td = allEls[i].closest('td');
                    if (td && td.nextElementSibling) {
                        var v2 = getNumericValue(td.nextElementSibling);
                        if (v2) return v2;
                    }
                }
            }
        }
        return null;
    }

    function getNumericValue(el) {
        if (!el) return null;
        var inp = el.querySelector ? el.querySelector('input') : null;
        if (inp && inp.value) return inp.value.trim();
        var t = (el.textContent || '').trim();
        if (t.match(/\d+[.,]\d+/) || t.match(/^\d+$/)) return t;
        return null;
    }

    async function executeVisionCorrections(actions, label) {
        for (var a = 0; a < actions.length; a++) {
            if (actions[a] === 'gerarIOF' || (actions[a].indexOf && actions[a].indexOf('IOF') >= 0)) {
                SkDebug.log(label, 'EXEC', 'Re-clicando Gerar IOF...');
                clickButtonByLabel('Gerar IOF');
                await delay(3000);
                await waitForToast('IOF retry', 'sucesso', 10000);
                await delay(1000);
            }
            if (actions[a] === 'gerarContrato' || (actions[a].indexOf && (actions[a].indexOf('contrato') >= 0 || actions[a].indexOf('Contrato') >= 0))) {
                SkDebug.log(label, 'EXEC', 'Re-clicando Gerar contrato de cambio...');
                clickButtonByLabel('Gerar contrato de cambio');
                await delay(3000);
            }
        }
        SkDebug.log(label, 'OK', 'Correções aplicadas baseado na visão');
    }

    // ===== INTERVENÇÃO HUMANA: Agente pausa, usuário faz, agente aprende =====
    async function humanTakeover(stepLabel, actionType, expectedValue) {
        SkDebug.log(stepLabel, 'INFO', '🙋 INTERVENÇÃO HUMANA — Faça a ação manualmente. Clique PRONTO quando terminar.');

        return new Promise(function(resolve) {
            var clickedElements = [];
            var changedElements = [];
            var resolved = false;

            // Banner visual — IMPOSSÍVEL de não ver
            var banner = document.createElement('div');
            banner.id = 'sk-human-takeover';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(135deg,#ff6b35,#e63946);color:#fff;padding:20px 30px;font-size:20px;font-weight:bold;text-align:center;box-shadow:0 6px 30px rgba(0,0,0,0.6);font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;gap:20px;animation:sk-pulse 1s ease-in-out infinite;';
            
            // Injeta CSS da animação
            var pulseStyle = document.createElement('style');
            pulseStyle.textContent = '@keyframes sk-pulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }';
            document.head.appendChild(pulseStyle);

            banner.innerHTML = '🙋 INTERVENÇÃO HUMANA: <span style="font-weight:normal;font-size:18px;">' + stepLabel + ' → ' + (expectedValue || actionType) + '</span>';

            var btnPronto = document.createElement('button');
            btnPronto.textContent = '✅ PRONTO';
            btnPronto.style.cssText = 'background:#2ecc71;color:#fff;border:none;padding:12px 30px;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,0.3);';
            banner.appendChild(btnPronto);

            var btnPular = document.createElement('button');
            btnPular.textContent = '⏭ PULAR';
            btnPular.style.cssText = 'background:#95a5a6;color:#fff;border:none;padding:12px 30px;border-radius:8px;font-size:16px;cursor:pointer;';
            banner.appendChild(btnPular);

            document.body.appendChild(banner);

            // Listener de cliques — grava CSS path de TUDO que o user clica
            function getCssPath(el) {
                if (!el || el === document.body) return 'body';
                var path = [];
                while (el && el !== document.body) {
                    var tag = el.tagName.toLowerCase();
                    if (el.id) {
                        path.unshift('#' + el.id);
                        break;
                    }
                    var classes = Array.from(el.classList || []).filter(function(c) {
                        return c.indexOf('ng-tns') < 0 && c.indexOf('ng-star') < 0 && c.length < 30;
                    }).slice(0, 2);
                    var sel = tag + (classes.length ? '.' + classes.join('.') : '');
                    path.unshift(sel);
                    el = el.parentElement;
                }
                return path.join(' > ');
            }

            function clickHandler(e) {
                if (e.target === btnPronto || e.target === btnPular || banner.contains(e.target)) return;
                var cssPath = getCssPath(e.target);
                var text = (e.target.textContent || '').trim().substring(0, 50);
                clickedElements.push({ path: cssPath, text: text, tag: e.target.tagName });
                SkDebug.log(stepLabel, 'INFO', '👆 User clicou: ' + cssPath + ' "' + text + '"');
            }

            // MutationObserver — grava mudanças no DOM
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(m) {
                    if (m.type === 'attributes' && m.attributeName === 'class') {
                        var el = m.target;
                        if (el.offsetParent !== null) { // Só elementos visíveis
                            changedElements.push({ path: getCssPath(el), type: 'class-change' });
                        }
                    }
                    if (m.type === 'childList' && m.addedNodes.length) {
                        m.addedNodes.forEach(function(node) {
                            if (node.nodeType === 1) { // ELEMENT_NODE
                                changedElements.push({ path: getCssPath(node), type: 'added', tag: node.tagName });
                            }
                        });
                    }
                });
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

            document.addEventListener('click', clickHandler, true);

            function cleanup() {
                if (resolved) return;
                resolved = true;
                document.removeEventListener('click', clickHandler, true);
                observer.disconnect();
                if (banner.parentNode) banner.parentNode.removeChild(banner);
            }

            btnPronto.addEventListener('click', function() {
                cleanup();
                // Salva na memória o que o user fez
                SkDebug.log(stepLabel, 'OK', '🙋 Humano completou! Clicou em ' + clickedElements.length + ' elementos');

                if (clickedElements.length > 0) {
                    // Salva os paths clicados na memória pra próxima vez
                    var learnedSteps = clickedElements.map(function(c) { return c.path; });
                    SkMemory.remember(stepLabel + '_human', {
                        ok: true,
                        humanSteps: learnedSteps,
                        humanTexts: clickedElements.map(function(c) { return c.text; }),
                        actionType: actionType,
                        timestamp: Date.now()
                    });
                    SkDebug.log(stepLabel, 'INFO', '🧠 Aprendeu ' + learnedSteps.length + ' passos do humano');
                    learnedSteps.forEach(function(s, i) {
                        SkDebug.log(stepLabel, 'INFO', '  Passo ' + (i+1) + ': ' + s);
                    });
                }

                resolve(true);
            });

            btnPular.addEventListener('click', function() {
                cleanup();
                SkDebug.log(stepLabel, 'INFO', '⏭ Passo pulado pelo humano');
                resolve(false);
            });

            // Timeout de 60s — se o user não clicar PRONTO, pula
            setTimeout(function() {
                if (!resolved) {
                    cleanup();
                    SkDebug.log(stepLabel, 'INFO', '⏱ Timeout de intervenção humana (60s)');
                    resolve(false);
                }
            }, 60000);
        });
    }

    // ===== selectDropdownInRow: PrimeNG p-table inline editing =====
    async function selectDropdownInRow(label, value, rowMatch) {
        SkDebug.log(label, 'INFO', 'Procurando dropdown na tabela');

        // PASSO 1: Scroll até "Tipos de Arquivo"
        var allEls = document.querySelectorAll('span, div, th');
        for (var h = 0; h < allEls.length; h++) {
            var htxt = allEls[h].textContent.trim();
            if (htxt === 'Tipos de Arquivos' || htxt === 'Tipos de Arquivo') {
                allEls[h].scrollIntoView({ block: 'center', behavior: 'smooth' });
                await delay(500);
                break;
            }
        }

        // PASSO 2: Encontra a TD com "selecione" na coluna CORRETA ("Tipo do arquivo", NÃO "Tipo arquivo Dati")
        var targetTD = null;
        var targetRow = null;

        var allTDs = document.querySelectorAll('td');
        for (var t = 0; t < allTDs.length; t++) {
            var tdText = allTDs[t].textContent.trim().toLowerCase();
            if (tdText === 'selecione') {
                var row = allTDs[t].closest('tr');
                if (rowMatch && row && row.textContent.toLowerCase().indexOf(rowMatch.toLowerCase()) < 0) continue;

                // Descobre o indice dessa TD na row
                var tds = row.querySelectorAll('td');
                var tdIdx = Array.prototype.indexOf.call(tds, allTDs[t]);

                // Busca o header DESSA tabela especifica
                var table = allTDs[t].closest('table');
                if (table) {
                    var ths = table.querySelectorAll('thead th, tr:first-child th');
                    if (ths.length > 0 && tdIdx < ths.length) {
                        var colHeader = ths[tdIdx].textContent.trim().toLowerCase();
                        // Se o header da coluna contem "dati", pula — é a coluna errada
                        if (colHeader.indexOf('dati') >= 0) {
                            continue;
                        }
                    }
                }

                targetTD = allTDs[t];
                targetRow = row;
                break;
            }
        }

        if (!targetTD) {
            SkDebug.log(label, 'FAIL', 'Nenhuma TD com "selecione"');
            return await humanTakeover(label, 'selectDropdown', value);
        }

        SkDebug.log(label, 'INFO', 'TD "selecione" encontrada. Dblclick...');

        // PASSO 2.5: Limpa overlays antigos (fecha paineis de dropdowns anteriores)
        var oldPanels = document.querySelectorAll('.ui-dropdown-panel');
        for (var op = 0; op < oldPanels.length; op++) {
            oldPanels[op].style.display = 'none';
            oldPanels[op].style.opacity = '0';
        }
        await delay(200);

        // PASSO 3: DBLCLICK na TD
        targetTD.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await delay(300);
        targetTD.click();
        await delay(200);
        targetTD.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        await delay(1200);

        // PASSO 4: Espera dropdown VISÍVEL
        var editDropdown = null;
        for (var w = 0; w < 20; w++) {
            // Busca na TD recém-editada
            var dds = targetTD.querySelectorAll('.ui-dropdown, p-dropdown');
            if (dds.length === 0) dds = (targetRow || document).querySelectorAll('.ui-dropdown, p-dropdown');
            for (var dd = 0; dd < dds.length; dd++) {
                if (dds[dd].offsetParent !== null || dds[dd].offsetWidth > 0) {
                    editDropdown = dds[dd];
                    break;
                }
            }
            if (editDropdown) break;
            await delay(200);
        }

        if (!editDropdown) {
            SkDebug.log(label, 'FAIL', 'Dropdown editável não apareceu');
            return await humanTakeover(label, 'selectDropdown', value);
        }

        // Pega a classe dinâmica ng-tns do dropdown pra matching do overlay
        var ngClass = null;
        var classes = (editDropdown.className || '').split(' ');
        for (var nc = 0; nc < classes.length; nc++) {
            if (classes[nc].indexOf('ng-tns-') >= 0) { ngClass = classes[nc]; break; }
        }
        SkDebug.log(label, 'INFO', 'Dropdown VISÍVEL! ng-class: ' + (ngClass || 'nenhum'));

        // Snapshot de todos os overlay panels ANTES de clicar
        var panelsBefore = new Set();
        document.querySelectorAll('.ui-dropdown-panel').forEach(function(p) { panelsBefore.add(p); });

        // PASSO 5: Abre dropdown com eventos mouse REAIS (Angular precisa disso)
        function fireClick(el) {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }

        var dlabel = editDropdown.querySelector('.ui-dropdown-label, label');
        if (dlabel) {
            fireClick(dlabel);
            SkDebug.log(label, 'INFO', 'fireClick na label');
        } else {
            fireClick(editDropdown);
        }
        await delay(800);

        var trigger = editDropdown.querySelector('.ui-dropdown-trigger, .ui-dropdown-trigger-icon');
        if (trigger) { fireClick(trigger); await delay(800); }

        // PASSO 6: Encontra overlay — aceita panel com ng-class matching MESMO sem items visíveis
        var overlay = null;
        for (var w2 = 0; w2 < 20; w2++) {
            var allPanels = document.querySelectorAll('.ui-dropdown-panel, .ui-dropdown-items-wrapper');
            for (var pp = 0; pp < allPanels.length; pp++) {
                var panel = allPanels[pp];
                var isNew = !panelsBefore.has(panel);
                var isVisible = panel.offsetParent !== null || panel.offsetWidth > 0;
                var hasItems = panel.querySelectorAll('li, .ui-dropdown-item').length > 0;
                var matchesNg = ngClass && (panel.className || '').indexOf(ngClass) >= 0;

                // Aceita se: (visível com items) OU (ng-class matching E visível) OU (novo E visível)
                if (isVisible && (hasItems || matchesNg || isNew)) {
                    overlay = panel;
                    SkDebug.log(label, 'INFO', 'Overlay encontrado: vis=' + isVisible + ' items=' + hasItems + ' ng=' + matchesNg);
                    break;
                }
            }
            if (overlay) break;
            await delay(200);
        }

        // Se não encontrou com visibilidade, tenta forçar o panel matching por ng-class a abrir
        if (!overlay && ngClass) {
            var matchPanel = document.querySelector('.ui-dropdown-panel.' + ngClass);
            if (matchPanel) {
                SkDebug.log(label, 'INFO', 'Forçando panel ng-class visível');
                matchPanel.style.display = 'block';
                matchPanel.style.opacity = '1';
                matchPanel.style.visibility = 'visible';
                matchPanel.style.transform = 'none';
                await delay(500);
                // Re-clica no dropdown pra Angular sincronizar
                if (dlabel) fireClick(dlabel);
                else fireClick(editDropdown);
                await delay(800);
                // Verifica se tem items agora
                if (matchPanel.querySelectorAll('li').length > 0 || matchPanel.offsetParent !== null) {
                    overlay = matchPanel;
                }
            }
        }

        if (!overlay) {
            SkDebug.log(label, 'FAIL', 'Overlay não encontrado');
            var anyPanels = document.querySelectorAll('.ui-dropdown-panel');
            SkDebug.log(label, 'DEBUG', 'Panels: ' + anyPanels.length);
            anyPanels.forEach(function(p, i) {
                var items = p.querySelectorAll('li, .ui-dropdown-item, span').length;
                var pngc = '';
                (p.className || '').split(' ').forEach(function(c) { if (c.indexOf('ng-tns') >= 0) pngc = c; });
                SkDebug.log(label, 'DEBUG', 'P' + i + ': vis=' + (p.offsetParent !== null) + ' items=' + items + ' ng=' + pngc);
            });
            return await humanTakeover(label, 'selectDropdown', value);
        }

        // PASSO 7: Digita no filtro se existir
        var filterInput = overlay.querySelector('.ui-dropdown-filter, input[type="text"], input.ui-inputtext');
        if (filterInput) {
            SkDebug.log(label, 'INFO', 'Filtro encontrado, digitando: ' + value);
            filterInput.focus();
            // Limpa filtro anterior com eventos
            filterInput.value = '';
            filterInput.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(300);
            for (var ch = 0; ch < value.length; ch++) {
                filterInput.value += value[ch];
                filterInput.dispatchEvent(new Event('input', { bubbles: true }));
                await delay(50);
            }
            await delay(600);
        }

        // PASSO 8: Seleciona opção
        var valueLower = value.toLowerCase();
        // Tenta TODOS os tipos de child elements
        var options = overlay.querySelectorAll('li, .ui-dropdown-item, span.ng-star-inserted');
        SkDebug.log(label, 'INFO', 'Opções: ' + options.length);

        var optionFound = false;
        for (var o = 0; o < options.length; o++) {
            var optText = options[o].textContent.trim().toLowerCase();
            if (!optText || optText === 'selecione') continue;
            if (optText.indexOf(valueLower) >= 0 || valueLower.indexOf(optText) >= 0) {
                options[o].scrollIntoView({ block: 'nearest' });
                await delay(100);
                options[o].click();
                optionFound = true;
                SkDebug.log(label, 'OK', 'Selecionou: "' + options[o].textContent.trim() + '"');
                await delay(500);
                break;
            }
        }

        if (!optionFound) {
            var avail = [];
            options.forEach(function(op) { var t = op.textContent.trim(); if (t) avail.push('"' + t + '"'); });
            SkDebug.log(label, 'FAIL', 'Opção "' + value + '" não achada. Disponíveis: ' + avail.join(' | '));
            return await humanTakeover(label, 'selectDropdown', value);
        }

        return true;
    }

    // ===== clickRowSaveBtn: Clica no botão salvar (fa-save) dentro da row da tabela =====
    function clickRowSaveBtn(rowMatch) {
        // Procura em todas as rows
        var rows = document.querySelectorAll('tr');
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            // Se tem rowMatch, verifica se a row contém o texto
            if (rowMatch && row.textContent.toLowerCase().indexOf(rowMatch.toLowerCase()) < 0) continue;

            var saveIcon = row.querySelector('.fa-save, [class*="fa-save"]');
            if (saveIcon) {
                var btn = saveIcon.closest('button, a') || saveIcon.parentElement || saveIcon;
                btn.click();
                SkDebug.log('Salvar Row', 'INFO', 'Clicou save na row' + (rowMatch ? ' (' + rowMatch + ')' : ''));
                return true;
            }
        }

        // Fallback: qualquer botão fa-save visível
        var globalSave = document.querySelector('.fa-save, [class*="fa-save"]');
        if (globalSave) {
            var globalBtn = globalSave.closest('button, a') || globalSave;
            globalBtn.click();
            SkDebug.log('Salvar Row', 'INFO', 'Clicou save global (fallback)');
            return true;
        }

        return false;
    }

    function clickButtonByLabel(label) {
        var buttons = document.querySelectorAll('button, a[role="button"]');
        var labelLower = label.toLowerCase();
        for (var i = 0; i < buttons.length; i++) {
            var txt = buttons[i].textContent.trim().toLowerCase();
            if (txt.indexOf(labelLower) >= 0 || txt === labelLower) {
                buttons[i].click();
                console.log('Skychart AI: Clicou botão:', label);
                return true;
            }
        }
        // Tenta spans Angular
        var spans = document.querySelectorAll('span[class*="ng-tns"]');
        for (var j = 0; j < spans.length; j++) {
            if (spans[j].textContent.trim().toLowerCase().indexOf(labelLower) >= 0) {
                var btn = spans[j].closest('button, a') || spans[j];
                btn.click();
                console.log('Skychart AI: Clicou botão (span):', label);
                return true;
            }
        }
        return false;
    }

    function clickCheckboxByLabel(label) {
        var labelLower = label.toLowerCase();
        // Tenta pelo texto do label
        var allLabels = document.querySelectorAll('label, span, div');
        for (var i = 0; i < allLabels.length; i++) {
            var txt = allLabels[i].textContent.trim().toLowerCase();
            if (txt === labelLower) {
                var container = allLabels[i].closest('div, td, li, p-checkbox') || allLabels[i].parentElement;
                if (container) {
                    var chk = container.querySelector('.ui-chkbox-icon, .ui-chkbox-box, input[type="checkbox"]');
                    if (chk) { chk.click(); console.log('Skychart AI: Clicou checkbox:', label); return true; }
                }
                allLabels[i].click();
                return true;
            }
        }
        // Fallback: checkbox próximo ao texto
        var checks = document.querySelectorAll('.ui-chkbox-icon, .ui-chkbox-box');
        for (var j = 0; j < checks.length; j++) {
            var ctx = checks[j].closest('div, tr, li');
            if (ctx && ctx.textContent.toLowerCase().indexOf(labelLower) >= 0) {
                checks[j].click();
                return true;
            }
        }
        return false;
    }

    function findInputByLabel(labelText) {
        var labelLower = labelText.toLowerCase();
        var allLabels = document.querySelectorAll('label, span, div');
        for (var i = 0; i < allLabels.length; i++) {
            var txt = allLabels[i].textContent.trim();
            if (txt.toLowerCase().indexOf(labelLower) >= 0 && txt.length < 80) {
                var parent = allLabels[i].closest('div, td, span') || allLabels[i].parentElement;
                if (!parent) continue;
                var input = parent.querySelector('.p-inputnumber-input, input[inputmode="decimal"], input[type="text"], input');
                if (!input) {
                    var next = allLabels[i].nextElementSibling;
                    while (next && !input) {
                        input = next.querySelector('.p-inputnumber-input, input[inputmode="decimal"], input');
                        if (!input && next.classList && next.classList.contains('p-inputnumber-input')) input = next;
                        next = next.nextElementSibling;
                    }
                }
                if (!input) {
                    var gp = parent.parentElement;
                    if (gp) input = gp.querySelector('.p-inputnumber-input, input[inputmode="decimal"]');
                }
                if (input) return input;
            }
        }
        return null;
    }


    // ========================================================================
    // PUBLIC API
    // ========================================================================

    return {
        detect: detectComponent,
        diagnose: diagnose,
        engine: Engine,
        run: runModule,
        delay: delay,
        highlight: highlight,
        findInputByLabel: findInputByLabel,
        clickButtonByLabel: clickButtonByLabel,
        clickCheckboxByLabel: clickCheckboxByLabel
    };

})();

// Expõe globalmente pra acesso pelo console
window.SkAgent = SkAgent;
console.log('Skychart AI: SmartAgent carregado.');

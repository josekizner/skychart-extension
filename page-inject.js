// page-inject.js
// Roda no contexto PRINCIPAL da página (main world) APÓS o dblclick trusted.
// O dblclick já foi feito via chrome.debugger (isTrusted: true).
// Este script apenas seleciona a opção no dropdown e salva.

(function () {
    console.log("Skychart AI [PAGE]: Procurando dropdown após dblclick...");

    var jq = (typeof $ === 'function' && $.fn) ? $ : (typeof jQuery === 'function' ? jQuery : null);
    console.log("Skychart AI [PAGE]: jQuery:", jq ? "v" + jq.fn.jquery : "N/A");

    // Aguarda o dropdown aparecer (pode demorar um pouco após o dblclick)
    var attempts = 0;
    var timer = setInterval(function () {
        attempts++;

        // Busca na tabela inteira (a célula editada pode ter mudado)
        var rows = document.querySelectorAll('.ui-datatable tbody tr');
        var lastRow = rows.length ? rows[rows.length - 1] : null;

        // Busca dropdown DENTRO da última linha
        var selectInRow = lastRow ? lastRow.querySelector('select') : null;
        var dropdownInRow = lastRow ? lastRow.querySelector('.ui-dropdown, .ui-selectonemenu') : null;
        var editingCell = lastRow ? lastRow.querySelector('.ui-cell-editing, .ui-editing-cell') : null;

        // Busca elementos como "Selecione" label que indicam modo de edição
        var selecione = lastRow ? Array.from(lastRow.querySelectorAll('label, span, div')).find(function (el) {
            return el.textContent.trim().toLowerCase() === 'selecione';
        }) : null;

        console.log("Skychart AI [PAGE]: Tentativa " + attempts +
            " | select: " + !!selectInRow +
            " | dropdown: " + !!dropdownInRow +
            " | editing: " + !!editingCell +
            " | selecione: " + !!selecione);

        // Se achou um <select> nativo
        if (selectInRow) {
            clearInterval(timer);
            handleNativeSelect(selectInRow);
            return;
        }

        // Se achou dropdown PrimeNG
        if (dropdownInRow) {
            clearInterval(timer);
            handlePrimeNGDropdown(dropdownInRow);
            return;
        }

        // Se achou o "Selecione" label, clica nele para abrir
        if (selecione) {
            clearInterval(timer);
            console.log("Skychart AI [PAGE]: Encontrou 'Selecione'! Clicando...");
            selecione.click();
            if (jq) jq(selecione).trigger('click');
            setTimeout(function () { checkForDropdownAfterClick(); }, 600);
            return;
        }

        if (attempts >= 15) {
            clearInterval(timer);
            var html = lastRow ? lastRow.innerHTML.substring(0, 600) : 'N/A';
            console.warn("Skychart AI [PAGE]: TimeOut! HTML da linha:", html);
            window.postMessage({
                type: 'SKYCHART_AI_RESULT',
                success: false,
                message: 'Dropdown não apareceu após dblclick',
                debug: html
            }, '*');
        }
    }, 400);

    function checkForDropdownAfterClick() {
        // Após clicar no "Selecione", verifica se apareceu um painel ou select
        var panel = document.querySelector(
            '.ui-dropdown-panel:not([style*="display: none"]), ' +
            '.ui-selectonemenu-panel:not([style*="display: none"]), ' +
            '.ui-overlay-visible'
        );

        if (panel) {
            // Busca campo de filtro
            var filterInput = panel.querySelector('input');
            if (filterInput) {
                filterInput.value = 'contrato';
                filterInput.dispatchEvent(new Event('input', { bubbles: true }));
                filterInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            }

            // Aguarda e seleciona a opção
            setTimeout(function () {
                var items = panel.querySelectorAll('li, .ui-dropdown-item, .ui-selectonemenu-item');
                selectFromItems(items);
            }, 400);
        } else {
            // Procura items de dropdown globalmente
            var items = document.querySelectorAll(
                '.ui-dropdown-item, .ui-dropdown-items li, .ui-selectonemenu-item, .ui-selectonemenu-items li'
            );
            if (items.length > 0) {
                selectFromItems(items);
            } else {
                window.postMessage({ type: 'SKYCHART_AI_RESULT', success: false, message: 'Painel não abriu' }, '*');
            }
        }
    }

    function handleNativeSelect(selectEl) {
        console.log("Skychart AI [PAGE]: <select> encontrado com", selectEl.options.length, "opções:");
        for (var i = 0; i < selectEl.options.length; i++) {
            console.log("  [" + i + "] '" + selectEl.options[i].text + "' (value: " + selectEl.options[i].value + ")");
        }

        for (var i = 0; i < selectEl.options.length; i++) {
            var txt = selectEl.options[i].text.toLowerCase();
            if (txt.indexOf('contrato') >= 0 && txt.indexOf('mbio') >= 0) {
                selectEl.value = selectEl.options[i].value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                if (jq) jq(selectEl).val(selectEl.options[i].value).trigger('change');
                console.log("Skychart AI [PAGE]: Selecionou:", selectEl.options[i].text);
                setTimeout(tentarSalvar, 800);
                return;
            }
        }
        window.postMessage({
            type: 'SKYCHART_AI_RESULT', success: false,
            message: 'Opção não encontrada no select',
            debug: Array.from(selectEl.options).map(function (o) { return o.text; })
        }, '*');
    }

    function handlePrimeNGDropdown(dropdown) {
        console.log("Skychart AI [PAGE]: Dropdown PrimeNG:", dropdown.className);
        var trigger = dropdown.querySelector('.ui-dropdown-trigger, .ui-selectonemenu-trigger, .ui-dropdown-label, .ui-selectonemenu-label') || dropdown;
        trigger.click();
        if (jq) jq(trigger).trigger('click');

        setTimeout(function () { checkForDropdownAfterClick(); }, 500);
    }

    function selectFromItems(items) {
        console.log("Skychart AI [PAGE]: Buscando em", items.length, "opções...");
        for (var i = 0; i < items.length; i++) {
            var txt = items[i].textContent.trim().toLowerCase();
            if (txt.indexOf('contrato') >= 0 && txt.indexOf('mbio') >= 0) {
                items[i].click();
                if (jq) jq(items[i]).trigger('click');
                console.log("Skychart AI [PAGE]: Selecionou:", items[i].textContent.trim());
                setTimeout(tentarSalvar, 800);
                return;
            }
        }
        var opts = [];
        for (var i = 0; i < items.length; i++) opts.push(items[i].textContent.trim());
        console.warn("Skychart AI [PAGE]: Opções:", opts);
        window.postMessage({ type: 'SKYCHART_AI_RESULT', success: false, message: 'Opção não encontrada', debug: opts }, '*');
    }

    function tentarSalvar() {
        console.log("Skychart AI [PAGE]: Procurando botão salvar...");
        var saveBtn = document.querySelector('[id*="salvar"]:not([disabled])') ||
            document.querySelector('.pi-save, .fa-save, .fa-floppy-o');
        if (saveBtn) {
            var btn = saveBtn.closest('button, a') || saveBtn;
            btn.click();
            if (jq) jq(btn).trigger('click');
            window.postMessage({ type: 'SKYCHART_AI_RESULT', success: true, message: 'Salvo como Contrato de Câmbio! 🎉' }, '*');
        } else {
            window.postMessage({ type: 'SKYCHART_AI_RESULT', success: false, message: 'Tipo OK — clique no 💾' }, '*');
        }
    }
})();

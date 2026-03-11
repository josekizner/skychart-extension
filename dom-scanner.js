/**
 * SKYCHART DOM SCANNER — Auto-descoberta de campos do formulário
 * 
 * Escaneia a página atual, cataloga todos os campos (input, select, textarea),
 * detecta tipo PrimeNG via SkAgent.detect(), descobre labels adjacentes,
 * gera seletores estáveis, e salva no chrome.storage pra uso futuro.
 * 
 * Elimina a necessidade de outerHTML manual ou seletores hardcoded.
 */

var SkScanner = (function () {
    'use strict';

    var STORAGE_KEY = 'sk_dom_scan_v1';
    var _lastScan = null;
    var SCAN_TTL = 5 * 60 * 1000; // 5 minutos — scan válido por esse tempo

    // ========================================================================
    // SCAN — Escaneia todos os campos da seção ativa
    // ========================================================================

    function scan(options) {
        options = options || {};
        var silent = options.silent || false;

        if (!silent) SkDebug.log('Scanner', 'EXEC', '🔍 Escaneando campos da página...');

        var fields = [];
        var allInputs = document.querySelectorAll('input, select, textarea');

        for (var i = 0; i < allInputs.length; i++) {
            var el = allInputs[i];

            // Pula inputs hidden, submit, button, file
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file') continue;
            // Pula se não está visível
            if (!el.offsetParent && el.type !== 'checkbox') continue;

            var fieldInfo = analyzeField(el);
            if (fieldInfo) fields.push(fieldInfo);
        }

        // Monta resultado do scan
        var pageUrl = window.location.hash || window.location.pathname;
        var section = detectSection();

        _lastScan = {
            page: pageUrl,
            section: section,
            scannedAt: new Date().toISOString(),
            fieldCount: fields.length,
            fields: fields
        };

        // Salva no storage
        saveScan(_lastScan);

        if (!silent) {
            SkDebug.log('Scanner', 'OK', '✅ ' + fields.length + ' campos descobertos');
            console.log('[SkScanner] Scan completo:', _lastScan);
        }

        return _lastScan;
    }

    // ========================================================================
    // ANALYZE FIELD — Analisa um campo individual
    // ========================================================================

    function analyzeField(el) {
        var info = {
            label: '',
            id: el.id || '',
            name: el.getAttribute('name') || el.getAttribute('formcontrolname') || '',
            selector: '',
            type: 'unknown',
            strategy: 'none',
            tagName: el.tagName.toLowerCase(),
            placeholder: el.getAttribute('placeholder') || '',
            title: el.getAttribute('title') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            required: el.required || el.getAttribute('required') === 'true',
            currentValue: (el.value || '').substring(0, 100),
            classes: (el.className || '').substring(0, 200)
        };

        // 1. Detecta tipo PrimeNG via SkAgent
        if (typeof SkAgent !== 'undefined') {
            var comp = SkAgent.detect(el);
            info.type = comp.type || 'unknown';
            info.strategy = comp.strategy || 'none';
        } else {
            // Fallback: detecção manual
            info.type = detectTypeManual(el);
            info.strategy = getStrategyForType(info.type);
        }

        // 2. Descobre o label
        info.label = discoverLabel(el);

        // 3. Gera o seletor mais estável
        info.selector = generateSelector(el);

        // Pula campos sem label e sem ID (não são úteis)
        if (!info.label && !info.id && !info.name) return null;

        return info;
    }

    // ========================================================================
    // DISCOVER LABEL — Busca o label/rótulo do campo
    // ========================================================================

    function discoverLabel(el) {
        // Estratégia 1: <label for="id">
        if (el.id) {
            var linkedLabel = document.querySelector('label[for="' + el.id + '"]');
            if (linkedLabel) return cleanLabel(linkedLabel.textContent);
        }

        // Estratégia 2: aria-label / title
        if (el.getAttribute('aria-label')) return cleanLabel(el.getAttribute('aria-label'));
        if (el.getAttribute('title')) return cleanLabel(el.getAttribute('title'));

        // Estratégia 3: TD anterior na mesma row (padrão Skychart PrimeNG)
        var td = el.closest('td');
        if (td) {
            var prevTd = td.previousElementSibling;
            if (prevTd) {
                // Pega texto direto do TD (sem filhos profundos)
                var directText = getDirectText(prevTd);
                if (directText && directText.length < 60) return cleanLabel(directText);
            }
        }

        // Estratégia 4: Label/span irmão anterior
        var parent = el.parentElement;
        if (parent) {
            var prev = el.previousElementSibling;
            if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
                return cleanLabel(prev.textContent);
            }
        }

        // Estratégia 5: Texto direto do parent (se parent tem poucas children)
        if (parent && parent.children.length <= 3) {
            var parentDirect = getDirectText(parent);
            if (parentDirect && parentDirect.length < 40) return cleanLabel(parentDirect);
        }

        // Estratégia 6: Extrai do ID/name (formularioEmbarque-dsViagem → Viagem)
        var idOrName = el.id || el.getAttribute('formcontrolname') || '';
        if (idOrName) {
            var extracted = extractLabelFromId(idOrName);
            if (extracted) return extracted;
        }

        return '';
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    function getDirectText(element) {
        var text = '';
        for (var i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 3) { // TEXT_NODE
                text += element.childNodes[i].textContent;
            }
        }
        return text.trim();
    }

    function cleanLabel(text) {
        return (text || '').replace(/\s+/g, ' ').replace(/[:\*]/g, '').trim();
    }

    function extractLabelFromId(id) {
        // formularioEmbarque-dsViagem → Viagem
        // formularioEmbarque-dtPrevisaoEmbarque → Previsão Embarque
        var parts = id.split(/[-_.]/);
        var last = parts[parts.length - 1] || '';
        // Remove prefixos comuns: ds, dt, cd, nr, fl
        last = last.replace(/^(ds|dt|cd|nr|fl|in|tx)/, '');
        if (!last) return '';
        // CamelCase → espaços
        return last.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }

    function generateSelector(el) {
        // Prioridade 1: #id (mais estável)
        if (el.id) return '#' + CSS.escape(el.id);

        // Prioridade 2: [formcontrolname]
        var fcn = el.getAttribute('formcontrolname');
        if (fcn) return '[formcontrolname="' + fcn + '"]';

        // Prioridade 3: [name]
        if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';

        // Prioridade 4: input type + classes únicas
        var classes = Array.from(el.classList).filter(function (c) {
            return !c.startsWith('ng-') && !c.startsWith('ui-') && c.length > 3;
        });
        if (classes.length > 0) {
            return el.tagName.toLowerCase() + '.' + classes.join('.');
        }

        // Fallback: nth-child
        var parent = el.parentElement;
        if (parent) {
            var idx = Array.from(parent.children).indexOf(el);
            return el.tagName.toLowerCase() + ':nth-child(' + (idx + 1) + ')';
        }

        return '';
    }

    function detectTypeManual(el) {
        var classes = el.className || '';
        if (classes.indexOf('ui-autocomplete-input') >= 0) return 'autocomplete';
        if (classes.indexOf('ui-calendar') >= 0 || el.closest('.ui-calendar')) return 'calendar';
        if (classes.indexOf('ui-dropdown') >= 0 || el.closest('.ui-dropdown')) return 'dropdown';
        if (classes.indexOf('ui-chkbox') >= 0 || el.type === 'checkbox') return 'checkbox';
        if (el.tagName === 'SELECT') return 'dropdown';
        if (el.tagName === 'TEXTAREA') return 'textarea';
        if (el.type === 'number') return 'number-input';
        return 'text-input';
    }

    function getStrategyForType(type) {
        var map = {
            'autocomplete': 'char-by-char',
            'calendar': 'char-by-char',
            'dropdown': 'click',
            'checkbox': 'click',
            'text-input': 'native-set',
            'number-input': 'native-set',
            'textarea': 'native-set',
            'grid-cell': 'grid-edit'
        };
        return map[type] || 'native-set';
    }

    function detectSection() {
        // Tenta pegar o accordion aberto
        var openAccordion = document.querySelector('.ui-accordion-content-wrapper[style*="block"], .ui-accordion-content[aria-hidden="false"]');
        if (openAccordion) {
            var header = openAccordion.previousElementSibling;
            if (header) return header.textContent.trim().substring(0, 100);
        }
        // Fallback: titulo da página
        var title = document.querySelector('.ui-panel-title, h1, h2');
        return title ? title.textContent.trim().substring(0, 100) : '';
    }

    // ========================================================================
    // STORAGE — Persiste scan no chrome.storage
    // ========================================================================

    function saveScan(scanResult) {
        try {
            var obj = {};
            obj[STORAGE_KEY] = scanResult;
            chrome.storage.local.set(obj);
        } catch (e) {
            console.warn('[SkScanner] Erro ao salvar:', e);
        }
    }

    function loadScan() {
        return new Promise(function (resolve) {
            try {
                chrome.storage.local.get(STORAGE_KEY, function (data) {
                    _lastScan = (data && data[STORAGE_KEY]) || null;
                    resolve(_lastScan);
                });
            } catch (e) {
                resolve(null);
            }
        });
    }

    // ========================================================================
    // GETFIELD — Busca um campo pelo label (principal método de consulta)
    // ========================================================================

    function getField(labelSearch) {
        if (!labelSearch) return null;
        var search = labelSearch.toLowerCase().replace(/[:\s]/g, '');

        // Se não tem scan ou é antigo, faz um novo
        if (!_lastScan || isStale()) {
            scan({ silent: true });
        }

        if (!_lastScan || !_lastScan.fields) return null;

        // Match exato primeiro
        for (var i = 0; i < _lastScan.fields.length; i++) {
            var f = _lastScan.fields[i];
            var fLabel = (f.label || '').toLowerCase().replace(/[:\s]/g, '');
            if (fLabel === search) return f;
        }

        // Match parcial (contém)
        for (var j = 0; j < _lastScan.fields.length; j++) {
            var f2 = _lastScan.fields[j];
            var fLabel2 = (f2.label || '').toLowerCase().replace(/[:\s]/g, '');
            // Evita matches ambíguos: "viagem" não deve casar com "viagemfeeder"
            if (fLabel2.indexOf(search) === 0 || search.indexOf(fLabel2) === 0) return f2;
        }

        // Match por ID
        for (var k = 0; k < _lastScan.fields.length; k++) {
            var f3 = _lastScan.fields[k];
            if ((f3.id || '').toLowerCase().indexOf(search) >= 0) return f3;
        }

        return null;
    }

    function isStale() {
        if (!_lastScan || !_lastScan.scannedAt) return true;
        var age = Date.now() - new Date(_lastScan.scannedAt).getTime();
        return age > SCAN_TTL;
    }

    // ========================================================================
    // DUMP — Log de todos os campos (debug)
    // ========================================================================

    function dumpAll() {
        if (!_lastScan) {
            console.log('[SkScanner] Nenhum scan. Executando agora...');
            scan();
        }
        console.log('=== SKYCHART DOM SCAN ===');
        console.log('Página:', _lastScan.page);
        console.log('Seção:', _lastScan.section);
        console.log('Escaneado:', _lastScan.scannedAt);
        console.log('Campos:', _lastScan.fieldCount);
        console.table(_lastScan.fields.map(function (f) {
            return {
                label: f.label,
                id: f.id,
                type: f.type,
                strategy: f.strategy,
                selector: f.selector,
                value: f.currentValue
            };
        }));
        return _lastScan;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    return {
        scan: scan,
        getField: getField,
        dumpAll: dumpAll,
        loadScan: loadScan,
        getScan: function () { return _lastScan; },
        isStale: isStale
    };

})();

window.SkScanner = SkScanner;
console.log('Skychart AI: DOMScanner carregado.');

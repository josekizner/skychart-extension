/**
 * SITE SCANNER AGENT — Mapeia estrutura de qualquer site automaticamente
 * 
 * Roda como content script em QUALQUER página que a extensão acesse.
 * Escaneia: inputs, buttons, tables, forms, links, APIs (fetch/XHR), tech stack.
 * Envia mapa estruturado pro background.js → Firebase (atom_site_maps).
 * 
 * Regras:
 * - Scan automático 3s após page load (espera render)
 * - Cache 24h — não re-escaneia se mapa recente existe
 * - API intercept: safe mode em sites Angular (Skychart) — observa, não altera
 * - Scan sob demanda via message: { action: 'scan_page' }
 */
(function() {
    'use strict';

    var TAG = '[Site Scanner]';
    var SCAN_DELAY = 3000; // espera 3s pra garantir render
    var CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

    // Detecta se é site Angular (Skychart) — cuidado com intercept
    var isAngularSite = !!document.querySelector('[ng-version], [_ngcontent], app-root, [ng-app]');
    var currentDomain = window.location.hostname;
    var currentPath = window.location.pathname + window.location.hash;

    console.log(TAG, 'Carregado em:', currentDomain + currentPath, isAngularSite ? '(Angular)' : '');

    // Storage key pro cache
    var cacheKey = 'site_map_' + currentDomain.replace(/\./g, '_');

    // ========================================================================
    // AUTO-SCAN — 3s após load, verifica cache antes
    // ========================================================================
    setTimeout(function() {
        chrome.storage.local.get(cacheKey, function(d) {
            var cached = d[cacheKey];
            if (cached && cached.scannedAt && (Date.now() - cached.scannedAt) < CACHE_TTL) {
                // Cache válido — pula se mesma path
                if (cached.path === currentPath) {
                    console.log(TAG, 'Cache válido, pulando scan (' + cached.fieldCount + ' elementos)');
                    return;
                }
            }
            runFullScan();
        });
    }, SCAN_DELAY);

    // Scan sob demanda
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'scan_page') {
            console.log(TAG, 'Scan sob demanda solicitado');
            var result = runFullScan();
            sendResponse({ success: true, map: result });
        }
    });

    // ========================================================================
    // FULL SCAN — Orquestra todos os módulos
    // ========================================================================
    function runFullScan() {
        console.log(TAG, '=== SCAN INICIADO ===');
        var startTime = Date.now();

        var siteMap = {
            domain: currentDomain,
            path: currentPath,
            url: window.location.href,
            title: document.title || '',
            scannedAt: Date.now(),
            techStack: detectTechStack(),
            inputs: scanInputs(),
            buttons: scanButtons(),
            tables: scanTables(),
            forms: scanForms(),
            links: scanActionLinks(),
            apis: [],
            meta: scanMeta(),
            fieldCount: 0
        };

        siteMap.fieldCount = siteMap.inputs.length + siteMap.buttons.length + siteMap.tables.length;

        // API intercept (safe: observa apenas, não modifica nada)
        siteMap.apis = getInterceptedAPIs();

        var elapsed = Date.now() - startTime;
        console.log(TAG, '=== SCAN COMPLETO ===', elapsed + 'ms');
        console.log(TAG, 'Inputs:', siteMap.inputs.length, '| Buttons:', siteMap.buttons.length,
            '| Tables:', siteMap.tables.length, '| Forms:', siteMap.forms.length,
            '| Links:', siteMap.links.length, '| APIs:', siteMap.apis.length);

        // Salva no storage local (cache)
        var obj = {};
        obj[cacheKey] = siteMap;
        chrome.storage.local.set(obj);

        // Envia pro background → Firebase
        try {
            chrome.runtime.sendMessage({
                action: 'siteMapReady',
                data: siteMap
            });
        } catch(e) { console.log(TAG, 'Erro enviando mapa:', e); }

        // Log table pra fácil debug
        if (siteMap.inputs.length > 0) {
            console.log(TAG, '--- INPUTS ---');
            console.table(siteMap.inputs.map(function(f) {
                return { id: f.id, name: f.name, type: f.type, label: f.label, selector: f.selector, placeholder: f.placeholder };
            }));
        }
        if (siteMap.buttons.length > 0) {
            console.log(TAG, '--- BUTTONS ---');
            console.table(siteMap.buttons.map(function(b) {
                return { id: b.id, text: b.text, type: b.type, selector: b.selector, formId: b.formId };
            }));
        }
        if (siteMap.tables.length > 0) {
            console.log(TAG, '--- TABLES ---');
            console.table(siteMap.tables.map(function(t) {
                return { id: t.id, headers: t.headers.join(' | '), rows: t.rowCount, selector: t.selector };
            }));
        }

        return siteMap;
    }

    // ========================================================================
    // SCAN INPUTS — Todos os inputs, selects, textareas
    // ========================================================================
    function scanInputs() {
        var results = [];
        var els = document.querySelectorAll('input, select, textarea');

        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            // Pula hidden, submit, button
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue;
            // Pula invisíveis (exceto checkboxes que podem ser escondidos)
            if (!el.offsetParent && el.type !== 'checkbox' && el.type !== 'radio') continue;

            results.push({
                id: el.id || '',
                name: el.getAttribute('name') || el.getAttribute('formcontrolname') || '',
                type: el.type || el.tagName.toLowerCase(),
                tagName: el.tagName.toLowerCase(),
                label: findLabel(el),
                placeholder: el.getAttribute('placeholder') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                required: el.required || false,
                classes: trimClasses(el),
                selector: buildSelector(el),
                value: (el.value || '').substring(0, 50),
                autocomplete: el.getAttribute('autocomplete') || '',
                role: el.getAttribute('role') || '',
                dataAttrs: getDataAttrs(el)
            });
        }
        return results;
    }

    // ========================================================================
    // SCAN BUTTONS — Todos os botões clicáveis
    // ========================================================================
    function scanButtons() {
        var results = [];
        var els = document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a.button, [role="button"]');

        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el.offsetParent) continue; // invisível

            var text = (el.textContent || el.value || '').trim().substring(0, 100);
            if (!text && !el.id) continue; // botão sem texto e sem ID = inútil

            results.push({
                id: el.id || '',
                text: text,
                type: el.type || '',
                tagName: el.tagName.toLowerCase(),
                classes: trimClasses(el),
                selector: buildSelector(el),
                formId: el.form ? (el.form.id || 'form-sem-id') : '',
                href: el.tagName === 'A' ? (el.getAttribute('href') || '') : '',
                disabled: el.disabled || false,
                ariaLabel: el.getAttribute('aria-label') || '',
                dataAttrs: getDataAttrs(el)
            });
        }
        return results;
    }

    // ========================================================================
    // SCAN TABLES — Estrutura de tabelas
    // ========================================================================
    function scanTables() {
        var results = [];
        var tables = document.querySelectorAll('table');

        for (var t = 0; t < tables.length; t++) {
            var table = tables[t];
            if (!table.offsetParent) continue; // invisível

            var headers = [];
            var ths = table.querySelectorAll('th');
            for (var h = 0; h < ths.length; h++) {
                var thText = (ths[h].textContent || '').trim();
                if (thText) headers.push(thText);
            }

            if (headers.length === 0) continue; // tabela sem headers = layout table

            var rows = table.querySelectorAll('tbody tr');
            var sampleRow = [];
            if (rows.length > 0) {
                var firstRow = rows[0].querySelectorAll('td');
                for (var c = 0; c < firstRow.length && c < 10; c++) {
                    sampleRow.push((firstRow[c].textContent || '').trim().substring(0, 50));
                }
            }

            results.push({
                id: table.id || '',
                classes: trimClasses(table),
                selector: buildSelector(table),
                headers: headers,
                columnCount: headers.length,
                rowCount: rows.length,
                sampleRow: sampleRow,
                hasPagination: !!table.closest('[class*="paginator"], [class*="pagination"]'),
                parentId: table.parentElement ? (table.parentElement.id || '') : ''
            });
        }
        return results;
    }

    // ========================================================================
    // SCAN FORMS — Formulários
    // ========================================================================
    function scanForms() {
        var results = [];
        var forms = document.querySelectorAll('form');

        for (var f = 0; f < forms.length; f++) {
            var form = forms[f];
            var fields = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
            var fieldNames = [];
            for (var i = 0; i < fields.length && i < 20; i++) {
                fieldNames.push(fields[i].id || fields[i].name || fields[i].type);
            }

            var submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');

            results.push({
                id: form.id || '',
                action: form.getAttribute('action') || '',
                method: (form.method || 'GET').toUpperCase(),
                classes: trimClasses(form),
                selector: buildSelector(form),
                fieldCount: fields.length,
                fieldNames: fieldNames,
                submitButton: submitBtn ? {
                    id: submitBtn.id || '',
                    text: (submitBtn.textContent || submitBtn.value || '').trim(),
                    selector: buildSelector(submitBtn)
                } : null
            });
        }
        return results;
    }

    // ========================================================================
    // SCAN LINKS — Links com ações (não navegação simples)
    // ========================================================================
    function scanActionLinks() {
        var results = [];
        var links = document.querySelectorAll('a[href*="javascript"], a[onclick], a[href="#"], a.action, a[data-action]');

        for (var i = 0; i < links.length && results.length < 30; i++) {
            var el = links[i];
            if (!el.offsetParent) continue;

            results.push({
                text: (el.textContent || '').trim().substring(0, 80),
                href: el.getAttribute('href') || '',
                id: el.id || '',
                selector: buildSelector(el),
                classes: trimClasses(el)
            });
        }
        return results;
    }

    // ========================================================================
    // SCAN META — Metadata da página
    // ========================================================================
    function scanMeta() {
        var metas = document.querySelectorAll('meta[name], meta[property]');
        var result = {};
        for (var i = 0; i < metas.length; i++) {
            var name = metas[i].getAttribute('name') || metas[i].getAttribute('property') || '';
            var content = metas[i].getAttribute('content') || '';
            if (name && content) result[name] = content.substring(0, 200);
        }
        return result;
    }

    // ========================================================================
    // TECH STACK DETECTION
    // ========================================================================
    function detectTechStack() {
        var stack = [];

        // Frameworks
        if (window.angular || document.querySelector('[ng-version]')) stack.push('Angular');
        if (window.React || document.querySelector('[data-reactroot], [data-reactid]')) stack.push('React');
        if (window.Vue || document.querySelector('[data-v-]')) stack.push('Vue');
        if (window.jQuery || window.$) stack.push('jQuery');
        if (window.Backbone) stack.push('Backbone');

        // UI Libraries
        if (document.querySelector('.ui-datatable, .ui-panel, .ui-accordion')) stack.push('PrimeNG');
        if (document.querySelector('.k-input, .k-widget, [data-role]')) stack.push('KendoUI');
        if (document.querySelector('.MuiButton-root, .MuiPaper-root')) stack.push('MaterialUI');
        if (document.querySelector('[class*="chakra-"]')) stack.push('ChakraUI');
        if (document.querySelector('.ant-btn, .ant-table')) stack.push('AntDesign');
        if (document.querySelector('.bootstrap, .btn-primary, .container-fluid')) stack.push('Bootstrap');

        // Platforms
        if (document.querySelector('meta[name="generator"][content*="Next"]') || window.__NEXT_DATA__) stack.push('NextJS');
        if (window.__NUXT__) stack.push('NuxtJS');
        if (document.querySelector('meta[content*="WordPress"]')) stack.push('WordPress');
        if (document.querySelector('meta[content*="ASP.NET"]') || document.querySelector('[id*="ctl00"]')) stack.push('ASP.NET');

        // Server
        var poweredBy = document.querySelector('meta[http-equiv="X-Powered-By"]');
        if (poweredBy) stack.push('Server:' + poweredBy.getAttribute('content'));

        return stack.length > 0 ? stack.join(', ') : 'Vanilla';
    }

    // ========================================================================
    // API INTERCEPT — Captura fetch/XHR (SAFE: só observa, não bloqueia)
    // ========================================================================
    var _interceptedAPIs = [];

    function setupAPIIntercept() {
        if (isAngularSite) {
            console.log(TAG, 'Angular detectado — API intercept desativado (safe mode)');
            return;
        }

        // Intercept fetch
        var originalFetch = window.fetch;
        if (originalFetch) {
            window.fetch = function() {
                var url = '';
                if (arguments[0] instanceof Request) {
                    url = arguments[0].url;
                } else {
                    url = String(arguments[0] || '');
                }

                var method = 'GET';
                if (arguments[1] && arguments[1].method) method = arguments[1].method;

                var result = originalFetch.apply(this, arguments);
                result.then(function(response) {
                    var contentType = response.headers.get('content-type') || '';
                    if (contentType.indexOf('json') >= 0 || contentType.indexOf('text') >= 0) {
                        // Clone pra não consumir o body
                        response.clone().text().then(function(body) {
                            _interceptedAPIs.push({
                                type: 'fetch',
                                url: url,
                                method: method,
                                status: response.status,
                                contentType: contentType,
                                bodyPreview: body.substring(0, 500),
                                isJSON: contentType.indexOf('json') >= 0,
                                timestamp: Date.now()
                            });
                        }).catch(function() {});
                    }
                }).catch(function() {});

                return result;
            };
        }

        // Intercept XMLHttpRequest
        var originalXHROpen = XMLHttpRequest.prototype.open;
        var originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._scanMethod = method;
            this._scanUrl = url;
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function() {
            var xhr = this;
            var onReady = xhr.onreadystatechange;
            xhr.onreadystatechange = function() {
                try {
                    if (xhr.readyState === 4 && xhr.status > 0) {
                        var contentType = xhr.getResponseHeader('content-type') || '';
                        if (contentType.indexOf('json') >= 0) {
                            _interceptedAPIs.push({
                                type: 'xhr',
                                url: xhr._scanUrl,
                                method: xhr._scanMethod,
                                status: xhr.status,
                                contentType: contentType,
                                bodyPreview: (xhr.responseText || '').substring(0, 500),
                                isJSON: true,
                                timestamp: Date.now()
                            });
                        }
                    }
                } catch(e) { /* never propagate to host */ }
                if (onReady) onReady.apply(this, arguments);
            };
            return originalXHRSend.apply(this, arguments);
        };

        console.log(TAG, 'API intercept ativo (fetch + XHR)');
    }

    function getInterceptedAPIs() {
        // Deduplica por URL
        var seen = {};
        return _interceptedAPIs.filter(function(api) {
            var key = api.method + ':' + api.url;
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    // Ativa intercept imediatamente (antes do scan delay)
    setupAPIIntercept();

    // ========================================================================
    // HELPERS
    // ========================================================================

    function findLabel(el) {
        // 1. <label for="id">
        if (el.id) {
            var lbl = document.querySelector('label[for="' + el.id + '"]');
            if (lbl) return clean(lbl.textContent);
        }
        // 2. aria-label
        if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
        // 3. title
        if (el.getAttribute('title')) return clean(el.getAttribute('title'));
        // 4. placeholder (como último recurso de label)
        if (el.getAttribute('placeholder')) return clean(el.getAttribute('placeholder'));
        // 5. TD anterior (Skychart/PrimeNG pattern)
        var td = el.closest('td');
        if (td && td.previousElementSibling) {
            var prevText = td.previousElementSibling.textContent.trim();
            if (prevText.length < 50) return clean(prevText);
        }
        // 6. Sibling label/span
        var prev = el.previousElementSibling;
        if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN') && prev.textContent.trim().length < 50) {
            return clean(prev.textContent);
        }
        // 7. Parent text
        var parent = el.parentElement;
        if (parent && parent.children.length <= 3) {
            var pText = getDirectText(parent);
            if (pText.length > 0 && pText.length < 40) return clean(pText);
        }
        // 8. Extract from ID
        if (el.id) return extractFromId(el.id);
        return '';
    }

    function buildSelector(el) {
        if (el.id) return '#' + el.id;
        var fcn = el.getAttribute('formcontrolname');
        if (fcn) return '[formcontrolname="' + fcn + '"]';
        if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
        // Class-based
        var unique = uniqueClasses(el);
        if (unique.length > 0) return el.tagName.toLowerCase() + '.' + unique.join('.');
        // nth-child fallback
        var parent = el.parentElement;
        if (parent) {
            var idx = Array.from(parent.children).indexOf(el);
            return el.tagName.toLowerCase() + ':nth-child(' + (idx + 1) + ')';
        }
        return el.tagName.toLowerCase();
    }

    function uniqueClasses(el) {
        return Array.from(el.classList || []).filter(function(c) {
            return c.length > 2 && !c.startsWith('ng-') && !c.startsWith('ui-state') &&
                   !c.startsWith('cdk-') && !c.startsWith('mat-');
        }).slice(0, 3);
    }

    function trimClasses(el) {
        return (el.className || '').substring(0, 150);
    }

    function getDataAttrs(el) {
        var attrs = {};
        for (var i = 0; i < el.attributes.length; i++) {
            var attr = el.attributes[i];
            if (attr.name.startsWith('data-') && attr.name !== 'data-reactid') {
                attrs[attr.name] = (attr.value || '').substring(0, 100);
            }
        }
        return Object.keys(attrs).length > 0 ? attrs : undefined;
    }

    function getDirectText(element) {
        var text = '';
        for (var i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 3) text += element.childNodes[i].textContent;
        }
        return text.trim();
    }

    function clean(text) {
        return (text || '').replace(/\s+/g, ' ').replace(/[:\*]/g, '').trim().substring(0, 80);
    }

    function extractFromId(id) {
        var parts = id.split(/[-_.]/);
        var last = parts[parts.length - 1] || '';
        last = last.replace(/^(ds|dt|cd|nr|fl|in|tx|btn|lbl|txt|chk|ddl|rdo)/, '');
        if (!last || last.length < 2) return '';
        return last.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }

})();

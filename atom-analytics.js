// ============================================================
// ATOM Analytics — Inteligência compartilhada via Firebase
// Módulo leve que NÃO interfere em nenhuma lógica existente.
// Todas as chamadas são fire-and-forget, envolvidas em try/catch.
// ============================================================

(function() {
    'use strict';

    var ATOM_ANALYTICS_VERSION = '1.1';
    var _cachedUser = null;

    // Detecta o nome do usuário — com cache
    function getUser() {
        if (_cachedUser) return _cachedUser;
        try {
            // 1. Outlook: aria-label do botão de perfil (vários seletores)
            var selectors = [
                'button#O365_MainLink_Me',
                'button[data-tid="me-control"]',
                'div[data-testid="owaPeoplePicker"] button',
                '#meInitialsButton',
                '#mectrl_main_trigger',
                'button[aria-label*="Conta"], button[aria-label*="Account"]'
            ];
            for (var i = 0; i < selectors.length; i++) {
                var el = document.querySelector(selectors[i]);
                if (el) {
                    var label = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim();
                    if (label && label.length > 1 && label !== 'null') {
                        _cachedUser = label.substring(0, 30);
                        return _cachedUser;
                    }
                }
            }

            // 2. Outlook: email do remetente no header
            var accountEl = document.querySelector('[data-testid="currentAccountName"], .accountName, ._3Vaw4eUC');
            if (accountEl) {
                _cachedUser = accountEl.textContent.trim().substring(0, 30);
                return _cachedUser;
            }

            // 3. Skychart: nome do usuário
            var skyUser = document.querySelector('.user-name, .nome-usuario, .user-info span, [class*="userName"]');
            if (skyUser && skyUser.textContent.trim()) {
                _cachedUser = skyUser.textContent.trim().substring(0, 30);
                return _cachedUser;
            }

            // 4. Fallback: tenta o title da página do Outlook "Email – José Kizner"
            var title = document.title || '';
            var match = title.match(/[–—-]\s*(.+)/);
            if (match && match[1] && match[1].length > 2) {
                _cachedUser = match[1].trim().substring(0, 30);
                return _cachedUser;
            }

        } catch(e) {}
        return 'unknown';
    }

    // Tenta carregar user do storage ao iniciar
    try {
        chrome.storage.local.get(['atomUserName'], function(d) {
            if (chrome.runtime.lastError) return;
            if (d.atomUserName) _cachedUser = d.atomUserName;
        });
    } catch(e) {}

    // Envia evento pro background.js que salva no Firebase
    function logEvent(agent, action, data) {
        try {
            var user = getUser();
            // Salva o user no storage pra próxima vez
            if (user !== 'unknown' && user !== _cachedUser) {
                _cachedUser = user;
                try { chrome.storage.local.set({ atomUserName: user }); } catch(e) {}
            }

            var payload = {
                action: 'logAtomEvent',
                event: {
                    agent: agent,
                    action: action,
                    data: data || {},
                    user: user,
                    timestamp: Date.now(),
                    url: location.hostname
                }
            };
            chrome.runtime.sendMessage(payload, function() {
                if (chrome.runtime.lastError) {} // silencioso
            });
        } catch(e) {} // nunca falha
    }

    // Envia métrica numérica
    function logMetric(agent, metric, value) {
        logEvent(agent, 'metric', { metric: metric, value: value });
    }

    // SetUser manual — pode ser chamado por qualquer agente
    function setUser(name) {
        if (name && name.length > 1) {
            _cachedUser = name.substring(0, 30);
            try { chrome.storage.local.set({ atomUserName: _cachedUser }); } catch(e) {}
        }
    }

    // Expõe globalmente
    window.AtomAnalytics = {
        version: ATOM_ANALYTICS_VERSION,
        log: logEvent,
        metric: logMetric,
        getUser: getUser,
        setUser: setUser
    };

})();

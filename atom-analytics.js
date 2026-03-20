// ============================================================
// ATOM Analytics — Inteligência compartilhada via Firebase
// Módulo leve que NÃO interfere em nenhuma lógica existente.
// Todas as chamadas são fire-and-forget, envolvidas em try/catch.
// ============================================================

(function() {
    'use strict';

    var ATOM_ANALYTICS_VERSION = '1.1';
    var _cachedUser = null;

    // Detecta o nome do usuário — prioriza nome configurado no popup
    function getUser() {
        if (_cachedUser) return _cachedUser;
        // Fallback: tenta detectar do Outlook/Skychart (melhor que "unknown")
        try {
            // 1. Outlook: aria-label do botão de perfil
            var selectors = [
                'button#O365_MainLink_Me',
                'button[data-tid="me-control"]',
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

            // 2. Skychart: nome do usuário
            var skySelectors = [
                '.user-name', '.nome-usuario', '.user-info span',
                '#ctl00_ContentPlaceHolder1_lblUsuario',
                'app-header .user-name', 'app-toolbar .username'
            ];
            for (var s = 0; s < skySelectors.length; s++) {
                var skyUser = document.querySelector(skySelectors[s]);
                if (skyUser && skyUser.textContent.trim()) {
                    _cachedUser = skyUser.textContent.trim().substring(0, 30);
                    return _cachedUser;
                }
            }

            // 3. Fallback: título do Outlook "Email – José Kizner"
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
        chrome.storage.local.get(['atomUserName', 'pricingEmail', 'userProfile'], function(d) {
            if (chrome.runtime.lastError) return;
            if (d.atomUserName) {
                _cachedUser = d.atomUserName;
            } else if (d.pricingEmail) {
                // Extract name from email: jose.kizner@mond... -> José Kizner
                var emailName = d.pricingEmail.split('@')[0].replace(/[._]/g, ' ');
                emailName = emailName.replace(/\b\w/g, function(l) { return l.toUpperCase(); });
                _cachedUser = emailName.substring(0, 30);
                try { chrome.storage.local.set({ atomUserName: _cachedUser }); } catch(e) {}
            }
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

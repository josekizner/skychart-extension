// ============================================================
// ATOM Analytics — Inteligência compartilhada via Firebase
// Módulo leve que NÃO interfere em nenhuma lógica existente.
// Todas as chamadas são fire-and-forget, envolvidas em try/catch.
// ============================================================

(function() {
    'use strict';

    var ATOM_ANALYTICS_VERSION = '1.0';

    // Detecta o nome do usuário pelo Outlook ou Skychart
    function getUser() {
        try {
            // Outlook: pega do header
            var outlookUser = document.querySelector('button[data-testid="profileButton"]');
            if (outlookUser) return outlookUser.getAttribute('aria-label') || 'unknown';
            // Skychart: pega do menu
            var skyUser = document.querySelector('.user-name, .nome-usuario, [class*="user"]');
            if (skyUser) return skyUser.textContent.trim().substring(0, 30);
        } catch(e) {}
        return 'unknown';
    }

    // Envia evento pro background.js que salva no Firebase
    function logEvent(agent, action, data) {
        try {
            var payload = {
                action: 'logAtomEvent',
                event: {
                    agent: agent,
                    action: action,
                    data: data || {},
                    user: getUser(),
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

    // Expõe globalmente
    window.AtomAnalytics = {
        version: ATOM_ANALYTICS_VERSION,
        log: logEvent,
        metric: logMetric,
        getUser: getUser
    };

})();

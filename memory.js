/**
 * SKYCHART MEMORY BRAIN — Memória persistente do agente
 * 
 * Salva no chrome.storage.local tudo que funciona e falha.
 * Na próxima execução, usa os seletores e estratégias que já deram certo.
 * Se o Gemini resolveu algo, guarda a solução pro futuro.
 */

var SkMemory = (function () {
    'use strict';

    var STORAGE_KEY = 'sk_memory_v1';
    var _cache = {}; // cache em memória pra não ficar lendo storage toda hora

    // ========================================================================
    // INIT — Carrega memória do chrome.storage
    // ========================================================================

    async function init() {
        return new Promise(function (resolve) {
            try {
                chrome.storage.local.get(STORAGE_KEY, function (data) {
                    _cache = (data && data[STORAGE_KEY]) || {};
                    // Limpa seletores corrompidos (genéricos que acham elemento errado)
                    var badSelectors = ['label', 'input', 'div', 'span', 'td', 'tr', 'button'];
                    Object.keys(_cache).forEach(function (key) {
                        var mem = _cache[key];
                        mem.seletoresQueFunc = (mem.seletoresQueFunc || []).filter(function (s) {
                            return badSelectors.indexOf(s) < 0 && s.length > 3;
                        });
                    });
                    save();
                    console.log('Skychart AI: Memória carregada —', Object.keys(_cache).length, 'campos conhecidos');
                    resolve();
                });
            } catch (e) {
                console.warn('Skychart AI: Erro ao carregar memória:', e);
                _cache = {};
                resolve();
            }
        });
    }

    // ========================================================================
    // SAVE — Persiste memória no chrome.storage
    // ========================================================================

    function save() {
        try {
            var obj = {};
            obj[STORAGE_KEY] = _cache;
            chrome.storage.local.set(obj);
        } catch (e) {
            console.warn('Skychart AI: Erro ao salvar memória:', e);
        }
    }

    // ========================================================================
    // REMEMBER — Registra resultado de uma interação
    // ========================================================================

    function remember(fieldId, result) {
        if (!fieldId) return;
        var key = 'campo:' + fieldId;

        if (!_cache[key]) {
            _cache[key] = {
                seletoresQueFunc: [],
                seletoresQueFalh: [],
                estrategiasQueFunc: [],
                estrategiasQueFalh: [],
                geminiSolucoes: [],
                tempoEsperaIdeal: null,
                ultimoSucesso: null,
                ultimaFalha: null,
                totalSucessos: 0,
                totalFalhas: 0,
                historico: []
            };
        }

        var mem = _cache[key];
        var now = new Date().toISOString();
        var entry = {
            time: now,
            ok: result.ok,
            selector: result.selector || null,
            strategy: result.strategy || null,
            value: (result.finalValue || '').substring(0, 30),
            reason: result.reason || null,
            autoHealed: result.autoHealed || false
        };

        // Histórico (máximo 20 entradas)
        mem.historico.push(entry);
        if (mem.historico.length > 20) mem.historico.shift();

        if (result.ok) {
            mem.totalSucessos++;
            mem.ultimoSucesso = now;
            // Registra seletor que funcionou
            if (result.selector && mem.seletoresQueFunc.indexOf(result.selector) < 0) {
                mem.seletoresQueFunc.push(result.selector);
            }
            // Registra estratégia que funcionou
            if (result.strategy && mem.estrategiasQueFunc.indexOf(result.strategy) < 0) {
                mem.estrategiasQueFunc.push(result.strategy);
            }
            // Remove de falhas se agora funciona
            if (result.selector) {
                mem.seletoresQueFalh = mem.seletoresQueFalh.filter(function (s) { return s !== result.selector; });
            }
        } else {
            mem.totalFalhas++;
            mem.ultimaFalha = now;
            if (result.selector && mem.seletoresQueFalh.indexOf(result.selector) < 0) {
                mem.seletoresQueFalh.push(result.selector);
            }
            if (result.strategy && mem.estrategiasQueFalh.indexOf(result.strategy) < 0) {
                mem.estrategiasQueFalh.push(result.strategy);
            }
        }

        // Salva Gemini solution
        if (result.autoHealed && result.geminiSelector) {
            mem.geminiSolucoes.push({
                time: now,
                problema: result.reason || 'desconhecido',
                selector: result.geminiSelector,
                ok: result.ok
            });
            // Máximo 10 soluções
            if (mem.geminiSolucoes.length > 10) mem.geminiSolucoes.shift();
        }

        save();
    }

    // ========================================================================
    // RECALL — Busca informações da memória
    // ========================================================================

    function bestSelector(fieldId) {
        var mem = _cache['campo:' + fieldId];
        if (!mem || !mem.seletoresQueFunc.length) return null;
        // Retorna o último seletor que funcionou (mais recente = mais confiável)
        return mem.seletoresQueFunc[mem.seletoresQueFunc.length - 1];
    }

    function bestStrategy(fieldId) {
        var mem = _cache['campo:' + fieldId];
        if (!mem || !mem.estrategiasQueFunc.length) return null;
        return mem.estrategiasQueFunc[mem.estrategiasQueFunc.length - 1];
    }

    function geminiSolution(fieldId, problema) {
        var mem = _cache['campo:' + fieldId];
        if (!mem || !mem.geminiSolucoes.length) return null;
        var probLower = (problema || '').toLowerCase();
        // Procura solução com problema similar
        for (var i = mem.geminiSolucoes.length - 1; i >= 0; i--) {
            var sol = mem.geminiSolucoes[i];
            if (sol.ok && sol.selector) {
                if (!probLower || (sol.problema || '').toLowerCase().indexOf(probLower) >= 0) {
                    return sol.selector;
                }
            }
        }
        // Retorna qualquer seletor que o Gemini deu e funcionou
        for (var j = mem.geminiSolucoes.length - 1; j >= 0; j--) {
            if (mem.geminiSolucoes[j].ok && mem.geminiSolucoes[j].selector) {
                return mem.geminiSolucoes[j].selector;
            }
        }
        return null;
    }

    function isKnownBadSelector(fieldId, selector) {
        var mem = _cache['campo:' + fieldId];
        if (!mem) return false;
        return mem.seletoresQueFalh.indexOf(selector) >= 0;
    }

    function getFieldMemory(fieldId) {
        return _cache['campo:' + fieldId] || null;
    }

    // ========================================================================
    // STATS — Estatísticas gerais
    // ========================================================================

    function stats() {
        var keys = Object.keys(_cache);
        var totalFields = keys.length;
        var totalSucc = 0, totalFail = 0;
        var problematic = [];

        keys.forEach(function (key) {
            var mem = _cache[key];
            totalSucc += mem.totalSucessos;
            totalFail += mem.totalFalhas;
            if (mem.totalFalhas > mem.totalSucessos && mem.totalFalhas > 0) {
                problematic.push(key.replace('campo:', '') + ' (' + mem.totalFalhas + ' falhas)');
            }
        });

        return {
            camposConhecidos: totalFields,
            totalSucessos: totalSucc,
            totalFalhas: totalFail,
            taxaAcerto: totalSucc + totalFail > 0 ? Math.round(totalSucc / (totalSucc + totalFail) * 100) : 0,
            camposProblematicos: problematic
        };
    }

    function getAll() { return _cache; }

    function clear() {
        _cache = {};
        save();
        console.log('Skychart AI: Memória limpa.');
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    return {
        init: init,
        remember: remember,
        bestSelector: bestSelector,
        bestStrategy: bestStrategy,
        geminiSolution: geminiSolution,
        isKnownBadSelector: isKnownBadSelector,
        getFieldMemory: getFieldMemory,
        stats: stats,
        getAll: getAll,
        clear: clear
    };
})();

window.SkMemory = SkMemory;
console.log('Skychart AI: MemoryBrain carregado.');

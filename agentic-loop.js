/**
 * AGENTIC LOOP — Módulo de Inteligência Autônoma
 * 
 * Combina VisionAgent + SkMemory + Gemini pra criar um agente
 * que planeja, executa, verifica e APRENDE.
 * 
 * Fluxo: Objetivo → Plano → Loop(see→decide→act→verify) → Memória
 * 
 * API:
 *   AgenticLoop.run(objective, context)  → executa objetivo completo
 *   AgenticLoop.plan(objective)          → gera plano de steps
 *   AgenticLoop.learn(flowName, steps)   → salva fluxo aprendido
 *   AgenticLoop.recall(flowName)         → recupera fluxo aprendido
 */

var AgenticLoop = (function() {
    'use strict';

    var TAG = '[Agentic]';
    var MEMORY_KEY = 'atom_agentic_memory_v1';
    var _memory = {};
    var _running = false;
    var _currentObjective = null;
    var _log = [];

    // ====================================================
    // MEMORY — Persistência de fluxos e aprendizado
    // ====================================================

    function loadMemory() {
        return new Promise(function(resolve) {
            chrome.storage.local.get(MEMORY_KEY, function(data) {
                _memory = (data && data[MEMORY_KEY]) || {
                    flows: {},       // fluxos aprendidos: "criar_oferta" → [steps]
                    elements: {},    // elementos visuais: "botao_nova_oferta" → {selector, x, y, last_seen}
                    errors: {},      // padrões de erro: "popup_X" → {solution, success_rate}
                    stats: {         // estatísticas gerais
                        total_runs: 0,
                        total_successes: 0,
                        total_failures: 0,
                        avg_steps: 0,
                        vision_fallbacks: 0
                    }
                };
                console.log(TAG, 'Memória carregada —', Object.keys(_memory.flows).length, 'fluxos conhecidos');
                resolve();
            });
        });
    }

    function saveMemory() {
        var obj = {};
        obj[MEMORY_KEY] = _memory;
        chrome.storage.local.set(obj);
    }

    // Salva um fluxo aprendido
    function learn(flowName, steps, success) {
        var key = flowName.toLowerCase().replace(/\s+/g, '_');
        
        if (!_memory.flows[key]) {
            _memory.flows[key] = {
                name: flowName,
                steps: [],
                runs: 0,
                successes: 0,
                lastRun: null,
                created: new Date().toISOString()
            };
        }

        var flow = _memory.flows[key];
        flow.steps = steps; // atualiza com os steps mais recentes
        flow.runs++;
        if (success) flow.successes++;
        flow.lastRun = new Date().toISOString();

        saveMemory();
        console.log(TAG, 'Fluxo', key, 'salvo —', flow.runs, 'runs,', flow.successes, 'sucessos');
    }

    // Recupera fluxo aprendido
    function recall(flowName) {
        var key = flowName.toLowerCase().replace(/\s+/g, '_');
        return _memory.flows[key] || null;
    }

    // Registra um elemento visual encontrado
    function rememberElement(name, data) {
        _memory.elements[name] = {
            selector: data.selector || null,
            x: data.x || null,
            y: data.y || null,
            text: data.text || null,
            lastSeen: new Date().toISOString(),
            hitCount: (_memory.elements[name] ? _memory.elements[name].hitCount : 0) + 1
        };
        saveMemory();
    }

    // Registra padrão de erro e solução
    function rememberError(errorPattern, solution, worked) {
        if (!_memory.errors[errorPattern]) {
            _memory.errors[errorPattern] = {
                solutions: [],
                occurrences: 0
            };
        }

        var err = _memory.errors[errorPattern];
        err.occurrences++;

        // Adiciona ou atualiza solução
        var existing = null;
        for (var i = 0; i < err.solutions.length; i++) {
            if (err.solutions[i].action === solution) {
                existing = err.solutions[i];
                break;
            }
        }

        if (existing) {
            existing.attempts++;
            if (worked) existing.successes++;
        } else {
            err.solutions.push({
                action: solution,
                attempts: 1,
                successes: worked ? 1 : 0
            });
        }

        saveMemory();
    }

    // ====================================================
    // PLAN — Gera plano de execução via Gemini
    // ====================================================

    function plan(objective, context) {
        return new Promise(function(resolve, reject) {
            console.log(TAG, '📋 Planejando:', objective);

            // Verifica se já conhece esse fluxo
            var known = recall(objective);
            if (known && known.successes > 0) {
                console.log(TAG, 'Fluxo conhecido! Reutilizando plano anterior.');
                resolve({
                    source: 'memory',
                    steps: known.steps,
                    confidence: known.successes / known.runs
                });
                return;
            }

            // Gera plano via Gemini
            var planPrompt = buildPlanPrompt(objective, context);

            chrome.runtime.sendMessage({
                action: 'agenticPlan',
                prompt: planPrompt
            }, function(response) {
                if (response && response.success && response.data) {
                    console.log(TAG, 'Plano gerado:', response.data.steps.length, 'steps');
                    resolve({
                        source: 'gemini',
                        steps: response.data.steps,
                        confidence: 0.7 // plano novo, confiança média
                    });
                } else {
                    reject(new Error('Falha ao gerar plano'));
                }
            });
        });
    }

    function buildPlanPrompt(objective, context) {
        var knownFlows = Object.keys(_memory.flows).join(', ') || 'nenhum';
        var knownElements = Object.keys(_memory.elements).map(function(k) {
            var el = _memory.elements[k];
            return k + ' (selector: ' + el.selector + ')';
        }).join(', ') || 'nenhum';

        return 'Voce e um planejador de automacao web. Gere um plano de passos para atingir o objetivo.\n\n' +
            'OBJETIVO: ' + objective + '\n\n' +
            'CONTEXTO: ' + (context || 'nenhum') + '\n\n' +
            'FLUXOS CONHECIDOS: ' + knownFlows + '\n' +
            'ELEMENTOS CONHECIDOS: ' + knownElements + '\n\n' +
            'Retorne APENAS JSON puro:\n' +
            '{\n' +
            '  "steps": [\n' +
            '    {\n' +
            '      "instruction": "descricao do que fazer neste passo",\n' +
            '      "selector": "seletor CSS se conhecido (ou null)",\n' +
            '      "action": "click" ou "type" ou "wait" ou "verify" ou "navigate",\n' +
            '      "value": "valor a digitar (se type)",\n' +
            '      "verify": "como verificar se deu certo (ou null)",\n' +
            '      "fallback": "o que fazer se falhar"\n' +
            '    }\n' +
            '  ],\n' +
            '  "estimated_time": "tempo estimado em segundos",\n' +
            '  "risks": ["possiveis problemas"]\n' +
            '}\n\n' +
            'REGRAS:\n' +
            '- Cada step deve ser ATOMICO (uma unica acao)\n' +
            '- Se conhece o seletor CSS, use-o (rapido)\n' +
            '- Se nao conhece, descreva o elemento visualmente (fallback vision)\n' +
            '- Inclua steps de verificacao apos acoes criticas\n' +
            '- Retorne APENAS o JSON';
    }

    // ====================================================
    // RUN — Loop principal: see → decide → act → verify
    // ====================================================

    function run(objective, context) {
        return new Promise(function(resolve, reject) {
            if (_running) {
                reject(new Error('Já tem um loop rodando'));
                return;
            }

            _running = true;
            _currentObjective = objective;
            _log = [];

            console.log(TAG, '▶ Iniciando:', objective);
            log('start', 'Objetivo: ' + objective);

            // 1. Gera plano
            plan(objective, context)
            .then(function(planResult) {
                log('plan', 'Plano gerado (' + planResult.source + ') — ' + planResult.steps.length + ' steps');
                
                // 2. Executa steps
                return executeSteps(planResult.steps, 0, []);
            })
            .then(function(results) {
                _running = false;
                _currentObjective = null;

                var successes = results.filter(function(r) { return r.success; }).length;
                var total = results.length;
                var allOk = successes === total;

                // 3. Aprende
                learn(objective, results.map(function(r) { return r.step; }), allOk);
                _memory.stats.total_runs++;
                if (allOk) _memory.stats.total_successes++;
                else _memory.stats.total_failures++;
                saveMemory();

                log('done', allOk ? 'SUCESSO' : 'PARCIAL (' + successes + '/' + total + ')');
                console.log(TAG, '✓ Completo:', successes + '/' + total, 'steps OK');

                resolve({
                    success: allOk,
                    results: results,
                    log: _log,
                    stats: { successes: successes, total: total }
                });
            })
            .catch(function(err) {
                _running = false;
                _currentObjective = null;
                log('error', err.message);
                console.error(TAG, 'Erro fatal:', err);
                reject(err);
            });
        });
    }

    // Executa steps sequencialmente
    function executeSteps(steps, index, results) {
        return new Promise(function(resolve) {
            if (index >= steps.length) {
                resolve(results);
                return;
            }

            if (!_running) {
                log('abort', 'Loop abortado');
                resolve(results);
                return;
            }

            var step = steps[index];
            var stepNum = (index + 1) + '/' + steps.length;
            console.log(TAG, 'Step', stepNum + ':', step.instruction);
            log('step', stepNum + ' — ' + step.instruction);

            executeOneStep(step)
            .then(function(result) {
                results.push({ step: step, success: true, detail: result });

                // Pausa entre steps
                setTimeout(function() {
                    executeSteps(steps, index + 1, results).then(resolve);
                }, 500);
            })
            .catch(function(err) {
                console.warn(TAG, 'Step', stepNum, 'falhou:', err.message);
                log('fail', stepNum + ' falhou: ' + err.message);

                // Tenta fallback
                if (step.fallback) {
                    log('fallback', 'Tentando: ' + step.fallback);
                    handleFallback(step)
                    .then(function(fbResult) {
                        results.push({ step: step, success: true, detail: fbResult, usedFallback: true });
                        setTimeout(function() {
                            executeSteps(steps, index + 1, results).then(resolve);
                        }, 500);
                    })
                    .catch(function() {
                        results.push({ step: step, success: false, error: err.message });
                        setTimeout(function() {
                            executeSteps(steps, index + 1, results).then(resolve);
                        }, 500);
                    });
                } else {
                    results.push({ step: step, success: false, error: err.message });
                    setTimeout(function() {
                        executeSteps(steps, index + 1, results).then(resolve);
                    }, 500);
                }
            });
        });
    }

    // Executa UM step
    function executeOneStep(step) {
        return new Promise(function(resolve, reject) {
            // ===== CAMADA 1: Seletor direto =====
            if (step.selector) {
                var el = document.querySelector(step.selector);
                if (el) {
                    console.log(TAG, '  Camada 1: seletor OK');
                    return performAction(el, step).then(resolve).catch(reject);
                }
                console.log(TAG, '  Camada 1: seletor falhou, tentando visão...');
                _memory.stats.vision_fallbacks++;
            }

            // ===== CAMADA 2: Vision Agent =====
            if (typeof VisionAgent !== 'undefined') {
                VisionAgent.see(step.instruction)
                .then(function(analysis) {
                    if (analysis.found && analysis.action) {
                        console.log(TAG, '  Camada 2: Vision encontrou em', analysis.action.x, analysis.action.y);

                        // Registra na memória
                        if (step.instruction) {
                            rememberElement(step.instruction.substring(0, 40), {
                                x: analysis.action.x,
                                y: analysis.action.y,
                                text: analysis.description
                            });
                        }

                        return VisionAgent.act(analysis.action).then(function(actResult) {
                            // Verifica se deu certo
                            if (step.verify) {
                                return VisionAgent.verify(step.verify).then(function(vResult) {
                                    if (vResult.success) {
                                        resolve(actResult);
                                    } else {
                                        reject(new Error('Verificação falhou: ' + (vResult.description || '')));
                                    }
                                });
                            }
                            resolve(actResult);
                        });
                    } else {
                        reject(new Error('Vision não encontrou o elemento'));
                    }
                })
                .catch(reject);
            } else {
                reject(new Error('Elemento não encontrado e Vision não disponível'));
            }
        });
    }

    // Executa ação no elemento DOM
    function performAction(el, step) {
        return new Promise(function(resolve, reject) {
            try {
                if (step.action === 'click') {
                    el.click();
                    resolve({ action: 'click', element: el.tagName });

                } else if (step.action === 'type' && step.value) {
                    if (typeof VisionAgent !== 'undefined') {
                        VisionAgent.typeText(el, step.value).then(resolve).catch(reject);
                    } else {
                        el.value = step.value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        resolve({ action: 'type', value: step.value });
                    }

                } else if (step.action === 'navigate') {
                    window.location.hash = step.value || '';
                    setTimeout(function() { resolve({ action: 'navigate' }); }, 1000);

                } else if (step.action === 'wait') {
                    var ms = parseInt(step.value) || 1000;
                    setTimeout(function() { resolve({ action: 'wait', ms: ms }); }, ms);

                } else if (step.action === 'verify') {
                    if (typeof VisionAgent !== 'undefined') {
                        VisionAgent.verify(step.verify || step.instruction).then(resolve).catch(reject);
                    } else {
                        resolve({ action: 'verify', skipped: true });
                    }

                } else {
                    el.click(); // default: click
                    resolve({ action: 'click' });
                }
            } catch(e) {
                reject(e);
            }
        });
    }

    // Trata fallback quando step falha
    function handleFallback(step) {
        return new Promise(function(resolve, reject) {
            // Verifica se já conhece esse erro
            var errorKey = (step.instruction || '').substring(0, 30);
            var knownError = _memory.errors[errorKey];

            if (knownError && knownError.solutions.length > 0) {
                // Usa a solução com maior taxa de sucesso
                var best = knownError.solutions.sort(function(a, b) {
                    return (b.successes / b.attempts) - (a.successes / a.attempts);
                })[0];

                console.log(TAG, '  Erro conhecido! Usando solução:', best.action);
                log('memory', 'Erro conhecido, solução: ' + best.action);
            }

            // Fallback visual: pede pro Gemini resolver
            if (typeof VisionAgent !== 'undefined') {
                VisionAgent.see(
                    'O passo "' + step.instruction + '" falhou. ' +
                    (step.fallback || 'Tente encontrar outra forma de fazer.') +
                    '\nO que voce sugere?'
                )
                .then(function(analysis) {
                    if (analysis.action) {
                        return VisionAgent.act(analysis.action).then(function(result) {
                            // Aprende com o sucesso
                            rememberError(errorKey, JSON.stringify(analysis.action), true);
                            resolve(result);
                        });
                    }
                    reject(new Error('Sem solução visual'));
                })
                .catch(reject);
            } else {
                reject(new Error('Sem fallback disponível'));
            }
        });
    }

    // ====================================================
    // STOP — Para o loop
    // ====================================================

    function stop() {
        _running = false;
        console.log(TAG, '⏹ Loop parado');
        log('stop', 'Loop parado manualmente');
    }

    // ====================================================
    // LOG — Registro de execução
    // ====================================================

    function log(type, message) {
        _log.push({
            time: new Date().toISOString(),
            type: type,
            message: message,
            objective: _currentObjective
        });
    }

    function getLog() {
        return _log.slice();
    }

    function getStats() {
        return Object.assign({}, _memory.stats, {
            knownFlows: Object.keys(_memory.flows).length,
            knownElements: Object.keys(_memory.elements).length,
            knownErrors: Object.keys(_memory.errors).length,
            running: _running,
            currentObjective: _currentObjective
        });
    }

    // ====================================================
    // INIT
    // ====================================================

    loadMemory();

    // ====================================================
    // API PÚBLICA
    // ====================================================

    return {
        run: run,
        plan: plan,
        stop: stop,
        learn: learn,
        recall: recall,
        rememberElement: rememberElement,
        rememberError: rememberError,
        getLog: getLog,
        getStats: getStats,
        isRunning: function() { return _running; }
    };

})();

console.log('[Agentic] Loop carregado — run/plan/learn/recall/stop disponíveis');

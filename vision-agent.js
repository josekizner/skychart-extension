/**
 * VISION AGENT — Módulo de Inteligência Visual
 * 
 * Usa screenshots + Gemini 2.0 Flash multimodal como fallback
 * quando seletores CSS falham ou surgem imprevistos.
 * 
 * Princípio: REGRA PRIMEIRO, VISÃO COMO FALLBACK
 * 
 * API:
 *   VisionAgent.see(instruction)     → analisa screenshot com Gemini
 *   VisionAgent.act(action)          → executa ação (click, type)
 *   VisionAgent.verify(expectation)  → verifica se ação deu certo
 *   VisionAgent.execute(steps)       → executa sequência completa
 *   VisionAgent.withFallback(fn, visionInstruction) → wrapper
 */

var VisionAgent = (function() {
    'use strict';

    var TAG = '[Vision]';
    var MAX_RETRIES = 3;

    // ====================================================
    // SEE — Tira screenshot e analisa com Gemini
    // ====================================================

    function see(instruction) {
        return new Promise(function(resolve, reject) {
            console.log(TAG, 'Capturando screenshot...');

            chrome.runtime.sendMessage({
                action: 'visionScreenshot'
            }, function(screenshotResponse) {
                if (!screenshotResponse || !screenshotResponse.success) {
                    console.error(TAG, 'Falha no screenshot');
                    reject(new Error('Screenshot falhou'));
                    return;
                }

                console.log(TAG, 'Screenshot ok, enviando pro Gemini...');
                console.log(TAG, 'Instrução:', instruction);

                chrome.runtime.sendMessage({
                    action: 'visionAnalyze',
                    screenshot: screenshotResponse.image,
                    instruction: instruction,
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                }, function(analysisResponse) {
                    if (!analysisResponse || !analysisResponse.success) {
                        console.error(TAG, 'Falha na análise');
                        reject(new Error(analysisResponse ? analysisResponse.error : 'Análise falhou'));
                        return;
                    }

                    console.log(TAG, 'Análise completa:', analysisResponse.data);
                    resolve(analysisResponse.data);
                });
            });
        });
    }

    // ====================================================
    // ACT — Executa ação (click em coordenada, digitar, etc)
    // ====================================================

    function act(action) {
        return new Promise(function(resolve, reject) {
            if (!action || !action.type) {
                reject(new Error('Ação inválida'));
                return;
            }

            console.log(TAG, 'Executando:', action.type, action);

            if (action.type === 'click') {
                // Click via debugger (trusted event)
                chrome.runtime.sendMessage({
                    action: 'visionClick',
                    x: action.x,
                    y: action.y
                }, function(response) {
                    if (response && response.success) {
                        console.log(TAG, 'Click OK em', action.x, action.y);
                        resolve({ success: true });
                    } else {
                        reject(new Error('Click falhou'));
                    }
                });

            } else if (action.type === 'type') {
                // Digita texto no elemento focado
                var activeEl = document.activeElement;
                if (activeEl && action.text) {
                    typeText(activeEl, action.text).then(resolve).catch(reject);
                } else {
                    // Se precisa clicar antes de digitar
                    if (action.x && action.y) {
                        chrome.runtime.sendMessage({
                            action: 'visionClick',
                            x: action.x,
                            y: action.y
                        }, function() {
                            setTimeout(function() {
                                var el = document.activeElement;
                                if (el && action.text) {
                                    typeText(el, action.text).then(resolve).catch(reject);
                                } else {
                                    reject(new Error('Elemento não focou após click'));
                                }
                            }, 300);
                        });
                    } else {
                        reject(new Error('Sem elemento pra digitar'));
                    }
                }

            } else if (action.type === 'scroll') {
                window.scrollBy(action.x || 0, action.y || 200);
                setTimeout(function() { resolve({ success: true }); }, 300);

            } else if (action.type === 'wait') {
                setTimeout(function() { resolve({ success: true }); }, action.ms || 1000);

            } else {
                reject(new Error('Tipo de ação desconhecido: ' + action.type));
            }
        });
    }

    // Digita texto char por char (compatível com Angular/PrimeNG)
    function typeText(input, text) {
        return new Promise(function(resolve) {
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            var idx = 0;
            var timer = setInterval(function() {
                if (idx < text.length) {
                    input.value += text[idx];
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[idx] }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[idx] }));
                    idx++;
                } else {
                    clearInterval(timer);
                    resolve({ success: true, value: input.value });
                }
            }, 60);
        });
    }

    // ====================================================
    // VERIFY — Tira screenshot e verifica resultado
    // ====================================================

    function verify(expectation) {
        return new Promise(function(resolve, reject) {
            console.log(TAG, 'Verificando:', expectation);

            // Pequeno delay pra UI atualizar
            setTimeout(function() {
                see('VERIFICAÇÃO: ' + expectation + '\n\nResponda APENAS com JSON: {"success": true/false, "description": "o que voce ve na tela", "suggestion": "o que fazer se falhou"}')
                .then(function(result) {
                    if (result.success) {
                        console.log(TAG, '✓ Verificação OK:', result.description);
                    } else {
                        console.warn(TAG, '✗ Verificação falhou:', result.description);
                    }
                    resolve(result);
                })
                .catch(reject);
            }, 500);
        });
    }

    // ====================================================
    // EXECUTE — Executa sequência de steps com verificação
    // ====================================================

    function execute(steps) {
        return new Promise(function(resolve, reject) {
            console.log(TAG, '▶ Iniciando sequência com', steps.length, 'steps');

            var stepIndex = 0;
            var results = [];

            function nextStep() {
                if (stepIndex >= steps.length) {
                    console.log(TAG, '✓ Sequência completa!');
                    resolve({ success: true, results: results });
                    return;
                }

                var step = steps[stepIndex];
                console.log(TAG, 'Step', (stepIndex + 1) + '/' + steps.length + ':', step.instruction);

                // 1. Analisa a tela
                see(step.instruction)
                .then(function(analysis) {
                    // 2. Executa a ação retornada pelo Gemini
                    if (analysis.action) {
                        return act(analysis.action).then(function(actResult) {
                            results.push({ step: stepIndex, analysis: analysis, result: actResult });

                            // 3. Verifica se deu certo (se a step pede verificação)
                            if (step.verify) {
                                return verify(step.verify).then(function(vResult) {
                                    if (!vResult.success && step.retries > 0) {
                                        console.log(TAG, 'Retentando step', stepIndex);
                                        step.retries--;
                                        // Não incrementa stepIndex, refaz
                                        setTimeout(nextStep, 1000);
                                        return;
                                    }
                                    stepIndex++;
                                    setTimeout(nextStep, step.delay || 500);
                                });
                            } else {
                                stepIndex++;
                                setTimeout(nextStep, step.delay || 500);
                            }
                        });
                    } else {
                        // Gemini não retornou ação (talvez já tá correto)
                        console.log(TAG, 'Sem ação necessária, avançando...');
                        results.push({ step: stepIndex, analysis: analysis, skipped: true });
                        stepIndex++;
                        setTimeout(nextStep, step.delay || 500);
                    }
                })
                .catch(function(err) {
                    console.error(TAG, 'Erro no step', stepIndex, err);
                    results.push({ step: stepIndex, error: err.message });
                    // Continua pro próximo step
                    stepIndex++;
                    setTimeout(nextStep, 500);
                });
            }

            nextStep();
        });
    }

    // ====================================================
    // WITH FALLBACK — Wrapper: tenta seletor, se falha → visão
    // ====================================================

    function withFallback(selectorFn, visionInstruction, callback) {
        try {
            var result = selectorFn();
            if (result) {
                console.log(TAG, 'Seletor OK, sem necessidade de visão');
                if (callback) callback(null, result);
                return;
            }
        } catch(e) {
            console.log(TAG, 'Seletor falhou:', e.message);
        }

        // Fallback: usa visão
        console.log(TAG, '⚡ Ativando fallback visual...');
        see(visionInstruction)
        .then(function(analysis) {
            if (analysis.action) {
                return act(analysis.action).then(function() {
                    if (callback) callback(null, analysis);
                });
            } else {
                if (callback) callback(null, analysis);
            }
        })
        .catch(function(err) {
            console.error(TAG, 'Fallback visual também falhou:', err);
            if (callback) callback(err);
        });
    }

    // ====================================================
    // FIND ELEMENT — Procura elemento visualmente
    // ====================================================

    function findElement(description) {
        return see(
            'Encontre na tela o elemento: "' + description + '"\n\n' +
            'Retorne JSON: {"found": true/false, "x": coordX_centro_do_elemento, "y": coordY_centro_do_elemento, "type": "button"|"input"|"link"|"text", "text": "texto do elemento"}'
        );
    }

    // ====================================================
    // API PÚBLICA
    // ====================================================

    return {
        see: see,
        act: act,
        verify: verify,
        execute: execute,
        withFallback: withFallback,
        findElement: findElement,
        typeText: typeText
    };

})();

console.log('[Vision] Módulo carregado — see/act/verify/execute/withFallback disponíveis');

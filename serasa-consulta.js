// serasa-consulta.js — Atom Agent para automacao no Serasa Empreendedor
// Executa em https://www.serasaempreendedor.com.br/*
(function() {
    'use strict';

    var SERASA_CREDS = {
        email: 'joane.vieira@mondshipping.com.br',
        senha: 'Mond#2023'
    };

    // ==========================================
    // UTILS
    // ==========================================

    function waitForElement(selector, timeout) {
        return new Promise(function(resolve, reject) {
            var el = document.querySelector(selector);
            if (el) return resolve(el);
            var elapsed = 0;
            var interval = setInterval(function() {
                elapsed += 300;
                el = document.querySelector(selector);
                if (el) {
                    clearInterval(interval);
                    resolve(el);
                } else if (elapsed >= timeout) {
                    clearInterval(interval);
                    reject(new Error('Timeout: ' + selector));
                }
            }, 300);
        });
    }

    function findButtonByText(text) {
        var buttons = document.querySelectorAll('button, a, span');
        for (var i = 0; i < buttons.length; i++) {
            var btnText = (buttons[i].textContent || '').trim().toLowerCase();
            if (btnText.indexOf(text.toLowerCase()) >= 0) {
                return buttons[i];
            }
        }
        return null;
    }

    function simulateInput(input, value) {
        input.focus();
        input.click();
        
        // Limpa
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, value);
        
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    // ==========================================
    // 1. PAGINA DE LOGIN
    // ==========================================

    function handleLoginPage() {
        console.log('[Atom Serasa] Pagina de login detectada');

        // Verifica se tem CNPJ pendente — se nao tem, nao faz nada
        chrome.storage.local.get('serasaCNPJ', function(data) {
            if (!data.serasaCNPJ) {
                console.log('[Atom Serasa] Sem CNPJ pendente, ignorando login');
                return;
            }

            // Qualquer click real habilita o botao
            // Usamos chrome.debugger via background pra click com isTrusted=true
            setTimeout(function() {
                var checkbox = document.getElementById('mat-mdc-checkbox-1-input');
                if (!checkbox) checkbox = document.querySelector('input[type="checkbox"]');
                
                var targetEl = checkbox || document.getElementById('username');
                
                if (targetEl) {
                    var rect = targetEl.getBoundingClientRect();
                    var x = Math.round(rect.left + rect.width / 2);
                    var y = Math.round(rect.top + rect.height / 2);
                    
                    console.log('[Atom Serasa] Real click no checkbox em', x, y);
                    chrome.runtime.sendMessage({
                        action: 'serasaRealClick',
                        x: x, y: y
                    }, function() {
                        setTimeout(function() {
                            var acessarBtn = document.getElementById('btn-acessar');
                            if (acessarBtn) {
                                var btnRect = acessarBtn.getBoundingClientRect();
                                var bx = Math.round(btnRect.left + btnRect.width / 2);
                                var by = Math.round(btnRect.top + btnRect.height / 2);
                                
                                console.log('[Atom Serasa] Real click no Acessar em', bx, by);
                                chrome.runtime.sendMessage({
                                    action: 'serasaRealClick',
                                    x: bx, y: by
                                });
                            }
                            
                            // Serasa é SPA — apos login, navega via Angular (sem recarregar)
                            // Content script NAO re-injeta. Monitora URL pra rodar consulta.
                            console.log('[Atom Serasa] Monitorando URL pra detectar navegacao SPA...');
                            var urlChecks = 0;
                            var urlWatcher = setInterval(function() {
                                urlChecks++;
                                var currentUrl = location.href;
                                if (currentUrl.indexOf('/login') < 0) {
                                    clearInterval(urlWatcher);
                                    console.log('[Atom Serasa] SPA navegou pra:', currentUrl);
                                    setTimeout(function() {
                                        handleConsultaPage();
                                    }, 2000);
                                }
                                if (urlChecks > 60) { // 30 segundos
                                    clearInterval(urlWatcher);
                                    console.log('[Atom Serasa] Timeout esperando navegacao SPA');
                                }
                            }, 500);
                        }, 1000);
                    });
                } else {
                    console.log('[Atom Serasa] Nenhum elemento encontrado pra click');
                }
            }, 2000);
        });
    }

    // ==========================================
    // 2. PAGINA DE CONSULTA
    // ==========================================

    function handleConsultaPage() {
        console.log('[Atom Serasa] Pagina de consulta detectada');

        // Primeiro: fecha popup "Continuar usando a versao atual" se existir
        dismissPopup(function() {
            // Depois: verifica se tem CNPJ pendente
            chrome.storage.local.get('serasaCNPJ', function(data) {
                if (!data.serasaCNPJ) {
                    console.log('[Atom Serasa] Sem CNPJ pendente');
                    return;
                }

                var cnpj = data.serasaCNPJ;
                console.log('[Atom Serasa] CNPJ pendente:', cnpj);

                // Limpa do storage
                chrome.storage.local.remove('serasaCNPJ');

                // Espera o campo de pesquisa aparecer
                waitForElement('input[placeholder*="CPF"], input[placeholder*="CNPJ"], input[name*="document"]', 8000)
                    .then(function(input) {
                        fillCNPJ(input, cnpj);
                    })
                    .catch(function() {
                        console.log('[Atom Serasa] Campo de pesquisa nao encontrado');
                    });
            });
        });
    }

    // Fecha o popup — real click via debugger no botao
    function dismissPopup(callback) {
        var attempts = 0;

        function tryDismiss() {
            var btn = document.getElementById('btnKeepCurrentB');
            console.log('[Atom Serasa] Procurando #btnKeepCurrentB, tentativa', attempts, '- encontrado:', !!btn);

            if (btn) {
                var rect = btn.getBoundingClientRect();
                var x = Math.round(rect.left + rect.width / 2);
                var y = Math.round(rect.top + rect.height / 2);
                console.log('[Atom Serasa] #btnKeepCurrentB coords:', x, y, 'size:', rect.width, rect.height);

                chrome.runtime.sendMessage({
                    action: 'serasaRealClick',
                    x: x, y: y
                }, function(resp) {
                    console.log('[Atom Serasa] Real click response:', resp);
                    setTimeout(callback, 1500);
                });
                return;
            }

            attempts++;
            if (attempts < 20) {
                setTimeout(tryDismiss, 500);
            } else {
                console.log('[Atom Serasa] #btnKeepCurrentB nao encontrado, continuando...');
                callback();
            }
        }

        setTimeout(tryDismiss, 2000); // Espera 2s pra popup aparecer
    }

    // Preenche CNPJ e clica em Pesquisar
    function fillCNPJ(input, cnpj) {
        // Formata: XX.XXX.XXX/XXXX-XX
        var formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

        console.log('[Atom Serasa] Preenchendo CNPJ:', formatted);

        // Usa nativeInputValueSetter pra funcionar com React/Angular
        simulateInput(input, formatted);

        // Espera e clica em Pesquisar
        setTimeout(function() {
            var pesquisarBtn = document.querySelector('button.consultPage_search__button');
            if (!pesquisarBtn) pesquisarBtn = document.querySelector('button[class*="search__button"]');
            if (!pesquisarBtn) pesquisarBtn = findButtonByText('pesquisar');

            if (pesquisarBtn) {
                console.log('[Atom Serasa] Clicando em Pesquisar...');
                pesquisarBtn.click();
            } else {
                console.log('[Atom Serasa] Botao Pesquisar nao encontrado');
            }
        }, 800);
    }

    // ==========================================
    // INIT — Detecta qual pagina estamos
    // ==========================================

    function init() {
        var url = location.href;

        // Detecta login tanto por URL quanto pelo formulario visivel
        var isLoginPage = url.indexOf('/login') >= 0 || document.getElementById('btn-acessar') || document.getElementById('username');

        if (isLoginPage) {
            handleLoginPage();
        } else if (url.indexOf('/consulta-serasa') >= 0 || url.indexOf('/consulta') >= 0) {
            handleConsultaPage();
            // Serasa SPA pode redirecionar pro login DEPOIS do script carregar
            // Monitora se aparece formulário de login
            var loginChecks = 0;
            var loginWatcher = setInterval(function() {
                loginChecks++;
                var nowUrl = location.href;
                var hasLoginForm = document.getElementById('btn-acessar') || document.getElementById('username');
                if (nowUrl.indexOf('/login') >= 0 || hasLoginForm) {
                    clearInterval(loginWatcher);
                    console.log('[Atom Serasa] Redirecionado pra login, iniciando login flow...');
                    handleLoginPage();
                }
                if (loginChecks > 30) clearInterval(loginWatcher); // 15 seg max
            }, 500);
        } else {
            // Pode ser outra pagina do Serasa — verifica CNPJ pendente mesmo assim
            chrome.storage.local.get('serasaCNPJ', function(data) {
                if (data.serasaCNPJ) {
                    console.log('[Atom Serasa] CNPJ pendente em pagina desconhecida, redirecionando...');
                    location.href = 'https://www.serasaempreendedor.com.br/v2/consulta-serasa/new';
                }
            });
        }
    }

    function safeInit() {
        chrome.storage.local.get('enabledAgents', function(d) {
            var agents = d.enabledAgents || ['cambio','serasa','frete','tracking','cotacao'];
            if (agents.indexOf('serasa') < 0) {
                console.log('[Atom Serasa] Agente desabilitado pelo perfil');
                return;
            }
            init();
        });
    }

    // Espera a pagina carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(safeInit, 1000);
        });
    } else {
        setTimeout(safeInit, 1000);
    }

    console.log('[Atom Serasa] Content script carregado em:', location.href);
})();

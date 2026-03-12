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
                // Pega coordenadas do checkbox "Lembrar meu login" pra clicar
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
                        // Agora clica no Acessar
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

    // Fecha o popup de "nova consulta" — REMOVE do DOM
    function dismissPopup(callback) {
        var attempts = 0;
        var maxAttempts = 20;

        function tryDismiss() {
            var continueBtn = document.getElementById('btnKeepCurrentB');
            if (!continueBtn) continueBtn = findButtonByText('continuar usando a vers');

            if (continueBtn) {
                console.log('[Atom Serasa] Popup encontrado, removendo do DOM...');
                
                // Sobe na arvore DOM pra achar o container do modal
                var modal = continueBtn;
                for (var i = 0; i < 10; i++) {
                    if (!modal.parentElement) break;
                    modal = modal.parentElement;
                    var style = window.getComputedStyle(modal);
                    // Modal geralmente tem position fixed/absolute e z-index alto
                    if (style.position === 'fixed' || style.position === 'absolute') {
                        if (parseInt(style.zIndex) > 100 || modal.classList.toString().indexOf('modal') >= 0 || modal.classList.toString().indexOf('dialog') >= 0 || modal.classList.toString().indexOf('overlay') >= 0) {
                            break;
                        }
                    }
                }
                
                // Remove o modal
                if (modal && modal !== document.body && modal !== document.documentElement) {
                    console.log('[Atom Serasa] Removendo modal:', modal.tagName, modal.className);
                    modal.remove();
                } else {
                    // Fallback: remove o pai direto do botao (container do popup)
                    var parent = continueBtn.parentElement;
                    while (parent && parent !== document.body) {
                        var ps = window.getComputedStyle(parent);
                        if (ps.position === 'fixed' || ps.position === 'absolute' || parent.offsetWidth > 400) {
                            parent.remove();
                            console.log('[Atom Serasa] Removido container do popup');
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
                
                // Remove qualquer backdrop/overlay
                var overlays = document.querySelectorAll('.cdk-overlay-container, .modal-backdrop, .cdk-overlay-backdrop, [class*="overlay"], [class*="backdrop"]');
                overlays.forEach(function(el) { 
                    el.style.display = 'none';
                    console.log('[Atom Serasa] Overlay ocultado:', el.className);
                });
                
                // Remove overflow hidden do body
                document.body.style.overflow = '';
                document.body.style.overflowY = '';
                
                setTimeout(callback, 500);
                return;
            }

            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(tryDismiss, 500);
            } else {
                console.log('[Atom Serasa] Sem popup, continuando...');
                callback();
            }
        }

        tryDismiss();
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

        if (url.indexOf('/login') >= 0) {
            handleLoginPage();
        } else if (url.indexOf('/consulta-serasa') >= 0 || url.indexOf('/consulta') >= 0) {
            handleConsultaPage();
        } else {
            // Pode ser outra pagina do Serasa — verifica CNPJ pendente mesmo assim
            chrome.storage.local.get('serasaCNPJ', function(data) {
                if (data.serasaCNPJ) {
                    console.log('[Atom Serasa] CNPJ pendente em pagina desconhecida, redirecionando...');
                    location.href = 'https://www.serasaempreendedor.com.br/v2/consulta-serasa';
                }
            });
        }
    }

    // Espera a pagina carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, 1000);
        });
    } else {
        setTimeout(init, 1000);
    }

    console.log('[Atom Serasa] Content script carregado em:', location.href);
})();

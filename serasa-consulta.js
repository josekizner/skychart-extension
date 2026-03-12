// serasa-consulta.js — Atom Agent para automação no Serasa Empreendedor
// Executa no https://www.serasaempreendedor.com.br/v2/consulta-serasa
(function() {
    'use strict';

    var SERASA_CREDS = {
        email: 'joane.vieira@mondshipping.com.br',
        senha: 'Mond#2023'
    };

    // Verifica se tem CNPJ pendente no storage
    function checkPendingCNPJ() {
        chrome.storage.local.get('serasaCNPJ', function(data) {
            if (!data.serasaCNPJ) return;

            var cnpj = data.serasaCNPJ;
            console.log('[Atom Serasa] CNPJ pendente:', cnpj);

            // Limpa o CNPJ do storage pra nao repetir
            chrome.storage.local.remove('serasaCNPJ');

            // Verifica se esta logado (presenca do campo de pesquisa)
            waitForElement('input[placeholder*="CPF"], input[placeholder*="CNPJ"], input[name*="document"]', 10000)
                .then(function(input) {
                    console.log('[Atom Serasa] Campo de pesquisa encontrado, inserindo CNPJ...');
                    fillCNPJ(input, cnpj);
                })
                .catch(function() {
                    console.log('[Atom Serasa] Campo nao encontrado, tentando login...');
                    attemptLogin(cnpj);
                });
        });
    }

    // Espera um elemento aparecer no DOM
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
                    reject(new Error('Timeout'));
                }
            }, 300);
        });
    }

    // Preenche o CNPJ no campo e clica em Pesquisar
    function fillCNPJ(input, cnpj) {
        // Formata CNPJ: XX.XXX.XXX/XXXX-XX
        var formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

        // Foca no campo
        input.focus();
        input.click();

        // Limpa e digita
        input.value = '';
        
        // Digita caractere por caractere (pra Angular detectar)
        var i = 0;
        function typeNext() {
            if (i >= formatted.length) {
                // Dispara eventos finais
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Espera e clica em Pesquisar
                setTimeout(function() {
                    clickPesquisar();
                }, 500);
                return;
            }
            input.value += formatted[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            i++;
            setTimeout(typeNext, 30);
        }
        typeNext();

        console.log('[Atom Serasa] CNPJ inserido:', formatted);
    }

    // Clica no botao Pesquisar
    function clickPesquisar() {
        // Tenta varias formas de achar o botao
        var btn = document.querySelector('button.consultPage_search__button');
        if (!btn) btn = document.querySelector('button[class*="search__button"]');
        if (!btn) {
            // Fallback: procura por texto
            var buttons = document.querySelectorAll('button');
            for (var b = 0; b < buttons.length; b++) {
                if ((buttons[b].textContent || '').trim() === 'Pesquisar') {
                    btn = buttons[b];
                    break;
                }
            }
        }

        if (btn) {
            console.log('[Atom Serasa] Clicando em Pesquisar...');
            btn.click();
        } else {
            console.log('[Atom Serasa] Botao Pesquisar nao encontrado');
        }
    }

    // Tenta fazer login (caso nao esteja logado)
    function attemptLogin(cnpjAfterLogin) {
        // Verifica se ha campos de login
        var emailField = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="e-mail"]');
        var senhaField = document.querySelector('input[type="password"]');

        if (emailField && senhaField) {
            console.log('[Atom Serasa] Fazendo login...');

            emailField.value = SERASA_CREDS.email;
            emailField.dispatchEvent(new Event('input', { bubbles: true }));

            senhaField.value = SERASA_CREDS.senha;
            senhaField.dispatchEvent(new Event('input', { bubbles: true }));

            // Salva CNPJ de volta pro storage (pra usar apos redirect de login)
            chrome.storage.local.set({ serasaCNPJ: cnpjAfterLogin });

            // Clica no botao de login
            setTimeout(function() {
                var loginBtn = document.querySelector('button[type="submit"], button[class*="login"]');
                if (!loginBtn) {
                    var allBtns = document.querySelectorAll('button');
                    for (var b = 0; b < allBtns.length; b++) {
                        var txt = (allBtns[b].textContent || '').trim().toLowerCase();
                        if (txt === 'entrar' || txt === 'login' || txt === 'acessar') {
                            loginBtn = allBtns[b];
                            break;
                        }
                    }
                }
                if (loginBtn) {
                    console.log('[Atom Serasa] Clicando no botao de login...');
                    loginBtn.click();
                }
            }, 500);
        } else {
            console.log('[Atom Serasa] Campos de login nao encontrados');
        }
    }

    // Injeta indicador visual na pagina
    function injectStatusBadge(text) {
        var badge = document.createElement('div');
        badge.id = 'atom-serasa-badge';
        badge.textContent = text;
        badge.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;' +
            'padding:8px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);' +
            'color:#fff;border-radius:8px;font-size:12px;font-weight:600;' +
            'font-family:Inter,sans-serif;box-shadow:0 4px 12px rgba(99,102,241,0.3);';
        document.body.appendChild(badge);
        setTimeout(function() { badge.remove(); }, 5000);
    }

    // Inicia quando a pagina carrega
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(checkPendingCNPJ, 1500);
        });
    } else {
        setTimeout(checkPendingCNPJ, 1500);
    }

    console.log('[Atom Serasa] Content script carregado');
})();

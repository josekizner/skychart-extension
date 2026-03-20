// ========================================================================
// ATOM CHAT — Agente conversacional flutuante da Mond
// Conectado ao Gemini 2.0 Flash + Firebase + dados operacionais
// ========================================================================
(function() {
    'use strict';
    var TAG = '[Atom Chat]';
    var FIREBASE = 'https://mond-atom-default-rtdb.firebaseio.com';
    var chatOpen = false;
    var messages = [];
    var isThinking = false;

    // ========================================================================
    // SYSTEM PROMPT — Personalidade e contexto do ATOM
    // ========================================================================
    var SYSTEM_PROMPT = [
        'Você é o ATOM, o assistente inteligente da Mond Shipping.',
        'Você é parte de uma plataforma de multiagentes que automatiza processos de câmbio, tracking, booking, demurrage, frete e operacional.',
        'Você fala de forma direta, objetiva e profissional, mas com personalidade — confiante, eficiente, um pouco futurista.',
        'Nunca use emojis demais. Use no máximo 1-2 por mensagem quando relevante.',
        'Responda SEMPRE em português do Brasil.',
        'Seja conciso — máximo 3-4 frases por resposta, a não ser que peçam detalhes.',
        'Você tem acesso aos seguintes dados em tempo real:',
        '- Workflows gravados (ATOM Learn): quantos existem, nomes, passos',
        '- Dados da página Skychart que o usuário está vendo',
        '- Agentes ativos: câmbio, tracking (Maersk/CMA), serasa, frete, demurrage, booking, frequência',
        'Se perguntarem algo que você NÃO tem dados, diga honestamente que não tem acesso a esse dado específico ainda.',
        'Quando falarem de "gravar" ou "aprender", explique o ATOM Learn.',
        'Você é o ATOM — observa, aprende e executa. Esse é seu lema.'
    ].join('\n');

    // ========================================================================
    // CSS
    // ========================================================================
    function injectChatCSS() {
        if (document.getElementById('atom-chat-css')) return;
        var s = document.createElement('style');
        s.id = 'atom-chat-css';
        s.textContent = [
            '@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&display=swap");',
            '#atom-chat-badge{position:fixed;bottom:90px;right:24px;z-index:999998;width:44px;height:44px;border-radius:50%;background:#090C14;border:1.5px solid rgba(245,158,11,0.25);box-shadow:0 4px 20px rgba(0,0,0,0.4),0 0 20px rgba(245,158,11,0.08);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s cubic-bezier(0.22,1,0.36,1);user-select:none;}',
            '#atom-chat-badge:hover{transform:scale(1.1);border-color:rgba(245,158,11,0.5);box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 30px rgba(245,158,11,0.15);}',
            '#atom-chat-badge .atom-notif{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#EF4444;border:2px solid #090C14;display:none;}',
            '#atom-chat-panel{position:fixed;bottom:90px;right:24px;z-index:999997;width:320px;height:440px;background:#090C14;border-radius:16px;border:1px solid #1C222F;box-shadow:0 20px 60px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.03);display:none;flex-direction:column;overflow:hidden;font-family:"DM Sans",sans-serif;opacity:0;transform:translateY(10px) scale(0.95);transition:all 0.3s cubic-bezier(0.22,1,0.36,1);}',
            '#atom-chat-panel.open{display:flex;opacity:1;transform:translateY(0) scale(1);}',
            '.atom-chat-hdr{padding:14px 16px;background:linear-gradient(180deg,#141820 0%,#090C14 100%);border-bottom:1px solid #1C222F;display:flex;align-items:center;gap:10px;flex-shrink:0;}',
            '.atom-chat-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:#1C222F transparent;}',
            '.atom-chat-msgs::-webkit-scrollbar{width:4px;}.atom-chat-msgs::-webkit-scrollbar-track{background:transparent;}.atom-chat-msgs::-webkit-scrollbar-thumb{background:#1C222F;border-radius:4px;}',
            '.atom-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:12px;line-height:1.6;animation:atomMsgIn 0.25s ease;}',
            '.atom-msg.user{align-self:flex-end;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.15);color:#DEE2EA;border-bottom-right-radius:4px;}',
            '.atom-msg.bot{align-self:flex-start;background:#0F1219;border:1px solid #1C222F;color:#B0B8C8;border-bottom-left-radius:4px;}',
            '.atom-msg.bot strong{color:#DEE2EA;}',
            '.atom-msg.bot code{background:rgba(245,158,11,0.1);color:#F59E0B;padding:1px 5px;border-radius:3px;font-size:11px;}',
            '.atom-chat-input-area{padding:10px 12px;border-top:1px solid #1C222F;background:#0A0D15;display:flex;gap:8px;align-items:center;flex-shrink:0;}',
            '.atom-chat-input{flex:1;background:#0F1219;border:1px solid #1C222F;border-radius:10px;padding:10px 14px;color:#DEE2EA;font-family:"DM Sans",sans-serif;font-size:12px;outline:none;resize:none;max-height:60px;transition:border-color 0.2s;}',
            '.atom-chat-input:focus{border-color:rgba(245,158,11,0.3);}',
            '.atom-chat-input::placeholder{color:#4E586C;}',
            '.atom-chat-send{width:32px;height:32px;border-radius:50%;background:#F59E0B;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0;}',
            '.atom-chat-send:hover{background:#FBBF24;transform:scale(1.05);}',
            '.atom-chat-send:disabled{opacity:0.4;cursor:not-allowed;transform:none;}',
            '.atom-thinking{display:flex;align-items:center;gap:6px;padding:10px 14px;align-self:flex-start;}',
            '.atom-thinking-dot{width:6px;height:6px;border-radius:50%;background:#F59E0B;animation:atomThink 1.2s ease-in-out infinite;}',
            '.atom-thinking-dot:nth-child(2){animation-delay:0.15s;}',
            '.atom-thinking-dot:nth-child(3){animation-delay:0.3s;}',
            '@keyframes atomThink{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}',
            '@keyframes atomMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ========================================================================
    // BADGE — Ícone flutuante
    // ========================================================================
    function createBadge() {
        if (document.getElementById('atom-chat-badge')) return;
        injectChatCSS();

        var badge = document.createElement('div');
        badge.id = 'atom-chat-badge';
        badge.title = 'ATOM Chat';
        badge.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C13.41 22 14.75 21.69 15.97 21.14L22 22L20.86 16.03C21.59 14.69 22 13.39 22 12C22 6.48 17.52 2 12 2Z" stroke="#F59E0B" stroke-width="1.5" fill="none"/><circle cx="8.5" cy="11.5" r="1.2" fill="#F59E0B"/><circle cx="12" cy="11.5" r="1.2" fill="#F59E0B"/><circle cx="15.5" cy="11.5" r="1.2" fill="#F59E0B"/></svg>' +
            '<div class="atom-notif"></div>';
        badge.addEventListener('click', toggleChat);
        document.body.appendChild(badge);

        createPanel();
    }

    // ========================================================================
    // PANEL — Painel de chat
    // ========================================================================
    function createPanel() {
        if (document.getElementById('atom-chat-panel')) return;
        var panel = document.createElement('div');
        panel.id = 'atom-chat-panel';

        // Header
        var hdr = document.createElement('div');
        hdr.className = 'atom-chat-hdr';
        hdr.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;background:rgba(245,158,11,0.08);border:1.5px solid rgba(245,158,11,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C13.41 22 14.75 21.69 15.97 21.14L22 22L20.86 16.03C21.59 14.69 22 13.39 22 12C22 6.48 17.52 2 12 2Z" stroke="#F59E0B" stroke-width="1.8" fill="none"/></svg></div>' +
            '<div style="flex:1;"><div style="display:flex;align-items:baseline;gap:4px;"><span style="font-family:Oswald,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.06em;color:#DEE2EA;">AT</span><span style="font-family:Oswald,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.06em;color:#F59E0B;">O</span><span style="font-family:Oswald,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.06em;color:#DEE2EA;">M</span><span style="font-family:Oswald,sans-serif;font-size:10px;font-weight:500;color:#F59E0B;letter-spacing:0.1em;margin-left:4px;">CHAT</span></div>' +
            '<div style="font-size:8px;font-weight:600;letter-spacing:0.08em;color:#4E586C;text-transform:uppercase;">Assistente Mond Shipping</div></div>' +
            '<div id="atom-chat-close" style="cursor:pointer;padding:4px;color:#4E586C;font-size:16px;line-height:1;" title="Fechar">✕</div>';
        panel.appendChild(hdr);

        // Messages area
        var msgs = document.createElement('div');
        msgs.className = 'atom-chat-msgs';
        msgs.id = 'atom-chat-msgs';
        panel.appendChild(msgs);

        // Input area
        var inputArea = document.createElement('div');
        inputArea.className = 'atom-chat-input-area';
        var input = document.createElement('textarea');
        input.className = 'atom-chat-input';
        input.id = 'atom-chat-input';
        input.placeholder = 'Pergunte algo ao ATOM...';
        input.rows = 1;
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        input.addEventListener('input', function() {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 60) + 'px';
        });
        var sendBtn = document.createElement('button');
        sendBtn.className = 'atom-chat-send';
        sendBtn.id = 'atom-chat-send';
        sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#000" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
        sendBtn.addEventListener('click', sendMessage);
        inputArea.appendChild(input);
        inputArea.appendChild(sendBtn);
        panel.appendChild(inputArea);

        document.body.appendChild(panel);

        // Close button
        document.getElementById('atom-chat-close').addEventListener('click', toggleChat);

        // Welcome message
        addBotMessage('Olá! Sou o **ATOM**, seu assistente inteligente. Posso ajudar com workflows, tracking, câmbio, frete, demurrage e tudo mais do seu operacional. Como posso ajudar?');
    }

    // ========================================================================
    // TOGGLE
    // ========================================================================
    function toggleChat() {
        chatOpen = !chatOpen;
        var panel = document.getElementById('atom-chat-panel');
        var badge = document.getElementById('atom-chat-badge');
        if (!panel) return;

        if (chatOpen) {
            panel.style.display = 'flex';
            // Force reflow
            panel.offsetHeight;
            panel.classList.add('open');
            badge.style.opacity = '0';
            badge.style.pointerEvents = 'none';
            setTimeout(function() {
                var input = document.getElementById('atom-chat-input');
                if (input) input.focus();
            }, 300);
        } else {
            panel.classList.remove('open');
            badge.style.opacity = '1';
            badge.style.pointerEvents = 'auto';
            setTimeout(function() { panel.style.display = 'none'; }, 300);
        }
    }

    // ========================================================================
    // MESSAGES
    // ========================================================================
    function addUserMessage(text) {
        messages.push({ role: 'user', text: text });
        var msgs = document.getElementById('atom-chat-msgs');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'atom-msg user';
        div.textContent = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function addBotMessage(text) {
        messages.push({ role: 'bot', text: text });
        var msgs = document.getElementById('atom-chat-msgs');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'atom-msg bot';
        div.innerHTML = formatMarkdown(text);
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function showThinking() {
        var msgs = document.getElementById('atom-chat-msgs');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'atom-thinking';
        div.id = 'atom-thinking';
        div.innerHTML = '<div class="atom-thinking-dot"></div><div class="atom-thinking-dot"></div><div class="atom-thinking-dot"></div>';
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function hideThinking() {
        var el = document.getElementById('atom-thinking');
        if (el) el.remove();
    }

    // Markdown simples
    function formatMarkdown(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    // ========================================================================
    // CONTEXT — Coleta dados em tempo real pra enriquecer o prompt
    // ========================================================================
    async function gatherContext() {
        var ctx = [];

        // 1. URL atual
        ctx.push('Página atual: ' + window.location.href);

        // 2. Título ou seção visível
        var h1 = document.querySelector('h1, .page-title, .ui-panel-title');
        if (h1) ctx.push('Seção: ' + h1.textContent.trim().substring(0, 80));

        // 3. Workflows do Firebase
        try {
            var resp = await fetch(FIREBASE + '/atom_recordings.json?shallow=true');
            var keys = await resp.json();
            if (keys) {
                var wfCount = Object.keys(keys).length;
                ctx.push('Workflows gravados: ' + wfCount);
                // Busca labels dos últimos 5
                var ids = Object.keys(keys).slice(-5);
                var labels = await Promise.all(ids.map(function(id) {
                    return fetch(FIREBASE + '/atom_recordings/' + id + '/label.json')
                        .then(function(r) { return r.json(); })
                        .then(function(l) { return l || id; })
                        .catch(function() { return id; });
                }));
                ctx.push('Últimos workflows: ' + labels.join(', '));
            }
        } catch(e) { /* sem acesso ao firebase */ }

        // 4. Agentes ativos
        try {
            var agents = [];
            if (typeof SkAgent !== 'undefined') agents.push('Smart Agent');
            if (typeof SkDebug !== 'undefined') agents.push('Debug Panel');
            if (typeof SkMemory !== 'undefined') agents.push('Memory');
            if (document.getElementById('atom-widget')) agents.push('ATOM Learn');
            if (agents.length > 0) ctx.push('Agentes carregados: ' + agents.join(', '));
        } catch(e) {}

        // 5. Dados da página (tabelas, campos relevantes)
        try {
            var tables = document.querySelectorAll('table');
            if (tables.length > 0) ctx.push('Tabelas na página: ' + tables.length);
            var inputs = document.querySelectorAll('input:not([type=hidden])');
            if (inputs.length > 0) ctx.push('Campos de input: ' + inputs.length);
        } catch(e) {}

        return ctx.join('\n');
    }

    // ========================================================================
    // SEND — Envia mensagem pro Gemini
    // ========================================================================
    async function sendMessage() {
        if (isThinking) return;
        var input = document.getElementById('atom-chat-input');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.style.height = 'auto';
        addUserMessage(text);

        isThinking = true;
        var sendBtn = document.getElementById('atom-chat-send');
        if (sendBtn) sendBtn.disabled = true;
        showThinking();

        try {
            // Coleta contexto em tempo real
            var context = await gatherContext();

            // Monta histórico (últimas 10 mensagens)
            var history = messages.slice(-10).map(function(m) {
                return (m.role === 'user' ? 'Usuário' : 'ATOM') + ': ' + m.text;
            }).join('\n');

            var prompt = SYSTEM_PROMPT + '\n\n--- CONTEXTO EM TEMPO REAL ---\n' + context + '\n\n--- HISTÓRICO DA CONVERSA ---\n' + history + '\n\nUsuário: ' + text + '\nATOM:';

            // Chama Gemini via background.js
            var response = await new Promise(function(resolve, reject) {
                chrome.runtime.sendMessage({ action: 'askGemini', prompt: prompt }, function(resp) {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (resp && resp.text) {
                        resolve(resp.text);
                    } else {
                        reject(new Error(resp && resp.error ? resp.error : 'Sem resposta'));
                    }
                });
            });

            hideThinking();
            addBotMessage(response);

        } catch(err) {
            console.error(TAG, err);
            hideThinking();
            addBotMessage('Desculpe, tive um problema ao processar sua mensagem. Tente novamente.');
        }

        isThinking = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
    }

    // ========================================================================
    // INIT
    // ========================================================================
    function init() {
        // Só cria no Skychart
        if (window.location.href.indexOf('skychart.com.br') < 0) return;
        // Espera DOM estabilizar
        if (document.getElementById('atom-chat-badge')) return;
        createBadge();
        console.log(TAG, 'Carregado');
    }

    // Aguarda body existir
    if (document.body) {
        setTimeout(init, 2000);
    } else {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 2000); });
    }
})();

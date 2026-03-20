/**
 * ACTION RECORDER — Grava workflows do usuário NO Skychart
 * 
 * Captura: clicks, inputs, seleções, navegação SPA (hashchange)
 * Salva: cada ação como { timestamp, tipo, seletor, valor, label, pageUrl }
 * Controle: ativa/desativa via mensagem do popup (action: 'start_recording' / 'stop_recording')
 * Storage: Firebase atom_recordings/{sessionId}
 * 
 * Também re-escaneia a página quando detecta mudança de seção (SPA)
 */
(function() {
    'use strict';
    var TAG = '[Action Recorder]';
    var recording = false;
    var actions = [];
    var sessionId = null;
    var currentLabel = '';
    var lastHash = window.location.hash;
    var lastPageScan = null;
    var BLACKLIST_TYPES = ['password', 'token', 'secret']; // Nunca grava esses

    console.log(TAG, 'Carregado. Use o botão REC ou Ctrl+Shift+R para gravar.');

    // ========================================================================
    // ATOM LEARN — Floating Panel com Robot Head
    // ========================================================================
    var _atomRecTimer = null;
    var _atomRecElapsed = 0;

    function injectAtomCSS() {
        if (document.getElementById('atom-learn-css')) return;
        var f1 = document.createElement('link'); f1.rel = 'stylesheet';
        f1.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap';
        document.head.appendChild(f1);
        var css = document.createElement('style'); css.id = 'atom-learn-css';
        css.textContent = [
            '@keyframes alPulse{0%,100%{opacity:1}50%{opacity:0.6}}',
            '@keyframes alBlink{0%,100%{opacity:1}50%{opacity:0}}',
            '@keyframes alRecPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}',
            '@keyframes alBorderRec{0%,100%{border-color:rgba(239,68,68,0.2)}50%{border-color:rgba(239,68,68,0.5)}}',
            '@keyframes alBorderExec{0%,100%{border-color:rgba(245,158,11,0.15)}50%{border-color:rgba(245,158,11,0.35)}}',
            '@keyframes alSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
            '@keyframes alDotPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:0.5}}',
            '@keyframes alShine{0%{background-position:-200% 0}100%{background-position:200% 0}}',
            '@keyframes alGlowPulse{0%,100%{opacity:0.15}50%{opacity:0.3}}',
            '@keyframes alDoneScale{0%{transform:scale(0.95);opacity:0}100%{transform:scale(1);opacity:1}}',
            '#atom-widget::-webkit-scrollbar{width:3px}',
            '#atom-widget::-webkit-scrollbar-thumb{background:#1C222F;border-radius:2px}',
        ].join('\n');
        document.head.appendChild(css);
    }

    function atomRobotSVG(state) {
        var isRec = state === 'recording';
        var isDone = state === 'done';
        var isExec = state === 'executing';
        var vColor1 = isRec ? '#FF3B30' : isDone ? '#10B981' : '#F59E0B';
        var vColor2 = isRec ? '#CC2D25' : isDone ? '#059669' : '#D97706';
        var vLine = isRec ? '#FF9B90' : isDone ? '#6EE7B7' : '#FDE68A';
        var antennaColor = isRec ? '#FF3B30' : '#F59E0B';
        var vOp = isRec ? '1;0.6;1' : isExec ? '1;0.75;1' : '0.9;0.65;0.9';
        var vDur = isRec ? '1.2s' : isExec ? '0.8s' : '3s';
        var cOp = isRec ? '1;0.3;1' : isExec ? '1;0.5;1' : '0.85;0.25;0.85';
        var cDur = isRec ? '0.8s' : isExec ? '0.6s' : '2s';
        var s = '<svg width="44" height="44" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">';
        s += '<defs><linearGradient id="alV" x1="30" y1="50" x2="90" y2="60" gradientUnits="userSpaceOnUse">';
        s += '<stop stop-color="' + vColor1 + '"/><stop offset="1" stop-color="' + vColor2 + '"/></linearGradient>';
        s += '<filter id="alG"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
        s += '<filter id="alGS"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
        // Pulsing ring
        if (isRec || isExec) {
            s += '<circle cx="60" cy="60" r="58" fill="none" stroke="' + (isRec ? '#FF3B3020' : '#F59E0B15') + '" stroke-width="2">';
            s += '<animate attributeName="r" values="54;58;54" dur="' + (isRec ? '1.5s' : '2s') + '" repeatCount="indefinite"/>';
            s += '<animate attributeName="opacity" values="1;0.3;1" dur="' + (isRec ? '1.5s' : '2s') + '" repeatCount="indefinite"/></circle>';
        }
        // Shell + face
        s += '<path d="M60 10L95 34V76L74 106H46L25 76V34Z" fill="#2E3648" stroke="#5A6578" stroke-width="1.2"/>';
        s += '<path d="M60 20L86 40V70L69 96H51L34 70V40Z" fill="#1A2030" stroke="#2E3648" stroke-width="0.8"/>';
        // Visor
        s += '<path d="M40 52L80 52L76 63H44Z" fill="url(#alV)" filter="url(#alG)"><animate attributeName="opacity" values="' + vOp + '" dur="' + vDur + '" repeatCount="indefinite"/></path>';
        // Scan line (recording)
        if (isRec) {
            s += '<line x1="44" y1="57" x2="76" y2="57" stroke="#FF6B60" stroke-width="1.5" opacity="0.8" filter="url(#alG)">';
            s += '<animate attributeName="x1" values="40;76;40" dur="1.8s" repeatCount="indefinite"/>';
            s += '<animate attributeName="x2" values="48;84;48" dur="1.8s" repeatCount="indefinite"/></line>';
        }
        s += '<line x1="46" y1="57.5" x2="74" y2="57.5" stroke="' + vLine + '" stroke-width="0.7" opacity="0.4"/>';
        // Chin + side panels
        s += '<path d="M50 72H70L67 84H53Z" fill="#2E3648"/>';
        s += '<path d="M25 44L34 41V66L25 63Z" fill="#2E3648"/><path d="M95 44L86 41V66L95 63Z" fill="#2E3648"/>';
        // Antenna
        s += '<path d="M56 10L60 3L64 10" stroke="' + antennaColor + '" stroke-width="1.5" fill="none" filter="url(#alG)">';
        if (isRec) s += '<animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite"/>';
        s += '</path>';
        // Side accents
        s += '<line x1="27" y1="50" x2="32" y2="50" stroke="' + antennaColor + '" stroke-width="1.5" filter="url(#alG)"/>';
        s += '<line x1="88" y1="50" x2="93" y2="50" stroke="' + antennaColor + '" stroke-width="1.5" filter="url(#alG)"/>';
        // Core
        s += '<circle cx="60" cy="90" r="2.5" fill="' + vColor1 + '" filter="url(#alG)"><animate attributeName="opacity" values="' + cOp + '" dur="' + cDur + '" repeatCount="indefinite"/></circle>';
        // Done check
        if (isDone) {
            s += '<g filter="url(#alGS)"><path d="M50 57L56 63L72 50" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/></g>';
        }
        s += '</svg>';
        return s;
    }

    function createRecButton() {
        injectAtomCSS();
        var w = document.createElement('div');
        w.id = 'atom-widget';
        w.style.cssText = 'position:fixed;bottom:20px;right:16px;z-index:999999;width:240px;background:#090C14;border-radius:14px;border:1px solid #1C222F;box-shadow:0 20px 60px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.03);overflow:hidden;font-family:DM Sans,sans-serif;user-select:none;transition:all 0.5s cubic-bezier(0.22,1,0.36,1);';

        // Header
        var hdr = '<div id="atom-hdr" style="padding:12px 14px 10px;background:linear-gradient(180deg,#141820 0%,#090C14 100%);border-bottom:1px solid #1C222F;position:relative;overflow:hidden;">';
        hdr += '<div style="display:flex;align-items:center;gap:10px;position:relative;">';
        hdr += '<div id="atom-robot">' + atomRobotSVG('idle') + '</div>';
        hdr += '<div>';
        hdr += '<div style="display:flex;align-items:baseline;gap:4px;"><span style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.06em;color:#DEE2EA;">AT</span><span style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.06em;color:#F59E0B;">O</span><span style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.06em;color:#DEE2EA;">M</span><span id="atom-mode-label" style="font-family:Oswald,sans-serif;font-size:11px;font-weight:500;color:#F59E0B;letter-spacing:0.1em;margin-left:4px;">LEARN</span></div>';
        hdr += '<div id="atom-status-text" style="font-size:8px;font-family:DM Sans,sans-serif;font-weight:600;letter-spacing:0.1em;color:#4E586C;text-transform:uppercase;margin-top:1px;">PRONTO PARA APRENDER</div>';
        hdr += '</div></div></div>';

        // Content
        var cnt = '<div id="atom-content" style="padding:10px 12px 12px;">';
        // Idle: REC + PLAY buttons
        cnt += '<div id="atom-idle" style="display:flex;flex-direction:column;gap:8px;">';
        cnt += '<div style="text-align:center;padding:8px 0;margin-bottom:4px;"><div style="font-size:10px;font-family:DM Sans,sans-serif;color:#8892A4;line-height:1.5;">Aperte <strong style="color:#EF4444;">REC</strong> e eu vou observar cada ação sua. Depois, aperte <strong style="color:#F59E0B;">PLAY</strong> e eu repito tudo sozinho.</div></div>';
        cnt += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        // REC
        cnt += '<div id="atom-rec-button" style="text-align:center;padding:12px 8px;border-radius:10px;cursor:pointer;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);transition:all 0.25s;">';
        cnt += '<div style="width:28px;height:28px;border-radius:50%;background:rgba(239,68,68,0.15);border:2px solid rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 6px;"><div style="width:10px;height:10px;border-radius:50%;background:#EF4444;"></div></div>';
        cnt += '<span style="font-family:Oswald,sans-serif;font-size:13px;font-weight:600;color:#EF4444;letter-spacing:0.12em;">REC</span></div>';
        // PLAY
        cnt += '<div id="atom-play-button" style="text-align:center;padding:12px 8px;border-radius:10px;cursor:pointer;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);transition:all 0.25s;">';
        cnt += '<div style="width:28px;height:28px;border-radius:50%;background:rgba(245,158,11,0.12);border:2px solid rgba(245,158,11,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 6px;"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 2L14 8L4 14V2Z" fill="#F59E0B"/></svg></div>';
        cnt += '<span style="font-family:Oswald,sans-serif;font-size:13px;font-weight:600;color:#F59E0B;letter-spacing:0.12em;">PLAY</span></div>';
        cnt += '</div>';
        // Stats
        cnt += '<div id="atom-stats" style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:6px;padding:6px 0;">';
        cnt += '<div style="text-align:center;"><div id="atom-stat-wf" style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;color:#F59E0B;">—</div><div style="font-size:7px;font-family:DM Sans,sans-serif;font-weight:600;color:#4E586C;letter-spacing:0.08em;">WORKFLOWS</div></div>';
        cnt += '<div style="width:1px;height:18px;background:#1C222F;"></div>';
        cnt += '<div style="text-align:center;"><div id="atom-stat-steps" style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;color:#DEE2EA;">—</div><div style="font-size:7px;font-family:DM Sans,sans-serif;font-weight:600;color:#4E586C;letter-spacing:0.08em;">PASSOS</div></div>';
        cnt += '<div style="width:1px;height:18px;background:#1C222F;"></div>';
        cnt += '<div style="text-align:center;"><div id="atom-stat-hours" style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;color:#10B981;">—</div><div style="font-size:7px;font-family:DM Sans,sans-serif;font-weight:600;color:#4E586C;letter-spacing:0.08em;">ECONOMIZADAS</div></div>';
        cnt += '</div></div>';
        // Recording state (hidden)
        cnt += '<div id="atom-recording" style="display:none;">';
        cnt += '<div style="height:3px;border-radius:2px;background:#0F1219;margin-bottom:10px;overflow:hidden;"><div id="atom-rec-bar" style="height:100%;border-radius:2px;width:100%;background:linear-gradient(90deg,#EF4444,#F87171,#EF4444);background-size:200% 100%;animation:alShine 1.5s linear infinite;"></div></div>';
        cnt += '<div id="atom-rec-steps" style="max-height:160px;overflow-y:auto;margin-bottom:8px;display:flex;flex-direction:column;gap:4px;"></div>';
        cnt += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:6px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1);margin-bottom:8px;"><div style="font-size:9px;font-family:DM Sans,sans-serif;font-weight:600;color:#8892A4;"><span id="atom-step-count" style="color:#EF4444;font-family:Oswald,sans-serif;font-size:14px;font-weight:600;margin-right:3px;">0</span>ações capturadas</div><div id="atom-timer" style="font-family:Oswald,sans-serif;font-size:12px;font-weight:500;color:#EF4444;letter-spacing:0.05em;">00:00</div></div>';
        cnt += '<div id="atom-stop-btn" style="text-align:center;padding:10px;border-radius:8px;cursor:pointer;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);transition:all 0.2s;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#EF4444;"></div><span style="font-family:Oswald,sans-serif;font-size:12px;font-weight:600;color:#EF4444;letter-spacing:0.1em;">PARAR GRAVAÇÃO</span></div></div></div>';
        // Recorded (Aprendizado Completo) state (hidden)
        cnt += '<div id="atom-recorded" style="display:none;text-align:center;animation:alDoneScale 0.4s ease;">';
        cnt += '<div style="padding:12px 8px 16px;"><div style="width:44px;height:44px;border-radius:50%;margin:0 auto 10px;background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.2);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L2.5 4V8.5C2.5 11.5 5 14 8 14.5C11 14 13.5 11.5 13.5 8.5V4L8 1.5Z" stroke="#F59E0B" stroke-width="1.3" stroke-linejoin="round" fill="none"/><path d="M5.5 8L7 9.5L10.5 6" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
        cnt += '<div style="font-family:Oswald,sans-serif;font-size:15px;font-weight:600;color:#DEE2EA;letter-spacing:0.06em;margin-bottom:4px;">APRENDIZADO COMPLETO</div>';
        cnt += '<div style="font-size:10px;font-family:DM Sans,sans-serif;color:#8892A4;line-height:1.5;">Capturei <strong id="atom-rec-count" style="color:#F59E0B;">0 ações</strong> em <strong id="atom-rec-time" style="color:#F59E0B;">00:00</strong>.<br>Posso reproduzir quando quiser.</div></div>';
        cnt += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        cnt += '<div id="atom-back-btn" style="padding:10px;border-radius:8px;cursor:pointer;background:#0F1219;border:1px solid #1C222F;font-family:Oswald,sans-serif;font-size:11px;font-weight:600;color:#8892A4;letter-spacing:0.08em;text-align:center;transition:all 0.2s;">VOLTAR</div>';
        cnt += '<div id="atom-exec-btn" style="padding:10px;border-radius:8px;cursor:pointer;background:#F59E0B;border:1px solid #FBBF24;font-family:Oswald,sans-serif;font-size:11px;font-weight:600;color:#000;letter-spacing:0.08em;text-align:center;transition:all 0.2s;">EXECUTAR AGORA</div>';
        cnt += '</div></div>';
        // Executing state (hidden)
        cnt += '<div id="atom-executing" style="display:none;animation:alSlideUp 0.3s ease;">';
        cnt += '<div style="height:3px;border-radius:2px;background:#0F1219;margin-bottom:12px;overflow:hidden;"><div id="atom-exec-bar" style="height:100%;border-radius:2px;width:0%;background:linear-gradient(90deg,#F59E0B,#FBBF24);background-size:200% 100%;animation:alShine 1.5s linear infinite;transition:width 0.5s cubic-bezier(0.22,1,0.36,1);"></div></div>';
        cnt += '<div id="atom-exec-steps" style="margin-bottom:10px;"></div>';
        cnt += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18);"><span style="font-size:9px;font-family:DM Sans,sans-serif;font-weight:600;color:#8892A4;">Progresso</span><span id="atom-exec-pct" style="font-family:Oswald,sans-serif;font-size:13px;font-weight:600;color:#F59E0B;letter-spacing:0.05em;">0%</span></div></div>';
        // Done state (hidden)
        cnt += '<div id="atom-done" style="display:none;text-align:center;animation:alDoneScale 0.5s ease;">';
        cnt += '<div style="padding:12px 8px 16px;"><div style="width:48px;height:48px;border-radius:50%;margin:0 auto 12px;background:rgba(16,185,129,0.08);border:2px solid rgba(16,185,129,0.25);display:flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
        cnt += '<div style="font-family:Oswald,sans-serif;font-size:16px;font-weight:600;color:#10B981;letter-spacing:0.08em;margin-bottom:4px;">MISSÃO CUMPRIDA</div>';
        cnt += '<div style="font-size:10px;font-family:DM Sans,sans-serif;color:#8892A4;line-height:1.5;">Todos os <strong id="atom-done-steps" style="color:#DEE2EA;">0 passos</strong> foram executados com sucesso.</div></div>';
        cnt += '<div id="atom-done-back" style="padding:10px;border-radius:8px;cursor:pointer;background:#0F1219;border:1px solid #1C222F;font-family:Oswald,sans-serif;font-size:11px;font-weight:600;color:#8892A4;letter-spacing:0.08em;text-align:center;transition:all 0.2s;">VOLTAR AO INÍCIO</div></div>';
        cnt += '</div>';

        // Footer
        var ftr = '<div id="atom-footer" style="padding:6px 12px 8px;border-top:1px solid #1C222F;display:flex;align-items:center;justify-content:space-between;">';
        ftr += '<span style="font-size:7px;font-family:DM Sans,sans-serif;font-weight:600;color:#2E3648;letter-spacing:0.1em;">ATOM LEARN · v1.0</span>';
        ftr += '<div style="display:flex;align-items:center;gap:4px;"><div id="atom-status-dot" style="width:4px;height:4px;border-radius:50%;background:#10B981;box-shadow:0 0 6px rgba(16,185,129,0.4);"></div><span id="atom-status-label" style="font-size:7px;font-family:DM Sans,sans-serif;font-weight:600;color:#10B981;letter-spacing:0.08em;">ONLINE</span></div>';
        ftr += '</div>';

        w.innerHTML = hdr + cnt + ftr;
        document.body.appendChild(w);

        // Event listeners
        document.getElementById('atom-rec-button').addEventListener('click', function() { toggleRecording(); });
        document.getElementById('atom-play-button').addEventListener('click', function() { showRecordingPicker(); });
        document.getElementById('atom-stop-btn').addEventListener('click', function() { if (recording) stopRecording(); });
        document.getElementById('atom-back-btn').addEventListener('click', function() { switchPanelState('idle'); });
        document.getElementById('atom-exec-btn').addEventListener('click', function() {
            // Executa a última gravação
            if (sessionId) chrome.runtime.sendMessage({ action: 'replay_workflow_proxy', sessionId: sessionId });
            switchPanelState('idle');
        });
        document.getElementById('atom-done-back').addEventListener('click', function() { switchPanelState('idle'); });

        // Hover effects
        var rb = document.getElementById('atom-rec-button');
        rb.addEventListener('mouseenter', function() { rb.style.background = 'rgba(239,68,68,0.12)'; rb.style.borderColor = 'rgba(239,68,68,0.4)'; rb.style.transform = 'translateY(-2px)'; });
        rb.addEventListener('mouseleave', function() { rb.style.background = 'rgba(239,68,68,0.06)'; rb.style.borderColor = 'rgba(239,68,68,0.2)'; rb.style.transform = 'none'; });
        var pb = document.getElementById('atom-play-button');
        pb.addEventListener('mouseenter', function() { pb.style.background = 'rgba(245,158,11,0.12)'; pb.style.borderColor = 'rgba(245,158,11,0.35)'; pb.style.transform = 'translateY(-2px)'; });
        pb.addEventListener('mouseleave', function() { pb.style.background = 'rgba(245,158,11,0.08)'; pb.style.borderColor = 'rgba(245,158,11,0.18)'; pb.style.transform = 'none'; });

        // Executor events - execução em tempo real
        var _execTotal = 0;
        document.addEventListener('atom-exec-start', function() {
            switchPanelState('executing');
            _execTotal = 0;
        });
        document.addEventListener('atom-exec-step', function(e) {
            var d = e.detail;
            _execTotal = d.total;
            var pct = Math.round((d.current / d.total) * 100);
            var bar = document.getElementById('atom-exec-bar');
            if (bar) bar.style.width = pct + '%';
            var pctEl = document.getElementById('atom-exec-pct');
            if (pctEl) pctEl.textContent = pct + '%';
            // Atualiza lista de steps
            var stepsEl = document.getElementById('atom-exec-steps');
            if (stepsEl) {
                var stepText = d.text.replace(/^\d+\/\d+:\s*/, '');
                // Atualiza existente ou cria novo
                var existingItem = document.getElementById('atom-es-' + d.current);
                if (!existingItem) {
                    // Marca anteriores como done
                    for (var k = 1; k < d.current; k++) {
                        var prev = document.getElementById('atom-es-' + k);
                        if (prev && !prev.dataset.done) {
                            prev.dataset.done = '1';
                            prev.querySelector('.al-dot').innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                            prev.querySelector('.al-dot').style.background = 'rgba(16,185,129,0.12)';
                            prev.querySelector('.al-dot').style.borderColor = '#10B981';
                            prev.querySelector('.al-lbl').style.fontWeight = '400';
                            prev.querySelector('.al-lbl').style.color = '#8892A4';
                            var execBadge = prev.querySelector('.al-exec');
                            if (execBadge) execBadge.remove();
                        }
                    }
                    var item = document.createElement('div');
                    item.id = 'atom-es-' + d.current;
                    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;';
                    item.innerHTML = '<div class="al-dot" style="width:18px;height:18px;border-radius:50%;background:rgba(245,158,11,0.08);border:1.5px solid #F59E0B;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="width:5px;height:5px;border-radius:50%;background:#F59E0B;animation:alDotPulse 0.8s ease-in-out infinite;"></div></div>' +
                        '<div class="al-lbl" style="flex:1;font-size:10px;font-family:DM Sans,sans-serif;font-weight:600;color:#DEE2EA;">' + stepText + '</div>' +
                        '<div class="al-exec" style="font-size:8px;font-family:Oswald,sans-serif;font-weight:500;color:#F59E0B;letter-spacing:0.08em;animation:alBlink 1s step-end infinite;">EXEC</div>';
                    stepsEl.appendChild(item);
                }
            }
        });
        document.addEventListener('atom-exec-done', function() {
            // Marca todos como done
            var stepsEl = document.getElementById('atom-exec-steps');
            if (stepsEl) {
                var items = stepsEl.querySelectorAll('[id^=atom-es-]');
                for (var k = 0; k < items.length; k++) {
                    if (!items[k].dataset.done) {
                        items[k].dataset.done = '1';
                        items[k].querySelector('.al-dot').innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                        items[k].querySelector('.al-dot').style.background = 'rgba(16,185,129,0.12)';
                        items[k].querySelector('.al-dot').style.borderColor = '#10B981';
                        var execBadge = items[k].querySelector('.al-exec');
                        if (execBadge) execBadge.remove();
                    }
                }
            }
            var doneSteps = document.getElementById('atom-done-steps');
            if (doneSteps) doneSteps.textContent = _execTotal + ' passos';
            setTimeout(function() { switchPanelState('done'); }, 1500);
        });

        // Carrega stats
        loadAtomStats();
    }

    // Alterna estados visuais do painel
    function switchPanelState(state) {
        var views = ['atom-idle', 'atom-recording', 'atom-recorded', 'atom-executing', 'atom-done'];
        for (var v = 0; v < views.length; v++) {
            var el = document.getElementById(views[v]);
            if (el) el.style.display = 'none';
        }
        var target = document.getElementById('atom-' + state);
        if (target) target.style.display = state === 'idle' ? 'flex' : 'block';

        var robot = document.getElementById('atom-robot');
        var statusText = document.getElementById('atom-status-text');
        var modeLabel = document.getElementById('atom-mode-label');
        var w = document.getElementById('atom-widget');

        if (state === 'idle') {
            if (robot) robot.innerHTML = atomRobotSVG('idle');
            if (statusText) statusText.textContent = 'PRONTO PARA APRENDER';
            if (modeLabel) { modeLabel.textContent = 'LEARN'; modeLabel.style.color = '#F59E0B'; }
            if (w) { w.style.borderColor = '#1C222F'; w.style.animation = 'none'; }
            loadAtomStats();
        } else if (state === 'recording') {
            if (robot) robot.innerHTML = atomRobotSVG('recording');
            if (statusText) statusText.textContent = 'OBSERVANDO SUAS AÇÕES...';
            if (modeLabel) { modeLabel.textContent = 'REC'; modeLabel.style.color = '#EF4444'; }
            if (w) { w.style.borderColor = 'rgba(239,68,68,0.2)'; w.style.animation = 'alBorderRec 2s ease-in-out infinite'; }
        } else if (state === 'recorded') {
            if (robot) robot.innerHTML = atomRobotSVG('idle');
            if (statusText) statusText.textContent = 'APRENDIZADO SALVO';
            if (modeLabel) { modeLabel.textContent = 'LEARN'; modeLabel.style.color = '#F59E0B'; }
            if (w) { w.style.borderColor = '#1C222F'; w.style.animation = 'none'; }
        } else if (state === 'executing') {
            if (robot) robot.innerHTML = atomRobotSVG('executing');
            if (statusText) statusText.textContent = 'EXECUTANDO WORKFLOW';
            if (modeLabel) { modeLabel.textContent = 'EXEC'; modeLabel.style.color = '#F59E0B'; }
            if (w) { w.style.animation = 'alBorderExec 2.5s ease-in-out infinite'; }
            var bar = document.getElementById('atom-exec-bar');
            if (bar) bar.style.width = '0%';
            var pct = document.getElementById('atom-exec-pct');
            if (pct) pct.textContent = '0%';
            var stepsEl = document.getElementById('atom-exec-steps');
            if (stepsEl) stepsEl.innerHTML = '';
        } else if (state === 'done') {
            if (robot) robot.innerHTML = atomRobotSVG('done');
            if (statusText) statusText.textContent = 'WORKFLOW CONCLUÍDO';
            if (modeLabel) { modeLabel.textContent = 'LEARN'; modeLabel.style.color = '#10B981'; }
            if (w) { w.style.borderColor = 'rgba(16,185,129,0.2)'; w.style.animation = 'none'; }
        }
        // Update footer
        var sd = document.getElementById('atom-status-dot');
        var sl = document.getElementById('atom-status-label');
        if (state === 'recording') {
            if (sd) { sd.style.background = '#EF4444'; sd.style.boxShadow = '0 0 6px rgba(239,68,68,0.4)'; }
            if (sl) { sl.textContent = 'GRAVANDO'; sl.style.color = '#EF4444'; }
        } else {
            if (sd) { sd.style.background = '#10B981'; sd.style.boxShadow = '0 0 6px rgba(16,185,129,0.4)'; }
            if (sl) { sl.textContent = 'ONLINE'; sl.style.color = '#10B981'; }
        }
    }

    // Carrega WORKFLOWS / PASSOS / HORAS do Firebase
    function loadAtomStats() {
        fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings.json?shallow=true').then(function(r) { return r.json(); }).then(function(keys) {
            if (!keys) return;
            var wfCount = Object.keys(keys).length;
            var wfEl = document.getElementById('atom-stat-wf');
            if (wfEl) wfEl.textContent = String(wfCount);
            // Estima passos e horas baseado nos workflows
            var totalSteps = 0;
            var promises = Object.keys(keys).map(function(id) {
                return fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + id + '/totalActions.json').then(function(r) { return r.json(); });
            });
            Promise.all(promises).then(function(counts) {
                for (var c = 0; c < counts.length; c++) totalSteps += (counts[c] || 0);
                var stepsEl = document.getElementById('atom-stat-steps');
                if (stepsEl) stepsEl.textContent = String(totalSteps);
                // Estima horas economizadas (cada workflow exec economiza ~5min)
                var hours = Math.max(1, Math.round(wfCount * 0.5));
                var hoursEl = document.getElementById('atom-stat-hours');
                if (hoursEl) hoursEl.textContent = hours + 'h';
            });
        }).catch(function() {});
    }

    // Atalho Ctrl+Shift+P pro play
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            showRecordingPicker();
        }
    });

    // Picker: mostra lista de gravações disponíveis
    async function showRecordingPicker() {
        try {
            var resp = await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings.json?shallow=true');
            var keys = await resp.json();
            if (!keys || Object.keys(keys).length === 0) {
                showAtomModal({ title: 'Sem gravações', message: 'Use REC para criar uma gravação.', confirmText: 'OK', showCancel: false });
                return;
            }

            var ids = Object.keys(keys).sort();
            var options = [];
            // Fetch labels em paralelo (muito mais rápido)
            var labelPromises = ids.map(function(id) {
                return fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + id + '/label.json')
                    .then(function(r) { return r.json(); })
                    .then(function(topLabel) {
                        if (topLabel) return { id: id, label: topLabel };
                        return fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + id + '/actions/1.json')
                            .then(function(r) { return r.json(); })
                            .then(function(a1) {
                                if (a1 && a1.label) return { id: id, label: a1.label };
                                return { id: id, label: id };
                            });
                    })
                    .catch(function() { return { id: id, label: id }; });
            });
            options = await Promise.all(labelPromises);

            // Mostra painel de gerenciamento
            var result = await showWorkflowManager(options);
            if (!result) return;
            var chosen = result;

            var dateRes = await showAtomModal({ title: 'Datas', message: 'Datas customizadas? Vazio = originais.', input: true, placeholder: 'dd/mm/yyyy, dd/mm/yyyy', confirmText: 'Continuar' });
            if (!dateRes) return;
            var params = {};
            if (dateRes.value && dateRes.value.trim()) { params.dates = dateRes.value.split(',').map(function(d) { return d.trim(); }); }

            var modeRes = await showAtomModal({ title: 'Executar', options: ['Executar Agora', 'Agendar Automático'] });
            if (!modeRes) return;

            if (modeRes.selected === 1) {
                var sr = await showAtomModal({ title: 'Agendar', message: '08:00 = diário\nseg 14:30 = semanal\n1 08:00 = mensal', input: true, placeholder: '08:00', confirmText: 'Agendar' });
                if (!sr || !sr.value) return;
                chrome.runtime.sendMessage({ action: 'schedule_workflow', data: { sessionId: chosen.id, label: chosen.label, schedule: sr.value.trim(), params: params, createdAt: Date.now(), active: true } }, function() {
                    showAtomModal({ title: 'Agendado!', message: chosen.label + ' — ' + sr.value.trim(), confirmText: 'OK', showCancel: false });
                });
                return;
            }

            chrome.runtime.sendMessage({ action: 'replay_workflow_proxy', sessionId: chosen.id, params: params });

        } catch(e) {
            console.error(TAG, 'Erro buscando gravações:', e);
            alert('Erro ao buscar gravações: ' + e.message);
        }
    }

    // ========================================================================
    // WORKFLOW MANAGER — Busca, Renomeia, Exclui
    // ========================================================================
    function showWorkflowManager(options) {
        return new Promise(function(resolve) {
            var old = document.getElementById('atom-modal-overlay'); if (old) old.remove();
            var ov = document.createElement('div'); ov.id = 'atom-modal-overlay';
            ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:Barlow Condensed,Arial,sans-serif;';
            var m = document.createElement('div');
            m.style.cssText = 'background:rgba(26,26,26,0.97);border:1px solid rgba(196,185,154,0.2);border-radius:16px;padding:24px 28px;width:420px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.6);color:#E8E4DA;';

            // Title
            var title = document.createElement('div');
            title.textContent = 'WORKFLOWS';
            title.style.cssText = 'font-size:15px;font-weight:700;color:#C4B99A;margin-bottom:14px;letter-spacing:0.08em;';
            m.appendChild(title);

            // Search
            var search = document.createElement('input'); search.type = 'text'; search.placeholder = 'Buscar workflow...';
            search.style.cssText = 'width:100%;padding:9px 14px;border-radius:8px;border:1px solid rgba(196,185,154,0.2);background:rgba(255,255,255,0.05);color:#E8E4DA;font-size:13px;font-family:Barlow Condensed,Arial,sans-serif;margin-bottom:12px;outline:none;box-sizing:border-box;';
            search.addEventListener('focus', function() { search.style.borderColor = '#F59E0B'; });
            search.addEventListener('blur', function() { search.style.borderColor = 'rgba(196,185,154,0.2)'; });
            m.appendChild(search);

            // List
            var list = document.createElement('div');
            list.style.cssText = 'max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;';

            function renderList(filter) {
                list.innerHTML = '';
                var f = (filter || '').toLowerCase();
                for (var i = 0; i < options.length; i++) {
                    if (f && options[i].label.toLowerCase().indexOf(f) < 0) continue;
                    (function(idx, opt) {
                        var row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.1);transition:all 0.15s;';
                        row.addEventListener('mouseenter', function() { row.style.background = 'rgba(245,158,11,0.14)'; row.style.borderColor = 'rgba(245,158,11,0.3)'; });
                        row.addEventListener('mouseleave', function() { row.style.background = 'rgba(245,158,11,0.06)'; row.style.borderColor = 'rgba(245,158,11,0.1)'; });

                        // Label (clickable)
                        var lbl = document.createElement('div');
                        lbl.textContent = opt.label;
                        lbl.style.cssText = 'flex:1;font-size:13px;font-weight:600;color:#E8E4DA;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                        lbl.addEventListener('click', function() { ov.remove(); resolve(opt); });
                        row.appendChild(lbl);

                        // Rename btn
                        var ren = document.createElement('div'); ren.textContent = '✏️';
                        ren.style.cssText = 'cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;transition:all 0.15s;opacity:0.5;';
                        ren.addEventListener('mouseenter', function() { ren.style.opacity = '1'; });
                        ren.addEventListener('mouseleave', function() { ren.style.opacity = '0.5'; });
                        ren.addEventListener('click', async function(e) {
                            e.stopPropagation();
                            var res = await showAtomModal({ title: 'Renomear', input: true, defaultValue: opt.label, placeholder: 'Novo nome', confirmText: 'Salvar' });
                            if (!res || !res.value) return;
                            // Salva no Firebase
                            await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + opt.id + '/label.json', {
                                method: 'PUT', body: JSON.stringify(res.value)
                            });
                            opt.label = res.value;
                            lbl.textContent = res.value;
                            // Reabre o manager
                        });
                        row.appendChild(ren);

                        // Delete btn
                        var del = document.createElement('div'); del.textContent = '🗑️';
                        del.style.cssText = 'cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;transition:all 0.15s;opacity:0.5;';
                        del.addEventListener('mouseenter', function() { del.style.opacity = '1'; });
                        del.addEventListener('mouseleave', function() { del.style.opacity = '0.5'; });
                        del.addEventListener('click', async function(e) {
                            e.stopPropagation();
                            var conf = await showAtomModal({ title: 'Excluir', message: 'Tem certeza que quer excluir "' + opt.label + '"?', confirmText: 'Excluir' });
                            if (!conf) { showWorkflowManager(options).then(resolve); return; }
                            await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + opt.id + '.json', { method: 'DELETE' });
                            options.splice(idx, 1);
                            ov.remove();
                            if (options.length === 0) { resolve(null); return; }
                            showWorkflowManager(options).then(resolve);
                        });
                        row.appendChild(del);

                        list.appendChild(row);
                    })(i, options[i]);
                }
                if (list.children.length === 0) {
                    var empty = document.createElement('div');
                    empty.textContent = 'Nenhum workflow encontrado.';
                    empty.style.cssText = 'text-align:center;color:#8A8980;font-size:13px;padding:20px;';
                    list.appendChild(empty);
                }
            }

            search.addEventListener('input', function() { renderList(search.value); });
            renderList('');
            m.appendChild(list);

            // Close btn
            var close = document.createElement('div'); close.textContent = 'Fechar';
            close.style.cssText = 'text-align:center;margin-top:14px;padding:8px;cursor:pointer;font-size:11px;font-weight:700;color:#8A8980;letter-spacing:0.05em;text-transform:uppercase;border-radius:8px;transition:all 0.15s;';
            close.addEventListener('mouseenter', function() { close.style.color = '#E8E4DA'; });
            close.addEventListener('mouseleave', function() { close.style.color = '#8A8980'; });
            close.addEventListener('click', function() { ov.remove(); resolve(null); });
            m.appendChild(close);

            ov.addEventListener('click', function(e) { if (e.target === ov) { ov.remove(); resolve(null); } });
            ov.appendChild(m); document.body.appendChild(ov);
            setTimeout(function() { search.focus(); }, 100);
        });
    }

    function updateRecButton() {
        var w = document.getElementById('atom-widget');
        if (!w) return;

        if (recording) {
            switchPanelState('recording');
            // Start timer
            _atomRecElapsed = 0;
            clearInterval(_atomRecTimer);
            _atomRecTimer = setInterval(function() {
                _atomRecElapsed++;
                var m = Math.floor(_atomRecElapsed / 60);
                var s = _atomRecElapsed % 60;
                var td = document.getElementById('atom-timer');
                if (td) td.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
            }, 1000);
        } else {
            clearInterval(_atomRecTimer);
            // Popula dados do "Aprendizado Completo"
            var recCount = document.getElementById('atom-rec-count');
            if (recCount) recCount.textContent = actions.length + ' ações';
            var recTime = document.getElementById('atom-rec-time');
            var m2 = Math.floor(_atomRecElapsed / 60);
            var s2 = _atomRecElapsed % 60;
            if (recTime) recTime.textContent = String(m2).padStart(2,'0') + ':' + String(s2).padStart(2,'0');
            // Mostra "Aprendizado Completo" se teve ações, senão volta pro idle
            if (actions.length > 0) {
                switchPanelState('recorded');
            } else {
                switchPanelState('idle');
            }
            // Clear steps UI
            var stepsDiv = document.getElementById('atom-rec-steps');
            if (stepsDiv) stepsDiv.innerHTML = '';
            var sc = document.getElementById('atom-step-count');
            if (sc) sc.textContent = '0';
        }
    }

    function toggleRecording() {
        if (recording) {
            stopRecording();
        } else {
            showAtomModal({ title: 'Nova Gravação', message: 'Dê um nome para identificar este workflow.', input: true, placeholder: 'Ex: Relatório Financeiro', confirmText: 'Gravar' }).then(function(result) {
                if (!result) return;
                startRecording(result.value || 'Gravação sem nome');
            });
        }
    }

    // ATOM Modal — substitui prompt/alert nativos
    function showAtomModal(config) {
        return new Promise(function(resolve) {
            var old = document.getElementById('atom-modal-overlay'); if (old) old.remove();
            var ov = document.createElement('div'); ov.id = 'atom-modal-overlay';
            ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:Barlow Condensed,Arial,sans-serif;';
            var m = document.createElement('div');
            m.style.cssText = 'background:rgba(26,26,26,0.97);border:1px solid rgba(196,185,154,0.2);border-radius:16px;padding:24px 28px;min-width:300px;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.6);color:#E8E4DA;';
            if (config.title) { var t = document.createElement('div'); t.textContent = config.title; t.style.cssText = 'font-size:15px;font-weight:700;color:#C4B99A;margin-bottom:12px;letter-spacing:0.05em;text-transform:uppercase;'; m.appendChild(t); }
            if (config.message) { var mg = document.createElement('div'); mg.textContent = config.message; mg.style.cssText = 'font-size:13px;color:#8A8980;margin-bottom:14px;line-height:1.5;white-space:pre-line;'; m.appendChild(mg); }
            if (config.options) {
                var list = document.createElement('div'); list.style.cssText = 'max-height:240px;overflow-y:auto;margin-bottom:14px;display:flex;flex-direction:column;gap:4px;';
                for (var i = 0; i < config.options.length; i++) { (function(idx, label) {
                    var it = document.createElement('div'); it.textContent = typeof label === 'string' ? label : label.label;
                    it.style.cssText = 'padding:10px 14px;border-radius:8px;cursor:pointer;font-size:13px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.12);color:#E8E4DA;transition:all 0.15s;font-weight:600;';
                    it.addEventListener('mouseenter', function() { it.style.background = 'rgba(245,158,11,0.2)'; it.style.borderColor = '#F59E0B'; });
                    it.addEventListener('mouseleave', function() { it.style.background = 'rgba(245,158,11,0.08)'; it.style.borderColor = 'rgba(245,158,11,0.12)'; });
                    it.addEventListener('click', function() { ov.remove(); resolve({ selected: idx, value: label }); });
                    list.appendChild(it);
                })(i, config.options[i]); }
                m.appendChild(list);
            }
            if (config.input) {
                var inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = config.placeholder || ''; inp.value = config.defaultValue || '';
                inp.style.cssText = 'width:100%;padding:10px 14px;border-radius:8px;border:1px solid rgba(196,185,154,0.3);background:rgba(255,255,255,0.05);color:#E8E4DA;font-size:14px;font-family:Barlow Condensed,Arial,sans-serif;margin-bottom:14px;outline:none;box-sizing:border-box;';
                inp.addEventListener('focus', function() { inp.style.borderColor = '#F59E0B'; });
                inp.addEventListener('blur', function() { inp.style.borderColor = 'rgba(196,185,154,0.3)'; });
                inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { ov.remove(); resolve({ value: inp.value }); } if (e.key === 'Escape') { ov.remove(); resolve(null); } });
                m.appendChild(inp); setTimeout(function() { inp.focus(); }, 100);
            }
            var br = document.createElement('div'); br.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            if (config.showCancel !== false && !config.options) {
                var cb = document.createElement('div'); cb.textContent = 'Cancelar';
                cb.style.cssText = 'padding:8px 18px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;color:#8A8980;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);letter-spacing:0.05em;text-transform:uppercase;transition:all 0.15s;';
                cb.addEventListener('click', function() { ov.remove(); resolve(null); }); br.appendChild(cb);
            }
            if (config.confirmText) {
                var ok = document.createElement('div'); ok.textContent = config.confirmText;
                ok.style.cssText = 'padding:8px 18px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;color:#1a1a1a;background:#F59E0B;border:1px solid #F59E0B;letter-spacing:0.05em;text-transform:uppercase;transition:all 0.15s;';
                ok.addEventListener('mouseenter', function() { ok.style.background = '#d4880a'; });
                ok.addEventListener('mouseleave', function() { ok.style.background = '#F59E0B'; });
                ok.addEventListener('click', function() { var v = inp ? inp.value : true; ov.remove(); resolve({ value: v }); }); br.appendChild(ok);
            }
            if (!config.options || config.confirmText) m.appendChild(br);
            ov.addEventListener('click', function(e) { if (e.target === ov) { ov.remove(); resolve(null); } });
            ov.appendChild(m); document.body.appendChild(ov);
        });
    }

    // MASTER ONLY — Widget + atalhos só aparecem pro perfil master
    function initIfMaster() {
        chrome.storage.local.get('userProfile', function(data) {
            if (data.userProfile !== 'master') return;
            if (document.body) {
                createRecButton();
            } else {
                document.addEventListener('DOMContentLoaded', createRecButton);
            }
            // Atalho Ctrl+Shift+R
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.shiftKey && e.key === 'R') { e.preventDefault(); toggleRecording(); }
            });
        });
    }
    initIfMaster();

    // ========================================================================
    // CONTROLE — Start/Stop via mensagem do background/popup
    // ========================================================================
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg.action === 'start_recording') {
            startRecording(msg.label || 'Gravação sem nome');
            sendResponse({ success: true, sessionId: sessionId });
        }
        if (msg.action === 'stop_recording') {
            var result = stopRecording();
            sendResponse({ success: true, result: result });
        }
        if (msg.action === 'recording_status') {
            sendResponse({ recording: recording, sessionId: sessionId, actionCount: actions.length });
        }
    });

    // ========================================================================
    // START — Começa a gravar
    // ========================================================================
    function startRecording(label) {
        if (recording) {
            console.log(TAG, 'Já gravando! Session:', sessionId);
            return;
        }

        sessionId = 'rec_' + Date.now();
        actions = [];
        recording = true;
        currentLabel = label;

        // Grava contexto inicial (tela atual)
        recordPageContext();

        // Instala listeners
        document.addEventListener('click', onUserClick, true);
        document.addEventListener('change', onUserChange, true);
        document.addEventListener('input', onUserInput, true);
        window.addEventListener('hashchange', onHashChange);

        // MutationObserver pra detectar mudanças de seção no SPA
        startSPAObserver();

        console.log(TAG, '🔴 GRAVAÇÃO INICIADA:', label, '| Session:', sessionId);

        // Salva metadata
        actions.push({
            type: 'session_start',
            label: label,
            url: window.location.href,
            timestamp: Date.now(),
            pageTitle: document.title
        });

        // Indicador visual
        showRecordingIndicator(true);
        updateRecButton();
    }

    // ========================================================================
    // STOP — Para a gravação e salva
    // ========================================================================
    function stopRecording() {
        if (!recording) return null;

        recording = false;

        // Remove listeners
        document.removeEventListener('click', onUserClick, true);
        document.removeEventListener('change', onUserChange, true);
        document.removeEventListener('input', onUserInput, true);
        window.removeEventListener('hashchange', onHashChange);
        stopSPAObserver();

        actions.push({
            type: 'session_end',
            url: window.location.href,
            timestamp: Date.now(),
            totalActions: actions.length
        });

        showRecordingIndicator(false);
        updateRecButton();

        console.log(TAG, '⏹️ GRAVAÇÃO FINALIZADA:', actions.length, 'ações');
        console.log(TAG, 'Resumo:');
        console.table(actions.map(function(a) {
            return { tipo: a.type, seletor: (a.selector || '').substring(0, 40), valor: (a.value || '').substring(0, 30), label: (a.label || '').substring(0, 30) };
        }));

        var result = {
            sessionId: sessionId,
            label: currentLabel,
            actions: actions,
            totalActions: actions.length,
            duration: actions.length > 1 ? actions[actions.length - 1].timestamp - actions[0].timestamp : 0
        };

        // Envia pro background → Firebase
        chrome.runtime.sendMessage({
            action: 'saveRecording',
            data: result
        });

        return result;
    }

    // ========================================================================
    // CLICK HANDLER — Captura clicks do usuário
    // ========================================================================
    function onUserClick(e) {
        if (!recording) return;
        var el = e.target;

        // FILTRO 1: Ignora clicks nos nossos próprios botões
        if (el.closest('#atom-rec-button') || el.closest('#atom-play-button') || el.closest('#atom-replay-indicator')) {
            return;
        }

        // Sobe na árvore até achar algo clicável
        var clickable = findClickable(el);
        if (!clickable) return;

        // FILTRO 2: Ignora clicks em elementos sem significado (nth-child genéricos sem texto)
        var text = getVisibleText(clickable);
        var id = clickable.id || '';
        var selector = buildSelector(clickable);

        // Se seletor é nth-child puro e não tem texto nem ID, pega texto do pai
        if (selector.indexOf(':nth-child') >= 0 && !text && !id) {
            var parent = clickable.parentElement;
            while (parent && parent !== document.body) {
                var parentText = (parent.textContent || '').trim();
                if (parentText.length > 0 && parentText.length < 80) {
                    text = parentText;
                    break;
                }
                parent = parent.parentElement;
            }
            // Se mesmo o pai não tem texto útil, ignora (provavelmente lixo)
            if (!text) {
                console.log(TAG, '🗑️ Click ignorado (sem texto/ID, seletor genérico):', selector);
                return;
            }
        }

        var info = {
            type: 'click',
            timestamp: Date.now(),
            selector: selector,
            tagName: clickable.tagName.toLowerCase(),
            text: text,
            label: getLabel(clickable),
            classes: (clickable.className || '').substring(0, 100),
            id: id,
            url: window.location.href,
            section: getCurrentSection()
        };

        // Se é um accordion/tab, marca como navegação
        if (clickable.closest('.ui-accordion-header') || clickable.closest('[role="tab"]')) {
            info.type = 'navigate_section';
            info.sectionName = text;
        }

        // Se é link do menu (MAS NÃO se é INPUT/SELECT — esses ficam como click)
        var tag = clickable.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
            if (clickable.closest('.ui-menu, .nav, [class*="menu"]')) {
                info.type = 'navigate_menu';
            }
        }

        // PrimeNG tree items — marcamos como navigate_section
        if (clickable.closest('.ui-treenode, .p-treenode, [role="treeitem"]')) {
            info.type = 'navigate_section';
            info.sectionName = text;
        }

        actions.push(info);
        updateRecButton();
        console.log(TAG, '🖱️', info.type, '|', info.text || info.selector);

        // Re-escaneia após navegação (com delay pra SPA renderizar)
        if (info.type === 'navigate_section' || info.type === 'navigate_menu') {
            setTimeout(recordPageContext, 1500);
        }
    }

    // ========================================================================
    // INPUT/CHANGE HANDLERS — Captura digitação e seleção
    // ========================================================================
    var inputDebounce = {};
    var lastInputElement = null; // Referência ao último elemento que recebeu input

    function onUserInput(e) {
        if (!recording) return;
        var el = e.target;
        if (isBlacklisted(el)) return;
        if (el.closest('#atom-rec-button, #atom-play-button, #atom-replay-indicator')) return;

        // Key única: selector + posição entre irmãos com mesmo selector
        var sel = buildSelector(el);
        var nthIdx = getNthIndex(el, sel);
        var key = sel + '::' + nthIdx;

        clearTimeout(inputDebounce[key]);
        inputDebounce[key] = setTimeout(function() {
            recordInput(el, 'input');
        }, 300);
    }

    // Retorna o índice do elemento entre todos que matcham o mesmo selector
    function getNthIndex(el, selector) {
        try {
            var all = document.querySelectorAll(selector);
            for (var i = 0; i < all.length; i++) {
                if (all[i] === el) return i;
            }
        } catch(e) {}
        return 0;
    }

    function onUserChange(e) {
        if (!recording) return;
        var el = e.target;
        if (isBlacklisted(el)) return;
        recordInput(el, 'change');
    }

    function recordInput(el, eventType) {
        var value = el.value || '';
        if (value.length > 200) value = value.substring(0, 200) + '...';

        var sel = buildSelector(el);
        var nthIdx = getNthIndex(el, sel);

        var info = {
            type: el.tagName === 'SELECT' ? 'select' : 'type',
            timestamp: Date.now(),
            selector: sel,
            nthIndex: nthIdx, // Posição entre elementos com mesmo selector
            value: value,
            label: getLabel(el),
            fieldName: el.getAttribute('name') || el.getAttribute('formcontrolname') || el.id || '',
            tagName: el.tagName.toLowerCase(),
            inputType: el.type || '',
            url: window.location.href,
            section: getCurrentSection()
        };

        // Dedup: só atualiza se é EXATAMENTE o mesmo elemento (mesmo selector + mesma posição)
        var lastAction = actions[actions.length - 1];
        if (lastAction && lastAction.selector === info.selector && 
            lastAction.type === info.type && lastAction.nthIndex === info.nthIndex) {
            lastAction.value = info.value;
            lastAction.timestamp = info.timestamp;
            return;
        }

        // Se é um elemento DIFERENTE com o mesmo selector (ex: 2 campos de data),
        // garante que houve um click entre eles (caso contrário, é input consecutivo em campos irmãos)
        lastInputElement = el;

        actions.push(info);
        updateRecButton();
        console.log(TAG, '⌨️', info.type, '| nth:', nthIdx, '|', info.label || info.fieldName, '=', value.substring(0, 30));
    }

    // ========================================================================
    // SPA NAVIGATION — Detecta mudanças de hash/seção
    // ========================================================================
    function onHashChange() {
        if (!recording) return;

        actions.push({
            type: 'navigate',
            timestamp: Date.now(),
            from: lastHash,
            to: window.location.hash,
            url: window.location.href
        });

        lastHash = window.location.hash;
        console.log(TAG, '🔀 Navegação:', window.location.hash);

        // Re-escaneia nova página (SPA)
        setTimeout(recordPageContext, 2000);
    }

    var spaObserver = null;

    function startSPAObserver() {
        // Observa mudanças grandes no DOM (indicam mudança de tela no Angular)
        spaObserver = new MutationObserver(function(mutations) {
            var bigChange = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 5 || mutations[i].removedNodes.length > 5) {
                    bigChange = true;
                    break;
                }
            }
            if (bigChange && recording) {
                // Debounce: espera SPA terminar de renderizar
                clearTimeout(spaObserver._debounce);
                spaObserver._debounce = setTimeout(function() {
                    var newHash = window.location.hash;
                    if (newHash !== lastHash) {
                        onHashChange();
                    }
                }, 1000);
            }
        });

        spaObserver.observe(document.body, { childList: true, subtree: true });
    }

    function stopSPAObserver() {
        if (spaObserver) {
            spaObserver.disconnect();
            spaObserver = null;
        }
    }

    // ========================================================================
    // PAGE CONTEXT — Escaneia a tela atual e salva como contexto
    // ========================================================================
    function recordPageContext() {
        if (!recording) return;

        var context = {
            type: 'page_context',
            timestamp: Date.now(),
            url: window.location.href,
            section: getCurrentSection(),
            title: document.title,
            visibleFields: [],
            visibleButtons: []
        };

        // Campos visíveis
        var inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
        for (var i = 0; i < inputs.length && context.visibleFields.length < 30; i++) {
            var el = inputs[i];
            if (!el.offsetParent && el.type !== 'checkbox') continue;
            context.visibleFields.push({
                selector: buildSelector(el),
                label: getLabel(el),
                type: el.type || el.tagName.toLowerCase(),
                value: (el.value || '').substring(0, 50)
            });
        }

        // Botões visíveis
        var buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
        for (var b = 0; b < buttons.length && context.visibleButtons.length < 15; b++) {
            var btn = buttons[b];
            if (!btn.offsetParent) continue;
            var text = (btn.textContent || '').trim();
            if (!text || text.length > 50) continue;
            context.visibleButtons.push({
                selector: buildSelector(btn),
                text: text
            });
        }

        actions.push(context);
        console.log(TAG, '📸 Contexto:', context.section, '|', context.visibleFields.length, 'campos |', context.visibleButtons.length, 'botões');

        // Dispara Radar (site-scanner) pra capturar estrutura completa da página
        triggerRadarScan();
    }

    function triggerRadarScan() {
        // Envia mensagem pro site-scanner.js que roda na mesma página
        // O scanner já salva no Firebase via background, mas aqui pegamos inline também
        try {
            if (typeof window.__atomSiteScan === 'function') {
                // Se o scanner expôs a função global
                var scanResult = window.__atomSiteScan();
                if (scanResult) {
                    actions.push({
                        type: 'radar_scan',
                        timestamp: Date.now(),
                        url: window.location.href,
                        inputCount: (scanResult.inputs || []).length,
                        buttonCount: (scanResult.buttons || []).length,
                        tableCount: (scanResult.tables || []).length,
                        formCount: (scanResult.forms || []).length,
                        techStack: scanResult.techStack || '',
                        scan: scanResult
                    });
                    console.log(TAG, '🔭 Radar integrado:', (scanResult.inputs || []).length, 'inputs,', (scanResult.buttons || []).length, 'botões');
                }
            } else {
                // Fallback: dispara scan via chrome.runtime
                chrome.runtime.sendMessage({ action: 'scan_page' }, function() {
                    console.log(TAG, '🔭 Radar disparado via background');
                });
            }
        } catch(e) {
            console.log(TAG, 'Radar scan skip:', e.message);
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    function buildSelector(el) {
        if (el.id) return '#' + el.id;
        var fcn = el.getAttribute('formcontrolname');
        if (fcn) return '[formcontrolname="' + fcn + '"]';
        if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
        var dataCy = el.getAttribute('data-cy');
        if (dataCy) return '[data-cy="' + dataCy + '"]';
        // ARIA label
        var ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return el.tagName.toLowerCase() + '[aria-label="' + ariaLabel + '"]';
        // Class-based
        var unique = Array.from(el.classList || []).filter(function(c) {
            return c.length > 2 && !c.startsWith('ng-') && !c.startsWith('ui-state');
        }).slice(0, 3);
        if (unique.length > 0) return el.tagName.toLowerCase() + '.' + unique.join('.');
        // nth-child COM CONTEXTO DO PAI (evita span:nth-child(2) genérico)
        var parent = el.parentElement;
        if (parent) {
            var idx = Array.from(parent.children).indexOf(el);
            var parentSel = '';
            // Tenta ID do pai
            if (parent.id) {
                parentSel = '#' + parent.id;
            } else {
                // Tenta classe do pai
                var parentCls = Array.from(parent.classList || []).filter(function(c) {
                    return c.length > 2 && !c.startsWith('ng-') && !c.startsWith('ui-state');
                }).slice(0, 2);
                if (parentCls.length > 0) {
                    parentSel = parent.tagName.toLowerCase() + '.' + parentCls.join('.');
                } else if (parent.parentElement) {
                    // Tenta avô com ID
                    if (parent.parentElement.id) {
                        parentSel = '#' + parent.parentElement.id + ' > ' + parent.tagName.toLowerCase();
                    }
                }
            }
            if (parentSel) {
                return parentSel + ' > ' + el.tagName.toLowerCase() + ':nth-child(' + (idx + 1) + ')';
            }
            return el.tagName.toLowerCase() + ':nth-child(' + (idx + 1) + ')';
        }
        return el.tagName.toLowerCase();
    }

    function getLabel(el) {
        if (el.id) {
            var lbl = document.querySelector('label[for="' + el.id + '"]');
            if (lbl) return lbl.textContent.trim().substring(0, 50);
        }
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').substring(0, 50);
        if (el.title) return el.title.substring(0, 50);
        if (el.placeholder) return el.placeholder.substring(0, 50);
        // TD anterior (Skychart pattern)
        var td = el.closest('td');
        if (td && td.previousElementSibling) {
            var prev = td.previousElementSibling.textContent.trim();
            if (prev.length < 50) return prev;
        }
        return '';
    }

    function getVisibleText(el) {
        return (el.textContent || el.value || '').trim().substring(0, 80);
    }

    function findClickable(el) {
        var maxDepth = 8;
        var current = el;
        while (current && current !== document.body && maxDepth-- > 0) {
            var tag = current.tagName;
            // Standard interactive elements
            if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT') return current;

            // Role-based (PrimeNG, Angular Material, etc)
            var role = current.getAttribute('role') || '';
            if (role === 'button' || role === 'tab' || role === 'menuitem' || 
                role === 'option' || role === 'treeitem' || role === 'listitem' ||
                role === 'row' || role === 'link' || role === 'checkbox' ||
                role === 'radio' || role === 'switch') return current;

            // PrimeNG / Angular specific classes
            var cls = current.className || '';
            if (cls.indexOf('ui-accordion-header') >= 0 ||
                cls.indexOf('ui-treenode') >= 0 ||
                cls.indexOf('ui-listbox-item') >= 0 ||
                cls.indexOf('ui-dropdown-item') >= 0 ||
                cls.indexOf('ui-menuitem') >= 0 ||
                cls.indexOf('ui-selectbutton') >= 0 ||
                cls.indexOf('ui-tabview-nav') >= 0 ||
                cls.indexOf('ui-tree-toggler') >= 0 ||
                cls.indexOf('p-treenode') >= 0 ||
                cls.indexOf('p-listbox-item') >= 0 ||
                cls.indexOf('p-menuitem') >= 0 ||
                cls.indexOf('p-dropdown-item') >= 0) return current;

            // List items com texto (menus, dropdowns, sidebars)
            if (tag === 'LI' && (current.textContent || '').trim().length > 0 && 
                (current.textContent || '').trim().length < 100) return current;

            // Angular event binding
            if (current.getAttribute('(click)') || current.getAttribute('ng-click') || 
                current.onclick) return current;

            // Cursor pointer = provavelmente clicável
            try {
                var style = window.getComputedStyle(current);
                if (style.cursor === 'pointer') return current;
            } catch(e) {}

            current = current.parentElement;
        }
        // Fallback: retorna o elemento original se tem texto curto (provavelmente um label/item clicável)
        var text = (el.textContent || '').trim();
        if (text.length > 0 && text.length < 100) return el;
        return null;
    }

    function isBlacklisted(el) {
        var type = (el.type || '').toLowerCase();
        var name = (el.name || el.id || '').toLowerCase();
        for (var i = 0; i < BLACKLIST_TYPES.length; i++) {
            if (type.indexOf(BLACKLIST_TYPES[i]) >= 0 || name.indexOf(BLACKLIST_TYPES[i]) >= 0) return true;
        }
        return false;
    }

    function getCurrentSection() {
        var open = document.querySelector('.ui-accordion-content-wrapper[style*="block"]');
        if (open && open.previousElementSibling) {
            return open.previousElementSibling.textContent.trim().substring(0, 80);
        }
        var title = document.querySelector('.ui-panel-title, h1, h2');
        return title ? title.textContent.trim().substring(0, 80) : window.location.hash;
    }

    // ========================================================================
    // VISUAL INDICATOR — Mostra que está gravando
    // ========================================================================
    function showRecordingIndicator(show) {
        // Estado agora é mostrado no painel ATOM Learn
        if (show) {
            // Atualiza step count
            var sc = document.getElementById('atom-step-count');
            if (sc) sc.textContent = String(actions.length);
            // Adiciona a última ação como card
            if (actions.length > 0) {
                var last = actions[actions.length - 1];
                var stepsDiv = document.getElementById('atom-rec-steps');
                if (stepsDiv && last.type !== 'session_start' && last.type !== 'page_context') {
                    var card = document.createElement('div');
                    card.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(245,158,11,0.06);border-radius:6px;border:1px solid rgba(245,158,11,0.18);animation:alSlideUp 0.3s ease;';
                    var num = document.createElement('div');
                    num.textContent = String(actions.length).padStart(2,'0');
                    num.style.cssText = 'width:20px;height:20px;border-radius:4px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);display:flex;align-items:center;justify-content:center;font-family:Oswald,sans-serif;font-size:9px;font-weight:600;color:#F59E0B;flex-shrink:0;text-align:center;line-height:20px;';
                    var info = document.createElement('div');
                    info.style.cssText = 'flex:1;min-width:0;overflow:hidden;';
                    var act = document.createElement('div');
                    act.textContent = last.label || last.type || 'click';
                    act.style.cssText = 'font-size:10px;font-family:DM Sans,sans-serif;font-weight:600;color:#DEE2EA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    var tgt = document.createElement('div');
                    tgt.textContent = (last.selector || last.value || '').substring(0, 40);
                    tgt.style.cssText = 'font-size:8px;font-family:DM Sans,sans-serif;color:#4E586C;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    info.appendChild(act); info.appendChild(tgt);
                    var dot = document.createElement('div');
                    dot.style.cssText = 'width:5px;height:5px;border-radius:50%;background:#F59E0B;box-shadow:0 0 8px rgba(245,158,11,0.4);flex-shrink:0;animation:alDotPulse 1s ease-out forwards;';
                    card.appendChild(num); card.appendChild(info); card.appendChild(dot);
                    stepsDiv.appendChild(card);
                    stepsDiv.scrollTop = stepsDiv.scrollHeight;
                }
            }
        }
    }

})();

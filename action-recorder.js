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
    // ATOM BRANDED WIDGET — Badge flutuante com identidade visual
    // ========================================================================
    function createRecButton() {
        if (!document.querySelector('link[href*="Barlow"]')) {
            var font = document.createElement('link'); font.rel = 'stylesheet';
            font.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap';
            document.head.appendChild(font);
        }
        var widget = document.createElement('div');
        widget.id = 'atom-widget';
        widget.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;padding:2px 6px;">' +
                '<img src="' + chrome.runtime.getURL('atom-logo-dark-transparent-128.png') + '" style="width:28px;height:28px;">' +
                '<span style="font-size:13px;font-weight:700;letter-spacing:0.1em;color:#C4B99A;">ATOM</span>' +
            '</div>' +
            '<div style="display:flex;gap:8px;width:100%;">' +
                '<div id="atom-rec-button" style="flex:1;text-align:center;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s;background:rgba(255,68,68,0.12);color:#ff4444;border:1px solid rgba(255,68,68,0.25);">REC</div>' +
                '<div id="atom-play-button" style="flex:1;text-align:center;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s;background:rgba(245,158,11,0.12);color:#F59E0B;border:1px solid rgba(245,158,11,0.25);">PLAY</div>' +
            '</div>';
        widget.style.cssText = 'position:fixed;bottom:20px;right:16px;z-index:999999;background:rgba(26,26,26,0.92);backdrop-filter:blur(12px);border:1px solid rgba(196,185,154,0.15);border-radius:16px;padding:12px 14px;font-family:Barlow Condensed,Arial,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);user-select:none;display:flex;flex-direction:column;gap:8px;align-items:center;transition:all 0.3s ease;';
        widget.addEventListener('mouseenter', function() { widget.style.transform = 'translateY(-2px)'; });
        widget.addEventListener('mouseleave', function() { widget.style.transform = 'translateY(0)'; });
        document.body.appendChild(widget);
        document.getElementById('atom-rec-button').addEventListener('click', function() { toggleRecording(); });
        document.getElementById('atom-play-button').addEventListener('click', function() { showRecordingPicker(); });
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
            for (var i = 0; i < ids.length; i++) {
                try {
                    var label = null;
                    var rTop = await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + ids[i] + '/label.json');
                    var topLabel = await rTop.json();
                    if (topLabel) label = topLabel;
                    if (!label) {
                        var r1 = await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + ids[i] + '/actions/1.json');
                        var a1 = await r1.json();
                        if (a1 && a1.label) label = a1.label;
                    }
                    if (!label) {
                        var r0 = await fetch('https://mond-atom-default-rtdb.firebaseio.com/atom_recordings/' + ids[i] + '/actions/0.json');
                        var a0 = await r0.json();
                        if (a0 && a0.label) label = a0.label;
                    }
                    options.push({ id: ids[i], label: label || ids[i] });
                } catch(e) { options.push({ id: ids[i], label: ids[i] }); }
            }

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
        var btn = document.getElementById('atom-rec-button');
        if (!btn) return;
        if (recording) {
            btn.textContent = 'PARAR';
            btn.style.background = 'rgba(255,68,68,0.4)';
            btn.style.color = '#fff';
            btn.style.border = '1px solid rgba(255,68,68,0.6)';
        } else {
            btn.textContent = 'REC';
            btn.style.background = 'rgba(255,68,68,0.12)';
            btn.style.color = '#ff4444';
            btn.style.border = '1px solid rgba(255,68,68,0.25)';
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
        var existing = document.getElementById('atom-recording-indicator');
        if (existing) existing.remove();

        if (!show) return;

        var indicator = document.createElement('div');
        indicator.id = 'atom-recording-indicator';
        indicator.innerHTML = '🔴 ATOM Gravando...';
        indicator.style.cssText = 'position:fixed;top:8px;right:8px;z-index:999999;background:rgba(220,20,20,0.95);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:bold;font-family:Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;animation:pulse 1.5s infinite;';

        // CSS animation
        var style = document.createElement('style');
        style.textContent = '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }';
        indicator.appendChild(style);

        // Click pra parar
        indicator.addEventListener('click', function() {
            stopRecording();
        });

        document.body.appendChild(indicator);
    }

})();

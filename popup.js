var PROFILES = {
  master: ['cambio','serasa','frete','tracking','cotacao','chequeio-op','chequeio-fin','frequencia','booking','demurrage'],
  financeiro: ['cambio','serasa','chequeio-fin'],
  operacional: ['tracking','frete','chequeio-op','booking'],
  comercial: ['cotacao','frete','frequencia'],
  demurrage: ['demurrage','tracking','frete']
};
var LABELS = { master:'Master', financeiro:'Financeiro', operacional:'Operacional', comercial:'Comercial', demurrage:'Demurrage', custom:'Personalizado' };
var ADMIN_PWD = 'realsteel';

// Load from chrome.storage FIRST (most reliable)
chrome.storage.local.get(['enabledAgents','userProfile','pricingEmail'], function(d) {
  document.getElementById('pricing-email').value = d.pricingEmail || 'paulo.zanella@mondshipping.com.br';

  if (d.userProfile && d.enabledAgents) {
    applyPermissions(d.enabledAgents, d.userProfile);
  } else if (typeof ATOM_PROFILE !== 'undefined' && ATOM_PROFILE.trim() !== 'master') {
    var p = ATOM_PROFILE.trim();
    var agents = PROFILES[p] || PROFILES.master;
    chrome.storage.local.set({ userProfile: p, enabledAgents: agents });
    applyPermissions(agents, p);
  } else {
    showProfileSelector();
  }
});

function showProfileSelector() {
  var overlay = document.createElement('div');
  overlay.id = 'profile-selector-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,sans-serif;color:#fff;';
  overlay.innerHTML = '<div style="text-align:center;max-width:280px;">' +
    '<h2 style="margin:0 0 8px;font-size:18px;">Bem-vindo ao Atom</h2>' +
    '<p style="color:#999;font-size:12px;margin:0 0 20px;">Selecione seu departamento:</p>' +
    '<button class="prof-btn" data-p="financeiro" style="width:100%;padding:12px;margin:6px 0;border:none;border-radius:8px;background:#1a3a5c;color:#fff;font-size:14px;cursor:pointer;">Financeiro</button>' +
    '<button class="prof-btn" data-p="operacional" style="width:100%;padding:12px;margin:6px 0;border:none;border-radius:8px;background:#1a3a5c;color:#fff;font-size:14px;cursor:pointer;">Operacional</button>' +
    '<button class="prof-btn" data-p="comercial" style="width:100%;padding:12px;margin:6px 0;border:none;border-radius:8px;background:#1a3a5c;color:#fff;font-size:14px;cursor:pointer;">Comercial</button>' +
    '<button class="prof-btn" data-p="demurrage" style="width:100%;padding:12px;margin:6px 0;border:none;border-radius:8px;background:#5c1a1a;color:#fff;font-size:14px;cursor:pointer;">Demurrage</button>' +
    '<button class="prof-btn" data-p="master" style="width:100%;padding:12px;margin:6px 0;border:none;border-radius:8px;background:#2d5a1e;color:#fff;font-size:14px;cursor:pointer;">Master - Todos</button>' +
    '</div>';
  document.body.appendChild(overlay);
  var btns = overlay.querySelectorAll('.prof-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function() {
      var prof = this.getAttribute('data-p');
      var agents = PROFILES[prof];
      chrome.storage.local.set({ userProfile: prof, enabledAgents: agents });
      overlay.remove();
      applyPermissions(agents, prof);
    });
  }
}

function applyPermissions(agents, profile) {
  var cards = document.querySelectorAll('.agent-card');
  var n = 0;
  for (var i = 0; i < cards.length; i++) {
    if (agents.indexOf(cards[i].getAttribute('data-agent')) >= 0) {
      cards[i].classList.remove('hidden'); n++;
    } else { cards[i].classList.add('hidden'); }
  }
  document.getElementById('status-text').textContent = n === 10 ? 'Todos os agentes ativos' : n + ' agentes ativos';
  document.getElementById('profile-name').textContent = LABELS[profile] || profile;
  var gearBtn = document.getElementById('gear-btn');
  var configSection = document.querySelector('.settings-card');
  if (profile !== 'master') {
    if (gearBtn) gearBtn.style.display = 'none';
    if (configSection) configSection.style.display = 'none';
  } else {
    if (gearBtn) gearBtn.style.display = '';
    if (configSection) configSection.style.display = '';
  }
}

// Save email
document.getElementById('save-btn').addEventListener('click', function() {
  var email = document.getElementById('pricing-email').value.trim();
  if (!email || !email.includes('@')) return;
  chrome.storage.local.set({ pricingEmail: email }, function() {
    var m = document.getElementById('saved-msg'); m.style.display = 'block';
    setTimeout(function() { m.style.display = 'none'; }, 2000);
  });
});

// Gear -> open admin overlay
document.getElementById('gear-btn').addEventListener('click', function() {
  document.getElementById('admin-overlay').classList.add('visible');
  document.getElementById('admin-pwd').value = '';
  document.getElementById('pwd-error').style.display = 'none';
  document.getElementById('admin-body').classList.remove('visible');
  document.getElementById('pwd-row').style.display = 'flex';
  document.getElementById('admin-pwd').focus();
});

document.getElementById('admin-close').addEventListener('click', function() {
  document.getElementById('admin-overlay').classList.remove('visible');
});

document.getElementById('admin-unlock').addEventListener('click', doUnlock);
document.getElementById('admin-pwd').addEventListener('keydown', function(e) { if (e.key === 'Enter') doUnlock(); });

function doUnlock() {
  if (document.getElementById('admin-pwd').value === ADMIN_PWD) {
    document.getElementById('pwd-row').style.display = 'none';
    document.getElementById('admin-body').classList.add('visible');
    chrome.storage.local.get(['enabledAgents','userProfile'], function(d) {
      document.getElementById('profile-select').value = d.userProfile || 'master';
      setCheckboxes(d.enabledAgents || PROFILES.master);
    });
  } else {
    var e = document.getElementById('pwd-error'); e.style.display = 'block';
    setTimeout(function() { e.style.display = 'none'; }, 2000);
  }
}

document.getElementById('profile-select').addEventListener('change', function() {
  var p = this.value;
  if (p !== 'custom' && PROFILES[p]) setCheckboxes(PROFILES[p]);
});

function setCheckboxes(list) {
  var cbs = document.querySelectorAll('.agent-check input');
  for (var i = 0; i < cbs.length; i++) cbs[i].checked = list.indexOf(cbs[i].value) >= 0;
}
function getChecked() {
  var r = [], cbs = document.querySelectorAll('.agent-check input');
  for (var i = 0; i < cbs.length; i++) if (cbs[i].checked) r.push(cbs[i].value);
  return r;
}

document.getElementById('agent-checks').addEventListener('change', function() {
  var c = getChecked().sort().join(','), matched = 'custom';
  for (var p in PROFILES) { if (PROFILES[p].slice().sort().join(',') === c) { matched = p; break; } }
  document.getElementById('profile-select').value = matched;
});

document.getElementById('admin-save').addEventListener('click', function() {
  var profile = document.getElementById('profile-select').value;
  var agents = getChecked();
  chrome.storage.local.set({ userProfile: profile, enabledAgents: agents }, function() {
    applyPermissions(agents, profile);
    var m = document.getElementById('admin-saved'); m.style.display = 'block';
    setTimeout(function() {
      m.style.display = 'none';
      document.getElementById('admin-overlay').classList.remove('visible');
    }, 1200);
  });
});

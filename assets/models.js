/* ================================================================
   MODELS — провайдеры (множественные экземпляры) + статус квот
   ================================================================ */
const PROVIDER_DEFAULTS = {
  openrouter:  { name:'OpenRouter',    model:'anthropic/claude-3.5-sonnet',           color:'#6366f1', initial:'O' },
  gemini:      { name:'Google Gemini', model:'gemini-2.5-flash',                      color:'#4285f4', initial:'G' },
  groq:        { name:'Groq',          model:'llama-3.3-70b-versatile',               color:'#f97316', initial:'G' },
  huggingface: { name:'Hugging Face',  model:'meta-llama/Llama-3.3-70B-Instruct',     color:'#fbbf24', initial:'HF' },
  custom:      { name:'Custom API',    model:'gpt-4o',                                color:'#64748b', initial:'+' },
};

const MODEL_PLACEHOLDERS = {
  openrouter:  'anthropic/claude-3.5-sonnet',
  gemini:      'gemini-2.5-flash',
  groq:        'llama-3.3-70b-versatile',
  huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
  custom:      'gpt-4o или ваша модель'
};

let editingProviderId = null;

/* ---- квоты: метки о лимитах ---- */
function quotaStore() {
  try { return JSON.parse(localStorage.getItem('gas_quota') || '{}'); } catch (e) { return {}; }
}
function markProviderQuota(id, code) {
  if (!id) return;
  const q = quotaStore();
  q[id] = { at: Date.now(), code: code || 429 };
  localStorage.setItem('gas_quota', JSON.stringify(q));
  renderModels();
}
function clearProviderQuota(id) {
  if (!id) return;
  const q = quotaStore();
  if (q[id]) {
    delete q[id];
    localStorage.setItem('gas_quota', JSON.stringify(q));
    renderModels();
  }
}

function syncModelPlaceholder(p) {
  const el = document.getElementById('mModel');
  if (el) el.placeholder = MODEL_PLACEHOLDERS[p] || MODEL_PLACEHOLDERS.openrouter;
}

if (typeof openSheet === 'function') {
  const _origOpenSheet = openSheet;
  openSheet = function(id) {
    _origOpenSheet(id);
    if (id === 'sheet-addmodel') {
      if (!editingProviderId) {
        document.getElementById('addModelTitle').textContent = 'Добавить провайдера';
        document.getElementById('btnDelete').style.display = 'none';
        const nm = document.getElementById('mName');
        if (nm) nm.value = '';
        if (typeof resetKeyField === 'function') resetKeyField();
      }
      syncModelPlaceholder(getSelectedProvider());
    }
  };
}

if (typeof closeSheet === 'function') {
  const _origCloseSheet = closeSheet;
  closeSheet = function() {
    _origCloseSheet();
    editingProviderId = null;
  };
}

function getProviderById(id) {
  return state.providers.find(function(p) { return p.id === id; });
}
function getActiveProvider() {
  return state.providers.find(function(p) { return p.active; }) || null;
}

function renderModels() {
  const list = document.getElementById('modelsList');
  if (!state.providers || state.providers.length === 0) {
    list.innerHTML = '<div class="empty">Добавьте первого провайдера через кнопку «+»</div>';
    document.getElementById('modelsSub').textContent = 'Нет подключений';
    return;
  }

  const groups = {};
  state.providers.forEach(function(p) {
    if (!groups[p.type]) groups[p.type] = [];
    groups[p.type].push(p);
  });

  const activeCount = state.providers.filter(function(p) { return p.active; }).length;
  document.getElementById('modelsSub').textContent = state.providers.length + ' настроено · ' + activeCount + ' активно';

  const quotas = quotaStore();
  const DAY = 24 * 3600 * 1000;

  let html = '';
  Object.keys(groups).forEach(function(type) {
    const def = PROVIDER_DEFAULTS[type] || PROVIDER_DEFAULTS.custom;
    const instances = groups[type];

    html += '<div style="margin-bottom:16px">';
    html += '<h3 style="font-size:12px;color:var(--txt3);text-transform:uppercase;margin:0 0 8px">' + def.name + '</h3>';

    instances.forEach(function(p) {
      const qi = quotas[p.id];
      const quotaBadge = (qi && Date.now() - qi.at < DAY)
        ? '<span class="badge warn"><span class="dot warn"></span>Лимит ' + new Date(qi.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</span>'
        : '';
      html += '<div class="model-card" style="margin-bottom:8px">'
        + '<div class="mhead">'
        + '<div class="mlogo" style="background:' + def.color + '">' + def.initial + '</div>'
        + '<div class="mbody"><div class="mname">' + escapeHtml(p.name || def.name) + '</div>'
        + '<div class="mdesc">' + escapeHtml(p.model) + '</div></div></div>'
        + '<div class="minfo"><span class="badge ok"><span class="dot ok"></span>Ключ сохранён</span>'
        + quotaBadge
        + (p.active ? '<span class="badge acc">Активен</span>' : '') + '</div>'
        + (quotaBadge ? '<div style="font-size:11.5px;color:var(--txt3);margin-bottom:8px">Ключ живой, но провайдер ограничил запросы. Метка исчезнет после успешного запроса.</div>' : '')
        + '<div class="mactions">'
        + '<button class="btn sm" onclick="editProvider(\'' + p.id + '\')">Изменить</button>'
        + '<button class="btn sm" onclick="testProvider(\'' + p.id + '\')">Проверить</button>'
        + (p.active ? '' : '<button class="btn sm primary" onclick="activateProvider(\'' + p.id + '\')">Активировать</button>')
        + (instances.length > 1 ? '<button class="btn sm ghost" style="color:var(--err)" onclick="deleteProvider(\'' + p.id + '\')">Удалить</button>' : '')
        + '</div></div>';
    });
    html += '</div>';
  });

  list.innerHTML = html;
}

function pickProvider(el) {
  document.querySelectorAll('#providerChips .chip').forEach(function(c) { c.classList.remove('sel'); });
  el.classList.add('sel');
  const p = el.dataset.p;
  document.getElementById('endpointGroup').style.display = (p === 'custom') ? 'block' : 'none';
  syncModelPlaceholder(p);
}

function getSelectedProvider() {
  const sel = document.querySelector('#providerChips .chip.sel');
  return sel ? sel.dataset.p : 'openrouter';
}

async function saveProvider() {
  const type = getSelectedProvider();
  const model = document.getElementById('mModel').value.trim();
  const key = document.getElementById('mKey').value.trim();
  const endpoint = document.getElementById('mEndpoint').value.trim();
  const nameInput = document.getElementById('mName');
  const name = nameInput ? nameInput.value.trim() : '';

  if (!model) { toast('Укажи идентификатор модели'); return; }
  if (!key && !editingProviderId) { toast('Укажи API-ключ'); return; }
  if (type === 'custom' && !endpoint) { toast('Укажи базовый URL'); return; }

  const wasEdit = !!editingProviderId;
  let savedName = name;

  if (wasEdit) {
    const p = getProviderById(editingProviderId);
    if (p) {
      p.model = model;
      p.endpoint = endpoint;
      if (name) p.name = name;
      savedName = p.name;
      if (key && isAndroid) {
        try { Bridge.saveApiKey(p.id, key); } catch (e) { toast('Ошибка сохранения ключа'); return; }
      }
    }
  } else {
    const id = type + '-' + Date.now() + Math.random().toString(36).substr(2, 5);
    state.providers.push({
      id: id, type: type,
      name: name || (PROVIDER_DEFAULTS[type] ? PROVIDER_DEFAULTS[type].name : type),
      model: model, endpoint: endpoint,
      active: state.providers.length === 0
    });
    savedName = name || (PROVIDER_DEFAULTS[type] ? PROVIDER_DEFAULTS[type].name : type);
    if (key && isAndroid) {
      try { Bridge.saveApiKey(id, key); } catch (e) { toast('Ошибка сохранения ключа'); return; }
    }
  }

  saveLocalState();
  renderModels();
  updateChatModelLabel();
  editingProviderId = null;
  closeSheet();
  toast((wasEdit ? 'Обновлён: ' : 'Добавлен: ') + savedName + (key ? '' : ' (ключ не менялся)'));
}

function editProvider(id) {
  const p = getProviderById(id);
  if (!p) return;
  editingProviderId = id;
  openSheet('sheet-addmodel');

  document.getElementById('addModelTitle').textContent = 'Изменить провайдера';
  document.querySelectorAll('#providerChips .chip').forEach(function(c) {
    c.classList.toggle('sel', c.dataset.p === p.type);
  });
  document.getElementById('endpointGroup').style.display = (p.type === 'custom') ? 'block' : 'none';
  document.getElementById('mEndpoint').value = p.endpoint || '';
  document.getElementById('mModel').value = p.model || '';

  const nameInput = document.getElementById('mName');
  if (nameInput) nameInput.value = p.name || '';

  if (typeof resetKeyField === 'function') resetKeyField();
  let key = '';
  if (isAndroid) { try { key = Bridge.getApiKey(p.id) || ''; } catch (e) { key = ''; } }
  const keyEl = document.getElementById('mKey');
  keyEl.value = key;
  keyEl.placeholder = key ? 'Ключ загружен — глазок покажет его' : 'sk-...';

  document.getElementById('btnDelete').style.display = 'block';
  syncModelPlaceholder(p.type);
}

async function testProvider(id) {
  let type, model, endpoint, key, label, pid;

  if (id) {
    const p = getProviderById(id);
    if (!p) return;
    pid = p.id; type = p.type; model = p.model; endpoint = p.endpoint;
    label = p.name || p.type;
    if (isAndroid) { try { key = Bridge.getApiKey(p.id) || ''; } catch (e) {} }
    if (!key) { toast('Ключ не найден в Keystore'); return; }
  } else {
    pid = editingProviderId;
    type = getSelectedProvider();
    model = document.getElementById('mModel').value.trim();
    endpoint = document.getElementById('mEndpoint').value.trim();
    key = document.getElementById('mKey').value.trim();
    label = (PROVIDER_DEFAULTS[type] || {}).name || type;
    if (!key && pid && isAndroid) {
      try { key = Bridge.getApiKey(pid) || ''; } catch (e) {}
    }
    if (!model || !key) { toast('Заполни модель и ключ'); return; }
  }

  const btn = document.getElementById('btnTest');
  btn.disabled = true; btn.textContent = 'Проверка...';
  try {
    // ИСПРАВЛЕНИЕ: передаем pid последним аргументом, чтобы проверить строго этот экземпляр
    await doAiRequest(type, model, endpoint, key, [{ role: 'user', content: 'Ответь одним словом: работает.' }], pid);
    if (pid) clearProviderQuota(pid);
    toast(label + ': подключение успешно!');
  } catch (e) {
    const c = classifyAiError(e);
    if (c.kind === 'quota' && pid) markProviderQuota(pid, c.code);
    const f = friendlyAiError(e);
    toast(f.title);
  } finally {
    btn.disabled = false; btn.textContent = 'Проверить подключение';
  }
}

function activateProvider(id) {
  state.providers.forEach(function(p) { p.active = (p.id === id); });
  saveLocalState();
  renderModels();
  updateChatModelLabel();
  const p = getProviderById(id);
  toast('Активирован: ' + (p ? (p.name || p.type) : id));
}

async function deleteProvider(id) {
  const p = getProviderById(id);
  if (!p) return;
  const ok = await appDialog('Удалить провайдера?',
    '<p style="font-size:14px;color:var(--txt2)">Ключ «' + escapeHtml(p.name || p.type) + '» будет стёрт из Android Keystore.</p>',
    { confirm: true, okText: 'Удалить' });
  if (!ok) return;
  if (isAndroid) { try { Bridge.deleteApiKey(p.id); } catch (e) {} }
  state.providers = state.providers.filter(function(x) { return x.id !== p.id; });
  if (p.active && state.providers.length > 0) state.providers[0].active = true;
  saveLocalState();
  renderModels();
  updateChatModelLabel();
  editingProviderId = null;
  closeSheet();
  toast('Провайдер удалён');
}

function updateChatModelLabel() {
  const lbl = document.getElementById('chatModelLabel');
  const active = getActiveProvider();
  if (active) {
    lbl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      + escapeHtml(active.name || active.type) + ' · ' + escapeHtml(active.model)
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  } else {
    lbl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      + ' Выбрать модель'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  }
}

function openChatModelsSheet() {
  const body = document.getElementById('chatModelsBody');
  if (!state.providers || state.providers.length === 0) {
    body.innerHTML = '<div class="empty">Сначала добавь провайдеров в разделе «Модели»</div>';
  } else {
    const quotas = quotaStore();
    const DAY = 24 * 3600 * 1000;
    body.innerHTML = '<div class="list">' + state.providers.map(function(p) {
      const def = PROVIDER_DEFAULTS[p.type] || PROVIDER_DEFAULTS.custom;
      const qi = quotas[p.id];
      const qBadge = (qi && Date.now() - qi.at < DAY) ? ' <span class="badge warn">лимит</span>' : '';
      return '<div class="card" onclick="activateFromChat(\'' + p.id + '\')">'
        + '<div class="ico" style="background:' + def.color + ';color:#fff">' + def.initial + '</div>'
        + '<div class="body"><div class="title">' + escapeHtml(p.name || def.name) + qBadge + '</div>'
        + '<div class="sub">' + escapeHtml(p.model) + '</div></div>'
        + (p.active ? '<span class="badge acc">Активен</span>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  openSheet('sheet-models');
}

function activateFromChat(id) {
  activateProvider(id);
  closeSheet();
  updateChatModelLabel();
}
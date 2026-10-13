/* ================================================================
   PROJECT — открытие, восстановление, кэш, дерево, список проектов
   ================================================================ */
async function openProjectPicker() {
  if (!isAndroid) {
    toast('В браузере SAF недоступен. Соберите APK.');
    return;
  }
  toast('Выберите папку с project.godot...');
  try {
    const res = await bridgeAsync('pickProjectFolder');
    await onProjectLoaded(res);
  } catch (e) {
    toast('Ошибка: ' + e.message);
  }
}

async function onProjectLoaded(res) {
  // Сохраняем чат ПРЕЖНЕГО проекта перед переключением
  if (state.project && state.project.uri && typeof saveChatNow === 'function') {
    saveChatNow();
  }

  const map = res.map || null;
  state.project = {
    name: (map && map.name) ? map.name : (res.tree.name || 'Проект'),
    uri: res.treeUri || res.tree.uri,
    files: res.tree,
    godotVersion: (map && map.godotVersion) ? map.godotVersion : '—',
    map: map,
    fromCache: !!res.fromCache,
  };

  // Загружаем чат ЭТОГО проекта (у каждого проекта своя история)
  state.messages = (typeof loadChatFor === 'function') ? loadChatFor(state.project.uri) : [];
  state.handoffText = '';
  
  // Загружаем память проекта
  state.projectMemory = loadProjectMemory(state.project.uri);

  renderProjectCard();
  renderFileTree();
  renderRecentProjects();
  toast(state.project.fromCache
    ? 'Проект открыт из кэша (нет доступа к файлам)'
    : 'Проект загружен: ' + state.project.name);
}

function renderProjectCard() {
  if (!state.project) return;
  document.getElementById('projName').textContent = state.project.name;
  document.getElementById('projSub').textContent = 'Godot ' + state.project.godotVersion;
  const status = document.getElementById('projStatus');
  if (state.project.fromCache) {
    status.className = 'badge warn';
    status.innerHTML = '<span class="dot warn"></span>Кэш';
  } else {
    status.className = 'badge ok';
    status.innerHTML = '<span class="dot ok"></span>Открыт';
  }
  const stats = countProjectStats(state.project.files);
  document.getElementById('projStats').style.display = 'grid';
  document.getElementById('stFiles').textContent = stats.files;
  document.getElementById('stScenes').textContent = stats.scenes;
  document.getElementById('stScripts').textContent = stats.scripts;
  document.getElementById('projActions').style.display = 'flex';
}

function clearCurrentProject() {
  if (state.project && state.project.uri && typeof saveChatNow === 'function') saveChatNow();
  state.project = null;
  state.messages = [];
  state.handoffText = '';
  state.projectMemory = null; // Очищаем память при закрытии
  document.getElementById('projName').textContent = 'Проект не выбран';
  document.getElementById('projSub').textContent = 'Откройте папку с project.godot';
  const status = document.getElementById('projStatus');
  status.className = 'badge';
  status.innerHTML = '<span class="dot"></span>—';
  document.getElementById('projStats').style.display = 'none';
  renderFileTree();
}

function countProjectStats(node) {
  let files = 0, scenes = 0, scripts = 0;
  const walk = function(n) {
    if (n.type === 'file') {
      files++;
      if ((n.name || '').endsWith('.tscn')) scenes++;
      if ((n.name || '').endsWith('.gd')) scripts++;
    }
    (n.children || []).forEach(walk);
  };
  walk(node);
  return { files: files, scenes: scenes, scripts: scripts };
}

/* ---- Дерево файлов ---- */
function renderFileTree() {
  const tree = document.getElementById('fileTree');
  const sub = document.getElementById('filesSub');
  if (!state.project || !state.project.files) {
    tree.innerHTML = '<div class="empty">Сначала откройте проект в разделе «Студия»</div>';
    sub.textContent = '—';
    return;
  }
  const stats = countProjectStats(state.project.files);
  sub.textContent = state.project.name + ' · ' + stats.files + ' файлов';
  tree.innerHTML = renderNode(state.project.files, 0);
}

function renderNode(node, depth) {
  const pad = 14 + depth * 18;
  if (node.type === 'folder') {
    const isOpen = depth < 1;
    let html = '<div class="node folder" style="padding-left:' + pad + 'px" onclick="toggleFolder(this)">'
      + '<span class="arr ' + (isOpen ? 'open' : '') + '">▶</span>'
      + '<span class="fic">📁</span>'
      + '<span class="name">' + escapeHtml(node.name) + '</span></div>'
      + '<div class="nested ' + (isOpen ? 'open' : '') + '">';
    (node.children || []).forEach(function(c) { html += renderNode(c, depth + 1); });
    html += '</div>';
    return html;
  }
  return '<div class="node file" style="padding-left:' + pad + 'px" '
    + 'onclick="openFile(\'' + encodeURIComponent(node.uri) + '\',\'' + encodeURIComponent(node.name) + '\')">'
    + '<span class="arr" style="visibility:hidden">▶</span>'
    + '<span class="fic">📄</span>'
    + '<span class="name">' + escapeHtml(node.name) + '</span></div>';
}

function toggleFolder(el) {
  el.querySelector('.arr').classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

async function openFile(uriEnc, nameEnc) {
  const uri = decodeURIComponent(uriEnc);
  const name = decodeURIComponent(nameEnc);
  document.getElementById('fvPath').textContent = name;
  const body = document.getElementById('fvBody');
  body.innerHTML = '<div style="color:var(--txt3)">Загрузка...</div>';
  resetEditor();
  openSheet('sheet-fileviewer');
  if (!isAndroid) {
    body.innerHTML = '<div style="color:var(--err)">Чтение файлов только в Android APK</div>';
    return;
  }
  try {
    const content = await bridgeAsync('readFile', uri);
    const loc = state.project ? locateUri(state.project.files, uri, '') : null;
    currentFile = { uri: uri, name: name, content: content, path: loc ? loc.path : name };
    renderFileContent(currentFile);
  } catch (e) {
    body.innerHTML = '<div style="color:var(--err)">Ошибка: ' + escapeHtml(e.message) + '</div>';
  }
}

function highlight(line, filename) {
  const h = escapeHtml(line);
  if (!(filename || '').endsWith('.gd')) return h;
  const re = /(#[^\n]*)|("[^"]*")|\b(extends|class_name|func|var|const|if|else|elif|for|while|return|true|false|null|not|and|or|self|signal|export|onready|await|pass)\b|\b(\d+\.?\d*)\b/g;
  return h.replace(re, function(m, com, str, kw, num) {
    if (com) return '<span style="color:#546e7a">' + com + '</span>';
    if (str) return '<span style="color:#ecc48d">' + str + '</span>';
    if (kw) return '<span style="color:#c792ea">' + kw + '</span>';
    return '<span style="color:#f78c6c">' + num + '</span>';
  });
}

function locateUri(node, uri, trail) {
  const t = trail ? trail + '/' + node.name : node.name;
  if (node.uri === uri) return { path: t, node: node };
  const ch = node.children || [];
  for (let i = 0; i < ch.length; i++) {
    const r = locateUri(ch[i], uri, t);
    if (r) return r;
  }
  return null;
}

/* ---- Недавние проекты: открытие + удаление ---- */
async function renderRecentProjects() {
  const el = document.getElementById('recentProjects');
  const empty = '<div class="empty">Откройте свой первый проект Godot</div>';
  if (!isAndroid) {
    const list = getRecentProjectsFallback();
    if (!list.length) { el.innerHTML = empty; return; }
    el.innerHTML = list.map(function(p) {
      const when = new Date(p.at).toLocaleDateString('ru-RU');
      return '<div class="card" onclick="reopenProject(\'' + encodeURIComponent(p.uri) + '\')">'
        + '<div class="ico">🎮</div><div class="body">'
        + '<div class="title">' + escapeHtml(p.name) + '</div>'
        + '<div class="sub">Godot ' + escapeHtml(p.godotVersion || '—') + ' · ' + when + '</div>'
        + '</div></div>';
    }).join('');
    return;
  }
  let recs = [];
  try { recs = JSON.parse(Bridge.getSavedProjects() || '[]'); } catch (e) { recs = []; }
  if (!recs.length) { el.innerHTML = empty; return; }
  el.innerHTML = recs.map(function(p) {
    const when = new Date(p.at).toLocaleDateString('ru-RU');
    return '<div class="card" onclick="reopenProject(\'' + encodeURIComponent(p.uri) + '\')">'
      + '<div class="ico">🎮</div><div class="body">'
      + '<div class="title">' + escapeHtml(p.name) + '</div>'
      + '<div class="sub">Godot ' + escapeHtml(p.godotVersion || '—') + ' · ' + when + '</div></div>'
      + '<button class="iconbtn" style="width:34px;height:34px;flex-shrink:0" '
      + 'onclick="removeProjectEvent(event,\'' + encodeURIComponent(p.uri) + '\')">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
      + '</button></div>';
  }).join('');
}

async function removeProjectEvent(e, uriEnc) {
  e.stopPropagation();
  const uri = decodeURIComponent(uriEnc);
  const ok = await appDialog('Удалить проект из списка?',
    '<p style="font-size:14px;color:var(--txt2);margin-bottom:6px">Запись, кэш и чат проекта будут удалены из приложения.</p>'
    + '<p style="font-size:13px;color:var(--txt3)">Файлы проекта на диске останутся нетронутыми.</p>',
    { confirm: true, okText: 'Удалить' });
  if (!ok) return;
  try { Bridge.removeProjectRecord(uri); } catch (err) {}
  try {
    if (typeof chatKey === 'function') localStorage.removeItem(chatKey(uri));
    if (typeof getProjectMemoryKey === 'function') localStorage.removeItem(getProjectMemoryKey(uri));
  } catch (err) {}
  if (state.project && state.project.uri === uri) clearCurrentProject();
  renderRecentProjects();
  toast('Проект удалён из списка');
}

async function reopenProject(uriEnc) {
  const uri = decodeURIComponent(uriEnc);
  if (!isAndroid) { toast('Открытие только в Android APK'); return; }
  toast('Открытие проекта...');
  try {
    const res = await bridgeAsync('reopenProject', uri);
    await onProjectLoaded(res);
  } catch (e) {
    if (String(e.message).indexOf('NO_PERMISSION') >= 0) {
      toast('Доступ истёк или кэш пуст. Выбери проект заново.');
    } else {
      toast('Ошибка: ' + e.message);
    }
  }
}

/* ---- Инструменты ---- */
function sceneTreeHtml(node, depth) {
  const pad = 12 + depth * 16;
  let html = '<div style="padding:4px ' + pad + 'px;font-family:\'SF Mono\',Menlo,monospace;font-size:13px">'
    + '<span style="color:var(--acc2)">' + escapeHtml(node.name) + '</span>'
    + '<span style="color:var(--txt3)"> : ' + escapeHtml(node.type) + '</span></div>';
  (node.children || []).forEach(function(c) { html += sceneTreeHtml(c, depth + 1); });
  return html;
}

async function openSceneTree() {
  if (!state.project) { toast('Сначала открой проект'); closeSheet(); return; }
  let sceneUri = null, sceneName = '';
  const find = function(n) {
    if (sceneUri) return;
    if (n.type === 'file' && n.name.endsWith('.tscn')) {
      sceneUri = n.uri; sceneName = n.name;
    }
    (n.children || []).forEach(find);
  };
  find(state.project.files);
  if (!sceneUri) { toast('В проекте нет .tscn файлов'); return; }
  closeSheet();
  try {
    const tree = await bridgeAsync('parseScene', sceneUri);
    await appDialog('Дерево сцены: ' + sceneName,
      '<div style="background:#0a0a0f;border:1px solid var(--line);border-radius:10px;padding:8px 0">'
      + sceneTreeHtml(tree, 0) + '</div>');
  } catch (e) { toast('Ошибка: ' + e.message); }
}

async function runDiagnostics() {
  if (!state.project) { toast('Сначала открой проект'); return; }
  closeSheet();
  const stats = countProjectStats(state.project.files);
  let msg = 'Диагностика «' + state.project.name + '»\n\n';
  msg += '• Файлов: ' + stats.files + '\n';
  msg += '• Сцен: ' + stats.scenes + '\n';
  msg += '• Скриптов: ' + stats.scripts + '\n';
  msg += '• Godot: ' + state.project.godotVersion + '\n\n';
  if (stats.scenes === 0) msg += '⚠ Не найдено ни одной сцены.\n';
  if (stats.scripts === 0) msg += '⚠ Не найдено ни одного скрипта.\n';
  if (stats.scenes > 0 && stats.scripts > 0) msg += '✓ Базовая структура присутствует.';
  await appDialog('Диагностика проекта',
    '<div style="white-space:pre-wrap;font-size:13px;color:var(--txt2);line-height:1.6">' + escapeHtml(msg) + '</div>');
}

// Авто-восстановление при запуске
async function tryRestoreLastProject() {
  if (!isAndroid) return;
  const lastUri = Bridge.getLastProjectUri ? Bridge.getLastProjectUri() : '';
  if (!lastUri) return;
  try {
    const res = await bridgeAsync('reopenProject', lastUri);
    await onProjectLoaded(res);
  } catch (e) { /* тихо */ }
}

/* ================================================================
   PROJECT MEMORY — Долгосрочная память архитектуры и статуса задач
   ================================================================ */
function getProjectMemoryKey(uri) {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = ((h << 5) + h + uri.charCodeAt(i)) | 0;
  return 'gas_mem_' + (h >>> 0).toString(36);
}

function loadProjectMemory(uri) {
  if (!uri) return { architecture: 'Неизвестна', pending: [], completed: '' };
  try {
    const raw = localStorage.getItem(getProjectMemoryKey(uri));
    return raw ? JSON.parse(raw) : { architecture: 'Неизвестна', pending: [], completed: '' };
  } catch (e) { return { architecture: 'Неизвестна', pending: [], completed: '' }; }
}

function saveProjectMemory(uri, mem) {
  if (!uri) return;
  try { localStorage.setItem(getProjectMemoryKey(uri), JSON.stringify(mem)); } catch (e) {}
}

function markTaskAsCompletedInMemory(taskSummary) {
  if (!state.project || !state.project.uri || !state.projectMemory) return;
  const mem = state.projectMemory;
  mem.completed += `\n- [${new Date().toLocaleDateString()}] ${taskSummary}`;
  mem.pending = []; // Очищаем ожидающие, так как изменения применены
  if (mem.completed.length > 1500) mem.completed = mem.completed.slice(-1200); // Защита от раздувания
  saveProjectMemory(state.project.uri, mem);
}
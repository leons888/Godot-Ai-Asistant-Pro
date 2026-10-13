/* ================================================================
   CHANGES — изменения, бэкапы, история с diff, редактор
   ================================================================ */
state.pendingChanges = [];
let currentFile = null;
let editorOpen = false;
let diffOpenCache = [];

function resetEditor() {
  editorOpen = false;
  const b = document.getElementById('fvEditBtn');
  if (b) b.textContent = 'Изменить';
  const fvBody = document.getElementById('fvBody');
  if (fvBody) {
    fvBody.style.display = '';
    fvBody.style.flexDirection = '';
    fvBody.style.flex = '';
    fvBody.style.overflow = '';
    fvBody.style.padding = '';
  }
  const sheet = document.getElementById('sheet-fileviewer');
  if (sheet) {
    sheet.style.maxHeight = '100vh';
    sheet.style.height = '';
  }
}

function proposeChange(change) {
  const idx = state.pendingChanges.findIndex(function(c) {
    return c.path === change.path && c.action === change.action;
  });
  if (idx >= 0) state.pendingChanges[idx] = change;
  else state.pendingChanges.push(change);
  renderChanges();
}

function rejectChange(index) {
  state.pendingChanges.splice(index, 1);
  renderChanges();
}

function renderChanges() {
  const tab = document.getElementById('tabChangesLabel');
  if (tab) tab.textContent = 'Изменения (' + state.pendingChanges.length + ')';
  const box = document.getElementById('tab-changes');
  if (!box) return;
  if (!state.pendingChanges.length) {
    box.innerHTML = '<div class="section"><div class="empty">Пока нет ожидающих изменений</div></div>';
    return;
  }
  let html = '<div class="section">';
  state.pendingChanges.forEach(function(c, i) {
    const label = c.action === 'modify' ? '~ Изменён'
      : c.action === 'create' ? '+ Новый файл' : '− Удалён';
    let preview;
    if (c.action === 'modify' && c.oldContent != null) {
      preview = diffHtmlAndLine(c.oldContent, c.content || '', true).html;
    } else if (c.content) {
      preview = '<div class="preview">' + escapeHtml(c.content.split('\n').slice(0, 6).join('\n')) + '</div>';
    } else {
      preview = '';
    }
    html += '<div class="change-card"><div class="head"><span class="ftype">' + label + '</span>'
      + '<span class="fpath" style="margin-left:auto">' + escapeHtml(c.path) + '</span></div>'
      + preview
      + '<div class="btn-row" style="margin-top:8px">'
      + '<button class="btn sm" onclick="rejectChange(' + i + ')">Отклонить</button></div></div>';
  });
  html += '<div class="btn-row" style="margin-top:14px">'
    + '<button class="btn primary block" onclick="applyAllChanges()">Применить (' + state.pendingChanges.length + ')</button>'
    + '</div></div>';
  box.innerHTML = html;
}

async function applyAllChanges() {
  if (!state.pendingChanges.length) return;
  if (!isAndroid) { toast('Только в Android APK'); return; }
  toast('Создаю резервную копию и применяю...');
  try {
    const payload = JSON.stringify({
      projectUri: state.project ? state.project.uri : '',
      changes: state.pendingChanges
    });
    await bridgeAsync('applyChanges', payload);
    
    // === ОБНОВЛЕНИЕ ПАМЯТИ: задача реально выполнена ===
    if (typeof markTaskAsCompletedInMemory === 'function') {
      const taskDesc = state.pendingChanges.map(c => c.path.split('/').pop()).join(', ');
      markTaskAsCompletedInMemory(`Применены изменения в файлах: ${taskDesc}`);
    }
    // ================================================

    state.pendingChanges = [];
    renderChanges();
    toast('Изменения применены');
    const res = await bridgeAsync('reopenProject', state.project.uri);
    await onProjectLoaded(res);
    renderHistory();
  } catch (e) {
    toast('Ошибка: ' + e.message);
  }
}

/* ---- История ---- */
function baseName(path) {
  if (!path) return '';
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.substring(i + 1) : path;
}

async function fetchHistory() {
  let list = [];
  try {
    const raw = await bridgeAsync('getHistory');
    list = Array.isArray(raw) ? raw : [];
  } catch (e) { list = []; }
  const cur = state.project ? state.project.uri : '';
  return list.filter(function(s) { return s.projectUri === cur; });
}

async function renderHistory() {
  const box = document.getElementById('tab-history');
  if (!box) return;
  if (!isAndroid) {
    box.innerHTML = '<div class="list section"><div class="empty">История доступна только в Android APK</div></div>';
    return;
  }
  const list = await fetchHistory();
  if (!list.length) {
    box.innerHTML = '<div class="list section"><div class="empty">История изменений пуста</div></div>';
    return;
  }
  let html = '<div class="list section">' + list.map(function(s) {
    const d = new Date(s.at);
    const when = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const entries = s.entries || [];
    const first = baseName(entries.length ? entries[0].path : '');
    const title = first ? first + (entries.length > 1 ? ' +' + (entries.length - 1) : '') : (s.desc || 'Изменения');
    return '<div class="card" style="cursor:pointer" onclick="showSession(\'' + s.id + '\')">'
      + '<div class="ico">🕘</div><div class="body">'
      + '<div class="title">' + escapeHtml(title) + '</div>'
      + '<div class="sub">' + when + ' · ' + entries.length + ' файл(ов)'
      + (s.rolled ? ' · откачено' : ' · нажми: diff и откат') + '</div></div>'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--txt3)"><path d="M9 18l6-6-6-6"/></svg>'
      + '</div>';
  }).join('') + '</div>';
  html += '<div class="section"><button class="btn ghost block" style="color:var(--err)" onclick="clearHistorySessions()">Очистить историю этого проекта</button></div>';
  box.innerHTML = html;
}

async function clearHistorySessions() {
  const ok = await appDialog('Очистить историю?',
    '<p style="font-size:14px;color:var(--txt2)">Все сессии отката текущего проекта будут удалены безвозвратно. Файлы проекта не затрагиваются.</p>',
    { confirm: true, okText: 'Очистить' });
  if (!ok) return;
  try {
    await bridgeAsync('clearHistory', state.project ? state.project.uri : '');
    toast('История очищена');
    renderHistory();
  } catch (e) { toast('Ошибка: ' + e.message); }
}

/* ---- diff ---- */
function diffLines(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 400000) {
    const ops = [];
    a.forEach(function(l) { ops.push({ t: 'del', s: l }); });
    b.forEach(function(l) { ops.push({ t: 'add', s: l }); });
    return ops;
  }
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: 'same', s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', s: a[i] }); i++; }
    else { ops.push({ t: 'add', s: b[j] }); j++; }
  }
  while (i < n) { ops.push({ t: 'del', s: a[i] }); i++; }
  while (j < m) { ops.push({ t: 'add', s: b[j] }); j++; }
  return ops;
}

function diffHtmlAndLine(oldText, newText, hasNew) {
  if (!hasNew) {
    return {
      line: 1,
      html: '<div style="font-size:12px;color:var(--txt3);padding:6px 0">Для этой сессии нет снапшота «после». Старая версия:</div>'
        + '<div style="background:#0a0a0f;border:1px solid var(--line);border-radius:10px;padding:8px;font-family:\'SF Mono\',Menlo,monospace;font-size:11.5px;color:var(--txt3);white-space:pre-wrap;max-height:220px;overflow:auto">'
        + escapeHtml(String(oldText || '').split('\n').slice(0, 60).join('\n')) + '</div>'
    };
  }
  const a = String(oldText || '').split('\n');
  const b = String(newText || '').split('\n');
  const ops = diffLines(a, b);
  const show = new Array(ops.length).fill(false);
  ops.forEach(function(o, i) {
    if (o.t !== 'same') {
      for (let k = Math.max(0, i - 2); k <= Math.min(ops.length - 1, i + 2); k++) show[k] = true;
    }
  });
  let html = '', line = 0, j = 0, gap = false;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.t === 'same') j++;
    if (o.t === 'add') { j++; if (!line) line = j; }
    if (!line && o.t === 'del') line = Math.max(1, j + 1);
    if (!show[i]) {
      if (!gap) { html += '<div style="padding:2px 8px;color:var(--txt3)">⋯</div>'; gap = true; }
      continue;
    }
    gap = false;
    if (o.t === 'same') {
      html += '<div style="padding:2px 8px;white-space:pre-wrap;word-break:break-all;color:var(--txt3)">' + escapeHtml(o.s) + '</div>';
    } else if (o.t === 'del') {
      html += '<div style="padding:2px 8px;white-space:pre-wrap;word-break:break-all;color:#ffa2a2;background:rgba(248,113,113,.08)"><span style="opacity:.6;margin-right:6px">−</span>' + escapeHtml(o.s) + '</div>';
    } else {
      html += '<div style="padding:2px 8px;white-space:pre-wrap;word-break:break-all;color:#7ee0a1;background:rgba(74,222,128,.08)"><span style="opacity:.6;margin-right:6px">+</span>' + escapeHtml(o.s) + '</div>';
    }
  }
  if (!line) line = 1;
  return {
    line: line,
    html: '<div style="background:#0a0a0f;border:1px solid var(--line);border-radius:10px;margin:6px 0 0;overflow:hidden;font-family:\'SF Mono\',Menlo,monospace;font-size:11.5px;line-height:1.5;max-height:260px;overflow-y:auto">'
      + (html || '<div style="padding:8px;color:var(--txt3)">Нет различий</div>') + '</div>'
  };
}

/* ---- детали сессии ---- */
async function showSession(id) {
  const list = await fetchHistory();
  let s = null;
  list.forEach(function(x) { if (x.id === id) s = x; });
  if (!s) { toast('Сессия не найдена'); return; }

  let diff = [];
  try {
    const raw = await bridgeAsync('getSessionDiff', id);
    diff = Array.isArray(raw) ? raw : [];
  } catch (e) { diff = []; }

  diffOpenCache = [];
  const d = new Date(s.at);
  const when = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  let body = '<div style="font-size:12px;color:var(--txt3);margin-bottom:12px">' + when
    + (s.rolled ? ' · сессия уже откачена' : '') + '</div>';

  diff.forEach(function(e) {
    const label = e.action === 'modify' ? '~ Изменён' : e.action === 'create' ? '+ Создан' : '− Удалён';
    const badgeCls = e.action === 'modify' ? 'warn' : e.action === 'create' ? 'ok' : 'err';
    const res = diffHtmlAndLine(e.old || '', e.neu || '', e.hasNew === true);
    diffOpenCache.push({ path: e.path, line: res.line });
    const idx = diffOpenCache.length - 1;
    body += '<div style="margin-bottom:16px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '<span class="badge ' + badgeCls + '">' + label + '</span>'
      + '<span style="font-family:\'SF Mono\',Menlo,monospace;font-size:12px;color:var(--txt2);flex:1;word-break:break-all">' + escapeHtml(baseName(e.path)) + '</span>'
      + '<button class="btn sm" onclick="openAtFromDialog(' + idx + ')">Открыть</button>'
      + '</div>'
      + res.html
      + '</div>';
  });

  if (!diff.length) body += '<div class="empty">Нет данных сессии</div>';

  if (s.rolled) {
    await appDialog('Состав сессии', body);
    return;
  }
  const r = await appDialog('Откатить эту сессию?', body, { confirm: true, okText: 'Откатить' });
  if (r === true) {
    try {
      await bridgeAsync('rollback', id);
      toast('Откат выполнен');
      const res2 = await bridgeAsync('reopenProject', state.project.uri);
      await onProjectLoaded(res2);
      renderHistory();
      renderChanges();
    } catch (e) { toast('Ошибка: ' + e.message); }
  } else if (typeof r === 'string' && r.indexOf('open|') === 0) {
    const parts = r.split('|');
    await openFileAt(parts[1], parseInt(parts[2], 10) || 1);
  }
}

function openAtFromDialog(i) {
  const d = diffOpenCache[i];
  if (!d) return;
  dialogFinish('open|' + d.path + '|' + d.line);
}

function locateByPath(node, path) {
  const walk = function(n, trail) {
    const t = trail ? trail + '/' + n.name : n.name;
    if (t === path || t.endsWith('/' + path)) return n;
    const ch = n.children || [];
    for (let i = 0; i < ch.length; i++) {
      const r = walk(ch[i], t);
      if (r) return r;
    }
    return null;
  };
  return walk(node, '');
}

async function openFileAt(path, line) {
  if (!state.project) return;
  const node = locateByPath(state.project.files, path);
  if (!node || node.type !== 'file') { toast('Файл не найден в проекте: ' + baseName(path)); return; }
  resetEditor();
  openSheet('sheet-fileviewer');
  document.getElementById('fvPath').textContent = baseName(path);
  document.getElementById('fvBody').innerHTML = '<div style="color:var(--txt3)">Загрузка...</div>';
  try {
    const content = await bridgeAsync('readFile', node.uri);
    currentFile = { uri: node.uri, name: baseName(path), content: content, path: path };
    renderFileContent(currentFile);
    setTimeout(function() {
      const rows = document.querySelectorAll('#fvBody .ln');
      const el = rows[line - 1];
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.style.background = 'rgba(157,107,255,.3)';
        setTimeout(function() { el.style.background = ''; }, 1800);
      }
    }, 200);
  } catch (e) {
    toast('Ошибка: ' + e.message);
  }
}

/* ---- полноэкранный редактор ---- */
function toggleEditor() {
  if (editorOpen) { closeEditor(); return; }
  if (!currentFile) { toast('Сначала открой файл'); return; }
  editorOpen = true;
  document.getElementById('fvEditBtn').textContent = 'Просмотр';

  const sheet = document.getElementById('sheet-fileviewer');
  sheet.style.maxHeight = 'none';
  sheet.style.height = (window.visualViewport ? window.visualViewport.height : window.innerHeight) + 'px';

  const fvBody = document.getElementById('fvBody');
  fvBody.style.display = 'flex';
  fvBody.style.flexDirection = 'column';
  fvBody.style.flex = '1';
  fvBody.style.overflow = 'hidden';
  fvBody.style.padding = '0';

  fvBody.innerHTML =
    '<textarea id="editorArea" style="flex:1;width:100%;background:#0a0a0f;color:var(--txt);font-family:\'SF Mono\',Menlo,Consolas,monospace;font-size:13px;line-height:1.6;border:none;outline:none;resize:none;padding:12px">'
    + escapeHtml(currentFile.content || '') + '</textarea>'
    + '<div style="padding:12px var(--pad);display:flex;gap:8px;background:var(--bg);border-top:1px solid var(--line)">'
    + '<button class="btn primary block" onclick="saveToChanges()">В изменения</button>'
    + '<button class="btn block" onclick="closeEditor()">Отмена</button></div>';
}

function saveToChanges() {
  const area = document.getElementById('editorArea');
  if (!area || !currentFile) return;
  const content = area.value;
  if (content === currentFile.content) { toast('Нет изменений'); closeEditor(); return; }
  proposeChange({
    action: 'modify',
    path: currentFile.path || currentFile.name,
    uri: currentFile.uri,
    content: content,
    oldContent: currentFile.content
  });
  closeEditor();
  toast('Добавлено в «Изменения»');
}

function closeEditor() {
  resetEditor();
  if (currentFile) renderFileContent(currentFile);
}

function renderFileContent(f) {
  const lines = (f.content || '').split('\n').map(function(l, i) {
    return '<div class="ln"><span class="lnn">' + (i + 1) + '</span><span>' + highlight(l, f.name) + '</span></div>';
  }).join('');
  document.getElementById('fvBody').innerHTML = lines;
}

if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', function() {
    const sheet = document.getElementById('sheet-fileviewer');
    if (sheet && editorOpen) {
      sheet.style.height = window.visualViewport.height + 'px';
    }
  });
}
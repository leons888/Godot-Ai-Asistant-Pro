/* ================================================================
   COMPANION — установка плагина, связь с Godot Editor (v0.3.1)
   ================================================================ */
const GAS_CMD = 'gas_cmd.json';
const GAS_RESP = 'gas_resp.json';
const GAS_RESP_TMP = 'gas_resp.tmp';
const GAS_ALIVE = 'gas_alive.json';

const PLUGIN_CFG = '[plugin]\n\nname="Godot AI Studio Companion"\ndescription="JSON bridge for Godot AI Studio android app"\nauthor="Godot AI Studio"\nversion="0.3.1"\nscript="gas_companion.gd"\n';

const PLUGIN_GD = [
'@tool',
'extends EditorPlugin',
'',
'const CMD_PATH := "res://gas_cmd.json"',
'const RESP_PATH := "res://gas_resp.json"',
'const RESP_TMP := "res://gas_resp.tmp"',
'const ALIVE_PATH := "res://gas_alive.json"',
'',
'var _thread: Thread = Thread.new()',
'var _timer: Timer = Timer.new()',
'var _running: bool = false',
'var _use_thread: bool = false',
'var _mutex: Mutex = Mutex.new()',
'var _pending: Dictionary = {}',
'var _has_pending: bool = false',
'',
'func _enter_tree() -> void:',
'    _running = true',
'    var err: int = _thread.start(_thread_loop)',
'    _use_thread = (err == OK)',
'    if not _use_thread:',
'        printerr("[GasCompanion] thread start failed, timer fallback")',
'        _timer.wait_time = 1.0',
'        _timer.timeout.connect(_poll_once)',
'        add_child(_timer)',
'        _timer.start()',
'    set_process(true)',
'    print("[GasCompanion] active at ", ProjectSettings.globalize_path("res://"))',
'',
'func _exit_tree() -> void:',
'    _running = false',
'    if _use_thread and _thread.is_started():',
'        _thread.wait_to_finish()',
'    if _timer.is_inside_tree():',
'        _timer.stop()',
'    set_process(false)',
'',
'func _thread_loop() -> void:',
'    while _running:',
'        OS.delay_msec(700)',
'        _poll_once()',
'',
'func _poll_once() -> void:',
'    _write_heartbeat()',
'    if not FileAccess.file_exists(CMD_PATH):',
'        return',
'    var f: FileAccess = FileAccess.open(CMD_PATH, FileAccess.READ)',
'    if f == null:',
'        return',
'    var raw: String = f.get_as_text()',
'    f.close()',
'    DirAccess.remove_absolute(ProjectSettings.globalize_path(CMD_PATH))',
'    var data: Variant = JSON.parse_string(raw)',
'    if typeof(data) != TYPE_DICTIONARY:',
'        _write_resp({"ok": false, "error": "bad json"})',
'        return',
'    var d: Dictionary = data',
'    var ts: float = float(d.get("ts", 0))',
'    if ts > 0 and (Time.get_unix_time_from_system() - ts) > 60:',
'        _write_resp({"ok": false, "error": "stale command ignored"})',
'        return',
'    var cmd: String = str(d.get("cmd", ""))',
'    if cmd == "ping":',
'        print("[GasCompanion] cmd: ping")',
'        var v: Dictionary = Engine.get_version_info()',
'        _write_resp({"ok": true, "result": {"pong": true, "godot": str(v.major) + "." + str(v.minor) + "." + str(v.patch), "project": ProjectSettings.globalize_path("res://")}})',
'    else:',
'        _mutex.lock()',
'        _pending = d',
'        _has_pending = true',
'        _mutex.unlock()',
'        print("[GasCompanion] cmd queued: ", cmd)',
'',
'func _write_heartbeat() -> void:',
'    var hb: FileAccess = FileAccess.open(ALIVE_PATH, FileAccess.WRITE)',
'    if hb == null:',
'        return',
'    hb.store_string(JSON.stringify({"t": Time.get_unix_time_from_system(), "res": ProjectSettings.globalize_path("res://")}))',
'    hb.close()',
'',
'func _write_resp(result: Dictionary) -> void:',
'    var out: FileAccess = FileAccess.open(RESP_TMP, FileAccess.WRITE)',
'    if out == null:',
'        printerr("[GasCompanion] resp write failed")',
'        return',
'    out.store_string(JSON.stringify(result))',
'    out.close()',
'    DirAccess.rename_absolute(ProjectSettings.globalize_path(RESP_TMP), ProjectSettings.globalize_path(RESP_PATH))',
'    print("[GasCompanion] resp written")',
'',
'func _process(_delta: float) -> void:',
'    _mutex.lock()',
'    var has: bool = _has_pending',
'    var d: Dictionary = _pending',
'    _has_pending = false',
'    _mutex.unlock()',
'    if not has:',
'        return',
'    _write_resp(_execute_scene(d))',
'',
'func _execute_scene(d: Dictionary) -> Dictionary:',
'    var cmd: String = str(d.get("cmd", ""))',
'    print("[GasCompanion] cmd: ", cmd)',
'    match cmd:',
'        "get_tree":',
'            var root_a: Node = get_editor_interface().get_edited_scene_root()',
'            if root_a == null:',
'                return {"ok": false, "error": "no scene open in editor"}',
'            return {"ok": true, "result": _dump(root_a)}',
'        "create_node":',
'            var root_b: Node = get_editor_interface().get_edited_scene_root()',
'            if root_b == null:',
'                return {"ok": false, "error": "no scene open in editor"}',
'            var parent_path: String = str(d.get("parent", ""))',
'            var type: String = str(d.get("type", "Node3D"))',
'            var node_name: String = str(d.get("name", "GasTestNode"))',
'            var target: Node = root_b',
'            if parent_path != "":',
'                target = root_b.get_node_or_null(NodePath(parent_path))',
'            if target == null:',
'                return {"ok": false, "error": "parent not found: " + parent_path}',
'            if not ClassDB.class_exists(type):',
'                return {"ok": false, "error": "unknown type: " + type}',
'            var node: Node = ClassDB.instantiate(type)',
'            if node == null:',
'                return {"ok": false, "error": "cannot instantiate: " + type}',
'            node.name = node_name',
'            target.add_child(node)',
'            node.set_owner(root_b)',
'            get_editor_interface().save_scene()',
'            return {"ok": true, "result": {"created": node_name, "type": type}}',
'        _:',
'            return {"ok": false, "error": "unknown cmd: " + cmd}',
'',
'func _dump(n: Node) -> Dictionary:',
'    var children: Array = []',
'    for c in n.get_children():',
'        children.append(_dump(c))',
'    return {"name": n.name, "type": n.get_class(), "children": children}',
''
].join('\n');

function toggleCompanion(el) {
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  localStorage.setItem('gas_companion', on ? '1' : '0');
  toast(on ? 'Связь с Godot Editor включена' : 'Связь с Godot Editor выключена');
}

function initCompanionSwitch() {
  const el = document.getElementById('companionSwitch');
  if (el && localStorage.getItem('gas_companion') === '1') el.classList.add('on');
}
initCompanionSwitch();

/* ---- вспомогательные ---- */
async function refreshTreeSilent() {
  return await bridgeAsync('reopenProject', state.project.uri);
}

/* ВАЖНО: bridge сам парсит JSON-содержимое файла в объект.
   Поэтому читаем либо объект, либо строку — и приводим к объекту. */
async function readJsonObject(uri) {
  const v = await bridgeAsync('readFile', uri);
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  return null;
}

function findFolder(parentNode, name) {
  let found = null;
  (parentNode.children || []).forEach(function(c) {
    if (c.name === name && c.type === 'folder') found = c;
  });
  return found;
}

async function ensureFolder(parentNode, name) {
  let node = findFolder(parentNode, name);
  if (node) return node;
  const uri = await companionAsync('createDirectory', parentNode.uri, name);
  node = { name: name, type: 'folder', uri: uri, children: [] };
  parentNode.children = parentNode.children || [];
  parentNode.children.push(node);
  return node;
}

function locateUriByName(node, name) {
  if (node.type === 'file' && node.name === name) return { node: node };
  const ch = node.children || [];
  for (let i = 0; i < ch.length; i++) {
    const r = locateUriByName(ch[i], name);
    if (r) return r;
  }
  return null;
}

async function upsertFile(dirNode, fileName, content) {
  const loc = locateUriByName(dirNode, fileName);
  if (loc) {
    await bridgeAsync('writeFile', loc.node.uri, content);
    return loc.node.uri;
  }
  return await bridgeAsync('createFile', dirNode.uri, fileName, content);
}

async function removeExchangeFile(tree, name) {
  const loc = locateUriByName(tree, name);
  if (loc) {
    try { await bridgeAsync('deleteFile', loc.node.uri); return true; } catch (e) {}
  }
  return false;
}

/* ---- пошаговый прогресс ---- */
function stepsHtml(rows) {
  return rows.map(function(r) {
    return '<div id="' + r[0] + '" style="display:flex;gap:10px;align-items:center;padding:7px 0;font-size:13.5px;color:var(--txt3)">'
      + '<span class="stic" style="width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px"></span>'
      + '<span>' + r[1] + '</span></div>';
  }).join('');
}

function setStep(id, st) {
  const el = document.getElementById(id);
  if (!el) return;
  const ic = el.querySelector('.stic');
  if (st === 'run') {
    ic.style.borderColor = 'var(--acc)';
    ic.style.borderTopColor = 'transparent';
    ic.style.animation = 'spin 1s linear infinite';
    el.style.color = 'var(--txt2)';
  } else if (st === 'ok') {
    ic.style.animation = 'none';
    ic.style.background = 'var(--ok)';
    ic.style.borderColor = 'var(--ok)';
    ic.textContent = '✓';
    ic.style.color = '#0e0e12';
    el.style.color = 'var(--txt2)';
  } else {
    ic.style.animation = 'none';
    ic.style.background = 'var(--err)';
    ic.style.borderColor = 'var(--err)';
    ic.textContent = '!';
    ic.style.color = '#0e0e12';
    el.style.color = 'var(--err)';
  }
}

/* ---- установка с прогрессом ---- */
async function installCompanion() {
  if (!state.project) { toast('Сначала открой проект'); closeSheet(); return; }
  closeSheet();

  const dlgPromise = appDialog('Установка Companion', stepsHtml([
    ['st1', 'Читаю дерево проекта'],
    ['st2', 'Убираю старые файлы обмена'],
    ['st3', 'Папка addons/godot_ai_studio'],
    ['st4', 'Запись plugin.cfg'],
    ['st5', 'Запись gas_companion.gd'],
    ['st6', 'Проверка project.godot']
  ]), { confirm: false, okText: 'ОК' });
  document.getElementById('dlgOk').style.display = 'none';

  try {
    setStep('st1', 'run');
    let res = await refreshTreeSilent();
    let tree = res.tree;
    setStep('st1', 'ok');

    setStep('st2', 'run');
    let cleaned = false;
    const junk = (tree.children || []).filter(function(c) {
      return c.type === 'file' && (
        (c.name.indexOf('gas_') === 0 && c.name.endsWith('.txt')) ||
        c.name === GAS_RESP_TMP);
    });
    for (let i = 0; i < junk.length; i++) {
      try { await bridgeAsync('deleteFile', junk[i].uri); cleaned = true; } catch (e) {}
    }
    if (cleaned) {
      res = await refreshTreeSilent();
      tree = res.tree;
    }
    setStep('st2', 'ok');

    setStep('st3', 'run');
    let addons = await ensureFolder(tree, 'addons');
    let dir = await ensureFolder(addons, 'godot_ai_studio');
    const dirBad = (dir.children || []).filter(function(c) {
      return c.type === 'file' && c.name.endsWith('.txt');
    });
    for (let i = 0; i < dirBad.length; i++) {
      try { await bridgeAsync('deleteFile', dirBad[i].uri); } catch (e) {}
    }
    if (dirBad.length) {
      res = await refreshTreeSilent();
      tree = res.tree;
      addons = await ensureFolder(tree, 'addons');
      dir = await ensureFolder(addons, 'godot_ai_studio');
    }
    setStep('st3', 'ok');

    setStep('st4', 'run');
    await upsertFile(dir, 'plugin.cfg', PLUGIN_CFG);
    setStep('st4', 'ok');

    setStep('st5', 'run');
    res = await refreshTreeSilent();
    tree = res.tree;
    addons = findFolder(tree, 'addons') || addons;
    dir = findFolder(addons, 'godot_ai_studio') || dir;
    await upsertFile(dir, 'gas_companion.gd', PLUGIN_GD);
    setStep('st5', 'ok');

    setStep('st6', 'run');
    res = await refreshTreeSilent();
    tree = res.tree;
    const godotLoc = locateUriByName(tree, 'project.godot');
    let needsChange = false;
    if (godotLoc) {
      const content = await bridgeAsync('readFile', godotLoc.node.uri);
      if (String(content).indexOf('godot_ai_studio/plugin.cfg') < 0) {
        needsChange = true;
        proposeChange({
          action: 'modify',
          path: 'project.godot',
          uri: godotLoc.node.uri,
          content: content + '\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/godot_ai_studio/plugin.cfg")\n'
        });
      }
    }
    setStep('st6', 'ok');
    onProjectLoaded(res);

    let finalHtml;
    if (needsChange) {
      finalHtml = '<div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);border-radius:10px;padding:10px;margin-bottom:8px"><span style="color:var(--ok);font-weight:600">✓ Плагин записан</span></div>'
        + '<p style="font-size:14px;color:var(--txt2);margin-bottom:8px">Осталось применить изменение <b>project.godot</b> — без него Godot не включит плагин.</p>'
        + '<p style="font-size:13px;color:var(--txt3)">После применения перезапусти Godot Editor.</p>';
    } else {
      finalHtml = '<div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);border-radius:10px;padding:10px;margin-bottom:8px"><span style="color:var(--ok);font-weight:600">✓ Плагин на месте (0.3.1)</span></div>'
        + '<p style="font-size:13px;color:var(--txt3)">Перезапускать редактор не нужно, если он уже запущен с этой версией.</p>';
    }
    document.getElementById('dlgBody').innerHTML = finalHtml;
    document.getElementById('dlgOk').style.display = '';
    const r = await dlgPromise;
    if (r && needsChange) {
      showScreen('scr-files');
      const t = document.getElementById('tabChangesLabel');
      if (t) switchTab(t, 'changes');
    }
  } catch (e) {
    document.getElementById('dlgBody').innerHTML =
      '<div style="color:var(--err)">Ошибка установки: ' + escapeHtml(e.message) + '</div>';
    document.getElementById('dlgOk').style.display = '';
    await dlgPromise;
  }
}

/* ---- диагностика пульса ---- */
async function diagnoseAlive(tree) {
  const loc = locateUriByName(tree, GAS_ALIVE);
  const cmdLoc = locateUriByName(tree, GAS_CMD);
  if (!loc) {
    return { kind: cmdLoc ? 'cmd_stuck' : 'nohb', resPath: '' };
  }
  try {
    const j = await readJsonObject(loc.node.uri);
    if (!j || typeof j.t !== 'number') return { kind: 'nohb', resPath: '' };
    const age = Math.abs(Date.now() / 1000 - j.t);
    return { kind: age < 15 ? 'fresh' : 'stale', resPath: j.res || '' };
  } catch (e) {
    return { kind: 'nohb', resPath: '' };
  }
}

function diagnoseHtml(d, tree) {
  const appName = tree && tree.name ? tree.name : state.project.name;
  const pathLine = d.resPath
    ? '<p style="font-size:12.5px;color:var(--txt3);margin-bottom:8px">Путь проекта редактора: <span style="font-family:monospace;color:var(--txt2)">' + escapeHtml(d.resPath) + '</span><br>Папка в приложении: <span style="font-family:monospace;color:var(--txt2)">' + escapeHtml(appName) + '</span></p>'
    : '';
  if (d.kind === 'cmd_stuck') {
    return '<p style="color:var(--warn);margin-bottom:8px">Команда лежит в папке, но редактор её не забирает.</p>' + pathLine
      + '<p style="font-size:13px;color:var(--txt2);line-height:1.6">Либо плагин не запущен («Модули» → галка «Вкл», перезапуск редактора), либо редактор открыл ДРУГОЙ проект — сверь пути выше.</p>';
  }
  if (d.kind === 'nohb') {
    return '<p style="color:var(--warn);margin-bottom:8px">Плагин не подаёт признаков жизни.</p>' + pathLine
      + '<p style="font-size:13px;color:var(--txt2);line-height:1.6">Файл-пульс не найден. Проверь: 1) проект открыт в Godot Editor; 2) «Модули» → галка «Вкл»; 3) редактор перезапустился после обновления плагина; 4) в консоли редактора есть [GasCompanion] active.</p>';
  }
  if (d.kind === 'stale') {
    return '<p style="color:var(--warn);margin-bottom:8px">Пульс есть, но старый.</p>' + pathLine
      + '<p style="font-size:13px;color:var(--txt2);line-height:1.6">Редактор работал раньше, но сейчас цикл остановлен. Перезапусти Godot Editor и повтори.</p>';
  }
  return '<p style="color:var(--warn);margin-bottom:8px">Плагин жив, но не ответил на команду.</p>' + pathLine
    + '<p style="font-size:13px;color:var(--txt2);line-height:1.6">Пульс свежий, команда ушла в папку, но ответа нет. Сверь пути выше: если путь редактора отличается от папки приложения — редактор открыл другую копию проекта.</p>';
}

/* ---- отправка команды с прогрессом ---- */
function waitHtml(sceneCmd) {
  return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
    + '<div style="width:26px;height:26px;border-radius:50%;border:2px solid var(--acc);border-top-color:transparent;animation:spin 1s linear infinite;flex-shrink:0"></div>'
    + '<div style="font-size:14px;color:var(--txt2)">Жду ответ редактора… <span id="dlgWaitSec" style="color:var(--txt);font-weight:600">0</span> с</div></div>'
    + '<div id="dlgAttempt" style="font-size:12.5px;color:var(--txt3);margin-bottom:10px">Отправка команды...</div>'
    + (sceneCmd
      ? '<div style="font-size:12px;color:var(--warn);margin-bottom:6px">Команды сцен выполняются, только когда редактор активен. Если ответа нет — открой Godot Editor на пару секунд и вернись.</div>'
      : '<div style="font-size:12px;color:var(--txt3);margin-bottom:6px">Ping работает даже когда редактор свёрнут.</div>')
    + '<div style="font-size:12px;color:var(--txt3)">Обмен: gas_cmd.json → gas_resp.json в корне проекта.</div>';
}

function setAttempt(text) {
  const el = document.getElementById('dlgAttempt');
  if (el) el.textContent = text;
}

async function sendCompanionCommand(cmdObj, title) {
  if (!state.project) { toast('Сначала открой проект'); return; }
  closeSheet();
  cmdObj.ts = Date.now() / 1000;
  const sceneCmd = cmdObj.cmd !== 'ping';

  let cancelled = false;
  const dlgPromise = appDialog(title, waitHtml(sceneCmd), { confirm: true, okText: 'ОК' });
  dlgPromise.then(function(r) { if (!r) cancelled = true; });
  document.getElementById('dlgOk').style.display = 'none';
  document.getElementById('dlgCancel').textContent = 'Отмена';

  const t0 = Date.now();
  const secIv = setInterval(function() {
    const el = document.getElementById('dlgWaitSec');
    if (el) el.textContent = String(Math.floor((Date.now() - t0) / 1000));
  }, 1000);

  let respObj = null;
  let lastTree = null;
  try {
    let res = await refreshTreeSilent();
    let tree = res.tree;

    let removed = false;
    removed = await removeExchangeFile(tree, GAS_CMD) || removed;
    removed = await removeExchangeFile(tree, GAS_RESP) || removed;
    removed = await removeExchangeFile(tree, GAS_RESP_TMP) || removed;
    if (removed) {
      res = await refreshTreeSilent();
      tree = res.tree;
    }

    setAttempt('Записываю команду...');
    await bridgeAsync('createFile', tree.uri, GAS_CMD, JSON.stringify(cmdObj));
    setAttempt('Команда записана. Опрашиваю папку проекта...');

    for (let i = 0; i < 20; i++) {
      if (cancelled) break;
      await new Promise(function(r) { setTimeout(r, 2000); });
      if (cancelled) break;
      res = await refreshTreeSilent();
      lastTree = res.tree;
      setAttempt('Проверка папки... попытка ' + (i + 1) + '/20');
      const respLoc = locateUriByName(res.tree, GAS_RESP);
      if (respLoc) {
        respObj = await readJsonObject(respLoc.node.uri);
        await bridgeAsync('deleteFile', respLoc.node.uri);
        if (!respObj) {
          await new Promise(function(r) { setTimeout(r, 800); });
          const res2 = await refreshTreeSilent();
          const loc2 = locateUriByName(res2.tree, GAS_RESP);
          if (loc2) {
            respObj = await readJsonObject(loc2.node.uri);
            await bridgeAsync('deleteFile', loc2.node.uri);
          }
        }
        break;
      }
    }
  } catch (e) {
    clearInterval(secIv);
    if (!cancelled) {
      document.getElementById('dlgOk').style.display = '';
      document.getElementById('dlgCancel').style.display = 'none';
      document.getElementById('dlgBody').innerHTML =
        '<div style="color:var(--err)">Ошибка: ' + escapeHtml(e.message) + '</div>';
      await dlgPromise;
    }
    return;
  }

  clearInterval(secIv);
  if (cancelled) return;
  if (lastTree) onProjectLoaded(lastTree);

  let bodyHtml = '';
  if (respObj) {
    if (respObj.ok) {
      bodyHtml = '<div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);border-radius:10px;padding:10px;margin-bottom:8px"><span style="color:var(--ok);font-weight:600">✓ Редактор ответил за '
        + Math.floor((Date.now() - t0) / 1000) + ' с</span></div>'
        + (respObj.result && respObj.result.project
          ? '<p style="font-size:12.5px;color:var(--txt3);margin-bottom:8px">Проект редактора: <span style="font-family:monospace;color:var(--txt2)">' + escapeHtml(respObj.result.project) + '</span></p>' : '')
        + '<div style="white-space:pre-wrap;font-family:\'SF Mono\',Menlo,monospace;font-size:12px;color:var(--txt2)">'
        + escapeHtml(JSON.stringify(respObj.result, null, 2)) + '</div>';
    } else {
      bodyHtml = '<div style="background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:10px;padding:10px"><span style="color:var(--err);font-weight:600">Ошибка редактора:</span> '
        + escapeHtml(respObj.error || 'неизвестная') + '</div>';
    }
  } else {
    const d = await diagnoseAlive(lastTree || state.project.files);
    bodyHtml = diagnoseHtml(d, lastTree || state.project.files);
  }

  document.getElementById('dlgOk').style.display = '';
  document.getElementById('dlgCancel').style.display = 'none';
  document.getElementById('dlgBody').innerHTML = bodyHtml;
  await dlgPromise;
}

function companionPing() {
  sendCompanionCommand({ cmd: 'ping' }, 'Связь с Godot Editor');
}

function companionCreateNode() {
  sendCompanionCommand({ cmd: 'create_node', parent: '', type: 'Node3D', name: 'GasTestNode' }, 'Создание ноды редактором');
}
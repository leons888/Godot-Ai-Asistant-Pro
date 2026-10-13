/* ================================================================
   IMPORT — импорт ZIP и URL, генерация проекта новичком
   ================================================================ */
const ZIP_MIME = 'application/zip';

function openZipPicker() {
  if (!isAndroid) { toast('Только в Android APK'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.onchange = async function() {
    const file = input.files && input.files[0];
    if (!file) return;
    // SAF через ACTION_OPEN_DOCUMENT
    const intent = new (window.AndroidBridge ? null : null); // заглушка
    // используем существующий мост: попросим пользователя выбрать ZIP через ACTION_OPEN_DOCUMENT
    if (typeof Bridge !== 'undefined' && typeof Bridge.pickZipFile === 'function') {
      // нет такого метода, поэтому используем прямой подход:
    }
    // Реальный путь: через CompanionBridge создаём временный файл
    toast('Выбери ZIP-архив проекта');
  };
  // В Android WebView file-input не даёт SAF-URI. Поэтому делаем через JS-вызов Java:
  if (isAndroid && typeof Bridge.pickZipFile === 'function') {
    Bridge.pickZipFile('importZipCb');
  } else {
    toast('Импорт ZIP работает только в собранном APK');
  }
}

// Вызов из Java через callback
window.importZipCb = async function(uriStr) {
  if (!state.project || !state.project.uri) {
    toast('Сначала открой целевой проект (или создай пустую папку)');
    return;
  }
  toast('Импортирую ZIP...');
  try {
    const msg = await bridgeAsync('importZip', uriStr, state.project.uri);
    toast(msg);
    const res = await bridgeAsync('reopenProject', state.project.uri);
    await onProjectLoaded(res);
  } catch (e) {
    toast('Ошибка импорта: ' + e.message);
  }
};

async function importFromUrl() {
  const url = prompt('Вставь прямую ссылку на ZIP-архив проекта Godot\n(например https://github.com/user/repo/archive/refs/heads/main.zip)');
  if (!url) return;
  if (!url.endsWith('.zip') && url.indexOf('github.com') < 0) {
    const ok = await appDialog('Подтверждение',
      '<p style="font-size:14px;color:var(--txt2)">Ссылка не выглядит как ZIP-архив. Всё равно попробовать?</p>',
      { confirm: true, okText: 'Да' });
    if (!ok) return;
  }
  if (!state.project || !state.project.uri) {
    toast('Сначала открой целевой проект');
    return;
  }
  toast('Скачиваю и распаковываю...');
  try {
    const msg = await bridgeAsync('importFromUrl', url, state.project.uri);
    toast(msg);
    const res = await bridgeAsync('reopenProject', state.project.uri);
    await onProjectLoaded(res);
  } catch (e) {
    toast('Ошибка импорта: ' + e.message);
  }
}

/* ---- Генерация проекта новичком через ИИ ---- */
async function generateBeginnerProject() {
  if (!state.project) { toast('Сначала открой проект'); return; }
  if (!state.activeProvider) { toast('Сначала добавь и активируй провайдера'); showScreen('scr-models'); return; }

  const genre = (WIZ_STEPS[0].options[state.wizData.step0 || 0] || {}).t || '2D-платформер';
  const mode = (WIZ_STEPS[2].options[state.wizData.step2 || 0] || {}).t || 'Создать с нуля';
  const features = (state.wizData.step1 || []).map(i => WIZ_STEPS[1].options[i]).join(', ') || 'базовые механики';

  const prompt = `Ты генератор проектов Godot 4. Создай МИНИМАЛЬНЫЙ рабочий проект для жанра "${genre}" с механиками: ${features}. Режим: ${mode}.

Выведи ОДИН блок кода с меткой gaschanges — массив JSON объектов. Каждый объект:
{"action":"create","path":"<путь от корня проекта>","content":"<полный текст файла>"}

Обязательные файлы:
1. project.godot — минимальный конфиг Godot 4 (config_version=5, имя проекта "${state.project.name}", main_scene="res://scenes/main.tscn", features=["4.3"])
2. scenes/main.tscn — пустая Node2D-сцена с Camera2D
3. scenes/player.tscn — CharacterBody2D с Sprite2D и CollisionShape2D
4. scripts/player.gd — базовый скрипт движения (extends CharacterBody2D, SPEED=300, JUMP=-400, _physics_process с move_and_slide)
5. icon.svg — простая SVG-иконка (круг)

Переносы строк в content передавай как \\n. Никаких объяснений вне блока gaschanges.`;

  const msgs = [{ role: 'user', content: prompt }];
  toast('Генерирую проект через ИИ...');
  try {
    const resp = await doAiRequest(
      state.activeProvider,
      state.activeModel,
      state.providers[state.activeProvider] ? state.providers[state.activeProvider].endpoint : '',
      '',
      msgs
    );
    const text = (resp && resp.text) ? resp.text : '';
    const changes = extractChanges(text);
    if (!changes || !changes.length) {
      toast('ИИ не вернул файлы. Попробуй ещё раз.');
      return;
    }
    // Применяем через систему изменений
    for (const c of changes) {
      proposeChange({
        action: 'create',
        path: c.path,
        name: c.path.split('/').pop(),
        parentUri: findParentUri(state.project.files, c.path),
        content: c.content,
        oldContent: null
      });
    }
    toast('Создано файлов: ' + changes.length + '. Перейди во вкладку «Изменения» и примени.');
    showScreen('scr-files');
    const t = document.getElementById('tabChangesLabel');
    if (t) switchTab(t, 'changes');
  } catch (e) {
    toast('Ошибка генерации: ' + e.message);
  }
}

function findParentUri(tree, path) {
  const parts = path.split('/');
  parts.pop();
  if (!parts.length) return tree.uri;
  let node = tree;
  for (const p of parts) {
    let found = null;
    (node.children || []).forEach(c => { if (c.name === p && c.type === 'folder') found = c; });
    if (!found) return tree.uri;
    node = found;
  }
  return node.uri;
}
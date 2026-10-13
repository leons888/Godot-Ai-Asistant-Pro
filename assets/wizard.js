/* ================================================================
   WIZARD — мастер создания игры + генератор готовых проектов
   (управление: сенсорные кнопки на экране + клавиатура)
   ================================================================ */
const WIZ_STEPS = [
  { title:'Какую игру хочешь создать?', sub:'Выбери жанр', type:'grid', options:[
    { t:'2D-платформер', s:'Прыжки, уровни', i:'🏃' },
    { t:'2D вид сверху', s:'RPG, аркада', i:'🗺️' },
    { t:'3D от первого лица', s:'Шутер, исследование', i:'🎯' },
    { t:'3D от третьего лица', s:'Приключения', i:'🦸' },
    { t:'Хоррор', s:'Атмосфера, страх', i:'👻' },
    { t:'Выживание', s:'Ресурсы, крафт', i:'🏕️' },
    { t:'Головоломка', s:'Логика, механики', i:'🧩' },
    { t:'Гонка', s:'Трассы, машины', i:'🏎️' },
    { t:'Своя идея', s:'Опишу текстом', i:'✨' }
  ]},
  { title:'Какие механики добавить?', sub:'Можно выбрать несколько', type:'chips', options:[
    'Управление персонажем','Прыжки и препятствия','Враги и сражения',
    'Инвентарь','Здоровье и выносливость','Диалоги с NPC',
    'Сохранение прогресса','Главное меню','Уровни / главы',
    'Звуки и музыка','Частицы и эффекты','Анимации персонажа'
  ]},
  { title:'Как будем работать?', sub:'Выбери режим разработки', type:'grid-big', options:[
    { t:'Создать с нуля', s:'Файлы, сцены и скрипты с самого начала', i:'🌱' },
    { t:'Использовать готовый', s:'Шаблон похожего проекта', i:'📦' },
    { t:'Улучшить существующий', s:'Анализ и улучшения', i:'⚡' }
  ]},
  { title:'План разработки', sub:'Проверь и запусти', type:'plan' }
];

function openWizard(){
  state.wizStep = 0; state.wizData = {};
  showScreen('scr-wizard'); renderWizard();
}
function closeWizard(){ showScreen('scr-studio'); }

function renderWizard(){
  const step = WIZ_STEPS[state.wizStep];
  document.getElementById('wizProgress').innerHTML = WIZ_STEPS.map(function(_, i) {
    const cls = i < state.wizStep ? 'done' : (i === state.wizStep ? 'cur' : '');
    return '<div class="step ' + cls + '"></div>';
  }).join('');
  document.getElementById('wizStepLabel').textContent = state.wizStep + 1;
  document.getElementById('wizTopTitle').textContent = step.title;

  let html = '<div class="wiz-title"><h2>' + step.title + '</h2><p>' + step.sub + '</p></div>';
  if (step.type === 'grid' || step.type === 'grid-big') {
    const big = step.type === 'grid-big';
    html += (big ? '<div class="section">' : '<div class="wiz-options">');
    step.options.forEach(function(o, i) {
      const sel = state.wizData['step' + state.wizStep] === i ? 'sel' : '';
      if (big) {
        html += '<div class="opt ' + sel + '" style="flex-direction:row;align-items:center;gap:14px;padding:16px;margin-bottom:10px" onclick="pickWiz(' + i + ')">'
          + '<div class="oico" style="width:46px;height:46px;font-size:22px">' + o.i + '</div>'
          + '<div><div class="otitle">' + o.t + '</div><div class="osub" style="margin-top:3px">' + o.s + '</div></div></div>';
      } else {
        html += '<div class="opt ' + sel + '" onclick="pickWiz(' + i + ')">'
          + '<div class="oico">' + o.i + '</div>'
          + '<div class="otitle">' + o.t + '</div>'
          + '<div class="osub">' + o.s + '</div></div>';
      }
    });
    html += (big ? '</div>' : '</div>');
  } else if (step.type === 'chips') {
    const sel = state.wizData['step' + state.wizStep] || [];
    html += '<div class="section"><div class="chips">';
    step.options.forEach(function(o, i) {
      const on = sel.indexOf(i) >= 0 ? 'sel' : '';
      html += '<div class="chip ' + on + '" onclick="toggleChip(' + i + ')">' + o + '</div>';
    });
    html += '</div></div>';
  } else if (step.type === 'plan') {
    const genre = (WIZ_STEPS[0].options[state.wizData.step0 || 0] || {}).t || 'игра';
    const mode = (WIZ_STEPS[2].options[state.wizData.step2 || 0] || {}).t || '—';
    const features = (state.wizData.step1 || []).map(function(i) { return WIZ_STEPS[1].options[i]; }).join(', ') || 'базовые механики';
    html += '<div class="section"><div class="card" style="margin-bottom:14px">'
      + '<h3 style="color:var(--acc2)">Итоговая идея</h3>'
      + '<p style="margin-top:6px"><b>Жанр:</b> ' + genre + '</p>'
      + '<p><b>Механики:</b> ' + features + '</p>'
      + '<p><b>Режим:</b> ' + mode + '</p></div>'
      + '<h2 style="font-size:12px;color:var(--txt3);text-transform:uppercase;margin:8px 0 8px">Этапы</h2>'
      + '<div class="plan">'
      + '<div class="plan-step"><div class="pnum">1</div><div class="pbody"><div class="ptitle">Создать структуру проекта</div><div class="psub">project.godot, главная сцена</div></div></div>'
      + '<div class="plan-step"><div class="pnum">2</div><div class="pbody"><div class="ptitle">Игровой персонаж</div><div class="psub">Управление: сенсорные кнопки + клавиатура</div></div></div>'
      + '<div class="plan-step"><div class="pnum">3</div><div class="pbody"><div class="ptitle">Мир и препятствия</div><div class="psub">Земля, стены, освещение, камера</div></div></div>'
      + '<div class="plan-step"><div class="pnum">4</div><div class="pbody"><div class="ptitle">Проверить запуском</div><div class="psub">В Godot нажать ▶ — игра работает сразу</div></div></div>'
      + '<div class="plan-step"><div class="pnum">5</div><div class="pbody"><div class="ptitle">Развивать игру</div><div class="psub">Механики: ' + features + '</div></div></div>'
      + '</div></div>';
  }
  document.getElementById('wizContent').innerHTML = html;
  document.getElementById('wizBackBtn').style.visibility = state.wizStep === 0 ? 'hidden' : 'visible';
  const nextBtn = document.getElementById('wizNextBtn');
  nextBtn.textContent = state.wizStep === WIZ_STEPS.length - 1 ? 'Начать разработку'
    : state.wizStep === WIZ_STEPS.length - 2 ? 'Создать план игры' : 'Далее';
}

function pickWiz(i){ state.wizData['step' + state.wizStep] = i; renderWizard(); }
function toggleChip(i){
  const arr = state.wizData['step' + state.wizStep] || [];
  const idx = arr.indexOf(i);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(i);
  state.wizData['step' + state.wizStep] = arr;
  renderWizard();
}

function wizardNext(){
  if (state.wizStep === WIZ_STEPS.length - 1){
    startGeneration();
    return;
  }
  state.wizStep++; renderWizard();
  document.getElementById('wizContent').scrollTop = 0;
}
function wizardBack(){
  if (state.wizStep === 0){ closeWizard(); return; }
  state.wizStep--; renderWizard();
  document.getElementById('wizContent').scrollTop = 0;
}

/* ================================================================
   ГЕНЕРАТОР: файлы в корне, сенсорные кнопки, main_scene готов
   ================================================================ */
function wizardConfig() {
  const g = state.wizData.step0 || 0;
  const is3D = (g === 2 || g === 3 || g === 4 || g === 5);
  const topdown = (g === 1 || g === 6 || g === 7);
  const thirdPerson = (g === 3 || g === 5);
  return { is3D: is3D, topdown: topdown, thirdPerson: thirdPerson, name: 'My Game' };
}

/* ---- скрипты игрока с сенсорным управлением ---- */
function gdPlayer2DPlatformer() {
  return [
'extends CharacterBody2D','',
'const SPEED := 260.0',
'const JUMP := -430.0',
'var gravity: int = ProjectSettings.get_setting("physics/2d/default_gravity")',
'var touch_left := false',
'var touch_right := false','',
'func _physics_process(delta: float) -> void:',
'    if not is_on_floor():',
'        velocity.y += gravity * delta',
'    if Input.is_action_just_pressed("ui_accept") and is_on_floor():',
'        velocity.y = JUMP',
'    var dir := Input.get_axis("ui_left", "ui_right")',
'    if touch_left: dir -= 1.0',
'    if touch_right: dir += 1.0',
'    dir = clampf(dir, -1.0, 1.0)',
'    velocity.x = dir * SPEED',
'    move_and_slide()','',
'func _on_left_down() -> void:',
'    touch_left = true','',
'func _on_left_up() -> void:',
'    touch_left = false','',
'func _on_right_down() -> void:',
'    touch_right = true','',
'func _on_right_up() -> void:',
'    touch_right = false','',
'func _on_jump_down() -> void:',
'    if is_on_floor():',
'        velocity.y = JUMP',''
  ].join('\n');
}

function gdPlayer2DTopdown() {
  return [
'extends CharacterBody2D','',
'const SPEED := 220.0',
'var t_left := false',
'var t_right := false',
'var t_up := false',
'var t_down := false','',
'func _physics_process(delta: float) -> void:',
'    var dir := Vector2.ZERO',
'    if Input.is_action_pressed("ui_right"): dir.x += 1',
'    if Input.is_action_pressed("ui_left"): dir.x -= 1',
'    if Input.is_action_pressed("ui_down"): dir.y += 1',
'    if Input.is_action_pressed("ui_up"): dir.y -= 1',
'    if t_left: dir.x -= 1',
'    if t_right: dir.x += 1',
'    if t_up: dir.y -= 1',
'    if t_down: dir.y += 1',
'    velocity = dir.normalized() * SPEED',
'    move_and_slide()','',
'func _on_left_down() -> void:',
'    t_left = true','',
'func _on_left_up() -> void:',
'    t_left = false','',
'func _on_right_down() -> void:',
'    t_right = true','',
'func _on_right_up() -> void:',
'    t_right = false','',
'func _on_up_down() -> void:',
'    t_up = true','',
'func _on_up_up() -> void:',
'    t_up = false','',
'func _on_down_down() -> void:',
'    t_down = true','',
'func _on_down_up() -> void:',
'    t_down = false',''
  ].join('\n');
}

function gdPlayer3D() {
  return [
'extends CharacterBody3D','',
'const SPEED := 5.0',
'const JUMP := 4.5',
'var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")',
'var t_left := false',
'var t_right := false',
'var t_fwd := false',
'var t_back := false','',
'func _physics_process(delta: float) -> void:',
'    if not is_on_floor():',
'        velocity.y -= gravity * delta',
'    var dir := Vector3.ZERO',
'    if Input.is_action_pressed("ui_right"): dir.x += 1',
'    if Input.is_action_pressed("ui_left"): dir.x -= 1',
'    if Input.is_action_pressed("ui_down"): dir.z += 1',
'    if Input.is_action_pressed("ui_up"): dir.z -= 1',
'    if t_left: dir.x -= 1',
'    if t_right: dir.x += 1',
'    if t_fwd: dir.z -= 1',
'    if t_back: dir.z += 1',
'    velocity.x = dir.x * SPEED',
'    velocity.z = dir.z * SPEED',
'    move_and_slide()','',
'func _on_left_down() -> void:',
'    t_left = true','',
'func _on_left_up() -> void:',
'    t_left = false','',
'func _on_right_down() -> void:',
'    t_right = true','',
'func _on_right_up() -> void:',
'    t_right = false','',
'func _on_fwd_down() -> void:',
'    t_fwd = true','',
'func _on_fwd_up() -> void:',
'    t_fwd = false','',
'func _on_back_down() -> void:',
'    t_back = true','',
'func _on_back_up() -> void:',
'    t_back = false','',
'func _on_jump_down() -> void:',
'    if is_on_floor():',
'        velocity.y = JUMP',''
  ].join('\n');
}

/* ---- сенсорные кнопки (с якорями — подстраиваются под любой экран) ---- */
function uiButtons2DPlatformer() {
  return [
'[node name="UI" type="CanvasLayer" parent="."]','',
'[node name="BtnLeft" type="Button" parent="UI"]',
'anchors_preset = 2',
'anchor_top = 1.0','anchor_bottom = 1.0',
'offset_left = 24.0','offset_top = -120.0','offset_right = 124.0','offset_bottom = -20.0',
'text = "←"','',
'[node name="BtnRight" type="Button" parent="UI"]',
'anchors_preset = 2',
'anchor_top = 1.0','anchor_bottom = 1.0',
'offset_left = 144.0','offset_top = -120.0','offset_right = 244.0','offset_bottom = -20.0',
'text = "→"','',
'[node name="BtnJump" type="Button" parent="UI"]',
'anchors_preset = 3',
'anchor_left = 1.0','anchor_top = 1.0','anchor_right = 1.0','anchor_bottom = 1.0',
'offset_left = -124.0','offset_top = -120.0','offset_right = -24.0','offset_bottom = -20.0',
'text = "ПРЫЖОК"','',
'[connection signal="button_down" from="UI/BtnLeft" to="Player" method="_on_left_down"]',
'[connection signal="button_up" from="UI/BtnLeft" to="Player" method="_on_left_up"]',
'[connection signal="button_down" from="UI/BtnRight" to="Player" method="_on_right_down"]',
'[connection signal="button_up" from="UI/BtnRight" to="Player" method="_on_right_up"]',
'[connection signal="button_down" from="UI/BtnJump" to="Player" method="_on_jump_down"]',''
  ].join('\n');
}

function uiButtons2DTopdown() {
  return [
'[node name="UI" type="CanvasLayer" parent="."]','',
'[node name="BtnLeft" type="Button" parent="UI"]',
'anchors_preset = 2',
'anchor_top = 1.0','anchor_bottom = 1.0',
'offset_left = 24.0','offset_top = -120.0','offset_right = 124.0','offset_bottom = -20.0',
'text = "←"','',
'[node name="BtnRight" type="Button" parent="UI"]',
'anchors_preset = 2',
'anchor_top = 1.0','anchor_bottom = 1.0',
'offset_left = 144.0','offset_top = -120.0','offset_right = 244.0','offset_bottom = -20.0',
'text = "→"','',
'[node name="BtnUp" type="Button" parent="UI"]',
'anchors_preset = 3',
'anchor_left = 1.0','anchor_top = 1.0','anchor_right = 1.0','anchor_bottom = 1.0',
'offset_left = -124.0','offset_top = -240.0','offset_right = -24.0','offset_bottom = -140.0',
'text = "↑"','',
'[node name="BtnDown" type="Button" parent="UI"]',
'anchors_preset = 3',
'anchor_left = 1.0','anchor_top = 1.0','anchor_right = 1.0','anchor_bottom = 1.0',
'offset_left = -124.0','offset_top = -120.0','offset_right = -24.0','offset_bottom = -20.0',
'text = "↓"','',
'[connection signal="button_down" from="UI/BtnLeft" to="Player" method="_on_left_down"]',
'[connection signal="button_up" from="UI/BtnLeft" to="Player" method="_on_left_up"]',
'[connection signal="button_down" from="UI/BtnRight" to="Player" method="_on_right_down"]',
'[connection signal="button_up" from="UI/BtnRight" to="Player" method="_on_right_up"]',
'[connection signal="button_down" from="UI/BtnUp" to="Player" method="_on_up_down"]',
'[connection signal="button_up" from="UI/BtnUp" to="Player" method="_on_up_up"]',
'[connection signal="button_down" from="UI/BtnDown" to="Player" method="_on_down_down"]',
'[connection signal="button_up" from="UI/BtnDown" to="Player" method="_on_down_up"]',''
  ].join('\n');
}

function uiButtons3D() {
  return [
'[node name="UI" type="CanvasLayer" parent="."]','',
'[node name="BtnLeft" type="Button" parent="UI"]',
'anchors_preset = 2',
'anchor_top = 1.0','anchor_bottom = 1.0',
'offset_left = 24.0','offset_top = -120.0','offset_right = 124.0','offset_bottom = -20.0',
'text = "←"','',
'[node name="BtnRight" type="Button" parent="UI"]',
'anchors_preset = 2',
'anchor_top = 1.0','anchor_bottom = 1.0',
'offset_left = 144.0','offset_top = -120.0','offset_right = 244.0','offset_bottom = -20.0',
'text = "→"','',
'[node name="BtnFwd" type="Button" parent="UI"]',
'anchors_preset = 3',
'anchor_left = 1.0','anchor_top = 1.0','anchor_right = 1.0','anchor_bottom = 1.0',
'offset_left = -124.0','offset_top = -240.0','offset_right = -24.0','offset_bottom = -140.0',
'text = "↑"','',
'[node name="BtnBack" type="Button" parent="UI"]',
'anchors_preset = 3',
'anchor_left = 1.0','anchor_top = 1.0','anchor_right = 1.0','anchor_bottom = 1.0',
'offset_left = -124.0','offset_top = -120.0','offset_right = -24.0','offset_bottom = -20.0',
'text = "↓"','',
'[node name="BtnJump" type="Button" parent="UI"]',
'anchors_preset = 3',
'anchor_left = 1.0','anchor_top = 1.0','anchor_right = 1.0','anchor_bottom = 1.0',
'offset_left = -244.0','offset_top = -120.0','offset_right = -144.0','offset_bottom = -20.0',
'text = "ПРЫЖОК"','',
'[connection signal="button_down" from="UI/BtnLeft" to="Player" method="_on_left_down"]',
'[connection signal="button_up" from="UI/BtnLeft" to="Player" method="_on_left_up"]',
'[connection signal="button_down" from="UI/BtnRight" to="Player" method="_on_right_down"]',
'[connection signal="button_up" from="UI/BtnRight" to="Player" method="_on_right_up"]',
'[connection signal="button_down" from="UI/BtnFwd" to="Player" method="_on_fwd_down"]',
'[connection signal="button_up" from="UI/BtnFwd" to="Player" method="_on_fwd_up"]',
'[connection signal="button_down" from="UI/BtnBack" to="Player" method="_on_back_down"]',
'[connection signal="button_up" from="UI/BtnBack" to="Player" method="_on_back_up"]',
'[connection signal="button_down" from="UI/BtnJump" to="Player" method="_on_jump_down"]',''
  ].join('\n');
}

function hintLabel(text) {
  return [
'[node name="Hint" type="Label" parent="UI"]',
'anchors_preset = 10',
'anchor_right = 1.0',
'offset_left = 16.0','offset_top = 12.0','offset_right = -16.0','offset_bottom = 48.0',
'text = "' + text + '"',''
  ].join('\n');
}

/* ---- сцены ---- */
function tscn2DPlatformer() {
  return [
'[gd_scene load_steps=4 format=3]','',
'[ext_resource type="Script" path="res://player.gd" id="1"]','',
'[sub_resource type="RectangleShape2D" id="1"]',
'size = Vector2(28, 40)','',
'[sub_resource type="RectangleShape2D" id="2"]',
'size = Vector2(1400, 40)','',
'[node name="Main" type="Node2D"]','',
'[node name="Player" type="CharacterBody2D" parent="."]',
'position = Vector2(120, 180)',
'script = ExtResource("1")','',
'[node name="Body" type="Polygon2D" parent="Player"]',
'color = Color(0.62, 0.38, 1, 1)',
'polygon = PackedVector2Array(-14, -20, 14, -20, 14, 20, -14, 20)','',
'[node name="Collision" type="CollisionShape2D" parent="Player"]',
'shape = SubResource("1")','',
'[node name="Camera2D" type="Camera2D" parent="Player"]','',
'[node name="Ground" type="StaticBody2D" parent="."]',
'position = Vector2(480, 300)','',
'[node name="Visual" type="Polygon2D" parent="Ground"]',
'color = Color(0.22, 0.22, 0.28, 1)',
'polygon = PackedVector2Array(-700, -20, 700, -20, 700, 20, -700, 20)','',
'[node name="Collision" type="CollisionShape2D" parent="Ground"]',
'shape = SubResource("2")','',
uiButtons2DPlatformer(),
hintLabel('Экранные кнопки: ← → и ПРЫЖОК. На ПК работают стрелки и пробел. Игра готова — жми F5 или ▶ на телефоне!'),
  ].join('\n');
}

function tscn2DTopdown() {
  return [
'[gd_scene load_steps=7 format=3]','',
'[ext_resource type="Script" path="res://player.gd" id="1"]','',
'[sub_resource type="RectangleShape2D" id="1"]',
'size = Vector2(26, 26)','',
'[sub_resource type="RectangleShape2D" id="2"]',
'size = Vector2(1000, 24)','',
'[sub_resource type="RectangleShape2D" id="3"]',
'size = Vector2(1000, 24)','',
'[sub_resource type="RectangleShape2D" id="4"]',
'size = Vector2(24, 600)','',
'[sub_resource type="RectangleShape2D" id="5"]',
'size = Vector2(24, 600)','',
'[node name="Main" type="Node2D"]','',
'[node name="Player" type="CharacterBody2D" parent="."]',
'position = Vector2(480, 270)',
'script = ExtResource("1")','',
'[node name="Body" type="Polygon2D" parent="Player"]',
'color = Color(0.38, 0.8, 1, 1)',
'polygon = PackedVector2Array(-13, -13, 13, -13, 13, 13, -13, 13)','',
'[node name="Collision" type="CollisionShape2D" parent="Player"]',
'shape = SubResource("1")','',
'[node name="Camera2D" type="Camera2D" parent="Player"]','',
'[node name="WallTop" type="StaticBody2D" parent="."]',
'position = Vector2(480, -12)','',
'[node name="Collision" type="CollisionShape2D" parent="WallTop"]',
'shape = SubResource("2")','',
'[node name="WallBottom" type="StaticBody2D" parent="."]',
'position = Vector2(480, 552)','',
'[node name="Collision" type="CollisionShape2D" parent="WallBottom"]',
'shape = SubResource("3")','',
'[node name="WallLeft" type="StaticBody2D" parent="."]',
'position = Vector2(-12, 270)','',
'[node name="Collision" type="CollisionShape2D" parent="WallLeft"]',
'shape = SubResource("4")','',
'[node name="WallRight" type="StaticBody2D" parent="."]',
'position = Vector2(972, 270)','',
'[node name="Collision" type="CollisionShape2D" parent="WallRight"]',
'shape = SubResource("5")','',
uiButtons2DTopdown(),
hintLabel('Экранные кнопки-стрелки для движения. На ПК — стрелки клавиатуры. Игра готова — жми F5 или ▶!'),
  ].join('\n');
}

function tscn3D(thirdPerson) {
  const camTransform = thirdPerson
    ? 'transform = Transform3D(1, 0, 0, 0, 0.94, 0.342, 0, -0.342, 0.94, 0, 1.4, 3.4)'
    : 'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.45, 0)';
  return [
'[gd_scene load_steps=7 format=3]','',
'[ext_resource type="Script" path="res://player.gd" id="1"]','',
'[sub_resource type="Environment" id="1"]','',
'[sub_resource type="BoxMesh" id="2"]',
'size = Vector3(0.6, 1.2, 0.6)','',
'[sub_resource type="BoxShape3D" id="3"]',
'size = Vector3(0.6, 1.2, 0.6)','',
'[sub_resource type="BoxMesh" id="4"]',
'size = Vector3(24, 0.2, 24)','',
'[sub_resource type="BoxShape3D" id="5"]',
'size = Vector3(24, 0.2, 24)','',
'[node name="Main" type="Node3D"]','',
'[node name="WorldEnvironment" type="WorldEnvironment" parent="."]',
'environment = SubResource("1")','',
'[node name="Sun" type="DirectionalLight3D" parent="."]',
'transform = Transform3D(1, 0, 0, 0, 0.643, -0.766, 0, 0.766, 0.643, 0, 8, 0)','',
'[node name="Ground" type="StaticBody3D" parent="."]',
'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -0.1, 0)','',
'[node name="Visual" type="MeshInstance3D" parent="Ground"]',
'mesh = SubResource("4")','',
'[node name="Collision" type="CollisionShape3D" parent="Ground"]',
'shape = SubResource("5")','',
'[node name="Player" type="CharacterBody3D" parent="."]',
'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.62, 0)',
'script = ExtResource("1")','',
'[node name="Body" type="MeshInstance3D" parent="Player"]',
'mesh = SubResource("2")','',
'[node name="Collision" type="CollisionShape3D" parent="Player"]',
'shape = SubResource("3")','',
'[node name="Camera3D" type="Camera3D" parent="Player"]',
camTransform,'',
uiButtons3D(),
hintLabel('Экранные кнопки: стрелки и ПРЫЖОК. На ПК — стрелки и пробел. Игра готова — жми F5 или ▶!'),
  ].join('\n');
}

function godotProjectFile(name) {
  return [
'; Engine configuration file.',
'config_version=5','',
'[application]','',
'config/name="' + name + '"',
'run/main_scene="res://main.tscn"',
'config/features=PackedStringArray("4.7")','',
'[display]','',
'window/size/viewport_width=960',
'window/size/viewport_height=540',
'window/handheld/orientation="landscape"','',
'[rendering]','',
'renderer/rendering_method="gl_compatibility"',''
  ].join('\n');
}

function buildGameFiles(cfg) {
  const files = [];
  files.push({ name: 'project.godot', content: godotProjectFile(cfg.name) });
  if (!cfg.is3D) {
    files.push({ name: 'player.gd', content: cfg.topdown ? gdPlayer2DTopdown() : gdPlayer2DPlatformer() });
    files.push({ name: 'main.tscn', content: cfg.topdown ? tscn2DTopdown() : tscn2DPlatformer() });
  } else {
    files.push({ name: 'player.gd', content: gdPlayer3D() });
    files.push({ name: 'main.tscn', content: tscn3D(cfg.thirdPerson) });
  }
  return files;
}

/* ---- выбор цели и генерация ---- */
async function startGeneration() {
  if (!isAndroid) { toast('Генерация доступна только в Android APK'); return; }
  const cfg = wizardConfig();
  if (!state.project) {
    await generateIntoNewFolder(cfg);
    return;
  }
  const r = await appDialog('Куда создать игру?',
    '<p style="font-size:14px;color:var(--txt2);margin-bottom:8px"><b>В новую папку</b> — отдельный проект с нуля: выбери пустую папку, затем в Godot: Import → эта папка → ▶.</p>'
    + '<p style="font-size:14px;color:var(--txt2)"><b>В текущий проект</b> — файлы добавятся в «' + escapeHtml(state.project.name) + '» через «Изменения» с резервной копией.</p>'
    + '<div class="btn-row" style="margin-top:12px">'
    + '<button class="btn primary block" onclick="wizChooseDest(\'new\')">В новую папку</button>'
    + '<button class="btn block" onclick="wizChooseDest(\'current\')">В текущий проект</button>'
    + '</div>',
    { confirm: false, okText: 'Отмена' });
  if (r === 'new') await generateIntoNewFolder(cfg);
  else if (r === 'current') await generateIntoCurrent(cfg);
}

function wizChooseDest(d) {
  dialogFinish(d);
}

async function upsertRootFile(tree, name, content) {
  let target = null;
  (tree.children || []).forEach(function(c) {
    if (c.type === 'file' && c.name === name) target = c;
  });
  if (target) {
    await bridgeAsync('writeFile', target.uri, content);
  } else {
    await bridgeAsync('createFile', tree.uri, name, content);
  }
}

async function generateIntoNewFolder(cfg) {
  toast('Выбери папку для новой игры...');
  let res;
  try {
    res = await bridgeAsync('pickProjectFolder');
  } catch (e) { toast('Отменено'); return; }
  const root = res.tree;
  const hasGodot = (root.children || []).some(function(c) { return c.name === 'project.godot'; });
  if ((root.children || []).length > 0 && !hasGodot) {
    const ok = await appDialog('Папка не пустая',
      '<p style="font-size:14px;color:var(--txt2)">Файлы игры будут добавлены рядом с существующими. Продолжить?</p>',
      { confirm: true, okText: 'Продолжить' });
    if (!ok) return;
  }
  if (hasGodot) {
    const ok = await appDialog('В папке уже есть проект',
      '<p style="font-size:14px;color:var(--txt2)">project.godot, main.tscn и player.gd будут перезаписаны новым шаблоном. Продолжить?</p>',
      { confirm: true, okText: 'Перезаписать' });
    if (!ok) return;
  }
  const files = buildGameFiles(cfg);
  for (let i = 0; i < files.length; i++) {
    await upsertRootFile(root, files[i].name, files[i].content);
  }
  const res2 = await bridgeAsync('reopenProject', res.treeUri || root.uri);
  await onProjectLoaded(res2);
  closeWizard();
  await appDialog('Игра создана! 🎮',
    '<p style="font-size:14px;color:var(--txt2);margin-bottom:8px">Проект «' + escapeHtml(cfg.name) + '» готов к запуску на телефоне и ПК.</p>'
    + '<p style="font-size:13px;color:var(--txt3);line-height:1.6">Открой папку в Godot Editor (Import → папка). Нажми <b>▶</b>: на экране будут сенсорные кнопки ← → и ПРЫЖОК — персонаж управляется пальцами. На ПК работают стрелки и пробел.</p>'
    + '<p style="font-size:13px;color:var(--txt3);margin-top:6px">Дальше улучшай игру через чат нашего приложения.</p>');
}

async function generateIntoCurrent(cfg) {
  const files = buildGameFiles(cfg);
  files.forEach(function(f) {
    let target = null;
    (state.project.files.children || []).forEach(function(c) {
      if (c.type === 'file' && c.name === f.name) target = c;
    });
    if (target) {
      proposeChange({
        action: 'modify', path: f.name, uri: target.uri, content: f.content,
        oldContent: null
      });
    } else {
      proposeChange({
        action: 'create', path: f.name, name: f.name,
        parentUri: state.project.files.uri, content: f.content, oldContent: null
      });
    }
  });
  closeWizard();
  toast('Файлы игры готовы к применению');
  showScreen('scr-files');
  const t = document.getElementById('tabChangesLabel');
  if (t) switchTab(t, 'changes');
}
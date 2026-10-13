/* ================================================================
   AI — стриминг, агент, разбор изменений, квоты, пустые ответы
   ================================================================ */
state.agentMode = localStorage.getItem('gas_agent') !== '0';
state.handoffText = '';

const FILE_SYNONYMS = {
  'враг': ['enemy', 'mob', 'monster', 'ai', 'zombie', 'npc'],
  'враги': ['enemy', 'mob', 'monster', 'ai', 'zombie', 'npc'],
  'моб': ['enemy', 'mob', 'monster'],
  'мобы': ['enemy', 'mob', 'monster'],
  'волна': ['wave', 'spawn', 'spawner', 'manager', 'level', 'round'],
  'волны': ['wave', 'spawn', 'spawner', 'manager', 'level', 'round'],
  'спавн': ['spawn', 'spawner', 'instance', 'create'],
  'спавнер': ['spawn', 'spawner'],
  'игрок': ['player', 'character', 'hero', 'controller', 'avatar'],
  'персонаж': ['player', 'character', 'hero', 'controller'],
  'урон': ['damage', 'health', 'hp', 'combat', 'hit', 'attack'],
  'здоровье': ['health', 'hp', 'life', 'vitality'],
  'навык': ['skill', 'ability', 'spell', 'upgrade', 'perk'],
  'скилл': ['skill', 'ability', 'spell', 'upgrade'],
  'меню': ['menu', 'ui', 'hud', 'main', 'start'],
  'интерфейс': ['ui', 'hud', 'menu', 'canvas', 'interface'],
  'кнопк': ['button', 'ui', 'touch', 'control', 'input'],
  'камер': ['camera', 'view', 'viewport'],
  'звук': ['audio', 'sound', 'music', 'sfx'],
  'музык': ['music', 'audio', 'sound'],
  'анимац': ['anim', 'animation', 'sprite', 'tween'],
  'физик': ['physics', 'body', 'collision', 'rigid'],
  'коллиз': ['collision', 'collider', 'shape', 'area'],
  'сцена': ['scene', 'tscn', 'main', 'world', 'level'],
  'скрипт': ['script', 'gd', 'code', 'logic'],
  'баг': ['bug', 'fix', 'error', 'issue', 'problem'],
  'ошибк': ['bug', 'fix', 'error', 'issue', 'problem'],
  'накладыва': ['overlap', 'collision', 'stack', 'push', 'separate'],
  'начинает': ['start', 'begin', 'trigger', 'init', 'wave', 'spawn']
};

function normalizePath(p) {
  return String(p || '').replace(/^res:\/\//i, '').replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
}

function getAllFilesFromTree(node, list = []) {
  if (!node) return list;
  if (node.type === 'file') {
    list.push(node);
  } else if (node.children) {
    for (const child of node.children) {
      getAllFilesFromTree(child, list);
    }
  }
  return list;
}

function isProtectedPath(path) {
  const norm = normalizePath(path);
  return norm.includes('..') || 
         norm.startsWith('addons/') || 
         norm === 'plugin.cfg' || 
         norm.includes('gas_companion.gd') || 
         norm.startsWith('gas_');
}

function searchTermsFromText(text) {
  const low = text.toLowerCase();
  const keywords = low.split(/\s+/).filter(w => w.length > 3);
  const terms = new Set(keywords);
  keywords.forEach(kw => {
    for (const [pattern, ens] of Object.entries(FILE_SYNONYMS)) {
      if (kw.includes(pattern) || pattern.includes(kw)) {
        ens.forEach(en => terms.add(en));
      }
    }
  });
  return terms;
}

function calculateBudget(activeProvider) {
  const MODEL_LIMITS = {
    'gemini-2.5-flash': 32768, 'gemini-1.5-flash': 32768, 'gemini-1.5-pro': 32768,
    'llama-3.3-70b-versatile': 32768, 'meta-llama/Llama-3.3-70B-Instruct': 32768,
    'anthropic/claude-haiku-5.5': 32768, 'anthropic/claude-3.5-sonnet': 32768, 'gpt-4o': 32768,
  };
  const CHARS_PER_TOKEN = 4;
  const model = (activeProvider && activeProvider.model) ? activeProvider.model.toLowerCase() : '';
  let limit = 32768;
  for (const [k, v] of Object.entries(MODEL_LIMITS)) {
    if (model.includes(k.toLowerCase())) { limit = v; break; }
  }
  
  const RESERVE_FOR_RESPONSE = 8192;
  const SYSTEM_PROMPT_CHARS = 1500;
  const HISTORY_CHARS = state.messages.filter(m => !m.streaming).slice(-5).reduce((sum, m) => sum + (m.text || '').length + 200, 0);
  const SAFETY_MARGIN = 1000;
  
  const availableTokens = limit - RESERVE_FOR_RESPONSE - Math.ceil((SYSTEM_PROMPT_CHARS + HISTORY_CHARS + SAFETY_MARGIN) / CHARS_PER_TOKEN);
  const availableChars = Math.max(availableTokens * CHARS_PER_TOKEN, 4000); 
  
  return {
    MAX_TOTAL_CHARS: Math.min(availableChars, 18000),
    MAX_FILE_FULL: 3000,
    MAX_FILE_CHUNK: 1500,
    MAX_DEPTH: 2
  };
}

(function() {
  const st = document.createElement('style');
  st.textContent = '.cursor-blink{animation:blinkc 1s steps(2) infinite;color:var(--acc2)}@keyframes blinkc{50%{opacity:0}}'
    + '.msg-actions{display:flex;gap:10px;margin-top:8px;padding-top:6px;border-top:1px solid var(--line)}'
    + '.mcopy{font-size:11px;color:var(--txt3);background:none;border:none;padding:2px 4px;display:flex;align-items:center;gap:4px}'
    + '.mcopy:active{color:var(--acc2)}';
  document.head.appendChild(st);
})();

function injectAgentToggle() {
  const body = document.querySelector('#sheet-ai-tools .body');
  if (!body || document.getElementById('agentRow')) return;
  body.insertAdjacentHTML('afterbegin',
    '<div class="list" style="margin-bottom:14px"><div class="card" id="agentRow">'
    + '<div class="ico">🤖</div>'
    + '<div class="body"><div class="title">Режим агента</div>'
    + '<div class="sub">ИИ сам правит файлы проекта через «Изменения» (вкл)</div></div>'
    + '<div class="switch' + (state.agentMode ? ' on' : '') + '" onclick="toggleAgentMode(this)"></div>'
    + '</div></div>');
}
injectAgentToggle();

function injectChatTools() {
  const body = document.querySelector('#sheet-ai-tools .body');
  if (!body || document.getElementById('clearChatRow')) return;
  body.insertAdjacentHTML('beforeend',
    '<h2 style="font-size:12px;color:var(--txt3);text-transform:uppercase;margin:14px 0 8px">Чат</h2>'
    + '<div class="list"><div class="card" id="clearChatRow" onclick="clearChatHistory()">'
    + '<div class="ico">🧹</div>'
    + '<div class="body"><div class="title">Очистить чат проекта</div>'
    + '<div class="sub">Удалить историю переписки этого проекта с устройства</div></div></div></div>');
}
injectChatTools();

function toggleAgentMode(el) {
  el.classList.toggle('on');
  state.agentMode = el.classList.contains('on');
  localStorage.setItem('gas_agent', state.agentMode ? '1' : '0');
  toast(state.agentMode ? 'Режим агента: ВКЛ' : 'Режим агента: ВЫКЛ');
}

function chatKey(uri) {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = ((h << 5) + h + uri.charCodeAt(i)) | 0;
  return 'gas_chat_' + (h >>> 0).toString(36);
}
function saveChatNow() {
  if (!state.project || !state.project.uri) return;
  try {
    const clean = state.messages.filter(function(m) { return !m.streaming; }).slice(-100);
    localStorage.setItem(chatKey(state.project.uri), JSON.stringify(clean));
  } catch (e) {}
}
function loadChatFor(uri) {
  try {
    const arr = JSON.parse(localStorage.getItem(chatKey(uri)) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
async function clearChatHistory() {
  closeSheet();
  if (!state.project) return;
  const ok = await appDialog('Очистить чат проекта?',
    '<p style="font-size:14px;color:var(--txt2);margin-bottom:6px">Переписка проекта «' + escapeHtml(state.project.name) + '» будет удалена с устройства.</p>'
    + '<p style="font-size:13px;color:var(--txt3)">Файлы проекта, изменения и история откатов не затрагиваются.</p>',
    { confirm: true, okText: 'Очистить' });
  if (!ok) return;
  try { localStorage.removeItem(chatKey(state.project.uri)); } catch (e) {}
  state.messages = [];
  state.handoffText = '';
  openChat();
  toast('Чат проекта очищен');
}

function copyMessage(i) {
  const m = state.messages[i];
  if (!m) return;
  const txt = m.text || String(m.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  copyText(txt);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function() { toast('Скопировано'); }, function() { legacyCopy(t); });
  } else legacyCopy(t);
}
function legacyCopy(t) {
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать'); }
  document.body.removeChild(ta);
}

function classifyAiError(e) {
  const msg = String((e && e.message) || e || '');
  const m = /HTTP\s+(\d{3})/.exec(msg);
  const code = m ? parseInt(m[1], 10) : 0;
  const low = msg.toLowerCase();
  if (/unable to resolve host|failed to connect|timeout|eof|connection reset|network/i.test(msg)) return { kind: 'net', retryable: true };
  if (code === 402 || /requires more credits|can only afford|insufficient.*credit/i.test(low)) return { kind: 'credits', retryable: false, code: 402 };
  if (code === 503 || code === 500 || code === 502 || /high demand|unavailable|overload/i.test(low)) return { kind: 'busy', retryable: true };
  if (code === 429 || /resource has been exhausted|rate limit|quota/i.test(low)) return { kind: 'quota', retryable: false, code: 429 };
  if (code === 400 && /api key not valid|invalid api key/i.test(low)) return { kind: 'badkey', retryable: false };
  if (code === 401 || code === 403 || /permission|denied|unauthenticated/i.test(low)) return { kind: 'auth', retryable: false };
  if (code === 404 || /not found|does not exist|unknown model/i.test(low)) return { kind: 'model', retryable: false };
  return { kind: 'other', retryable: false };
}

function isBillingOrAuthError(e) {
  const k = classifyAiError(e).kind;
  return k === 'credits' || k === 'quota' || k === 'badkey' || k === 'auth';
}

function friendlyAiError(e) {
  const c = classifyAiError(e);
  const msg = String((e && e.message) || e || '');
  switch (c.kind) {
    case 'credits':
      return { title: 'Недостаточно кредитов для запроса такого размера',
        body: 'Баланс провайдера меньше резерва под длину запроса. Приложение уже повторило попытку со сжатым контекстом.',
        action: { label: 'Сменить модель', fn: "showScreen('scr-models')" } };
    case 'busy': return { title: 'Сервер ИИ сейчас перегружен', body: 'Временное явление. Попробуйте ещё через минуту.', action: null };
    case 'quota': return { title: 'Исчерпан лимит запросов (квота)', body: 'Для этого ключа закончилась квота. Смените провайдера.', action: { label: 'Перейти к моделям', fn: "showScreen('scr-models')" } };
    case 'badkey': return { title: 'Ключ API недействителен', body: 'Ключ не принят провайдером.', action: { label: 'Изменить ключ', fn: "showScreen('scr-models')" } };
    case 'auth': return { title: 'Нет доступа по этому ключу', body: 'Ключ есть, но нет прав на эту модель.', action: { label: 'Перейти к моделям', fn: "showScreen('scr-models')" } };
    case 'model': return { title: 'Модель не найдена', body: 'Идентификатор модели неверен.', action: { label: 'Исправить модель', fn: "showScreen('scr-models')" } };
    case 'net': return { title: 'Нет связи с сервером ИИ', body: 'Проверьте интернет на устройстве.', action: null };
    default: return { title: 'Ошибка запроса к ИИ', body: escapeHtml(msg.length > 240 ? msg.slice(0, 240) + '…' : msg), action: null };
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getActiveApiKey(active) {
  try { return Bridge.getApiKey(active.id) || ''; } catch (e) { return ''; }
}

async function doAiRequest(providerType, model, endpoint, apiKey, messages, onlyId) {
  if (!isAndroid) throw new Error('Прямые запросы из браузера не поддерживаются. Собери APK.');
  let candidates = state.providers.filter(function(p) { return p.type === providerType && p.model === model; });
  if (onlyId) candidates = candidates.filter(function(p) { return p.id === onlyId; });
  if (candidates.length === 0) {
    const key = apiKey || '';
    if (!key) throw new Error('API-ключ не задан для ' + providerType);
    return await bridgeAsync('sendAiRequest', providerType, model, endpoint || '', key, JSON.stringify(messages));
  }
  let lastErr = null;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    let key = '';
    try { key = Bridge.getApiKey(p.id) || ''; } catch (e) {}
    if (!key) continue;
    try {
      const result = await bridgeAsync('sendAiRequest', p.type, p.model, p.endpoint || '', key, JSON.stringify(messages));
      if (typeof clearProviderQuota === 'function') clearProviderQuota(p.id);
      if (!p.active && candidates.length > 1 && !onlyId) {
        candidates.forEach(function(c) { c.active = false; });
        p.active = true;
        saveLocalState(); renderModels(); updateChatModelLabel();
      }
      return result;
    } catch (e) {
      lastErr = e;
      const c = classifyAiError(e);
      if (c.kind === 'quota' && typeof markProviderQuota === 'function') markProviderQuota(p.id, c.code);
      if (!c.retryable) throw e;
    }
  }
  throw lastErr || new Error('Все ключи не работают');
}

async function buildSmartContext(userText, activeProvider, forceIncludePaths = null) {
  if (!state.project || !state.project.map) return { text: '[ОШИБКА: Проект не открыт]', paths: new Set(), truncatedPaths: new Set() };
  
  const map = state.project.map;
  if (!map.scenes || !map.scripts) return { text: '[ОШИБКА: Карта проекта пуста]', paths: new Set(), truncatedPaths: new Set() };
  
  const lowText = userText.toLowerCase();
  const scripts = map.scripts || [];
  const scenes = map.scenes || [];
  const allFiles = scripts.concat(scenes);
  const BUDGET = calculateBudget(activeProvider);
  
  const planned = new Set();
  const queue = [];
  const warnings = [];

  const mainScenePath = map.mainScene;
  if (mainScenePath) {
    const mainScene = allFiles.find(f => f.path === mainScenePath);
    if (mainScene) {
      queue.push({ file: mainScene, priority: 0 });
      planned.add(mainScene.path);
    }
  }

  if (forceIncludePaths && typeof forceIncludePaths[Symbol.iterator] === 'function') {
    const allTreeFiles = getAllFilesFromTree(state.project.files);
    for (const requestedPath of forceIncludePaths) {
      const wanted = normalizePath(requestedPath);
      const file = allTreeFiles.find(f => {
        const p = normalizePath(f.path);
        return p === wanted || p.endsWith('/' + wanted);
      });

      if (file && !planned.has(file.path)) {
        queue.push({ file: file, priority: -1 });
        planned.add(file.path);
      } else if (!file) {
        const node = locateByPath(state.project.files, requestedPath);
        if (node && node.type === 'file') {
          queue.push({ file: { path: requestedPath, uri: node.uri, name: node.name }, priority: -1, synthetic: true });
          planned.add(requestedPath);
        } else {
          warnings.push(`Файл не найден: ${requestedPath}`);
        }
      }
    }
  }

  const keywords = lowText.split(/\s+/).filter(w => w.length > 3 && !/^(что|как|где|когда|если|или|для|под|над|через|после|перед|не|но|он|она|они|это|тут|там|же|то|бы|ли|и|а|о|у|с|в|к|по|на|за|от|до|из|между|вместо|кроме|вокруг|посреди|среди|вдоль|поперёк)$/.test(w));
  const searchTerms = new Set(keywords);
  keywords.forEach(kw => {
    for (const [pattern, ens] of Object.entries(FILE_SYNONYMS)) {
      if (kw.includes(pattern) || pattern.includes(kw)) ens.forEach(en => searchTerms.add(en));
    }
  });

  for (const file of allFiles) {
    const pathLow = file.path.toLowerCase();
    const fileName = file.path.split('/').pop().toLowerCase();
    const matches = Array.from(searchTerms).some(term => pathLow.includes(term) || fileName.includes(term));
    if (matches && !planned.has(file.path)) {
      queue.push({ file, priority: 1 });
      planned.add(file.path);
    }
  }

  const dependencyQueue = [...queue.filter(q => q.priority <= 1).map(q => q.file)];
  let depth = 0;
  while (dependencyQueue.length > 0 && depth < BUDGET.MAX_DEPTH) {
    const nextLevel = [];
    for (const file of dependencyQueue) {
      if (!/\.tscn$|\.gd$|\.tres$|\.json$/i.test(file.path)) continue;
      try {
        const node = locateByPath(state.project.files, file.path);
        if (!node) continue;
        const content = await bridgeAsync('readFile', node.uri);
        if (typeof content !== 'string') continue;
        
        const resRefs = content.match(/res:\/\/[^\s"')\]]+\.(?:gd|tscn|tres|json|cfg)/g) || [];
        for (const ref of resRefs) {
          const cleanRef = ref.replace(/[")'\]]+$/, '');
          if (/(^|\/)addons\//.test(cleanRef) || /(^|\/)\.godot\//.test(cleanRef) || cleanRef.endsWith('plugin.cfg')) continue;
          if (planned.has(cleanRef)) continue;
          
          const depFile = allFiles.find(f => f.path === cleanRef);
          if (depFile) {
            queue.push({ file: depFile, priority: 2 });
            planned.add(cleanRef);
            nextLevel.push(depFile);
          } else {
            const nodeInTree = locateByPath(state.project.files, cleanRef);
            if (nodeInTree && nodeInTree.type === 'file') {
              queue.push({ file: { path: cleanRef, uri: nodeInTree.uri, name: nodeInTree.name }, priority: 2, synthetic: true });
              planned.add(cleanRef);
            }
          }
        }
      } catch (e) {}
    }
    dependencyQueue.length = 0;
    dependencyQueue.push(...nextLevel);
    depth++;
  }

  queue.sort((a, b) => a.priority - b.priority);
  
  let estimatedChars = 0;
  for (const { file } of queue) estimatedChars += 1500;
  
  if (estimatedChars >= BUDGET.MAX_TOTAL_CHARS * 0.6 && scripts.length > 10) {
    warnings.push(`Проект большой. Загружены только релевантные файлы.`);
  }

  const parts = [];
  const includedPaths = new Set();
  let totalChars = 0;
  const truncatedFiles = [];
  const unreadableFiles = [];

  for (const { file } of queue) {
    const remainingBudget = BUDGET.MAX_TOTAL_CHARS - totalChars;
    if (remainingBudget < 500) {
      warnings.push(`Достигнут лимит контекста. Остальные файлы не загружены.`);
      break;
    }
    
    if (isProtectedPath(file.path)) continue;

    try {
      const node = locateByPath(state.project.files, file.path);
      if (!node) {
        unreadableFiles.push(file.path);
        continue;
      }
      
      let content = await bridgeAsync('readFile', node.uri);
      if (typeof content !== 'string') content = JSON.stringify(content);
      
      let displayContent;
      let wasTruncated = false;
      const normFilePath = normalizePath(file.path);
      const forceInclude = forceIncludePaths && Array.from(forceIncludePaths).some(p => normalizePath(p) === normFilePath);
      
      if (content.length <= remainingBudget && !forceInclude) {
        displayContent = content;
      } else if (forceInclude && content.length <= remainingBudget) {
        displayContent = content;
      } else if (forceInclude) {
        displayContent = content.slice(0, remainingBudget - 100) + '\n\n... [ОБРЕЗАН ИЗ-ЗА БЮДЖЕТА, НО ВКЛЮЧЁН ПРИНУДИТЕЛЬНО] ...';
        wasTruncated = true;
        truncatedFiles.push(file.path);
      } else if (content.length > BUDGET.MAX_FILE_FULL) {
        const { content: chunked, truncated } = extractRelevantChunks(content, searchTerms, Math.min(BUDGET.MAX_FILE_CHUNK, remainingBudget));
        displayContent = chunked;
        wasTruncated = truncated;
        if (truncated) truncatedFiles.push(file.path);
      } else {
        displayContent = content.slice(0, remainingBudget - 100) + '\n\n... [ОБРЕЗАН ИЗ-ЗА ЛИМИТА БЮДЖЕТА] ...';
        wasTruncated = true;
        truncatedFiles.push(file.path);
      }
      
      totalChars += displayContent.length;
      parts.push(`--- ФАЙЛ: ${file.path} ---\n${displayContent}`);
      includedPaths.add(file.path);
    } catch (e) {
      unreadableFiles.push(file.path);
      warnings.push(`Ошибка чтения ${file.path}: ${e.message}`);
    }
  }

  let result = '\n[АВТОМАТИЧЕСКИ ИССЛЕДОВАННЫЙ КОНТЕКСТ ПРОЕКТА]:\n';
  if (parts.length === 0) result += '[ВНИМАНИЕ: Не удалось загрузить файлы.]\n';
  else result += parts.join('\n\n') + '\n';
  
  if (unreadableFiles.length > 0) result += `\n[НЕДОСТУПНЫЕ ФАЙЛЫ]: ${unreadableFiles.join(', ')}\n`;
  if (warnings.length > 0) result += '\n[ПРЕДУПРЕЖДЕНИЯ]:\n' + warnings.map(w => '- ' + w).join('\n') + '\n';
  if (truncatedFiles.length > 0) result += '\n[ОБРЕЗАННЫЕ ФАЙЛЫ]: ' + truncatedFiles.join(', ') + '\n';
  
  return { text: result, paths: includedPaths, truncatedPaths: new Set(truncatedFiles) };
}

function extractRelevantChunks(content, searchTerms, maxChars) {
  const lines = content.split('\n');
  const relevantLineIndices = new Set();
  const terms = Array.from(searchTerms);
  
  lines.forEach((line, idx) => {
    if (terms.some(term => line.toLowerCase().includes(term))) relevantLineIndices.add(idx);
  });
  
  const chunks = [];
  const usedLines = new Set();
  
  relevantLineIndices.forEach(idx => {
    let start = idx;
    while (start > 0) {
      const prevTrimmed = lines[start - 1].trim();
      if (/^func\s+\w+/.test(prevTrimmed)) { start = start - 1; break; }
      if (/^(class_name|extends|@tool|@icon)\b/.test(prevTrimmed)) break;
      if (prevTrimmed === '' && idx - start > 15) break;
      start--;
    }
    
    let end = idx;
    const startIndent = lines[start].search(/\S/);
    while (end < lines.length - 1) {
      const nextTrimmed = lines[end + 1].trim();
      if (nextTrimmed === '') { end++; continue; }
      if ((/^func\s+|^class\s+|^@/.test(nextTrimmed)) && lines[end + 1].search(/\S/) <= startIndent) break;
      end++;
    }
    
    let overlap = false;
    for (let i = start; i <= end; i++) { if (usedLines.has(i)) { overlap = true; break; } }
    if (!overlap) {
      chunks.push({ start, end });
      for (let i = start; i <= end; i++) usedLines.add(i);
    }
  });

  const callRegex = /(?:\.(\w+)\(|emit_signal\(["'](\w+)["']|connect\(["'](\w+)["'])/g;
  const additionalChunks = [];
  chunks.forEach(chunk => {
    const blockText = lines.slice(chunk.start, chunk.end + 1).join('\n');
    let m;
    callRegex.lastIndex = 0;
    while ((m = callRegex.exec(blockText)) !== null) {
      const calledName = m[1] || m[2] || m[3];
      if (!calledName) continue;
      const defRegex = new RegExp('^func\\s+' + calledName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'm');
      const defMatch = defRegex.exec(content);
      if (defMatch) {
        const defLine = content.slice(0, defMatch.index).split('\n').length - 1;
        if (!usedLines.has(defLine)) {
          let s = defLine, e = defLine;
          while (s > 0 && !/^func\s+\w+/.test(lines[s-1].trim())) s--;
          if (!/^func\s+\w+/.test(lines[s].trim())) s = defLine;
          while (e < lines.length - 1 && !(/^func\s+\w+/.test(lines[e+1].trim()) && lines[e+1].search(/\S/) <= lines[s].search(/\S/))) e++;
          additionalChunks.push({ start: s, end: e });
          for (let i = s; i <= e; i++) usedLines.add(i);
        }
      }
    }
  });
  chunks.push(...additionalChunks);
  chunks.sort((a, b) => a.start - b.start);

  if (chunks.length === 0) {
    const head = lines.slice(0, 30).join('\n');
    const tail = lines.slice(-30).join('\n');
    return { content: `[ОБРЕЗАН: первые и последние 30 строк. Релевантные фрагменты не найдены.]\n\n${head}\n\n... [${Math.max(0, lines.length - 60)} строк скрыто] ...\n\n${tail}`, truncated: true };
  }
  
  let result = `[ОБРЕЗАН: показаны релевантные фрагменты (${chunks.length} блок(ов))]\n\n`;
  let totalLen = result.length;
  
  for (const chunk of chunks) {
    const chunkText = lines.slice(chunk.start, chunk.end + 1).join('\n');
    if (totalLen + chunkText.length > maxChars) {
      result += '\n... [остальные фрагменты не поместились в бюджет] ...\n';
      break;
    }
    result += `--- строки ${chunk.start + 1}-${chunk.end + 1} ---\n${chunkText}\n\n`;
    totalLen += chunkText.length + 50;
  }
  
  return { content: result, truncated: true };
}

// --- УЛУЧШЕННЫЙ ПАРСИНГ ИЗМЕНЕНИЙ ---
function tryParseChanges(s) {
  try {
    let cleanS = s.trim();
    // Удаляем возможные маркеры, если они просочились внутрь захваченной группы
    if (cleanS.startsWith('```json')) cleanS = cleanS.slice(7).trim();
    if (cleanS.startsWith('```')) cleanS = cleanS.slice(3).trim();
    if (cleanS.endsWith('```')) cleanS = cleanS.slice(0, -3).trim();
    
    const arr = JSON.parse(cleanS);
    if (!Array.isArray(arr) || !arr.length) return null;
    const good = arr.filter(function(c) {
      return c && typeof c === 'object' &&
             (c.action === 'create' || c.action === 'modify') &&
             typeof c.path === 'string' &&
             typeof c.content === 'string';
    });
    return good.length ? good : null;
  } catch (e) { 
    return null; 
  }
}

function salvageArray(s) {
  let t = String(s || '');
  const start = t.indexOf('[');
  if (start < 0) return null;
  
  const end = t.lastIndexOf(']');
  if (end <= start) return null;
  
  let candidate = t.slice(start, end + 1);
  const parsed = tryParseChanges(candidate);
  if (parsed) return parsed;
  
  // Если не вышло, пробуем отбросить последний неполный объект
  const lastObjStart = candidate.lastIndexOf('{');
  if (lastObjStart > 0) {
    candidate = candidate.slice(0, lastObjStart).replace(/,\s*$/, '') + ']';
    return tryParseChanges(candidate);
  }
  
  return null;
}

function parseChangesFromReply(text) {
  const spans = [];
  let list = [];
  let truncated = false;

  // 1. Сначала ищем стандартные блоки ```gaschanges ... ```
  const re = /```[a-zA-Z0-9_-]*[ \t]*\n?([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const parsed = tryParseChanges(m[1].trim()) || salvageArray(m[1].trim());
    if (parsed) { 
      list = list.concat(parsed); 
      spans.push([m.index, m.index + m[0].length]); 
    }
  }

  // 2. Если не нашли, ищем любые JSON-массивы с action/path/content
  if (list.length === 0) {
    const jsonMatch = text.match(/\[\s*\{\s*["']action["']\s*:\s*["'](modify|create)["'][\s\S]*?\}\s*\]/);
    if (jsonMatch) {
      const parsed = tryParseChanges(jsonMatch[0]) || salvageArray(jsonMatch[0]);
      if (parsed) {
        list = parsed;
        spans.push([jsonMatch.index, jsonMatch.index + jsonMatch[0].length]);
      }
    }
  }

  // 3. Проверяем незакрытые блоки
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1 && list.length === 0) {
    const openIdx = text.lastIndexOf('```');
    const parsed = salvageArray(text.slice(openIdx + 3));
    if (parsed) { 
      list = list.concat(parsed); 
      spans.push([openIdx, text.length]); 
      truncated = true; 
    }
  }

  // 4. Ищем квадратные скобки с объектами
  if (list.length === 0) {
    const re2 = /\[\s*\{[\s\S]*?\}\s*\]/g;
    let m2;
    while ((m2 = re2.exec(text)) !== null) {
      const parsed = tryParseChanges(m2[0]);
      if (parsed) { 
        list = list.concat(parsed); 
        spans.push([m2.index, m2.index + m2[0].length]); 
      }
    }
  }

  // 5. Последняя попытка - ищем первую [ в тексте
  if (list.length === 0) {
    const si = text.indexOf('[');
    if (si >= 0) {
      const parsed = salvageArray(text.slice(si));
      if (parsed) { 
        list = parsed; 
        truncated = true; 
        spans.push([si, text.length]); 
      }
    }
  }

  return { list: list, spans: spans, truncated: truncated };
}
// ------------------------------------

function removeSpans(text, spans) {
  let out = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    out = out.slice(0, spans[i][0]) + out.slice(spans[i][1]);
  }
  return out;
}

function openChat() {
  if (!state.project) { toast('Сначала открой проект'); return; }
  if (state.messages.length === 0) {
    state.messages.push({
      role: 'assistant',
      html: '<p>Привет! Я изучил проект <b>' + escapeHtml(state.project.name) + '</b> (Godot ' + escapeHtml(state.project.godotVersion) + '). Я умею сам менять файлы проекта: просто скажи, что сделать.</p>',
      text: 'Привет! Я изучил проект ' + state.project.name + '.'
    });
    saveChatNow();
  }
  document.getElementById('chatProjectName').textContent = state.project.name;
  updateChatModelLabel();
  renderChat();
  showScreen('scr-chat');
}

function renderChat() {
  const body = document.getElementById('chatBody');
  body.innerHTML = state.messages.map(function(m, i) {
    if (m.role === 'user') {
      return '<div class="msg user"><div class="avatar">Я</div>'
        + '<div class="bubble">' + escapeHtml(m.text)
        + '<div class="msg-actions"><button class="mcopy" onclick="copyMessage(' + i + ')">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Скопировать</button></div></div></div>';
    }
    return '<div class="msg"><div class="avatar">AI</div>'
      + '<div class="bubble">' + (m.html || '')
      + '<div class="msg-actions"><button class="mcopy" onclick="copyMessage(' + i + ')">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Скопировать</button></div></div></div>';
  }).join('');
  body.scrollTop = body.scrollHeight;
}

function lastBubbleEl() {
  const els = document.querySelectorAll('#chatBody .msg .bubble');
  return els.length ? els[els.length - 1] : null;
}

function thinkingHtml() {
  const active = typeof getActiveProvider === 'function' ? getActiveProvider() : null;
  const name = active ? (active.name || active.type || 'AI') : 'AI';
  return '<div class="op-card run"><div class="chk"></div><div class="op-body"><div class="op-title">Анализирую запрос</div><div class="op-sub">Отправка в ' + escapeHtml(name) + '...</div></div></div>';
}

function errorHtml(e) {
  const f = friendlyAiError(e);
  let html = '<div style="color:var(--warn)">' + escapeHtml(f.title) + '</div><p style="font-size:13px;color:var(--txt2);margin-top:6px;line-height:1.5">' + f.body + '</p>';
  if (f.action) html += '<button class="btn sm" onclick="' + f.action.fn + '" style="margin-top:8px">' + escapeHtml(f.action.label) + '</button>';
  html += '<div class="btn-row" style="margin-top:8px"><button class="btn sm" onclick="retryLastRequest()">Повторить</button></div>';
  return html;
}

async function retryLastRequest() {
  let lastMeaningfulIndex = -1;
  let lastMeaningfulText = '';
  
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role === 'user' && !m.streaming) {
      const txt = (m.text || '').trim().toLowerCase();
      if (!/^(продолж[аиь]|повтор[иь]|continue|retry)/i.test(txt)) {
        lastMeaningfulIndex = i;
        lastMeaningfulText = m.text;
        break;
      }
    }
  }
  
  if (lastMeaningfulIndex < 0 || !lastMeaningfulText) {
    toast('Не нашли что повторить — напиши запрос заново');
    return;
  }
  
  state.messages.splice(lastMeaningfulIndex + 1);
  
  const active = typeof getActiveProvider === 'function' ? getActiveProvider() : null;
  if (!active) { toast('Нет активного провайдера'); showScreen('scr-models'); return; }
  
  const apiKey = getActiveApiKey(active);
  if (!apiKey) { toast('API-ключ не найден'); showScreen('scr-models'); return; }
  
  const idx = state.messages.length;
  state.messages.push({ role: 'assistant', html: thinkingHtml(), streaming: true });
  renderChat();
  
  try {
    const { messages: apiMessages, paths: contextPaths, truncatedPaths } = await buildApiMessages(lastMeaningfulText, false, active);
    const reply = await requestWithAgentRetry(idx, active, apiMessages, apiKey);
    await finishStreamMessage(idx, reply, lastMeaningfulText, contextPaths, truncatedPaths);
  } catch (e) {
    state.messages[idx] = { role: 'assistant', html: errorHtml(e) };
    renderChat();
    saveChatNow();
  }
}

async function streamIntoMessage(idx, active, apiMessages, apiKey) {
  let raw = '';
  let gotChunk = false;
  try {
    const resp = await bridgeStreamAsync('sendAiStream', function(chunk) {
      gotChunk = true;
      raw += chunk;
      const bubble = lastBubbleEl();
      if (bubble) {
        bubble.innerHTML = '<p>' + escapeHtml(raw).replace(/\n/g, '<br>') + '<span class="cursor-blink">▍</span></p>';
        document.getElementById('chatBody').scrollTop = document.getElementById('chatBody').scrollHeight;
      }
    }, active.type, active.model, active.endpoint || '', apiKey, JSON.stringify(apiMessages));
    return (resp && resp.text) ? resp.text : raw;
  } catch (e) {
    if (gotChunk && raw) return raw;
    if (isBillingOrAuthError(e)) throw e;
    state.messages[idx] = { role: 'assistant', html: thinkingHtml(), streaming: true };
    renderChat();
    const resp2 = await bridgeAsync('sendAiRequest', active.type, active.model, active.endpoint || '', apiKey, JSON.stringify(apiMessages));
    return (resp2 && resp2.text) ? resp2.text : JSON.stringify(resp2);
  }
}

function looksLikeRefusal(text) {
  return /не могу.*(?:измен|прав|файл)|самостоятельно|вручную|открой(те)?\s+(?:godot|редактор)|я не имею доступа|не могу напрямую|вы сможете применить/i.test(text || '');
}

async function requestWithAgentRetry(idx, active, apiMessages, apiKey) {
  let reply = await streamIntoMessage(idx, active, apiMessages, apiKey);
  if (state.agentMode && !parseChangesFromReply(reply).list.length && looksLikeRefusal(reply)) {
    const nudged = apiMessages.concat([
      { role: 'assistant', content: reply.slice(0, 600) },
      { role: 'user', content: 'SYSTEM: у тебя есть прямой доступ к файлам через блок gaschanges. Переделай ответ: краткое объяснение + ровно один блок gaschanges с ПОЛНЫМ новым содержимым. Отказы запрещены.' }
    ]);
    state.messages[idx] = { role: 'assistant', html: thinkingHtml(), streaming: true };
    renderChat();
    reply = await streamIntoMessage(idx, active, nudged, apiKey);
  }
  return reply;
}

async function buildApiMessages(latestUserText, forceCompact = false, activeProvider = null, forceIncludePaths = null) {
  const mem = state.projectMemory || { architecture: 'Неизвестна', pending: [], completed: '' };
  
  let sys = `Ты — автономный ИИ-агент разработки игр на Godot 4.
Проект: "${state.project.name}" (Godot ${state.project.godotVersion}).
ПАМЯТЬ: Архитектура: ${mem.architecture}. Выполнено: ${mem.completed || 'Ничего'}. Ожидают: ${mem.pending.length > 0 ? mem.pending.join(', ') : 'Ничего'}.

 КРИТИЧЕСКИ ВАЖНО:
1. НИКОГДА не пиши код просто так в чат. ВСЕГДА используй блок \`\`\`gaschanges.
2. НИКОГДА не пиши фразы типа "Я применил изменения". ТЫ НЕ МОЖЕШЬ применять изменения сам — ты только ВЫВОДИШЬ их в формате JSON.
3. ВСЕГДА после объяснения выводи РОВНО ОДИН блок \`\`\`gaschanges с JSON-массивом изменений.
4. Формат JSON: [{"action":"modify","path":"main.gd","content":"код"}]
5. action должен быть ТОЛЬКО "create" или "modify".
6. path должен быть относительным путем внутри проекта (например, "main.gd"). НЕ добавляй имя корневой папки проекта. НЕ используй префикс "res://".
7. Для больших файлов: Выводи ТОЛЬКО изменённые функции/блоки, а остальной код заменяй комментарием: "// ... остальной код без изменений ...".
8. Если тебе нужен файл, которого нет в контексте — просто укажи его путь в gaschanges, приложение само его прочитает.`;

  if (forceCompact) sys += '\n[РЕЖИМ ЭКОНОМИИ]: Отвечай МАКСИМАЛЬНО кратко.';

  const msgs = [{ role: 'system', content: sys }];
  const histAll = state.messages.filter(m => !m.streaming);
  const isLastMsgDuplicate = histAll.length > 0 && histAll[histAll.length - 1].role === 'user' && histAll[histAll.length - 1].text === latestUserText;
  const historySlice = isLastMsgDuplicate ? histAll.slice(0, -1).slice(-4) : histAll.slice(-5);
  
  historySlice.forEach(m => {
    if (m.role === 'user') msgs.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant' && m.text) msgs.push({ role: 'assistant', content: m.text });
  });

  const ctx = await buildSmartContext(latestUserText, activeProvider, forceIncludePaths);
  let contextPaths = new Set();
  let truncatedPaths = new Set();
  
  if (ctx && ctx.text) {
    truncatedPaths = ctx.truncatedPaths || new Set();
    if (!forceCompact) {
      msgs.push({ role: 'system', content: '[АКТУАЛЬНЫЕ ФАЙЛЫ ДЛЯ ЗАДАЧИ]:' + ctx.text });
      contextPaths = ctx.paths;
    } else {
      const fileBlocks = [];
      const fileRegex = /--- ФАЙЛ:\s*([^\n]+)\s*---\n([\s\S]*?)(?=\n--- ФАЙЛ:|\n\[ПРЕДУПРЕЖДЕНИЯ|\n\[ОБРЕЗАННЫЕ|\n\[НЕДОСТУПНЫЕ|$)/g;
      let m;
      while ((m = fileRegex.exec(ctx.text)) !== null) fileBlocks.push({ path: m[1].trim(), content: m[0] });
      
      const terms = Array.from(searchTermsFromText(latestUserText));
      fileBlocks.sort((a, b) => {
        const aMatch = terms.some(t => a.path.toLowerCase().includes(t));
        const bMatch = terms.some(t => b.path.toLowerCase().includes(t));
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return a.path.endsWith('.gd') ? -1 : (b.path.endsWith('.gd') ? 1 : 0);
      });
      
      const selected = [];
      for (const fb of fileBlocks) {
        if (selected.length >= 2) break;
        selected.push(fb.content);
        contextPaths.add(fb.path);
      }
      
      if (selected.length > 0) msgs.push({ role: 'system', content: '[СОКРАЩЁННЫЙ КОНТЕКСТ]:\n' + selected.join('\n\n') });
      else if (ctx.text) msgs.push({ role: 'system', content: '[СОКРАЩЁННЫЙ КОНТЕКСТ]:' + ctx.text.slice(0, 3000) });
    }
  }
  msgs.push({ role: 'user', content: latestUserText });
  return { messages: msgs, paths: contextPaths, truncatedPaths: truncatedPaths };
}

async function sendChat() {
  const inp = document.getElementById('chatInput');
  const text = inp.value.trim();
  if (!text) return;
  
  if (/^(продолж[аиь]|повтор[иь]|continue|retry|дальше)$/i.test(text)) {
    await retryLastRequest();
    inp.value = ''; 
    if (typeof autoSize === 'function') autoSize(inp);
    return;
  }
  
  const active = typeof getActiveProvider === 'function' ? getActiveProvider() : null;
  if (!active) { toast('Сначала активируй провайдера'); showScreen('scr-models'); return; }
  const apiKey = getActiveApiKey(active);
  if (!apiKey) { toast('API-ключ не найден'); showScreen('scr-models'); return; }
  
  state.messages.push({ role: 'user', text: text });
  inp.value = ''; 
  if (typeof autoSize === 'function') autoSize(inp);
  const idx = state.messages.length;
  state.messages.push({ role: 'assistant', html: thinkingHtml(), streaming: true });
  renderChat();
  saveChatNow();

  try {
    const { messages: apiMessages, paths: contextPaths, truncatedPaths } = await buildApiMessages(text, false, active);
    const reply = await requestWithAgentRetry(idx, active, apiMessages, apiKey);
    
    if (reply && /нужно прочитать файл|предоставьте его содержимое|покажи мне файл|покажи\s+содержимое/i.test(reply)) {
      const fileMatch = reply.match(/([a-zA-Z0-9_\-\/]+\.(?:gd|tscn|tres))/i);
      if (fileMatch) {
        const requestedFile = fileMatch[1];
        const node = locateByPath(state.project.files, requestedFile);
        if (node && node.type === 'file') {
          const content = await bridgeAsync('readFile', node.uri);
          const forceInclude = new Set([requestedFile]);
          const { messages: retryMessages } = await buildApiMessages(text, false, active, forceInclude);
          
          retryMessages.push({
            role: 'system',
            content: `Файл ${requestedFile} прочитан автоматически:\n\n--- ФАЙЛ: ${requestedFile} ---\n${content}`
          });
          
          const newReply = await doAiRequest(active.type, active.model, active.endpoint || '', apiKey, retryMessages, active.id);
          await finishStreamMessage(idx, newReply && typeof newReply === 'object' ? newReply.text : newReply, text, contextPaths, truncatedPaths);
          return;
        }
      }
    }
    
    await finishStreamMessage(idx, reply, text, contextPaths, truncatedPaths);
  } catch (e) {
    const c = classifyAiError(e);
    if (c.kind === 'credits' || c.kind === 'quota' || (e.message && e.message.includes('400'))) {
      try {
        state.messages[idx] = { role: 'assistant', html: thinkingHtml(), streaming: true };
        renderChat();
        toast('Контекст велик. Пробую компактный режим...');
        const { messages: compactMsgs, paths: compactPaths, truncatedPaths: compactTruncated } = await buildApiMessages(text, true, active);
        const reply2 = await requestWithAgentRetry(idx, active, compactMsgs, apiKey);
        await finishStreamMessage(idx, reply2, text, compactPaths, compactTruncated);
        return;
      } catch (e2) {
        state.messages[idx] = { role: 'assistant', html: errorHtml(e2) };
        renderChat();
        saveChatNow();
        return;
      }
    }
    state.messages[idx] = { role: 'assistant', html: errorHtml(e) };
    renderChat();
    saveChatNow();
  }
}

function findMissingFilesInReply(replyText, contextPaths, truncatedPaths) {
  const missing = [];
  const allFiles = (state.project && state.project.files) ? getAllFilesFromTree(state.project.files) : [];
  const truncated = truncatedPaths || new Set();
  const pathRegex = /(?:res:\/\/)?([a-zA-Z0-9_\-\/]+\.(?:gd|tscn|tres|json))/g;
  let match;
  
  while ((match = pathRegex.exec(replyText)) !== null) {
    const cleanPath = match[1].trim();
    const normClean = normalizePath(cleanPath);
    const found = allFiles.find(f => {
      const fPath = normalizePath(f.path);
      return fPath === normClean || fPath.endsWith('/' + normClean);
    });
    
    if (found) {
      const fPathNorm = normalizePath(found.path);
      const isTruncated = Array.from(truncated).some(p => normalizePath(p) === fPathNorm || normalizePath(p).endsWith('/' + fPathNorm));
      
      if (isTruncated) {
        if (!missing.includes(found.path)) missing.push(found.path);
      } else {
        const alreadyFull = Array.from(contextPaths).some(p => normalizePath(p) === fPathNorm || normalizePath(p).endsWith('/' + fPathNorm));
        if (!alreadyFull && !missing.includes(found.path)) missing.push(found.path);
      }
    }
  }
  return [...new Set(missing)];
}

async function tryRefillContextAndRetry(reply, idx, active, apiKey, originalUserText, contextPaths, truncatedPaths) {
  const missing = findMissingFilesInReply(reply, contextPaths || new Set(), truncatedPaths || new Set());
  if (!missing.length) return null;

  state.messages[idx] = {
    role: 'assistant',
    html: '<div style="font-size:12px;line-height:1.5;color:var(--txt2);padding:8px"><b>Дочитываю файлы по запросу ИИ:</b><br>'
      + missing.slice(0, 3).map(p => '📄 ' + escapeHtml(p)).join('<br>') + '</div>',
    streaming: true
  };
  renderChat();

  const additionalParts = [];
  const forceInclude = new Set();
  const diagErrors = [];
  const extraBudget = 14000;
  let usedChars = 0;

  for (const path of missing.slice(0, 3)) {
    try {
      const node = locateByPath(state.project.files, path);
      if (!node || node.type !== 'file') {
        diagErrors.push(path + ': не найден в дереве');
        continue;
      }
      const rawContent = await bridgeAsync('readFile', node.uri);
      if (typeof rawContent !== 'string' || !rawContent.length) {
        diagErrors.push(path + ': пустой или не читается');
        continue;
      }

      const remaining = extraBudget - usedChars;
      if (remaining < 1000) {
        diagErrors.push(path + ': не хватило места в бюджете');
        continue;
      }

      let displayContent = rawContent;
      let partial = false;

      if (rawContent.length > remaining - 200) {
        const extracted = extractRelevantChunks(rawContent, searchTermsFromText(originalUserText + '\n' + reply), remaining - 300);
        displayContent = extracted.content;
        if (displayContent.length > remaining - 200) displayContent = displayContent.slice(0, remaining - 200);
        partial = true;
      }

      const label = partial ? 'ФАЙЛ ПРОЧИТАН ЧАСТИЧНО' : 'ПОЛНОСТЬЮ ПРОЧИТАННЫЙ ФАЙЛ';
      additionalParts.push('--- ' + label + ': ' + path + ' ---\n' + displayContent);
      usedChars += displayContent.length;
      forceInclude.add(path);
      contextPaths.add(path);

      if (partial) {
        truncatedPaths.add(path);
        diagErrors.push(path + ': отправлены только релевантные фрагменты');
      } else {
        truncatedPaths.delete(path);
      }
    } catch (e) {
      diagErrors.push(path + ': ' + String(e.message || e));
    }
  }

  if (!additionalParts.length) {
    state.messages[idx].html += '<div style="font-size:12px;color:var(--warn);padding:8px">Не удалось передать файлы:<br>' + diagErrors.map(escapeHtml).join('<br>') + '</div>';
    renderChat();
    return null;
  }

  try {
    const built = await buildApiMessages(originalUserText, true, active, forceInclude);
    const apiMessages = built.messages.filter(m => m.role !== 'system' || (!m.content.includes('[СОКРАЩЁННЫЙ КОНТЕКСТ') && !m.content.includes('[АКТУАЛЬНЫЕ ФАЙЛЫ ДЛЯ ЗАДАЧИ]')));
    
    apiMessages.push({ role: 'assistant', content: String(reply || '') });
    
    let followUp = 'Ты запросил дополнительные файлы.\n'
      + 'ВАЖНО: Если файл помечен как "ЧАСТИЧНО", НЕ ВЫДУМЫВАЙ скрытый код.\n'
      + 'Если информации достаточно, верни краткое объяснение и ровно один блок gaschanges.\n\n'
      + additionalParts.join('\n\n');
    if (diagErrors.length) followUp += '\n\nДиагностика:\n' + diagErrors.join('\n');
    
    apiMessages.push({ role: 'user', content: followUp });

    const newReply = await doAiRequest(active.type, active.model, active.endpoint || '', apiKey, apiMessages, active.id);
    const replyText = newReply && typeof newReply === 'object' && newReply.text ? newReply.text : (typeof newReply === 'string' ? newReply : '');

    if (!replyText.trim()) {
      state.messages[idx].html += '<div style="font-size:12px;color:var(--warn);padding:8px">Повторный запрос вернул пустой ответ.</div>';
      renderChat();
      return null;
    }
    return replyText;
  } catch (e) {
    state.messages[idx].html += '<div style="font-size:12px;color:var(--err);padding:8px">Ошибка повторного запроса: ' + escapeHtml(String(e.message || e)) + '</div>';
    renderChat();
    return null;
  }
}

async function finishStreamMessage(idx, reply, originalUserText, contextPaths, truncatedPaths) {
  if (!reply || !String(reply).trim()) {
    state.messages[idx] = {
      role: 'assistant',
      html: '<div style="color:var(--warn)">Модель вернула пустой ответ</div><p style="font-size:13px;color:var(--txt2);margin-top:6px">Возможно, запрос заблокирован фильтрами или произошла ошибка API.</p><button class="btn sm" onclick="retryLastRequest()" style="margin-top:8px">Повторить</button>',
      text: ''
    };
    renderChat();
    saveChatNow();
    return;
  }

  if (state.agentMode && contextPaths) {
    const active = typeof getActiveProvider === 'function' ? getActiveProvider() : null;
    if (active) {
      const apiKey = getActiveApiKey(active);
      const newReply = await tryRefillContextAndRetry(reply, idx, active, apiKey, originalUserText, contextPaths, truncatedPaths);
      if (newReply) reply = newReply;
    }
  }

  const pc = (state.agentMode && state.project) ? parseChangesFromReply(reply) : { list: [], spans: [], truncated: false };
  
  // ОТЛАДКА: Показываем пользователю, сколько изменений найдено парсером
  if (state.agentMode) {
    toast(`Парсинг: найдено ${pc.list.length} блоков изменений.`);
  }

  let clean = pc.spans.length ? removeSpans(reply, pc.spans) : reply;
  clean = clean.replace(/^[ \t]*gaschanges[ \t]*$/gmi, '').trim();
  let html = formatAiReply(clean);

  const isUnclosedGaschanges = pc.list.length === 0 && /```gaschanges[\s\S]*$/.test(reply) && !/\]\s*```/.test(reply);
  
  if (pc.truncated || isUnclosedGaschanges) {
    html += '<div class="op-card" style="border-color:var(--acc2)"><div class="chk" style="border-color:var(--acc2)"></div><div class="op-body"><div class="op-title">Ответ оборвался. Автоматическое продолжение...</div><div class="op-sub">ИИ дописывает изменения в фоне.</div></div></div>';
    
    setTimeout(async () => {
      await retryLastRequest();
    }, 1000);
  }

  if (pc.list.length) {
    const sum = await materializeChanges(pc.list);
    
    if (sum.added > 0) {
      const names = pc.list.slice(0, 6).map(c => {
        const p = String(c.path || '');
        const i2 = p.lastIndexOf('/');
        return i2 >= 0 ? p.substring(i2 + 1) : p;
      });
      
      html += `<div class="op-card done"><div class="chk">✓</div><div class="op-body">
        <div class="op-title">Подготовлено изменений: ${sum.added} файл(ов)</div>
        <div class="op-sub">${escapeHtml(names.join(', '))}${sum.skipped.length ? ' · отклонено: ' + escapeHtml(sum.skipped.join(', ')) : ''}</div>
        <div class="op-sub" style="margin-top:4px">Проверь diff и нажми «Применить» во вкладке «Изменения».</div>
      </div></div><div class="btn-row"><button class="btn primary sm" onclick="goChanges()">Открыть изменения</button></div>`;
      
      if (state.project && state.project.uri && state.projectMemory) {
        state.projectMemory.pending.push(`Изменения для: "${originalUserText.slice(0, 50)}..."`);
        saveProjectMemory(state.project.uri, state.projectMemory);
      }
    } else if (sum.skipped.length > 0) {
      html += `<div class="op-card" style="border-color:var(--warn)"><div class="chk" style="border-color:var(--warn)"></div><div class="op-body">
        <div class="op-title" style="color:var(--warn)">⚠️ Изменения отклонены системой</div>
        <div class="op-sub">Файлы не найдены или путь указан неверно:<br>${escapeHtml(sum.skipped.join('<br>'))}</div>
      </div></div>`;
    } else {
      html += `<div class="op-card" style="border-color:var(--warn)"><div class="chk" style="border-color:var(--warn)"></div><div class="op-body">
        <div class="op-title" style="color:var(--warn)">⚠️ ИИ не создал блок gaschanges</div>
        <div class="op-sub">ИИ написал текст, но не предоставил изменения в формате JSON. Попробуй написать "создай gaschanges" или переформулируй запрос.</div>
      </div></div>`;
    }
  }

  state.messages[idx] = { role: 'assistant', html: html, text: clean, truncated: !!pc.truncated };
  renderChat();
  saveChatNow();
}

function goChanges() {
  showScreen('scr-files');
  const t = document.getElementById('tabChangesLabel');
  if (t) switchTab(t, 'changes');
}

async function materializeChanges(list) {
  const skipped = [];
  let added = 0;
  const projName = state.project && state.project.name ? state.project.name.toLowerCase() : '';

  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    let path = String(c.path || '').replace(/^res:\/\//i, '').replace(/^\/+/, '').replace(/\\/g, '/');
    const content = String(c.content == null ? '' : c.content);
    
    if (!path || isProtectedPath(path)) {
      skipped.push((path || '(без пути)').split('/').pop() + ' (защищено/невалидно)');
      continue;
    }
    
    try {
      if (c.action === 'read') {
        continue;
      }
      
      let node = locateByPath(state.project.files, path);
      
      if ((!node || node.type !== 'file') && path.includes('/')) {
        const parts = path.split('/');
        if (parts[0].toLowerCase() === projName) {
          const shortPath = parts.slice(1).join('/');
          node = locateByPath(state.project.files, shortPath);
          if (node && node.type === 'file') path = shortPath;
        }
      }
      
      if (!node || node.type !== 'file') {
        const fileName = path.split('/').pop();
        const allFiles = getAllFilesFromTree(state.project.files);
        const matches = allFiles.filter(f => f.name.toLowerCase() === fileName.toLowerCase());
        if (matches.length === 1) {
          node = matches[0];
          path = node.path;
        }
      }

      if (c.action === 'modify') {
        if (node && node.type === 'file') {
          const old = await bridgeAsync('readFile', node.uri);
          proposeChange({ action: 'modify', path: path, uri: node.uri, content: content, oldContent: typeof old === 'string' ? old : JSON.stringify(old) });
          added++;
          continue;
        } else {
          skipped.push(path + ' (файл не найден в проекте)');
          continue;
        }
      } else if (c.action === 'create') {
        const parts = path.split('/');
        const name = parts.pop();
        let parentPath = parts.join('/');
        
        let parentNode = parentPath ? locateByPath(state.project.files, parentPath) : state.project.files;
        
        if ((!parentNode || parentNode.type !== 'folder') && parentPath.includes('/')) {
           const pParts = parentPath.split('/');
           if (pParts[0].toLowerCase() === projName) {
              parentNode = locateByPath(state.project.files, pParts.slice(1).join('/'));
           }
        }
        
        if (parentNode && parentNode.type === 'folder') {
          proposeChange({ action: 'create', path: path, name: name, parentUri: parentNode.uri, content: content, oldContent: null });
          added++;
          continue;
        } else {
          skipped.push(path + ' (папка не найдена для создания)');
          continue;
        }
      } else {
        skipped.push(path + ' (неверный action: ' + c.action + ')');
      }
    } catch (e) {
      skipped.push(path + ' (ошибка: ' + e.message + ')');
    }
  }
  return { added: added, skipped: skipped };
}

function buildHandoff(newProviderId) {
  const p = typeof getProviderById === 'function' ? getProviderById(newProviderId) : null;
  const pName = p ? (p.name || p.type) : newProviderId;
  const lines = ['Передача контекста: ' + pName + '.'];
  if (state.project) {
    lines.push('Проект: ' + state.project.name + ', Godot ' + state.project.godotVersion + '.');
    if (state.project.map) {
      const m = state.project.map;
      lines.push('Файлов: ' + m.fileCount + ', сцен: ' + (m.scenes || []).length + ', скриптов: ' + (m.scripts || []).length);
    }
  }
  const tasks = state.messages.filter(m => m.role === 'user').slice(-4).map(m => m.text);
  if (tasks.length) lines.push('Задачи: ' + tasks.join(' | '));
  lines.push('Ожидающих изменений: ' + (state.pendingChanges ? state.pendingChanges.length : 0) + '.');
  return lines.join('\n');
}

function doHandoff(pId) {
  state.handoffText = buildHandoff(pId);
  const p = typeof getProviderById === 'function' ? getProviderById(pId) : null;
  state.messages.push({ role: 'assistant', html: '<p style="font-size:13px;color:var(--txt2)">🔁 Контекст передан в <b>' + escapeHtml(p ? (p.name || p.type) : pId) + '</b>.</p>', text: 'Контекст передан.' });
  renderChat();
  saveChatNow();
}

if (typeof activateFromChat === 'function') {
  const _origActivateFromChat = activateFromChat;
  activateFromChat = function(p) {
    const prev = getActiveProvider();
    const prevId = prev ? prev.id : null;
    _origActivateFromChat(p);
    if (prevId && prevId !== p && state.messages.length) doHandoff(p);
  };
}

function projectContextLine() {
  if (!state.project || !state.project.map) return '';
  const m = state.project.map;
  const scenes = (m.scenes || []).slice(0, 12).map(s => s.path);
  const scripts = (m.scripts || []).slice(0, 12).map(s => s.path);
  return 'Структура: ' + m.fileCount + ' файлов, сцен: ' + (m.scenes || []).length + ' (' + scenes.join(', ') + '), скриптов: ' + (m.scripts || []).length + ' (' + scripts.join(', ') + '). Главная: ' + (m.mainScene || 'неизвестна') + '.';
}

function isContinuationRequest(text) {
  return /^(продолж[аиь]|continue|дальше|дальнейш)/i.test(String(text || '').trim());
}

function findPrevAssistant(currentText) {
  let skippedCurrentUser = false;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.streaming) continue;
    if (!skippedCurrentUser && m.role === 'user' && m.text === currentText) { skippedCurrentUser = true; continue; }
    if (m.role === 'assistant') return m;
    break;
  }
  return null;
}

function formatAiReply(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(gdscript|gd|tscn|text)?\n?([\s\S]*?)```/g, function(m, lang, code) {
    return '<div class="code-block"><div class="code-head">' + (lang || 'code') + '</div><div class="code-body">' + code + '</div></div>';
  });
  html = html.replace(/`([^`]+)`/g, '<code style="background:#0a0a0f;padding:2px 6px;border-radius:4px;font-size:13px">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}
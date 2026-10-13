/* ================================================================
   APP — инициализация, события, кнопка «Назад», скроллбары, стрелки чата
   ================================================================ */

/* ---- свой скроллбар вместо системного + кнопки перехода в чате ---- */
(function() {
  const st = document.createElement('style');
  st.textContent =
    '::-webkit-scrollbar{display:block;width:4px;height:4px;background:transparent}'
    + '::-webkit-scrollbar-track{background:transparent}'
    + '::-webkit-scrollbar-thumb{background:var(--line2);border-radius:4px}'
    + '::-webkit-scrollbar-thumb:active{background:var(--acc)}'
    + '::-webkit-scrollbar-corner{background:transparent}'
    + '*{scrollbar-width:thin;scrollbar-color:var(--line2) transparent}'
    + '#scr-chat{position:relative}'
    + '.chat-jump{position:absolute;right:14px;bottom:calc(84px + var(--safe-b));z-index:25;display:flex;flex-direction:column;gap:8px}'
    + '.chat-jump button{width:38px;height:38px;border-radius:50%;background:var(--card2);border:1px solid var(--line);color:var(--txt2);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;transform:translateY(6px)}'
    + '.chat-jump button.show{opacity:1;pointer-events:auto;transform:none}'
    + '.chat-jump button:active{background:var(--acc);border-color:transparent;color:#fff}';
  document.head.appendChild(st);
})();

function initChatJump() {
  const chat = document.getElementById('scr-chat');
  const body = document.getElementById('chatBody');
  if (!chat || !body || document.getElementById('chatJump')) return;
  const wrap = document.createElement('div');
  wrap.className = 'chat-jump';
  wrap.id = 'chatJump';
  wrap.innerHTML =
    '<button id="jumpTop" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>'
    + '<button id="jumpBottom" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></button>';
  chat.appendChild(wrap);
  const up = document.getElementById('jumpTop');
  const dn = document.getElementById('jumpBottom');
  up.addEventListener('click', function() { body.scrollTo({ top: 0, behavior: 'smooth' }); });
  dn.addEventListener('click', function() { body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' }); });
  body.addEventListener('scroll', function() {
    const fromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
    dn.classList.toggle('show', fromBottom > 240);
    up.classList.toggle('show', body.scrollTop > 240);
  });
}
initChatJump();

/* ---- фикс макета: дети экранов не сжимаются ---- */
(function() {
  const st = document.createElement('style');
  st.textContent = '.screen > *{flex-shrink:0}';
  document.head.appendChild(st);
  const pa = document.getElementById('projActions');
  if (pa) pa.style.display = 'none';
})();

if (typeof clearCurrentProject === 'function') {
  const _origClear = clearCurrentProject;
  clearCurrentProject = function() {
    _origClear();
    const pa = document.getElementById('projActions');
    if (pa) pa.style.display = 'none';
  };
}

loadLocalState();
renderModels();
renderRecentProjects();

let bridgeInitDone = false;
window.addEventListener('bridge-ready', function() {
  document.getElementById('bridgeStatus').innerHTML = isAndroid
    ? '<span class="dot ok"></span> Android-слой подключён'
    : '<span class="dot warn"></span> Демо-режим (открыто в браузере)';
  if (!isAndroid || bridgeInitDone) return;
  bridgeInitDone = true;
  tryRestoreLastProject();
});

setTimeout(function() {
  if (!bridgeInitDone) {
    document.getElementById('bridgeStatus').innerHTML = isAndroid
      ? '<span class="dot ok"></span> Android-слой подключён'
      : '<span class="dot warn"></span> Демо-режим (открыто в браузере)';
  }
}, 500);

/* Клавиатура: debounce 140 мс */
let vvTimer = null;
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function() {
    clearTimeout(vvTimer);
    vvTimer = setTimeout(function() {
      const chat = document.getElementById('scr-chat');
      if (!chat.classList.contains('active')) return;
      chat.style.height = window.visualViewport.height + 'px';
      const body = document.getElementById('chatBody');
      if (body) body.scrollTop = body.scrollHeight;
    }, 140);
  });
}

/* ================================================================
   КНОПКА «НАЗАД»: булевы значения (не строки!)
   ================================================================ */
let lastBackPress = 0;

window.handleAndroidBack = function() {
  if (typeof editorOpen !== 'undefined' && editorOpen) {
    closeEditor();
    return true;
  }

  const overlay = document.getElementById('overlay');
  if (overlay && overlay.classList.contains('open')) {
    closeSheet();
    return true;
  }

  const chat = document.getElementById('scr-chat');
  const wizard = document.getElementById('scr-wizard');
  if (chat.classList.contains('active') || wizard.classList.contains('active')) {
    showScreen('scr-studio');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
    document.querySelector('.navbtn[data-screen="scr-studio"]').classList.add('active');
    return true;
  }

  const files = document.getElementById('scr-files');
  const models = document.getElementById('scr-models');
  const settings = document.getElementById('scr-settings');
  if (files.classList.contains('active') || models.classList.contains('active') || settings.classList.contains('active')) {
    showScreen('scr-studio');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
    document.querySelector('.navbtn[data-screen="scr-studio"]').classList.add('active');
    return true;
  }

  const studio = document.getElementById('scr-studio');
  if (studio.classList.contains('active')) {
    const now = Date.now();
    if (now - lastBackPress < 2000) {
      return false;
    }
    lastBackPress = now;
    toast('Нажмите ещё раз, чтобы выйти');
    return true;
  }

  return true;
};
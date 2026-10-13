/* ================================================================
   FIELDS — лимиты полей, крестик очистки, «глаз» для API-ключа
   ================================================================ */
(function() {
  const style = document.createElement('style');
  style.textContent =
    '.field-wrap{position:relative;display:flex;align-items:center}'
    + '.field-wrap .input{flex:1;padding-right:76px}'
    + '.field-btns{position:absolute;right:6px;display:flex;gap:2px;align-items:center}'
    + '.fbtn{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--txt3);background:transparent}'
    + '.fbtn:active{background:var(--card2);color:var(--txt)}'
    + '.chat-x{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--txt3);flex-shrink:0;visibility:hidden}'
    + '.chat-x.on{visibility:visible}';
  document.head.appendChild(style);

  const SVG_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const SVG_EYE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const SVG_EYE_OFF = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

  function makeBtn(html, title, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fbtn';
    b.title = title;
    b.innerHTML = html;
    b.addEventListener('click', fn);
    return b;
  }

  function decorate(inputId, opts) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.decorated) return;
    input.dataset.decorated = '1';
    if (opts.max) input.setAttribute('maxlength', String(opts.max));
    const wrap = document.createElement('div');
    wrap.className = 'field-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btns = document.createElement('div');
    btns.className = 'field-btns';
    if (opts.eye) {
      btns.appendChild(makeBtn(SVG_EYE, 'Показать/скрыть ключ', function() {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        this.innerHTML = show ? SVG_EYE_OFF : SVG_EYE;
      }));
    }
    btns.appendChild(makeBtn(SVG_X, 'Очистить', function() {
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    }));
    wrap.appendChild(btns);
  }

  decorate('mModel', { max: 128 });
  decorate('mEndpoint', { max: 256 });
  decorate('mKey', { max: 512, eye: true });

  /* Сброс поля ключа: скрытый вид + иконка открытого глаза */
  window.resetKeyField = function() {
    const input = document.getElementById('mKey');
    if (!input) return;
    input.type = 'password';
    const wrap = input.parentNode;
    if (wrap && wrap.classList && wrap.classList.contains('field-wrap')) {
      const btns = wrap.querySelectorAll('.fbtn');
      if (btns.length) btns[0].innerHTML = SVG_EYE;
    }
  };

  /* Поле чата: лимит + крестик */
  const chatInput = document.getElementById('chatInput');
  const chatField = document.querySelector('.chat-field');
  if (chatInput && chatField) {
    chatInput.setAttribute('maxlength', '4000');
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chat-x';
    x.innerHTML = SVG_X;
    x.addEventListener('click', function() {
      chatInput.value = '';
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    });
    chatField.appendChild(x);
    chatInput.addEventListener('input', function() {
      x.classList.toggle('on', chatInput.value.length > 0);
    });
  }

  /* Редактор файла: лимит на мега-вставки */
  const fvBody = document.getElementById('fvBody');
  if (fvBody && window.MutationObserver) {
    const mo = new MutationObserver(function() {
      const ed = document.getElementById('editorArea');
      if (ed && !ed.getAttribute('maxlength')) ed.setAttribute('maxlength', '200000');
    });
    mo.observe(fvBody, { childList: true, subtree: true });
  }
})();
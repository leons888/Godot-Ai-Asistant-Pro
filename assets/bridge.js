/* ================================================================
   BRIDGE — связь с Android-слоем (включая стриминг)
   ================================================================ */
const Bridge = (typeof window.AndroidBridge !== 'undefined') ? window.AndroidBridge : null;
const isAndroid = !!Bridge;
const callbacks = {};
let cbCounter = 1;

function bridgeAsync(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  return bridgeAsyncOn(Bridge, method, args);
}

function companionAsync(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  return bridgeAsyncOn(window.CompanionBridge || null, method, args);
}

/* Стриминг: метод + обработчик чанков + аргументы */
function bridgeStreamAsync(method, onChunk) {
  const args = Array.prototype.slice.call(arguments, 2);
  return new Promise(function(resolve, reject) {
    const obj = window.StreamBridge || null;
    if (!obj || typeof obj[method] !== 'function') {
      reject(new Error('StreamBridge недоступен: ' + method));
      return;
    }
    const id = 'cb' + (cbCounter++);
    callbacks[id] = { resolve: resolve, reject: reject, onChunk: onChunk };
    try {
      obj[method].apply(obj, args.concat([id]));
    } catch (e) {
      delete callbacks[id];
      reject(e);
    }
  });
}

function bridgeAsyncOn(obj, method, args) {
  return new Promise(function(resolve, reject) {
    if (!obj || typeof obj[method] !== 'function') {
      reject(new Error('Bridge недоступен: ' + method));
      return;
    }
    const id = 'cb' + (cbCounter++);
    callbacks[id] = { resolve: resolve, reject: reject };
    try {
      obj[method].apply(obj, args.concat([id]));
    } catch (e) {
      delete callbacks[id];
      reject(e);
    }
  });
}

window.__bridgeStream = function(id, chunk) {
  const cb = callbacks[id];
  if (cb && cb.onChunk) cb.onChunk(chunk);
};

window.__bridgeCallback = function(id, ok, data) {
  const cb = callbacks[id];
  if (!cb) return;
  delete callbacks[id];
  let parsed = data;
  try { parsed = JSON.parse(data); } catch (e) {}
  if (ok) cb.resolve(parsed); else cb.reject(new Error(data));
};

function escapeHtml(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function autoSize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
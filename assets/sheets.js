/* ================================================================
   SHEETS — модалки, overlay, собственные диалоги вместо alert/confirm
   ================================================================ */
let dialogResolver = null;

function openSheet(id) {
  document.getElementById('overlay').classList.add('open');
  document.querySelectorAll('.sheet').forEach(s => s.style.display = 'none');
  const sh = document.getElementById(id);
  if (sh) sh.style.display = 'flex';
  if (id === 'sheet-addmodel' && !editingProvider) {
    document.getElementById('addModelTitle').textContent = 'Добавить провайдера';
    document.getElementById('mEndpoint').value = '';
    document.getElementById('mModel').value = '';
    document.getElementById('mKey').value = '';
    document.getElementById('mKey').placeholder = 'sk-...';
    document.getElementById('btnDelete').style.display = 'none';
  }
}

function closeSheet() {
  document.getElementById('overlay').classList.remove('open');
  editingProvider = null;
  if (typeof resetEditor === 'function') resetEditor();
}

function closeOverlay(e) {
  if (e.target.id !== 'overlay') return;
  if (dialogResolver) { dialogFinish(false); return; }
  closeSheet();
}

/* ---- фирменный диалог (замена alert / confirm) ---- */
function appDialog(title, bodyHtml, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    dialogResolver = resolve;
    document.getElementById('dlgTitle').textContent = title;
    document.getElementById('dlgBody').innerHTML = bodyHtml;
    document.getElementById('dlgOk').textContent = opts.okText || 'ОК';
    document.getElementById('dlgCancel').style.display = opts.confirm ? 'inline-flex' : 'none';
    openSheet('sheet-dialog');
  });
}

function dialogFinish(val) {
  const r = dialogResolver;
  dialogResolver = null;
  document.getElementById('overlay').classList.remove('open');
  if (typeof resetEditor === 'function') resetEditor();
  if (r) r(val);
}

function dialogOk() { dialogFinish(true); }
function dialogCancel() { dialogFinish(false); }
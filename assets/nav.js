/* ================================================================
   NAV — навигация между экранами
   ================================================================ */
function nav(btn, id) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  showScreen(id);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById(id);
  if (s) { s.classList.add('active'); s.scrollTop = 0; }
  const navBtn = document.querySelector('.navbtn[data-screen="' + id + '"]');
  if (navBtn) {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
    navBtn.classList.add('active');
  }
  document.getElementById('bottomNav').style.display =
    (id === 'scr-chat' || id === 'scr-wizard') ? 'none' : 'grid';
}

function switchTab(el, name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['files', 'changes', 'history'].forEach(n => {
    document.getElementById('tab-' + n).style.display = (n === name) ? 'block' : 'none';
  });
  if (name === 'changes') renderChanges();
  if (name === 'history') renderHistory();
}
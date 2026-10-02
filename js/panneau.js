/* Choix du chat : le mien, ou celui de Perplexity. Historiques séparés. */
'use strict';

function chatChoix() {
  return localStorage.getItem('ms_chat_choix') === 'pplx' ? 'pplx' : 'moi';
}
function panneauChoix(which) {
  localStorage.setItem('ms_chat_choix', which === 'pplx' ? 'pplx' : 'moi');
  try { parent.postMessage({ type: 'ms-chat', which: chatChoix() }, '*'); } catch (e) {}
  if (typeof render === 'function') render();
}
window.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'ms-chat') return;
  if (e.data.which !== 'moi' && e.data.which !== 'pplx') return;
  localStorage.setItem('ms_chat_choix', e.data.which);
  if (typeof render === 'function') render();
});

(function () {
  const st = document.createElement('style');
  st.textContent = '.choixchat{display:flex;gap:6px;margin:0 0 8px}.choixchat button{flex:1;border:1px solid var(--ln);background:var(--cd);color:var(--ink);border-radius:999px;padding:8px 10px;font:inherit;font-size:14px}.choixchat button.on{background:var(--sl);color:#fff;border-color:var(--sl)}';
  document.head.appendChild(st);
  const _chatV = chatV;
  chatV = function () { return _chatV(); };
  if (/[?&]panneau=1/.test(location.search)) {
    const _boot = boot;
    boot = async function () {
      await _boot();
      go('a');
    };
  }
})();

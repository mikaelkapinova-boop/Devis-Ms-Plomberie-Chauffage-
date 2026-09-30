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
  chatV = function () {
    const which = chatChoix();
    const barre = '<div class="choixchat"><button type="button" class="' + (which === 'moi' ? 'on' : '') + '" onclick="panneauChoix(\'moi\')">Mon chat</button><button type="button" class="' + (which === 'pplx' ? 'on' : '') + '" onclick="panneauChoix(\'pplx\')">Chat Perplexity</button></div>';
    if (which === 'pplx') {
      return barre + '<div class="c"><h3>Chat Perplexity</h3><p class="mu" style="margin:0">Son historique reste dans Perplexity. Il n\'est pas copié ici, et Mon chat garde le sien. Sur l\'ordinateur, l\'extension affiche ce panneau au-dessus de Perplexity sans mélanger les deux.</p></div>';
    }
    return barre + '<p class="mu" style="font-size:12px;margin:0 0 8px">Historique de Mon chat, séparé de Perplexity. <button type="button" class="b gh sm" onclick="copieFiche()">Copier la fiche projet</button></p>' + _chatV();
  };
  if (/[?&]panneau=1/.test(location.search)) {
    const _boot = boot;
    boot = async function () {
      await _boot();
      go('a');
    };
  }
})();

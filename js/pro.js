/* Perplexity Pro sans clé API.
   Perplexity n'autorise pas une autre appli à interroger le chat Pro à sa place.
   Ce fichier ouvre le vrai chat Pro (compte déjà connecté) et ramène la réponse ici en un geste. */
'use strict';

let PRO_LAST = '';

(function () {
  const st = document.createElement('style');
  st.textContent = `
#probar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:70;display:none;background:var(--cd);color:var(--ink);border-radius:22px;padding:14px;box-shadow:0 16px 50px #00000033,0 0 0 1px var(--ln)}
#probar.on{display:block}
#probar b{display:block;font-size:16px;margin-bottom:4px}
#probar p{margin:0 0 10px;color:var(--mu);font-size:13.5px;line-height:1.35}
#probar textarea{min-height:72px;margin:0 0 8px;font-size:15px}
#probar .row{display:flex;gap:8px}
#probar .row .b{flex:1}
`;
  document.head.appendChild(st);
  const bar = document.createElement('div');
  bar.id = 'probar';
  bar.innerHTML = `<b>Réponse du chat Pro</b><p>Dans Perplexity, copie toute la réponse. Reviens ici et touche Appliquer. Le devis, la facture ou le rapport se crée dans l'appli. Aucune clé API.</p><textarea id="propaste" placeholder="Ou colle la réponse ici"></textarea><div class="row"><button class="b" onclick="proApply()"><span>Appliquer</span></button><button class="b gh" onclick="proBar(0)"><span>Plus tard</span></button></div>`;
  document.body.appendChild(bar);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && $('#probar') && $('#probar').classList.contains('on')) {
      const e = $('#propaste'); if (e) e.focus();
    }
  });
})();

function proBar(on) {
  const b = $('#probar'); if (!b) return;
  b.classList.toggle('on', !!on);
}

const _cfgPro = cfgInit;
cfgInit = function () {
  _cfgPro();
  if (!pk() && S.cfg.as && S.cfg.as.ai === 'api') S.cfg.as.ai = 'pro';
  (S.threads || []).forEach(function (t) { if (!pk() && t.ai === 'api') t.ai = 'pro'; });
};

proOpen = async function (t, txt, clear) {
  const eff = modEff(t);
  let prep = {texts: [], names: []};
  try { prep = await prepAtt(); } catch (e) {}
  const demande = txt || 'Analyse les documents joints.';
  const prompt = sysPrompt(t, eff) + '\n\nMA DEMANDE : ' + demande + (prep.texts.length ? '\n\n' + prep.texts.join('\n\n') : '');
  PRO_LAST = prompt;
  const files = ATT.filter(a => a.k === 'img').map(a => a.f);
  chatPush({r: 'u', t: demande, att: prep.names});
  chatPush({r: 'a', t: 'Envoyé au chat Perplexity Pro, sans clé API. Connecte-toi avec ton abonnement si ce n\'est pas déjà fait. Choisis ' + (eff ? eff.n : 'ton modèle') + ' dans Perplexity. Copie toute la réponse, reviens ici, touche Appliquer.', via: 'Perplexity Pro'});
  ATT = []; if (clear) clear(); render();
  try { await navigator.clipboard.writeText(prompt); } catch (e) {}
  proBar(1);
  const court = (demande + (prep.texts[0] ? '\n' + prep.texts[0].slice(0, 400) : '')).replace(/\s+/g, ' ').slice(0, 1200);
  const q = court + ' Réponds en français. Termine par un bloc json.';
  if (files.length && navigator.canShare && navigator.canShare({files: files})) {
    try { await navigator.share({files: files, text: q}); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const w = window.open('https://www.perplexity.ai/search/new?q=' + enc(q), 'pplxpro');
  if (!w) toast('Autorise les fenêtres, ou ouvre Perplexity : la question est copiée');
};

async function proApply() {
  const box = $('#propaste');
  let txt = (box && box.value || '').trim();
  if (!txt) {
    try { txt = (await navigator.clipboard.readText() || '').trim(); } catch (e) { txt = ''; }
  }
  if (!txt) return toast('Copie la réponse dans Perplexity, puis Appliquer');
  if (PRO_LAST && txt === PRO_LAST) return toast('C\'est la question, pas la réponse. Copie la réponse de Perplexity.');
  if (box) box.value = '';
  chatPush({r: 'u', t: '(réponse du chat Pro)'});
  asReply(TH(), txt, 'Perplexity Pro');
  proBar(0);
  render();
}

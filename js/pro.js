/* Perplexity Pro sans clé. La page s'ouvre dans Safari, jamais dans l'appli.
   L'adresse /search/new?q= lance la question, comme la flèche d'envoi, avec la session déjà connectée. */
'use strict';

let PRO_LAST = '';

const PRECODES = `PRÉCODES D'ORCHESTRE — tu exécutes, l'appli applique. L'artisan ne doit pas quitter l'appli.
Choisis un seul précode et termine par UN bloc json, rien après.
P1 DEVIS ou FACTURE : {"client":{"nom":"","adresse":"","cp_ville":"","tel":""},"objet":"","F":[{"d":"fourniture","q":1,"p":0}],"M":[{"d":"main-d'œuvre ou déplacement","q":1,"p":0}],"note":""}
P2 MODIFIER : le document complet, mêmes clés que P1, toutes les lignes, pas seulement le changement.
P3 RAPPORT : {"rapport":{"ty":"Dégât des eaux | Recherche de fuite | Panne de chauffage | Diagnostic plomberie | Autre","cn":"","ca":"","cc":"","ct":"","ass":"","sn":"","mo":"","co":"","org":"","tr":"","pr":""}}
P4 PRIX : tableau article | fournisseur | prix HT | lien, puis {"items":[{"d":"","t":"F","pa":0,"mg":35,"ref":"","fo":""}]}
P5 PHOTO : identifie l'objet, cherche un correspondant vendu en France, puis P1 ou P4.
Prix unitaires HT, nombres, marché français 2026. Estimation marquée dans note. Pas de référence inventée.`;

const _cfgPro = cfgInit;
cfgInit = function () {
  _cfgPro();
  if (!pk() && S.cfg.as && S.cfg.as.ai === 'api') S.cfg.as.ai = 'pro';
  (S.threads || []).forEach(function (t) { if (!pk() && t.ai === 'api') t.ai = 'pro'; });
};

function proSafari(q) {
  const url = 'https://www.perplexity.ai/search/new?q=' + encodeURIComponent(q);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
proOpen = async function (t, txt, clear) {
  const eff = modEff(t);
  let prep = {texts: [], names: []};
  try { prep = await prepAtt(); } catch (e) {}
  const demande = txt || 'Analyse les documents joints.';
  const prompt = PRECODES + '\n\n' + sysPrompt(t, eff) + '\n\nMA DEMANDE : ' + demande + (prep.texts.length ? '\n\n' + prep.texts.join('\n\n') : '');
  PRO_LAST = prompt;
  chatPush({r: 'u', t: demande, att: prep.names});
  ATT = [];
  if (clear) clear();
  if (dansPanneau()) {
    chatPush({r: 'a', t: 'Envoyé dans le chat de cette page Perplexity. Aucune autre appli ne s\'ouvre.', via: 'Perplexity'});
    render();
    try { parent.postMessage({ type: 'ms-envoi', text: prompt }, '*'); } catch (e) { toast('Le panneau n\'est pas sur la page Perplexity'); }
    return;
  }
  chatPush({r: 'a', t: 'Ouvert dans Safari, pas dans l\'appli. Copie la réponse, reviens, touche Appliquer.', via: 'Safari'});
  render();
  try { await navigator.clipboard.writeText(prompt); } catch (e) {}
  proBar(1);
  const q = (demande + ' Réponds en français. Termine par un bloc json.').replace(/\s+/g, ' ').slice(0, 1500);
  proSafari(q);
};
function dansPanneau() {
  try { return /[?&]panneau=1/.test(location.search) || window.parent !== window; } catch (e) { return false; }
}
window.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'ms-envoi-etat') return;
  toast(e.data.ok ? 'Envoyé sur la page Perplexity' : 'Zone de saisie Perplexity introuvable. Touche ↺ sur le panneau, puis renvoie.');
});

function proStay(e) {
  const hors = e instanceof TypeError || (e && e.code === 401);
  chatPush({r: 'a', t: hors
    ? 'Envoi en caché impossible pour l\'instant : le petit programme du compte Perplexity n\'est pas joignable sur cet appareil. Je n\'ouvre pas Perplexity et je ne te sors pas de l\'appli. Sur le PC, lance lancer.bat une fois, connecte le compte (sans clé), puis renvoie. Le chat Pro du site ne peut pas recevoir un message caché.'
    : 'Envoi en caché arrêté : ' + ((e && e.message) || e) + '. Tu restes dans l\'appli.', via: 'En caché'});
  render();
}

(function () {
  const st = document.createElement('style');
  st.textContent = '#probar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:70;display:none;background:var(--cd);color:var(--ink);border-radius:22px;padding:14px;box-shadow:0 16px 50px #00000033,0 0 0 1px var(--ln)}#probar.on{display:block}#probar b{display:block;font-size:16px;margin-bottom:4px}#probar p{margin:0 0 10px;color:var(--mu);font-size:13.5px;line-height:1.35}#probar textarea{min-height:72px;margin:0 0 8px;font-size:15px}#probar .row{display:flex;gap:8px}#probar .row .b{flex:1}';
  document.head.appendChild(st);
  const bar = document.createElement('div');
  bar.id = 'probar';
  bar.innerHTML = '<b>Réponse Safari</b><p>Perplexity est ouvert dans Safari, pas dans l\'appli. Copie toute la réponse, reviens, touche Appliquer.</p><textarea id="propaste" placeholder="Ou colle la réponse ici"></textarea><div class="row"><button class="b" type="button" onclick="proApply()"><span>Appliquer</span></button><button class="b gh" type="button" onclick="proBar(0)"><span>Plus tard</span></button></div>';
  document.body.appendChild(bar);
})();
function proBar(on) {
  const b = $('#probar');
  if (b) b.classList.toggle('on', !!on);
}
async function proApply() {
  const box = $('#propaste');
  let txt = (box && box.value || '').trim();
  if (!txt) {
    try { txt = (await navigator.clipboard.readText() || '').trim(); } catch (e) { txt = ''; }
  }
  if (!txt) return toast('Copie la réponse dans Safari, puis Appliquer');
  if (PRO_LAST && txt === PRO_LAST) return toast('C\'est la question, pas la réponse.');
  if (box) box.value = '';
  chatPush({r: 'u', t: '(réponse Safari)'});
  asReply(TH(), txt, 'Perplexity Pro');
  proBar(0);
  render();
}

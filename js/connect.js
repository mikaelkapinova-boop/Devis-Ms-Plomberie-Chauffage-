/* Connecteurs : une page s'ouvre, tu te connectes, la ligne passe à « connecté ». */
'use strict';

const CX_BASE = [
  {id: 'github', n: 'GitHub', u: 'https://github.com/login'},
  {id: 'google', n: 'Google', u: 'https://accounts.google.com/signin'},
  {id: 'outlook', n: 'Outlook', u: 'https://outlook.live.com/'},
  {id: 'chorus', n: 'Chorus Pro', u: 'https://portail.chorus-pro.gouv.fr/'},
  {id: 'perplexity', n: 'Perplexity', u: 'https://www.perplexity.ai/'}
];

function cxInit() {
  if (!S.cfg) return;
  if (!Array.isArray(S.cfg.cx)) S.cfg.cx = [];
  let add = 0;
  CX_BASE.forEach(b => {
    if (!S.cfg.cx.some(x => x.id === b.id)) { S.cfg.cx.push({id: b.id, n: b.n, u: b.u, ok: false}); add = 1; }
  });
  if (add) save('cfg');
}
function cxTrouver(id) { return (S.cfg.cx || []).find(x => x.id === id); }
function cxLigne(c) { return c.ok ? (c.n + ' connecté') : 'Non connecté'; }

function cxV() {
  cxInit();
  const L = S.cfg.cx || [];
  return `<div class="c" style="padding-bottom:4px"><p class="mu" style="margin:0;font-size:13px">Touche un service. La page s'ouvre, tu te connectes, et la ligne passe à connecté.</p></div>` +
    L.map(c => `<div class="r"><button type="button" onclick="cxOuvrir('${c.id}')" style="flex:1;border:0;background:none;color:inherit;font:inherit;text-align:left;padding:0"><b>${esc(c.n)}</b><br><small class="${c.ok ? 'ok' : 'mu'}">${esc(cxLigne(c))}</small></button>${c.ok ? `<button class="b gh sm" type="button" onclick="cxOff('${c.id}')">Déconnecter</button>` : '<span class="mu">Ouvrir</span>'}</div>`).join('') +
    (L.some(c => c.ok) ? `<div class="c"><button class="b gh sm" type="button" onclick="cxOffTout()">Tout déconnecter</button></div>` : '') +
    `<div class="c"><h3>Ajouter un site</h3><label>Nom<input id="cxn" placeholder="Nom du site" autocomplete="off"></label><label>Page de connexion<input id="cxu" placeholder="https://…" inputmode="url" autocomplete="off"></label><button class="b" type="button" onclick="cxAjouter()"><span>Ajouter</span></button></div>`;
}

function cxOuvrir(id) {
  const c = cxTrouver(id);
  if (!c || !c.u) return;
  S.cfg.cxPending = id;
  S.cfg.cxPendingAt = Date.now();
  save('cfg');
  const a = document.createElement('a');
  a.href = c.u;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function cxMarquer(id) {
  const c = cxTrouver(id);
  if (!c) return;
  c.ok = true;
  c.at = Date.now();
  S.cfg.cxPending = '';
  save('cfg');
  toast(c.n + ' connecté');
  if (typeof V !== 'undefined' && V.v === 'k') render();
}
function cxOff(id, ev) {
  if (ev) ev.stopPropagation();
  const c = cxTrouver(id);
  if (!c) return;
  c.ok = false;
  save('cfg');
  render();
}
function cxOffTout() {
  (S.cfg.cx || []).forEach(c => { c.ok = false; });
  save('cfg');
  render();
}
function cxAjouter() {
  const n = ($('#cxn') && $('#cxn').value || '').trim();
  let u = ($('#cxu') && $('#cxu').value || '').trim();
  if (!n || !u) return toast('Nom et page de connexion');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { u = new URL(u).href; } catch (e) { return toast('Adresse invalide'); }
  const id = 'c' + Date.now().toString(36);
  S.cfg.cx.push({id, n: n.slice(0, 40), u, ok: false, custom: 1});
  save('cfg');
  render();
  cxOuvrir(id);
}
function cxRetour() {
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  const id = S.cfg && S.cfg.cxPending;
  if (!id) return;
  if (Date.now() - (S.cfg.cxPendingAt || 0) < 1200) return;
  cxMarquer(id);
}
document.addEventListener('visibilitychange', cxRetour);
window.addEventListener('pageshow', cxRetour);

const _cfgCx = cfgInit;
cfgInit = function () {
  _cfgCx();
  if (!S.cfg.as) S.cfg.as = {};
  S.cfg.as.ai = 'api';
  (S.threads || []).forEach(t => { t.ai = 'api'; });
  if (!S.cfg.pk && S.cfg.ai && S.cfg.ai.key) S.cfg.pk = S.cfg.ai.key;
  cxInit();
};

const _bub2Cx = bub2;
bub2 = function (m, i) {
  let h = _bub2Cx(m, i);
  if (m.ix && m.ix.type === 'outils_confirm' && i === TH().msgs.length - 1 && !ASBUSY) {
    h = h.replace('<span class="meta">', '<div class="acts"><button class="b sm" onclick="outilsConfirmer()"><span>Confirmer</span></button><button class="b gh sm" onclick="outilsAnnuler()"><span>Annuler</span></button></div><span class="meta">');
  }
  return h;
};

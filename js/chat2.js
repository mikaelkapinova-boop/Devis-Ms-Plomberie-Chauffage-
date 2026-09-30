/* Ms Plomberie & Chauffage — v3.4
   1. Tchat intégré : Computer directement dans l'appli (pont local serveur.py, OAuth, sans clé API),
      en plus des modes existants (Computer par e-mail, Perplexity chat normal).
   2. Type de demande : Documents (devis, facture, rapport, modification, prix) / Application (amélioration, projet IA, autre).
   3. Glisser vers la gauche pour supprimer, corbeille (restaurer / vider), sélection multiple.
   4. Brouillons : les zones de saisie libres sont sauvegardées automatiquement.
   Ce fichier ne remplace aucune fonction existante sans la rappeler : il les enveloppe. */
'use strict';

/* ---------- Données supplémentaires ---------- */
S.trash = S.trash || [];
const MC_DEF = 'http://127.0.0.1:8765';
const CAT2 = {
  devis:  {g:'docs', l:'Création de devis'},
  facture:{g:'docs', l:'Création de facture'},
  rapport:{g:'docs', l:'Rapport / attestation'},
  modif:  {g:'docs', l:"Modification d'un document"},
  prix:   {g:'docs', l:'Recherche de prix fournisseur'},
  amel:   {g:'app',  l:"Amélioration de l'appli"},
  projet: {g:'app',  l:'Création de projet IA'},
  autre:  {g:'app',  l:'Autre'}
};
const PROMPT_APP = "codage. Tu es un ingénieur logiciel expert. Je suis artisan plombier-chauffagiste (Ms Plomberie & Chauffage) et je développe "+
 "mon application web de devis/factures (PWA, dépôt GitHub mikaelkapinova-boop/Devis-Ms-Plomberie-Chauffage- : index.html, js/ext.js, js/chat2.js, "+
 "js/auth.js, serveur.py). Réponds en français. Fournis toujours du code complet et fonctionnel, jamais de raccourcis du type « reste du code ici ». "+
 "Explique tes choix d'architecture étape par étape. Pour un nouveau projet IA, donne la structure, les fichiers complets et les commandes Windows/PowerShell.";

const c2 = () => S.cfg;
const CK = () => CAT2[c2().cat2] ? c2().cat2 : 'devis';
const CG = () => CAT2[CK()].g;
const mcBase = () => (location.port === '8765' ? '' : (c2().mcu || MC_DEF).replace(/\/+$/, ''));
let MCBUSY = false, MCOK = null, TRV = null, SELM = false, SELS = new Set();

const _cfgInit = cfgInit;
cfgInit = function () {
  _cfgInit();
  if (!Array.isArray(S.trash)) S.trash = [];
  if (!S.cfg.mct || typeof S.cfg.mct !== 'object') S.cfg.mct = {docs:'', app:''};
  if (!S.cfg.cat2) S.cfg.cat2 = 'devis';
  if (!S.cfg.mcu) S.cfg.mcu = MC_DEF;
};

/* ---------- Styles ---------- */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.sww{position:relative;overflow:hidden;border-radius:18px;margin-bottom:8px}
.sww>.r{position:relative;z-index:1;margin:0!important;transition:transform .2s;touch-action:pan-y;width:100%}
.swd{position:absolute;right:0;top:0;bottom:0;width:96px;border:0;background:#e53935;color:#fff;font-weight:700;font-size:14px;border-radius:0 18px 18px 0;cursor:pointer}
.selbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 2px 10px}
.selbar .b{flex:0 0 auto}
.selm .r{padding-left:44px!important;position:relative}
.selm .r::before{content:'';position:absolute;left:14px;top:50%;width:18px;height:18px;margin-top:-9px;border:2px solid var(--mu,#889);border-radius:5px}
.selm .r.sel::before{background:#1e88e5;border-color:#1e88e5}
.selm .r.sel::after{content:'✓';position:absolute;left:17px;top:50%;margin-top:-10px;color:#fff;font-size:14px;font-weight:700}
.trr{display:flex;gap:8px;align-items:center;justify-content:space-between}
.mcst{display:inline-flex;gap:6px;align-items:center;font-size:12px}
.mcdot{width:9px;height:9px;border-radius:50%;background:#aaa;display:inline-block}
.mcdot.on{background:#2e7d32}
.mcspin{display:inline-block;width:13px;height:13px;border:2px solid #bbb;border-top-color:#1e88e5;border-radius:50%;animation:mcr 1s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes mcr{to{transform:rotate(360deg)}}
.ixb{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.bub a{color:inherit;text-decoration:underline;word-break:break-all}
.cat2{margin:8px 0 0}`;
  document.head.appendChild(st);
})();

/* =====================================================================
   1. CORBEILLE, GLISSER POUR SUPPRIMER, SÉLECTION MULTIPLE
   ===================================================================== */
const colOf = t => t === 'x' ? 'rep' : 'docs';
function trPut(col, id) {
  const L = S[col], i = L.findIndex(x => x.id === id);
  if (i < 0) return false;
  const it = L.splice(i, 1)[0], e = {k: col, it, at: Date.now()};
  if (col === 'rep' && S.ph[id]) { e.ph = S.ph[id]; delete S.ph[id]; save('ph'); }
  S.trash.unshift(e);
  return true;
}
function trDel(ids, t) {
  const col = colOf(t); let k = 0;
  ids.forEach(id => { if (trPut(col, id)) k++; });
  save(col); save('trash');
  return k;
}
function trRestore(idx) {
  const e = S.trash[idx]; if (!e) return;
  S.trash.splice(idx, 1);
  S[e.k].unshift(e.it);
  if (e.ph) { S.ph[e.it.id] = e.ph; save('ph'); }
  save(e.k); save('trash'); render(); toast('Restauré : ' + (e.it.num || 'document'));
}
function trKill(idx, b) { arm2(b, () => { S.trash.splice(idx, 1); save('trash'); render(); toast('Supprimé définitivement'); }); }
function trList(t) { return S.trash.map((e, i) => ({e, i})).filter(x => t === 'all' || (x.e.k === colOf(t) && (t === 'x' || x.e.it.t === t))); }
function trOpenAll() { go('d'); TRV = 'all'; render(); scrollTo(0, 0); }
function trAll(b) { const L = trList(TRV); if (!L.length) return; arm2(b, () => { L.reverse().forEach(x => trRestore(x.i)); }); }
function trEmpty(b) { const L = trList(TRV); if (!L.length) return; arm2(b, () => { const del = new Set(L.map(x => x.i)); S.trash = S.trash.filter((_, i) => !del.has(i)); save('trash'); render(); toast('Corbeille vidée'); }); }
function trOpen() { TRV = V.v; SELM = false; SELS.clear(); render(); scrollTo(0, 0); }
function trClose() { TRV = null; render(); }
function trV() {
  const t = TRV, L = trList(t), nm = {d:'devis', f:'factures', x:'rapports', all:'documents'}[t];
  return `<div class="selbar"><button class="b gh sm" onclick="trClose()"><span>‹ ${t === 'all' ? 'Devis' : 'Retour aux ' + nm}</span></button>
<button class="b sm" onclick="trAll(this)" data-t="Tout restaurer"><span>Tout restaurer</span></button>
<button class="b sm" style="background:#e53935;color:#fff" onclick="trEmpty(this)" data-t="Vider la corbeille"><span>Vider la corbeille</span></button></div>
<p class="mu" style="margin:0 4px 10px;font-size:12px">Corbeille · ${L.length} élément(s). Les ${nm} supprimés restent ici jusqu'à ce que tu vides la corbeille.</p>
${L.length ? L.map(({e, i}) => { const d = e.it; return `<div class="r trr"><div><b>${esc(d.num || '')}</b><br><small class="mu">${e.k === 'rep' ? 'Rapport' : d.t === 'f' ? 'Facture' : 'Devis'} · ${esc(d.cn || 'Sans client')} · ${fd(d.date)} · supprimé le ${new Date(e.at).toLocaleDateString('fr-FR')}</small></div><div style="display:flex;gap:6px"><button class="b sm" onclick="trRestore(${i})"><span>Restaurer</span></button><button class="b gh sm" onclick="trKill(${i},this)" data-t="Effacer"><span>Effacer</span></button></div></div>`; }).join('') : '<p class="mu">La corbeille est vide.</p>'}`;
}

/* Suppression depuis l'éditeur : passe par la corbeille */
rm = function () { const t = cur().t; trDel([V.id], t); go(t); toast('Placé dans la corbeille'); };
rrm = function () { trDel([V.id], 'x'); go('x'); toast('Placé dans la corbeille'); };

function selToggle() { SELM = !SELM; SELS.clear(); render(); }
function selAll(ck) { document.querySelectorAll('#lst .r').forEach(r => { if (r.style.display === 'none') return; const id = r.dataset.id; if (!id) return; if (ck) SELS.add(id); else SELS.delete(id); r.classList.toggle('sel', ck); }); selCount(); }
function selCount() { const e = $('#selc'); if (e) e.textContent = SELS.size + ' sélectionné(s)'; }
function selDel(b) { if (!SELS.size) return toast('Aucun élément sélectionné'); arm2(b, () => { const k = trDel([...SELS], V.v); SELM = false; SELS.clear(); render(); toast(k + ' élément(s) dans la corbeille'); }); }

function listDecorate() {
  const t = V.v; if (!['d', 'f', 'x'].includes(t)) return;
  const app = $('#app'); if (!app) return;
  let lst = $('#lst');
  if (!lst) { /* vue rapports : on regroupe les lignes dans #lst */
    const rows = [...app.querySelectorAll(':scope > .r')];
    if (rows.length) { lst = document.createElement('div'); lst.id = 'lst'; rows[0].before(lst); rows.forEach(r => lst.appendChild(r)); }
  }
  const nT = trList(t).length;
  const bar = document.createElement('div'); bar.className = 'selbar';
  bar.innerHTML = SELM
    ? `<label class="tg" style="margin:0"><input type="checkbox" onchange="selAll(this.checked)"> Tout</label><span class="mu" id="selc" style="font-size:12px">0 sélectionné(s)</span><button class="b sm" style="background:#e53935;color:#fff" onclick="selDel(this)" data-t="Supprimer"><span>Supprimer</span></button><button class="b gh sm" onclick="selToggle()"><span>Annuler</span></button>`
    : `<button class="b gh sm" onclick="selToggle()"><span>Sélectionner</span></button><button class="b gh sm" onclick="trOpen()"><span>🗑 Corbeille (${nT})</span></button><span class="mu" style="font-size:11px">Astuce : glisse une ligne vers la gauche pour la supprimer.</span>`;
  const flt = app.querySelector('.flt');
  if (flt) flt.after(bar); else app.prepend(bar);
  if (!lst) return;
  lst.classList.toggle('selm', SELM);
  lst.querySelectorAll('.r').forEach(row => {
    const m = (row.getAttribute('onclick') || '').match(/go\('(?:e|xe)','([^']+)'\)/); if (!m) return;
    const id = m[1]; row.dataset.id = id;
    if (SELM) {
      row.dataset.oc = row.getAttribute('onclick'); row.removeAttribute('onclick');
      row.classList.toggle('sel', SELS.has(id));
      row.addEventListener('click', () => { if (SELS.has(id)) SELS.delete(id); else SELS.add(id); row.classList.toggle('sel', SELS.has(id)); selCount(); });
      return;
    }
    const w = document.createElement('div'); w.className = 'sww';
    const del = document.createElement('button'); del.className = 'swd'; del.textContent = 'Supprimer'; del.type = 'button';
    del.onclick = ev => { ev.stopPropagation(); trDel([id], t); render(); toast('Placé dans la corbeille · récupérable'); };
    row.before(w); w.appendChild(del); w.appendChild(row);
    swipeAttach(row, w);
  });
  selCount();
}
function swipeAttach(row, w) {
  let x0 = null, y0 = 0, dx = 0, lock = null, open = false, moved = 0;
  const set = v => { row.style.transform = v ? `translateX(${v}px)` : ''; };
  const start = (x, y) => { closeOthers(w); x0 = x; y0 = y; dx = 0; lock = null; row.style.transition = 'none'; };
  const move = (x, y, ev) => {
    if (x0 === null) return;
    const ddx = x - x0, ddy = y - y0;
    if (lock === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) lock = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
    if (lock !== 'h') return;
    if (ev && ev.cancelable) ev.preventDefault();
    dx = Math.max(-110, Math.min(0, ddx + (open ? -96 : 0))); set(dx);
  };
  const end = () => {
    if (x0 === null) return; row.style.transition = '';
    if (lock === 'h') { moved = Date.now(); open = dx < -48; set(open ? -96 : 0); w.dataset.open = open ? '1' : ''; }
    x0 = null;
  };
  row.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), {passive: true});
  row.addEventListener('touchmove', e => move(e.touches[0].clientX, e.touches[0].clientY, e), {passive: false});
  row.addEventListener('touchend', end);
  row.addEventListener('mousedown', e => { if (e.button === 0) start(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { if (x0 !== null) move(e.clientX, e.clientY, e); });
  window.addEventListener('mouseup', end);
  /* un clic juste après un glissement, ou sur une ligne ouverte, ne l'ouvre pas : il la referme */
  w.addEventListener('click', e => {
    if (e.target.classList.contains('swd')) return;
    if (Date.now() - moved < 350) { e.stopPropagation(); e.preventDefault(); return; }
    if (open) { e.stopPropagation(); e.preventDefault(); open = false; set(0); w.dataset.open = ''; }
  }, true);
  w._close = () => { open = false; set(0); w.dataset.open = ''; };
}
function closeOthers(me) { document.querySelectorAll('.sww').forEach(w => { if (w !== me && w.dataset.open && w._close) w._close(); }); }

/* =====================================================================
   2. BROUILLONS : sauvegarde automatique des zones de saisie libres
   ===================================================================== */
const DR = id => 'ms_dr_' + id;
function draftsHook() {
  document.querySelectorAll('#app textarea[id], #app input[id]').forEach(el => {
    if (el.hasAttribute('oninput') || el.hasAttribute('onchange') || ['file', 'checkbox', 'radio', 'range', 'search', 'password'].includes(el.type)) return;
    if (el.dataset.dr) return; el.dataset.dr = '1';
    const v = localStorage.getItem(DR(el.id)); if (v && !el.value) el.value = v;
    el.addEventListener('input', () => { try { localStorage.setItem(DR(el.id), el.value); } catch (e) {} });
  });
}
function draftClear(id) { localStorage.removeItem(DR(id)); }
addEventListener('pagehide', () => { const e = $('#cin'); if (e) try { localStorage.setItem(DR('cin'), e.value); } catch (x) {} });
document.addEventListener('visibilitychange', () => { if (document.hidden) { const e = $('#cin'); if (e) try { localStorage.setItem(DR('cin'), e.value); } catch (x) {} } else if (V.v === 'a' && typeof mcStatus === 'function') mcStatus(); });

/* =====================================================================
   4. Branchements sur le rendu et la navigation existants
   ===================================================================== */
const _go = go;
go = function (v, id) { if (v !== V.v) { TRV = null; SELM = false; SELS.clear(); } return _go(v, id); };
const _render = render;
render = function () {
  const ci = $('#cin'); if (ci && ci.value) try { localStorage.setItem(DR('cin'), ci.value); } catch (e) {}
  _render.apply(this, arguments);
  if (TRV && (TRV === V.v || TRV === 'all')) { $('#app').innerHTML = trV(); $('#ad').style.display = 'none'; if (TRV === 'all') { $('#ttl').textContent = 'Corbeille'; document.querySelectorAll('.ni').forEach(b => b.classList.toggle('a', b.dataset.v === 't')); } }
  else listDecorate();
  if (V.v === 'a' && typeof asAfter === 'function') asAfter();
  draftsHook();
};

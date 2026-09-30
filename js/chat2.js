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
function trList(t) { return S.trash.map((e, i) => ({e, i})).filter(x => x.e.k === colOf(t) && (t === 'x' || x.e.it.t === t)); }
function trAll(b) { const L = trList(TRV); if (!L.length) return; arm2(b, () => { L.reverse().forEach(x => trRestore(x.i)); }); }
function trEmpty(b) { const L = trList(TRV); if (!L.length) return; arm2(b, () => { const del = new Set(L.map(x => x.i)); S.trash = S.trash.filter((_, i) => !del.has(i)); save('trash'); render(); toast('Corbeille vidée'); }); }
function trOpen() { TRV = V.v; SELM = false; SELS.clear(); render(); scrollTo(0, 0); }
function trClose() { TRV = null; render(); }
function trV() {
  const t = TRV, L = trList(t), nm = {d:'devis', f:'factures', x:'rapports'}[t];
  return `<div class="selbar"><button class="b gh sm" onclick="trClose()"><span>← Retour aux ${nm}</span></button>
<button class="b sm" onclick="trAll(this)" data-t="Tout restaurer"><span>Tout restaurer</span></button>
<button class="b sm" style="background:#e53935;color:#fff" onclick="trEmpty(this)" data-t="Vider la corbeille"><span>Vider la corbeille</span></button></div>
<p class="mu" style="margin:0 4px 10px;font-size:12px">Corbeille · ${L.length} élément(s). Les ${nm} supprimés restent ici jusqu'à ce que tu vides la corbeille.</p>
${L.length ? L.map(({e, i}) => { const d = e.it; return `<div class="r trr"><div><b>${esc(d.num || '')}</b><br><small class="mu">${esc(d.cn || 'Sans client')} · ${fd(d.date)} · supprimé le ${new Date(e.at).toLocaleDateString('fr-FR')}</small></div><div style="display:flex;gap:6px"><button class="b sm" onclick="trRestore(${i})"><span>Restaurer</span></button><button class="b gh sm" onclick="trKill(${i},this)" data-t="Effacer"><span>Effacer</span></button></div></div>`; }).join('') : '<p class="mu">La corbeille est vide.</p>'}`;
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { const e = $('#cin'); if (e) try { localStorage.setItem(DR('cin'), e.value); } catch (x) {} } else if (V.v === 'a') mcStatus(); });

/* =====================================================================
   3. TCHAT : catégories + Computer dans l'appli
   ===================================================================== */
const _chatPush = chatPush;
chatPush = function (m) { if (!m.g) m.g = CG(); return _chatPush(m); };
chatClear = function (b) { arm2(b, () => { const g = CG(); S.chat = S.chat.filter(m => (m.g || 'docs') !== g); S.cfg.mct[g] = ''; save('chat'); save('cfg'); render(); }); };

function linkify(h) { return h.replace(/\[([^\]<]{1,120})\]\((https?:\/\/[^)\s<"]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|[\s>(])(https?:\/\/[^\s<"')]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>'); }
const _bub = bub;
bub = function (m, i) {
  let h = linkify(_bub(m, i));
  if (m.ix && i === S.chat.length - 1 && !MCBUSY) {
    const B = (l, f, cl = 'b sm') => `<button class="${cl}" onclick="${f}"><span>${l}</span></button>`;
    const x = m.ix, tid = esc(x.tid || '');
    const btns = x.type === 'ask_user_question' ? B('Répondre', `mcAnswer('${tid}')`)
      : x.type === 'confirm_action' ? B('Approuver', `mcAct('approve','${tid}')`) + B('Refuser', `mcAct('deny','${tid}')`, 'b gh sm')
      : x.type === 'auth_required' ? (x.url ? `<a class="b gh sm" href="${esc(x.url)}" target="_blank" rel="noopener"><span>Connecter le service</span></a>` : '') + B("C'est connecté → continuer", `mcAct('connected','${tid}')`)
      : B('Continuer / voir l\'avancement', `mcAct('continue','${tid}')`);
    h = h.replace(/<small>([^<]*)<\/small><\/div>$/, `<div class="ixb">${btns}</div><small>$1</small></div>`);
  }
  return h;
};

chatV = function () {
  const c = S.cfg, cm = c.cm || 'pc', hasKey = !!c.ai.key, hasPx = !!c.px, g = CG(), k = CK();
  const all = S.chat.map((m, i) => ({m, i})).filter(x => (x.m.g || 'docs') === g).slice(-60);
  const sub = cm === 'mc' ? `<span class="mcst"><span class="mcdot ${MCOK ? 'on' : ''}" id="mcdot"></span><span id="mctx">${MCOK === null ? 'Vérification du pont…' : MCOK ? 'Computer connecté dans l\'appli' : 'Computer non connecté'}</span></span>`
    : hasKey ? 'IA directe activée (' + (c.ai.model || AIM[c.ai.pv]) + ')' : hasPx ? 'Relié à Perplexity via ' + esc(c.px) : 'Mode liste rapide (sans clé). Relie Perplexity dans Réglages.';
  const opt = (gg, lab) => `<optgroup label="${lab}">${Object.entries(CAT2).filter(([, v]) => v.g === gg).map(([kk, v]) => `<option value="${kk}" ${kk === k ? 'selected' : ''}>${v.l}</option>`).join('')}</optgroup>`;
  const welcome = g === 'app'
    ? `<div class="bub a"><b>Conversation « Application ».</b> Demande une amélioration de l'appli, un nouveau projet IA ou autre chose. Les réponses sont en mode codage (code complet, explications étape par étape).</div>`
    : `<div class="bub a"><b>Bonjour.</b> Envoie-moi une liste de matériel, un ancien devis en PDF ou une photo : j'en fais un nouveau devis vierge prêt à modifier.<br><br>Exemples de listes comprises tout de suite :<br><code>Chauffe-eau 200 L ; 1 ; 420</code><br><code>2 x Robinet thermostatique 45 €</code><br><code>Pose et raccordement 3h 55€</code></div>`;
  const busy = MCBUSY ? `<div class="bub a"><span class="mcspin"></span>Computer travaille… (quelques secondes à plusieurs minutes). Tu peux changer d'onglet, la réponse arrivera ici.</div>` : '';
  const mainBtn = cm === 'mc' ? `<button class="b sm" onclick="mcSend()" ${MCBUSY ? 'disabled' : ''}><span>Envoyer à Computer</span></button>`
    : `<button class="b sm" onclick="chatSend()"><span>${hasKey ? 'Envoyer' : 'Créer le devis'}</span></button>`;
  const help = cm === 'mc'
    ? `Computer répond ici même, sans quitter l'appli ni clé API (connexion avec ton compte Perplexity). Nécessite le pont <b>serveur.py</b> lancé sur ton PC (double-clic sur <b>lancer.bat</b>). ${g === 'docs' ? 'Les devis/factures reconnus sont créés automatiquement.' : ''}`
    : cm === 'px' ? 'Sans crédits Computer : ta demande s\'ouvre dans le chat Perplexity normal avec les consignes ; choisis le modèle indiqué dans son sélecteur, puis colle sa réponse ici et appuie sur « Créer le devis ».'
    : 'Computer travaille seul (e-mail) : il lit tes listes, photos et PDF, cherche les prix et dépose le devis prêt dans « Reçus de Perplexity ».';
  return `<div class="c" style="padding:12px 14px"><div style="display:flex;gap:10px;align-items:center"><img src="${LGD}" alt="" style="width:40px;height:40px"><div style="flex:1;min-width:0"><b>Assistant</b><br><small class="mu">${sub}</small></div>${cm === 'mc' ? `<button class="b gh sm" id="mcconn" onclick="mcConnect()" style="${MCOK ? 'display:none' : ''}"><span>Se connecter</span></button>` : ''}<button class="b gh sm" onclick="go('s')"><span>Réglages</span></button></div>
<label class="cat2">Type de demande<select onchange="cs('cat2',this.value);render()">${opt('docs', 'Documents : devis, factures, rapports…')}${opt('app', 'Application et projets IA')}</select></label></div>
<div id="inbx"></div>
<div id="cm" class="cm">${all.length ? all.map(x => bub(x.m, x.i)).join('') : welcome}${busy}</div>
<div class="cmp"><div id="atts" class="atts">${ATT.map((a, i) => `<span class="chip">${a.k === 'pdf' ? '📄' : '🖼️'} ${esc(a.f.name.slice(0, 22))}<button onclick="ATT.splice(${i},1);render()" aria-label="Retirer">×</button></span>`).join('')}</div>
<textarea id="cin" rows="2" placeholder="${g === 'app' ? 'Décris l\'amélioration ou le projet…' : 'Écris ta demande ou colle une liste…'}" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey))${cm === 'mc' ? 'mcSend()' : 'chatSend()'}"></textarea>
<div class="crow"><label class="b gh sm" title="Photo ou PDF"><span>📎 Joindre</span><input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="attAdd(this.files)"></label><label class="b gh sm" title="Prendre une photo"><span>📷 Photo</span><input type="file" accept="image/*" capture="environment" style="display:none" onchange="attAdd(this.files)"></label>
${mainBtn}</div>
<div class="seg" role="tablist"><button class="${cm === 'mc' ? 'on' : ''}" onclick="cs('cm','mc');render()">Computer (dans l'appli)</button><button class="${cm === 'pc' ? 'on' : ''}" onclick="cs('cm','pc');render()">Computer (e-mail)</button><button class="${cm === 'px' ? 'on' : ''}" onclick="cs('cm','px');render()">Perplexity (chat normal)</button></div>
${cm === 'px' ? `<label style="margin:8px 0 0">Modèle à choisir dans Perplexity<select onchange="cs('pm',this.value)">${PXM.map(m => `<option ${c.pm === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}
${cm === 'mc' ? `<label style="margin:8px 0 0">Adresse du pont (serveur.py)<input value="${esc(c.mcu || MC_DEF)}" onchange="cs('mcu',this.value.trim()||'${MC_DEF}');mcStatus()"></label>` : ''}
<div class="crow">${cm === 'mc' ? '' : `<button class="b cu sm" onclick="${cm === 'px' ? 'pxOpen2()' : 'pxSend2()'}"><span>${cm === 'px' ? 'Ouvrir dans Perplexity' : 'Envoyer à Computer' + (hasPx ? '' : ' (à relier)')}</span></button>`}<button class="b gh sm" onclick="chatClear(this)" data-t="Nouvelle conversation"><span>Nouvelle conversation</span></button></div>
<p class="mu" style="font-size:12px;margin:6px 2px 0">${help}</p></div>`;
};

/* La catégorie est ajoutée en tête des demandes envoyées par e-mail ou ouvertes dans Perplexity */
function tagCin() { const e = $('#cin'); if (e && e.value.trim() && !/^\[/.test(e.value)) e.value = '[' + CAT2[CK()].l + '] ' + e.value.trim(); draftClear('cin'); }
function cinReset() { const e = $('#cin'); if (e) e.value = ''; draftClear('cin'); }
async function pxSend2() { tagCin(); const p = pxSend(); cinReset(); return p; }
async function pxOpen2() {
  if (CG() === 'docs') { tagCin(); const p = pxOpen(); cinReset(); return p; }
  const txt = ($('#cin')?.value || '').trim(); if (!txt) return toast('Écris ta demande d\'abord');
  const prompt = PROMPT_APP + '\n\nMa demande : [' + CAT2[CK()].l + '] ' + txt;
  cinReset(); chatPush({r: 'u', t: txt}); chatPush({r: 'a', t: 'Demande ouverte dans Perplexity (consignes copiées aussi).'}); render();
  try { await navigator.clipboard.writeText(prompt); } catch (e) {}
  window.open('https://www.perplexity.ai/search?q=' + enc(prompt.slice(0, 6000)), '_blank');
}
const _chatSend = chatSend;
chatSend = function () { const p = _chatSend(); cinReset(); return p; };

/* ---------- Pont local → Perplexity Computer (MCP) ---------- */
async function mcFetch(p, body, raw) {
  const o = raw ? {method: 'POST', body: raw.b, headers: raw.h} : body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'};
  const r = await fetch(mcBase() + p, o);
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error(j.message || j.erreur || ('HTTP ' + r.status)); er.code = r.status; er.kind = j.erreur; throw er; }
  return j;
}
async function mcStatus() {
  try { const s = await mcFetch('/api/status'); MCOK = !!s.connecte; }
  catch (e) { MCOK = false; const t = $('#mctx'); if (t) t.textContent = 'Pont introuvable : lance serveur.py (lancer.bat) sur ton PC'; const d = $('#mcdot'); if (d) d.className = 'mcdot'; return; }
  const d = $('#mcdot'), t = $('#mctx'), b = $('#mcconn');
  if (d) d.className = 'mcdot' + (MCOK ? ' on' : '');
  if (t) t.textContent = MCOK ? 'Computer connecté dans l\'appli (sans clé API)' : 'Computer non connecté';
  if (b) b.style.display = MCOK ? 'none' : '';
}
function mcConnect() { window.open(mcBase() + '/oauth/start', '_blank'); toast('Connecte-toi dans l\'onglet ouvert puis reviens ici'); }

function mcFirstPrompt(txt) {
  const lab = '[' + CAT2[CK()].l + '] ';
  return (CG() === 'docs' ? PXQ.replace('${co}', S.cfg.co) : PROMPT_APP + '\n\nMa demande :\n') + lab + txt;
}
async function mcUpload() {
  const urls = [], names = [];
  for (const a of ATT) {
    names.push({n: a.f.name, k: a.k});
    const j = await mcFetch('/api/upload', null, {b: a.f, h: {'X-Filename': encodeURIComponent(a.f.name), 'X-Mime': a.f.type || 'application/octet-stream'}});
    urls.push(j.attachment_url);
  }
  return {urls, names};
}
async function mcSend() {
  if (MCBUSY) return;
  const ta = $('#cin'), txt = (ta ? ta.value : '').trim();
  if (!txt && !ATT.length) return toast('Écris un message ou joins un fichier');
  const g = CG(), tid = S.cfg.mct[g] || '';
  let up = {urls: [], names: []};
  try { if (ATT.length) { toast('Envoi des fichiers…'); up = await mcUpload(); } }
  catch (e) { return mcErr(e); }
  const msg = tid ? '[' + CAT2[CK()].l + '] ' + (txt || 'Analyse les fichiers joints.') : mcFirstPrompt(txt || 'Analyse les fichiers joints.');
  chatPush({r: 'u', t: txt || '(fichier joint)', att: up.names}); ATT = []; draftClear('cin'); if (ta) ta.value = '';
  await mcCall('/api/chat', {message: msg, thread_id: tid || undefined, attachment_urls: up.urls}, g);
}
async function mcCall(p, body, g) {
  g = g || CG(); MCBUSY = true; render();
  try { mcHandle(await mcFetch(p, body), g); }
  catch (e) { mcErr(e); }
  finally { MCBUSY = false; render(); }
}
function mcErr(e) {
  if (e.code === 401 || e.kind === 'non_connecte') { MCOK = false; chatPush({r: 'a', t: 'Connecte-toi d\'abord à Computer (bouton « Se connecter »), puis renvoie ton message.'}); }
  else if (e instanceof TypeError) chatPush({r: 'a', t: 'Pont introuvable à ' + (mcBase() || location.origin) + '. Lance serveur.py sur ton PC (double-clic sur lancer.bat), puis réessaie.'});
  else chatPush({r: 'a', t: 'Erreur : ' + (e.message || e)});
  render();
}
function mcHandle(j, g) {
  if (j.thread_id) { S.cfg.mct[g] = j.thread_id; save('cfg'); }
  const tid = j.thread_id || S.cfg.mct[g], ev = j.event || 'complete', txt = j.text || '';
  const P = (t, extra) => chatPush(Object.assign({r: 'a', t, g}, extra || {}));
  if (ev === 'complete') {
    if (g === 'docs') {
      const pa = parseAI(txt);
      P(pa.text || txt || '(réponse vide)', pa.q ? {q: pa.q} : null);
      const k = CK();
      if (pa.q && (k === 'devis' || k === 'facture')) {
        const d = qMake(pa.q, k === 'facture' ? 'f' : 'd');
        P(`✔ ${k === 'facture' ? 'Facture' : 'Devis'} ${d.num} créé(e) automatiquement (${E(tot(d).t)}). Vérifie les prix : onglet ${k === 'facture' ? 'Factures' : 'Devis'}.`);
      }
    } else P(txt || '(réponse vide)');
  } else if (['ask_user_question', 'confirm_action', 'auth_required'].includes(ev)) {
    const url = j.interactive && j.interactive.auth_url;
    P(txt || (ev === 'auth_required' ? 'Un service doit être connecté.' : 'Computer attend ta réponse.'), {ix: {type: ev, tid, url}});
  } else if (['sleep', 'waiting', 'timeout'].includes(ev)) {
    P((txt ? txt + '\n\n' : '') + 'La tâche continue côté Computer.', {ix: {type: 'continue', tid}});
  } else if (ev === 'insufficient_credits') P('Crédits Computer insuffisants. ' + txt);
  else if (ev === 'access_denied') P('Computer n\'est pas disponible sur ce compte. ' + txt);
  else P('Tâche ' + ev + (txt ? ' : ' + txt : ''));
}
function mcAnswer(tid) { const r = prompt('Ta réponse à Computer :'); if (r === null || !r.trim()) return; chatPush({r: 'u', t: r}); mcCall('/api/answer', {thread_id: tid, texte: r, answers: {reponse: r}}); }
function mcAct(a, tid) {
  const map = {approve: ['/api/approve', 'Approuvé'], deny: ['/api/deny', 'Refusé'], connected: ['/api/connected', 'Service connecté'], continue: ['/api/chat', 'Continuer']};
  const [p, l] = map[a]; chatPush({r: 'u', t: l});
  mcCall(p, a === 'continue' ? {thread_id: tid, message: 'Continue et donne-moi le résultat final.'} : {thread_id: tid, texte: l});
}
/* Création d'un document sans quitter le tchat (même logique que qNew) */
function qMake(q, t) {
  const y = new Date().getFullYear(), k = t + y, s = S.seq[k] = (S.seq[k] || 0) + 1;
  const d = {id: nw(), t, num: (t === 'd' ? 'DEV-' : 'FAC-') + y + '-' + String(s).padStart(3, '0'), date: td(), val: S.cfg.val, cn: '', ca: '', cc: '', ct: '', sn: '', sa: '', sc: '', o: '', F: [], M: [], acc: S.cfg.acc, ap: false, paid: false, pd: '', cost: '', st: 'att', tva: S.cfg.tva ? n(S.cfg.tvr) : 0, rm: ''};
  qApply(d, q); if (d.cn && !d.sn && !d.sa) Object.assign(d, {sn: d.cn, sa: d.ca, sc: d.cc});
  S.docs.unshift(d); save('docs'); save('seq'); return d;
}

/* =====================================================================
   4. Branchements sur le rendu et la navigation existants
   ===================================================================== */
const _go = go;
go = function (v, id) { if (v !== V.v) { TRV = null; SELM = false; SELS.clear(); } return _go(v, id); };
const _render = render;
render = function () {
  const ci = $('#cin'); if (ci && ci.value) try { localStorage.setItem(DR('cin'), ci.value); } catch (e) {}
  _render.apply(this, arguments);
  if (TRV && TRV === V.v) { $('#app').innerHTML = trV(); $('#ad').style.display = 'none'; }
  else listDecorate();
  if (V.v === 'a') {
    if (MCOK === null || (S.cfg.cm === 'mc' && !MCBUSY)) setTimeout(mcStatus, 0);
  }
  draftsHook();
};

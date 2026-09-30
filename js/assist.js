/* Ms Plomberie & Chauffage — v3.5 : Assistant
   - Fils de conversation séparés (reprendre chaque sujet là où il en était)
   - Menu « Demande » : créer / modifier un devis ou une facture, faire un rapport, améliorer l'appli…
   - Menu « IA » : Perplexity dans l'appli (API, tous les modèles), Computer dans l'appli (pont PC),
     Perplexity Pro (onglet), Computer par e-mail, sans IA — avec choix du modèle et du mode de raisonnement
   - Composer large, bouton + en bas à gauche, style iOS
   S'appuie sur les fonctions existantes (parseAI, qApply, qCard, prepAtt, pxSend, chatSend, catMerge…). */
'use strict';

/* ---------- Demandes ---------- */
const DEM = {
  devis:   {l: 'Créer un devis',            ic: '📄', o: 'docs'},
  facture: {l: 'Créer une facture',          ic: '🧾', o: 'docs'},
  mdevis:  {l: 'Modifier un devis',          ic: '✏️', o: 'docs', mod: 'd'},
  mfact:   {l: 'Modifier une facture',       ic: '✏️', o: 'docs', mod: 'f'},
  rapport: {l: 'Faire un rapport',           ic: '📝', o: 'rap'},
  prix:    {l: 'Recherche de prix',          ic: '🏷️', o: 'prix'},
  app:     {l: "Améliorer l'appli",          ic: '🛠️', o: 'app'},
  projet:  {l: 'Créer un projet IA',         ic: '✨', o: 'app'},
  autre:   {l: 'Autre question',             ic: '💬', o: 'autre'}
};
const DEM_GRP = [['Documents', ['devis', 'facture', 'mdevis', 'mfact', 'rapport', 'prix']], ['Application et projets', ['app', 'projet', 'autre']]];

/* ---------- Moteurs ---------- */
const ENG = {
  api:  {l: 'Perplexity', s: "Dans l'appli · tous les modèles · marche aussi sur iPhone (clé API Perplexity)"},
  cmp:  {l: 'Computer', s: "Dans l'appli · via le pont serveur.py sur ton PC · crédits Computer"},
  pro:  {l: 'Perplexity Pro', s: "Sans clé API · ton abonnement · le chat Pro, réponse ramenée dans l'appli"},
  mail: {l: 'Computer e-mail', s: 'Envoi par e-mail · le résultat arrive dans « Reçus »'},
  loc:  {l: 'Sans IA', s: "Lit une liste de matériel directement sur l'appareil"},
  apple: {l: 'Apple Intelligence', s: "iPhone 18 Pro · Outils d'écriture sur l'appareil · pas un appel, pas Siri"}
};
const MOD_CMP2 = [{id: 'auto', n: "Auto (orchestrateur de l'appli)", f: null, d: 'Choisit le modèle selon la demande et le mode'}, ...MOD_CMP];

/* ---------- État ---------- */
S.threads = S.threads || [];
let SHEET = null, ASBUSY = false, THQ = '';
const now = () => Date.now();

const _cfgInit2 = cfgInit;
cfgInit = function () {
  _cfgInit2();
  if (!Array.isArray(S.threads)) S.threads = [];
  const c = S.cfg;
  if (!c.as) c.as = {k: 'devis', ai: 'pro', m: 'auto', mc: 'auto', r: 'raison'};
  if (!c.pk && c.ai && c.ai.pv === 'pplx' && c.ai.key) c.pk = c.ai.key;
  /* migration : ancienne conversation unique → fils */
  if (!S.threads.length && Array.isArray(S.chat) && S.chat.length) {
    const docs = S.chat.filter(m => (m.g || 'docs') === 'docs'), app = S.chat.filter(m => m.g === 'app');
    if (docs.length) S.threads.push(thNew({ti: 'Conversation précédente', k: 'devis', msgs: docs}, true));
    if (app.length) S.threads.push(thNew({ti: 'Conversation précédente (appli)', k: 'app', msgs: app, tid: (c.mct || {}).app || ''}, true));
    if (docs.length && c.mct && c.mct.docs) S.threads[0].tid = c.mct.docs;
  }
  if (!S.threads.length) S.threads.push(thNew({}, true));
  if (!S.threads.find(t => t.id === c.thc)) c.thc = S.threads.slice().sort((a, b) => b.up - a.up)[0].id;
  S.chat = TH().msgs; /* compatibilité : les fonctions existantes écrivent dans le fil courant */
};
function thNew(o, silent) {
  const a = S.cfg.as || {};
  const t = Object.assign({id: nw(), ti: '', k: a.k || 'devis', ai: a.ai || 'api', m: a.m || 'auto', mc: a.mc || 'auto', r: a.r || 'raison', tid: '', doc: '', msgs: [], up: now()}, o || {});
  if (!silent) { S.threads.push(t); S.cfg.thc = t.id; S.chat = t.msgs; save('threads'); save('cfg'); }
  return t;
}
function TH() { return S.threads.find(t => t.id === S.cfg.thc) || S.threads[0]; }
function thSave() { const t = TH(); if (t) t.up = now(); save('threads'); }
function thOpen(id) { S.cfg.thc = id; S.chat = TH().msgs; save('cfg'); SHEET = null; ATT = []; render(); }
function thTitle(t) { return t.ti || (t.msgs.find(m => m.r === 'u') || {}).t?.slice(0, 48) || (DEM[t.k] ? DEM[t.k].l : 'Nouvelle conversation') + ' · ' + new Date(t.up).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short'}); }

/* chatPush / chatClear : fil courant */
chatPush = function (m) { m.ts = now(); const t = TH(); t.msgs.push(m); if (t.msgs.length > 300) t.msgs.splice(0, t.msgs.length - 300); S.chat = t.msgs; if (!t.ti && m.r === 'u' && m.t && m.t[0] !== '(') t.ti = m.t.replace(/\s+/g, ' ').slice(0, 48); thSave(); save('chat'); };
chatClear = function () { thNew(); render(); };
const _ghPack = ghPack; ghPack = function () { const p = _ghPack(); p.threads = S.threads.map(t => ({...t, msgs: t.msgs.slice(-80)})); return p; };

/* ---------- Styles iOS ---------- */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.ash{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.ash .ttl{flex:1;min-width:0;text-align:center;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ash .ttl small{display:block;font-weight:500;color:var(--mu);font-size:12px}
.icb{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--cd);color:var(--ac);font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px var(--ln)}
.icb:active{transform:scale(.94)}
.cm{padding-bottom:6px}
.bub{max-width:86%;padding:10px 14px;border-radius:20px;font-size:16px;line-height:1.42}
.bub.u{background:var(--ac);color:#fff;border-bottom-right-radius:6px}
.bub.a{background:var(--cd);border-bottom-left-radius:6px}
.bub pre{white-space:pre-wrap;background:#0000000d;border-radius:10px;padding:10px;font-size:12.5px;overflow-x:auto;margin:8px 0}
.bub.u pre{background:#ffffff26}
.bub h4{margin:10px 0 4px;font-size:15px}
.bub .meta{display:block;margin-top:6px;font-size:11px;opacity:.55}
.bub .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.bub .acts .b{min-height:36px;padding:6px 12px}.bub .acts .b span{font-size:14px}
.typing{display:inline-flex;gap:4px;padding:4px 2px}.typing i{width:7px;height:7px;border-radius:50%;background:var(--mu);opacity:.5;animation:ty 1.2s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}
@keyframes ty{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:.9;transform:translateY(-3px)}}
.cmp2{position:sticky;bottom:calc(var(--off) + 2px);z-index:4;background:color-mix(in srgb,var(--cd) 88%,transparent);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-radius:26px;padding:8px;box-shadow:0 10px 40px #0000001f,0 0 0 1px var(--ln);margin:0 -4px}
.pills{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none}.pills::-webkit-scrollbar{display:none}
.pill{flex:none;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:980px;background:var(--in);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;padding:8px 12px;max-width:78vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill small{font-weight:500;color:var(--mu)}
.pill:active{transform:scale(.97)}
.crow2{display:flex;align-items:flex-end;gap:8px}
.plus{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--in);color:var(--ink);font-size:26px;line-height:1;font-weight:300;display:flex;align-items:center;justify-content:center}
.send{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--ac);color:#fff;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center}
.send:disabled{opacity:.35}
#cin{flex:1;min-width:0;min-height:44px;max-height:45vh;resize:none;margin:0;border-radius:22px;padding:11px 16px;font-size:17px;line-height:1.35;background:var(--in);border:1.5px solid transparent}
.atts2{display:flex;gap:6px;flex-wrap:wrap;padding:0 4px 8px}.atts2:empty{display:none}
#sheet{position:fixed;inset:0;z-index:60;display:none}#sheet.o{display:block}
#sheet .bg{position:absolute;inset:0;background:#0006;animation:fi .2s}
#sheet .pn{position:absolute;left:0;right:0;bottom:0;max-height:88vh;overflow-y:auto;background:var(--bg);border-radius:22px 22px 0 0;padding:8px 14px calc(18px + env(safe-area-inset-bottom,0px));animation:su .25s cubic-bezier(.2,.8,.2,1);max-width:720px;margin:0 auto}
#sheet .grab{width:38px;height:5px;border-radius:3px;background:var(--ln);margin:4px auto 10px}
#sheet h2{font-size:20px;font-weight:700;letter-spacing:-.02em;margin:4px 4px 12px;display:flex;align-items:center;justify-content:space-between}
#sheet h2 button{border:0;background:none;color:var(--ac);font:inherit;font-size:16px;font-weight:600}
#sheet .gl{font-size:13px;color:var(--mu);text-transform:uppercase;letter-spacing:.03em;margin:14px 6px 6px;font-weight:600}
#sheet .grp{background:var(--cd);border-radius:14px;overflow:hidden}
#sheet .it{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;color:var(--ink);font:inherit;text-align:left;padding:12px 14px;border-bottom:1px solid var(--ln)}
#sheet .it:last-child{border-bottom:0}
#sheet .it:active{background:var(--in)}
#sheet .it .ic{width:30px;height:30px;border-radius:8px;background:var(--in);display:flex;align-items:center;justify-content:center;font-size:16px;flex:none}
#sheet .it .tx{flex:1;min-width:0}#sheet .it .tx b{display:block;font-weight:500;font-size:16px}#sheet .it .tx small{display:block;color:var(--mu);font-size:12.5px;line-height:1.3;margin-top:1px}
#sheet .it .ck{color:var(--ac);font-weight:700;font-size:17px;flex:none}
#sheet .it .del{border:0;background:none;color:var(--rd);font:inherit;font-size:14px;padding:4px}
#sheet .seg{margin:0}
#sheet input{background:var(--cd)}
#sheet .note{font-size:12.5px;color:var(--mu);margin:8px 6px 0;line-height:1.4}
#sheet .fiche{background:var(--cd);border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.45;white-space:pre-wrap;color:var(--ink)}
@keyframes su{from{transform:translateY(100%)}to{transform:none}}@keyframes fi{from{opacity:0}to{opacity:1}}
.mcdot{width:8px;height:8px;border-radius:50%;background:#aaa;display:inline-block;margin-right:4px}.mcdot.on{background:var(--ok)}
`;
  document.head.appendChild(st);
  const sh = document.createElement('div'); sh.id = 'sheet'; document.body.appendChild(sh);
  sh.addEventListener('click', e => {
    if (e.target.classList.contains('bg')) return sheetClose();
    const b = e.target.closest('[data-a]'); if (!b) return;
    e.preventDefault(); sheetAct(b.dataset.a, b.dataset.v, b);
  });
})();

/* ---------- Texte enrichi (Markdown léger) ---------- */
function mdl(s) {
  let h = esc(s || '');
  const blocks = [];
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => { blocks.push(`<pre><code>${c}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,4}\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/\[([^\]\n]{1,140})\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)"]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\n/g, '<br>');
  return h.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[i]);
}

/* ---------- Libellés ---------- */
function modList(t) { return t.ai === 'cmp' ? MOD_CMP2 : MOD_API; }
function modCur(t) { return t.ai === 'cmp' ? (MOD_CMP2.find(m => m.id === t.mc) || MOD_CMP2[0]) : (MOD_API.find(m => m.id === t.m) || MOD_API[0]); }
function modEff(t) { /* modèle réellement utilisé (résout « Auto ») */
  const o = DEM[t.k].o;
  if (t.ai === 'cmp') { if (t.mc === 'auto') { const n = ORCH_CMP[o][t.r]; return MOD_CMP.find(m => m.id === n); } return modByCmp(t.mc) || MOD_CMP[0]; }
  if (t.m === 'auto') return modByApi(ORCH[o][t.r]);
  return modByApi(t.m) || modByApi(ORCH[o][t.r]);
}
function iaLabel(t) {
  if (t.ai === 'loc' || t.ai === 'mail' || t.ai === 'apple') return ENG[t.ai].l;
  const m = modCur(t), e = modEff(t);
  return ENG[t.ai].l + ' · ' + (m.id === 'auto' ? 'Auto' + (e ? ' → ' + e.n : '') : m.n) + ' · ' + MODES[t.r].l;
}
function pk() { return (S.cfg.pk || '').trim(); }

/* ---------- Vue Assistant ---------- */
chatV = function () {
  const t = TH(), d = DEM[t.k], msgs = t.msgs.slice(-80), off = t.msgs.length - msgs.length;
  const doc = d.mod ? S.docs.find(x => x.id === t.doc) : null;
  const welcome = `<div class="bub a"><b>${d.ic} ${d.l}</b><br>${
    t.k === 'devis' || t.k === 'facture' ? "Décris les travaux, colle une liste ou joins une photo / un PDF avec le +. Le document est créé automatiquement." :
    d.mod ? (doc ? `Document choisi : <b>${esc(doc.num)}</b> ${esc(doc.cn || '')}. Dis-moi ce qu'il faut changer.` : 'Choisis le document à modifier dans le menu « Document ».') :
    t.k === 'rapport' ? "Décris l'intervention (sinistre, constatations, cause, travaux). Le rapport est créé automatiquement." :
    t.k === 'prix' ? 'Donne les articles à chercher : je renvoie un tableau fournisseur / prix HT, ajoutable à Mes tarifs.' :
    t.k === 'app' || t.k === 'projet' ? 'Décris ce que tu veux : réponse en mode codage (code complet, étapes expliquées).' : 'Pose ta question.'
  }</div>`;
  const typing = ASBUSY ? `<div class="bub a"><span class="typing"><i></i><i></i><i></i></span> <small class="mu">${esc(iaLabel(t))}</small></div>` : '';
  return `<div class="ash"><button class="icb" onclick="sheetOpen('fils')" aria-label="Conversations">☰</button><div class="ttl" onclick="thRename()">${esc(thTitle(t))}<small>${S.threads.length} conversation(s) · touche pour renommer</small></div><button class="icb" onclick="thNew();render()" aria-label="Nouvelle conversation">✎</button></div>
<div id="inbx"></div>
<div id="cm" class="cm">${msgs.length ? msgs.map((m, i) => bub2(m, off + i)).join('') : welcome}${typing}</div>
<div class="cmp2">
<div class="pills"><button class="pill" onclick="sheetOpen('dem')">${d.ic} ${esc(d.l)} ▾</button>${d.mod ? `<button class="pill" onclick="sheetOpen('doc')">${doc ? esc(doc.num) : 'Document ?'} ▾</button>` : ''}<button class="pill" onclick="sheetOpen('ia')">${t.ai === 'cmp' ? `<span class="mcdot ${MCOK ? 'on' : ''}" id="mcdot"></span>` : ''}${esc(iaLabel(t))} ▾</button></div>
<div class="atts2">${ATT.map((a, i) => `<span class="chip">${a.k === 'pdf' ? '📄' : '🖼️'} ${esc(a.f.name.slice(0, 22))}<button onclick="ATT.splice(${i},1);render()" aria-label="Retirer">×</button></span>`).join('')}</div>
<div class="crow2"><button class="plus" onclick="sheetOpen('plus')" aria-label="Ajouter">+</button><textarea id="cin" rows="1" placeholder="${t.ai === 'pro' ? 'Écris ta demande… ou colle ici la réponse de Perplexity' : t.ai === 'apple' ? 'Écris ou dicte, puis Outils d\'écriture…' : 'Écris ta demande…'}" oninput="cinGrow(this)" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey))asSend()"></textarea><button class="send" id="sendb" onclick="asSend()" ${ASBUSY ? 'disabled' : ''} aria-label="Envoyer">↑</button></div>
<input type="file" id="fpick" accept="image/*,application/pdf" multiple hidden onchange="attAdd(this.files)"><input type="file" id="fcam" accept="image/*" capture="environment" hidden onchange="attAdd(this.files)">
</div>`;
};
function cinGrow(e) { e.style.height = 'auto'; e.style.height = Math.min(e.scrollHeight, innerHeight * .45) + 'px'; try { localStorage.setItem(DR('cin'), e.value); } catch (x) {} }
function asAfter() {
  const e = $('#cin'); if (e) { const v = localStorage.getItem(DR('cin')); if (v && !e.value) e.value = v; cinGrow(e); }
  const t = TH(); if (t.ai === 'cmp' && !ASBUSY) setTimeout(mcStatus, 0);
  if (SHEET) sheetRender();
}
function bub2(m, i) {
  const at = (m.att || []).map(a => `<span class="chip s">${a.k === 'pdf' ? '📄' : '🖼️'} ${esc(a.n)}</span>`).join('');
  let acts = '';
  const B = (l, f, c = 'b sm') => `<button class="${c}" onclick="${f}"><span>${l}</span></button>`;
  if (m.act) {
    const a = m.act;
    if (a.open) acts += B('Ouvrir ' + esc(a.num || ''), `go('${a.v}','${a.open}')`);
    if (a.undo) acts += B('Annuler la modification', `asUndo('${a.undo}',${i})`, 'b gh sm');
  }
  if (m.ix && i === TH().msgs.length - 1 && !ASBUSY) {
    const x = m.ix, tid = esc(x.tid || '');
    acts += x.type === 'ask_user_question' ? B('Répondre', `mcAnswer('${tid}')`)
      : x.type === 'confirm_action' ? B('Approuver', `mcAct('approve','${tid}')`) + B('Refuser', `mcAct('deny','${tid}')`, 'b gh sm')
      : x.type === 'auth_required' ? (x.url ? `<a class="b gh sm" href="${esc(x.url)}" target="_blank" rel="noopener"><span>Connecter le service</span></a>` : '') + B("C'est connecté → continuer", `mcAct('connected','${tid}')`)
      : B("Continuer / voir l'avancement", `mcAct('continue','${tid}')`);
  }
  return `<div class="bub ${m.r}">${at ? `<div class="atts">${at}</div>` : ''}${m.r === 'u' ? esc(m.t).replace(/\n/g, '<br>') : mdl(m.t)}${m.q ? qCard(m.q, i) : ''}${acts ? `<div class="acts">${acts}</div>` : ''}<span class="meta">${m.via ? esc(m.via) + ' · ' : ''}${m.ts ? new Date(m.ts).toLocaleString('fr-FR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : ''}</span></div>`;
}
function thRename() { const t = TH(), v = prompt('Nom de la conversation :', thTitle(t)); if (v === null) return; t.ti = v.trim().slice(0, 60); thSave(); render(); }

/* ---------- Feuilles (menus du bas) ---------- */
function sheetOpen(n) { SHEET = n; THQ = ''; sheetRender(); }
function sheetClose() { SHEET = null; const s = $('#sheet'); s.classList.remove('o'); s.innerHTML = ''; }
function sheetRender() {
  const s = $('#sheet'); if (!SHEET) return sheetClose();
  const t = TH(), IT = (a, v, ic, b, sm, on) => `<button class="it" data-a="${a}" data-v="${esc(v)}"><span class="ic">${ic}</span><span class="tx"><b>${b}</b>${sm ? `<small>${sm}</small>` : ''}</span>${on ? '<span class="ck">✓</span>' : ''}</button>`;
  let h = '';
  if (SHEET === 'plus') {
    h = `<h2>Ajouter<button data-a="close">OK</button></h2><div class="grp">${IT('pick', '', '📎', 'Photo ou PDF', 'Depuis la photothèque ou les fichiers')}${IT('cam', '', '📷', 'Prendre une photo', 'Appareil photo')}${DEM[t.k].mod ? IT('sheet', 'doc', '📄', 'Choisir le document à modifier', '') : ''}</div>
<div class="gl">Réglages rapides</div><div class="grp">${IT('sheet', 'dem', DEM[t.k].ic, 'Demande', DEM[t.k].l)}${IT('sheet', 'ia', '🧠', 'Intelligence artificielle', iaLabel(t))}</div>
<div class="gl">Conversations</div><div class="grp">${IT('new', '', '✎', 'Nouvelle conversation', '')}${IT('sheet', 'fils', '☰', 'Toutes les conversations', S.threads.length + ' conversation(s)')}</div>`;
  } else if (SHEET === 'dem') {
    h = `<h2>Sélectionner la demande<button data-a="close">OK</button></h2>` + DEM_GRP.map(([g, ks]) => `<div class="gl">${g}</div><div class="grp">${ks.map(k => IT('dem', k, DEM[k].ic, DEM[k].l, '', t.k === k)).join('')}</div>`).join('') +
      `<p class="note">Changer de type de demande dans une conversation déjà commencée ouvre une nouvelle conversation, pour ne pas tout mélanger.</p>`;
  } else if (SHEET === 'doc') {
    const typ = DEM[t.k].mod, L = S.docs.filter(x => x.t === typ);
    h = `<h2>${typ === 'd' ? 'Devis' : 'Facture'} à modifier<button data-a="close">OK</button></h2><div class="grp">${L.length ? L.map(x => IT('doc', x.id, typ === 'd' ? '📄' : '🧾', esc(x.num) + ' · ' + esc(x.cn || 'Sans client'), fd(x.date) + ' · ' + E(tot(x).t) + (x.o ? ' · ' + esc(x.o.slice(0, 40)) : ''), t.doc === x.id)).join('') : `<p class="note" style="padding:12px">Aucun ${typ === 'd' ? 'devis' : 'facture'}.</p>`}</div>`;
  } else if (SHEET === 'ia') {
    const cur = modCur(t), eff = modEff(t);
    h = `<h2>Sélectionner l'IA<button data-a="close">OK</button></h2><div class="grp">${Object.entries(ENG).map(([k, e]) => IT('eng', k, k === 'api' ? '🔷' : k === 'cmp' ? '🖥️' : k === 'pro' ? '↗️' : k === 'mail' ? '✉️' : k === 'apple' ? 'IA' : '⚡', e.l, e.s, t.ai === k)).join('')}</div>`;
    if (t.ai === 'api' && !pk()) h += `<div class="gl">Clé API Perplexity</div><div class="grp" style="padding:10px"><input id="pkin" type="password" placeholder="pplx-…" autocomplete="off"><button class="b sm" style="width:100%;margin-top:8px" data-a="pk"><span>Enregistrer la clé</span></button></div><p class="note">Nécessaire pour utiliser Perplexity sans quitter l'appli (facturation à l'usage sur console.perplexity.ai, séparée de l'abonnement Pro). La clé reste sur cet appareil.</p>`;
    if (t.ai === 'cmp') h += `<p class="note"><span class="mcdot ${MCOK ? 'on' : ''}"></span>${MCOK ? 'Computer connecté' : MCOK === false ? 'Pont non joignable ou non connecté' : 'Vérification…'} · adresse du pont : ${esc(mcBase() || location.origin)}</p><div class="grp">${IT('mcconn', '', '🔑', 'Se connecter à Computer', 'Compte Perplexity, une seule fois (pont serveur.py lancé sur le PC)')}</div>`;
    if (t.ai === 'apple') h += `<p class="note">Apple Intelligence ne s'appelle pas comme Perplexity : Apple ne donne pas son modèle à un site. Sur l'iPhone 18 Pro, ce sont les Outils d'écriture, sur l'appareil. Écris ou dicte dans le champ, ouvre les Outils d'écriture, puis envoie. Une liste ou un JSON crée le document ici.</p><div class="grp">${IT('apple', '', 'IA', "Ouvrir les Outils d'écriture", "Sélectionne le texte pour le menu Apple, au-dessus du clavier")}</div>`;
    else if (t.ai === 'mail' || t.ai === 'loc') h += `<p class="note">${t.ai === 'mail' ? 'Pas de choix de modèle : Computer traite l\'e-mail avec son réglage.' : 'Aucun modèle : lecture locale des listes « désignation ; quantité ; prix ».'}</p>`;
    else {
      h += `<div class="gl">Mode de raisonnement</div><div class="seg">${Object.entries(MODES).map(([k, m]) => `<button class="${t.r === k ? 'on' : ''}" data-a="mode" data-v="${k}">${m.l}</button>`).join('')}</div><p class="note">${MODES[t.r].s}.</p>`;
      h += `<div class="gl">Modèle${t.ai === 'pro' ? ' (à sélectionner aussi dans Perplexity)' : ''}</div><div class="grp">${modList(t).map(m => IT('mod', m.id, m.id === 'auto' || m.id === 'defaut' ? '🎼' : '·', m.n, (t.ai === 'api' && m.id !== 'auto' ? m.id + ' · ' : '') + m.d, cur.id === m.id)).join('')}</div>`;
      if (eff) h += `<div class="gl">Attitude imposée · ${esc(eff.n)} · ${esc(MODES[t.r].l)}</div><div class="fiche">${esc(modFiche(eff, t.r))}\n\n${esc(MODES[t.r].methode)}</div>`;
      if (t.ai === 'cmp') h += `<p class="note">Computer exécute la tâche avec le modèle choisi (sous-agent). Le modèle principal de Computer se règle dans ton compte Perplexity.</p>`;
    }
  } else if (SHEET === 'fils') {
    const L = S.threads.slice().sort((a, b) => b.up - a.up).filter(x => !THQ || (thTitle(x) + ' ' + x.msgs.map(m => m.t).join(' ')).toLowerCase().includes(THQ));
    h = `<h2>Conversations<button data-a="new">Nouvelle</button></h2><input id="thq" type="search" placeholder="Rechercher" value="${esc(THQ)}" oninput="THQ=this.value.toLowerCase();sheetRender();setTimeout(()=>{const e=$('#thq');e.focus();e.setSelectionRange(e.value.length,e.value.length)},0)" style="margin-bottom:10px">
<div class="grp">${L.map(x => { const last = x.msgs[x.msgs.length - 1]; return `<div class="it" style="padding-right:8px"><span class="ic">${DEM[x.k]?.ic || '💬'}</span><span class="tx" data-a="open" data-v="${x.id}" style="cursor:pointer"><b>${esc(thTitle(x))}</b><small>${esc(DEM[x.k]?.l || '')} · ${esc(iaLabel(x))}<br>${last ? esc(String(last.t || '').replace(/\s+/g, ' ').slice(0, 70)) : 'Vide'} · ${new Date(x.up).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short'})}</small></span>${x.id === S.cfg.thc ? '<span class="ck">✓</span>' : ''}<button class="del" data-a="thdel" data-v="${x.id}">Supprimer</button></div>`; }).join('') || '<p class="note" style="padding:12px">Aucune conversation.</p>'}</div>`;
  }
  s.innerHTML = `<div class="bg"></div><div class="pn"><div class="grab"></div>${h}</div>`;
  s.classList.add('o');
}
function sheetAct(a, v, b) {
  const t = TH();
  if (a === 'close') return sheetClose();
  if (a === 'sheet') return sheetOpen(v);
  if (a === 'pick') { sheetClose(); return $('#fpick').click(); }
  if (a === 'cam') { sheetClose(); return $('#fcam').click(); }
  if (a === 'new') { sheetClose(); thNew(); return render(); }
  if (a === 'open') return thOpen(v);
  if (a === 'thdel') { if (b.dataset.ok) { S.threads = S.threads.filter(x => x.id !== v); if (!S.threads.length) thNew({}, false); if (S.cfg.thc === v) S.cfg.thc = S.threads[0].id; S.chat = TH().msgs; save('threads'); save('cfg'); render(); return sheetRender(); } b.dataset.ok = '1'; b.textContent = 'Confirmer ?'; return; }
  if (a === 'dem') {
    if (t.k !== v) {
      if (t.msgs.length) { thNew({k: v, doc: ''}); toast('Nouvelle conversation : ' + DEM[v].l); }
      else { t.k = v; t.doc = ''; thSave(); }
      S.cfg.as.k = v; save('cfg');
    }
    if (DEM[v].mod && !TH().doc) { render(); return sheetOpen('doc'); }
    sheetClose(); return render();
  }
  if (a === 'doc') { t.doc = v; thSave(); sheetClose(); return render(); }
  if (a === 'eng') { t.ai = v; S.cfg.as.ai = v; thSave(); save('cfg'); if (v === 'cmp') mcStatus(); render(); return sheetRender(); }
  if (a === 'mode') { t.r = v; S.cfg.as.r = v; thSave(); save('cfg'); render(); return sheetRender(); }
  if (a === 'mod') { if (t.ai === 'cmp') { t.mc = v; S.cfg.as.mc = v; } else { t.m = v; S.cfg.as.m = v; } thSave(); save('cfg'); render(); return sheetRender(); }
  if (a === 'pk') { const k = ($('#pkin')?.value || '').trim(); if (!k) return toast('Colle ta clé API'); S.cfg.pk = k; save('cfg'); toast('Clé enregistrée'); render(); return sheetRender(); }
  if (a === 'mcconn') return mcConnect();
  if (a === 'apple') { sheetClose(); return appleTools(); }
}

/* =====================================================================
   PROMPTS : règles + fiche du modèle + méthode du mode + consigne de la demande
   ===================================================================== */
const DOM_CHANTIER = `DOMAINE DE CETTE TÂCHE SEULEMENT (ne change pas ta façon générale de raisonner) : plomberie, chauffage, rénovation, France 2026. Prix unitaires HT. Sépare fournitures (F) et main-d'œuvre ou déplacement (M). Applique les règles de l'art et les DTU quand c'est technique. Signale les risques (gaz, électricité, amiante, dégâts des eaux) s'ils existent. N'invente pas une référence produit sans la marquer comme exemple.`;
const J_DOC = '{"client":{"nom":"","adresse":"","cp_ville":"","tel":""},"objet":"","F":[{"d":"désignation fourniture","q":1,"p":0}],"M":[{"d":"main-d\'œuvre ou déplacement","q":1,"p":0}],"note":""}';
const J_RAP = '{"rapport":{"ty":"Dégât des eaux | Recherche de fuite | Panne de chauffage | Diagnostic plomberie | Autre","cn":"nom du client","ca":"adresse du sinistre","cc":"code postal ville","ct":"téléphone","ass":"assurance","sn":"n° de sinistre","mo":"motif / circonstances","co":"constatations","org":"origine / cause probable","tr":"travaux réalisés / mesures conservatoires","pr":"préconisations"}}';
const J_PRIX = '{"items":[{"d":"désignation","t":"F","pa":0,"mg":35,"ref":"","fo":"fournisseur"}]}';
function docJSON(d) { return JSON.stringify({num: d.num, client: {nom: d.cn, adresse: d.ca, cp_ville: d.cc, tel: d.ct}, objet: d.o, F: d.F.filter(l => l.d || n(l.p)).map(l => ({d: l.d, q: n(l.q), p: n(l.p)})), M: d.M.filter(l => l.d || n(l.p)).map(l => ({d: l.d, q: n(l.q), p: n(l.p)}))}); }
function demConsigne(t) {
  const k = t.k, co = S.cfg.co;
  if (k === 'devis' || k === 'facture') return DOM_CHANTIER + `\n\nTÂCHE : ${k === 'devis' ? 'préparer un devis' : 'préparer une facture'} pour ${co}. Analyse la demande et les pièces jointes (liste, ancien devis, photo). Termine TOUJOURS par un bloc \`\`\`json strictement de cette forme (prix unitaires HT en euros, nombres sans symbole) :\n${J_DOC}\nF = fournitures, M = main-d'œuvre et déplacement. Les estimations sont signalées dans "note".`;
  if (DEM[k].mod) { const d = S.docs.find(x => x.id === t.doc); return DOM_CHANTIER + `\n\nTÂCHE : modifier ${DEM[k].mod === 'd' ? 'le devis' : 'la facture'} ci-dessous selon la demande. Document actuel (JSON) :\n${d ? docJSON(d) : '(aucun document choisi)'}\nRends le document COMPLET après modification (toutes les lignes, pas seulement les changements), dans un bloc \`\`\`json de cette forme :\n${J_DOC}\nExplique en 1 à 3 lignes ce que tu as changé.`; }
  if (k === 'rapport') return DOM_CHANTIER + `\n\nTÂCHE : rédiger un rapport d'intervention professionnel (style constat pour l'assurance, factuel, précis). Termine TOUJOURS par un bloc \`\`\`json de cette forme :\n${J_RAP}`;
  if (k === 'prix') return DOM_CHANTIER + `\n\nTÂCHE : recherche de prix fournisseurs. Donne le tableau article | fournisseur | prix HT | lien, indique où ce fournisseur se fournit (fabricant, usine, importateur) et si l'achat direct est possible. Termine par un bloc \`\`\`json :\n${J_PRIX}\n(pa = prix d'achat HT, mg = marge en %).`;
  if (k === 'app' || k === 'projet') return PROMPT_APP + (k === 'projet' ? "\nTÂCHE : concevoir un nouveau projet IA : objectif, architecture, fichiers complets, installation pas à pas sous Windows/PowerShell." : "\nTÂCHE : améliorer l'application. Donne les fichiers modifiés complets et explique où les placer.");
  return 'TÂCHE : répondre à la question de façon claire et concise.';
}
function sysPrompt(t, eff) {
  return [REGLES,
    eff ? `MODÈLE QUI EXÉCUTE : ${eff.n}${eff.id && eff.id.includes('/') ? ' (' + eff.id + ')' : ''}. Ce n'est pas un décor : tu raisonnes comme CE modèle, avec l'attitude, la recherche, la réflexion et le code imposés ci-dessous. Tu ne raisonnes pas « plombier » par défaut. Tu t'adaptes à la situation.` : '',
    eff && eff.f ? modFiche(eff, t.r) : '',
    'MÉTHODE GÉNÉRALE DU MODE (à combiner avec la fiche, sans la contredire) :\n' + MODES[t.r].methode,
    demConsigne(t)].filter(Boolean).join('\n\n');
}

/* =====================================================================
   ENVOI
   ===================================================================== */

function appleTools() {
  chatPush({r: 'a', t: "Apple Intelligence, sur ton iPhone 18 Pro.\n\nCe n'est pas un appel, et ce n'est pas Siri. Apple ne permet pas à l'appli d'interroger son modèle toute seule. Les Outils d'écriture tournent sur l'appareil, dans le champ de texte.\n\n1. Écris ou dicte ta demande dans le champ (le micro du clavier).\n2. Le texte est sélectionné : touche Outils d'écriture, au-dessus du clavier.\n3. Choisis Réécrire, Corriger, Résumer ou Composer.\n4. Envoie avec ↑. Si le texte est une liste ou un JSON, le devis, la facture ou le rapport est créé ici.", via: 'Apple Intelligence'});
  render();
  setTimeout(function () {
    const ta = $('#cin');
    if (!ta) return;
    ta.focus();
    if (ta.value) ta.select();
  }, 60);
}
function appleSend(t, txt, clear) {
  if (/```json|\{"(client|F|M|items|rapport)"/.test(txt)) {
    chatPush({r: 'u', t: txt});
    clear();
    asReply(t, txt, 'Apple Intelligence');
    return render();
  }
  const p = chatSend();
  clear();
  return p;
}
async function asSend() {
  if (ASBUSY) return;
  const t = TH(), ta = $('#cin'), txt = (ta ? ta.value : '').trim();
  if (!txt && !ATT.length) return toast('Écris un message ou joins un fichier');
  if (DEM[t.k].mod && !t.doc) return sheetOpen('doc');
  const clear = () => { if (ta) { ta.value = ''; cinGrow(ta); } draftClear('cin'); };
  if (t.ai === 'apple') return appleSend(t, txt, clear);
  if (t.ai === 'loc') { const p = chatSend(); clear(); return p; }
  if (t.ai === 'mail') { if (ta && txt) ta.value = '[' + DEM[t.k].l + '] ' + txt; const p = pxSend(); clear(); return p; }
  if (t.ai === 'pro') {
    if (/```json|\{"(client|F|M|items|rapport)"/.test(txt)) { chatPush({r: 'u', t: '(réponse Perplexity collée)'}); clear(); asReply(t, txt, 'Perplexity Pro'); return render(); }
    return proOpen(t, txt, clear);
  }
  if (t.ai === 'api') { if (!pk()) { toast('Ajoute ta clé API Perplexity'); return sheetOpen('ia'); } return apiSend(t, txt, clear); }
  if (t.ai === 'cmp') return cmpSend(t, txt, clear);
}

/* ---- Perplexity Pro : onglet pré-rempli (seul accès possible à l'abonnement sans API) ---- */
async function proOpen(t, txt, clear) {
  const eff = modEff(t), {texts, names} = await prepAtt();
  const prompt = sysPrompt(t, eff) + '\n\nMA DEMANDE : ' + (txt || 'Analyse les documents joints.') + (texts.length ? '\n\n' + texts.join('\n\n') : '');
  chatPush({r: 'u', t: txt || '(fichier joint)', att: names});
  chatPush({r: 'a', t: `Ouvert dans Perplexity avec toutes les consignes (aussi copiées). Choisis **${eff ? eff.n : 'le modèle'}** dans son sélecteur${t.r === 'profond' ? ' et active la recherche approfondie' : ''}. Quand la réponse est prête, copie-la entièrement et colle-la ici : l'appli fera le reste.`, via: 'Perplexity Pro'});
  const files = ATT.filter(a => a.k === 'img').map(a => a.f); ATT = []; clear(); render();
  try { await navigator.clipboard.writeText(prompt); } catch (e) {}
  if (files.length && navigator.canShare && navigator.canShare({files})) { try { await navigator.share({files, text: prompt.slice(0, 1800)}); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  window.open('https://www.perplexity.ai/search?q=' + enc(prompt.replace(/\s*\n+\s*/g, ' ').slice(0, 6000)), '_blank');
}

/* ---- Perplexity dans l'appli : Agent API ---- */
async function apiSend(t, txt, clear) {
  const eff = modEff(t), mode = MODES[t.r];
  let prep; try { prep = await prepAtt(); } catch (e) { prep = {imgs: [], texts: [], names: []}; }
  const hist = t.msgs.slice(-12).filter(m => m.t && m.t[0] !== '(').map(m => ({role: m.r === 'u' ? 'user' : 'assistant', content: String(m.t).slice(0, 4000)}));
  chatPush({r: 'u', t: txt || '(fichier joint)', att: prep.names}); ATT = []; clear();
  const userText = [txt || 'Analyse les documents joints.', ...prep.texts].join('\n\n');
  const content = [{type: 'input_text', text: userText}, ...prep.imgs.slice(0, 6).map(u => ({type: 'input_image', image_url: u}))];
  const forceWeb = !!window.PHOTOJOB;
  const tools = (forceWeb || ['prix', 'devis', 'facture'].includes(t.k) || t.r === 'profond') && (forceWeb || eff.f !== 'glm') ? [{type: 'web_search'}, {type: 'fetch_url'}] : undefined;
  const body = {model: eff.id, instructions: sysPrompt(t, eff), input: [...hist, {role: 'user', content}], max_output_tokens: mode.tokens, reasoning: {effort: (t.k === 'app' || t.k === 'projet') && t.r === 'profond' ? 'xhigh' : mode.effort}};
  if (tools) body.tools = tools;
  ASBUSY = true; render();
  try {
    let j = await apiPost(body);
    if (j._err && j._st === 400) { /* repli : sans raisonnement explicite / sans images / texte simple */
      delete body.reasoning; j = await apiPost(body);
      if (j._err && j._st === 400) { body.input = hist.map(h => (h.role === 'user' ? 'Artisan : ' : 'Assistant : ') + h.content).join('\n\n') + '\n\nArtisan : ' + userText; j = await apiPost(body); }
    }
    if (j._err) throw new Error(j._msg);
    const out = j.output_text || (j.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text' || c.text).map(c => c.text).join('\n') || '';
    asReply(t, out || '(réponse vide)', eff.n + ' · ' + mode.l);
  } catch (e) { chatPush({r: 'a', t: 'Erreur Perplexity : ' + (e.message || e) + (/401|403|auth/i.test(String(e.message)) ? '\nVérifie ta clé API dans le menu IA.' : ''), via: eff.n}); }
  finally { ASBUSY = false; render(); }
}
async function apiPost(body) {
  const r = await fetch('https://api.perplexity.ai/v1/agent', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + pk()}, body: JSON.stringify(body)});
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) return {_err: 1, _st: r.status, _msg: (j.error && (j.error.message || j.error.type)) || j.message || ('HTTP ' + r.status)};
  return j;
}

/* ---- Computer dans l'appli : pont local serveur.py (MCP, OAuth) ---- */
async function mcFetch(p, body, raw) {
  const o = raw ? {method: 'POST', body: raw.b, headers: raw.h} : body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'};
  const r = await fetch(mcBase() + p, o);
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error(j.message || j.erreur || ('HTTP ' + r.status)); er.code = r.status; er.kind = j.erreur; throw er; }
  return j;
}
async function mcStatus() {
  try { const s = await mcFetch('/api/status'); MCOK = !!s.connecte; } catch (e) { MCOK = false; }
  const d = $('#mcdot'); if (d) d.className = 'mcdot' + (MCOK ? ' on' : '');
}
function mcConnect() { window.open(mcBase() + '/oauth/start', '_blank'); toast("Connecte-toi dans l'onglet ouvert puis reviens ici"); }
async function cmpSend(t, txt, clear) {
  let urls = [], names = [];
  try { for (const a of ATT) { names.push({n: a.f.name, k: a.k}); const j = await mcFetch('/api/upload', null, {b: a.f, h: {'X-Filename': encodeURIComponent(a.f.name), 'X-Mime': a.f.type || 'application/octet-stream'}}); urls.push(j.attachment_url); } }
  catch (e) { return mcErr(e); }
  const eff = modEff(t), dem = '[' + DEM[t.k].l + '] ' + (txt || 'Analyse les fichiers joints.');
  const pre = t.mc !== 'defaut' && eff ? `Exécute cette demande avec le modèle « ${eff.n} » (sous-agent), en mode ${MODES[t.r].l.toLowerCase()}. Si ce modèle n'est pas disponible, utilise le plus proche et dis-le.\n\n` : `Mode ${MODES[t.r].l.toLowerCase()}.\n\n`;
  const msg = pre + (t.tid && !DEM[t.k].mod
    ? ('RAPPEL — tu restes ' + (eff ? eff.n : 'le modèle choisi') + '. ' + (eff && eff.f ? modFiche(eff, t.r) : MODES[t.r].methode) + '\n\nMA DEMANDE : ' + dem)
    : sysPrompt(t, eff) + '\n\nMA DEMANDE : ' + dem);
  chatPush({r: 'u', t: txt || '(fichier joint)', att: names}); ATT = []; clear();
  await mcCall('/api/chat', {message: msg, thread_id: t.tid || undefined, attachment_urls: urls}, t, eff);
}
async function mcCall(p, body, t, eff) {
  t = t || TH(); eff = eff || modEff(t); ASBUSY = true; render();
  try { mcHandle(await mcFetch(p, body), t, eff); } catch (e) { mcErr(e); } finally { ASBUSY = false; render(); }
}
function mcErr(e) {
  if (e.code === 401 || e.kind === 'non_connecte') { MCOK = false; chatPush({r: 'a', t: 'Connecte-toi à Computer (menu IA → « Se connecter à Computer »), puis renvoie ton message.'}); }
  else if (e instanceof TypeError) chatPush({r: 'a', t: 'Pont introuvable à ' + (mcBase() || location.origin) + ". Lance serveur.py sur ton PC (double-clic sur lancer.bat). Sur iPhone, choisis plutôt l'IA « Perplexity »."});
  else chatPush({r: 'a', t: 'Erreur : ' + (e.message || e)});
  render();
}
function mcHandle(j, t, eff) {
  if (j.thread_id) { t.tid = j.thread_id; thSave(); }
  const tid = j.thread_id || t.tid, ev = j.event || 'complete', txt = j.text || '', via = 'Computer' + (eff ? ' · ' + eff.n : '');
  if (ev === 'complete') return asReply(t, txt || '(réponse vide)', via);
  if (['ask_user_question', 'confirm_action', 'auth_required'].includes(ev)) return chatPush({r: 'a', t: txt || 'Computer attend ta réponse.', via, ix: {type: ev, tid, url: j.interactive && j.interactive.auth_url}});
  if (['sleep', 'waiting', 'timeout'].includes(ev)) return chatPush({r: 'a', t: (txt ? txt + '\n\n' : '') + 'La tâche continue côté Computer.', via, ix: {type: 'continue', tid}});
  if (ev === 'insufficient_credits') return chatPush({r: 'a', t: 'Crédits Computer insuffisants. ' + txt, via});
  chatPush({r: 'a', t: 'Tâche ' + ev + (txt ? ' : ' + txt : ''), via});
}
function mcAnswer(tid) { const r = prompt('Ta réponse à Computer :'); if (r === null || !r.trim()) return; chatPush({r: 'u', t: r}); mcCall('/api/answer', {thread_id: tid, texte: r, answers: {reponse: r}}); }
function mcAct(a, tid) {
  const map = {approve: ['/api/approve', 'Approuvé'], deny: ['/api/deny', 'Refusé'], connected: ['/api/connected', 'Service connecté'], continue: ['/api/chat', 'Continuer']};
  const [p, l] = map[a]; chatPush({r: 'u', t: l});
  mcCall(p, a === 'continue' ? {thread_id: tid, message: 'Continue et donne-moi le résultat final.'} : {thread_id: tid, texte: l});
}

/* =====================================================================
   RÉPONSE → ACTIONS AUTOMATIQUES
   ===================================================================== */
function jsonBlock(s) { const m = s.match(/```json\s*([\s\S]*?)```/i); if (m) { try { return JSON.parse(m[1]); } catch (e) {} } const i = s.indexOf('{"rapport"'); if (i >= 0) { try { return JSON.parse(s.slice(i, s.lastIndexOf('}') + 1)); } catch (e) {} } return null; }
function asReply(t, text, via) {
  const k = t.k, D = DEM[k];
  if (k === 'rapport') {
    const j = jsonBlock(text), r0 = j && (j.rapport || j);
    const clean = text.replace(/```json[\s\S]*?```/i, '').trim();
    if (r0 && (r0.mo || r0.co || r0.org || r0.tr)) {
      nr(); const r = S.rep[0]; ['ty', 'cn', 'ca', 'cc', 'ct', 'ass', 'sn', 'mo', 'co', 'org', 'tr', 'pr'].forEach(f => { if (r0[f]) r[f] = String(r0[f]); });
      if (!['Dégât des eaux', 'Recherche de fuite', 'Panne de chauffage', 'Diagnostic plomberie', 'Autre'].includes(r.ty)) r.ty = 'Autre';
      save('rep'); go('a');
      return chatPush({r: 'a', t: (clean || 'Rapport rédigé.') + `\n\n✔ Rapport ${r.num} créé.`, via, act: {open: r.id, v: 'xe', num: r.num}});
    }
    return chatPush({r: 'a', t: text, via});
  }
  const pa = parseAI(text);
  if (!pa.q || k === 'app' || k === 'projet' || k === 'autre') return chatPush({r: 'a', t: pa.q ? text : text, via});
  if (k === 'devis' || k === 'facture') {
    const d = qMake(pa.q, k === 'facture' ? 'f' : 'd');
    return chatPush({r: 'a', t: (pa.text || '') + `\n\n✔ ${k === 'facture' ? 'Facture' : 'Devis'} ${d.num} créé(e) · ${E(tot(d).t)}. Vérifie les prix.`, q: pa.q, via, act: {open: d.id, v: 'e', num: d.num}});
  }
  if (D.mod) {
    const d = S.docs.find(x => x.id === t.doc);
    if (!d) return chatPush({r: 'a', t: text, q: pa.q, via});
    const prev = JSON.stringify({cn: d.cn, ca: d.ca, cc: d.cc, ct: d.ct, o: d.o, F: d.F, M: d.M});
    const q = pa.q, cl = q.client || {};
    if (cl.nom) Object.assign(d, {cn: cl.nom || d.cn, ca: cl.adresse || d.ca, cc: cl.cp_ville || d.cc, ct: cl.tel || d.ct});
    if (q.objet) d.o = q.objet;
    d.F = q.F.length ? q.F.map(l => ({d: l.d, q: l.q, p: l.p || ''})) : [{d: '', q: 1, p: ''}];
    d.M = q.M.length ? q.M.map(l => ({d: l.d, q: l.q, p: l.p || ''})) : [{d: '', q: 1, p: ''}];
    d._prev = prev; save('docs');
    return chatPush({r: 'a', t: (pa.text || '') + `\n\n✔ ${d.num} modifié · nouveau total ${E(tot(d).t)}.`, via, act: {open: d.id, v: 'e', num: d.num, undo: d.id}});
  }
  chatPush({r: 'a', t: pa.text || text, q: pa.q, via}); /* prix : carte avec « Ajouter à mes tarifs » */
}
function asUndo(id) { const d = S.docs.find(x => x.id === id); if (!d || !d._prev) return toast('Rien à annuler'); Object.assign(d, JSON.parse(d._prev)); delete d._prev; save('docs'); chatPush({r: 'a', t: `↩︎ Modification de ${d.num} annulée.`}); render(); }
function qMake(q, t) {
  const y = new Date().getFullYear(), k = t + y, s = S.seq[k] = (S.seq[k] || 0) + 1;
  const d = {id: nw(), t, num: (t === 'd' ? 'DEV-' : 'FAC-') + y + '-' + String(s).padStart(3, '0'), date: td(), val: S.cfg.val, cn: '', ca: '', cc: '', ct: '', sn: '', sa: '', sc: '', o: '', F: [], M: [], acc: S.cfg.acc, ap: false, paid: false, pd: '', cost: '', st: 'att', tva: S.cfg.tva ? n(S.cfg.tvr) : 0, rm: ''};
  qApply(d, q); if (d.cn && !d.sn && !d.sa) Object.assign(d, {sn: d.cn, sa: d.ca, sc: d.cc});
  S.docs.unshift(d); save('docs'); save('seq'); return d;
}

/* ---------- Nouveautés v3.5 (affichées une fois) ---------- */
function newsShow() {
  const d = document.createElement('div'); d.className = 'news';
  d.innerHTML = `<div><h2>Nouveautés 3.6</h2><ul>
<li><b>Assistant repensé</b> : bouton <b>+</b> en bas à gauche (photo, PDF, réglages), zone de texte large qui s'agrandit.</li>
<li><b>Menu « Demande »</b> : Créer un devis, Créer une facture, Modifier un devis, Modifier une facture, Faire un rapport, Recherche de prix, Améliorer l'appli, Projet IA, Autre.</li>
<li><b>Menu « IA »</b> : Perplexity ou Computer dans l'appli, avec le choix du modèle (Claude Fable 5.1, Claude Opus 5.5, GPT 6 Sol, Gemini 3.8 Flash, Grok 4.7…) et du mode Rapide / Raisonnement / Profond.</li>
<li><b>Conversations séparées</b> : bouton ☰ pour reprendre chaque sujet là où tu en étais.</li>
<li><b>Corbeille</b> dans le menu ; dans Devis, Factures et Rapports : glisse une ligne vers la gauche → « Supprimer », ou « Sélectionner » pour tout supprimer d'un coup.</li>
<li><b>Raisonnement</b> : chaque modèle a une attitude imposée (chercher, réfléchir, coder) selon le mode. Il s'adapte à la situation. La plomberie n'est plus le moule.</li>
<li><b>Logo sur l'écran d'accueil</b> : supprime l'icône grise avec le M, ouvre l'appli dans Safari, Partager, Sur l'écran d'accueil. iPhone ne change jamais une icône déjà posée.</li>
<li>Nouvelle icône avec ton logo et écran d'ouverture.</li></ul>
<button class="b" style="width:100%;margin-top:10px" onclick="this.closest('.news').remove()"><span>Compris</span></button></div>`;
  d.addEventListener('click', e => { if (e.target === d) d.remove(); });
  document.body.appendChild(d);
}
const _boot35 = boot;
boot = async function () { const r = await _boot35.apply(this, arguments); try { if (S.cfg && !S.cfg.news36) { S.cfg.news36 = 1; save('cfg'); setTimeout(newsShow, 1300); } } catch (e) {} return r; };
/* Mise à jour automatique : vérifie sw.js sans cache et recharge une fois quand une nouvelle version s'installe */
pwa = function () {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const had = !!navigator.serviceWorker.controller; let done = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; toast('Mise à jour installée'); setTimeout(() => location.reload(), 600); } });
  navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).then(r => r.update()).catch(() => {});
};

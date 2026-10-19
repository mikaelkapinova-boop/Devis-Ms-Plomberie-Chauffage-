/* Ms Plomberie & Chauffage — extensions : réglages, assistant, sauvegarde, partage, PWA */
'use strict';

/* ---------- Réglages par défaut ---------- */
const CFG0={cot:21.5,imp:0,val:30,acc:40,
co:'Ms Plomberie & Chauffage',nm:'Mikael SALILLARI',ad:"285 rue Jeanne d'Arc",cp:'54000 Nancy',tel:'07 49 24 85 59',ml:'Mikael.salillari@hotmail.fr',
siret:'952 085 595 00017',ass:'Décennale / RC Pro Tetris · Contrat n° SV75018041T36798',
iban:'FR76 4061 8804 0500 0403 3678 766',bic:'BOUSFRPPXXX',tit:'Mikael SALILLARI',
tva:false,tvr:20,mt:'TVA non applicable, art. 293 B du CGI.',pay:'Virement bancaire',
pen:"En cas de retard de paiement : pénalités égales à 3 fois le taux d'intérêt légal et indemnité forfaitaire de recouvrement de 40 €. Pas d'escompte pour paiement anticipé.",
cgv:'',sig:true,th:'auto',
ai:{pv:'pplx',key:'',model:''},
px:'mikaelkapinova@gmail.com', /* adresse e-mail reliée à Perplexity (assistant sans clé) */
gh:{tok:'',repo:''}, /* champs hérités de l'ancienne synchronisation */
mg:35,            /* marge par défaut sur le prix d'achat (%) */
inb:[]};          /* identifiants déjà importés depuis la boîte de réception du site */

function cfgInit(){S.cfg=Object.assign({},CFG0,S.cfg||{});S.cfg.ai=Object.assign({},CFG0.ai,S.cfg.ai||{});S.cfg.gh=Object.assign({},CFG0.gh,S.cfg.gh||{});if(!Array.isArray(S.cfg.inb))S.cfg.inb=[];if(!Array.isArray(S.chat))S.chat=[];if(!Array.isArray(S.plan))S.plan=[]}
function applyTheme(){const t=S.cfg.th||'auto';if(t==='auto')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
const m=document.querySelector('meta[name=theme-color]');if(m)m.content=(t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches))?'#0e141a':'#3b556a'}
function cs(k,v){const p=k.split('.');let o=S.cfg;while(p.length>1)o=o[p.shift()];o[p[0]]=v;save('cfg');if(k==='th')applyTheme()}
const enc=encodeURIComponent;
function repoInfo(){return 'ms-plomberie-partage-v1'}

/* ---------- Vue Réglages ---------- */
function setV(){const c=S.cfg,I=(l,k,ty='text',ph='')=>{const p=k.split('.');let v=c;p.forEach(x=>v=v?.[x]);return `<label>${l}<input type="${ty}" placeholder="${esc(ph)}" value="${esc(v??'')}" oninput="cs('${k}',this.value)"></label>`},
T=(l,k,r=2)=>`<label>${l}<textarea rows="${r}" oninput="cs('${k}',this.value)">${esc(c[k])}</textarea></label>`,
N=(l,k)=>`<label>${l}<input inputmode="decimal" value="${esc(c[k])}" oninput="cs('${k}',n(this.value))"></label>`;
return `<div class="c"><h3>Mon entreprise (en-tête des documents)</h3>${I('Raison sociale','co')}${I('Nom du gérant','nm')}${I('Adresse','ad')}${I('Code postal Ville','cp')}<div class="g2">${I('Téléphone','tel','tel')}${I('E-mail','ml','email')}</div>${I('SIRET','siret')}${I('Assurance (décennale / RC Pro)','ass')}</div>
<div class="c"><h3>Règlement</h3>${I('IBAN','iban')}<div class="g2">${I('BIC','bic')}${I('Titulaire du compte','tit')}</div>${I('Mode de règlement affiché','pay')}${T('Pénalités de retard (factures)','pen',3)}${T('Conditions générales / mentions (bas de page, optionnel)','cgv',3)}<label class="tg"><input type="checkbox" ${c.sig?'checked':''} onchange="cs('sig',this.checked)">Cadre « Bon pour accord » sur les devis</label></div>
<div class="c"><h3>Facture électronique de l'État</h3><p class="mu" style="margin:0 0 8px;font-size:13px">L'appli ne se branche pas toute seule sur l'administration. Depuis le 1er septembre 2026, tu dois pouvoir recevoir les factures via une plateforme agréée. L'émission, pour une micro-entreprise, devient obligatoire le 1er septembre 2027. Pour un client public, le dépôt se fait sur Chorus Pro.</p>${I("Nom de ta plateforme agréée","pa","text","ex. la plateforme choisie")}<p class="mu" style="font-size:12px"><a href="https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees" target="_blank" rel="noopener">Liste officielle des plateformes agréées</a> · <a href="https://portail.chorus-pro.gouv.fr/" target="_blank" rel="noopener">Chorus Pro</a></p></div>
	<div class="c"><h3>TVA</h3><label class="tg"><input type="checkbox" ${c.tva?'checked':''} onchange="cs('tva',this.checked);render()">Je facture la TVA (sinon franchise en base)</label>${c.tva?`<div class="g2" style="margin-top:8px">${N('Taux de TVA par défaut (%)','tvr')}</div><p class="mu" style="font-size:12px">Le taux est enregistré dans chaque document à sa création ; tu peux le changer document par document.</p>`:T('Mention affichée sur les documents','mt')}</div>
<div class="c"><h3>Valeurs par défaut</h3><div class="g2">${N('Validité des devis (jours)','val')}${N('Acompte (%)','acc')}</div>${N('Marge appliquée sur le prix d\'achat fournisseur (%)','mg')}<p class="mu" style="font-size:12px">Dans « Mes tarifs », le prix de vente est calculé automatiquement : prix d'achat + marge.</p></div>
<div class="c"><h3>Micro-entreprise (calcul des bénéfices)</h3><div class="g2">${N('Cotisations (%)','cot')}${N('Impôt libératoire (%)','imp')}</div></div>
<div class="c"><h3>Apparence</h3><label>Thème<select onchange="cs('th',this.value)"><option value="auto" ${c.th==='auto'?'selected':''}>Automatique</option><option value="light" ${c.th==='light'?'selected':''}>Clair</option><option value="dark" ${c.th==='dark'?'selected':''}>Sombre</option></select></label></div>
<div class="c"><h3>Clé API</h3><label>Clé Perplexity<input type="password" placeholder="pplx-…" value="${esc(c.pk||'')}" oninput="cs('pk',this.value)" autocomplete="off"></label><button class="b gh sm" onclick="go('k')">Connecteurs</button></div>
	<div class="c"><h3>Synchronisation en ligne</h3><p class="mu" style="margin:0 0 8px;font-size:13px">Les devis, factures, clients, tarifs, achats, rapports, planning, photos, conversations et corbeille se sauvegardent dans un espace en ligne privé et chiffré. Les appareils connectés avec le même identifiant et le même mot de passe partagent les mêmes données. La synchronisation se fait automatiquement à l’ouverture, après chaque modification et pendant que l’application reste ouverte.</p><button class="b gh sm" type="button" onclick="ghPush(1)">Synchroniser maintenant</button><small id="ghst" class="mu" style="display:block;margin-top:8px">${esc(ghLastStatus)}</small></div>
	<div class="c"><h3>Données partagées</h3><p class="mu" style="margin:0 0 8px;font-size:13px">Les documents et réglages sont enregistrés dans le stockage en ligne privé. Les copies de travail ne restent pas sur ce téléphone.</p><p class="mu" style="font-size:12px;margin:8px 0 0">${S.docs.length} document(s) · ${S.clients.length} client(s) · ${S.cat.length} tarif(s) · ${S.rep.length} rapport(s)</p></div><div class="c"><h3>Accès</h3><p class="mu" style="margin:0 0 8px;font-size:13px">L'appli est protégée par identifiant et mot de passe. Les données synchronisées en ligne sont chiffrées sur le téléphone avant leur envoi.</p><button class="b gh sm" onclick="authLogout()">Se déconnecter</button></div>
<div class="c"><h3>Appareil</h3><p class="mu" style="margin:0 0 8px;font-size:13px">Les documents restent dans l’espace partagé en ligne. Cette action déconnecte uniquement cet appareil.</p><button class="b rd sm" data-t="Déconnecter cet appareil" onclick="arm2(this,wipe)">Déconnecter cet appareil</button></div>
<p class="mu" style="text-align:center;font-size:12px">Version ${APPV}</p>`}
const APPV='7.18.1';
async function wipe(){await clearLocalBusinessData();authLogout()}

function dlBlob(b,nm){const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=nm;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u)},1500)}

/* ---------- Synchronisation chiffrée multi-appareils ---------- */
const CLOUD_SYNC_API = 'https://devis-ms-plomberie-chauffage.vercel.app';
const GH_ARRAYS = ['clients', 'cat', 'docs', 'achats', 'rep', 'chat', 'plan', 'threads', 'trash'];
let ghSha = null, ghT = null, ghPoll = null, ghInFlight = null, ghEventsBound = false;
let ghQueued = false, ghBasePack = null, ghLastErrorToast = 0;
let ghLastStatus = 'Connecte-toi avec le même compte sur chaque appareil pour synchroniser tes données.';
let ghMeta = {v: 1, deleted: {}};
async function cloudApi(method='GET',body=null,etag=''){
  if(!CLOUD_SYNC_TOKEN)throw new Error('Reconnecte-toi pour activer la synchronisation en ligne');
  const headers={Authorization:'Bearer '+CLOUD_SYNC_TOKEN};
  if(body){headers['Content-Type']='application/json'}
  if(etag)headers['If-Match']=etag;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try { response=await fetch(CLOUD_SYNC_API+'/api/sync',{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal}); }
  catch (error) { if (error && error.name === 'AbortError') throw new Error('Le serveur de synchronisation ne répond pas.'); throw error; }
  finally { clearTimeout(timeout); }
  let result={};try{result=await response.json()}catch(e){}
  if(!response.ok){const error=new Error(result.error||'Synchronisation en ligne · '+response.status);error.status=response.status===412?409:response.status;throw error}
  return result;
}
function ghClone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function ghStable(v) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(ghStable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + ghStable(v[k])).join(',') + '}';
}
function ghWithoutStamp(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const copy = Object.assign({}, v); delete copy._syncAt; return copy;
}
function ghSame(a, b) { return ghStable(ghWithoutStamp(a)) === ghStable(ghWithoutStamp(b)); }
function ghHash(value) {
  const s = String(value || ''); let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
function ghRecordId(k, item, i) {
  if (item && item.id != null && String(item.id)) return String(item.id);
  if (k === 'trash' && item && item.it && item.it.id != null) return 'trash:' + String(item.k || 'docs') + ':' + String(item.it.id);
  if (k === 'cat') return 'cat:' + String(item && item.d || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() + '|' + String(item && item.t || 'F') + '|' + String(item && item.ref || '');
  if (k === 'chat' && item && item.ts) return 'chat:' + item.ts + ':' + String(item.r || '') + ':' + ghHash(item.t || '');
  if (k === 'achats') return 'achat:' + ghHash([item && (item.invoice || item.num), item && (item.supplier || item.fo), item && item.date, item && item.total].join('|'));
  if (k === 'ph') return 'photo:' + ghHash(item && item.s || ghStable(item));
  return k + ':' + ghHash(ghStable(item) + ':' + i);
}
function ghIndex(k, list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((item, i) => { if (item && typeof item === 'object') map.set(ghRecordId(k, item, i), item); });
  return map;
}
function ghMergeDeleted(...packs) {
  const deleted = {};
  packs.filter(Boolean).forEach(pack => {
    const groups = pack.__sync && pack.__sync.deleted || {};
    Object.keys(groups).forEach(k => {
      if (!deleted[k]) deleted[k] = {};
      Object.keys(groups[k] || {}).forEach(id => { deleted[k][id] = Math.max(Number(deleted[k][id]) || 0, Number(groups[k][id]) || 0); });
    });
  });
  return deleted;
}
async function ghBaseRead(repo) {
  return ghBasePack && ghBasePack.repo === repo ? ghClone(ghBasePack.pack) : null;
}
async function ghBaseWrite(repo, pack) {
  ghBasePack = {repo, pack: ghClone(pack)};
}
function ghPack() {
  const p = {__sync: ghClone(ghMeta || {v: 1, deleted: {}}), _t: Date.now()};
  GH_ARRAYS.forEach(k => { p[k] = ghClone(Array.isArray(S[k]) ? S[k] : []); });
  p.seq = ghClone(S.seq || {}); p.ph = ghClone(S.ph || {});
  const c = ghClone(S.cfg || {});
  c.pk = '';
  if (c.ai) c.ai.key = '';
  c.gh = {};
  p.cfg = c;
  return p;
}
function ghStampLocalChanges(base, local) {
  const now = Date.now();
  local.__sync = {v: 1, deleted: ghMergeDeleted(base, local)};
  GH_ARRAYS.forEach(k => {
    const current = ghIndex(k, local[k]);
    const previous = ghIndex(k, base && base[k]);
    if (!base) {
      current.forEach(item => { if (!Number(item._syncAt)) item._syncAt = Number(local._t) || now; });
      return;
    }
    current.forEach((item, id) => { const old = previous.get(id); if (!old || !ghSame(item, old)) item._syncAt = now; });
    previous.forEach((item, id) => { if (!current.has(id)) local.__sync.deleted[k][id] = now; });
  });
}
function ghRecordTime(item, pack) { return Number(item && item._syncAt) || Number(pack && pack._t) || 0; }
function ghMergeArray(k, base, local, remote, bp, lp, rp, deleted) {
  const b = ghIndex(k, base), l = ghIndex(k, local), r = ghIndex(k, remote);
  const ids = new Set([...b.keys(), ...l.keys(), ...r.keys()]);
  const out = [];
  ids.forEach(id => {
    const bv = b.get(id), lv = l.get(id), rv = r.get(id);
    const lc = bp ? !ghSame(lv, bv) : lv !== undefined;
    const rc = bp ? !ghSame(rv, bv) : rv !== undefined;
    const deletedAt = Number(deleted && deleted[id]) || 0;
    let chosen, source;
    if (lc && rc) {
      if (lv !== undefined && rv !== undefined) { source = ghRecordTime(lv, lp) > ghRecordTime(rv, rp) ? 'local' : 'remote'; chosen = source === 'local' ? lv : rv; }
      else if (lv === undefined && rv !== undefined) { source = deletedAt >= ghRecordTime(rv, rp) ? '' : 'remote'; chosen = source ? rv : undefined; }
      else if (rv === undefined && lv !== undefined) { source = deletedAt >= ghRecordTime(lv, lp) ? '' : 'local'; chosen = source ? lv : undefined; }
    } else if (lc) { chosen = lv; source = 'local'; }
    else if (rc) { chosen = rv; source = 'remote'; }
    else if (rv !== undefined) { chosen = rv; source = 'remote'; }
    else if (lv !== undefined) { chosen = lv; source = 'local'; }
    else { chosen = bv; source = 'base'; }
    if (chosen !== undefined) {
      const time = ghRecordTime(chosen, source === 'local' ? lp : source === 'remote' ? rp : bp);
      if (deletedAt && deletedAt >= time) return;
      if (deleted && deletedAt && time > deletedAt) delete deleted[id];
      out.push(ghClone(chosen));
    }
  });
  return out;
}
function ghPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function ghMergeObject(base, local, remote, hasBase, lt, rt) {
  const b = ghPlain(base) ? base : {}, l = ghPlain(local) ? local : {}, r = ghPlain(remote) ? remote : {};
  const out = {};
  new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]).forEach(k => {
    const bv = b[k], lv = l[k], rv = r[k];
    if (ghPlain(bv) || ghPlain(lv) || ghPlain(rv)) {
      const child = ghMergeObject(bv, lv, rv, hasBase && ghPlain(bv), lt, rt);
      if (Object.keys(child).length) out[k] = child;
      return;
    }
    const lc = hasBase ? !ghSame(lv, bv) : lv !== undefined;
    const rc = hasBase ? !ghSame(rv, bv) : rv !== undefined;
    let value;
    if (lc && rc) value = hasBase ? (lt > rt ? lv : rv) : (rv !== undefined ? rv : lv);
    else if (lc) value = lv;
    else if (rc) value = rv;
    else value = rv !== undefined ? rv : lv;
    if (value !== undefined) out[k] = value;
  });
  return out;
}
function ghMergePhotos(base, local, remote, bp, lp, rp) {
  const b = base || {}, l = local || {}, r = remote || {}, out = {};
  new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]).forEach(id => {
    const bv = b[id], lv = l[id], rv = r[id];
    const lc = bp ? !ghSame(lv, bv) : lv !== undefined;
    const rc = bp ? !ghSame(rv, bv) : rv !== undefined;
    let value;
    if (lc && rc) {
      if (!Array.isArray(lv)) value = (Number(rp && rp._t) > Number(lp && lp._t)) ? rv : undefined;
      else if (!Array.isArray(rv)) value = (Number(lp && lp._t) > Number(rp && rp._t)) ? lv : undefined;
      else {
        const photos = new Map();
        [...lv, ...rv].forEach((photo, i) => {
          const key = ghRecordId('ph', photo, i), old = photos.get(key);
          if (!old || Number(rp && rp._t) >= Number(lp && lp._t)) photos.set(key, ghClone(photo));
        });
        value = [...photos.values()];
      }
    } else if (lc) value = lv;
    else if (rc) value = rv;
    else value = rv !== undefined ? rv : lv;
    if (Array.isArray(value) && value.length) out[id] = ghClone(value);
  });
  return out;
}
function ghMergePack(base, local, remote) {
  const bp = !!base, rp = remote || {}, lp = local || {}, deleted = ghMergeDeleted(base, local, remote);
  const merged = {__sync: {v: 1, deleted}, _t: Math.max(Number(lp._t) || 0, Number(rp._t) || 0)};
  GH_ARRAYS.forEach(k => { if (!deleted[k]) deleted[k] = {}; merged[k] = ghMergeArray(k, base && base[k], lp[k], rp[k], bp, lp, rp, deleted[k]); });
  merged.seq = {};
  [base && base.seq, lp.seq, rp.seq].forEach(seq => Object.keys(seq || {}).forEach(k => { merged.seq[k] = Math.max(Number(merged.seq[k]) || 0, Number(seq[k]) || 0); }));
  merged.ph = ghMergePhotos(base && base.ph, lp.ph, rp.ph, bp, lp, rp);
  merged.cfg = ghMergeObject(base && base.cfg, lp.cfg, rp.cfg, bp, Number(lp._t) || 0, Number(rp._t) || 0);
  (merged.trash || []).forEach(entry => {
    const collection = entry && entry.k, item = entry && entry.it;
    if (!['docs', 'rep'].includes(collection) || !item || item.id == null) return;
    const id = ghRecordId(collection, item, 0);
    entry.syncDeleteAt = Number(entry.syncDeleteAt) || Math.max(Date.now(), Number(entry.at) || 0);
    deleted[collection] = deleted[collection] || {};
    deleted[collection][id] = Math.max(Number(deleted[collection][id]) || 0, entry.syncDeleteAt);
    merged[collection] = (merged[collection] || []).filter(record => ghRecordId(collection, record, 0) !== id);
    if (collection === 'rep') delete merged.ph[id];
  });
  merged.__sync.deleted = deleted;
  return merged;
}
function ghComparable(pack) { const copy = ghClone(pack); if (copy) delete copy._t; return ghStable(copy); }
function ghStatus(message) {
  ghLastStatus = message;
  const el = $('#ghst'); if (el) el.textContent = message;
}
function repoInfo() {
  return 'ms-plomberie-partage-v1';
}
async function ghReadStore() {
  const remote = await cloudApi('GET');
  return {sha: remote.etag || '', pack: remote.pack ? await decJSON(remote.pack) : null};
}
async function ghWriteStore(pack, sha) {
  const response = await cloudApi('PUT', {pack: await encJSON(pack)}, sha);
  return response.etag || '';
}
function ghVisibleState() {
  const c = ghClone(S.cfg || {}); c.pk = ''; if (c.ai) c.ai.key = ''; c.gh = {};
  return ghStable({clients: S.clients, cat: S.cat, docs: S.docs, achats: S.achats, rep: S.rep, chat: S.chat, plan: S.plan, threads: S.threads, trash: S.trash, ph: S.ph, seq: S.seq, cfg: c});
}
function ghApplyPack(pack) {
  const before = ghVisibleState(), keep = {pk: S.cfg.pk, gh: {}, ai: ghClone(S.cfg.ai)};
  GH_ARRAYS.forEach(k => { if (Array.isArray(pack[k])) S[k] = ghClone(pack[k]); });
  if (pack.seq) S.seq = ghClone(pack.seq);
  if (pack.ph) S.ph = ghClone(pack.ph);
  if (pack.cfg) {
    S.cfg = Object.assign({}, S.cfg, ghClone(pack.cfg));
    S.cfg.pk = keep.pk; S.cfg.gh = keep.gh; S.cfg.ai = keep.ai;
  }
  cfgInit();
  if (appStartupReady && before !== ghVisibleState()) render();
}
function ghStartAuto() {
  if (!CLOUD_SYNC_TOKEN) return;
  if (!ghPoll) ghPoll = setInterval(() => { if (!document.hidden) ghSync(false); }, 15000);
  if (ghEventsBound) return;
  ghEventsBound = true;
  window.addEventListener('focus', () => { if (!document.hidden) ghSync(false); });
  window.addEventListener('online', () => ghSync(false));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ghSync(false); });
}
async function ghSync(manual) {
  if (!CLOUD_SYNC_TOKEN) { const message = AUTH_SYNC_ERROR ? 'Connexion en ligne impossible · ' + AUTH_SYNC_ERROR : 'Reconnecte-toi sur cet appareil pour activer la synchronisation en ligne.'; ghStatus(message); if (manual) toast(message); return; }
  ghStartAuto();
  if (ghInFlight) {
    ghQueued = true;
    try { const result = await ghInFlight; if (manual && result && result.ok) toast('Données synchronisées entre les appareils'); return result; }
    catch (e) { ghStatus('Échec de synchronisation · ' + (e && e.message || 'erreur réseau')); if (manual) toast('Synchronisation impossible : ' + (e && e.message || 'erreur réseau')); return {ok: false, error: e}; }
  }
  const job = (async () => {
    const repo = repoInfo();
    for (let attempt = 0; attempt < 4; attempt++) {
      const [remoteState, savedBase] = await Promise.all([ghReadStore(), ghBaseRead(repo)]);
      const base = remoteState.pack ? savedBase : null;
      ghMeta = ghMergeDeleted(base, remoteState.pack, {__sync: ghMeta});
      ghMeta = {v: 1, deleted: ghMeta};
      const local = ghPack();
      const legacyStamp = Number(legacyLocalStamp || localStorage.getItem('ms_stamp') || 0);
      if (!base && legacyStamp) local._t = legacyStamp;
      ghStampLocalChanges(base, local);
      const merged = ghMergePack(base, local, remoteState.pack);
      let sha = remoteState.sha;
      const changed = !remoteState.pack || ghComparable(merged) !== ghComparable(remoteState.pack);
      if (changed) {
        try { sha = await ghWriteStore(merged, sha); }
        catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 3) continue; throw e; }
      }
      ghSha = sha;
      const live = ghPack();
      ghStampLocalChanges(local, live);
      const latest = ghMergePack(local, live, merged);
      const morePending = ghComparable(latest) !== ghComparable(merged);
      ghApplyPack(latest);
      ghMeta = ghClone(latest.__sync || {v: 1, deleted: {}});
      await ghBaseWrite(repo, merged);
      if (morePending) ghQueued = true;
      const localClean = await clearLocalBusinessData();
      ghStatus(!localClean ? 'En ligne, mais certaines données de cache n’ont pas pu être effacées de cet appareil.' : morePending ? 'Dernières modifications en cours d’enregistrement…' : 'Enregistré en ligne · ' + new Date().toLocaleTimeString('fr-FR'));
      if (!localClean && appStartupReady) toast('Données en ligne, mais cache local à effacer.');
      if (manual) toast(morePending ? 'Synchronisation des dernières modifications…' : 'Données synchronisées entre les appareils');
      return {ok: true};
    }
    throw new Error('Les deux téléphones ont modifié les données en même temps. Réessaie dans quelques secondes.');
  })();
  ghInFlight = job;
  try { return await job; }
  catch (e) {
    if (e && e.status === 401) { ghStatus('Session en ligne expirée · reconnecte-toi.'); if (typeof authLogout === 'function') setTimeout(authLogout, 0); }
    else { ghStatus('Échec de synchronisation · ' + (e && e.message || 'erreur réseau')); if (appStartupReady && Date.now() - ghLastErrorToast > 15000) { ghLastErrorToast = Date.now(); toast('Non enregistré en ligne. Garde l’application ouverte et vérifie Internet.'); } }
    if (manual) toast('Synchronisation impossible : ' + (e && e.message || 'erreur réseau'));
    return {ok: false, error: e};
  }
  finally { ghInFlight = null; if (ghQueued) { ghQueued = false; if (appStartupReady) setTimeout(() => ghSync(false), 0); } }
}
function ghPush(manual) { return ghSync(!!manual); }
function ghPull(manual) { return ghSync(!!manual); }
function ghSched() { if (!CLOUD_SYNC_TOKEN || !appStartupReady) return; ghStartAuto(); clearTimeout(ghT); ghT = setTimeout(() => ghSync(false), 350); }

/* ---------- Partage & e-mail ---------- */
function pdfMeta(d){const C=S.cfg||{},lab=d.t==='f'?'FACTURE':d.t==='d'?'DEVIS':'RAPPORT';return{lab,num:d.num||'',date:fd(d.date),client:d.cn||'',co:C.co||'',nm:C.nm||'',siret:C.siret||'',tel:C.tel||'',logo:typeof LGT!=='undefined'?LGT:''}}
async function mkpdf(d){const stack=await buildPdfPages(cd(d),pdfMeta(d)),host=document.createElement('div');host.style.cssText='position:fixed;left:-9999px;top:0;width:794px;background:#fff';host.appendChild(stack);document.body.appendChild(host);
try{await Promise.all([...host.querySelectorAll('img')].map(i=>i.decode().catch(()=>0)));const pages=[...host.querySelectorAll('.pdf-page')],P2=new jspdf.jsPDF({orientation:'p',unit:'mm',format:'a4',compress:true}),nm=(d.num+(d.cn?'-'+d.cn:'')).replace(/[^\w-]+/g,'_')+'.pdf';
for(let i=0;i<pages.length;i++){const c=await html2canvas(pages[i],{scale:2,backgroundColor:'#ffffff',width:794,height:1123,windowWidth:794,scrollX:0,scrollY:0});if(i)P2.addPage();P2.addImage(c.toDataURL('image/jpeg',.92),'JPEG',0,0,210,297)}return{blob:P2.output('blob'),nm,P2}}finally{host.remove()}}
const _pvoRaw=pvo;
pvo=async function(){const d=cur();if(!d)return;$('#pv').classList.add('o');document.body.classList.add('lk');$('#pvs').innerHTML='<p style="padding:28px;color:#666">Mise en page…</p>';pvf();
try{const stack=await buildPdfPages(cd(d),pdfMeta(d));$('#pvs').replaceChildren(stack);pvf()}catch(e){_pvoRaw()}}
async function pdf(){const d=cur();toast('Création du PDF…');try{const{P2,nm}=await mkpdf(d);P2.save(nm)}catch(e){toast('PDF impossible ici')}}
async function shr(){const d=cur();toast('Préparation du PDF…');try{const{blob,nm}=await mkpdf(d),f=new File([blob],nm,{type:'application/pdf'}),lab=d.t==='f'?'Facture':d.t==='d'?'Devis':'Rapport';
if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:lab+' '+d.num,text:`${lab} ${d.num} — ${S.cfg.co}`});else{dlBlob(blob,nm);toast('Partage indisponible : PDF téléchargé')}}catch(e){if(e&&e.name!=='AbortError')toast('Partage impossible')}}
function mailC(){const d=cur(),c=S.clients.find(x=>x.id===d.cid)||S.clients.find(x=>x.n===d.cn),to=d.ce||(c&&c.e?c.e:''),lab=d.t==='f'?'facture':'devis',T=tot(d);
const body=`Bonjour${d.cn?' '+d.cn:''},\n\nVeuillez trouver ci-joint ${lab==='devis'?'le devis':'la facture'} ${d.num}${d.o?' concernant : '+d.o:''}.\nMontant : ${E(T.t)}${lab==='devis'?`\nValidité : ${d.val} jours. Acompte à la commande : ${d.acc} %.`:`\nRèglement par ${S.cfg.pay.toLowerCase()}.`}\n\nN'hésitez pas à me contacter pour toute question.\n\nCordialement,\n${S.cfg.nm}\n${S.cfg.co}\n${S.cfg.tel}`;
location.href=`mailto:${enc(to)}?subject=${enc((lab==='devis'?'Devis ':'Facture ')+d.num+' — '+S.cfg.co)}&body=${enc(body)}`;toast('Pense à joindre le PDF téléchargé')}

/* ---------- Liste : recherche & filtres ---------- */
function lflt(){const q=($('#lq')?.value||'').toLowerCase(),f=$('#lf')?.value||'';let n2=0,s=0;document.querySelectorAll('#lst .r').forEach(r=>{const ok=(!q||r.dataset.s.includes(q))&&(!f||r.dataset.f===f);r.style.display=ok?'':'none';if(ok){n2++;s+=Number(r.dataset.t)}});const e=$('#lsum');if(e)e.textContent=n2+' document(s) · '+E(s)}
function list(){const t=V.v,L=S.docs.filter(d=>d.t===t),st=d=>d.t==='d'?(d.st==='fac'?'fac':d.st==='ok'?'ok':'att'):d.paid?'paid':d.ap?'ap':'due';
const opts=t==='d'?[['att','En attente'],['ok','Acceptés'],['fac','Facturés']]:[['due','À encaisser'],['ap','Acompte reçu'],['paid','Payées']];
return `<div class="flt"><input id="lq" type="search" placeholder="Rechercher (n°, client, objet)…" oninput="lflt()"><select id="lf" onchange="lflt()"><option value="">Tous</option>${opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><p class="mu" id="lsum" style="margin:0 4px 10px;font-size:12px">${L.length} document(s) · ${E(L.reduce((s,d)=>s+tot(d).t,0))}</p><div id="lst">${L.length?L.map(d=>`<button class="r" data-s="${esc((d.num+' '+(d.cn||'')+' '+(d.o||'')+' '+fd(d.date)).toLowerCase())}" data-f="${st(d)}" data-t="${tot(d).t}" onclick="go('e','${d.id}')"><div><b>${esc(d.num)}</b><br><small class="mu">${esc(d.cn||'Sans client')} · ${fd(d.date)}${d.o?' · '+esc(d.o.slice(0,40)):''}</small></div><div style="text-align:right"><b>${E(tot(d).t)}</b><br>${bdg(d)}</div></button>`).join(''):`<p class="mu">Aucun ${t==='d'?'devis':'facture'} pour l'instant. Appuie sur « Ajouter » pour en créer.</p>`}</div>`}

/* ---------- Lignes depuis Mes tarifs ---------- */
function addCat(k,i){if(i==='')return;const c=S.cat[Number(i)],d=cur();if(!c)return;const L=d[k],query=$('#tariff-search-'+k)?.value||'',roomId=k==='M'&&d.roomMode?($('#tariff-room-M')?.value||roomsFor(d)[0]?.id||''):'';if(L.length===1&&!L[0].d&&!n(L[0].p))L.length=0;L.push({d:c.d,q:1,u:c.u||(k==='M'?'h':'u'),p:c.p,...(roomId?{rid:roomId}:{})});save('docs');render();const search=$('#tariff-search-'+k);if(search){search.value=query;tariffFilter(k,query);search.focus()}const room=$('#tariff-room-M');if(room&&roomId)room.value=roomId}
function tariffOptions(k,q=''){const query=(q||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),items=S.cat.map((c,i)=>({c,i})).filter(({c})=>c&&((c.t||'F')===k||!c.t)).filter(({c})=>!query||[c.d,c.ref,c.fo].some(v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)));return items.length?items.map(({c,i})=>`<button class="tariff-option" type="button" onclick="addCat('${k}',${i})"><span>${esc(c.d)}${c.ref?' · '+esc(c.ref):''}</span><b>${E(n(c.p))}</b></button>`).join(''):'<p class="tariff-empty">Aucun tarif trouvé. Enregistre une ligne avec le bouton ＋.</p>'}
function tariffFilter(k,q){const root=$('#tariff-results-'+k);if(root)root.innerHTML=tariffOptions(k,q)}
const catSel=k=>{const d=k==='M'&&V.v==='e'?cur():null,rooms=d&&d.roomMode?roomsFor(d):[];return `<div class="tariff-picker"><label>Ajouter un élément préenregistré<input id="tariff-search-${k}" type="search" placeholder="Rechercher désignation, référence ou fournisseur…" oninput="tariffFilter('${k}',this.value)" autocomplete="off"></label>${rooms.length?`<label>Ajouter la main-d’œuvre à la pièce<select id="tariff-room-M">${rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>`:''}<div class="tariff-options" id="tariff-results-${k}">${tariffOptions(k)}</div>${S.cat.some(c=>c&&((c.t||'F')===k||!c.t))?'':'<small class="tariff-empty">Aucun élément enregistré dans cette catégorie pour le moment.</small>'}</div>`};

/* ---------- Analyse locale d'une liste (sans IA) ---------- */
const MKW=/main[- ]d['’]?oe?uvre|pose|d[ée]pose|installation|raccordement|d[ée]placement|heure|forfait|intervention|mise en service|remplacement|d[ée]montage|montage|purge|r[ée]glage|nettoyage|essai|contr[ôo]le|diagnostic|recherche/i;
function parseList(txt){const F=[],M=[],num='(\\d+(?:[.,]\\d+)?)',rx=[
[new RegExp('^(.+?)\\s*[;|\\t]\\s*'+num+'\\s*[;|\\t]\\s*'+num+'\\s*€?\\s*(?:HT|TTC)?$','i'),(m)=>[m[1],m[2],m[3]]],
[new RegExp('^'+num+'\\s*(?:x|×|\\*)\\s*(.+?)\\s*(?:[:=@-]|à)?\\s*'+num+'\\s*€(?:\\s*(?:/u|l\'?unit[ée]|pi[èe]ce|HT|TTC))?$','i'),(m)=>[m[2],m[1],m[3]]],
[new RegExp('^(.+?)\\s+'+num+'\\s*(?:x|×|\\*)\\s*'+num+'\\s*€?(?:\\s*(?:HT|TTC))?$','i'),(m)=>[m[1],m[2],m[3]]],
[new RegExp('^(.+?)\\s+'+num+'\\s*(h|heures?|u|unit[ée]s?|pcs?|pi[èe]ces?|ml|m2|m²|m|kg|l)\\s+'+num+'\\s*€?(?:\\s*(?:HT|TTC))?$','i'),(m)=>[m[1]+' ('+m[3]+')',m[2],m[4]]],
[new RegExp('^(.+?)\\s*(?:[:=-]|à)?\\s*'+num+'\\s*€(?:\\s*(?:/u|l\'?unit[ée]|pi[èe]ce|HT|TTC))?\\s*$','i'),(m)=>[m[1],1,m[2]]],
[new RegExp('^(.+?)\\s+(?:x|×)?\\s*'+num+'\\s*(?:u|unit[ée]s?|pcs?|pi[èe]ces?|m|ml|m2|m²|h|heures?)?\\s*$','i'),(m)=>[m[1],m[2],'']]];
txt.split(/\r?\n/).map(l=>l.replace(/^[\s\-•*·]*(?:\d{1,2}[.)]\s+)?/,'').trim()).filter(l=>l.length>1&&!/^(d[ée]signation|qt[ée]|quantit[ée]|prix|total|sous[- ]total|montant|tva|ht|ttc)\b/i.test(l)).forEach(l=>{let d=l,q=1,p='';for(const[r,f]of rx){const m=l.match(r);if(m){[d,q,p]=f(m);break}}d=String(d).replace(/[\s:;,-]+$/,'').replace(/\s+[x×*]$/i,'').trim();if(!d)return;const c=S.cat.find(x=>x.d.toLowerCase()===d.toLowerCase());if(c&&!n(p))p=c.p;const line={d,q:n(q)||1,p:p===''?'':n(p)};((c&&c.t)?c.t==='M':MKW.test(d))?M.push(line):F.push(line)});return{F,M}}

/* ---------- Assistant ---------- */
const AIM={pplx:'sonar-pro',openai:'gpt-4o',anthropic:'claude-sonnet-4-5'};
let ATT=[];/* pièces jointes en attente : {f:File,k:'img'|'pdf',u:dataURL|null} */
const SYS=`Tu es l'assistant de ${'${co}'}, artisan plombier-chauffagiste (micro-entreprise, France). Tu réponds en français, de façon brève et concrète.
Quand l'utilisateur t'envoie une liste, un devis (texte, PDF ou photo), un relevé de matériel ou une demande de chiffrage, tu extrais les lignes et tu termines TOUJOURS ta réponse par un bloc de code JSON strictement de cette forme :
\`\`\`json
{"client":{"nom":"","adresse":"","cp_ville":"","tel":""},"objet":"résumé court des travaux","F":[{"d":"désignation fourniture","q":1,"p":0}],"M":[{"d":"désignation main-d'œuvre","q":1,"p":0}]}
\`\`\`
Règles : F = fournitures et matériels, M = main-d'œuvre, déplacements et interventions. q = quantité (nombre), p = prix unitaire HT en euros (nombre, 0 si inconnu). Reprends les prix lus sur le document ; si tu dois estimer, dis-le dans ta réponse. Si le message ne contient rien à chiffrer, réponds simplement sans bloc JSON.`;
const PXM=['Meilleur (automatique)','Sonar','GPT','Claude','Gemini','Grok','Kimi'];
function chatV(){const c=S.cfg,cm=c.cm||'pc',hasKey=!!c.ai.key,hasPx=!!c.px,msgs=S.chat.slice(-60);
return `<div class="c" style="padding:12px 14px"><div style="display:flex;gap:10px;align-items:center"><img src="${LGD}" alt="" style="width:40px;height:40px"><div style="flex:1;min-width:0"><b>Assistant devis</b><br><small class="mu">${hasKey?'IA directe activée ('+(c.ai.model||AIM[c.ai.pv])+')':hasPx?'Relié à Perplexity via '+esc(c.px):'Mode liste rapide (sans clé). Relie Perplexity dans Réglages.'}</small></div><button class="b gh sm" onclick="go('s')"><span>Réglages</span></button></div></div>
<div id="inbx"></div>
<div id="cm" class="cm">${msgs.length?msgs.map((m,i)=>bub(m,S.chat.length-msgs.length+i)).join(''):`<div class="bub a"><b>Bonjour.</b> Envoie-moi une liste de matériel, un ancien devis en PDF ou une photo : j'en fais un nouveau devis vierge prêt à modifier.<br><br>Exemples de listes comprises tout de suite :<br><code>Chauffe-eau 200 L ; 1 ; 420</code><br><code>2 x Robinet thermostatique 45 €</code><br><code>Pose et raccordement 3h 55€</code></div>`}</div>
<div class="cmp"><div id="atts" class="atts">${ATT.map((a,i)=>`<span class="chip">${a.k==='pdf'?'📄':'🖼️'} ${esc(a.f.name.slice(0,22))}<button onclick="ATT.splice(${i},1);render()" aria-label="Retirer">×</button></span>`).join('')}</div>
<textarea id="cin" rows="2" placeholder="Écris ta demande ou colle une liste…" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey))chatSend()"></textarea>
<div class="crow"><label class="b gh sm" title="Photo ou PDF"><span>📎 Joindre</span><input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="attAdd(this.files)"></label><label class="b gh sm" title="Prendre une photo"><span>📷 Photo</span><input type="file" accept="image/*" capture="environment" style="display:none" onchange="attAdd(this.files)"></label>
<button class="b sm" onclick="chatSend()"><span>${hasKey?'Envoyer':'Créer le devis'}</span></button></div>
<div class="seg" role="tablist"><button class="${cm==='pc'?'on':''}" onclick="cs('cm','pc');render()">Computer</button><button class="${cm==='px'?'on':''}" onclick="cs('cm','px');render()">Perplexity (chat normal)</button></div>
${cm==='px'?`<label style="margin:8px 0 0">Modèle à choisir dans Perplexity<select onchange="cs('pm',this.value)">${PXM.map(m=>`<option ${c.pm===m?'selected':''}>${m}</option>`).join('')}</select></label>`:''}
<div class="crow"><button class="b cu sm" onclick="${cm==='px'?'pxOpen()':'pxSend()'}"><span>${cm==='px'?'Ouvrir dans Perplexity':'Envoyer à Computer'+(hasPx?'':' (à relier)')}</span></button><button class="b gh sm" onclick="chatClear(this)" data-t="Vider la conversation"><span>Vider</span></button></div>
<p class="mu" style="font-size:12px;margin:6px 2px 0">${cm==='px'?'Sans crédits Computer : ta demande s\'ouvre dans le chat Perplexity normal avec les consignes ; choisis le modèle indiqué dans son sélecteur, puis colle sa réponse ici et appuie sur « Créer le devis ».':'Computer travaille seul (e-mail) : il lit tes listes, photos et PDF, cherche les prix et dépose le devis prêt dans « Reçus de Perplexity ».'}</p></div>`}
function bub(m,i){const q=m.q,at=(m.att||[]).map(a=>`<span class="chip s">${a.k==='pdf'?'📄':'🖼️'} ${esc(a.n)}</span>`).join('');
return `<div class="bub ${m.r}">${at?`<div class="atts">${at}</div>`:''}${esc(m.t).replace(/\n/g,'<br>')}${q?qCard(q,i):''}<small>${m.ts?new Date(m.ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</small></div>`}
function qCard(q,i){const F=q.F||[],M=q.M||[],tot2=[...F,...M].reduce((s,l)=>s+n(l.q)*n(l.p),0),open=S.docs.filter(d=>d.t==='d'&&d.st!=='fac');
return `<div class="qc"><b>${F.length+M.length} ligne(s) extraite(s)</b>${q.client&&q.client.nom?` · ${esc(q.client.nom)}`:''}${q.objet?`<br><small class="mu">${esc(q.objet)}</small>`:''}<div class="ql">${[...F.map(l=>['F',l]),...M.map(l=>['M',l])].slice(0,12).map(([k,l])=>`<div><span class="bd ${k==='M'?'cu':''}">${k}</span> ${esc(l.d)} <span class="mu">× ${esc(l.q)}</span><b>${n(l.p)?E(n(l.q)*n(l.p)):'—'}</b></div>`).join('')}${F.length+M.length>12?`<div class="mu">… et ${F.length+M.length-12} autres</div>`:''}</div><div class="tr"><span>Total estimé HT</span><b>${E(tot2)}</b></div>
<div class="g2"><button class="b sm" onclick="qNew(${i},'d')"><span>Nouveau devis</span></button><button class="b cu sm" onclick="qNew(${i},'f')"><span>Nouvelle facture</span></button></div>
<div class="g2" style="margin-top:6px"><select onchange="if(this.value){qInto(${i},this.value);this.value=''}"><option value="">Ajouter à un devis existant…</option>${open.map(d=>`<option value="${d.id}">${esc(d.num)} ${esc(d.cn||'')}</option>`).join('')}</select><button class="b gh sm" onclick="qCat(${i})"><span>Ajouter à mes tarifs</span></button></div></div>`}
function chatPush(m){m.ts=Date.now();S.chat.push(m);if(S.chat.length>200)S.chat=S.chat.slice(-200);save('chat')}
function chatClear(b){arm2(b,()=>{const t=typeof TH==='function'?TH():null;if(t){t.msgs=[];t.ti='';t.up=Date.now();S.chat=t.msgs;if(typeof thSave==='function')thSave()}else{S.chat=[];save('chat')}render()})}
function chatAfter(){const e=$('#cm');if(e)e.scrollTop=e.scrollHeight;inbxRender()}
function attAdd(fs){[...fs].forEach(f=>{const k=f.type==='application/pdf'||/\.pdf$/i.test(f.name)?'pdf':f.type.startsWith('image/')?'img':null;if(!k)return toast('Format non pris en charge : '+f.name);ATT.push({f,k})});render()}
function imgData(f,max=1600){return new Promise(ok=>{const im=new Image(),u=URL.createObjectURL(f);im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.85))};im.onerror=()=>ok(null);im.src=u})}
async function pdfRead(f){if(!window.pdfjsLib)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s)});pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const doc=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise,out={text:'',imgs:[]},N=Math.min(doc.numPages,6);
for(let i=1;i<=N;i++){const pg=await doc.getPage(i),tc=await pg.getTextContent();let last=null,s='';tc.items.forEach(it=>{if(last!==null&&Math.abs(it.transform[5]-last)>2)s+='\n';else if(s&&!s.endsWith(' '))s+=' ';s+=it.str;last=it.transform[5]});out.text+=s+'\n';
if(s.replace(/\s/g,'').length<40){const vp=pg.getViewport({scale:1.6}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;out.imgs.push(c.toDataURL('image/jpeg',.82))}}return out}
async function prepAtt(){const imgs=[],texts=[],names=[];for(const a of ATT){names.push({n:a.f.name,k:a.k});if(a.k==='img'){const u=await imgData(a.f);if(u)imgs.push(u)}else{try{const r=await pdfRead(a.f);if(r.text.trim())texts.push('--- Contenu du PDF '+a.f.name+' ---\n'+r.text.trim());imgs.push(...r.imgs)}catch(e){toast('PDF illisible : '+a.f.name)}}}return{imgs,texts,names}}
async function chatSend(){const ta=$('#cin'),txt=(ta?ta.value:'').trim();if(!txt&&!ATT.length)return toast('Écris un message ou joins un fichier');const c=S.cfg;toast(ATT.length?'Lecture des fichiers…':'Un instant…');
const{imgs,texts,names}=await prepAtt();chatPush({r:'u',t:txt||'(fichier joint)',att:names});ATT=[];render();
try{if(c.ai.key){const rep=await aiCall(txt,texts,imgs);chatPush({r:'a',t:rep.text,q:rep.q})}else{const pa=parseAI(txt);if(pa.q){chatPush({r:'a',t:'Réponse Perplexity reconnue : '+(pa.q.F.length+pa.q.M.length)+' ligne(s). Vérifie les prix puis crée le devis, la facture ou ajoute aux tarifs.',q:pa.q});return render()}const src=[txt,...texts].join('\n');const q=parseList(src),nl=q.F.length+q.M.length;
if(nl)chatPush({r:'a',t:`J'ai reconnu ${nl} ligne(s) dans ta liste. Vérifie les prix puis crée le devis ou la facture.${imgs.length?' Les photos et PDF scannés ne peuvent être lus qu\'avec l\'IA directe (clé API) ou en envoyant à Perplexity.':''}`,q});
else chatPush({r:'a',t:imgs.length?'Je ne peux pas lire une photo ou un PDF scanné sans IA. Utilise « Envoyer à Perplexity » (sans clé) ou ajoute une clé API dans Réglages pour une lecture instantanée.':'Je n\'ai pas trouvé de lignes chiffrables. Écris une ligne par article : désignation ; quantité ; prix. Ou utilise « Envoyer à Perplexity » pour une vraie conversation.'})}}
catch(e){chatPush({r:'a',t:'Erreur : '+(e.message||e)+'. Vérifie la clé API et le modèle dans Réglages.'})}render()}
function parseAI(s){let q=null,t=s;const m=s.match(/```json\s*([\s\S]*?)```/i)||s.match(/(\{[\s\S]*"F"[\s\S]*\})/);if(m){try{q=JSON.parse(m[1]);t=s.replace(m[0],'').trim()}catch(e){}}if(q&&Array.isArray(q.items)&&!q.F&&!q.M){q.F=q.items.filter(x=>x.t!=='M').map(x=>({d:x.d,q:1,p:x.p||(n(x.pa)?Math.round(n(x.pa)*(1+(n(x.mg)||35)/100)*100)/100:'')}));q.M=q.items.filter(x=>x.t==='M').map(x=>({d:x.d,q:1,p:x.p}))}if(q){q.F=(q.F||[]).map(l=>({d:String(l.d||''),q:n(l.q)||1,p:n(l.p)}));q.M=(q.M||[]).map(l=>({d:String(l.d||''),q:n(l.q)||1,p:n(l.p)}));if(!q.F.length&&!q.M.length)q=null}return{text:t||(q?'Voici les lignes extraites.':''),q}}
async function aiCall(txt,texts,imgs){const c=S.cfg.ai,model=c.model||AIM[c.pv],sys=SYS.replace('${co}',S.cfg.co),hist=S.chat.slice(-8,-1).filter(m=>m.t).map(m=>({role:m.r==='u'?'user':'assistant',content:m.t.slice(0,2000)})),user=[txt,...texts].filter(Boolean).join('\n\n')||'Analyse les documents joints et extrais les lignes.';let out='';
if(c.pv==='anthropic'){const content=[...imgs.map(u=>({type:'image',source:{type:'base64',media_type:'image/jpeg',data:u.split(',')[1]}})),{type:'text',text:user}];const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':c.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model,max_tokens:2500,system:sys,messages:[...hist,{role:'user',content}]})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||r.status);out=(j.content||[]).map(x=>x.text||'').join('')}
else{const url=c.pv==='openai'?'https://api.openai.com/v1/chat/completions':'https://api.perplexity.ai/chat/completions';const content=imgs.length?[{type:'text',text:user},...imgs.map(u=>({type:'image_url',image_url:{url:u}}))]:user;const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+c.key},body:JSON.stringify({model,messages:[{role:'system',content:sys},...hist,{role:'user',content}]})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||j.error?.type||r.status);out=j.choices?.[0]?.message?.content||''}
return parseAI(out)}
async function aiTest(b){if(!S.cfg.ai.key)return toast('Colle une clé API d\'abord');b.disabled=true;b.textContent='Test…';try{const r=await aiCall('Réponds uniquement : OK',[],[]);toast('Connexion réussie : '+r.text.slice(0,40))}catch(e){toast('Échec : '+(e.message||e))}b.disabled=false;b.innerHTML='<span>Tester la connexion</span>'}
function qApply(d,q){const cl=q.client||{};if(cl.nom&&!d.cn)Object.assign(d,{cn:cl.nom||'',ca:cl.adresse||'',cc:cl.cp_ville||'',ct:cl.tel||'',ce:cl.email||cl.mail||''});if(d.cn&&typeof cliCommit==='function')cliCommit(1,d);if(q.objet&&!d.o)d.o=q.objet;for(const k of ['F','M']){const L=d[k];if(L.length===1&&!L[0].d&&!n(L[0].p))L.length=0;(q[k]||[]).forEach(l=>L.push({d:l.d,q:l.q,p:l.p||''}))}if(!d.F.length)d.F.push({d:'',q:1,p:''});if(!d.M.length)d.M.push({d:'',q:1,p:''})}
function qNew(i,t){const q=S.chat[i]?.q;if(!q)return;const y=new Date().getFullYear(),k=t+y,s=S.seq[k]=(S.seq[k]||0)+1,d={id:nw(),t,num:(t==='d'?'DEV-':'FAC-')+y+'-'+String(s).padStart(3,'0'),date:td(),val:S.cfg.val,cn:'',ca:'',cc:'',ct:'',ce:'',cid:'',sn:'',sa:'',sc:'',o:'',F:[],M:[],acc:S.cfg.acc,ap:false,paid:false,pd:'',cost:'',st:'att',tva:S.cfg.tva?n(S.cfg.tvr):0,rm:''};qApply(d,q);S.docs.unshift(d);save('docs');save('seq');go('e',d.id);toast((t==='d'?'Devis ':'Facture ')+d.num+' créé(e) : vérifie les prix')}
function qInto(i,id){const q=S.chat[i]?.q,d=S.docs.find(x=>x.id===id);if(!q||!d)return;qApply(d,q);save('docs');go('e',d.id);toast('Lignes ajoutées à '+d.num)}
function qCat(i){const q=S.chat[i]?.q;if(!q)return;let k=0;for(const t of ['F','M'])(q[t]||[]).forEach(l=>{if(!l.d)return;const c=S.cat.find(x=>x.d.toLowerCase()===l.d.toLowerCase());if(c){if(n(l.p))c.p=l.p}else{S.cat.push({d:l.d,t,p:l.p||''});k++}});save('cat');toast(k+' tarif(s) ajouté(s)')}

/* ---------- Ouvrir dans le chat Perplexity normal (sans crédits Computer) ---------- */
const PXQ=`Tu es l'assistant devis d'un artisan plombier-chauffagiste français (${'${co}'}). Réponds en français. Analyse ma demande et les pièces jointes (liste, ancien devis, photo). Termine TOUJOURS ta réponse par un bloc de code JSON strictement de cette forme (prix unitaires HT en euros, nombres sans symbole) :
\`\`\`json
{"client":{"nom":"","adresse":"","cp_ville":"","tel":""},"objet":"","F":[{"d":"désignation fourniture","q":1,"p":0}],"M":[{"d":"main-d'œuvre ou déplacement","q":1,"p":0}],"note":"prix estimés à vérifier"}
\`\`\`
F = fournitures, M = main-d'œuvre. Si je demande une recherche de prix ou un tarif fournisseur, donne le tableau article | fournisseur | prix HT | lien, indique où ce fournisseur se fournit (fabricant, usine, importateur) et si l'achat direct est possible, puis termine par {"items":[{"d":"","t":"F","pa":0,"mg":35,"ref":"","fo":"fournisseur"}]} dans le bloc JSON. Si j'estime des prix, vise le marché français 2026 et signale-le dans "note".

Ma demande :
`;
async function pxOpen(){const c=S.cfg,txt=($('#cin')?.value||'').trim();if(!txt&&!ATT.length)return toast('Écris ta demande d\'abord');toast(ATT.length?'Lecture des fichiers…':'Ouverture…');
const{texts,names}=await prepAtt();const prompt=PXQ.replace('${co}',c.co)+(txt||'Analyse les documents joints.')+(texts.length?'\n\n'+texts.join('\n\n'):'');
chatPush({r:'u',t:txt||'(fichier joint)',att:names});chatPush({r:'a',t:'Demande ouverte dans Perplexity'+(c.pm&&!/^Meilleur/.test(c.pm)?' (modèle conseillé : '+c.pm+')':'')+'. Quand la réponse est prête, copie-la entièrement (avec le bloc json) et colle-la ici, puis « Créer le devis ».'+(names.some(a=>a.k==='img')?' Les photos : ajoute-les dans Perplexity avec le trombone (elles ne passent pas par le lien).':'')});
const files=ATT.filter(a=>a.k==='img').map(a=>a.f);ATT=[];render();
try{await navigator.clipboard.writeText(prompt)}catch(e){}
if(files.length&&navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files,title:'Devis',text:prompt.slice(0,1800)});toast('Choisis Perplexity dans le partage');return}catch(e){if(e&&e.name==='AbortError')return}}
window.open('https://www.perplexity.ai/search?q='+enc(prompt.slice(0,6000)),'_blank');toast((c.pm&&!/^Meilleur/.test(c.pm)?'Choisis '+c.pm+' dans Perplexity · ':'')+'consignes copiées aussi')}

/* ---------- Envoi à Perplexity (sans clé) : e-mail + pièces jointes ---------- */
async function pxSend(){const c=S.cfg,txt=($('#cin')?.value||'').trim();if(!c.px){toast('Renseigne l\'adresse Gmail reliée à Perplexity dans Réglages');return go('s')}if(!txt&&!ATT.length)return toast('Écris ta demande d\'abord');
const title=txt.split('\n')[0].slice(0,60)||'Pièce jointe à chiffrer',body=`[DEVIS]\n${txt}\n\n--\nEnvoyé depuis l'appli ${c.co} (v${APPV}). Réponse attendue dans l'appli, onglet Assistant.`;
chatPush({r:'u',t:txt||'(fichier joint)',att:ATT.map(a=>({n:a.f.name,k:a.k}))});chatPush({r:'a',t:'Demande transmise à Perplexity par e-mail. Le devis préparé (ou la mise à jour de l\'appli) apparaîtra ici dans « Reçus de Perplexity » dès qu\'il sera déposé sur ton site.'});
const files=ATT.map(a=>a.f);ATT=[];render();
if(files.length&&navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files,title:'[DEVIS] '+title,text:body});toast('Choisis Gmail et envoie à '+c.px);return}catch(e){if(e&&e.name==='AbortError')return}}
if(files.length)toast('Pense à joindre les fichiers dans ton application e-mail');location.href=`mailto:${enc(c.px)}?subject=${enc('[DEVIS] '+title)}&body=${enc(body)}`}

/* ---------- Boîte de réception du site (devis préparés par Perplexity) ---------- */
let INB=null;
async function inbxLoad(){try{const r=await fetch('inbox/index.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return INB=[];const j=await r.json();INB=Array.isArray(j.items)?j.items:Array.isArray(j)?j:[]}catch(e){INB=INB||[]}}
function inbxNew(){return (INB||[]).filter(x=>x&&x.id&&!S.cfg.inb.includes(x.id))}
function inbxRender(){const e=$('#inbx');if(!e)return;const L=inbxNew();e.innerHTML=L.length?`<div class="c" style="border:2px solid var(--cu)"><h3>Reçus de Perplexity (${L.length})</h3><p class="mu" style="font-size:12px;margin:0 0 8px">Devis, tarifs ou planning préparés à partir de tes e-mails.</p>${L.map(x=>`<div class="r" style="display:flex"><div><b>${x.type==='cat'?'🏷️ ':x.type==='plan'?'📅 ':'📄 '}${esc(x.title||(x.type==='cat'?'Tarifs préparés':x.type==='plan'?'Planning préparé':'Devis préparé'))}</b><br><small class="mu">${esc(x.date||'')}${x.note?' · '+esc(x.note):''}</small></div><div style="display:flex;gap:6px"><button class="b sm" onclick="inbxImp('${esc(x.id)}')"><span>Importer</span></button><button class="b gh sm" onclick="inbxSkip('${esc(x.id)}')"><span>Ignorer</span></button></div></div>`).join('')}</div>`:''}
async function inbxImp(id){const x=(INB||[]).find(y=>y.id===id);if(!x)return;try{const r=await fetch(x.file||('inbox/'+id+'.json'),{cache:'no-store'});const q=await decJSON(await r.json());S.cfg.inb.push(id);save('cfg');if(q.title&&!x.title)x.title=q.title;
if(q.type==='cat'){const k=catMerge(q.items||[]);chatPush({r:'a',t:`Tarifs reçus de Perplexity : ${(q.items||[]).length} article(s) (${k} nouveaux) ajoutés dans « Mes tarifs »${q.note?'. '+q.note:''}.`});toast(k+' tarif(s) ajouté(s)');go('p');return}
if(q.type==='plan'){(q.items||[]).forEach(e=>S.plan.push({id:nw(),date:e.date||td(),hs:e.hs||'',he:e.he||'',cn:e.cn||'',sa:e.sa||'',o:e.o||'',nt:e.nt||'',st:'p'}));save('plan');chatPush({r:'a',t:`Planning reçu de Perplexity : ${(q.items||[]).length} intervention(s) ajoutée(s).`});go('g');return}
if(q.type==='info'){chatPush({r:'a',t:q.text||x.title||''});render();return}
chatPush({r:'a',t:(q.note?q.note+'\n':'')+'Devis préparé par Perplexity : '+(x.title||id),q});const i=S.chat.length-1;qNew(i,q.type==='f'?'f':'d')}catch(e){toast('Import impossible : '+(e.message||e))}}
function inbxSkip(id){S.cfg.inb.push(id);save('cfg');inbxRender();homeInbx()}
function homeInbx(){const L=inbxNew(),e=$('#hinb');if(e)e.innerHTML=L.length?`<button class="r" style="border:2px solid var(--cu)" onclick="go('a')"><div><b>${L.length} élément(s) reçu(s) de Perplexity</b><br><small class="mu">Appuie pour les importer</small></div><span class="cu">›</span></button>`:''}

/* ---------- PWA ---------- */
function pwa(){if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{})}


/* ---------- Précodes (sans API) : import de tarifs fournisseur ---------- */
function catMerge(items,fo0){let k=0;(items||[]).forEach(l=>{if(!l.d)return;const pa=n(l.pa),mg=l.mg!=null&&l.mg!==''?n(l.mg):S.cfg.mg,p=n(l.p)||(pa?Math.round(pa*(1+mg/100)*100)/100:''),fo=l.fo||fo0||'';const c=S.cat.find(x=>x.d.toLowerCase()===String(l.d).toLowerCase()&&(!l.ref||!x.ref||x.ref===l.ref));if(c)Object.assign(c,{pa:pa||c.pa,mg,p:p||c.p,ref:l.ref||c.ref,fo:fo||c.fo});else{S.cat.push({d:String(l.d).slice(0,160),t:l.t==='M'?'M':'F',p,pa:pa||'',mg,ref:l.ref||'',fo});k++}});save('cat');return k}
const PRX=/(\d{1,3}(?:[ \u00a0.]\d{3})+|\d+)[,.](\d{2})(?=\s*(?:€|EUR|euros?)?)/g;
function prxAll(t){const out=[];let m;PRX.lastIndex=0;while((m=PRX.exec(t))){const v=parseFloat(m[1].replace(/[ \u00a0.]/g,'')+'.'+m[2]);if(v>0&&v<100000){const after=t.slice(m.index+m[0].length,m.index+m[0].length+12);out.push({v,i:m.index,ht:/HT/i.test(after),ttc:/TTC/i.test(after)})}}return out}
function prxPick(t){const P=prxAll(t);if(!P.length)return null;const ht=P.find(x=>x.ht);if(ht)return ht.v;const nt=P.filter(x=>!x.ttc);return (nt.length?nt:P).reduce((a,b)=>b.v<a.v?b:a).v}
function catParseText(txt){const items=[];txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach(l=>{if(/^(désignation|designation|article|libell|référence|reference|prix)/i.test(l))return;const cols=l.split(/\t|;|\|/).map(x=>x.trim()).filter(Boolean),pa=prxPick(l);if(pa==null)return;let d='',ref='';if(cols.length>=2){const txtCols=cols.filter(c=>!prxAll(c).length);d=txtCols.filter(c=>!/^\d+$/.test(c)).sort((a,b)=>b.length-a.length)[0]||'';const r=txtCols.find(c=>c!==d&&/^(?=[A-Z0-9\-\/.]*\d)[A-Z0-9][A-Z0-9\-\/.]{3,}$/i.test(c));if(r)ref=r}else{d=l.replace(PRX,'').replace(/€|EUR|HT|TTC|prix|unité|\/u\b/gi,' ');const r=d.match(/\b(?:réf\.?|ref\.?|code(?:\s+article)?|article)\s*:?\s*((?=[A-Z0-9\-\/.]*\d)[A-Z0-9][A-Z0-9\-\/.]{3,})/i)||d.match(/\b([A-Z]{1,4}[0-9][A-Z0-9\-\/.]{4,})\b/);if(r){ref=r[1];d=d.replace(r[0],' ')}d=d.replace(/\s{2,}/g,' ').replace(/^[\s\-–:·,]+|[\s\-–:·,]+$/g,'')}if(d.length>=3)items.push({d,ref,pa,t:'F'})});return items}
let CPASTE=false;
function catPasteV(){return `<div class="c" style="border:2px solid var(--cu)"><h3>Coller un tarif fournisseur</h3><p class="mu" style="font-size:12px;margin:0 0 8px">Sur le site du fournisseur (connecté à ton compte pro), sélectionne les articles avec leurs prix, copie, puis colle ici. Une ligne = un article ; les colonnes tabulées (Excel, CSV) sont comprises. Le prix HT est retenu quand il est indiqué ; sinon le plus bas de la ligne.</p><label>Fournisseur<input id="cpf" placeholder="Sider, Cedeo, Téréva…"></label><textarea id="cpt" rows="7" placeholder="Raccord laiton 15/21 M/F  réf 12345  1,62 € HT&#10;Tube multicouche 16  29,22 € TTC …"></textarea><div class="g2" style="margin-top:8px"><button class="b sm" onclick="catPasteGo()"><span>Analyser et ajouter</span></button><button class="b gh sm" onclick="CPASTE=false;render()"><span>Annuler</span></button></div></div>`}
function catPasteGo(){const t=$('#cpt')?.value||'',fo=($('#cpf')?.value||'').trim();const items=catParseText(t);if(!items.length)return toast('Aucune ligne avec un prix reconnue');const k=catMerge(items,fo);CPASTE=false;render();toast(`${items.length} article(s) lus · ${k} nouveaux · marge ${S.cfg.mg} % appliquée`)}
function impHash(){const h=location.hash||'';if(!h.startsWith('#imp='))return;try{const j=JSON.parse(decodeURIComponent(escape(atob(h.slice(5).replace(/-/g,'+').replace(/_/g,'/')))));history.replaceState(null,'',location.pathname+location.search);const items=(j.items||[]).map(x=>({d:x.d,ref:x.ref||'',pa:n(x.pa),t:'F'})).filter(x=>x.d&&x.pa);if(!items.length)return toast('Rien à importer');const k=catMerge(items,j.fo||'');chatPush({r:'a',t:`Précode fournisseur : ${items.length} article(s) relevés sur ${j.fo||'le site'} (${k} nouveaux) ajoutés dans « Mes tarifs » avec la marge de ${S.cfg.mg} %.`});go('p');toast(`${items.length} article(s) importés depuis ${j.fo||'le fournisseur'}`)}catch(e){toast('Import impossible : lien abîmé')}}
function appURL(){return location.origin+location.pathname}
function bookmarklet(){const APP=appURL();return `javascript:(function(){var R=/(\\d{1,3}(?:[ \\u00a0.]\\d{3})+|\\d+)[,.](\\d{2})\\s*(?:\\u20ac|EUR)/g,seen={},items=[],T=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),nd;while((nd=T.nextNode())&&items.length<200){var tx=nd.nodeValue;if(!/\\u20ac|EUR/.test(tx))continue;R.lastIndex=0;var m=R.exec(tx);if(!m)continue;var el=nd.parentElement,c=el,i=0;while(c&&c!==document.body&&i<7){var s=(c.innerText||'').trim();if(s.length>40&&(c.querySelector('a,h1,h2,h3,h4,h5,[class*=title],[class*=name],[class*=libel],[class*=design]'))&&s.length<900)break;c=c.parentElement;i++}if(!c||c===document.body)c=el;var full=(c.innerText||'').trim(),lines=full.split(/\\n+/).map(function(x){return x.trim()}).filter(Boolean),d='',ref='';for(var k=0;k<lines.length;k++){var L=lines[k];if(/\\u20ac|EUR/.test(L)||L.length<4||/^(ajouter|panier|stock|quantit|dispo|prix|unit|tva|ht$|ttc$)/i.test(L))continue;if(!d&&L.length>=6){d=L;continue}var r=L.match(/(?:r\\u00e9f\\.?|ref\\.?|code(?:\\s+article)?|article)\\s*:?\\s*((?=[A-Z0-9\\-\\/.]*\\d)[A-Z0-9][A-Z0-9\\-\\/.]{3,})/i)||L.match(/^((?=[A-Z0-9\\-\\/.]*\\d)[A-Z0-9][A-Z0-9\\-\\/.]{4,})$/);if(r&&!ref)ref=r[1]}if(!d)continue;var P=[],mm;R.lastIndex=0;while((mm=R.exec(full))){var v=parseFloat(mm[1].replace(/[ \\u00a0.]/g,'')+'.'+mm[2]),aft=full.substr(mm.index+mm[0].length,8);P.push({v:v,ht:/HT/i.test(aft),ttc:/TTC/i.test(aft)})}if(!P.length)continue;var pa=(P.filter(function(x){return x.ht})[0]||P.filter(function(x){return !x.ttc}).sort(function(a,b){return a.v-b.v})[0]||P[0]).v;var key=(d+'|'+ref).toLowerCase();if(seen[key])continue;seen[key]=1;items.push({d:d.slice(0,140),ref:ref,pa:pa})}if(!items.length){alert('Aucun article avec prix trouv\\u00e9 sur cette page. Ouvre une liste de produits ou une fiche article, puis relance.');return}var fo=location.hostname.replace(/^www\\./,'').split('.')[0];fo=fo.charAt(0).toUpperCase()+fo.slice(1);var j=JSON.stringify({fo:fo,items:items}),b=btoa(unescape(encodeURIComponent(j))).replace(/\\+/g,'-').replace(/\\//g,'_');if(confirm(items.length+' article(s) relev\\u00e9(s) sur '+fo+'. Les envoyer dans Mes tarifs ?'))location.href='${APP}#imp='+b})();`}
function copyBm(b){navigator.clipboard.writeText(bookmarklet()).then(()=>toast('Précode copié : colle-le comme adresse d’un favori'),()=>{const ta=$('#bmt');ta.style.display='block';ta.select();toast('Copie manuelle : sélectionne le texte ci-dessous')})}
function precV(){return `<div class="c"><h3>Précodes (sans clé, sans API)</h3><p class="mu" style="margin:0 0 8px;font-size:13px">Des petits programmes prêts à l'emploi qui font le travail à ta place, depuis ton téléphone, avec <b>ta</b> session déjà connectée chez le fournisseur : aucun mot de passe ne sort de l'appareil.</p>
<b>1 · Relevé de prix fournisseur (favori magique)</b><p class="mu" style="font-size:12px;margin:4px 0 8px">Sur Safari : ajoute n'importe quelle page aux favoris, puis Favoris → Modifier → remplace l'adresse par le précode copié ci-dessous et nomme-le « → Mes tarifs ». Ensuite, sur sider.biz, cedeo.fr ou tout autre site, une fois connecté et sur une liste d'articles, ouvre ce favori : les désignations, références et prix HT sont relevés et arrivent ici dans « Mes tarifs », avec la marge de ${S.cfg.mg} %.</p><div class="g2"><button class="b sm" onclick="copyBm(this)"><span>Copier le précode</span></button><button class="b gh sm" onclick="const t=$('#bmt');t.style.display=t.style.display==='none'?'block':'none'"><span>Voir le code</span></button></div><textarea id="bmt" readonly rows="4" style="display:none;margin-top:8px;font-size:11px">${esc(bookmarklet())}</textarea>
<b style="display:block;margin-top:14px">2 · Coller un tarif</b><p class="mu" style="font-size:12px;margin:4px 0 8px">Copie des lignes de prix depuis n'importe où (site, PDF, Excel, e-mail) et colle-les dans « Mes tarifs » → « Coller un tarif fournisseur ».</p><button class="b gh sm" onclick="CPASTE=true;go('p')"><span>Ouvrir</span></button>
<b style="display:block;margin-top:14px">3 · Perplexity sans crédits</b><p class="mu" style="font-size:12px;margin:4px 0 0">Dans l'Assistant, « Ouvrir dans Perplexity » prépare la demande pour le chat Perplexity normal ; sa réponse collée ici devient un devis ou une liste de tarifs.</p></div>`}

/* ---------- Mes tarifs : prix d'achat + marge ---------- */
function ct(i,k,v){const c=S.cat[i];c[k]=v;if(k==='pa'||k==='mg'){const pa=n(c.pa),mg=c.mg===''||c.mg==null?S.cfg.mg:n(c.mg);if(pa){c.p=Math.round(pa*(1+mg/100)*100)/100;const e=$('#cp'+i);if(e)e.value=c.p}}save('cat')}
function catAdd(){S.cat.unshift({d:'',t:'F',p:'',pa:'',mg:S.cfg.mg,ref:'',fo:''});save('cat');render();setTimeout(()=>$('#cat0')?.focus(),50)}
function tflt(){const q=($('#tq')?.value||'').toLowerCase(),f=$('#tf')?.value||'';let k=0;document.querySelectorAll('#tl .c[data-s]').forEach(r=>{const ok=(!q||r.dataset.s.includes(q))&&(!f||r.dataset.f===f);r.style.display=ok?'':'none';if(ok)k++});const e=$('#tsum');if(e)e.textContent=k+' article(s)'}
function tarExp(){const rows=[['Désignation','Type','Prix achat HT','Marge %','Prix vente HT','Référence','Fournisseur'],...S.cat.map(c=>[c.d,c.t==='M'?'Main-d\'œuvre':'Fourniture',c.pa??'',c.mg??'',c.p??'',c.ref||'',c.fo||''])];dlBlob(new Blob(['\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'}),'mes-tarifs-'+td()+'.csv')}
function tar(){const L=S.cat;return `<div class="flt"><input id="tq" type="search" placeholder="Rechercher un article, une référence…" oninput="tflt()"><select id="tf" onchange="tflt()"><option value="">Tous</option><option value="F">Fournitures</option><option value="M">Main-d'œuvre</option></select></div>
<div class="g3" style="margin-bottom:10px"><button class="b sm" onclick="catAdd()"><span>＋ Nouvel article</span></button><button class="b cu sm" onclick="CPASTE=!CPASTE;render()"><span>Coller un tarif</span></button><button class="b gh sm" onclick="tarExp()"><span>Exporter (CSV)</span></button></div>${CPASTE?catPasteV():''}
<p class="mu" id="tsum" style="margin:0 4px 10px;font-size:12px">${L.length} article(s) · marge par défaut ${S.cfg.mg} % · le prix de vente se calcule tout seul depuis le prix d'achat</p><div id="tl">${L.map((c,i)=>`<div class="c" data-s="${esc((c.d+' '+(c.ref||'')+' '+(c.fo||'')).toLowerCase())}" data-f="${c.t||'F'}"><input id="cat${i}" placeholder="Désignation" value="${esc(c.d)}" oninput="ct(${i},'d',this.value)"><div class="g2" style="margin-top:8px"><select onchange="ct(${i},'t',this.value)"><option value="F" ${c.t!=='M'?'selected':''}>Fourniture</option><option value="M" ${c.t==='M'?'selected':''}>Main-d'œuvre</option></select><input placeholder="Réf. / fournisseur" value="${esc([c.ref,c.fo].filter(Boolean).join(' · '))}" oninput="ct(${i},'ref',this.value);ct(${i},'fo','')"></div><div class="g3" style="margin-top:8px"><label>Prix d'achat HT<input inputmode="decimal" placeholder="—" value="${esc(c.pa??'')}" oninput="ct(${i},'pa',this.value)"></label><label>Marge %<input inputmode="decimal" value="${esc(c.mg??S.cfg.mg)}" oninput="ct(${i},'mg',this.value)"></label><label>Prix de vente HT<input id="cp${i}" inputmode="decimal" placeholder="Prix €" value="${esc(c.p)}" oninput="ct(${i},'p',this.value)"></label></div>${n(c.pa)?`<small class="mu">Marge : ${E(n(c.p)-n(c.pa))} par unité</small>`:''}<button class="b gh sm" style="margin-top:8px" data-t="Supprimer" onclick="arm2(this,()=>{S.cat.splice(${i},1);save('cat');render()})">Supprimer</button></div>`).join('')||'<p class="mu">Aucun tarif. Ajoute un article, ou envoie-moi tes anciens devis / un site fournisseur via l\'Assistant : je remplis la liste avec prix d\'achat et marge.</p>'}</div>`}

/* ---------- Planning des interventions ---------- */
let PE=null;
function plV(){const today=td(),L=[...S.plan].sort((a,b)=>(a.date+a.hs).localeCompare(b.date+b.hs)),up=L.filter(e=>e.date>=today&&e.st!=='x'),past=L.filter(e=>e.date<today||e.st==='x');
const day=d=>new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
const grp=(A)=>{let last='',h='';A.forEach(e=>{if(e.date!==last){last=e.date;h+=`<h3 class="sec" style="text-transform:capitalize">${day(e.date)}${e.date===today?' · aujourd\'hui':''}</h3>`}h+=`<button class="r" onclick="plEdit('${e.id}')"><div><b>${e.hs?esc(e.hs)+(e.he?'–'+esc(e.he):'')+' · ':''}${esc(e.cn||'Sans client')}</b><br><small class="mu">${esc(e.o||'Intervention')}${e.sa?' · '+esc(e.sa):''}</small></div><span class="bd ${e.st==='x'?'ok':e.st==='c'?'rd':'cu'}">${e.st==='x'?'Fait':e.st==='c'?'Annulé':'Prévu'}</span></button>`});return h};
return `${PE?plForm():`<div class="g2 qa"><button class="b" onclick="plNew()"><span>＋ Nouvelle intervention</span></button><button class="b gh" onclick="icsExp()"><span>Exporter l'agenda (.ics)</span></button></div>`}
${up.length?grp(up):'<p class="mu">Aucune intervention à venir. Ajoute-en une, ou demande à Perplexity de planifier depuis l\'Assistant.</p>'}${past.length?`<details style="margin-top:14px"><summary class="mu">Passées / terminées (${past.length})</summary>${grp(past.reverse())}</details>`:''}`}
function plNew(pre){PE=Object.assign({id:nw(),date:td(),hs:'08:00',he:'',cn:'',sa:'',o:'',nt:'',st:'p',doc:''},pre||{});render()}
function plEdit(id){PE={...S.plan.find(e=>e.id===id)};render()}
function plForm(){const e=PE,I=(l,k,ty='text')=>`<label>${l}<input type="${ty}" value="${esc(e[k])}" oninput="PE.${k}=this.value"></label>`;
return `<div class="c"><h3>${S.plan.some(x=>x.id===e.id)?'Modifier':'Nouvelle'} intervention</h3><div class="g2">${I('Date','date','date')}<div class="g2">${I('Début','hs','time')}${I('Fin','he','time')}</div></div><label>Client enregistré<select onchange="const c=S.clients.find(x=>x.id===this.value);if(c){PE.cn=c.n;PE.sa=[c.a,c.c].filter(Boolean).join(', ');render()}"><option value="">— Choisir —</option>${S.clients.map(c=>`<option value="${c.id}">${esc(c.n)}</option>`).join('')}</select></label>${I('Client','cn')}${I('Adresse du chantier','sa')}${I('Objet / travaux','o')}<label>Notes<textarea rows="2" oninput="PE.nt=this.value">${esc(e.nt)}</textarea></label><label>Statut<select onchange="PE.st=this.value"><option value="p" ${e.st==='p'?'selected':''}>Prévu</option><option value="x" ${e.st==='x'?'selected':''}>Fait</option><option value="c" ${e.st==='c'?'selected':''}>Annulé</option></select></label>
<div class="g2" style="margin-top:8px"><button class="b" onclick="plSave()"><span>Enregistrer</span></button><button class="b gh" onclick="PE=null;render()"><span>Annuler</span></button></div><div class="g2" style="margin-top:6px"><a class="b gh sm" style="text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center" target="_blank" rel="noopener" href="${gcalUrl(e)}"><span>Ouvrir dans Google Agenda</span></a>${S.plan.some(x=>x.id===e.id)?`<button class="b rd sm" data-t="Supprimer" onclick="arm2(this,()=>{S.plan=S.plan.filter(x=>x.id!=='${e.id}');save('plan');PE=null;render()})">Supprimer</button>`:''}</div></div>`}
function plSave(){if(!PE.date)return toast('Choisis une date');const i=S.plan.findIndex(x=>x.id===PE.id);if(i<0)S.plan.push(PE);else S.plan[i]=PE;save('plan');PE=null;render();toast('Intervention enregistrée')}
function plFromDoc(){const d=cur();go('g');plNew({cn:d.cn,sa:[d.sa||d.ca,d.sc||d.cc].filter(Boolean).join(', '),o:(d.o||'').split('\n')[0].slice(0,80)||('Travaux '+d.num),doc:d.id,nt:'Devis '+d.num})}
const dtc=(d,h)=>d.replace(/-/g,'')+'T'+((h||'08:00').replace(':','')+'00');
function gcalUrl(e){const s=dtc(e.date,e.hs||'08:00'),f=dtc(e.date,e.he||(e.hs?String(Math.min(23,Number(e.hs.slice(0,2))+2)).padStart(2,'0')+e.hs.slice(2):'10:00'));return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+enc((e.cn?e.cn+' — ':'')+(e.o||'Intervention'))+'&dates='+s+'/'+f+'&details='+enc((e.nt||'')+'\n'+S.cfg.co)+'&location='+enc(e.sa||'')}
function icsExp(){const u=(d,h)=>dtc(d,h);const ev=S.plan.filter(e=>e.st!=='c').map(e=>`BEGIN:VEVENT\r\nUID:${e.id}@msplomberie\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}Z\r\nDTSTART;TZID=Europe/Paris:${u(e.date,e.hs||'08:00')}\r\nDTEND;TZID=Europe/Paris:${u(e.date,e.he||(e.hs?String(Math.min(23,Number(e.hs.slice(0,2))+2)).padStart(2,'0')+e.hs.slice(2):'10:00'))}\r\nSUMMARY:${(e.cn?e.cn+' — ':'')+(e.o||'Intervention')}\r\nLOCATION:${(e.sa||'').replace(/,/g,'\\,')}\r\nDESCRIPTION:${(e.nt||'').replace(/\n/g,'\\n')}\r\nEND:VEVENT`).join('\r\n');
dlBlob(new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Ms Plomberie//Planning//FR\r\n${ev}\r\nEND:VCALENDAR\r\n`],{type:'text/calendar'}),'planning-'+td()+'.ics');toast('Agenda exporté : ouvre le fichier pour l\'ajouter à ton calendrier')}
function homePlan(){const today=td(),L=S.plan.filter(e=>e.st==='p'&&e.date>=today).sort((a,b)=>(a.date+a.hs).localeCompare(b.date+b.hs)).slice(0,3);return L.length?`<h3 class="sec">Prochaines interventions</h3>${L.map(e=>`<button class="r" onclick="go('g');plEdit('${e.id}')"><div><b>${esc(e.cn||'Sans client')}</b><br><small class="mu">${fd(e.date)}${e.hs?' '+esc(e.hs):''} · ${esc(e.o||'Intervention')}</small></div><span class="mu">›</span></button>`).join('')}`:''}


/* ---------- Importation de documents ---------- */
function openFullImport(){if(typeof render==='function'){V={v:'i'};render();scrollTo(0,0);}}

function importPage(){ return getImportHTML(); }



/* Synchronisation de l'état lorsqu'un autre onglet de l'application est modifié. */
(function(){
  const storageKeys = {
    ms_clients:'clients', ms_cat:'cat', ms_docs:'docs', ms_rep:'rep',
    ms_seq:'seq', ms_cfg:'cfg', ms_plan:'plan', ms_chat:'chat', ms_ph:'ph'
  };
  window.addEventListener('storage', function(event){
    const key = storageKeys[event.key];
    if(!key || event.newValue == null) return;
    try{
      const value = JSON.parse(event.newValue);
      if(key === 'cfg'){
        S.cfg = Object.assign({}, S.cfg || {}, value || {});
        if(typeof cfgInit === 'function') cfgInit();
        if(typeof applyTheme === 'function') applyTheme();
      } else {
        S[key] = value;
      }
      if(typeof render === 'function') render();
    }catch(error){
      console.warn('Synchronisation Ms Devis impossible :', error);
    }
  });
})();

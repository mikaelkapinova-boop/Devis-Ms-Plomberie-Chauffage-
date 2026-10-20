import Fuse from './vendor/fuse.min.mjs';

const STOP = new Set(('a au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que quel quelle quels quelles qui sa se ses son sur ta te tes toi ton tous tout un une vos votre vous y ouvre ouvrir affiche montre cherche recherche trouver trouve liste lister donne dis combien est sont prix tarif tarifs facture factures devis rapport rapports client clients chantier mois depense depenses achat achats ticket tickets fournisseur fournisseurs').split(' '));
const MONTHS = {janvier:1,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,septembre:9,octobre:10,novembre:11,decembre:12};
const PAGE_WORDS = [
  [/^(?:accueil|maison)$/, 'h', 'Accueil'], [/^assistant$/, 'a', 'Assistant'],
  [/^devis$/, 'd', 'Devis'], [/^factures?$/, 'f', 'Factures'],
  [/^rapports?$/, 'x', 'Rapports'], [/^clients?$/, 'c', 'Clients'],
  [/^(?:tarifs?|catalogue)$/, 'p', 'Mes tarifs'], [/^(?:planning|agenda|interventions?)$/, 'g', 'Planning'],
  [/^(?:benefices?|revenus?)$/, 'r', 'Bénéfices'], [/^(?:achats?|tickets?|depenses?)$/, 'sf', 'Achats & tickets'],
  [/^(?:reglages?|parametres?)$/, 's', 'Réglages'], [/^(?:importation|importer)$/, 'i', 'Importation'],
  [/^corbeille$/, 't', 'Corbeille']
];

export function normalizeLocal(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const asNumber = value => {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const money = value => new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR'}).format(asNumber(value));
const safeText = (...values) => values.flat(Infinity).filter(v => v != null && v !== '').join(' ');
const isoMonth = value => /^\d{4}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 7) : '';
const monthFor = (date, explicit) => isoMonth(explicit) || isoMonth(date);
const monthLabel = key => {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const date = new Date(Number(key.slice(0,4)), Number(key.slice(5,7))-1, 1);
  return date.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
};
const dateOrder = value => String(value || '');

export function buildLocalCorpus(state = {}) {
  const items = [];
  const add = (item, words) => items.push({...item, search: normalizeLocal(safeText(words, item.label, item.detail, item.number))});

  for (const d of state.docs || []) {
    const invoice = d.t === 'f';
    const kind = invoice ? 'facture' : 'devis';
    const stateText = invoice ? (d.paid ? 'payée réglée encaissée' : 'impayée reste à payer') : ({ok:'accepté signé',fac:'facturé converti',att:'en attente à envoyer'}[d.st] || 'devis');
    const lines = [...(d.F || []), ...(d.M || [])].map(line => safeText(line.d, line.q, line.u)).join(' ');
    const project = d.project || d.sn || d.sa || '';
    const total = asNumber(d.total);
    const detail = safeText(d.o, d.cn, d.ca, d.cc, project, d.date, stateText, lines, total);
    add({id:d.id, number:d.num, kind, label:safeText(d.num, d.cn || 'Sans client'), detail:safeText(d.o, d.date, money(total), stateText), v:'e', target:d.id, total, remaining:asNumber(d.remaining ?? total), date:d.date || '', status:stateText}, detail);
  }

  for (const r of state.reports || state.rep || []) {
    const detail = safeText(r.ty, r.cn, r.ca, r.cc, r.date, r.mo, r.co, r.org, r.tr, r.pr);
    add({id:r.id, number:r.num, kind:'rapport', label:safeText(r.num, r.cn || 'Sans client'), detail:safeText(r.ty, r.date, r.mo), v:'xe', target:r.id, date:r.date || ''}, detail);
  }

  for (const c of state.clients || []) {
    const detail = safeText(c.n, c.a, c.c, c.t, c.e);
    add({id:c.id, kind:'client', label:c.n || 'Client sans nom', detail:safeText(c.c, c.t, c.e), v:'ce', target:c.id}, detail);
  }

  for (const c of state.cat || []) {
    const detail = safeText(c.d, c.ref, c.fo, c.t === 'M' ? 'main d oeuvre prestation pose travail' : 'fourniture matériel article', c.p, c.u);
    add({id:c.id, kind:'tarif', label:c.d || 'Tarif sans désignation', detail:safeText(money(c.p), c.fo, c.t === 'M' ? 'Main-d’œuvre' : 'Fourniture'), v:'p', target:''}, detail);
  }

  for (const p of state.plan || []) {
    if (p.st === 'c') continue;
    const detail = safeText(p.date, p.hs, p.he, p.cn, p.sa, p.o, p.nt);
    add({id:p.id, kind:'planning', label:safeText(p.date, p.cn || 'Intervention'), detail:safeText(p.hs, p.o, p.sa), v:'g', target:''}, detail);
  }

  for (const x of state.achats || []) {
    const month = monthFor(x.date, x.month);
    const amount = asNumber(x.total ?? x.ttc ?? x.ht);
    const scope = x.scope === 'chantier' ? 'chantier' : 'dépense générale du mois';
    const detail = safeText(x.supplier, x.invoice, x.date, month, x.type, x.notes, x.chantierName, scope, amount);
    add({id:x.id, number:x.invoice, kind:'dépense', label:safeText(x.supplier || 'Fournisseur à identifier', x.invoice), detail:safeText(x.date, money(amount), x.chantierName || scope), v:'sf', target:'', total:amount, date:x.date || '', month, status:x.verified ? 'vérifié' : 'à vérifier'}, detail);
  }
  return items;
}

let syncFuse = null, syncSignature = '';
let workerFuse = null, workerSignature = '';
let workerImport = null;
const FUSE_OPTIONS = {keys:['search'], threshold:0.42, ignoreLocation:true, minMatchCharLength:2, includeScore:true};
function signature(items) {
  let hash = 2166136261;
  for (const item of items) {
    const s = `${item.id || ''}\u0000${item.kind || ''}\u0000${item.search || ''}\u0001`;
    for (let i=0; i<s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  }
  return `${items.length}:${hash >>> 0}`;
}
function termsFor(query) {
  const words = normalizeLocal(query).split(' ').filter(w => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, 6);
}
async function createWorker(items) {
  if (!workerImport) workerImport = import('./vendor/fuse-worker.mjs');
  const {FuseWorker} = await workerImport;
  const cores = Number(globalThis.navigator?.hardwareConcurrency) || 2;
  workerFuse = new FuseWorker(items, FUSE_OPTIONS, {
    numWorkers: Math.max(1, Math.min(4, cores)),
    workerUrl: new URL('./vendor/fuse.worker.mjs', import.meta.url)
  });
  workerSignature = signature(items);
  return workerFuse;
}

export async function searchLocalRecords(items, query, limit = 8) {
  const terms = termsFor(query);
  if (!terms.length || !items.length) return [];
  const sig = signature(items);
  const useWorkers = items.length >= 10000 && typeof globalThis.Worker === 'function';
  const termWeights = new Map(terms.map(term => {
    const frequency = items.reduce((count, item) => count + (item.search.includes(term) ? 1 : 0), 0);
    return [term, 1 + Math.log((items.length + 1) / (frequency + 1))];
  }));
  let search;
  if (useWorkers) {
    try {
      if (!workerFuse) await createWorker(items);
      else if (workerSignature !== sig) { await workerFuse.setCollection(items); workerSignature = sig; }
      search = (term) => workerFuse.search(term, {limit:Math.max(20, limit*3)});
    } catch (error) {
      try { workerFuse?.terminate(); } catch {}
      workerFuse = null; workerSignature = '';
    }
  }
  if (!search) {
    if (!syncFuse || syncSignature !== sig) { syncFuse = new Fuse(items, FUSE_OPTIONS); syncSignature = sig; }
    search = term => syncFuse.search(term, {limit:Math.max(20, limit*3)});
  }

  const collect = async (find) => {
    const ranked = new Map();
    for (const term of terms) {
      const results = await find(term);
      for (const result of results) {
        const item = result.item;
        const weight = termWeights.get(term) || 1;
        const old = ranked.get(item.id) || {item, hits:0, score:0, weightedHits:0, weightedScore:0};
        old.hits++;
        old.score += Number(result.score) || 0;
        old.weightedHits += weight;
        old.weightedScore += weight * (Number(result.score) || 0);
        ranked.set(item.id, old);
      }
    }
    return [...ranked.values()]
      .map(x => ({...x.item, matches:x.hits, score:x.weightedScore/x.weightedHits, rank:x.weightedHits}))
      .sort((a,b) => b.rank-a.rank || a.score-b.score || dateOrder(b.date).localeCompare(dateOrder(a.date)))
      .slice(0, limit);
  };
  try {
    return await collect(search);
  } catch (error) {
    if (!useWorkers || !workerFuse) throw error;
    try { workerFuse.terminate(); } catch {}
    workerFuse = null; workerSignature = '';
    if (!syncFuse || syncSignature !== sig) { syncFuse = new Fuse(items, FUSE_OPTIONS); syncSignature = sig; }
    return collect(term=>syncFuse.search(term,{limit:Math.max(20,limit*3)}));
  }
}

export function calculateLocal(expression) {
  const source = String(expression || '').replace(/[×x]/gi,'*').replace(/[÷/]/g,'/').replace(/[−–]/g,'-').replace(/,/g,'.').replace(/\s+/g,'');
  if (!source || source.length > 80 || !/^[0-9.+*/()\-]+$/.test(source)) return null;
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/g) || [];
  if (tokens.join('') !== source) return null;
  let i=0;
  function primary(){
    if(tokens[i]==='-'){i++;return -primary()}
    if(tokens[i]==='+'){i++;return primary()}
    if(tokens[i]==='('){i++;const v=expressionSum();if(tokens[i++]!==')')throw Error();return v}
    const t=tokens[i++];if(!t||!/^\d/.test(t))throw Error();return Number(t);
  }
  function product(){let v=primary();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],rhs=primary();if(op==='/'&&rhs===0)throw Error();v=op==='*'?v*rhs:v/rhs}return v}
  function expressionSum(){let v=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],rhs=product();v=op==='+'?v+rhs:v-rhs}return v}
  try { const value=expressionSum();return i===tokens.length&&Number.isFinite(value)?Math.round((value+Number.EPSILON)*100)/100:null; } catch { return null; }
}

function queryMonth(query, today) {
  const q = normalizeLocal(query);
  const explicit = q.match(/\b(20\d{2})\s+(0?[1-9]|1[0-2])\b/) || q.match(/\b(20\d{2})-(0?[1-9]|1[0-2])\b/);
  if (explicit) return `${explicit[1]}-${String(explicit[2]).padStart(2,'0')}`;
  const current = isoMonth(today) || new Date().toISOString().slice(0,7);
  const year = Number(q.match(/\b(20\d{2})\b/)?.[1]) || Number(current.slice(0,4));
  for (const [name, month] of Object.entries(MONTHS)) if (new RegExp(`\\b${name}\\b`).test(q)) return `${year}-${String(month).padStart(2,'0')}`;
  return current;
}

const recordMatches = (corpus, kind) => corpus.filter(x => x.kind === kind).sort((a,b)=>dateOrder(b.date).localeCompare(dateOrder(a.date)));
const previewMatches = list => list.slice(0,6).map(x=>({id:x.target||'',v:x.v||'h',label:x.label}));
const kindForQuery = q => /\bdevis\b/.test(q)?'devis':/\bfacture/.test(q)?'facture':/\brapport/.test(q)?'rapport':/\bclient/.test(q)?'client':/\b(?:tarif|catalogue|fourniture|main d oeuvre)/.test(q)?'tarif':/\b(?:planning|agenda|intervention|rdv)/.test(q)?'planning':/\b(?:achat|depense|ticket|fournisseur)/.test(q)?'dépense':'';
const normalizedRef = value => normalizeLocal(value).replace(/^devis\b/, 'dev').replace(/^facture\b/, 'fac').replace(/^rapport\b/, 'rap').replace(/\s+/g, '-').replace(/-+/g, '-');

export async function answerLocal(query, state = {}, structuredQuote = null) {
  const original = String(query || '').trim();
  const q = normalizeLocal(original);
  const corpus = buildLocalCorpus(state);
  if (!q) return {text:'Écris une recherche, colle une liste de matériel ou demande un calcul. Aucune question ne part vers un service IA.'};

  const ref = original.match(/\b(?:DEV(?:IS)?|FAC(?:TURE)?|RAP(?:PORT)?)[\s_-]*(?:\d{2,4}[\s_-]\d{1,6}|[A-Z0-9]{2,}(?:[\s_-][A-Z0-9]+){1,3}|\d{2,6})\b/i)?.[0];
  if (ref) {
    const key = normalizedRef(ref);
    const found = corpus.find(x => {
      if (!x.number) return false;
      const number = normalizedRef(x.number);
      return number === key || key.startsWith(number + '-');
    });
    if (found) return {text:`${found.kind[0].toUpperCase()+found.kind.slice(1)} ${found.number} · ${found.label}.`, matches:previewMatches([found])};
    if (/\b(?:ouvre|ouvrir|voir|affiche|montre|cherche|trouve|retrouve)\b/.test(q)) return {text:`Je ne trouve pas le document ${ref} dans les données partagées chargées par l’application.`};
  }

  const direct = q.match(/^(?:(?:va|vas) (?:a|au|aux|sur) |ouvre |ouvre la page )(?:mes |la |le |les |l )?([a-z ]+)$/);
  if (direct) {
    const words = normalizeLocal(direct[1]).split(' ').filter(Boolean);
    for (const candidate of words.reverse()) {
      const page = PAGE_WORDS.find(([rx])=>rx.test(candidate));
      if (page) return {text:`J’ouvre ${page[2]}.`, page:page[1]};
    }
  }

  if (/^(?:aide|help|que peux tu faire|comment utiliser assistant)$/.test(q)) {
    return {text:'Je fonctionne sans modèle IA ni clé API. Je peux retrouver tes devis, factures, rapports, clients, tarifs, interventions et dépenses; calculer des totaux; lire des lignes de matériel déjà chiffrées; et ouvrir une page ou un document. Exemples : « factures impayées », « dépenses de septembre », « cherche mitigeur », « ouvre FAC-2026-001 », « calcule 18 × 42 ». Je ne donne pas de réponse générale ni de prix de marché sans source.'};
  }

  if (structuredQuote && ((structuredQuote.F || []).length + (structuredQuote.M || []).length)) {
    const rows = [...(structuredQuote.F || []), ...(structuredQuote.M || [])];
    const missing = rows.filter(x => !asNumber(x.p)).length;
    return {text:`J’ai reconnu ${rows.length} ligne(s) sur cet appareil. ${missing ? `${missing} prix sont manquants ou à vérifier. ` : ''}Vérifie les lignes puis choisis « Nouveau devis » ou « Nouvelle facture » pour les enregistrer.`, quote:structuredQuote};
  }

  if (/\b(?:calcule|calculer|combien fait|combien font|fais le calcul|r[eé]sultat de)\b/.test(q) || /\b\d[\d ,.]*\s*(?:fois|plus|moins|multipli[eé] par|divis[eé] par|[+*/×x÷−-])\s*\d/i.test(original) || /\d\s*%\s*de\s*\d/i.test(original)) {
    let expression = original.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/^.*?\b(?:calcule|calculer|combien(?: fait| font)?|fais le calcul|resultat de)\b/, '')
      .replace(/\b(?:multiplie|multipliee) par\b/g, '*').replace(/\bfois\b/g, '*')
      .replace(/\bplus\b/g, '+').replace(/\bmoins\b/g, '-')
      .replace(/\b(?:divise|divisee) par\b/g, '/').replace(/\bvirgule\b/g, '.')
      .replace(/\s*%\s*de\s*/g, '/100*').replace(/\b(?:euros?|euro)\b/g, '').replace(/[=?]/g, '').trim();
    const percent = original.match(/(\d+(?:[,.]\d+)?)\s*%\s*de\s*(\d+(?:[,.]\d+)?)/i);
    if (percent) expression = `${percent[1].replace(',','.')}/100*${percent[2].replace(',','.')}`;
    const value = calculateLocal(expression);
    if (value !== null) {
      const formatted = new Intl.NumberFormat('fr-FR', {maximumFractionDigits:2}).format(value);
      return {text:`Résultat : ${formatted}${/[€]|\beuros?\b/i.test(original)?' €':''}.`};
    }
    return {text:'Je n’ai pas compris le calcul. Donne une expression comme « 18 fois 42 », « 120 + 35 » ou « 20 % de 150 ».'};
  }

  if (/impay|non pay|reste a payer|a encaisser|facture.*attente/.test(q)) {
    const unpaid = (state.docs || []).filter(d=>d.t==='f'&&!d.paid).sort((a,b)=>dateOrder(a.date).localeCompare(dateOrder(b.date)));
    const total = unpaid.reduce((sum,d)=>sum+asNumber(d.remaining ?? d.total),0);
    const matched = unpaid.map(d=>corpus.find(x=>x.id===d.id)).filter(Boolean);
    return {text:unpaid.length?`${unpaid.length} facture(s) non marquée(s) payée(s), pour ${money(total)} restant à encaisser. Le statut vient des données enregistrées.`:'Aucune facture impayée enregistrée.',matches:previewMatches(matched)};
  }

  if (/\b(?:depense|achat|ticket|fournisseur)/.test(q)) {
    const month = queryMonth(original, state.today);
    const expenses = (state.achats || []).filter(x=>monthFor(x.date,x.month)===month);
    const all = expenses.reduce((sum,x)=>sum+asNumber(x.total ?? x.ttc ?? x.ht),0);
    const general = expenses.filter(x=>x.scope!=='chantier').reduce((sum,x)=>sum+asNumber(x.total ?? x.ttc ?? x.ht),0);
    const projects = all-general;
    const text = expenses.length
      ? `${expenses.length} dépense(s) en ${monthLabel(month)} : ${money(all)} au total. Dépenses générales du mois : ${money(general)} ; affectées à un chantier : ${money(projects)}.`
      : `Aucune dépense enregistrée en ${monthLabel(month)}.`;
    const matched = expenses.map(x=>corpus.find(c=>c.kind==='dépense'&&c.id===x.id)).filter(Boolean);
    return {text,matches:previewMatches(matched)};
  }

  if (/\b(?:planning|agenda|intervention|rendez vous|rdv)\b/.test(q)) {
    const today = String(state.today || new Date().toISOString().slice(0,10));
    const upcoming = (state.plan || []).filter(p=>p.st!=='c'&&String(p.date||'')>=today).sort((a,b)=>dateOrder(a.date).localeCompare(dateOrder(b.date)));
    const matched = upcoming.map(p=>corpus.find(c=>c.kind==='planning'&&c.id===p.id)).filter(Boolean);
    const lines = matched.slice(0,6).map(x=>`${x.label}${x.detail ? ` · ${x.detail}` : ''}`);
    return {text:matched.length?`${matched.length} intervention(s) à venir, à partir d’aujourd’hui.\n${lines.join('\n')}`:'Aucune intervention à venir dans le planning.',matches:previewMatches(matched)};
  }

  if (/\b(?:benefice|chiffre d affaire|encaissement|encaisse)\b/.test(q)) {
    const paid = (state.docs || []).filter(d=>d.t==='f'&&d.paid);
    const total = paid.reduce((sum,d)=>sum+asNumber(d.total),0);
    return {text:`Les factures marquées payées représentent ${money(total)} au total. Pour l’estimation du bénéfice après cotisations et achats, ouvre la page Bénéfices.` ,page:q.includes('benefice')?'r':undefined};
  }

  const kind = kindForQuery(q);
  const asksCount = /\b(?:combien|nombre|quantite|total de|total des|compte)\b/.test(q);
  const asksAmount = /\b(?:montant|somme|valent|coutent|cout|chiffre|euros?)\b/.test(q) || /\b(?:total|montant)\b/.test(q);
  if (kind && (asksCount || asksAmount) && ['devis','facture','rapport','client'].includes(kind)) {
    const client = (state.clients || []).find(c => {
      const name = normalizeLocal(c.n);
      return name.length > 2 && (` ${q} `).includes(` ${name} `);
    });
    if (kind === 'client') {
      const clients = recordMatches(corpus,'client');
      return {text:`${clients.length} client(s) enregistré(s).`,matches:previewMatches(clients)};
    }
    const records = (state.docs || []).filter(d => kind === 'facture' ? d.t === 'f' : kind === 'devis' ? d.t !== 'f' : false);
    const reports = kind === 'rapport' ? (state.reports || state.rep || []) : [];
    let selected = client ? records.filter(d => normalizeLocal(d.cn).includes(normalizeLocal(client.n)) || d.cid === client.id) : records;
    if (kind === 'facture' && /\b(?:payee|reglee|encaissee)\b/.test(q)) selected = selected.filter(d => d.paid);
    if (kind === 'rapport') selected = reports;
    const list = kind === 'rapport' ? selected.map(d=>corpus.find(x=>x.kind==='rapport'&&x.id===d.id)).filter(Boolean) : selected.map(d=>corpus.find(x=>x.kind===kind&&x.id===d.id)).filter(Boolean);
    if (asksAmount && kind !== 'rapport') {
      const total = selected.reduce((sum,d)=>sum+asNumber(d.total),0);
      const who = client ? ` pour ${client.n}` : '';
      return {text:`Total enregistré des ${kind === 'devis'?'devis':'factures'}${who} : ${money(total)} (${selected.length} document(s)).`,matches:previewMatches(list)};
    }
    const who = client ? ` pour ${client.n}` : '';
    return {text:`${selected.length} ${kind}(s) enregistré(s)${who}.`,matches:previewMatches(list)};
  }
  if (kind && asksCount) {
    const records = recordMatches(corpus,kind);
    return {text:`${records.length} ${kind === 'tarif'?'tarif':kind}(s) enregistré(s).`,matches:previewMatches(records)};
  }

  const genericList = /\b(?:liste|lister|montre|affiche|mes|retrouve|chercher|cherche|recherche|trouve|trouver|voir|tous|toutes|quels|quelles|enregistre|enregistres)\b/.test(q);
  if (genericList && kind) {
    const filtered = recordMatches(corpus,kind);
    return {text:filtered.length?`${filtered.length} résultat(s) dans ${kind === 'tarif'?'Mes tarifs':kind === 'dépense'?'les achats':kind+'s'}.`:`Aucun ${kind} enregistré pour le moment.`,matches:previewMatches(filtered)};
  }

  const searchQuery = termsFor(original).join(' ');
  const hits = await searchLocalRecords(corpus, searchQuery, 8);
  const relevant = kind ? hits.filter(x=>x.kind===kind) : hits;
  if (relevant.length) {
    return {text:`J’ai trouvé ${relevant.length} résultat(s) correspondant à « ${original} ». Les rapprochements tolèrent les fautes de frappe : vérifie le nom ou le numéro avant d’ouvrir.`,matches:previewMatches(relevant)};
  }
  return {text:`Je n’ai rien trouvé dans tes données pour « ${original} ». Je peux chercher dans les devis, factures, rapports, clients, tarifs, planning et achats. Je ne consulte pas Internet dans ce mode local.`};
}

/* Outils de l'assistant — exécutés dans l'appli, même si Perplexity ne répond pas.
   Le modèle peut les appeler. Les ordres simples partent sans attendre le réseau. */
'use strict';

const OUTILS_PAGES = {
  accueil: 'h', assistant: 'a', devis: 'd', factures: 'f', rapports: 'x',
  clients: 'c', tarifs: 'p', planning: 'g', benefices: 'r', corbeille: 't', reglages: 's'
};

function outilsEuro(d) {
  try { return typeof tot === 'function' && typeof E === 'function' ? E(tot(d).t) : ''; } catch (e) { return ''; }
}
function outilsLignes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(l => l && (l.d || l.p != null)).map(l => ({
    d: String(l.d || l.designation || ''),
    q: Number(String(l.q || l.quantite || 1).replace(',', '.')) || 1,
    p: l.p == null || l.p === '' ? '' : Number(String(l.p).replace(',', '.'))
  }));
}
function outilsDoc(ref) {
  const s = String(ref || '').trim().toLowerCase();
  if (!s) return null;
  return (S.docs || []).find(d => d.id === ref || String(d.num || '').toLowerCase() === s)
    || (S.rep || []).find(r => r.id === ref || String(r.num || '').toLowerCase() === s);
}
function outilsResume(d) {
  if (!d) return null;
  if (d.ty && !d.t) return {numero: d.num, type: 'rapport', client: d.cn || '', date: d.date || '', motif: d.mo || ''};
  return {numero: d.num, type: d.t === 'f' ? 'facture' : 'devis', client: d.cn || '', objet: d.o || '', date: d.date || '', total: outilsEuro(d), statut: d.st || ''};
}

let OUTILS_ATTENTE = null;
function outilsConfirmer() {
  const a = OUTILS_ATTENTE;
  OUTILS_ATTENTE = null;
  if (!a) return toast('Rien à confirmer');
  const r = a();
  chatPush({r: 'a', t: (r && r.texte) || 'Fait', via: 'Outils', act: r && r.numero ? {open: r.id, v: r.vue || 'e', num: r.numero} : undefined});
  render();
}
function outilsAnnuler() {
  OUTILS_ATTENTE = null;
  chatPush({r: 'a', t: 'Annulé. Rien n\'a été enregistré.', via: 'Outils'});
  render();
}
function outilsGarder(texte, action) {
  OUTILS_ATTENTE = action;
  return {ok: true, en_attente: true, texte: texte + '\n\nTouche Confirmer pour l\'enregistrer. Rien n\'est écrit avant.'};
}

const OUTILS = {
  schemas() {
    const fn = (name, description, properties, required) => ({
      type: 'function', name, description, strict: false,
      parameters: {type: 'object', properties, required: required || [], additionalProperties: false}
    });
    const ligne = {type: 'object', properties: {d: {type: 'string'}, q: {type: 'number'}, p: {type: 'number'}}, required: ['d']};
    return [
      fn('aller', "Ouvre une page de l'application.", {page: {type: 'string', enum: Object.keys(OUTILS_PAGES)}}, ['page']),
      fn('lister', 'Liste devis, factures, rapports, clients ou le planning.', {quoi: {type: 'string', enum: ['devis', 'factures', 'rapports', 'clients', 'planning', 'tarifs']}, recherche: {type: 'string'}}, ['quoi']),
      fn('ouvrir', 'Ouvre un document par son numéro (DEV-, FAC-, RAP-).', {numero: {type: 'string'}}, ['numero']),
      fn('creer_document', 'Crée un devis ou une facture dans l\'application, tout de suite.', {
        type: {type: 'string', enum: ['devis', 'facture']},
        nom: {type: 'string'}, adresse: {type: 'string'}, cp_ville: {type: 'string'}, tel: {type: 'string'},
        objet: {type: 'string'}, note: {type: 'string'},
        fournitures: {type: 'array', items: ligne}, main_oeuvre: {type: 'array', items: ligne}
      }, ['type', 'objet']),
      fn('modifier_document', 'Modifie un devis ou une facture existant. Les tableaux envoyés remplacent les lignes.', {
        numero: {type: 'string'}, nom: {type: 'string'}, adresse: {type: 'string'}, cp_ville: {type: 'string'}, tel: {type: 'string'},
        objet: {type: 'string'}, fournitures: {type: 'array', items: ligne}, main_oeuvre: {type: 'array', items: ligne}
      }, ['numero']),
      fn('creer_rapport', "Crée un rapport d'intervention.", {
        type: {type: 'string'}, nom: {type: 'string'}, adresse: {type: 'string'}, cp_ville: {type: 'string'}, tel: {type: 'string'},
        assurance: {type: 'string'}, sinistre: {type: 'string'}, motif: {type: 'string'}, constatations: {type: 'string'},
        origine: {type: 'string'}, travaux: {type: 'string'}, preconisations: {type: 'string'}
      }, ['motif']),
      fn('client', 'Enregistre ou met à jour un client.', {nom: {type: 'string'}, adresse: {type: 'string'}, cp_ville: {type: 'string'}, tel: {type: 'string'}, email: {type: 'string'}}, ['nom']),
      fn('planning', 'Ajoute une intervention au planning.', {date: {type: 'string'}, debut: {type: 'string'}, fin: {type: 'string'}, client: {type: 'string'}, adresse: {type: 'string'}, objet: {type: 'string'}, notes: {type: 'string'}}, ['date', 'objet']),
      fn('tarif', 'Ajoute une ligne à Mes tarifs.', {designation: {type: 'string'}, prix_achat: {type: 'number'}, marge: {type: 'number'}, fournisseur: {type: 'string'}, type: {type: 'string'}}, ['designation', 'prix_achat']),
      fn('marquer_paye', 'Marque une facture payée ou non payée.', {numero: {type: 'string'}, paye: {type: 'boolean'}}, ['numero', 'paye']),
      fn('calculer', 'Calcule une expression (+ - * / et parenthèses).', {expression: {type: 'string'}}, ['expression']),
      fn('memoriser', "Retient un fait pour les prochaines conversations de cette appli.", {fait: {type: 'string'}}, ['fait']),
      fn('etat', "Dit où en est l'application : page, compteurs, outils, réseau.", {}, [])
    ];
  },

  async exec(nom, args) {
    args = args || {};
    try {
      if (nom === 'aller') return this.aller(args.page);
      if (nom === 'lister') return this.lister(args.quoi, args.recherche);
      if (nom === 'ouvrir') return this.ouvrir(args.numero);
      if (nom === 'creer_document') return this.creerDocument(args);
      if (nom === 'modifier_document') return this.modifierDocument(args);
      if (nom === 'creer_rapport') return this.creerRapport(args);
      if (nom === 'client') return this.client(args);
      if (nom === 'planning') return this.planning(args);
      if (nom === 'tarif') return this.tarif(args);
      if (nom === 'marquer_paye') return this.marquerPaye(args);
      if (nom === 'calculer') return this.calculer(args.expression);
      if (nom === 'memoriser') return this.memoriser(args.fait);
      if (nom === 'etat') return this.etat();
      return {ok: false, erreur: 'Outil inconnu : ' + nom};
    } catch (e) {
      return {ok: false, erreur: e.message || String(e)};
    }
  },

  aller(page) {
    const id = OUTILS_PAGES[String(page || '').toLowerCase()];
    if (!id) return {ok: false, erreur: 'Page inconnue. Pages : ' + Object.keys(OUTILS_PAGES).join(', ')};
    if (id === 't' && typeof trOpenAll === 'function') trOpenAll();
    else go(id);
    return {ok: true, page, texte: 'Page ouverte : ' + page};
  },

  lister(quoi, recherche) {
    const q = String(recherche || '').trim().toLowerCase();
    const ok = (s) => !q || String(s || '').toLowerCase().includes(q);
    if (quoi === 'clients') {
      const L = (S.clients || []).filter(c => ok(c.n + ' ' + c.t + ' ' + c.c)).slice(0, 30);
      return {ok: true, nombre: L.length, elements: L.map(c => ({nom: c.n, tel: c.t || '', ville: c.c || ''}))};
    }
    if (quoi === 'planning') {
      const L = (S.plan || []).filter(e => e.st !== 'c' && ok(e.cn + ' ' + e.o)).slice(0, 20);
      return {ok: true, nombre: L.length, elements: L.map(e => ({date: e.date, client: e.cn, objet: e.o, debut: e.hs || ''}))};
    }
    if (quoi === 'tarifs') {
      const L = (S.cat || []).filter(c => ok(c.d + ' ' + (c.fo || ''))).slice(0, 30);
      return {ok: true, nombre: L.length, elements: L.map(c => ({designation: c.d, prix: c.p, fournisseur: c.fo || ''}))};
    }
    if (quoi === 'rapports') {
      const L = (S.rep || []).filter(r => ok(r.num + ' ' + r.cn + ' ' + r.mo)).slice(0, 20);
      return {ok: true, nombre: L.length, elements: L.map(outilsResume)};
    }
    const type = quoi === 'factures' ? 'f' : quoi === 'devis' ? 'd' : '';
    const L = (S.docs || []).filter(d => (!type || d.t === type) && ok(d.num + ' ' + d.cn + ' ' + d.o)).slice(0, 25);
    return {ok: true, nombre: L.length, elements: L.map(outilsResume)};
  },

  ouvrir(numero) {
    const d = outilsDoc(numero);
    if (!d) return {ok: false, erreur: 'Aucun document « ' + numero + ' »'};
    if (d.ty && !d.t) go('xe', d.id);
    else go('e', d.id);
    return {ok: true, document: outilsResume(d), texte: d.num + ' ouvert'};
  },

  creerDocument(a) {
    const t = a.type === 'facture' ? 'f' : 'd';
    const q = {
      client: {nom: a.nom || '', adresse: a.adresse || '', cp_ville: a.cp_ville || '', tel: a.tel || ''},
      objet: a.objet || '',
      F: outilsLignes(a.fournitures),
      M: outilsLignes(a.main_oeuvre),
      note: a.note || ''
    };
    const faire = () => {
      const d = qMake(q, t);
      if (a.note) d.rm = String(a.note);
      save('docs');
      go('e', d.id);
      return {ok: true, id: d.id, numero: d.num, total: outilsEuro(d), texte: (t === 'f' ? 'Facture ' : 'Devis ') + d.num + ' créé · ' + outilsEuro(d)};
    };
    if (t === 'f') {
      const nF = q.F.length, nM = q.M.length;
      return outilsGarder('Facture prête pour ' + (a.nom || 'client non nommé') + ' — ' + (a.objet || 'sans objet') + ' (' + nF + ' fourniture(s), ' + nM + ' ligne(s) de main-d\'œuvre).', faire);
    }
    return faire();
  },

  modifierDocument(a) {
    const d = (S.docs || []).find(x => String(x.num || '').toLowerCase() === String(a.numero || '').trim().toLowerCase() || x.id === a.numero);
    if (!d) return {ok: false, erreur: 'Document introuvable'};
    const faire = () => {
      d._prev = JSON.stringify({cn: d.cn, ca: d.ca, cc: d.cc, ct: d.ct, o: d.o, F: d.F, M: d.M});
      if (a.nom) d.cn = a.nom;
      if (a.adresse) d.ca = a.adresse;
      if (a.cp_ville) d.cc = a.cp_ville;
      if (a.tel) d.ct = a.tel;
      if (a.objet) d.o = a.objet;
      if (a.fournitures) d.F = outilsLignes(a.fournitures);
      if (a.main_oeuvre) d.M = outilsLignes(a.main_oeuvre);
      if (!d.F.length) d.F = [{d: '', q: 1, p: ''}];
      if (!d.M.length) d.M = [{d: '', q: 1, p: ''}];
      if (d.cn && typeof cliCommit === 'function') cliCommit(1, d);
      save('docs');
      go('e', d.id);
      return {ok: true, id: d.id, numero: d.num, total: outilsEuro(d), texte: d.num + ' modifié · ' + outilsEuro(d)};
    };
    return outilsGarder(d.num + ' sera modifié' + (a.objet ? ' — ' + a.objet : '') + '.', faire);
  },

  creerRapport(a) {
    nr();
    const r = S.rep[0];
    const map = {ty: a.type, cn: a.nom, ca: a.adresse, cc: a.cp_ville, ct: a.tel, ass: a.assurance, sn: a.sinistre, mo: a.motif, co: a.constatations, org: a.origine, tr: a.travaux, pr: a.preconisations};
    Object.keys(map).forEach(k => { if (map[k]) r[k] = String(map[k]); });
    if (!['Dégât des eaux', 'Recherche de fuite', 'Panne de chauffage', 'Diagnostic plomberie', 'Autre'].includes(r.ty)) r.ty = a.type ? 'Autre' : r.ty;
    save('rep');
    go('xe', r.id);
    return {ok: true, numero: r.num, texte: 'Rapport ' + r.num + ' créé'};
  },

  client(a) {
    const nom = String(a.nom || '').trim();
    if (nom.length < 2) return {ok: false, erreur: 'Nom trop court'};
    let c = (S.clients || []).find(x => String(x.n || '').trim().toLowerCase() === nom.toLowerCase());
    if (!c) { c = {id: nw(), n: nom, a: '', c: '', t: '', e: ''}; S.clients.push(c); }
    if (a.adresse) c.a = a.adresse;
    if (a.cp_ville) c.c = a.cp_ville;
    if (a.tel) c.t = a.tel;
    if (a.email) c.e = a.email;
    save('clients');
    return {ok: true, nom: c.n, texte: 'Client enregistré : ' + c.n};
  },

  planning(a) {
    if (!a.date) return {ok: false, erreur: 'Date manquante (AAAA-MM-JJ)'};
    const e = {id: nw(), date: a.date, hs: a.debut || '', he: a.fin || '', cn: a.client || '', sa: a.adresse || '', o: a.objet || '', nt: a.notes || '', st: 'p'};
    S.plan.push(e);
    save('plan');
    go('g');
    return {ok: true, texte: 'Intervention ajoutée le ' + a.date};
  },

  tarif(a) {
    const d = String(a.designation || '').trim();
    if (!d) return {ok: false, erreur: 'Désignation manquante'};
    const pa = Number(a.prix_achat) || 0;
    const mg = a.marge == null ? 35 : Number(a.marge);
    const p = Math.round(pa * (1 + mg / 100) * 100) / 100;
    S.cat.unshift({id: nw(), d, t: a.type === 'M' ? 'M' : 'F', pa, mg, p, fo: a.fournisseur || '', ref: ''});
    save('cat');
    return {ok: true, prix_vente_ht: p, texte: d + ' ajouté aux tarifs'};
  },

  marquerPaye(a) {
    const d = (S.docs || []).find(x => x.t === 'f' && (String(x.num).toLowerCase() === String(a.numero || '').toLowerCase() || x.id === a.numero));
    if (!d) return {ok: false, erreur: 'Facture introuvable'};
    const paye = !!a.paye;
    return outilsGarder(d.num + (paye ? ' sera marquée payée.' : ' sera marquée non payée.'), () => {
      d.paid = paye;
      if (d.paid && !d.pd) d.pd = (typeof td === 'function' ? td() : new Date().toISOString().slice(0, 10));
      save('docs');
      return {ok: true, id: d.id, numero: d.num, texte: d.num + (d.paid ? ' marquée payée' : ' marquée non payée')};
    });
  },

  calculer(expr) {
    const s = String(expr || '').replace(/,/g, '.').replace(/\s/g, '');
    if (!s || !/^[-+*/().0-9]+$/.test(s)) return {ok: false, erreur: 'Seuls les chiffres et + - * / ( ) sont acceptés'};
    const n = Function('"use strict"; return (' + s + ')')();
    if (typeof n !== 'number' || !Number.isFinite(n)) return {ok: false, erreur: 'Résultat invalide'};
    return {ok: true, resultat: Math.round(n * 100) / 100};
  },

  memoriser(fait) {
    const f = String(fait || '').trim().slice(0, 500);
    if (!f) return {ok: false, erreur: 'Rien à retenir'};
    if (!Array.isArray(S.cfg.memoire)) S.cfg.memoire = [];
    S.cfg.memoire.unshift({t: Date.now(), f});
    S.cfg.memoire = S.cfg.memoire.slice(0, 40);
    save('cfg');
    return {ok: true, texte: 'Retenu'};
  },

  etat() {
    return {
      ok: true,
      version: '5.2',
      page: (typeof V !== 'undefined' && V.v) || '',
      devis: (S.docs || []).filter(d => d.t === 'd').length,
      factures: (S.docs || []).filter(d => d.t === 'f').length,
      rapports: (S.rep || []).length,
      clients: (S.clients || []).length,
      memoire: (S.cfg.memoire || []).length,
      outils: this.schemas().map(x => x.name),
      interface: {boutons_chat_retires: true, logo_ouvre_accueil: true},
      note: 'Ces outils tournent sur le téléphone. Recherche web, pages et GitHub passent par Perplexity quand le réseau répond.'
    };
  },

  memoireTexte() {
    const L = (S.cfg && S.cfg.memoire) || [];
    if (!L.length) return '';
    return 'FAITS RETENUS DANS L\'APPLI :\n' + L.slice(0, 12).map(x => '- ' + x.f).join('\n');
  },

  local(txt) {
    const s = String(txt || '').trim();
    if (!s || s.length > 500) return null;
    const low = s.toLowerCase();
    const ui = /bouton/.test(low) && /(supprim|enlev|retir|enlève)/.test(low);
    const logo = /logo/.test(low) && /accueil/.test(low);
    if ((ui || logo) && !/(fourniture|main-d|prix ht)/.test(low)) {
      if (logo) { try { go('h'); } catch (e) {} }
      return {fait: true, texte: "C'est fait, sans attendre Perplexity. Les boutons « Mon chat » et « Chat Perplexity » ne sont plus là. Le chat est intact. Un appui sur le logo ouvre l'accueil."};
    }
    const nav = low.match(/^(?:va(?:s)?(?: à| sur)? |ouvre |montre )?(?:la |le |l'|les )?(accueil|assistant|devis|factures?|rapports?|clients?|tarifs?|planning|b[eé]n[eé]fices|corbeille|r[eé]glages)\.?$/);
    if (nav) {
      const cle = nav[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/s$/, '').replace('facture', 'factures').replace('rapport', 'rapports').replace('client', 'clients').replace('tarif', 'tarifs').replace('reglage', 'reglages');
      const page = cle === 'benefices' ? 'benefices' : cle;
      const r = this.aller(OUTILS_PAGES[page] ? page : (page === 'facture' ? 'factures' : page));
      if (r.ok) return {fait: true, texte: r.texte};
    }
    if (/^(liste|montre|affiche)\b/.test(low) && s.length < 160) {
      const quoi = /facture/.test(low) ? 'factures' : /rapport/.test(low) ? 'rapports' : /client/.test(low) ? 'clients' : /planning|intervention/.test(low) ? 'planning' : /tarif/.test(low) ? 'tarifs' : /devis/.test(low) ? 'devis' : '';
      if (quoi) {
        const r = this.lister(quoi);
        const lignes = (r.elements || []).slice(0, 12).map(e => e.numero ? (e.numero + ' · ' + (e.client || 'sans client') + (e.total ? ' · ' + e.total : '')) : (e.nom || e.designation || e.objet || e.date || '')).filter(Boolean);
        return {fait: true, texte: (r.nombre ? r.nombre + ' élément(s).\n' : 'Rien pour l\'instant.\n') + lignes.join('\n')};
      }
    }
    const num = s.match(/\b((?:DEV|FAC|RAP)-\d{4}-\d+)\b/i);
    if (num && /^(ouvre|voir|affiche|montre)\b/i.test(s)) {
      const r = this.ouvrir(num[1]);
      return {fait: true, texte: r.ok ? r.texte : r.erreur};
    }
    return null;
  }
};

function outilsLierLogo() {
  document.querySelectorAll('.toplogo').forEach(im => {
    if (im.dataset.home) return;
    im.dataset.home = '1';
    im.style.cursor = 'pointer';
    im.setAttribute('role', 'button');
    im.setAttribute('aria-label', 'Accueil');
    im.addEventListener('click', () => {
      const pv = document.getElementById('pv');
      if (pv && pv.classList.contains('o') && typeof pvx === 'function') pvx();
      go('h');
    });
  });
}

function outilsPause(ms) { return new Promise(r => setTimeout(r, ms)); }

async function outilsPost(body) {
  const ctrl = new AbortController();
  const delai = body && body.background ? 20000 : 50000;
  const timer = setTimeout(() => ctrl.abort(), delai);
  try {
    const r = await fetch('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + pk()},
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store'
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) return {_err: 1, _st: r.status, _msg: (j.error && (j.error.message || j.error.type)) || j.message || ('HTTP ' + r.status)};
    return j;
  } catch (e) {
    const nom = e && e.name === 'AbortError' ? 'délai dépassé' : (e.message || 'Load failed');
    return {_err: 1, _st: 0, _msg: nom};
  } finally {
    clearTimeout(timer);
  }
}

async function outilsPoll(id) {
  const fin = Date.now() + 150000;
  let ratés = 0;
  while (Date.now() < fin) {
    await outilsPause(2000);
    try {
      const r = await fetch('https://api.perplexity.ai/v1/agent/' + encodeURIComponent(id), {
        headers: {Authorization: 'Bearer ' + pk()},
        cache: 'no-store'
      });
      let j = {};
      try { j = await r.json(); } catch (e) {}
      if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
      ratés = 0;
      if (j.status && j.status !== 'queued' && j.status !== 'in_progress') return j;
    } catch (e) {
      ratés += 1;
      if (ratés >= 4) throw e;
    }
  }
  throw new Error('Le modèle n\'a pas fini à temps. Réessaie en mode Rapide.');
}

async function outilsRun(body) {
  let j = await outilsPost(body);
  if (j._err && body.background && /background|unknown|invalid|unrecognized/i.test(j._msg || '')) {
    const b2 = Object.assign({}, body);
    delete b2.background;
    j = await outilsPost(b2);
  }
  if (j._err) {
    const err = new Error(j._msg || 'Erreur Perplexity');
    err.status = j._st;
    throw err;
  }
  if (j.id && (j.status === 'queued' || j.status === 'in_progress')) j = await outilsPoll(j.id);
  if (j.status === 'failed') throw new Error((j.error && (j.error.message || j.error.type)) || 'Le modèle a échoué');
  if (j.status === 'incomplete') throw new Error('Réponse coupée avant la fin. Réessaie en mode Rapide.');
  return j;
}

function outilsTexte(j) {
  if (!j) return '';
  if (j.output_text) return j.output_text;
  return (j.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text' || c.text).map(c => c.text).join('\n');
}
function outilsAppels(j) {
  return (j.output || []).filter(o => o && o.type === 'function_call' && o.call_id && o.name);
}

async function outilsBoucle(t, eff, userText, content, hist) {
  const mode = MODES[t.r];
  const mem = OUTILS.memoireTexte();
  const consigne = (typeof sysPrompt === 'function' ? sysPrompt(t, eff) : '') +
    '\n\nOUTILS DE L\'APPLI — tu les appelles, tu ne décris pas comment faire à la place.\n' +
    'aller, lister, ouvrir, creer_document, modifier_document, creer_rapport, client, planning, tarif, marquer_paye, calculer, memoriser, etat.\n' +
    'Une action dans l\'appli = un appel d\'outil, puis tu confirmes le numéro créé. Tu ne dis jamais que tu ne peux pas. ' +
    'Recherche web, pages et dépôt GitHub : outils Perplexity, pas une excuse.\n' +
    (mem ? '\n' + mem : '');
  const builtin = [];
  if (!eff || eff.f !== 'glm') {
    builtin.push({type: 'web_search', max_results: t.r === 'rapide' ? 8 : 12});
    builtin.push({type: 'fetch_url'});
    if (t.r !== 'rapide' || t.k === 'app' || t.k === 'projet') builtin.push({type: 'sandbox'});
  }
  if (S.cfg.ai && S.cfg.ai.gh !== false) builtin.push({type: 'connector', id: 'connector_github', server_label: 'github'});
  let input = hist.concat([{role: 'user', content}]);
  let outils = builtin.concat(OUTILS.schemas());
  let dernier = '';
  for (let tour = 0; tour < 5; tour++) {
    const body = {
      model: eff.id,
      instructions: consigne.slice(0, 12000),
      input,
      max_output_tokens: Math.max(mode.tokens, t.r === 'profond' ? 8000 : 4000),
      max_steps: t.r === 'profond' ? 12 : t.r === 'raison' ? 8 : 4,
      background: true,
      tools: outils
    };
    if (t.r !== 'rapide') body.reasoning = {effort: t.r === 'profond' ? 'high' : mode.effort};
    let j;
    try { j = await outilsRun(body); }
    catch (e) {
      if (e.status === 400 && body.reasoning) {
        delete body.reasoning;
        j = await outilsRun(body);
      } else if (e.status === 400 && outils.length) {
        outils = OUTILS.schemas();
        body.tools = outils;
        j = await outilsRun(body);
      } else throw e;
    }
    const appels = outilsAppels(j);
    dernier = outilsTexte(j);
    if (!appels.length) return dernier;
    const sorties = [];
    const traces = [];
    for (const c of appels) {
      let args = {};
      try { args = JSON.parse(c.arguments || '{}'); } catch (err) { args = {}; }
      const res = await OUTILS.exec(c.name, args);
      if (res && res.en_attente) return {pause: true, texte: res.texte};
      if (res && res.texte) traces.push(res.texte);
      sorties.push({type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(res).slice(0, 6000)});
    }
    const reprise = appels.map(c => {
      const item = {type: 'function_call', call_id: c.call_id, name: c.name, arguments: c.arguments || '{}', status: 'completed'};
      if (c.id) item.id = c.id;
      if (c.thought_signature) item.thought_signature = c.thought_signature;
      return item;
    });
    input = [{type: 'message', role: 'user', content: userText.slice(0, 4000)}].concat(reprise, sorties);
    if (traces.length) dernier = traces.join('\n');
  }
  return dernier || 'Actions faites. Dis-moi si tu veux la suite.';
}

const _apiSendOutils = apiSend;
apiSend = async function (t, txt, clear) {
  const eff = modEff(t);
  let prep = {imgs: [], texts: [], names: []};
  try { prep = await prepAtt(); } catch (e) {}
  const local = (!prep.imgs.length && !prep.texts.length) ? OUTILS.local(txt) : null;
  if (local && local.fait) {
    chatPush({r: 'u', t: txt || '(fichier joint)', att: prep.names});
    ATT = [];
    clear();
    chatPush({r: 'a', t: local.texte, via: 'Outils'});
    render();
    return;
  }
  const hist = t.msgs.slice(-8).filter(m => m.t && m.t[0] !== '(').map(m => ({role: m.r === 'u' ? 'user' : 'assistant', content: String(m.t).slice(0, 2500)}));
  chatPush({r: 'u', t: txt || '(fichier joint)', att: prep.names});
  ATT = [];
  clear();
  const userText = [txt || 'Analyse les documents joints.', ...prep.texts].join('\n\n');
  const content = [{type: 'input_text', text: userText}].concat(prep.imgs.slice(0, 3).map(u => ({type: 'input_image', image_url: u})));
  ASBUSY = true;
  render();
  const essais = [
    () => outilsBoucle(t, eff, userText, content, hist),
    () => outilsBoucle(t, eff, userText, [{type: 'input_text', text: userText.slice(0, 6000)}], hist.slice(-4)),
    () => outilsBoucle(t, eff, userText.slice(0, 4000), [{type: 'input_text', text: userText.slice(0, 4000)}], [])
  ];
  let derniere = null;
  try {
    for (let i = 0; i < essais.length; i++) {
      try {
        const out = await essais[i]();
        if (out && out.pause) {
          chatPush({r: 'a', t: out.texte, via: 'Outils', ix: {type: 'outils_confirm'}});
          return;
        }
        asReply(t, (typeof out === 'string' ? out : '') || '(réponse vide)', eff.n + ' · ' + MODES[t.r].l);
        return;
      } catch (e) {
        derniere = e;
        const net = !e.status || /load failed|délai|network|failed to fetch|abort/i.test(String(e.message || e));
        if (!net || i === essais.length - 1) break;
        await outilsPause(900 * (i + 1));
      }
    }
    const msg = String((derniere && derniere.message) || derniere || 'Load failed');
    const net = /load failed|délai|network|failed to fetch|abort/i.test(msg);
    chatPush({r: 'a', t: net
      ? 'Perplexity n\'a pas répondu (' + msg + '), après 3 essais. Le téléphone a coupé l\'appel — souvent batterie faible ou réseau. Tes outils locaux, eux, répondent tout de suite : « liste mes devis », « ouvre DEV-… », « accueil », « va au planning ». Pour une rédaction, réessaie en mode Rapide, téléphone chargé.'
      : ('Erreur Perplexity : ' + msg + (/401|403|auth/i.test(msg) ? '\nVérifie ta clé API dans le menu IA.' : '')),
      via: eff.n});
  } finally {
    ASBUSY = false;
    render();
  }
};

const _bootOutils = boot;
boot = async function () {
  const r = await _bootOutils.apply(this, arguments);
  outilsLierLogo();
  try {
    if (S.cfg && !S.cfg.news52) {
      S.cfg.news52 = 1;
      save('cfg');
      setTimeout(() => toast('Chat simplifié. Connecteurs dans le menu.'), 1200);
    }
  } catch (e) {}
  return r;
};

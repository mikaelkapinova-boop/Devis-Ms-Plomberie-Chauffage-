/* Assistant local déterministe : aucune requête vers un service de modèle ou de recherche. */
'use strict';

let LOCAL_ASSIST_BUSY = false;
let LOCAL_CORE_PROMISE = null;

function localCore() {
  if (!LOCAL_CORE_PROMISE) LOCAL_CORE_PROMISE = import(new URL('js/assistant-local-core.mjs', document.baseURI).href);
  return LOCAL_CORE_PROMISE;
}

function localAssistantSnapshot() {
  const docs = (S.docs || []).map(d => {
    let totals = {};
    try { totals = typeof tot === 'function' ? tot(d) : {}; } catch {}
    return {
      id:d.id, num:d.num, t:d.t, date:d.date, pd:d.pd, cn:d.cn, ca:d.ca, cc:d.cc, ct:d.ct,
      sn:d.sn, sa:d.sa, sc:d.sc, o:d.o, st:d.st, paid:!!d.paid, F:d.F || [], M:d.M || [],
      total:Number(totals.t) || 0, remaining:Number(totals.r) || Number(totals.t) || 0
    };
  });
  const reports = (S.rep || []).map(r => ({id:r.id,num:r.num,ty:r.ty,date:r.date,cn:r.cn,ca:r.ca,cc:r.cc,mo:r.mo,co:r.co,org:r.org,tr:r.tr,pr:r.pr}));
  const clients = (S.clients || []).map(c => ({id:c.id,n:c.n,a:c.a,c:c.c,t:c.t,e:c.e}));
  const cat = (S.cat || []).map(c => ({id:c.id,d:c.d,t:c.t,ref:c.ref,fo:c.fo,p:c.p,u:c.u}));
  const plan = (S.plan || []).map(p => ({id:p.id,date:p.date,hs:p.hs,he:p.he,cn:p.cn,sa:p.sa,o:p.o,nt:p.nt,st:p.st}));
  const achats = (S.achats || []).map(x => ({id:x.id,supplier:x.supplier,invoice:x.invoice,date:x.date,month:x.month,type:x.type,notes:x.notes,chantierName:x.chantierName,scope:x.scope,verified:x.verified,total:typeof expenseAmount==='function'?expenseAmount(x):(Number(x.ttc)||Number(x.ht)||0)}));
  return {docs,reports,clients,cat,plan,achats,today:typeof td==='function'?td():new Date().toISOString().slice(0,10)};
}

function localAttachmentKind(file) {
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (file.type?.startsWith('image/') || /^(png|jpe?g|webp|gif|bmp|heic|heif|tiff?)$/.test(ext)) return 'img';
  if (ext === 'docx') return 'docx';
  if (/^(txt|csv|tsv|md|html?)$/.test(ext) || file.type?.startsWith('text/')) return 'txt';
  return '';
}

async function localReadAttachments(files) {
  const texts = [], documents = [], errors = [];
  for (const attachment of files) {
    const file = attachment.f, kind = localAttachmentKind(file);
    if (!kind || !window.IMP?.extractText) { errors.push(file.name + ' : format non pris en charge'); continue; }
    try {
      const result = await window.IMP.extractText({id:'assistant-local-'+Date.now(),file,kind,prog:0});
      const text = String(result?.text || '').trim();
      if (text) {
        texts.push(`--- ${file.name} ---\n${text}`);
        try {
          if (typeof window.IMP.parse === 'function') documents.push({name:file.name, kind, text, parsed:window.IMP.parse(text,file.name,window.IMP.toRows?.(text))});
        } catch {}
      }
      else errors.push(file.name + ' : aucun texte extrait');
    } catch (error) {
      errors.push(file.name + ' : ' + String(error?.message || error).slice(0,120));
    }
  }
  return {texts,documents,errors};
}

function localNormalizeContact(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function localContactFromAttachment(document) {
  const text = String(document?.text || ''), lines = text.split(/\r?\n/).map(line => line.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
  const parsed = document?.parsed?.cli || {};
  const contact = {
    nom: String(parsed.name || '').trim(), adresse: String(parsed.addr || '').trim(),
    cp: String(parsed.cp || '').trim(), ville: String(parsed.ville || '').trim(),
    tel: String(parsed.tel || '').trim(), email: String(parsed.email || '').trim()
  };
  const emailRx = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phoneRx = /(?:\+33|0033|0)[ .()\-]?[1-9](?:[ .()\-]?\d{2}){4}\b/;
  const addressRx = /^\d{1,4}\s*(?:bis|ter)?[ ,]+(?:rue|avenue|av\.?|bd|boulevard|chemin|impasse|all[ée]e|place|route|r[ée]sidence|quai|cours|passage|square|lotissement)\b.*$/i;
  const nameRx = /^(?:client(?:e)?|nom(?:\s+(?:du|de la)\s+(?:client|contact|soci[ée]t[ée]|entreprise))?|contact|soci[ée]t[ée]|entreprise|raison sociale|[àa]\s*l'attention de)\s*[:\-]\s*(.+)$/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!contact.email) contact.email = line.match(emailRx)?.[0] || '';
    if (!contact.tel) contact.tel = line.match(phoneRx)?.[0] || '';
    if (!contact.nom) {
      const labelled = line.match(nameRx);
      if (labelled?.[1]?.trim()) contact.nom = labelled[1].trim();
      else if (/^(?:nom|client(?:e)?|contact|soci[ée]t[ée]|entreprise)\s*[:\-]?$/i.test(line)) {
        const next = lines[i + 1] || '';
        if (next && !emailRx.test(next) && !phoneRx.test(next)) contact.nom = next;
      } else {
        const titled = line.match(/^(?:m(?:onsieur|me|lle)?\.?|madame|monsieur)\s+(.+)$/i);
        if (titled?.[1]) contact.nom = titled[1].trim();
      }
    }
    if (!contact.cp) {
      const city = line.match(/\b(\d{5})\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’\- ]{1,})\s*$/);
      if (city) {
        contact.cp = city[1]; contact.ville = city[2].trim();
        const beforeCity = line.slice(0, city.index).trim().replace(/[,:;\-]+$/, '');
        if (!contact.adresse && beforeCity) contact.adresse = beforeCity;
      }
    }
    const addressLabel = line.match(/^(?:adresse|address|adr\.?)\s*[:\-]\s*(.+)$/i);
    if (!contact.adresse && addressLabel?.[1]) contact.adresse = addressLabel[1].trim();
    else if (!contact.adresse && addressRx.test(line)) contact.adresse = line;
  }
  if (!contact.nom) {
    const ownNames = [S.cfg?.co, S.cfg?.nm].map(localNormalizeContact).filter(Boolean);
    const candidate = lines.find(line => {
      if (line.length > 64 || /\d|@|https?:\/\/|www\./i.test(line) || emailRx.test(line) || phoneRx.test(line)) return false;
      if (/\b(?:tel(?:ephone)?|mobile|portable|fax|email|e-mail|adresse|address|code postal|siret|tva|www)\b/i.test(line)) return false;
      if (/\b(?:plomberie|chauffage|depannage|artisan|siret|rcs)\b/i.test(line)) return false;
      const words = line.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*/g) || [];
      return words.length >= 2 && words.length <= 4 && words.join(' ').length >= 4;
    });
    if (candidate && !ownNames.includes(localNormalizeContact(candidate))) contact.nom = candidate;
  }
  contact.cp_ville = [contact.cp, contact.ville].filter(Boolean).join(' ');
  return contact;
}

function localSaveDetectedContacts(extracted) {
  const docs = (extracted.documents || []).map(localContactFromAttachment);
  const candidates = docs.filter(c => c.adresse || c.cp_ville || c.tel || c.email || c.nom);
  if (!candidates.length) return [];
  if (!Array.isArray(S.clients)) S.clients = [];
  const named = new Map();
  for (const contact of candidates.filter(c => c.nom)) {
    const key = localNormalizeContact(contact.nom);
    if (!key) continue;
    const old = named.get(key) || { ...contact };
    for (const field of ['adresse','cp','ville','cp_ville','tel','email']) if (!old[field] && contact[field]) old[field] = contact[field];
    named.set(key, old);
  }
  const anonymous = candidates.filter(c => !c.nom);
  if (named.size === 1) {
    const only = named.values().next().value;
    for (const contact of anonymous) for (const field of ['adresse','cp','ville','cp_ville','tel','email']) if (!only[field] && contact[field]) only[field] = contact[field];
  }
  if (!named.size) return ['J’ai lu des coordonnées sur la photo, mais pas assez clairement le nom du client. Envoie son nom pour que je crée sa fiche.'];
  const notices = [];
  for (const contact of named.values()) {
    const coordinates = [contact.adresse, contact.cp_ville, contact.tel, contact.email].filter(Boolean);
    if (!coordinates.length) continue;
    const phoneKey = String(contact.tel || '').replace(/\D/g, '');
    const emailKey = String(contact.email || '').trim().toLowerCase();
    let client = S.clients.find(c => localNormalizeContact(c.n) === localNormalizeContact(contact.nom));
    if (!client && (phoneKey || emailKey)) client = S.clients.find(c =>
      (emailKey && String(c.e || '').trim().toLowerCase() === emailKey) ||
      (phoneKey && String(c.t || '').replace(/\D/g, '') === phoneKey)
    );
    const created = !client;
    if (!client) { client = {id: 'cli_' + Math.random().toString(36).slice(2,10), n: contact.nom, a:'', c:'', t:'', e:''}; S.clients.push(client); }
    if (!client.n) client.n = contact.nom;
    const values = {a:contact.adresse, c:contact.cp_ville, t:contact.tel, e:contact.email};
    for (const [field, value] of Object.entries(values)) if (value && (!client[field] || localNormalizeContact(client[field]) === localNormalizeContact(value))) client[field] = value;
    if (typeof save === 'function') save('clients');
    notices.push(`Fiche client ${created ? 'créée' : 'mise à jour'} : ${client.n}${coordinates.length ? ' · ' + coordinates.join(' · ') : ''}.`);
  }
  return notices;
}

function localLooksLikeList(text, hasFile) {
  return hasFile || /[;|\t]|€|\b\d+(?:[,.]\d+)?\s*(?:x|×|\*|h|heures?|u|unit[ée]s?|pcs?|pi[èe]ces?|ml|m²?|kg|l)\b/i.test(text)
    || (/\n/.test(text) && /^\s*(?:liste|fournitures?|mat[ée]riels?|main[- ]d['’]?oeuvre)\s*:?/im.test(text));
}

async function smartLocalSend() {
  if (LOCAL_ASSIST_BUSY || ASBUSY) return;
  const textarea = document.getElementById('cin');
  const text = String(textarea?.value || '').trim();
  const files = Array.isArray(ATT) ? ATT.slice() : [];
  if (!text && !files.length) { toast('Écris une demande ou joins un fichier'); return; }
  const thread = typeof TH === 'function' ? TH() : null;
  if (thread && DEM[thread.k]?.mod && !files.length) {
    chatPush({r:'u',t:text || '(fichier joint)',att:files.map(a=>({n:a.f.name,k:a.k}))});
    ATT = [];
    chatPush({r:'a',t:'Le mode local peut retrouver le document et préparer des lignes, mais il ne modifie pas automatiquement une facture ou un devis existant. Ouvre le document pour le modifier manuellement.',via:'Assistant local'});
    if (textarea) { textarea.value=''; cinGrow(textarea); }
    render();
    return;
  }

  chatPush({r:'u',t:text || '(fichier joint)',att:files.map(a=>({n:a.f.name,k:a.k}))});
  ATT = [];
  if (textarea) { textarea.value=''; cinGrow(textarea); }
  draftClear('cin');
  LOCAL_ASSIST_BUSY = true; ASBUSY = true; render();
  try {
    const extracted = await localReadAttachments(files);
    const clientNotices = localSaveDetectedContacts(extracted);
    const input = [text,...extracted.texts].filter(Boolean).join('\n\n').slice(0,50000);
    if (!input) {
      chatPush({r:'a',t:[...clientNotices,`Je n’ai pas pu lire le texte joint.${extracted.errors.length ? '\n'+extracted.errors.join('\n') : ''}\n\nLe fichier n’a pas été envoyé à un service IA externe.`].join('\n\n'),via:'Assistant local'});
      return;
    }

    if (thread && DEM[thread.k]?.mod) {
      const limitation = 'Le mode local peut lire les coordonnées et créer une fiche client, mais il ne modifie pas automatiquement un devis ou une facture existants.';
      chatPush({r:'a',t:[...clientNotices,limitation].join('\n\n'),via:'Assistant local'});
      return;
    }

    const core = await localCore();
    let quote = null;
    const explicitDocumentRequest = /\b(?:devis|facture|chiffr|chiffrage|chiffrer|preparer|prepare|creer|cree)\b/i.test(text);
    if (files.length && explicitDocumentRequest) {
      const parsedFiles = extracted.documents.map(x=>x.parsed).filter(x=>x && (x.type==='d'||x.type==='f'));
      const rows = parsedFiles.flatMap(d=>d.lines||[]).filter(x=>x.des).map(x=>({d:x.des,q:Number(x.q)||1,p:Number(x.pu)||''}));
      if (rows.length) {
        const F=[],M=[];
        parsedFiles.flatMap(d=>d.lines||[]).filter(x=>x.des).forEach(x=>((x.kind==='M'?M:F).push({d:x.des,q:Number(x.q)||1,p:Number(x.pu)||''})));
        const cli = parsedFiles.find(d=>d.cli?.name)?.cli || {};
        quote = {client:{nom:cli.name||'',adresse:cli.addr||'',cp_ville:[cli.cp,cli.ville].filter(Boolean).join(' '),tel:cli.tel||''},objet:'Travaux à chiffrer',F,M};
      }
    } else if (!files.length && localLooksLikeList(input, false) && typeof parseList === 'function') {
      const parsed = parseList(input);
      const clean = list => list.filter(line=>line.d&&!/^(?:fournitures?|mat[ée]riels?|main[- ]d['’]?oeuvre|total|d[ée]signation)$/i.test(line.d.trim()));
      const F=clean(parsed.F),M=clean(parsed.M);
      if ((F.length + M.length) > 0) {
        quote = {client:{},objet:'Travaux à chiffrer',F,M};
        const client = input.match(/(?:client|pour)\s*[:\-]?\s*([^\n,;]+)/i);
        if (client) {
          const candidate = client[1].trim();
          const found = (S.clients || []).find(c => String(c.n || '').toLowerCase() === candidate.toLowerCase());
          if (found) quote.client = {nom:found.n,adresse:found.a||'',cp_ville:found.c||'',tel:found.t||''};
        }
      }
    }
    const reply = await core.answerLocal(input,localAssistantSnapshot(),quote);
    if (clientNotices.length) reply.text = clientNotices.join('\n') + '\n\n' + reply.text;
    if (extracted.errors.length) reply.text += '\n\nFichiers à revoir : '+extracted.errors.join(' · ');
    if (reply.page && typeof go === 'function') go(reply.page);
    chatPush({r:'a',t:reply.text || 'Terminé.',q:reply.quote, matches:reply.matches,via:'Assistant local · Fuse.js'});
  } catch (error) {
    chatPush({r:'a',t:'Le moteur local n’a pas pu terminer cette demande : '+String(error?.message || error).slice(0,220)+'. Tes données n’ont pas été envoyées.',via:'Assistant local'});
  } finally {
    LOCAL_ASSIST_BUSY = false; ASBUSY = false; render();
  }
}

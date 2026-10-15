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
          if (typeof window.IMP.parse === 'function') documents.push({name:file.name, parsed:window.IMP.parse(text,file.name,window.IMP.toRows?.(text))});
        } catch {}
      }
      else errors.push(file.name + ' : aucun texte extrait');
    } catch (error) {
      errors.push(file.name + ' : ' + String(error?.message || error).slice(0,120));
    }
  }
  return {texts,documents,errors};
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
  if (thread && DEM[thread.k]?.mod) {
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
    const input = [text,...extracted.texts].filter(Boolean).join('\n\n').slice(0,50000);
    if (!input) {
      chatPush({r:'a',t:`Je n’ai pas pu lire le texte joint.${extracted.errors.length ? '\n'+extracted.errors.join('\n') : ''}\n\nLe fichier n’a pas été envoyé à un service externe.`,via:'Assistant local'});
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
    if (extracted.errors.length) reply.text += '\n\nFichiers à revoir : '+extracted.errors.join(' · ');
    if (reply.page && typeof go === 'function') go(reply.page);
    chatPush({r:'a',t:reply.text || 'Terminé.',q:reply.quote, matches:reply.matches,via:'Assistant local · Fuse.js'});
  } catch (error) {
    chatPush({r:'a',t:'Le moteur local n’a pas pu terminer cette demande : '+String(error?.message || error).slice(0,220)+'. Tes données n’ont pas été envoyées.',via:'Assistant local'});
  } finally {
    LOCAL_ASSIST_BUSY = false; ASBUSY = false; render();
  }
}

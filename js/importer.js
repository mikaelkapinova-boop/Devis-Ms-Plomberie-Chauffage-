/* Import intelligent — Ms Plomberie & Chauffage
   Fichier (PDF, scan, photo, Word, texte) → texte → extraction des champs →
   vérification modifiable → création du devis / de la facture / du rapport
   dans la mise en page de l'application, puis aperçu et PDF. */
'use strict';
const IM={res:[],i:0,busy:false,mode:'auto'};
const imEsc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const imNorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const imScripts={};
function imLoad(src,test){if(test())return Promise.resolve(true);if(imScripts[src])return imScripts[src];return imScripts[src]=new Promise(ok=>{const s=document.createElement('script');s.src=src;s.onload=()=>ok(test());s.onerror=()=>ok(false);document.head.appendChild(s)})}
const imPdfJs=async()=>{await imLoad('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',()=>!!window.pdfjsLib);if(!window.pdfjsLib)return null;pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';return pdfjsLib};
const imOcrLib=()=>imLoad('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',()=>!!window.Tesseract);
const imMammoth=()=>imLoad('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js',()=>!!window.mammoth);

/* ---------- Lecture des fichiers → texte ---------- */
async function imOcr(src,label){
  if(!await imOcrLib())throw new Error('OCR indisponible (connexion requise pour lire les scans)');
  imStatus('Lecture du scan'+(label?' '+label:'')+'…');
  const o=await Tesseract.recognize(src,'fra+eng');return o?.data?.text||'';
}
async function imPdfText(file){
  const lib=await imPdfJs();if(!lib)throw new Error('Lecteur PDF indisponible (connexion requise)');
  const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise,out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p),tc=await page.getTextContent(),rows=[];
    for(const it of tc.items){const t=String(it.str||'');if(!t.trim())continue;const x=it.transform[4],y=it.transform[5],w=it.width||0;let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r)rows.push(r={y,c:[]});r.c.push({x,w,t})}
    rows.sort((a,b)=>b.y-a.y);
    out.push(rows.map(r=>{r.c.sort((a,b)=>a.x-b.x);let s='',end=null;for(const c of r.c){if(end!==null)s+=(c.x-end>14?'\t':(c.x-end>1?' ':''));s+=c.t;end=c.x+c.w}return s.trim()}).join('\n'));
  }
  let text=out.join('\n');
  if(text.replace(/\s/g,'').length<40){ /* PDF scanné : OCR page par page */
    text='';for(let p=1;p<=Math.min(pdf.numPages,8);p++){const page=await pdf.getPage(p),vp=page.getViewport({scale:2}),cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;text+=await imOcr(cv,p+'/'+pdf.numPages)+'\n'}
  }
  return text;
}
async function imDocxText(file){
  if(!await imMammoth())throw new Error('Lecteur Word indisponible (connexion requise)');
  const r=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()}),d=new DOMParser().parseFromString(r.value,'text/html'),lines=[];
  d.body.childNodes.forEach(nd=>{
    if(nd.nodeName==='TABLE')nd.querySelectorAll('tr').forEach(tr=>lines.push([...tr.children].map(c=>c.textContent.trim()).join('\t')));
    else if(nd.nodeName==='UL'||nd.nodeName==='OL')nd.querySelectorAll('li').forEach(li=>lines.push(li.textContent.trim()));
    else lines.push(nd.textContent.trim());
  });
  return lines.filter(Boolean).join('\n');
}
async function imExtractText(file){
  const nm=file.name.toLowerCase();
  if(/\.pdf$/.test(nm)||file.type==='application/pdf')return imPdfText(file);
  if(/\.docx$/.test(nm))return imDocxText(file);
  if(/\.doc$/.test(nm))throw new Error('Format .doc non lisible : enregistrez-le en .docx ou PDF');
  if(/\.(png|jpe?g|webp|bmp|gif)$/.test(nm)||file.type.startsWith('image/'))return imOcr(file);
  if(/\.(txt|csv|vcf)$/.test(nm)||file.type.startsWith('text/'))return file.text();
  throw new Error('Format non pris en charge');
}

/* ---------- Extraction intelligente ---------- */
const imNum=s=>{s=String(s).replace(/[€\s\u00a0]/g,'');if(!s)return NaN;const c=s.lastIndexOf(','),d=s.lastIndexOf('.');
  if(c>-1&&d>-1)s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(c>-1)s=s.replace(',','.');else if(d>-1&&/\.\d{3}$/.test(s)&&s.split('.').length>1&&!/\.\d{3}\./.test(s)&&s.length>5)s=s.replace(/\./g,'');
  return parseFloat(s)};
const IM_MONTHS={janvier:1,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,septembre:9,octobre:10,novembre:11,decembre:12};
function imDate(s){
  const valid=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);const date=new Date(Date.UTC(y,m-1,d));return y>=1900&&y<=2200&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:''};
  s=imNorm(s);let m=s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/);if(m)return valid(m[3].length===2?'20'+m[3]:m[3],m[2],m[1]);
  m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);if(m)return valid(m[1],m[2],m[3]);
  m=s.match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);if(m)return valid(m[3],IM_MONTHS[m[2]],m[1]);return''
}
const IM_STREET=/(\d{1,4}\s*(?:bis|ter)?[, ]+\s*(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|all[ée]e|place|quai|cours|r[ée]sidence|lotissement|square|passage|villa|cit[ée])\s+[^,\n\t]{2,60})/i;
const IM_CITY=/\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ \-]{1,40})/;
const IM_UNIT_M=/\b(h|heures?|hr)\b/i;
const IM_LABOR=/main[\s-]*d.?\s*oeuvre|pose\b|d[ée]pose|installation|intervention|d[ée]placement|forfait|mise en service|recherche|d[ée]pannage|remplacement|raccordement|nettoyage|diagnostic|r[ée]paration|vidange|d[ée]sembouage|entretien|contr[ôo]le|d[ée]bouchage|main d/i;
const IM_SKIP=/^(total|sous[\s-]?total|net |tva|t\.v\.a|remise|acompte|reste|montant|base|d[ée]signation|description|libell[ée]|quantit|qt[ée]|prix|p\.?u\.?|page|siret|iban|bic|rib|conditions|r[èe]glement|paiement|validit[ée]|bon pour|date|devis|facture|signature|mention|ape|naf|n[°o] ?tva|code|t[ée]l\b|t[ée]l[ée]phone|e-?mail|adresse|client|objet|chantier|mobile|fax)/i;
function imOwnValues(){
  const C=window.S?.cfg||{};
  return{company:[C.co,'Ms Plomberie & Chauffage'],name:[C.nm,'Mikael SALILLARI'],phone:[C.tel],email:[C.ml,C.mail,C.em,C.email],address:[C.ad,"285 rue Jeanne d'Arc"],siret:[C.siret]}
}
function imIsOwn(field,value){
  const raw=String(value||'').trim();if(!raw)return false;
  const vals=imOwnValues()[field]||[],norm=imNorm(raw),digits=raw.replace(/\D/g,'');
  return vals.some(x=>{
    if(!x||String(x).trim().length<3)return false;
    const expected=imNorm(x);
    if(field==='phone'||field==='siret'){
      const d=String(x).replace(/\D/g,'');return d.length>=9&&digits===d;
    }
    return norm===expected;
  });
}
function imOwn(){
  const vals=Object.values(imOwnValues()).flat().filter(x=>x&&String(x).length>3).map(imNorm);
  return t=>{const n=imNorm(t),d=n.replace(/\D/g,'');return vals.some(x=>n.includes(x)||(x.replace(/\D/g,'').length>=9&&d.includes(x.replace(/\D/g,''))))}
}
function imParseLine(line){
  const cells=line.split('\t').map(x=>x.trim()).filter(Boolean);let txt=cells.join('  ');
  txt=txt.replace(/(\d)\s*%/g,'$1%');
  const numRe=/(?<![\w\/.,-])-?\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{1,3})?(?![\w\/%])|(?<![\w\/.,-])-?\d+(?:[.,]\d{1,3})?(?![\w\/%])/g,found=[];
  let m;while((m=numRe.exec(txt))){const after=txt.slice(m.index+m[0].length,m.index+m[0].length+3);found.push({s:m.index,e:m.index+m[0].length,v:imNum(m[0]),dec:/[.,]\d{2}$/.test(m[0]),eur:/^\s*€/.test(after)||/€\s*$/.test(txt.slice(Math.max(0,m.index-2),m.index))})}
  /* ne garder que les nombres de fin de ligne (colonnes qté / PU / total) */
  const tail=[];for(let k=found.length-1;k>=0;k--){const gap=tail.length?txt.slice(found[k].e,tail[0].s):txt.slice(found[k].e);if(/^[\s€\u00a0xX×a-zA-Z.]{0,6}$/.test(gap)&&(tail.length<4))tail.unshift(found[k]);else break}
  if(!tail.length)return null;
  let desc=txt.slice(0,tail[0].s).replace(/[|·•\t]+/g,' ').replace(/\s{2,}/g,' ').replace(/^[\s\-–—*•\d.)]+(?=[A-Za-zÀ-ÿ])/,'').trim();
  const afterNums=txt.slice(tail[tail.length-1].e).trim(),unitM=IM_UNIT_M.test(afterNums)||IM_UNIT_M.test(txt.slice(tail[0].e,tail[0].e+4));
  if(desc.length<3||!/[A-Za-zÀ-ÿ]{3}/.test(desc))return null;
  const v=tail.map(x=>x.v).filter(x=>Number.isFinite(x));let q=1,p=0,total=null;
  if(v.length>=3){const[a,b,c]=v.slice(-3);if(Math.abs(a*b-c)<=.02+c*.01){q=a;p=b;total=c}else if(Math.abs(b*c-a)<=.02+a*.01){q=b;p=c;total=a}else{q=a;p=b;total=c}}
  else if(v.length===2){const[a,b]=v,aInt=Number.isInteger(a)&&!tail[tail.length-2].dec;if(aInt&&a>0&&a<1000&&(!tail[tail.length-2].eur)){q=a;p=b/a;total=b}else{p=a;total=b;q=a&&Math.abs(b/a-Math.round(b/a))<.001?Math.round(b/a):1;if(q!==1)p=a;else p=b}}
  else{if(!tail[0].dec&&!tail[0].eur)return null;p=v[0];total=p}
  if(!(p>=0)||p>1e6)return null;
  return{d:desc.replace(/\s*[xX×]$/,'').trim(),q:Math.round(q*100)/100,p:Math.round(p*100)/100,k:(unitM||IM_LABOR.test(desc))?'M':'F'};
}
function imParse(text,filename){
  const raw=String(text||'').replace(/\r/g,'').replace(/[\u00a0\u202f]/g,' '),lines=raw.split('\n').map(l=>l.replace(/[ ]{2,}/g,'\t').replace(/\t+/g,'\t').trim()).filter(Boolean);
  const own=imOwn(),flat=lines.map(l=>l.replace(/\t/g,' ')),W=[];
  const head=flat.slice(0,25).join('\n'),all=flat.join('\n'),nAll=imNorm(all),nHead=imNorm(head);
  /* type */
  const score={f:(nAll.match(/factur/g)||[]).length+(nHead.match(/factur/g)||[]).length*3,d:(nAll.match(/devis/g)||[]).length+(nHead.match(/devis/g)||[]).length*3,x:(nAll.match(/rapport|compte[- ]rendu|constat|sinistre/g)||[]).length+(nHead.match(/rapport|compte[- ]rendu/g)||[]).length*3};
  const fn=imNorm(filename);if(/factur|\bfac[\s_-]?\d/.test(fn))score.f+=4;if(/devis|\bdev[\s_-]?\d/.test(fn))score.d+=4;if(/rapport|constat/.test(fn))score.x+=4;
  let t=score.x>score.f&&score.x>score.d?'x':score.f>score.d?'f':'d';
  /* numéro */
  let num='';for(const re of[/(?:devis|facture|rapport|avoir)\s*(?:n[°ºo]?|num[ée]ro|ref\.?|r[ée]f[ée]rence)?\s*[:#]?\s*([A-Z]{0,5}[-_/]?\d[\w\-_/]{2,})/i,/\bn[°ºo]\s*(?:de\s+\w+\s*)?[:#]?\s*([A-Z0-9][\w\-/]{2,})/i,/\b((?:DEV|FAC|FA|RAP)[-_]?\d{2,}[\w\-_/]*)/i]){const m=all.match(re);if(m&&/\d/.test(m[1])){num=m[1].toUpperCase();break}}
  if(!num){const m=String(filename).match(/((?:DEV|FAC|RAP)[-_]?[\w-]*\d[\w-]*)/i);if(m)num=m[1].toUpperCase()}
  /* date */
  let date='';const dl=flat.find(l=>/\b(date|[ée]mis|[ée]tabli|fait le|le )\b/i.test(l)&&imDate(l));date=dl?imDate(dl):imDate(head)||imDate(all);
  /* coordonnées client */
  let cn='',ca='',cc='',ct='',ce='',sn='',o='';
  const cliRe=/^(?:client|destinataire|factur[ée]\s*[àa]|adress[ée]\s*[àa]|[àa] l.attention de|nom du client|ma[iî]tre d.ouvrage)\s*[:\-]?\s*(.*)$/i;
  let ci=-1,clientLabel=-1;
  for(let k=0;k<flat.length;k++){
    const m=flat[k].match(cliRe);if(!m||own(flat[k]))continue;
    clientLabel=k;
    const inline=m[1].trim();
    if(inline&&!/^(adresse|t[ée]l|e-?mail)/i.test(inline)&&!own(inline))cn=inline;
    else for(let j=k+1;j<Math.min(k+6,flat.length);j++){
      const candidate=flat[j].replace(/^(?:nom(?:\s+du\s+client)?|client)\s*[:\-]\s*/i,'').trim();
      if(!candidate||own(candidate)||/^(adresse|t[ée]l|e-?mail|mobile|chantier|objet|date|devis|facture|siret)\b/i.test(candidate))continue;
      if(/^[\d\s+()./-]+$/.test(candidate))continue;
      cn=candidate;ci=j;break;
    }
    if(ci<0)ci=k;
    break;
  }
  cn=cn.split(/\s{2,}|\t|\s+(?:adresse|t[ée]l|e-?mail)\b/i)[0].replace(/^(?:nom|client)\s*[:\-]\s*/i,'').trim();
  if(cn.length>60||/\d{5}/.test(cn)||/^(devis|facture|rapport)/i.test(cn)||imIsOwn('company',cn)||imIsOwn('name',cn))cn='';
  let zoneLines=[];
  if(clientLabel>-1){
    for(let k=clientLabel;k<Math.min(clientLabel+10,flat.length);k++){
      const line=flat[k],norm=imNorm(line);
      if(k>clientLabel&&/^(?:adresse du chantier|chantier|lieu des travaux|objet|travaux|total|devis|facture|rapport|conditions|r[ée]glement|nos coordonn[ée]es|coordonn[ée]es de l.entreprise|siret de l.entreprise)\b/.test(norm))break;
      if(!own(line))zoneLines.push(line);
    }
  }
  const zone=zoneLines.join('\n');
  const emailMatch=zone.match(/[\w.+-]+@[\w-]+\.[\w.-]+/),em=emailMatch&&!imIsOwn('email',emailMatch[0])?emailMatch[0]:'';ce=em;
  const phoneMatch=zone.match(/(?:\+33\s?[1-9]|0[1-9])(?:[ .\-]?\d{2}){4}/),ph=phoneMatch&&!imIsOwn('phone',phoneMatch[0])?phoneMatch[0]:'';ct=ph;
  const st=zone.match(IM_STREET);if(st&&!imIsOwn('address',st[1]))ca=st[1].replace(IM_CITY,'').replace(/[,\s]+$/,'').trim();
  const labAdr=zone.match(/adresse(?: de facturation| du client)?\s*[:\-]\s*([^\n]+)/i);
  if(!ca&&labAdr&&!imIsOwn('address',labAdr[1]))ca=labAdr[1].replace(IM_CITY,'').replace(/[,\s]+$/,'').trim();
  const cm=(st?zone.slice(zone.indexOf(st[0])):zone).match(IM_CITY);
  if(cm&&!imIsOwn('address',cm[0]))cc=cm[1]+' '+cm[2].trim().replace(/\s+(t[ée]l|e-?mail).*$/i,'');
  if(!cn)W.push(clientLabel<0?'Client non reconnu : aucun bloc « Client / Destinataire » clairement identifié. Saisissez-le ci-dessous pour éviter de reprendre les coordonnées de l’entreprise.':'Client incertain : vérifiez son nom et ses coordonnées avant de créer le document.');
  /* chantier / objet */
  let m=all.match(/(?:objet|intitul[ée]|travaux)\s*[:\-]\s*([^\n]{3,120})/i);if(m)o=m[1].trim();
  m=all.match(/(?:chantier|lieu (?:des travaux|d.intervention)|adresse (?:du chantier|des travaux|d.intervention))\s*[:\-]\s*([^\n]{3,120})/i);if(m)sn=m[1].trim();
  /* totaux */
  const lastAmt=re=>{for(const l of flat){if(!re.test(imNorm(l)))continue;const a=[...l.matchAll(/-?\d[\d .]*[.,]\d{2}/g)].map(x=>imNum(x[0])).filter(Number.isFinite);if(a.length)return a[a.length-1]}return null};
  const totHT=lastAmt(/total\s*(?:net\s*)?h\.?t|montant\s*h\.?t|total\s*net\s*(?:a payer)?\s*h?t?\b/),totTTC=lastAmt(/total\s*t\.?t\.?c|net\s*a\s*payer|montant\s*t\.?t\.?c/),totTVA=lastAmt(/^\W*(?:total\s*)?t\.?v\.?a\b/);
  let tva=0;m=all.match(/t\.?v\.?a[^\n\d]{0,25}(\d{1,2}(?:[.,]\d+)?)\s*%/i);if(m)tva=imNum(m[1]);else if(/tva non applicable|art(?:icle)?\.?\s*293\s*b/i.test(all))tva=0;else if(totHT&&totTTC&&totTTC>totHT)tva=Math.round((totTTC/totHT-1)*1000)/10;
  let rm=0;m=all.match(/remise[^\n\d]{0,20}(\d{1,2}(?:[.,]\d+)?)\s*%/i);if(m)rm=imNum(m[1]);
  /* lignes */
  const F=[],M=[];let sec='';
  for(const ln of lines){const f=imNorm(ln.replace(/\t/g,' '));
    if(/^\W*\d?\W*(main[\s-]*d.?oeuvre|prestations?|travaux|services?|pose|interventions?)\b.{0,25}$/.test(f)&&!/\d[.,]\d{2}/.test(f)){sec='M';continue}
    if(/^\W*\d?\W*(fournitures?|mat[ée]riels?|mat[ée]riaux|pi[èe]ces?|[ée]quipements?)\b.{0,25}$/.test(f)&&!/\d[.,]\d{2}/.test(f)){sec='F';continue}
    if(/^\W*\d?\W*(synth[èe]se|conditions|r[èe]glement|total|r[ée]capitulatif)/.test(f)){sec='';if(/^\W*total/.test(f))continue}
    if(IM_SKIP.test(f)||/siret|iban|@|www\./.test(f)||own(ln))continue;
    if(ln.trim()===cn||IM_CITY.test(ln)&&!/[€]/.test(ln)&&!/\d[.,]\d{2}/.test(ln))continue;
    const it=imParseLine(ln);if(!it)continue;
    if(sec&&!IM_UNIT_M.test(ln))it.k=sec;(it.k==='M'?M:F).push({d:it.d,q:it.q,p:it.p});
  }
  const items=[...M,...F],sum=items.reduce((s,x)=>s+x.q*x.p,0);
  if(t!=='x'&&!items.length)W.push('Aucune ligne de prestation ou de fourniture reconnue : ajoutez-les ci-dessous.');
  const net=sum*(1-rm/100);
  if(t!=='x'&&totHT&&items.length&&Math.abs(net-totHT)>Math.max(.05,totHT*.005))W.push('Le total des lignes ('+net.toFixed(2)+' €) diffère du total HT du document ('+totHT.toFixed(2)+' €) : vérifiez les lignes.');
  if(!num)W.push('Numéro du document absent : un numéro sera attribué automatiquement.');
  if(!date)W.push('Date absente : la date du jour sera utilisée.');
  if(cn&&!ca)W.push('Adresse du client non reconnue.');
  /* rapport */
  const R={ty:'Autre',ass:'',mo:'',co:'',org:'',tr:'',pr:''};
  if(t==='x'||score.x>0){
    const nt=imNorm(all);R.ty=/degat des eaux|infiltration|sinistre/.test(nt)?'Dégât des eaux':/fuite/.test(nt)?'Recherche de fuite':/chauffage|chaudiere|radiateur/.test(nt)?'Panne de chauffage':/diagnostic/.test(nt)?'Diagnostic plomberie':'Autre';
    const heads=[['mo',/motif|circonstances|contexte|objet de l.intervention|demande/],['co',/constat|observations?|description|d[ée]sordres/],['org',/origine|cause/],['tr',/travaux (?:r[ée]alis|effectu)|mesures|intervention r[ée]alis|r[ée]alis[ée]/],['pr',/pr[ée]conisation|recommandation|suite [àa] donner|travaux [àa] pr[ée]voir/]];
    let cur=null;const buf={mo:[],co:[],org:[],tr:[],pr:[],_:[]};
    for(const l of flat){const nl=imNorm(l).replace(/^[\W\d]+/,'').trim();const h=heads.find(([k,re])=>nl.length<70&&re.test(nl.split(/[:\-]/)[0]));
      if(h){cur=h[0];const rest=l.split(/[:：]/).slice(1).join(':').trim();if(rest)buf[cur].push(rest);continue}
      if(/^(client|adresse|t[ée]l|e-?mail|siret|date)\b/i.test(l)||own(l))continue;(cur?buf[cur]:buf._).push(l)}
    for(const k of['mo','co','org','tr','pr'])R[k]=buf[k].join('\n');
    if(!heads.some(([k])=>R[k]))R.co=buf._.filter(l=>l!==cn&&!/^(rapport|compte)/i.test(l)).join('\n');
    m=all.match(/assurance\s*[:\-]\s*([^\n]{2,60})/i);if(m)R.ass=m[1].trim();
    m=all.match(/(?:n[°º]?\s*(?:de\s*)?sinistre|sinistre\s*n[°º]?)\s*[:\-]?\s*([\w\-/]{3,})/i);if(m)sn=m[1];
    if(t==='x'&&!Object.values(R).slice(2).some(Boolean))W.push('Peu de texte exploitable pour le rapport : complétez les rubriques.');
  }
  return{t,num,date,cn,ca,cc,ct,ce,sn,o,F,M,tva,rm,totHT,totTTC,totTVA,R,W,textLen:raw.trim().length,raw:raw.trim()};
}

function imCsvRows(text){
  const source=String(text||'').replace(/^\uFEFF/,'');
  const first=source.split(/\r?\n/).find(Boolean)||'';
  let delim=';',best=-1,quoted=false,counts={';':0,',':0,'\t':0};
  for(const ch of first){if(ch==='"')quoted=!quoted;else if(!quoted&&Object.prototype.hasOwnProperty.call(counts,ch))counts[ch]++}
  for(const d of Object.keys(counts))if(counts[d]>best){best=counts[d];delim=d}
  const rows=[],row=[];let cell='',inQuote=false;
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(ch==='"'){if(inQuote&&source[i+1]==='"'){cell+='"';i++}else inQuote=!inQuote}
    else if(ch===delim&&!inQuote){row.push(cell.trim());cell=''}
    else if((ch==='\n'||ch==='\r')&&!inQuote){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push([...row]);row.length=0;cell=''}
    else cell+=ch;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
const imHeaderKey=s=>imNorm(s).replace(/[^a-z0-9]/g,'');
function imDataImport(text,name,mode){
  const base={kind:'data',name,dataType:mode,entries:[],raw:String(text||'').trim()};
  if(mode==='object'){
    if(base.raw)base.entries=[{text:base.raw}];
    else base.err='Aucun texte exploitable.';
    return base;
  }
  if(mode==='client'&&/\.vcf$/i.test(name)){
    const unescape=v=>String(v||'').replace(/\\n/gi,' ').replace(/\\([,;])/g,'$1').trim();
    const cards=base.raw.split(/BEGIN:VCARD/i).slice(1);
    cards.forEach(card=>{
      const lines=card.split(/\r?\n/),props={};
      for(const line of lines){const m=line.trim().match(/^([a-z-]+)(?:;[^:]*)?:(.*)$/i);if(m)(props[m[1].toUpperCase()]||=[]).push(unescape(m[2]))}
      const adr=(props.ADR||[])[0]?.split(';')||[],name=(props.N||[])[0]?.split(';')||[],entry={
        n:(props.FN||[])[0]||[name[1],name[2],name[0]].filter(Boolean).join(' ').trim(),
        a:adr[2]||'',c:[adr[5],adr[3]].filter(Boolean).join(' '),t:(props.TEL||[])[0]||'',e:(props.EMAIL||[])[0]||''
      };
      if(entry.n)base.entries.push(entry);
    });
    if(!base.entries.length)base.err='Aucun contact reconnu dans ce fichier VCF.';
    return base;
  }
  const rows=imCsvRows(text),aliases=mode==='client'
    ?{n:['nom','name','client','raison sociale','entreprise','fullname'],a:['adresse','address','rue'],c:['code postal ville','ville','city','postal code','code postal'],t:['telephone','tel','phone','mobile'],e:['email','e mail','courriel']}
    :{d:['designation','description','article','produit','libelle','name','prestation'],q:['quantite','quantity','qty','qte'],p:['prix unitaire ht','prix unitaire','price','prix','pu','montant','total']};
  const keys=Object.keys(aliases),header=rows[0]?.map(imHeaderKey)||[],indices={};
  keys.forEach(k=>{indices[k]=header.findIndex(h=>aliases[k].some(a=>h===imHeaderKey(a)||h.startsWith(imHeaderKey(a))))});
  const hasHeader=Object.values(indices).some(i=>i>=0),dataRows=hasHeader?rows.slice(1):rows;
  if(mode==='client'){
    if(!hasHeader&&dataRows.length===1){
      const parsed=imParse(text,name);
      if(parsed.cn)base.entries.push({n:parsed.cn,a:parsed.ca,c:parsed.cc,t:parsed.ct,e:parsed.ce});
      else dataRows.forEach(row=>{const e={n:row[0]||'',a:row[1]||'',c:row[2]||'',t:row[3]||'',e:row[4]||''};if(e.n)base.entries.push(e)});
    }else if(!hasHeader)dataRows.forEach(row=>{const e={n:row[0]||'',a:row[1]||'',c:row[2]||'',t:row[3]||'',e:row[4]||''};if(e.n)base.entries.push(e)});
    else dataRows.forEach(row=>{
      const e={n:'',a:'',c:'',t:'',e:''};keys.forEach(k=>{if(indices[k]>=0)e[k]=row[indices[k]]||''});
      if(mode==='client'){
        const postal=header.findIndex(h=>['codepostal','cp','postalcode','zip','zipcode'].includes(h)),city=header.findIndex(h=>['ville','city','commune'].includes(h));
        if(postal>=0||city>=0)e.c=[postal>=0?row[postal]:'',city>=0?row[city]:''].filter(Boolean).join(' ');
      }
      if(e.n)base.entries.push(e);
    });
  }else{
    dataRows.forEach(row=>{
      let entry;
      if(hasHeader){
        entry={d:indices.d>=0?row[indices.d]||'':row[0]||'',q:indices.q>=0?imNum(row[indices.q])||1:1,p:indices.p>=0?imNum(row[indices.p]):NaN};
      }else{
        const quantity=row.length>2?imNum(row[1]):NaN,price=row.length>2?imNum(row[2]):row.length===2?imNum(row[1]):NaN;
        if(row.length>1&&Number.isFinite(price)&&row.slice(0,-(row.length>2?2:1)).join(' ').trim()){
          entry={d:row.slice(0,-(row.length>2?2:1)).join(' '),q:Number.isFinite(quantity)?quantity:1,p:price};
        }
        const parsed=entry?null:imParseLine(row.join('\t'));
        if(parsed)entry={d:parsed.d,q:parsed.q,p:parsed.p};
        else if(!entry){
          const nums=row.map(imNum).filter(Number.isFinite),desc=row.find(c=>!Number.isFinite(imNum(c)))||'';
          entry={d:desc,q:nums.length>1?nums[0]:1,p:nums.length?nums[nums.length-1]:NaN};
        }
      }
      entry.d=String(entry.d||'').trim();
      if(entry.d.length>=2)base.entries.push({d:entry.d,q:Number.isFinite(entry.q)?entry.q:1,p:Number.isFinite(entry.p)?entry.p:''});
    });
  }
  if(!base.entries.length)base.err=mode==='client'?'Aucun client reconnu. Vérifiez les colonnes Nom, Adresse, Code postal/Ville, Téléphone et E-mail.':'Aucune ligne reconnue. Vérifiez les colonnes Désignation, Quantité et Prix.';
  return base;
}

/* ---------- Interface ---------- */
function getImportHTML(){return `<div class="c"><h3>Importer des données ou un document</h3>
<p class="mu" style="margin:0 0 12px;font-size:14px">Importez un devis, une facture, un rapport, un client, des fournitures, de la main-d'œuvre ou un objet de devis. Vérifiez les données avant de les enregistrer.</p>
<label>Type à importer<select id="imMode" onchange="imSetMode(this.value)"><option value="auto">Reconnaissance automatique (devis / facture / rapport)</option><option value="d">Devis</option><option value="f">Facture</option><option value="x">Rapport</option><option value="client">Clients (CSV / texte)</option><option value="F">Fournitures / matériels</option><option value="M">Main-d'œuvre / prestations</option><option value="object">Objet / travaux (modèle réutilisable)</option></select></label>
<p class="mu" style="margin:0 0 12px;font-size:12px">Formats : PDF, scan/photo, Word .docx, texte et CSV. Les scans nécessitent une connexion. Les lignes importées restent modifiables avant validation.</p>
<label class="b cu" style="display:block;text-align:center;margin:0;cursor:pointer" id="uploadArea">📄 Choisir des fichiers à importer<input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.txt,.csv,.vcf,application/pdf,text/vcard,image/*" multiple hidden></label>
<p id="imst" class="mu" style="margin:10px 0 0;font-size:13px"></p></div><div id="imres"></div>`}
function imStatus(t){const e=document.getElementById('imst');if(e)e.textContent=t||''}
function initImportPage(){
  const inp=document.getElementById('fileInput'),area=document.getElementById('uploadArea');if(!inp)return;
  const mode=document.getElementById('imMode');if(mode)mode.value=IM.mode;
  inp.addEventListener('change',e=>{imHandle(e.target.files);e.target.value=''});
  ['dragover','drop'].forEach(ev=>area.addEventListener(ev,e=>{e.preventDefault();if(ev==='drop'&&e.dataTransfer.files.length)imHandle(e.dataTransfer.files)}));
  imRender();
}
function imSetMode(mode){IM.mode=mode}
async function imHandle(files){
  files=[...files];if(!files.length||IM.busy)return;IM.busy=true;
  for(let k=0;k<files.length;k++){const f=files[k];imStatus('Analyse de '+f.name+' ('+(k+1)+'/'+files.length+')…');
    try{if(f.size>30*1024*1024)throw new Error('Fichier supérieur à 30 Mo');const text=await imExtractText(f);let r;
      if(['client','F','M','object'].includes(IM.mode))r=imDataImport(text,f.name,IM.mode);
      else{r=imParse(text,f.name);if(IM.mode!=='auto')r.t=IM.mode;r.kind='doc';}
      r.name=f.name;
      if(r.textLen<20)r.W.unshift('Presque aucun texte lu dans ce fichier : essayez une photo plus nette ou un PDF.');IM.res.push(r);IM.i=IM.res.length-1}
    catch(e){IM.res.push({name:f.name,kind:'doc',err:e.message||'Lecture impossible'});IM.i=IM.res.length-1}
    imRender()}
  IM.busy=false;imStatus('');imRender();document.getElementById('imres')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function imTotals(r){const s=[...r.M,...r.F].reduce((a,x)=>a+(parseFloat(x.q)||0)*(parseFloat(x.p)||0),0),rm=s*(parseFloat(r.rm)||0)/100,ht=s-rm,tv=ht*(parseFloat(r.tva)||0)/100;return{ht,tv,ttc:ht+tv}}
const imE=v=>(typeof E==='function'?E(v):v.toFixed(2)+' €');
function imLine(r,k,i){const x=r[k][i];return `<div style="display:grid;grid-template-columns:1fr 54px 76px 30px;gap:6px;margin-bottom:6px;align-items:center"><input value="${imEsc(x.d)}" placeholder="Désignation" oninput="imSetL('${k}',${i},'d',this.value)"><input type="number" step="any" value="${x.q}" oninput="imSetL('${k}',${i},'q',this.value)" aria-label="Quantité"><input type="number" step="any" value="${x.p}" oninput="imSetL('${k}',${i},'p',this.value)" aria-label="Prix unitaire HT"><button class="b gh sm" style="padding:0;min-height:36px" onclick="imDelL('${k}',${i})" aria-label="Retirer">✕</button></div>`}
function imSwipeContent(content,remove,select){
  return `<div class="im-swipe" data-remove="${remove}"><button class="im-swipe-action" onclick="${remove}">Supprimer</button><div class="im-swipe-content" style="${select?'touch-action:pan-y':''}">${content}</div></div>`;
}
function imBindSwipes(root){
  if(!document.getElementById('imSwipeStyle')){
    const style=document.createElement('style');style.id='imSwipeStyle';
    style.textContent='.im-swipe{position:relative;overflow:hidden;border-radius:14px;margin-bottom:8px}.im-swipe-content{position:relative;z-index:1;transition:transform .18s;touch-action:pan-y}.im-swipe-action{position:absolute;inset:0 0 0 auto;width:104px;border:0;border-radius:0 14px 14px 0;background:var(--rd);color:#fff;font-family:inherit;font-size:14px;font-weight:600;line-height:1.2;opacity:0;z-index:0}';
    document.head.appendChild(style);
  }
  root.querySelectorAll('.im-swipe').forEach(el=>{
    const content=el.querySelector('.im-swipe-content'),action=el.querySelector('.im-swipe-action');let startX=0,startY=0,offset=0,moved=false;
    const reset=()=>{content.style.transform='';action.style.opacity='0';offset=0};
    el.addEventListener('touchstart',e=>{if(e.target.closest('input,textarea,select'))return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;moved=false},{passive:true});
    el.addEventListener('touchmove',e=>{
      if(e.target.closest('input,textarea,select')||!startX)return;
      const dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY;
      if(Math.abs(dy)>Math.abs(dx)||dx>=0)return;
      moved=true;e.preventDefault();offset=Math.max(-104,Math.min(0,dx));content.style.transform=`translateX(${offset}px)`;action.style.opacity=String(Math.min(1,Math.abs(offset)/60));
    },{passive:false});
    el.addEventListener('touchend',()=>{
      if(moved&&offset<-66){
        el.dataset.skipClick='1';
        const remove=el.dataset.remove||'',index=Number((remove.match(/\((\d+)\)/)||[])[1]);
        if(remove.startsWith('imDropEntry('))imDropEntry(index);else imDrop(index);
        return;
      }
      if(offset<-24){content.style.transform='translateX(-104px)';action.style.opacity='1'}else reset();
      startX=0;
    });
    el.addEventListener('click',e=>{if(el.dataset.skipClick){e.preventDefault();e.stopImmediatePropagation();delete el.dataset.skipClick}},true);
  });
}
function imRender(){
  const box=document.getElementById('imres');if(!box)return;
  if(!IM.res.length){box.innerHTML='';return}
  const r=IM.res[IM.i],tabs=`<div class="c"><h3>Fichiers importés (${IM.res.length})</h3>${IM.res.map((x,i)=>imSwipeContent(`<button class="r" style="margin:0;${i===IM.i?'outline:2px solid var(--cu)':''}" onclick="IM.i=${i};imRender()"><div><b>${imEsc(x.name)}</b><br><small class="mu">${x.err?'Erreur':x.kind==='data'?({client:'Clients',F:'Fournitures',M:"Main-d'œuvre",object:'Objet'})[x.dataType]:({d:'Devis',f:'Facture',x:'Rapport'})[x.t]}${x.done?' · importé':' · glisser pour supprimer'}</small></div></button>`,`imDrop(${i})`)).join('')}</div>`;
  imBindSwipes(box);
  if(r.err){box.innerHTML=tabs+`<div class="c"><h3>${imEsc(r.name)}</h3><p class="rd">${imEsc(r.err)}</p><button class="b gh sm" onclick="imDrop(${IM.i})">Retirer</button></div>`;imBindSwipes(box);return}
  if(r.kind==='data'){
    const type=r.dataType;
    const rows=r.entries.map((x,i)=>{
      const fields=type==='client'
        ?`<input aria-label="Nom" placeholder="Nom du client" value="${imEsc(x.n)}" oninput="imSetEntry(${i},'n',this.value)"><input placeholder="Adresse" value="${imEsc(x.a)}" oninput="imSetEntry(${i},'a',this.value)"><div class="g2"><input placeholder="Code postal, ville" value="${imEsc(x.c)}" oninput="imSetEntry(${i},'c',this.value)"><input placeholder="Téléphone" value="${imEsc(x.t)}" oninput="imSetEntry(${i},'t',this.value)"></div><input type="email" placeholder="E-mail" value="${imEsc(x.e)}" oninput="imSetEntry(${i},'e',this.value)">`
        :type==='object'?`<textarea rows="4" aria-label="Objet / travaux" oninput="imSetEntry(${i},'text',this.value)">${imEsc(x.text)}</textarea>`
        :`<div class="g2"><input placeholder="Désignation" value="${imEsc(x.d)}" oninput="imSetEntry(${i},'d',this.value)"><input type="number" step="any" placeholder="Prix HT" value="${imEsc(x.p)}" oninput="imSetEntry(${i},'p',this.value)"></div>${type==='F'||type==='M'?`<input type="number" step="any" placeholder="Quantité (aperçu)" value="${imEsc(x.q)}" oninput="imSetEntry(${i},'q',this.value)">`:''}`;
      return imSwipeContent(`<div class="c" style="margin:0">${fields}</div>`,`imDropEntry(${i})`);
    }).join('');
    const labels={client:'Clients',F:'Fournitures / matériels',M:"Main-d'œuvre / prestations",object:'Objets / travaux'};
    const typeLabel=labels[type]||'Données';
    box.innerHTML=tabs+`<div class="c"><h3>${imEsc(r.name)} · ${typeLabel}</h3><p class="mu" style="font-size:13px">${r.entries.length} entrée(s) détectée(s). Corrigez ou retirez les lignes avant l'enregistrement.</p>${rows||'<p class="rd">'+imEsc(r.err||'Aucune entrée détectée.')+'</p>'}<button class="b cu" style="width:100%;margin-top:8px" onclick="imSaveData()"><span>✓ Importer ${r.entries.length} entrée(s)</span></button><details style="margin-top:10px"><summary class="mu">Texte lu dans le fichier</summary><pre style="white-space:pre-wrap;font-size:12px;max-height:240px;overflow:auto">${imEsc(r.raw)}</pre></details></div>`;
    imBindSwipes(box);return;
  }
  const T=imTotals(r),inp=(l,k,ty='text')=>`<label>${l}<input type="${ty}" value="${imEsc(r[k])}" oninput="imSet('${k}',this.value)"></label>`,ta=(l,k)=>`<label>${l}<textarea rows="3" oninput="imSetR('${k}',this.value)">${imEsc(r.R[k])}</textarea></label>`;
  const warn=r.W.length?`<div class="c" style="border:1px solid #e0b36a"><h3>⚠️ À vérifier</h3>${r.W.map(w=>`<p style="margin:0 0 6px;font-size:14px">• ${imEsc(w)}</p>`).join('')}<small class="mu">Vous pouvez quand même créer le document : complétez ce qui manque ensuite.</small></div>`:`<div class="c"><p class="ok" style="margin:0">✓ Données reconnues sans anomalie.</p></div>`;
  const lines=r.t==='x'?`<div class="c"><h3>Rapport d'intervention</h3><label>Type<select onchange="imSetR('ty',this.value)">${['Dégât des eaux','Recherche de fuite','Panne de chauffage','Diagnostic plomberie','Autre'].map(o=>`<option ${o===r.R.ty?'selected':''}>${o}</option>`).join('')}</select></label>${inp('Assurance','ass')}${inp('N° de sinistre','sn')}${ta('Motif / circonstances','mo')}${ta('Constatations','co')}${ta('Origine / cause probable','org')}${ta('Travaux réalisés','tr')}${ta('Préconisations','pr')}</div>`
  :`<div class="c"><h3>Main d'œuvre / prestations</h3>${r.M.map((_,i)=>imLine(r,'M',i)).join('')||'<p class="mu" style="margin:0 0 8px">Aucune ligne</p>'}<button class="b gh sm" onclick="imAddL('M')">＋ Ajouter une prestation</button><small class="mu" style="display:block;margin-top:6px">Désignation · Qté · Prix unitaire HT</small></div>
<div class="c"><h3>Fournitures</h3>${r.F.map((_,i)=>imLine(r,'F',i)).join('')||'<p class="mu" style="margin:0 0 8px">Aucune ligne</p>'}<button class="b gh sm" onclick="imAddL('F')">＋ Ajouter une fourniture</button></div>
<div class="c"><div class="g3">${inp('TVA %','tva','number')}${inp('Remise %','rm','number')}<label>Total TTC<input value="${imE(T.ttc)}" disabled></label></div><small class="mu">Total HT ${imE(T.ht)}${r.totHT?' · document source : '+imE(r.totHT):''}</small></div>`;
  box.innerHTML=tabs+`<div class="c"><h3>${imEsc(r.name)}</h3><label>Type de document<select onchange="imSet('t',this.value)"><option value="d" ${r.t==='d'?'selected':''}>Devis</option><option value="f" ${r.t==='f'?'selected':''}>Facture</option><option value="x" ${r.t==='x'?'selected':''}>Rapport d'intervention</option></select></label><div class="g2">${inp('Numéro','num')}${inp('Date','date','date')}</div></div>${warn}
<div class="c"><h3>Client</h3>${inp('Nom','cn')}${inp('Adresse','ca')}<div class="g2">${inp('Code postal Ville','cc')}${inp('Téléphone','ct','tel')}</div>${inp('E-mail','ce','email')}${r.t==='x'?'':inp('Chantier (adresse)','sn')+inp('Objet','o')}</div>${lines}
<label class="r" style="gap:10px;justify-content:flex-start;cursor:pointer"><input type="checkbox" id="imSave" ${r.noSave?'':'checked'} style="width:auto;margin:0" onchange="IM.res[IM.i].noSave=!this.checked"><span style="font-size:14px">Enregistrer aussi le client${r.t==='x'?'':' et les prix dans « Mes tarifs »'}</span></label>
<button class="b cu" style="width:100%;margin-bottom:8px" onclick="imCreate()"><span>✓ Créer dans ma mise en page${r.done?' (déjà créé : recréer)':''}</span></button>
<button class="b gh" style="width:100%;margin-bottom:8px" onclick="imSaveOnly()"><span>Enregistrer client et tarifs seulement</span></button>
<details class="c"><summary class="mu">Texte lu dans le fichier</summary><pre style="white-space:pre-wrap;font-size:12px;max-height:240px;overflow:auto">${imEsc(r.raw)}</pre></details>`;
}
const imCur=()=>IM.res[IM.i];
function imSet(k,v){imCur()[k]=v;if(k==='t')imRender()}
function imSetR(k,v){imCur().R[k]=v}
function imSetL(k,i,f,v){imCur()[k][i][f]=v}
function imSetEntry(i,k,v){imCur().entries[i][k]=v}
function imAddL(k){imCur()[k].push({d:'',q:1,p:''});imRender()}
function imDelL(k,i){imCur()[k].splice(i,1);imRender()}
function imDrop(index=IM.i){if(index<IM.i)IM.i--;IM.res.splice(index,1);IM.i=Math.max(0,Math.min(IM.i,IM.res.length-1));imRender()}
function imDropEntry(index){const r=imCur();r.entries.splice(index,1);if(!r.entries.length)imDrop();else imRender()}

/* ---------- Enregistrement ---------- */
function imClient(r){
  if(!r.cn)return null;const nn=imNorm(r.cn).trim(),dg=s=>String(s||'').replace(/\D/g,'');
  let c=S.clients.find(c=>imNorm(c.n).trim()===nn||(r.ce&&imNorm(c.e)===imNorm(r.ce))||(dg(r.ct).length>=9&&dg(c.t)===dg(r.ct)));
  if(!c){c={id:nw(),n:r.cn,a:r.ca||'',c:r.cc||'',t:r.ct||'',e:r.ce||'',addresses:[]};S.clients.push(c)}
  else{if(!c.a&&r.ca)c.a=r.ca;if(!c.c&&r.cc)c.c=r.cc;if(!c.t&&r.ct)c.t=r.ct;if(!c.e&&r.ce)c.e=r.ce}
  save('clients');return c;
}
function imCatalog(r){for(const k of['M','F'])for(const l of r[k]){const d=String(l.d||'').trim();if(!d)continue;const p=parseFloat(l.p)||0,c=S.cat.find(c=>imNorm(c.d).trim()===imNorm(d).trim());if(!c)S.cat.push({d,t:k,p});else if(!(parseFloat(c.p)>0)&&p)c.p=p}save('cat')}
function imSaveData(){
  const r=imCur(),type=r.dataType,entries=r.entries.filter(x=>type==='client'?String(x.n||'').trim():type==='object'?String(x.text||'').trim():String(x.d||'').trim());
  if(!entries.length)return toast('Aucune entrée à importer');
  let added=0,updated=0;
  if(type==='client'){
    entries.forEach(x=>{const before=S.clients.length,c=imClient({cn:x.n,ca:x.a,cc:x.c,ct:x.t,ce:x.e});if(c){if(S.clients.length>before)added++;else updated++}});
  }else if(type==='F'||type==='M'){
    entries.forEach(x=>{
      const d=String(x.d).trim(),p=parseFloat(x.p),c=S.cat.find(y=>(y.t||'F')===type&&imNorm(y.d).trim()===imNorm(d).trim());
      if(!c){S.cat.push({d,t:type,p:Number.isFinite(p)?p:''});added++}
      else{if(Number.isFinite(p)&&p!==Number(c.p)){c.p=p;updated++}}
    });
    save('cat');
  }else{
    const objects=Array.isArray(S.cfg.objets)?S.cfg.objets:[];
    entries.forEach(x=>{const text=String(x.text).trim();if(!objects.some(o=>imNorm(o).trim()===imNorm(text).trim())){objects.push(text);added++}});
    S.cfg.objets=objects;save('cfg');
  }
  r.done=true;imRender();toast(`✓ ${added} ajoutée(s)${updated?` · ${updated} mise(s) à jour`:''}`);
}
function imSaveOnly(){const r=imCur();if(!r.cn&&!r.M.length&&!r.F.length)return toast('Rien à enregistrer');const c=imClient(r);if(r.t!=='x')imCatalog(r);toast('✓ '+(c?'Client':'')+(c&&r.t!=='x'?' et ':'')+(r.t!=='x'?'tarifs':'')+' enregistrés')}
function imCreate(){
  const r=imCur(),y=(r.date||td()).slice(0,4),save_=!r.noSave,c=r.cn&&save_?imClient(r):null;
  const unique=(num,list)=>num&&!list.some(d=>imNorm(d.num)===imNorm(num));
  if(r.t==='x'){
    let num=r.num;if(!unique(num,S.rep)){const k='r'+y,q=S.seq[k]=(S.seq[k]||0)+1;num='RAP-'+y+'-'+String(q).padStart(3,'0');save('seq')}
    const rep={id:nw(),num,date:r.date||td(),ty:r.R.ty,cn:r.cn,ca:r.ca,cc:r.cc,ct:r.ct,ass:r.R.ass,sn:r.sn,mo:r.R.mo,co:r.R.co,org:r.R.org,tr:r.R.tr,pr:r.R.pr};
    S.rep.unshift(rep);save('rep');r.done=true;toast('✓ Rapport créé — aperçu');setTimeout(()=>{go('xe',rep.id);pvo()},300);return;
  }
  const key=r.t+y;let num=r.num;
  if(!unique(num,S.docs)){const q=S.seq[key]=(S.seq[key]||0)+1;num=(r.t==='d'?'DEV-':'FAC-')+y+'-'+String(q).padStart(3,'0');save('seq');if(r.num)toast('ℹ️ Numéro '+r.num+' déjà utilisé : '+num+' attribué')}
  const cl=l=>({d:String(l.d||'').trim(),q:parseFloat(l.q)||1,p:parseFloat(l.p)||0}),mk=L=>L.filter(l=>String(l.d||'').trim()).map(cl);
  const doc={id:nw(),t:r.t,num,date:r.date||td(),val:S.cfg.val||30,cn:r.cn,ca:r.ca,cc:r.cc,ct:r.ct,ce:r.ce,cid:c?.id||'',sn:r.sn||'',sa:'',sc:'',o:r.o||'',F:mk(r.F),M:mk(r.M),acc:S.cfg.acc||40,ap:false,paid:false,pd:'',cost:'',st:'att',tva:parseFloat(r.tva)||0,rm:parseFloat(r.rm)||0};
  if(!doc.F.length)doc.F.push({d:'',q:1,p:''});if(!doc.M.length)doc.M.push({d:'',q:1,p:''});
  S.docs.unshift(doc);save('docs');if(save_)imCatalog(r);r.done=true;
  toast('✓ '+(r.t==='d'?'Devis':'Facture')+' créé(e) dans votre mise en page — aperçu');
  setTimeout(()=>{go('e',doc.id);pvo()},300);
}

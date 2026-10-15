/* =====================================================================
   Ms Plomberie & Chauffage — Importation v7 (reconstruite de zéro)
   Remplace js/importer.js. Points d'entrée conservés pour index.html :
   importPage() · initImportPage() · impHash()
   Lecture : PDF (texte + OCR si scanné/image), photos (OCR), Word, texte.
   Rangement : client · prestations · fournitures · totaux · n° · date.
   Transfert : crée un devis / facture / rapport dans TA mise en page.
   ===================================================================== */
(function(){
'use strict';
const G=typeof window!=='undefined'?window:globalThis;
const LS='msimp_v7';
const CDN={
  pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfw:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  ocr:'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js',
  mam:'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js'};

/* ---------- utilitaires ---------- */
const H=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9);
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function dedupeRepeatedPhrase(value){
  let words=String(value==null?'':value).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  for(let pass=0;pass<8;pass++){
    let changed=false;
    outer: for(let start=0;start<words.length;start++){
      const max=Math.floor((words.length-start)/2);
      for(let len=max;len>=2;len--){
        const phrase=words.slice(start,start+len);
        // Repeated amounts are common on quantity-one rows (unit price = line total).
        // Keep numeric-only repetitions so strict quote parsing can still identify both fields.
        if(!phrase.some(word=>/[A-Za-zÀ-ÿ]/.test(word)))continue;
        const a=words.slice(start,start+len).map(norm).join('|');
        const b=words.slice(start+len,start+2*len).map(norm).join('|');
        if(a&&a===b){
          words.splice(start+len,len);
          const prev=words[start+len-1],next=words[start+len];
          if(prev&&next){
            const pn=norm(prev),nn=norm(next);
            if(nn.length>=4&&nn.length<pn.length&&pn.startsWith(nn))words.splice(start+len,1);
          }
          changed=true;break outer;
        }
      }
    }
    if(!changed)break;
  }
  const joined=words.join(' ').replace(/\s+([,.;:])/g,'$1');
  return joined.replace(/([,.;:])(?=\S)/g,(match,punctuation,offset,source)=>{
    const start=source.lastIndexOf(' ',offset)+1,end=source.indexOf(' ',offset+1),token=source.slice(start,end<0?source.length:end);
    if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(token)||/(?:https?:\/\/|www\.)/i.test(token))return punctuation;
    return (punctuation===','||punctuation==='.')&&/\d/.test(source[offset-1]||'')&&/\d/.test(source[offset+1]||'')?punctuation:punctuation+' ';
  }).replace(/\s+/g,' ').trim();
}
const r2=v=>Math.round((v+Number.EPSILON)*100)/100;
const eur=v=>(isFinite(v)?v:0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const fsz=b=>b>1048576?(b/1048576).toFixed(1).replace('.',',')+' Mo':Math.max(1,Math.round(b/1024))+' Ko';
const say=m=>{try{if(typeof G.toast==='function')G.toast(m)}catch(e){}};
const SS=()=>typeof S!=='undefined'?S:null;
function pn(s){
  s=String(s==null?'':s).replace(/[€₹$£\s\u00a0]|eur\w*/gi,'');if(!s)return NaN;
  if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(s.includes(','))s=/^-?\d{1,3}(,\d{3})+$/.test(s)?s.replace(/,/g,''):s.replace(',','.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  const v=parseFloat(s);return isFinite(v)?v:NaN}
const nv=v=>{const x=pn(v);return isNaN(x)?0:x};
function loadLib(url,test){return new Promise((ok,no)=>{if(test())return ok();const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=()=>no(new Error('Bibliothèque indisponible (connexion ?)'));document.head.appendChild(s)})}

/* ---------- lecture des fichiers ---------- */
const ext=n=>(String(n).split('.').pop()||'').toLowerCase();
function kindOf(f){const e=ext(f.name),t=f.type||'';
  if(e==='pdf'||t==='application/pdf')return'pdf';
  if(/^image\//.test(t)||/^(png|jpe?g|webp|gif|bmp|heic|heif|tiff?)$/.test(e))return'img';
  if(e==='docx')return'docx';if(e==='doc')return'doc';
  if(/^(txt|csv|tsv|md|html?)$/.test(e)||/^text\//.test(t))return'txt';return'other'}
function rowsOf(items){ // items:{s,x,y,w,h} ; y décroissant = haut → bas
  const its=items.filter(i=>i.s&&i.s.trim()).sort((a,b)=>b.y-a.y||a.x-b.x),rs=[];
  for(const it of its){const r=rs[rs.length-1];if(r&&Math.abs(r.y-it.y)<=Math.max(2.5,it.h*.5))r.it.push(it);else rs.push({y:it.y,it:[it]})}
  return rs.map(r=>{
    r.it.sort((a,b)=>a.x-b.x);
    // Some PDFs expose the same visual text twice at the same coordinates.
    const unique=[];
    for(const item of r.it){
      const key=norm(item.s);
      const overlaid=unique.some(prev=>norm(prev.s)===key&&Math.abs(prev.x-item.x)<=2&&Math.abs(prev.y-item.y)<=Math.max(2.5,item.h*.5));
      if(!overlaid)unique.push(item);
    }
    r.it=unique;
    const cells=[];let cur='',end=null,x0=0;const h=Math.max(r.it[0]?.h||6,6);
    for(const t of r.it){
      if(end===null)x0=t.x;
      else if(t.x-end>h*1.0){cells.push({s:dedupeRepeatedPhrase(cur.trim()),x:x0});cur='';x0=t.x}
      else if(t.x-end>h*.18&&!/\s$/.test(cur)&&!/^\s/.test(t.s))cur+=' ';
      cur+=t.s;end=Math.max(end===null?-Infinity:end,t.x+t.w)}
    cells.push({s:dedupeRepeatedPhrase(cur.trim()),x:x0});const f=cells.filter(c=>c.s);
    return{c:f.map(c=>c.s),xs:f.map(c=>c.x)}}).filter(r=>r.c.length)}
const rowsText=rows=>rows.map(r=>r.c.join('  ')).join('\n');
const toRows=t=>String(t||'').split(/\r?\n/).map(s=>s.replace(/\u00a0/g,' ').trim()).filter(Boolean).map(s=>({c:s.split(/\s{2,}|\t+/).map(x=>x.trim()).filter(Boolean),xs:null}));
async function ocr(src,prog){
  await loadLib(CDN.ocr,()=>G.Tesseract);
  const r=await G.Tesseract.recognize(src,'fra+eng',{logger:m=>{if(m.status==='recognizing text'&&prog)prog(m.progress)}});
  const d=r.data;
  // Tesseract already groups words into reading-order lines. Re-clustering every word
  // only by its vertical coordinate breaks tilted scans into fragments and scrambles tables.
  const lineRows=(d.lines||[]).map(l=>({c:[dedupeRepeatedPhrase(l.text||'')],xs:null,y:l.bbox?-((l.bbox.y0+l.bbox.y1)/2):undefined})).filter(l=>l.c[0]);
  if(lineRows.length)return{text:rowsText(lineRows),rows:lineRows};
  let ws=d.words;
  if((!ws||!ws.length)&&d.lines)ws=[].concat(...d.lines.map(l=>l.words||[]));
  if(ws&&ws.length){const items=ws.filter(w=>w.bbox&&w.text).map(w=>({s:w.text,x:w.bbox.x0,y:-(w.bbox.y0+w.bbox.y1)/2,w:w.bbox.x1-w.bbox.x0,h:w.bbox.y1-w.bbox.y0}));const rows=rowsOf(items);return{text:rowsText(rows),rows}}
  return{text:d.text||'',rows:null}}
function imgCanvas(f){return new Promise((ok,no)=>{const u=URL.createObjectURL(f),im=new Image();
  im.onload=()=>{const m=Math.max(im.naturalWidth,im.naturalHeight),k=m<1400?1400/m:m>2400?2400/m:1,cv=document.createElement('canvas');
    cv.width=Math.round(im.naturalWidth*k);cv.height=Math.round(im.naturalHeight*k);const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(im,0,0,cv.width,cv.height);URL.revokeObjectURL(u);ok(cv)};
  im.onerror=()=>{URL.revokeObjectURL(u);no(new Error('Image illisible'))};im.src=u})}
async function pdfExtract(f,prog){
  await loadLib(CDN.pdf,()=>G.pdfjsLib);G.pdfjsLib.GlobalWorkerOptions.workerSrc=CDN.pdfw;
  const pdf=await G.pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
  const N=Math.min(pdf.numPages,12),allRows=[];
  for(let p=1;p<=N;p++){
    const pg=await pdf.getPage(p),tc=await pg.getTextContent();
    const textRows=rowsOf(tc.items.map(i=>({s:i.str,x:i.transform[4],y:i.transform[5]+(N-p)*2000,w:i.width||0,h:Math.abs(i.height||i.transform[3]||10)})));
    allRows.push(...textRows);
    // OCR every page as well: text PDFs may contain handwriting added over the digital text layer.
    const vp=pg.getViewport({scale:2.8}),cv=document.createElement('canvas');
    cv.width=vp.width;cv.height=vp.height;
    const g=cv.getContext('2d',{willReadFrequently:true});
    await pg.render({canvasContext:g,viewport:vp}).promise;
    // Increase contrast while preserving dark pen strokes and small handwritten characters.
    try{
      const im=g.getImageData(0,0,cv.width,cv.height),d=im.data;
      for(let j=0;j<d.length;j+=4){
        const lum=.299*d[j]+.587*d[j+1]+.114*d[j+2];
        const v=lum<150?Math.max(0,(lum-15)*.82):Math.min(255,150+(lum-150)*1.7);
        d[j]=d[j+1]=d[j+2]=v;
      }
      g.putImageData(im,0,0);
    }catch(_){}
    let scanned=null;
    try{scanned=await ocr(cv,q=>prog(((p-1)+q)/N));}catch(_){}
    if(scanned&&scanned.rows){
      const ocrRows=scanned.rows.map(r=>({
        c:r.c,xs:r.xs,
        _ocr:true,
        _rawY:r.y,
        y:(r.y||0)/2.8+(N-p)*2000
      }));
      // Keep OCR rows only when the text layer doesn't already contain that content.
      // This retains handwritten additions without duplicating printed PDF text.
      for(const or of ocrRows){
        const ot=norm(or.c.join(' '));
        if(!ot)continue;
        const duplicate=textRows.some(tr=>{
          const tt=norm(tr.c.join(' '));
          if(!tt)return false;
          if(tt===ot||tt.includes(ot)||ot.includes(tt))return true;
          const a=tt.split(' ').filter(Boolean),bb=new Set(ot.split(' ').filter(Boolean));
          const common=a.filter(w=>bb.has(w)).length;
          return common>=3&&common/Math.max(a.length,bb.size)>=.72;
        });
        if(!duplicate){
          or.c=or.c.map(dedupeRepeatedPhrase);
          allRows.push(or);
        }
      }
    }
    prog(p/N);
  }
  // Restore page/line order and avoid exact text-layer overlays.
  const rows=allRows.sort((a,b)=>(b.y||0)-(a.y||0)||((a.xs&&a.xs[0])||0)-((b.xs&&b.xs[0])||0));
  const text=rowsText(rows);
  if(text.replace(/\s/g,'').length>=1)return{text,rows};
  return{text:'',rows:[]};
}
async function docxExtract(f){
  await loadLib(CDN.mam,()=>G.mammoth);
  const r=await G.mammoth.convertToHtml({arrayBuffer:await f.arrayBuffer()});
  const doc=new DOMParser().parseFromString('<body>'+r.value+'</body>','text/html'),rows=[];
  for(const n of doc.body.children){
    if(n.tagName==='TABLE')n.querySelectorAll('tr').forEach(tr=>{const c=[...tr.children].map(td=>td.textContent.replace(/\s+/g,' ').trim()).filter(Boolean);if(c.length)rows.push({c,xs:null})});
    else{const t=n.textContent.replace(/\s+/g,' ').trim();if(t)rows.push({c:[t],xs:null})}}
  return{text:rowsText(rows),rows}}
async function extractText(it){
  const f=it.file,prog=q=>{it.prog=Math.min(.98,q);bar(it)};
  if(it.kind==='pdf')return pdfExtract(f,prog);
  if(it.kind==='img'){const r=await ocr(await imgCanvas(f),prog);return r}
  if(it.kind==='docx')return docxExtract(f);
  if(it.kind==='txt'){let t=await f.text();if(/html?$/.test(ext(f.name)))t=new DOMParser().parseFromString(t,'text/html').body.textContent;
    t=t.replace(/[;\t]/g,'  ');return{text:t,rows:null}}
  if(it.kind==='doc')throw new Error('Format .doc non lu : enregistrez en .docx ou PDF.');
  throw new Error('Format non pris en charge.')}

/* ---------- analyse intelligente ---------- */
const EMAIL=/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
const PHONE=/(?:(?:\+|00)33[\s.]?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b/;
const NUM2=/^-?\d+(?:[.,]\d+)?$|^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$|^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const UNIT_RX=/^(h|hr|hrs|heures?|u|un|unit[ée]s?|pce|pcs|pi[èe]ces?|m|ml|m2|m²|m3|kg|l|lot|ens|ensemble|forfait|ff|jours?|j)\.?$/i;
const UNIT_GLUE=/^(\d+(?:[.,]\d+)?)(h|u|m|ml|m2|m²|kg|l|j)$/i;
const META=/siret|siren|\biban\b|\bbic\b|\bt[ée]l\b|t[ée]l[ée]phone|tva\s*intra|\bpage\s*\d|\brcs\b|capital\s|www\.|@|\bnaf\b|\bape\b|assurance|d[ée]cennale|mentions/i;
const ADDR=/^\d{1,4}\s*(?:bis|ter)?[, ]+\s*(?:rue|avenue|av\.?|bd|boulevard|chemin|impasse|all[ée]e|place|route|r[ée]sidence|quai|cours|passage|square|lotissement)\b|\b\d{5}\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ' \-]+$/i;
const END=/^(?:total\s*(?:h\.?t|ttc|net|g[ée]n[ée]ral|due)|net\s*(?:[àa]\s*payer|h\.?t)|montant\s*(?:h\.?t|ttc|total|tva)|base\s*h\.?t|tva\b|gst\b|sales\s+tax\b|subtotal\b|conditions|bon\s*pour\s*accord|reste\s*(?:[àa]\s*payer|d[ûu])|acompte|r[èe]glement|mode\s*de\s*paiement|rib\b|iban)/i;
const SKIP=/^(?:sous[- ]?total|sous\s+total|subtotal|report|suite|page\s*\d|(?:total|montant)\b.*\b(?:main[- ]?d['’]?\s?(?:œ|oe)uvre|m\.?o\.?|prestations?|fournitures?|mat[ée]riels?|services?|travaux|pose)\b|(?:main[- ]?d['’]?\s?(?:œ|oe)uvre|m\.?o\.?|prestations?|fournitures?|mat[ée]riels?|services?|travaux|pose)\b.*\b(?:sous[- ]?total|total|montant)\b)/i;
const HEAD=/(d[ée]signation|description|libell[ée]|prestations?|article)/i,HEAD2=/(qt[ée]|quantit|p\.?\s?u|prix|montant|total|unit)/i;
const HEADING=/^[-–•*#\s]*(fournitures?|mat[ée]riels?|mat[ée]riaux|main[- ]d['’]?\s?(?:œ|oe)uvre|prestations?|services?|travaux|d[ée]placements?)\b[^0-9€]{0,50}$/i;
const CLI_LBL=/^(?:nom\s+du\s+)?(?:c[l1i]{1,2}[eo]nt|destinataire|factur[ée]e?\s*(?:à|a)|adress[ée]e?\s*(?:à|a)|bill\s*to|à\s*l['’]attention\s+de|intervention\s+chez)\s*[:\-]?\s*(.*)$/i;
const SITE_LBL=/^(?:adresse\s*(?:du\s*)?chantier|chantier|lieu\s*(?:d['’]\s*)?intervention|adresse\s*d['’]\s*intervention)\s*[:\-]?\s*(.*)$/i;
const STOP_LBL=/^(?:d[ée]signation|description|libell[ée]|date\b|n[°o]\b|num[ée]ro|objet|motif|observations?|constatations?|travaux\s+r[ée]alis[ée]s?|pr[ée]conisations?|origine|cause|validit[ée]|[ée]ch[ée]ance|r[ée]f[ée]rence|qt[ée]|quantit|total|conditions|paiement|mode\s+de|[ée]metteur|exp[ée]diteur|prestataire|fournisseur|main[- ]d|fournitures?|devis\b|facture\b|rapport\b)/i;
const MOIS={janvier:1,fevrier:2,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,août:8,septembre:9,octobre:10,novembre:11,decembre:12,décembre:12,january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const RX_MV=/^(pose|installation|d[ée]pose|remplacement|r[ée]paration|d[ée]pannage|mise en|raccordement|entretien|recherche|d[ée]placement|main|forfait|intervention|nettoyage|d[ée]sembouage|ramonage|contr[ôo]le|diagnostic|purge|vidange|[ée]tude|essai|ouverture|percement|saign[ée]e)/i;
const RX_M=/main[- ]d.?[œo]euvre|\bm\.?o\.?\b|\bpose\b|installation|d[ée]pose|d[ée]pannage|d[ée]placement|intervention|recherche de fuite|mise en service|r[ée]glage|entretien|ramonage|d[ée]sembouage|nettoyage|diagnostic|raccordement|r[ée]paration|forfait|heure|visite|essai|manutention|[ée]vacuation|mise en (?:route|eau)|percement|prestation/i;
const RX_F=/tube|tuyau|raccord|coude|manchon|r[ée]duction|vanne|robinet|mitigeur|radiateur|s[èe]che[- ]serviettes?|chaudi[èe]re|ballon|cumulus|chauffe[- ]eau|joint|cuivre|\bper\b|multicouche|\bvis\b|collier|siphon|flexible|\bwc\b|cuvette|lavabo|vasque|douche|receveur|baignoire|pompe|circulateur|groupe de s[ée]curit[ée]|vase d.expansion|thermostat|sonde|fourniture|mat[ée]riel|pi[èe]ce|\bkit\b|clapet|filtre|purgeur|d[ée]tendeur|compteur|bonde|r[ée]servoir|cartouche|collecteur|nourrice|isolant|gaine|conduit|ventouse|br[uû]leur|inhibiteur|glycol|t[ée]flon|filasse|soudure|brasure|silicone|colle\b|baguette|console|fixation|visserie|consommable/i;

function normUnit(u){u=String(u).toLowerCase().replace(/\.$/,'');
  if(/^(h|hr|hrs|heures?)$/.test(u))return'h';if(/^(u|un|unit[ée]s?|pce|pcs|pi[èe]ces?)$/.test(u))return'u';
  if(u==='m2')return'm²';if(/^(ens|ensemble|lot|forfait|ff)$/.test(u))return'forfait';if(/^(jours?|j)$/.test(u))return'j';return u}
function iso(d,m,y){d=+d;m=+m;y=+y;if(y<100)y+=2000;if(m<1||m>12||d<1||d>31||y<2000||y>2100)return null;return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function datesIn(s){s=s.replace(new RegExp(PHONE.source,'g'),' ');const o=[];let m;
  const a=/\b(\d{1,2})\s?[\/.\-]\s?(\d{1,2})\s?[\/.\-]\s?(\d{4}|\d{2})\b/g;while((m=a.exec(s))){const v=iso(m[1],m[2],m[3]);if(v)o.push(v)}
  const b=/\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi;
  while((m=b.exec(s))){const v=iso(m[1],MOIS[m[2].toLowerCase()],m[3]);if(v)o.push(v)}return o}
function fmtTel(t){const d=t.replace(/\D/g,'').replace(/^(33|0033)/,'0');return d.length===10?d.replace(/(\d{2})(?=\d)/g,'$1 '):t.trim()}
function isMine(s){const S_=SS();s=String(s||'');if(/ms\s*plomberie|plomberie\s*(?:&|et)\s*chauffage/i.test(s))return true;
  try{const cfg=JSON.stringify(S_&&S_.cfg||{});const e=cfg.match(new RegExp(EMAIL.source,'i'));if(e&&s.toLowerCase().includes(e[0].toLowerCase()))return true;
    const ph=s.match(PHONE);if(ph){const d=ph[0].replace(/\D/g,'').slice(-9);if(d&&cfg.replace(/\D/g,'').includes(d))return true}}catch(e){}return false}

function lineItem(r,strict){
  const cm=r.c.length>=2,cs=(cm?r.c.flatMap(cell=>{const x=String(cell||'').trim(),m=x.match(/^(\d+(?:[.,]\d+)?)\s+([^\s]+)$/);return m&&UNIT_RX.test(m[2])?[m[1],m[2]]:[x]}):(r.c[0]||'').split(/\s+/)).filter(x=>! /^[\s"'‘’“”`~;:,|©]+$/.test(x)),tail=[];let i=cs.length;
  while(i>0){const raw=cs[i-1].trim();if(!raw){i--;continue}
    let c=raw.replace(/[€₹¥$£©“”]|\beuros?\b|\beur\b/ig,'').trim();
    if(/^\d+\.$/.test(c))c=c.slice(0,-1); // OCR often leaves a sentence dot after an integer quantity.
    if(!c){tail.unshift({k:'cur',raw});i--;continue}
    const sp=c.replace(/\s/g,'');
    if(/^-?\d+(?:[.,]\d+)?%$/.test(sp)){tail.unshift({k:'pct',v:pn(sp),raw});i--;continue}
    if(NUM2.test(sp)){tail.unshift({k:'num',v:pn(sp),raw});i--;continue}
    const g=c.match(UNIT_GLUE);if(g){tail.unshift({k:'num',v:pn(g[1]),u:normUnit(g[2]),raw});i--;continue}
    if(UNIT_RX.test(c)&&tail.some(t=>t.k==='num')){tail.unshift({k:'unit',v:normUnit(c),raw});i--;continue}
    break}
  const pos=[];tail.forEach((t,ti)=>{if(t.k==='num')pos.push(ti)});const N=pos.map(p=>tail[p].v);
  if(!N.length)return null;
  const base=Math.max(0,N.length-5),A=N.slice(base);
  const ok=(a,b,c)=>Math.abs(a*b-c)<=Math.max(.05,Math.abs(c)*.006);
  const stripCurrencyGlyph7=raw=>{const s=String(raw||'').replace(/[€₹¥$£©“”\s]/g,'');if(!/^7(?:\d{2,}|\d{1,3}(?:,\d{3})+)(?:[.,]\d{2})?$/.test(s))return null;return pn(s.slice(1))};
  const tryEnd=(e,repairOcr=false)=>{for(let j=e-1;j>=1;j--)for(let k=j-1;k>=0;k--){
    if(ok(A[k],A[j],A[e]))return{q:A[k],pu:A[j],i:k+base,e:e+base};
    // Some OCR models read the rupee glyph as a leading 7. Correct it only when
    // removing that glyph makes quantity × unit price equal the printed amount.
    if(repairOcr){const rawPrice=tail[pos[j+base]]?.raw,rawAmount=tail[pos[e+base]]?.raw,p=stripCurrencyGlyph7(rawPrice),a=stripCurrencyGlyph7(rawAmount);
      if(p!=null&&a!=null&&ok(A[k],p,a))return{q:A[k],pu:p,i:k+base,e:e+base,repaired:true};
      if(p!=null&&ok(A[k],p,A[e]))return{q:A[k],pu:p,i:k+base,e:e+base,repaired:true};
      if(a!=null&&ok(A[k],A[j],a))return{q:A[k],pu:A[j],i:k+base,e:e+base,repaired:true};}
  }return null};
  let t=A.length>=3?tryEnd(A.length-1):null;if(!t&&A.length>=3)t=tryEnd(A.length-1,true);if(!t&&A.length>=4)t=tryEnd(A.length-2);if(!t&&A.length>=4)t=tryEnd(A.length-2,true);
  let q,pu,first,valid=true;
  if(t){q=t.q;pu=t.pu;first=pos[t.i]}
  else if(A.length>=2&&Math.abs(A[A.length-1]-A[A.length-2])<.005){q=1;pu=A[A.length-1];first=pos[N.length-2]}
  else if(strict)return null;
  else if(N.length>=3){q=N[N.length-3];pu=N[N.length-2];first=pos[N.length-3];valid=false}
  else{q=1;pu=N[N.length-1];first=pos[N.length-1];valid=false}
  let unit='';for(let k=first;k<tail.length;k++){if(tail[k].u)unit=tail[k].u;if(tail[k].k==='unit'&&!unit)unit=tail[k].v}
  if(!unit&&cm&&first>0&&tail[first-1].k==='unit'){unit=tail[first-1].v;first--}
  const des=cs.slice(0,i).concat(tail.slice(0,first).map(x=>x.raw)).join(' ').replace(/[\s:;.\-–—|]+$/,'').trim();
  if(!/[A-Za-zÀ-ÿ]{3}/.test(des)||META.test(des)||ADDR.test(des)||PHONE.test(des))return null;
  const description=des.replace(/^\d{1,3}[.)\,"'’‘]?\s+/,'');
  return{id:uid(),des:description,q,u:unit,pu,ok:valid,ocrRepaired:!!(t&&t.repaired)}}
function classify(l,ctx,docType){
  if(ctx)return ctx;let f=0,m=0;const d=l.des;
  if(RX_MV.test(d))m+=3;if(l.u==='h')m+=3;if(RX_M.test(d))m+=1;if(RX_F.test(d))f+=2;if(/^fourniture/i.test(d)&&!/pose/i.test(d))f+=2;
  if(/^(u|m|ml|kg|l|m²)$/.test(l.u))f+=1;
  if(m!==f)return m>f?'M':'F';if(docType==='f')return'F';return /^(u|m|ml|kg|l|m²)$/.test(l.u)?'F':'M'}
function isSummaryLine(value){
  const t=norm(value).replace(/[^a-z0-9]+/g,' ').trim();
  const hasTotal=/^(?:sous total|total|totale|montant|cumul)\b/.test(t);
  const hasCategory=/\b(?:main d oeuvre|fournitures?|materiels?|prestations?|services?|travaux|pose|deplacement)\b/.test(t);
  return (hasTotal&&hasCategory)
    || /^(?:main d oeuvre totale?|total main d oeuvre|total net du devis|total ht|total ttc|total net|total general)$/.test(t);
}
function parseItems(L,docType){
  let s=L.findIndex(r=>HEAD.test(r.t)&&HEAD2.test(r.t)&&r.t.length<140);
  const strict=s<0;let e=L.length;
  for(let i=Math.max(0,s+1);i<L.length;i++){
    if(END.test(L[i].t)){
      const tn=norm(L[i].t).replace(/[^a-z0-9]+/g,' ').trim();
      if(/^(?:total ht|total ttc|total net|total general|total due|net a payer|montant total|montant tva|base ht|tva|gst|sales tax|subtotal|conditions|bon pour accord|reste a payer|acompte|reglement|mode de paiement|rib|iban)\b/.test(tn)){e=i;break}
    }
  }
  const items=[];let ctx=null,last=null,cont=0,sawSupplySubtotal=false,recap=false;
  for(let k=Math.max(0,s-3);k<s;k++){const h=L[k];if(h&&h.c.length===1&&HEADING.test(h.t))ctx=/fourn|mat[ée]ri/i.test(h.t)?'F':'M'}
  for(let i=Math.max(0,s+1);i<e;i++){
    const r=L[i],t=r.t,tn=norm(t).replace(/[^a-z0-9]+/g,' ').trim();
    // The second supplies subtotal is the final recap; keep all actual rows before it.
    if(/^sous total fournitures?\b/.test(tn)){
      if(sawSupplySubtotal){recap=true;last=null;continue}
      sawSupplySubtotal=true;last=null;continue;
    }
    if(recap)continue;
    if(SKIP.test(t)||isSummaryLine(t))continue;
    if(HEAD.test(t)&&HEAD2.test(t)&&t.length<140){last=null;continue}
    if(r.c.length===1&&HEADING.test(t)){ctx=/fourn|mat[ée]ri/i.test(t)?'F':'M';last=null;continue}
    const it=lineItem(r,strict);
    if(it){
      if(isSummaryLine(it.des))continue;
      it.ctx=ctx;items.push(it);last=it;cont=0;continue;
    }
    if(last&&cont<2&&t.length<100&&!STOP_LBL.test(t)&&!META.test(t)&&!ADDR.test(t)&&!/\d{2}\s?[\/.]\s?\d{2}/.test(t)&&/[a-zà-ÿ]{3}/i.test(t)){
      last.des+=' – '+t.replace(/^[-–•*\s]+/,'');cont++;
    }
  }
  items.forEach(l=>{l.kind=classify(l,l.ctx,docType)});return items;
}
function money(t){const s=String(t||'').replace(/[;:|,'"’]+\s*$/,'');const m=s.match(/(?:[€₹¥$£©]\s*)?(-?\d[\d\s.,]*)\s*(?:€|₹|¥|\$|£|©|eur\w*)?\s*$/i);return m?pn(m[1]):NaN}
function parseTotals(L){const T={ht:null,ttc:null,tva:null,rate:null,rmPct:null,rm:null};
  for(const r of L){
    const t=r.t.trim(),tn=norm(t),m=money(t),pc=(t.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/)||[])[1];
    // Only accept document-level totals, not line totals or section subtotals.
    if(/^(?:net\s*[àa]\s*payer|total\s*ttc|montant\s*ttc|total\s*t\.?t\.?c|total\s+due)\b/i.test(t)){if(!isNaN(m))T.ttc=m}
    else if(/^(?:total|montant)\s*(?:net\s*)?h\.?t\.?\b|^total\s+net\s+du\s+devis\b|^total\s+g[ée]n[ée]ral\s+h\.?t\.?\b|^sub\s*total\b|^subtotal\b/i.test(t)){if(!isNaN(m))T.ht=m}
    else if(/non\s+applicable|293\s*b/i.test(t)){T.rate=0}
    else if(/^\s*(?:tva|t\.v\.a|gst(?:\s+at\s+\d+(?:[.,]\d+)?\s*%)?|sales\s+tax)\b/i.test(t)&&!/intra|n°/i.test(t)){if(pc)T.rate=pn(pc);if(!isNaN(m)&&!/%\s*$/.test(t))T.tva=Math.abs(m)}
    else if(/^\\W*(?:remise|r[ée]duction|escompte)\b(?!\s+(?:en|à|a)\s)/i.test(t)){if(pc)T.rmPct=pn(pc);else if(!isNaN(m))T.rm=Math.abs(m)}
  }
  if(T.rate==null){const snap=x=>{for(const a of[0,2.1,5.5,8.5,10,20])if(Math.abs(x-a)<.7)return a;return r2(x)};
    if(T.tva!=null&&T.ht>0)T.rate=snap(T.tva/T.ht*100);else if(T.ttc>0&&T.ht>0)T.rate=snap((T.ttc/T.ht-1)*100)}
  return T}
function appendUniqueText(existing,next){
  const a=dedupeRepeatedPhrase(existing),b=dedupeRepeatedPhrase(next),na=norm(a),nb=norm(b);
  if(!a)return b;if(!b)return a;
  if(na===nb||na.includes(nb))return a;
  if(nb.includes(na))return b;
  return a+', '+b;
}
function clientFrom(block){const c={name:'',addr:'',cp:'',ville:'',tel:'',email:''};
  for(const raw of block){let s=dedupeRepeatedPhrase(String(raw).trim());if(!s||isMine(s))continue;
    const em=s.match(EMAIL);if(em&&!c.email){c.email=em[0];s=s.replace(em[0],'').replace(/e-?mail\s*:?/i,'').trim()}
    const ph=s.match(PHONE);if(ph&&!c.tel){c.tel=fmtTel(ph[0]);s=s.replace(ph[0],'').replace(/(t[ée]l[ée]?(?:phone)?|mob(?:ile)?|port(?:able)?)\.?\s*:?/i,'').trim()}
    s=dedupeRepeatedPhrase(s.replace(/^(?:nom|adresse|adr\.?|ville|code\s*postal(?:\s+(?:du\s+)?chantier)?)\s*:\s*/i,'').replace(/^[:\-–\s]+|[:\-–\s]+$/g,''));if(!s)continue;
    if(c.name&&norm(s)===norm(c.name))continue;
    const cv=s.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ'’\- ]{2,})$/);
    if(cv&&!c.cp){c.cp=cv[1];c.ville=cv[2].trim();s=s.replace(cv[0],'').trim();if(s)c.addr=appendUniqueText(c.addr,s);continue}
    if(!c.name){c.name=s;continue}
    c.addr=appendUniqueText(c.addr,s)}
  c.name=dedupeRepeatedPhrase(c.name);c.addr=dedupeRepeatedPhrase(c.addr);
  return c}
function blockAfter(L,i,ci,max){
  const out=[],r0=L[i],x0=r0.xs?r0.xs[ci]:null;
  const x1=r0.xs&&ci+1<r0.xs.length?r0.xs[ci+1]-8:Infinity;
  const right=!r0.xs&&ci>0;let miss=0;
  for(let k=i+1;k<L.length&&out.length<max;k++){
    const r=L[k];let s='';
    if(HEAD.test(r.t)&&HEAD2.test(r.t))break;
    if(x0!=null&&r.xs)s=r.c.filter((cell,j)=>r.xs[j]>=x0-12&&r.xs[j]<x1).join(' ');
    else if(right){if(r.c.length<2)break;s=r.c[r.c.length-1]}
    else s=r.c[0];
    s=(s||'').trim();if(!s){if(++miss>2)break;continue}
    if(STOP_LBL.test(s)||CLI_LBL.test(s)||SITE_LBL.test(s))break;
    out.push(s);
  }
  return out;
}
function findClient(L){let cli=null,site=null;
  // Client fields are taken only from an explicit client/destination block.
  // This avoids mistaking the company, issuer, or another contact for the customer.
  for(let i=0;i<L.length&&!(cli&&site);i++){const r=L[i];
    for(let ci=0;ci<r.c.length;ci++){const cell=r.c[ci];if(cell.length>120)continue;let m;
      if(!cli&&(m=cell.match(CLI_LBL))){const b=blockAfter(L,i,ci,8),labelName=m[1].trim();if(labelName&&(!/^bill\s*to\b/i.test(cell)||labelName.replace(/[^A-Za-zÀ-ÿ]/g,'').length>=3))b.unshift(labelName);const c=clientFrom(b);if(c.name&&!isMine(c.name))cli=c}
      else if(!site&&(m=cell.match(SITE_LBL))){const b=blockAfter(L,i,ci,4).filter(x=>!/^nom\s*:/i.test(x));if(m[1].trim())b.unshift(m[1].trim());const c=clientFrom(['x'].concat(b));if(c.addr||c.cp)site=c}
    }
  }
  cli=cli||{name:'',addr:'',cp:'',ville:'',tel:'',email:''};
  const addrs=[];
  if(cli.addr||cli.cp)addrs.push({t:'Facturation',addr:cli.addr,cp:cli.cp,ville:cli.ville});
  if(site&&(site.addr||site.cp))addrs.push({t:'Chantier',addr:site.addr,cp:site.cp,ville:site.ville});
  return{cli,addrs}}
function detectType(L,name){const head=L.slice(0,18).map(r=>r.t).join('\n')+'\n'+name,all=L.map(r=>r.t).join('\n'),n=(rx,s)=>(s.match(rx)||[]).length;
  const d=n(/devis|estimate|quotation/gi,head)*3+n(/devis|estimate|quotation/gi,all)+(/bon pour accord/i.test(all)?3:0),
        f=n(/factur|invoice|receipt/gi,head)*3+n(/factur|invoice|receipt/gi,all)+(/net [àa] payer|[ée]ch[ée]ance|total due/i.test(all)?1:0),
        x=n(/rapport|compte[- ]rendu|bon d.intervention/gi,head)*4+n(/observations?|constat/gi,all);
  return x>d&&x>f?'x':f>d?'f':'d'}
function reportCategory(text){const t=norm(text);if(/degat des eaux|inondation|sinistre.*eau/.test(t))return'Dégât des eaux';if(/recherche.*fuite|fuite|infiltration/.test(t))return'Recherche de fuite';if(/panne.*chauffage|chaudiere|chauffage/.test(t))return'Panne de chauffage';if(/diagnostic.*plomberie|diagnostic plomberie/.test(t))return'Diagnostic plomberie';return'Autre'}
function detectNum(L,name){const head=L.slice(0,30).map(r=>r.t).join('\n'),file=String(name||'').replace(/\.[^.]+$/,'');
  const rx=[
    /\b((?:DEV|FAC|FACT|FA|RAP|RI|DE|INV)[-_/ ]?\d{4}[-_/ ]?\d{1,6})\b/i,
    /(?:devis|facture|rapport|invoice|receipt)\s*(?:n[°o]|no\.?|num[ée]ro|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_/.]{2,})/i,
    /(?:n[°o]|no\.?|num[ée]ro|number|#)\s*(?:(?:de\s*)?(?:devis|facture|rapport|invoice|receipt)\s*)?[:\-]?\s*([A-Z0-9][A-Z0-9\-_/.]*\d[A-Z0-9\-_/.]*)/i
  ];
  const normalize=m=>m&&m[1].toUpperCase().replace(/[_ /]+/g,'-').replace(/-+/g,'-').replace(/[.,]+$/,'');
  for(const source of [head,file])for(const r of rx){const m=source.match(r);if(m)return normalize(m)}
  const namedFile=file.match(/\b(devis|quote|facture|invoice|rapport|report)[\s_-]+((?:(?:DEV|FAC|FACT|FA|RAP|INV)[-_/ ]?)?\d[\dA-Z\-_/]*)/i);
  if(namedFile){const prefix=/^(devis|quote)$/i.test(namedFile[1])?'DEV':/^(facture|invoice)$/i.test(namedFile[1])?'FAC':'RAP';return normalize([null,/^[A-Z]{2,5}[-_/ ]?\d/i.test(namedFile[2])?namedFile[2]:prefix+'-'+namedFile[2]])}
  return''}
function parse(text,name,rowsIn){
  const L=(rowsIn&&rowsIn.length?rowsIn:toRows(text)).filter(r=>r.c&&r.c.length);L.forEach(r=>{r.c=r.c.map(v=>dedupeRepeatedPhrase(v).replace(/^[\s.;:|,'"“”’]+/,'').replace(/^i(?=\s+(?:subtotal|total|gst|tva)\b)/i,'')).filter(Boolean);r.t=dedupeRepeatedPhrase(r.c.join(' ')).replace(/\s+/g,' ').trim()});
  const type=detectType(L,name||''),num=detectNum(L,name||''),top=L.slice(0,40);
  let date=null,due=null;
  for(const r of top){const ds=datesIn(r.t);if(!ds.length)continue;
    if(/valid|[ée]ch[ée]ance|valable|\bdue\b/i.test(r.t)){due=due||ds[0]}else if(!date||/date/i.test(r.t))date=date&&!/date/i.test(r.t)?date:ds[0]}
  const{cli,addrs}=findClient(L),lines=parseItems(L,type),tot=parseTotals(L),warns=[],repairs=[];
  const sum=r2(lines.reduce((a,l)=>a+l.q*l.pu,0));
  const dropLeadingOcrGlyph=v=>{const s=String(v==null?'':v);if(!/^\d{4,}(?:\.\d{1,2})?$/.test(s))return null;const n=pn(s.slice(1));return isFinite(n)?r2(n):null};
  const matches=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<=.01;
  if(tot.ht!=null&&sum>0&&!matches(tot.ht,sum)&&matches(dropLeadingOcrGlyph(tot.ht),sum)){tot.ht=sum;repairs.push('sous-total')}
  if(tot.ht!=null&&tot.rate!=null){const inferredTax=r2(tot.ht*tot.rate/100),inferredTtc=r2(tot.ht+inferredTax);
    if(tot.tva!=null&&!matches(tot.tva,inferredTax)&&matches(dropLeadingOcrGlyph(tot.tva),inferredTax)){tot.tva=inferredTax;repairs.push('TVA')}
    if(tot.ttc!=null&&!matches(tot.ttc,inferredTtc)&&matches(dropLeadingOcrGlyph(tot.ttc),inferredTtc)){tot.ttc=inferredTtc;repairs.push('total TTC')}
  }
  if(lines.some(l=>l.ocrRepaired))repairs.push('prix de ligne');
  if(repairs.length)warns.push('Caractères OCR corrigés par rapprochement des calculs ('+repairs.join(', ')+'). Vérifiez les montants sur le document original.');
  if(tot.rmPct==null&&tot.rm&&sum>0)tot.rmPct=r2(tot.rm/sum*100);
  const ht=r2(sum*(1-(tot.rmPct||0)/100));
  if(type!=='x'&&!lines.length)warns.push('Aucune ligne de prestation ou fourniture reconnue : ajoutez-les à la main ou réessayez avec un meilleur scan.');
  if(tot.ht!=null&&lines.length&&Math.abs(tot.ht-ht)>.05)warns.push('Écart entre le total lu ('+eur(tot.ht)+') et la somme des lignes ('+eur(ht)+') : vérifiez les quantités et prix.');
  if(tot.ttc!=null&&lines.length){const calculatedTTC=r2(ht*(1+(tot.rate||0)/100));if(Math.abs(tot.ttc-calculatedTTC)>.05)warns.push('Écart entre le TTC lu ('+eur(tot.ttc)+') et le TTC recalculé ('+eur(calculatedTTC)+') : vérifiez la TVA, les lignes ou un éventuel acompte.');}
  if(lines.some(l=>!l.ok))warns.push('Certaines lignes sont à vérifier (encadrées en orange).');
  if(!cli.name)warns.push('Client non détecté : saisissez-le ci-dessous.');
  return{type,num,date,due,cli,addrs,lines,tot:{ht:tot.ht,ttc:tot.ttc,rate:tot.rate,rmPct:tot.rmPct||0},warns,txt:type==='x'?text.slice(0,6000):'',reportType:type==='x'?reportCategory(text):'',paid:/acquitt/i.test(text)}}
const calc=d=>{const s=r2(d.lines.reduce((a,l)=>a+nv(l.q)*nv(l.pu),0)),rm=r2(s*nv(d.tot.rmPct)/100),ht=r2(s-rm),tva=r2(ht*nv(d.tot.rate)/100);return{s,rm,ht,tva,ttc:r2(ht+tva)}};
const lineIncomplete=l=>!String(l&&l.des||'').trim()||!(nv(l&&l.q)>0);
function transferProblems(it){const d=it&&it.data;if(!d||d.type==='x')return[];const problems=[],lines=Array.isArray(d.lines)?d.lines:[];
  if(!lines.length)problems.push('Aucune ligne reconnue : ajoute une prestation ou une fourniture avant de créer le document.');
  const incomplete=lines.filter(lineIncomplete).length;if(incomplete)problems.push(`${incomplete} ligne${incomplete>1?'s':''} incomplète${incomplete>1?'s':''} : renseigne la désignation et une quantité supérieure à zéro.`);
  const unchecked=lines.filter(l=>!l.ok).length;if(unchecked)problems.push(`${unchecked} ligne${unchecked>1?'s':''} encadrée${unchecked>1?'s':''} en orange à confirmer après comparaison avec le fichier original.`);
  if(lines.length){const c=calc(d);
    if(d.tot.ht!=null&&Math.abs(d.tot.ht-c.ht)>.05)problems.push(`Le total HT lu (${eur(d.tot.ht)}) ne correspond pas au calcul des lignes (${eur(c.ht)}). Corrige les lignes ou la remise.`);
    if(d.tot.ttc!=null&&Math.abs(d.tot.ttc-c.ttc)>.05)problems.push(`Le TTC lu (${eur(d.tot.ttc)}) ne correspond pas au calcul (${eur(c.ttc)}). Vérifie les lignes, la TVA et la remise.`)}
  return problems}

/* ---------- adaptation au modèle de données de l'app (détecté sur tes données) ---------- */
let PR=null,PRsig='';
function keysOf(a){const m={};a.forEach(o=>{if(o&&typeof o==='object')for(const k in o)(m[k]=m[k]||[]).push(o[k])});return m}
function pick(objs,test,prefs,def,strict){const m=keysOf(objs),ok=k=>(m[k]||[]).some(v=>typeof v==='string'&&v&&test(v));
  for(const k of prefs)if(ok(k))return k;if(strict)return def;
  let best=null,bc=0;for(const k in m){if(k==='id')continue;const c=m[k].filter(v=>typeof v==='string'&&v&&test(v)).length;if(c>bc){bc=c;best=k}}return best||def}
const has=(m,list)=>list.find(k=>(m[k]||[]).length&&m[k].some(v=>v!=null&&v!==''));
function probe(){const s=SS()||{},D=(s.docs||[]).filter(Boolean).slice(-40),C=(s.clients||[]).filter(Boolean).slice(-60),T=(s.cat||[]).filter(Boolean).slice(-80),R=(s.rep||[]).filter(Boolean).slice(-20);
  const sig=[D.length,C.length,T.length,R.length].join('|');if(PR&&PRsig===sig)return PR;
  const K={},isPhone=v=>/^[+\d][\d\s.()+\-]{7,}$/.test(v.trim());
  K.dNum=pick(D,v=>/^[A-Za-z]{1,5}[-_/ ]?\d{4}[-_/ ]?\d{1,6}$/.test(v.trim()),['no','num','numero','n','ref','nb'],'num');
  K.dDate=pick(D,v=>/^\d{4}-\d{2}-\d{2}$/.test(v),['date','dt','d','dc'],'date');
  K.dCli='cid';const ids=new Set(C.map(c=>c.id)),cn={};
  D.forEach(d=>{for(const k in d)if(typeof d[k]==='string'&&ids.has(d[k]))cn[k]=(cn[k]||0)+1});
  const ck=Object.keys(cn).sort((a,b)=>cn[b]-cn[a])[0];if(ck)K.dCli=ck;
  const LN=[];D.forEach(d=>(d.F||[]).concat(d.M||[]).forEach(l=>l&&typeof l==='object'&&LN.push(l)));const lk=keysOf(LN);
  let des=null,db=0;for(const k in lk){if(k==='id'||k==='q'||k==='p')continue;const vs=lk[k].filter(v=>typeof v==='string'&&v);if(!vs.length)continue;const a=vs.reduce((x,v)=>x+v.length,0)/vs.length;if(a>db){db=a;des=k}}
  K.lDes=des||'d';K.lUnit=LN.length?null:'u';
  for(const k in lk){if(k===K.lDes||k==='id'||k==='q'||k==='p')continue;const vs=lk[k].filter(v=>typeof v==='string'&&v);if(vs.length&&vs.every(v=>v.length<=8)){K.lUnit=k;break}}
  K.lId=LN.length?('id' in LN[0]):true;
  K.c={name:pick(C,v=>!/@/.test(v)&&!isPhone(v)&&!/^\d/.test(v)&&v.length>1,['n','nom','name','cn','nm','raison'],'n',1),
       email:pick(C,v=>/@/.test(v),['e','email','mail','em'],'e'),tel:pick(C,isPhone,['t','tel','tl','phone','mob','gsm'],'t'),
       cp:C.length?pick(C,v=>/^\d{5}$/.test(v.trim()),['cp','zip','postal'],null):'cp',
       ville:C.length?pick(C,v=>v.length>1,['v','ville','city','vl'],null,1):'v',
       addr:pick(C,v=>/\d/.test(v)&&/[A-Za-zÀ-ÿ]{3}/.test(v)&&!/@/.test(v)&&v.length>6,['a','adr','adresse','address','rue'],'a',1)};
  K.dEmb={name:'cn',addr:'ca',postalCity:'cc',tel:'ct',email:'ce'};
  const tk=keysOf(T);K.cat={name:'d',price:'p',unit:'u',type:'t',buy:null,mrg:null};K.catT={F:'F',M:'M'};
  if(T.length){let b=0;for(const x in tk){if(x==='id')continue;const vs=tk[x].filter(v=>typeof v==='string'&&v);if(!vs.length)continue;const a=vs.reduce((q,v)=>q+v.length,0)/vs.length;if(a>b){b=a;K.cat.name=x}}
    K.cat.price=has(tk,['p','pv','pu','prix','price','ht'])||'p';K.cat.unit=has(tk,['u','un','unit','unite']);
    K.cat.type=has(tk,['k','cat','categorie','type','t','g']);K.cat.buy=has(tk,['a','ach','achat','pa','cout']);K.cat.mrg=has(tk,['m','mg','marge','coef','marg']);
    if(K.cat.type){const vals=[...new Set(tk[K.cat.type].filter(v=>typeof v==='string'&&v))];K.catT={F:vals.find(v=>/^f|fourn|mat/i.test(v))||'F',M:vals.find(v=>/^(m|p|s)|prest|main|serv/i.test(v))||'M'}}
    if(K.cat.buy&&K.cat.mrg){const x=T.find(t=>nv(t[K.cat.buy])>0&&nv(t[K.cat.price])>0);
      if(x){const b2=nv(x[K.cat.buy]),m=nv(x[K.cat.mrg]),p=nv(x[K.cat.price]);K.cat.f=Math.abs(b2*(1+m/100)-p)<.02?1:Math.abs(b2/(1-m/100)-p)<.02?2:0;K.cat.mv=m}else K.cat.f=0}}
  K.r={txt:'tr',ti:'ty',date:'date',cli:'cn'};
  if(R.length){const rk=keysOf(R);let b=0;for(const x in rk){if(x==='id')continue;const vs=rk[x].filter(v=>typeof v==='string'&&v);if(!vs.length)continue;const a=vs.reduce((q,v)=>q+v.length,0)/vs.length;if(a>b){b=a;K.r.txt=x}}
    K.r.date=pick(R,v=>/^\d{4}-\d{2}-\d{2}$/.test(v),['date','dt','d'],'date');K.r.ti=has(rk,['ty','ti','titre','t','obj','objet','n'])||'ty';
    const cc={};R.forEach(d=>{for(const k in d)if(typeof d[k]==='string'&&ids.has(d[k]))cc[k]=1});K.r.cli=Object.keys(cc)[0]||'cn'}
  K.first=D.length>1&&String(D[0][K.dDate]||'')>=String(D[D.length-1][K.dDate]||'');
  PR=K;PRsig=sig;return K}
const emptyLike=o=>{const r={};for(const k in o){const v=o[k];r[k]=Array.isArray(v)?[]:typeof v==='number'?0:typeof v==='boolean'?false:v&&typeof v==='object'?{}:''}return r};

/* ---------- état ---------- */
const ST={items:[],sel:null,loaded:false,q:false};let UNDO=null;
const cur=()=>ST.items.find(i=>i.id===ST.sel)||null;
function persist(){try{localStorage.setItem(LS,JSON.stringify(ST.items.slice(-15).map(i=>({id:i.id,name:i.name,size:i.size,kind:i.kind,status:i.status,err:i.err,raw:(i.raw||'').slice(0,20000),data:i.data,sc:i.sc,opt:i.opt,match:i.match,dup:i.dup,addr:i.addr,res:i.res}))))}catch(e){}}
function restore(){if(ST.loaded)return;ST.loaded=true;try{const a=JSON.parse(localStorage.getItem(LS)||'[]');a.forEach(i=>{if(i.status==='run'||i.status==='wait')i.status='err',i.err='Interrompu : réimportez le fichier.';ST.items.push(i)});ST.sel=(ST.items.find(i=>i.data)||{}).id||null}catch(e){}}

/* ---------- analyse d'un fichier ---------- */
function clientCands(cli){const s=SS(),K=probe(),out=[];if(!s||!cli.name)return out;const n1=norm(cli.name),t1=n1.split(' ').filter(Boolean),dg=x=>String(x||'').replace(/\D/g,'').slice(-9);
  (s.clients||[]).forEach(c=>{if(!c)return;const n2=norm(c[K.c.name]),t2=n2.split(' ').filter(Boolean);let sc=0;
    if(cli.email&&c[K.c.email]&&cli.email.toLowerCase()===String(c[K.c.email]).toLowerCase())sc=3;
    else if(cli.tel&&dg(cli.tel).length===9&&dg(cli.tel)===dg(c[K.c.tel]))sc=3;
    else if(n1&&n1===n2)sc=3;else if(t1.length&&t2.length&&(t1.every(t=>t2.includes(t))||t2.every(t=>t1.includes(t))))sc=2;
    if(sc)out.push({c,sc,n:c[K.c.name]})});return out.sort((a,b)=>b.sc-a.sc).slice(0,4)}
async function analyse(it){it.status='run';it.prog=.02;it.err='';paint();
  try{if(!it.file){if(!it.raw)throw new Error('Fichier absent : réimportez-le.');it.data=parse(it.raw,it.name)}
    else{const r=await extractText(it);it.raw=r.text;it.data=parse(r.text,it.name,r.rows)}
    const d=it.data,c=clientCands(d.cli);it.match=c[0]&&c[0].sc>=3?c[0].c.id:'new';it.addr=0;
    it.sc=it.sc||{cli:0,pre:0,fou:0,all:1};it.opt=it.opt||{keep:1,num:1};it.dup=it.dup||'copy';
    it.status=d.warns.length?'warn':'ok';if(!it.raw||it.raw.replace(/\s/g,'').length<10){it.status='err';it.err='Aucun texte lisible dans ce fichier.'}}
  catch(e){it.status='err';it.err=(e&&e.message)||'Lecture impossible'}
  it.prog=1;persist();paint()}
async function runQueue(){if(ST.q)return;ST.q=true;
  try{for(let it;(it=ST.items.find(i=>i.status==='wait'));){await analyse(it);if(!ST.sel||!cur()||!cur().data)ST.sel=it.id}}finally{ST.q=false}
  paint();say('Analyse terminée')}
function addFiles(files){[...files].forEach(f=>{const it={id:uid(),name:f.name,size:f.size,kind:kindOf(f),status:'wait',prog:0,file:f,url:URL.createObjectURL(f),sc:{cli:0,pre:0,fou:0,all:1},opt:{keep:1,num:1},dup:'copy'};ST.items.push(it);if(!ST.sel)ST.sel=it.id});paint();runQueue()}

/* ---------- transfert vers l'app ---------- */
function snap(){UNDO={};['clients','cat','docs','rep','seq'].forEach(k=>{try{UNDO[k]=JSON.stringify((SS()||{})[k])}catch(e){}})}
function undo(){if(!UNDO)return;const s=SS();for(const k in UNDO){if(UNDO[k]===undefined)continue;s[k]=JSON.parse(UNDO[k]);try{G.save&&G.save(k)}catch(e){}}UNDO=null;ST.items.forEach(i=>{if(i.status==='done'){i.status='ok';i.res=null}});persist();paint();say('Transfert annulé')}
function dupDoc(it){const s=SS(),K=probe(),d=it.data;if(!d||!d.num||d.type==='x'||!s)return null;
  return(s.docs||[]).find(x=>x&&x.t===d.type&&norm(x[K.dNum])===norm(d.num))||null}
function nextNo(t,K,hint){const docs=(SS().docs||[]).filter(x=>x&&x.t===t),yr=new Date().getFullYear();
  const m=(hint||'').match(/^(.*?)(\d+)$/),def=(t==='f'?'FAC':'DEV')+'-'+yr+'-';
  let pre=m?m[1]:def,w=m?m[2].length:3,max=0;
  docs.forEach(x=>{const mm=String(x[K.dNum]||'').match(/^(.*?)(\d+)$/);if(mm&&mm[1]===pre)max=Math.max(max,+mm[2])});
  if(!max&&!m&&docs.length){const mm=String(docs[docs.length-1][K.dNum]||'').match(/^(.*?)(\d+)$/);if(mm){pre=mm[1];w=mm[2].length;docs.forEach(x=>{const m3=String(x[K.dNum]||'').match(/^(.*?)(\d+)$/);if(m3&&m3[1]===pre)max=Math.max(max,+m3[2])})}}
  return pre+String(max+1).padStart(w,'0')}
function upCli(it,K,out){const s=SS(),C=s.clients||(s.clients=[]),c=it.data.cli,a=it.data.addrs[it.addr||0]||{addr:c.addr,cp:c.cp,ville:c.ville};
  const v={name:c.name,addr:a.addr||'',cp:a.cp||'',ville:a.ville||'',tel:c.tel,email:c.email};
  if(!K.c.cp&&v.cp){v.addr=[v.addr,(v.cp+' '+v.ville).trim()].filter(Boolean).join(', ');v.cp=''}
  const t=it.match&&it.match!=='new'?C.find(x=>x.id===it.match):null;
  if(t){let n=0;for(const r in v)if(v[r]&&K.c[r]&&!t[K.c[r]]){t[K.c[r]]=v[r];n++}out.push('Client existant complété ('+(t[K.c.name]||'')+')');return t.id}
  const o=Object.assign(emptyLike(C[C.length-1]||{}),{id:uid()});for(const r in v)if(v[r]&&K.c[r])o[K.c[r]]=v[r];C.push(o);out.push('Nouveau client : '+c.name);return o.id}
function upTarifs(ls,K,out){const s=SS(),C=s.cat||(s.cat=[]);let add=0,skip=0;
  for(const l of ls){const ex=C.find(x=>norm(x[K.cat.name])===norm(l.des));if(ex){if(!nv(ex[K.cat.price])&&l.pu)ex[K.cat.price]=l.pu;skip++;continue}
    const o=Object.assign(emptyLike(C[C.length-1]||{}),{id:uid()});o[K.cat.name]=l.des;o[K.cat.price]=l.pu;
    if(K.cat.unit&&l.u)o[K.cat.unit]=l.u;if(K.cat.type)o[K.cat.type]=K.catT[l.kind];
    if(K.cat.buy&&K.cat.mrg&&K.cat.f){const m=K.cat.mv||0;o[K.cat.mrg]=m;o[K.cat.buy]=r2(K.cat.f===1?l.pu/(1+m/100):l.pu*(1-m/100))}
    C.push(o);add++}
  out.push(add+' ajouté'+(add>1?'s':'')+' dans Mes tarifs'+(skip?' ('+skip+' déjà présent'+(skip>1?'s':'')+')':''))}
function mkLine(l,K){const o={};if(K.lId)o.id=uid();o[K.lDes]=l.des;o.q=l.q;o.p=l.pu;if(K.lUnit&&l.u)o[K.lUnit]=l.u;return o}
function mkDoc(it,K,cid,out){const s=SS(),d=it.data,t=d.type==='f'?'f':'d',docs=s.docs||(s.docs=[]),dup=dupDoc(it);
  const tpl=docs.slice().reverse().find(x=>x&&x.t===t)||docs[docs.length-1]||{};
  const F=d.lines.filter(l=>l.kind==='F').map(l=>mkLine(l,K)),M=d.lines.filter(l=>l.kind!=='F').map(l=>mkLine(l,K));
  const rate=d.tot.rate!=null?d.tot.rate:(tpl.tva!=null?tpl.tva:10);
  if(dup&&it.dup==='replace'){dup.F=F;dup.M=M;dup.rm=d.tot.rmPct||0;dup.tva=rate;if(cid)dup[K.dCli]=cid;out.push('Document '+dup[K.dNum]+' remis dans ta mise en page');return dup}
  const o=emptyLike(tpl);o.id=uid();o.t=t;
  let no=it.opt.num&&d.num?d.num:'';if(!no||dup)no=nextNo(t,K,no||'');
  o[K.dNum]=no;o[K.dDate]=d.date||today();if(cid)o[K.dCli]=cid;
  const c=d.cli;if(c.name){const emb={name:c.name,tel:c.tel,email:c.email,addr:c.addr,postalCity:[c.cp,c.ville].filter(Boolean).join(' ')};for(const r in K.dEmb)if(emb[r])o[K.dEmb[r]]=emb[r]}
  const site=(d.addrs||[]).find(a=>/chantier|intervention/i.test(a.t||''));if(site){o.sa=site.addr||'';o.sc=[site.cp,site.ville].filter(Boolean).join(' ')}
  o.F=F;o.M=M;o.rm=d.tot.rmPct||0;o.tva=rate;o.acc=tpl.acc!=null?tpl.acc:((s.cfg&&s.cfg.acc)||40);o.paid=!!(t==='f'&&d.paid);o.ap=false;o.st='';
  if(K.first)docs.unshift(o);else docs.push(o);out.push((t==='f'?'Facture ':'Devis ')+no+' créé'+(t==='f'?'e':'')+' ('+d.lines.length+' ligne'+(d.lines.length>1?'s':'')+')');return o}
function mkRapport(it,K,cid,out){const s=SS(),R=s.rep||(s.rep=[]),d=it.data,y=new Date().getFullYear(),seqKey='r'+y;
  if(!d.num)s.seq[seqKey]=(s.seq[seqKey]||0)+1;
  const a=d.addrs?.[it.addr||0]||{addr:d.cli.addr,cp:d.cli.cp,ville:d.cli.ville},num=d.num||'RAP-'+y+'-'+String(s.seq[seqKey]).padStart(3,'0'),o=Object.assign(emptyLike(R[R.length-1]||{}),{id:uid(),num,date:d.date||today(),ty:d.reportType||'Autre',cn:d.cli.name||'',ca:a.addr||d.cli.addr||'',cc:[a.cp||d.cli.cp,a.ville||d.cli.ville].filter(Boolean).join(' '),ct:d.cli.tel||'',ass:'',sn:'',mo:'',co:'',org:'',tr:d.txt||'',pr:''});
  if(K.r.date!=='date')o[K.r.date]=d.date||today();if(K.r.ti!=='ty')o[K.r.ti]='Rapport';if(K.r.txt!=='tr')o[K.r.txt]=d.txt||'';if(K.r.cli!=='cn'&&cid)o[K.r.cli]=cid;
  R.unshift(o);out.push('Rapport créé');return o}
function commit(it){const s=SS();if(!s)return say('Application non prête');const d=it.data,sc=it.sc;
  if(sc.all){const problems=transferProblems(it);if(problems.length)return say('Transfert complet bloqué : '+problems[0])}
  else if(sc.pre||sc.fou){const lines=d.lines.filter(l=>(sc.pre&&l.kind!=='F')||(sc.fou&&l.kind==='F'));if(lines.some(l=>!l.ok))return say('Vérifie ou confirme les lignes orange avant de les ajouter à Mes tarifs')}
  const K=probe(),out=[];snap();
  try{let cid=null;
    if((sc.all||sc.cli)&&d.cli.name)cid=upCli(it,K,out);
    const kinds=[];if(sc.pre||(sc.all&&it.opt.keep))kinds.push('M');if(sc.fou||(sc.all&&it.opt.keep))kinds.push('F');
    if(kinds.length&&d.type!=='x')upTarifs(d.lines.filter(l=>kinds.includes(l.kind==='F'?'F':'M')&&l.des&&l.pu>0),K,out);
    let doc=null;if(sc.all)doc=d.type==='x'?mkRapport(it,K,cid,out):mkDoc(it,K,cid,out);
    ['clients','cat','docs','rep','seq'].forEach(k=>{try{G.save&&G.save(k)}catch(e){}});
    if(typeof G.cliBackfill==='function')try{G.cliBackfill()}catch(e){}
    it.status='done';it.res={msg:out,id:doc&&doc.id,rep:d.type==='x'};persist();paint();say('Transfert terminé')}
  catch(e){undo();it.err='Transfert annulé : '+e.message;it.status='warn';paint();say('Erreur, rien n\'a été modifié')}}

/* ---------- interface ---------- */
const IC={up:'<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',file:'<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
 eye:'<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',re:'<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
 tr:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',ok:'<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',cam:'<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'};
const CSS=`.imp svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.imp .mu{color:var(--mu)}.imp-p{margin:0 0 12px;font-size:14px;line-height:1.4;color:var(--mu)}
.imp-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:180px;padding:22px 12px;border:2px dashed var(--cu);border-radius:20px;background:color-mix(in srgb,var(--cu) 8%,var(--in));text-align:center;cursor:pointer}
.imp-drop svg{width:42px;height:42px;color:var(--cu)}.imp-drop b{font-size:17px;font-weight:600;color:var(--ink)}.imp-drop small{font-size:14px;color:var(--mu)}.imp-drop.over{background:color-mix(in srgb,var(--cu) 20%,var(--in))}
.imp .b{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px;text-align:center}
.imp-it{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:12px;margin-bottom:8px;border:1.5px solid var(--ln);border-radius:16px;background:var(--cd)}
.imp-it.sel{border-color:var(--cu)}.imp-ic{width:40px;height:40px;border-radius:12px;background:var(--cu);color:#fff;display:grid;place-items:center}
.imp-nm{flex:1;min-width:0}.imp-nm b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.imp-nm small{color:var(--mu);font-size:12px}
.imp-er{display:block;color:var(--rd);font-size:12px;margin-top:2px;white-space:normal}.imp-bar{height:4px;border-radius:2px;background:var(--ln);margin-top:6px;overflow:hidden}.imp-bar i{display:block;height:100%;background:var(--cu);transition:width .3s}
.imp-st{font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;background:var(--in);color:var(--mu)}.imp-st.ok,.imp-st.done{background:var(--ok);color:#fff}.imp-st.warn,.imp-st.run{background:var(--cu);color:#fff}.imp-st.err{background:var(--rd);color:#fff}
.imp-ac{display:flex;gap:6px;margin-left:auto}.imp-ac button{width:40px;height:40px;border:0;border-radius:12px;background:var(--in);color:var(--ink);display:grid;place-items:center}
.imp-seg{display:flex;background:var(--in);border-radius:12px;padding:3px;margin-bottom:12px}.imp-seg button{flex:1;border:0;background:none;min-height:38px;border-radius:9px;font:inherit;font-weight:600;color:var(--mu)}.imp-seg button.on{background:var(--ink);color:var(--bg)}
.imp-g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.imp-g>*{min-width:0}.imp-g .w{grid-column:1/-1}
.imp-f{display:block;margin:0 0 8px;font-size:13px;color:var(--mu);font-weight:500}.imp-f input,.imp-f select,.imp-f textarea{margin-top:4px;width:100%;font-size:16px}
.imp-sub{font-size:15px;font-weight:700;margin:16px 0 8px;color:var(--ink)}
.imp-ln{padding:10px;margin-bottom:8px;border:1.5px solid var(--ln);border-radius:14px}.imp-ln.w{border-color:var(--cu);background:color-mix(in srgb,var(--cu) 7%,transparent)}
.imp-ln .imp-g{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:6px}.imp-tt{font-size:12px;color:var(--mu)}.imp-tt b{display:block;font-size:15px;color:var(--ink);padding-top:4px}
.imp-la{display:flex;gap:8px;margin-top:8px}.imp-la button{flex:1;min-height:40px;border:0;border-radius:10px;background:var(--in);color:var(--ink);font:inherit;font-size:14px;font-weight:600}
.imp-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0}.imp-row.big{border-top:1px solid var(--ln);margin-top:4px;padding-top:8px;font-size:18px;font-weight:700}
.imp-w{margin:8px 0;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--cu) 12%,var(--in));font-size:13px;line-height:1.4}.imp-w.ok{background:color-mix(in srgb,var(--ok) 14%,var(--in))}
.imp-opt{display:flex;align-items:center;gap:12px;padding:14px;margin-bottom:8px;background:var(--in);border:1.5px solid transparent;border-radius:16px;font-size:16px;font-weight:600;color:var(--ink);cursor:pointer}
.imp-opt input{position:absolute;opacity:0;pointer-events:none}.imp-ck{width:26px;height:26px;border-radius:8px;border:2px solid var(--mu);display:grid;place-items:center;color:transparent;flex:none}.imp-ck svg{width:16px;height:16px;stroke-width:3}
.imp-opt.on{border-color:var(--cu);background:color-mix(in srgb,var(--cu) 10%,var(--in))}.imp-opt.on .imp-ck{background:var(--cu);border-color:var(--cu);color:#fff}.imp-opt.o2{font-weight:500;font-size:15px}
.imp pre{white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:260px;overflow:auto;background:var(--in);padding:10px;border-radius:10px}
body.imp-preview-open{overflow:hidden;overscroll-behavior:none}.imp-pv{position:fixed;inset:0;z-index:60;background:var(--bg);display:flex;flex-direction:column}.imp-pv>div:first-child{display:flex;gap:8px;align-items:center;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px}.imp-pv>div:first-child b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.imp-pv-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 12px calc(16px + env(safe-area-inset-bottom,0px))}.imp-pv-pages{display:grid;justify-items:center;gap:12px}.imp-pv-page-wrap{width:100%;max-width:100%;overflow:hidden;background:#fff;box-shadow:0 2px 12px #0002}.imp-pv-page{display:block;width:100%;height:100%}.imp-pv-status{padding:12px;color:var(--mu);text-align:center}.imp-pv img{display:block;width:100%;height:auto;object-fit:contain}.imp-pv-text{margin-top:12px}.imp-pv-text summary{font-weight:600}`;
function css(){if(document.getElementById('imp-css'))return;const s=document.createElement('style');s.id='imp-css';s.textContent=CSS;document.head.appendChild(s)}
const LAB={wait:'En attente',run:'Analyse…',ok:'Prêt',warn:'À vérifier',err:'Erreur',done:'Transféré'};
const field=(lab,path,val,o)=>`<label class="imp-f ${o&&o.w?'w':''}">${lab}<input data-f="${path}" value="${H(val)}" ${o&&o.t?'type="'+o.t+'"':''} ${o&&o.m?'inputmode="'+o.m+'"':''} autocomplete="off"></label>`;
function itemRow(it){return`<div class="imp-it ${it.id===ST.sel?'sel':''}" data-id="${it.id}" data-a="sel"><div class="imp-ic">${IC.file}</div>
  <div class="imp-nm"><b>${H(it.name)}</b><small>${fsz(it.size||0)}</small>${it.status==='run'?`<div class="imp-bar"><i id="bar-${it.id}" style="width:${Math.round((it.prog||0)*100)}%"></i></div>`:''}${it.err?`<span class="imp-er">${H(it.err)}</span>`:''}</div>
  <span class="imp-st ${it.status}">${LAB[it.status]||''}</span>
  <div class="imp-ac"><button data-a="pv" aria-label="Aperçu">${IC.eye}</button><button data-a="re" aria-label="Réanalyser">${IC.re}</button><button data-a="rm" aria-label="Supprimer">${IC.tr}</button></div></div>`}
function lineCard(l,i){return`<div class="imp-ln ${l.ok&&!lineIncomplete(l)?'':'w'}" data-i="${i}"><input data-l="des" value="${H(l.des)}" aria-label="Désignation">
  <div class="imp-g"><label class="imp-f">Qté<input data-l="q" inputmode="decimal" value="${H(l.q)}"></label><label class="imp-f">Unité<input data-l="u" value="${H(l.u)}"></label><label class="imp-f">P.U. HT<input data-l="pu" inputmode="decimal" value="${H(l.pu)}"></label></div>
  <div class="imp-row"><span class="imp-tt">Total ligne</span><b data-lt>${eur(nv(l.q)*nv(l.pu))}</b></div>
  <div class="imp-la"><button data-a="kind">${l.kind==='F'?'→ Prestations':'→ Fournitures'}</button>${l.ok?'':`<button data-a="confirm-line">Confirmer la ligne</button>`}<button data-a="dl">Supprimer</button></div></div>`}
function plan(it){const d=it.data,sc=it.sc,p=[];if(sc.all)p.push((d.type==='x'?'Rapport':d.type==='f'?'Facture':'Devis')+' complet'+(d.num?' '+d.num:'')+' dans ta mise en page');else{if(sc.cli)p.push('client');if(sc.pre)p.push('prestations → Mes tarifs');if(sc.fou)p.push('fournitures → Mes tarifs')}
  return p.length?'Sera enregistré : '+p.join(' · '):'Choisis au moins une catégorie.'}
function reviewWarnings(it){const d=it.data,base=(d.warns||[]).filter(w=>!/^Écart entre le (?:total lu|TTC lu)/.test(w)&&!/^Certaines lignes sont à vérifier/.test(w)&&!/^Aucune ligne de prestation ou fourniture reconnue/.test(w));return base.concat(transferProblems(it))}
function review(it){const d=it.data,c=calc(d),sc=it.sc,K=probe();
  if(it.status==='done'&&it.res)return`<div class="c imp"><h3>Transfert terminé</h3>${it.res.msg.map(m=>`<div class="imp-w ok">${H(m)}</div>`).join('')}
    ${it.res.id?`<button class="b cu" data-a="open"><span>Ouvrir dans l'app</span></button>`:''}<button class="b gh" data-a="un"><span>Annuler ce transfert</span></button></div>`;
  const cands=clientCands(d.cli),dup=dupDoc(it),issues=transferProblems(it),M=d.lines.map((l,i)=>[l,i]).filter(x=>x[0].kind!=='F'),F=d.lines.map((l,i)=>[l,i]).filter(x=>x[0].kind==='F');
  const grp=(t,a)=>`<div class="imp-sub">${t} (${a.length})</div>${a.map(x=>lineCard(x[0],x[1])).join('')}`;
  return`<div class="c imp"><h3>Données extraites</h3>
  <div data-review-warnings>${reviewWarnings(it).map(w=>`<div class="imp-w">${H(w)}</div>`).join('')}</div>
  <div class="imp-seg">${[['d','Devis'],['f','Facture'],['x','Rapport']].map(t=>`<button data-a="ty" data-t="${t[0]}" class="${d.type===t[0]?'on':''}">${t[1]}</button>`).join('')}</div>
  <div class="imp-g">${field('N° du document','num',d.num)}${field('Date','date',d.date||'',{t:'date'})}</div>
  ${dup?`<div class="imp-w">Ce numéro existe déjà dans l'app.<label class="imp-f">Que faire ?<select data-dup><option value="copy" ${it.dup!=='replace'?'selected':''}>Créer une copie (nouveau numéro)</option><option value="replace" ${it.dup==='replace'?'selected':''}>Remplacer le contenu de l'existant</option></select></label></div>`:''}
  <div class="imp-sub">Client</div><div class="imp-g">${field('Nom','cli.name',d.cli.name,{w:1})}${field('Adresse','cli.addr',d.cli.addr,{w:1})}${field('Code postal','cli.cp',d.cli.cp,{m:'numeric'})}${field('Ville','cli.ville',d.cli.ville)}${field('Téléphone','cli.tel',d.cli.tel,{t:'tel'})}${field('E-mail','cli.email',d.cli.email,{t:'email'})}</div>
  ${d.addrs.length>1?`<div class="imp-f">Adresse à enregistrer</div>${d.addrs.map((a,i)=>`<label class="imp-opt o2 ${(it.addr||0)===i?'on':''}"><input type="radio" name="ad" data-ad="${i}" ${(it.addr||0)===i?'checked':''}><i class="imp-ck">${IC.ok}</i><span>${H(a.t)} : ${H([a.addr,a.cp,a.ville].filter(Boolean).join(' '))}</span></label>`).join('')}`:''}
  ${cands.length||(SS()&&(SS().clients||[]).length)?`<label class="imp-f">Client dans l'app<select data-match><option value="new" ${it.match==='new'?'selected':''}>Créer un nouveau client</option>${cands.map(x=>`<option value="${x.c.id}" ${it.match===x.c.id?'selected':''}>Utiliser : ${H(x.n)}</option>`).join('')}</select></label>`:''}
  ${d.type==='x'?`<div class="imp-sub">Texte du rapport</div><label class="imp-f"><textarea data-f="txt" rows="8">${H(d.txt)}</textarea></label>`:`
  ${grp('Prestations',M)}<button class="b gh" data-a="add" data-k="M"><span>+ Ajouter une prestation</span></button>
  ${grp('Fournitures',F)}<button class="b gh" data-a="add" data-k="F"><span>+ Ajouter une fourniture</span></button>
  <div class="imp-sub">Totaux</div><div class="imp-g">${field('Remise %','tot.rmPct',d.tot.rmPct||'',{m:'decimal'})}${field('TVA %','tot.rate',d.tot.rate!=null?d.tot.rate:'',{m:'decimal'})}</div>
  <div class="imp-row"><span>Total HT</span><b data-t="ht">${eur(c.ht)}</b></div><div class="imp-row"><span>TVA</span><b data-t="tva">${eur(c.tva)}</b></div><div class="imp-row big"><span>Total TTC</span><b data-t="ttc">${eur(c.ttc)}</b></div>
  ${d.tot.ttc!=null?`<div class="imp-w ${Math.abs(d.tot.ttc-c.ttc)<.06?'ok':''}">Total TTC lu dans le document : ${eur(d.tot.ttc)}</div>`:''}`}
  <details><summary class="mu">Texte lu (${(it.raw||'').length} caractères)</summary><pre>${H(it.raw||'')}</pre></details></div>
  <div class="c imp" id="imp-val"><h3>Valider le transfert</h3><p class="imp-p">Choisis exactement ce qui doit être enregistré dans l'application :</p>
  ${[['cli','Client uniquement'],['pre','Prestations'],['fou','Fournitures'],['all','Tout le document']].map(o=>`<label class="imp-opt ${sc[o[0]]?'on':''}"><input type="checkbox" data-s="${o[0]}" ${sc[o[0]]?'checked':''}><i class="imp-ck">${IC.ok}</i><span>${o[1]}</span></label>`).join('')}
  <label class="imp-opt o2 ${it.opt.keep?'on':''}"><input type="checkbox" data-o="keep" ${it.opt.keep?'checked':''}><i class="imp-ck">${IC.ok}</i><span>Conserver les prix dans « Mes tarifs »</span></label>
  <label class="imp-opt o2 ${it.opt.num?'on':''}"><input type="checkbox" data-o="num" ${it.opt.num?'checked':''}><i class="imp-ck">${IC.ok}</i><span>Détecter et enregistrer le numéro du devis / facture</span></label>
  <p class="imp-p" id="imp-plan">${H(plan(it))}</p><div class="imp-w ${issues.length?'':'ok'}" data-transfer-state ${sc.all&&issues.length?'':'hidden'}>${issues.length?'Transfert complet bloqué : corrige les points signalés ci-dessus.':'Lignes et totaux vérifiés.'}</div><button class="b cu" data-a="tr" ${sc.all&&issues.length?'disabled':''}><span>Valider le transfert</span></button>
  <details style="margin-top:12px"><summary class="mu">Détails techniques</summary><pre>${H(JSON.stringify({numero:K.dNum,date:K.dDate,client:K.dCli,ligne:[K.lDes,K.lUnit],clients:K.c,tarifs:K.cat},null,1))}</pre></details></div>`}
function view(){restore();const it=cur();
  return`<div class="c imp"><h3>Importer des documents</h3><p class="imp-p">Dépose un devis, une facture ou un rapport (PDF, photo, Word). Les données sont lues et rangées par catégorie, puis transférées dans ta mise en page.</p>
  <label class="imp-drop" id="imp-drop" for="imp-file">${IC.up}<b>Sélectionner des fichiers</b><small>PDF, Images, Word</small></label>
  <input id="imp-file" type="file" multiple accept=".pdf,.docx,.doc,.txt,.csv,image/*" style="display:none">
  <label class="b gh" for="imp-cam"><span style="display:flex;gap:8px;align-items:center">${IC.cam} Prendre une photo</span></label><input id="imp-cam" type="file" accept="image/*" capture="environment" style="display:none">
  <button class="b gh" data-a="supplier"><span>Importer un ticket ou une facture fournisseur</span></button>
  <button class="b cu" data-a="go"><span>Transférer vers la nouvelle mise en page</span></button></div>
  ${ST.items.length?`<div class="c imp"><h3>Fichiers importés</h3>${ST.items.map(itemRow).join('')}</div>`:''}
  ${it&&it.data?review(it):''}${UNDO&&!(it&&it.status==='done')?`<div class="c imp"><button class="b gh" data-a="un"><span>Annuler le dernier transfert</span></button></div>`:''}`}
function paint(){const r=document.getElementById('imp-root');if(r)r.innerHTML=view()}
function bar(it){const e=document.getElementById('bar-'+it.id);if(e)e.style.width=Math.round((it.prog||0)*100)+'%'}
function updateReviewStatus(it){const r=document.getElementById('imp-root');if(!r||!it.data)return;const problems=transferProblems(it),warnings=reviewWarnings(it),list=r.querySelector('[data-review-warnings]'),state=r.querySelector('[data-transfer-state]'),btn=r.querySelector('[data-a="tr"]');
  if(list)list.innerHTML=warnings.map(w=>`<div class="imp-w">${H(w)}</div>`).join('');if(state){state.hidden=!(it.sc&&it.sc.all);state.classList.toggle('ok',!problems.length);state.textContent=problems.length?'Transfert complet bloqué : corrige les points signalés ci-dessus.':'Lignes et totaux vérifiés.'}
  if(btn)btn.disabled=!!(it.sc&&it.sc.all&&problems.length);
  r.querySelectorAll('.imp-ln[data-i]').forEach(box=>{const l=it.data.lines[+box.dataset.i];if(l)box.classList.toggle('w',!l.ok||lineIncomplete(l))})}
function updTot(it){const r=document.getElementById('imp-root');if(!r||!it.data||it.data.type==='x')return;const c=calc(it.data);
  [['ht',c.ht],['tva',c.tva],['ttc',c.ttc]].forEach(a=>{const e=r.querySelector('[data-t="'+a[0]+'"]');if(e)e.textContent=eur(a[1])});updateReviewStatus(it)}
function setPath(o,p,v){const k=p.split('.');let t=o;while(k.length>1)t=t[k.shift()];t[k[0]]=v}
async function renderPdfPreview(it,host,modal){const status=document.createElement('div'),pages=document.createElement('div');status.className='imp-pv-status';status.textContent='Chargement du PDF…';pages.className='imp-pv-pages';host.append(status,pages);modal._pdfRenders=new Set();
  try{await loadLib(CDN.pdf,()=>G.pdfjsLib);if(!modal.isConnected)return;const task=G.pdfjsLib.getDocument({url:it.url});modal._pdfTask=task;const pdf=await task.promise;if(!modal.isConnected)return;
    status.textContent=`${pdf.numPages} page${pdf.numPages>1?'s':''} · fais défiler pour les parcourir`;
    const draw=async(holder)=>{if(!modal.isConnected||holder._drawing||holder.querySelector('canvas'))return;holder._drawing=true;
      try{const page=await pdf.getPage(+holder.dataset.page),base=page.getViewport({scale:1}),fit=Math.min(1.5,(holder.clientWidth||host.clientWidth-24)/base.width),dpr=Math.min(2,window.devicePixelRatio||1),vp=page.getViewport({scale:fit*dpr}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
        canvas.className='imp-pv-page';canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);canvas.setAttribute('aria-label',`Page ${holder.dataset.page} sur ${pdf.numPages}`);holder.appendChild(canvas);
        const render=page.render({canvasContext:ctx,viewport:vp});modal._pdfRenders.add(render);try{await render.promise}finally{modal._pdfRenders.delete(render)}
      }catch(e){if(e&&e.name!=='RenderingCancelledException'&&modal.isConnected)status.textContent='Une page du PDF n’a pas pu être affichée : '+(e.message||'erreur de lecture')}finally{holder._drawing=false}};
    for(let i=1;i<=pdf.numPages;i++){if(!modal.isConnected)return;const page=await pdf.getPage(i),base=page.getViewport({scale:1}),holder=document.createElement('div');holder.className='imp-pv-page-wrap';holder.dataset.page=String(i);holder.style.aspectRatio=`${base.width} / ${base.height}`;pages.appendChild(holder)}
    if('IntersectionObserver' in G){modal._pdfObserver=new IntersectionObserver(entries=>entries.forEach(e=>{const holder=e.target;if(e.isIntersecting)draw(holder);else if(holder.querySelector('canvas')&&!holder._drawing){const canvas=holder.querySelector('canvas');canvas.width=0;canvas.height=0;canvas.remove()}}),{root:host,rootMargin:'800px 0px'});pages.querySelectorAll('.imp-pv-page-wrap').forEach(holder=>modal._pdfObserver.observe(holder))}
    else for(const holder of pages.children)await draw(holder);
  }catch(e){if(modal.isConnected)status.textContent='Aperçu PDF indisponible : '+((e&&e.message)||'erreur de lecture')}}
function preview(it){const m=document.createElement('div');m.className='imp-pv imp';
  m.innerHTML=`<div><b>${H(it.name)}</b><button class="b gh sm" style="width:auto;margin:0" data-x><span>Fermer</span></button></div><div class="imp-pv-content" data-preview-content></div>`;
  const host=m.querySelector('[data-preview-content]');document.body.classList.add('imp-preview-open');if(it.kind==='img'&&it.url){const img=document.createElement('img');img.src=it.url;img.alt='Aperçu de '+it.name;host.appendChild(img)}
  else if(it.kind==='pdf'&&it.url)renderPdfPreview(it,host,m);
  const details=document.createElement('details');details.className='imp-pv-text';details.innerHTML=`<summary>Texte extrait du fichier</summary><pre>${H(it.raw||'(texte indisponible)')}</pre>`;host.appendChild(details);
  m.addEventListener('click',e=>{if(e.target.closest('[data-x]')){try{m._pdfObserver&&m._pdfObserver.disconnect();m._pdfRenders&&m._pdfRenders.forEach(r=>r.cancel());m._pdfTask&&m._pdfTask.destroy()}catch(_){}m.remove();document.body.classList.remove('imp-preview-open')}});document.body.appendChild(m)}
function onClick(e){const a=e.target.closest('[data-a]');if(!a)return;const act=a.dataset.a,row=e.target.closest('[data-id]'),it=row?ST.items.find(i=>i.id===row.dataset.id):cur();
  if(act==='supplier'){if(typeof G.go==='function')G.go('sf');return}
  if(act==='sel'){if(e.target.closest('.imp-ac'))return;ST.sel=row.dataset.id;paint();return}
  if(act==='pv'&&it)return preview(it);
  if(act==='re'&&it){it.status='wait';runQueue();paint();return}
  if(act==='rm'&&it){ST.items=ST.items.filter(i=>i!==it);if(it.url)URL.revokeObjectURL(it.url);if(ST.sel===it.id)ST.sel=(ST.items.find(i=>i.data)||{}).id||null;persist();paint();return}
  if(act==='go'){const r=ST.items.find(i=>i.data);if(!r){document.getElementById('imp-file').click();return}ST.sel=r.id;paint();const v=document.getElementById('imp-val');if(v)v.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(!it||!it.data)return;const d=it.data;
  if(act==='ty'){d.type=a.dataset.t;if(d.type==='x'&&!d.txt)d.txt=(it.raw||'').slice(0,6000)}
  else if(act==='kind'){const l=d.lines[+a.closest('[data-i]').dataset.i];l.kind=l.kind==='F'?'M':'F'}
  else if(act==='confirm-line'){const l=d.lines[+a.closest('[data-i]').dataset.i];if(l)l.ok=true}
  else if(act==='dl'){d.lines.splice(+a.closest('[data-i]').dataset.i,1)}
  else if(act==='add'){d.lines.push({id:uid(),des:'',q:1,u:'',pu:0,ok:true,kind:a.dataset.k})}
  else if(act==='tr'){const s=it.sc;if(!(s.all||s.cli||s.pre||s.fou))return say('Choisis au moins une catégorie');return commit(it)}
  else if(act==='un')return undo();
  else if(act==='open'){const id=it.res&&it.res.id;if(id&&typeof G.go==='function')G.go(it.res.rep?'xe':'e',id);return}
  persist();paint()}
function onInput(e){const t=e.target,it=cur();if(!it||!it.data)return;
  if(t.dataset.f){let v=t.value;if(t.dataset.f==='tot.rmPct'||t.dataset.f==='tot.rate')v=v===''?(t.dataset.f==='tot.rate'?null:0):nv(v);setPath(it.data,t.dataset.f,v);updTot(it);persist()}
  else if(t.dataset.l){const box=t.closest('[data-i]'),l=it.data.lines[+box.dataset.i];l[t.dataset.l]=(t.dataset.l==='q'||t.dataset.l==='pu')?nv(t.value):t.value;
    const lt=box.querySelector('[data-lt]');if(lt)lt.textContent=eur(nv(l.q)*nv(l.pu));updTot(it);persist()}}
function onChange(e){const t=e.target,it=cur();
  if(t.id==='imp-file'||t.id==='imp-cam'){if(t.files&&t.files.length)addFiles(t.files);t.value='';return}
  if(!it||!it.data)return;
  if(t.dataset.s){const k=t.dataset.s,s=it.sc;if(k==='all'){s.all=t.checked?1:0;if(s.all)s.cli=s.pre=s.fou=0}else{s[k]=t.checked?1:0;if(s[k])s.all=0}}
  else if(t.dataset.o)it.opt[t.dataset.o]=t.checked?1:0;
  else if(t.dataset.ad!==undefined)it.addr=+t.dataset.ad;
  else if(t.dataset.match!==undefined)it.match=t.value;
  else if(t.dataset.dup!==undefined)it.dup=t.value;
  else return;persist();paint()}
function importPage(){css();return'<div id="imp-root">'+view()+'</div>'}
function initImportPage(){const r=document.getElementById('imp-root');if(!r)return;
  r.addEventListener('click',onClick);r.addEventListener('input',onInput);r.addEventListener('change',onChange);
  r.addEventListener('dragover',e=>{const d=e.target.closest('#imp-drop');if(d){e.preventDefault();d.classList.add('over')}});
  r.addEventListener('dragleave',e=>{const d=e.target.closest('#imp-drop');if(d)d.classList.remove('over')});
  r.addEventListener('drop',e=>{const d=e.target.closest('#imp-drop');if(d){e.preventDefault();d.classList.remove('over');if(e.dataTransfer&&e.dataTransfer.files.length)addFiles(e.dataTransfer.files)}});
  if(ST.items.some(i=>i.status==='wait'))runQueue()}
function impHash(){try{if(/^#(import|importation)/i.test(location.hash)&&typeof G.go==='function')G.go('i')}catch(e){}}

const API={parse,parseItems,lineItem,pn,classify,calc,probe,toRows,extractText,transferProblems};
G.importPage=importPage;G.getImportHTML=importPage;G.initImportPage=initImportPage;if(typeof G.impHash!=='function')G.impHash=impHash;G.IMP=API;
if(typeof module!=='undefined'&&module.exports)module.exports=API;
})();

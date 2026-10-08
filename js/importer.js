function getImportHTML() {
  return `
    <div class="import-container">
      <div class="c">
        <h3>Importer des documents</h3>
        <p style="color: var(--mu); font-size: 14px; margin-bottom: 12px;">
          Glissez-déposez vos fichiers PDF, images ou documents ici, ou cliquez pour sélectionner.
        </p>
        
        <div class="file-upload-area" id="uploadArea">
          <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple>
          <div class="file-upload-icon">📄</div>
          <div class="file-upload-label">Sélectionner des fichiers</div>
          <div style="font-size: 12px; color: var(--mu);">PDF, Images, Word</div>
        </div>
        
          <button class="validation-button" id="transferNowButton" type="button" disabled style="margin-top:16px;opacity:.45;cursor:not-allowed;">
            <div class="validation-icon">✓</div><span>Transférer et afficher dans ma mise en page</span>
          </button>
        <div class="progress-bar" id="uploadProgress" style="display: none;">
          <div class="progress-fill" id="progressFill" style="width: 0%"></div>
        </div>
      </div>

      <div class="c" id="fileListContainer" style="display: none;">
        <h3>Fichiers importés</h3>
        <div class="file-list" id="fileList"></div>
      </div>

      <div class="c" id="extractedDataContainer" style="display: none;">
        <h3>Données extraites</h3>
        <div class="extracted-data" id="extractedData"></div>
      </div>

      <div class="c" id="clientSection" style="display: none;">
        <h3>Informations client</h3>
        <div id="clientInfo"></div>
      </div>

      <div class="c" id="itemsSection" style="display: none;">
        <h3>Prestations et fournitures</h3>
        
        <div class="search-container">
          <div class="search-icon">🔍</div>
          <input type="text" id="itemSearch" class="search-input" placeholder="Rechercher dans vos tarifs...">
          <div class="results-dropdown" id="searchResults"></div>
        </div>
        
        <div class="items-grid" id="itemsGrid"></div>
      </div>

      <div class="c" id="transferSection" style="display: none;">
        <h3>Valider le transfert</h3>
        <p style="color: var(--mu); font-size: 14px; margin-bottom: 12px;">Choisissez exactement ce qui doit être enregistré dans l’application :</p>
        <div class="transfer-scope" id="transferOptions">
          <label class="scope-option selected"><input type="radio" name="transferScope" value="client" checked><span class="scope-check">✓</span><span>Client uniquement</span></label>
          <label class="scope-option"><input type="radio" name="transferScope" value="services"><span class="scope-check">✓</span><span>Prestations</span></label>
          <label class="scope-option"><input type="radio" name="transferScope" value="supplies"><span class="scope-check">✓</span><span>Fournitures</span></label>
          <label class="scope-option"><input type="radio" name="transferScope" value="all"><span class="scope-check">✓</span><span>Tout le document</span></label>
        </div>
        <label class="transfer-option" style="margin-top:10px;"><input type="checkbox" id="transferWithPrices" checked><span>Conserver les prix dans « Mes tarifs »</span></label>
        <label class="transfer-option" style="margin-top:8px;"><input type="checkbox" id="transferDocNumbers" checked><span>Détecter et enregistrer le numéro du devis / facture</span></label>
        <div id="importWarnings" class="import-warning" style="display:none;"></div>
        <button class="validation-button" id="validateTransfer" type="button" onclick="validateTransfer()"><div class="validation-icon">✓</div><span>Valider le transfert</span></button>
      </div>

      <div class="c" id="previewContainer" style="display: none;">
        <h3>Aperçu du document</h3>
        <div class="preview-container" id="previewContent"></div>
      </div>
    </div>
  `;
}

function initImportPage() {
  // Initialize drag and drop
  const uploadArea = $('#uploadArea');
  const fileInput = $('#fileInput');
  
  // Drag and drop events
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });
  
  // Click to select files
  uploadArea.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  fileInput.addEventListener('click', e => e.stopPropagation());
  
  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const btn=$('#transferNowButton');
      if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.cursor='pointer';}
      handleFiles(e.target.files);
    }
  });
  const transferNowButton=$('#transferNowButton');
  if(transferNowButton) transferNowButton.addEventListener('click',()=>{
    const ids=Object.keys(extractedData);
    if(!ids.length){toast('Sélectionnez d’abord un document');return;}
    const all=document.querySelector('input[name="transferScope"][value="all"]');
    if(all){all.checked=true;all.dispatchEvent(new Event('change',{bubbles:true}))}
    validateTransfer();
  });
  
  // Initialize item search
  initItemSearch();
}

async function handleFiles(files){
 currentFiles=Array.from(files);const pb=$('#uploadProgress'),pf=$('#progressFill');pb.style.display='block';pf.style.width='0%';let done=0;
 for(const file of currentFiles){try{await extractDataFromFile(file)}catch(e){const id=nw();extractedData[id]={id,name:file.name,size:file.size,type:getFileType(file.name),content:'',status:'error',extracted:{client:null,documentNumber:null,date:null,items:[],total:0,addresses:[],selectedBillingAddress:0,warnings:[e.message||'Extraction impossible']}}}done++;pf.style.width=(done/currentFiles.length*100)+'%'}pb.style.display='none';showFileList();const ids=Object.keys(extractedData);if(ids.length){const last=extractedData[ids[ids.length-1]];if(last&&last.status!=='error'){processFile(last.id);setTimeout(()=>$('#transferSection')?.scrollIntoView({behavior:'smooth',block:'center'}),250)}}
}
async function extractDataFromFile(file){
 if(file.size>50*1024*1024)throw new Error('Fichier supérieur à 50 Mo');const type=file.type||getFileType(file.name);let text='',preview='';
 if(type==='pdf'||/\.pdf$/i.test(file.name)){const b=await file.arrayBuffer();text=await extractPdfText(b);preview=URL.createObjectURL(new Blob([b],{type:'application/pdf'}))}
 else if(/\.docx$/i.test(file.name)){const b=await file.arrayBuffer();if(window.mammoth){const x=await window.mammoth.extractRawText({arrayBuffer:b});text=x.value||''}preview=await readDataURL(file)}
 else if(/\.(txt|csv)$/i.test(file.name)){text=await readText(file);preview=text}else if(type.startsWith('image/')){preview=await readDataURL(file);if(await loadTesseract()){try{const o=await Tesseract.recognize(file,'fra+eng');text=o?.data?.text||''}catch(e){text=''}}}else{text=await readText(file);preview=text}
 const extracted=parseDocumentText(file.name,text),id=nw();extractedData[id]={id,name:file.name,size:file.size,type,content:preview||text,status:'completed',extracted};
}
function loadTesseract(){if(window.Tesseract)return Promise.resolve(true);return new Promise(ok=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=()=>ok(!!window.Tesseract);s.onerror=()=>{toast('OCR indisponible hors connexion');ok(false)};document.head.appendChild(s)})}
function readText(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lecture impossible'));r.readAsText(file)})}
function readDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lecture impossible'));r.readAsDataURL(file)})}
async function extractPdfText(buffer){
  try{
    let pdfjs=window.pdfjsLib;
    if(!pdfjs){try{pdfjs=(await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'))}catch(e){return ''}}
    if(pdfjs.GlobalWorkerOptions&&!pdfjs.GlobalWorkerOptions.workerSrc)pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:buffer}).promise, pages=[];
    for(let pn=1;pn<=pdf.numPages;pn++){
      const page=await pdf.getPage(pn),tc=await page.getTextContent(),items=(tc.items||[]).filter(x=>String(x.str||'').trim());
      const rows=[];
      for(const it of items){
        const x=Number(it.transform?.[4]||0),y=Number(it.transform?.[5]||0);
        let row=rows.find(r=>Math.abs(r.y-y)<3);
        if(!row){row={y,items:[]};rows.push(row)}
        row.items.push({x,text:String(it.str||'').trim()});
      }
      rows.sort((a,b)=>b.y-a.y);
      pages.push(rows.map(row=>{
        row.items.sort((a,b)=>a.x-b.x);
        const vals=row.items.slice(), moneyIdx=[];
        for(let i=0;i<vals.length;i++){
          if(/^\d[\d ]*[.,]\d{2}$/.test(vals[i].text) && vals[i+1] && vals[i+1].text==='€') moneyIdx.push(i);
        }
        if(moneyIdx.length){
          const used=new Set();
          for(let mi=moneyIdx.length-1;mi>=0;mi--){
            const i=moneyIdx[mi],amount=vals[i].text,prev=vals[i-1];
            vals[i]={x:vals[i].x,text:'[[EUR:'+amount+']]'};used.add(i+1);
            if(prev && mi===0 && /^\d+(?:[.,]\d+)?$/.test(prev.text)){
              vals[i-1]={x:prev.x,text:'[[QTY:'+prev.text+']]'};used.add(i-1);
            }
          }
          for(let i=vals.length-1;i>=0;i--) if(used.has(i) && vals[i].text==='€') vals.splice(i,1);
        }
        const minX=vals[0]?.x||0,maxX=vals.reduce((m,v)=>Math.max(m,v.x),0),split=minX+(maxX-minX)*.52;
        const left=vals.filter(v=>v.x<=split).map(v=>v.text).join(' ').trim();
        const right=vals.filter(v=>v.x>split).map(v=>v.text).join(' ').trim();
        return right?left+' ||| '+right:left;
      }).filter(Boolean).join('\n'));
    }
    return pages.join('\n');
  }catch(e){return ''}
}
function parseDocumentText(filename,text){
  const raw=String(text||'').replace(/\u0000/g,' ').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n').trim();
  const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ').trim();
  const money=x=>{const n=parseFloat(String(x||'').replace(/\s/g,'').replace('€','').replace(',','.'));return Number.isFinite(n)?n:0};
  const eur=line=>{const a=[];for(const m of String(line).matchAll(/(\d[\d ]*[.,]\d{2})\s*€/g))a.push({value:money(m[1]),index:m.index});return a};
  const own={name:/ms\s+plomberie|mikael\s+salillari/i,mail:/mikael\.salillari@hotmail\.fr/i,phone:/07\s*49\s*24\s*85\s*59/i,address:/285\s+rue\s+jeanne\s+d.?arc/i};
  const isOwn=x=>Object.values(own).some(r=>r.test(String(x||'')));
  const clean=x=>String(x||'').replace(/^(?:client|nom du client|destinataire|adresse|adresse client|adresse de facturation|t[eé]l[eé]phone|t[eé]l|email|e-mail|mail|objet|chantier|r[ée]f[ée]rence)\s*[:：-]?\s*/i,'').replace(/\s+/g,' ').trim();
  const dateM=raw.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b|\b(\d{4})[\/-](\d{2})[\/-](\d{2})\b/);
  const date=dateM?(dateM[4]?dateM[4]+'-'+dateM[5]+'-'+dateM[6]:dateM[3]+'-'+dateM[2]+'-'+dateM[1]):null;
  const n1=[...raw.matchAll(/\b(?:DEVIS|DEV|FACTURE|FAC)\s*[-_: ]\s*([A-Z0-9][A-Z0-9_-]{2,})/ig)].map(m=>m[0]);
  const n2=String(filename||'').match(/\b(?:DEVIS|DEV|FACTURE|FAC)[\s_-]*(?=[A-Z0-9_-]*\d)[A-Z0-9]+(?:[\s_-]+[A-Z0-9]+)*/i)?.[0]||'';
  const rawNum=n1.find(x=>/\d/.test(x))||n2;
  const documentNumber=rawNum?rawNum.replace(/[:_ ]+/g,'-').replace(/-+/g,'-').toUpperCase():null;
  const documentType=/(facture|invoice|\bfac[\s_-]?\d)/i.test(filename+' '+raw)?'facture':'devis';
  let clientName='',clientEmail='',clientPhone='',clientAddress='',clientPostal='',clientCity='',issuerName='',issuerEmail='',issuerPhone='',issuerAddress='';
  let issuerPostal='',issuerCity='',chantier='',object='',period='',reference='',clientExplicit=false;
  const confidence={clientName:0,clientAddress:0,clientPhone:0,clientEmail:0,items:0};
  const warnings=[];
  const setName=(v,c)=>{v=clean(v);if(v&&!isOwn(v)&&!/^(devis|facture|objet|chantier|r[ée]f[ée]rence|siret|tva)$/i.test(v)&&!clientName){clientName=v;confidence.clientName=c;clientExplicit=c>=.9}};
  const setAddress=(v,p='',city='',c=.8)=>{v=String(v||'').trim();if(!v||isOwn(v))return;clientAddress=v;clientPostal=String(p||'').trim();clientCity=String(city||'').trim();confidence.clientAddress=Math.max(confidence.clientAddress,c)};
  for(let i=0;i<lines.length;i++){
    const line=lines[i],next=lines[i+1]||'',pair=line.split('|||').map(x=>x.trim());
    let m=line.match(/^(?:client|nom du client|destinataire)\s*[:：-]\s*(.+)$/i);
    if(m){setName(m[1],.99);continue}
    if(/^(?:client|nom du client|destinataire)\s*[:：-]?\s*$/i.test(line)){setName(next,.99);continue}
    m=line.match(/^(?:adresse client|adresse de facturation)\s*[:：-]\s*(.+)$/i);
    if(m){const a=m[1].match(/^(.+?)\s*,?\s*(\d{5})\s+(.+)$/);a?setAddress(a[1],a[2],a[3],.98):setAddress(m[1],'','',.92);continue}
    m=line.match(/^adresse\s*[:：-]\s*(.+)$/i);
    if(m&&!isOwn(m[1])){const a=m[1].match(/^(.+?)\s*,?\s*(\d{5})\s+(.+)$/);a?setAddress(a[1],a[2],a[3],.9):setAddress(m[1],'','',.82)}
    m=line.match(/^(?:code postal|cp)\s*[:：-]\s*(\d{5})$/i);if(m&&!clientPostal)clientPostal=m[1];
    m=line.match(/^(?:ville|city)\s*[:：-]\s*(.+)$/i);if(m&&!clientCity)clientCity=clean(m[1]);
    m=line.match(/^(?:t[eé]l[eé]phone|t[eé]l|portable|mobile)\s*[:：-]\s*((?:\+33\s?[1-9]|0[1-9])(?:[ .-]?\d{2}){4})/i);if(m&&!own.phone.test(m[1])&&!clientPhone){clientPhone=m[1];confidence.clientPhone=.98}
    m=line.match(/^(?:email|e-mail|mail|courriel)\s*[:：-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);if(m&&!own.mail.test(m[1])&&!clientEmail){clientEmail=m[1];confidence.clientEmail=.98}
    m=line.match(/^(?:objet)\s*[:：-]\s*(.+)$/i);if(m)object=clean(m[1]);
    m=line.match(/^(?:p[ée]riode pr[ée]vue|validit[ée]|date de prestation)\s*[:：-]\s*(.+)$/i);if(m)period=clean(m[1]);
    m=line.match(/^(?:r[ée]f[ée]rence|r[ée]f\.?)\s*[:：-]\s*(.+)$/i);if(m)reference=clean(m[1]);
    m=line.match(/^(?:chantier|site des travaux|lieu des travaux)\s*[:：-]\s*(.+)$/i);if(m)chantier=clean(m[1]);
    if(pair.length>1){
      const l=pair[0],r=pair[1];
      if(/^(?:client|nom du client|destinataire)\b/i.test(l))setName(r,.99);
      else if(/^(?:devis|facture)\b/i.test(l)&&!clientName&&!/^(?:n[°o]?|num[ée]ro|date)\b/i.test(r)&&!/^\d+[\/-]\d+[\/-]\d{4}$/.test(r)){setName(r,.9)}
      else if(/^(?:adresse client|adresse de facturation)\b/i.test(l)){const a=r.match(/^(.+?)\s*,?\s*(\d{5})\s+(.+)$/);a?setAddress(a[1],a[2],a[3],.98):setAddress(r,'','',.92)}
      else if(/^(?:objet)\b/i.test(l)&&!object)object=r;
      else if(/^(?:chantier|site des travaux)\b/i.test(l)&&!chantier)chantier=r;
      else if(/^(?:r[ée]f[ée]rence|r[ée]f\.?)\b/i.test(l)&&!reference)reference=r;
    }
  }
  for(const line of lines){
    let m=line.match(/(?:nom du client|client|destinataire)\s*[:：-]\s*(.+?)(?=\s+(?:adresse|t[eé]l[eé]phone|t[eé]l|email|e-mail|mail)\s*[:：-]|$)/i);if(m&&!clientName)setName(m[1],.94);
    m=line.match(/(?:adresse de facturation|adresse client)\s*[:：-]\s*(\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|all[ée]e|place)\s+.+?)(?=\s+(?:code postal|cp|ville|t[eé]l[eé]phone|t[eé]l|email|e-mail|mail)\s*[:：-]|$)/i);if(m&&!isOwn(m[1]))setAddress(m[1],clientPostal,clientCity,.94);
  }
  const addresses=[],pushAddr=(street,postal,city,type='facturation',c=.8)=>{street=String(street||'').trim();if(!street||isOwn(street))return;const key=norm(street)+'|'+postal+'|'+norm(city);if(!addresses.some(a=>norm(a.street)+'|'+a.postalCode+'|'+norm(a.city)===key))addresses.push({type,street,postalCode:String(postal||''),city:String(city||''),confidence:c})};
  if(clientAddress)pushAddr(clientAddress,clientPostal,clientCity,'facturation',confidence.clientAddress||.8);
  for(const line of lines){const m=line.match(/(?:adresse(?: de facturation| client)?\s*[:：-]\s*)?(\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|all[ée]e|place)\s+[A-Za-zÀ-ÿ0-9'’ .-]{2,100}?)[,;]?\s*(\d{5})\s+([A-Za-zÀ-ÿ'’ .-]{2,60})$/i);if(m&&!isOwn(m[0]))pushAddr(m[1],m[2],m[3],/chantier|travaux|site/i.test(line)?'chantier':'facturation',.82)}
  const ownLines=lines.filter(x=>isOwn(x));
  if(ownLines.length){issuerName='Ms Plomberie & Chauffage';const em=raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[];issuerEmail=em.find(x=>own.mail.test(x))||'';const ph=raw.match(/(?:\+33\s?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/g)||[];issuerPhone=ph.find(x=>own.phone.test(x))||'';const am=raw.match(/(?:\d{1,5}\s+)?(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|all[ée]e|place)\s+[A-Za-zÀ-ÿ0-9'’ .-]+/i);if(am&&own.address.test(am[0]))issuerAddress=am[0].trim()}
  let section='',items=[];
  for(const line of lines){
    const f=norm(line);
    if(/^1\.\s*main-d.*oeuvre/i.test(f)){section='service';continue}
    if(/^2\.\s*fournitures/i.test(f)){section='supply';continue}
    if(/^3\.\s*synthese/i.test(f)||/^4\.\s*conditions/i.test(f)){section='';continue}
    if(!section)continue;
    const e=eur(line);if(!e.length||/^(sous-total|co[uû]t d'achat|famille|ref\.?|designation|description|page)/i.test(f))continue;
    const before=line.slice(0,e[0].index).trim();
    const qM=before.match(/\[\[QTY:(\d+(?:[.,]\d+)?)\]\]/)||before.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:unit[ée]s?|pcs?|pi[èe]ces?)?\s*$/i);
    const q=qM?money(qM[1]):1,desc=(qM?before.slice(0,qM.index):before).replace(/^(?:\d{1,3}(?:[.,]\d+)?|—|-)\s*/,'').trim();
    if(!desc||desc.length<3)continue;
    if(section==='service'&&e.length>=2)items.push({type:'service',name:desc,quantity:q,unitPrice:e[0].value,total:e[e.length-1].value,confidence:.9});
    if(section==='supply'){const purchaseTotal=e[e.length-1].value;items.push({type:'supply',name:desc,quantity:q,purchaseTotal,unitPrice:q?purchaseTotal/q:0,saleUnitPrice:q?purchaseTotal/q*1.30:0,confidence:.88})}
  }
  const search=norm(raw),amount=re=>{const m=search.match(re);return m?money(m[1]):0};
  const totalHT=amount(/total\s+ht[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i)||amount(/total\s+net(?:\s+du\s+devis)?[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
  const totalTTC=amount(/total\s+ttc[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
  const tvaAmount=amount(/tva(?:\s+\d+(?:[.,]\d+)?\s*%)?[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
  const lineTotal=items.reduce((s,x)=>s+(x.type==='service'?x.total:x.purchaseTotal||0),0);
  const total=totalHT||totalTTC||lineTotal;
  if(!clientName)warnings.push('Client non identifié avec certitude. Le nom du fichier n’est jamais utilisé comme nom client.');
  if(clientName&&confidence.clientName<.9)warnings.push('Nom du client inféré : vérification recommandée.');
  if(clientAddress&&!clientPostal&&!clientCity)warnings.push('Adresse client détectée mais code postal/ville non confirmés.');
  if(!items.length&&/(devis|facture)/i.test(documentType))warnings.push('Aucune ligne tarifaire structurée détectée.');
  if(totalHT&&items.length&&Math.abs(lineTotal-totalHT)>.02)warnings.push('Le total des lignes ne correspond pas au total HT détecté.');
  if(totalHT&&totalTTC&&tvaAmount&&Math.abs(totalHT+tvaAmount-totalTTC)>.02)warnings.push('HT + TVA ne correspond pas au TTC détecté.');
  return {
    client:clientName?{name:clientName,email:clientEmail,phone:clientPhone,address:clientAddress,postalCode:clientPostal,city:clientCity}:null,
    issuer:issuerName?{name:issuerName,email:issuerEmail,phone:issuerPhone,address:issuerAddress,postalCode:issuerPostal,city:issuerCity}:null,
    documentNumber,date,documentType,items,total,totalHT,totalTTC,tvaAmount,
    laborTotal:items.filter(x=>x.type==='service').reduce((s,x)=>s+x.total,0),
    supplyPurchaseTotal:items.filter(x=>x.type==='supply').reduce((s,x)=>s+(x.purchaseTotal||0),0),
    supplySaleTotal:items.filter(x=>x.type==='supply').reduce((s,x)=>s+(x.saleUnitPrice||0)*x.quantity,0),
    addresses,selectedBillingAddress:0,chantier,object,period,reference,
    confidence:{...confidence,items:items.length?items.reduce((s,x)=>s+(x.confidence||.8),0)/items.length:0},
    warnings,source:{filename:String(filename||''),textLength:raw.length}
  };
}
function getFileType(filename) {
  if (filename.endsWith('.pdf')) return 'pdf';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.doc') || filename.endsWith('.docx')) return 'document';
  return 'unknown';
}

function showFileList() {
  $('#fileListContainer').style.display = 'block';
  updateFileList();
}

function updateFileList() {
  const fileList = $('#fileList');
  fileList.innerHTML = '';
  
  Object.values(extractedData).forEach(fileData => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.innerHTML = `
      <div class="file-icon">${getFileIcon(fileData.type)}</div>
      <div class="file-info">
        <div class="file-name">${esc(fileData.name)}</div>
        <div class="file-size">${formatFileSize(fileData.size)}</div>
      </div>
      <div class="file-status ${fileData.status}">${getStatusText(fileData.status)}</div>
      <div class="file-actions">
        <button onclick="viewFile('${fileData.id}')" title="Voir">👁️</button>
        <button onclick="processFile('${fileData.id}')" title="Traiter">⚙️</button>
        <button onclick="deleteFile('${fileData.id}')" title="Supprimer" class="delete">🗑️</button>
      </div>
    `;
    fileList.appendChild(fileItem);
  });
  
  // If we have files, show the next section
  if (Object.keys(extractedData).length > 0) {
    $('#extractedDataContainer').style.display = 'block';
    showExtractedData();
  }
}

function getFileIcon(type) {
  if (type === 'pdf') return '📄';
  if (type === 'image/jpeg' || type === 'image/png') return '🖼️';
  if (type === 'document') return '📝';
  return '📁';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getStatusText(status) {
  const texts = {
    'processing': 'Traitement...',
    'completed': 'Terminé',
    'error': 'Erreur'
  };
  return texts[status] || status;
}

function viewFile(fileId) {
  const fileData = extractedData[fileId];
  if (!fileData) return;
  
  // Show preview
  $('#previewContainer').style.display = 'block';
  const previewContent = $('#previewContent');
  
  if (fileData.type.startsWith('image/')) {
    previewContent.innerHTML = `<img src="${fileData.content}" style="max-width: 100%; border-radius: 8px;">`;
  } else if (fileData.type === 'pdf') {
    previewContent.innerHTML = `
      <iframe src="${fileData.content}" style="width: 100%; height: 400px; border: none; border-radius: 8px;"></iframe>
      <div style="margin-top: 8px; font-size: 12px; color: var(--mu);">
        <strong>Nom:</strong> ${esc(fileData.name)}<br>
        <strong>Taille:</strong> ${formatFileSize(fileData.size)}<br>
        <strong>Type:</strong> ${fileData.type}
      </div>
    `;
  } else {
    previewContent.innerHTML = `
      <pre style="white-space: pre-wrap; word-wrap: break-word; background: var(--in); padding: 12px; border-radius: 8px; font-size: 12px;">${esc(fileData.content.substring(0, 1000))}</pre>
    `;
  }
}

function processFile(fileId) {
  const fileData = extractedData[fileId];
  if (!fileData) return;
  const transferCta=$('#transferNowButton');
  if(transferCta){transferCta.disabled=false;transferCta.style.opacity='1';transferCta.style.cursor='pointer';}
  
  // Show client section
  $('#clientSection').style.display = 'block';
  showClientInfo(fileData);
  
  // Show items section
  $('#itemsSection').style.display = 'block';
  showItems(fileData);
  
  // Show transfer section
  $('#transferSection').style.display = 'block';
  
  // Scroll to client section
  $('#clientSection').scrollIntoView({ behavior: 'smooth' });
}

function showExtractedData() {
  const extractedDataContainer = $('#extractedData');
  extractedDataContainer.innerHTML = '';
  
  Object.values(extractedData).forEach(fileData => {
    const fileDiv = document.createElement('div');
    fileDiv.style.marginBottom = '16px';
    fileDiv.style.padding = '12px';
    fileDiv.style.background = 'var(--in)';
    fileDiv.style.borderRadius = '10px';
    
    let html = `<div style="font-weight: 600; margin-bottom: 8px;">📄 ${esc(fileData.name)}</div>`;
    
    if (fileData.extracted.documentNumber) {
      html += `<div><strong>N° Document:</strong> ${esc(fileData.extracted.documentNumber)}</div>`;
    }
    
    if (fileData.extracted.date) {
      html += `<div><strong>Date:</strong> ${esc(fileData.extracted.date)}</div>`;
    }
    
    if (fileData.extracted.client) {
      html += `<div><strong>Client:</strong> ${esc(fileData.extracted.client.name)}</div>`;
    }
    
    if (fileData.extracted.total > 0) {
      html += `<div><strong>Total:</strong> ${E(fileData.extracted.total)}</div>`;
    }
    
    fileDiv.innerHTML = html;
    extractedDataContainer.appendChild(fileDiv);
  });
}

function showClientInfo(fileData) {
  const clientInfo = $('#clientInfo');
  const client = fileData.extracted.client;
  
  if (!client) {
    clientInfo.innerHTML = '<p style="color: var(--mu);">Aucun client identifié dans ce document.</p>';
    return;
  }
  
  // Check if client exists in database
  const existingClient = S.clients.find(c => 
    c.n && c.n.toLowerCase().includes(client.name.toLowerCase())
  );
  
  let html = '';
  
  if (!existingClient) {
    // New client
    html = `
      <div class="client-card new-client">
        <div class="client-header">
          <div class="client-name">${esc(client.name)}</div>
          <div class="new-client-badge">Nouveau client</div>
        </div>
        <div class="client-info">
          <div class="client-info-item">
            <div class="client-info-label">Adresse</div>
            <div class="client-info-value">${esc(client.address || 'Non spécifiée')}</div>
          </div>
          <div class="client-info-item">
            <div class="client-info-label">Téléphone</div>
            <div class="client-info-value">${esc(client.phone || 'Non spécifié')}</div>
          </div>
          <div class="client-info-item">
            <div class="client-info-label">Email</div>
            <div class="client-info-value">${esc(client.email || 'Non spécifié')}</div>
          </div>
        </div>
        
        <button class="b cu sm" onclick="confirmNewClient('${fileData.id}')" style="margin-top: 12px;">
          <span>Valider le client</span>
        </button>
      </div>
    `;
  } else {
    // Existing client
    html = `
      <div class="client-card">
        <div class="client-header">
          <div class="client-name">${esc(existingClient.n)}</div>
          <div class="bd ok">Client existant</div>
        </div>
        <div class="client-info">
          <div class="client-info-item">
            <div class="client-info-label">Adresse</div>
            <div class="client-info-value">${esc(existingClient.a || 'Non spécifiée')}</div>
          </div>
          <div class="client-info-item">
            <div class="client-info-label">Ville</div>
            <div class="client-info-value">${esc(existingClient.c || 'Non spécifiée')}</div>
          </div>
          <div class="client-info-item">
            <div class="client-info-label">Téléphone</div>
            <div class="client-info-value">${esc(existingClient.t || 'Non spécifié')}</div>
          </div>
          <div class="client-info-item">
            <div class="client-info-label">Email</div>
            <div class="client-info-value">${esc(existingClient.e || 'Non spécifié')}</div>
          </div>
        </div>
      </div>
    `;
  }
  
  // Add addresses if available
  if (fileData.extracted.addresses && fileData.extracted.addresses.length > 0) {
    html += `
      <div style="margin-top: 16px;">
        <h4 style="margin: 0 0 8px 0; color: var(--ink);">Adresses disponibles</h4>
        <div class="address-list">
          ${fileData.extracted.addresses.map((addr, idx) => `
            <div class="address-item">
              <input type="radio" name="billingAddress_${fileData.id}" id="addr_${fileData.id}_${idx}" 
                     ${idx === 0 ? 'checked' : ''} onchange="selectBillingAddress('${fileData.id}', ${idx})">
              <div class="address-content">
                <div class="address-line">${esc(addr.street)}</div>
                <div class="address-line">${esc(addr.postalCode)} ${esc(addr.city)}</div>
                <div class="address-type">${esc(addr.type)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  clientInfo.innerHTML = html;
}

function confirmNewClient(fileId) {
  const fileData = extractedData[fileId];
  if (!fileData || !fileData.extracted.client) return;
  
  const client = fileData.extracted.client;
  
  // Create new client
  const newClient = {
    id: nw(),
    n: client.name,
    a: client.address || '',
    c: client.city || '',
    t: client.phone || '',
    e: client.email || ''
  };
  
  S.clients.push(newClient);
  save('clients');
  
  toast('Client ajouté avec succès !');
  
  // Update display
  showClientInfo(fileData);
}

function selectBillingAddress(fileId, index) {
  const fileData = extractedData[fileId];
  if (!fileData || !fileData.extracted.addresses) return;
  
  // Mark selected address
  fileData.extracted.selectedBillingAddress = index;
  
  toast(`Adresse de facturation sélectionnée: ${fileData.extracted.addresses[index].street}`);
}

function showItems(fileData) {
  const itemsGrid = $('#itemsGrid');
  itemsGrid.innerHTML = '';
  
  if (!fileData.extracted.items || fileData.extracted.items.length === 0) {
    itemsGrid.innerHTML = '<p style="color: var(--mu);">Aucun élément identifié dans ce document.</p>';
    return;
  }
  
  fileData.extracted.items.forEach((item, index) => {
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card';
    
    const itemType = item.type === 'service' ? 'Prestation' : 'Fourniture';
    const typeClass = item.type === 'service' ? 'service' : 'supply';
    
    itemCard.innerHTML = `
      <div class="item-header">
        <div class="item-type">${itemType}</div>
        <input type="checkbox" id="item_${fileData.id}_${index}" 
               onchange="toggleItemSelection('${fileData.id}', ${index}, this.checked)"
               ${selectedItems[fileData.id] && selectedItems[fileData.id][index] ? 'checked' : ''}>
      </div>
      <div class="item-name">${esc(item.name)}</div>
      <div class="item-details">
        <div><strong>Quantité:</strong> ${esc(item.quantity)}</div>
        <div><strong>Prix unitaire:</strong> ${E(item.unitPrice)}</div>
        <div class="item-price"><strong>Total:</strong> ${E(item.total)}</div>
      </div>
      <div class="item-actions">
        <button class="add" onclick="addItemToDatabase('${fileData.id}', ${index})">Ajouter à mes tarifs</button>
        <button class="skip" onclick="skipItem('${fileData.id}', ${index})">Ignorer</button>
      </div>
    `;
    
    itemsGrid.appendChild(itemCard);
  });
}

function toggleItemSelection(fileId, index, checked) {
  if (!selectedItems[fileId]) {
    selectedItems[fileId] = {};
  }
  selectedItems[fileId][index] = checked;
}

function addItemToDatabase(fileId, index) {
  const fileData = extractedData[fileId];
  if (!fileData || !fileData.extracted.items || !fileData.extracted.items[index]) return;
  
  const item = fileData.extracted.items[index];
  
  // Check if item already exists
  const existingItem = S.cat.find(c => 
    c.d && c.d.toLowerCase() === item.name.toLowerCase()
  );
  
  if (existingItem) {
    toast(`⚠️ ${esc(item.name)} existe déjà dans vos tarifs`);
    return;
  }
  
  // Add to database
  S.cat.push({
    d: item.name,
    t: item.type,
    p: item.unitPrice
  });
  
  save('cat');
  toast(`✅ ${esc(item.name)} ajouté à vos tarifs`);
  
  // Update search results
  initItemSearch();
}

function skipItem(fileId, index) {
  const fileData = extractedData[fileId];
  if (!fileData || !fileData.extracted.items || !fileData.extracted.items[index]) return;
  
  // Mark as skipped
  fileData.extracted.items[index].skipped = true;
  
  toast(`⏭️ ${esc(fileData.extracted.items[index].name)} ignoré`);
}

function initItemSearch() {
  const searchInput = $('#itemSearch');
  const searchResults = $('#searchResults');
  
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    
    if (query.length < 2) {
      searchResults.classList.remove('show');
      return;
    }
    
    const results = S.cat.filter(item => 
      item.d && item.d.toLowerCase().includes(query)
    );
    
    if (results.length === 0) {
      searchResults.classList.remove('show');
      return;
    }
    
    searchResults.innerHTML = results.map((item, index) => `
      <div class="result-item" onclick="selectSearchResult('${esc(item.d)}', '${item.t}', ${item.p})" onmouseenter="highlightResult(this)">
        <div><strong>${esc(item.d)}</strong></div>
        <div style="font-size: 12px; color: var(--mu);">${item.t === 'service' ? 'Prestation' : 'Fourniture'} - ${E(item.p)}</div>
      </div>
    `).join('');
    
    searchResults.classList.add('show');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchResults.classList.remove('show');
    }
  });
}

function selectSearchResult(name, type, price) {
  const searchInput = $('#itemSearch');
  const searchResults = $('#searchResults');
  
  searchInput.value = name;
  searchResults.classList.remove('show');
  
  toast(`🔍 ${esc(name)} sélectionné`);
  
  // Here you could add the selected item to the current document
}

function highlightResult(element) {
  // Remove highlight from all
  document.querySelectorAll('.result-item').forEach(el => {
    el.classList.remove('highlight');
  });
  
  // Add highlight to this one
  element.classList.add('highlight');
}

function selectedTransferScope(){return document.querySelector('input[name="transferScope"]:checked')?.value||'client'}
document.addEventListener('change',e=>{if(e.target.name==='transferScope')document.querySelectorAll('.scope-option').forEach(x=>x.classList.toggle('selected',x.querySelector('input')===e.target))});
function importWarnings(data){const w=[];if(!data.client?.name)w.push('client non détecté');if(!data.documentNumber)w.push('numéro du document absent (un numéro sera attribué)');if(!data.date)w.push('date absente (date du jour utilisée)');if(!(data.items||[]).some(i=>!i.skipped))w.push('aucune ligne de prestation ou fourniture détectée');return w}
function validateTransfer(){const scope=selectedTransferScope(),withPrices=$('#transferWithPrices')?.checked!==false,transferDocNumbers=$('#transferDocNumbers')?.checked!==false,ids=Object.keys(extractedData);if(!ids.length){toast('Aucun fichier à transférer');return}
let last=null;ids.forEach(id=>{const w=scope==='all'?importWarnings(extractedData[id].extracted||{}):[];if(w.length)toast('⚠️ '+(extractedData[id].name||'Document')+' : '+w.join(', '));last=transferFile(extractedData[id],scope,withPrices,transferDocNumbers)||last});
if(scope==='all'&&last){toast('✓ Document créé dans votre mise en page — aperçu en cours');setTimeout(()=>{go('e',last.id);pvo()},400);return}
toast('✓ Transfert terminé');setTimeout(()=>render(),500)}
function transferFile(fileData,scope,withPrices,transferDocNumbers){
 const data=fileData.extracted||{},norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 let client=null;
 if((scope==='client'||scope==='all')&&data.client?.name){
   client=S.clients.find(c=>{
     const a=norm(c.n),b=norm(data.client.name);
     return a&&b&&(a===b||(data.client.email&&norm(c.e)===norm(data.client.email))||(data.client.phone&&String(c.t||'').replace(/\D/g,'')===String(data.client.phone).replace(/\D/g,'')));
   });
   if(!client){client={id:nw(),n:data.client.name,a:'',c:'',t:data.client.phone||'',e:data.client.email||'',addresses:[]};S.clients.push(client)}
   if(!Array.isArray(client.addresses))client.addresses=[];
   (data.addresses||[]).forEach(addr=>{if(addr?.street&&!client.addresses.some(a=>norm(a.street)===norm(addr.street)&&String(a.postalCode)===String(addr.postalCode)))client.addresses.push({...addr})});
   if(!client.t&&data.client.phone)client.t=data.client.phone;
   if(!client.e&&data.client.email)client.e=data.client.email;
   const bill=data.addresses?.[data.selectedBillingAddress||0];
   if(!client.a&&(data.client.address||bill?.street))client.a=data.client.address||bill.street;
   if(!client.c&&(data.client.postalCode||data.client.city||bill))client.c=[data.client.postalCode||bill?.postalCode,data.client.city||bill?.city].filter(Boolean).join(' ');
   save('clients');
 }
 if(scope==='services'||scope==='supplies'||scope==='all'){
   (data.items||[]).forEach(item=>{
     const ok=scope==='all'||(scope==='services'&&item.type==='service')||(scope==='supplies'&&item.type==='supply');
     if(!ok||item.skipped)return;
     const old=S.cat.find(x=>norm(x.d)===norm(item.name));
     const price=withPrices?n(item.type==='supply'?(item.saleUnitPrice||item.unitPrice):item.unitPrice):0;
     if(old){if(withPrices&&!n(old.p))old.p=price;return}
     S.cat.push({d:item.name,t:item.type,p:price});
   });
   save('cat');
 }
 if(scope==='all'){
   const type=data.documentType==='facture'?'f':'d',year=(data.date||td()).slice(0,4)||new Date().getFullYear(),key=type+year,seq=(S.seq[key]||0)+1;
   const docNumber=data.documentNumber||((type==='d'?'DEV-':'FAC-')+year+'-'+String(seq).padStart(3,'0'));
   if(data.documentNumber&&transferDocNumbers&&S.docs.some(d=>norm(d.num)===norm(data.documentNumber))){{const ex=S.docs.find(d=>norm(d.num)===norm(data.documentNumber));toast('⚠️ Numéro déjà enregistré : '+data.documentNumber);return ex}}
   const bill=data.addresses?.[data.selectedBillingAddress||0];
   const doc={id:nw(),t:type,num:docNumber,date:data.date||td(),val:S.cfg.val||30,
     cn:client?.n||data.client?.name||'',ca:bill?.street||data.client?.address||client?.a||'',cc:[bill?.postalCode,bill?.city].filter(Boolean).join(' ')||[data.client?.postalCode,data.client?.city].filter(Boolean).join(' ')||client?.c||'',
     ct:client?.t||data.client?.phone||'',ce:client?.e||data.client?.email||'',cid:client?.id||'',sn:data.chantier||'',sa:'',sc:'',o:data.object||'',F:[],M:[],
     acc:S.cfg.acc||40,ap:false,paid:false,pd:'',cost:'',st:'att',tva:0,rm:'',ref:data.reference||''};
   (data.items||[]).forEach(item=>{
     if(item.skipped)return;
     if(item.type==='service')doc.M.push({d:item.name,q:item.quantity||1,p:withPrices?n(item.unitPrice):0});
     else if(item.type==='supply')doc.F.push({d:item.name,q:item.quantity||1,p:withPrices?n(item.saleUnitPrice||item.unitPrice):0});
   });
   S.docs.unshift(doc);S.seq[key]=seq;save('docs');save('seq');
   if(!data.documentNumber)toast('ℹ️ Aucun numéro source détecté : numéro '+docNumber+' attribué par Ms Devis');
   return doc;
 }
 return null;
}
function resetImport() {
  currentFiles = [];
  extractedData = {};
  selectedItems = { services: [], supplies: [] };
  
  // Reset UI
  $('#fileInput').value = '';
  $('#uploadProgress').style.display = 'none';
  $('#progressFill').style.width = '0%';
  $('#fileListContainer').style.display = 'none';
  $('#extractedDataContainer').style.display = 'none';
  $('#clientSection').style.display = 'none';
  $('#itemsSection').style.display = 'none';
  $('#transferSection').style.display = 'none';
  $('#previewContainer').style.display = 'none';
  
  // Re-render
  render();
}

function deleteFile(fileId) {
  if (extractedData[fileId]) {
    delete extractedData[fileId];
    updateFileList();
    
    // Check if we need to hide sections
    if (Object.keys(extractedData).length === 0) {
      $('#extractedDataContainer').style.display = 'none';
      $('#clientSection').style.display = 'none';
      $('#itemsSection').style.display = 'none';
      $('#transferSection').style.display = 'none';
    }
    
    toast('Fichier supprimé');
  }
}

// Storage functions
function save(k) {
  try {
    localStorage.setItem('ms_' + k, JSON.stringify(S[k]));
    localStorage.setItem('ms_stamp', String(Date.now()));
  } catch (e) {}
}

// Toast function
function toast(m) {
  const t = $('#ts');
  t.textContent = m;
  t.style.opacity = 1;
  setTimeout(() => t.style.opacity = 0, 2400);
}

// Initialize

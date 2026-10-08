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
            <div class="validation-icon">✓</div><span>Transférer vers la nouvelle mise en page</span>
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
    const last=extractedData[ids[ids.length-1]];
    processFile(last.id);
    $('#transferSection')?.scrollIntoView({behavior:'smooth',block:'center'});
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
 else if(/\.(txt|csv)$/i.test(file.name)){text=await readText(file);preview=text}else if(type.startsWith('image/')){preview=await readDataURL(file);if(window.Tesseract){try{const o=await Tesseract.recognize(file,'fra+eng');text=o?.data?.text||''}catch(e){text=''}}}else{text=await readText(file);preview=text}
 const extracted=parseDocumentText(file.name,text),id=nw();extractedData[id]={id,name:file.name,size:file.size,type,content:preview||text,status:'completed',extracted};
}
function readText(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lecture impossible'));r.readAsText(file)})}
function readDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lecture impossible'));r.readAsDataURL(file)})}
async function extractPdfText(buffer){
  try{
    let pdfjs=window.pdfjsLib;
    if(!pdfjs){try{pdfjs=(await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'))}catch(e){return ''}}
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
 const lines=raw.split(/\n+/).map(s=>s.trim()).filter(Boolean);
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').replace(/Œ/g,'OE').replace(/[’']/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
 const money=s=>{const v=String(s||'').replace(/\s/g,'').replace(/[€]/g,'').replace(',','.');const n=parseFloat(v);return Number.isFinite(n)?n:0};
 const eurRe=/(\d[\d ]*[.,]\d{2})\s*€/g;
 const euroTokens=line=>{const out=[];for(const m of String(line).matchAll(/\[\[EUR:(\d[\d ]*[.,]\d{2})\]\]/g))out.push({value:money(m[1]),index:m.index});if(out.length)return out;for(const m of String(line).matchAll(eurRe))out.push({value:money(m[1]),index:m.index});return out};
 const plain=raw.replace(/\s*\|\|\|\s*/g,' ');
 const own={name:/ms\s+plomberie|mikael\s+salillari/i,mail:/mikael\.salillari@hotmail\.fr/i,phone:/07\s*49\s*24\s*85\s*59/i,address:/285\s+rue\s+jeanne\s+d.?arc/i};
 const cleanLabel=(s,label)=>String(s||'').replace(new RegExp('^\\s*'+label+'\\s*[:：-]?\\s*','i'),'').trim();
 const stripRole=s=>String(s||'').replace(/^(?:nom|client|raison sociale|soci[eé]t[eé]|adresse|t[eé]l[eé]phone|t[eé]l|email|e-mail|mail)\s*[:：-]\s*/i,'').trim();
 const dateM=plain.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b|\b(\d{4})[\/-](\d{2})[\/-](\d{2})\b/);
 const date=dateM?(dateM[4]?dateM[4]+'-'+dateM[5]+'-'+dateM[6]:dateM[3]+'-'+dateM[2]+'-'+dateM[1]):td();
 const numCandidates=[...plain.matchAll(/\b(?:DEVIS|DEV|FACTURE|FAC)\s*[-_: ]\s*([A-Z0-9][A-Z0-9_-]{2,})/ig)].map(m=>m[0]);
 const filenameNum=filename.match(/\b(?:DEVIS|DEV|FACTURE|FAC)[\s_-]*(?=[A-Z0-9_-]*\d)[A-Z0-9]+(?:[\s_-]+[A-Z0-9]+)*/i)?.[0]||'';
 const rawNum=numCandidates.find(x=>/\d/.test(x))||filenameNum;
 const documentNumber=rawNum?rawNum.replace(/[:_ ]+/g,'-').replace(/-+/g,'-').toUpperCase():null;
 const documentType=/(facture|invoice|\bfac[\s_-]?\d)/i.test(filename+' '+plain)?'facture':'devis';

 // 1) Séparer strictement l'émetteur (MS Plomberie) du client.
 const emails=[...plain.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)].map(m=>m[0]);
 const phones=[...plain.matchAll(/(?:\+33\s?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/g)].map(m=>m[0]);
 const clientBlock=[];
 let clientName='',clientEmail='',clientPhone='',clientAddress='',clientPostal='',clientCity='';
 const addCandidate=(s)=>{
   const v=stripRole(String(s||'').trim());
   if(!v||own.name.test(v)||own.mail.test(v)||own.phone.test(v)||own.address.test(v)||/^\d{5}\s+\w/.test(v))return;
   if(!clientName&&v.length>=2&&!/^(devis|facture|objet|chantier|référence|periode prévue|période prévue|siret)$/i.test(v))clientName=v;
 };
 // Format 2 colonnes PDF : DEVIS ||| Client, puis CHANTIER ||| Objet.
 const devisIdx=lines.findIndex(x=>/^\s*(?:DEVIS|FACTURE)\b/i.test(x)||/\|\|\|\s*(?:dev(is)?|facture)\s*$/i.test(x));
 if(devisIdx>=0){
   const p=lines[devisIdx].split('|||').map(s=>s.trim());
   if(p.length>1)addCandidate(p[1]);
   if(!clientName&&lines[devisIdx+1]){
     const q=lines[devisIdx+1].split('|||').map(s=>s.trim());
     if(q.length>1)addCandidate(q[1]);
   }
 }
 // Formats structurés : Client/Nom/Raison sociale.
 const explicitName=/^(?:client|nom du client|nom|raison sociale|société)\s*[:：-]\s*(.+)$/i;
 for(let i=0;i<lines.length;i++){
   const m=lines[i].match(explicitName);
   if(m&&!clientName)addCandidate(m[1]);
   if(/^(?:client|nom du client|nom|raison sociale|société)\s*[:：-]?\s*$/i.test(lines[i])&&lines[i+1])addCandidate(lines[i+1]);
 }
 // Le chantier est une donnée client/site, jamais le nom du fichier.
 const chantierIdx=lines.findIndex(x=>/^chantier\b/i.test(x));
 let chantier='';
 if(chantierIdx>=0){
   const p=lines[chantierIdx].split('|||').map(s=>s.trim());
   chantier=p.length>1&&!/^objet$/i.test(p[1])?p[1]:(p[0].replace(/^chantier\s*[:：-]?\s*/i,'')||lines[chantierIdx+1]?.split('|||')[0]?.trim()||'');
   if(!clientName&&chantier)clientName=stripRole(chantier);
 }
 // Extraire les champs client uniquement depuis leur zone explicite.
 const scanStart=Math.max(0,devisIdx>=0?devisIdx:chantierIdx>=0?chantierIdx:0);
 const scanEnd=Math.min(lines.length,scanStart+18);
 const nearby=lines.slice(scanStart,scanEnd);
 for(let i=0;i<nearby.length;i++){
   const line=nearby[i];
   if(!clientEmail){const m=line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);if(m&&!own.mail.test(m[0]))clientEmail=m[0]}
   if(!clientPhone){const m=line.match(/(?:\+33\s?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/);if(m&&!own.phone.test(m[0]))clientPhone=m[0]}
   let m=line.match(/^(?:adresse|adresse de facturation|adresse client)\s*[:：-]\s*(.+)$/i);if(m)clientAddress=m[1].trim();
   m=line.match(/^(?:code postal|cp)\s*[:：-]\s*(\d{5})$/i);if(m)clientPostal=m[1];
   m=line.match(/^(?:ville|city)\s*[:：-]\s*(.+)$/i);if(m)clientCity=m[1].trim();
   m=line.match(/^(?:adresse|adresse de facturation|adresse client)\s*[:：-]?\s*(\d{1,5}\s+.+?)\s+(\d{5})\s+(.+)$/i);
   if(m){clientAddress=m[1].trim();clientPostal=m[2];clientCity=m[3].trim()}
 }
 // Adresses : ne retenir que des adresses réellement client/site, jamais celles de MS Plomberie.
 const addresses=[];
 const pushAddr=(street,postalCode,city,type='facturation')=>{
   if(!street||own.address.test(street)||own.name.test(street)||own.mail.test(street))return;
   const key=norm(street)+'|'+postalCode+'|'+norm(city);
   if(!addresses.some(a=>norm(a.street)+'|'+a.postalCode+'|'+norm(a.city)===key))addresses.push({type,street:street.trim(),postalCode:String(postalCode||''),city:String(city||'').trim()});
 };
 if(clientAddress&&clientPostal&&clientCity)pushAddr(clientAddress,clientPostal,clientCity,'facturation');
 for(const line of lines){
   let m=line.match(/(?:adresse(?: de facturation| client)?\s*[:：-]\s*)?(\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|all[ée]e|place)\s+[A-Za-zÀ-ÿ0-9'’ .-]{2,100}?)[,;]?\s*(\d{5})\s+([A-Za-zÀ-ÿ'’ .-]{2,60})$/i);
   if(m&&!own.name.test(m[0])&&!own.address.test(m[0]))pushAddr(m[1],m[2],m[3],/chantier|travaux|site/i.test(line)?'chantier':'facturation');
 }
 const explicitAddressLines=lines.filter(x=>/^(?:adresse|adresse de facturation|adresse client)\b/i.test(x));
 if(explicitAddressLines.length&&addresses.length===0){
   const l=explicitAddressLines[0],m=l.match(/(?:adresse|adresse de facturation|adresse client)\s*[:：-]\s*(.+)$/i);if(m)clientAddress=m[1].trim();
 }

 // Objet / période / référence, en respectant les colonnes du PDF.
 const colValue=(label)=>{
   const idx=lines.findIndex(x=>new RegExp('^'+label+'\\b','i').test(x)||new RegExp('\\|\\|\\|\\s*'+label+'\\s*$','i').test(x));
   if(idx<0)return '';
   const p=lines[idx].split('|||').map(s=>s.trim());
   if(p.length>1&&!new RegExp('^'+label+'\\b','i').test(p[1]))return p[1];
   return (lines[idx+1]?.split('|||').map(s=>s.trim())[p.length>1?0:0]||'').trim();
 };
 const objet=colValue('objet'),period=colValue('p[ée]riode pr[ée]vue'),reference=colValue('r[ée]f[ée]rence');

 // 2) Lignes tarifaires : on conserve séparément désignation, quantité, PU et total.
 let section='',items=[];
 for(const line of lines){
   const f=norm(line);
   if(/^1\.\s*main-d.*oeuvre/i.test(f)){section='services';continue}
   if(/^2\.\s*fournitures/i.test(f)){section='supplies';continue}
   if(/^3\.\s*synthese/i.test(f)||/^4\.\s*conditions/i.test(f)){section='';continue}
   if(!section)continue;
   const euro=euroTokens(line); if(!euro.length)continue;
   if(/^(sous-total|co[uû]t d'achat|estimation du co[uû]t|famille|ref\.?|designation|page)/i.test(f))continue;
   const before=line.slice(0,euro[0].index).trim();
   if(section==='services'&&euro.length>=2){
     const qM=before.match(/\[\[QTY:(\d+(?:[.,]\d+)?)\]\]/)||before.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*$/);
     const quantity=qM?money(qM[1]):1;
     let desc=(qM?before.slice(0,qM.index):before).replace(/^(?:\d{1,3}(?:[.,]\d+)?|—|-)\s*/,'').trim();
     if(desc&&desc.length>2)items.push({type:'service',name:desc,quantity,unitPrice:euro[0].value,total:euro[euro.length-1].value});
   }else if(section==='supplies'){
     const qM=before.match(/\[\[QTY:(\d+(?:[.,]\d+)?)\]\]/)||before.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:ensembles?|flexibles?|unit[ée]s?|pcs?|pi[èe]ces?)?\s*$/i);
     const quantity=qM?money(qM[1]):1;
     let desc=(qM?before.slice(0,qM.index):before).replace(/\s+Forfait$/i,'').trim();
     if(desc&&desc.length>2)items.push({type:'supply',name:desc,quantity,purchaseTotal:euro[euro.length-1].value,unitPrice:quantity?euro[euro.length-1].value/quantity:0,saleUnitPrice:quantity?euro[euro.length-1].value/quantity*1.30:0});
   }
 }
 const searchable=norm(plain);
 const totalM=searchable.match(/total\s+net(?:\s+du\s+devis)?[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
 const laborM=searchable.match(/(?:sous-total|total)\s+main-d.?oeuvre[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
 const supplyCostM=searchable.match(/co[uû]t d'achat estimatif fournitures[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
 const supplySaleM=searchable.match(/fournitures valoris[ée]es avec marge[^\d]*(\d[\d ]*[.,]\d{2})\s*€/i);
 const fallbackName=filename.replace(/\.[^.]+$/,'').replace(/^(devis|facture|fac|dev)[\s_-]*/i,'').replace(/[._-]+/g,' ').trim();
 if(!clientName||own.name.test(clientName)||own.mail.test(clientName)||own.phone.test(clientName))clientName='';
 if(!clientName&&fallbackName&&!/^devis\s*$/i.test(fallbackName))clientName=fallbackName;
 if(clientName&&/^(nom|adresse|client|devis|facture)\s*[:：-]/i.test(clientName))clientName=stripRole(clientName);
 if(clientName&&clientName.toLowerCase().includes('adresse'))clientName=clientName.replace(/\s+adresse\s*:?.*$/i,'').trim();
 const client=clientName?{name:clientName,email:clientEmail,phone:clientPhone,address:clientAddress,postalCode:clientPostal,city:clientCity}:null;
 return {
   client,documentNumber,date,documentType,items,
   total:totalM?money(totalM[1]):items.reduce((s,x)=>s+(x.type==='service'?x.total:x.purchaseTotal||0),0),
   laborTotal:laborM?money(laborM[1]):items.filter(x=>x.type==='service').reduce((s,x)=>s+x.total,0),
   supplyPurchaseTotal:supplyCostM?money(supplyCostM[1]):items.filter(x=>x.type==='supply').reduce((s,x)=>s+(x.purchaseTotal||0),0),
   supplySaleTotal:supplySaleM?money(supplySaleM[1]):0,
   addresses,selectedBillingAddress:0,chantier,object:objet,period,reference,warnings:[]
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
function validateTransfer(){const scope=selectedTransferScope(),withPrices=$('#transferWithPrices')?.checked!==false,transferDocNumbers=$('#transferDocNumbers')?.checked!==false,ids=Object.keys(extractedData);if(!ids.length){toast('Aucun fichier à transférer');return}ids.forEach(id=>transferFile(extractedData[id],scope,withPrices,transferDocNumbers));toast('✓ Transfert terminé');setTimeout(()=>render(),500)}
function transferFile(fileData,scope,withPrices,transferDocNumbers){
 const data=fileData.extracted||{},norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 let client=null;
 if((scope==='client'||scope==='all')&&data.client?.name){
   client=S.clients.find(c=>norm(c.n)===norm(data.client.name));
   if(!client){client={id:nw(),n:data.client.name,a:'',c:'',t:data.client.phone||'',e:data.client.email||'',addresses:[]};S.clients.push(client)}
   if(!Array.isArray(client.addresses))client.addresses=[];
   (data.addresses||[]).forEach(addr=>{if(!client.addresses.some(a=>norm(a.street)===norm(addr.street)&&String(a.postalCode)===String(addr.postalCode)))client.addresses.push({...addr})});
   if(!client.t&&data.client.phone)client.t=data.client.phone;
   if(!client.e&&data.client.email)client.e=data.client.email;
   if(!client.a&&data.addresses?.[0]?.street)client.a=data.addresses[0].street;
   if(!client.c&&data.addresses?.[0])client.c=[data.addresses[0].postalCode,data.addresses[0].city].filter(Boolean).join(' ');
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
   let docNumber=data.documentNumber||((type==='d'?'DEV-':'FAC-')+year+'-'+String(seq).padStart(3,'0'));
   if(data.documentNumber&&transferDocNumbers&&S.docs.some(d=>norm(d.num)===norm(data.documentNumber))){toast('⚠️ Numéro déjà enregistré : '+data.documentNumber);return}
   const bill=data.addresses?.[data.selectedBillingAddress||0];
   const doc={id:nw(),t:type,num:docNumber,date:data.date||td(),val:S.cfg.val||30,
     cn:client?.n||data.client?.name||'',ca:bill?.street||client?.a||'',cc:[bill?.postalCode,bill?.city].filter(Boolean).join(' ')||client?.c||'',
     ct:client?.t||data.client?.phone||'',ce:client?.e||data.client?.email||'',cid:client?.id||'',sn:data.chantier||'',sa:'',sc:'',
     o:data.object||'',F:[],M:[],acc:S.cfg.acc||40,ap:false,paid:false,pd:'',cost:'',st:'att',tva:0,rm:'',ref:data.reference||''};
   const supplies=(data.items||[]).filter(x=>x.type==='supply'&&!x.skipped),targetSupply=n(data.supplySaleTotal)||supplies.reduce((s,x)=>s+(n(x.purchaseTotal)||0)*1.30,0);
   let usedSupply=0;
   (data.items||[]).forEach(item=>{
     if(item.skipped)return;
     if(item.type==='service')doc.M.push({d:item.name,q:item.quantity||1,p:withPrices?n(item.unitPrice):0});
     else if(item.type==='supply'){
       const q=n(item.quantity)||1;let p=withPrices?n(item.saleUnitPrice||item.unitPrice):0;
       const isLast=supplies[supplies.length-1]===item;
       if(withPrices&&isLast)p=Math.max(0,(targetSupply-usedSupply)/q);
       usedSupply+=q*p;doc.F.push({d:item.name,q,p});
     }
   });
   S.docs.unshift(doc);S.seq[key]=seq;save('docs');save('seq');
   if(!data.documentNumber)toast('ℹ️ Aucun numéro source détecté : numéro '+docNumber+' attribué par Ms Devis');
 }
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

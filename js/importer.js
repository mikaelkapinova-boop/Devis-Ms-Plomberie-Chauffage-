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
        <h3>Transférer vers la nouvelle mise en page</h3>
        <p style="color: var(--mu); font-size: 14px; margin-bottom: 12px;">
          Sélectionnez ce que vous souhaitez transférer :
        </p>
        
        <div class="transfer-options" id="transferOptions">
          <div class="transfer-section">
            <h4>Informations client</h4>
            <div class="transfer-grid">
              <label class="transfer-option">
                <input type="checkbox" id="transferClient" checked>
                <span>Transférer les informations client</span>
              </label>
              <label class="transfer-option">
                <input type="checkbox" id="transferClientAddress" checked>
                <span>Transférer l'adresse de facturation</span>
              </label>
            </div>
          </div>
          
          <div class="transfer-section">
            <h4>Prestations et fournitures</h4>
            <div class="transfer-grid">
              <label class="transfer-option">
                <input type="checkbox" id="transferAllItems" checked>
                <span>Tout transférer</span>
              </label>
              <label class="transfer-option">
                <input type="checkbox" id="transferServices" checked>
                <span>Uniquement les prestations</span>
              </label>
              <label class="transfer-option">
                <input type="checkbox" id="transferSupplies" checked>
                <span>Uniquement les fournitures</span>
              </label>
              <label class="transfer-option">
                <input type="checkbox" id="transferWithPrices" checked>
                <span>Enregistrer avec les prix dans la base</span>
              </label>
            </div>
          </div>
          
          <div class="transfer-section">
            <h4>Numéros de documents</h4>
            <div class="transfer-grid">
              <label class="transfer-option">
                <input type="checkbox" id="transferDocNumbers" checked>
                <span>Relever les numéros de devis/facture</span>
              </label>
            </div>
          </div>
        </div>
        
        <button class="validation-button" id="validateTransfer" onclick="validateTransfer()">
          <div class="validation-icon">✓</div>
          <span>Valider le transfert</span>
        </button>
      </div>

      <div class="c" id="previewContainer" style="display: none;">
        <h3>Aperçu du document</h3>
        <div class="preview-container" id="previewContent"></div>
      </div>
    </div>
  `;
}

/* Importation intégrée à l'application principale — aucun changement de page */
let currentFiles=[];
let extractedData={};
let selectedItems={services:[],supplies:[]};
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
 else if(/\.(txt|csv)$/i.test(file.name)){text=await readText(file);preview=text}else if(type.startsWith('image/'))preview=await readDataURL(file);else{text=await readText(file);preview=text}
 const extracted=parseDocumentText(file.name,text),id=nw();extractedData[id]={id,name:file.name,size:file.size,type,content:preview||text,status:'completed',extracted};
}
function readText(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lecture impossible'));r.readAsText(file)})}
function readDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Lecture impossible'));r.readAsDataURL(file)})}
async function extractPdfText(buffer){let pdfjs;try{pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs')}catch(e){return ''}const pdf=await pdfjs.getDocument({data:buffer}).promise,parts=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),tc=await page.getTextContent();parts.push(tc.items.map(x=>x.str||'').join(' '))}return parts.join('\n')}
function parseDocumentText(filename,text){
 const raw=(text||'').replace(/\u0000/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n').trim();
 const nm=raw.match(/((?:DEVIS?|DEV|FACTURE|FAC)[\s-]*[A-Z0-9]+(?:[\s-]+[A-Z0-9]+)*)/i)||filename.match(/((?:DEVIS?|DEV|FACTURE|FAC)[\s-]*[A-Z0-9]+(?:[\s-]+[A-Z0-9]+)*)/i);
 const documentNumber=nm?nm[1].replace(/\s+/g,'-').toUpperCase():null,documentType=/(facture|invoice|fac[\s-]?\d)/i.test(filename+' '+raw)?'facture':'devis';
 const d=raw.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b|\b(\d{4})[\/-](\d{2})[\/-](\d{2})\b/),date=d?(d[4]?d[4]+'-'+d[5]+'-'+d[6]:d[3]+'-'+d[2]+'-'+d[1]):td();
 const email=(raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||'',phone=(raw.match(/(?:\+33\s?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/)||[])[0]||'';
 let name='';const nm2=raw.match(/(?:client|nom du client|raison sociale|factur[ée] [àa]|pour|destinataire)\s*[:\-]?\s*([^\n]{2,80})/i);if(nm2)name=nm2[1].trim();if(!name)name=filename.replace(/\.[^.]+$/,'').replace(/^(devis|facture|fac|dev)[\s_-]*/i,'').replace(/[._-]+/g,' ').trim();
 const addresses=[];const ar=/(\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|all[ée]e)\s+[^\n,;]{2,80})[,;]?\s*(\d{5})\s+([^\n,;]+)/gi;let m;while((m=ar.exec(raw)))addresses.push({type:/chantier|travaux|site/i.test(m[0])?'chantier':'facturation',street:m[1].trim(),postalCode:m[2],city:m[3].trim()});
 const items=[];raw.split(/\n+/).map(x=>x.trim()).filter(Boolean).forEach(line=>{const vals=[...line.matchAll(/(\d[\d ]*[,.]\d{2})\s*€?/g)].map(x=>parseFloat(x[1].replace(/ /g,'').replace(',','.')));if(!vals.length||/^(total|sous-total|tva|remise|acompte|reste à payer)/i.test(line))return;const desc=line.replace(/\d[\d ]*[,.]\d{2}\s*€?/g,'').trim();if(desc.length<3)return;const service=/(pose|installation|réparation|dépannage|main d.?œuvre|déplacement|intervention|diagnostic|heure|forfait)/i.test(desc);items.push({type:service?'service':'supply',name:desc,quantity:1,unitPrice:vals.length>1?vals[vals.length-2]:vals[0],total:vals[vals.length-1]})});
 const totalM=raw.match(/(?:total(?: ttc)?|montant total)\s*[:=]?\s*(\d[\d ]*[,.]\d{2})/i),warnings=[];return {client:name?{name,email,phone}:null,documentNumber,date,documentType,items,total:totalM?parseFloat(totalM[1].replace(/ /g,'').replace(',','.')):items.reduce((s,x)=>s+x.total,0),addresses,selectedBillingAddress:0,warnings};
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
function validateTransfer(){const scope=selectedTransferScope(),withPrices=$('#transferWithPrices')?.checked!==false,transferDocNumbers=$('#transferDocNumbers')?.checked!==false,ids=Object.keys(extractedData);if(!ids.length){toast('Aucun fichier à transférer');return}ids.forEach(id=>transferFile(extractedData[id],scope,withPrices,transferDocNumbers));toast('✓ Transfert terminé');setTimeout(resetImport,700)}
function transferFile(fileData,scope,withPrices,transferDocNumbers){const data=fileData.extracted,norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();let client=null;
if((scope==='client'||scope==='all')&&data.client?.name){client=S.clients.find(c=>norm(c.n)===norm(data.client.name));if(!client){client={id:nw(),n:data.client.name,a:'',c:'',t:data.client.phone||'',e:data.client.email||'',addresses:[]};S.clients.push(client)}if(!client.t&&data.client.phone)client.t=data.client.phone;if(!client.e&&data.client.email)client.e=data.client.email;save('clients')}
if(scope!=='client'){(data.items||[]).forEach(item=>{const ok=scope==='all'||(scope==='services'&&item.type==='service')||(scope==='supplies'&&item.type==='supply');if(!ok||item.skipped)return;const old=S.cat.find(x=>norm(x.d)===norm(item.name));if(old){if(withPrices&&!n(old.p))old.p=n(item.unitPrice);return}S.cat.push({d:item.name,t:item.type,p:withPrices?n(item.unitPrice):0})});save('cat')}
if(transferDocNumbers&&data.documentNumber&&!S.docs.some(d=>norm(d.num)===norm(data.documentNumber))){const type=data.documentType==='facture'?'f':'d',year=new Date().getFullYear(),key=type+year,seq=(S.seq[key]||0)+1,bill=data.addresses?.[data.selectedBillingAddress||0],doc={id:nw(),t:type,num:data.documentNumber,date:data.date||td(),val:S.cfg.val||30,cn:client?.n||data.client?.name||'',ca:bill?.street||client?.a||'',cc:[bill?.postalCode,bill?.city].filter(Boolean).join(' ')||client?.c||'',ct:client?.t||data.client?.phone||'',ce:client?.e||data.client?.email||'',cid:client?.id||'',sn:'',sa:'',sc:'',o:'Importé depuis document : '+fileData.name,F:[],M:[],acc:S.cfg.acc||40,ap:false,paid:false,pd:'',cost:'',st:'att',tva:0,rm:''};(data.items||[]).forEach(item=>{if(!item.skipped)(item.type==='service'?doc.M:doc.F).push({d:item.name,q:item.quantity||1,p:n(item.unitPrice)})});S.docs.unshift(doc);S.seq[key]=seq;save('docs');save('seq')}else if(transferDocNumbers&&data.documentNumber)toast('⚠️ Numéro déjà enregistré : '+data.documentNumber)}
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


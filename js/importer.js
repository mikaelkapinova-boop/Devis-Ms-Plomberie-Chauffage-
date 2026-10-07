/**
 * Ms Plomberie & Chauffage - Système d'importation et d'extraction de documents
 * 
 * Ce module gère :
 * - L'extraction intelligente des données des documents (PDF, images, Word)
 * - La reconnaissance des clients, adresses, prestations et fournitures
 * - La gestion des adresses multiples par client
 * - Le transfert vers la base de données avec validation
 */

'use strict';

// ============================================================================
// CONFIGURATION
// ============================================================================

const IMPORT_CONFIG = {
  // Types de documents supportés
  supportedTypes: ['pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  
  // Extensions de fichiers supportées
  supportedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'],
  
  // Taille maximale des fichiers (en Mo)
  maxFileSize: 50,
  
  // Patterns pour la reconnaissance des documents
  patterns: {
    devis: /(devis|quote|estimation|estimate|cotation)/i,
    facture: /(facture|invoice|fact|fac)/i,
    client: /(client|customer|nom|name|soci[ée]t[ée]|company)/i,
    adresse: /(adresse|address|rue|street|avenue|bd|boulevard|route)/i,
    telephone: /(t[ée]l[ée]?|phone|tel|mobile|portable)/i,
    email: /(email|courriel|mail|e-mail)/i,
    date: /(date|le|[0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/i,
    numero: /(n[°o]|num[ée]?ro|ref|reference|[a-z]{2,3}[\-]?[0-9]{4,})/i,
    prix: /(prix|price|montant|amount|total|[0-9]+[,.]?[0-9]*\s?€|[0-9]+[,.]?[0-9]*)/i,
    prestation: /(prestation|service|main[\s-]?d[']?[oe]uvre|intervention|travail|work)/i,
    fourniture: /(fourniture|mat[ée]riel|material|produit|product|achat)/i,
    quantite: /(qt[ée]?|quantit[ée]|nombre|number|unité|unit)/i
  },
  
  // Mots-clés pour identifier les types d'items
  itemTypeKeywords: {
    service: ['prestation', 'service', 'main d\'œuvre', 'main d oeuvre', 'main dœuvre', 'intervention', 'travail', 'heures?', 'h\.?', 'pose', 'installation', 'réparation', 'dépannage', 'maintenance', 'devis', 'diagnostic'],
    supply: ['fourniture', 'matériel', 'material', 'produit', 'tuyau', 'robinet', 'chaudière', 'radiateur', 'pompe', 'vanne', 'pipe', 'tube', 'cable', 'fil', 'vis', 'boulon', 'joint', 'colle', 'peinture']
  }
};

// ============================================================================
// ÉTAT GLOBAL
// ============================================================================

let ImportState = {
  files: [],           // Liste des fichiers importés
  currentFile: null,   // Fichier en cours de traitement
  extractedData: {},    // Données extraites par fichier
  selectedItems: {},    // Items sélectionnés pour le transfert
  pendingRequests: [],  // Requêtes API en attente
  isProcessing: false   // Indicateur de traitement en cours
};

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Génère un ID unique
 */
function importId() {
  return 'imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Nettoie et normalise une chaîne de caractères
 */
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Supprime les accents
    .replace(/[^a-z0-9\s\-]/g, '')    // Garde seulement alphanumérique, espaces et tirets
    .replace(/\s+/g, ' ')             // Remplace les espaces multiples
    .trim();
}

/**
 * Extrait un numéro de document d'une chaîne
 */
function extractDocumentNumber(text) {
  if (!text) return null;
  
  // Patterns pour les numéros de devis/facture
  const patterns = [
    /(DEV|FAC|DEVIS|FACTURE)[\s\-]?([A-Z0-9\-]+)/i,  // DEV-2024-001, FAC2024001
    /(n[°o]|num[ée]?ro)[\s\-]?([A-Z0-9\-]+)/i,       // N° DEV-001, Numéro FAC-2024-001
    /([A-Z]{2,4})[\-](\d{4})[\-](\d{3,5})/i,          // DEV-2024-001
    /(\d{4})[\-](\d{3,5})/                          // 2024-001
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match.slice(1).join('').toUpperCase();
    }
  }
  
  return null;
}

/**
 * Extrait une date d'une chaîne
 */
function extractDate(text) {
  if (!text) return null;
  
  // Patterns pour les dates
  const patterns = [
    /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,    // JJ/MM/AAAA ou JJ-MM-AAAA
    /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/,    // AAAA/MM/JJ ou AAAA-MM-JJ
    /(\d{2})\s(january|february|march|april|may|june|july|august|september|october|november|december|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)[\s,](\d{4})/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Reformat to YYYY-MM-DD
      if (match[0].match(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/)) {
        return match[3] + '-' + match[2] + '-' + match[1];
      } else if (match[0].match(/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/)) {
        return match[1] + '-' + match[2] + '-' + match[3];
      }
      return match[0];
    }
  }
  
  return null;
}

/**
 * Extrait un montant monétaire d'une chaîne
 */
function extractAmount(text) {
  if (!text) return null;
  
  // Patterns pour les montants
  const patterns = [
    /([\d\s]+[,.]?[\d\s]*)\s?€/i,       // 100,50 € ou 100.50€ ou 1 000,50 €
    /([\d\s]+[,.]?[\d\s]*)\s?(euro|euros)/i,
    /([\d\s]+[,.]?[\d\s]*)/             // Simple nombre
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let amount = match[1];
      // Nettoyer le montant
      amount = amount
        .replace(/\s/g, '')       // Supprimer les espaces
        .replace(/,/g, '.')       // Remplacer les virgules par des points
        .replace(/[^\d.]/g, '');  // Supprimer tout sauf chiffres et points
      
      const value = parseFloat(amount);
      if (!isNaN(value)) {
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Extrait un email d'une chaîne
 */
function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

/**
 * Extrait un téléphone d'une chaîne
 */
function extractPhone(text) {
  if (!text) return null;
  const match = text.match(/(\+?\d[\d\s\-\.]*){8,15}/);
  return match ? match[0].replace(/[^\d\+]/g, '') : null;
}

/**
 * Formate la taille d'un fichier
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================================
// EXTRACTION DES DONNÉES
// ============================================================================

/**
 * Extrait les données d'un document
 */
async function extractDocumentData(file, content) {
  const fileId = importId();
  const fileInfo = {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type || getFileType(file.name),
    lastModified: file.lastModified,
    content: content,
    status: 'processing',
    extracted: {
      documentType: null,       // 'devis' ou 'facture'
      documentNumber: null,     // Numéro du document
      date: null,               // Date du document
      client: null,             // Informations client
      addresses: [],             // Liste des adresses
      selectedBillingAddress: 0,// Index de l'adresse de facturation sélectionnée
      items: [],                // Liste des prestations/fournitures
      total: 0,                 // Total du document
      tax: 0,                   // TVA ou taxes
      currency: '€',            // Devise
      notes: '',                // Notes/remarques
      source: file.name         // Source du document
    },
    createdAt: new Date().toISOString()
  };
  
  try {
    // Déterminer le type de document
    fileInfo.extracted.documentType = determineDocumentType(file.name, content);
    
    // Extraire le numéro de document
    fileInfo.extracted.documentNumber = extractDocumentNumber(file.name) || 
                                          extractDocumentNumber(content);
    
    // Extraire la date
    fileInfo.extracted.date = extractDate(file.name) || 
                               extractDate(content) || 
                               td();
    
    // Extraire les informations client
    fileInfo.extracted.client = await extractClientInfo(file.name, content);
    
    // Extraire les adresses
    fileInfo.extracted.addresses = await extractAddresses(content);
    
    // Extraire les items (prestations et fournitures)
    fileInfo.extracted.items = await extractItems(content, fileInfo.extracted.documentType);
    
    // Calculer le total
    fileInfo.extracted.total = fileInfo.extracted.items.reduce(
      (sum, item) => sum + (item.total || 0), 0
    );
    
    // Extraire la TVA si possible
    fileInfo.extracted.tax = await extractTax(content);
    
    // Extraire les notes
    fileInfo.extracted.notes = await extractNotes(content);
    
    fileInfo.status = 'completed';
    
  } catch (error) {
    console.error('Erreur lors de l\'extraction:', error);
    fileInfo.status = 'error';
    fileInfo.error = error.message;
  }
  
  ImportState.extractedData[fileId] = fileInfo;
  return fileInfo;
}

/**
 * Détermine le type de document (devis ou facture)
 */
function determineDocumentType(name, content) {
  const nameLower = name.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Vérifier dans le nom de fichier
  if (IMPORT_CONFIG.patterns.facture.test(nameLower)) {
    return 'facture';
  }
  if (IMPORT_CONFIG.patterns.devis.test(nameLower)) {
    return 'devis';
  }
  
  // Vérifier dans le contenu
  if (contentLower && IMPORT_CONFIG.patterns.facture.test(contentLower)) {
    return 'facture';
  }
  if (contentLower && IMPORT_CONFIG.patterns.devis.test(contentLower)) {
    return 'devis';
  }
  
  // Par défaut, on suppose que c'est un devis
  return 'devis';
}

/**
 * Extrait les informations client
 */
async function extractClientInfo(name, content) {
  const client = {
    name: null,
    company: null,
    siret: null,
    tva: null,
    email: null,
    phone: null,
    isNew: true
  };
  
  // Extraire depuis le nom de fichier
  const nameMatches = name.match(/([a-z0-9\s\-_.]+)/i);
  if (nameMatches) {
    const potentialName = nameMatches[1].replace(/[\-_]/g, ' ').trim();
    if (potentialName && !IMPORT_CONFIG.patterns.devis.test(potentialName) && 
        !IMPORT_CONFIG.patterns.facture.test(potentialName)) {
      client.name = potentialName;
    }
  }
  
  // Extraire depuis le contenu
  if (content) {
    const contentLower = content.toLowerCase();
    
    // Rechercher le nom du client
    const clientPatterns = [
      /(client|nom|soci[ée]t[ée]|raison[\s-]?sociale|intitul[ée])[\s:]*([a-z0-9\s\-.,]+)/i,
      /(à|pour|factur[ée]?|devis[\s-]?à)[\s:]*([a-z0-9\s\-.,]+)/i
    ];
    
    for (const pattern of clientPatterns) {
      const match = content.match(pattern);
      if (match && match[2]) {
        client.name = match[2].replace(/[\s]+/g, ' ').trim();
        break;
      }
    }
    
    // Extraire l'email
    client.email = extractEmail(content);
    
    // Extraire le téléphone
    client.phone = extractPhone(content);
    
    // Extraire le SIRET
    const siretMatch = content.match(/siret[\s:]*([a-z0-9\s\-]+)/i);
    if (siretMatch) {
      client.siret = siretMatch[1].replace(/[^\d]/g, '');
    }
    
    // Extraire le numéro de TVA
    const tvaMatch = content.match(/(tva|n[°o]\s*tva|vat)[\s:]*([a-z0-9\s\-]+)/i);
    if (tvaMatch) {
      client.tva = tvaMatch[1].replace(/[^a-z0-9]/gi, '');
    }
  }
  
  // Nettoyer le nom
  if (client.name) {
    client.name = client.name
      .replace(/[\s]+/g, ' ')
      .trim();
  }
  
  return client;
}

/**
 * Extrait les adresses du document
 */
async function extractAddresses(content) {
  const addresses = [];
  
  if (!content) return addresses;
  
  // Patterns pour les adresses
  const addressPatterns = [
    // Adresse avec rue, code postal, ville
    /(\d{1,5}\s+[a-z0-9\s\-.,]+)[\s,]+(\d{5})[\s,]+([a-z0-9\s\-.,]+)/i,
    // Adresse simple
    /(\d{1,5}\s+[a-z0-9\s\-.,]+)/i,
    // Code postal + ville
    /(\d{5})[\s,]+([a-z0-9\s\-.,]+)/i
  ];
  
  // Rechercher les mots-clés pour identifier les adresses
  const addressKeywords = ['adresse', 'address', 'rue', 'street', 'avenue', 'bd', 'boulevard', 'route', 'lieu', 'chantier'];
  
  const lines = content.split(/[\r\n]+/);
  let currentAddress = null;
  
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    // Vérifier si la ligne contient un mot-clé d'adresse
    const hasAddressKeyword = addressKeywords.some(keyword => 
      lineLower.includes(keyword)
    );
    
    if (hasAddressKeyword) {
      // Si on a déjà une adresse en cours, la sauvegarder
      if (currentAddress) {
        addresses.push(currentAddress);
      }
      
      // Commencer une nouvelle adresse
      currentAddress = {
        type: 'unknown',
        lines: [line]
      };
      
      // Déterminer le type d'adresse
      if (lineLower.includes('facturation') || lineLower.includes('billing')) {
        currentAddress.type = 'facturation';
      } else if (lineLower.includes('chantier') || lineLower.includes('site') || lineLower.includes('livraison')) {
        currentAddress.type = 'chantier';
      } else if (lineLower.includes('siège') || lineLower.includes('social')) {
        currentAddress.type = 'siege';
      }
    } else if (currentAddress) {
      // Ajouter la ligne à l'adresse en cours
      currentAddress.lines.push(line);
    }
  }
  
  // Ajouter la dernière adresse si elle existe
  if (currentAddress) {
    addresses.push(currentAddress);
  }
  
  // Parser les adresses
  const parsedAddresses = [];
  
  for (const addr of addresses) {
    if (addr.lines.length === 0) continue;
    
    const addressText = addr.lines.join(' ');
    
    // Extraire les composants de l'adresse
    let street = '';
    let postalCode = '';
    let city = '';
    let country = '';
    
    // Pattern pour extraire le code postal et la ville
    const pcCityMatch = addressText.match(/(\d{5})[\s,]+([a-z0-9\s\-.,]+)/i);
    if (pcCityMatch) {
      postalCode = pcCityMatch[1];
      city = pcCityMatch[2].replace(/[\s]+/g, ' ').trim();
    }
    
    // Le reste est la rue
    const streetMatch = addressText.match(/(.+?)(?:\d{5}|$)/i);
    if (streetMatch) {
      street = streetMatch[1]
        .replace(/[\s]+/g, ' ')
        .replace(/[^a-z0-9\s\-.,#]/gi, '')
        .trim();
    }
    
    // Vérifier si on a au moins une partie de l'adresse
    if (street || postalCode || city) {
      parsedAddresses.push({
        type: addr.type || 'unknown',
        street: street,
        postalCode: postalCode,
        city: city,
        country: country,
        fullAddress: addressText.replace(/[\s]+/g, ' ').trim()
      });
    }
  }
  
  // Si aucune adresse n'a été trouvée, essayer une approche plus simple
  if (parsedAddresses.length === 0) {
    const simpleMatch = content.match(/(\d{1,5}\s+[a-z0-9\s\-.,]+)[\s,]+(\d{5})[\s,]+([a-z\s\-.,]+)/i);
    if (simpleMatch) {
      parsedAddresses.push({
        type: 'facturation',
        street: simpleMatch[1].replace(/[\s]+/g, ' ').trim(),
        postalCode: simpleMatch[2],
        city: simpleMatch[3].replace(/[\s]+/g, ' ').trim(),
        fullAddress: simpleMatch[0].replace(/[\s]+/g, ' ').trim()
      });
    }
  }
  
  // Déterminer l'adresse de facturation par défaut
  const billingIndex = parsedAddresses.findIndex(addr => 
    addr.type === 'facturation' || addr.type === 'siege'
  );
  
  if (billingIndex !== -1) {
    // Mettre l'adresse de facturation en premier
    const billingAddress = parsedAddresses.splice(billingIndex, 1)[0];
    parsedAddresses.unshift(billingAddress);
  }
  
  return parsedAddresses;
}

/**
 * Extrait les items (prestations et fournitures)
 */
async function extractItems(content, docType) {
  const items = [];
  
  if (!content) return items;
  
  const lines = content.split(/[\r\n]+/);
  let currentItem = null;
  let inTable = false;
  let tableHeaders = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    
    // Détecter le début d'un tableau
    if (!inTable && (lineLower.includes('désignation') || lineLower.includes('description') || 
                     lineLower.includes('article') || lineLower.includes('prestation') ||
                     lineLower.includes('fourniture'))) {
      inTable = true;
      
      // Extraire les en-têtes du tableau
      const headers = line.split(/[\t\s]{2,}/);
      tableHeaders = headers.map(h => normalizeText(h));
      continue;
    }
    
    // Détecter la fin du tableau
    if (inTable && (line.trim() === '' || lineLower.includes('total') || 
                    lineLower.includes('sous-total') || lineLower.includes('montant total'))) {
      inTable = false;
      tableHeaders = [];
      
      // Si on a un item en cours, l'ajouter
      if (currentItem) {
        items.push(currentItem);
        currentItem = null;
      }
      continue;
    }
    
    if (inTable) {
      // Si on n'a pas encore d'item ou que la ligne semble être une nouvelle ligne
      if (!currentItem || line.trim() === '') {
        // Si on a un item en cours, l'ajouter
        if (currentItem) {
          items.push(currentItem);
        }
        currentItem = null;
        continue;
      }
      
      // Créer un nouvel item si nécessaire
      if (!currentItem) {
        currentItem = {
          type: 'unknown',
          name: '',
          description: '',
          quantity: 1,
          unit: '',
          unitPrice: 0,
          total: 0,
          category: ''
        };
      }
      
      // Parser la ligne du tableau
      const values = line.split(/[\t\s]{2,}/);
      
      // Trouver les colonnes
      for (let j = 0; j < values.length && j < tableHeaders.length; j++) {
        const header = tableHeaders[j];
        const value = values[j].trim();
        
        if (!value) continue;
        
        // Déterminer le type de colonne
        if (header.includes('designation') || header.includes('description') || 
            header.includes('article') || header.includes('prestation') || header.includes('fourniture')) {
          currentItem.name = value;
          
          // Déterminer le type d'item
          const nameLower = value.toLowerCase();
          if (IMPORT_CONFIG.itemTypeKeywords.service.some(kw => nameLower.includes(kw))) {
            currentItem.type = 'service';
          } else if (IMPORT_CONFIG.itemTypeKeywords.supply.some(kw => nameLower.includes(kw))) {
            currentItem.type = 'supply';
          }
        } else if (header.includes('quantite') || header.includes('qty') || header.includes('nombre')) {
          const qty = parseFloat(value.replace(/[^\d.]/g, ''));
          if (!isNaN(qty)) {
            currentItem.quantity = qty;
          }
        } else if (header.includes('prix') || header.includes('price') || header.includes('unit') || 
                   header.includes('pu') || header.includes('prix unitaire')) {
          const price = extractAmount(value);
          if (price !== null) {
            currentItem.unitPrice = price;
          }
        } else if (header.includes('montant') || header.includes('total') || header.includes('amount')) {
          const total = extractAmount(value);
          if (total !== null) {
            currentItem.total = total;
            // Si on a le prix unitaire et la quantité, mais pas le total, le calculer
            if (currentItem.unitPrice === 0 && currentItem.quantity > 1) {
              currentItem.unitPrice = total / currentItem.quantity;
            }
          }
        } else if (header.includes('unité') || header.includes('unit')) {
          currentItem.unit = value;
        }
      }
    } else {
      // Recherche hors tableau
      
      // Détecter une nouvelle prestation/fourniture
      const itemPatterns = [
        // Ligne avec prix
        /([a-z0-9\s\-.,]+)\s+([\d\s]+[,.]?[\d\s]*)\s?€/i,
        // Ligne avec quantité et prix
        /([\d\s]+[,.]?[\d\s]*)\sx\s([a-z0-9\s\-.,]+)\s+([\d\s]+[,.]?[\d\s]*)\s?€/i
      ];
      
      for (const pattern of itemPatterns) {
        const match = line.match(pattern);
        if (match) {
          const item = {
            type: 'unknown',
            name: '',
            quantity: 1,
            unitPrice: 0,
            total: 0
          };
          
          // Déterminer le type
          const lineLower = line.toLowerCase();
          if (IMPORT_CONFIG.itemTypeKeywords.service.some(kw => lineLower.includes(kw))) {
            item.type = 'service';
          } else if (IMPORT_CONFIG.itemTypeKeywords.supply.some(kw => lineLower.includes(kw))) {
            item.type = 'supply';
          }
          
          // Extraire les valeurs
          if (pattern.toString().includes('x')) {
            // Format: quantité x description prix
            item.quantity = parseFloat(match[1].replace(/[^\d.]/g, '')) || 1;
            item.name = match[2].trim();
            item.unitPrice = extractAmount(match[3]) || 0;
            item.total = item.quantity * item.unitPrice;
          } else {
            // Format: description prix
            item.name = match[1].trim();
            item.unitPrice = extractAmount(match[2]) || 0;
            item.total = item.unitPrice;
          }
          
          items.push(item);
          break;
        }
      }
    }
  }
  
  // Ajouter le dernier item si nécessaire
  if (currentItem && (currentItem.name || currentItem.total > 0)) {
    items.push(currentItem);
  }
  
  // Nettoyer les items
  const cleanedItems = [];
  for (const item of items) {
    // Vérifier qu'on a au moins un nom ou un prix
    if (item.name || item.total > 0) {
      // Si on n'a pas de type, essayer de le déterminer
      if (item.type === 'unknown') {
        const nameLower = item.name.toLowerCase();
        if (IMPORT_CONFIG.itemTypeKeywords.service.some(kw => nameLower.includes(kw))) {
          item.type = 'service';
        } else if (IMPORT_CONFIG.itemTypeKeywords.supply.some(kw => nameLower.includes(kw))) {
          item.type = 'supply';
        } else {
          // Par défaut, on met service
          item.type = 'service';
        }
      }
      
      // Calculer le total si nécessaire
      if (item.unitPrice > 0 && item.quantity > 0 && item.total === 0) {
        item.total = item.quantity * item.unitPrice;
      }
      
      // Calculer le prix unitaire si nécessaire
      if (item.total > 0 && item.quantity > 0 && item.unitPrice === 0) {
        item.unitPrice = item.total / item.quantity;
      }
      
      cleanedItems.push(item);
    }
  }
  
  return cleanedItems;
}

/**
 * Extrait la TVA/taxes
 */
async function extractTax(content) {
  if (!content) return 0;
  
  // Rechercher les mentions de TVA
  const tvaPatterns = [
    /tva[\s:]*([\d.,]+)\s?%/i,
    /tv[ae][\s:]*([\d.,]+)\s?%/i,
    /([\d.,]+)\s?%\s*tva/i,
    /([\d.,]+)\s?%\s*tv[ae]/i
  ];
  
  for (const pattern of tvaPatterns) {
    const match = content.match(pattern);
    if (match) {
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          const rate = parseFloat(match[i].replace(',', '.'));
          if (!isNaN(rate)) {
            return rate;
          }
        }
      }
    }
  }
  
  // Valeur par défaut (20% en France)
  return 20;
}

/**
 * Extrait les notes/remarques
 */
async function extractNotes(content) {
  if (!content) return '';
  
  const notes = [];
  const lines = content.split(/[\r\n]+/);
  
  // Mots-clés pour identifier les notes
  const noteKeywords = ['remarque', 'note', 'commentaire', 'observation', 'info', 'information'];
  
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    if (noteKeywords.some(keyword => lineLower.includes(keyword))) {
      // Prendre la ligne et les suivantes jusqu'à une ligne vide ou un titre
      let noteLine = line;
      let nextIndex = lines.indexOf(line) + 1;
      
      while (nextIndex < lines.length && lines[nextIndex].trim() !== '') {
        const nextLineLower = lines[nextIndex].toLowerCase();
        
        // Arrêter si on trouve un titre ou une section
        if (nextLineLower.match(/^[a-z0-9\s\-]+:\s*$/i) ||
            nextLineLower.includes('total') ||
            nextLineLower.includes('sous-total') ||
            nextLineLower.includes('montant')) {
          break;
        }
        
        noteLine += '\n' + lines[nextIndex];
        nextIndex++;
      }
      
      notes.push(noteLine);
    }
  }
  
  return notes.join('\n\n');
}

/**
 * Détermine le type de fichier à partir du nom
 */
function getFileType(filename) {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'unknown';
  }
}

// ============================================================================
// GESTION DES CLIENTS
// ============================================================================

/**
 * Vérifie si un client existe dans la base de données
 */
function findClient(clientName, clients) {
  if (!clientName) return null;
  
  const normalizedName = normalizeText(clientName);
  
  // Recherche exacte
  const exactMatch = clients.find(c => 
    c.n && normalizeText(c.n) === normalizedName
  );
  
  if (exactMatch) return exactMatch;
  
  // Recherche partielle
  const partialMatch = clients.find(c => 
    c.n && normalizeText(c.n).includes(normalizedName) ||
         normalizedName.includes(normalizeText(c.n))
  );
  
  return partialMatch || null;
}

/**
 * Crée un nouveau client
 */
function createClient(clientInfo, clients) {
  const newClient = {
    id: 'cli_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    n: clientInfo.name || 'Client inconnu',
    a: clientInfo.address || '',
    c: clientInfo.city || '',
    t: clientInfo.phone || '',
    e: clientInfo.email || '',
    siret: clientInfo.siret || '',
    tva: clientInfo.tva || '',
    addresses: clientInfo.addresses || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  clients.push(newClient);
  return newClient;
}

/**
 * Met à jour un client existant
 */
function updateClient(clientId, updates, clients) {
  const clientIndex = clients.findIndex(c => c.id === clientId);
  
  if (clientIndex !== -1) {
    const updatedClient = {
      ...clients[clientIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    clients[clientIndex] = updatedClient;
    return updatedClient;
  }
  
  return null;
}

/**
 * Ajoute une adresse à un client
 */
function addAddressToClient(clientId, address, clients) {
  const client = clients.find(c => c.id === clientId);
  
  if (client) {
    // Vérifier si l'adresse existe déjà
    const addressExists = client.addresses.some(addr => 
      addr.street === address.street &&
      addr.postalCode === address.postalCode &&
      addr.city === address.city
    );
    
    if (!addressExists) {
      if (!client.addresses) {
        client.addresses = [];
      }
      
      client.addresses.push({
        ...address,
        id: 'addr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: address.type || 'unknown',
        isDefault: client.addresses.length === 0
      });
      
      client.updatedAt = new Date().toISOString();
      return client;
    }
  }
  
  return client;
}

// ============================================================================
// GESTION DES ITEMS (PRESTATIONS/FOURNITURES)
// ============================================================================

/**
 * Vérifie si un item existe dans la base de données
 */
function findItem(itemName, items) {
  if (!itemName) return null;
  
  const normalizedName = normalizeText(itemName);
  
  return items.find(i => 
    i.d && normalizeText(i.d) === normalizedName
  );
}

/**
 * Crée un nouvel item
 */
function createItem(itemInfo, items) {
  const newItem = {
    d: itemInfo.name || 'Item inconnu',
    t: itemInfo.type || 'service',
    p: itemInfo.unitPrice || 0,
    u: itemInfo.unit || '',
    cat: itemInfo.category || '',
    desc: itemInfo.description || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  items.push(newItem);
  return newItem;
}

/**
 * Met à jour un item existant
 */
function updateItem(itemId, updates, items) {
  const itemIndex = items.findIndex(i => i.id === itemId);
  
  if (itemIndex !== -1) {
    const updatedItem = {
      ...items[itemIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    items[itemIndex] = updatedItem;
    return updatedItem;
  }
  
  return null;
}

// ============================================================================
// TRANSFERT DES DONNÉES
// ============================================================================

/**
 * Transfère les données extraites vers la base de données
 */
async function transferExtractedData(fileId, options, globalState) {
  const fileData = ImportState.extractedData[fileId];
  if (!fileData) {
    throw new Error('Fichier non trouvé');
  }
  
  const {
    transferClient = true,
    transferClientAddress = true,
    transferAllItems = true,
    transferServices = false,
    transferSupplies = false,
    transferWithPrices = true,
    transferDocNumbers = true
  } = options || {};
  
  const results = {
    client: null,
    addresses: [],
    items: [],
    document: null,
    warnings: []
  };
  
  // Transférer le client
  if (transferClient && fileData.extracted.client) {
    const clientInfo = fileData.extracted.client;
    
    // Vérifier si le client existe
    let client = findClient(clientInfo.name, globalState.clients);
    
    if (!client) {
      // Créer un nouveau client
      client = createClient({
        name: clientInfo.name,
        address: clientInfo.address || '',
        city: clientInfo.city || '',
        phone: clientInfo.phone || '',
        email: clientInfo.email || '',
        siret: clientInfo.siret || '',
        tva: clientInfo.tva || '',
        addresses: transferClientAddress ? fileData.extracted.addresses : []
      }, globalState.clients);
      
      results.client = client;
      results.warnings.push(`Nouveau client créé: ${clientInfo.name}`);
    } else {
      // Mettre à jour le client existant
      const updates = {};
      
      if (clientInfo.phone && !client.t) {
        updates.t = clientInfo.phone;
      }
      if (clientInfo.email && !client.e) {
        updates.e = clientInfo.email;
      }
      if (clientInfo.siret && !client.siret) {
        updates.siret = clientInfo.siret;
      }
      if (clientInfo.tva && !client.tva) {
        updates.tva = clientInfo.tva;
      }
      
      if (Object.keys(updates).length > 0) {
        updateClient(client.id, updates, globalState.clients);
        results.warnings.push(`Client mis à jour: ${clientInfo.name}`);
      }
      
      results.client = client;
    }
    
    // Transférer les adresses
    if (transferClientAddress && fileData.extracted.addresses && fileData.extracted.addresses.length > 0) {
      for (const address of fileData.extracted.addresses) {
        const updatedClient = addAddressToClient(client.id, address, globalState.clients);
        if (updatedClient) {
          results.addresses.push(address);
        }
      }
    }
  }
  
  // Transférer les items
  if ((transferAllItems || transferServices || transferSupplies) && 
      fileData.extracted.items && fileData.extracted.items.length > 0) {
    
    for (const item of fileData.extracted.items) {
      // Vérifier le type
      const isService = item.type === 'service';
      const isSupply = item.type === 'supply';
      
      // Vérifier si on doit transférer cet item
      let shouldTransfer = transferAllItems;
      if (!shouldTransfer) {
        shouldTransfer = (isService && transferServices) || (isSupply && transferSupplies);
      }
      
      if (!shouldTransfer) continue;
      
      // Vérifier si l'item existe
      let existingItem = findItem(item.name, globalState.cat);
      
      if (existingItem) {
        results.warnings.push(`Item existant: ${item.name}`);
        continue;
      }
      
      // Créer un nouvel item
      const newItem = createItem({
        name: item.name,
        type: item.type,
        unitPrice: transferWithPrices ? item.unitPrice : 0,
        unit: item.unit,
        description: item.description,
        category: item.category
      }, globalState.cat);
      
      results.items.push(newItem);
    }
  }
  
  // Créer un nouveau document si nécessaire
  if (transferDocNumbers && fileData.extracted.documentNumber) {
    const docType = fileData.extracted.documentType === 'facture' ? 'f' : 'd';
    const year = new Date().getFullYear();
    const docKey = docType + year;
    const seqNumber = (globalState.seq[docKey] || 0) + 1;
    
    const newDoc = {
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      t: docType,
      num: fileData.extracted.documentNumber || 
           (docType === 'd' ? `DEV-${year}-${String(seqNumber).padStart(3, '0')}` : 
                            `FAC-${year}-${String(seqNumber).padStart(3, '0')}`),
      date: fileData.extracted.date || td(),
      val: globalState.cfg.val || 30,
      cn: results.client ? results.client.n : '',
      ca: results.client ? results.client.a : '',
      cc: results.client ? results.client.c : '',
      ct: results.client ? results.client.t : '',
      ce: results.client ? results.client.e : '',
      cid: results.client ? results.client.id : '',
      sn: '',
      sa: '',
      sc: '',
      o: `Importé depuis: ${fileData.name}`,
      F: [],
      M: [],
      acc: globalState.cfg.acc || 40,
      ap: false,
      paid: false,
      pd: '',
      cost: '',
      st: 'att',
      tva: fileData.extracted.tax || (globalState.cfg.tva ? n(globalState.cfg.tvr) : 0),
      rm: ''
    };
    
    // Ajouter les items au document
    if (fileData.extracted.items) {
      for (const item of fileData.extracted.items) {
        const targetArray = item.type === 'service' ? newDoc.M : newDoc.F;
        targetArray.push({
          d: item.name,
          q: item.quantity,
          p: item.unitPrice
        });
      }
    }
    
    // Ajouter le document à la liste
    globalState.docs.unshift(newDoc);
    globalState.seq[docKey] = seqNumber;
    
    results.document = newDoc;
  }
  
  return results;
}

// ============================================================================
// API D'IMPORTATION
// ============================================================================

/**
 * API pour l'importation de documents
 */
const ImportAPI = {
  /**
   * Initialise le système d'importation
   */
  init(globalState) {
    ImportState = {
      files: [],
      currentFile: null,
      extractedData: {},
      selectedItems: {},
      pendingRequests: [],
      isProcessing: false
    };
    
    // Charger les données existantes
    if (globalState) {
      this.globalState = globalState;
    }
  },
  
  /**
   * Importe un ou plusieurs fichiers
   */
  async importFiles(files) {
    if (!files || files.length === 0) {
      throw new Error('Aucun fichier à importer');
    }
    
    // Vérifier la taille des fichiers
    for (const file of files) {
      if (file.size > IMPORT_CONFIG.maxFileSize * 1024 * 1024) {
        throw new Error(`Fichier trop volumineux: ${file.name} (max ${IMPORT_CONFIG.maxFileSize} Mo)`);
      }
    }
    
    ImportState.isProcessing = true;
    ImportState.files = Array.from(files);
    
    const results = [];
    
    for (const file of files) {
      try {
        // Lire le contenu du fichier
        const content = await this.readFile(file);
        
        // Extraire les données
        const extracted = await extractDocumentData(file, content);
        
        results.push({
          success: true,
          file: file.name,
          data: extracted
        });
      } catch (error) {
        results.push({
          success: false,
          file: file.name,
          error: error.message
        });
      }
    }
    
    ImportState.isProcessing = false;
    return results;
  },
  
  /**
   * Lit le contenu d'un fichier
   */
  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (e) => {
        reject(new Error(`Erreur de lecture du fichier: ${file.name}`));
      };
      
      // Lire selon le type de fichier
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  },
  
  /**
   * Traite un fichier spécifique
   */
  async processFile(fileId, options) {
    if (!ImportState.extractedData[fileId]) {
      throw new Error('Fichier non trouvé');
    }
    
    const results = await transferExtractedData(fileId, options, this.globalState);
    
    // Nettoyer
    delete ImportState.extractedData[fileId];
    ImportState.files = ImportState.files.filter(f => f.id !== fileId);
    
    return results;
  },
  
  /**
   * Transfère toutes les données extraites
   */
  async transferAll(options) {
    const fileIds = Object.keys(ImportState.extractedData);
    const results = [];
    
    for (const fileId of fileIds) {
      try {
        const result = await this.processFile(fileId, options);
        results.push({
          success: true,
          fileId,
          result
        });
      } catch (error) {
        results.push({
          success: false,
          fileId,
          error: error.message
        });
      }
    }
    
    return results;
  },
  
  /**
   * Obtient les données extraites d'un fichier
   */
  getExtractedData(fileId) {
    return ImportState.extractedData[fileId] || null;
  },
  
  /**
   * Obtient la liste des fichiers importés
   */
  getImportedFiles() {
    return Object.values(ImportState.extractedData);
  },
  
  /**
   * Supprime un fichier importé
   */
  deleteFile(fileId) {
    if (ImportState.extractedData[fileId]) {
      delete ImportState.extractedData[fileId];
      ImportState.files = ImportState.files.filter(f => f.id !== fileId);
      return true;
    }
    return false;
  },
  
  /**
   * Recherche dans les items existants
   */
  searchItems(query, items) {
    if (!query || query.length < 2) return [];
    
    const normalizedQuery = normalizeText(query);
    
    return items.filter(item => 
      item.d && normalizeText(item.d).includes(normalizedQuery)
    );
  },
  
  /**
   * Vérifie si un client est déjà enregistré
   */
  isClientRegistered(clientName) {
    if (!this.globalState || !this.globalState.clients) return false;
    return findClient(clientName, this.globalState.clients) !== null;
  },
  
  /**
   * Vérifie si un item est déjà enregistré
   */
  isItemRegistered(itemName) {
    if (!this.globalState || !this.globalState.cat) return false;
    return findItem(itemName, this.globalState.cat) !== null;
  },
  
  /**
   * Obtient les statistiques d'importation
   */
  getStats() {
    return {
      totalFiles: ImportState.files.length,
      processedFiles: Object.keys(ImportState.extractedData).length,
      isProcessing: ImportState.isProcessing,
      pendingRequests: ImportState.pendingRequests.length
    };
  }
};

// ============================================================================
// CONNECTEURS API EXTERNES
// ============================================================================

/**
 * Connecteur pour l'extraction de texte depuis des PDF
 * (Utilise une API externe ou un service comme PDF.js)
 */
const PDFExtractor = {
  /**
   * Extrait le texte d'un PDF
   */
  async extractText(pdfData) {
    // Si on est dans un navigateur avec PDF.js disponible
    if (typeof pdfjsLib !== 'undefined') {
      try {
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        let text = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ');
        }
        
        return text;
      } catch (error) {
        console.error('Erreur PDF.js:', error);
        return null;
      }
    }
    
    // Sinon, retourner null (l'extraction se fera côté serveur)
    return null;
  }
};

/**
 * Connecteur pour l'extraction de texte depuis des images (OCR)
 */
const ImageExtractor = {
  /**
   * Extrait le texte d'une image (OCR)
   * Nécessite une API externe comme Tesseract.js ou un service cloud
   */
  async extractText(imageData) {
    // Si Tesseract.js est disponible
    if (typeof Tesseract !== 'undefined') {
      try {
        const { data: { text } } = await Tesseract.recognize(imageData, 'fra', {
          logger: m => console.log(m)
        });
        return text;
      } catch (error) {
        console.error('Erreur OCR:', error);
        return null;
      }
    }
    
    // Sinon, retourner null
    return null;
  }
};

/**
 * Connecteur pour l'API de traitement de documents
 */
const DocumentAPI = {
  /**
   * Envoie un document à une API externe pour extraction
   */
  async extractWithAPI(fileData, apiEndpoint) {
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('api_token') || ''}`
        },
        body: JSON.stringify({
          filename: fileData.name,
          mimeType: fileData.type,
          content: fileData.content
        })
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Erreur API:', error);
      return null;
    }
  }
};

// ============================================================================
// EXPORT
// ============================================================================

// Exporter les fonctions principales
window.ImportAPI = ImportAPI;
window.PDFExtractor = PDFExtractor;
window.ImageExtractor = ImageExtractor;
window.DocumentAPI = DocumentAPI;

// Exporter les utilitaires
window.normalizeText = normalizeText;
window.extractDocumentNumber = extractDocumentNumber;
window.extractDate = extractDate;
window.extractAmount = extractAmount;
window.extractEmail = extractEmail;
window.extractPhone = extractPhone;

// Exporter les fonctions de gestion des données
window.findClient = findClient;
window.createClient = createClient;
window.updateClient = updateClient;
window.addAddressToClient = addAddressToClient;
window.findItem = findItem;
window.createItem = createItem;
window.updateItem = updateItem;

// Exporter l'état
window.ImportState = ImportState;

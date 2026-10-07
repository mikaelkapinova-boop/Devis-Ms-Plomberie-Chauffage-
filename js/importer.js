/**
 * Ms Plomberie & Chauffage - Module d'importation intelligente de documents
 * 
 * Ce module fournit des fonctionnalités pour :
 * - Extraire des données de PDFs, images et documents Word
 * - Identifier les clients, adresses, prestations et fournitures
 * - Gérer l'importation par lots
 * - Transférer les données vers la base de données locale
 * 
 * Fonctionne sans IA, avec une approche basée sur des patterns et règles
 */
'use strict';

// ============================================================================
// Configuration
// ============================================================================

const ImportConfig = {
    // Types de fichiers supportés
    SUPPORTED_TYPES: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
                       'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    
    // Extensions de fichiers
    SUPPORTED_EXTENSIONS: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx'],
    
    // Taille maximale des fichiers (50 Mo)
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    
    // Nombre maximal de fichiers simultanés
    MAX_CONCURRENT_FILES: 10,
    
    // Délai avant timeout pour le traitement
    PROCESSING_TIMEOUT: 30000,
    
    // URL de l'API serveur
    API_BASE_URL: window.location.origin || 'http://127.0.0.1:8765',
};

// ============================================================================
// Types et structures de données
// ============================================================================

/**
 * Représente un fichier en cours de traitement
 */
class ImportFile {
    constructor(file, id = null) {
        this.id = id || `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.file = file;
        this.name = file.name;
        this.type = file.type;
        this.size = file.size;
        this.extension = this._getExtension();
        this.status = 'pending'; // 'pending', 'processing', 'completed', 'error'
        this.progress = 0;
        this.error = null;
        this.extractedData = null;
        this.processingStart = null;
        this.processingEnd = null;
    }
    
    _getExtension() {
        const parts = this.name.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }
    
    isSupported() {
        return ImportConfig.SUPPORTED_TYPES.includes(this.type) ||
               ImportConfig.SUPPORTED_EXTENSIONS.includes(this.extension);
    }
    
    isTooLarge() {
        return this.size > ImportConfig.MAX_FILE_SIZE;
    }
}

/**
 * Représente un client extrait
 */
class ExtractedClient {
    constructor() {
        this.id = null;
        this.name = '';
        this.company = '';
        this.siret = '';
        this.email = '';
        this.phone = '';
        this.addresses = [];
        this.isNew = false;
        this.existsInDB = false;
        this.matchingClientId = null;
    }
    
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            company: this.company,
            siret: this.siret,
            email: this.email,
            phone: this.phone,
            addresses: this.addresses.map(a => a.toJSON()),
            isNew: this.isNew,
            existsInDB: this.existsInDB,
            matchingClientId: this.matchingClientId,
        };
    }
}

/**
 * Représente une adresse extraite
 */
class ExtractedAddress {
    constructor() {
        this.street = '';
        this.postalCode = '';
        this.city = '';
        this.country = 'France';
        this.type = 'chantier'; // 'client', 'chantier', 'facturation', 'livraison'
        this.isBilling = false;
    }
    
    get fullAddress() {
        const parts = [];
        if (this.street) parts.push(this.street);
        if (this.postalCode && this.city) parts.push(`${this.postalCode} ${this.city}`);
        return parts.join(', ');
    }
    
    toJSON() {
        return {
            street: this.street,
            postalCode: this.postalCode,
            city: this.city,
            country: this.country,
            type: this.type,
            isBilling: this.isBilling,
        };
    }
}

/**
 * Représente un élément extrait (prestation ou fourniture)
 */
class ExtractedItem {
    constructor() {
        this.description = '';
        this.quantity = 1;
        this.unitPrice = 0;
        this.totalPrice = 0;
        this.type = 'F'; // 'F' pour fourniture, 'M' pour prestation
        this.unit = '';
        this.category = '';
        this.existsInDB = false;
        this.matchingItemId = null;
    }
    
    toJSON() {
        return {
            description: this.description,
            quantity: this.quantity,
            unitPrice: this.unitPrice,
            totalPrice: this.totalPrice,
            type: this.type,
            unit: this.unit,
            category: this.category,
            existsInDB: this.existsInDB,
            matchingItemId: this.matchingItemId,
        };
    }
}

/**
 * Résultat complet de l'extraction d'un document
 */
class ExtractionResult {
    constructor(fileId = null) {
        this.fileId = fileId;
        this.fileName = '';
        this.fileType = '';
        this.documentType = 'unknown'; // 'devis', 'facture', 'autre'
        this.documentNumber = '';
        this.date = '';
        this.totalAmount = 0;
        this.currency = '€';
        
        this.client = new ExtractedClient();
        this.billingAddress = null;
        
        this.prestations = [];
        this.fournitures = [];
        
        this.warnings = [];
        this.errors = [];
    }
    
    get allItems() {
        return [...this.prestations, ...this.fournitures];
    }
    
    get totalItems() {
        return this.prestations.length + this.fournitures.length;
    }
    
    toJSON() {
        return {
            fileId: this.fileId,
            fileName: this.fileName,
            fileType: this.fileType,
            documentType: this.documentType,
            documentNumber: this.documentNumber,
            date: this.date,
            totalAmount: this.totalAmount,
            currency: this.currency,
            client: this.client.toJSON(),
            billingAddress: this.billingAddress ? this.billingAddress.toJSON() : null,
            prestations: this.prestations.map(i => i.toJSON()),
            fournitures: this.fournitures.map(i => i.toJSON()),
            warnings: this.warnings,
            errors: this.errors,
        };
    }
}

/**
 * État global de l'importation
 */
class ImportState {
    constructor() {
        this.files = new Map(); // Map<fileId, ImportFile>
        this.results = new Map(); // Map<fileId, ExtractionResult>
        this.selectedFiles = new Set(); // Set<fileId>
        this.transferOptions = {
            clientInfo: true,
            prestations: true,
            fournitures: true,
            withPrices: true,
        };
        this.isProcessing = false;
        this.progress = 0;
        this.currentFileId = null;
    }
    
    addFile(file) {
        const importFile = new ImportFile(file);
        this.files.set(importFile.id, importFile);
        return importFile;
    }
    
    removeFile(fileId) {
        this.files.delete(fileId);
        this.results.delete(fileId);
        this.selectedFiles.delete(fileId);
    }
    
    getFile(fileId) {
        return this.files.get(fileId);
    }
    
    getResult(fileId) {
        return this.results.get(fileId);
    }
    
    getAllResults() {
        return Array.from(this.results.values());
    }
    
    getSelectedResults() {
        return Array.from(this.selectedFiles.values())
            .map(fileId => this.results.get(fileId))
            .filter(r => r !== undefined);
    }
    
    clear() {
        this.files.clear();
        this.results.clear();
        this.selectedFiles.clear();
        this.isProcessing = false;
        this.progress = 0;
        this.currentFileId = null;
    }
}

// ============================================================================
// Instance globale
// ============================================================================

const ImportAPI = {
    state: new ImportState(),
    
    // Initialisation
    init() {
        // Récupérer l'état depuis le localStorage si nécessaire
        this._loadState();
        
        // Configurer les écouteurs d'événements
        this._setupEventListeners();
    },
    
    _loadState() {
        try {
            const savedState = localStorage.getItem('import_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                // Reconstituer l'état
                // ... (implémentation si nécessaire)
            }
        } catch (e) {
            console.warn('Impossible de charger l\'état de l\'importation:', e);
        }
    },
    
    _setupEventListeners() {
        // Écouter les messages du serveur via WebSocket ou autre
        // ... (à implémenter selon les besoins)
    },
    
    // Gestion des fichiers
    addFiles(files) {
        const validFiles = [];
        const errors = [];
        
        for (const file of files) {
            const importFile = this.state.addFile(file);
            
            if (!importFile.isSupported()) {
                importFile.status = 'error';
                importFile.error = `Type de fichier non supporté: ${importFile.extension}`;
                errors.push({ file: importFile.name, error: importFile.error });
                continue;
            }
            
            if (importFile.isTooLarge()) {
                importFile.status = 'error';
                importFile.error = `Fichier trop volumineux (${this._formatFileSize(importFile.size)} > ${this._formatFileSize(ImportConfig.MAX_FILE_SIZE)})`;
                errors.push({ file: importFile.name, error: importFile.error });
                continue;
            }
            
            validFiles.push(importFile);
        }
        
        return { validFiles, errors };
    },
    
    removeFile(fileId) {
        this.state.removeFile(fileId);
    },
    
    removeAllFiles() {
        this.state.clear();
    },
    
    // Traitement des fichiers
    async processFile(fileId) {
        const importFile = this.state.getFile(fileId);
        if (!importFile) {
            throw new Error(`Fichier non trouvé: ${fileId}`);
        }
        
        importFile.status = 'processing';
        importFile.progress = 0;
        importFile.processingStart = Date.now();
        this.state.currentFileId = fileId;
        
        try {
            // Lire le contenu du fichier
            const content = await this._readFileContent(importFile.file);
            
            // Extraire les données
            const result = await this._extractDataFromContent(content, importFile.name, importFile.type);
            result.fileId = fileId;
            result.fileName = importFile.name;
            result.fileType = importFile.extension;
            
            // Vérifier les doublons
            await this._checkDuplicates(result);
            
            // Stocker le résultat
            this.state.results.set(fileId, result);
            importFile.status = 'completed';
            importFile.progress = 100;
            importFile.processingEnd = Date.now();
            
            return result;
        } catch (error) {
            importFile.status = 'error';
            importFile.error = error.message || String(error);
            throw error;
        } finally {
            this.state.currentFileId = null;
        }
    },
    
    async processAllFiles() {
        const filesToProcess = Array.from(this.state.files.values())
            .filter(f => f.status === 'pending');
        
        if (filesToProcess.length === 0) {
            return { success: true, processed: 0, results: [] };
        }
        
        this.state.isProcessing = true;
        this.state.progress = 0;
        
        const results = [];
        const errors = [];
        let processedCount = 0;
        
        // Traiter les fichiers en parallèle (avec limite)
        const batchSize = Math.min(filesToProcess.length, ImportConfig.MAX_CONCURRENT_FILES);
        const batches = this._chunkArray(filesToProcess, batchSize);
        
        for (const batch of batches) {
            const batchPromises = batch.map(async (importFile) => {
                try {
                    const result = await this.processFile(importFile.id);
                    results.push(result);
                    processedCount++;
                    this.state.progress = (processedCount / filesToProcess.length) * 100;
                    return result;
                } catch (error) {
                    errors.push({ file: importFile.name, error: error.message || String(error) });
                    processedCount++;
                    this.state.progress = (processedCount / filesToProcess.length) * 100;
                    return null;
                }
            });
            
            await Promise.all(batchPromises);
        }
        
        this.state.isProcessing = false;
        
        return {
            success: errors.length === 0,
            processed: processedCount,
            results,
            errors,
        };
    },
    
    // Transfert des données
    async transferData(options = {}) {
        const transferOptions = { ...this.state.transferOptions, ...options };
        const selectedResults = this.state.getSelectedResults();
        
        if (selectedResults.length === 0) {
            throw new Error('Aucun résultat sélectionné pour le transfert');
        }
        
        const transferred = {
            clients: [],
            prestations: [],
            fournitures: [],
            documents: [],
        };
        
        for (const result of selectedResults) {
            // Transférer les informations client
            if (transferOptions.clientInfo && result.client) {
                const clientId = await this._transferClient(result.client, transferOptions);
                if (clientId) {
                    transferred.clients.push({ name: result.client.name, id: clientId });
                    result.client.matchingClientId = clientId;
                }
            }
            
            // Transférer les prestations
            if (transferOptions.prestations) {
                for (const item of result.prestations) {
                    const itemId = await this._transferItem(item, 'M', transferOptions);
                    if (itemId) {
                        transferred.prestations.push({ description: item.description, id: itemId });
                        item.matchingItemId = itemId;
                    }
                }
            }
            
            // Transférer les fournitures
            if (transferOptions.fournitures) {
                for (const item of result.fournitures) {
                    const itemId = await this._transferItem(item, 'F', transferOptions);
                    if (itemId) {
                        transferred.fournitures.push({ description: item.description, id: itemId });
                        item.matchingItemId = itemId;
                    }
                }
            }
        }
        
        // Sauvegarder les modifications
        await this._saveTransferredData();
        
        return transferred;
    },
    
    // Utilitaires
    _formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
    },
    
    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },
    
    _readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error(`Erreur de lecture du fichier: ${file.name}`));
            
            if (file.type.startsWith('image/')) {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });
    },
    
    async _extractDataFromContent(content, fileName, fileType) {
        const result = new ExtractionResult();
        
        try {
            // Détecter le type de fichier
            if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
                await this._extractFromPDF(content, result);
            } else if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif'].includes(fileName.toLowerCase().split('.').pop())) {
                await this._extractFromImage(content, result);
            } else if (fileType.includes('word') || ['doc', 'docx'].includes(fileName.toLowerCase().split('.').pop())) {
                await this._extractFromWord(content, result);
            } else {
                await this._extractFromText(content, result);
            }
        } catch (error) {
            result.errors.push(`Erreur d'extraction: ${error.message || String(error)}`);
        }
        
        return result;
    },
    
    async _extractFromPDF(content, result) {
        // Extraction côté client limitée pour les PDF
        // Pour une extraction complète, utiliser l'API serveur
        
        // Essayer d'extraire le texte directement
        if (typeof content === 'string') {
            this._extractFromText(content, result);
        } else {
            // Si c'est un DataURL, essayer de le traiter
            result.errors.push('Extraction PDF côté client limitée. Utilisez l\'API serveur pour une extraction complète.');
        }
    },
    
    async _extractFromImage(content, result) {
        // L'OCR côté client nécessite Tesseract.js ou une API externe
        result.errors.push('OCR côté client non implémenté. Utilisez l\'API serveur pour l\'extraction OCR.');
    },
    
    async _extractFromWord(content, result) {
        // Extraction Word côté client limitée
        result.errors.push('Extraction Word côté client limitée. Utilisez l\'API serveur pour une extraction complète.');
    },
    
    async _extractFromText(content, result) {
        // Extraction basée sur le texte brut
        const text = typeof content === 'string' ? content : '';
        
        if (!text.trim()) {
            result.errors.push('Aucun texte trouvé dans le fichier');
            return;
        }
        
        result.rawText = text;
        
        // Détecter le type de document
        result.documentType = this._detectDocumentType(text);
        
        // Extraire le numéro de document
        result.documentNumber = this._extractDocumentNumber(text);
        
        // Extraire la date
        result.date = this._extractDate(text);
        
        // Extraire le client
        result.client = this._extractClient(text);
        
        // Extraire les adresses
        result.client.addresses = this._extractAddresses(text);
        
        // Déterminer l'adresse de facturation
        result.billingAddress = this._determineBillingAddress(result.client.addresses);
        
        // Extraire les lignes
        const { prestations, fournitures } = this._extractItems(text);
        result.prestations = prestations;
        result.fournitures = fournitures;
        
        // Calculer le total
        result.totalAmount = prestations.reduce((sum, item) => sum + item.totalPrice, 0) +
                             fournitures.reduce((sum, item) => sum + item.totalPrice, 0);
    },
    
    // Méthodes d'extraction
    _detectDocumentType(text) {
        const normalized = this._normalizeText(text);
        
        const devisPatterns = [
            /devis\s*(?:n°|num[éèe]ro?|ref[éèe]?r?ence)?\s*[:\-]?\s*/i,
            /dev\s*\-?\s*/i,
            /proposition\s*(?:commerciale|technique|de\s*prestations?)/i,
            /estimation/i,
            /chiffrage/i,
            /cotation/i,
        ];
        
        const facturePatterns = [
            /facture\s*(?:n°|num[éèe]ro?|ref[éèe]?r?ence)?\s*[:\-]?\s*/i,
            /fac\s*\-?\s*/i,
            /invoice/i,
            /bill/i,
        ];
        
        for (const pattern of devisPatterns) {
            if (pattern.test(normalized)) return 'devis';
        }
        
        for (const pattern of facturePatterns) {
            if (pattern.test(normalized)) return 'facture';
        }
        
        return 'autre';
    },
    
    _extractDocumentNumber(text) {
        const patterns = [
            /(?:DEV|FACT|FAC|DEVIS|FACTURE)[\-:\s]*(?:\d{4}[\-:\s]*)?([A-Z]{0,3}\d{1,6}[\-A-Z0-9]*)/i,
            /(?:N°|Num[éèe]ro?|Ref[éèe]?r?ence)[\-:\s]*([A-Z0-9\-\/]{3,20})/i,
            /\b(\d{4}[\-]?\d{3,6})\b/,
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        return '';
    },
    
    _extractDate(text) {
        const patterns = [
            /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
            /(\d{2}[\/\-]\d{2}[\/\-]\d{2})/,
            /(\d{4}[\/\-]\d{2}[\/\-]\d{2})/,
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                let dateStr = match[1];
                
                // Normaliser la date
                if (/\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(dateStr)) {
                    // Format AAAA-MM-JJ ou AAAA/MM/JJ
                    const parts = dateStr.replace(/\//g, '-').split('-');
                    if (parts.length === 3) {
                        return `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                } else if (/\d{2}[\/\-]\d{2}[\/\-]\d{2}/.test(dateStr)) {
                    // Format JJ/MM/AA
                    const parts = dateStr.replace(/\//g, '-').split('-');
                    return `${parts[0]}/${parts[1]}/20${parts[2]}`;
                }
                
                return dateStr;
            }
        }
        
        return '';
    },
    
    _extractClient(text) {
        const client = new ExtractedClient();
        
        // Patterns pour extraire le nom du client
        const clientPatterns = [
            /Client\s*[:\-]?\s*([^\n]{10,200})/i,
            /Nom\s*[:\-]?\s*([^\n]{10,200})/i,
            /Raison\s+sociale\s*[:\-]?\s*([^\n]{10,200})/i,
            /Soci[éèe]t[éèe]\s*[:\-]?\s*([^\n]{10,200})/i,
            /À\s+l\'?attention\s+de\s+([^\n]{10,200})/i,
        ];
        
        for (const pattern of clientPatterns) {
            const match = text.match(pattern);
            if (match) {
                client.name = match[1].trim();
                break;
            }
        }
        
        // Extraire l'email
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            client.email = emailMatch[0];
        }
        
        // Extraire le téléphone
        const phonePatterns = [
            /T[éèe]l[éèe]?\.?\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})/i,
            /Portable\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})/i,
            /Mobile\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})/i,
            /Fax\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})/i,
        ];
        
        for (const pattern of phonePatterns) {
            const match = text.match(pattern);
            if (match) {
                client.phone = match[1].replace(/[^0-9\+]/g, '');
                break;
            }
        }
        
        // Extraire le SIRET
        const siretMatch = text.match(/SIRET\s*[:\-]?\s*([0-9\s]{14,20})/i);
        if (siretMatch) {
            client.siret = siretMatch[1].replace(/[^0-9]/g, '');
        }
        
        // Extraire la société
        const companyPatterns = [
            /Soci[éèe]t[éèe]\s*[:\-]?\s*([^\n]{10,200})/i,
            /Entreprise\s*[:\-]?\s*([^\n]{10,200})/i,
        ];
        
        for (const pattern of companyPatterns) {
            const match = text.match(pattern);
            if (match) {
                client.company = match[1].trim();
                break;
            }
        }
        
        return client;
    },
    
    _extractAddresses(text) {
        const addresses = [];
        
        // Pattern pour extraire une adresse complète
        const addressBlocks = text.match(
            /(?:Adresse|Lieu|Chantier|Facturation|Livraison)\s*[:\-]?\s*([^\n]{20,500}(?:\n[^\n]{20,500}){0,4})/gi
        );
        
        if (addressBlocks) {
            for (const block of addressBlocks) {
                const address = this._parseAddress(block);
                if (address.street || address.postalCode || address.city) {
                    addresses.push(address);
                }
            }
        }
        
        // Si aucune adresse trouvée, essayer de chercher des patterns d'adresse
        if (addresses.length === 0) {
            const cpPattern = /(\d{5})\s+([A-Za-z\s\-\']{3,50})/g;
            let match;
            while ((match = cpPattern.exec(text)) !== null) {
                const address = new ExtractedAddress();
                address.postalCode = match[1];
                address.city = match[2].trim();
                addresses.push(address);
            }
        }
        
        return addresses;
    },
    
    _parseAddress(addressText) {
        const address = new ExtractedAddress();
        
        // Extraire le code postal et la ville
        const cpPattern = /(\d{5})\s+([A-Za-z\s\-\']{3,50})/;
        const match = addressText.match(cpPattern);
        
        if (match) {
            address.postalCode = match[1];
            address.city = match[2].trim();
            
            // Supprimer le code postal et la ville du texte pour obtenir la rue
            const remaining = addressText.replace(match[0], '').trim();
            address.street = remaining;
        } else {
            // Essayer de trouver juste la rue
            address.street = addressText.trim();
        }
        
        return address;
    },
    
    _determineBillingAddress(addresses) {
        if (!addresses || addresses.length === 0) {
            return null;
        }
        
        // Priorité aux adresses marquées comme facturation
        for (const addr of addresses) {
            if (addr.type.toLowerCase().includes('facturation')) {
                addr.isBilling = true;
                return addr;
            }
        }
        
        // Sinon, retourner la première adresse
        addresses[0].isBilling = true;
        return addresses[0];
    },
    
    _extractItems(text) {
        const prestations = [];
        const fournitures = [];
        
        const lines = text.split('\n');
        const itemLines = [];
        
        for (const line of lines) {
            const lineStripped = line.trim();
            if (!lineStripped) continue;
            
            // Ignorer les lignes qui ressemblent à des en-têtes
            if (/^(?:désignation|description|libellé|prestation|fourniture|article|produit|service)/i.test(lineStripped)) continue;
            if (/^(?:quantité|qté|qt|nombre|nb)/i.test(lineStripped)) continue;
            if (/^(?:prix|unit|pu|tarif)/i.test(lineStripped)) continue;
            if (/^(?:montant|total|sous[-\s]total|ht|ttc|tva)/i.test(lineStripped)) continue;
            
            // Ignorer les lignes qui sont clairement des totaux
            if (/^(?:total|sous[-\s]total|montant[-\s]total)/i.test(lineStripped)) continue;
            
            itemLines.push(lineStripped);
        }
        
        for (const line of itemLines) {
            const item = this._parseItemLine(line);
            if (item) {
                if (item.type === 'M') {
                    prestations.push(item);
                } else {
                    fournitures.push(item);
                }
            }
        }
        
        return { prestations, fournitures };
    },
    
    _parseItemLine(line) {
        const patterns = [
            // Format: Description - Quantité - Prix unitaire
            { regex: /^(.+?)\s*[;|\t]\s*(\d+(?:[.,]\d+)?)\s*[;|\t]\s*(\d+(?:[.,]\d+)?)\s*€?\s*(?:HT|TTC)?$/, 
              extract: (m) => ({ desc: m[1], qty: m[2], price: m[3] }) },
            
            // Format: Quantité x Description @ Prix
            { regex: /^(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(.+?)\s*(?:@|à)\s*(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:/u|l\'?unité|pièce|HT|TTC))?$/,
              extract: (m) => ({ desc: m[2], qty: m[1], price: m[3] }) },
            
            // Format: Description - Quantité - Prix
            { regex: /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:HT|TTC))?$/,
              extract: (m) => ({ desc: m[1], qty: m[2], price: m[3] }) },
            
            // Format: Description - Quantité - Unité - Prix
            { regex: /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(h|heures?|u|unité|pcs?|pièces?|ml|m2|m²|m|kg|l)\s+(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:HT|TTC))?$/,
              extract: (m) => ({ desc: m[1], qty: m[2], unit: m[3], price: m[4] }) },
            
            // Format: Description @ Prix (quantité = 1)
            { regex: /^(.+?)\s*(?:@|à)\s*(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:/u|l\'?unité|pièce|HT|TTC))?$/,
              extract: (m) => ({ desc: m[1], qty: 1, price: m[2] }) },
            
            // Format: Description - Prix (quantité = 1)
            { regex: /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:/u|l\'?unité|pièce|HT|TTC))?$/,
              extract: (m) => ({ desc: m[1], qty: 1, price: m[2] }) },
            
            // Format: Description Quantité Unité (sans prix)
            { regex: /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(h|heures?|u|unité|pcs?|pièces?|ml|m2|m²|m|kg|l)\s*$/,
              extract: (m) => ({ desc: m[1], qty: m[2], unit: m[3], price: 0 }) },
        ];
        
        for (const { regex, extract } of patterns) {
            const match = line.match(regex);
            if (match) {
                const { desc, qty, price, unit } = extract(match);
                
                // Nettoyer la description
                let description = desc.replace(/[;:\-]+$/, '').replace(/\s+[x×*]$/i, '').trim();
                
                if (!description) return null;
                
                const item = new ExtractedItem();
                item.description = description;
                item.quantity = this._parseQuantity(qty);
                item.unitPrice = this._parseAmount(price);
                item.totalPrice = item.quantity * item.unitPrice;
                
                if (unit) {
                    item.unit = unit;
                }
                
                // Classifier l'item
                item.type = this._classifyItem(description);
                
                return item;
            }
        }
        
        return null;
    },
    
    _normalizeText(text) {
        if (!text) return '';
        
        let normalized = text.toLowerCase();
        
        // Supprimer les accents
        normalized = normalized.replace(/[àâäçéèêëîïôöùûüÿœæ]/g, 
            m => ({'à':'a', 'â':'a', 'ä':'a', 'ç':'c', 'é':'e', 'è':'e', 
                   'ê':'e', 'ë':'e', 'î':'i', 'ï':'i', 'ô':'o', 'ö':'o',
                   'ù':'u', 'û':'u', 'ü':'u', 'ÿ':'y', 'œ':'oe', 'æ':'ae'}[m]);
        
        // Supprimer les caractères spéciaux inutiles
        normalized = normalized.replace(/[\s\t\n\r]+/g, ' ').trim();
        
        return normalized;
    },
    
    _parseQuantity(qtyStr) {
        if (!qtyStr) return 1;
        
        const cleaned = qtyStr.replace(/[^\d.,\-+*/]/g, '').replace(',', '.');
        const qty = parseFloat(cleaned);
        
        return isNaN(qty) ? 1 : qty;
    },
    
    _parseAmount(amountStr) {
        if (!amountStr) return 0;
        
        const cleaned = amountStr.replace(/[^\d.,]/g, '').replace(',', '.');
        const amount = parseFloat(cleaned);
        
        return isNaN(amount) ? 0 : amount;
    },
    
    _classifyItem(description) {
        const descLower = description.toLowerCase();
        
        // Mots-clés pour identifier les prestations
        const prestationKeywords = [
            'main', 'd\'?oeuvre', 'pose', 'dép?ose', 'installation', 'raccordement',
            'démontage', 'montage', 'purge', 'réglage', 'nettoyage', 'essai',
            'contrôl', 'diagnostic', 'recherche', 'intervention', 'mise en service',
            'remplacement', 'forfait', 'heure', 'heures', 'prestation',
        ];
        
        // Mots-clés pour identifier les fournitures
        const fournitureKeywords = [
            'fourniture', 'matériel', 'pièce', 'tuyau', 'robinet', 'vanne', 'pompe',
            'chaudière', 'radiateur', 'ballon', 'cumulus', 'chauffage', 'plomberie',
            'tube', 'flexible', 'joint', 'collier', 'visser', 'boulon', 'écrou',
            'kit', 'lot', 'ensemble', 'accessoire', 'consommable',
        ];
        
        for (const keyword of prestationKeywords) {
            if (new RegExp(`\\b${keyword}\\.?\\b`).test(descLower)) {
                return 'M';
            }
        }
        
        for (const keyword of fournitureKeywords) {
            if (new RegExp(`\\b${keyword}\\.?\\b`).test(descLower)) {
                return 'F';
            }
        }
        
        // Par défaut, considérer comme fourniture
        return 'F';
    },
    
    // Vérification des doublons
    async _checkDuplicates(result) {
        // Vérifier si le client existe déjà
        if (result.client && result.client.name) {
            const existingClient = this._findExistingClient(result.client.name);
            result.client.existsInDB = !!existingClient;
            result.client.isNew = !existingClient;
            if (existingClient) {
                result.client.matchingClientId = existingClient.id;
            }
        }
        
        // Vérifier les prestations
        for (const item of result.prestations) {
            const existingItem = this._findExistingItem(item.description, 'M');
            item.existsInDB = !!existingItem;
            if (existingItem) {
                item.matchingItemId = existingItem.id;
            }
        }
        
        // Vérifier les fournitures
        for (const item of result.fournitures) {
            const existingItem = this._findExistingItem(item.description, 'F');
            item.existsInDB = !!existingItem;
            if (existingItem) {
                item.matchingItemId = existingItem.id;
            }
        }
    },
    
    _findExistingClient(name) {
        // Rechercher dans la base de données locale
        if (window.S && window.S.clients) {
            const normalizedName = this._normalizeText(name);
            return window.S.clients.find(c => 
                this._normalizeText(c.n || '').includes(normalizedName) ||
                normalizedName.includes(this._normalizeText(c.n || ''))
            );
        }
        return null;
    },
    
    _findExistingItem(description, itemType) {
        // Rechercher dans la base de données locale
        if (window.S && window.S.cat) {
            const normalizedDesc = this._normalizeText(description);
            return window.S.cat.find(item => 
                item.t === itemType && (
                    this._normalizeText(item.d || '').includes(normalizedDesc) ||
                    normalizedDesc.includes(this._normalizeText(item.d || ''))
                )
            );
        }
        return null;
    },
    
    // Transfert des données
    async _transferClient(client, options) {
        // Si le client existe déjà, retourner son ID
        if (client.existsInDB && client.matchingClientId) {
            return client.matchingClientId;
        }
        
        // Sinon, créer un nouveau client
        const newClient = {
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            n: client.name,
            a: client.addresses.length > 0 ? client.addresses[0].fullAddress : '',
            c: client.addresses.length > 0 ? `${client.addresses[0].postalCode} ${client.addresses[0].city}` : '',
            t: client.phone,
            e: client.email,
            siret: client.siret,
            company: client.company,
        };
        
        // Ajouter à la base de données locale
        if (window.S && window.S.clients) {
            window.S.clients.push(newClient);
            window.save && window.save('clients');
        }
        
        return newClient.id;
    },
    
    async _transferItem(item, itemType, options) {
        // Si l'item existe déjà, retourner son ID
        if (item.existsInDB && item.matchingItemId) {
            return item.matchingItemId;
        }
        
        // Sinon, créer un nouvel item
        const newItem = {
            id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            d: item.description,
            p: options.withPrices ? item.unitPrice : 0,
            t: itemType,
            u: item.unit,
        };
        
        // Ajouter à la base de données locale
        if (window.S && window.S.cat) {
            window.S.cat.push(newItem);
            window.save && window.save('cat');
        }
        
        return newItem.id;
    },
    
    async _saveTransferredData() {
        // Sauvegarder les modifications
        if (window.save) {
            for (const key of ['clients', 'cat', 'docs', 'seq']) {
                window.save(key);
            }
        }
    },
};

// ============================================================================
// API pour l'intégration avec le serveur
// ============================================================================

const DocumentAPI = {
    // Appel à l'API serveur pour l'extraction
    async extractDocument(file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        if (options.withOCR) {
            formData.append('ocr', 'true');
        }
        
        try {
            const response = await fetch(`${ImportConfig.API_BASE_URL}/api/extract-document`, {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                throw new Error(`Erreur du serveur: ${response.status}`);
            }
            
            const result = await response.json();
            return this._parseServerResult(result);
        } catch (error) {
            console.error('Erreur lors de l\'appel à l\'API:', error);
            throw error;
        }
    },
    
    // Appel à l'API serveur pour le transfert
    async transferData(data, options = {}) {
        try {
            const response = await fetch(`${ImportConfig.API_BASE_URL}/api/transfer-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data, options }),
            });
            
            if (!response.ok) {
                throw new Error(`Erreur du serveur: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Erreur lors du transfert:', error);
            throw error;
        }
    },
    
    _parseServerResult(serverResult) {
        const result = new ExtractionResult();
        
        result.documentType = serverResult.document_type || 'unknown';
        result.documentNumber = serverResult.document_number || '';
        result.date = serverResult.date || '';
        result.totalAmount = serverResult.total_amount || 0;
        result.currency = serverResult.currency || '€';
        result.fileName = serverResult.file_name || '';
        result.fileType = serverResult.file_type || '';
        
        // Parser le client
        if (serverResult.client) {
            result.client = new ExtractedClient();
            result.client.name = serverResult.client.name || '';
            result.client.company = serverResult.client.company || '';
            result.client.siret = serverResult.client.siret || '';
            result.client.email = serverResult.client.email || '';
            result.client.phone = serverResult.client.phone || '';
            result.client.isNew = serverResult.client.is_new || false;
        }
        
        // Parser les adresses
        if (serverResult.addresses) {
            result.client.addresses = serverResult.addresses.map(addr => {
                const address = new ExtractedAddress();
                address.street = addr.street || '';
                address.postalCode = addr.postal_code || '';
                address.city = addr.city || '';
                address.country = addr.country || 'France';
                address.type = addr.address_type || 'chantier';
                return address;
            });
        }
        
        // Parser l'adresse de facturation
        if (serverResult.billing_address) {
            result.billingAddress = new ExtractedAddress();
            result.billingAddress.street = serverResult.billing_address.street || '';
            result.billingAddress.postalCode = serverResult.billing_address.postal_code || '';
            result.billingAddress.city = serverResult.billing_address.city || '';
            result.billingAddress.country = serverResult.billing_address.country || 'France';
            result.billingAddress.type = serverResult.billing_address.address_type || 'facturation';
            result.billingAddress.isBilling = true;
        }
        
        // Parser les prestations
        if (serverResult.prestations) {
            result.prestations = serverResult.prestations.map(item => {
                const extractedItem = new ExtractedItem();
                extractedItem.description = item.description || '';
                extractedItem.quantity = item.quantity || 1;
                extractedItem.unitPrice = item.unit_price || 0;
                extractedItem.totalPrice = item.total_price || 0;
                extractedItem.type = 'M';
                extractedItem.unit = item.unit || '';
                return extractedItem;
            });
        }
        
        // Parser les fournitures
        if (serverResult.fournitures) {
            result.fournitures = serverResult.fournitures.map(item => {
                const extractedItem = new ExtractedItem();
                extractedItem.description = item.description || '';
                extractedItem.quantity = item.quantity || 1;
                extractedItem.unitPrice = item.unit_price || 0;
                extractedItem.totalPrice = item.total_price || 0;
                extractedItem.type = 'F';
                extractedItem.unit = item.unit || '';
                return extractedItem;
            });
        }
        
        // Parser les avertissements et erreurs
        result.warnings = serverResult.warnings || [];
        result.errors = serverResult.errors || [];
        
        return result;
    },
};

// ============================================================================
// Export
// ============================================================================

// Initialiser l'API au chargement
if (typeof window !== 'undefined') {
    window.ImportAPI = ImportAPI;
    window.DocumentAPI = DocumentAPI;
    
    // Initialiser automatiquement si l'application est chargée
    if (window.addEventListener) {
        window.addEventListener('DOMContentLoaded', () => {
            ImportAPI.init();
        });
    }
}

// Export pour les modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ImportAPI, DocumentAPI, ImportFile, ExtractedClient, ExtractedAddress, ExtractedItem, ExtractionResult, ImportState };
}

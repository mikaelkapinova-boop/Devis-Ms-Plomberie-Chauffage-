#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ms Plomberie & Chauffage - Connecteurs d'extraction de documents

Ce module fournit des outils pour extraire des données de divers formats de documents :
- PDF (texte et scanné)
- Images (JPG, PNG) via OCR
- Documents Word (DOCX)
- Fichiers texte

Fonctionnalités :
- Extraction intelligente des clients, adresses, numéros de devis/factures
- Reconnaissance des lignes de prestations et fournitures
- Classification automatique (prestation vs fourniture)
- Détection des prix et quantités

Dépendances optionnelles (installables via pip) :
- PyPDF2 ou pdfminer.six pour l'extraction de texte PDF
- pillow et pytesseract pour l'OCR sur les images
- python-docx pour les documents Word
- requests pour les appels API externes
"""

import os
import re
import json
import base64
import tempfile
import subprocess
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime


# ----------------------------------------------------------------------------
# Configuration et constantes
# ----------------------------------------------------------------------------

# Seuil de confiance pour l'OCR (0-100)
OCR_CONFIDENCE_THRESHOLD = 70

# Expressions régulières pour la détection des types de documents
DEVIS_PATTERNS = [
    r'devis\s*(?:n°|num[éèe]ro?|ref[éèe]?r?ence)?\s*[:\-]?\s*',
    r'dev\s*\-?\s*',
    r'proposition\s*(?:commerciale|technique|de\s*prestations?)',
    r'estimation',
    r'chiffrage',
    r'cotation',
]

FACTURE_PATTERNS = [
    r'facture\s*(?:n°|num[éèe]ro?|ref[éèe]?r?ence)?\s*[:\-]?\s*',
    r'fac\s*\-?\s*',
    r'invoice',
    r'bill',
]

# Patterns pour extraire les numéros de documents
DOC_NUMBER_PATTERNS = [
    r'(?:DEV|FACT|FAC|DEVIS|FACTURE)[\-:\s]*(?:\d{4}[\-:\s]*)?([A-Z]{0,3}\d{1,6}[\-A-Z0-9]*)',
    r'(?:N°|Num[éèe]ro?|Ref[éèe]?r?ence)[\-:\s]*([A-Z0-9\-\/]{3,20})',
    r'\b(\d{4}[\-]?\d{3,6})\b',
]

# Patterns pour les dates
DATE_PATTERNS = [
    r'(\d{2}[\/\-]\d{2}[\/\-]\d{4})',
    r'(\d{2}[\/\-]\d{2}[\/\-]\d{2})',
    r'(\d{4}[\/\-]\d{2}[\/\-]\d{2})',
    r'(\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4})',
]

# Patterns pour les montants
AMOUNT_PATTERNS = [
    r'(\d{1,6}[.,]\d{1,2})\s*€',
    r'(\d{1,6}[.,]\d{1,2})\s*euros?',
    r'EUR\s*(\d{1,6}[.,]\d{1,2})',
]

# Mots-clés pour identifier les prestations (main d'œuvre)
PRESTATION_KEYWORDS = [
    'main', 'd\'?oeuvre', 'pose', 'dép?ose', 'installation', 'raccordement',
    'démontage', 'montage', 'purge', 'réglage', 'nettoyage', 'essai',
    'contrôl', 'diagnostic', 'recherche', 'intervention', 'mise en service',
    'remplacement', 'forfait', 'heure', 'heures', 'prestation',
]

# Mots-clés pour identifier les fournitures
FOURNITURE_KEYWORDS = [
    'fourniture', 'matériel', 'pièce', 'tuyau', 'robinet', 'vanne', 'pompe',
    'chaudière', 'radiateur', 'ballon', 'cumulus', 'chauffage', 'plomberie',
    'tube', 'flexible', 'joint', 'collier', 'visser', 'boulon', 'écrou',
    'kit', 'lot', 'ensemble', 'accessoire', 'consommable',
]


@dataclass
class ExtractedItem:
    """Représente une ligne extraite (prestation ou fourniture)"""
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    total_price: float = 0.0
    item_type: str = "F"  # 'F' pour fourniture, 'M' pour main d'œuvre
    unit: str = ""


@dataclass
class ExtractedAddress:
    """Représente une adresse extraite"""
    street: str = ""
    postal_code: str = ""
    city: str = ""
    country: str = "France"
    address_type: str = "chantier"  # 'client', 'chantier', 'facturation', 'livraison'


@dataclass
class ExtractedClient:
    """Représente un client extrait"""
    name: str = ""
    company: str = ""
    siret: str = ""
    email: str = ""
    phone: str = ""
    addresses: List[ExtractedAddress] = field(default_factory=list)
    is_new: bool = True


@dataclass
class ExtractionResult:
    """Résultat complet de l'extraction d'un document"""
    document_type: str = "unknown"  # 'devis', 'facture', 'autre'
    document_number: str = ""
    date: str = ""
    total_amount: float = 0.0
    currency: str = "€"
    
    client: ExtractedClient = field(default_factory=ExtractedClient)
    billing_address: Optional[ExtractedAddress] = None
    
    prestations: List[ExtractedItem] = field(default_factory=list)
    fournitures: List[ExtractedItem] = field(default_factory=list)
    
    raw_text: str = ""
    file_name: str = ""
    file_type: str = ""
    
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


# ----------------------------------------------------------------------------
# Utilitaires
# ----------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    """Normalise le texte pour faciliter l'extraction"""
    if not text:
        return ""
    
    # Convertir en minuscules et supprimer les accents
    text = text.lower()
    text = re.sub(r'[àâäçéèêëîïôöùûüÿœæ]', 
                  lambda m: {'à':'a', 'â':'a', 'ä':'a', 'ç':'c', 'é':'e', 'è':'e', 
                            'ê':'e', 'ë':'e', 'î':'i', 'ï':'i', 'ô':'o', 'ö':'o',
                            'ù':'u', 'û':'u', 'ü':'u', 'ÿ':'y', 'œ':'oe', 'æ':'ae'}[m.group()],
                  text)
    
    # Supprimer les caractères spéciaux inutiles
    text = re.sub(r'[\x00-\x1f\x7f-\x9f]', ' ', text)
    text = re.sub(r'[\s\t\n\r]+', ' ', text).strip()
    
    return text


def extract_document_number(text: str) -> str:
    """Extrait le numéro de document (devis ou facture)"""
    for pattern in DOC_NUMBER_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def extract_date(text: str) -> str:
    """Extrait une date au format JJ/MM/AAAA"""
    for pattern in DATE_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            # Normaliser la date
            if re.match(r'\d{4}[\/\-]\d{2}[\/\-]\d{2}', date_str):
                # Format AAAA-MM-JJ ou AAAA/MM/JJ
                parts = date_str.replace('/', '-').split('-')
                if len(parts) == 3:
                    return f"{parts[2]}/{parts[1]}/{parts[0]}"
            elif re.match(r'\d{2}[\/\-]\d{2}[\/\-]\d{2}', date_str):
                # Format JJ/MM/AA
                parts = date_str.replace('/', '-').split('-')
                return f"{parts[0]}/{parts[1]}/20{parts[2]}"
            return date_str
    return ""


def extract_amount(text: str) -> float:
    """Extrait un montant monétaire"""
    for pattern in AMOUNT_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_str = match.group(1).replace(',', '.')
            try:
                return float(amount_str)
            except ValueError:
                continue
    return 0.0


def extract_all_amounts(text: str) -> List[float]:
    """Extrait tous les montants d'un texte"""
    amounts = []
    for pattern in AMOUNT_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            amount_str = match.replace(',', '.')
            try:
                amounts.append(float(amount_str))
            except ValueError:
                continue
    return amounts


def classify_item(description: str) -> str:
    """Classifie une ligne comme prestation (M) ou fourniture (F)"""
    desc_lower = description.lower()
    
    # Vérifier d'abord les mots-clés de prestation
    for keyword in PRESTATION_KEYWORDS:
        if re.search(r'\b' + keyword + r'\b', desc_lower):
            return "M"
    
    # Vérifier les mots-clés de fourniture
    for keyword in FOURNITURE_KEYWORDS:
        if re.search(r'\b' + keyword + r'\b', desc_lower):
            return "F"
    
    # Par défaut, si le prix unitaire est élevé, c'est probablement une prestation
    # (cette logique sera appliquée lors de l'extraction complète)
    return "F"


def parse_french_amount(amount_str: str) -> float:
    """Convertit une chaîne de montant français en float"""
    amount_str = amount_str.strip()
    if not amount_str:
        return 0.0
    
    # Supprimer les espaces utilisés comme séparateurs de milliers
    amount_str = re.sub(r'\s+', '', amount_str)
    
    # Remplacer la virgule par un point pour le décimal
    amount_str = amount_str.replace(',', '.')
    
    try:
        return float(amount_str)
    except ValueError:
        return 0.0


def parse_quantity(quantity_str: str) -> float:
    """Convertit une chaîne de quantité en float"""
    quantity_str = quantity_str.strip()
    if not quantity_str:
        return 1.0
    
    # Supprimer les unités (h, kg, m, etc.)
    quantity_str = re.sub(r'[^\d.,\-+*/]', '', quantity_str)
    
    try:
        return float(quantity_str.replace(',', '.'))
    except ValueError:
        return 1.0


def get_file_type(file_path: str) -> str:
    """Détermine le type de fichier"""
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.pdf']:
        return 'pdf'
    elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']:
        return 'image'
    elif ext in ['.doc', '.docx']:
        return 'word'
    elif ext in ['.txt', '.text']:
        return 'text'
    return 'unknown'


def format_file_size(size_bytes: int) -> str:
    """Formate la taille d'un fichier en Ko/Mo/Go"""
    for unit in ['B', 'Ko', 'Mo', 'Go']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} To"


def validate_file(file_path: str, max_size: int = 50 * 1024 * 1024) -> Tuple[bool, str]:
    """Valide qu'un fichier peut être traité"""
    if not os.path.exists(file_path):
        return False, "Fichier introuvable"
    
    file_size = os.path.getsize(file_path)
    if file_size > max_size:
        return False, f"Fichier trop volumineux ({format_file_size(file_size)} > {format_file_size(max_size)})"
    
    file_type = get_file_type(file_path)
    if file_type == 'unknown':
        return False, "Type de fichier non supporté"
    
    return True, file_type


# ----------------------------------------------------------------------------
# Extracteur de PDF
# ----------------------------------------------------------------------------

class PDFExtractor:
    """Extracteur de texte depuis les fichiers PDF"""
    
    def __init__(self):
        self.available = False
        self.extractor = None
        self._check_availability()
    
    def _check_availability(self):
        """Vérifie si PyPDF2 ou pdfminer est disponible"""
        try:
            import PyPDF2
            self.extractor = 'pypdf2'
            self.available = True
        except ImportError:
            try:
                from pdfminer.high_level import extract_text
                self.extractor = 'pdfminer'
                self.available = True
            except ImportError:
                self.available = False
    
    def extract_text(self, file_path: str) -> str:
        """Extrait le texte d'un PDF"""
        if not self.available:
            raise ImportError("Aucun extracteur PDF disponible. Installez PyPDF2 ou pdfminer.six")
        
        if self.extractor == 'pypdf2':
            return self._extract_with_pypdf2(file_path)
        else:
            return self._extract_with_pdfminer(file_path)
    
    def _extract_with_pypdf2(self, file_path: str) -> str:
        """Extrait avec PyPDF2"""
        import PyPDF2
        text = []
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text.append(page_text)
        return '\n'.join(text)
    
    def _extract_with_pdfminer(self, file_path: str) -> str:
        """Extrait avec pdfminer"""
        from pdfminer.high_level import extract_text
        return extract_text(file_path)


# ----------------------------------------------------------------------------
# Extracteur d'images (OCR)
# ----------------------------------------------------------------------------

class ImageExtractor:
    """Extracteur de texte depuis les images via OCR"""
    
    def __init__(self):
        self.available = False
        self._check_availability()
    
    def _check_availability(self):
        """Vérifie si Tesseract est disponible"""
        try:
            from PIL import Image
            import pytesseract
            self.available = True
        except ImportError:
            self.available = False
    
    def extract_text(self, file_path: str, lang: str = 'fra+eng') -> str:
        """Extrait le texte d'une image via OCR"""
        if not self.available:
            raise ImportError("OCR non disponible. Installez pillow et pytesseract")
        
        from PIL import Image
        import pytesseract
        
        # Pré-traitement de l'image pour améliorer l'OCR
        img = Image.open(file_path)
        
        # Convertir en niveaux de gris
        img = img.convert('L')
        
        # Appliquer un seuil pour binariser
        img = img.point(lambda x: 0 if x < 128 else 255, '1')
        
        # Configurer Tesseract
        config = f'--psm 6 --oem 3 -l {lang}'
        
        text = pytesseract.image_to_string(img, config=config)
        return text


# ----------------------------------------------------------------------------
# Extracteur Word
# ----------------------------------------------------------------------------

class WordExtractor:
    """Extracteur de texte depuis les documents Word"""
    
    def __init__(self):
        self.available = False
        self._check_availability()
    
    def _check_availability(self):
        """Vérifie si python-docx est disponible"""
        try:
            import docx
            self.available = True
        except ImportError:
            self.available = False
    
    def extract_text(self, file_path: str) -> str:
        """Extrait le texte d'un document Word"""
        if not self.available:
            raise ImportError("Extracteur Word non disponible. Installez python-docx")
        
        import docx
        doc = docx.Document(file_path)
        text = []
        for paragraph in doc.paragraphs:
            text.append(paragraph.text)
        return '\n'.join(text)


# ----------------------------------------------------------------------------
# Extracteur principal
# ----------------------------------------------------------------------------

class DocumentExtractor:
    """Extracteur principal qui orchestrer l'extraction de tous les types de documents"""
    
    def __init__(self):
        self.pdf_extractor = PDFExtractor()
        self.image_extractor = ImageExtractor()
        self.word_extractor = WordExtractor()
    
    def extract(self, file_path: str, file_name: str = "") -> ExtractionResult:
        """
        Extrait les données d'un document
        
        Args:
            file_path: Chemin vers le fichier
            file_name: Nom du fichier (optionnel)
        
        Returns:
            ExtractionResult avec toutes les données extraites
        """
        result = ExtractionResult(file_name=file_name or os.path.basename(file_path))
        
        # Valider le fichier
        valid, file_type = validate_file(file_path)
        if not valid:
            result.errors.append(file_type)
            return result
        
        result.file_type = file_type
        
        # Extraire le texte selon le type de fichier
        try:
            if file_type == 'pdf':
                result.raw_text = self.pdf_extractor.extract_text(file_path)
            elif file_type == 'image':
                result.raw_text = self.image_extractor.extract_text(file_path)
            elif file_type == 'word':
                result.raw_text = self.word_extractor.extract_text(file_path)
            elif file_type == 'text':
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    result.raw_text = f.read()
        except Exception as e:
            result.errors.append(f"Erreur d'extraction du texte: {str(e)}")
            return result
        
        # Normaliser le texte
        normalized_text = normalize_text(result.raw_text)
        
        # Détecter le type de document
        result.document_type = self._detect_document_type(normalized_text, result.raw_text)
        
        # Extraire le numéro de document
        result.document_number = extract_document_number(result.raw_text)
        
        # Extraire la date
        result.date = extract_date(result.raw_text)
        
        # Extraire le client
        result.client = self._extract_client(result.raw_text)
        
        # Extraire les adresses
        result.client.addresses = self._extract_addresses(result.raw_text)
        
        # Déterminer l'adresse de facturation
        result.billing_address = self._determine_billing_address(result.client.addresses)
        
        # Extraire les lignes (prestations et fournitures)
        prestations, fournitures = self._extract_items(result.raw_text)
        result.prestations = prestations
        result.fournitures = fournitures
        
        # Calculer le total
        result.total_amount = sum(item.total_price for item in prestations + fournitures)
        
        # Vérifier les doublons
        self._check_duplicates(result)
        
        return result
    
    def _detect_document_type(self, normalized_text: str, raw_text: str) -> str:
        """Détecte le type de document"""
        for pattern in DEVIS_PATTERNS:
            if re.search(pattern, normalized_text):
                return 'devis'
        
        for pattern in FACTURE_PATTERNS:
            if re.search(pattern, normalized_text):
                return 'facture'
        
        return 'autre'
    
    def _extract_client(self, text: str) -> ExtractedClient:
        """Extrait les informations du client"""
        client = ExtractedClient()
        
        # Patterns pour extraire le nom du client
        client_patterns = [
            r'Client\s*[:\-]?\s*([^\n]{10,200})',
            r'Nom\s*[:\-]?\s*([^\n]{10,200})',
            r'Raison\s+sociale\s*[:\-]?\s*([^\n]{10,200})',
            r'Soci[éèe]t[éèe]\s*[:\-]?\s*([^\n]{10,200})',
            r'À\s+l\'?attention\s+de\s+([^\n]{10,200})',
        ]
        
        for pattern in client_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                client.name = match.group(1).strip()
                break
        
        # Extraire l'email
        email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        if email_match:
            client.email = email_match.group(0)
        
        # Extraire le téléphone
        phone_patterns = [
            r'T[éèe]l[éèe]?\.?\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})',
            r'Portable\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})',
            r'Mobile\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})',
            r'Fax\s*[:\-]?\s*([0-9\s\-\.\+]{7,20})',
        ]
        
        for pattern in phone_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                client.phone = re.sub(r'[^0-9\+]', '', match.group(1))
                break
        
        # Extraire le SIRET
        siret_match = re.search(r'SIRET\s*[:\-]?\s*([0-9\s]{14,20})', text, re.IGNORECASE)
        if siret_match:
            client.siret = re.sub(r'[^0-9]', '', siret_match.group(1))
        
        # Extraire la société
        company_patterns = [
            r'Soci[éèe]t[éèe]\s*[:\-]?\s*([^\n]{10,200})',
            r'Entreprise\s*[:\-]?\s*([^\n]{10,200})',
        ]
        
        for pattern in company_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                client.company = match.group(1).strip()
                break
        
        return client
    
    def _extract_addresses(self, text: str) -> List[ExtractedAddress]:
        """Extrait toutes les adresses du document"""
        addresses = []
        
        # Pattern pour extraire une adresse complète
        # Cherche des blocs de texte qui ressemblent à des adresses
        address_blocks = re.findall(
            r'(?:Adresse|Lieu|Chantier|Facturation|Livraison)\s*[:\-]?\s*([^\n]{20,500}(?:\n[^\n]{20,500}){0,4})',
            text, re.IGNORECASE
        )
        
        for block in address_blocks:
            address = self._parse_address(block)
            if address.street or address.postal_code or address.city:
                addresses.append(address)
        
        # Si aucune adresse trouvée, essayer de chercher des patterns d'adresse
        if not addresses:
            # Chercher des lignes qui contiennent un code postal
            cp_pattern = r'(\d{5})\s+([A-Za-z\s\-\']{3,50})'
            matches = re.findall(cp_pattern, text)
            for cp, city in matches:
                address = ExtractedAddress(postal_code=cp, city=city.strip())
                addresses.append(address)
        
        return addresses
    
    def _parse_address(self, address_text: str) -> ExtractedAddress:
        """Parse un bloc de texte en adresse structurée"""
        address = ExtractedAddress()
        
        # Extraire le code postal et la ville
        cp_pattern = r'(\d{5})\s+([A-Za-z\s\-\']{3,50})'
        match = re.search(cp_pattern, address_text)
        if match:
            address.postal_code = match.group(1)
            address.city = match.group(2).strip()
            # Supprimer le code postal et la ville du texte pour obtenir la rue
            remaining = address_text.replace(match.group(0), '').strip()
            address.street = remaining
        else:
            # Essayer de trouver juste la rue
            address.street = address_text.strip()
        
        return address
    
    def _determine_billing_address(self, addresses: List[ExtractedAddress]) -> Optional[ExtractedAddress]:
        """Détermine l'adresse de facturation parmi les adresses extraites"""
        if not addresses:
            return None
        
        # Priorité aux adresses marquées comme facturation
        for addr in addresses:
            if 'facturation' in addr.address_type.lower():
                return addr
        
        # Sinon, retourner la première adresse
        return addresses[0]
    
    def _extract_items(self, text: str) -> Tuple[List[ExtractedItem], List[ExtractedItem]]:
        """Extrait les lignes de prestations et fournitures"""
        prestations = []
        fournitures = []
        
        # Normaliser le texte pour le traitement
        normalized = normalize_text(text)
        
        # Découper le texte en lignes
        lines = text.split('\n')
        
        # Filtrer les lignes qui ne sont pas des en-têtes ou des totaux
        item_lines = []
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                continue
            
            # Ignorer les lignes qui ressemblent à des en-têtes
            if re.match(r'^(?:désignation|description|libellé|prestation|fourniture|article|produit|service)', line_stripped, re.IGNORECASE):
                continue
            if re.match(r'^(?:quantité|qté|qt|nombre|nb)', line_stripped, re.IGNORECASE):
                continue
            if re.match(r'^(?:prix|unit|pu|tarif)', line_stripped, re.IGNORECASE):
                continue
            if re.match(r'^(?:montant|total|sous[-\s]total|ht|ttc|tva)', line_stripped, re.IGNORECASE):
                continue
            
            # Ignorer les lignes qui sont clairement des totaux
            if re.match(r'^(?:total|sous[-\s]total|montant[-\s]total)', line_stripped, re.IGNORECASE):
                continue
            
            item_lines.append(line_stripped)
        
        # Traitement des lignes pour extraire les items
        for line in item_lines:
            item = self._parse_item_line(line, normalized)
            if item:
                if item.item_type == 'M':
                    prestations.append(item)
                else:
                    fournitures.append(item)
        
        return prestations, fournitures
    
    def _parse_item_line(self, line: str, normalized: str) -> Optional[ExtractedItem]:
        """Parse une ligne en item (prestation ou fourniture)"""
        # Patterns pour extraire description, quantité, prix
        patterns = [
            # Format: Description - Quantité - Prix unitaire
            r'^(.+?)\s*[;|\t]\s*(\d+(?:[.,]\d+)?)\s*[;|\t]\s*(\d+(?:[.,]\d+)?)\s*€?\s*(?:HT|TTC)?$',
            
            # Format: Quantité x Description @ Prix
            r'^(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(.+?)\s*(?:@|à)\s*(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:/u|l\'?unité|pièce|HT|TTC))?$',
            
            # Format: Description - Quantité - Prix
            r'^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:HT|TTC))?$',
            
            # Format: Description - Quantité unité - Prix
            r'^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(h|heures?|u|unité|pcs?|pièces?|ml|m2|m²|m|kg|l)\s+(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:HT|TTC))?$',
            
            # Format: Description @ Prix (quantité = 1)
            r'^(.+?)\s*(?:@|à)\s*(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:/u|l\'?unité|pièce|HT|TTC))?$',
            
            # Format: Description - Prix (quantité = 1)
            r'^(.+?)\s+(\d+(?:[.,]\d+)?)\s*€(?:\s*(?:/u|l\'?unité|pièce|HT|TTC))?$',
            
            # Format: Description Quantité (sans prix)
            r'^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(h|heures?|u|unité|pcs?|pièces?|ml|m2|m²|m|kg|l)\s*$',
        ]
        
        for pattern in patterns:
            match = re.match(pattern, line, re.IGNORECASE)
            if match:
                groups = match.groups()
                
                if len(groups) >= 2:
                    description = groups[0].strip()
                    
                    # Nettoyer la description
                    description = re.sub(r'[;:\-]+$', '', description)
                    description = re.sub(r'\s+[x×*]$', '', description, flags=re.IGNORECASE)
                    description = description.strip()
                    
                    if not description:
                        return None
                    
                    item = ExtractedItem(description=description)
                    
                    # Extraire quantité et prix selon le pattern
                    if len(groups) == 3:
                        # Cas: Description, Quantité, Prix
                        item.quantity = parse_quantity(groups[1])
                        item.unit_price = parse_french_amount(groups[2])
                        item.total_price = item.quantity * item.unit_price
                        
                    elif len(groups) == 4:
                        if pattern.startswith(r'^(\d'):
                            # Cas: Quantité, Description, Prix
                            item.quantity = parse_quantity(groups[0])
                            item.unit_price = parse_french_amount(groups[2])
                            item.unit = groups[1] if groups[1] else ""
                            item.total_price = item.quantity * item.unit_price
                        else:
                            # Cas: Description, Quantité, Unité, Prix
                            item.quantity = parse_quantity(groups[1])
                            item.unit_price = parse_french_amount(groups[3])
                            item.unit = groups[2]
                            item.total_price = item.quantity * item.unit_price
                    elif len(groups) == 2:
                        # Cas: Description, Prix (quantité = 1)
                        if '@' in line or 'à' in line.lower():
                            item.quantity = 1.0
                            item.unit_price = parse_french_amount(groups[1])
                        else:
                            # Cas: Description, Quantité (sans prix)
                            item.quantity = parse_quantity(groups[1])
                            item.unit_price = 0.0
                        item.total_price = item.quantity * item.unit_price
                    
                    # Classifier l'item
                    item.item_type = classify_item(description)
                    
                    return item
        
        return None
    
    def _check_duplicates(self, result: ExtractionResult):
        """Vérifie les doublons potentiels"""
        # Vérifier si le client existe déjà (simulation)
        # Dans une utilisation réelle, cela serait fait côté application
        pass


# ----------------------------------------------------------------------------
# API Connector (pour les appels externes)
# ----------------------------------------------------------------------------

class APIConnector:
    """Connecteur pour les appels API externes (OCR en ligne, etc.)"""
    
    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.session = None
        try:
            import requests
            self.session = requests.Session()
        except ImportError:
            pass
    
    def is_available(self) -> bool:
        """Vérifie si les dépendances sont disponibles"""
        return self.session is not None
    
    def ocr_online(self, image_path: str) -> str:
        """Effectue une reconnaissance OCR en ligne (nécessite une clé API)"""
        if not self.is_available():
            raise ImportError("La bibliothèque requests est requise pour l'OCR en ligne")
        
        if not self.api_key:
            raise ValueError("Une clé API est requise pour l'OCR en ligne")
        
        # Exemple avec une API OCR hypothétique
        # À adapter selon le fournisseur
        raise NotImplementedError("L'OCR en ligne n'est pas encore implémenté. Utilisez l'OCR local avec Tesseract.")


# ----------------------------------------------------------------------------
# Fonctions utilitaires pour l'intégration avec le serveur
# ----------------------------------------------------------------------------

def process_uploaded_file(file_content: bytes, file_name: str, temp_dir: str = None) -> ExtractionResult:
    """
    Traite un fichier téléversé et extrait les données
    
    Args:
        file_content: Contenu binaire du fichier
        file_name: Nom du fichier
        temp_dir: Dossier temporaire (optionnel)
    
    Returns:
        ExtractionResult avec les données extraites
    """
    # Créer un fichier temporaire
    if temp_dir is None:
        temp_dir = tempfile.gettempdir()
    
    file_path = os.path.join(temp_dir, file_name)
    
    # Écrire le contenu dans le fichier temporaire
    with open(file_path, 'wb') as f:
        f.write(file_content)
    
    try:
        # Extraire les données
        extractor = DocumentExtractor()
        result = extractor.extract(file_path, file_name)
        return result
    finally:
        # Supprimer le fichier temporaire
        try:
            os.remove(file_path)
        except:
            pass


def extraction_result_to_dict(result: ExtractionResult) -> Dict[str, Any]:
    """Convertit un ExtractionResult en dictionnaire JSON-sérialisable"""
    return {
        'document_type': result.document_type,
        'document_number': result.document_number,
        'date': result.date,
        'total_amount': result.total_amount,
        'currency': result.currency,
        'client': {
            'name': result.client.name,
            'company': result.client.company,
            'siret': result.client.siret,
            'email': result.client.email,
            'phone': result.client.phone,
            'is_new': result.client.is_new,
        },
        'billing_address': {
            'street': result.billing_address.street if result.billing_address else '',
            'postal_code': result.billing_address.postal_code if result.billing_address else '',
            'city': result.billing_address.city if result.billing_address else '',
            'country': result.billing_address.country if result.billing_address else '',
            'address_type': result.billing_address.address_type if result.billing_address else '',
        } if result.billing_address else None,
        'addresses': [
            {
                'street': addr.street,
                'postal_code': addr.postal_code,
                'city': addr.city,
                'country': addr.country,
                'address_type': addr.address_type,
            }
            for addr in result.client.addresses
        ],
        'prestations': [
            {
                'description': item.description,
                'quantity': item.quantity,
                'unit_price': item.unit_price,
                'total_price': item.total_price,
                'item_type': item.item_type,
                'unit': item.unit,
            }
            for item in result.prestations
        ],
        'fournitures': [
            {
                'description': item.description,
                'quantity': item.quantity,
                'unit_price': item.unit_price,
                'total_price': item.total_price,
                'item_type': item.item_type,
                'unit': item.unit,
            }
            for item in result.fournitures
        ],
        'warnings': result.warnings,
        'errors': result.errors,
        'file_name': result.file_name,
        'file_type': result.file_type,
    }

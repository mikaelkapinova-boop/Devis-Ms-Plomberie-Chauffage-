#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ms Plomberie & Chauffage – Connecteurs API pour l'importation de documents

Ce module fournit des connecteurs pour :
- L'extraction de texte depuis des PDF
- L'extraction de texte depuis des images (OCR)
- Le traitement des documents Word
- La connexion à des services cloud pour l'extraction avancée

Dépendances : Python 3.9+ avec PyPDF2, pillow, pytesseract, python-docx
"""

import os
import re
import json
import base64
import tempfile
import subprocess
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Union
from dataclasses import dataclass, field

try:
    from PyPDF2 import PdfReader
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

try:
    from pdfminer.high_level import extract_text as pdfminer_extract_text
    HAS_PDFMINER = True
except ImportError:
    HAS_PDFMINER = False

try:
    from PIL import Image
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False

try:
    from docx import Document
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


@dataclass
class ExtractedClient:
    """Informations client extraites"""
    name: str = ""
    company: str = ""
    siret: str = ""
    tva: str = ""
    email: str = ""
    phone: str = ""
    addresses: List[Dict] = field(default_factory=list)


@dataclass
class ExtractedItem:
    """Prestation ou fourniture extraite"""
    name: str = ""
    description: str = ""
    item_type: str = "service"  # 'service' ou 'supply'
    quantity: float = 1.0
    unit: str = ""
    unit_price: float = 0.0
    total: float = 0.0
    category: str = ""


@dataclass
class ExtractedAddress:
    """Adresse extraite"""
    street: str = ""
    postal_code: str = ""
    city: str = ""
    country: str = ""
    address_type: str = "unknown"  # 'facturation', 'chantier', 'siege', 'unknown'
    full_address: str = ""


@dataclass
class ExtractedDocument:
    """Document extrait"""
    document_type: str = "devis"  # 'devis' ou 'facture'
    document_number: str = ""
    date: str = ""
    client: ExtractedClient = field(default_factory=ExtractedClient)
    addresses: List[ExtractedAddress] = field(default_factory=list)
    items: List[ExtractedItem] = field(default_factory=list)
    total: float = 0.0
    tax: float = 0.0
    currency: str = "€"
    notes: str = ""
    source: str = ""


@dataclass
class ExtractionResult:
    """Résultat de l'extraction"""
    success: bool = True
    document: ExtractedDocument = field(default_factory=ExtractedDocument)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    processing_time: float = 0.0


class DocumentExtractor:
    """Extracteur de données depuis divers formats de documents"""
    
    def __init__(self):
        self.patterns = {
            'devis': re.compile(r'(devis|quote|estimation|estimate|cotation)', re.IGNORECASE),
            'facture': re.compile(r'(facture|invoice|fact|fac)', re.IGNORECASE),
            'client': re.compile(r'(client|customer|nom|name|soci[ée]t[ée]|company)', re.IGNORECASE),
            'adresse': re.compile(r'(adresse|address|rue|street|avenue|bd|boulevard|route)', re.IGNORECASE),
            'telephone': re.compile(r'(t[ée]l[ée]?|phone|tel|mobile|portable)', re.IGNORECASE),
            'email': re.compile(r'(email|courriel|mail|e-mail)', re.IGNORECASE),
            'date': re.compile(r'(date|le|[0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})', re.IGNORECASE),
            'numero': re.compile(r'(n[°o]|num[ée]?ro|ref|reference|[a-z]{2,3}[\-]?[0-9]{4,})', re.IGNORECASE),
            'prix': re.compile(r'(prix|price|montant|amount|total|[0-9]+[,.]?[0-9]*\s?€|[0-9]+[,.]?[0-9]*)', re.IGNORECASE),
            'prestation': re.compile(r'(prestation|service|main[\s-]?d[\']?[oe]uvre|intervention|travail|work)', re.IGNORECASE),
            'fourniture': re.compile(r'(fourniture|mat[ée]riel|material|produit|product|achat)', re.IGNORECASE),
            'quantite': re.compile(r'(qt[ée]?|quantit[ée]|nombre|number|unité|unit)', re.IGNORECASE)
        }
        
        self.item_type_keywords = {
            'service': ['prestation', 'service', 'main d\'œuvre', 'main d oeuvre', 'main dœuvre', 
                      'intervention', 'travail', 'heures?', 'h\.?', 'pose', 'installation', 
                      'réparation', 'dépannage', 'maintenance', 'devis', 'diagnostic'],
            'supply': ['fourniture', 'matériel', 'material', 'produit', 'tuyau', 'robinet', 
                     'chaudière', 'radiateur', 'pompe', 'vanne', 'pipe', 'tube', 'cable', 
                     'fil', 'vis', 'boulon', 'joint', 'colle', 'peinture']
        }
    
    def extract_from_pdf(self, file_path: str) -> ExtractionResult:
        """Extrait les données d'un fichier PDF"""
        start_time = datetime.now()
        result = ExtractionResult()
        
        try:
            # Essayer avec PyPDF2 d'abord
            if HAS_PYPDF2:
                text = self._extract_text_with_pypdf2(file_path)
            elif HAS_PDFMINER:
                text = self._extract_text_with_pdfminer(file_path)
            else:
                raise ImportError("Aucune bibliothèque PDF disponible (PyPDF2 ou pdfminer)")
            
            if not text:
                result.success = False
                result.errors.append("Aucun texte extrait du PDF")
                return result
            
            # Extraire les données
            result.document = self._parse_extracted_text(text, file_path)
            result.document.source = file_path
            
        except Exception as e:
            result.success = False
            result.errors.append(f"Erreur lors de l'extraction PDF: {str(e)}")
        
        result.processing_time = (datetime.now() - start_time).total_seconds()
        return result
    
    def extract_from_image(self, file_path: str) -> ExtractionResult:
        """Extrait le texte d'une image (OCR)"""
        start_time = datetime.now()
        result = ExtractionResult()
        
        try:
            if not HAS_TESSERACT:
                raise ImportError("Tesseract OCR non disponible")
            
            # Ouvrir l'image
            img = Image.open(file_path)
            
            # Extraire le texte
            text = pytesseract.image_to_string(img, lang='fra')
            
            if not text:
                result.success = False
                result.errors.append("Aucun texte détecté dans l'image")
                return result
            
            # Extraire les données
            result.document = self._parse_extracted_text(text, file_path)
            result.document.source = file_path
            
        except Exception as e:
            result.success = False
            result.errors.append(f"Erreur lors de l'extraction OCR: {str(e)}")
        
        result.processing_time = (datetime.now() - start_time).total_seconds()
        return result
    
    def extract_from_docx(self, file_path: str) -> ExtractionResult:
        """Extrait les données d'un document Word"""
        start_time = datetime.now()
        result = ExtractionResult()
        
        try:
            if not HAS_DOCX:
                raise ImportError("python-docx non disponible")
            
            doc = Document(file_path)
            text = '\n'.join([para.text for para in doc.paragraphs])
            
            if not text:
                result.success = False
                result.errors.append("Aucun texte extrait du document Word")
                return result
            
            # Extraire les données
            result.document = self._parse_extracted_text(text, file_path)
            result.document.source = file_path
            
        except Exception as e:
            result.success = False
            result.errors.append(f"Erreur lors de l'extraction Word: {str(e)}")
        
        result.processing_time = (datetime.now() - start_time).total_seconds()
        return result
    
    def extract_from_text(self, text: str, source: str = "") -> ExtractionResult:
        """Extrait les données d'un texte brut"""
        start_time = datetime.now()
        result = ExtractionResult()
        
        try:
            if not text:
                result.success = False
                result.errors.append("Aucun texte à analyser")
                return result
            
            result.document = self._parse_extracted_text(text, source)
            result.document.source = source
            
        except Exception as e:
            result.success = False
            result.errors.append(f"Erreur lors de l'extraction: {str(e)}")
        
        result.processing_time = (datetime.now() - start_time).total_seconds()
        return result
    
    def _extract_text_with_pypdf2(self, file_path: str) -> str:
        """Extrait le texte avec PyPDF2"""
        text = ""
        with open(file_path, 'rb') as file:
            reader = PdfReader(file)
            for page in reader.pages:
                text += page.extract_text() + "\n"
        return text
    
    def _extract_text_with_pdfminer(self, file_path: str) -> str:
        """Extrait le texte avec pdfminer"""
        return pdfminer_extract_text(file_path)
    
    def _parse_extracted_text(self, text: str, source: str) -> ExtractedDocument:
        """Parse le texte extrait pour en extraire les données structurées"""
        doc = ExtractedDocument()
        doc.source = source
        
        # Déterminer le type de document
        doc.document_type = self._determine_document_type(text, source)
        
        # Extraire le numéro de document
        doc.document_number = self._extract_document_number(text, source)
        
        # Extraire la date
        doc.date = self._extract_date(text)
        
        # Extraire les informations client
        doc.client = self._extract_client_info(text)
        
        # Extraire les adresses
        doc.addresses = self._extract_addresses(text)
        
        # Extraire les items
        doc.items = self._extract_items(text, doc.document_type)
        
        # Calculer le total
        doc.total = sum(item.total for item in doc.items)
        
        # Extraire la TVA
        doc.tax = self._extract_tax(text)
        
        # Extraire les notes
        doc.notes = self._extract_notes(text)
        
        return doc
    
    def _determine_document_type(self, text: str, source: str) -> str:
        """Détermine le type de document"""
        text_lower = text.lower()
        source_lower = source.lower()
        
        if self.patterns['facture'].search(source_lower):
            return 'facture'
        if self.patterns['devis'].search(source_lower):
            return 'devis'
        if self.patterns['facture'].search(text_lower):
            return 'facture'
        if self.patterns['devis'].search(text_lower):
            return 'devis'
        
        return 'devis'  # Par défaut
    
    def _extract_document_number(self, text: str, source: str) -> str:
        """Extrait le numéro de document"""
        # Patterns pour les numéros de documents
        patterns = [
            r'(DEV|FAC|DEVIS|FACTURE)[\s\-]?([A-Z0-9\-]+)',
            r'(n[°o]|num[ée]?ro)[\s\-]?([A-Z0-9\-]+)',
            r'([A-Z]{2,4})[\-](\d{4})[\-](\d{3,5})',
            r'(\d{4})[\-](\d{3,5})'
        ]
        
        text_lower = text.lower()
        source_lower = source.lower()
        
        for pattern in patterns:
            match = re.search(pattern, source_lower, re.IGNORECASE)
            if match:
                return ''.join(match.groups()).upper()
            
            match = re.search(pattern, text_lower, re.IGNORECASE)
            if match:
                return ''.join(match.groups()).upper()
        
        return ""
    
    def _extract_date(self, text: str) -> str:
        """Extrait une date"""
        patterns = [
            r'(\d{2})[\/\-](\d{2})[\/\-](\d{4})',
            r'(\d{4})[\/\-](\d{2})[\/\-](\d{2})'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                # Reformat to YYYY-MM-DD
                if len(match.group(1)) == 2:  # JJ-MM-AAAA
                    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}"
                else:  # AAAA-MM-JJ
                    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
        
        return ""
    
    def _extract_client_info(self, text: str) -> ExtractedClient:
        """Extrait les informations client"""
        client = ExtractedClient()
        
        # Extraire le nom
        client_patterns = [
            r'(client|nom|soci[ée]t[ée]|raison[\s-]?sociale|intitul[ée])[\s:]*([a-z0-9\s\-.,]+)',
            r'(à|pour|factur[ée]?|devis[\s-]?à)[\s:]*([a-z0-9\s\-.,]+)'
        ]
        
        for pattern in client_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                client.name = match.group(2).strip()
                break
        
        # Extraire l'email
        email_match = re.search(r'[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', text, re.IGNORECASE)
        if email_match:
            client.email = email_match.group(0)
        
        # Extraire le téléphone
        phone_match = re.search(r'(\+?\d[\d\s\-\.]*){8,15}', text)
        if phone_match:
            client.phone = re.sub(r'[^\d\+]', '', phone_match.group(0))
        
        # Extraire le SIRET
        siret_match = re.search(r'siret[\s:]*([a-z0-9\s\-]+)', text, re.IGNORECASE)
        if siret_match:
            client.siret = re.sub(r'[^\d]', '', siret_match.group(1))
        
        # Extraire le numéro de TVA
        tva_match = re.search(r'(tva|n[°o]\s*tva|vat)[\s:]*([a-z0-9\s\-]+)', text, re.IGNORECASE)
        if tva_match:
            client.tva = re.sub(r'[^a-z0-9]', '', tva_match.group(2), flags=re.IGNORECASE)
        
        return client
    
    def _extract_addresses(self, text: str) -> List[ExtractedAddress]:
        """Extrait les adresses"""
        addresses = []
        
        # Patterns pour les adresses
        address_patterns = [
            r'(\d{1,5}\s+[a-z0-9\s\-.,]+)[\s,]+(\d{5})[\s,]+([a-z0-9\s\-.,]+)',
            r'(\d{1,5}\s+[a-z0-9\s\-.,]+)',
            r'(\d{5})[\s,]+([a-z0-9\s\-.,]+)'
        ]
        
        # Mots-clés pour identifier les adresses
        address_keywords = ['adresse', 'address', 'rue', 'street', 'avenue', 'bd', 'boulevard', 
                           'route', 'lieu', 'chantier']
        
        lines = text.split('\n')
        current_address = None
        
        for line in lines:
            line_lower = line.lower()
            
            # Vérifier si la ligne contient un mot-clé d'adresse
            has_address_keyword = any(keyword in line_lower for keyword in address_keywords)
            
            if has_address_keyword:
                # Si on a déjà une adresse en cours, la sauvegarder
                if current_address:
                    addresses.append(self._parse_address(current_address))
                
                # Commencer une nouvelle adresse
                current_address = {
                    'type': 'unknown',
                    'lines': [line]
                }
                
                # Déterminer le type d'adresse
                if any(kw in line_lower for kw in ['facturation', 'billing']):
                    current_address['type'] = 'facturation'
                elif any(kw in line_lower for kw in ['chantier', 'site', 'livraison']):
                    current_address['type'] = 'chantier'
                elif any(kw in line_lower for kw in ['siège', 'social']):
                    current_address['type'] = 'siege'
            elif current_address:
                # Ajouter la ligne à l'adresse en cours
                current_address['lines'].append(line)
        
        # Ajouter la dernière adresse si elle existe
        if current_address:
            addresses.append(self._parse_address(current_address))
        
        # Déterminer l'adresse de facturation par défaut
        billing_index = next((i for i, addr in enumerate(addresses) if addr.address_type in ['facturation', 'siege']), -1)
        
        if billing_index != -1:
            # Mettre l'adresse de facturation en premier
            billing_address = addresses.pop(billing_index)
            addresses.insert(0, billing_address)
        
        return addresses
    
    def _parse_address(self, address_data: Dict) -> ExtractedAddress:
        """Parse une adresse"""
        address_text = ' '.join(address_data['lines'])
        
        street = ""
        postal_code = ""
        city = ""
        country = ""
        
        # Extraire le code postal et la ville
        pc_city_match = re.search(r'(\d{5})[\s,]+([a-z0-9\s\-.,]+)', address_text, re.IGNORECASE)
        if pc_city_match:
            postal_code = pc_city_match.group(1)
            city = pc_city_match.group(2).strip()
        
        # Le reste est la rue
        street_match = re.search(r'(.+?)(?:\d{5}|$)', address_text, re.IGNORECASE)
        if street_match:
            street = street_match.group(1)
            street = re.sub(r'[\s]+', ' ', street)
            street = re.sub(r'[^a-z0-9\s\-.,#]', '', street, flags=re.IGNORECASE)
            street = street.strip()
        
        return ExtractedAddress(
            street=street,
            postal_code=postal_code,
            city=city,
            country=country,
            address_type=address_data['type'],
            full_address=address_text
        )
    
    def _extract_items(self, text: str, doc_type: str) -> List[ExtractedItem]:
        """Extrait les items (prestations et fournitures)"""
        items = []
        
        lines = text.split('\n')
        current_item = None
        in_table = False
        table_headers = []
        
        for line in lines:
            line_lower = line.lower()
            
            # Détecter le début d'un tableau
            if not in_table and any(kw in line_lower for kw in ['désignation', 'description', 'article', 
                                                                    'prestation', 'fourniture']):
                in_table = True
                table_headers = [self._normalize_text(h) for h in re.split(r'[\t\s]{2,}', line)]
                continue
            
            # Détecter la fin du tableau
            if in_table and (not line.strip() or any(kw in line_lower for kw in ['total', 'sous-total', 'montant total'])):
                in_table = False
                table_headers = []
                
                if current_item:
                    items.append(current_item)
                    current_item = None
                continue
            
            if in_table:
                if not current_item or not line.strip():
                    if current_item:
                        items.append(current_item)
                    current_item = None
                    continue
                
                if not current_item:
                    current_item = ExtractedItem()
                
                # Parser la ligne du tableau
                values = re.split(r'[\t\s]{2,}', line)
                
                for j, value in enumerate(values):
                    if j >= len(table_headers):
                        break
                    
                    header = table_headers[j]
                    value = value.strip()
                    
                    if not value:
                        continue
                    
                    if any(kw in header for kw in ['designation', 'description', 'article', 'prestation', 'fourniture']):
                        current_item.name = value
                        current_item.item_type = self._determine_item_type(value)
                    elif any(kw in header for kw in ['quantite', 'qty', 'nombre']):
                        current_item.quantity = self._parse_number(value)
                    elif any(kw in header for kw in ['prix', 'price', 'unit', 'pu', 'prix unitaire']):
                        current_item.unit_price = self._parse_amount(value)
                    elif any(kw in header for kw in ['montant', 'total', 'amount']):
                        current_item.total = self._parse_amount(value)
                        if current_item.unit_price == 0 and current_item.quantity > 1:
                            current_item.unit_price = current_item.total / current_item.quantity
                    elif any(kw in header for kw in ['unité', 'unit']):
                        current_item.unit = value
            else:
                # Recherche hors tableau
                item_patterns = [
                    r'([a-z0-9\s\-.,]+)\s+([\d\s]+[,.]?[\d\s]*)\s?€',
                    r'([\d\s]+[,.]?[\d\s]*)\sx\s([a-z0-9\s\-.,]+)\s+([\d\s]+[,.]?[\d\s]*)\s?€'
                ]
                
                for pattern in item_patterns:
                    match = re.match(pattern, line, re.IGNORECASE)
                    if match:
                        item = ExtractedItem()
                        item.item_type = self._determine_item_type(line)
                        
                        if 'x' in pattern:
                            item.quantity = self._parse_number(match.group(1))
                            item.name = match.group(2).strip()
                            item.unit_price = self._parse_amount(match.group(3))
                            item.total = item.quantity * item.unit_price
                        else:
                            item.name = match.group(1).strip()
                            item.unit_price = self._parse_amount(match.group(2))
                            item.total = item.unit_price
                        
                        items.append(item)
                        break
        
        # Ajouter le dernier item si nécessaire
        if current_item and (current_item.name or current_item.total > 0):
            if current_item.item_type == 'unknown':
                current_item.item_type = self._determine_item_type(current_item.name)
            
            if current_item.unit_price > 0 and current_item.quantity > 0 and current_item.total == 0:
                current_item.total = current_item.quantity * current_item.unit_price
            elif current_item.total > 0 and current_item.quantity > 0 and current_item.unit_price == 0:
                current_item.unit_price = current_item.total / current_item.quantity
            
            items.append(current_item)
        
        # Nettoyer les items
        cleaned_items = []
        for item in items:
            if item.name or item.total > 0:
                if item.item_type == 'unknown':
                    item.item_type = 'service'
                cleaned_items.append(item)
        
        return cleaned_items
    
    def _determine_item_type(self, text: str) -> str:
        """Détermine le type d'item"""
        text_lower = self._normalize_text(text)
        
        for kw in self.item_type_keywords['service']:
            if kw in text_lower:
                return 'service'
        
        for kw in self.item_type_keywords['supply']:
            if kw in text_lower:
                return 'supply'
        
        return 'service'  # Par défaut
    
    def _extract_tax(self, text: str) -> float:
        """Extrait la TVA/taxes"""
        tva_patterns = [
            r'tva[\s:]*([\d.,]+)\s?%',
            r'tv[ae][\s:]*([\d.,]+)\s?%',
            r'([\d.,]+)\s?%\s*tva',
            r'([\d.,]+)\s?%\s*tv[ae]'
        ]
        
        for pattern in tva_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                for group in match.groups():
                    if group:
                        rate = self._parse_number(group.replace(',', '.'))
                        if rate is not None:
                            return rate
        
        return 20.0  # Valeur par défaut (20% en France)
    
    def _extract_notes(self, text: str) -> str:
        """Extrait les notes/remarques"""
        notes = []
        lines = text.split('\n')
        
        note_keywords = ['remarque', 'note', 'commentaire', 'observation', 'info', 'information']
        
        for i, line in enumerate(lines):
            line_lower = line.lower()
            
            if any(keyword in line_lower for keyword in note_keywords):
                note_line = line
                next_index = i + 1
                
                while next_index < len(lines) and lines[next_index].strip():
                    next_line_lower = lines[next_index].lower()
                    
                    if (re.match(r'^[a-z0-9\s\-]+:\s*$', next_line_lower) or
                        'total' in next_line_lower or
                        'sous-total' in next_line_lower or
                        'montant' in next_line_lower):
                        break
                    
                    note_line += '\n' + lines[next_index]
                    next_index += 1
                
                notes.append(note_line)
        
        return '\n\n'.join(notes)
    
    def _normalize_text(self, text: str) -> str:
        """Nettoie et normalise une chaîne de caractères"""
        if not text:
            return ''
        
        import unicodedata
        text = text.lower()
        text = unicodedata.normalize('NFD', text)
        text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
        text = re.sub(r'[^a-z0-9\s\-]', '', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    def _parse_number(self, text: str) -> float:
        """Parse un nombre"""
        if not text:
            return 0.0
        
        text = re.sub(r'[^\d.]', '', text)
        text = text.replace(',', '.')
        
        try:
            return float(text)
        except ValueError:
            return 0.0
    
    def _parse_amount(self, text: str) -> float:
        """Parse un montant monétaire"""
        if not text:
            return 0.0
        
        # Supprimer les symboles monétaires
        text = re.sub(r'[\s]?€|euro|euros', '', text, flags=re.IGNORECASE)
        
        # Extraire le nombre
        text = re.sub(r'[^\d.,]', '', text)
        text = text.replace(',', '.')
        
        try:
            return float(text)
        except ValueError:
            return 0.0


class APIConnector:
    """Connecteur pour les API externes d'extraction"""
    
    def __init__(self, api_key: str = None, base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url or "https://api.example.com/v1"
        self.session = None
        
        if HAS_REQUESTS:
            self.session = requests.Session()
            if api_key:
                self.session.headers.update({'Authorization': f'Bearer {api_key}'})
    
    def extract_document(self, file_path: str, document_type: str = None) -> ExtractionResult:
        """Envoie un document à une API externe pour extraction"""
        result = ExtractionResult()
        
        if not HAS_REQUESTS:
            result.success = False
            result.errors.append("Bibliothèque requests non disponible")
            return result
        
        try:
            # Lire le fichier
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            # Envoyer à l'API
            response = self.session.post(
                f"{self.base_url}/extract",
                files={'document': (os.path.basename(file_path), file_content)},
                data={'type': document_type}
            )
            
            if response.status_code != 200:
                result.success = False
                result.errors.append(f"API Error: {response.status_code} - {response.text}")
                return result
            
            # Parser la réponse
            data = response.json()
            
            # Convertir en objet ExtractedDocument
            result.document = self._parse_api_response(data)
            result.document.source = file_path
            
        except Exception as e:
            result.success = False
            result.errors.append(f"Erreur API: {str(e)}")
        
        return result
    
    def _parse_api_response(self, data: Dict) -> ExtractedDocument:
        """Parse la réponse de l'API"""
        doc = ExtractedDocument()
        
        doc.document_type = data.get('document_type', 'devis')
        doc.document_number = data.get('document_number', '')
        doc.date = data.get('date', '')
        
        # Client
        client_data = data.get('client', {})
        doc.client = ExtractedClient(
            name=client_data.get('name', ''),
            company=client_data.get('company', ''),
            siret=client_data.get('siret', ''),
            tva=client_data.get('tva', ''),
            email=client_data.get('email', ''),
            phone=client_data.get('phone', '')
        )
        
        # Adresses
        for addr_data in data.get('addresses', []):
            doc.addresses.append(ExtractedAddress(
                street=addr_data.get('street', ''),
                postal_code=addr_data.get('postal_code', ''),
                city=addr_data.get('city', ''),
                country=addr_data.get('country', ''),
                address_type=addr_data.get('type', 'unknown'),
                full_address=addr_data.get('full_address', '')
            ))
        
        # Items
        for item_data in data.get('items', []):
            doc.items.append(ExtractedItem(
                name=item_data.get('name', ''),
                description=item_data.get('description', ''),
                item_type=item_data.get('type', 'service'),
                quantity=item_data.get('quantity', 1.0),
                unit=item_data.get('unit', ''),
                unit_price=item_data.get('unit_price', 0.0),
                total=item_data.get('total', 0.0),
                category=item_data.get('category', '')
            ))
        
        doc.total = data.get('total', 0.0)
        doc.tax = data.get('tax', 0.0)
        doc.currency = data.get('currency', '€')
        doc.notes = data.get('notes', '')
        
        return doc


# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

def get_file_type(filename: str) -> str:
    """Détermine le type de fichier à partir du nom"""
    extension = os.path.splitext(filename)[1].lower()
    
    if extension == '.pdf':
        return 'pdf'
    elif extension in ['.jpg', '.jpeg']:
        return 'image/jpeg'
    elif extension == '.png':
        return 'image/png'
    elif extension == '.doc':
        return 'document/msword'
    elif extension == '.docx':
        return 'document/docx'
    else:
        return 'unknown'


def format_file_size(size_bytes: int) -> str:
    """Formate la taille d'un fichier"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def validate_file(file_path: str, max_size_mb: int = 50) -> Tuple[bool, str]:
    """Valide un fichier"""
    if not os.path.exists(file_path):
        return False, "Fichier introuvable"
    
    file_size = os.path.getsize(file_path)
    max_size_bytes = max_size_mb * 1024 * 1024
    
    if file_size > max_size_bytes:
        return False, f"Fichier trop volumineux (max {max_size_mb} Mo)"
    
    file_type = get_file_type(file_path)
    
    if file_type == 'unknown':
        return False, "Type de fichier non supporté"
    
    return True, "Valide"


# ============================================================================
# EXPORT
# ============================================================================

if __name__ == "__main__":
    # Exemple d'utilisation
    extractor = DocumentExtractor()
    
    # Tester avec un fichier PDF
    if os.path.exists("test.pdf"):
        result = extractor.extract_from_pdf("test.pdf")
        print(f"Extraction PDF: {'Succès' if result.success else 'Échec'}")
        if result.success:
            print(f"Type: {result.document.document_type}")
            print(f"Client: {result.document.client.name}")
            print(f"Items: {len(result.document.items)}")
    
    # Tester avec un fichier image
    if os.path.exists("test.png") and HAS_TESSERACT:
        result = extractor.extract_from_image("test.png")
        print(f"Extraction Image: {'Succès' if result.success else 'Échec'}")
        if result.success:
            print(f"Type: {result.document.document_type}")
            print(f"Client: {result.document.client.name}")
    
    # Tester avec un fichier Word
    if os.path.exists("test.docx") and HAS_DOCX:
        result = extractor.extract_from_docx("test.docx")
        print(f"Extraction Word: {'Succès' if result.success else 'Échec'}")
        if result.success:
            print(f"Type: {result.document.document_type}")
            print(f"Client: {result.document.client.name}")

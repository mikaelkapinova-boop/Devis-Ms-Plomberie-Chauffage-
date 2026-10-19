# Devis – Ms Plomberie & Chauffage

Application web (PWA, installable sur téléphone) de gestion pour artisan plombier-chauffagiste :
devis, factures, rapports d'intervention, clients, tarifs avec marge, planning, bénéfices et .

Site : https://mikaelkapinova-boop.github.io/Devis-Ms-Plomberie-Chauffage-/

## Structure
- `index.html` — application (une seule page) ; `js/ext.js` — réglages, , planning, tarifs, sauvegarde ; `js/chat2.js` — tchat Computer intégré, types de demande, corbeille, glisser pour supprimer, sélection multiple, brouillons ; `js/logo.js` — logos (fond transparent).
- `serveur.py` + `lancer.bat` — pont local vers  (OAuth avec ton compte, sans clé API).
- `img/` — logo et icônes ; `manifest.webmanifest` + `sw.js` — mode application / hors-ligne.
- `inbox/` — éléments déposés par Perplexity (devis, tarifs, planning) à importer dans l'appli. Voir `inbox/README.md`.
- `data/store.json` — sauvegarde chiffrée partagée (via jeton GitHub).

## Synchronisation entre téléphones

Ouvre **Réglages → Synchronisation entre téléphones** sur les deux iPhones. Connecte-les avec le même identifiant et le même mot de passe, puis saisis sur chacun le même jeton GitHub avec l’autorisation **Contents : lecture et écriture** pour ce dépôt. Les devis, factures, clients, tarifs, achats, rapports, planning et pièces jointes sont chiffrés avant l’envoi et se synchronisent automatiquement toutes les 3 secondes quand l’application est ouverte et en ligne. Le jeton reste enregistré uniquement sur chaque appareil.

## Passerelle Perplexity
Depuis l'onglet ****, « Envoyer à Perplexity » envoie la demande par e-mail (sujet `[DEVIS]`).
Une automatisation Perplexity lit l'e-mail, prépare le résultat et le dépose dans `inbox/` (ou modifie l'appli), puis l'appli le propose à l'import.

## Assistant local gratuit
Dans l'assistant, ouvre le bouton du moteur et sélectionne **Assistant local · gratuit**. Ce mode ne requiert ni compte, ni clé API, ni abonnement : il exécute des règles et des calculs dans le navigateur, puis recherche dans les devis, factures, rapports, clients, tarifs, planning et achats enregistrés sur cet appareil. Il peut aussi préparer une carte de devis/facture à partir de lignes déjà chiffrées, sans inventer les prix. Les résultats de recherche incluent des boutons pour ouvrir les éléments trouvés.

La recherche floue utilise [Fuse.js 7.5.0](https://github.com/krisk/Fuse), intégré au dépôt sous licence Apache 2.0 (`js/vendor/FUSE-LICENSE.txt`). Les historiques de moins de 10 000 éléments utilisent le moteur simple; les plus grands peuvent basculer sur `FuseWorker`, qui répartit la recherche sur plusieurs cœurs du processeur. Le code, le moteur et les données de recherche sont servis par l'application; aucune demande n'est envoyée à Perplexity ou à un moteur distant. Le cache local permet de retrouver ces fonctions hors connexion après le premier chargement.

Ce mode reste déterministe : il ne répond pas aux questions générales, ne recherche pas de prix sur Internet et ne modifie pas automatiquement un document existant. Pour lire un fichier joint, il réutilise le lecteur local de l'importateur; celui-ci peut télécharger ses bibliothèques de lecture/OCR au premier usage, mais n'envoie pas le fichier.

##  v3.5

- **Conversations séparées** (☰) : chaque sujet garde son historique, sa demande, son IA, son modèle et son mode.
- **Menu Demande** : créer / modifier un devis ou une facture, faire un rapport, recherche de prix, améliorer l'appli, projet IA, autre. Les réponses JSON créent ou modifient automatiquement le document (modification annulable).
- **Menu IA** :
  - *Perplexity* (dans l'appli, PC et iPhone) : Agent API `https://api.perplexity.ai/v1/agent`, clé API Perplexity (facturée à l'usage, séparée de l'abonnement Pro). Tous les modèles de l'API avec leur identifiant exact.
  - *Computer* (dans l'appli) : pont `serveur.py` (MCP + OAuth, crédits Computer). Le modèle choisi est demandé à Computer comme sous-agent.
  - ** : ouvre le chat Perplexity pré-rempli ; coller la réponse dans l'appli pour l'appliquer.
  - *Computer e-mail* et *Sans IA* (liste rapide).
- **Modes** : Rapide / Raisonnement / Profond (méthode de travail + `reasoning.effort` low / medium / high).
- **Orchestre** (`js/models.js`) : fiche de chaque modèle (façon de raisonner, points forts, consignes), règles communes, et orchestrateur « Auto » qui choisit le modèle selon la demande et le mode.
- Service worker « réseau d'abord » : les mises à jour s'affichent sans vider le cache.

## Computer dans l'appli (v3.4)
1. Sur le PC : double-clic sur `lancer.bat` (Python 3 requis, rien à installer). L'appli s'ouvre sur http://127.0.0.1:8765.
2. Onglet **** → mode « Computer (dans l'appli) » → **Se connecter** (compte Perplexity, une seule fois).
3. Choisis le type de demande (Documents ou Application) et écris : la réponse arrive dans le tchat, les devis/factures sont créés automatiquement.

Le site GitHub Pages peut aussi utiliser le pont s'il tourne sur le même PC. Le jeton OAuth reste dans `tokens.json` (jamais envoyé sur GitHub).

## Corbeille
Glisse un devis, une facture ou un rapport vers la gauche → « Supprimer ». « Sélectionner » permet de tout cocher et supprimer d'un coup. Tout part dans la **Corbeille** (restaurer, effacer, vider).


## Ms Devis 6.0 — Bridge PC
La V6 utilise une application locale optionnelle sur le PC. La page `bridge/` sert de point de téléchargement et d'instructions. Le PC exécute le bridge, tandis que l'iPhone reste uniquement l'interface utilisateur. Aucune clé API ou identifiant n'est stocké dans le dépôt.

## Import intelligent (v6.1)
Menu **Importer** : choisir un ou plusieurs fichiers (PDF, scan/photo avec OCR, Word `.docx`, texte ou CSV). L’extraction et la reconnaissance sont locales et fonctionnent sans IA ; seules les bibliothèques de lecture de fichiers et l’OCR nécessitent une connexion. Sélectionner la reconnaissance automatique ou un type précis : devis, facture, rapport, clients (CSV/VCF), fournitures, main-d'œuvre ou objets/travaux réutilisables.
1. L'extracteur (`js/importer.js`) reconnaît les données et propose un aperçu modifiable avant enregistrement. Pour éviter de confondre l’entreprise et le client, les coordonnées client d’un document ne sont extraites que depuis un bloc « Client / Destinataire » clairement identifié ; les coordonnées correspondant au profil de l’entreprise sont exclues.
2. Les devis, factures et rapports sont recréés dans la mise en page de l'appli ; les clients et tarifs peuvent être importés seuls, sans créer de document. Les modèles « Objet / travaux » importés sont disponibles dans l'éditeur de devis.
3. Les fichiers et lignes en attente peuvent être retirés, y compris par glissement vers la gauche sur mobile.

Limites : l'OCR et les bibliothèques PDF/Word se chargent depuis Internet ; `.doc` ancien format non lu (enregistrer en `.docx`) ; la qualité d'un scan flou limite l'extraction, d'où l'écran de vérification.

## Ms Devis 7.3 — Lignes compactes et achats
- Les lignes de devis et facture sont compactes et colorées : bleu pour les fournitures, violet pour la main-d’œuvre. Une désignation, son prix et son unité peuvent être mémorisés depuis la ligne, puis retrouvés dans Mes tarifs avec une recherche.
- La main-d’œuvre peut être répartie par pièce. Les pièces, affectations et sous-totaux sont repris dans l’aperçu imprimable.
- L’importateur des achats accepte les tickets et factures fournisseur en PDF, photo, DOCX, TXT et CSV. Après vérification, chaque justificatif peut être classé au mois comptable ou rattaché à un chantier, avec suivi des dépenses et du solde provisoire.
- Les montants d’import restent à vérifier avant validation. Un HT sans TVA lisible est affiché comme montant disponible et n’est pas présenté comme un TTC estimé.

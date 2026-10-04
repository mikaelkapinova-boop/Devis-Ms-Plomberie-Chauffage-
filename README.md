# Devis – Ms Plomberie & Chauffage

Application web (PWA, installable sur téléphone) de gestion pour artisan plombier-chauffagiste :
devis, factures, rapports d'intervention, clients, tarifs avec marge, planning, bénéfices et assistant.

Site : https://mikaelkapinova-boop.github.io/Devis-Ms-Plomberie-Chauffage-/

## Structure
- `index.html` — application (une seule page) ; `js/ext.js` — réglages, assistant, planning, tarifs, sauvegarde ; `js/chat2.js` — tchat Computer intégré, types de demande, corbeille, glisser pour supprimer, sélection multiple, brouillons ; `js/logo.js` — logos (fond transparent).
- `serveur.py` + `lancer.bat` — serveur local pour Computer et pour la connexion officielle à ChatGPT.
- `img/` — logo et icônes ; `manifest.webmanifest` + `sw.js` — mode application / hors-ligne.
- `inbox/` — éléments déposés par Perplexity (devis, tarifs, planning) à importer dans l'appli. Voir `inbox/README.md`.
- `data/store.json` — sauvegarde synchronisée (optionnelle, via jeton GitHub).

## Passerelle Perplexity
Depuis l'onglet **Assistant**, « Envoyer à Perplexity » envoie la demande par e-mail (sujet `[DEVIS]`).
Une automatisation Perplexity lit l'e-mail, prépare le résultat et le dépose dans `inbox/` (ou modifie l'appli), puis l'appli le propose à l'import.

## Assistant v3.5

- **Conversations séparées** (☰) : chaque sujet garde son historique, sa demande, son IA, son modèle et son mode.
- **Menu Demande** : créer / modifier un devis ou une facture, faire un rapport, recherche de prix, améliorer l'appli, projet IA, autre. Les propositions JSON de devis et de facture restent en attente dans le tchat : rien n’est créé ni modifié avant que tu choisisses « Créer en brouillon » ou « Appliquer ». Tu peux refuser une proposition; une modification appliquée reste annulable.
- **Menu IA** :
  - *Perplexity* (dans l'appli, PC et iPhone) : Agent API `https://api.perplexity.ai/v1/agent`, clé API Perplexity (facturée à l'usage, séparée de l'abonnement Pro). Tous les modèles de l'API avec leur identifiant exact.
  - *ChatGPT (compte)* : connexion officielle [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) depuis le PC qui héberge `serveur.py`, modèles visibles selon le compte; utilise les limites du forfait ChatGPT, sans clé API. Les messages et pièces jointes sont envoyés à OpenAI. Son historique reste distinct des conversations ChatGPT existantes.
  - *Computer* (dans l'appli) : pont `serveur.py` (MCP + OAuth, crédits Computer). Le modèle choisi est demandé à Computer comme sous-agent.
  - *Perplexity Pro* : ouvre le chat Perplexity pré-rempli ; coller la réponse dans l'appli pour l'appliquer.
  - *Computer e-mail* et *Sans IA* (liste rapide).
- **Modes** : Rapide / Raisonnement / Profond (méthode de travail + `reasoning.effort` low / medium / high).
- **Orchestre** (`js/models.js`) : fiche de chaque modèle (façon de raisonner, points forts, consignes), règles communes, et orchestrateur « Auto » qui choisit le modèle selon la demande et le mode.
- Service worker « réseau d'abord » : les mises à jour s'affichent sans vider le cache.

## Computer dans l'appli (v3.4)
1. Sur le PC : double-clic sur `lancer.bat` (Python 3 requis, rien à installer). L'appli s'ouvre sur http://127.0.0.1:8765.
2. Onglet **Assistant** → mode « Computer (dans l'appli) » → **Se connecter** (compte Perplexity, une seule fois).
3. Choisis le type de demande et écris : une proposition de devis ou de facture arrive dans le tchat, puis tu choisis de la créer en brouillon, de l'appliquer ou de la refuser.

Le site GitHub Pages peut aussi utiliser le pont s'il tourne sur le même PC. Les jetons OAuth restent localement dans `tokens.json` (jamais envoyés sur GitHub).

## ChatGPT dans l'application
1. Sur le PC : lance `lancer.bat` pour démarrer le serveur local.
2. Dans **Assistant → Intelligence artificielle**, choisis **ChatGPT (compte)** puis **Continue with ChatGPT**. Autorise l'application dans la fenêtre ouverte sur ce PC.
3. Choisis un modèle disponible sur ton compte, puis discute, joins une photo ou un PDF, ou demande un devis. Les propositions de devis restent en attente jusqu'à ta validation.

Cette connexion ne requiert pas de clé API. Elle utilise les limites de ton forfait ChatGPT. Elle ouvre un fil propre à l'application; elle ne lit pas tes conversations ChatGPT existantes. Le serveur conserve les jetons OAuth dans `tokens.json` sur le PC, ignoré par Git.

## Corbeille
Glisse un devis, une facture ou un rapport vers la gauche → « Supprimer ». « Sélectionner » permet de tout cocher et supprimer d'un coup. Tout part dans la **Corbeille** (restaurer, effacer, vider).


## Ms Devis 6.0 — Bridge PC
La V6 utilise une application locale optionnelle sur le PC. La page `bridge/` sert de point de téléchargement et d'instructions. Le PC exécute le bridge, tandis que l'iPhone reste uniquement l'interface utilisateur. Aucune clé API ou identifiant n'est stocké dans le dépôt.

# Devis – Ms Plomberie & Chauffage

Application web (PWA, installable sur téléphone) de gestion pour artisan plombier-chauffagiste :
devis, factures, rapports d'intervention, clients, tarifs avec marge, planning, bénéfices et assistant.

Site : https://mikaelkapinova-boop.github.io/Devis-Ms-Plomberie-Chauffage-/

## Structure
- `index.html` — application (une seule page) ; `js/ext.js` — réglages, assistant, planning, tarifs, sauvegarde ; `js/chat2.js` — tchat Computer intégré, types de demande, corbeille, glisser pour supprimer, sélection multiple, brouillons ; `js/logo.js` — logos (fond transparent).
- `serveur.py` + `lancer.bat` — pont local vers Perplexity Computer (OAuth avec ton compte, sans clé API).
- `img/` — logo et icônes ; `manifest.webmanifest` + `sw.js` — mode application / hors-ligne.
- `inbox/` — éléments déposés par Perplexity (devis, tarifs, planning) à importer dans l'appli. Voir `inbox/README.md`.
- `data/store.json` — sauvegarde synchronisée (optionnelle, via jeton GitHub).

## Passerelle Perplexity
Depuis l'onglet **Assistant**, « Envoyer à Perplexity » envoie la demande par e-mail (sujet `[DEVIS]`).
Une automatisation Perplexity lit l'e-mail, prépare le résultat et le dépose dans `inbox/` (ou modifie l'appli), puis l'appli le propose à l'import.

## Assistant v3.5

- **Conversations séparées** (☰) : chaque sujet garde son historique, sa demande, son IA, son modèle et son mode.
- **Menu Demande** : créer / modifier un devis ou une facture, faire un rapport, recherche de prix, améliorer l'appli, projet IA, autre. Les réponses JSON créent ou modifient automatiquement le document (modification annulable).
- **Menu IA** :
  - *Perplexity* (dans l'appli, PC et iPhone) : Agent API `https://api.perplexity.ai/v1/agent`, clé API Perplexity (facturée à l'usage, séparée de l'abonnement Pro). Tous les modèles de l'API avec leur identifiant exact.
  - *Computer* (dans l'appli) : pont `serveur.py` (MCP + OAuth, crédits Computer). Le modèle choisi est demandé à Computer comme sous-agent.
  - *Perplexity Pro* : ouvre le chat Perplexity pré-rempli ; coller la réponse dans l'appli pour l'appliquer.
  - *Computer e-mail* et *Sans IA* (liste rapide).
- **Modes** : Rapide / Raisonnement / Profond (méthode de travail + `reasoning.effort` low / medium / high).
- **Orchestre** (`js/models.js`) : fiche de chaque modèle (façon de raisonner, points forts, consignes), règles communes, et orchestrateur « Auto » qui choisit le modèle selon la demande et le mode.
- Service worker « réseau d'abord » : les mises à jour s'affichent sans vider le cache.

## Computer dans l'appli (v3.4)
1. Sur le PC : double-clic sur `lancer.bat` (Python 3 requis, rien à installer). L'appli s'ouvre sur http://127.0.0.1:8765.
2. Onglet **Assistant** → mode « Computer (dans l'appli) » → **Se connecter** (compte Perplexity, une seule fois).
3. Choisis le type de demande (Documents ou Application) et écris : la réponse arrive dans le tchat, les devis/factures sont créés automatiquement.

Le site GitHub Pages peut aussi utiliser le pont s'il tourne sur le même PC. Le jeton OAuth reste dans `tokens.json` (jamais envoyé sur GitHub).

## Corbeille
Glisse un devis, une facture ou un rapport vers la gauche → « Supprimer ». « Sélectionner » permet de tout cocher et supprimer d'un coup. Tout part dans la **Corbeille** (restaurer, effacer, vider).

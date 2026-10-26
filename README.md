# Devis MS — Ms Plomberie & Chauffage

Application web installable pour gérer les devis, factures, rapports, clients, tarifs, achats, planning et bénéfices.

Application : https://mikaelkapinova-boop.github.io/Devis-Ms-Plomberie-Chauffage-/

## Assistant

Le chat Devis MS reprend une interface de conversation simple, avec un champ de message, des conversations séparées et un menu **+** pour joindre une photo ou un PDF, utiliser l’appareil photo ou lancer un appel vocal. Le menu contient les raccourcis **Créer la demande**, **Recherche du correspondant** et **Les 3** (photo, recherche Web et préparation du devis). Les réglages rapides permettent de choisir la profondeur de réponse et d’activer la recherche Internet.

Le chat utilise Qwen3.5 0.8B via Ollama sur le PC. Le relais local Devis MS transmet au modèle le texte de la conversation et le texte extrait des PDF/photos ; il n’envoie pas les pièces jointes brutes. Le PC, Ollama et `lancer.bat` doivent rester démarrés. Dans le menu Assistant > Intelligence artificielle, « Vérifier la connexion au PC » confirme qu’Ollama est joignable. L’app bloque la demande si le PC n’est pas joignable ; aucune bascule vers un fournisseur payant n’est faite. La recherche Internet utilise DuckDuckGo et envoie uniquement la requête à ce moteur. Un montant structuré par l’assistant reste en attente : deux cases doivent être cochées avant de créer un devis, une facture, d’ajouter des lignes ou des tarifs, ou de modifier un document. Cette validation ne déclenche jamais de paiement.

La recherche Web passe par DuckDuckGo depuis le relais sur le PC. Le moteur public peut appliquer ses propres limites de fréquence.

## Données partagées

Les appareils qui se connectent avec l’identifiant et le mot de passe Devis MS existants voient le même espace partagé quand le stockage distant est configuré. Les données métier et les PDF archivés sont chiffrés sur l’appareil avant synchronisation. Le quota applicatif est limité à **2 Go** ; à sa limite, l’application bloque les nouveaux enregistrements et conserve les données déjà stockées. Le service Oracle n’est pas actif pour le moment, donc la synchronisation distante dépend de sa configuration.

L’authentification renouvelle une session de huit heures ; le serveur vérifie cette session pour les synchronisations et les demandes à l’assistant. Le mot de passe existant sert aussi à déchiffrer l’espace commun sur les appareils autorisés.

## Ancienne configuration Oracle

Le dossier [`oracle-ai/`](oracle-ai/README.md) contient les fichiers de la configuration serveur envisagée précédemment. Elle n’est pas utilisée par l’assistant actuel.

Pour lancer le relais local sur Windows, démarre Ollama puis lance `lancer.bat` dans ce dossier. Il écoute uniquement sur `127.0.0.1:8765`; l’API Ollama reste sur `127.0.0.1:11434` et n’est jamais publiée sur le réseau.

## Importation et documents

L’importateur accepte les PDF, photos/scans, documents Word `.docx`, texte et CSV. Il propose un aperçu modifiable avant l’enregistrement. Le format Word `.doc` n’est pas lu ; enregistre-le en `.docx`. La qualité de l’OCR dépend de la lisibilité du scan.

Les devis, factures et rapports sont recréés dans la mise en page de l’application. Les achats importés peuvent être classés par mois ou rattachés à un chantier. Les montants extraits sont à vérifier avant validation.

## Version 7.27

- Chat simplifié avec menu d’ajout inspiré de l’interface mobile, gestion des conversations, raccourcis photo et appel vocal.
- Assistant Qwen3.5 0.8B via Ollama sur le PC, avec recherche Web DuckDuckGo.
- Double validation obligatoire avant d’appliquer des montants suggérés par l’assistant ; aucun paiement n’est envoyé par cette confirmation.
- Données chiffrées avant synchronisation et limite applicative de 2 Go (stockage Oracle en attente de disponibilité).

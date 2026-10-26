# IA locale et stockage Oracle pour Devis MS

Cette pile fait tourner l’inférence et le stockage de Devis MS sur votre VPS Oracle : `llama.cpp` sert le modèle Qwen3.5-4B quantifié, téléchargé depuis Hugging Face au premier démarrage. Hugging Face n’est pas appelé pour générer les réponses. SearXNG, hébergé sur le même VPS, fournit une recherche Web sans clé d’API de recherche. Les synchronisations contiennent l’état chiffré de l’application ; les PDF archivés sont déjà chiffrés côté navigateur avant leur transfert.

## Modèle et limites matérielles

- Modèle : `SoAIHQ/Qwen3.5-4B-GGUF:Q4_K_M` (environ 2,8 Go de poids quantifiés, licence Apache 2.0 du modèle d’origine).
- Le modèle est limité à 2 OCPU, 8 192 tokens de contexte et une génération simultanée pour rester compatible avec le palier Oracle Always Free 2 OCPU / 12 Go de RAM.
- Le service est CPU seulement. Le mode Rapide réduit la longueur de réponse. La recherche Web ne part que lorsqu’une question la demande ou pour une recherche de prix ; elle ajoute le délai des moteurs de recherche utilisés.
- Les réponses générées peuvent se tromper : les scans passent par l’OCR local du navigateur et les devis/factures doivent être relus avant utilisation.
- Les données et archives de Devis MS ont un quota applicatif de 2 Go. Le volume `devis-data` est séparé du cache des poids du modèle ; un dépassement bloque la sauvegarde ou l’archive au lieu d’effacer des données.

## Démarrage sur Oracle

1. Créez la VM ARM A1 gratuite avec Ubuntu, 2 OCPU et 12 Go de RAM. Installez Docker Engine et Compose v2.
2. Dans les règles réseau entrantes du VCN et du pare-feu Linux, autorisez TCP 80 et 443. Gardez SSH limité à votre adresse IP.
3. Copiez le dossier `oracle-ai` sur la VM via SSH/SCP. Le fichier `.env` généré reste seulement sur le VPS.
4. Depuis ce dossier, lancez `chmod +x setup.sh && ./setup.sh`, puis saisissez l’IPv4 publique de la VM. Le domaine SSLIP est résolu vers cette adresse ; Caddy demande un certificat HTTPS automatiquement.
5. Attendez la première récupération des poids. Suivez `docker compose logs -f llama gateway`.
6. Dans les variables d’environnement **Production** du projet Vercel Devis MS, ajoutez `ORACLE_AI_URL=https://<IP>.sslip.io` et `ORACLE_AI_TOKEN` avec la valeur créée dans `.env` sur Oracle. Ne copiez jamais cette valeur dans GitHub, le navigateur ou une conversation.
7. Redéployez Devis MS sur Vercel. L’application chiffrera son état sur l’appareil puis Vercel le relayera vers Oracle. Au premier accès, le relais essaiera de migrer la sauvegarde actuelle chiffrée de GitHub privé ou Vercel Blob. Les archives PDF existantes seront migrées à la demande lors de leur ouverture.

## Réseau et confidentialité

Seuls Caddy (80/443) est publié. Le port du modèle, SearXNG, Valkey et la passerelle ne sont pas publiés. La passerelle exige un jeton aléatoire de 256 bits et n’accepte que des messages texte. Les fichiers sont extraits/OCRisés dans le navigateur avant l’envoi du texte au modèle. Les recherches Internet envoient seulement le texte de la question au méta-moteur. Un quota logique de 2 Go couvre l’état et les PDF archivés.

## Vérification du service

Depuis le VPS, après démarrage : `docker compose ps` et `docker compose logs --tail=100 llama gateway searxng`. L’endpoint de santé de la passerelle exige lui aussi le jeton : `GET https://<AI_HOSTNAME>/health` avec `Authorization: Bearer <ORACLE_AI_TOKEN>`.

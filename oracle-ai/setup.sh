#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker avec Docker Compose doit être installé sur le VPS Oracle."
  exit 1
fi

if [ ! -f .env ]; then
  read -r -p "Adresse IPv4 publique du VPS Oracle : " ip
  if [[ ! "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    echo "Adresse IPv4 invalide."
    exit 1
  fi
  host="${ip}.sslip.io"
  token="$(openssl rand -hex 32)"
  search_secret="$(openssl rand -hex 32)"
  umask 077
  cat > .env <<EOF
AI_HOSTNAME=${host}
ORACLE_AI_TOKEN=${token}
SEARXNG_SECRET=${search_secret}
EOF
  chmod 600 .env
  unset token search_secret
  echo "Configuration privée créée. L’hôte HTTPS sera : https://${host}"
  echo "Après le démarrage, configurez dans Vercel les variables ORACLE_AI_URL et ORACLE_AI_TOKEN."
  echo "La valeur ORACLE_AI_TOKEN est dans le fichier privé .env ; ne l’ajoutez jamais au dépôt Git."
else
  echo "Le fichier .env privé existe déjà ; il est conservé."
fi

echo "Vérification de la mémoire et des ports…"
free -h
docker compose config --quiet
docker compose up -d --build
echo "Téléchargement du modèle et démarrage en cours. Suivi : docker compose logs -f llama gateway"

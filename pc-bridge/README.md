# Ms Devis Bridge 6.0

Bridge Windows local pour relier l'application Ms Devis à un navigateur autorisé.

## Installation
Téléchargez et lancez le bridge depuis l'application Ms Devis. Le programme écoute uniquement sur 127.0.0.1:8765.

## Sécurité
- aucune clé API n'est incluse ;
- aucune authentification ChatGPT n'est copiée ;
- aucune connexion distante entrante n'est ouverte ;
- l'utilisateur lance et autorise lui-même le programme ;
- l'intégration navigateur utilise uniquement les permissions explicitement accordées.

## Architecture
iPhone / Ms Devis -> Bridge PC local -> navigateur -> retour vers Ms Devis.

Le bridge est séparé de l'application web et peut être arrêté à tout moment.

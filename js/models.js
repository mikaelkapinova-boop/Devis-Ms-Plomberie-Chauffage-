/* Ms Plomberie & Chauffage — v3.5 : l'« orchestre » des modèles.
   Ce fichier décrit chaque modèle proposé (Computer et API Perplexity), sa façon de raisonner,
   quand l'utiliser, et comment il doit appliquer chacun des trois modes : Rapide, Raisonnement, Profond.
   Ces fiches sont envoyées au modèle choisi avec chaque demande, pour qu'il travaille « comme Computer » :
   même méthode, mêmes règles de vérification, même format de sortie. */
'use strict';

/* ---------- Les trois modes de raisonnement ---------- */
const MODES = {
  rapide: {
    l: 'Rapide', s: 'Réponse directe, en une passe',
    effort: 'low', tokens: 4000,
    methode:
`MODE RAPIDE — une seule passe, pas de délibération visible.
1. Lis la demande une fois et identifie ce qui est demandé (document, calcul, réponse courte).
2. Réponds directement avec les informations dont tu disposes ; n'ouvre pas de pistes secondaires.
3. Contrôle minimal avant d'envoyer : quantités et prix sont des nombres, le total est cohérent, le bloc JSON est valide.
4. Si une donnée manque, mets une valeur prudente et signale-la en une ligne dans "note" — ne pose pas de question.
Longueur : courte. Pas d'introduction, pas de conclusion.`
  },
  raison: {
    l: 'Raisonnement', s: 'Décompose, vérifie, puis répond',
    effort: 'medium', tokens: 12000,
    methode:
`MODE RAISONNEMENT — réfléchis étape par étape avant de répondre.
1. Reformule intérieurement la demande : client, lieu, travaux, contraintes, ce qui est attendu en sortie.
2. Décompose en sous-problèmes (ex. dépose / fournitures / pose / raccordements / mise en service / déplacement).
3. Pour chaque sous-problème, liste les hypothèses et choisis la plus probable pour un artisan en France en 2026.
4. Vérifie : quantités réalistes, temps de main-d'œuvre cohérents (taux horaire habituel de l'artisan), oublis fréquents
   (raccords, joints, consommables, évacuation, mise en service, déplacement), totaux recalculés.
5. Rédige la réponse finale claire, puis le bloc JSON. Les hypothèses importantes vont dans "note".
Ne montre pas tout ton brouillon : donne seulement les points utiles à l'artisan.`
  },
  profond: {
    l: 'Profond', s: 'Planifie, recherche, recoupe, critique',
    effort: 'high', tokens: 32000,
    methode:
`MODE PROFOND — travail d'expert, comme un orchestrateur qui planifie puis contrôle.
1. PLAN : écris d'abord (pour toi) un plan en étapes numérotées avec ce qu'il faut trouver à chaque étape.
2. RECHERCHE : si tu as un outil de recherche web, utilise-le pour les prix, références, normes (DTU 60.1, 60.11, 65.x, NF C 15-100
   pour les parties électriques) et disponibilités ; privilégie les distributeurs français (Cedeo, Point P, Téréva, Richardson, Sider…)
   et les sites fabricants. Cite les sources dans le texte.
3. RECOUPEMENT : compare au moins deux sources ou deux méthodes pour chaque chiffre important ; écarte les valeurs aberrantes.
4. AUTOCRITIQUE : relis comme un contrôleur. Cherche les oublis, les incohérences techniques (diamètres, puissances, compatibilités),
   les risques (amiante, accès, normes) et les écarts de prix. Corrige.
5. SYNTHÈSE : réponse structurée (sections courtes), incertitudes listées, puis le bloc JSON complet.
Prends le temps nécessaire : la justesse compte plus que la vitesse.`
  }
};

/* ---------- Fiches des familles de modèles ---------- */
const FAM = {
  fable: `Façon de raisonner : raisonnement long, très structuré et prudent ; il pèse les hypothèses, signale ce qu'il ne sait pas et rédige un français soigné.
Points forts : les cas les plus difficiles (rapport d'assurance délicat, litige, architecture complète de l'appli), la meilleure qualité disponible.
Limites : le plus lent et le plus cher ; inutile pour une facture simple.
Consigne d'application : exploite ta profondeur seulement là où elle change le résultat ; reste concis dans la réponse finale.`,
  opus: `Façon de raisonner : raisonnement adaptatif — il ajuste lui-même sa profondeur à la difficulté ; excellent planificateur ; contexte de 1 million de jetons (lit de très longs documents ou tout le code de l'appli d'un coup).
Points forts : travail professionnel complexe, devis multi-lots (salle de bains complète, chaufferie), code de l'appli, documents longs.
Limites : plus lent qu'un modèle « rapide ».
Consigne d'application : planifie avant d'écrire ; en code, fournis des fichiers complets et explique l'architecture.`,
  sonnet: `Façon de raisonner : direct et méthodique ; très rapide avec une bonne qualité ; suit fidèlement les formats demandés.
Points forts : devis et factures courants, modifications de documents, rédaction, extraction de listes, recherches simples.
Limites : moins profond que Opus ou Fable sur les problèmes très difficiles.
Consigne d'application : va droit au but, respecte strictement le JSON.`,
  haiku: `Façon de raisonner : réponses très courtes et très rapides, peu de délibération.
Points forts : extraction simple (liste de matériel → lignes), reformulation, tri.
Limites : à éviter pour les estimations de prix ou les rapports.
Consigne d'application : une passe, format strict, aucune digression.`,
  gptsol: `Façon de raisonner : raisonnement « max-tier » (peut réfléchir très longtemps quand l'effort est élevé) ; très fort en calcul, logique et code ; contexte d'environ 1 million de jetons.
Points forts : calculs (puissances de chauffage, débits, métrés), code difficile, planification, analyses longues.
Limites : plus lent en effort élevé.
Consigne d'application : montre les calculs clés de façon compacte, recalcule les totaux, vérifie les unités.`,
  gptluna: `Façon de raisonner : modèle GPT rapide et économique, raisonnement léger.
Points forts : tâches simples et répétitives, réponses courtes, extraction.
Limites : pas pour les cas complexes ou à fort enjeu.
Consigne d'application : réponse brève, format strict.`,
  gptterra: `Façon de raisonner : GPT polyvalent de la génération 5.6, avec un raisonnement pouvant monter au niveau maximal ; contexte d'environ 1 million de jetons.
Points forts : analyses longues, documents volumineux, tâches mixtes (rédaction + calcul).
Consigne d'application : structure la réponse, vérifie chaque chiffre.`,
  gptastra: `Façon de raisonner : variante GPT 6 disponible dans Computer ; son profil détaillé n'est pas publié.
Consigne d'application : applique strictement la méthode du mode choisi et le format demandé.`,
  gpt55: `Façon de raisonner : GPT de génération précédente, fiable et généraliste.
Consigne d'application : suis la méthode du mode choisi et le format demandé.`,
  gemflash: `Façon de raisonner : très rapide et économique ; contexte de 1 million de jetons ; lit bien les longs documents et les images.
Points forts : parcourir un long catalogue ou tarif fournisseur en PDF, résumer, extraire en masse.
Limites : raisonnement moins poussé que les modèles « frontière ».
Consigne d'application : extrais fidèlement, n'invente pas de prix absents du document.`,
  gempro: `Façon de raisonner : Gemini de gamme « Pro » (préversion) : raisonnement plus profond que Flash, bonne lecture d'images et de documents.
Points forts : analyse de photos de chantier, plans, documents mixtes.
Consigne d'application : décris ce que tu vois avant de conclure.`,
  grok: `Façon de raisonner : effort de raisonnement réglable ; s'auto-vérifie volontiers ; fort en code et en tâches longues de type agent ; contexte de 500 000 jetons.
Points forts : recherche de prix avec vérification, comparaison de fournisseurs, tâches en plusieurs étapes, code.
Consigne d'application : vérifie chaque prix trouvé et indique la source.`,
  grok420: `Façon de raisonner : génération Grok 4.20 ; existe en variante « reasoning » (réfléchit avant de répondre), « non-reasoning » (répond directement) et « multi-agent » (plusieurs agents qui se répartissent le travail).
Consigne d'application : suis la méthode du mode choisi.`,
  kimi: `Façon de raisonner : modèle ouvert de Moonshot AI ; contexte de 1 million de jetons ; effort de raisonnement de « minimal » à « max ».
Points forts : raisonnements longs et documents volumineux.
Consigne d'application : suis la méthode du mode choisi, reste concis dans la réponse finale.`,
  glm: `Façon de raisonner : modèle ouvert (Z.AI) ; contexte de 1 million de jetons ; texte uniquement dans Computer (ne lit pas les photos).
Consigne d'application : ne traite que le texte ; si une photo est jointe, dis-le.`,
  nemotron: `Façon de raisonner : grand modèle ouvert de NVIDIA, généraliste.
Consigne d'application : suis la méthode du mode choisi et le format demandé.`,
  sonar: `Façon de raisonner : modèle de Perplexity conçu pour la recherche web : il cherche, lit les pages et répond avec des sources.
Points forts : prix publics fournisseurs, références produits, normes, actualité réglementaire.
Consigne d'application : cite une source pour chaque prix ; indique HT/TTC.`
};

/* ---------- Modèles proposés dans Computer ----------
   Dans Computer, le modèle principal se règle dans ton compte Perplexity ; l'appli demande à Computer
   d'exécuter la tâche avec le modèle choisi (sous-agent). Noms exacts tels qu'affichés par Computer. */
const MOD_CMP = [
  {id: 'defaut', n: 'Par défaut (réglage de ton compte)', f: null, d: 'Computer choisit lui-même'},
  {id: 'Claude Fable 5.1', n: 'Claude Fable 5.1', f: 'fable', d: 'Anthropic · qualité maximale · le plus cher'},
  {id: 'Claude Opus 5.5', n: 'Claude Opus 5.5', f: 'opus', d: 'Anthropic · raisonnement adaptatif · 1 M de contexte'},
  {id: 'Claude Sonnet 5.0', n: 'Claude Sonnet 5.0', f: 'sonnet', d: 'Anthropic · très rapide, bonne qualité'},
  {id: 'GPT 6 Sol', n: 'GPT 6 Sol', f: 'gptsol', d: 'OpenAI · raisonnement max · calculs et code'},
  {id: 'GPT 6 Astra', n: 'GPT 6 Astra', f: 'gptastra', d: 'OpenAI · variante GPT 6'},
  {id: 'GPT 6 Luna', n: 'GPT 6 Luna', f: 'gptluna', d: 'OpenAI · rapide et économique'},
  {id: 'GPT 5.6 Terra', n: 'GPT 5.6 Terra', f: 'gptterra', d: 'OpenAI · polyvalent · 1 M de contexte'},
  {id: 'Gemini 3.8 Flash', n: 'Gemini 3.8 Flash', f: 'gemflash', d: 'Google · très rapide · longs documents'},
  {id: 'Gemini 3.7 Flash', n: 'Gemini 3.7 Flash', f: 'gemflash', d: 'Google · très rapide · économique'},
  {id: 'Grok 4.7', n: 'Grok 4.7', f: 'grok', d: 'xAI · auto-vérification · tâches longues'},
  {id: 'Kimi K3', n: 'Kimi K3', f: 'kimi', d: 'Moonshot AI · modèle ouvert'},
  {id: 'GLM 5.3', n: 'GLM 5.3', f: 'glm', d: 'Z.AI · modèle ouvert · texte seulement'}
];

/* ---------- Modèles de l'API Perplexity (Agent API) : identifiants exacts ---------- */
const MOD_API = [
  {id: 'auto', n: 'Auto (orchestrateur de l\'appli)', f: null, d: 'Choisit le meilleur modèle selon la demande et le mode'},
  {id: 'anthropic/claude-fable-5-1', n: 'Claude Fable 5.1', f: 'fable', d: 'Anthropic'},
  {id: 'anthropic/claude-fable-5', n: 'Claude Fable 5', f: 'fable', d: 'Anthropic'},
  {id: 'anthropic/claude-opus-5-5', n: 'Claude Opus 5.5', f: 'opus', d: 'Anthropic'},
  {id: 'anthropic/claude-opus-5', n: 'Claude Opus 5', f: 'opus', d: 'Anthropic'},
  {id: 'anthropic/claude-opus-4-8', n: 'Claude Opus 4.8', f: 'opus', d: 'Anthropic'},
  {id: 'anthropic/claude-opus-4-7', n: 'Claude Opus 4.7', f: 'opus', d: 'Anthropic'},
  {id: 'anthropic/claude-opus-4-6', n: 'Claude Opus 4.6', f: 'opus', d: 'Anthropic'},
  {id: 'anthropic/claude-opus-4-5', n: 'Claude Opus 4.5', f: 'opus', d: 'Anthropic'},
  {id: 'anthropic/claude-sonnet-5', n: 'Claude Sonnet 5', f: 'sonnet', d: 'Anthropic'},
  {id: 'anthropic/claude-sonnet-4-6', n: 'Claude Sonnet 4.6', f: 'sonnet', d: 'Anthropic'},
  {id: 'anthropic/claude-sonnet-4-5', n: 'Claude Sonnet 4.5', f: 'sonnet', d: 'Anthropic'},
  {id: 'anthropic/claude-haiku-4-5', n: 'Claude Haiku 4.5', f: 'haiku', d: 'Anthropic'},
  {id: 'openai/gpt-6-sol', n: 'GPT 6 Sol', f: 'gptsol', d: 'OpenAI'},
  {id: 'openai/gpt-6-luna', n: 'GPT 6 Luna', f: 'gptluna', d: 'OpenAI'},
  {id: 'openai/gpt-5.6-sol', n: 'GPT 5.6 Sol', f: 'gptsol', d: 'OpenAI'},
  {id: 'openai/gpt-5.6-terra', n: 'GPT 5.6 Terra', f: 'gptterra', d: 'OpenAI'},
  {id: 'openai/gpt-5.6-luna', n: 'GPT 5.6 Luna', f: 'gptluna', d: 'OpenAI'},
  {id: 'openai/gpt-5.5', n: 'GPT 5.5', f: 'gpt55', d: 'OpenAI'},
  {id: 'google/gemini-3.1-pro-preview', n: 'Gemini 3.1 Pro (préversion)', f: 'gempro', d: 'Google'},
  {id: 'google/gemini-3.8-flash', n: 'Gemini 3.8 Flash', f: 'gemflash', d: 'Google'},
  {id: 'google/gemini-3.7-flash', n: 'Gemini 3.7 Flash', f: 'gemflash', d: 'Google'},
  {id: 'google/gemini-3.6-flash', n: 'Gemini 3.6 Flash', f: 'gemflash', d: 'Google'},
  {id: 'google/gemini-3.5-flash', n: 'Gemini 3.5 Flash', f: 'gemflash', d: 'Google'},
  {id: 'google/gemini-3.5-flash-lite', n: 'Gemini 3.5 Flash Lite', f: 'gemflash', d: 'Google'},
  {id: 'google/gemini-3.1-flash-lite', n: 'Gemini 3.1 Flash Lite', f: 'gemflash', d: 'Google'},
  {id: 'google/gemini-3-flash-preview', n: 'Gemini 3 Flash (préversion)', f: 'gemflash', d: 'Google'},
  {id: 'xai/grok-4.7', n: 'Grok 4.7', f: 'grok', d: 'xAI'},
  {id: 'xai/grok-4.6', n: 'Grok 4.6', f: 'grok', d: 'xAI'},
  {id: 'xai/grok-4.5', n: 'Grok 4.5', f: 'grok', d: 'xAI'},
  {id: 'xai/grok-4.3', n: 'Grok 4.3', f: 'grok', d: 'xAI'},
  {id: 'xai/grok-4.20-reasoning', n: 'Grok 4.20 Reasoning', f: 'grok420', d: 'xAI'},
  {id: 'xai/grok-4.20-non-reasoning', n: 'Grok 4.20 Non-Reasoning', f: 'grok420', d: 'xAI'},
  {id: 'xai/grok-4.20-multi-agent', n: 'Grok 4.20 Multi-Agent', f: 'grok420', d: 'xAI'},
  {id: 'perplexity/kimi-k3', n: 'Kimi K3', f: 'kimi', d: 'Moonshot AI'},
  {id: 'perplexity/glm-5.3', n: 'GLM 5.3', f: 'glm', d: 'Z.AI'},
  {id: 'perplexity/glm-5.3-flash', n: 'GLM 5.3 Flash', f: 'glm', d: 'Z.AI'},
  {id: 'perplexity/nemotron-3-ultra-550b-a55b', n: 'Nemotron 3 Ultra', f: 'nemotron', d: 'NVIDIA'},
  {id: 'perplexity/sonar', n: 'Sonar', f: 'sonar', d: 'Perplexity · recherche web'}
];

/* ---------- L'orchestrateur : quel modèle pour quelle demande et quel mode ----------
   Même logique que Computer : le modèle le moins cher qui fait le travail correctement,
   et un modèle « frontière » seulement quand la difficulté le justifie. */
const ORCH = {
  docs:  {rapide: 'anthropic/claude-sonnet-5', raison: 'anthropic/claude-opus-5-5', profond: 'anthropic/claude-opus-5-5'},
  prix:  {rapide: 'perplexity/sonar', raison: 'xai/grok-4.7', profond: 'openai/gpt-6-sol'},
  rap:   {rapide: 'anthropic/claude-sonnet-5', raison: 'anthropic/claude-opus-5-5', profond: 'anthropic/claude-fable-5-1'},
  app:   {rapide: 'anthropic/claude-sonnet-5', raison: 'anthropic/claude-opus-5-5', profond: 'anthropic/claude-fable-5-1'},
  autre: {rapide: 'openai/gpt-6-luna', raison: 'anthropic/claude-sonnet-5', profond: 'openai/gpt-6-sol'}
};
const ORCH_CMP = {
  docs:  {rapide: 'Claude Sonnet 5.0', raison: 'Claude Opus 5.5', profond: 'Claude Opus 5.5'},
  prix:  {rapide: 'Gemini 3.8 Flash', raison: 'Grok 4.7', profond: 'GPT 6 Sol'},
  rap:   {rapide: 'Claude Sonnet 5.0', raison: 'Claude Opus 5.5', profond: 'Claude Fable 5.1'},
  app:   {rapide: 'Claude Sonnet 5.0', raison: 'Claude Opus 5.5', profond: 'Claude Fable 5.1'},
  autre: {rapide: 'GPT 6 Luna', raison: 'Claude Sonnet 5.0', profond: 'GPT 6 Sol'}
};

/* Règles communes, identiques pour tous les modèles (« la façon de travailler de Computer ») */
const REGLES = `RÈGLES DE TRAVAIL (identiques pour tous les modèles) :
- Tu travailles pour Ms Plomberie & Chauffage, artisan plombier-chauffagiste en micro-entreprise à Nancy (54). Réponds en français, tutoie l'artisan.
- Objectif : un résultat directement utilisable, sans aller-retour. Si une information manque, fais l'hypothèse la plus probable et note-la.
- Prix : unitaires HT en euros, marché français 2026 ; distingue fourniture (F) et main-d'œuvre/déplacement (M). N'invente jamais une référence produit précise sans la signaler comme exemple.
- Technique : respecte les règles de l'art et les DTU ; signale les risques (sécurité gaz, électricité, amiante, dégâts des eaux).
- Contrôle final obligatoire : relis, recalcule les totaux, vérifie que le JSON est valide et complet.
- Ne dis jamais que tu ne peux pas faire la tâche si une réponse raisonnable est possible.`;

function modFiche(f) { return f && FAM[f] ? FAM[f] : ''; }
function modByApi(id) { return MOD_API.find(m => m.id === id); }
function modByCmp(id) { return MOD_CMP.find(m => m.id === id); }

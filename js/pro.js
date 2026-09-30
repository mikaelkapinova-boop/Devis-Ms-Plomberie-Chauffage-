/* Envoi en caché, sans quitter l'appli, sans clé API.
   Le chat Pro du site ne peut pas être appelé en secret (Perplexity l'interdit).
   L'envoi passe par la connexion du compte déjà prévue (pont), et les précodes disent quoi créer.
   L'appli applique le JSON : devis, facture, rapport, tarifs. Aucune fenêtre ne s'ouvre. */
'use strict';

const PRECODES = `PRÉCODES D'ORCHESTRE — tu exécutes, l'appli applique. L'artisan ne doit pas quitter l'appli.
Choisis un seul précode et termine par UN bloc json, rien après.
P1 DEVIS ou FACTURE : {"client":{"nom":"","adresse":"","cp_ville":"","tel":""},"objet":"","F":[{"d":"fourniture","q":1,"p":0}],"M":[{"d":"main-d'œuvre ou déplacement","q":1,"p":0}],"note":""}
P2 MODIFIER : le document complet, mêmes clés que P1, toutes les lignes, pas seulement le changement.
P3 RAPPORT : {"rapport":{"ty":"Dégât des eaux | Recherche de fuite | Panne de chauffage | Diagnostic plomberie | Autre","cn":"","ca":"","cc":"","ct":"","ass":"","sn":"","mo":"","co":"","org":"","tr":"","pr":""}}
P4 PRIX : tableau article | fournisseur | prix HT | lien, puis {"items":[{"d":"","t":"F","pa":0,"mg":35,"ref":"","fo":""}]}
P5 PHOTO : identifie l'objet, cherche un correspondant vendu en France, puis P1 ou P4.
Prix unitaires HT, nombres, marché français 2026. Estimation marquée dans note. Pas de référence inventée.`;

const _cfgPro = cfgInit;
cfgInit = function () {
  _cfgPro();
  if (!pk() && S.cfg.as && S.cfg.as.ai === 'api') S.cfg.as.ai = 'pro';
  (S.threads || []).forEach(function (t) { if (!pk() && t.ai === 'api') t.ai = 'pro'; });
};

proOpen = async function (t, txt, clear) {
  const eff = modEff(t);
  let names = [];
  const urls = [];
  const demande = txt || 'Analyse les fichiers joints.';
  try {
    for (const a of ATT) {
      names.push({n: a.f.name, k: a.k});
      const j = await mcFetch('/api/upload', null, {b: a.f, h: {'X-Filename': encodeURIComponent(a.f.name), 'X-Mime': a.f.type || 'application/octet-stream'}});
      if (j.attachment_url) urls.push(j.attachment_url);
    }
  } catch (e) {
    chatPush({r: 'u', t: demande});
    if (clear) clear();
    return proStay(e);
  }
  chatPush({r: 'u', t: demande, att: names});
  ATT = [];
  if (clear) clear();
  const msg = PRECODES + '\n\n' + sysPrompt(t, eff) + '\n\nMA DEMANDE : ' + demande + '\nExécute le précode qui correspond. Réponds dans l\'appli, pas dans une autre fenêtre.';
  await mcCall('/api/chat', {message: msg, thread_id: t.tid || undefined, attachment_urls: urls}, t, eff);
};

function proStay(e) {
  const hors = e instanceof TypeError || (e && e.code === 401);
  chatPush({r: 'a', t: hors
    ? 'Envoi en caché impossible pour l\'instant : le petit programme du compte Perplexity n\'est pas joignable sur cet appareil. Je n\'ouvre pas Perplexity et je ne te sors pas de l\'appli. Sur le PC, lance lancer.bat une fois, connecte le compte (sans clé), puis renvoie. Le chat Pro du site ne peut pas recevoir un message caché.'
    : 'Envoi en caché arrêté : ' + ((e && e.message) || e) + '. Tu restes dans l\'appli.', via: 'En caché'});
  render();
}

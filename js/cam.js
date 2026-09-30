/* Appareil photo dans l'appli, recherche web du correspondant, création de la demande.
   Les 3 peuvent partir d'un seul déclencheur. Le viseur reste dans l'appli (pas l'app Photo). */
'use strict';

let CAM = {stream: null, facing: 'environment', file: null, url: ''};
let PHOTOJOB = '';

(function () {
  const st = document.createElement('style');
  st.textContent = `
.camb{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--in);color:var(--ink);display:flex;align-items:center;justify-content:center}
.camb svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#cam{position:fixed;inset:0;z-index:85;display:none;background:#000;color:#fff;flex-direction:column}
#cam.on{display:flex}
#cam video,#cam .shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
#cam .top,#cam .bot{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 12px}
#cam .bot{margin-top:auto;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));flex-direction:column;gap:12px;background:linear-gradient(#0000,#000c)}
#cam .top{background:linear-gradient(#000c,#0000)}
#cam .ib{width:44px;height:44px;border-radius:50%;border:0;background:#ffffff22;color:#fff;font:inherit;font-size:20px}
#cam .acts{display:flex;gap:8px;width:100%}
#cam .acts button{flex:1;border:0;border-radius:980px;min-height:44px;background:#ffffff18;color:#fff;font:inherit;font-size:13px;font-weight:600}
#cam .acts button.go{background:#fff;color:#000}
#cam .shut{width:74px;height:74px;border-radius:50%;border:4px solid #fff;background:transparent;padding:4px}
#cam .shut i{display:block;width:100%;height:100%;border-radius:50%;background:#fff}
#cam .hint{font-size:12px;color:#ffffffcc;text-align:center;margin:0}
`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.id = 'cam';
  d.innerHTML = `<div class="top"><button class="ib" onclick="camClose()" aria-label="Fermer">×</button><b>Appareil photo</b><button class="ib" onclick="camFlip()" aria-label="Changer de caméra">↻</button></div>
<video id="camv" autoplay muted playsinline></video>
<img class="shot" id="camshot" alt="" hidden>
<div class="bot">
<p class="hint" id="camhint">Le viseur reste dans l'appli.</p>
<div class="acts">
<button onclick="camShot('photo')">Photo</button>
<button onclick="camShot('search')">Recherche</button>
<button onclick="camShot('demande')">Demande</button>
</div>
<button class="shut" onclick="camShot('all')" aria-label="Les 3 : photo, recherche, demande"><i></i></button>
<p class="hint">Le gros bouton enchaîne les 3 : photo, recherche du correspondant, création de la demande.</p>
</div>`;
  document.body.appendChild(d);
  const hang = document.querySelector('#call .hang');
  if (hang && hang.parentElement && !hang.parentElement.querySelector('.camb')) {
    const b = document.createElement('button');
    b.className = 'camb';
    b.style.cssText = 'width:56px;height:56px;border-radius:50%;border:0;background:#ffffff22;color:#fff';
    b.setAttribute('aria-label', 'Photo pendant l\'appel');
    b.innerHTML = camSvg();
    b.onclick = function () { camOpen(); };
    hang.parentElement.insertBefore(b, hang);
  }
})();

function camSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
}
const _chatVcam = chatV;
chatV = function () {
  return _chatVcam().replace('<button class="plus"', '<button class="camb" onclick="camOpen()" aria-label="Appareil photo">' + camSvg() + '</button><button class="plus"');
};

async function camOpen() {
  sheetClose();
  const box = $('#cam');
  box.classList.add('on');
  $('#camshot').hidden = true;
  $('#camv').hidden = false;
  CAM.file = null;
  const hint = $('#camhint');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (hint) hint.textContent = 'Ce navigateur n\'ouvre pas le viseur. La caméra iPhone va s\'ouvrir.';
    camNative();
    return;
  }
  try { await camStream(); if (hint) hint.textContent = 'Viseur dans l\'appli. Gros bouton = les 3.'; }
  catch (e) {
    if (hint) hint.textContent = 'Accès caméra refusé. Autorise l\'appareil photo pour Safari, ou utilise la caméra iPhone.';
    camNative();
  }
}
async function camStream() {
  camStop();
  const video = { facingMode: { ideal: CAM.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } };
  try { CAM.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); }
  catch (e) { CAM.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
  const v = $('#camv');
  v.srcObject = CAM.stream;
  v.muted = true;
  v.playsInline = true;
  await v.play();
}
function camStop() {
  if (CAM.stream) { CAM.stream.getTracks().forEach(t => t.stop()); CAM.stream = null; }
}
function camClose() {
  camStop();
  if (CAM.url) { URL.revokeObjectURL(CAM.url); CAM.url = ''; }
  const box = $('#cam'); if (box) box.classList.remove('on');
}
async function camFlip() {
  CAM.facing = CAM.facing === 'environment' ? 'user' : 'environment';
  try { await camStream(); } catch (e) { toast('Cette caméra ne s\'ouvre pas'); }
}
function camNative() {
  camClose();
  const inp = $('#fcam');
  if (inp) inp.click();
  else toast('Caméra indisponible');
}
function camShot(kind) {
  if (CAM.file && kind !== 'photo') return photoRun(kind);
  const v = $('#camv');
  if (!v || !v.videoWidth) { toast('Le viseur n\'est pas prêt'); return; }
  const c = document.createElement('canvas');
  const w = Math.min(1600, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth);
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(v, 0, 0, w, h);
  c.toBlob(function (blob) {
    if (!blob) return toast('Photo impossible');
    const name = 'photo-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.jpg';
    CAM.file = new File([blob], name, { type: 'image/jpeg' });
    if (CAM.url) URL.revokeObjectURL(CAM.url);
    CAM.url = URL.createObjectURL(CAM.file);
    const img = $('#camshot'); img.src = CAM.url; img.hidden = false;
    $('#camv').hidden = true;
    camStop();
    ATT = ATT.filter(a => !a._cam);
    ATT.push({ f: CAM.file, k: 'img', _cam: 1 });
    if (kind === 'photo') { const h = $('#camhint'); if (h) h.textContent = 'Photo prise. Recherche, Demande, ou le gros bouton pour les 3.'; return; }
    photoRun(kind);
  }, 'image/jpeg', 0.86);
}

const PHOTO_TXT = {
  search: 'PHOTO. Identifie ce qui est visible (pièce, marque, modèle, référence, diamètre). Cherche sur le web des correspondants vendus en France, au moins deux si possible. Tableau article | fournisseur | prix HT | lien. Dis où le fournisseur se fournit et si l\'achat direct est possible. N\'invente pas une référence absente de la photo ou d\'une page.',
  demande: 'PHOTO. Identifie l\'objet, puis prépare la demande (devis) : fournitures vues ou correspondantes, et la main-d\'œuvre probable. Prix HT France, estimations marquées dans note.',
  all: 'PHOTO, puis les 3 étapes. 1) Décris ce que tu vois. 2) Cherche sur le web le correspondant (article, fournisseur, prix HT, lien, achat direct possible). 3) Prépare la demande complète pour créer le devis. N\'invente pas une référence que ni la photo ni une page ne montrent.'
};

function photoEngine() {
  const t = TH();
  if (t.ai === 'api' && pk()) return 'api';
  if (t.ai === 'cmp') return 'cmp';
  if (pk()) return 'api';
  return '';
}
function photoRun(kind) {
  if (!ATT.some(a => a.k === 'img')) return toast('Prends d\'abord la photo');
  const eng = photoEngine();
  if (!eng) { camClose(); toast('Pour chercher sur le web, choisis Perplexity et enregistre la clé'); sheetOpen('ia'); return; }
  const want = kind === 'search' ? 'prix' : 'devis';
  const cur = TH();
  if (cur.msgs.length && cur.k !== want) thNew({ k: want, ai: eng, r: 'raison' });
  else { cur.k = want; cur.ai = eng; if (cur.r === 'rapide') cur.r = 'raison'; thSave(); }
  const t = TH();
  if (t.ai === 'api' && /glm|haiku/.test(t.m || '')) t.m = 'xai/grok-4.7';
  S.cfg.as.ai = t.ai; S.cfg.as.k = t.k; save('cfg');
  camClose();
  if (V.v !== 'a') go('a');
  const ta = $('#cin');
  if (ta) ta.value = PHOTO_TXT[kind] || PHOTO_TXT.all;
  PHOTOJOB = kind === 'photo' ? 'search' : kind;
  const before = t.msgs.length;
  const speaking = window.CALL && CALL.on;
  if (speaking) { CALL.phase = 'think'; callSet('think', 'Je cherche le correspondant…', 'Photo envoyée'); }
  Promise.resolve(asSend()).finally(function () {
    PHOTOJOB = '';
    if (speaking) callWaitAnswer(before);
  });
}

const _sheetActCam = sheetAct;
sheetAct = function (a, v, b) {
  if (a === 'cam') { sheetClose(); return camOpen(); }
  if (a === 'photo3') { sheetClose(); return camOpen(); }
  if (a === 'photosearch') return photoRun('search');
  if (a === 'photodem') return photoRun('demande');
  return _sheetActCam(a, v, b);
};
const _sheetRenderCam = sheetRender;
sheetRender = function () {
  _sheetRenderCam();
  if (SHEET !== 'plus') return;
  const grp = document.querySelector('#sheet .grp');
  if (!grp || grp.querySelector('[data-a=photo3]')) return;
  const row = document.createElement('div');
  row.innerHTML = `<button class="it" data-a="photo3"><span class="ic">📷</span><span class="tx"><b>Les 3</b><small>Photo dans l'appli, recherche web du correspondant, création de la demande</small></span></button>
<button class="it" data-a="photosearch"><span class="ic">🔎</span><span class="tx"><b>Recherche du correspondant</b><small>Avec la photo déjà prise</small></span></button>
<button class="it" data-a="photodem"><span class="ic">📄</span><span class="tx"><b>Créer la demande</b><small>Devis à partir de la photo déjà prise</small></span></button>`;
  while (row.firstChild) grp.insertBefore(row.firstChild, grp.firstChild);
};

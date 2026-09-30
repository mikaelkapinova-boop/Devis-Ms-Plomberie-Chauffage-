/* Appel vocal à l'IA — pensé pour l'iPhone (Safari, micro, voix française).
   Ce n'est pas un appel du réseau téléphonique : Apple ne laisse pas un site appeler Siri.
   Le micro de l'iPhone écoute, le modèle choisi répond, la voix française lit la réponse,
   puis l'écoute reprend. Tu ne quittes pas l'appli. */
'use strict';

const CALL = {on: false, phase: 'idle', rec: null, said: '', lock: 0};

(function () {
  const st = document.createElement('style');
  st.textContent = `
.callb{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:#34c759;color:#fff;display:flex;align-items:center;justify-content:center}
.callb svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#call{position:fixed;inset:0;z-index:80;display:none;background:#0b0b0d;color:#f5f5f7;flex-direction:column;align-items:center;justify-content:space-between;padding:calc(28px + env(safe-area-inset-top,0px)) 24px calc(28px + env(safe-area-inset-bottom,0px));text-align:center}
#call.on{display:flex}
#call .who{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#98989d;margin:0}
#call h2{font-size:28px;font-weight:650;letter-spacing:-.03em;margin:6px 0 0}
#call .stage{position:relative;width:220px;height:220px;display:flex;align-items:center;justify-content:center}
#call .ring{position:absolute;inset:18px;border-radius:50%;border:1.5px solid #ffffff22}
#call.listen .ring{animation:cpulse 1.8s ease-out infinite}
#call.listen .ring.d2{animation-delay:.6s}
#call .mark{width:112px;height:112px;object-fit:contain;position:relative;z-index:1;filter:drop-shadow(0 12px 24px #0008)}
#call .st{font-size:17px;font-weight:600;min-height:24px}
#call .tr{font-size:16px;line-height:1.4;color:#d2d2d7;max-width:34rem;min-height:3.2em;margin:8px 0 0}
#call .hang{width:74px;height:74px;border-radius:50%;border:0;background:#ff3b30;color:#fff;display:flex;align-items:center;justify-content:center}
#call .hang svg{width:30px;height:30px;stroke:#fff;fill:none;stroke-width:2.2;stroke-linecap:round}
#call .hint{font-size:12.5px;color:#6e6e73;max-width:28rem;line-height:1.35}
@keyframes cpulse{0%{transform:scale(.82);opacity:.7}100%{transform:scale(1.18);opacity:0}}
`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.id = 'call';
  d.innerHTML = `<div><p class="who" id="callwho">Appel au modèle</p><h2 id="callname">Intelligence artificielle</h2></div>
<div class="stage"><span class="ring"></span><span class="ring d2"></span><img class="mark" alt="Logo" src="img/drop-hd.png"></div>
<div style="width:100%"><div class="st" id="callst">Écoute…</div><p class="tr" id="calltr"></p></div>
<div><button class="hang" onclick="callStop()" aria-label="Raccrocher"><svg viewBox="0 0 24 24"><path d="M4 15c2-4 14-4 16 0l-2.2 2.2a2 2 0 0 1-2.6.2l-1.5-1a12 12 0 0 0-3.4 0l-1.5 1a2 2 0 0 1-2.6-.2z"/></svg></button><p class="hint">Ce n'est pas un appel Apple ni Siri. Tu parles au modèle choisi (Perplexity ou Computer). Le micro sert seulement à dicter. Si l'écoute ne reprend pas, touche le logo.</p></div>`;
  d.querySelector('.stage').addEventListener('click', function () { if (CALL.on && CALL.phase !== 'think' && CALL.phase !== 'speak') callListen(); });
  document.body.appendChild(d);
})();

function callPhoneSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h3l1.5 4-2 1.2a12 12 0 0 0 6.3 6.3L17 12.5 21 14v3a2 2 0 0 1-2.2 2A17 17 0 0 1 5 6.2 2 2 0 0 1 7 3z"/></svg>';
}

const _chatVcall = chatV;
chatV = function () {
  const html = _chatVcall();
  return html.replace('<button class="plus"', '<button class="callb" onclick="callStart()" aria-label="Appeler l\'IA">' + callPhoneSvg() + '</button><button class="plus"');
};

function callSet(phase, status, transcript) {
  CALL.phase = phase;
  const box = $('#call');
  if (box) box.className = 'on ' + phase;
  const s = $('#callst'); if (s) s.textContent = status;
  if (transcript !== undefined) { const t = $('#calltr'); if (t) t.textContent = transcript; }
}

function callStart() {
  const t = TH();
  if (t.ai === 'pro' || t.ai === 'mail' || t.ai === 'loc') {
    toast('Pour l\'appel dans l\'appli, choisis Perplexity ou Computer');
    sheetOpen('ia');
    return;
  }
  if (t.ai === 'api' && !pk()) { toast('Ajoute ta clé API Perplexity'); sheetOpen('ia'); return; }
  sheetClose();
  CALL.on = true; CALL.said = '';
  const eff = typeof modEff === 'function' ? modEff(t) : null;
  const who = $('#callwho'), nm = $('#callname');
  if (who) who.textContent = t.ai === 'cmp' ? 'Appel Computer' : 'Appel Perplexity';
  if (nm) nm.textContent = eff && eff.n ? eff.n : 'Modèle choisi';
  $('#call').classList.add('on');
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; u.lang = 'fr-FR';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    callSet('listen', 'Micro indisponible', 'Autorise le micro pour ce site, puis rappelle. La réponse viendra du modèle choisi, pas d\'Apple.');
    const ta = $('#cin'); if (ta) ta.focus();
    return;
  }
  callListen();
}

function callListen() {
  if (!CALL.on || CALL.phase === 'speak' || CALL.phase === 'think') return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  try { if (CALL.rec) CALL.rec.abort(); } catch (e) {}
  const rec = new SR();
  CALL.rec = rec;
  rec.lang = 'fr-FR';
  rec.continuous = false;
  rec.interimResults = true;
  let finalTxt = '';
  callSet('listen', 'Écoute…', CALL.said || 'Parle, je t\'écoute.');
  rec.onresult = function (ev) {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const piece = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalTxt += piece; else interim += piece;
    }
    const show = (finalTxt || interim || '').trim();
    if (show) { const el = $('#calltr'); if (el) el.textContent = show; }
  };
  rec.onerror = function (ev) {
    if (!CALL.on) return;
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      callSet('listen', 'Micro bloqué', 'Autorise le micro : Réglages iPhone > Safari > Micro > Autoriser. Puis raccroche et rappelle.');
      return;
    }
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;
    callSet('listen', 'Je réécoute…', CALL.said);
  };
  rec.onend = function () {
    if (!CALL.on || CALL.rec !== rec) return;
    const said = finalTxt.trim();
    if (said) { CALL.said = said; callSend(said); return; }
    if (CALL.phase === 'listen') setTimeout(callListen, 280);
  };
  try { rec.start(); } catch (e) { setTimeout(callListen, 400); }
}

async function callSend(text) {
  if (!CALL.on) return;
  try { if (CALL.rec) CALL.rec.abort(); } catch (e) {}
  callSet('think', 'Je réfléchis…', text);
  const ta = $('#cin');
  if (ta) { ta.value = text; cinGrow(ta); }
  const before = TH().msgs.length;
  try { await asSend(); } catch (e) {}
  if (!CALL.on) return;
  const added = TH().msgs.slice(before).filter(m => m.r === 'a');
  if (!added.length) {
    if (ASBUSY) { callWaitAnswer(before); return; }
    callSet('listen', 'Écoute…', 'Je n\'ai pas eu de réponse. Redis.');
    setTimeout(callListen, 400);
    return;
  }
  callSay(added[added.length - 1].t);
}

function callWaitAnswer(before) {
  const t0 = Date.now();
  const tick = function () {
    if (!CALL.on) return;
    const added = TH().msgs.slice(before).filter(m => m.r === 'a');
    if (added.length && !ASBUSY) { callSay(added[added.length - 1].t); return; }
    if (Date.now() - t0 > 120000) { callSet('listen', 'Écoute…', 'Délai dépassé. Redis, ou raccroche.'); setTimeout(callListen, 400); return; }
    setTimeout(tick, 400);
  };
  setTimeout(tick, 400);
}

function callSpeakable(s) {
  s = String(s || '');
  s = s.replace(/```json[\s\S]*?```/gi, ' J\'ai préparé le document, il est à l\'écran. ');
  s = s.replace(/```[\s\S]*?```/g, ' Le détail est à l\'écran. ');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/[#*_`>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 650) s = s.slice(0, 650).replace(/\s+\S*$/, '') + '. La suite est à l\'écran.';
  return s || 'C\'est fait. Regarde l\'écran.';
}

function callSay(text) {
  if (!CALL.on) return;
  const parts = callSpeakable(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  callSet('speak', 'Réponse…', callSpeakable(text).slice(0, 220));
  let i = 0, step = 0;
  function next(from) {
    if (from !== step) return;
    step++;
    if (!CALL.on) { try { speechSynthesis.cancel(); } catch (e) {} return; }
    if (i >= parts.length) { CALL.phase = 'listen'; setTimeout(callListen, 350); return; }
    const chunk = parts[i++];
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = 'fr-FR';
    u.rate = 1.02;
    try {
      const voices = speechSynthesis.getVoices() || [];
      const v = voices.find(x => /fr/i.test(x.lang) && /thomas|audrey|am[ée]lie/i.test(x.name)) || voices.find(x => /^fr/i.test(x.lang));
      if (v) u.voice = v;
    } catch (e) {}
    const mine = step;
    const timer = setTimeout(function () { next(mine); }, Math.min(14000, 900 + chunk.length * 75));
    u.onend = function () { clearTimeout(timer); next(mine); };
    u.onerror = function () { clearTimeout(timer); next(mine); };
    try { speechSynthesis.speak(u); } catch (e) { clearTimeout(timer); next(mine); }
  }
  try { speechSynthesis.cancel(); } catch (e) {}
  if (speechSynthesis.getVoices && !speechSynthesis.getVoices().length) {
    speechSynthesis.onvoiceschanged = function () { speechSynthesis.onvoiceschanged = null; next(); };
    setTimeout(next, 400);
    return;
  }
  next();
}

function callStop() {
  CALL.on = false;
  CALL.phase = 'idle';
  try { if (CALL.rec) CALL.rec.abort(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  const box = $('#call'); if (box) box.className = '';
}

const _sheetActCall = sheetAct;
sheetAct = function (a, v, b) {
  if (a === 'call') { sheetClose(); return callStart(); }
  return _sheetActCall(a, v, b);
};
const _sheetRenderCall = sheetRender;
sheetRender = function () {
  _sheetRenderCall();
  if (SHEET !== 'plus') return;
  const grp = document.querySelector('#sheet .grp');
  if (!grp || grp.querySelector('[data-a=call]')) return;
  const btn = document.createElement('button');
  btn.className = 'it'; btn.dataset.a = 'call';
  btn.innerHTML = '<span class="ic">📞</span><span class="tx"><b>Appeler l\'IA</b><small>Tu parles, la réponse est lue. Micro de l\'iPhone, sans quitter l\'appli.</small></span>';
  grp.insertBefore(btn, grp.firstChild);
};

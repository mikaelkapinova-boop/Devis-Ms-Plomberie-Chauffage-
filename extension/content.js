/* Panneau Ms Devis sur perplexity.ai uniquement.
   Ne lit pas le chat Perplexity, n'envoie rien à sa place, ne touche pas aux cookies. */
(function () {
  const SITE = 'https://mikaelkapinova-boop.github.io/Devis-Ms-Plomberie-Chauffage-/index.html?panneau=1&v=44';
  const KEY = 'ms-panneau';
  const BAS = 150;

  const etat = { x: 12, y: 12, w: 380, h: 520, mode: 'moi', ouvert: true, mini: false };

  function sauver() {
    try { chrome.storage.local.set({ [KEY]: etat }); } catch (e) {}
  }
  function charger(cb) {
    try {
      chrome.storage.local.get(KEY, function (r) {
        if (r && r[KEY]) Object.assign(etat, r[KEY]);
        cb();
      });
    } catch (e) { cb(); }
  }

  function appliquer() {
    const p = document.getElementById('ms-panneau');
    const rouvrir = document.getElementById('ms-reouvrir');
    if (!p) return;
    p.classList.toggle('ferme', !etat.ouvert);
    p.classList.toggle('pplx', etat.mode === 'pplx');
    p.classList.toggle('mini', etat.mini && etat.mode === 'moi');
    if (rouvrir) rouvrir.hidden = etat.ouvert;
    if (!etat.ouvert || etat.mode === 'pplx') return;
    const maxW = Math.max(280, window.innerWidth - 16);
    const maxH = Math.max(220, window.innerHeight - BAS - 8);
    etat.w = Math.min(etat.w, maxW);
    etat.h = Math.min(etat.mini ? 52 : etat.h, maxH);
    p.style.width = etat.mini ? 'auto' : etat.w + 'px';
    p.style.height = etat.mini ? 'auto' : etat.h + 'px';
    p.style.left = Math.max(8, Math.min(etat.x, window.innerWidth - 80)) + 'px';
    p.style.top = Math.max(8, Math.min(etat.y, window.innerHeight - BAS - 48)) + 'px';
    p.style.right = 'auto';
    marquer();
  }

  function marquer() {
    document.querySelectorAll('#ms-panneau [data-mode]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.mode === etat.mode);
    });
  }

  function choisir(mode) {
    etat.mode = mode;
    etat.ouvert = true;
    etat.mini = false;
    sauver();
    appliquer();
    const frame = document.querySelector('#ms-panneau iframe');
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'ms-chat', which: mode }, '*');
    }
  }

  function construire() {
    if (document.getElementById('ms-panneau')) return;
    const p = document.createElement('div');
    p.id = 'ms-panneau';
    p.innerHTML = '<header id="ms-tete"><b>Ms Devis</b>'
      + '<button type="button" data-mode="moi">Mon chat</button>'
      + '<button type="button" data-mode="pplx">Perplexity</button>'
      + '<button type="button" data-act="mini" title="Réduire">–</button>'
      + '<button type="button" data-act="plus" title="Agrandir">+</button>'
      + '<button type="button" data-act="reset" title="Réinitialiser">↺</button>'
      + '<button type="button" data-act="ferm" title="Fermer">×</button></header>'
      + '<iframe title="Ms Devis" src="' + SITE + '" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals" allow="camera; microphone; clipboard-read; clipboard-write" referrerpolicy="no-referrer"></iframe>'
      + '<div id="ms-poignee" title="Taille"></div>';
    document.documentElement.appendChild(p);
    const rouvrir = document.createElement('button');
    rouvrir.id = 'ms-reouvrir';
    rouvrir.type = 'button';
    rouvrir.textContent = 'Ms Devis';
    rouvrir.hidden = true;
    rouvrir.addEventListener('click', function () { etat.ouvert = true; sauver(); appliquer(); });
    document.documentElement.appendChild(rouvrir);

    p.addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) return choisir(b.dataset.mode);
      if (b.dataset.act === 'mini') { etat.mini = !etat.mini; etat.mode = 'moi'; }
      if (b.dataset.act === 'plus') {
        etat.mini = false;
        etat.mode = 'moi';
        etat.w = Math.min(window.innerWidth - 16, etat.w + 80);
        etat.h = Math.min(window.innerHeight - BAS - 8, etat.h + 80);
      }
      if (b.dataset.act === 'reset') {
        etat.x = 12; etat.y = 12; etat.w = 380; etat.h = 520; etat.mini = false; etat.mode = 'moi'; etat.ouvert = true;
      }
      if (b.dataset.act === 'ferm') etat.ouvert = false;
      sauver();
      appliquer();
    });

    deplacer(p.querySelector('#ms-tete'), function (dx, dy) {
      etat.x += dx; etat.y += dy; appliquer();
    }, sauver);
    deplacer(p.querySelector('#ms-poignee'), function (dx, dy) {
      etat.w = Math.max(280, etat.w + dx);
      etat.h = Math.max(220, etat.h + dy);
      appliquer();
    }, sauver);

    window.addEventListener('message', function (e) {
      const frame = document.querySelector('#ms-panneau iframe');
      if (!e.data || !frame || e.source !== frame.contentWindow) return;
      if (e.data.type === 'ms-chat' && (e.data.which === 'moi' || e.data.which === 'pplx')) choisir(e.data.which);
      if (e.data.type === 'ms-envoi' && e.data.text) envoyerSurLaPage(String(e.data.text), e.data.files || []);
    });
    window.addEventListener('resize', appliquer);
    appliquer();
  }


  function champSaisie() {
    const nodes = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'));
    const visibles = nodes.filter(function (n) {
      if (n.closest('#ms-panneau')) return false;
      const r = n.getBoundingClientRect();
      return r.width > 80 && r.height > 16 && r.bottom > 40 && r.top < window.innerHeight;
    });
    visibles.sort(function (a, b) { return b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom; });
    return visibles[0] || null;
  }
  function ecrireChamp(el, texte) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (proto && proto.set) proto.set.call(el, texte);
      else el.value = texte;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, texte);
    if (!(el.innerText || '').includes(texte.slice(0, 24))) {
      el.textContent = texte;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: texte, inputType: 'insertText' }));
    }
  }
  function boutonEnvoi(el) {
    const racine = el.closest('form') || el.parentElement || document.body;
    const zone = racine.getBoundingClientRect();
    const boutons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(function (b) {
      if (b.closest('#ms-panneau') || b.disabled) return false;
      const r = b.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const pres = Math.abs(r.top - zone.bottom) < 220 || (r.top >= zone.top - 40 && r.bottom <= zone.bottom + 80);
      return pres;
    });
    const mot = /^(send|submit|envoyer|soumettre)$/i;
    const nomme = boutons.find(function (b) {
      if (b.tagName === 'A' || b.closest('a') || b.getAttribute('href')) return false;
      const nom = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).trim();
      if (/app|ouvrir|open|download|edge/i.test(nom)) return false;
      return mot.test(b.getAttribute('aria-label') || '') || mot.test(b.getAttribute('data-testid') || '');
    });
    return nomme || null;
  }
  function joindre(files) {
    const list = Array.from(files || []).filter(function (f) { return f && f.size; });
    if (!list.length) return true;
    const input = Array.from(document.querySelectorAll('input[type="file"]')).find(function (i) { return !i.closest('#ms-panneau'); });
    if (!input) return false;
    const dt = new DataTransfer();
    list.forEach(function (f) { dt.items.add(f); });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function ecrireEtEnvoyer(texte, files) {
    joindre(files);
    const el = champSaisie();
    if (!el) return false;
    ecrireChamp(el, texte);
    const b = boutonEnvoi(el);
    if (b) { b.click(); return true; }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return true;
  }
  function envoyerSurLaPage(texte, files) {
    const p = document.getElementById('ms-panneau');
    etat.mini = true;
    etat.mode = 'moi';
    appliquer();
    if (p) p.style.pointerEvents = 'none';
    setTimeout(function () {
      const ok = ecrireEtEnvoyer(texte, files);
      if (p) p.style.pointerEvents = '';
      const frame = document.querySelector('#ms-panneau iframe');
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'ms-envoi-etat', ok: ok }, '*');
      if (ok) { etat.mode = 'pplx'; etat.mini = false; }
      sauver();
      appliquer();
    }, 250);
  }

  function deplacer(el, onMove, onFin) {
    if (!el) return;
    let sx = 0, sy = 0, actif = false;
    function debut(e) {
      if (e.target.closest('button')) return;
      actif = true;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      e.preventDefault();
    }
    function bouge(e) {
      if (!actif) return;
      const p = e.touches ? e.touches[0] : e;
      onMove(p.clientX - sx, p.clientY - sy);
      sx = p.clientX; sy = p.clientY;
    }
    function fin() { if (!actif) return; actif = false; onFin(); }
    el.addEventListener('mousedown', debut);
    el.addEventListener('touchstart', debut, { passive: false });
    window.addEventListener('mousemove', bouge);
    window.addEventListener('touchmove', bouge, { passive: false });
    window.addEventListener('mouseup', fin);
    window.addEventListener('touchend', fin);
  }

  charger(construire);
})();

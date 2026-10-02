/* Pagination des devis, factures et rapports.
   Chaque page est un A4 complet : en-tête, contenu coupé entre les lignes,
   pied de page. Le découpage s'adapte à la longueur du document. */
'use strict';

const PDF = {
  W: 794,
  H: 1123,
  PAD_T: 36,
  PAD_B: 60,
  MINI: 58,
  GAP: 8
};

function pdfEsc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pdfLimit(i) {
  return PDF.H - PDF.PAD_T - PDF.PAD_B - (i > 0 ? PDF.MINI : 0) - PDF.GAP;
}

function pdfSum(arr, a, b) {
  let s = 0;
  const n = b == null ? arr.length : b;
  for (let i = a || 0; i < n; i++) s += arr[i].h;
  return s;
}

function pdfBox(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return Math.ceil(r.height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0));
}

function pdfBadEnd(p) {
  if (!p) return false;
  if (p.kind === 'h4' || p.kind === 'ph' || p.kind === 'hr') return true;
  return !!(p.cls && p.cls.indexOf('hb') >= 0);
}

function pdfGoodBreak(p) {
  return !p || p.kind === 'row' || p.kind === 'h4' || p.kind === 'tt';
}

function pdfKeep(pieces, i, lim) {
  const p = pieces[i];
  if (!p) return 1;
  if (p.kind === 'h4') {
    let n = 1, rows = 0, h = p.h;
    for (let j = i + 1; j < pieces.length && rows < 2 && n < 8; j++) {
      const q = pieces[j];
      if (q.kind === 'h4' || q.kind === 'tt' || q.kind === 'cn' || q.kind === 'ph') break;
      if (h + q.h > lim) break;
      h += q.h;
      n++;
      if (q.kind === 'row') rows++;
      if (q.kind === 'sub') break;
    }
    return n;
  }
  if (p.cls && p.cls.indexOf('hb') >= 0 && pieces[i + 1] && p.h + pieces[i + 1].h <= lim) return 2;
  if (p.kind === 'tt') {
    let n = 1;
    for (let j = i + 1; j < pieces.length && n < 6; j++) {
      const q = pieces[j];
      if (q.kind !== 'cn' && q.kind !== 'blk') break;
      if (q.bottom - p.y > lim) break;
      n++;
      if (q.kind === 'cn') break;
    }
    return n;
  }
  return 1;
}

function pdfPagesNeeded(total) {
  const l0 = pdfLimit(0);
  if (total <= l0 + 28) return 1;
  let n = 1, left = total - l0;
  while (left > 40 && n < 12) {
    n++;
    left -= pdfLimit(n - 1);
  }
  return n;
}

function pdfPackTarget(pieces, n) {
  const pages = [];
  let i = 0;
  for (let p = 0; p < n; p++) {
    const lim = pdfLimit(p);
    const page = [];
    if (i >= pieces.length) return null;
    const startY = pieces[i].y;
    const restSpan = pieces[pieces.length - 1].bottom - startY;
    const target = Math.min(lim * 0.96, restSpan / (n - p));
    while (i < pieces.length) {
      const usedNext = pieces[i].bottom - startY;
      if (page.length && usedNext > lim) break;
      if (!page.length && pieces[i].h > lim) {
        page.push(pieces[i]);
        i++;
        break;
      }
      const g = pdfKeep(pieces, i, lim);
      const gEnd = pieces[Math.min(pieces.length - 1, i + g - 1)];
      if (page.length && g > 1 && gEnd.bottom - startY > lim) break;
      if (page.length && (pieces[i].kind === 'h4' || pieces[i].kind === 'tt' || pieces[i].kind === 'cn') && usedNext > lim) break;
      if (p < n - 1 && page.length && pdfGoodBreak(pieces[i])) {
        const used = pieces[i - 1].bottom - startY;
        const remain = pieces[pieces.length - 1].bottom - pieces[i].y;
        let cap = 0;
        for (let k = p + 1; k < n; k++) cap += pdfLimit(k) * 0.98;
        if (remain <= cap && used >= target) break;
      }
      if (page.length && usedNext > lim) break;
      page.push(pieces[i]);
      i++;
    }
    if (!page.length) return null;
    pages.push(page);
  }
  return i >= pieces.length ? pages : null;
}

function pdfPackGreedy(pieces) {
  const pages = [];
  let page = [], idx = 0, start = 0;
  for (let i = 0; i < pieces.length; i++) {
    const lim = pdfLimit(page.length ? idx : idx);
    const startY = pieces[start].y;
    const g = pdfKeep(pieces, i, pdfLimit(idx));
    const gEnd = pieces[Math.min(pieces.length - 1, i + g - 1)];
    if (page.length && gEnd.bottom - startY > pdfLimit(idx)) {
      pages.push(page);
      page = [];
      idx++;
      start = i;
    }
    if (page.length && pieces[i].bottom - pieces[start].y > pdfLimit(idx)) {
      pages.push(page);
      page = [];
      idx++;
      start = i;
    }
    page.push(pieces[i]);
  }
  if (page.length) pages.push(page);
  return pages;
}

function pdfFixOrphans(pages) {
  const out = pages.map(p => p.slice()).filter(p => p.length);
  for (let p = 0; p < out.length - 1; p++) {
    while (out[p].length > 1 && pdfBadEnd(out[p][out[p].length - 1])) {
      out[p + 1].unshift(out[p].pop());
    }
    while (out[p + 1][0] && out[p + 1][0].kind === 'sub' && out[p].length > 1 && out[p][out[p].length - 1].kind === 'row') {
      out[p + 1].unshift(out[p].pop());
    }
  }
  return out.filter(p => p.length);
}

function pdfScore(pages) {
  if (!pages || !pages.length) return 1e9;
  let overflow = 0, orphan = 0;
  const fills = pages.map((pg, i) => {
    const lim = pdfLimit(i);
    const h = pdfSpan(pg);
    if (h > lim + 4) overflow += (h - lim) / lim;
    return h / lim;
  });
  pages.slice(0, -1).forEach(pg => { if (pdfBadEnd(pg[pg.length - 1])) orphan += 3; });
  if (pages.length === 1) return overflow * 30 + orphan;
  const avg = fills.reduce((a, b) => a + b, 0) / fills.length;
  const spread = fills.reduce((s, f) => s + Math.abs(f - avg), 0);
  const sparse = Math.max(0, 0.55 - Math.min(...fills)) * 4;
  return overflow * 30 + orphan + spread + sparse + pages.length * 0.35;
}

function pdfBalance(pages) {
  const out = pages.map(p => p.slice());
  for (let p = out.length - 1; p > 0; p--) {
    let guard = 0;
    while (guard++ < 40) {
      const lim = pdfLimit(p), prevLim = pdfLimit(p - 1), prev = out[p - 1];
      const cur = pdfSpan(out[p]), prevH = pdfSpan(prev);
      if (cur >= lim * 0.62 || prev.length <= 3) break;
      const last = prev[prev.length - 1];
      if (!last || last.kind === 'ph' || last.kind === 'bx' || last.kind === 'hr' || last.kind === 'h4') break;
      if (cur + last.h + 18 > lim) break;
      if ((last.kind === 'row' || last.kind === 'sub') && prevH - last.h < prevLim * 0.58) break;
      if (pdfBadEnd(prev[prev.length - 2])) break;
      out[p].unshift(prev.pop());
    }
  }
  return pdfFixOrphans(out);
}

function pdfAvoidShortSection(pages) {
  const out = pages.map(p => p.slice());
  for (let p = 0; p < out.length - 1; p++) {
    let rows = 0, k = out[p].length - 1;
    while (k >= 0 && (out[p][k].kind === 'row' || out[p][k].kind === 'sub')) {
      if (out[p][k].kind === 'row') rows++;
      k--;
    }
    if (!(out[p][k] && out[p][k].kind === 'h4' && rows > 0 && rows < 3)) continue;
    const move = out[p].splice(k);
    if (pdfSpan(move.concat(out[p + 1])) <= pdfLimit(p + 1) - 8) out[p + 1] = move.concat(out[p + 1]);
    else out[p].push(...move);
  }
  return out;
}

function pdfChoose(pieces) {
  const span = pieces.length ? pieces[pieces.length - 1].bottom - pieces[0].y : 0;
  let n = pdfPagesNeeded(span);
  let best = null, bestScore = 1e9;
  for (let extra = -1; extra < 2; extra++) {
    if (n + extra < 1) continue;
    const packed = pdfPackTarget(pieces, n + extra);
    if (!packed) continue;
    const fixed = pdfBalance(pdfAvoidShortSection(pdfFixOrphans(packed)));
    const sc = pdfScore(fixed);
    if (sc < bestScore) { best = fixed; bestScore = sc; }
  }
  const greedy = pdfBalance(pdfAvoidShortSection(pdfFixOrphans(pdfPackGreedy(pieces))));
  if (!best || pdfScore(greedy) < bestScore) best = greedy;
  return best;
}

function pdfSplitTall(el, maxH) {
  if (pdfBox(el) <= maxH) return [el];
  if (el.classList.contains('cn') || el.classList.contains('ph') || el.classList.contains('bx') || el.tagName === 'TABLE') return [el];
  const text = el.textContent || '';
  if (text.trim().length < 40) return [el];
  const lines = text.split(/\n/).filter((l, i, a) => l.length || a.length > 1);
  const parts = lines.length > 1 ? lines : text.split(/(\s+)/);
  const join = lines.length > 1 ? '\n' : '';
  const probe = el.cloneNode(false);
  probe.style.visibility = 'hidden';
  el.parentNode.appendChild(probe);
  const out = [];
  let buf = [];
  const emit = arr => {
    if (!arr.length) return;
    const n = el.cloneNode(false);
    if (el.getAttribute('style')) n.setAttribute('style', el.getAttribute('style'));
    n.className = el.className;
    n.textContent = join ? arr.join(join) : arr.join('');
    out.push(n);
  };
  parts.forEach(part => {
    buf.push(part);
    probe.textContent = join ? buf.join(join) : buf.join('');
    if (pdfBox(probe) > maxH && buf.length > 1) {
      buf.pop();
      emit(buf);
      buf = [part];
    }
  });
  emit(buf);
  probe.remove();
  return out.length ? out : [el];
}

function pdfPiece(el, extra) {
  const r = el.getBoundingClientRect();
  return Object.assign({
    html: el.outerHTML,
    h: Math.max(1, Math.ceil(r.height)),
    y: r.top,
    bottom: r.bottom,
    kind: 'blk',
    cls: el.className || '',
    section: '',
    rowIndex: 0
  }, extra);
}

function pdfSpan(arr, a, b) {
  const i0 = a || 0;
  const i1 = b == null ? arr.length : b;
  if (!arr.length || i0 >= i1) return 0;
  return arr[i1 - 1].bottom - arr[i0].y;
}

function pdfAtomize(root) {
  const maxH = pdfLimit(1) - 28;
  const pieces = [];
  let section = '';
  [...root.children].forEach(el => {
    if (el.classList.contains('stamp') || el.classList.contains('ft')) return;
    if (el.tagName === 'TABLE') {
      const rows = [...el.rows];
      const head = rows[0] ? rows[0].outerHTML : '';
      rows.slice(1).forEach((tr, idx) => {
        pieces.push(pdfPiece(tr, { kind: 'row', section, rowIndex: idx, head, h: Math.max(1, Math.ceil(tr.getBoundingClientRect().height)) }));
      });
      return;
    }
    if (el.classList.contains('pg')) {
      const figs = [...el.children];
      for (let i = 0; i < figs.length; i += 2) {
        const wrap = document.createElement('div');
        wrap.className = 'pg';
        figs.slice(i, i + 2).forEach(f => wrap.appendChild(f));
        root.appendChild(wrap);
        pieces.push(pdfPiece(wrap, { kind: 'blk', section }));
        wrap.remove();
      }
      return;
    }
    if (el.tagName === 'H4') {
      section = (el.textContent || '').trim();
      pieces.push(pdfPiece(el, { kind: 'h4', section }));
      return;
    }
    if (el.tagName === 'HR') {
      pieces.push(pdfPiece(el, { kind: 'hr' }));
      return;
    }
    const kind = el.classList.contains('sub') ? 'sub'
      : el.classList.contains('tt') ? 'tt'
      : el.classList.contains('cn') ? 'cn'
      : el.classList.contains('ph') ? 'ph'
      : el.classList.contains('bx') ? 'bx'
      : 'blk';
    const parts = (kind === 'blk' || el.classList.contains('tx') || el.classList.contains('bb')) ? pdfSplitTall(el, maxH) : [el];
    parts.forEach(node => {
      const attached = !!node.parentNode;
      if (!attached) el.parentNode.appendChild(node);
      pieces.push(pdfPiece(node, { kind, section }));
      if (!attached) node.remove();
    });
  });
  return pieces;
}

async function pdfMeasure(html, tight) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + PDF.W + 'px;background:#fff;';
  host.innerHTML = html;
  const root = host.querySelector('.pd') || host.firstElementChild;
  if (tight && root) root.classList.add('tight');
  document.body.appendChild(host);
  await Promise.all([...host.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => 0) : 0));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const stamp = root.querySelector('.stamp');
  const stampHTML = stamp ? stamp.outerHTML : '';
  if (stamp) stamp.remove();
  const ft = root.querySelector('.ft');
  if (ft) ft.remove();
  const pieces = pdfAtomize(root);
  host.remove();
  return { pieces, stampHTML };
}

function pdfMini(meta) {
  const logo = meta.logo ? '<img src="' + meta.logo + '" alt="">' : '<b>' + pdfEsc(meta.co) + '</b>';
  const who = meta.client ? '<div><b>' + pdfEsc(meta.client) + '</b></div>' : '';
  return '<div class="ph-mini">' + logo + who +
    '<div class="ph-mini-r"><b>' + pdfEsc(meta.lab) + '</b><br>N° ' + pdfEsc(meta.num) +
    (meta.date ? '<br>' + pdfEsc(meta.date) : '') + '</div></div>';
}

function pdfFoot(meta, i, n) {
  return '<div class="ft"><span>' + pdfEsc(meta.co) + ' — ' + pdfEsc(meta.nm) + ' — SIRET : ' + pdfEsc(meta.siret) + ' — Tél. : ' + pdfEsc(meta.tel) + '</span><span class="pg">' + i + ' / ' + n + '</span></div>';
}

function pdfRender(pieces, meta, index, total, stampHTML) {
  const page = document.createElement('div');
  page.className = 'pd pdf-page' + (index ? ' cont' : '');
  if (index === 0 && stampHTML) page.insertAdjacentHTML('afterbegin', stampHTML);
  if (index > 0) page.insertAdjacentHTML('beforeend', pdfMini(meta));
  const flow = document.createElement('div');
  flow.className = 'pdf-flow';
  let i = 0;
  let shown = {};
  while (i < pieces.length) {
    const p = pieces[i];
    if (p.kind === 'row') {
      if (p.section && !shown[p.section]) {
        const h = document.createElement('h4');
        h.textContent = p.section + (p.rowIndex > 0 ? ' (suite)' : '');
        flow.appendChild(h);
        shown[p.section] = 1;
      }
      const table = document.createElement('table');
      table.innerHTML = p.head || '';
      const head = p.head;
      const sec = p.section;
      while (i < pieces.length && pieces[i].kind === 'row' && pieces[i].head === head && pieces[i].section === sec) {
        table.insertAdjacentHTML('beforeend', pieces[i].html);
        i++;
      }
      flow.appendChild(table);
      continue;
    }
    if (p.kind === 'h4' && p.section) shown[p.section] = 1;
    flow.insertAdjacentHTML('beforeend', p.html);
    i++;
  }
  page.appendChild(flow);
  const next = arguments[5];
  if (next && next.length && next[0].kind === 'row' && pieces.length && pieces[pieces.length - 1].kind === 'row' && next[0].section === pieces[pieces.length - 1].section) {
    const s = document.createElement('div');
    s.className = 'suite';
    s.textContent = 'Suite page suivante';
    flow.appendChild(s);
  }
  page.insertAdjacentHTML('beforeend', pdfFoot(meta, index + 1, total));
  return page;
}

function pdfFits(page) {
  const flow = page.querySelector('.pdf-flow');
  const ft = page.querySelector('.ft');
  if (!flow || !ft) return true;
  return flow.getBoundingClientRect().bottom <= ft.getBoundingClientRect().top - 6;
}

function pdfMount(pages) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + PDF.W + 'px;background:#fff;';
  const stack = document.createElement('div');
  stack.className = 'pdf-stack';
  pages.forEach(p => stack.appendChild(p));
  host.appendChild(stack);
  document.body.appendChild(host);
  return host;
}

function pdfClosing(p) {
  return !!p && (p.kind === 'tt' || p.kind === 'cn' || p.kind === 'blk');
}

function pdfRepair(groups, meta, stampHTML) {
  let guard = 0;
  while (guard++ < 24) {
    groups = pdfBalance(pdfAvoidShortSection(pdfFixOrphans(groups)));
    const total = groups.length;
    const els = groups.map((g, i) => pdfRender(g, meta, i, total, i === 0 ? stampHTML : '', groups[i + 1]));
    const host = pdfMount(els);
    let bad = -1;
    els.forEach((el, i) => { if (bad < 0 && !pdfFits(el)) bad = i; });
    host.remove();
    if (bad < 0) return els;
    const pg = groups[bad];
    if (!pg || pg.length <= 1) return els;
    const tail = [];
    tail.unshift(pg.pop());
    while (pg.length > 1 && pdfClosing(pg[pg.length - 1]) && pdfClosing(tail[0])) tail.unshift(pg.pop());
    if (!groups[bad + 1]) groups.push([]);
    groups[bad + 1] = tail.concat(groups[bad + 1]);
  }
  groups = pdfBalance(pdfAvoidShortSection(pdfFixOrphans(groups)));
  return groups.map((g, i) => pdfRender(g, meta, i, groups.length, i === 0 ? stampHTML : '', groups[i + 1]));
}

async function buildPdfPages(html, meta) {
  meta = meta || {};
  let measured = await pdfMeasure(html, false);
  let pieces = measured.pieces;
  const total = pdfSum(pieces);
  if (total > pdfLimit(0) && total <= pdfLimit(0) * 1.07) {
    const tight = await pdfMeasure(html, true);
    if (pdfSum(tight.pieces) <= pdfLimit(0)) {
      measured = tight;
      pieces = tight.pieces;
    }
  }
  const groups = pdfChoose(pieces);
  const els = pdfRepair(groups.map(g => g.slice()), meta, measured.stampHTML);
  const stack = document.createElement('div');
  stack.className = 'pdf-stack';
  els.forEach(el => stack.appendChild(el));
  return stack;
}

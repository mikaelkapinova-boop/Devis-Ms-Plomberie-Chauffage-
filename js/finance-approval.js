/* Double validation before assistant-generated amounts are applied. */
(function () {
  'use strict';

  const originalAsReply = window.asReply;
  const originalQNew = window.qNew;
  const originalQInto = window.qInto;
  const originalQCat = window.qCat;
  const originalQCard = window.qCard;
  const originalSheetAct = window.sheetAct;
  const originalSheetClose = window.sheetClose;
  let pending = null;

  function euro(value) {
    return new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR'}).format(Number(value) || 0);
  }

  function total(q) {
    return ['F', 'M'].reduce((sum, key) => sum + (Array.isArray(q && q[key]) ? q[key] : []).reduce((part, line) => {
      const quantity = Number(line && line.q) || 0;
      const price = Number(line && line.p) || 0;
      return part + quantity * price;
    }, 0), 0);
  }

  function showApproval({title, action, amount, threadId, messageIndex, message, run}) {
    if (pending) return toast('Une validation financière est déjà ouverte.');
    pending = {threadId, messageIndex, message, run};
    const sheet = document.getElementById('sheet');
    if (!sheet) { pending = null; return toast('La validation financière est indisponible.'); }
    const formatted = euro(amount);
    sheet.innerHTML = `<div class="bg"></div><div class="pn finance-approval" role="dialog" aria-modal="true" aria-labelledby="finance-title">
      <div class="grab"></div><h2 id="finance-title">${title}<button type="button" data-a="money-cancel">Fermer</button></h2>
      <div class="px-card"><b>Montant estimé HT : ${formatted}</b><small>IA : Qwen3.5 local sur Oracle, sans fournisseur payant ni frais IA par requête. Les frais d’hébergement Oracle/Vercel ne sont pas mesurés dans l’application.</small></div>
      <p class="note">${esc(action)}. Cette validation applique les montants à un brouillon ou à tes tarifs ; elle ne réalise aucun paiement.</p>
      <label class="finance-check"><input id="finance-amount-check" type="checkbox"> J’ai relu et vérifié le montant affiché (${formatted} HT).</label>
      <label class="finance-check"><input id="finance-action-check" type="checkbox"> Je confirme cette action dans Devis MS.</label>
      <button class="b finance-confirm" type="button" data-a="money-approve" disabled><span>Valider et continuer</span></button>
      <button class="b gh finance-cancel" type="button" data-a="money-cancel"><span>Annuler</span></button>
    </div>`;
    sheet.classList.add('o');
    const sync = () => {
      const a = document.getElementById('finance-amount-check');
      const b = document.getElementById('finance-action-check');
      const submit = sheet.querySelector('[data-a="money-approve"]');
      if (submit) submit.disabled = !(a && a.checked && b && b.checked);
    };
    sheet.querySelectorAll('.finance-check input').forEach(input => input.addEventListener('change', sync));
  }

  function checkTarget(i) {
    const thread = typeof TH === 'function' ? TH() : null;
    const message = thread && thread.msgs && thread.msgs[i];
    if (!thread || !message || !message.q) return null;
    return {threadId: thread.id, messageIndex: i, message};
  }

  function guardedAction(i, label, callback) {
    const target = checkTarget(i);
    if (!target) return toast('La proposition chiffrée a changé. Réouvre-la puis réessaie.');
    const q = target.message.q;
    showApproval({
      title: 'Vérifier les montants', action: label, amount: total(q),
      ...target,
      run: () => {
        const thread = typeof TH === 'function' ? TH() : null;
        if (!thread || thread.id !== target.threadId || thread.msgs[i] !== target.message) {
          return toast('La conversation a changé. Réouvre la proposition pour confirmer.');
        }
        callback(i);
      }
    });
  }

  window.asReply = function (thread, text, via) {
    if (!thread || !['devis', 'facture', 'mdevis', 'mfact'].includes(thread.k)) return originalAsReply.apply(this, arguments);
    const parsed = typeof parseAI === 'function' ? parseAI(text) : null;
    if (!parsed || !parsed.q) return originalAsReply.apply(this, arguments);
    const editing = thread.k === 'mdevis' || thread.k === 'mfact';
    const clean = String(parsed.text || text || '').replace(/```json[\s\S]*?```/i, '').trim();
    const kind = thread.k === 'facture' || thread.k === 'mfact' ? 'facture' : 'devis';
    const suffix = editing
      ? `Proposition de modification de ${thread.doc || 'ton document'} : ${euro(total(parsed.q))} HT. Rien n’a été modifié. Vérifie puis confirme pour appliquer.`
      : `Brouillon de ${kind} prêt : ${euro(total(parsed.q))} HT. Aucun document n’a encore été créé. Vérifie puis confirme pour continuer.`;
    chatPush({
      r: 'a', t: [clean, suffix].filter(Boolean).join('\n\n'), q: parsed.q, via,
      financePending: editing ? {kind: 'edit', docId: thread.doc} : {kind: 'create', docType: kind}
    });
  };

  window.qNew = function (i, type) {
    return guardedAction(i, `Créer un brouillon de ${type === 'f' ? 'facture' : 'devis'}`, () => originalQNew(i, type));
  };
  window.qInto = function (i, id) {
    const doc = (S.docs || []).find(item => item.id === id);
    return guardedAction(i, `Ajouter les lignes au brouillon ${doc ? doc.num : ''}`, () => originalQInto(i, id));
  };
  window.qCat = function (i) {
    return guardedAction(i, 'Enregistrer les prix proposés dans « Mes tarifs »', () => originalQCat(i));
  };

  window.qCard = function (q, i) {
    let html = originalQCard.apply(this, arguments);
    const message = (S.chat || [])[i];
    if (message && message.financePending && message.financePending.kind === 'edit') {
      const doc = (S.docs || []).find(item => item.id === message.financePending.docId);
      if (doc) html += `<button class="b finance-edit" type="button" onclick="financeApproveEdit(${i})"><span>Vérifier et appliquer à ${esc(doc.num)}</span></button>`;
    }
    return html;
  };

  window.financeApproveEdit = function (i) {
    const target = checkTarget(i);
    if (!target || !target.message.financePending || target.message.financePending.kind !== 'edit') return toast('Aucune modification à confirmer.');
    const q = target.message.q;
    const docId = target.message.financePending.docId;
    const doc = (S.docs || []).find(item => item.id === docId);
    if (!doc) return toast('Le devis ou la facture n’existe plus.');
    showApproval({
      title: 'Confirmer la modification', action: `Modifier le brouillon ${doc.num}`,
      amount: total(q), ...target,
      run: () => {
        const thread = typeof TH === 'function' ? TH() : null;
        if (!thread || thread.id !== target.threadId || thread.msgs[i] !== target.message) return toast('La conversation a changé. Réouvre la proposition pour confirmer.');
        const current = (S.docs || []).find(item => item.id === docId);
        if (!current) return toast('Le devis ou la facture n’existe plus.');
        const previous = JSON.stringify({cn: current.cn, ca: current.ca, cc: current.cc, ct: current.ct, o: current.o, F: current.F, M: current.M});
        const client = q.client || {};
        if (client.nom) Object.assign(current, {cn: client.nom || current.cn, ca: client.adresse || current.ca, cc: client.cp_ville || current.cc, ct: client.tel || current.ct, ce: client.email || client.mail || current.ce || ''});
        if (current.cn && typeof cliCommit === 'function') cliCommit(1, current);
        if (q.objet) current.o = q.objet;
        current.F = q.F && q.F.length ? q.F.map(line => ({d: line.d, q: line.q, p: line.p || ''})) : [{d: '', q: 1, p: ''}];
        current.M = q.M && q.M.length ? q.M.map(line => ({d: line.d, q: line.q, p: line.p || ''})) : [{d: '', q: 1, p: ''}];
        current._prev = previous;
        save('docs');
        chatPush({r: 'a', t: `${current.num} modifié après validation · nouveau total ${euro(tot(current).t)}.`, via: 'Validation des montants', act: {open: current.id, v: 'e', num: current.num, undo: current.id}});
        render();
      }
    });
  };

  window.sheetAct = function (action, value, button) {
    if (action === 'money-cancel') { pending = null; return originalSheetClose.call(this); }
    if (action === 'money-approve') {
      const amountCheck = document.getElementById('finance-amount-check');
      const actionCheck = document.getElementById('finance-action-check');
      if (!amountCheck || !amountCheck.checked || !actionCheck || !actionCheck.checked || !pending) return toast('Coche les deux validations avant de continuer.');
      const job = pending; pending = null; originalSheetClose.call(this); job.run(); return;
    }
    return originalSheetAct.apply(this, arguments);
  };

  window.sheetClose = function () {
    pending = null;
    return originalSheetClose.apply(this, arguments);
  };

  const style = document.createElement('style');
  style.textContent = `.finance-approval .finance-check{display:flex;align-items:flex-start;gap:10px;padding:12px;background:var(--cd);border-radius:12px;margin:8px 2px;font-size:14px}.finance-approval .finance-check input{width:20px;height:20px;flex:none;margin:0}.finance-approval .finance-confirm,.finance-approval .finance-cancel{width:100%;margin-top:8px}.finance-approval .finance-confirm:disabled{opacity:.45}.finance-edit{width:100%;margin-top:8px}`;
  document.head.appendChild(style);
})();

const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../js/importer.js');
const { parse: parseDocument, toRows } = importer;
const { parse: parseExpense, expenseAmount } = require('../js/fournisseurs.js');

const handwrittenQuote = `DEVIS N° DEV-2026-TEST-015
Date : 15/10/2026
Client : Marc Démo
Adresse : 12 rue des Essais
Code postal : 59000 Lille
Tél : 06 12 34 56 78
E-mail : marc@example.test
Objet : Rénovation de la salle de bains
Adresse chantier : 8 avenue du Test
Code postal chantier : 59100 Roubaix
Désignation  Qté  Unité  Prix unitaire HT  Montant HT
Fournitures
Mitigeur lavabo  1  u  120,00 €  120,00 €
Tube multicouche  5  m  8,00 €  40,00 €
Main-d’œuvre
Pose du mitigeur  2  h  55,00 €  110,00 €
Total HT  270,00 €
TVA 10%  27,00 €
Total TTC  297,00 €`;

const publicInvoice = `Larkfield Stationers
A fictional company
Invoice no. INV-2026-0142
Invoice date 18 September 2026
Due date 18 October 2026
BILL TO
Example Traders (fictional)
Unit 5, Specimen Industrial Estate
Sampleton 000 000
# Description Qty Unit price Amount
1 A4 copier paper, 75 gsm, ream of 500  20  ₹285.00  ₹5,700.00
2 Ballpoint pens, blue, box of 50  4  ₹420.00  ₹1,680.00
3 Lever-arch files, A4, pack of 10  3  ₹899.00  ₹2,697.00
4 Whiteboard markers, assorted, pack of 4  6  ₹160.00  ₹960.00
5 Desk organiser, mesh, black  5  ₹349.00  ₹1,745.00
6 Sticky notes, 76 x 76 mm, pack of 12  8  ₹240.00  ₹1,920.00
Subtotal ₹14,702.00
GST at 18% ₹2,646.36
Total due ₹17,348.36`;

const scannedInvoiceOcr = `Larkfield Stationers TAX INVOICE
Invoice no. INV-2026-0142
Invoice date 18 September 2026
Due date 18 October 2026
BILL TO i:
Example Traders (fictional).
# Description Qty Unit price Amount
1 A4 copier paper, 75 gsm, ream of 500 20. 7285.00 ¥5,700.00
2 Ballpoint pens, blue, box of 50; 4 7420.00 71,680.00
3 Lever-arch files, A4, pack of 10 ' 3 “7899.00 ¥2,697.00
4 Whiteboard markers, assorted, pack of 4 6 7160.00 ’ 7960.00
5 Desk organiser, mesh, black 5 7349.00 71,745.00
6 Sticky notes, 76 x 76 mm, pack of 12 8 7240.00 71,920.00
i Subtotal ¥14,702.00
. : GST at 18% 32,646.36:
: Total due 717,348.36`;

test('first-run app model: uses the app’s canonical document and catalog fields', () => {
  global.S = { clients: [], cat: [], docs: [], rep: [] };
  const keys = importer.probe();
  assert.equal(keys.dNum, 'num');
  assert.equal(keys.dCli, 'cid');
  assert.deepEqual(keys.dEmb, { name: 'cn', addr: 'ca', postalCity: 'cc', tel: 'ct', email: 'ce' });
  assert.deepEqual([keys.cat.name, keys.cat.price, keys.cat.unit, keys.cat.type], ['d', 'p', 'u', 't']);
  assert.deepEqual(keys.r, { txt: 'tr', ti: 'ty', date: 'date', cli: 'cn' });
  delete global.S;
});

test('manual quote: preserves contact details, separates site address, and reconciles totals', () => {
  const d = parseDocument(handwrittenQuote, 'devis-manuel.txt', toRows(handwrittenQuote));
  assert.equal(d.type, 'd');
  assert.equal(d.num, 'DEV-2026-TEST-015');
  assert.equal(d.date, '2026-10-15');
  assert.equal(d.cli.name, 'Marc Démo');
  assert.equal(d.cli.email, 'marc@example.test');
  assert.equal(d.addrs.find(x => x.t === 'Facturation').addr, '12 rue des Essais');
  assert.deepEqual(d.addrs.find(x => x.t === 'Chantier'), {
    t: 'Chantier', addr: '8 avenue du Test', cp: '59100', ville: 'Roubaix'
  });
  assert.deepEqual(d.lines.map(x => [x.des, x.q, x.u, x.pu, x.kind]), [
    ['Mitigeur lavabo', 1, 'u', 120, 'F'],
    ['Tube multicouche', 5, 'm', 8, 'F'],
    ['Pose du mitigeur', 2, 'h', 55, 'M']
  ]);
  assert.deepEqual([d.tot.ht, d.tot.ttc, d.tot.rate], [270, 297, 10]);
  assert.deepEqual(d.warns, []);
});

test('iPhone screenshot quote header: reads a short document number and French date', () => {
  const text = `DEVIS\nN° DEV-932\nDate : 09/10/2026\nClient : M. Chelbi Abdelkoddous\nAdresse : 32 rue de Benney\nCode postal : 54290 Crévéchamps`;
  const d = parseDocument(text, 'Devis_932.pdf', toRows(text));
  assert.equal(d.num, 'DEV-932');
  assert.equal(d.date, '2026-10-09');
  assert.equal(d.cli.name, 'M. Chelbi Abdelkoddous');
});

test('document number falls back to a descriptive filename when OCR misses the header', () => {
  const d = parseDocument('DEVIS\nDate : 09/10/2026', 'Devis_932.pdf', toRows('DEVIS\nDate : 09/10/2026'));
  assert.equal(d.num, 'DEV-932');
});

test('full document transfer is blocked while extracted lines or totals need review', () => {
  const base = {type:'d',lines:[{des:'Travaux de plomberie',q:1,pu:1105.49,ok:true}],tot:{ht:1255.45,ttc:null,rate:0,rmPct:0}};
  assert.match(importer.transferProblems({data:base}).join(' '), /total HT lu \(1\s?255,45 €\).*1\s?105,49 €/);
  base.lines[0].ok = false;
  assert.match(importer.transferProblems({data:base}).join(' '), /ligne encadrée en orange/);
  base.lines[0].ok = true;
  base.tot.ht = 1105.49;
  assert.deepEqual(importer.transferProblems({data:base}), []);
});

test('manual intervention report: detects the report type, contact, worksite, date, and narrative', () => {
  const report = `RAPPORT D’INTERVENTION N° RAP-2026-021
Date : 15/09/2026
Client : Marc Démo
Adresse : 12 rue des Essais
Code postal : 59000 Lille
Adresse chantier : 8 avenue du Test
Code postal chantier : 59100 Roubaix
Observations : fuite localisée sous le lavabo.
Travaux réalisés : remplacement du joint cuivre et essai d’étanchéité.
Préconisations : surveiller le raccord pendant 48 heures.`;
  const d = parseDocument(report, 'rapport-manuel.txt', toRows(report));
  assert.equal(d.type, 'x');
  assert.equal(d.reportType, 'Recherche de fuite');
  assert.equal(d.num, 'RAP-2026-021');
  assert.equal(d.date, '2026-09-15');
  assert.equal(d.cli.name, 'Marc Démo');
  assert.equal(d.addrs.find(x => x.t === 'Chantier')?.addr, '8 avenue du Test');
  assert.match(d.txt, /remplacement du joint cuivre/);
  assert.deepEqual(d.warns, []);
});

test('expense files: parses fictitious French supplier invoice and receipt', () => {
  const invoice = parseExpense(`FACTURE FOURNISSEUR N° FOUR-2026-0042
Plomberie Démo Fournitures
Date : 14/10/2026
Total HT 120,00 €
TVA 20% 24,00 €
Total TTC 144,00 €`);
  assert.equal(invoice.supplier, 'Plomberie Démo Fournitures');
  assert.equal(invoice.invoice, 'FOUR-2026-0042');
  assert.equal(invoice.date, '2026-10-14');
  assert.deepEqual([invoice.ht, invoice.tva, invoice.ttc], [120, 24, 144]);

  const ticket = parseExpense(`TICKET N° TK-2026-008
Café Démo (fictif)
Date : 13/10/2026
Repas équipe chantier
Total TTC 24,50 €
TVA 10% 2,23 €`);
  assert.equal(ticket.supplier, 'Café Démo (fictif)');
  assert.equal(ticket.invoice, 'TK-2026-008');
  assert.equal(ticket.type, 'repas');
  assert.deepEqual([ticket.ht, ticket.tva, ticket.ttc, expenseAmount(ticket)], ['', 2.23, 24.5, 24.5]);
});

test('CSV supplier import: handles semicolon rows and labeled supplier', () => {
  const csv = `Fournisseur;Plomberie Démo Fournitures
Facture;FOUR-2026-0055
Date;15/10/2026
Libellé;Joint et raccord de plomberie
Total HT;80,00 €
TVA;16,00 €
Net à payer;96,00 €`.replace(/[;\t]/g, '  ');
  const d = parseExpense(csv);
  assert.equal(d.supplier, 'Plomberie Démo Fournitures');
  assert.equal(d.invoice, 'FOUR-2026-0055');
  assert.equal(d.date, '2026-10-15');
  assert.deepEqual([d.ht, d.tva, d.ttc], [80, 16, 96]);
});

test('public sample invoice: reads US-formatted currency, invoice/date fields, and line totals', () => {
  const d = parseDocument(publicInvoice, 'sample-invoice.pdf', toRows(publicInvoice));
  assert.equal(d.type, 'f');
  assert.equal(d.num, 'INV-2026-0142');
  assert.equal(d.date, '2026-09-18');
  assert.equal(d.due, '2026-10-18');
  assert.equal(d.lines.length, 6);
  assert.equal(d.lines.every(x => x.kind === 'F' && x.ok), true);
  assert.equal(d.lines.reduce((s, x) => s + x.q * x.pu, 0), 14702);
  assert.deepEqual([d.tot.ht, d.tot.ttc, d.tot.rate], [14702, 17348.36, 18]);
  assert.deepEqual(d.warns, []);
  const expense = parseExpense(publicInvoice);
  assert.equal(expense.supplier, 'Larkfield Stationers');
  assert.equal(expense.invoice, 'INV-2026-0142');
  assert.deepEqual([expense.ht, expense.tva, expense.ttc], [14702, 2646.36, 17348.36]);
});

test('scanned invoice OCR: ignores currency glyph noise and validates the printed line arithmetic', () => {
  const d = parseDocument(scannedInvoiceOcr, 'sample-scanned-invoice.pdf', toRows(scannedInvoiceOcr));
  assert.equal(d.type, 'f');
  assert.equal(d.num, 'INV-2026-0142');
  assert.equal(d.date, '2026-09-18');
  assert.equal(d.cli.name, 'Example Traders (fictional).');
  assert.deepEqual(d.lines.map(x => [x.q, x.pu]), [[20, 285], [4, 420], [3, 899], [6, 160], [5, 349], [8, 240]]);
  assert.equal(d.lines.reduce((sum, x) => sum + x.q * x.pu, 0), 14702);
  assert.deepEqual([d.tot.ht, d.tot.ttc, d.tot.rate], [14702, 17348.36, 18]);
  assert.equal(d.warns.length, 1);
  assert.match(d.warns[0], /Caractères OCR corrigés/);
});

test('scanned supplier receipt: skips OCR time and item rows when finding vendor, date, GST, and total', () => {
  const receipt = `Receipt 2026-0918-0457
18/09/2026  08: 42  Till 2
2 x Masala chai  80.00
1 x Filter coffee  55.00
2 x Veg sandwich  180.00
1 x Banana bread slice  65.00
TOTAL  380.00
incl. GST 5%  18.10
Paid by card  380.00
made by filedone. ai for testing
3 Example Street, Sampleton
Thank you, see you again!
Tax no. : SPECIMEN-TAX-0003
SPECIMEN - fictional receipt
Free to use (CC0 1.0)
CORNER CAFE
(a fictional cafe)`;
  const d = parseExpense(receipt);
  assert.equal(d.supplier, 'CORNER CAFE');
  assert.equal(d.invoice, '2026-0918-0457');
  assert.equal(d.date, '2026-09-18');
  assert.equal(d.type, 'repas');
  assert.deepEqual([d.ht, d.tva, d.ttc, expenseAmount(d)], ['', 18.1, 380, 380]);
});

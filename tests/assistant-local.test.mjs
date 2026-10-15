import test from 'node:test';
import assert from 'node:assert/strict';
import {answerLocal, buildLocalCorpus, calculateLocal, searchLocalRecords} from '../js/assistant-local-core.mjs';

const sample = {
  today:'2026-10-15',
  docs:[
    {id:'fac-1',num:'FAC-2026-001',t:'f',date:'2026-09-14',cn:'Marc Démo',o:'Salle de bains',paid:false,total:144,remaining:144,F:[{d:'Tube multicouche',q:5,p:8}],M:[],st:'att'},
    {id:'dev-1',num:'DEV-2026-001',t:'d',date:'2026-09-10',cn:'Marc Démo',o:'Mitigeur lavabo',paid:false,total:297,remaining:297,F:[{d:'Mitigeur lavabo',q:1,p:120}],M:[],st:'att'}
  ],
  reports:[{id:'rap-1',num:'RAP-2026-001',ty:'Recherche de fuite',date:'2026-09-12',cn:'Marc Démo',mo:'Fuite sous lavabo'}],
  clients:[{id:'cli-1',n:'Marc Démo',a:'8 avenue du Test',c:'59100 Roubaix',t:'0612345678',e:'marc@example.test'}],
  cat:[{id:'cat-1',d:'Mitigeur lavabo',t:'F',ref:'MIT-01',fo:'Fournisseur Démo',p:120,u:'u'}],
  plan:[{id:'plan-1',date:'2026-10-17',hs:'09:00',cn:'Marc Démo',o:'Remplacement du mitigeur',st:'p'}],
  achats:[
    {id:'ach-1',supplier:'Plomberie Démo',invoice:'FOUR-001',date:'2026-09-14',month:'2026-09',scope:'chantier',chantierName:'Salle de bains',total:144},
    {id:'ach-2',supplier:'Café Démo',invoice:'TK-001',date:'2026-09-15',month:'2026-09',scope:'month',total:24.5}
  ]
};

test('local assistant reports unpaid invoice totals from saved data', async () => {
  const answer = await answerLocal('montre mes factures impayées', sample);
  assert.match(answer.text, /1 facture.*144,00/);
  assert.equal(answer.matches[0].id,'fac-1');
});

test('local assistant separates monthly expenses from job expenses', async () => {
  const answer = await answerLocal('dépenses de septembre 2026', sample);
  assert.match(answer.text, /168,50/);
  assert.match(answer.text, /24,50/);
  assert.match(answer.text, /144,00/);
});

test('Fuse fuzzy search tolerates accents and typos in catalog items', async () => {
  const corpus = buildLocalCorpus(sample);
  const hits = await searchLocalRecords(corpus,'mitigeu lavab',6);
  assert.equal(hits[0].id,'cat-1');
});

test('Fuse ranks a specific match above common words in a large catalogue', async () => {
  const catalogue = Array.from({length:12000}, (_, i) => ({
    id:`item-${i}`, kind:'tarif', label:`Article ${i}`, search:`plomberie article ${i} raccord cuivre`, date:''
  }));
  const hits = await searchLocalRecords(catalogue,'plomberie article 11999 raccord cuivre',5);
  assert.equal(hits[0].id,'item-11999');
});

test('local assistant opens named app sections without calling a remote model', async () => {
  const answer = await answerLocal('ouvre mes factures',sample);
  assert.equal(answer.page,'f');
});

test('local assistant prepares a quote draft and flags missing prices for review', async () => {
  const quote = {F:[{d:'Mitigeur',q:1,p:90}],M:[{d:'Pose',q:2,p:''}]};
  const answer = await answerLocal('prépare un devis',sample,quote);
  assert.equal(answer.quote,quote);
  assert.match(answer.text,/2 ligne\(s\)/);
  assert.match(answer.text,/1 prix sont manquants/);
});

test('safe arithmetic accepts French multiplication and rejects executable text', () => {
  assert.equal(calculateLocal('18 × 42'),756);
  assert.equal(calculateLocal('(8 + 4) / 3'),4);
  assert.equal(calculateLocal('alert(1)'),null);
});

'use strict';

const {setCors, verifyToken} = require('../lib/sync-auth');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Méthode non autorisée'});

  const auth = verifyToken(req);
  if (!auth.ok) return res.status(auth.status).json({error: auth.error});

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const stages = new Set(['read', 'decrypt', 'write', 'sync']);
  const stage = stages.has(body.stage) ? body.stage : 'sync';
  const code = /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(String(body.code || '')) ? String(body.code) : 'Error';
  const status = Math.min(599, Math.max(0, Number(body.status) || 0));
  console.error('Cloud client sync failure:', {stage, code, status});
  return res.status(204).end();
};

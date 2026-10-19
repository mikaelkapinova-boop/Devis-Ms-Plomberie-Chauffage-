'use strict';

const {setCors, validPassword, issueToken} = require('../lib/sync-auth');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Méthode non autorisée'});

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(body.id || '').trim().toLowerCase();
  if (!validPassword(id, body.pass)) return res.status(401).json({error: 'Identifiant ou mot de passe incorrect'});
  try {
    return res.status(200).json({token: issueToken(id, !!body.remember)});
  } catch (error) {
    return res.status(503).json({error: 'Stockage en ligne indisponible'});
  }
};

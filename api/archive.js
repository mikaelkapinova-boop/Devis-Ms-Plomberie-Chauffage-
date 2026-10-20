'use strict';

const crypto = require('node:crypto');
const {setCors, verifyToken} = require('../lib/sync-auth');
const githubStorage = require('../lib/github-storage');

function safeName(value) {
  const name = String(value || 'document.pdf').replace(/[\\/\r\n\0]/g, '_').trim();
  return (name || 'document.pdf').slice(0, 180);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({error: 'Méthode non autorisée'});

  const auth = verifyToken(req);
  if (!auth.ok) return res.status(auth.status).json({error: auth.error});

  let cfg;
  try { cfg = githubStorage.config(); }
  catch (error) { return res.status(error.status || 503).json({error: error.message}); }
  if (!cfg) return res.status(503).json({error: 'Le dépôt privé GitHub n’est pas configuré pour les fichiers PDF.'});

  try {
    await githubStorage.assertPrivateRepository(cfg);
    if (req.method === 'PUT') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sha = String(body.sha || '').toLowerCase();
      const iv = typeof body.iv === 'string' ? Buffer.from(body.iv, 'base64') : Buffer.alloc(0);
      if (body.encrypted !== true || iv.length !== 12 || !/^[a-f0-9]{64}$/.test(sha) || typeof body.data !== 'string' || !body.data) {
        return res.status(400).json({error: 'Fichier PDF invalide.'});
      }
      if (Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024) return res.status(413).json({error: 'Ce PDF dépasse la taille maximale autorisée.'});
      const bytes = Buffer.from(body.data, 'base64');
      if (bytes.length > 2_800_000) return res.status(413).json({error: 'Ce PDF dépasse la taille maximale autorisée.'});
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha) return res.status(400).json({error: 'La vérification du PDF a échoué.'});

      const path = `documents/${sha}.pdf.enc`;
      const existing = await githubStorage.readFile(cfg, path);
      if (existing) {
        const actual = crypto.createHash('sha256').update(existing.bytes).digest('hex');
        if (actual !== sha) return res.status(409).json({error: 'Le fichier PDF déjà archivé ne correspond pas.'});
        return res.status(200).json({sha, name: safeName(body.name), size: bytes.length});
      }
      try { await githubStorage.writeFile(cfg, path, bytes, '', 'Archive source PDF'); }
      catch (error) {
        if (error.status !== 409) throw error;
        const winner = await githubStorage.readFile(cfg, path);
        if (!winner || crypto.createHash('sha256').update(winner.bytes).digest('hex') !== sha) throw error;
      }
      return res.status(201).json({sha, name: safeName(body.name), size: bytes.length});
    }

    const rawSha = req.query && req.query.sha;
    const sha = String(Array.isArray(rawSha) ? rawSha[0] : rawSha || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha)) return res.status(400).json({error: 'Référence de PDF invalide.'});
    const file = await githubStorage.readFile(cfg, `documents/${sha}.pdf.enc`);
    if (!file) return res.status(404).json({error: 'PDF archivé introuvable.'});
    const actual = crypto.createHash('sha256').update(file.bytes).digest('hex');
    if (actual !== sha) return res.status(500).json({error: 'La vérification du PDF archivé a échoué.'});
    const rawName = req.query && req.query.name;
    const name = safeName(Array.isArray(rawName) ? rawName[0] : rawName);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(file.bytes.length));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    return res.status(200).send(file.bytes);
  } catch (error) {
    console.error('Private PDF archive error:', {name: String(error && error.name || 'UnknownError'), status: Number(error && error.status) || 0});
    return res.status(error && error.status || 502).json({error: error && error.message || 'Stockage des PDF indisponible.'});
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '4mb'}}};

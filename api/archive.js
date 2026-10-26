'use strict';

const crypto = require('node:crypto');
const {setCors, verifyToken} = require('../lib/sync-auth');
const githubStorage = require('../lib/github-storage');

function safeName(value) {
  const name = String(value || 'document.pdf').replace(/[\\/\r\n\0]/g, '_').trim();
  return (name || 'document.pdf').slice(0, 180);
}

function oracleConfig() {
  const base = String(process.env.ORACLE_AI_URL || '').trim();
  const token = String(process.env.ORACLE_AI_TOKEN || '').trim();
  if (!base || token.length < 32) throw Object.assign(new Error('Stockage Oracle non configuré'), {status: 503});
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Object.assign(new Error('Adresse HTTPS Oracle invalide'), {status: 503});
  return {base: url, token};
}

async function fetchOracle(config, path, options = {}) {
  return fetch(new URL(path, config.base), {
    ...options,
    headers: {...(options.headers || {}), Authorization: 'Bearer ' + config.token},
    signal: AbortSignal.timeout(25000)
  });
}

async function oldGithubFile(sha) {
  const cfg = githubStorage.config();
  if (!cfg) return null;
  await githubStorage.assertPrivateRepository(cfg);
  return githubStorage.readFile(cfg, `documents/${sha}.pdf.enc`);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({error: 'Méthode non autorisée'});

  const auth = verifyToken(req);
  if (!auth.ok) return res.status(auth.status).json({error: auth.error});

  let config;
  try { config = oracleConfig(); }
  catch (error) { return res.status(error.status || 503).json({error: error.message}); }

  try {
    if (req.method === 'PUT') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sha = String(body.sha || '').toLowerCase();
      const iv = typeof body.iv === 'string' ? Buffer.from(body.iv, 'base64') : Buffer.alloc(0);
      if (body.encrypted !== true || iv.length !== 12 || !/^[a-f0-9]{64}$/.test(sha) || typeof body.data !== 'string' || !body.data) {
        return res.status(400).json({error: 'Fichier chiffré invalide.'});
      }
      if (Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024) return res.status(413).json({error: 'Ce PDF dépasse la taille maximale autorisée.'});
      const bytes = Buffer.from(body.data, 'base64');
      if (bytes.length > 2_800_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== sha) {
        return res.status(400).json({error: 'La vérification du PDF a échoué.'});
      }
      const upstream = await fetchOracle(config, `/storage/archive/${sha}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({encrypted: true, data: bytes.toString('base64')})
      });
      let result = {}; try { result = await upstream.json(); } catch (_) {}
      if (!upstream.ok) return res.status(upstream.status).json({error: result.error && result.error.message || 'Enregistrement Oracle impossible.'});
      return res.status(upstream.status).json({sha, name: safeName(body.name), size: bytes.length, iv: body.iv});
    }

    const rawSha = req.query && req.query.sha;
    const sha = String(Array.isArray(rawSha) ? rawSha[0] : rawSha || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha)) return res.status(400).json({error: 'Référence de PDF invalide.'});
    const nameValue = req.query && req.query.name;
    const name = safeName(Array.isArray(nameValue) ? nameValue[0] : nameValue);
    let upstream = await fetchOracle(config, `/storage/archive/${sha}`, {method: 'GET'});
    let bytes;
    if (upstream.status === 404) {
      /* Old encrypted archives are moved when first opened after the storage change. */
      let old;
      try { old = await oldGithubFile(sha); }
      catch (error) {
        console.error('Legacy archive migration unavailable:', {name: String(error && error.name || 'UnknownError'), status: Number(error && (error.status || error.statusCode)) || 0});
        return res.status(503).json({error: 'Le PDF existant n’a pas pu être migré. Les données locales ne sont pas modifiées.'});
      }
      if (!old) return res.status(404).json({error: 'PDF archivé introuvable.'});
      bytes = Buffer.from(old.bytes);
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha) return res.status(500).json({error: 'La vérification du PDF archivé a échoué.'});
      upstream = await fetchOracle(config, `/storage/archive/${sha}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({encrypted: true, data: bytes.toString('base64')})
      });
      let migrated = {}; try { migrated = await upstream.json(); } catch (_) {}
      if (!upstream.ok) return res.status(upstream.status).json({error: migrated.error && migrated.error.message || 'Migration de l’archive vers Oracle impossible.'});
    } else if (!upstream.ok) {
      let data = {}; try { data = await upstream.json(); } catch (_) {}
      return res.status(upstream.status).json({error: data.error && data.error.message || 'Archive Oracle indisponible.'});
    }

    if (!bytes) bytes = Buffer.from(await upstream.arrayBuffer());
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha) return res.status(500).json({error: 'La vérification du PDF archivé a échoué.'});
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('Oracle archive relay error:', {name: String(error && error.name || 'UnknownError'), status: Number(error && (error.status || error.statusCode)) || 0});
    return res.status(502).json({error: 'Stockage Oracle temporairement indisponible.'});
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '4mb'}}};

'use strict';

const {setCors, verifyToken} = require('../lib/sync-auth');
const githubStorage = require('../lib/github-storage');
const PATHNAME = 'shared/ms-plomberie-state.json';

function oracleConfig() {
  const base = String(process.env.ORACLE_AI_URL || '').trim();
  const token = String(process.env.ORACLE_AI_TOKEN || '').trim();
  if (!base || token.length < 32) throw Object.assign(new Error('Stockage Oracle non configuré dans Vercel'), {status: 503});
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Object.assign(new Error('Adresse HTTPS Oracle invalide'), {status: 503});
  return {base: url, token};
}

async function oracleFetch(path, config, options = {}) {
  const target = new URL(path, config.base);
  const response = await fetch(target, {
    ...options,
    headers: {...(options.headers || {}), Authorization: 'Bearer ' + config.token},
    signal: AbortSignal.timeout(20000)
  });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return {response, data};
}

async function readLegacyBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const {get, BlobNotFoundError} = await import('@vercel/blob');
  let result;
  try { result = await get(PATHNAME, {access: 'private', useCache: false}); }
  catch (error) {
    if (error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError' || error?.status === 404 || error?.statusCode === 404) return null;
    throw error;
  }
  if (!result || result.statusCode === 404) return null;
  const saved = JSON.parse(await new Response(result.stream).text());
  if (!saved || !saved.pack || saved.pack.enc !== 1) throw new Error('Ancienne sauvegarde Vercel illisible');
  return saved.pack;
}

async function readLegacy() {
  const github = githubStorage.config();
  if (github) {
    await githubStorage.assertPrivateRepository(github);
    const remote = await githubStorage.readText(github, PATHNAME);
    if (remote) {
      const saved = JSON.parse(remote.text);
      if (!saved || !saved.pack || saved.pack.enc !== 1) throw new Error('Ancienne sauvegarde GitHub illisible');
      return saved.pack;
    }
  }
  return readLegacyBlob();
}

function sendOracleError(res, response, data) {
  const status = Number(response && response.status) || 502;
  const message = data && data.error && data.error.message || 'Stockage Oracle indisponible';
  return res.status(status).json({error: message});
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

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (req.method === 'PUT' && (!body.pack || body.pack.enc !== 1 || !body.pack.iv || !body.pack.ct)) {
    return res.status(400).json({error: 'Données de synchronisation chiffrées invalides'});
  }
  if (req.method === 'PUT' && Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024) {
    return res.status(413).json({error: 'Sauvegarde trop volumineuse'});
  }

  try {
    if (req.method === 'PUT') {
      const raw = req.headers['if-match'];
      const ifMatch = String(Array.isArray(raw) ? raw[0] : raw || body.ifMatch || '').trim();
      const result = await oracleFetch('/storage/sync', config, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', ...(ifMatch ? {'If-Match': ifMatch} : {})},
        body: JSON.stringify({pack: body.pack})
      });
      if (!result.response.ok) return sendOracleError(res, result.response, result.data);
      return res.status(200).json({etag: result.data.etag, storage: 'oracle'});
    }

    let result = await oracleFetch('/storage/sync', config, {method: 'GET', headers: {Accept: 'application/json'}});
    if (!result.response.ok) return sendOracleError(res, result.response, result.data);
    if (result.data && result.data.pack) return res.status(200).json({...result.data, storage: 'oracle'});

    /* First Oracle read: migrate the existing encrypted snapshot without exposing its contents. */
    let legacy = null;
    try { legacy = await readLegacy(); }
    catch (error) {
      console.error('Legacy sync migration unavailable:', {name: String(error && error.name || 'UnknownError'), status: Number(error && (error.status || error.statusCode)) || 0});
      return res.status(503).json({error: 'La sauvegarde existante n’a pas pu être migrée automatiquement. Les données locales restent intactes.'});
    }
    if (!legacy) return res.status(200).json({pack: null, etag: '', storage: 'oracle'});

    result = await oracleFetch('/storage/sync', config, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pack: legacy})
    });
    if (result.response.ok) return res.status(200).json({pack: legacy, etag: result.data.etag, storage: 'oracle'});
    if (result.response.status === 409) {
      const winner = await oracleFetch('/storage/sync', config, {method: 'GET', headers: {Accept: 'application/json'}});
      if (winner.response.ok && winner.data && winner.data.pack) return res.status(200).json({...winner.data, storage: 'oracle'});
    }
    return sendOracleError(res, result.response, result.data);
  } catch (error) {
    console.error('Oracle sync relay error:', {name: String(error && error.name || 'UnknownError'), status: Number(error && (error.status || error.statusCode)) || 0});
    return res.status(502).json({error: 'Stockage Oracle temporairement inaccessible.'});
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '4mb'}}};

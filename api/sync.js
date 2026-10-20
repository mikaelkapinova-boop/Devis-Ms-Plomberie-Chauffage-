'use strict';

const {setCors, verifyToken} = require('../lib/sync-auth');
const githubStorage = require('../lib/github-storage');
const PATHNAME = 'shared/ms-plomberie-state.json';

async function readLegacyBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const {get, BlobNotFoundError} = await import('@vercel/blob');
  let result;
  try {
    result = await get(PATHNAME, {access: 'private', useCache: false});
  } catch (error) {
    if (error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError' || error?.status === 404 || error?.statusCode === 404) return null;
    throw error;
  }
  if (!result || result.statusCode === 404) return null;
  const saved = JSON.parse(await new Response(result.stream).text());
  if (!saved || !saved.pack || saved.pack.enc !== 1) throw new Error('Sauvegarde en ligne illisible');
  return {pack: saved.pack, etag: result.blob.etag};
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({error: 'Méthode non autorisée'});

  const auth = verifyToken(req);
  if (!auth.ok) {
    console.error('Cloud sync authorization failure:', {method: req.method, status: auth.status, code: auth.error});
    return res.status(auth.status).json({error: auth.error});
  }
  let github;
  try { github = githubStorage.config(); }
  catch (error) { return res.status(error.status || 503).json({error: error.message}); }
  if (!github && !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({error: 'Stockage en ligne indisponible'});

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (req.method === 'PUT') {
    if (!body.pack || body.pack.enc !== 1 || !body.pack.iv || !body.pack.ct) return res.status(400).json({error: 'Données de synchronisation invalides'});
    if (Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024) return res.status(413).json({error: 'Sauvegarde trop volumineuse'});
  }

  let writeIfMatchUsed = false;
  try {
    if (github) {
      await githubStorage.assertPrivateRepository(github);
      if (req.method === 'GET') {
        let remote = await githubStorage.readText(github, PATHNAME);
        if (!remote) {
          const legacy = await readLegacyBlob();
          if (legacy) {
            try {
              const etag = await githubStorage.writeFile(github, PATHNAME, Buffer.from(JSON.stringify({pack: legacy.pack})), '', 'Migrate shared data to private GitHub storage');
              return res.status(200).json({pack: legacy.pack, etag, storage: 'github'});
            } catch (error) {
              if (error.status !== 409) throw error;
              remote = await githubStorage.readText(github, PATHNAME);
            }
          }
        }
        if (!remote) return res.status(200).json({pack: null, etag: '', storage: 'github'});
        const saved = JSON.parse(remote.text);
        if (!saved || !saved.pack || saved.pack.enc !== 1) return res.status(500).json({error: 'Sauvegarde GitHub illisible'});
        return res.status(200).json({pack: saved.pack, etag: remote.sha, storage: 'github'});
      }

      const headerIfMatch = req.headers['if-match'];
      const ifMatch = String((Array.isArray(headerIfMatch) ? headerIfMatch[0] : headerIfMatch) || body.ifMatch || '').trim();
      writeIfMatchUsed = !!ifMatch;
      const remote = await githubStorage.readText(github, PATHNAME);
      if ((!remote && ifMatch) || (remote && remote.sha !== ifMatch)) {
        return res.status(409).json({error: 'Les données ont changé sur l’autre téléphone. Nouvelle tentative…'});
      }
      const etag = await githubStorage.writeFile(github, PATHNAME, Buffer.from(JSON.stringify({pack: body.pack})), remote ? remote.sha : '', 'Save shared app data');
      return res.status(200).json({etag, storage: 'github'});
    }

    const {get, put, BlobNotFoundError} = await import('@vercel/blob');
    if (req.method === 'GET') {
      let result;
      try {
        result = await get(PATHNAME, {access: 'private', useCache: false});
      } catch (error) {
        // The first device has no shared file yet. Treat that as an empty
        // account so its first sync can create the private Blob.
        if (error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError' || error?.status === 404 || error?.statusCode === 404) {
          return res.status(200).json({pack: null, etag: '', storage: 'vercel-blob'});
        }
        throw error;
      }
      if (!result || result.statusCode === 404) return res.status(200).json({pack: null, etag: '', storage: 'vercel-blob'});
      const contents = await new Response(result.stream).text();
      const saved = JSON.parse(contents);
      if (!saved || !saved.pack || saved.pack.enc !== 1) return res.status(500).json({error: 'Sauvegarde en ligne illisible'});
      return res.status(200).json({pack: saved.pack, etag: result.blob.etag, storage: 'vercel-blob'});
    }

    const headerIfMatch = req.headers['if-match'];
    const ifMatch = String((Array.isArray(headerIfMatch) ? headerIfMatch[0] : headerIfMatch) || body.ifMatch || '').trim();
    writeIfMatchUsed = !!ifMatch;
    const options = {access: 'private', contentType: 'application/json', cacheControlMaxAge: 60, addRandomSuffix: false};
    if (ifMatch) {
      options.allowOverwrite = true;
      options.ifMatch = ifMatch;
    }
    const saved = await put(PATHNAME, JSON.stringify({pack: body.pack}), options);
    return res.status(200).json({etag: saved.etag, storage: 'vercel-blob'});
  } catch (error) {
    if (error && error.status === 409) {
      console.error('Cloud sync write conflict:', {name: String(error.name || 'UnknownError'), status: 409, hasIfMatch: writeIfMatchUsed});
      return res.status(409).json({error: error.message || 'Conflit lors de la sauvegarde'});
    }
    if (error && (error.name === 'BlobPreconditionFailedError' || error.status === 412 || error.status === 409 || error.statusCode === 412 || error.statusCode === 409 || /Precondition|AlreadyExists|Conflict/i.test(error.name || '') || /already exists|precondition|conflict/i.test(error.message || ''))) {
      console.error('Cloud sync write conflict:', {name: String(error.name || 'UnknownError'), status: Number(error.status || error.statusCode || 0), hasIfMatch: writeIfMatchUsed});
      await new Promise(resolve => setTimeout(resolve, 250 + Math.floor(Math.random() * 1250)));
      return res.status(409).json({error: 'Les données ont changé sur l’autre téléphone. Nouvelle tentative…'});
    }
    const name = String(error && error.name || 'UnknownError');
    const status = Number(error && (error.status || error.statusCode) || 0);
    console.error('Cloud sync error:', {method: req.method, name, status});
    if (status === 401 || status === 403 || /BlobAccess|InvalidToken/i.test(name)) {
      return res.status(503).json({error: 'Accès au stockage en ligne refusé. La configuration du stockage Vercel Blob est à vérifier.'});
    }
    if (/BlobStoreNotFound|Suspended/i.test(name)) {
      return res.status(503).json({error: 'Le stockage Vercel Blob est introuvable ou suspendu.'});
    }
    return res.status(502).json({error: 'Stockage en ligne temporairement indisponible. Le serveur a enregistré le motif.'});
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '4mb'}}};

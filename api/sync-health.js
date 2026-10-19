'use strict';

const {setCors} = require('../lib/sync-auth');
const PATHNAME = 'shared/ms-plomberie-state.json';

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ok: false});
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ok: false, code: 'BLOB_TOKEN_MISSING'});

  try {
    const {get} = await import('@vercel/blob');
    const state = await get(PATHNAME, {access: 'private', useCache: false});
    if (state && state.stream) await state.stream.cancel();
    return res.status(200).json({ok: true, stateExists: !!state, stateBytes: Number(state && state.blob && state.blob.size) || 0});
  } catch (error) {
    const name = String(error && error.name || 'UnknownError');
    const status = Number(error && (error.status || error.statusCode) || 0);
    console.error('Cloud storage health error:', {name, status});
    const code = status === 401 || status === 403 || /BlobAccess|InvalidToken/i.test(name)
      ? 'BLOB_ACCESS_DENIED'
      : /BlobStoreNotFound|Suspended/i.test(name)
        ? 'BLOB_STORE_UNAVAILABLE'
        : 'BLOB_UNAVAILABLE';
    return res.status(503).json({ok: false, code});
  }
};

'use strict';

const crypto = require('node:crypto');

const USERS = [{
  id: 'albania54',
  salt: 'df2hT+h1IZTfZUIY1ingzQ==',
  hash: 'TokzZHQ9hyuo/x1TL5QJBozuXxNMnvNXQx1CURgu4Ms='
}];
const ALLOWED_ORIGINS = new Set([
  'https://mikaelkapinova-boop.github.io',
  'https://devis-ms-plomberie-chauffage.vercel.app',
  'https://devis-ms-plomberie-chauffage-ms-plomberie-chauffage.vercel.app'
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Cache-Control', 'no-store');
}

function validPassword(id, pass) {
  const user = USERS.find(item => item.id === id);
  if (!user || typeof pass !== 'string') return false;
  const actual = crypto.pbkdf2Sync(id + ':' + pass, Buffer.from(user.salt, 'base64'), 150000, 32, 'sha256');
  const expected = Buffer.from(user.hash, 'base64');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function signingSecret() {
  const storageToken = process.env.BLOB_READ_WRITE_TOKEN || '';
  return storageToken ? crypto.createHmac('sha256', storageToken).update('ms-plomberie-cloud-session-v1').digest() : null;
}

function issueToken(id, remember) {
  const secret = signingSecret();
  if (!secret) throw new Error('Stockage en ligne non configuré');
  const now = Math.floor(Date.now() / 1000);
  const payload = {sub: id, iat: now, exp: now + (remember ? 30 * 86400 : 12 * 3600), aud: 'ms-plomberie-cloud'};
  const head = Buffer.from(JSON.stringify({alg: 'HS256', typ: 'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsigned = head + '.' + body;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return unsigned + '.' + signature;
}

function verifyToken(req) {
  const secret = signingSecret();
  if (!secret) return {ok: false, status: 503, error: 'Stockage en ligne indisponible'};
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return {ok: false, status: 401, error: 'Session en ligne absente'};
  const parts = match[1].split('.');
  if (parts.length !== 3) return {ok: false, status: 401, error: 'Session en ligne invalide'};
  const unsigned = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', secret).update(unsigned).digest();
  let actual;
  try { actual = Buffer.from(parts[2], 'base64url'); } catch (e) { return {ok: false, status: 401, error: 'Session en ligne invalide'}; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return {ok: false, status: 401, error: 'Session en ligne invalide'};
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.aud !== 'ms-plomberie-cloud' || !USERS.some(user => user.id === payload.sub) || Number(payload.exp) <= Date.now() / 1000) {
      return {ok: false, status: 401, error: 'Session en ligne expirée'};
    }
    return {ok: true, user: payload.sub};
  } catch (e) { return {ok: false, status: 401, error: 'Session en ligne invalide'}; }
}

module.exports = {setCors, validPassword, issueToken, verifyToken};

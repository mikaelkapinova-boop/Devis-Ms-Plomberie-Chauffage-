'use strict';

const {setCors, authConfigured, validPassword, issueToken} = require('../lib/sync-auth');

// Best-effort backstop for repeated failures within one warm serverless instance.
// Use a Vercel Firewall rate-limit rule for shared enforcement across instances.
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_LIMIT = 5;
const failedLogins = new Map();

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(raw || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 128) || 'unknown';
}

function pruneFailedLogins(now) {
  for (const [ip, entry] of failedLogins) {
    if (entry.startedAt + FAILED_LOGIN_WINDOW_MS <= now && entry.blockedUntil <= now) failedLogins.delete(ip);
  }
  if (failedLogins.size > 4096) failedLogins.delete(failedLogins.keys().next().value);
}

function retryAfterMs(ip, now) {
  const entry = failedLogins.get(ip);
  if (!entry) return 0;
  if (entry.blockedUntil > now) return entry.blockedUntil - now;
  if (entry.startedAt + FAILED_LOGIN_WINDOW_MS <= now) failedLogins.delete(ip);
  return 0;
}

function recordFailedLogin(ip, now) {
  let entry = failedLogins.get(ip);
  if (!entry || entry.startedAt + FAILED_LOGIN_WINDOW_MS <= now) entry = {startedAt: now, count: 0, blockedUntil: 0};
  entry.count += 1;
  if (entry.count >= FAILED_LOGIN_LIMIT) entry.blockedUntil = now + FAILED_LOGIN_WINDOW_MS;
  failedLogins.set(ip, entry);
  pruneFailedLogins(now);
  return Math.max(0, entry.blockedUntil - now);
}

function tooManyAttempts(res, waitMs) {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  res.setHeader('Retry-After', String(seconds));
  return res.status(429).json({error: 'Trop de tentatives de connexion. Réessaie plus tard.'});
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Méthode non autorisée'});

  if (!authConfigured()) return res.status(503).json({error: 'Connexion en ligne indisponible'});
  const ip = clientIp(req);
  const now = Date.now();
  const remaining = retryAfterMs(ip, now);
  if (remaining) return tooManyAttempts(res, remaining);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawId = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
  const id = rawId.length <= 128 ? rawId : '';
  const pass = typeof body.pass === 'string' ? body.pass : '';
  if (!validPassword(id, pass)) {
    const waitMs = recordFailedLogin(ip, now);
    if (waitMs) return tooManyAttempts(res, waitMs);
    return res.status(401).json({error: 'Identifiant ou mot de passe incorrect'});
  }
  failedLogins.delete(ip);
  try {
    return res.status(200).json({token: issueToken(id)});
  } catch (error) {
    return res.status(503).json({error: 'Stockage en ligne indisponible'});
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '8kb'}}};

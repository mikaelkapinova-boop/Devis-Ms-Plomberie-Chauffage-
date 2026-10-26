'use strict';

const {setCors, verifyToken} = require('../lib/sync-auth');

const MAX_MESSAGES = 12;
const MAX_TEXT = 42000;
const MAX_MESSAGE = 18000;

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: {message: 'Méthode non autorisée'}});
  }

  const auth = verifyToken(req);
  if (!auth.ok) return res.status(auth.status).json({error: {message: auth.error}});

  const base = String(process.env.ORACLE_AI_URL || '').trim();
  const token = String(process.env.ORACLE_AI_TOKEN || '').trim();
  if (!base || token.length < 32) {
    return res.status(503).json({error: {message: 'Le moteur local Oracle n’est pas encore configuré sur Devis MS.'}});
  }

  let target;
  try {
    target = new URL(base);
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) throw new Error('URL HTTPS invalide');
    target.pathname = '/v1/chat/completions';
  } catch (_) {
    return res.status(503).json({error: {message: 'Adresse HTTPS du moteur Oracle invalide.'}});
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    return res.status(400).json({error: {message: 'Conversation invalide.'}});
  }
  let chars = 0;
  const messages = [];
  for (const item of body.messages) {
    if (!item || !['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
      return res.status(400).json({error: {message: 'Message invalide.'}});
    }
    const content = item.content.trim();
    chars += content.length;
    if (!content || content.length > MAX_MESSAGE || chars > MAX_TEXT) {
      return res.status(413).json({error: {message: 'La demande ou le texte extrait est trop volumineux. Réduis le document ou sépare-le en plusieurs demandes.'}});
    }
    messages.push({role: item.role, content});
  }

  const payload = {
    model: 'Qwen3.5-4B-Q4_K_M',
    messages,
    max_tokens: Math.max(128, Math.min(2200, Number(body.max_tokens) || 800)),
    temperature: Math.max(0, Math.min(0.7, Number(body.temperature) || 0.2)),
    web_search: body.web_search === true,
    search_query: typeof body.search_query === 'string' ? body.search_query.replace(/\s+/g, ' ').trim().slice(0, 600) : '',
    stream: false
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await upstream.text();
    res.status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      .setHeader('Cache-Control', 'no-store')
      .send(text);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({error: {message: 'Le modèle local Oracle dépasse le délai de réponse. Réessaie en mode Rapide ou avec un document plus court.'}});
    }
    return res.status(502).json({error: {message: 'Le VPS Oracle ou son certificat HTTPS est momentanément indisponible.'}});
  } finally {
    clearTimeout(timeout);
  }
};

module.exports.config = {api: {bodyParser: {sizeLimit: '64kb'}}};

const {setCors, verifyToken} = require('../lib/sync-auth');

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Méthode non autorisée' } });
  }

  const auth = verifyToken(req);
  if (!auth.ok) {
    return res.status(auth.status).json({error: {message: auth.error}});
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 48000);
  try {
    const body = req.body || {};
    const { apiKey, ...payload } = body;
    const key = process.env.PERPLEXITY_API_KEY || apiKey;

    if (!key) {
      return res.status(401).json({
        error: { message: 'PERPLEXITY_API_KEY manquante. Configure la variable dans Vercel ou enregistre la clé dans l’application.' }
      });
    }

    const upstream = await fetch('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await upstream.text();
    res
      .status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      .send(text);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({error:{message:'Le fournisseur met trop de temps à répondre. Réessaie en mode Rapide ou sans recherche Web.'}});
    }
    res.status(502).json({
      error: { message: 'Passerelle Perplexity indisponible' }
    });
  } finally {
    clearTimeout(timeout);
  }
}

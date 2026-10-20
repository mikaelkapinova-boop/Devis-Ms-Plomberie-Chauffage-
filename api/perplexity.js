export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'https://mikaelkapinova-boop.github.io',
    'https://devis-ms-plomberie-chauffage.vercel.app'
  ]);
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Méthode non autorisée' } });
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

// GET /api/am — read-only proxy to Agentic Market search (browser CORS workaround).
// Locked to api.agentic.market /v1/services/search only. GET only.

const AM_ORIGIN = 'https://api.agentic.market';
const ALLOWED_PATH = '/v1/services/search';
const MAX_QUERY_LEN = 80;

const hits = new Map();

function throttled(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 300000) {
    rec.n = 0;
    rec.t = now;
  }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > 24;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'GET only' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) return res.status(429).json({ error: 'rate_limited' });

  const q = String(req.query.q || 'cyre.dev').trim();
  if (!q || q.length > MAX_QUERY_LEN) {
    return res.status(400).json({ error: 'bad_query' });
  }

  const target = `${AM_ORIGIN}${ALLOWED_PATH}?q=${encodeURIComponent(q)}`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60');
    if (req.method === 'HEAD') return res.status(upstream.status).end();
    return res.status(upstream.status).send(text);
  } catch (err) {
    const cause = (err.cause && (err.cause.code || err.cause.message)) || err.message;
    return res.status(502).json({ error: 'upstream_unreachable', cause: String(cause).slice(0, 120) });
  }
}

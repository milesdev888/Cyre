// CYRE Guardian — outbound relay for x402 buyer traffic.
// Render's egress IPs are refused by some x402 hosts (e.g. x402station.io),
// so the Render payer can route its requests through this Vercel function.
// Locked down: whitelisted target hosts only, /api/* paths only, small
// per-instance rate limit, and only payment-relevant headers pass through.

const ALLOWED_HOSTS = new Set(['x402station.io']);
const FWD_REQ_HEADERS = ['content-type', 'accept', 'payment-signature', 'x-payment'];
const FWD_RES_HEADERS = ['content-type', 'payment-required', 'payment-response', 'x-payment-response', 'extension-responses'];

const hits = new Map(); // per-instance IP throttle: 30 req / 5 min
function throttled(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 300000) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(ip, rec);
  return rec.n > 30;
}

export default async function handler(req, res) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) return res.status(429).json({ error: 'rate_limited' });

  const to = String(req.query.to || '');
  let target;
  try { target = new URL(to); } catch (e) { return res.status(400).json({ error: 'bad_target' }); }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname) || !target.pathname.startsWith('/api/')) {
    return res.status(403).json({ error: 'target_not_allowed' });
  }

  const headers = {};
  for (const h of FWD_REQ_HEADERS) if (req.headers[h]) headers[h] = req.headers[h];

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), { method: req.method, headers, body, redirect: 'manual' });
  } catch (err) {
    const cause = (err.cause && (err.cause.code || err.cause.message)) || err.message;
    return res.status(502).json({ error: 'upstream_unreachable', cause });
  }

  for (const h of FWD_RES_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  const text = await upstream.text();
  res.status(upstream.status).send(text);
}

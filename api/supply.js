// api/supply.js — detailed $C7 supply JSON (locks + circulating).
// GET /api/supply  → application/json
// Free public endpoint (CoinGecko / Jupiter / site). Cached ≤1h.

import { computeSupply } from './_supply.js';

const CACHE_TTL_MS = Math.min(
  Number(process.env.SUPPLY_CACHE_TTL_MS || 3_600_000),
  3_600_000
);

/** @type {{ at: number, body: object } | null} */
let cache = null;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }

  try {
    const now = Date.now();
    let body;
    let hit = false;
    if (cache && now - cache.at <= CACHE_TTL_MS) {
      body = cache.body;
      hit = true;
    } else {
      body = await computeSupply();
      cache = { at: now, body };
    }

    const maxAge = Math.max(60, Math.floor(CACHE_TTL_MS / 1000));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
    res.setHeader('x-guardian-cache', hit ? 'HIT' : 'MISS');
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    return res.end(JSON.stringify(body));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      error: 'supply_unavailable',
      message: String(e && e.message || e),
    }));
  }
}

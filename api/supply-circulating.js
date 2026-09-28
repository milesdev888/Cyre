// api/supply-circulating.js — plain circulating number (CoinGecko / Jupiter convention).
// Rewritten from GET /api/supply/circulating → body is just e.g. 25000000
// Free public endpoint. Cached ≤1h.

import { computeSupply } from './_supply.js';

const CACHE_TTL_MS = Math.min(
  Number(process.env.SUPPLY_CACHE_TTL_MS || 3_600_000),
  3_600_000
);

/** @type {{ at: number, circulating: number } | null} */
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
    return res.end('method_not_allowed');
  }

  try {
    const now = Date.now();
    let circulating;
    let hit = false;
    if (cache && now - cache.at <= CACHE_TTL_MS) {
      circulating = cache.circulating;
      hit = true;
    } else {
      const snap = await computeSupply();
      circulating = snap.circulating;
      cache = { at: now, circulating };
    }

    const maxAge = Math.max(60, Math.floor(CACHE_TTL_MS / 1000));
    // CoinGecko accepts a plain numeric body (text/plain or JSON number).
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
    res.setHeader('x-guardian-cache', hit ? 'HIT' : 'MISS');
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    return res.end(String(circulating));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('error');
  }
}

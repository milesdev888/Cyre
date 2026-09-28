// api/host.js — Resource URL / host reputation patterns + x402
// Measured host hygiene only (no historical DB on ephemeral Vercel).
//
// GET/POST /api/host?url=https://…
// Env: X402_PRICE_HOST (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { DISCLAIMER, riskLevelFromScore, signal } from './_grade.js';

const CYRE_HOST = /(^|\.)cyre\.dev$/i;
const DESCRIPTION =
  'Guardian Host Brief — before you pay a resource URL, measure host hygiene (https, IP host, TLD shape, self-pay). No historical blacklist — patterns only.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: { type: 'http', method: 'GET', queryParams: { url: 'https://example.com/api/paid' } },
      output: { type: 'json', example: { ok: true, kind: 'cyre-host', score: 0, disclaimer: DISCLAIMER } }
    },
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        input: {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'http' },
            method: { type: 'string', enum: ['GET', 'HEAD', 'DELETE'] },
            queryParams: {
              type: 'object',
              properties: { url: { type: 'string' } },
              required: ['url']
            }
          },
          required: ['type', 'method'],
          additionalProperties: false
        },
        output: { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] }
      },
      required: ['input']
    }
  }
};

const x402Gate = createX402Gate({
  price: String(process.env.X402_PRICE_HOST || '2000'),
  resourcePath: '/api/host',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['host', 'url', 'reputation', 'middleware', 'agents'],
  discovery: DISCOVERY,
  isFree: isCyreSiteRequest
});

function readBody(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch (e) {
      return { url: b };
    }
  }
  return b;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, payment-signature, x-payment, x-guardian-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Use GET or POST', disclaimer: DISCLAIMER });
  }

  const hasPayment = !!(req.headers['payment-signature'] || req.headers['x-payment']);
  if (!hasPayment) {
    const quote = await x402Gate(req);
    if (applyX402Result(res, quote)) return;
  }

  const body = req.method === 'POST' ? readBody(req) : null;
  const url = String((body && (body.url || body.resourceUrl)) || (req.query && (req.query.url || req.query.resourceUrl)) || '').trim();
  if (!url) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide `url`.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const signals = [];
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'url is not valid.', disclaimer: DISCLAIMER });
  }

  if (parsed.protocol !== 'https:') {
    signals.push(signal('url_http', 'Protocol', 20, true, 'URL is not https'));
  } else {
    signals.push(signal('url_https', 'Protocol', 0, false, 'https'));
  }
  const host = parsed.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    signals.push(signal('url_ip', 'Host', 18, true, 'Host is a raw IP'));
  }
  if (host.split('.').length < 2) {
    signals.push(signal('url_host', 'Host', 12, true, 'Host looks incomplete'));
  }
  if (CYRE_HOST.test(host)) {
    signals.push(signal('url_self', 'Host', 0, false, 'cyre.dev — Guardian self host'));
  }
  if (/\.(xyz|top|tk|ml|ga|cf)$/i.test(host)) {
    signals.push(signal('tld_odd', 'TLD', 8, true, `Uncommon TLD on ${host} — review carefully`));
  }
  if ((parsed.username || parsed.password) ) {
    signals.push(signal('url_userinfo', 'URL', 14, true, 'URL embeds userinfo — unusual for APIs'));
  }
  if (parsed.port && parsed.port !== '443' && parsed.port !== '') {
    signals.push(signal('url_port', 'Port', 6, true, `Non-default port ${parsed.port}`));
  }

  // Optional HEAD probe — soft, no content trust
  let probe = null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2500);
  try {
    const r = await fetch(parsed.origin + '/', { method: 'HEAD', redirect: 'manual', signal: ac.signal });
    probe = { status: r.status, ok: r.ok };
    if (r.status >= 500) signals.push(signal('origin_5xx', 'Origin', 10, true, `Origin HEAD returned ${r.status}`));
    else signals.push(signal('origin_reachable', 'Origin', 0, false, `Origin HEAD ${r.status}`));
  } catch (e) {
    const timedOut = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    probe = { error: timedOut ? 'timeout' : String((e && e.message) || e).slice(0, 120) };
    signals.push(signal('origin_unreachable', 'Origin', 8, true, 'Could not HEAD the origin (timeout/network)'));
  } finally {
    clearTimeout(timer);
  }

  const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0));
  const riskLevel = riskLevelFromScore(score);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-host',
    version: 1,
    url,
    host,
    probe,
    score,
    riskLevel,
    signals,
    brief: `Host brief ${score} (${riskLevel}). No historical blacklist — measured URL/origin patterns only.`,
    next: ['Combine with /api/offer or /api/route', 'Seal /api/intent before pay'],
    disclaimer: DISCLAIMER
  });
}

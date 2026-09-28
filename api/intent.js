// api/intent.js — Intent hash seal + x402
// Seal intentHash BEFORE pay/sign. Later Receipt should use the same hash.
//
// GET/POST /api/intent?actor=&intentHash=&action=&resourceUrl=&payTo=&amountAtomic=
// Env: PASSPORT_SIGNING_KEY, INTENT_TTL_SECONDS, X402_PRICE_INTENT (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestIntent, issuerPublicKey, INTENT_KIND } from './_attest.js';
import { B58, DISCLAIMER } from './_grade.js';

const EVM = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^(?:sha256:|sha256-|0x)?[A-Za-z0-9+/=_-]{16,128}$/;
const ACTIONS = new Set(['transfer', 'swap', 'settle', 'pay', 'handshake', 'preflight', 'other']);

const DESCRIPTION =
  'Guardian Intent Seal — hash your intent locally, seal it before you pay or sign, then match it on /api/receipt. Stops bait-and-switch. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          intentHash: 'sha256:abcdef0123456789abcdef0123456789',
          action: 'pay',
          resourceUrl: 'https://example.com/api/paid',
          amountAtomic: '10000'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-intent', token: '…', disclaimer: DISCLAIMER } }
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
              properties: { actor: { type: 'string' }, intentHash: { type: 'string' } },
              required: ['actor', 'intentHash']
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
  price: String(process.env.X402_PRICE_INTENT || '2000'),
  resourcePath: '/api/intent',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['intent', 'hash', 'seal', 'middleware', 'agents', 'anti-bait'],
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
      return null;
    }
  }
  return b;
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    actor: String((body && body.actor) || q.actor || '').trim() || null,
    intentHash: String((body && body.intentHash) || q.intentHash || '').trim() || null,
    action: String((body && body.action) || q.action || 'other').trim().toLowerCase() || 'other',
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    amountAtomic: String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() || null,
    note: String((body && body.note) || q.note || '').trim() || null
  };
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

  const input = pickInput(req);
  if (!input.actor || !(EVM.test(input.actor) || B58.test(input.actor))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide valid `actor`.', disclaimer: DISCLAIMER });
  }
  if (!input.intentHash || !HASH.test(input.intentHash)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `intentHash` (hash locally first; Guardian stores the hash only).',
      disclaimer: DISCLAIMER
    });
  }
  if (!ACTIONS.has(input.action)) input.action = 'other';

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const sealed = attestIntent(input);
  res.setHeader('Cache-Control', 'no-store');
  if (sealed.token) res.setHeader('X-Guardian-Intent', sealed.token);
  return res.status(200).json({
    ok: true,
    kind: 'cyre-intent',
    version: 1,
    attestation: sealed.attestation,
    token: sealed.token,
    unsigned: sealed.unsigned || null,
    verify: 'https://cyre.dev/api/intent/verify',
    publicKey: issuerPublicKey(),
    brief: sealed.token
      ? 'Intent sealed. Reuse the same intentHash on /api/receipt after the action.'
      : 'Signing key missing — unsigned seal. Set PASSPORT_SIGNING_KEY.',
    next: ['Pay/sign only for this sealed intent', 'Seal /api/receipt with the same intentHash', 'Optional: /api/intent/verify'],
    disclaimer: DISCLAIMER
  });
}

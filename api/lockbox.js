// api/lockbox.js — Intent lockbox seal + x402
// Seal intentHash (+ optional pay pins) BEFORE settle. Bearer holds the token
// (no central registry on ephemeral Vercel). Match later via /api/lockbox/match.
//
// GET/POST /api/lockbox?actor=&intentHash=&action=&resourceUrl=&payTo=&amountAtomic=&network=
// Env: PASSPORT_SIGNING_KEY, LOCKBOX_TTL_SECONDS, X402_PRICE_LOCKBOX (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestLockbox, issuerPublicKey, LOCKBOX_KIND } from './_attest.js';
import { B58, DISCLAIMER } from './_grade.js';

const EVM = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^(?:sha256:|sha256-|0x)?[A-Za-z0-9+/=_-]{16,128}$/;
const ACTIONS = new Set(['transfer', 'swap', 'settle', 'pay', 'handshake', 'preflight', 'other']);

const DESCRIPTION =
  'Guardian Intent Lockbox — seal your intentHash before you pay so any party can later prove the hash was locked pre-settle. Bearer holds the token. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          intentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          action: 'pay',
          payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
          amountAtomic: '10000',
          resourceUrl: 'https://example.com/api/paid',
          network: 'eip155:8453'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-lockbox', token: '…', disclaimer: DISCLAIMER } }
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
  price: String(process.env.X402_PRICE_LOCKBOX || '2000'),
  resourcePath: '/api/lockbox',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['lockbox', 'intent', 'pre-pay', 'bait-and-switch', 'agents', 'middleware', 'seal'],
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
    action: String((body && body.action) || q.action || 'pay').trim().toLowerCase() || 'pay',
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    amountAtomic:
      String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() ||
      null,
    network: String((body && body.network) || q.network || '').trim() || null,
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
    return res.status(400).json({ ok: false, error: 'Provide valid `actor` (0x or Solana base58).', disclaimer: DISCLAIMER });
  }
  if (!input.intentHash || !HASH.test(input.intentHash)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `intentHash` (16–128 url-safe chars; hash locally first).',
      disclaimer: DISCLAIMER
    });
  }
  if (!ACTIONS.has(input.action)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: `action must be one of: ${[...ACTIONS].join(', ')}`,
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const sealed = attestLockbox(input);
  res.setHeader('Cache-Control', 'no-store');
  if (sealed.token) res.setHeader('X-Guardian-Lockbox', sealed.token);
  return res.status(200).json({
    ok: true,
    kind: 'cyre-lockbox',
    version: 1,
    attestation: sealed.attestation,
    token: sealed.token,
    unsigned: sealed.unsigned || null,
    verify: 'https://cyre.dev/api/lockbox/verify',
    match: 'https://cyre.dev/api/lockbox/match',
    publicKey: issuerPublicKey(),
    claimsKind: LOCKBOX_KIND,
    brief: sealed.token
      ? 'Lockbox sealed. Present the token later to prove this intentHash was locked before pay.'
      : 'Signing key missing — unsigned. Set PASSPORT_SIGNING_KEY.',
    next: ['Pay/sign only for this sealed intent', 'Call /api/lockbox/match with the same pins', 'Seal /api/receipt after'],
    disclaimer: DISCLAIMER
  });
}

// api/receipt.js — Guardian Decision Receipt + x402 gate
// Seal intentHash + signalsSeen + action into a signed, portable audit receipt.
// Verify free at /api/receipt/verify.
//
// POST /api/receipt  { actor, intentHash, action?, score?, riskLevel?, signalsTriggered?,
//                      signalsEvaluated?, counterparties?, note?, measuredAt? }
// GET  /api/receipt?actor=&intentHash=&action=&score=&riskLevel=  (Bazaar-friendly)
//
// Env: PASSPORT_SIGNING_KEY, RECEIPT_TTL_SECONDS, X402_* ; X402_PRICE_RECEIPT (default 5000 = $0.005)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestReceipt, issuerPublicKey, ISSUER, RECEIPT_KIND } from './_attest.js';
import { B58, DISCLAIMER } from './_grade.js';

const ACTIONS = new Set(['transfer', 'swap', 'settle', 'handshake', 'preflight', 'other']);
const HASH = /^(?:sha256:|sha256-|0x)?[A-Za-z0-9+/=_-]{16,128}$/;

const DESCRIPTION =
  'Guardian Decision Receipt — seal an intent hash, the signals you saw, and the action you took into a signed audit receipt. Verify free at /api/receipt/verify. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          intentHash: 'sha256:abcdef0123456789abcdef0123456789',
          action: 'transfer',
          score: '24',
          riskLevel: 'LOW'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-receipt',
          attestation: {
            claims: { kind: RECEIPT_KIND, actor: '9WzD…', intentHash: 'sha256:…', action: 'transfer' },
            token: '<base64url-claims>.<base64url-signature>'
          },
          disclaimer: DISCLAIMER
        }
      }
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
              properties: {
                actor: { type: 'string' },
                intentHash: { type: 'string' },
                action: { type: 'string' }
              },
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
  price: String(process.env.X402_PRICE_RECEIPT || '5000'),
  resourcePath: '/api/receipt',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'solana', 'receipt', 'audit', 'agents', 'attestation', 'forensics'],
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
  const counterpartiesRaw = (body && body.counterparties) || q.counterparties || '';
  let counterparties = [];
  if (Array.isArray(counterpartiesRaw)) counterparties = counterpartiesRaw;
  else if (counterpartiesRaw) counterparties = String(counterpartiesRaw).split(/[,\s]+/).filter(Boolean);

  const scoreRaw = (body && body.score) != null ? body.score : q.score;
  const score = scoreRaw === '' || scoreRaw == null ? null : Number(scoreRaw);
  const st = (body && body.signalsTriggered) != null ? Number(body.signalsTriggered) : q.signalsTriggered != null ? Number(q.signalsTriggered) : null;
  const se = (body && body.signalsEvaluated) != null ? Number(body.signalsEvaluated) : q.signalsEvaluated != null ? Number(q.signalsEvaluated) : null;

  return {
    actor: String((body && body.actor) || q.actor || '').trim() || null,
    intentHash: String((body && body.intentHash) || q.intentHash || '').trim() || null,
    action: String((body && body.action) || q.action || 'other').trim().toLowerCase() || 'other',
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
    riskLevel: String((body && body.riskLevel) || q.riskLevel || '').trim().toUpperCase() || null,
    signalsTriggered: Number.isFinite(st) ? st : null,
    signalsEvaluated: Number.isFinite(se) ? se : null,
    counterparties,
    note: String((body && body.note) || q.note || '').trim() || null,
    measuredAt: String((body && body.measuredAt) || q.measuredAt || '').trim() || null
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
  if (!input.actor || !B58.test(input.actor)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide a valid Solana `actor` address.', disclaimer: DISCLAIMER });
  }
  if (!input.intentHash || !HASH.test(input.intentHash)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `intentHash` (16–128 url-safe chars; hash your intent locally first).',
      disclaimer: DISCLAIMER
    });
  }
  if (!ACTIONS.has(input.action)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'action must be one of: transfer, swap, settle, handshake, preflight, other',
      disclaimer: DISCLAIMER
    });
  }
  if (input.riskLevel && !['LOW', 'MEDIUM', 'HIGH'].includes(input.riskLevel)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'riskLevel must be LOW, MEDIUM, or HIGH when set.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  const signed = attestReceipt(input);
  if (signed.token) res.setHeader('X-Guardian-Receipt', signed.token);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-receipt',
    version: 1,
    issuer: ISSUER,
    issuerPublicKey: issuerPublicKey(),
    attestation: signed.attestation,
    ...(signed.unsigned ? { unsigned: signed.unsigned } : {}),
    verify: 'https://cyre.dev/api/receipt/verify',
    disclaimer: DISCLAIMER
  });
}

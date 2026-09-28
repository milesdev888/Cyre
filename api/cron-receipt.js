// api/cron-receipt.js — Watcher/cron attestation + x402
// Seal that a cron/watcher run happened (walletCount, hitCount, digest).
// Auth: optional x-guardian-key for automation; still x402 for bazaar agents.
//
// POST /api/cron-receipt { job, walletCount, hitCount, digest, ranAt?, window?, note? }
// Env: PASSPORT_SIGNING_KEY, X402_INTERNAL_KEY, X402_PRICE_CRON (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestCron, issuerPublicKey, CRON_KIND } from './_attest.js';

const DISCLAIMER = 'Patterns, not verdicts.';
const DESCRIPTION =
  'Guardian Cron Receipt — seal a watcher/cron run (wallets checked, hits, digest) so agents can prove the pulse happened. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'POST',
        queryParams: { job: 'guardian-watcher', walletCount: '10', hitCount: '1', digest: 'sha256:abc' }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-cron-receipt', token: '…', disclaimer: DISCLAIMER } }
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
            queryParams: { type: 'object', properties: { job: { type: 'string' } } }
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
  price: String(process.env.X402_PRICE_CRON || '2000'),
  resourcePath: '/api/cron-receipt',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['cron', 'watcher', 'attestation', 'agents', 'receipt'],
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
  const q = req.query || {};
  const input = {
    job: String((body && body.job) || q.job || 'watcher').trim(),
    walletCount: Number((body && body.walletCount) != null ? body.walletCount : q.walletCount),
    hitCount: Number((body && body.hitCount) != null ? body.hitCount : q.hitCount),
    digest: String((body && body.digest) || q.digest || '').trim() || null,
    ranAt: String((body && body.ranAt) || q.ranAt || '').trim() || null,
    window: String((body && body.window) || q.window || '').trim() || null,
    note: String((body && body.note) || q.note || '').trim() || null
  };

  if (!Number.isFinite(input.walletCount) || input.walletCount < 0) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide walletCount (≥0) and ideally hitCount + digest.',
      kind: CRON_KIND,
      disclaimer: DISCLAIMER
    });
  }
  if (!Number.isFinite(input.hitCount)) input.hitCount = null;

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const sealed = attestCron(input);
  res.setHeader('Cache-Control', 'no-store');
  if (sealed.token) res.setHeader('X-Guardian-Cron', sealed.token);
  return res.status(200).json({
    ok: true,
    kind: 'cyre-cron-receipt',
    version: 1,
    attestation: sealed.attestation,
    token: sealed.token,
    unsigned: sealed.unsigned || null,
    verify: 'https://cyre.dev/api/cron-receipt/verify',
    publicKey: issuerPublicKey(),
    brief: sealed.token
      ? 'Cron run sealed. Agents can verify the pulse happened.'
      : 'Signing key missing — unsigned. Set PASSPORT_SIGNING_KEY.',
    disclaimer: DISCLAIMER
  });
}

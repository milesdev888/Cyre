// api/circuit-check.js — Agent Circuit Breaker: enforce before spend.
// GET/POST /api/circuit/check?token=&amountAtomic=&resourceUrl=&network=&payTo=

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { verifyToken, CIRCUIT_KIND } from './_attest.js';
import { DISCLAIMER } from './_grade.js';
import { evaluateCircuit } from './_circuit.js';

const DESCRIPTION =
  'Guardian Circuit Breaker check — heartbeat freshness + embedded spend policy before an agent pays. Returns admit/deny brief. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          token: '<circuit-token>',
          amountAtomic: '5000',
          resourceUrl: 'https://cyre.dev/api/gate',
          network: 'eip155:8453'
        }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-circuit-check', admitted: true, disclaimer: DISCLAIMER }
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
              properties: { token: { type: 'string' }, amountAtomic: { type: 'string' } },
              required: ['token']
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
  price: String(process.env.X402_PRICE_CIRCUIT_CHECK || '1000'),
  resourcePath: '/api/circuit/check',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['circuit', 'check', 'policy', 'heartbeat', 'agents'],
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
    token: String((body && body.token) || q.token || '').trim() || null,
    amountAtomic: String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    riskLevel: String((body && body.riskLevel) || q.riskLevel || '').trim() || null,
    hasTicket: String((body && body.hasTicket) || q.hasTicket || '').toLowerCase() === 'true'
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
  if (!input.token) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide circuit `token`.', disclaimer: DISCLAIMER });
  }

  const verified = verifyToken(input.token, Date.now(), { kinds: [CIRCUIT_KIND] });
  if (!verified.valid || !verified.claims) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: verified.reason || 'invalid circuit token', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  const result = evaluateCircuit(verified.claims, {
    amountAtomic: input.amountAtomic,
    resourceUrl: input.resourceUrl,
    network: input.network,
    payTo: input.payTo,
    riskLevel: input.riskLevel,
    hasTicket: input.hasTicket
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: result.ok,
    kind: 'cyre-circuit-check',
    version: 1,
    admitted: result.ok,
    frozen: result.frozen,
    reasons: result.reasons,
    signals: result.signals,
    heartbeat: result.heartbeat || null,
    brief: result.ok
      ? 'Circuit admits this proposal — still run Gate/Lockbox on external pays.'
      : `Circuit denies — ${result.reasons.join(', ') || 'frozen or policy block'}.`,
    next: result.ok ? ['/api/gate', '/api/lockbox', '/api/receipt'] : ['/api/circuit/heartbeat', '/api/circuit/seal'],
    disclaimer: DISCLAIMER
  });
}

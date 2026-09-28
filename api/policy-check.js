// api/policy-check.js — Enforce a spend policy against a proposed pay + x402
// GET/POST /api/policy/check?token=&amountAtomic=&resourceUrl=&network=&riskLevel=&freshEoa=&hasTicket=
// Env: X402_PRICE_POLICY_CHECK (default 1000 = $0.001)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { verifyToken, POLICY_KIND } from './_attest.js';
import { evaluatePolicy } from './_policycheck.js';
import { DISCLAIMER, riskLevelFromScore } from './_grade.js';

const DESCRIPTION =
  'Guardian Policy Check — test a proposed pay (amount, host, network, risk) against a sealed spend-policy token. Returns ok + reasons. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          token: '<policy-token>',
          amountAtomic: '5000',
          resourceUrl: 'https://example.com/api/paid',
          network: 'eip155:8453'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-policy-check', policyOk: true, disclaimer: DISCLAIMER } }
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
              properties: { token: { type: 'string' }, amountAtomic: { type: 'string' }, resourceUrl: { type: 'string' } },
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
  price: String(process.env.X402_PRICE_POLICY_CHECK || '1000'),
  resourcePath: '/api/policy/check',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['policy', 'check', 'spend', 'middleware', 'agents'],
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

function flag(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    token: String((body && body.token) || q.token || '').trim() || null,
    amountAtomic: String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null,
    riskLevel: String((body && body.riskLevel) || q.riskLevel || '').trim().toUpperCase() || null,
    freshEoa: flag((body && body.freshEoa) != null ? body.freshEoa : q.freshEoa),
    hasTicket: flag((body && body.hasTicket) != null ? body.hasTicket : q.hasTicket)
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
    return res.status(400).json({
      ok: false,
      error: 'Provide policy `token` + proposal fields (amountAtomic, resourceUrl, network, riskLevel, freshEoa, hasTicket).',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const v = verifyToken(input.token, Date.now(), { kinds: [POLICY_KIND] });
  if (!v.valid) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-policy-check',
      version: 1,
      policyOk: false,
      reasons: [v.reason || 'invalid'],
      brief: `Policy token not valid (${v.reason || 'invalid'}).`,
      disclaimer: DISCLAIMER
    });
  }

  const ev = evaluatePolicy(v.claims, input);
  const score = Math.min(100, ev.signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-policy-check',
    version: 1,
    policyOk: ev.ok,
    reasons: ev.reasons,
    score,
    riskLevel: riskLevelFromScore(score),
    signals: ev.signals,
    claims: v.claims,
    brief: ev.ok
      ? 'Proposal fits the sealed spend policy.'
      : `Policy blocks this proposal — ${ev.reasons.join(', ')}. Patterns, not verdicts — your agent enforces.`,
    disclaimer: DISCLAIMER
  });
}

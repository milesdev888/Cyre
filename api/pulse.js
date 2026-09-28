// api/pulse.js — Quiet counterparty pulse (watch subscription shape) + x402
// Poll ≤10 addresses; return only hits vs optional prior fingerprints.
//
// GET/POST /api/pulse?list=a,b&minRisk=HIGH&prior=
// Env: SOLANA_RPC, X402_PRICE_PULSE (default 5000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress, riskLevelFromScore } from './_grade.js';

const DESCRIPTION =
  'Guardian Pulse — poll up to 10 Solana counterparties and return only risk/dormant/burst hits (quiet wallets stay quiet). Optional prior fingerprints. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { list: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', minRisk: 'HIGH' }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-pulse', hitCount: 0, disclaimer: DISCLAIMER } }
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
              properties: { list: { type: 'string' }, minRisk: { type: 'string' } },
              required: ['list']
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
  price: String(process.env.X402_PRICE_PULSE || '5000'),
  resourcePath: '/api/pulse',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['pulse', 'watch', 'alerts', 'subscription', 'agents', 'quiet'],
  discovery: DISCOVERY,
  isFree: isCyreSiteRequest
});

const RISK_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

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
  const raw = (body && body.list) || q.list || '';
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/).filter(Boolean);
  let prior = (body && body.prior) || q.prior || null;
  if (typeof prior === 'string' && prior.trim().startsWith('{')) {
    try {
      prior = JSON.parse(prior);
    } catch (e) {
      prior = null;
    }
  }
  return {
    list: [...new Set(list.map((x) => String(x).trim()).filter(Boolean))].slice(0, 10),
    minRisk: String((body && body.minRisk) || q.minRisk || 'HIGH').trim().toUpperCase() || 'HIGH',
    prior: prior && typeof prior === 'object' ? prior : null
  };
}

function fingerprint(g) {
  return {
    score: g.score,
    riskLevel: g.riskLevel,
    last24h: g.profile && g.profile.last24h != null ? g.profile.last24h : null,
    signalsTriggered: g.signalsTriggered
  };
}

function reasonsFor(g, minRisk, priorFp) {
  const reasons = [];
  const need = RISK_RANK[minRisk] || 3;
  const have = RISK_RANK[g.riskLevel] || 0;
  if (have >= need) reasons.push('risk_' + String(g.riskLevel).toLowerCase());
  const sigs = g.signals || [];
  if (sigs.some((s) => s.id === 'dormant' && s.triggered)) reasons.push('dormant');
  if (sigs.some((s) => s.id === 'burst' && s.triggered)) reasons.push('burst');
  if (sigs.some((s) => s.id === 'failures' && s.triggered)) reasons.push('failures');
  if (priorFp) {
    if (priorFp.riskLevel !== g.riskLevel) reasons.push('risk_changed');
    if (priorFp.score != null && Math.abs(Number(priorFp.score) - Number(g.score)) >= 15) reasons.push('score_drift');
  }
  return reasons;
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
  if (!input.list.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `list` of ≤10 Solana addresses. Optional minRisk, prior={address:{score,riskLevel}}.',
      disclaimer: DISCLAIMER
    });
  }
  for (const a of input.list) {
    if (!B58.test(a)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, error: `Invalid Solana address in list: ${a}`, disclaimer: DISCLAIMER });
    }
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const hits = [];
  const fingerprints = {};
  for (const address of input.list) {
    try {
      const g = await gradeAddress(address, { withAffinity: false });
      const fp = fingerprint(g);
      fingerprints[address] = fp;
      const priorFp = input.prior && input.prior[address] ? input.prior[address] : null;
      const reasons = reasonsFor(g, input.minRisk, priorFp);
      if (reasons.length) {
        hits.push({
          address,
          score: g.score,
          riskLevel: g.riskLevel,
          reasons,
          empty: !!g.empty
        });
      }
      await new Promise((r) => setTimeout(r, 80));
    } catch (e) {
      hits.push({ address, reasons: ['rpc_error'], error: String((e && e.message) || e).slice(0, 120) });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-pulse',
    version: 1,
    minRisk: input.minRisk,
    checked: input.list.length,
    hitCount: hits.length,
    hits,
    fingerprints,
    brief:
      hits.length === 0
        ? 'Quiet pulse — no hits at this minRisk / drift threshold.'
        : `${hits.length} hit(s) on this pulse. Patterns, not verdicts.`,
    next: ['Store fingerprints and pass as prior next poll', 'Escalate hits via /api/preflight or /api/handshake'],
    disclaimer: DISCLAIMER
  });
}

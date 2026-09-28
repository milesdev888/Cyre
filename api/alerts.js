// api/alerts.js — Guardian Counterparty Alert Poll + x402 gate
// Paid heartbeat over a watchlist: return only addresses that look "loud"
// (HIGH risk, dormant→active, burst, or empty→first-seen patterns).
//
// GET  /api/alerts?list=<a,b,c>&minRisk=HIGH
// POST /api/alerts { list, minRisk? }
//
// Env: SOLANA_RPC, X402_* ; X402_PRICE_ALERTS (default 15000 = $0.015)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress } from './_grade.js';

const LIST_CAP = 10;
const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const DESCRIPTION =
  'Guardian Counterparty Alerts — poll up to 10 watched addresses and return only those with HIGH risk, dormant→active, or burst patterns. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          list: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
          minRisk: 'MEDIUM'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-alerts',
          hits: [{ address: '5tzF…', riskLevel: 'MEDIUM', reasons: ['burst'] }],
          quiet: 0,
          brief: '1 address matched alert patterns.',
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
                list: { type: 'string' },
                minRisk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }
              },
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
  price: String(process.env.X402_PRICE_ALERTS || '15000'),
  resourcePath: '/api/alerts',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'solana', 'watchlist', 'alerts', 'agents', 'counterparty'],
  discovery: DISCOVERY,
  isFree: isCyreSiteRequest
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function parseList(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw) arr = String(raw).split(/[,\s]+/);
  const out = [];
  const seen = new Set();
  for (const a of arr) {
    const s = String(a || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.slice(0, LIST_CAP);
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  const minRisk = String((body && body.minRisk) || q.minRisk || 'HIGH').trim().toUpperCase();
  return {
    list: parseList((body && body.list) || q.list),
    minRisk: RISK_ORDER[minRisk] != null ? minRisk : 'HIGH'
  };
}

function reasonsFor(grade, minRisk) {
  const reasons = [];
  if (grade.empty) {
    reasons.push('empty');
    return reasons;
  }
  const minRank = RISK_ORDER[minRisk] || 2;
  if (grade.riskLevel && (RISK_ORDER[grade.riskLevel] || 0) >= minRank) {
    reasons.push('risk_' + grade.riskLevel.toLowerCase());
  }
  for (const s of grade.signals || []) {
    if (!s.triggered) continue;
    if (s.id === 'dormant' || s.id === 'burst' || s.id === 'failures') reasons.push(s.id);
  }
  return [...new Set(reasons)];
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
      error: 'Provide `list` of addresses to poll (max 10). Default watchlist is empty.',
      listCap: LIST_CAP,
      disclaimer: DISCLAIMER
    });
  }
  const bad = input.list.filter((a) => !B58.test(a));
  if (bad.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'One or more list addresses are not valid base58.', bad, disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const hits = [];
    let quiet = 0;
    let errors = 0;
    for (let i = 0; i < input.list.length; i++) {
      if (i > 0) await sleep(350);
      const address = input.list[i];
      try {
        const grade = await gradeAddress(address, { withAffinity: false });
        const reasons = reasonsFor(grade, input.minRisk);
        // empty alone is informational — only surface if minRisk is LOW or caller wants all pattern hits
        const patternHit = reasons.some((r) => r !== 'empty');
        const emptyOnly = reasons.length === 1 && reasons[0] === 'empty';
        if (patternHit || (emptyOnly && input.minRisk === 'LOW')) {
          hits.push({
            address,
            empty: !!grade.empty,
            score: grade.score,
            riskLevel: grade.riskLevel,
            reasons,
            signals: (grade.signals || []).filter((s) => s.triggered),
            profile: grade.profile || null,
            measuredAt: grade.fetchedAt
          });
        } else {
          quiet += 1;
        }
      } catch (e) {
        errors += 1;
        hits.push({ address, ok: false, error: 'Could not read chain data for this address.', reasons: ['rpc_error'] });
      }
    }

    const brief = [
      `${hits.filter((h) => !h.error).length} address${hits.length === 1 ? '' : 'es'} matched alert patterns.`,
      quiet ? `${quiet} quiet.` : null,
      'Patterns, not verdicts.'
    ]
      .filter(Boolean)
      .join(' ');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-alerts',
      version: 1,
      minRisk: input.minRisk,
      listCap: LIST_CAP,
      hits,
      counters: {
        requested: input.list.length,
        hits: hits.filter((h) => !h.error).length,
        quiet,
        errors
      },
      brief,
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('alerts', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not poll counterparties right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

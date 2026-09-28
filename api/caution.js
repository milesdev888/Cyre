// api/caution.js — Settlement caution quote + x402
// Before pay: pattern brief for payTo + amount + URL with a withhold-style band.
// NOT insurance. NOT custody. NOT a block. Patterns, not verdicts.
//
// GET/POST /api/caution?payTo=&amount=&resourceUrl=&chain=
// Env: SOLANA_RPC, BASE_RPC, X402_PRICE_CAUTION (default 2000 = $0.002)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { DISCLAIMER, riskLevelFromScore } from './_grade.js';
import {
  amountSignals,
  cautionBandFromScore,
  gradePayTo,
  parseAmountAtomic,
  urlSignals
} from './_paybrief.js';

const DESCRIPTION =
  'Guardian Settlement Caution — before you settle, get a pattern brief + withhold-style band for payTo/amount/URL. Not insurance. Not custody. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
          amount: '10000',
          resourceUrl: 'https://example.com/api/paid',
          chain: 'base'
        }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-caution', band: 'review', score: 22, disclaimer: DISCLAIMER }
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
              properties: { payTo: { type: 'string' }, amount: { type: 'string' }, resourceUrl: { type: 'string' } },
              required: ['payTo']
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
  price: String(process.env.X402_PRICE_CAUTION || '2000'),
  resourcePath: '/api/caution',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['caution', 'settlement', 'withhold', 'before-pay', 'agents', 'middleware', 'x402'],
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
  const amountRaw =
    (body && (body.amount != null ? body.amount : body.amountAtomic)) != null
      ? body.amount != null
        ? body.amount
        : body.amountAtomic
      : q.amount != null
        ? q.amount
        : q.amountAtomic;
  return {
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    amount: amountRaw != null && String(amountRaw).trim() !== '' ? String(amountRaw).trim() : null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    chain: String((body && body.chain) || q.chain || '').trim() || null
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
  if (!input.payTo) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `payTo`. Optional: amount, resourceUrl, chain.',
      disclaimer: DISCLAIMER
    });
  }

  const atomic = parseAmountAtomic(input.amount);
  if (input.amount != null && input.amount !== '' && atomic == null) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`amount` must be integer atomic USDC.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const signals = [...urlSignals(input.resourceUrl), ...amountSignals(atomic)];
  let pay = null;
  try {
    pay = await gradePayTo(input.payTo, input.chain);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({
      ok: false,
      error: 'Could not grade payTo (RPC hiccup). Retry; nothing settled if unpaid path.',
      disclaimer: DISCLAIMER
    });
  }
  if (!pay || pay.error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: `payTo invalid (${(pay && pay.error) || 'invalid'}). Use Base 0x or Solana base58.`,
      disclaimer: DISCLAIMER
    });
  }
  signals.push(...(pay.signals || []));

  const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0));
  const riskLevel = riskLevelFromScore(score);
  const caution = cautionBandFromScore(score);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-caution',
    version: 1,
    payTo: pay.payTo,
    chain: pay.chain,
    amountAtomic: atomic != null ? atomic.toString() : null,
    resourceUrl: input.resourceUrl,
    score,
    riskLevel,
    band: caution.band,
    bandLabel: caution.label,
    withholdHint: caution.hint,
    freshEoa: !!pay.freshEoa,
    profile: pay.profile,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signals: signals.slice(0, 40),
    brief: `Settlement caution ${score} (${riskLevel}) — band ${caution.band}. Not insurance; your agent decides.`,
    next: [
      'If shopping a new vendor: /api/bazaar',
      'Seal /api/lockbox before pay',
      'Optional: /api/policy/check + /api/ticket'
    ],
    notInsurance: true,
    disclaimer: DISCLAIMER
  });
}

// api/offer.js — 402 / PAYMENT-REQUIRED forensics + x402
// Parse an x402 offer blob; flag offer-pin, facilitator, recycle patterns.
//
// GET/POST /api/offer?paymentRequired=<base64-or-json>&amount=&payTo=&network=&facilitator=&resourceUrl=
// Env: X402_PRICE_OFFER (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { DISCLAIMER, riskLevelFromScore } from './_grade.js';
import { decodePaymentRequired, analyzeOffer } from './_offerparse.js';

const DESCRIPTION =
  'Guardian Offer Forensics — paste a 402 PAYMENT-REQUIRED blob (or accepts[]) and get offer-pin / facilitator / recycle patterns before you settle. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'POST',
        queryParams: {
          amount: '10000',
          payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
          facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-offer', score: 0, disclaimer: DISCLAIMER } }
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
            queryParams: { type: 'object', properties: { paymentRequired: { type: 'string' } } }
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
  price: String(process.env.X402_PRICE_OFFER || '2000'),
  resourcePath: '/api/offer',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['offer', '402', 'forensics', 'x402', 'accepts', 'middleware', 'agents'],
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
      return { paymentRequired: b };
    }
  }
  return b;
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    paymentRequired: (body && (body.paymentRequired || body.offer || body)) || q.paymentRequired || null,
    amount: String((body && body.amount) != null ? body.amount : q.amount != null ? q.amount : '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null,
    facilitator: String((body && body.facilitator) || q.facilitator || '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null
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
  let raw = input.paymentRequired;
  // If POST body was the offer itself
  if (raw && typeof raw === 'object' && (raw.accepts || raw.x402Version != null) && !raw.paymentRequired) {
    /* use as body */
  } else if (raw && typeof raw === 'object' && raw.paymentRequired) {
    raw = raw.paymentRequired;
  }

  if (!raw) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `paymentRequired` (base64 PAYMENT-REQUIRED header or JSON body with accepts[]). Optional: amount, payTo, network, facilitator, resourceUrl.',
      howTo: { post: 'POST /api/offer { "paymentRequired": "<base64 or object>", "amount": "10000" }' },
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const decoded = decodePaymentRequired(raw);
  if (decoded.error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: `Could not decode paymentRequired (${decoded.error}).`, disclaimer: DISCLAIMER });
  }

  const analysis = analyzeOffer(decoded.body, input);
  const riskLevel = riskLevelFromScore(analysis.score);
  const hot = analysis.signals.filter((s) => s.triggered).sort((a, b) => (b.points || 0) - (a.points || 0))[0];

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-offer',
    version: 1,
    acceptsCount: analysis.acceptsCount,
    networks: analysis.networks,
    resourceUrl: analysis.resourceUrl || input.resourceUrl || null,
    score: analysis.score,
    riskLevel,
    signals: analysis.signals,
    signalsTriggered: analysis.signals.filter((s) => s.triggered).length,
    brief: hot
      ? `${hot.detail} Patterns, not verdicts — you still choose whether to settle.`
      : `Offer hygiene score ${analysis.score} (${riskLevel}). No hot pins — still review before settle.`,
    next: ['If offer_mismatch / payto_recycle — do not settle', 'Then /api/route or /api/gate on payTo', 'Seal /api/intent before pay'],
    disclaimer: DISCLAIMER
  });
}

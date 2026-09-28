// api/bazaar.js — Bazaar discovery hygiene + x402
// Before an agent pays a new Agentic Market / x402 vendor: probe resourceUrl for 402,
// forensics the offer, grade payTo, host hygiene. Patterns, not verdicts.
//
// GET/POST /api/bazaar?resourceUrl=&payTo=&amount=&paymentRequired=&facilitator=&network=
// Env: SOLANA_RPC, BASE_RPC, X402_PRICE_BAZAAR (default 3000 = $0.003)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { DISCLAIMER, riskLevelFromScore, signal } from './_grade.js';
import { decodePaymentRequired, analyzeOffer } from './_offerparse.js';
import { amountSignals, gradePayTo, parseAmountAtomic, urlSignals } from './_paybrief.js';

const DESCRIPTION =
  'Guardian Bazaar Scan — before you pay a new x402 / Agentic Market skill, probe the resource URL, forensics the 402 offer, and grade payTo. Shopping hygiene. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          resourceUrl: 'https://example.com/api/paid',
          payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
          amount: '10000',
          facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402',
          network: 'eip155:8453'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-bazaar', score: 12, disclaimer: DISCLAIMER } }
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
              properties: { resourceUrl: { type: 'string' }, payTo: { type: 'string' } }
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
  price: String(process.env.X402_PRICE_BAZAAR || '3000'),
  resourcePath: '/api/bazaar',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['bazaar', 'discovery', 'x402', 'shopping', 'offer', 'agents', 'middleware', 'market'],
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
    resourceUrl: String((body && (body.resourceUrl || body.url)) || q.resourceUrl || q.url || '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    amount: String((body && body.amount) != null ? body.amount : q.amount != null ? q.amount : '').trim() || null,
    paymentRequired: (body && (body.paymentRequired || body.offer)) || q.paymentRequired || null,
    facilitator: String((body && body.facilitator) || q.facilitator || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null,
    chain: String((body && body.chain) || q.chain || '').trim() || null
  };
}

async function probeResource(resourceUrl) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(resourceUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: ac.signal,
      headers: { accept: 'application/json', 'user-agent': 'cyre-guardian-bazaar/1' }
    });
    const pr = r.headers.get('payment-required');
    let bodyText = null;
    let bodyJson = null;
    try {
      bodyText = await r.text();
      bodyJson = JSON.parse(bodyText);
    } catch (e) {
      /* ignore */
    }
    return {
      status: r.status,
      paymentRequiredHeader: pr || null,
      bodyOffer: bodyJson && (bodyJson.accepts || bodyJson.x402Version != null) ? bodyJson : null,
      unreachable: false
    };
  } catch (err) {
    const timedOut = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    return { status: null, unreachable: true, error: timedOut ? 'timeout' : 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
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
  if (!input.resourceUrl && !input.payTo && !input.paymentRequired) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide resourceUrl and/or payTo and/or paymentRequired.',
      howTo: {
        get: 'GET /api/bazaar?resourceUrl=https://…&payTo=0x…&amount=10000'
      },
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const signals = [];
  const parts = {};
  const atomic = parseAmountAtomic(input.amount);
  if (input.amount != null && input.amount !== '' && atomic == null) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`amount` must be integer atomic USDC.', disclaimer: DISCLAIMER });
  }

  signals.push(...urlSignals(input.resourceUrl));
  signals.push(...amountSignals(atomic));

  let offerRaw = input.paymentRequired;
  if (!offerRaw && input.resourceUrl) {
    const probe = await probeResource(input.resourceUrl);
    parts.probe = {
      status: probe.status,
      unreachable: !!probe.unreachable,
      error: probe.error || null,
      got402: probe.status === 402
    };
    if (probe.unreachable) {
      signals.push(signal('resource_unreachable', 'Probe', 18, true, `Could not reach resourceUrl (${probe.error})`));
    } else if (probe.status === 402) {
      signals.push(signal('resource_402', 'Probe', 0, false, 'Resource returned HTTP 402 as expected for x402'));
      offerRaw = probe.paymentRequiredHeader || probe.bodyOffer;
    } else {
      signals.push(
        signal(
          'resource_not_402',
          'Probe',
          14,
          true,
          `Resource returned HTTP ${probe.status} (expected 402 for a paid x402 skill)`
        )
      );
      if (probe.bodyOffer) offerRaw = probe.bodyOffer;
    }
  }

  if (offerRaw) {
    const decoded = decodePaymentRequired(offerRaw);
    if (decoded.error) {
      parts.offer = { ok: false, error: decoded.error };
      signals.push(signal('offer_decode', 'Offer', 20, true, `paymentRequired decode failed: ${decoded.error}`));
    } else {
      const analysis = analyzeOffer(decoded.body, {
        amount: atomic != null ? atomic.toString() : input.amount,
        payTo: input.payTo,
        network: input.network,
        facilitator: input.facilitator,
        resourceUrl: input.resourceUrl
      });
      parts.offer = {
        ok: true,
        score: analysis.score,
        acceptsCount: analysis.acceptsCount,
        networks: analysis.networks
      };
      signals.push(...analysis.signals.map((s) => ({ ...s, scope: 'offer' })));
    }
  }

  if (input.payTo) {
    try {
      const g = await gradePayTo(input.payTo, input.chain || input.network);
      if (g && g.error) {
        parts.payTo = { ok: false, error: g.error };
        signals.push(signal('payto_invalid', 'PayTo', 20, true, `payTo invalid (${g.error})`));
      } else if (g) {
        parts.payTo = {
          ok: true,
          chain: g.chain,
          score: g.score,
          riskLevel: g.riskLevel,
          freshEoa: !!g.freshEoa,
          profile: g.profile
        };
        signals.push(...(g.signals || []).map((s) => ({ ...s, scope: 'payTo' })));
      }
    } catch (e) {
      parts.payTo = { ok: false, error: 'grade_failed' };
      signals.push(signal('payto_grade_failed', 'PayTo', 10, true, 'Could not grade payTo (RPC hiccup)'));
    }
  }

  const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0));
  const riskLevel = riskLevelFromScore(score);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-bazaar',
    version: 1,
    resourceUrl: input.resourceUrl,
    payTo: input.payTo,
    amountAtomic: atomic != null ? atomic.toString() : null,
    parts,
    score,
    riskLevel,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signals: signals.slice(0, 40),
    brief:
      score >= 30
        ? `Bazaar scan ${score} (${riskLevel}) — review offer pins / host / payTo before you settle. Patterns, not verdicts.`
        : `Bazaar scan ${score} (${riskLevel}) — few hot patterns; still pin amount and facilitator.`,
    next: [
      'Before settle: /api/caution for a withhold-style brief',
      'Seal /api/lockbox with your intentHash before pay',
      'Or /api/route for a fuller pay-route check'
    ],
    disclaimer: DISCLAIMER
  });
}

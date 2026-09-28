// api/pack.js — Cross-skill checkout pack + x402
// One pay: offer forensics + lookalike + policy check (+ optional ticket/intent verify).
//
// POST /api/pack { paymentRequired?, candidate?, contacts?, policyToken?, ticketToken?,
//                  amountAtomic?, resourceUrl?, network?, payTo?, facilitator? }
// Env: X402_PRICE_PACK (default 5000 = $0.005)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { verifyToken, POLICY_KIND, PASSPORT_KIND, RECEIPT_KIND, INTENT_KIND } from './_attest.js';
import { decodePaymentRequired, analyzeOffer } from './_offerparse.js';
import { evaluatePolicy } from './_policycheck.js';
import { scanLookalikes, detectFamily } from './_lookalike.js';
import { DISCLAIMER, riskLevelFromScore, signal } from './_grade.js';

const DESCRIPTION =
  'Guardian Pack — one middleware call: 402 offer forensics + lookalike + spend-policy check (+ optional ticket/intent). Before external pay/send. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'POST',
        queryParams: { amountAtomic: '10000', resourceUrl: 'https://example.com/api/paid' }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-pack', admitted: true, disclaimer: DISCLAIMER } }
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
            queryParams: { type: 'object' }
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
  price: String(process.env.X402_PRICE_PACK || '5000'),
  resourcePath: '/api/pack',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['pack', 'bundle', 'middleware', 'checkout', 'agents', 'x402'],
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

function listField(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return String(raw).split(/[,\s]+/).filter(Boolean);
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    paymentRequired: (body && (body.paymentRequired || body.offer)) || q.paymentRequired || null,
    candidate: String((body && (body.candidate || body.to)) || q.candidate || q.to || '').trim() || null,
    contacts: listField((body && body.contacts) || q.contacts),
    policyToken: String((body && body.policyToken) || q.policyToken || '').trim() || null,
    ticketToken: String((body && body.ticketToken) || q.ticketToken || '').trim() || null,
    intentToken: String((body && body.intentToken) || q.intentToken || '').trim() || null,
    intentHash: String((body && body.intentHash) || q.intentHash || '').trim() || null,
    amountAtomic: String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    facilitator: String((body && body.facilitator) || q.facilitator || '').trim() || null
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
  if (!input.paymentRequired && !input.candidate && !input.policyToken && !input.ticketToken) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide at least one of: paymentRequired, candidate(+contacts), policyToken, ticketToken.',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const parts = {};
  const signals = [];
  const blocks = [];

  if (input.paymentRequired) {
    const decoded = decodePaymentRequired(input.paymentRequired);
    if (decoded.error) {
      parts.offer = { ok: false, error: decoded.error };
      blocks.push('offer_decode');
      signals.push(signal('offer_decode', 'Offer', 20, true, `paymentRequired decode failed: ${decoded.error}`));
    } else {
      const analysis = analyzeOffer(decoded.body, input);
      parts.offer = { ok: true, score: analysis.score, signalsTriggered: analysis.signals.filter((s) => s.triggered).length, networks: analysis.networks };
      signals.push(...analysis.signals.map((s) => ({ ...s, scope: 'offer' })));
      if (analysis.score >= 20) blocks.push('offer_hygiene');
    }
  }

  if (input.candidate) {
    if (!detectFamily(input.candidate)) {
      parts.lookalike = { ok: false, error: 'invalid_candidate' };
      blocks.push('lookalike_invalid');
    } else {
      const scan = scanLookalikes(input.candidate, input.contacts, 20);
      parts.lookalike = {
        ok: true,
        score: scan.score,
        hitCount: scan.hits.filter((h) => h.triggered).length,
        exactMatch: scan.hits.some((h) => h.exact)
      };
      if (scan.score >= 12) {
        blocks.push('lookalike');
        signals.push(signal('lookalike_hit', 'Lookalike', scan.score, true, 'Candidate looks like a listed contact'));
      } else {
        signals.push(signal('lookalike_clean', 'Lookalike', 0, false, 'No lookalike hits'));
      }
    }
  }

  let hasTicket = false;
  if (input.ticketToken) {
    const tv = verifyToken(input.ticketToken, Date.now(), { kinds: [PASSPORT_KIND, RECEIPT_KIND] });
    hasTicket = !!(tv.valid && !tv.expired);
    parts.ticket = { valid: tv.valid, expired: !!tv.expired, reason: tv.reason || null, kind: tv.claims && tv.claims.kind };
    if (!hasTicket) {
      blocks.push('ticket');
      signals.push(signal('ticket_bad', 'Ticket', 28, true, tv.reason || 'ticket invalid/expired'));
    } else {
      signals.push(signal('ticket_ok', 'Ticket', 0, false, 'Passport/Receipt ticket valid'));
    }
  }

  if (input.policyToken) {
    const pv = verifyToken(input.policyToken, Date.now(), { kinds: [POLICY_KIND] });
    if (!pv.valid) {
      parts.policy = { policyOk: false, reasons: [pv.reason || 'invalid'] };
      blocks.push('policy_token');
      signals.push(signal('policy_bad', 'Policy', 30, true, pv.reason || 'policy invalid'));
    } else {
      const ev = evaluatePolicy(pv.claims, {
        amountAtomic: input.amountAtomic,
        resourceUrl: input.resourceUrl,
        network: input.network,
        hasTicket
      });
      parts.policy = { policyOk: ev.ok, reasons: ev.reasons };
      signals.push(...ev.signals.map((s) => ({ ...s, scope: 'policy' })));
      if (!ev.ok) blocks.push('policy');
    }
  }

  if (input.intentToken) {
    const iv = verifyToken(input.intentToken, Date.now(), { kinds: [INTENT_KIND] });
    let hashMatch = null;
    if (input.intentHash && iv.claims) hashMatch = String(iv.claims.intentHash) === String(input.intentHash);
    parts.intent = { valid: iv.valid, hashMatch, reason: iv.reason || null };
    if (!iv.valid || hashMatch === false) {
      blocks.push('intent');
      signals.push(signal('intent_bad', 'Intent', 26, true, iv.reason || 'intent hash mismatch'));
    }
  }

  const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0));
  const admitted = blocks.length === 0;
  const riskLevel = riskLevelFromScore(score);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-pack',
    version: 1,
    admitted,
    blocks,
    parts,
    score,
    riskLevel,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signals: signals.slice(0, 40),
    brief: admitted
      ? 'Pack clear — no blocking patterns on the checks you supplied.'
      : `Pack not clear — blocks: ${blocks.join(', ')}. Patterns, not verdicts — your policy decides.`,
    next: admitted
      ? ['Proceed to pay/sign', 'Seal /api/receipt afterward']
      : ['Fix blocked checks', 'Re-run /api/pack', 'Or call skills individually'],
    disclaimer: DISCLAIMER
  });
}

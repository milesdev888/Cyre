// api/lockbox-match.js — Match a sealed lockbox against a proposed pay + x402
// Proves the seal exists and compares intentHash / payTo / amount / resourceUrl / network.
//
// GET/POST /api/lockbox/match?token=&intentHash=&payTo=&amountAtomic=&resourceUrl=&network=
// Env: X402_PRICE_LOCKBOX_MATCH (default 1000 = $0.001)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { verifyToken, LOCKBOX_KIND, INTENT_KIND } from './_attest.js';
import { DISCLAIMER, riskLevelFromScore, signal } from './_grade.js';

const DESCRIPTION =
  'Guardian Lockbox Match — check a proposed pay against a sealed pre-pay lockbox (intentHash + optional pins). Catch bait-and-switch. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          token: '<lockbox-token>',
          intentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
          amountAtomic: '10000'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-lockbox-match', matched: true, disclaimer: DISCLAIMER } }
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
              properties: { token: { type: 'string' }, intentHash: { type: 'string' } },
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
  price: String(process.env.X402_PRICE_LOCKBOX_MATCH || '1000'),
  resourcePath: '/api/lockbox/match',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['lockbox', 'match', 'intent', 'bait-and-switch', 'agents', 'middleware'],
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

function normAddr(a) {
  const s = String(a || '');
  return s.startsWith('0x') ? s.toLowerCase() : s;
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    token: String((body && body.token) || q.token || '').trim() || null,
    intentHash: String((body && body.intentHash) || q.intentHash || '').trim() || null,
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    amountAtomic:
      String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() ||
      null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null
  };
}

/** Pure match of lockbox/intent claims vs proposal. */
export function matchLockbox(claims, proposal = {}) {
  const signals = [];
  const mismatches = [];
  if (!claims || (claims.kind !== LOCKBOX_KIND && claims.kind !== INTENT_KIND)) {
    return {
      matched: false,
      mismatches: ['not_a_lockbox'],
      signals: [signal('not_lockbox', 'Lockbox', 40, true, 'Token is not a lockbox or intent seal')]
    };
  }

  if (proposal.intentHash) {
    if (String(claims.intentHash) === String(proposal.intentHash)) {
      signals.push(signal('hash_match', 'Intent hash', 0, false, 'intentHash matches sealed lock'));
    } else {
      mismatches.push('intentHash');
      signals.push(signal('hash_mismatch', 'Intent hash', 30, true, 'intentHash does not match sealed lock'));
    }
  }

  if (proposal.payTo && claims.payTo) {
    if (normAddr(claims.payTo) === normAddr(proposal.payTo)) {
      signals.push(signal('payto_match', 'PayTo', 0, false, 'payTo matches sealed pin'));
    } else {
      mismatches.push('payTo');
      signals.push(signal('payto_mismatch', 'PayTo', 28, true, 'payTo does not match sealed pin'));
    }
  } else if (proposal.payTo && !claims.payTo) {
    signals.push(signal('payto_unpinned', 'PayTo', 0, false, 'Proposal has payTo; seal did not pin one'));
  }

  if (proposal.amountAtomic != null && claims.amountAtomic != null) {
    if (String(claims.amountAtomic) === String(proposal.amountAtomic)) {
      signals.push(signal('amount_match', 'Amount', 0, false, 'amountAtomic matches sealed pin'));
    } else {
      mismatches.push('amountAtomic');
      signals.push(signal('amount_mismatch', 'Amount', 26, true, 'amountAtomic does not match sealed pin'));
    }
  }

  if (proposal.resourceUrl && claims.resourceUrl) {
    if (String(claims.resourceUrl) === String(proposal.resourceUrl)) {
      signals.push(signal('url_match', 'Resource URL', 0, false, 'resourceUrl matches sealed pin'));
    } else {
      mismatches.push('resourceUrl');
      signals.push(signal('url_mismatch', 'Resource URL', 22, true, 'resourceUrl does not match sealed pin'));
    }
  }

  if (proposal.network && claims.network) {
    if (String(claims.network) === String(proposal.network)) {
      signals.push(signal('network_match', 'Network', 0, false, 'network matches sealed pin'));
    } else {
      mismatches.push('network');
      signals.push(signal('network_mismatch', 'Network', 18, true, 'network does not match sealed pin'));
    }
  }

  if (!signals.length) {
    signals.push(signal('lock_vacuous', 'Lockbox', 0, false, 'Seal valid; no overlapping pins to compare'));
  }

  return { matched: mismatches.length === 0, mismatches, signals };
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
      error: 'Provide lockbox `token` + proposal fields to compare (intentHash, payTo, amountAtomic, resourceUrl, network).',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const now = Date.now();
  const v = verifyToken(input.token, now, { kinds: [LOCKBOX_KIND, INTENT_KIND] });
  if (!v.valid) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-lockbox-match',
      version: 1,
      matched: false,
      mismatches: [v.reason || 'invalid'],
      sealedBeforePay: false,
      brief: `Lockbox token not valid (${v.reason || 'invalid'}).`,
      disclaimer: DISCLAIMER
    });
  }

  const ev = matchLockbox(v.claims, input);
  const sealedAt = v.claims && v.claims.issuedAt ? Date.parse(v.claims.issuedAt) : NaN;
  const ageSeconds = Number.isFinite(sealedAt) ? Math.max(0, Math.floor((now - sealedAt) / 1000)) : null;
  const score = Math.min(100, ev.signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-lockbox-match',
    version: 1,
    matched: ev.matched,
    mismatches: ev.mismatches,
    sealedBeforePay: true,
    sealedAt: v.claims.issuedAt || null,
    ageSeconds,
    score,
    riskLevel: riskLevelFromScore(score),
    signals: ev.signals,
    claims: v.claims,
    brief: ev.matched
      ? `Lockbox matches proposal (sealed ${ageSeconds != null ? ageSeconds + 's' : '?'} ago). Patterns, not verdicts.`
      : `Lockbox mismatch — ${ev.mismatches.join(', ')}. Refuse settle until pins align.`,
    next: ev.matched
      ? ['Proceed to pay/sign', 'Seal /api/receipt with the same intentHash']
      : ['Do not settle on mismatched pins', 'Re-seal /api/lockbox if the intent changed'],
    disclaimer: DISCLAIMER
  });
}

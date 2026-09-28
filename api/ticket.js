// api/ticket.js — Session ticket check + x402
// Other agents require a fresh Guardian Passport or Decision Receipt before proceeding.
// This is the middleware: verify token + freshness SLA + optional address/risk pins.
//
// GET/POST /api/ticket?token=&require=passport|receipt|either&maxAgeSeconds=&address=&maxRisk=
// Env: PASSPORT_SIGNING_KEY (verify), X402_PRICE_TICKET (default 2000 = $0.002)
// Free verifiers remain at /api/passport/verify and /api/receipt/verify.

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import {
  verifyToken,
  issuerPublicKey,
  ISSUER,
  PASSPORT_KIND,
  RECEIPT_KIND
} from './_attest.js';
import { DISCLAIMER, signal } from './_grade.js';

const DESCRIPTION =
  'Guardian Session Ticket — require a fresh Passport or Decision Receipt before your agent proceeds. Checks signature, expiry, max age, optional address + risk ceiling. Patterns, not verdicts.';

const RISK_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          token: '<passport-or-receipt-token>',
          require: 'passport',
          maxAgeSeconds: '3600',
          address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          maxRisk: 'MEDIUM'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-ticket',
          version: 1,
          admitted: true,
          require: 'passport',
          ageSeconds: 120,
          brief: 'Ticket admitted — passport fresh and within risk ceiling.',
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
                token: { type: 'string' },
                require: { type: 'string', description: 'passport | receipt | either' },
                maxAgeSeconds: { type: 'string' },
                address: { type: 'string', description: 'Optional address that must match claims' },
                maxRisk: { type: 'string', description: 'Optional LOW|MEDIUM|HIGH ceiling' }
              },
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
  price: String(process.env.X402_PRICE_TICKET || '2000'),
  resourcePath: '/api/ticket',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['ticket', 'session', 'passport', 'receipt', 'middleware', 'agents', 'attestation', 'freshness'],
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
  const maxAgeRaw = (body && body.maxAgeSeconds) != null ? body.maxAgeSeconds : q.maxAgeSeconds;
  const maxAgeSeconds =
    maxAgeRaw === '' || maxAgeRaw == null ? 86400 : Math.max(60, Math.min(30 * 86400, Number(maxAgeRaw) || 86400));
  return {
    token: String((body && (body.token || (body.attestation && body.attestation.token))) || q.token || '').trim() || null,
    require: String((body && body.require) || q.require || 'either')
      .trim()
      .toLowerCase() || 'either',
    maxAgeSeconds,
    address: String((body && body.address) || q.address || '').trim() || null,
    maxRisk: String((body && body.maxRisk) || q.maxRisk || '')
      .trim()
      .toUpperCase() || null
  };
}

function kindsFor(require) {
  if (require === 'passport') return [PASSPORT_KIND];
  if (require === 'receipt') return [RECEIPT_KIND];
  return [PASSPORT_KIND, RECEIPT_KIND];
}

function claimAddress(claims) {
  if (!claims) return null;
  return claims.address || claims.actor || null;
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
      error: 'Provide `token` (Passport or Decision Receipt). Optional: require, maxAgeSeconds, address, maxRisk.',
      howTo: {
        get: 'GET /api/ticket?token=<t>&require=passport&maxAgeSeconds=3600',
        freeVerify: ['/api/passport/verify', '/api/receipt/verify']
      },
      issuer: ISSUER,
      publicKey: issuerPublicKey(),
      disclaimer: DISCLAIMER
    });
  }

  if (!['passport', 'receipt', 'either'].includes(input.require)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: '`require` must be passport | receipt | either.',
      disclaimer: DISCLAIMER
    });
  }

  if (input.maxRisk && !RISK_RANK[input.maxRisk]) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: '`maxRisk` must be LOW, MEDIUM, or HIGH.',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const now = Date.now();
  const kinds = kindsFor(input.require);
  const result = verifyToken(input.token, now, { kinds, allowExpired: true });

  const reasons = [];
  const signals = [];
  let admitted = true;

  if (!result.valid && !result.expired) {
    admitted = false;
    reasons.push(result.reason || 'invalid token');
    signals.push(signal('invalid', 'Signature', 40, true, result.reason || 'invalid token'));
  } else if (result.expired) {
    admitted = false;
    reasons.push('expired');
    signals.push(signal('expired', 'Expiry', 36, true, 'Token is past expiresAt'));
  } else {
    signals.push(signal('signature_ok', 'Signature', 0, false, 'Guardian signature valid'));
  }

  const claims = result.claims || null;
  let ageSeconds = null;
  if (claims && claims.issuedAt) {
    const issued = Date.parse(claims.issuedAt);
    if (Number.isFinite(issued)) {
      ageSeconds = Math.max(0, Math.floor((now - issued) / 1000));
      if (ageSeconds > input.maxAgeSeconds) {
        admitted = false;
        reasons.push('stale');
        signals.push(
          signal(
            'stale',
            'Freshness',
            28,
            true,
            `Ticket age ${ageSeconds}s exceeds maxAgeSeconds ${input.maxAgeSeconds}`
          )
        );
      } else {
        signals.push(
          signal('fresh', 'Freshness', 0, false, `Ticket age ${ageSeconds}s ≤ maxAgeSeconds ${input.maxAgeSeconds}`)
        );
      }
    }
  }

  if (input.address && claims) {
    const got = claimAddress(claims);
    if (!got || String(got) !== input.address) {
      admitted = false;
      reasons.push('address_mismatch');
      signals.push(
        signal(
          'address_mismatch',
          'Address pin',
          30,
          true,
          `claims address/actor ${got || '∅'} ≠ required ${input.address}`
        )
      );
    } else {
      signals.push(signal('address_ok', 'Address pin', 0, false, 'Address matches ticket claims'));
    }
  }

  if (input.maxRisk && claims && claims.riskLevel) {
    const have = RISK_RANK[String(claims.riskLevel).toUpperCase()] || 99;
    const ceil = RISK_RANK[input.maxRisk];
    if (have > ceil) {
      admitted = false;
      reasons.push('risk_ceiling');
      signals.push(
        signal(
          'risk_ceiling',
          'Risk ceiling',
          22,
          true,
          `claims.riskLevel ${claims.riskLevel} above maxRisk ${input.maxRisk}`
        )
      );
    } else {
      signals.push(signal('risk_ok', 'Risk ceiling', 0, false, `riskLevel ${claims.riskLevel} within ${input.maxRisk}`));
    }
  }

  // If signature invalid, force not admitted
  if (result.valid === false && !result.expired) admitted = false;

  const brief = admitted
    ? `Ticket admitted (${claims && claims.kind ? claims.kind : 'unknown'}). Freshness and pins passed.`
    : `Ticket not admitted — ${reasons.join(', ') || 'failed checks'}. Patterns, not verdicts — your policy decides the block.`;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-ticket',
    version: 1,
    admitted,
    require: input.require,
    maxAgeSeconds: input.maxAgeSeconds,
    address: input.address,
    maxRisk: input.maxRisk,
    ageSeconds,
    expiresInSeconds: typeof result.expiresInSeconds === 'number' ? result.expiresInSeconds : null,
    reasons: admitted ? [] : reasons,
    claims,
    signals,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    brief,
    issuer: ISSUER,
    publicKey: issuerPublicKey(),
    next: admitted
      ? ['Proceed with your agent flow', 'Optional: seal /api/receipt after the action']
      : [
          'Refresh Passport via /api/passport or /api/delta',
          'Or seal a new /api/receipt',
          'Free debug: /api/passport/verify or /api/receipt/verify'
        ],
    disclaimer: DISCLAIMER
  });
}

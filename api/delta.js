// api/delta.js — Guardian Passport Delta + x402 gate
// Re-measure an address from a prior Passport token and return what changed.
// Prior token may be expired (comparison still runs). Fresh passport optional.
//
// GET  /api/delta?token=<prior passport>
// POST /api/delta { token, issueFresh?: true }
//
// Env: SOLANA_RPC, PASSPORT_SIGNING_KEY, X402_* ; X402_PRICE_DELTA (default 10000 = $0.01)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { verifyToken, attest, issuerPublicKey, ISSUER, PASSPORT_KIND } from './_attest.js';
import { B58, DISCLAIMER, gradeAddress } from './_grade.js';

const DESCRIPTION =
  'Guardian Passport Delta — re-attest a wallet against a prior Passport and return score drift, risk-level flips, and signal changes. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { token: '<base64url-claims>.<base64url-signature>' }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-delta',
          address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          prior: { score: 12, riskLevel: 'LOW' },
          current: { score: 44, riskLevel: 'MEDIUM' },
          delta: { scoreDrift: 32, riskLevelChanged: true },
          brief: 'Score rose +32 (LOW → MEDIUM).',
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
              properties: { token: { type: 'string', description: 'Prior Guardian Passport token' } },
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
  price: String(process.env.X402_PRICE_DELTA || '10000'),
  resourcePath: '/api/delta',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'solana', 'passport', 'delta', 'agents', 'attestation'],
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
  const issueFreshRaw = (body && body.issueFresh) != null ? body.issueFresh : q.issueFresh;
  const issueFresh = issueFreshRaw === true || issueFreshRaw === '1' || issueFreshRaw === 'true';
  return {
    token: String((body && body.token) || q.token || '').trim() || null,
    issueFresh
  };
}

function buildBrief(prior, current, delta) {
  const parts = [];
  if (delta.scoreDrift == null) {
    parts.push('Could not compute score drift (missing prior or current score).');
  } else if (delta.scoreDrift === 0) {
    parts.push(`Score unchanged at ${current.score} (${current.riskLevel || 'n/a'}).`);
  } else {
    const dir = delta.scoreDrift > 0 ? 'rose' : 'fell';
    parts.push(
      `Score ${dir} ${delta.scoreDrift > 0 ? '+' : ''}${delta.scoreDrift} (${prior.riskLevel || '?'} → ${current.riskLevel || '?'}).`
    );
  }
  if (delta.riskLevelChanged) parts.push('Risk level flipped.');
  if (prior.expired) parts.push('Prior passport was expired — comparison still ran.');
  parts.push('Patterns, not verdicts.');
  return parts.join(' ');
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
      error: 'Provide prior Passport `token` from /api/passport.',
      disclaimer: DISCLAIMER
    });
  }

  const priorVerify = verifyToken(input.token, Date.now(), {
    kinds: [PASSPORT_KIND],
    allowExpired: true
  });
  if (!priorVerify.valid || !priorVerify.claims || !priorVerify.claims.address) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Prior passport is not a valid Guardian attestation.',
      reason: priorVerify.reason || 'invalid',
      disclaimer: DISCLAIMER
    });
  }
  if (!B58.test(priorVerify.claims.address)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Passport address is not valid base58.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const grade = await gradeAddress(priorVerify.claims.address, { withAffinity: true });
    const prior = {
      address: priorVerify.claims.address,
      score: priorVerify.claims.score,
      riskLevel: priorVerify.claims.riskLevel,
      signalsTriggered: priorVerify.claims.signalsTriggered,
      signalsEvaluated: priorVerify.claims.signalsEvaluated,
      measuredAt: priorVerify.claims.measuredAt || null,
      issuedAt: priorVerify.claims.issuedAt || null,
      expiresAt: priorVerify.claims.expiresAt || null,
      expired: !!priorVerify.expired,
      attestationId: priorVerify.claims.id || null
    };
    const current = {
      address: grade.address,
      empty: !!grade.empty,
      score: grade.score,
      riskLevel: grade.riskLevel,
      signalsTriggered: grade.signalsTriggered,
      signalsEvaluated: grade.signalsEvaluated,
      signals: grade.signals || [],
      mintAffinity: grade.mintAffinity || null,
      measuredAt: grade.fetchedAt
    };

    const scoreDrift =
      typeof prior.score === 'number' && typeof current.score === 'number' ? current.score - prior.score : null;
    const delta = {
      scoreDrift,
      riskLevelChanged: prior.riskLevel != null && current.riskLevel != null ? prior.riskLevel !== current.riskLevel : null,
      signalsTriggeredDrift:
        typeof prior.signalsTriggered === 'number' && typeof current.signalsTriggered === 'number'
          ? current.signalsTriggered - prior.signalsTriggered
          : null
    };
    const brief = buildBrief(prior, current, delta);

    let fresh = null;
    if (input.issueFresh && !grade.empty) {
      const passportLike = {
        address: grade.address,
        score: grade.score,
        riskLevel: grade.riskLevel,
        signalsTriggered: grade.signalsTriggered,
        signalsEvaluated: grade.signalsEvaluated,
        fetchedAt: grade.fetchedAt
      };
      const signed = attest(passportLike);
      fresh = {
        attestation: signed.attestation,
        ...(signed.unsigned ? { unsigned: signed.unsigned } : {})
      };
      if (signed.token) res.setHeader('X-Guardian-Passport', signed.token);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-delta',
      version: 1,
      address: prior.address,
      issuer: ISSUER,
      issuerPublicKey: issuerPublicKey(),
      prior,
      current,
      delta,
      brief,
      ...(fresh ? { freshPassport: fresh } : {}),
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('delta', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not re-measure address right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

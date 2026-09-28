// api/handshake.js — Bilateral Guardian Passport Handshake + x402 gate
// Two agents. Two Passports (or two addresses). One call.
// Verifies both sides and returns a compatibility brief — patterns, not verdicts.
//
// GET  /api/handshake?tokenA=…&tokenB=…
// GET  /api/handshake?addressA=…&addressB=…
// POST /api/handshake  { tokenA, tokenB } | { addressA, addressB }
//
// Env: X402_* (see ./_x402.js), PASSPORT_SIGNING_KEY (verify), SOLANA_RPC (address path)
//      X402_PRICE_HANDSHAKE — atomic USDC (default 10000 = $0.01)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { verifyToken, issuerPublicKey, ISSUER } from './_attest.js';
import { B58, DISCLAIMER, gradeAddress } from './_grade.js';

const DESCRIPTION =
  'Guardian Handshake — two Passports (or two Solana addresses), one compatibility brief. Score delta, risk mismatch, overlapping patterns. Patterns, not verdicts.';

const EXAMPLE_TOKEN = '<base64url-claims>.<base64url-signature>';
const EXAMPLE_A = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EXAMPLE_B = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { tokenA: EXAMPLE_TOKEN, tokenB: EXAMPLE_TOKEN }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-handshake',
          version: 1,
          sides: {
            a: { address: EXAMPLE_A, valid: true, score: 12, riskLevel: 'LOW' },
            b: { address: EXAMPLE_B, valid: true, score: 44, riskLevel: 'MEDIUM' }
          },
          delta: { scoreGap: 32, riskLevelMatch: false, higherRisk: 'b' },
          brief: 'Side B scores 32 points higher (MEDIUM vs LOW). Patterns differ — review before you settle.',
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
                tokenA: { type: 'string', description: 'Guardian Passport token for side A' },
                tokenB: { type: 'string', description: 'Guardian Passport token for side B' },
                addressA: { type: 'string', description: 'Solana address for side A (when tokens not provided)' },
                addressB: { type: 'string', description: 'Solana address for side B (when tokens not provided)' }
              }
            }
          },
          required: ['type', 'method'],
          additionalProperties: false
        },
        output: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            example: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                kind: { type: 'string' },
                delta: { type: 'object' },
                brief: { type: 'string' },
                disclaimer: { type: 'string' }
              }
            }
          },
          required: ['type']
        }
      },
      required: ['input']
    }
  }
};

const x402Gate = createX402Gate({
  price: String(process.env.X402_PRICE_HANDSHAKE || '10000'),
  resourcePath: '/api/handshake',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'fraud', 'solana', 'passport', 'handshake', 'counterparty', 'agents', 'attestation'],
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
    tokenA: String((body && body.tokenA) || q.tokenA || '').trim() || null,
    tokenB: String((body && body.tokenB) || q.tokenB || '').trim() || null,
    addressA: String((body && body.addressA) || q.addressA || '').trim() || null,
    addressB: String((body && body.addressB) || q.addressB || '').trim() || null
  };
}

function sideFromClaims(claims, verifyMeta) {
  return {
    source: 'passport',
    address: claims.address,
    valid: true,
    score: claims.score,
    riskLevel: claims.riskLevel,
    signalsTriggered: claims.signalsTriggered,
    signalsEvaluated: claims.signalsEvaluated,
    measuredAt: claims.measuredAt || null,
    issuedAt: claims.issuedAt || null,
    expiresAt: claims.expiresAt || null,
    expiresInSeconds: typeof verifyMeta.expiresInSeconds === 'number' ? verifyMeta.expiresInSeconds : null,
    attestationId: claims.id || null
  };
}

function sideFromGrade(grade) {
  return {
    source: 'address',
    address: grade.address,
    valid: true,
    empty: !!grade.empty,
    score: grade.score,
    riskLevel: grade.riskLevel,
    signalsTriggered: grade.signalsTriggered,
    signalsEvaluated: grade.signalsEvaluated,
    signals: grade.signals || [],
    profile: grade.profile || null,
    mintAffinity: grade.mintAffinity || null,
    measuredAt: grade.fetchedAt || null
  };
}

function mintOverlap(aAff, bAff) {
  if (!Array.isArray(aAff) || !Array.isArray(bAff)) return null;
  const overlapHold = [];
  const onlyA = [];
  const onlyB = [];
  const bySym = new Map(bAff.map((x) => [x.symbol, x]));
  for (const a of aAff) {
    const b = bySym.get(a.symbol);
    if (a.hold && b && b.hold) overlapHold.push(a.symbol);
    else if (a.hold && !(b && b.hold)) onlyA.push(a.symbol);
  }
  for (const b of bAff) {
    const a = aAff.find((x) => x.symbol === b.symbol);
    if (b.hold && !(a && a.hold)) onlyB.push(b.symbol);
  }
  return { overlapHold, onlyA, onlyB };
}

function buildDelta(sideA, sideB) {
  const scoreA = typeof sideA.score === 'number' ? sideA.score : null;
  const scoreB = typeof sideB.score === 'number' ? sideB.score : null;
  let scoreGap = null;
  let higherRisk = 'unknown';
  if (scoreA != null && scoreB != null) {
    scoreGap = Math.abs(scoreA - scoreB);
    if (scoreA === scoreB) higherRisk = 'tie';
    else higherRisk = scoreA > scoreB ? 'a' : 'b';
  }
  const riskLevelMatch =
    sideA.riskLevel != null && sideB.riskLevel != null ? sideA.riskLevel === sideB.riskLevel : null;

  const idsA = new Set((sideA.signals || []).filter((s) => s.triggered).map((s) => s.id));
  const idsB = new Set((sideB.signals || []).filter((s) => s.triggered).map((s) => s.id));
  const sharedTriggeredIds = [...idsA].filter((id) => idsB.has(id));
  const uniqueToA = [...idsA].filter((id) => !idsB.has(id));
  const uniqueToB = [...idsB].filter((id) => !idsA.has(id));

  return {
    scoreGap,
    riskLevelMatch,
    higherRisk,
    sharedTriggeredIds,
    uniqueToA,
    uniqueToB,
    mintAffinity: mintOverlap(sideA.mintAffinity, sideB.mintAffinity)
  };
}

function buildBrief(sideA, sideB, delta) {
  const parts = [];
  if (sideA.empty || sideB.empty) {
    if (sideA.empty && sideB.empty) parts.push('Both sides have no measured history.');
    else if (sideA.empty) parts.push('Side A has no measured history.');
    else parts.push('Side B has no measured history.');
  }
  if (delta.scoreGap != null) {
    if (delta.higherRisk === 'tie') {
      parts.push(`Both sides score ${sideA.score} (${sideA.riskLevel || 'n/a'}).`);
    } else {
      const hi = delta.higherRisk === 'a' ? 'A' : 'B';
      const lo = delta.higherRisk === 'a' ? 'B' : 'A';
      const hiSide = delta.higherRisk === 'a' ? sideA : sideB;
      const loSide = delta.higherRisk === 'a' ? sideB : sideA;
      parts.push(
        `Side ${hi} scores ${delta.scoreGap} point${delta.scoreGap === 1 ? '' : 's'} higher (${hiSide.riskLevel} vs ${loSide.riskLevel || 'n/a'} on side ${lo}).`
      );
    }
  }
  if (delta.riskLevelMatch === false) {
    parts.push('Risk levels do not match — review triggered patterns before you settle.');
  } else if (delta.riskLevelMatch === true) {
    parts.push(`Risk levels match (${sideA.riskLevel}).`);
  }
  if (delta.sharedTriggeredIds && delta.sharedTriggeredIds.length) {
    parts.push(`Shared triggered patterns: ${delta.sharedTriggeredIds.join(', ')}.`);
  }
  if (delta.mintAffinity && delta.mintAffinity.overlapHold && delta.mintAffinity.overlapHold.length) {
    parts.push(`Both hold seed RWA mints: ${delta.mintAffinity.overlapHold.join(', ')}.`);
  }
  if (!parts.length) parts.push('Both sides verified. Compare scores and expiry before you settle.');
  parts.push('Patterns, not verdicts — Guardian does not say safe or scam.');
  return parts.join(' ');
}

async function resolveSide(label, token, address) {
  if (token) {
    const v = verifyToken(token);
    if (!v.valid) {
      return {
        error: `Side ${label} passport is not valid`,
        reason: v.reason || 'invalid',
        expired: !!v.expired,
        claims: v.claims || null
      };
    }
    return { side: sideFromClaims(v.claims, v) };
  }
  if (address) {
    if (!B58.test(address)) {
      return { error: `Side ${label} address is not valid base58`, reason: 'bad_address' };
    }
    const grade = await gradeAddress(address, { withAffinity: true });
    return { side: sideFromGrade(grade) };
  }
  return { error: `Side ${label} missing — provide token${label} or address${label}`, reason: 'missing' };
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
  const hasTokens = !!(input.tokenA && input.tokenB);
  const hasAddresses = !!(input.addressA && input.addressB);
  if (!hasTokens && !hasAddresses) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide tokenA+tokenB (preferred) or addressA+addressB.',
      howTo: {
        tokens: 'GET /api/handshake?tokenA=<passport>&tokenB=<passport>',
        addresses: 'GET /api/handshake?addressA=<base58>&addressB=<base58>',
        post: 'POST /api/handshake with JSON body'
      },
      disclaimer: DISCLAIMER
    });
  }

  // ----- refusals stay free — verify tokens / addresses BEFORE settle -----
  let preA = null;
  let preB = null;
  if (hasTokens) {
    preA = resolveSide('A', input.tokenA, null);
    preB = resolveSide('B', input.tokenB, null);
    // token path is sync (verifyToken); normalize then/await
    preA = await Promise.resolve(preA);
    preB = await Promise.resolve(preB);
    if (preA.error || preB.error) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({
        ok: false,
        error: preA.error || preB.error,
        reason: (preA.reason || preB.reason) || null,
        sides: {
          a: preA.error ? { valid: false, reason: preA.reason, expired: preA.expired || false } : preA.side,
          b: preB.error ? { valid: false, reason: preB.reason, expired: preB.expired || false } : preB.side
        },
        disclaimer: DISCLAIMER
      });
    }
  } else {
    if (!B58.test(input.addressA) || !B58.test(input.addressB)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({
        ok: false,
        error: 'addressA and addressB must be valid Solana base58 addresses.',
        disclaimer: DISCLAIMER
      });
    }
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    let sideA;
    let sideB;
    if (hasTokens) {
      sideA = preA.side;
      sideB = preB.side;
    } else {
      const [ra, rb] = await Promise.all([
        resolveSide('A', null, input.addressA),
        resolveSide('B', null, input.addressB)
      ]);
      if (ra.error || rb.error) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          ok: false,
          error: ra.error || rb.error,
          disclaimer: DISCLAIMER
        });
      }
      sideA = ra.side;
      sideB = rb.side;
    }

    const delta = buildDelta(sideA, sideB);
    const brief = buildBrief(sideA, sideB, delta);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-handshake',
      version: 1,
      mode: hasTokens ? 'passport' : 'address',
      issuer: ISSUER,
      issuerPublicKey: issuerPublicKey(),
      sides: { a: sideA, b: sideB },
      delta,
      brief,
      verify: 'https://cyre.dev/api/passport/verify',
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('handshake', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not complete handshake right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

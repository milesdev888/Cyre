// api/policy-verify.js — FREE verify for spend-policy tokens
// Rewritten at /api/policy/verify

import { verifyToken, issuerPublicKey, ISSUER, ALG, POLICY_KIND } from './_attest.js';
import { recordVerifyHit } from './_traffic.js';

const DISCLAIMER = 'Patterns, not verdicts.';

function readBody(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch (e) {
      return { token: b.trim() };
    }
  }
  return b;
}

export default async function handler(req, res) {
  recordVerifyHit('/api/policy/verify', req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  let input = null;
  if (req.method === 'POST') {
    const body = readBody(req);
    input = body && (body.token || body.attestation || (body.claims && body));
  } else {
    input = String((req.query && req.query.token) || (req.headers['x-guardian-policy'] || '')).trim() || null;
  }

  const publicKey = issuerPublicKey();
  if (!input) {
    return res.status(200).json({
      ok: true,
      issuer: ISSUER,
      alg: ALG,
      kind: POLICY_KIND,
      publicKey,
      configured: !!publicKey,
      howTo: { online: 'GET /api/policy/verify?token=<policy token>' },
      disclaimer: DISCLAIMER
    });
  }

  const result = verifyToken(input, Date.now(), { kinds: [POLICY_KIND] });
  return res.status(200).json({
    ok: true,
    valid: result.valid,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.expired ? { expired: true } : {}),
    ...(typeof result.expiresInSeconds === 'number' ? { expiresInSeconds: result.expiresInSeconds } : {}),
    claims: result.claims || null,
    issuer: ISSUER,
    publicKey,
    disclaimer: DISCLAIMER
  });
}

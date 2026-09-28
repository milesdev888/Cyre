// api/passport-verify.js — verify a Guardian passport attestation. FREE, no gate, no chain reads.
// Served at /api/passport/verify (vercel.json rewrite) and /api/passport-verify.
//
//   GET  /api/passport/verify                → issuer public key + how to verify offline
//   GET  /api/passport/verify?token=<t>      → { ok, valid, reason?, claims, expiresInSeconds? }
//   POST /api/passport/verify  { token } | { attestation } | <attestation object>
//
// Verification is deliberately free: every agent that checks a Guardian stamp is a future buyer.

import { verifyToken, issuerPublicKey, ISSUER, ALG } from './_attest.js';
import { recordVerifyHit } from './_traffic.js';

const DISCLAIMER = 'Patterns, not verdicts.';

function readBody(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (e) { return { token: b.trim() }; }
  }
  return b;
}

export default async function handler(req, res) {
  recordVerifyHit('/api/passport/verify', req);
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
    input = String((req.query && req.query.token) || (req.headers['x-guardian-passport'] || '')).trim() || null;
  }

  const publicKey = issuerPublicKey();

  if (!input) {
    return res.status(200).json({
      ok: true,
      issuer: ISSUER,
      alg: ALG,
      publicKey,
      configured: !!publicKey,
      howTo: {
        online: 'GET /api/passport/verify?token=<token from /api/passport>',
        offline: 'token = base64url(claims).base64url(sig). Verify Ed25519 sig over canonical JSON of claims (keys sorted at every level) with publicKey; then check claims.expiresAt > now and claims.iss === "cyre.dev".'
      },
      disclaimer: DISCLAIMER
    });
  }

  const result = verifyToken(input);
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

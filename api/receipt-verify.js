// api/receipt-verify.js — verify a Guardian decision receipt. FREE.
// Served at /api/receipt/verify (vercel.json rewrite) and /api/receipt-verify.

import { verifyToken, issuerPublicKey, ISSUER, ALG, RECEIPT_KIND } from './_attest.js';
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
  recordVerifyHit('/api/receipt/verify', req);
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
    input = String((req.query && req.query.token) || (req.headers['x-guardian-receipt'] || '')).trim() || null;
  }

  const publicKey = issuerPublicKey();

  if (!input) {
    return res.status(200).json({
      ok: true,
      issuer: ISSUER,
      alg: ALG,
      kind: RECEIPT_KIND,
      publicKey,
      configured: !!publicKey,
      howTo: {
        online: 'GET /api/receipt/verify?token=<token from /api/receipt>',
        offline:
          'token = base64url(claims).base64url(sig). Verify Ed25519 over canonical JSON of claims (keys sorted) with publicKey; check expiresAt > now, iss === "cyre.dev", kind === "cyre-decision-receipt".'
      },
      disclaimer: DISCLAIMER
    });
  }

  const result = verifyToken(input, Date.now(), { kinds: [RECEIPT_KIND] });
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

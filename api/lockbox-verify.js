// api/lockbox-verify.js — FREE verify for intent lockbox (+ optional intent seals)
// Rewritten at /api/lockbox/verify

import { verifyToken, issuerPublicKey, ISSUER, ALG, LOCKBOX_KIND, INTENT_KIND } from './_attest.js';
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
  recordVerifyHit('/api/lockbox/verify', req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  let token = null;
  let intentHash = null;
  if (req.method === 'POST') {
    const body = readBody(req);
    token = body && (body.token || (body.attestation && body.attestation.token) || null);
    intentHash = body && body.intentHash ? String(body.intentHash) : null;
  } else {
    token = String((req.query && req.query.token) || (req.headers['x-guardian-lockbox'] || '')).trim() || null;
    intentHash = String((req.query && req.query.intentHash) || '').trim() || null;
  }

  const publicKey = issuerPublicKey();
  if (!token) {
    return res.status(200).json({
      ok: true,
      issuer: ISSUER,
      alg: ALG,
      kind: LOCKBOX_KIND,
      alsoAccepts: [INTENT_KIND],
      publicKey,
      configured: !!publicKey,
      howTo: { online: 'GET /api/lockbox/verify?token=<lockbox>&intentHash=<optional match>' },
      model: 'Bearer holds the seal — no central hash registry on ephemeral hosting.',
      disclaimer: DISCLAIMER
    });
  }

  const result = verifyToken(token, Date.now(), { kinds: [LOCKBOX_KIND, INTENT_KIND] });
  let hashMatch = null;
  if (intentHash && result.claims) {
    hashMatch = String(result.claims.intentHash) === String(intentHash);
  }

  return res.status(200).json({
    ok: true,
    valid: result.valid,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.expired ? { expired: true } : {}),
    ...(typeof result.expiresInSeconds === 'number' ? { expiresInSeconds: result.expiresInSeconds } : {}),
    hashMatch,
    claims: result.claims || null,
    issuer: ISSUER,
    publicKey,
    disclaimer: DISCLAIMER
  });
}

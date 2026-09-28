// api/circuit-verify.js — FREE verify Circuit Breaker tokens

import { verifyToken, issuerPublicKey, ISSUER, ALG, CIRCUIT_KIND } from './_attest.js';
import { heartbeatStale } from './_circuit.js';
import { recordVerifyHit } from './_traffic.js';

const DISCLAIMER = 'Patterns, not verdicts.';

export default async function handler(req, res) {
  recordVerifyHit('/api/circuit/verify', req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String((req.query && req.query.token) || '').trim() || null;
  const publicKey = issuerPublicKey();

  if (!token) {
    return res.status(200).json({
      ok: true,
      issuer: ISSUER,
      alg: ALG,
      kind: CIRCUIT_KIND,
      publicKey,
      howTo: { online: 'GET /api/circuit/verify?token=<circuit token>' },
      disclaimer: DISCLAIMER
    });
  }

  const result = verifyToken(token, Date.now(), { kinds: [CIRCUIT_KIND], allowExpired: true });
  const hb = result.claims ? heartbeatStale(result.claims) : null;

  return res.status(200).json({
    ok: true,
    valid: result.valid,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.expired ? { expired: true } : {}),
    heartbeat: hb,
    claims: result.claims || null,
    issuer: ISSUER,
    publicKey,
    disclaimer: DISCLAIMER
  });
}

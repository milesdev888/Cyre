// api/exchange-verify.js — FREE verify Intent Exchange tokens

import { verifyToken, issuerPublicKey, ISSUER, ALG, EXCHANGE_KIND } from './_attest.js';
import { summarizeIntent } from './_exchange.js';
import { recordVerifyHit } from './_traffic.js';

const DISCLAIMER = 'Patterns, not verdicts.';

export default async function handler(req, res) {
  recordVerifyHit('/api/exchange/verify', req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String((req.query && req.query.token) || '').trim() || null;
  const publicKey = issuerPublicKey();

  if (!token) {
    return res.status(200).json({
      ok: true,
      issuer: ISSUER,
      alg: ALG,
      kind: EXCHANGE_KIND,
      publicKey,
      howTo: { online: 'GET /api/exchange/verify?token=<intent token>' },
      disclaimer: DISCLAIMER
    });
  }

  const result = verifyToken(token, Date.now(), { kinds: [EXCHANGE_KIND], allowExpired: true });
  return res.status(200).json({
    ok: true,
    valid: result.valid,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.expired ? { expired: true } : {}),
    summary: result.claims ? summarizeIntent(result.claims) : null,
    claims: result.claims || null,
    issuer: ISSUER,
    publicKey,
    disclaimer: DISCLAIMER
  });
}

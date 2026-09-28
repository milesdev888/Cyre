// api/exchange-feed.js — Intent Exchange: aggregate gossiped intent tokens (free read).
// GET /api/exchange/feed?tokens=token1,token2

import { verifyToken, issuerPublicKey, ISSUER, EXCHANGE_KIND } from './_attest.js';
import { summarizeIntent } from './_exchange.js';
import { DISCLAIMER } from './_grade.js';
import { recordVerifyHit } from './_traffic.js';

const TOKEN_CAP = 20;

export default async function handler(req, res) {
  recordVerifyHit('/api/exchange/feed', req);
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Use GET', disclaimer: DISCLAIMER });
  }

  const raw = String((req.query && req.query.tokens) || '').trim();
  if (!raw) {
    return res.status(200).json({
      ok: true,
      kind: 'cyre-exchange-feed',
      version: 1,
      publicKey: issuerPublicKey(),
      issuer: ISSUER,
      howTo: {
        gossip: 'Agents pass intent tokens peer-to-peer after /api/exchange/post',
        aggregate: 'GET /api/exchange/feed?tokens=<token>,<token>'
      },
      listings: [],
      disclaimer: DISCLAIMER
    });
  }

  const tokens = [...new Set(raw.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean))].slice(0, TOKEN_CAP);
  const listings = [];

  for (const token of tokens) {
    const v = verifyToken(token, Date.now(), { kinds: [EXCHANGE_KIND], allowExpired: true });
    const summary = v.claims ? summarizeIntent(v.claims) : null;
    listings.push({
      valid: v.valid,
      expired: !!v.expired,
      reason: v.reason || null,
      summary,
      tokenPreview: token.slice(0, 24) + '…'
    });
  }

  const open = listings.filter((l) => l.summary && l.summary.status === 'open' && !l.summary.expired);

  return res.status(200).json({
    ok: true,
    kind: 'cyre-exchange-feed',
    version: 1,
    requested: tokens.length,
    openCount: open.length,
    listings,
    brief: open.length
      ? `${open.length} open intent(s) in this gossip batch.`
      : 'No open intents in this token batch — post via /api/exchange/post.',
    disclaimer: DISCLAIMER
  });
}

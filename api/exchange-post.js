// api/exchange-post.js — Intent Exchange: seal an open intent (gossip the token).
// GET/POST /api/exchange/post?actor=&need=&budgetAtomic=&network=&deadlineAt=&tags=

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestExchangeIntent, issuerPublicKey, EXCHANGE_KIND } from './_attest.js';
import { DISCLAIMER } from './_grade.js';

const DESCRIPTION =
  'Guardian Intent Exchange — seal a budgeted agent need into a signed intent token. Gossip the token; matchers call /api/exchange/match. Patterns, not verdicts.';

const SOL_EXAMPLE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: SOL_EXAMPLE,
          need: 'token scan + holder breakdown',
          budgetAtomic: '20000',
          network: 'eip155:8453',
          tags: 'scan,token'
        }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-exchange-post', token: '…', disclaimer: DISCLAIMER }
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
              properties: { need: { type: 'string' }, budgetAtomic: { type: 'string' } },
              required: ['need']
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
  price: String(process.env.X402_PRICE_EXCHANGE_POST || '3000'),
  resourcePath: '/api/exchange/post',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['exchange', 'marketplace', 'intent', 'agents', 'x402'],
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

function listField(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return String(raw).split(/[,\s]+/).filter(Boolean);
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    actor: String((body && body.actor) || q.actor || '').trim() || null,
    need: String((body && body.need) || q.need || '').trim() || null,
    budgetAtomic: String((body && body.budgetAtomic) != null ? body.budgetAtomic : q.budgetAtomic != null ? q.budgetAtomic : '').trim() || null,
    network: String((body && body.network) || q.network || 'eip155:8453').trim(),
    deadlineAt: String((body && body.deadlineAt) || q.deadlineAt || '').trim() || null,
    tags: listField((body && body.tags) || q.tags),
    note: String((body && body.note) || q.note || '').trim() || null
  };
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
  if (!input.need) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide `need` — what the agent wants fulfilled.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  const att = attestExchangeIntent(input);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-exchange-post',
    version: 1,
    attestation: att.attestation || null,
    token: att.token,
    unsigned: att.unsigned || null,
    publicKey: issuerPublicKey(),
    claimsKind: EXCHANGE_KIND,
    brief: 'Intent sealed — gossip this token to vendors or aggregate via /api/exchange/feed?tokens=…',
    next: ['POST /api/exchange/match with intent token + vendor quote', 'GET /api/exchange/feed?tokens=<token>'],
    disclaimer: DISCLAIMER
  });
}

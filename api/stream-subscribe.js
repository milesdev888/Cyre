// api/stream-subscribe.js — Pulse Stream: seal a push-shaped watch subscription (token-held state).
// GET/POST /api/stream/subscribe?actor=&list=&minRisk=&webhookUrl=

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestStreamSubscription, issuerPublicKey, STREAM_KIND } from './_attest.js';
import { B58, DISCLAIMER } from './_grade.js';
import { parseWatches } from './_streamlib.js';

const DESCRIPTION =
  'Guardian Pulse Stream — seal up to 10 counterparty watches into a signed subscription token. Pull events via /api/stream/events; fingerprints travel in the token (serverless-safe). Patterns, not verdicts.';

const SOL_EXAMPLE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: SOL_EXAMPLE,
          list: SOL_EXAMPLE,
          minRisk: 'HIGH'
        }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-stream-subscribe', token: '…', disclaimer: DISCLAIMER }
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
              properties: { list: { type: 'string' } },
              required: ['list']
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
  price: String(process.env.X402_PRICE_STREAM_SUBSCRIBE || '3000'),
  resourcePath: '/api/stream/subscribe',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['stream', 'push', 'watch', 'subscription', 'agents', 'sse'],
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
  const watches = parseWatches((body && body.watches) || (body && body.list) || q.list || q.watches);
  return {
    actor: String((body && body.actor) || q.actor || '').trim() || null,
    watches,
    minRisk: String((body && body.minRisk) || q.minRisk || 'HIGH').trim().toUpperCase(),
    webhookUrl: String((body && body.webhookUrl) || q.webhookUrl || '').trim() || null
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
  if (!input.watches.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `list` or `watches` — up to 10 Solana addresses.',
      disclaimer: DISCLAIMER
    });
  }
  for (const w of input.watches) {
    if (!B58.test(w.target)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, error: `Invalid Solana watch target: ${w.target}`, disclaimer: DISCLAIMER });
    }
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  const att = attestStreamSubscription({
    actor: input.actor,
    watches: input.watches,
    minRisk: input.minRisk,
    webhookUrl: input.webhookUrl,
    fingerprints: {},
    seq: 0
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-stream-subscribe',
    version: 1,
    attestation: att.attestation || null,
    token: att.token,
    unsigned: att.unsigned || null,
    publicKey: issuerPublicKey(),
    claimsKind: STREAM_KIND,
    watchCount: input.watches.length,
    brief: 'Subscription sealed. Poll /api/stream/events with this token; store the rotated token each pull.',
    next: ['GET /api/stream/events?token=<subscription>', 'Optional Accept: text/event-stream for SSE chunk'],
    disclaimer: DISCLAIMER
  });
}

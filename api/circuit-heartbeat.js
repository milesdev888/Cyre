// api/circuit-heartbeat.js — Agent Circuit Breaker: refresh heartbeat (cheap).
// GET/POST /api/circuit/heartbeat?token=

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestCircuit, verifyToken, CIRCUIT_KIND } from './_attest.js';
import { DISCLAIMER } from './_grade.js';
import { heartbeatStale } from './_circuit.js';

const DESCRIPTION =
  'Guardian Circuit Breaker heartbeat — prove the agent loop is alive; returns rotated circuit token with fresh lastBeatAt. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { token: '<circuit-token>' }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-circuit-heartbeat', token: '…', disclaimer: DISCLAIMER }
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
              properties: { token: { type: 'string' } },
              required: ['token']
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
  price: String(process.env.X402_PRICE_CIRCUIT_HEARTBEAT || '1000'),
  resourcePath: '/api/circuit/heartbeat',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['circuit', 'heartbeat', 'operator', 'agents'],
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
      return { token: b.trim() };
    }
  }
  return b;
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

  const body = req.method === 'POST' ? readBody(req) : null;
  const token = String((body && body.token) || (req.query && req.query.token) || '').trim();
  if (!token) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide circuit `token` from /api/circuit/seal.', disclaimer: DISCLAIMER });
  }

  const verified = verifyToken(token, Date.now(), { kinds: [CIRCUIT_KIND] });
  if (!verified.valid || !verified.claims) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: verified.reason || 'invalid circuit token', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  const claims = verified.claims;
  const now = Date.now();
  const hb = heartbeatStale(claims, now);
  const frozen = claims.frozen || hb.stale;
  const nowIso = new Date(now).toISOString();

  const att = attestCircuit({
    actor: claims.actor,
    heartbeatIntervalSeconds: claims.heartbeatIntervalSeconds,
    maxMissedBeats: claims.maxMissedBeats,
    lastBeatAt: frozen ? claims.lastBeatAt : nowIso,
    frozen,
    frozenAt: frozen ? claims.frozenAt || nowIso : null,
    policyToken: claims.policyToken,
    maxSpendAtomic: claims.maxSpendAtomic,
    allowHosts: claims.allowHosts,
    denyHosts: claims.denyHosts,
    maxRisk: claims.maxRisk,
    networks: claims.networks,
    note: claims.note
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: !frozen,
    kind: 'cyre-circuit-heartbeat',
    version: 1,
    frozen,
    heartbeat: hb,
    token: att.token,
    attestation: att.attestation || null,
    brief: frozen
      ? 'Circuit frozen — missed heartbeat window or already frozen. Operator must re-seal.'
      : 'Heartbeat accepted — store rotated token.',
    disclaimer: DISCLAIMER
  });
}

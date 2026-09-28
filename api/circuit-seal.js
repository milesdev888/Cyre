// api/circuit-seal.js — Agent Circuit Breaker: seal heartbeat + spend constitution.
// GET/POST /api/circuit/seal?actor=&heartbeatIntervalSeconds=&maxMissedBeats=&maxSpendAtomic=&allowHosts=&policyToken=

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestCircuit, issuerPublicKey, CIRCUIT_KIND } from './_attest.js';
import { DISCLAIMER } from './_grade.js';

const DESCRIPTION =
  'Guardian Circuit Breaker — seal operator heartbeat interval + spend rails for an autonomous agent. Heartbeat via /api/circuit/heartbeat; enforce before pay via /api/circuit/check. Patterns, not verdicts.';

const SOL_EXAMPLE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: SOL_EXAMPLE,
          heartbeatIntervalSeconds: '300',
          maxMissedBeats: '2',
          maxSpendAtomic: '100000',
          allowHosts: 'cyre.dev'
        }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-circuit-seal', token: '…', disclaimer: DISCLAIMER }
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
              properties: { actor: { type: 'string' }, maxSpendAtomic: { type: 'string' } },
              required: ['actor']
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
  price: String(process.env.X402_PRICE_CIRCUIT_SEAL || '3000'),
  resourcePath: '/api/circuit/seal',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['circuit', 'heartbeat', 'freeze', 'operator', 'agents', 'policy'],
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
    heartbeatIntervalSeconds: (body && body.heartbeatIntervalSeconds) != null ? body.heartbeatIntervalSeconds : q.heartbeatIntervalSeconds,
    maxMissedBeats: (body && body.maxMissedBeats) != null ? body.maxMissedBeats : q.maxMissedBeats,
    policyToken: String((body && body.policyToken) || q.policyToken || '').trim() || null,
    maxSpendAtomic: String((body && body.maxSpendAtomic) != null ? body.maxSpendAtomic : q.maxSpendAtomic != null ? q.maxSpendAtomic : '').trim() || null,
    allowHosts: listField((body && body.allowHosts) || q.allowHosts),
    denyHosts: listField((body && body.denyHosts) || q.denyHosts),
    maxRisk: String((body && body.maxRisk) || q.maxRisk || '').trim() || null,
    networks: listField((body && body.networks) || q.networks),
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
  if (!input.actor) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide `actor` — the agent or operator id.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  const now = new Date().toISOString();
  const att = attestCircuit({
    ...input,
    lastBeatAt: now,
    frozen: false
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-circuit-seal',
    version: 1,
    attestation: att.attestation || null,
    token: att.token,
    unsigned: att.unsigned || null,
    publicKey: issuerPublicKey(),
    claimsKind: CIRCUIT_KIND,
    brief: 'Circuit sealed — agent must heartbeat before spend checks pass.',
    next: [
      'POST /api/circuit/heartbeat with circuit token on a cron',
      'Before pay: /api/circuit/check with token + proposal'
    ],
    disclaimer: DISCLAIMER
  });
}

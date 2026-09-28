// api/policy.js — Spend Policy compiler + x402
// Seal an agent spending constitution (max spend, hosts, networks, risk).
// Check free-ish via /api/policy/verify; enforce via /api/policy/check (paid light) or Ticket/Pack.
//
// POST/GET /api/policy?actor=&maxSpendAtomic=&allowHosts=&denyHosts=&requireTicket=&denyFreshEoa=&maxRisk=&networks=
// Env: PASSPORT_SIGNING_KEY, POLICY_TTL_SECONDS, X402_PRICE_POLICY (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attestPolicy, issuerPublicKey, POLICY_KIND } from './_attest.js';
import { B58, DISCLAIMER } from './_grade.js';

const EVM = /^0x[a-fA-F0-9]{40}$/;
const DESCRIPTION =
  'Guardian Spend Policy — seal max spend, allow/deny hosts, networks, and risk ceiling into a signed policy token other agent middleware can enforce. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          actor: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          maxSpendAtomic: '100000',
          allowHosts: 'cyre.dev,example.com',
          requireTicket: 'true',
          maxRisk: 'MEDIUM'
        }
      },
      output: {
        type: 'json',
        example: { ok: true, kind: 'cyre-policy', attestation: { claims: { kind: POLICY_KIND }, token: '…' }, disclaimer: DISCLAIMER }
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
  price: String(process.env.X402_PRICE_POLICY || '2000'),
  resourcePath: '/api/policy',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['policy', 'spend', 'middleware', 'agents', 'constitution', 'x402'],
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
  const flag = (v) => {
    const s = String(v == null ? '' : v).toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  };
  return {
    actor: String((body && body.actor) || q.actor || '').trim() || null,
    maxSpendAtomic: String((body && body.maxSpendAtomic) != null ? body.maxSpendAtomic : q.maxSpendAtomic != null ? q.maxSpendAtomic : '').trim() || null,
    allowHosts: listField((body && body.allowHosts) || q.allowHosts),
    denyHosts: listField((body && body.denyHosts) || q.denyHosts),
    networks: listField((body && body.networks) || q.networks),
    requireTicket: flag((body && body.requireTicket) != null ? body.requireTicket : q.requireTicket),
    denyFreshEoa: flag((body && body.denyFreshEoa) != null ? body.denyFreshEoa : q.denyFreshEoa),
    maxRisk: String((body && body.maxRisk) || q.maxRisk || '').trim().toUpperCase() || null,
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
  if (!input.actor || !(EVM.test(input.actor) || B58.test(input.actor))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `actor` (0x or Solana base58). Optional: maxSpendAtomic, allowHosts, denyHosts, networks, requireTicket, denyFreshEoa, maxRisk.',
      disclaimer: DISCLAIMER
    });
  }
  if (input.maxRisk && !['LOW', 'MEDIUM', 'HIGH'].includes(input.maxRisk)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'maxRisk must be LOW|MEDIUM|HIGH', disclaimer: DISCLAIMER });
  }
  if (input.maxSpendAtomic) {
    try {
      if (BigInt(input.maxSpendAtomic) < 0n) throw new Error('neg');
    } catch (e) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, error: 'maxSpendAtomic must be a non-negative integer string', disclaimer: DISCLAIMER });
    }
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const sealed = attestPolicy(input);
  res.setHeader('Cache-Control', 'no-store');
  if (sealed.token) res.setHeader('X-Guardian-Policy', sealed.token);
  return res.status(200).json({
    ok: true,
    kind: 'cyre-policy',
    version: 1,
    attestation: sealed.attestation,
    token: sealed.token,
    unsigned: sealed.unsigned || null,
    verify: 'https://cyre.dev/api/policy/verify',
    check: 'https://cyre.dev/api/policy/check',
    publicKey: issuerPublicKey(),
    brief: sealed.token
      ? 'Spend policy sealed. Pass the token to /api/policy/check or /api/pack before pays.'
      : 'Signing key not configured — policy returned unsigned. Set PASSPORT_SIGNING_KEY.',
    disclaimer: DISCLAIMER
  });
}

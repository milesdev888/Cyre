// api/lookalike.js — Lookalike address check + x402
// Before send/sign: compare `to` / candidate against known contacts for
// truncation traps, near-edits, and confusable characters. Patterns, not verdicts.
//
// GET/POST /api/lookalike?candidate=&contacts=a,b,c  (or `to` + `contacts`)
// Env: X402_PRICE_LOOKALIKE (default 2000 = $0.002)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { DISCLAIMER, riskLevelFromScore, signal } from './_grade.js';
import { detectFamily, scanLookalikes } from './_lookalike.js';

const DESCRIPTION =
  'Guardian Lookalike — before your agent sends funds, check whether the destination looks like one of your known contacts (prefix/suffix traps, near-edits, confusable chars). Patterns, not verdicts.';

const EXAMPLE_TO = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EXAMPLE_CONTACT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWW';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          candidate: EXAMPLE_TO,
          contacts: EXAMPLE_CONTACT + ',5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-lookalike',
          version: 1,
          score: 36,
          riskLevel: 'MEDIUM',
          hitCount: 1,
          brief: 'Destination shares a near-edit with a listed contact. Confirm the full address.',
          disclaimer: DISCLAIMER
        }
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
              properties: {
                candidate: { type: 'string', description: 'Destination / to address' },
                to: { type: 'string', description: 'Alias for candidate' },
                contacts: { type: 'string', description: 'Comma-separated known addresses (≤20)' }
              },
              required: ['candidate']
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
  price: String(process.env.X402_PRICE_LOOKALIKE || '2000'),
  resourcePath: '/api/lookalike',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['lookalike', 'address', 'before-send', 'homoglyph', 'truncation', 'agents', 'risk', 'solana', 'evm'],
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
  const candidate = String((body && (body.candidate || body.to)) || q.candidate || q.to || '').trim() || null;
  const raw = (body && body.contacts) || q.contacts || '';
  let contacts = [];
  if (Array.isArray(raw)) contacts = raw;
  else if (raw) contacts = String(raw).split(/[,\s]+/).filter(Boolean);
  return { candidate, contacts };
}

function buildBrief(scan, family) {
  if (!scan.contactCount) return 'No contacts provided — pass known addresses to compare.';
  const top = scan.hits[0];
  if (top && top.exact) return 'Candidate exactly matches a listed contact.';
  if (top && top.triggered) return `${top.detail} Patterns, not verdicts.`;
  return `No close lookalike among ${scan.contactCount} contact(s) (${family || 'unknown'} family). Still verify the full address.`;
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
  if (!input.candidate) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `candidate` (or `to`) and `contacts` (comma-separated, ≤20).',
      howTo: { get: 'GET /api/lookalike?candidate=<addr>&contacts=<addr1,addr2>' },
      disclaimer: DISCLAIMER
    });
  }

  const family = detectFamily(input.candidate);
  if (!family) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'candidate must be a Base/EVM 0x address or Solana base58 address.',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const scan = scanLookalikes(input.candidate, input.contacts, 20);
  const signals = [];
  if (!scan.contactCount) {
    signals.push(signal('no_contacts', 'Contacts', 0, false, 'No contacts to compare — lookalike check is empty'));
  }
  for (const h of scan.hits.slice(0, 5)) {
    if (h.exact) {
      signals.push(signal('exact_contact', 'Exact match', 0, false, `Exact match: ${h.contact.slice(0, 8)}…`));
    } else if (h.triggered) {
      signals.push(
        signal(
          h.flags[0] || 'lookalike',
          'Lookalike',
          h.points,
          true,
          h.detail
        )
      );
    }
  }
  if (scan.contactCount && !scan.hits.some((h) => h.triggered)) {
    signals.push(signal('clean', 'Lookalike', 0, false, 'No triggered lookalike flags among contacts'));
  }

  const score = scan.score;
  const riskLevel = riskLevelFromScore(score);
  const brief = buildBrief(scan, family);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-lookalike',
    version: 1,
    candidate: input.candidate,
    family,
    contactCount: scan.contactCount,
    hitCount: scan.hits.filter((h) => h.triggered).length,
    exactMatch: scan.hits.some((h) => h.exact),
    hits: scan.hits.slice(0, 8),
    score,
    riskLevel,
    signals,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signalsEvaluated: signals.length,
    brief,
    next: [
      'If hitCount > 0 — show the full address to a human or require explicit confirm',
      'Before sign on Solana: /api/preflight',
      'Before external x402 pay: /api/route or /api/gate'
    ],
    disclaimer: DISCLAIMER
  });
}

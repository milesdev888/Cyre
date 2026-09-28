// api/program.js — Guardian Program Brief + x402 gate
// Novelty / age patterns for a Solana program id, optional wallet context.
//
// GET  /api/program?programId=<base58>&address=<optional wallet>
// POST /api/program { programId, address? }
//
// Env: SOLANA_RPC, X402_* ; X402_PRICE_PROGRAM (default 10000 = $0.01)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress, programNovelty } from './_grade.js';

const DESCRIPTION =
  'Guardian Program Brief — novelty and age patterns for a Solana program id, with optional wallet context before first touch. Patterns, not verdicts.';

const EXAMPLE_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const EXAMPLE_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { programId: EXAMPLE_PROGRAM, address: EXAMPLE_WALLET }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-program',
          program: { programId: EXAMPLE_PROGRAM, known: true },
          brief: 'Well-known Solana program.',
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
                programId: { type: 'string' },
                address: { type: 'string', description: 'Optional wallet for age/context comparison' }
              },
              required: ['programId']
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
  price: String(process.env.X402_PRICE_PROGRAM || '10000'),
  resourcePath: '/api/program',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'solana', 'program', 'novelty', 'agents', 'preflight'],
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
  return {
    programId: String((body && body.programId) || q.programId || '').trim() || null,
    address: String((body && body.address) || q.address || '').trim() || null
  };
}

function buildBrief(program, wallet) {
  const parts = [];
  if (program.known) parts.push('Well-known Solana program.');
  else if (program.ageDays != null && program.ageDays < 7) {
    parts.push(`Program shows young activity (~${program.ageDays}d in measured window).`);
  } else if (!program.exists) {
    parts.push('No account found at this program id.');
  } else {
    parts.push('Program is not in Guardian\'s well-known set — review novelty signals.');
  }
  if (wallet && typeof wallet.profile?.ageDays === 'number' && typeof program.ageDays === 'number') {
    if (wallet.profile.ageDays < 7 && program.ageDays < 7) {
      parts.push('Both wallet and program look young in their measured windows.');
    } else if (wallet.profile.ageDays >= 30 && program.ageDays < 7) {
      parts.push('Established wallet touching a young program — first-touch caution pattern.');
    }
  }
  parts.push('Patterns, not verdicts — this is not an allowlist approval.');
  return parts.join(' ');
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
  if (!input.programId || !B58.test(input.programId)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide a valid Solana `programId`.', disclaimer: DISCLAIMER });
  }
  if (input.address && !B58.test(input.address)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`address` is not valid base58.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const program = await programNovelty(input.programId);
    let wallet = null;
    if (input.address) wallet = await gradeAddress(input.address, { withAffinity: false });

    const signals = [...(program.signals || []).map((s) => ({ ...s, scope: 'program' }))];
    if (wallet && wallet.signals) {
      for (const s of wallet.signals) {
        if (s.triggered) signals.push({ ...s, scope: 'wallet' });
      }
    }

    const brief = buildBrief(program, wallet);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-program',
      version: 1,
      program,
      wallet,
      signals,
      signalsTriggered: signals.filter((s) => s.triggered).length,
      brief,
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('program', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not read program data right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

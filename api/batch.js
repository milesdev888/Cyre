// api/batch.js — Guardian Settlement Batch Screen + x402 gate
// Grade a payer + up to 10 payout addresses; rank by score gap vs payer.
//
// GET  /api/batch?from=<payer>&list=<addr1,addr2,…>
// POST /api/batch { from, list: string[] | "a,b" }
//
// Env: SOLANA_RPC, X402_* ; X402_PRICE_BATCH (default 20000 = $0.02)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress } from './_grade.js';

const LIST_CAP = 10;
const DESCRIPTION =
  'Guardian Settlement Batch — grade a payer and up to 10 payout addresses, ranked by score gap vs the payer. Patterns, not verdicts.';

const EXAMPLE_FROM = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EXAMPLE_TO = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { from: EXAMPLE_FROM, list: EXAMPLE_TO }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-batch',
          from: { address: EXAMPLE_FROM, score: 12, riskLevel: 'LOW' },
          recipients: [{ address: EXAMPLE_TO, score: 44, riskLevel: 'MEDIUM', scoreGap: 32 }],
          brief: '1 of 1 recipients score higher than the payer.',
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
                from: { type: 'string' },
                list: { type: 'string', description: 'Comma-separated payout addresses (max 10)' }
              },
              required: ['from', 'list']
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
  price: String(process.env.X402_PRICE_BATCH || '20000'),
  resourcePath: '/api/batch',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'solana', 'settlement', 'batch', 'agents', 'counterparty'],
  discovery: DISCOVERY,
  isFree: isCyreSiteRequest
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function parseList(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw) arr = String(raw).split(/[,\s]+/);
  const out = [];
  const seen = new Set();
  for (const a of arr) {
    const s = String(a || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.slice(0, LIST_CAP);
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    from: String((body && body.from) || q.from || '').trim() || null,
    list: parseList((body && body.list) || q.list)
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
  if (!input.from || !B58.test(input.from)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Provide valid `from` (payer) address.', disclaimer: DISCLAIMER });
  }
  if (!input.list.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `list` of payout addresses (comma-separated or JSON array, max 10).',
      listCap: LIST_CAP,
      disclaimer: DISCLAIMER
    });
  }
  const bad = input.list.filter((a) => !B58.test(a));
  if (bad.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'One or more list addresses are not valid base58.', bad, disclaimer: DISCLAIMER });
  }
  if (input.list.includes(input.from)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`from` must not appear in `list`.', disclaimer: DISCLAIMER });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const fromGrade = await gradeAddress(input.from, { withAffinity: false });
    const recipients = [];
    for (let i = 0; i < input.list.length; i++) {
      if (i > 0) await sleep(350);
      const addr = input.list[i];
      try {
        const g = await gradeAddress(addr, { withAffinity: false });
        const scoreGap =
          typeof fromGrade.score === 'number' && typeof g.score === 'number' ? g.score - fromGrade.score : null;
        recipients.push({
          address: addr,
          empty: !!g.empty,
          score: g.score,
          riskLevel: g.riskLevel,
          signalsTriggered: g.signalsTriggered,
          signalsEvaluated: g.signalsEvaluated,
          scoreGap,
          higherThanPayer: scoreGap != null ? scoreGap > 0 : null,
          profile: g.profile || null
        });
      } catch (e) {
        recipients.push({ address: addr, ok: false, error: 'Could not read chain data for this address.' });
      }
    }

    recipients.sort((a, b) => {
      const ga = typeof a.scoreGap === 'number' ? a.scoreGap : -999;
      const gb = typeof b.scoreGap === 'number' ? b.scoreGap : -999;
      return gb - ga;
    });

    const measured = recipients.filter((r) => typeof r.score === 'number');
    const higher = measured.filter((r) => r.higherThanPayer).length;
    const highRisk = measured.filter((r) => r.riskLevel === 'HIGH').length;
    const brief = [
      `${higher} of ${measured.length} recipients score higher than the payer.`,
      highRisk ? `${highRisk} graded HIGH.` : null,
      'Patterns, not verdicts — Guardian does not block payouts.'
    ]
      .filter(Boolean)
      .join(' ');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-batch',
      version: 1,
      listCap: LIST_CAP,
      from: {
        address: fromGrade.address,
        empty: !!fromGrade.empty,
        score: fromGrade.score,
        riskLevel: fromGrade.riskLevel,
        signalsTriggered: fromGrade.signalsTriggered,
        profile: fromGrade.profile || null
      },
      recipients,
      counters: {
        requested: input.list.length,
        measured: measured.length,
        higherThanPayer: higher,
        highRisk
      },
      brief,
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('batch', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not complete batch screen right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

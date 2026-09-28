// api/preflight.js — Guardian Intent Preflight (Solana) + x402 gate
// Before an agent signs: grade from / to / mint / programIds as explainable patterns.
// Does NOT simulate execution and never says safe/scam.
//
// GET  /api/preflight?from=&to=&mint=&programIds=comma,separated
// POST /api/preflight  { from, to?, mint?, programIds?: string[] }
//
// Env: SOLANA_RPC, X402_* (see ./_x402.js)
//      X402_PRICE_PREFLIGHT — atomic USDC (default 10000 = $0.01)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import {
  B58,
  DISCLAIMER,
  gradeAddress,
  mintAuthorityFacts,
  programNovelty,
  riskLevelFromScore,
  signal
} from './_grade.js';

const DESCRIPTION =
  'Guardian Intent Preflight — before you sign a Solana tx, grade the from/to wallets, mint authorities, and program novelty. Explainable patterns, not verdicts.';

const EXAMPLE_FROM = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const EXAMPLE_TO = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';
const EXAMPLE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          from: EXAMPLE_FROM,
          to: EXAMPLE_TO,
          mint: EXAMPLE_MINT,
          programIds: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-preflight',
          version: 1,
          actors: {
            from: { address: EXAMPLE_FROM, score: 12, riskLevel: 'LOW' },
            to: { address: EXAMPLE_TO, score: 44, riskLevel: 'MEDIUM' }
          },
          mint: { mint: EXAMPLE_MINT, mintAuthorityRevoked: true, freezeAuthorityRevoked: true },
          score: 44,
          riskLevel: 'MEDIUM',
          brief: 'Destination scores higher than source. Review destination patterns before you sign.',
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
                from: { type: 'string', description: 'Solana fee-payer / source wallet (base58)' },
                to: { type: 'string', description: 'Optional counterparty / destination wallet' },
                mint: { type: 'string', description: 'Optional token mint touched by the intent' },
                programIds: { type: 'string', description: 'Optional comma-separated program ids' }
              },
              required: ['from']
            }
          },
          required: ['type', 'method'],
          additionalProperties: false
        },
        output: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            example: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                kind: { type: 'string' },
                score: { type: 'number' },
                riskLevel: { type: 'string' },
                signals: { type: 'array' },
                brief: { type: 'string' }
              }
            }
          },
          required: ['type']
        }
      },
      required: ['input']
    }
  }
};

const x402Gate = createX402Gate({
  price: String(process.env.X402_PRICE_PREFLIGHT || '10000'),
  resourcePath: '/api/preflight',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'fraud', 'solana', 'preflight', 'agents', 'transaction', 'security'],
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

function parseProgramIds(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || '').trim()).filter((x) => B58.test(x)))].slice(0, 8);
  }
  const s = String(raw || '').trim();
  if (!s) return [];
  return [...new Set(s.split(/[,+\s]+/).map((x) => x.trim()).filter((x) => B58.test(x)))].slice(0, 8);
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    from: String((body && body.from) || q.from || '').trim() || null,
    to: String((body && body.to) || q.to || '').trim() || null,
    mint: String((body && body.mint) || q.mint || '').trim() || null,
    programIds: parseProgramIds((body && body.programIds) || q.programIds)
  };
}

function lookalikePattern(a, b) {
  if (!a || !b || a === b) return null;
  if (a.length < 8 || b.length < 8) return null;
  const samePrefix = a.slice(0, 4) === b.slice(0, 4);
  const sameSuffix = a.slice(-4) === b.slice(-4);
  if (samePrefix && sameSuffix) {
    return signal(
      'lookalike',
      'Address lookalike',
      22,
      true,
      'from and to share the same 4-char prefix and suffix — common address-poisoning shape'
    );
  }
  if (sameSuffix) {
    return signal(
      'lookalike',
      'Address lookalike',
      12,
      true,
      'from and to share the same 4-char suffix — review the full destination'
    );
  }
  return signal('lookalike', 'Address lookalike', 0, false, 'from/to do not share a short prefix+suffix lookalike shape');
}

function buildBrief(bundle) {
  const parts = [];
  const { fromGrade, toGrade, mintFacts, programs, lookalike, score, riskLevel } = bundle;
  if (toGrade && typeof toGrade.score === 'number' && typeof fromGrade.score === 'number') {
    if (toGrade.score > fromGrade.score) {
      parts.push(
        `Destination scores higher than source (${toGrade.score} ${toGrade.riskLevel} vs ${fromGrade.score} ${fromGrade.riskLevel}). Review destination patterns before you sign.`
      );
    } else if (toGrade.empty) {
      parts.push('Destination has no measured history.');
    }
  } else if (toGrade && toGrade.empty) {
    parts.push('Destination has no measured history.');
  }
  if (lookalike && lookalike.triggered) parts.push(lookalike.detail);
  if (mintFacts && mintFacts.mintAuthority) {
    parts.push('Mint authority is still active on the touched mint.');
  }
  if (mintFacts && mintFacts.freezeAuthority) {
    parts.push('Freeze authority is still active on the touched mint.');
  }
  const novel = (programs || []).filter((p) => !p.known && p.signals && p.signals.some((s) => s.triggered));
  if (novel.length) {
    parts.push(`${novel.length} program id${novel.length === 1 ? '' : 's'} show novelty or missing-account patterns.`);
  }
  if (!parts.length) {
    parts.push(`Measured intent risk level ${riskLevel || 'n/a'} (score ${score == null ? 'n/a' : score}).`);
  }
  parts.push('Patterns, not verdicts — Guardian does not approve or block the transaction.');
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
  if (!input.from || !B58.test(input.from)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide a valid Solana `from` address (base58). Optional: to, mint, programIds.',
      howTo: {
        get: 'GET /api/preflight?from=<base58>&to=<base58>&mint=<base58>&programIds=<id1,id2>',
        post: 'POST /api/preflight { "from", "to?", "mint?", "programIds?" }'
      },
      disclaimer: DISCLAIMER
    });
  }
  if (input.to && !B58.test(input.to)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`to` is not a valid Solana address.', disclaimer: DISCLAIMER });
  }
  if (input.mint && !B58.test(input.mint)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`mint` is not a valid Solana address.', disclaimer: DISCLAIMER });
  }
  if (input.to && input.to === input.from) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: '`from` and `to` are the same address — nothing to preflight.',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const jobs = [gradeAddress(input.from, { withAffinity: false })];
    if (input.to) jobs.push(gradeAddress(input.to, { withAffinity: false }));
    else jobs.push(Promise.resolve(null));
    if (input.mint) jobs.push(mintAuthorityFacts(input.mint));
    else jobs.push(Promise.resolve(null));
    if (input.programIds.length) {
      jobs.push(Promise.all(input.programIds.map((id) => programNovelty(id))));
    } else {
      jobs.push(Promise.resolve([]));
    }

    const [fromGrade, toGrade, mintFacts, programs] = await Promise.all(jobs);
    const lookalike = input.to ? lookalikePattern(input.from, input.to) : null;

    const signals = [];
    if (fromGrade && !fromGrade.empty) {
      for (const s of fromGrade.signals || []) {
        if (s.triggered) signals.push({ ...s, scope: 'from' });
      }
    } else if (fromGrade && fromGrade.empty) {
      signals.push(signal('from_empty', 'Source history', 8, true, 'Source wallet has no measured history'));
    }
    if (toGrade && !toGrade.empty) {
      for (const s of toGrade.signals || []) {
        if (s.triggered) signals.push({ ...s, scope: 'to' });
      }
    } else if (toGrade && toGrade.empty) {
      signals.push(signal('to_empty', 'Destination history', 14, true, 'Destination wallet has no measured history'));
    }
    if (lookalike) signals.push({ ...lookalike, scope: 'pair' });
    if (mintFacts && mintFacts.signals) {
      for (const s of mintFacts.signals) {
        if (s.triggered) signals.push({ ...s, scope: 'mint' });
      }
    }
    for (const p of programs || []) {
      for (const s of p.signals || []) {
        if (s.triggered) signals.push({ ...s, scope: 'program', programId: p.programId });
      }
    }

    // Aggregate: max of actor scores + mint/program triggered points (capped).
    const actorScores = [fromGrade && fromGrade.score, toGrade && toGrade.score].filter((n) => typeof n === 'number');
    const base = actorScores.length ? Math.max(...actorScores) : 0;
    const extra = signals
      .filter((s) => s.scope === 'mint' || s.scope === 'program' || s.scope === 'pair' || s.id === 'to_empty' || s.id === 'from_empty')
      .reduce((sum, s) => sum + (s.points || 0), 0);
    const score = Math.min(100, base + Math.min(extra, 40));
    const riskLevel = riskLevelFromScore(score);

    const brief = buildBrief({ fromGrade, toGrade, mintFacts, programs, lookalike, score, riskLevel });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-preflight',
      version: 1,
      intent: {
        from: input.from,
        to: input.to || null,
        mint: input.mint || null,
        programIds: input.programIds
      },
      actors: {
        from: fromGrade,
        to: toGrade
      },
      mint: mintFacts,
      programs,
      score,
      riskLevel,
      signals,
      signalsTriggered: signals.filter((s) => s.triggered).length,
      signalsEvaluated: signals.length,
      brief,
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('preflight', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not read chain data right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

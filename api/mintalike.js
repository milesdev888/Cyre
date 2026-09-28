// api/mintalike.js — Mint / ticker lookalike + x402
// Compare a candidate mint or symbol against known mints/tickers.
//
// GET/POST /api/mintalike?candidate=&symbol=&contacts=&symbols=
// Env: X402_PRICE_MINTALIKE (default 2000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { scanLookalikes, detectFamily, levenshtein } from './_lookalike.js';
import { DISCLAIMER, riskLevelFromScore, signal } from './_grade.js';

const DESCRIPTION =
  'Guardian Mintalike — before you swap, check whether a mint address or ticker looks like one of your known tokens (near-edit / truncation / symbol clash). Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          candidate: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          symbol: 'USDC',
          symbols: 'USDC,USDT,SOL'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-mintalike', score: 0, disclaimer: DISCLAIMER } }
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
              properties: { candidate: { type: 'string' }, symbol: { type: 'string' }, contacts: { type: 'string' } }
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
  price: String(process.env.X402_PRICE_MINTALIKE || '2000'),
  resourcePath: '/api/mintalike',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['mint', 'ticker', 'lookalike', 'token', 'swap', 'agents'],
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

function symbolHits(symbol, symbols) {
  const s = String(symbol || '').trim().toUpperCase();
  const list = [...new Set(symbols.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  if (!s) return { hits: [], score: 0 };
  const hits = [];
  for (const t of list) {
    if (s === t) {
      hits.push({ symbol: t, flags: ['exact_symbol'], points: 0, triggered: false, detail: 'Exact ticker match to a known symbol.' });
      continue;
    }
    const d = levenshtein(s, t);
    const flags = [];
    let points = 0;
    if (d === 1 && s.length === t.length) {
      flags.push('near_ticker');
      points = 34;
    } else if (d <= 2 && Math.abs(s.length - t.length) <= 1) {
      flags.push('similar_ticker');
      points = 22;
    } else if (s.length >= 3 && t.length >= 3 && (s.startsWith(t) || t.startsWith(s))) {
      flags.push('prefix_ticker');
      points = 16;
    }
    if (flags.length) {
      hits.push({
        symbol: t,
        distance: d,
        flags,
        points,
        triggered: true,
        detail: `Ticker ${s} looks like known ${t} (${flags.join(',')}).`
      });
    }
  }
  hits.sort((a, b) => b.points - a.points);
  const score = Math.min(100, hits.reduce((m, h) => Math.max(m, h.points), 0));
  return { hits, score };
}

function pickInput(req) {
  const body = req.method === 'POST' ? readBody(req) : null;
  const q = req.query || {};
  return {
    candidate: String((body && (body.candidate || body.mint)) || q.candidate || q.mint || '').trim() || null,
    symbol: String((body && body.symbol) || q.symbol || '').trim() || null,
    contacts: listField((body && body.contacts) || q.contacts),
    symbols: listField((body && body.symbols) || q.symbols)
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
  if (!input.candidate && !input.symbol) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `candidate` mint and/or `symbol`, plus `contacts` and/or `symbols` to compare.',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  const signals = [];
  let mintScan = null;
  if (input.candidate) {
    if (!detectFamily(input.candidate)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, error: 'candidate must be base58 or 0x address.', disclaimer: DISCLAIMER });
    }
    mintScan = scanLookalikes(input.candidate, input.contacts, 20);
    if (mintScan.hits.some((h) => h.triggered)) {
      signals.push(signal('mint_lookalike', 'Mint', mintScan.score, true, 'Mint address looks like a known contact mint'));
    } else {
      signals.push(signal('mint_clean', 'Mint', 0, false, 'No mint address lookalike hits'));
    }
  }

  const sym = symbolHits(input.symbol, input.symbols);
  if (sym.hits.some((h) => h.triggered)) {
    signals.push(signal('ticker_lookalike', 'Ticker', sym.score, true, sym.hits[0].detail));
  } else if (input.symbol) {
    signals.push(signal('ticker_clean', 'Ticker', 0, false, 'No ticker lookalike hits'));
  }

  const score = Math.min(100, Math.max(mintScan ? mintScan.score : 0, sym.score));
  const riskLevel = riskLevelFromScore(score);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    kind: 'cyre-mintalike',
    version: 1,
    candidate: input.candidate,
    symbol: input.symbol ? input.symbol.toUpperCase() : null,
    mint: mintScan
      ? { hitCount: mintScan.hits.filter((h) => h.triggered).length, hits: mintScan.hits.slice(0, 5), score: mintScan.score }
      : null,
    ticker: { hitCount: sym.hits.filter((h) => h.triggered).length, hits: sym.hits.slice(0, 5), score: sym.score },
    score,
    riskLevel,
    signals,
    brief:
      score >= 12
        ? 'Mint or ticker resembles a known token — confirm the full mint before swap. Patterns, not verdicts.'
        : 'No close mint/ticker lookalike among provided contacts/symbols.',
    next: ['Before swap: /api/token on the mint', 'Before sign: /api/preflight', 'Seal /api/receipt after'],
    disclaimer: DISCLAIMER
  });
}

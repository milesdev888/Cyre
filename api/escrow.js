// api/escrow.js — Agent-to-agent escrow brief + x402
// Grade both treasuries / parties before release. Not custody.
//
// GET/POST /api/escrow?payToA=&payToB=&amountAtomic=&resourceUrl=
// Env: SOLANA_RPC, BASE_RPC, X402_PRICE_ESCROW (default 5000)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress, riskLevelFromScore, signal } from './_grade.js';

const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const EVM = /^0x[a-fA-F0-9]{40}$/;

const DESCRIPTION =
  'Guardian Escrow Brief — before agents release escrow, grade both payTo sides (Base or Solana) + amount hygiene. Not custody. Patterns, not verdicts.';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          payToA: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
          payToB: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          amountAtomic: '10000'
        }
      },
      output: { type: 'json', example: { ok: true, kind: 'cyre-escrow', score: 12, disclaimer: DISCLAIMER } }
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
              properties: { payToA: { type: 'string' }, payToB: { type: 'string' } },
              required: ['payToA', 'payToB']
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
  price: String(process.env.X402_PRICE_ESCROW || '5000'),
  resourcePath: '/api/escrow',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['escrow', 'bilateral', 'agents', 'treasury', 'middleware'],
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
    payToA: String((body && body.payToA) || q.payToA || '').trim() || null,
    payToB: String((body && body.payToB) || q.payToB || '').trim() || null,
    amountAtomic: String((body && body.amountAtomic) != null ? body.amountAtomic : q.amountAtomic != null ? q.amountAtomic : '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null
  };
}

async function ethRpc(method, params) {
  const r = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'eth rpc error');
  return d.result;
}

async function gradeSide(addr) {
  if (EVM.test(addr)) {
    const a = addr.toLowerCase();
    const [nonceHex, code] = await Promise.all([
      ethRpc('eth_getTransactionCount', [a, 'latest']),
      ethRpc('eth_getCode', [a, 'latest'])
    ]);
    const nonce = Number.parseInt(nonceHex, 16);
    const isContract = !!(code && code !== '0x' && code !== '0x0');
    const signals = [];
    if (nonce === 0 && !isContract) {
      signals.push(signal('fresh_eoa', 'Wallet age', 22, true, 'EOA nonce 0 on Base'));
    }
    if (isContract) signals.push(signal('is_contract', 'Account type', 4, true, 'Contract treasury'));
    const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points : 0), 0));
    return { chain: 'base', payTo: a, score, riskLevel: riskLevelFromScore(score), signals, profile: { isContract, nonce } };
  }
  if (B58.test(addr)) {
    const g = await gradeAddress(addr, { withAffinity: false });
    return {
      chain: 'solana',
      payTo: addr,
      score: g.empty ? Math.max(g.score || 0, 16) : g.score,
      riskLevel: g.empty ? 'MEDIUM' : g.riskLevel,
      signals: g.signals || [],
      empty: !!g.empty,
      profile: g.profile || null
    };
  }
  return null;
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
  if (!input.payToA || !input.payToB) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide payToA and payToB (Base 0x or Solana base58). Optional amountAtomic, resourceUrl.',
      disclaimer: DISCLAIMER
    });
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  try {
    const [a, b] = await Promise.all([gradeSide(input.payToA), gradeSide(input.payToB)]);
    if (!a || !b) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, error: 'Both payToA and payToB must be valid addresses.', disclaimer: DISCLAIMER });
    }

    const signals = [
      ...a.signals.map((s) => ({ ...s, scope: 'A' })),
      ...b.signals.map((s) => ({ ...s, scope: 'B' }))
    ];
    if (input.amountAtomic) {
      try {
        const n = BigInt(input.amountAtomic);
        if (n > 100_000_000n) {
          signals.push(signal('amount_large', 'Amount', 14, true, 'Escrow amount > $100 USDC atomic'));
        }
      } catch (e) {
        signals.push(signal('amount_bad', 'Amount', 10, true, 'amountAtomic not an integer'));
      }
    }
    if (a.payTo === b.payTo) {
      signals.push(signal('same_party', 'Parties', 20, true, 'payToA and payToB are the same address'));
    }

    const score = Math.min(100, Math.max(a.score, b.score) + (a.payTo === b.payTo ? 10 : 0));
    const riskLevel = riskLevelFromScore(score);
    const gap = Math.abs((a.score || 0) - (b.score || 0));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-escrow',
      version: 1,
      sides: { A: a, B: b },
      scoreGap: gap,
      amountAtomic: input.amountAtomic,
      resourceUrl: input.resourceUrl,
      score,
      riskLevel,
      signals,
      signalsTriggered: signals.filter((s) => s.triggered).length,
      brief:
        gap >= 25
          ? `Side scores differ by ${gap} — review the higher-risk party before release. Not custody. Patterns, not verdicts.`
          : `Bilateral escrow brief score ${score} (${riskLevel}). Guardian does not hold funds.`,
      next: ['Optional /api/ticket on both Passports', 'Seal /api/receipt on release', 'Not an escrow custodian'],
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('escrow', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, error: 'Could not complete escrow brief.', disclaimer: DISCLAIMER });
  }
}

// api/gate.js — Guardian Gate + x402 (the before-any-pay checkout skill)
// Call this BEFORE paying any non-Guardian x402 resource. Grades the payTo
// counterparty (Solana or Base/EVM) + amount/URL hygiene. Patterns, not verdicts.
//
// GET  /api/gate?payTo=&amount=&resourceUrl=&chain=&from=
// POST /api/gate { payTo, amount?, resourceUrl?, chain?, from? }
//
// Env: SOLANA_RPC, BASE_RPC (default https://mainnet.base.org), X402_*
//      X402_PRICE_GATE — atomic USDC (default 1000 = $0.001)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress, riskLevelFromScore, signal } from './_grade.js';

const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const EVM = /^0x[a-fA-F0-9]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
const CYRE_HOST = /(^|\.)cyre\.dev$/i;

const DESCRIPTION =
  'Guardian Gate — before your agent pays ANY other x402 service, grade the payTo counterparty + spend shape in one cheap call. Patterns, not verdicts. Agent guide: use before non-Guardian awal x402 pay.';

const EXAMPLE_PAYTO = '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712';

const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: {
          payTo: EXAMPLE_PAYTO,
          amount: '10000',
          resourceUrl: 'https://example.com/api/paid',
          chain: 'base'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-gate',
          version: 1,
          payTo: EXAMPLE_PAYTO,
          chain: 'base',
          score: 18,
          riskLevel: 'LOW',
          brief: 'Counterparty looks like a contract on Base. Review before you pay.',
          next: ['If Solana settle: /api/handshake', 'Seal decision: /api/receipt'],
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
                payTo: { type: 'string', description: 'Treasury / payTo address (0x… on Base or Solana base58)' },
                amount: { type: 'string', description: 'Optional USDC atomic units (6 decimals)' },
                resourceUrl: { type: 'string', description: 'Optional URL the agent is about to pay' },
                chain: { type: 'string', description: 'Optional: base | solana | eip155:8453' },
                from: { type: 'string', description: 'Optional payer address for context' }
              },
              required: ['payTo']
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
  price: String(process.env.X402_PRICE_GATE || '1000'),
  resourcePath: '/api/gate',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: [
    'gate',
    'before-pay',
    'x402',
    'spend',
    'checkout',
    'counterparty',
    'agents',
    'risk',
    'base',
    'solana'
  ],
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
    payTo: String((body && body.payTo) || q.payTo || '').trim() || null,
    amount: String((body && body.amount) != null ? body.amount : q.amount != null ? q.amount : '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    chain: String((body && body.chain) || q.chain || '').trim().toLowerCase() || null,
    from: String((body && body.from) || q.from || '').trim() || null
  };
}

function detectChain(payTo, chainHint) {
  if (chainHint) {
    if (chainHint.includes('solana') || chainHint === 'sol') return 'solana';
    if (chainHint.includes('base') || chainHint.includes('8453') || chainHint.includes('eip155')) return 'base';
  }
  if (EVM.test(payTo)) return 'base';
  if (B58.test(payTo)) return 'solana';
  return null;
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

function parseAmountAtomic(raw) {
  if (raw == null || raw === '') return null;
  try {
    const n = BigInt(String(raw));
    if (n < 0n) return null;
    return n;
  } catch (e) {
    return null;
  }
}

function urlSignals(resourceUrl) {
  const signals = [];
  if (!resourceUrl) return signals;
  let u;
  try {
    u = new URL(resourceUrl);
  } catch (e) {
    signals.push(signal('url_bad', 'Resource URL', 20, true, 'resourceUrl is not a valid URL'));
    return signals;
  }
  if (u.protocol !== 'https:') {
    signals.push(signal('url_http', 'Resource URL', 16, true, 'resourceUrl is not https'));
  } else {
    signals.push(signal('url_http', 'Resource URL', 0, false, 'resourceUrl uses https'));
  }
  if (CYRE_HOST.test(u.hostname)) {
    signals.push(signal('url_self', 'Resource URL', 0, false, 'Paying Guardian itself — Gate is optional for cyre.dev'));
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) {
    signals.push(signal('url_ip', 'Resource URL', 18, true, 'resourceUrl host is a raw IP — unusual for x402 services'));
  }
  if ((u.hostname || '').split('.').length < 2) {
    signals.push(signal('url_host', 'Resource URL', 10, true, 'resourceUrl host looks incomplete'));
  }
  return signals;
}

function amountSignals(atomic) {
  const signals = [];
  if (atomic == null) {
    signals.push(signal('amount_missing', 'Amount', 0, false, 'No amount provided — counterparty-only Gate'));
    return signals;
  }
  // USDC 6 decimals: 1000 = $0.001, 1_000_000 = $1, 100_000_000 = $100
  if (atomic === 0n) {
    signals.push(signal('amount_zero', 'Amount', 12, true, 'Amount is zero'));
  } else if (atomic > 100_000_000n) {
    signals.push(signal('amount_large', 'Amount', 14, true, `Amount is ${atomic.toString()} atomic USDC (> $100) — large for a typical agent micro-pay`));
  } else if (atomic < 100n) {
    signals.push(signal('amount_dust', 'Amount', 6, true, 'Amount is dust-level (< $0.0001)'));
  } else {
    signals.push(signal('amount_ok', 'Amount', 0, false, `Amount ${atomic.toString()} atomic USDC`));
  }
  return signals;
}

async function gradeEvmPayTo(payTo) {
  const addr = payTo.toLowerCase();
  const signals = [];
  if (addr === ZERO) {
    return {
      chain: 'base',
      payTo: addr,
      score: 100,
      riskLevel: 'HIGH',
      signals: [signal('zero_address', 'PayTo', 100, true, 'payTo is the zero address')],
      profile: null
    };
  }

  const [nonceHex, code, balHex] = await Promise.all([
    ethRpc('eth_getTransactionCount', [addr, 'latest']),
    ethRpc('eth_getCode', [addr, 'latest']),
    ethRpc('eth_getBalance', [addr, 'latest'])
  ]);
  const nonce = Number.parseInt(nonceHex, 16);
  const isContract = !!(code && code !== '0x' && code !== '0x0');
  let balanceEth = 0;
  try {
    balanceEth = Number(BigInt(balHex)) / 1e18;
  } catch (e) {
    balanceEth = 0;
  }

  if (!Number.isFinite(nonce)) {
    signals.push(signal('nonce_unknown', 'Activity', 8, true, 'Could not read transaction count'));
  } else if (nonce === 0 && !isContract) {
    signals.push(signal('fresh_eoa', 'Wallet age', 22, true, 'EOA with nonce 0 — no outbound history on Base'));
  } else if (nonce > 0 && nonce < 5) {
    signals.push(signal('young_eoa', 'Wallet age', 10, true, `EOA nonce ${nonce} — very light history on Base`));
  } else {
    signals.push(signal('nonce_ok', 'Wallet age', 0, false, isContract ? 'Contract account (nonce N/A for age)' : `EOA nonce ${nonce}`));
  }

  if (isContract) {
    signals.push(signal('is_contract', 'Account type', 4, true, 'payTo is a contract — expected for many treasuries; confirm it matches the service'));
  } else {
    signals.push(signal('is_eoa', 'Account type', 0, false, 'payTo is an EOA'));
  }

  if (!isContract && balanceEth === 0 && nonce === 0) {
    signals.push(signal('empty_fresh', 'Balance', 12, true, 'Fresh empty EOA — uncommon as a live service treasury'));
  }

  const score = Math.min(
    100,
    signals.reduce((s, x) => s + (x.triggered ? x.points : 0), 0)
  );
  return {
    chain: 'base',
    payTo: addr,
    score,
    riskLevel: riskLevelFromScore(score),
    signals,
    profile: {
      isContract,
      nonce: Number.isFinite(nonce) ? nonce : null,
      balanceEth: Number(balanceEth.toFixed(6))
    }
  };
}

async function gradeSolPayTo(payTo) {
  const g = await gradeAddress(payTo, { withAffinity: false });
  const signals = (g.signals || []).map((s) => ({ ...s, scope: 'payTo' }));
  if (g.empty) {
    signals.push(signal('payto_empty', 'PayTo history', 16, true, 'Solana payTo has no measured history'));
  }
  return {
    chain: 'solana',
    payTo,
    empty: !!g.empty,
    score: g.empty ? Math.max(g.score || 0, 16) : g.score,
    riskLevel: g.empty ? 'MEDIUM' : g.riskLevel,
    signals,
    profile: g.profile || null
  };
}

function buildBrief(bundle) {
  const parts = [];
  const { counterparty, amountAtomic, resourceUrl, signals } = bundle;
  if (counterparty.chain === 'base' && counterparty.profile && counterparty.profile.isContract) {
    parts.push('Counterparty looks like a contract on Base.');
  }
  if (counterparty.chain === 'solana' && counterparty.empty) {
    parts.push('Solana payTo has no measured history.');
  }
  const triggered = (signals || []).filter((s) => s.triggered);
  const hot = triggered.find((s) => s.id === 'fresh_eoa' || s.id === 'zero_address' || s.id === 'url_ip' || s.id === 'amount_large');
  if (hot) parts.push(hot.detail);
  if (resourceUrl && CYRE_HOST.test((() => { try { return new URL(resourceUrl).hostname; } catch (e) { return ''; } })())) {
    parts.push('Target is cyre.dev — Gate is optional for Guardian itself.');
  }
  if (!parts.length) {
    parts.push(`Gate score ${bundle.score} (${bundle.riskLevel}). Review signals before you pay.`);
  } else {
    parts.push('Review before you pay.');
  }
  parts.push('Patterns, not verdicts — Guardian does not approve or block the payment.');
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
  if (!input.payTo) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'Provide `payTo` (Base 0x… or Solana base58). Optional: amount, resourceUrl, chain, from.',
      howTo: {
        get: 'GET /api/gate?payTo=0x…&amount=10000&resourceUrl=https://…',
        rule: 'Before any non-Guardian x402 pay, call Gate first.'
      },
      disclaimer: DISCLAIMER
    });
  }

  const chain = detectChain(input.payTo, input.chain);
  if (!chain) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'payTo must be a Base/EVM 0x address or Solana base58 address.',
      disclaimer: DISCLAIMER
    });
  }
  if (chain === 'base' && !EVM.test(input.payTo)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Invalid EVM payTo.', disclaimer: DISCLAIMER });
  }
  if (chain === 'solana' && !B58.test(input.payTo)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'Invalid Solana payTo.', disclaimer: DISCLAIMER });
  }

  let amountAtomic = null;
  if (input.amount != null) {
    amountAtomic = parseAmountAtomic(input.amount);
    if (amountAtomic == null) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({
        ok: false,
        error: '`amount` must be USDC atomic units (integer string, 6 decimals).',
        disclaimer: DISCLAIMER
      });
    }
  }

  if (input.from) {
    const fromOk = EVM.test(input.from) || B58.test(input.from);
    if (!fromOk) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ ok: false, error: '`from` is not a valid address.', disclaimer: DISCLAIMER });
    }
  }

  if (hasPayment) {
    const gatePay = await x402Gate(req);
    if (applyX402Result(res, gatePay)) return;
  }

  try {
    const counterparty = chain === 'base' ? await gradeEvmPayTo(input.payTo) : await gradeSolPayTo(input.payTo);
    const signals = [
      ...counterparty.signals.map((s) => ({ ...s, scope: s.scope || 'payTo' })),
      ...amountSignals(amountAtomic).map((s) => ({ ...s, scope: 'amount' })),
      ...urlSignals(input.resourceUrl).map((s) => ({ ...s, scope: 'url' }))
    ];

    const score = Math.min(
      100,
      signals.reduce((sum, s) => sum + (s.triggered ? s.points || 0 : 0), 0)
    );
    const riskLevel = riskLevelFromScore(score);
    const brief = buildBrief({ counterparty, amountAtomic, resourceUrl: input.resourceUrl, signals, score, riskLevel });

    const selfPay =
      !!input.resourceUrl &&
      (() => {
        try {
          return CYRE_HOST.test(new URL(input.resourceUrl).hostname);
        } catch (e) {
          return false;
        }
      })();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-gate',
      version: 1,
      payTo: counterparty.payTo,
      chain: counterparty.chain,
      amountAtomic: amountAtomic != null ? amountAtomic.toString() : null,
      resourceUrl: input.resourceUrl || null,
      from: input.from || null,
      selfPay,
      counterparty: {
        score: counterparty.score,
        riskLevel: counterparty.riskLevel,
        profile: counterparty.profile,
        empty: counterparty.empty || false
      },
      score,
      riskLevel,
      signals,
      signalsTriggered: signals.filter((s) => s.triggered).length,
      signalsEvaluated: signals.length,
      brief,
      next: selfPay
        ? ['Continue with the Guardian endpoint you intended to call.']
        : [
            'If paying a Solana counterparty: consider /api/handshake or /api/preflight',
            'After you decide: seal /api/receipt with your intentHash',
            'Patterns, not verdicts — you still choose whether to pay'
          ],
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('gate', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not complete Gate right now. Try again in a moment.',
      disclaimer: DISCLAIMER
    });
  }
}

// api/route.js — Pay-route Oracle + x402
// Before any external x402 pay: grade payTo + amount/URL + facilitator/offer hygiene.
// Superset of Gate signals for agents that wire a single middleware call.
//
// GET/POST /api/route?payTo=&amount=&resourceUrl=&listedAmount=&facilitator=&network=&from=
// Env: SOLANA_RPC, BASE_RPC, X402_PRICE_ROUTE (default 2000 = $0.002)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { B58, DISCLAIMER, gradeAddress, riskLevelFromScore, signal } from './_grade.js';

const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const EVM = /^0x[a-fA-F0-9]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
const CYRE_HOST = /(^|\.)cyre\.dev$/i;

const KNOWN_FACILITATORS = [
  'api.cdp.coinbase.com',
  'x402.org',
  'www.x402.org',
  'cyre-fraud-prediction.onrender.com'
];

const DESCRIPTION =
  'Guardian Pay-route Oracle — before your agent pays any external x402 resource, grade payTo + amount/URL + facilitator/offer pin hygiene in one call. Patterns, not verdicts.';

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
          listedAmount: '10000',
          resourceUrl: 'https://example.com/api/paid',
          facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402',
          network: 'eip155:8453'
        }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-route',
          version: 1,
          score: 8,
          riskLevel: 'LOW',
          brief: 'Route hygiene looks ordinary. Review signals before you pay.',
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
                payTo: { type: 'string' },
                amount: { type: 'string' },
                listedAmount: { type: 'string', description: 'Amount from the 402 accepts[] offer' },
                resourceUrl: { type: 'string' },
                facilitator: { type: 'string' },
                network: { type: 'string' },
                from: { type: 'string' }
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
  price: String(process.env.X402_PRICE_ROUTE || '2000'),
  resourcePath: '/api/route',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['route', 'oracle', 'before-pay', 'x402', 'facilitator', 'offer', 'gate', 'agents', 'risk'],
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
    listedAmount: String((body && body.listedAmount) != null ? body.listedAmount : q.listedAmount != null ? q.listedAmount : '').trim() || null,
    resourceUrl: String((body && body.resourceUrl) || q.resourceUrl || '').trim() || null,
    facilitator: String((body && body.facilitator) || q.facilitator || '').trim() || null,
    network: String((body && body.network) || q.network || '').trim() || null,
    chain: String((body && body.chain) || q.chain || '').trim().toLowerCase() || null,
    from: String((body && body.from) || q.from || '').trim() || null
  };
}

function detectChain(payTo, chainHint, network) {
  const hint = (chainHint || '') + ' ' + (network || '');
  if (/solana/i.test(hint)) return 'solana';
  if (/base|8453|eip155/i.test(hint)) return 'base';
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
    signals.push(signal('url_self', 'Resource URL', 0, false, 'Paying Guardian itself — Route is optional for cyre.dev'));
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) {
    signals.push(signal('url_ip', 'Resource URL', 18, true, 'resourceUrl host is a raw IP — unusual for x402 services'));
  }
  return signals;
}

function amountSignals(atomic) {
  const signals = [];
  if (atomic == null) {
    signals.push(signal('amount_missing', 'Amount', 0, false, 'No amount provided'));
    return signals;
  }
  if (atomic === 0n) {
    signals.push(signal('amount_zero', 'Amount', 12, true, 'Amount is zero'));
  } else if (atomic > 100_000_000n) {
    signals.push(signal('amount_large', 'Amount', 14, true, `Amount ${atomic} atomic USDC (> $100)`));
  } else if (atomic < 100n) {
    signals.push(signal('amount_dust', 'Amount', 6, true, 'Amount is dust-level'));
  } else {
    signals.push(signal('amount_ok', 'Amount', 0, false, `Amount ${atomic} atomic USDC`));
  }
  return signals;
}

function offerPinSignals(amount, listedAmount) {
  const signals = [];
  if (listedAmount == null) {
    signals.push(signal('listed_missing', 'Offer pin', 0, false, 'No listedAmount from 402 accepts[] — skip pin check'));
    return signals;
  }
  if (amount == null) {
    signals.push(signal('listed_no_amount', 'Offer pin', 8, true, 'listedAmount provided but amount missing'));
    return signals;
  }
  if (amount !== listedAmount) {
    signals.push(
      signal(
        'offer_mismatch',
        'Offer pin',
        28,
        true,
        `amount ${amount} ≠ listedAmount ${listedAmount} — refuse settle until they match`
      )
    );
  } else {
    signals.push(signal('offer_match', 'Offer pin', 0, false, 'amount matches listedAmount'));
  }
  return signals;
}

function facilitatorSignals(facilitator) {
  const signals = [];
  if (!facilitator) {
    signals.push(signal('facilitator_missing', 'Facilitator', 0, false, 'No facilitator URL provided'));
    return signals;
  }
  let u;
  try {
    u = new URL(facilitator);
  } catch (e) {
    signals.push(signal('facilitator_bad', 'Facilitator', 22, true, 'facilitator is not a valid URL'));
    return signals;
  }
  if (u.protocol !== 'https:') {
    signals.push(signal('facilitator_http', 'Facilitator', 20, true, 'facilitator is not https'));
  }
  const host = (u.hostname || '').toLowerCase();
  if (KNOWN_FACILITATORS.some((k) => host === k || host.endsWith('.' + k))) {
    signals.push(signal('facilitator_known', 'Facilitator', 0, false, `Known facilitator host ${host}`));
  } else {
    signals.push(
      signal(
        'facilitator_unknown',
        'Facilitator',
        10,
        true,
        `Facilitator host ${host} is not in Guardian's small known list — confirm before trusting settle`
      )
    );
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    signals.push(signal('facilitator_ip', 'Facilitator', 18, true, 'facilitator host is a raw IP'));
  }
  return signals;
}

function networkSignals(network, chain) {
  const signals = [];
  if (!network) {
    signals.push(signal('network_missing', 'Network', 0, false, 'No CAIP-2 network provided'));
    return signals;
  }
  if (chain === 'base' && network !== 'eip155:8453' && network !== 'eip155:84532') {
    signals.push(
      signal('network_odd', 'Network', 12, true, `EVM payTo with network ${network} — expected eip155:8453 (or 84532 test)`)
    );
  } else if (chain === 'solana' && !String(network).startsWith('solana:')) {
    signals.push(signal('network_odd', 'Network', 12, true, `Solana payTo with network ${network}`));
  } else {
    signals.push(signal('network_ok', 'Network', 0, false, `network ${network}`));
  }
  return signals;
}

/** Guardian Base treasury — if payTo matches but resource is foreign, flag recycle. */
const GUARDIAN_BASE_TREASURY = '0x9ff25c4acf1dcdDf15fd2702c127a285f1dfa712'.toLowerCase();

function recycleSignals(payTo, resourceUrl, chain) {
  const signals = [];
  if (chain !== 'base' || !resourceUrl) return signals;
  let host = '';
  try {
    host = new URL(resourceUrl).hostname;
  } catch (e) {
    return signals;
  }
  if (payTo.toLowerCase() === GUARDIAN_BASE_TREASURY && !CYRE_HOST.test(host)) {
    signals.push(
      signal(
        'payto_recycle',
        'PayTo recycle',
        24,
        true,
        'payTo matches Guardian’s public Base treasury but resourceUrl is not cyre.dev — possible offer spoof'
      )
    );
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
  if (nonce === 0 && !isContract) {
    signals.push(signal('fresh_eoa', 'Wallet age', 22, true, 'EOA with nonce 0 — no outbound history on Base'));
  } else {
    signals.push(signal('nonce_ok', 'Wallet age', 0, false, isContract ? 'Contract account' : `EOA nonce ${nonce}`));
  }
  if (isContract) {
    signals.push(signal('is_contract', 'Account type', 4, true, 'payTo is a contract'));
  } else {
    signals.push(signal('is_eoa', 'Account type', 0, false, 'payTo is an EOA'));
  }
  const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points : 0), 0));
  return {
    chain: 'base',
    payTo: addr,
    score,
    riskLevel: riskLevelFromScore(score),
    signals,
    profile: { isContract, nonce: Number.isFinite(nonce) ? nonce : null, balanceEth: Number(balanceEth.toFixed(6)) }
  };
}

async function gradeSolPayTo(payTo) {
  const g = await gradeAddress(payTo, { withAffinity: false });
  const signals = (g.signals || []).map((s) => ({ ...s, scope: 'payTo' }));
  if (g.empty) signals.push(signal('payto_empty', 'PayTo history', 16, true, 'Solana payTo has no measured history'));
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
  const hot = (bundle.signals || []).filter((s) => s.triggered).sort((a, b) => (b.points || 0) - (a.points || 0))[0];
  if (hot) return `${hot.detail} Patterns, not verdicts — you still choose whether to pay.`;
  return `Route score ${bundle.score} (${bundle.riskLevel}). Hygiene looks ordinary — still review before you pay. Patterns, not verdicts.`;
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
      error: 'Provide `payTo`. Optional: amount, listedAmount, resourceUrl, facilitator, network, from.',
      howTo: { get: 'GET /api/route?payTo=0x…&amount=10000&listedAmount=10000&resourceUrl=https://…&facilitator=https://…' },
      disclaimer: DISCLAIMER
    });
  }

  const chain = detectChain(input.payTo, input.chain, input.network);
  if (!chain) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: 'payTo must be Base 0x… or Solana base58.', disclaimer: DISCLAIMER });
  }

  const amountAtomic = input.amount != null ? parseAmountAtomic(input.amount) : null;
  if (input.amount != null && amountAtomic == null) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`amount` must be integer atomic USDC.', disclaimer: DISCLAIMER });
  }
  const listedAtomic = input.listedAmount != null ? parseAmountAtomic(input.listedAmount) : null;
  if (input.listedAmount != null && listedAtomic == null) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ ok: false, error: '`listedAmount` must be integer atomic USDC.', disclaimer: DISCLAIMER });
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
      ...offerPinSignals(amountAtomic, listedAtomic).map((s) => ({ ...s, scope: 'offer' })),
      ...urlSignals(input.resourceUrl).map((s) => ({ ...s, scope: 'url' })),
      ...facilitatorSignals(input.facilitator).map((s) => ({ ...s, scope: 'facilitator' })),
      ...networkSignals(input.network, chain).map((s) => ({ ...s, scope: 'network' })),
      ...recycleSignals(counterparty.payTo, input.resourceUrl, chain).map((s) => ({ ...s, scope: 'recycle' }))
    ];

    const score = Math.min(100, signals.reduce((sum, s) => sum + (s.triggered ? s.points || 0 : 0), 0));
    const riskLevel = riskLevelFromScore(score);
    const brief = buildBrief({ score, riskLevel, signals });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      kind: 'cyre-route',
      version: 1,
      payTo: counterparty.payTo,
      chain: counterparty.chain,
      amountAtomic: amountAtomic != null ? amountAtomic.toString() : null,
      listedAmount: listedAtomic != null ? listedAtomic.toString() : null,
      resourceUrl: input.resourceUrl || null,
      facilitator: input.facilitator || null,
      network: input.network || null,
      from: input.from || null,
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
      next: [
        'If amount ≠ listedAmount or facilitator unknown — do not settle',
        'Seal decision: /api/receipt',
        'Session ticket for counterparties: /api/ticket'
      ],
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    console.error('route', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not complete Pay-route Oracle right now. Try again shortly.',
      disclaimer: DISCLAIMER
    });
  }
}

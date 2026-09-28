// api/address.js — CYRE address profile + x402 payment gate
// Site visitors (cyre.dev) stay FREE. Direct API callers (agents) pay per query via x402 (protocol v2).
//
// Env vars (all optional — gate is OFF until X402_ENABLED=true):
//   SOLANA_RPC             RPC endpoint (defaults to public mainnet)
//   X402_ENABLED           "true" to arm the payment gate (default: off, everything free)
//   X402_NETWORK           "devnet" or "mainnet" — default for both chains (default: devnet)
//   X402_NETWORK_BASE      per-lane override for Base only (lets Base run mainnet while Solana rehearses on devnet)
//   CDP_API_KEY_ID         Coinbase CDP API key id — when set (with secret), Base lane defaults to the
//   CDP_API_KEY_SECRET     CDP mainnet facilitator and calls are signed with a CDP JWT (required for Bazaar indexing)
//   X402_PRICE             Price in USDC atomic units, 6 decimals (default: 5000 = $0.005)
//   -- Solana lane (armed when set) --
//   X402_PAY_TO            Solana treasury address receiving USDC
//   X402_FACILITATOR       Solana facilitator URL (default: https://x402.org/facilitator — testnet;
//                          mainnet needs a production facilitator, e.g. Coinbase CDP)
//   -- Base lane (armed when set) --
//   X402_PAY_TO_BASE       Base treasury address (0x...) receiving USDC
//   X402_FACILITATOR_BASE  Base facilitator URL (default: https://x402.org/facilitator — testnet;
//                          mainnet needs a production facilitator, e.g. Coinbase CDP)
// An agent gets ALL armed lanes in the 402 "accepts" list and pays on whichever chain it prefers.
// Gate implementation: ./_x402.js

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAY = 86400;

const DESCRIPTION = 'Guardian address profile — explainable on-chain risk signals. Patterns, not verdicts.';

// Bazaar discovery extension (x402 v2 shape, mirrors @x402/extensions declareDiscoveryExtension for GET).
const DISCOVERY = {
  bazaar: {
    info: {
      input: {
        type: 'http',
        method: 'GET',
        queryParams: { address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          score: 12,
          riskLevel: 'LOW',
          signals: [{ id: 'fresh', name: 'Fresh wallet', points: 0, triggered: false, detail: 'First seen 900+ days ago' }],
          profile: { ageDays: 912, txCount: 1000, solBalance: 3.2 }
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
                address: { type: 'string', description: 'Solana wallet or program address (base58) to risk-grade' }
              },
              required: ['address']
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
                address: { type: 'string' },
                score: { type: 'number', description: '0-100 risk score (higher = riskier)' },
                riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                signals: { type: 'array', description: 'Explainable risk signals with points and detail' },
                profile: { type: 'object', description: 'Wallet age, activity and balance stats' }
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
  price: String(process.env.X402_PRICE || '5000'),
  resourcePath: '/api/address',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'fraud', 'solana', 'wallet', 'security'],
  discovery: DISCOVERY,
  isFree: isCyreSiteRequest
});

// ---------- chain reads (unchanged) ----------
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'RPC error');
  return d.result;
}

function signal(id, name, points, triggered, detail) {
  return { id, name, points, triggered, detail };
}

export default async function handler(req, res) {
  const address = String((req.query && req.query.address) || '').trim();

  // ----- x402 gate, quote step -----
  // Unpaid callers get the 402 quote BEFORE any input validation, so Bazaar's
  // /validate crawler (bare probe, no params) sees a 402 and not a 400.
  // Nothing is computed or billed here.
  const hasPayment = !!(req.headers['payment-signature'] || req.headers['x-payment']);
  if (!hasPayment) {
    const quote = await x402Gate(req);
    if (applyX402Result(res, quote)) return;
  }

  // ----- input validation (refusals stay free — runs before any settle) -----
  if (!B58.test(address)) {
    return res.status(400).json({ error: 'That does not look like a Solana address.' });
  }

  // ----- x402 gate, verify + settle step (paid callers only) -----
  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const [sigs, bal] = await Promise.all([
      rpc('getSignaturesForAddress', [address, { limit: 1000 }]),
      rpc('getBalance', [address])
    ]);

    const list = Array.isArray(sigs) ? sigs : [];
    const now = Math.floor(Date.now() / 1000);
    const sol = (bal && typeof bal.value === 'number' ? bal.value : 0) / 1e9;

    if (!list.length) {
      return res.status(200).json({
        ok: true,
        address,
        empty: true,
        balanceSol: sol,
        message: 'No transaction history found for this address.'
      });
    }

    const times = list.map((s) => s.blockTime).filter(Boolean).sort((a, b) => a - b);
    const earliest = times[0] || now;
    const latest = times[times.length - 1] || now;
    const ageDays = Math.floor((now - earliest) / DAY);
    const idleDays = Math.floor((now - latest) / DAY);
    const capped = list.length >= 1000;

    const last24 = times.filter((t) => now - t < DAY).length;
    const failed = list.filter((s) => s.err).length;
    const failRate = list.length ? failed / list.length : 0;

    let biggestGap = 0;
    for (let i = 1; i < times.length; i++) {
      const g = times[i] - times[i - 1];
      if (g > biggestGap) biggestGap = g;
    }
    const gapDays = Math.floor(biggestGap / DAY);

    const signals = [];

    signals.push(
      capped
        ? signal('age', 'Wallet age', 0, false, ageDays < 1
            ? 'Too active to date — the 1,000 most recent transactions all landed within a day; first activity is older than this window reaches'
            : `Active for at least ${ageDays} days — history runs deeper than the 1,000-transaction window`)
        : ageDays < 7
        ? signal('age', 'Wallet age', 26, true, `First activity ${ageDays} day${ageDays === 1 ? '' : 's'} ago — a very new wallet`)
        : ageDays < 30
        ? signal('age', 'Wallet age', 12, true, `First activity ${ageDays} days ago`)
        : signal('age', 'Wallet age', 0, false, `First activity ${ageDays} days ago`)
    );

    signals.push(
      last24 >= 40
        ? signal('burst', 'Activity burst', 24, true, `${last24} transactions in the last 24 hours`)
        : last24 >= 15
        ? signal('burst', 'Activity burst', 12, true, `${last24} transactions in the last 24 hours`)
        : signal('burst', 'Activity burst', 0, false, `${last24} transactions in the last 24 hours`)
    );

    signals.push(
      failRate > 0.3
        ? signal('failures', 'Failed transactions', 18, true, `${Math.round(failRate * 100)}% of recent transactions failed — often automated behaviour`)
        : signal('failures', 'Failed transactions', 0, false, `${Math.round(failRate * 100)}% of recent transactions failed`)
    );

    signals.push(
      gapDays >= 90 && idleDays < 7
        ? signal('dormant', 'Dormant then active', 20, true, `Was inactive for ${gapDays} days, then moved again recently`)
        : signal('dormant', 'Dormant then active', 0, false, gapDays
            ? `Longest quiet stretch was ${gapDays} days`
            : 'Activity is continuous')
    );

    signals.push(
      sol < 0.01 && list.length > 20
        ? signal('balance', 'Balance vs activity', 14, true, `Holds ${sol.toFixed(4)} SOL despite ${list.length}+ recent transactions — pass-through pattern`)
        : signal('balance', 'Balance vs activity', 0, false, `Holds ${sol.toFixed(4)} SOL`)
    );

    signals.push(
      list.length < 5
        ? signal('history', 'Transaction history', 10, true, `Only ${list.length} transaction${list.length === 1 ? '' : 's'} on record`)
        : signal('history', 'Transaction history', 0, false, capped
            ? '1,000+ recent transactions'
            : `${list.length} transactions on record`)
    );

    const score = Math.min(signals.reduce((s, x) => s + x.points, 0), 100);
    const riskLevel = score < 30 ? 'LOW' : score < 70 ? 'MEDIUM' : 'HIGH';

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({
      ok: true,
      address,
      score,
      riskLevel,
      signals,
      signalsTriggered: signals.filter((s) => s.triggered).length,
      signalsEvaluated: signals.length,
      profile: {
        ageDays,
        ageIsMinimum: capped,
        idleDays,
        transactionsSeen: list.length,
        last24h: last24,
        failedPercent: Math.round(failRate * 100),
        longestGapDays: gapDays,
        balanceSol: Number(sol.toFixed(4))
      },
      checkedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('address', e && e.message);
    return res.status(200).json({ ok: false, error: 'Could not read chain data right now. Try again in a moment.' });
  }
}

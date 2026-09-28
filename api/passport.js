// api/passport.js — CYRE Passport v1 + signed attestation + x402 gate
// Portable RWA profile from measured address signals (same 1k-sig window),
// now issued with an Ed25519 attestation an agent can present to anyone
// (verify free at /api/passport/verify). Site visitors (cyre.dev) stay FREE;
// direct API callers pay per passport via x402 — same gate as /api/address.
// No LLM in the hot path. Patterns, not verdicts. No invented metrics.
// Env: SOLANA_RPC, X402_* (see ./_x402.js), PASSPORT_SIGNING_KEY / PASSPORT_TTL_SECONDS (see ./_attest.js)
//      X402_PRICE_PASSPORT — atomic USDC override for this route (default: X402_PRICE or 5000 = $0.005)

import { createX402Gate, applyX402Result, isCyreSiteRequest } from './_x402.js';
import { attest, issuerPublicKey } from './_attest.js';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAY = 86400;
const DISCLAIMER = 'Patterns, not verdicts.';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
// SPEC Watch seed mints — hold/touch affinity only (no weights/scores).
const SEED_MINTS = [
  { symbol: 'USDY', mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6' },
  { symbol: 'OUSG', mint: 'i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc' },
  { symbol: 'syrupUSDC', mint: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj' },
  { symbol: 'AAPLx', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
  { symbol: 'TSLAx', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' },
  { symbol: 'SPYx', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' }
];

const DESCRIPTION = 'Guardian Passport — signed, expiring attestation of an address\'s measured risk profile. Present it to any counterparty; verify free at /api/passport/verify. Patterns, not verdicts.';

const EXAMPLE_ADDR = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DISCOVERY = {
  bazaar: {
    info: {
      input: { type: 'http', method: 'GET', queryParams: { address: EXAMPLE_ADDR } },
      output: {
        type: 'json',
        example: {
          ok: true,
          kind: 'cyre-passport',
          address: EXAMPLE_ADDR,
          score: 12,
          riskLevel: 'LOW',
          signalsTriggered: 0,
          signalsEvaluated: 6,
          mintAffinity: [{ symbol: 'USDY', hold: false, touch: false }],
          attestation: {
            alg: 'Ed25519',
            issuer: 'cyre.dev',
            claims: { address: EXAMPLE_ADDR, score: 12, riskLevel: 'LOW', issuedAt: '2026-08-29T00:00:00.000Z', expiresAt: '2026-08-30T00:00:00.000Z' },
            token: '<base64url-claims>.<base64url-signature>'
          }
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
              properties: { address: { type: 'string', description: 'Solana wallet or program address (base58) to issue a passport for' } },
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
                mintAffinity: { type: 'array', description: 'Hold/touch affinity to seed RWA mints' },
                attestation: {
                  type: 'object',
                  description: 'Ed25519-signed, expiring receipt. Present `token` to a counterparty; they verify it free at GET /api/passport/verify?token=...'
                }
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
  price: String(process.env.X402_PRICE_PASSPORT || process.env.X402_PRICE || '5000'),
  resourcePath: '/api/passport',
  description: DESCRIPTION,
  serviceName: 'CYRE Guardian',
  tags: ['risk', 'fraud', 'solana', 'wallet', 'security', 'attestation', 'identity'],
  discovery: DISCOVERY,
  isFree: isCyreSiteRequest
});

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


function buildMintAffinity(tokenAccounts) {
  const byMint = new Map();
  const list = Array.isArray(tokenAccounts) ? tokenAccounts : [];
  for (const acc of list) {
    const info = acc && acc.account && acc.account.data && acc.account.data.parsed && acc.account.data.parsed.info;
    if (!info || !info.mint) continue;
    const amountRaw = info.tokenAmount && info.tokenAmount.amount;
    let amount = 0;
    if (typeof amountRaw === 'string') amount = Number(amountRaw);
    else if (typeof amountRaw === 'number') amount = amountRaw;
    const prev = byMint.get(info.mint) || { touch: false, hold: false };
    prev.touch = true;
    if (amount > 0) prev.hold = true;
    byMint.set(info.mint, prev);
  }
  return SEED_MINTS.map(({ symbol, mint }) => {
    const hit = byMint.get(mint);
    return {
      symbol,
      mint,
      hold: !!(hit && hit.hold),
      touch: !!(hit && hit.touch)
    };
  });
}

function buildMeasured(address, list, bal, mintAffinity) {
  const now = Math.floor(Date.now() / 1000);
  const sol = (bal && typeof bal.value === 'number' ? bal.value : 0) / 1e9;
  const fetchedAt = new Date().toISOString();

  if (!list.length) {
    return {
      version: 1,
      kind: 'cyre-passport',
      address,
      fetchedAt,
      empty: true,
      score: null,
      riskLevel: null,
      profile: {
        ageDays: 0,
        ageIsMinimum: false,
        idleDays: 0,
        transactionsSeen: 0,
        last24h: 0,
        failedPercent: 0,
        longestGapDays: 0,
        balanceSol: Number(sol.toFixed(4))
      },
      signals: [],
      signalsTriggered: 0,
      signalsEvaluated: 0,
      mintAffinity: mintAffinity || [],
      window: {
        signaturesLimit: 1000,
        signaturesFetched: 0,
        lastChecked: fetchedAt
      },
      message: 'No transaction history found for this address.',
      disclaimer: DISCLAIMER
    };
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
      ? signal(
          'age',
          'Wallet age',
          0,
          false,
          ageDays < 1
            ? 'Too active to date — the 1,000 most recent transactions all landed within a day; first activity is older than this window reaches'
            : `Active for at least ${ageDays} days — history runs deeper than the 1,000-transaction window`
        )
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
      ? signal(
          'failures',
          'Failed transactions',
          18,
          true,
          `${Math.round(failRate * 100)}% of recent transactions failed — often automated behaviour`
        )
      : signal(
          'failures',
          'Failed transactions',
          0,
          false,
          `${Math.round(failRate * 100)}% of recent transactions failed`
        )
  );

  signals.push(
    gapDays >= 90 && idleDays < 7
      ? signal('dormant', 'Dormant then active', 20, true, `Was inactive for ${gapDays} days, then moved again recently`)
      : signal(
          'dormant',
          'Dormant then active',
          0,
          false,
          gapDays ? `Longest quiet stretch was ${gapDays} days` : 'Activity is continuous'
        )
  );

  signals.push(
    sol < 0.01 && list.length > 20
      ? signal(
          'balance',
          'Balance vs activity',
          14,
          true,
          `Holds ${sol.toFixed(4)} SOL despite ${list.length}+ recent transactions — pass-through pattern`
        )
      : signal('balance', 'Balance vs activity', 0, false, `Holds ${sol.toFixed(4)} SOL`)
  );

  signals.push(
    list.length < 5
      ? signal(
          'history',
          'Transaction history',
          10,
          true,
          `Only ${list.length} transaction${list.length === 1 ? '' : 's'} on record`
        )
      : signal(
          'history',
          'Transaction history',
          0,
          false,
          capped ? '1,000+ recent transactions' : `${list.length} transactions on record`
        )
  );

  const score = Math.min(
    signals.reduce((s, x) => s + x.points, 0),
    100
  );
  const riskLevel = score < 30 ? 'LOW' : score < 70 ? 'MEDIUM' : 'HIGH';

  return {
    version: 1,
    kind: 'cyre-passport',
    address,
    fetchedAt,
    empty: false,
    score,
    riskLevel,
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
    signals,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signalsEvaluated: signals.length,
    mintAffinity: mintAffinity || [],
    window: {
      signaturesLimit: 1000,
      signaturesFetched: list.length,
      lastChecked: fetchedAt
    },
    disclaimer: DISCLAIMER
  };
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
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'That does not look like a Solana address.',
      disclaimer: DISCLAIMER
    });
  }

  // ----- x402 gate, verify + settle step (paid callers only) -----
  if (hasPayment) {
    const gate = await x402Gate(req);
    if (applyX402Result(res, gate)) return;
  }

  try {
    const [sigs, bal, tokenAccounts] = await Promise.all([
      rpc('getSignaturesForAddress', [address, { limit: 1000 }]),
      rpc('getBalance', [address]),
      rpc('getTokenAccountsByOwner', [
        address,
        { programId: TOKEN_PROGRAM },
        { encoding: 'jsonParsed' }
      ]).catch(() => null)
    ]);
    const list = Array.isArray(sigs) ? sigs : [];
    const accounts =
      tokenAccounts && Array.isArray(tokenAccounts.value)
        ? tokenAccounts.value
        : Array.isArray(tokenAccounts)
          ? tokenAccounts
          : [];
    const mintAffinity = buildMintAffinity(accounts);
    const passport = buildMeasured(address, list, bal, mintAffinity);

    // Signed, expiring attestation (null when PASSPORT_SIGNING_KEY is not set — never blocks the passport).
    const signed = passport.empty ? { attestation: null, token: null, unsigned: 'no history to attest' } : attest(passport);
    if (signed.token) res.setHeader('X-Guardian-Passport', signed.token);

    res.setHeader('Cache-Control', 'no-store'); // fresh measured passport only — never CDN-reuse
    return res.status(200).json({
      ok: true,
      ...passport,
      attestation: signed.attestation,
      ...(signed.unsigned ? { unsigned: signed.unsigned } : {}),
      verify: 'https://cyre.dev/api/passport/verify',
      issuerPublicKey: issuerPublicKey()
    });
  } catch (e) {
    console.error('passport', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not read chain data right now. Try again in a moment.',
      mintAffinity: [],
      disclaimer: DISCLAIMER
    });
  }
}

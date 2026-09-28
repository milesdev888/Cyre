// api/forensics.js — CYRE Forensics v1
// General RWA forensics from measured 1k-sig window (same as Watch/Passport).
// Mint affinity: per-seed getTokenAccountsByOwner (avoids CEX token-dump OOM).
// No LLM in the hot path. Patterns, not verdicts. No invented metrics.
// Env: SOLANA_RPC (same as /api/address)

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAY = 86400;
const HOUR = 3600;
const DISCLAIMER = 'Patterns, not verdicts.';

// SPEC Watch seed mints — hold/touch affinity only (no weights/scores).
const SEED_MINTS = [
  { symbol: 'USDY', mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6' },
  { symbol: 'OUSG', mint: 'i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc' },
  { symbol: 'syrupUSDC', mint: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj' },
  { symbol: 'AAPLx', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
  { symbol: 'TSLAx', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' },
  { symbol: 'SPYx', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' }
];

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


function buildForensics(address, list, bal, mintAffinity) {
  const now = Math.floor(Date.now() / 1000);
  const sol = (bal && typeof bal.value === 'number' ? bal.value : 0) / 1e9;
  const checkedAt = new Date().toISOString();

  if (!list.length) {
    return {
      version: 1,
      kind: 'cyre-forensics',
      address,
      checkedAt,
      empty: true,
      balanceSol: Number(sol.toFixed(4)),
      counters: {
        transactionsSeen: 0,
        last24h: 0,
        lastHour: 0,
        failedPercent: 0,
        patternsTriggered: 0
      },
      patterns: [],
      deferred: [
        {
          id: 'collateral_loop',
          pattern: 'collateral loop',
          evaluated: false,
          detail: 'Named in SPEC; not evaluated in v1 (needs deeper program traces).'
        },
        {
          id: 'transfer_hook_friction',
          pattern: 'transfer-hook friction',
          evaluated: false,
          detail: 'Named in SPEC; not evaluated in v1.'
        }
      ],
      mintAffinity: mintAffinity || [],
      window: { signaturesLimit: 1000, signaturesFetched: 0 },
      message: 'No transaction history found for this address.',
      disclaimer: DISCLAIMER
    };
  }

  const times = list.map((s) => s.blockTime).filter(Boolean).sort((a, b) => a - b);
  const latest = times[times.length - 1] || now;
  const idleDays = Math.floor((now - latest) / DAY);

  const last24 = times.filter((t) => now - t < DAY).length;
  const lastHour = times.filter((t) => now - t < HOUR).length;
  const failed = list.filter((s) => s.err).length;
  const failsHour = list.filter((s) => s.err && s.blockTime && now - s.blockTime < HOUR).length;
  const failRate = list.length ? failed / list.length : 0;

  let biggestGap = 0;
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > biggestGap) biggestGap = g;
  }
  const gapDays = Math.floor(biggestGap / DAY);

  const dormantTriggered = gapDays >= 90 && idleDays < 7;
  const burstTriggered = lastHour >= 40;
  const failTriggered = lastHour >= 10 && failsHour / lastHour >= 0.4;
  const mintHit = (mintAffinity || []).some((m) => m.hold || m.touch);

  const patterns = [
    {
      id: 'dormant_then_active',
      pattern: 'dormant→active',
      triggered: dormantTriggered,
      detail: dormantTriggered
        ? `Was inactive for ${gapDays} days, then moved again recently.`
        : gapDays
          ? `Longest quiet stretch was ${gapDays} days.`
          : 'Activity is continuous in this window.',
      measured: { longestGapDays: gapDays, idleDays }
    },
    {
      id: 'burst',
      pattern: 'burst',
      triggered: burstTriggered,
      detail: `${lastHour} transactions in the last hour (measured in this run).`,
      measured: { last24h: last24, lastHour }
    },
    {
      id: 'failure_spike',
      pattern: 'failure spike',
      triggered: failTriggered,
      detail: `${Math.round(failRate * 100)}% of recent transactions failed (${failed}/${list.length}).`,
      measured: {
        failedPercent: Math.round(failRate * 100),
        failedCount: failed,
        lastHourFailed: failsHour,
        lastHour
      }
    },
    {
      id: 'mint_affinity',
      pattern: 'mint-affinity',
      triggered: mintHit,
      detail: mintHit
        ? 'Touch or hold detected on at least one SPEC seed RWA mint (no weights).'
        : 'No hold/touch on SPEC seed RWA mints in this run.',
      measured: {
        holdCount: (mintAffinity || []).filter((m) => m.hold).length,
        touchCount: (mintAffinity || []).filter((m) => m.touch).length
      }
    },
    {
      id: 'collateral_loop',
      pattern: 'collateral loop',
      triggered: false,
      evaluated: false,
      detail: 'Named in SPEC; not evaluated in v1 (needs deeper program traces).'
    },
    {
      id: 'transfer_hook_friction',
      pattern: 'transfer-hook friction',
      triggered: false,
      evaluated: false,
      detail: 'Named in SPEC; not evaluated in v1.'
    }
  ];

  const evaluated = patterns.filter((p) => p.evaluated !== false);
  const patternsTriggered = evaluated.filter((p) => p.triggered).length;

  return {
    version: 1,
    kind: 'cyre-forensics',
    address,
    checkedAt,
    empty: false,
    balanceSol: Number(sol.toFixed(4)),
    counters: {
      transactionsSeen: list.length,
      last24h: last24,
      lastHour,
      failedPercent: Math.round(failRate * 100),
      patternsTriggered
    },
    patterns,
    deferred: patterns.filter((p) => p.evaluated === false).map((p) => ({
      id: p.id,
      pattern: p.pattern,
      evaluated: false,
      detail: p.detail
    })),
    mintAffinity: mintAffinity || [],
    window: {
      signaturesLimit: 1000,
      signaturesFetched: list.length
    },
    disclaimer: DISCLAIMER
  };
}

export default async function handler(req, res) {
  const address = String((req.query && req.query.address) || '').trim();

  if (!B58.test(address)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      ok: false,
      error: 'That does not look like a Solana address.',
      disclaimer: DISCLAIMER
    });
  }

  res.setHeader('Cache-Control', 'no-store'); // fresh measured run only — never CDN-reuse

  try {
    // Per-mint affinity only — never dump all token accounts (CEX/hot wallets OOM Vercel
    // → FUNCTION_INVOCATION_FAILED). Same measured hold/touch semantics as before.
    const [sigs, bal] = await Promise.all([
      rpc('getSignaturesForAddress', [address, { limit: 1000 }]),
      rpc('getBalance', [address])
    ]);
    const list = Array.isArray(sigs) ? sigs : [];

    const mintAffinity = await Promise.all(
      SEED_MINTS.map(async ({ symbol, mint }) => {
        try {
          const raw = await rpc('getTokenAccountsByOwner', [
            address,
            { mint },
            { encoding: 'jsonParsed' }
          ]);
          const accounts =
            raw && Array.isArray(raw.value)
              ? raw.value
              : Array.isArray(raw)
                ? raw
                : [];
          let hold = false;
          let touch = false;
          for (const acc of accounts) {
            const info =
              acc &&
              acc.account &&
              acc.account.data &&
              acc.account.data.parsed &&
              acc.account.data.parsed.info;
            if (!info) continue;
            touch = true;
            const amountRaw = info.tokenAmount && info.tokenAmount.amount;
            let amount = 0;
            if (typeof amountRaw === 'string') amount = Number(amountRaw);
            else if (typeof amountRaw === 'number') amount = amountRaw;
            if (amount > 0) hold = true;
          }
          return { symbol, mint, hold, touch };
        } catch (_) {
          return { symbol, mint, hold: false, touch: false };
        }
      })
    );
    const body = buildForensics(address, list, bal, mintAffinity);

    return res.status(200).json({
      ok: true,
      ...body
    });
  } catch (e) {
    console.error('forensics', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: 'Could not read chain data right now. Try again in a moment.',
      mintAffinity: [],
      disclaimer: DISCLAIMER
    });
  }
}

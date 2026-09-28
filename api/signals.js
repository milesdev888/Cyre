// api/signals.js — CYRE Signals v1
// Public RWA pattern feed. Measured only. Patterns, not verdicts. No LLM.
// Mint affinity via per-mint getTokenAccountsByOwner (never full programId dump).
// Env: SOLANA_RPC (same as /api/address)

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAY = 86400;
const HOUR = 3600;
const LIST_CAP = 10;
const NOISY_LAST24 = 200;
const WINDOW_SEC = 15 * 60;
const DISCLAIMER = 'Patterns, not verdicts.';
const KIND = 'cyre-signals';
const VERSION = 1;

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseAddresses(req) {
  const q = (req.query && req.query) || {};
  const single = String(q.address || '').trim();
  const listRaw = String(q.list || '').trim();
  const fromList = listRaw
    ? listRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const all = [];
  const seen = new Set();
  for (const a of [single, ...fromList]) {
    if (!a || seen.has(a)) continue;
    seen.add(a);
    all.push(a);
  }
  return all.slice(0, LIST_CAP);
}

/** Per-mint queries only — never programId dump (OOM risk on CEX wallets). */
async function fetchMintAffinity(address) {
  const out = [];
  for (let i = 0; i < SEED_MINTS.length; i++) {
    const { symbol, mint } = SEED_MINTS[i];
    if (i > 0) await sleep(80);
    let hold = false;
    let touch = false;
    try {
      const result = await rpc('getTokenAccountsByOwner', [
        address,
        { mint },
        { encoding: 'jsonParsed' }
      ]);
      const accounts =
        result && Array.isArray(result.value)
          ? result.value
          : Array.isArray(result)
            ? result
            : [];
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
    } catch (e) {
      // soft-fail one mint; continue remaining seeds
      console.error('signals mint', mint, e && e.message);
    }
    out.push({ symbol, mint, hold, touch });
  }
  return out;
}

function buildPatterns(list, mintAffinity) {
  const now = Math.floor(Date.now() / 1000);
  const times = list.map((s) => s.blockTime).filter(Boolean).sort((a, b) => a - b);
  const latest = times[times.length - 1] || now;
  const idleDays = times.length ? Math.floor((now - latest) / DAY) : 0;

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

  // Watch-family alerts (same thresholds) + mint-affinity
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
          : list.length
            ? 'Activity is continuous in this window.'
            : 'No signatures in this window.',
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
      detail:
        lastHour > 0
          ? `${Math.round((failsHour / lastHour) * 100)}% of last-hour transactions failed (${failsHour}/${lastHour}).`
          : `${Math.round(failRate * 100)}% of recent transactions failed (${failed}/${list.length || 0}).`,
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
    }
  ];

  return {
    patterns,
    last24,
    lastHour,
    failedPercent: Math.round(failRate * 100),
    transactionsSeen: list.length,
    noisy: last24 >= NOISY_LAST24
  };
}

async function signalOne(address) {
  const checkedAt = new Date().toISOString();
  if (!B58.test(address)) {
    return {
      ok: false,
      address,
      error: 'That does not look like a Solana address.',
      patterns: [],
      mintAffinity: [],
      noisy: false,
      checkedAt
    };
  }

  let list = [];
  try {
    const sigs = await rpc('getSignaturesForAddress', [address, { limit: 1000 }]);
    list = Array.isArray(sigs) ? sigs : [];
  } catch (e) {
    console.error('signals sigs', address, e && e.message);
    return {
      ok: false,
      address,
      error: 'Could not read chain data right now. Try again in a moment.',
      patterns: [],
      mintAffinity: [],
      noisy: false,
      checkedAt
    };
  }

  let mintAffinity = SEED_MINTS.map(({ symbol, mint }) => ({
    symbol,
    mint,
    hold: false,
    touch: false
  }));
  try {
    mintAffinity = await fetchMintAffinity(address);
  } catch (e) {
    console.error('signals affinity', address, e && e.message);
  }

  const built = buildPatterns(list, mintAffinity);
  const patternsTriggered = built.patterns.filter((p) => p.triggered).length;

  return {
    ok: true,
    address,
    empty: list.length === 0,
    patterns: built.patterns,
    patternsTriggered,
    mintAffinity,
    noisy: built.noisy,
    counters: {
      transactionsSeen: built.transactionsSeen,
      last24h: built.last24,
      lastHour: built.lastHour,
      failedPercent: built.failedPercent,
      patternsTriggered
    },
    checkedAt
  };
}

export default async function handler(req, res) {
  const addresses = parseAddresses(req);
  const checkedAt = new Date().toISOString();

  res.setHeader('Cache-Control', 'no-store');

  if (!addresses.length) {
    return res.status(200).json({
      ok: true,
      kind: KIND,
      version: VERSION,
      disclaimer: DISCLAIMER,
      window: { seconds: WINDOW_SEC, signaturesLimit: 1000 },
      listCap: LIST_CAP,
      defaultList: [],
      message:
        'Default watchlist is empty until quiet holders are filtered from SPEC seed mints (same as Watch). Pass ?address= or ?list= (comma-separated, max 10).',
      items: [],
      counters: {
        walletsRequested: 0,
        walletsMeasured: 0,
        patternsTriggeredTotal: 0,
        hitsThisRun: 0,
        noisyMarked: 0
      },
      checkedAt
    });
  }

  try {
    const items = [];
    for (let i = 0; i < addresses.length; i++) {
      if (i > 0) await sleep(400);
      try {
        items.push(await signalOne(addresses[i]));
      } catch (e) {
        console.error('signals one', addresses[i], e && e.message);
        items.push({
          ok: false,
          address: addresses[i],
          error: 'Could not read chain data right now. Try again in a moment.',
          patterns: [],
          mintAffinity: [],
          noisy: false,
          checkedAt: new Date().toISOString()
        });
      }
    }

    const measured = items.filter((w) => w.ok);
    const hitsThisRun = measured.filter(
      (w) => (w.patternsTriggered || 0) > 0
    ).length;
    const counters = {
      walletsRequested: addresses.length,
      walletsMeasured: measured.length,
      patternsTriggeredTotal: measured.reduce(
        (n, w) => n + (w.patternsTriggered || 0),
        0
      ),
      hitsThisRun,
      noisyMarked: items.filter((w) => w.noisy).length
    };

    return res.status(200).json({
      ok: true,
      kind: KIND,
      version: VERSION,
      disclaimer: DISCLAIMER,
      window: { seconds: WINDOW_SEC, signaturesLimit: 1000 },
      listCap: LIST_CAP,
      noisyRule: `Marked noisy when last24h >= ${NOISY_LAST24} (skip for quiet watchlists / CEX dumps).`,
      items,
      counters,
      checkedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('signals', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      kind: KIND,
      version: VERSION,
      error: 'Could not read chain data right now. Try again in a moment.',
      disclaimer: DISCLAIMER,
      items: [],
      counters: {
        walletsRequested: addresses.length,
        walletsMeasured: 0,
        patternsTriggeredTotal: 0,
        hitsThisRun: 0,
        noisyMarked: 0
      }
    });
  }
}

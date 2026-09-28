// api/watch.js — CYRE Watch v1
// Cost-safe wallet monitor. Reuses measured address signals (1k-sig window).
// No LLM in the hot path. Patterns, not verdicts.
// Env: SOLANA_RPC (same as /api/address)

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAY = 86400;
const HOUR = 3600;
const LIST_CAP = 10;
const NOISY_LAST24 = 200;
const WINDOW_SEC = 15 * 60;

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

function buildProfile(address, list, bal) {
  const now = Math.floor(Date.now() / 1000);
  const sol = (bal && typeof bal.value === 'number' ? bal.value : 0) / 1e9;

  if (!list.length) {
    return {
      ok: true,
      address,
      empty: true,
      noisy: false,
      balanceSol: sol,
      score: 0,
      riskLevel: 'LOW',
      signals: [],
      signalsTriggered: 0,
      signalsEvaluated: 0,
      alerts: [],
      profile: {
        ageDays: 0,
        ageIsMinimum: false,
        idleDays: 0,
        transactionsSeen: 0,
        last24h: 0,
        lastHour: 0,
        failedPercent: 0,
        longestGapDays: 0,
        balanceSol: Number(sol.toFixed(4))
      },
      message: 'No transaction history found for this address.',
      checkedAt: new Date().toISOString()
    };
  }

  const times = list.map((s) => s.blockTime).filter(Boolean).sort((a, b) => a - b);
  const earliest = times[0] || now;
  const latest = times[times.length - 1] || now;
  const ageDays = Math.floor((now - earliest) / DAY);
  const idleDays = Math.floor((now - latest) / DAY);
  const capped = list.length >= 1000;

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
  const noisy = last24 >= NOISY_LAST24;

  const alerts = [];
  const fresh = now - latest < WINDOW_SEC;

  if (fresh && times.length >= 2) {
    const gap = latest - times[times.length - 2];
    if (gap >= 90 * DAY) {
      alerts.push({
        id: 'dormant_then_active',
        pattern: 'dormant→active',
        detail: `Quiet for ${Math.floor(gap / DAY)} days, then moved again within the watch window.`,
        measuredAt: new Date(latest * 1000).toISOString()
      });
    }
  }

  if (lastHour >= 40) {
    alerts.push({
      id: 'activity_burst',
      pattern: 'burst',
      detail: `${lastHour} transactions in the last hour (measured in this run).`,
      measuredAt: new Date().toISOString()
    });
  }

  if (lastHour >= 10 && failsHour / lastHour >= 0.4) {
    alerts.push({
      id: 'failure_spike',
      pattern: 'failure spike',
      detail: `${Math.round((failsHour / lastHour) * 100)}% of last-hour transactions failed (${failsHour}/${lastHour}).`,
      measuredAt: new Date().toISOString()
    });
  }

  return {
    ok: true,
    address,
    empty: false,
    noisy,
    score,
    riskLevel,
    signals,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signalsEvaluated: signals.length,
    alerts,
    profile: {
      ageDays,
      ageIsMinimum: capped,
      idleDays,
      transactionsSeen: list.length,
      last24h: last24,
      lastHour,
      failedPercent: Math.round(failRate * 100),
      longestGapDays: gapDays,
      balanceSol: Number(sol.toFixed(4))
    },
    checkedAt: new Date().toISOString()
  };
}

async function watchOne(address) {
  if (!B58.test(address)) {
    return {
      ok: false,
      address,
      error: 'That does not look like a Solana address.'
    };
  }

  const [sigs, bal] = await Promise.all([
    rpc('getSignaturesForAddress', [address, { limit: 1000 }]),
    rpc('getBalance', [address])
  ]);
  const list = Array.isArray(sigs) ? sigs : [];
  return buildProfile(address, list, bal);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // fresh measured run only — never CDN-reuse counters/alerts
  const addresses = parseAddresses(req);

  if (!addresses.length) {
    return res.status(400).json({
      ok: false,
      error: 'Provide ?address= or ?list= (comma-separated, max 10). Default watchlist is empty.',
      disclaimer: 'Patterns, not verdicts.',
      defaultList: [],
      listCap: LIST_CAP
    });
  }

  try {
    const wallets = [];
    for (let i = 0; i < addresses.length; i++) {
      if (i > 0) await sleep(400);
      try {
        wallets.push(await watchOne(addresses[i]));
      } catch (e) {
        console.error('watch one', addresses[i], e && e.message);
        wallets.push({
          ok: false,
          address: addresses[i],
          error: 'Could not read chain data right now. Try again in a moment.'
        });
      }
    }

    const measured = wallets.filter((w) => w.ok && !w.empty);
    const counters = {
      walletsRequested: addresses.length,
      walletsMeasured: measured.length,
      signalsTriggeredTotal: measured.reduce((n, w) => n + (w.signalsTriggered || 0), 0),
      alertsThisRun: measured.reduce((n, w) => n + ((w.alerts && w.alerts.length) || 0), 0),
      transactionsSeenTotal: measured.reduce(
        (n, w) => n + ((w.profile && w.profile.transactionsSeen) || 0),
        0
      ),
      noisyMarked: wallets.filter((w) => w.noisy).length
    };

    return res.status(200).json({
      ok: true,
      disclaimer: 'Patterns, not verdicts. Counters are from this measured run only.',
      windowSeconds: WINDOW_SEC,
      listCap: LIST_CAP,
      noisyRule: `Marked noisy when last24h >= ${NOISY_LAST24} (skip for quiet watchlists / CEX dumps).`,
      counters,
      wallets,
      checkedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('watch', e && e.message);
    return res.status(200).json({
      ok: false,
      error: 'Could not read chain data right now. Try again in a moment.',
      disclaimer: 'Patterns, not verdicts.'
    });
  }
}

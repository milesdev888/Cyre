// api/_badge-qualify.js — Phase 2: qualifying paths for Guardian badges.
// Paths: lifetime | timed | established | none
// ESTABLISHED (all required; age alone never qualifies):
//   deployed ≥2y, ≥3 independent pools, ≥$100k liquidity,
//   maxPoolShare ≤50% UNLESS liquidity outside the largest pool ≥ $2M
//   (and poolCount ≥ 3) — then the majority-pool check is waived,
//   no mint/freeze/owner powers, no revocation history.
//
// Age source: explorer contract_age (never DexScreener pool age).

/** @typedef {'lifetime'|'timed'|'established'|'none'} QualifyPath */

/**
 * @typedef {object} QualifyResult
 * @property {boolean} eligible
 * @property {QualifyPath} path
 * @property {string} pathLabel
 * @property {string} pathFamily  secured | established | none
 * @property {string} reason
 * @property {string|null} lpTier
 * @property {boolean} lifetimeEligible
 * @property {boolean} badgeEligible
 * @property {string|null} unlockAt
 * @property {string|null} expiresAt
 * @property {string|null} grade
 * @property {number|null} score
 * @property {string|null} symbol
 * @property {string|null} name
 * @property {string|null} mint
 * @property {string} chainId
 * @property {object} [established]
 */

const DAY_MS = 86_400_000;
const ESTABLISHED_MIN_AGE_DAYS = 730; // ≥ 2 years
const ESTABLISHED_MIN_POOLS = 3;
const ESTABLISHED_MIN_LIQUIDITY_USD = 100_000;

/** Max single-pool share when the outside-largest waiver does not apply. */
export const ESTABLISHED_MAX_POOL_SHARE = 0.5;
/**
 * Waive maxPoolShare ≤ 50% only when liquidity OUTSIDE the largest pool
 * is at least this USD amount AND poolCount ≥ ESTABLISHED_MIN_POOLS.
 * Total liquidity alone is not enough (Mog-shaped books stay refused).
 */
export const ESTABLISHED_MAJORITY_WAIVER_OUTSIDE_USD = 2_000_000;

function formatUsdShort(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

/**
 * Whether the majority-pool check is waived for this book.
 * @param {{ poolCount: number, outsideLargestPoolUsd: number }} stats
 */
export function majorityShareWaived(stats) {
  const pools = Number(stats?.poolCount) || 0;
  const outside = Number(stats?.outsideLargestPoolUsd) || 0;
  return pools >= ESTABLISHED_MIN_POOLS && outside >= ESTABLISHED_MAJORITY_WAIVER_OUTSIDE_USD;
}

export const QUALIFY_PATHS = {
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    family: 'secured',
    detail: 'LP burned or protocol-level permanent lock (e.g. Meteora DAMM v2).'
  },
  timed: {
    id: 'timed',
    label: 'Timed',
    family: 'secured',
    detail: 'Known timed locker with ≥ 90 days remaining. Eligibility expires at unlock.'
  },
  established: {
    id: 'established',
    label: 'Established',
    family: 'established',
    detail:
      'Deployed ≥2 years, ≥3 independent pools, ≥$100K liquidity, max pool share ≤50% unless ≥$2M sits outside the largest pool (then majority check waived), no mint/freeze/owner powers, no revocation history. Age alone never qualifies.'
  }
};

const FAIL = (partial) => ({
  eligible: false,
  path: 'none',
  pathLabel: 'None',
  pathFamily: 'none',
  reason: partial.reason || 'not eligible',
  lpTier: partial.lpTier ?? null,
  lifetimeEligible: false,
  badgeEligible: false,
  unlockAt: partial.unlockAt ?? null,
  expiresAt: null,
  grade: partial.grade ?? null,
  score: partial.score ?? null,
  symbol: partial.symbol ?? null,
  name: partial.name ?? null,
  mint: partial.mint ?? null,
  chainId: partial.chainId || 'solana',
  established: partial.established
});

function daysUntil(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return null;
  return ms / DAY_MS;
}

function daysAgo(ts) {
  if (ts == null) return null;
  let ms;
  if (typeof ts === 'number') {
    if (!Number.isFinite(ts) || ts <= 0) return null;
    ms = ts < 10_000_000_000 ? ts * 1000 : ts;
  } else if (typeof ts === 'string' && /^0x[0-9a-f]+$/i.test(ts.trim())) {
    return null;
  } else {
    ms = Date.parse(String(ts));
  }
  if (!Number.isFinite(ms)) return null;
  if (ms < Date.parse('2015-01-01') || ms > Date.now() + DAY_MS) return null;
  return (Date.now() - ms) / DAY_MS;
}

export function pathLabel(path) {
  if (path === 'lifetime') return 'Lifetime';
  if (path === 'timed') return 'Timed';
  if (path === 'established') return 'Established';
  return 'None';
}

export function pathFamily(path) {
  if (path === 'lifetime' || path === 'timed') return 'secured';
  if (path === 'established') return 'established';
  return 'none';
}

/** Seal / presentation mark: SECURED | ESTABLISHED (equal prestige). */
export function pathMark(familyOrPath) {
  const raw = String(familyOrPath || '').toLowerCase();
  if (raw === 'established') return 'ESTABLISHED';
  if (raw === 'secured' || raw === 'lifetime' || raw === 'timed') return 'SECURED';
  const fam = pathFamily(raw);
  if (fam === 'established') return 'ESTABLISHED';
  if (fam === 'secured') return 'SECURED';
  return null;
}

/**
 * Extract the first Guardian report from a scan API payload or a bare report.
 * @param {any} payload
 */
export function extractScanReport(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.schema === 'guardian.report.v2') return payload;
  if (Array.isArray(payload.reports) && payload.reports[0]) return payload.reports[0];
  if (payload.report && payload.report.schema === 'guardian.report.v2') return payload.report;
  return null;
}

function tokenAgeDays(report) {
  // Prefer explorer contract_age evidence — never pool age for Established.
  const ageCheck = (report.checks || []).find((c) => c && c.id === 'contract_age');
  if (ageCheck && typeof ageCheck.evidence?.ageDays === 'number' && Number.isFinite(ageCheck.evidence.ageDays)) {
    const src = String(ageCheck.evidence?.source || '');
    // Reject known-bad / pool-sourced ages if labeled; accept explorer or unlabeled pass grades.
    if (src !== 'dexscreener' && ageCheck.evidence.ageDays >= 0) {
      return ageCheck.evidence.ageDays;
    }
  }
  if (ageCheck && ageCheck.evidence?.createdAt != null) {
    const fromCreated = daysAgo(ageCheck.evidence.createdAt);
    if (fromCreated != null && fromCreated < 20000) return fromCreated; // reject hex-garbage ages
  }
  if (ageCheck && typeof ageCheck.summary === 'string') {
    const years = ageCheck.summary.match(/([\d.]+)\s*years?\s*old/i);
    if (years) return Number(years[1]) * 365;
    const days = ageCheck.summary.match(/(\d+)\s*days?\s*old/i);
    if (days) return Number(days[1]);
  }
  // Last resort: oldest pool — only when contract_age is absent entirely.
  const pools = Array.isArray(report.pools) ? report.pools : [];
  const created = pools
    .map((p) => p && p.createdAt)
    .filter((v) => v != null)
    .map((v) => (typeof v === 'number' ? (v < 10_000_000_000 ? v * 1000 : v) : Date.parse(String(v))))
    .filter((n) => Number.isFinite(n) && n > Date.parse('2015-01-01') && n < Date.now() + DAY_MS);
  if (created.length) {
    return daysAgo(Math.min(...created));
  }
  return null;
}

/**
 * Independent pools + liquidity concentration for ESTABLISHED.
 * @param {any} report
 */
export function analyzePools(report) {
  const pools = Array.isArray(report.pools) ? report.pools : [];
  const rows = pools
    .map((p) => ({
      dex: String(p?.dex || p?.dexId || 'unknown').toLowerCase(),
      pair: String(p?.pairAddress || p?.address || ''),
      liquidityUsd: Number(p?.liquidityUsd) || 0
    }))
    .filter((p) => p.liquidityUsd > 0 || p.pair);

  // Independent = unique pair address when present, else dex+index
  const seen = new Set();
  const independent = [];
  for (const row of rows) {
    const key = row.pair || `${row.dex}:${independent.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    independent.push(row);
  }

  const total = independent.reduce((s, r) => s + r.liquidityUsd, 0);
  const maxPoolLiquidityUsd =
    independent.length > 0 ? Math.max(...independent.map((r) => r.liquidityUsd)) : 0;
  const outsideLargestPoolUsd = Math.max(0, total - maxPoolLiquidityUsd);
  const maxShare = total > 0 ? maxPoolLiquidityUsd / total : 1;
  const waived = majorityShareWaived({
    poolCount: independent.length,
    outsideLargestPoolUsd
  });
  const underCap = independent.length >= 2 && maxShare <= ESTABLISHED_MAX_POOL_SHARE;
  return {
    poolCount: independent.length,
    totalLiquidityUsd: total,
    maxPoolLiquidityUsd,
    outsideLargestPoolUsd,
    maxPoolShare: maxShare,
    majorityWaived: waived,
    noSingleMajority: waived || underCap,
    pools: independent
  };
}

/**
 * @param {any} report
 * @param {{ hasRevocationHistory?: boolean }} [opts]
 */
export function evaluateEstablished(report, opts = {}) {
  const ageDays = tokenAgeDays(report);
  const pools = analyzePools(report);
  const ownerCheck = (report.checks || []).find((c) => c && c.id === 'owner_privileges');
  const authoritiesClean = !(ownerCheck && ownerCheck.status === 'flag');
  const ageOk = ageDays != null && ageDays >= ESTABLISHED_MIN_AGE_DAYS;
  const poolsOk = pools.poolCount >= ESTABLISHED_MIN_POOLS;
  const liqOk = pools.totalLiquidityUsd >= ESTABLISHED_MIN_LIQUIDITY_USD;
  const majorityOk = pools.noSingleMajority;
  const revocationOk = !opts.hasRevocationHistory;

  const checks = {
    ageDays,
    ageOk,
    poolCount: pools.poolCount,
    poolsOk,
    totalLiquidityUsd: pools.totalLiquidityUsd,
    liqOk,
    maxPoolLiquidityUsd: pools.maxPoolLiquidityUsd,
    outsideLargestPoolUsd: pools.outsideLargestPoolUsd,
    maxPoolShare: pools.maxPoolShare,
    majorityWaived: pools.majorityWaived,
    majorityOk,
    authoritiesClean,
    revocationOk
  };

  // Age alone never qualifies — require every criterion.
  const eligible =
    ageOk && poolsOk && liqOk && majorityOk && authoritiesClean && revocationOk;

  // Path B fail copy — never "LP unlocked" / lock-centric wording.
  // Authorities before majority so Mog-shaped authority flags surface first.
  let reason = 'established path';
  if (!eligible) {
    if (!authoritiesClean) reason = 'mint or freeze authority still live';
    else if (!revocationOk) reason = 'revocation history on record';
    else if (!majorityOk) {
      const pct = Math.round((pools.maxPoolShare || 0) * 100);
      reason = `largest pool ${pct}% of ${formatUsdShort(pools.totalLiquidityUsd)} liquidity (outside largest ${formatUsdShort(pools.outsideLargestPoolUsd)}; need ≥${formatUsdShort(ESTABLISHED_MAJORITY_WAIVER_OUTSIDE_USD)} outside to waive ≤50% cap)`;
    } else if (!liqOk)
      reason = `total liquidity below $${ESTABLISHED_MIN_LIQUIDITY_USD.toLocaleString('en-US')} (have ${formatUsdShort(pools.totalLiquidityUsd)})`;
    else if (!poolsOk)
      reason = `fewer than ${ESTABLISHED_MIN_POOLS} independent pools (have ${pools.poolCount})`;
    else if (!ageOk) {
      const have = ageDays == null ? 'unknown' : `${Math.floor(ageDays)}d`;
      reason = `on-chain age below ${ESTABLISHED_MIN_AGE_DAYS} days (have ${have})`;
    } else reason = 'established path criteria not met';
  }

  return { eligible, reason, checks, pools };
}

/**
 * Live re-check for an already-issued badge — tests THAT path's bars only.
 * Established badges never fall through Path A (lock) criteria.
 * @param {any} reportOrPayload
 * @param {{ pathFamily?: string, qualifyPath?: string, hasRevocationHistory?: boolean }} [opts]
 */
export function recheckIssuedPath(reportOrPayload, opts = {}) {
  const family = String(opts.pathFamily || pathFamily(opts.qualifyPath) || '').toLowerCase();
  const report = extractScanReport(reportOrPayload) || reportOrPayload;
  if (!report || typeof report !== 'object') {
    return FAIL({ reason: 'no scan report' });
  }

  if (family === 'established') {
    const mint = report.token?.address || null;
    const chainId = report.chain?.id || 'solana';
    const symbol = report.token?.symbol || null;
    const name = report.token?.name || null;
    const grade = report.grade || null;
    const score = typeof report.score === 'number' ? report.score : null;
    const lp = report.lp || {};

    // Fraud flags — Path B live bars
    const checks = report.checks || [];
    const honeypot = checks.find((c) => c && c.id === 'honeypot_simulation');
    const holders = checks.find((c) => c && c.id === 'holder_concentration');
    if (honeypot && honeypot.status === 'flag') {
      return FAIL({
        reason: 'new fraud flag on record (honeypot pattern)',
        grade,
        score,
        symbol,
        name,
        mint,
        chainId,
        lpTier: lp.tier || null
      });
    }
    if (holders && holders.status === 'flag') {
      return FAIL({
        reason: 'new fraud flag on record (holder concentration)',
        grade,
        score,
        symbol,
        name,
        mint,
        chainId,
        lpTier: lp.tier || null
      });
    }

    const est = evaluateEstablished(report, opts);
    if (est.eligible) {
      return {
        eligible: true,
        path: 'established',
        pathLabel: 'Established',
        pathFamily: 'established',
        reason: 'Still qualifies · Established path',
        lpTier: lp.tier || null,
        lifetimeEligible: false,
        badgeEligible: true,
        unlockAt: null,
        expiresAt: null,
        grade,
        score,
        symbol,
        name,
        mint,
        chainId,
        established: est.checks
      };
    }
    return FAIL({
      reason: est.reason,
      grade,
      score,
      symbol,
      name,
      mint,
      chainId,
      lpTier: lp.tier || null,
      established: est.checks
    });
  }

  // Secured (and unknown) — full path ladder
  return qualifyFromScan(reportOrPayload, opts);
}

/**
 * Qualify a Guardian scan report for badge issuance / live re-check.
 * @param {any} reportOrPayload
 * @param {{ hasRevocationHistory?: boolean }} [opts]
 * @returns {QualifyResult}
 */
export function qualifyFromScan(reportOrPayload, opts = {}) {
  const report = extractScanReport(reportOrPayload) || reportOrPayload;
  if (!report || typeof report !== 'object') {
    return FAIL({ reason: 'no scan report' });
  }

  const mint = report.token?.address || report.address || null;
  const chainId = report.chain?.id || report.chainId || 'solana';
  const symbol = report.token?.symbol || null;
  const name = report.token?.name || null;
  const grade = report.grade || null;
  const score = typeof report.score === 'number' ? report.score : null;
  const lp = report.lp || {};
  const lpTier = lp.tier || null;
  const unlockAt = lp.unlockAt || null;
  const lifetimeEligible = Boolean(lp.lifetimeEligible);
  const badgeEligible = Boolean(lp.badgeEligible);

  const base = {
    lpTier,
    unlockAt,
    grade,
    score,
    symbol,
    name,
    mint,
    chainId
  };

  // Authority gate for secured paths.
  const ownerCheck = (report.checks || []).find((c) => c && c.id === 'owner_privileges');
  const authoritiesLive = ownerCheck && ownerCheck.status === 'flag';

  // 1) Lifetime (secured)
  if (!authoritiesLive && (lifetimeEligible || lpTier === 'BURNED' || lpTier === 'PERMANENT')) {
    if (badgeEligible || lpTier === 'BURNED' || lpTier === 'PERMANENT') {
      return {
        eligible: true,
        path: 'lifetime',
        pathLabel: 'Lifetime',
        pathFamily: 'secured',
        reason: `lifetime path · LP ${lpTier || 'locked'}`,
        lpTier,
        lifetimeEligible: true,
        badgeEligible: true,
        unlockAt: null,
        expiresAt: null,
        grade,
        score,
        symbol,
        name,
        mint,
        chainId
      };
    }
  }

  // 2) Timed (secured)
  if (!authoritiesLive && (lpTier === 'TIMED' || (badgeEligible && unlockAt))) {
    const remaining = daysUntil(unlockAt);
    if (remaining !== null && remaining >= 90) {
      return {
        eligible: true,
        path: 'timed',
        pathLabel: 'Timed',
        pathFamily: 'secured',
        reason: `timed path · unlock ${String(unlockAt).slice(0, 10)}`,
        lpTier: lpTier || 'TIMED',
        lifetimeEligible: false,
        badgeEligible: true,
        unlockAt,
        expiresAt: unlockAt,
        grade,
        score,
        symbol,
        name,
        mint,
        chainId
      };
    }
  }

  // 3) Established — all criteria; age alone never qualifies
  const est = evaluateEstablished(report, opts);
  if (est.eligible) {
    return {
      eligible: true,
      path: 'established',
      pathLabel: 'Established',
      pathFamily: 'established',
      reason: est.reason,
      lpTier,
      lifetimeEligible: false,
      badgeEligible: true,
      unlockAt: null,
      expiresAt: null,
      grade,
      score,
      symbol,
      name,
      mint,
      chainId,
      established: est.checks
    };
  }

  if (authoritiesLive) {
    return FAIL({
      ...base,
      reason: 'mint or freeze authority still live',
      established: est.checks
    });
  }

  // Prefer the most informative failure reason
  if (lpTier === 'TIMED') {
    const remaining = daysUntil(unlockAt);
    if (remaining === null) {
      return FAIL({
        ...base,
        reason: 'timed path requires a public unlock date ≥ 90 days out',
        established: est.checks
      });
    }
    if (remaining < 90) {
      return FAIL({
        ...base,
        reason: `timed unlock too soon (${Math.floor(remaining)}d remaining; need ≥ 90d)`,
        established: est.checks
      });
    }
  }

  return FAIL({
    ...base,
    reason: est.reason || (lpTier
      ? `LP tier ${lpTier} is not a qualifying path`
      : 'no qualifying path (lifetime, timed ≥90d, or established)'),
    established: est.checks
  });
}

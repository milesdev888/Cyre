// api/_token-risk.js — Rug-risk v2 helpers for /api/token
// Parses RugCheck markets/lockers/holders + light deployer age via RPC.
// Never uses RugCheck's composite risk score / "rugged" label as our score.

import { LOCKERS } from './_lockers.js';

function lockersConfig() {
  return LOCKERS;
}

function burnSet() {
  return new Set((lockersConfig().burnAddresses || []).map(String));
}

function lockerNameFor(programId, type) {
  const cfg = lockersConfig();
  if (type && cfg.lockerTypes && cfg.lockerTypes[type]) return cfg.lockerTypes[type];
  const hit = (cfg.lockerPrograms || []).find((p) => p.id === programId);
  return (hit && hit.name) || type || 'Known locker';
}

function isPoolOrBurn(address, owner, knownAccounts) {
  const burns = burnSet();
  if (burns.has(address) || burns.has(owner)) return 'burn';
  const ka = (knownAccounts && (knownAccounts[owner] || knownAccounts[address])) || null;
  if (!ka) return null;
  const type = String(ka.type || '').toUpperCase();
  const name = String(ka.name || '');
  if (/BURN|INCINERATOR|DEAD/i.test(name) || type === 'BURN') return 'burn';
  if (type === 'LOCKER' || /lock/i.test(name)) return 'locker';
  const poolTypes = lockersConfig().poolAccountTypes || [];
  if (poolTypes.includes(type) || /AMM|POOL|VAULT|MARKET|LP/i.test(type + ' ' + name)) return 'pool';
  return null;
}

/**
 * Liquidity lock / burn from deepest market + lockers map.
 * @returns {{ measured:boolean, lockedPct:number|null, burnedPct:number|null, freePct:number|null,
 *   unlockDate:string|null, lockerName:string|null, poolType:string|null, poolUsd:number|null }}
 */
export function extractLiquidity(report) {
  const empty = {
    measured: false,
    lockedPct: null,
    burnedPct: null,
    freePct: null,
    unlockDate: null,
    lockerName: null,
    poolType: null,
    poolUsd: null
  };
  if (!report || typeof report !== 'object') return empty;

  const markets = Array.isArray(report.markets) ? report.markets.filter((m) => m && m.lp) : [];
  markets.sort((a, b) => {
    const ua = (a.lp.quoteUSD || 0) + (a.lp.baseUSD || 0);
    const ub = (b.lp.quoteUSD || 0) + (b.lp.baseUSD || 0);
    return ub - ua;
  });
  const top = markets[0];
  if (!top || !top.lp) return empty;

  const lp = top.lp;
  const poolUsd = (lp.quoteUSD || 0) + (lp.baseUSD || 0);
  let lockedPct = Number(lp.lpLockedPct);
  if (!Number.isFinite(lockedPct)) lockedPct = null;

  const burns = burnSet();
  const known = report.knownAccounts || {};
  let burnedFromHolders = 0;
  let lockedFromHolders = 0;
  for (const h of lp.holders || []) {
    const kind = isPoolOrBurn(h.address, h.owner, known);
    const pct = Number(h.pct) || 0;
    if (kind === 'burn' || burns.has(h.address) || burns.has(h.owner)) burnedFromHolders += pct;
    else if (kind === 'locker') lockedFromHolders += pct;
  }

  // Prefer explicit lockers map for unlock / name.
  const lockerEntries = Object.values(report.lockers || {});
  let unlockDate = null;
  let lockerName = null;
  let earliestUnlock = null;
  for (const L of lockerEntries) {
    if (!lockerName) lockerName = lockerNameFor(L.programID, L.type);
    const ud = Number(L.unlockDate) || 0;
    if (ud > 0) {
      if (earliestUnlock == null || ud < earliestUnlock) earliestUnlock = ud;
    }
  }
  if (earliestUnlock) unlockDate = new Date(earliestUnlock * 1000).toISOString();

  let burnedPct = burnedFromHolders;
  let lockedOnly = lockedFromHolders;

  // When RugCheck reports aggregate lock % but holder breakdown is thin,
  // treat lpLockedPct as locked+burned liquidity.
  if (lockedPct != null && burnedPct + lockedOnly < lockedPct * 0.5) {
    // Aggregate lock % is authoritative when holder breakdown under-counts.
    lockedOnly = Math.max(lockedOnly, lockedPct - burnedPct);
    if (!lockerName && lockerEntries.length) {
      lockerName = lockerNameFor(lockerEntries[0].programID, lockerEntries[0].type);
    }
  }

  lockedPct = Math.min(100, Math.max(0, +(lockedOnly).toFixed(2)));
  burnedPct = Math.min(100, Math.max(0, +(burnedPct).toFixed(2)));
  let freePct = 100 - lockedPct - burnedPct;
  if (lp.lpUnlocked != null && lp.lpTotalSupply) {
    const fromSupply = (Number(lp.lpUnlocked) / Number(lp.lpTotalSupply)) * 100;
    if (Number.isFinite(fromSupply)) freePct = fromSupply;
  }
  freePct = Math.min(100, Math.max(0, +freePct.toFixed(2)));

  // If aggregate says nearly all locked but our split under-counts, trust aggregate for UI %.
  const lockedBurned = lockedPct + burnedPct;
  const aggregate = Number(lp.lpLockedPct);
  if (Number.isFinite(aggregate) && aggregate > lockedBurned + 5) {
    const gap = aggregate - lockedBurned;
    lockedPct = Math.min(100, +(lockedPct + gap).toFixed(2));
  }

  return {
    measured: true,
    lockedPct,
    burnedPct,
    freePct,
    unlockDate,
    lockerName,
    poolType: top.marketType || null,
    poolUsd: poolUsd ? +poolUsd.toFixed(2) : null
  };
}

/**
 * Top holders excluding LP pools and burn addresses.
 */
export function holdersExcludingPools(report, fallbackHolders) {
  const rows = Array.isArray(report && report.topHolders) ? report.topHolders : [];
  const known = (report && report.knownAccounts) || {};
  const filtered = [];
  for (const h of rows) {
    const kind = isPoolOrBurn(h.address, h.owner, known);
    if (kind === 'pool' || kind === 'burn' || kind === 'locker') continue;
    const pct = Number(h.pct);
    if (!Number.isFinite(pct) || pct < 0) continue;
    filtered.push(pct);
  }
  filtered.sort((a, b) => b - a);
  if (filtered.length) {
    return {
      top1: Math.min(100, filtered[0] || 0),
      top10: Math.min(100, filtered.slice(0, 10).reduce((s, v) => s + v, 0)),
      holdersMeasured: true,
      holderCount: filtered.length,
      source: 'index-ex-pool',
      name: null,
      symbol: null
    };
  }
  return fallbackHolders || { top1: 0, top10: 0, holdersMeasured: false, holderCount: 0, source: null };
}

/**
 * Best-effort deployer age from signature history (newest→oldest).
 * Single page only — keep scans inside Vercel time limits.
 */
export async function measureDeployer(creator, rpcFn) {
  const out = {
    creator: creator || null,
    tokensDeployed: null,
    ruggedCount: null,
    walletAgeDays: null,
    measured: false
  };
  if (!creator || typeof rpcFn !== 'function') return out;

  try {
    const sigs = await Promise.race([
      rpcFn('getSignaturesForAddress', [creator, { limit: 1000 }]),
      new Promise((_, rej) => setTimeout(() => rej(new Error('deployer-timeout')), 2500))
    ]);
    if (!Array.isArray(sigs) || !sigs.length) return out;
    const oldest = sigs[sigs.length - 1];
    if (oldest && oldest.blockTime) {
      out.walletAgeDays = Math.max(0, Math.floor((Date.now() / 1000 - oldest.blockTime) / 86400));
      out.measured = true;
    }
  } catch (_) { /* leave unmeasured */ }

  return out;
}

export function deployerFromReport(report) {
  return {
    creator: (report && report.creator) || null,
    tokensDeployed: Array.isArray(report && report.creatorTokens) ? report.creatorTokens.length : null,
    ruggedCount: Array.isArray(report && report.creatorTokens)
      ? report.creatorTokens.filter((t) => t && (t.rugged || t.rug || t.lpRemoved)).length
      : null,
    walletAgeDays: null,
    measured: !!(report && report.creator)
  };
}

/**
 * Weighted risk score (higher = more risk). Max ~100.
 * Weights: lock 30 · mint auth 25 · deployer 25 · holders 20
 */
export function buildRiskV2({ mintAuthority, freezeAuthority, liquidity, holders, deployer }) {
  const signals = [];
  const parts = { lock: 0, mint: 0, deployer: 0, holders: 0 };
  let hardCap = false;

  // --- mint / freeze (25%) ---
  if (mintAuthority) {
    parts.mint = 25;
    hardCap = true;
    signals.push({ level: 'high', id: 'mint_authority', text: 'Mint authority active — supply can be inflated' });
  } else {
    signals.push({ level: 'good', id: 'mint_authority', text: 'Mint authority revoked — supply is fixed.' });
  }
  if (freezeAuthority) {
    parts.mint = Math.min(25, parts.mint + 10);
    signals.push({ level: 'high', id: 'freeze_authority', text: 'Freeze authority is ACTIVE — the creator can freeze tokens in wallets.' });
  } else {
    signals.push({ level: 'good', id: 'freeze_authority', text: 'Freeze authority revoked — tokens cannot be frozen.' });
  }

  // --- liquidity lock / burn (30%) ---
  if (liquidity && liquidity.measured) {
    const secured = (liquidity.lockedPct || 0) + (liquidity.burnedPct || 0);
    const free = liquidity.freePct != null ? liquidity.freePct : Math.max(0, 100 - secured);
    if (secured >= 90) {
      parts.lock = 0;
      const label = (liquidity.burnedPct || 0) >= (liquidity.lockedPct || 0)
        ? ((liquidity.burnedPct || 0).toFixed(0) + '% burned')
        : ((liquidity.lockedPct || 0).toFixed(0) + '% locked');
      signals.push({
        level: 'good',
        id: 'lp_lock',
        text: 'LP largely locked (' + label + ')' +
          (liquidity.lockerName ? ' via ' + liquidity.lockerName : '') + '.'
      });
    } else if (secured >= 50) {
      parts.lock = 15;
      signals.push({
        level: 'med',
        id: 'lp_lock',
        text: 'LP partially locked (' + secured.toFixed(0) + '% locked/burned, ' + free.toFixed(0) + '% free).'
      });
    } else {
      parts.lock = 30;
      if (free >= 99 || secured < 1) hardCap = true;
      signals.push({
        level: 'high',
        id: 'lp_lock',
        text: 'LP mostly free (' + free.toFixed(0) + '% unlocked) — liquidity can be pulled.'
      });
    }
    if (liquidity.unlockDate) {
      signals.push({
        level: 'info',
        id: 'lp_unlock',
        text: 'Earliest measured unlock: ' + liquidity.unlockDate +
          (liquidity.lockerName ? ' (' + liquidity.lockerName + ')' : '') +
          '. A lock that expires soon is not a lasting lock.'
      });
    }
  } else {
    parts.lock = 10;
    signals.push({ level: 'info', id: 'lp_lock', text: 'LP lock status not measured this run — verify on the pool page before sizing.' });
  }

  // --- deployer history (25%) ---
  if (deployer && deployer.creator) {
    const age = deployer.walletAgeDays;
    const deployed = deployer.tokensDeployed;
    const rugged = deployer.ruggedCount;
    if (deployed != null && rugged != null) {
      if (rugged >= 2 || (deployed >= 3 && rugged >= 1)) {
        parts.deployer = 25;
        signals.push({
          level: 'high',
          id: 'deployer',
          text: 'Deployer history: ' + deployed + ' prior tokens, ' + rugged + ' measured dead/rugged' +
            (age != null ? ' · wallet age ' + age + 'd' : '') + '.'
        });
      } else if (age != null && age < 14 && deployed >= 1) {
        parts.deployer = 18;
        signals.push({
          level: 'med',
          id: 'deployer',
          text: 'Fresh deployer wallet (' + age + 'd) with ' + deployed + ' prior token(s).'
        });
      } else {
        parts.deployer = Math.min(12, (rugged || 0) * 8);
        signals.push({
          level: parts.deployer >= 8 ? 'med' : 'info',
          id: 'deployer',
          text: 'Deployer: ' + deployed + ' prior tokens' +
            (rugged ? ', ' + rugged + ' flagged' : '') +
            (age != null ? ', age ' + age + 'd' : '') + '.'
        });
      }
    } else if (age != null) {
      if (age < 7) {
        parts.deployer = 18;
        signals.push({ level: 'med', id: 'deployer', text: 'Deployer wallet is very new (' + age + ' days). Prior token history not fully indexed.' });
      } else if (age < 30) {
        parts.deployer = 10;
        signals.push({ level: 'info', id: 'deployer', text: 'Deployer wallet age ' + age + ' days. Prior token count not fully indexed this run.' });
      } else {
        parts.deployer = 0;
        signals.push({ level: 'info', id: 'deployer', text: 'Deployer wallet age ' + age + ' days. Prior token count not fully indexed this run.' });
      }
    } else {
      signals.push({ level: 'info', id: 'deployer', text: 'Deployer identified; age and prior-token history not measured this run.' });
    }
  } else {
    signals.push({ level: 'info', id: 'deployer', text: 'Deployer wallet not identified this run.' });
  }

  // --- holder concentration (20%), LP/burn already excluded when measured ---
  if (holders && holders.holdersMeasured) {
    const top1 = holders.top1;
    const top10 = holders.top10;
    let h = 0;
    if (top1 > 5) {
      h += 12;
      signals.push({
        level: top1 > 15 ? 'high' : 'med',
        id: 'holder_top1',
        text: 'Single non-pool wallet holds ' + top1.toFixed(1) + '% of supply (flag > 5%).'
      });
    }
    if (top10 > 30) {
      h += 8;
      signals.push({
        level: top10 > 50 ? 'high' : 'med',
        id: 'holder_top10',
        text: 'Top 10 non-pool holders control ' + top10.toFixed(1) + '% of supply (flag > 30%).'
      });
    } else if (top10 > 0 && top1 <= 5) {
      signals.push({
        level: 'info',
        id: 'holder_top10',
        text: 'Top 10 non-pool holders control ' + top10.toFixed(1) + '% of supply.'
      });
    }
    parts.holders = Math.min(20, h);
  } else {
    signals.push({ level: 'info', id: 'holders', text: 'Holder concentration not measured this run.' });
  }

  let score = Math.round(parts.lock + parts.mint + parts.deployer + parts.holders);
  if (hardCap) score = Math.max(score, 70);
  score = Math.min(100, score);
  const risk = score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

  return {
    signals,
    score,
    risk,
    scoreMax: 100,
    scoreParts: parts,
    hardCap
  };
}

export { lockersConfig };

// Quick unit tests for token risk v2 helpers (no network).
import assert from 'node:assert/strict';
import { extractLiquidity, holdersExcludingPools, buildRiskV2 } from '../api/_token-risk.js';

const report = {
  knownAccounts: {
    pool1: { name: 'Raydium AMM', type: 'AMM' },
    burn1: { name: 'Incinerator', type: 'BURN' }
  },
  topHolders: [
    { address: 'pool1', owner: 'pool1', pct: 40 },
    { address: 'whale', owner: 'whale', pct: 12 },
    { address: 'a', owner: 'a', pct: 4 },
    { address: 'b', owner: 'b', pct: 3 }
  ],
  markets: [{
    marketType: 'raydium',
    lp: {
      quoteUSD: 100000,
      baseUSD: 100000,
      lpLockedPct: 95,
      lpUnlocked: 5,
      lpTotalSupply: 100,
      holders: [
        { address: '11111111111111111111111111111111', owner: '11111111111111111111111111111111', pct: 90 },
        { address: 'free', owner: 'free', pct: 5 }
      ]
    }
  }],
  lockers: {
    x: { programID: 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn', type: 'jupiter_locker', unlockDate: 1893456000, usdcLocked: 10 }
  },
  creator: 'Creator111111111111111111111111111111111'
};

const liq = extractLiquidity(report);
assert.equal(liq.measured, true);
assert.ok(liq.lockedPct + liq.burnedPct >= 90, 'secured >= 90');
assert.equal(liq.lockerName, 'Jupiter Lock');
assert.ok(liq.unlockDate);

const holders = holdersExcludingPools(report);
assert.equal(holders.holdersMeasured, true);
assert.ok(holders.top1 < 40, 'pool excluded from top1');
assert.ok(holders.top1 >= 12);

const clean = buildRiskV2({
  mintAuthority: null,
  freezeAuthority: null,
  liquidity: liq,
  holders,
  deployer: { creator: 'Creator111111111111111111111111111111111', walletAgeDays: 400, tokensDeployed: null, ruggedCount: null, measured: true }
});
assert.equal(clean.risk, 'LOW');
assert.ok(clean.score < 20);

const hot = buildRiskV2({
  mintAuthority: 'Auth111',
  freezeAuthority: null,
  liquidity: { measured: true, lockedPct: 0, burnedPct: 0, freePct: 100 },
  holders: { holdersMeasured: true, top1: 25, top10: 55 },
  deployer: { creator: 'x', walletAgeDays: 2, tokensDeployed: 4, ruggedCount: 3, measured: true }
});
assert.equal(hot.risk, 'HIGH');
assert.ok(hot.hardCap);
assert.ok(hot.score >= 70);
assert.ok(hot.signals.some((s) => /Mint authority active/.test(s.text)));

console.log('ok token-risk v2 unit tests');

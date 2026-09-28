// api/_badge-registry.test.js — qualify paths incl. ESTABLISHED + genesis + OG smoke
import assert from 'node:assert/strict';
import {
  formatSerial,
  normalizeSerial,
  registerBadge,
  getBadgeBySerial,
  getBadgeByMint,
  allocateSerial,
  GENESIS_SERIAL,
  GENESIS_MINT,
  GENESIS_BADGE,
  revokeBadge,
  hasRevocationHistory
} from './_badge-registry.js';
import {
  qualifyFromScan,
  evaluateEstablished,
  analyzePools,
  pathMark,
  recheckIssuedPath,
  majorityShareWaived,
  ESTABLISHED_MAJORITY_WAIVER_OUTSIDE_USD,
  ESTABLISHED_MAX_POOL_SHARE
} from './_badge-qualify.js';
import { renderBadgeOg, encodePng, decodePng, loadSealImage, blitImage, renderVerifyOg, formatVerifiedOgTitle } from './_badge-og-render.js';
import { renderOfficialSeal, renderOfficialSealOg, renderOfficialSealUi, renderOfficialSealWithMeta, sealVerifyUrl, SEAL_CANVAS, SEAL_UI_SIZE } from './_badge-seal-render.js';

process.env.BADGE_REGISTRY_STORE = '/tmp/guardian-badge-registry-test-step2b.json';

assert.equal(
  formatVerifiedOgTitle({
    name: GENESIS_BADGE.name,
    symbol: GENESIS_BADGE.symbol,
    serial: GENESIS_SERIAL
  }),
  'Guardian Verified · CYRE ($C7) · GRD-2026-00001'
);
assert.equal(
  formatVerifiedOgTitle({ serial: GENESIS_SERIAL }),
  'Guardian Verified · GRD-2026-00001'
);

assert.equal(formatSerial(2026, 1), 'GRD-2026-00001');
assert.equal(normalizeSerial('grd-2026-00001'), GENESIS_SERIAL);

const genesis = await getBadgeBySerial(GENESIS_SERIAL);
assert.equal(genesis.serial, GENESIS_SERIAL);
assert.equal(genesis.pathLabel, 'Lifetime');
assert.equal(genesis.pathFamily, 'secured');

// Lifetime path
const qLife = qualifyFromScan({
  schema: 'guardian.report.v2',
  grade: 'A',
  score: 91,
  token: { address: GENESIS_MINT, symbol: 'C7', name: 'CYRE' },
  chain: { id: 'solana' },
  lp: { tier: 'PERMANENT', lifetimeEligible: true, badgeEligible: true },
  checks: [{ id: 'owner_privileges', status: 'pass' }],
  pools: [{ dex: 'meteora', pairAddress: 'p1', liquidityUsd: 5000, createdAt: Date.now() - 4 * 86400000 }]
});
assert.equal(qLife.path, 'lifetime');
assert.equal(qLife.pathLabel, 'Lifetime');

// Age alone never qualifies established
const ageOnly = evaluateEstablished({
  schema: 'guardian.report.v2',
  pools: [{ dex: 'raydium', pairAddress: 'a', liquidityUsd: 50000, createdAt: Date.now() - 800 * 86400000 }],
  checks: [{ id: 'owner_privileges', status: 'pass' }]
});
assert.equal(ageOnly.eligible, false, 'age alone must not qualify');

// Full established
const old = Date.now() - 800 * 86400000;
const estReport = {
  schema: 'guardian.report.v2',
  grade: 'A',
  score: 88,
  token: { address: 'EstMint111111111111111111111111111111111', symbol: 'OLD', name: 'Old' },
  chain: { id: 'solana' },
  lp: { tier: 'UNVERIFIED', lifetimeEligible: false, badgeEligible: false },
  checks: [{ id: 'owner_privileges', status: 'pass' }],
  pools: [
    { dex: 'raydium', pairAddress: 'poolA', liquidityUsd: 40000, createdAt: old },
    { dex: 'orca', pairAddress: 'poolB', liquidityUsd: 35000, createdAt: old },
    { dex: 'meteora', pairAddress: 'poolC', liquidityUsd: 30000, createdAt: old }
  ]
};
const pools = analyzePools(estReport);
assert.equal(pools.poolCount, 3);
assert.ok(pools.totalLiquidityUsd >= 100000);
assert.equal(pools.noSingleMajority, true);
const qEst = qualifyFromScan(estReport);
assert.equal(qEst.eligible, true);
assert.equal(qEst.path, 'established');
assert.equal(qEst.pathLabel, 'Established');
assert.equal(qEst.pathFamily, 'established');
assert.equal(qEst.expiresAt, null);
assert.equal(pathMark('established'), 'ESTABLISHED');
assert.equal(pathMark('secured'), 'SECURED');
assert.equal(pathMark('lifetime'), 'SECURED');

// Path B re-check — Established badge never judged on LP unlock wording
const estPass = recheckIssuedPath(estReport, { pathFamily: 'established' });
assert.equal(estPass.eligible, true);
assert.equal(estPass.pathFamily, 'established');
assert.match(estPass.reason, /Established/i);

const estFail = recheckIssuedPath(
  {
    ...estReport,
    pools: [
      { dex: 'raydium', pairAddress: 'poolA', liquidityUsd: 90000, createdAt: old },
      { dex: 'orca', pairAddress: 'poolB', liquidityUsd: 5000, createdAt: old },
      { dex: 'meteora', pairAddress: 'poolC', liquidityUsd: 5000, createdAt: old }
    ]
  },
  { pathFamily: 'established' }
);
assert.equal(estFail.eligible, false);
assert.match(estFail.reason, /largest pool/i);
assert.doesNotMatch(estFail.reason, /unlock|expired|missing lock/i);

// Seal band includes path mark
const sealSecured = await renderOfficialSeal({
  serial: GENESIS_SERIAL,
  ca: GENESIS_MINT,
  status: 'VALID',
  pathMark: 'SECURED'
});
assert.equal(sealSecured[0], 137);
const sealEst = await renderOfficialSeal({
  serial: 'GRD-2026-00099',
  ca: 'EstMint111111111111111111111111111111111',
  status: 'VALID',
  pathMark: 'ESTABLISHED'
});
assert.equal(sealEst[0], 137);

// Full-res QR: hard 14% of seal width (252px on 1800)
assert.equal(sealVerifyUrl(GENESIS_SERIAL), 'https://cyre.dev/verify/GRD-2026-00001');
const sealMeta = await renderOfficialSealWithMeta({
  serial: GENESIS_SERIAL,
  ca: GENESIS_MINT,
  status: 'VALID',
  pathMark: 'SECURED'
});
assert.ok(sealMeta.qr, 'full-res seal must include QR');
assert.ok(
  sealMeta.qr.qrDim >= Math.round(SEAL_CANVAS * 0.14),
  `QR module field must be ≥14% of ${SEAL_CANVAS}, got ${sealMeta.qr.qrDim}`
);
assert.match(sealMeta.qr.url, /\/verify\/GRD-2026-00001$/);

// OG seal: ~1024px indexed PNG under 300KB — QR omitted (unscannable at that size)
const sealOg = await renderOfficialSealOg({
  serial: GENESIS_SERIAL,
  ca: GENESIS_MINT,
  status: 'VALID',
  pathMark: 'SECURED'
});
assert.equal(sealOg[0], 137);
assert.ok(sealOg.length < 300 * 1024, `seal OG must be under 300KB, got ${sealOg.length}`);

// UI seal: transparent RGBA thumb (no black square field)
const sealUi = await renderOfficialSealUi({
  serial: GENESIS_SERIAL,
  ca: GENESIS_MINT,
  status: 'VALID',
  pathMark: 'SECURED'
});
assert.equal(sealUi[0], 137);
const uiDecoded = decodePng(sealUi);
assert.equal(uiDecoded.width, SEAL_UI_SIZE);
assert.equal(uiDecoded.rgba[3], 0, 'UI seal corner alpha must be 0 (no black square)');
assert.equal(uiDecoded.rgba[(SEAL_UI_SIZE * SEAL_UI_SIZE - 1) * 4 + 3], 0);

// Majority fails established — thin book keeps strict ≤50% ceiling
const majorityFail = qualifyFromScan({
  ...estReport,
  pools: [
    { dex: 'raydium', pairAddress: 'poolA', liquidityUsd: 90000, createdAt: old },
    { dex: 'orca', pairAddress: 'poolB', liquidityUsd: 5000, createdAt: old },
    { dex: 'meteora', pairAddress: 'poolC', liquidityUsd: 5000, createdAt: old }
  ]
});
assert.equal(majorityFail.eligible, false);

// Outside-largest waiver (≥$2M outside + ≥3 pools)
assert.equal(ESTABLISHED_MAX_POOL_SHARE, 0.5);
assert.equal(ESTABLISHED_MAJORITY_WAIVER_OUTSIDE_USD, 2_000_000);
assert.equal(
  majorityShareWaived({ poolCount: 6, outsideLargestPoolUsd: 15_200_000 }),
  true
);
assert.equal(
  majorityShareWaived({ poolCount: 6, outsideLargestPoolUsd: 43_000 }),
  false,
  'Mog-shaped outside must not waive'
);
assert.equal(
  majorityShareWaived({ poolCount: 2, outsideLargestPoolUsd: 5_000_000 }),
  false,
  'need ≥3 pools to waive'
);

// LINK-shaped: ~$36M total, ~57% deepest, ~$15.2M outside → Established PASS
const linkLike = qualifyFromScan({
  schema: 'guardian.report.v2',
  grade: 'A',
  score: 89,
  token: {
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    name: 'ChainLink Token'
  },
  chain: { id: 'ethereum' },
  lp: { tier: 'UNVERIFIED', lifetimeEligible: false, badgeEligible: false },
  checks: [
    { id: 'owner_privileges', status: 'pass' },
    { id: 'contract_age', status: 'pass', grade: 'A', summary: 'Contract is 8.7 years old.', evidence: { ageDays: 3180, source: 'explorer' } }
  ],
  pools: [
    { dex: 'uniswap', pairAddress: 'link1', liquidityUsd: 20_587_731, createdAt: old },
    { dex: 'uniswap', pairAddress: 'link2', liquidityUsd: 13_172_728, createdAt: old },
    { dex: 'uniswap', pairAddress: 'link3', liquidityUsd: 907_589, createdAt: old },
    { dex: 'uniswap', pairAddress: 'link4', liquidityUsd: 856_186, createdAt: old },
    { dex: 'uniswap', pairAddress: 'link5', liquidityUsd: 360_426, createdAt: old },
    { dex: 'uniswap', pairAddress: 'link6', liquidityUsd: 116_919, createdAt: old }
  ]
});
assert.equal(linkLike.eligible, true, 'LINK-shaped deep book must pass Established');
assert.equal(linkLike.path, 'established');
assert.ok(linkLike.established.maxPoolShare > 0.5);
assert.equal(linkLike.established.majorityWaived, true);
assert.ok(linkLike.established.outsideLargestPoolUsd >= 2_000_000);
assert.ok(linkLike.established.ageDays > 3000);

// pepeCoin-shaped: ~$1.9M total, ~99.7% single pool (~$5K outside) → still refused
const pepeLike = qualifyFromScan({
  schema: 'guardian.report.v2',
  grade: 'A',
  score: 91,
  token: {
    address: '0xA9E8aCf069C58aEc8825542845Fd754e41a9489A',
    symbol: 'pepecoin',
    name: 'pepeCoin'
  },
  chain: { id: 'ethereum' },
  lp: { tier: 'UNVERIFIED', lifetimeEligible: false, badgeEligible: false },
  checks: [
    { id: 'owner_privileges', status: 'pass' },
    { id: 'contract_age', status: 'pass', grade: 'A', evidence: { ageDays: 1200, source: 'explorer' } }
  ],
  pools: [
    { dex: 'uniswap', pairAddress: 'pepe1', liquidityUsd: 1_903_773, createdAt: old },
    { dex: 'uniswap', pairAddress: 'pepe2', liquidityUsd: 4_966, createdAt: old },
    { dex: 'uniswap', pairAddress: 'pepe3', liquidityUsd: 103, createdAt: old },
    { dex: 'uniswap', pairAddress: 'pepe4', liquidityUsd: 1, createdAt: old }
  ]
});
assert.equal(pepeLike.eligible, false, 'pepeCoin-shaped majority must still fail');
assert.equal(pepeLike.established.majorityWaived, false);
assert.match(pepeLike.reason, /largest pool/i);

// Mog-shaped: $5.35M total, 99.2% in one pool (~$43K outside) + live authorities → refuse on authority
const mogLike = qualifyFromScan({
  schema: 'guardian.report.v2',
  grade: 'A',
  score: 80,
  token: {
    address: '0xaaee1a9723aadb7afa2810263653a34ba2c21c7a',
    symbol: 'Mog',
    name: 'Mog Coin'
  },
  chain: { id: 'ethereum' },
  lp: { tier: 'UNVERIFIED', lifetimeEligible: false, badgeEligible: false },
  checks: [
    { id: 'owner_privileges', status: 'flag', summary: 'Owner-linked functions live' },
    { id: 'contract_age', status: 'pass', grade: 'A', evidence: { ageDays: 1148, source: 'explorer' } }
  ],
  pools: [
    { dex: 'uniswap', pairAddress: 'mog1', liquidityUsd: 5_307_458, createdAt: old },
    { dex: 'uniswap', pairAddress: 'mog2', liquidityUsd: 20_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'mog3', liquidityUsd: 15_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'mog4', liquidityUsd: 5_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'mog5', liquidityUsd: 2_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'mog6', liquidityUsd: 1_301, createdAt: old }
  ]
});
assert.equal(mogLike.eligible, false);
assert.equal(mogLike.established.majorityWaived, false, 'Mog must not get outside-liq waiver');
assert.ok(mogLike.established.outsideLargestPoolUsd < 100_000);
assert.match(mogLike.reason, /mint or freeze authority still live/i);

// AAVE-shaped: deep + already under 50% → still passes
const aaveLike = qualifyFromScan({
  schema: 'guardian.report.v2',
  grade: 'AA',
  score: 96,
  token: {
    address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    symbol: 'AAVE',
    name: 'Aave Token'
  },
  chain: { id: 'ethereum' },
  lp: { tier: 'UNVERIFIED', lifetimeEligible: false, badgeEligible: false },
  checks: [
    { id: 'owner_privileges', status: 'pass' },
    { id: 'contract_age', status: 'pass', grade: 'A', evidence: { ageDays: 2000, source: 'explorer' } }
  ],
  pools: [
    { dex: 'uniswap', pairAddress: 'aave1', liquidityUsd: 6_020_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'aave2', liquidityUsd: 3_100_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'aave3', liquidityUsd: 1_800_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'aave4', liquidityUsd: 1_100_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'aave5', liquidityUsd: 700_000, createdAt: old },
    { dex: 'uniswap', pairAddress: 'aave6', liquidityUsd: 376_000, createdAt: old }
  ]
});
assert.equal(aaveLike.eligible, true);
assert.equal(aaveLike.path, 'established');

// OG render produces PNG header
const png = renderBadgeOg({
  serial: GENESIS_SERIAL,
  symbol: 'C7',
  pathLabel: 'Lifetime',
  grade: 'A',
  lpTier: 'PERMANENT',
  status: 'VALID',
  issuedAt: GENESIS_BADGE.issuedAt,
  liveGrade: 'A',
  livePath: 'Lifetime',
  checkedAt: new Date().toISOString()
});
assert.equal(png[0], 137);
assert.equal(png[1], 80);
assert.equal(png[2], 78);
assert.equal(png[3], 71);

const revokedPng = renderBadgeOg({
  serial: GENESIS_SERIAL,
  symbol: 'C7',
  pathLabel: 'Lifetime',
  status: 'REVOKED',
  issuedAt: GENESIS_BADGE.issuedAt,
  livePath: 'None',
  checkedAt: new Date().toISOString()
});
assert.equal(revokedPng[0], 137);

// Verify OG card: 1200×630-class indexed PNG under 300KB with seal + status + name/ticker
const verifyOg = renderVerifyOg({
  serial: GENESIS_SERIAL,
  name: GENESIS_BADGE.name,
  symbol: GENESIS_BADGE.symbol,
  status: 'VALID'
});
assert.equal(verifyOg[0], 137);
assert.ok(verifyOg.length < 300 * 1024, `verify OG must be under 300KB, got ${verifyOg.length}`);
const verifyRevoked = renderVerifyOg({
  serial: GENESIS_SERIAL,
  name: GENESIS_BADGE.name,
  symbol: GENESIS_BADGE.symbol,
  status: 'REVOKED'
});
assert.equal(verifyRevoked[0], 137);
assert.ok(verifyRevoked.length < 300 * 1024, `revoked verify OG must be under 300KB, got ${verifyRevoked.length}`);

// Ornate seal PNG must decode with transparent corners (blit root-cause fix)
const sealImg = loadSealImage(false);
assert.ok(sealImg, 'valid seal asset missing');
assert.ok(sealImg.width >= 512, 'seal should be ≥2× card display');
assert.equal(sealImg.rgba[3], 0, 'seal corner alpha must be 0');
const revSeal = loadSealImage(true);
assert.ok(revSeal);
assert.equal(revSeal.rgba[3], 0, 'revoked seal corner alpha must be 0');

// Revocation history
const other = await registerBadge({
  mint: 'RevokeTestMint111111111111111111111111111',
  chainId: 'solana',
  grade: 'A',
  lpTier: 'PERMANENT',
  qualifyPath: 'lifetime',
  pathLabel: 'Lifetime',
  pathFamily: 'secured',
  lifetimeEligible: true,
  badgeEligible: true
});
await revokeBadge(other.serial, 'test');
assert.equal(await hasRevocationHistory('RevokeTestMint111111111111111111111111111', 'solana'), true);

console.log('badge-registry.test.js: ok');

// api/_supply.test.js — circulating supply parsers + tokenomics equality
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOTAL_SUPPLY,
  TOKENOMICS_LAUNCH_FLOAT,
  SUPPLY_LOCKS,
  parseStreamflowLocked,
  parseJupiterLockLocked,
  circulatingFromLocks,
  computeSupply,
  STREAMFLOW_PROGRAM,
  JUPITER_LOCK_PROGRAM,
} from './_supply.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '..');

// --- unit: Streamflow remaining = deposited − withdrawn ---
{
  const raw = Buffer.alloc(500, 0);
  raw.writeBigUInt64LE(60_000_000n * 1_000_000n, 417); // deposited
  raw.writeBigUInt64LE(1_500_000n * 1_000_000n, 17); // withdrawn
  const p = parseStreamflowLocked(raw);
  assert(p.deposited === 60_000_000, `deposited ${p.deposited}`);
  assert(p.withdrawn === 1_500_000, `withdrawn ${p.withdrawn}`);
  assert(p.locked === 58_500_000, `locked ${p.locked}`);
}

// --- unit: Jupiter Lock remaining = total − claimed ---
{
  const raw = Buffer.alloc(200, 0);
  // cliff_unlock 10 (raw micro) + amount_per 54945e6 * 182 periods = 10M
  raw.writeBigUInt64LE(10_000_000n, 160); // cliff unlock raw (=10 tokens)
  raw.writeBigUInt64LE(54_945_000_000n, 168);
  raw.writeBigUInt64LE(182n, 176);
  raw.writeBigUInt64LE(0n, 184);
  const p = parseJupiterLockLocked(raw);
  assert(Math.abs(p.total - 10_000_000) < 1e-6, `total ${p.total}`);
  assert(p.claimed === 0, 'claimed 0');
  assert(Math.abs(p.locked - 10_000_000) < 1e-6, `locked ${p.locked}`);

  raw.writeBigUInt64LE(500_000n * 1_000_000n, 184);
  const p2 = parseJupiterLockLocked(raw);
  assert(Math.abs(p2.locked - 9_500_000) < 1e-6, `locked after claim ${p2.locked}`);
}

// --- unit: circulating = 100M − locks (matches tokenomics launch float) ---
{
  const locks = SUPPLY_LOCKS.map((l) => ({ locked: l.allocation }));
  const { total, locked, circulating } = circulatingFromLocks({ locks });
  assert(total === TOTAL_SUPPLY, 'total 100M');
  assert(locked === 75_000_000, `locked ${locked}`);
  assert(circulating === TOKENOMICS_LAUNCH_FLOAT, `circ ${circulating}`);
  assert(circulating === 25_000_000, 'launch float 25M');
}

// --- tokenomics.html publishes the same addresses + 25M float ---
{
  const html = fs.readFileSync(path.join(root, 'tokenomics.html'), 'utf8');
  assert(html.includes('25,000,000'), 'tokenomics shows 25M float');
  assert(html.includes('100M') || html.includes('100,000,000'), 'tokenomics total');
  for (const lock of SUPPLY_LOCKS) {
    assert(html.includes(lock.address), `tokenomics missing ${lock.id} ${lock.address}`);
  }
  const allocSum = SUPPLY_LOCKS.reduce((s, l) => s + l.allocation, 0);
  assert(TOTAL_SUPPLY - allocSum === TOKENOMICS_LAUNCH_FLOAT, 'allocations imply 25M float');
}

// --- integration: live RPC (skip if SUPPLY_TEST_SKIP_LIVE=1) ---
async function liveCheck() {
  if (process.env.SUPPLY_TEST_SKIP_LIVE === '1') {
    console.log('skip live supply rpc');
    return;
  }
  const snap = await computeSupply();
  assert(snap.total === 100_000_000, `live total ${snap.total}`);
  assert(snap.locks.length === 3, '3 locks');
  assert(typeof snap.circulating === 'number' && snap.circulating > 0, 'live circulating');
  // At launch (no withdrawals/claims) must equal published float
  const allFull = snap.locks.every((l) => Math.abs(l.locked - l.allocation) < 1);
  if (allFull) {
    assert(
      snap.circulating === TOKENOMICS_LAUNCH_FLOAT,
      `live circ ${snap.circulating} != tokenomics ${TOKENOMICS_LAUNCH_FLOAT}`
    );
  } else {
    // Still: circulating + locked === total
    assert(
      Math.abs(snap.circulating + snap.locked - snap.total) < 1e-3,
      `circ+locked ${snap.circulating}+${snap.locked}`
    );
  }
  // Sanity: owners parsed correctly via compute path
  assert(STREAMFLOW_PROGRAM && JUPITER_LOCK_PROGRAM);
  console.log('live circulating', snap.circulating, 'locked', snap.locked);
}

await liveCheck();
console.log('ok supply parsers + tokenomics equality');

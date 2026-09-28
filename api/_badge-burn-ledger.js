// api/_badge-burn-ledger.js — $C7 badge payments awaiting weekly published burn.
// Feeds tokenomics commitment: "All C7 payments burned weekly · tx published".

import fs from 'node:fs';
import path from 'node:path';
import { C7_MINT } from './_supply.js';
import { redisCommand, isDurableRedis } from './_redis.js';

const FILE_STORE = process.env.BADGE_BURN_LEDGER_STORE || '/tmp/guardian-c7-burn-ledger.json';
const KEY_PREFIX = 'guardian:burn:';
const INDEX_KEY = 'guardian:burn:index';
const COUNTER_KEY = 'guardian:burn:counter';


function emptyFileStore() {
  return { byId: {}, counter: 0 };
}

function readFileStore() {
  try {
    if (!fs.existsSync(FILE_STORE)) return emptyFileStore();
    const data = JSON.parse(fs.readFileSync(FILE_STORE, 'utf8'));
    if (!data || typeof data !== 'object') return emptyFileStore();
    return {
      byId: data.byId && typeof data.byId === 'object' ? data.byId : {},
      counter: Number(data.counter) || 0
    };
  } catch (e) {
    console.error('burn ledger file read failed', e && e.message);
    return emptyFileStore();
  }
}

function writeFileStore(store) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE_STORE, JSON.stringify(store));
  } catch (e) {
    console.error('burn ledger file write failed', e && e.message);
  }
}

async function nextId() {
  if (isDurableRedis()) {
    const row = await redisCommand(['INCR', COUNTER_KEY]);
    const n = Number(row && row.result) || 1;
    return `BURN-${new Date().getUTCFullYear()}-${String(n).padStart(5, '0')}`;
  }
  const store = readFileStore();
  store.counter = (Number(store.counter) || 0) + 1;
  writeFileStore(store);
  return `BURN-${new Date().getUTCFullYear()}-${String(store.counter).padStart(5, '0')}`;
}

/**
 * Record a confirmed $C7 badge payment for the weekly burn batch.
 * @param {{ orderId: string, amountAtomic: string, amountDisplay: string, tx: string, from?: string|null, receivedAt?: string }} input
 */
export async function recordC7BurnEntry(input) {
  const id = await nextId();
  const entry = {
    schema: 'guardian.burn.v1',
    id,
    orderId: String(input.orderId),
    mint: C7_MINT,
    assetSymbol: 'C7',
    amountAtomic: String(input.amountAtomic),
    amountDisplay: String(input.amountDisplay),
    paymentTx: String(input.tx),
    from: input.from || null,
    receivedAt: input.receivedAt || new Date().toISOString(),
    status: 'pending_weekly_burn',
    weeklyBurnTx: null,
    weeklyBurnAt: null,
    note: 'Queued for weekly published burn per The $C7 Loop.'
  };

  if (isDurableRedis()) {
    await redisCommand(['SET', KEY_PREFIX + id, JSON.stringify(entry)]);
    await redisCommand(['ZADD', INDEX_KEY, String(Date.parse(entry.receivedAt) || Date.now()), id]);
    return entry;
  }
  const store = readFileStore();
  store.byId[id] = entry;
  writeFileStore(store);
  return entry;
}

export async function getBurnEntry(id) {
  const key = String(id || '').trim().toUpperCase();
  if (!key) return null;
  if (isDurableRedis()) {
    const row = await redisCommand(['GET', KEY_PREFIX + key]);
    if (!row || !row.result) return null;
    try {
      return JSON.parse(row.result);
    } catch (e) {
      return null;
    }
  }
  const store = readFileStore();
  return store.byId[key] || null;
}

export async function listBurnLedger({ limit = 100 } = {}) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  if (isDurableRedis()) {
    const row = await redisCommand(['ZREVRANGE', INDEX_KEY, '0', String(lim - 1)]);
    const ids = (row && row.result) || [];
    const out = [];
    for (const id of ids) {
      const e = await getBurnEntry(id);
      if (e) out.push(e);
    }
    return out;
  }
  const store = readFileStore();
  return Object.values(store.byId)
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, lim);
}

/**
 * Founder posts the weekly burn tx once tokens leave the treasury.
 * @param {string} id
 * @param {string} weeklyBurnTx
 */
export async function markWeeklyBurned(id, weeklyBurnTx) {
  const entry = await getBurnEntry(id);
  if (!entry) return null;
  const next = {
    ...entry,
    status: 'burned',
    weeklyBurnTx: String(weeklyBurnTx),
    weeklyBurnAt: new Date().toISOString()
  };
  if (isDurableRedis()) {
    await redisCommand(['SET', KEY_PREFIX + next.id, JSON.stringify(next)]);
    return next;
  }
  const store = readFileStore();
  store.byId[next.id] = next;
  writeFileStore(store);
  return next;
}

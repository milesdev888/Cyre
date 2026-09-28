// api/_traffic.js — x402 + verify event persistence for /api/monitor/feed
// Durable via shared _redis.js (Upstash/KV REST or redis:// TCP). Else ephemeral file store.

import fs from 'node:fs';
import path from 'node:path';
import { ROUTE_CATALOG } from './_route-catalog.js';
import { isDurableRedis, redisCommand } from './_redis.js';

const EVENT_CAP = 500;
const FILE_STORE = process.env.TRAFFIC_STORE || '/tmp/guardian-traffic.json';

/** @type {Promise<void>|null} */
let writeChain = Promise.resolve();

function normAddr(v) {
  const s = String(v || '');
  return s.startsWith('0x') ? s.toLowerCase() : s;
}

function truncateHash(v) {
  const s = String(v || '');
  if (!s) return null;
  if (s.length <= 14) return s;
  return s.slice(0, 8) + '…' + s.slice(-4);
}

function uaShort(req) {
  const ua = String((req && req.headers && (req.headers['user-agent'] || req.headers['User-Agent'])) || '');
  return ua.slice(0, 60);
}


function emptyStore() {
  return {
    events: [],
    counts: {},
    global: { probes: 0, settles: 0, internalSettles: 0, externalSettles: 0, atomicTotal: '0', verifies: 0 },
    firstSeen: {}
  };
}

function readFileStore() {
  try {
    if (!fs.existsSync(FILE_STORE)) return emptyStore();
    const raw = fs.readFileSync(FILE_STORE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyStore();
    data.events = Array.isArray(data.events) ? data.events : [];
    data.counts = data.counts || {};
    data.global = data.global || emptyStore().global;
    data.firstSeen = data.firstSeen || {};
    return data;
  } catch (e) {
    console.error('traffic file read failed', e && e.message);
    return emptyStore();
  }
}

function writeFileStore(data) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE_STORE, JSON.stringify(data));
  } catch (e) {
    console.error('traffic file write failed', e && e.message);
  }
}

function queueFileWrite(fn) {
  writeChain = writeChain.then(fn).catch((e) => {
    console.error('traffic file queue', e && e.message);
  });
  return writeChain;
}

function bumpCounts(store, route, delta) {
  const key = route;
  if (!store.counts[key]) {
    store.counts[key] = { probes: 0, settles: 0, internalSettles: 0, externalSettles: 0, atomicTotal: '0', verifies: 0 };
  }
  const c = store.counts[key];
  const g = store.global;
  if (delta.kind === 'verify') {
    c.verifies += 1;
    g.verifies += 1;
    return;
  }
  if (delta.probe) {
    c.probes += 1;
    g.probes += 1;
  }
  if (delta.settle) {
    c.settles += 1;
    g.settles += 1;
    const amt = BigInt(delta.amountAtomic || '0');
    c.atomicTotal = (BigInt(c.atomicTotal || '0') + amt).toString();
    g.atomicTotal = (BigInt(g.atomicTotal || '0') + amt).toString();
    if (delta.source === 'internal') {
      c.internalSettles += 1;
      g.internalSettles += 1;
    } else {
      c.externalSettles += 1;
      g.externalSettles += 1;
    }
    if (!store.firstSeen[route]) store.firstSeen[route] = delta.ts;
  }
}

async function redisGetStore() {
  const [eventsRaw, globalRaw, ...routeKeys] = await Promise.all([
    redisCommand(['LRANGE', 'guardian:events', '0', String(EVENT_CAP - 1)]),
    redisCommand(['HGETALL', 'guardian:counts:global'])
  ]);
  const events = (eventsRaw && eventsRaw.result || []).map((s) => {
    try { return JSON.parse(s); } catch (e) { return null; }
  }).filter(Boolean);

  const global = parseRedisHash(globalRaw && globalRaw.result) || emptyStore().global;
  const counts = {};
  const firstSeen = {};
  for (const route of ROUTE_CATALOG) {
    const p = route.path;
    const [h, fs] = await Promise.all([
      redisCommand(['HGETALL', 'guardian:counts:' + p]),
      redisCommand(['GET', 'guardian:firstseen:' + p])
    ]);
    const parsed = parseRedisHash(h && h.result);
    if (parsed) counts[p] = parsed;
    if (fs && fs.result) firstSeen[p] = fs.result;
  }
  return { events, counts, global, firstSeen };
}

function coerceHashEntries(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (!raw.length) return null;
    const out = {};
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i] == null) continue;
      out[String(raw[i])] = raw[i + 1];
    }
    return out;
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function parseRedisHash(raw) {
  const entries = coerceHashEntries(raw);
  if (!entries || !Object.keys(entries).length) return null;
  const out = {};
  for (const [k, v] of Object.entries(entries)) {
    if (k === 'probes' || k === 'settles' || k === 'internalSettles' || k === 'externalSettles' || k === 'verifies') {
      out[k] = parseInt(v, 10) || 0;
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function redisRecord(event, delta) {
  const route = event.route;
  const pipeline = [
    ['LPUSH', 'guardian:events', JSON.stringify(event)],
    ['LTRIM', 'guardian:events', '0', String(EVENT_CAP - 1)]
  ];
  if (delta.kind === 'verify') {
    pipeline.push(['HINCRBY', 'guardian:counts:' + route, 'verifies', '1']);
    pipeline.push(['HINCRBY', 'guardian:counts:global', 'verifies', '1']);
  } else {
    if (delta.probe) {
      pipeline.push(['HINCRBY', 'guardian:counts:' + route, 'probes', '1']);
      pipeline.push(['HINCRBY', 'guardian:counts:global', 'probes', '1']);
    }
    if (delta.settle) {
      pipeline.push(['HINCRBY', 'guardian:counts:' + route, 'settles', '1']);
      pipeline.push(['HINCRBY', 'guardian:counts:global', 'settles', '1']);
      pipeline.push(['HINCRBY', 'guardian:counts:' + route, delta.source === 'internal' ? 'internalSettles' : 'externalSettles', '1']);
      pipeline.push(['HINCRBY', 'guardian:counts:global', delta.source === 'internal' ? 'internalSettles' : 'externalSettles', '1']);
      if (delta.amountAtomic) {
        pipeline.push(['HINCRBY', 'guardian:counts:' + route, 'atomicTotal', String(delta.amountAtomic)]);
        pipeline.push(['HINCRBY', 'guardian:counts:global', 'atomicTotal', String(delta.amountAtomic)]);
      }
      pipeline.push(['SET', 'guardian:firstseen:' + route, event.ts, 'NX']);
    }
  }
  for (const cmd of pipeline) {
    await redisCommand(cmd);
  }
}

export function isDurableStore() {
  return isDurableRedis();
}

function internalPayers() {
  const raw = process.env.X402_INTERNAL_PAYERS || '';
  const list = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).map(normAddr);
  const baseDefault = '0x9ff25c4acf1dcddf15fd2702c127a285f1dfa712';
  if (!list.includes(baseDefault)) list.push(baseDefault);
  return list;
}

export function classifySource(req, settled, payment) {
  const key = process.env.X402_INTERNAL_KEY || '';
  if (key && req && req.headers && req.headers['x-guardian-key'] === key) return 'internal';
  const payer = settled && (settled.payer || settled.from) ||
    (payment && (payment.payer || (payment.payload && payment.payload.from)));
  if (!payer) return 'internal';
  const p = normAddr(payer);
  if (internalPayers().includes(p)) return 'internal';
  return 'external';
}

/**
 * @param {object} evt
 * @param {string} evt.route
 * @param {string} evt.ts
 * @param {string} [evt.lane]
 * @param {string} [evt.amountAtomic]
 * @param {string} [evt.asset]
 * @param {boolean} [evt.settled]
 * @param {string|null} [evt.txHash]
 * @param {string} [evt.source]
 * @param {string} [evt.ua]
 * @param {'verify'|'gate'} [evt.kind]
 */
export async function recordTrafficEvent(evt) {
  const route = evt.route;
  if (!route) return;
  const delta = { kind: evt.kind === 'verify' ? 'verify' : 'gate' };
  if (evt.kind === 'verify') {
    delta.kind = 'verify';
  } else if (evt.settled) {
    delta.settle = true;
    delta.source = evt.source || 'external';
    delta.amountAtomic = evt.amountAtomic || '0';
  } else {
    delta.probe = true;
  }

  if (isDurableRedis()) {
    try {
      await redisRecord(evt, delta);
    } catch (e) {
      console.error('traffic redis record failed', e && e.message);
    }
    return;
  }

  await queueFileWrite(async () => {
    const store = readFileStore();
    store.events.unshift(evt);
    if (store.events.length > EVENT_CAP) store.events.length = EVENT_CAP;
    bumpCounts(store, route, { ...delta, ts: evt.ts, amountAtomic: evt.amountAtomic });
    writeFileStore(store);
  });
}

export function recordTrafficEventFire(evt) {
  recordTrafficEvent(evt).catch((e) => console.error('traffic record', e && e.message));
}

export function recordVerifyHit(route, req) {
  recordTrafficEventFire({
    route,
    ts: new Date().toISOString(),
    kind: 'verify',
    settled: false,
    ua: uaShort(req)
  });
}

/**
 * @param {import('./_x402.js').armedLanes} _lanes
 */
export async function buildMonitorFeed(listArmedLaneNames) {
  const lanes = typeof listArmedLaneNames === 'function' ? listArmedLaneNames() : (listArmedLaneNames || []);
  const durable = isDurableStore();
  const store = durable ? await redisGetStore().catch((e) => {
    console.error('traffic redis read failed', e && e.message);
    return readFileStore();
  }) : readFileStore();

  const routes = ROUTE_CATALOG.map((def) => {
    const c = store.counts[def.path] || { probes: 0, settles: 0, internalSettles: 0, externalSettles: 0, atomicTotal: '0', verifies: 0 };
    const price = def.paid ? (def.priceEnv && process.env[def.priceEnv] ? String(process.env[def.priceEnv]) : def.priceAtomic) : null;
    return {
      path: def.path,
      family: def.family,
      priceAtomic: price,
      lanes: def.paid ? lanes : [],
      bazaarExt: !!def.bazaarExt,
      paid: def.paid,
      probes: c.probes || 0,
      settles: c.settles || 0,
      internalSettles: c.internalSettles || 0,
      externalSettles: c.externalSettles || 0,
      verifies: c.verifies || 0,
      firstSeen: store.firstSeen[def.path] || null
    };
  });

  const g = store.global || emptyStore().global;
  let solanaSettles = 0;
  let baseSettles = 0;
  let bscSettles = 0;
  for (const ev of store.events) {
    if (!ev.settled) continue;
    if (ev.lane === 'solana') solanaSettles += 1;
    else if (ev.lane === 'base') baseSettles += 1;
    else if (ev.lane === 'bsc') bscSettles += 1;
  }

  const events = store.events
    .filter((e) => e.settled || e.kind === 'verify')
    .slice(0, EVENT_CAP)
    .map((e) => ({
      ts: e.ts,
      route: e.route,
      lane: e.lane || null,
      settled: !!e.settled,
      amountAtomic: e.amountAtomic || null,
      txHash: truncateHash(e.txHash),
      source: e.source || (e.kind === 'verify' ? 'verify' : null),
      kind: e.kind || (e.settled ? 'settle' : 'probe')
    }));

  return {
    generatedAt: new Date().toISOString(),
    durable,
    routes,
    totals: {
      paidRoutes: routes.filter((r) => r.paid).length,
      settles: g.settles || 0,
      externalSettles: g.externalSettles || 0,
      internalSettles: g.internalSettles || 0,
      probes: g.probes || 0,
      verifies: g.verifies || 0,
      usdcAtomic: g.atomicTotal || '0',
      solanaSettles,
      baseSettles,
      bscSettles
    },
    events
  };
}

export { truncateHash };

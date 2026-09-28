// scripts/x402-traffic-durable-proof.mjs — prove traffic ledger survives process restart via Redis.
import fs from 'node:fs';
import { listArmedLaneNames } from '../api/_lanes.js';
import {
  recordTrafficEvent,
  buildMonitorFeed,
  isDurableStore
} from '../api/_traffic.js';

const OUT = '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const marker = `proof-${Date.now()}`;
const route = '/api/address';
const ts = new Date().toISOString();

if (!isDurableStore()) {
  console.error('FAIL: isDurableStore() is false — REDIS_URL / Upstash not configured');
  process.exit(1);
}

const before = await buildMonitorFeed(listArmedLaneNames);
const beforeProbes = before.routes?.find((r) => r.path === route)?.probes ?? 0;

await recordTrafficEvent({
  route,
  ts,
  lane: 'base',
  kind: 'probe',
  settled: false,
  amountAtomic: null,
  source: 'internal',
  ua: `x402-durable-proof/${marker}`
});

// Simulate "redeploy": wipe ephemeral file store; Redis must still serve the probe.
const fileStore = process.env.TRAFFIC_STORE || '/tmp/guardian-traffic.json';
if (fs.existsSync(fileStore)) fs.unlinkSync(fileStore);

const feed = await buildMonitorFeed(listArmedLaneNames);
const routeRow = (feed.routes || []).find((r) => r.path === route);
const probes = routeRow?.probes ?? 0;

const proof = {
  ok: !!(feed.durable && probes >= beforeProbes + 1),
  durable: feed.durable,
  marker,
  ts,
  route,
  beforeProbes,
  routeProbes: probes,
  totalsProbes: feed.totals?.probes ?? null,
  generatedAt: feed.generatedAt,
  fileStoreWiped: !fs.existsSync(fileStore)
};

fs.writeFileSync(`${OUT}/x402-ledger-durable-proof.json`, JSON.stringify(proof, null, 2));
fs.writeFileSync(
  `${OUT}/x402-monitor-feed-after-probe.json`,
  JSON.stringify(
    {
      durable: feed.durable,
      totals: feed.totals,
      addressRoute: routeRow,
      recentEvents: (feed.events || []).slice(0, 5)
    },
    null,
    2
  )
);

console.log(JSON.stringify(proof, null, 2));
if (!proof.ok) process.exit(1);
process.exit(0);

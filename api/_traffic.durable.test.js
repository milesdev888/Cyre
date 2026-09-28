// api/_traffic.durable.test.js — Redis-backed traffic ledger smoke (skips without Redis)
import assert from 'node:assert/strict';
import { isDurableRedis } from './_redis.js';
import { isDurableStore, recordTrafficEvent, buildMonitorFeed } from './_traffic.js';

if (!isDurableRedis()) {
  console.log('skip: no durable Redis configured');
  process.exit(0);
}

assert.equal(isDurableStore(), true);

const marker = `unit-${Date.now()}`;
const ts = new Date().toISOString();
const route = '/api/policy/check';

const before = await buildMonitorFeed(() => ['solana', 'base']);
const beforeProbes = (before.routes.find((r) => r.path === route)?.probes) || 0;

await recordTrafficEvent({
  route,
  ts,
  lane: 'solana',
  kind: 'probe',
  settled: false,
  ua: marker
});

const feed = await buildMonitorFeed(() => ['solana', 'base']);
assert.equal(feed.durable, true);
const row = feed.routes.find((r) => r.path === route);
assert.ok(row && row.probes >= beforeProbes + 1, 'route probe counter must increment');
assert.ok((feed.totals?.probes || 0) >= before.totals?.probes + 1, 'global probes must increment');

console.log('traffic durable ok', { marker, probes: row.probes, durable: feed.durable });
process.exit(0);

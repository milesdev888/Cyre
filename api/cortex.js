// api/cortex.js — Guardian Neural Cortex desk status
// Light aggregator for the agent-fund graph. Measured only. No LLM.
// Patterns, not verdicts. No custody. Execution stays paper-only.
// Env: SOLANA_RPC, PYTH_LAZER_API_KEY (optional — soft-fail)

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const CACHE_SEC = Math.min(Math.max(parseInt(process.env.CORTEX_CACHE_SEC || '30', 10), 10), 120);
const DISCLAIMER =
  'Patterns, not verdicts. Agent desks watch — no custody, no live execution.';
const KIND = 'cyre-cortex';
const VERSION = 1;

// Must match cortex.html graph (ids + edge count).
const GRAPH = {
  nodes: 14,
  links: 23,
  desks: [
    { id: 'guardian core', role: 'core' },
    { id: 'research', role: 'research' },
    { id: 'signals', role: 'signals' },
    { id: 'execution', role: 'execution' },
    { id: 'risk', role: 'risk' },
    { id: 'ops', role: 'ops' },
    { id: 'watchlist', role: 'watch' },
    { id: 'chain feed', role: 'chain' },
    { id: 'filings', role: 'ingest' },
    { id: 'sentiment', role: 'ingest' },
    { id: 'vector store', role: 'memory' },
    { id: 'embeddings', role: 'memory' },
    { id: 'attestations', role: 'control' },
    { id: 'kill-switch', role: 'control' },
  ],
};

let cache = { at: 0, payload: null };

async function getSlot() {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSlot',
      params: [{ commitment: 'processed' }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'RPC error');
  return d.result;
}

/** Soft oracle pull — in-process (no self-HTTP; works on Vercel + local). */
async function fetchOracle() {
  try {
    const { default: oracleHandler } = await import('./oracle.js');
    return await new Promise((resolve) => {
      let settled = false;
      const done = (body) => {
        if (settled) return;
        settled = true;
        resolve(body && typeof body === 'object' ? body : null);
      };
      const res = {
        setHeader() {},
        status() {
          return this;
        },
        json(body) {
          done(body);
          return this;
        },
      };
      Promise.resolve(oracleHandler({ method: 'GET', query: {}, headers: {} }, res))
        .then(() => {
          if (!settled) done(null);
        })
        .catch(() => done(null));
    });
  } catch (e) {
    console.error('cortex oracle import', e && e.message);
    return null;
  }
}

function buildDesks(chain, oracle) {
  const desks = [];
  for (const d of GRAPH.desks) {
    if (d.id === 'guardian core') {
      desks.push({ id: d.id, state: 'watching', detail: 'Observer core — patterns only.' });
    } else if (d.id === 'chain feed') {
      desks.push({
        id: d.id,
        state: chain.ok ? 'live' : 'degraded',
        detail: chain.ok ? `slot ${chain.slot}` : 'RPC unreachable',
      });
    } else if (d.id === 'signals' || d.id === 'watchlist') {
      desks.push({
        id: d.id,
        state: 'quiet',
        detail: 'Empty default list (SPEC policy).',
      });
    } else if (d.id === 'risk') {
      if (oracle && oracle.ok && oracle.counters) {
        desks.push({
          id: d.id,
          state: 'live',
          detail: `feeds ${oracle.counters.feedsEvaluated}/${oracle.counters.feedsConfigured}; patterns ${oracle.counters.patternsTriggered}`,
        });
      } else {
        desks.push({
          id: d.id,
          state: 'deferred',
          detail: 'Oracle not measured this run.',
        });
      }
    } else if (d.id === 'execution') {
      desks.push({ id: d.id, state: 'paper-only', detail: 'No custody. No live orders.' });
    } else if (d.id === 'kill-switch') {
      desks.push({ id: d.id, state: 'armed', detail: 'Blocks live execution paths.' });
    } else if (d.id === 'ops') {
      desks.push({ id: d.id, state: 'live', detail: 'Site pulse + cron lane (external).' });
    } else if (
      d.id === 'research' ||
      d.id === 'filings' ||
      d.id === 'sentiment' ||
      d.id === 'vector store' ||
      d.id === 'embeddings' ||
      d.id === 'attestations'
    ) {
      desks.push({ id: d.id, state: 'deferred', detail: 'Not wired in v1.' });
    } else {
      desks.push({ id: d.id, state: 'deferred', detail: 'Not wired in v1.' });
    }
  }
  return desks;
}

function buildStream(oracle) {
  const research = { mode: 'deferred', pct: null };
  const signals = { mode: 'quiet', pct: 0 };
  let risk = { mode: 'deferred', pct: null };
  if (oracle && oracle.ok && oracle.counters && oracle.counters.feedsConfigured > 0) {
    const pct = Math.round(
      (100 * (oracle.counters.feedsEvaluated || 0)) / oracle.counters.feedsConfigured
    );
    risk = { mode: 'measured', pct };
  }
  return { research, signals, risk };
}

function pickHot(desks, chain, oracle) {
  if (oracle && oracle.ok && oracle.counters && oracle.counters.patternsTriggered > 0) {
    return 'risk';
  }
  if (chain && chain.ok) return 'chain feed';
  const live = desks.find((d) => d.state === 'live');
  return (live && live.id) || 'guardian core';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_SEC * 1000) {
    return res.status(200).json({
      ...cache.payload,
      cached: true,
      cacheAgeSec: Math.floor((now - cache.at) / 1000),
    });
  }

  const fetchedAt = new Date().toISOString();
  let chain = { ok: false, slot: null, ageSec: null };
  try {
    const slot = await getSlot();
    chain = { ok: true, slot, ageSec: 0 };
  } catch (e) {
    console.error('cortex chain', e && e.message);
  }

  let oracle = null;
  try {
    oracle = await fetchOracle();
  } catch (e) {
    console.error('cortex oracle', e && e.message);
  }

  const desks = buildDesks(chain, oracle);
  const stream = buildStream(oracle);
  const hotNode = pickHot(desks, chain, oracle);

  const payload = {
    ok: true,
    kind: KIND,
    version: VERSION,
    disclaimer: DISCLAIMER,
    fetchedAt,
    status: 'WATCHING',
    graph: { nodes: GRAPH.nodes, links: GRAPH.links },
    chain,
    oracle: oracle && oracle.ok
      ? {
          ok: true,
          feedsEvaluated: (oracle.counters && oracle.counters.feedsEvaluated) || 0,
          feedsConfigured: (oracle.counters && oracle.counters.feedsConfigured) || 0,
          patternsTriggered: (oracle.counters && oracle.counters.patternsTriggered) || 0,
        }
      : { ok: false, feedsEvaluated: 0, feedsConfigured: 0, patternsTriggered: 0 },
    signals: { ok: true, items: 0, policy: 'empty-default-list' },
    desks,
    stream,
    hotNode,
    killSwitch: 'armed',
    execution: 'paper-only',
    pass: chain.ok && chain.slot != null ? chain.slot : null,
  };

  cache = { at: now, payload };
  return res.status(200).json({ ...payload, cached: false, cacheAgeSec: 0 });
}

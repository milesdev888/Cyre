// polymarket-connector.js — CYRE Polymarket US bridge for Claude custom connectors
// Minimal MCP server over HTTP, zero dependencies, READ-ONLY (no order tools).
// Deploy on Render as a Web Service. Claude connects to:  https://<service>.onrender.com/mcp/<CONNECT_SECRET>
//
// Env vars (set in Render dashboard, never in code):
//   POLYMARKET_KEY_ID      — Key ID from polymarket.us/developer
//   POLYMARKET_SECRET_KEY  — Secret Key (base64) from polymarket.us/developer, shown once
//   CONNECT_SECRET         — long random string; part of the URL path so only Claude (and you) can call this
//   PORT                   — provided by Render automatically

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const SECRET = process.env.CONNECT_SECRET || '';
const BASE = 'https://api.polymarket.us';

// ---------- Ed25519 request signing (matches official SDK: sign `${ts}${METHOD}${path}`, path WITHOUT query) ----------
let privKey = null;
function loadKey() {
  if (privKey) return privKey;
  const b64 = process.env.POLYMARKET_SECRET_KEY || '';
  if (!b64) throw new Error('POLYMARKET_SECRET_KEY not set');
  let seed = Buffer.from(b64, 'base64');
  if (seed.length === 64) seed = seed.subarray(0, 32);
  if (seed.length !== 32) throw new Error(`Secret key decodes to ${seed.length} bytes, expected 32 or 64`);
  // Wrap raw seed in PKCS#8 DER so Node can import it
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  privKey = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return privKey;
}
function authHeaders(method, path) {
  const ts = String(Date.now());
  const sig = crypto.sign(null, Buffer.from(`${ts}${method}${path}`), loadKey()).toString('base64');
  return {
    'X-PM-Access-Key': process.env.POLYMARKET_KEY_ID || '',
    'X-PM-Timestamp': ts,
    'X-PM-Signature': sig,
  };
}

async function pmGet(path, params = {}, authed = false) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(clean)) Array.isArray(v) ? v.forEach(x => qs.append(k, x)) : qs.append(k, v);
  const url = `${BASE}${path}${qs.toString() ? '?' + qs : ''}`;
  const headers = { accept: 'application/json' };
  // Polymarket US returns 401 on nominally-public endpoints without a key, so sign everything when keys exist
  if (authed || process.env.POLYMARKET_KEY_ID) Object.assign(headers, authHeaders('GET', path));
  const r = await fetch(url, { headers });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

const fmt = (o) => JSON.stringify(o, null, 1).slice(0, 60_000);
const amt = (a) => (a && typeof a === 'object' && 'value' in a) ? a.value : a;
function fail(r, what) { return `Polymarket ${what} ${r.status}: ${fmt(r.body)}`; }

// ---------- Tools (all read-only) ----------
const TOOLS = [
  {
    name: 'verify_connection',
    description: 'Check that the Polymarket US API keys work. Returns account balances if OK.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const r = await pmGet('/v1/account/balances', {}, true);
      if (r.status !== 200) return fail(r, 'auth check');
      const b = Array.isArray(r.body.balances) ? r.body.balances[0] : r.body;
      return `OK — connected. Balance $${b?.currentBalance} ${b?.currency || 'USD'}, buying power $${b?.buyingPower}`;
    },
  },
  {
    name: 'get_balances',
    description: 'Get the account balance, buying power, open-order margin, unsettled funds and pending withdrawals.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const r = await pmGet('/v1/account/balances', {}, true);
      return r.status === 200 ? fmt(r.body) : fail(r, 'balances');
    },
  },
  {
    name: 'get_positions',
    description: 'Get all current positions: market, net contracts (long +/short -), cost basis, unrealized cash value, realized P&L.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max positions (default 50)' } }, additionalProperties: false },
    run: async (a) => {
      const r = await pmGet('/v1/portfolio/positions', { limit: a.limit || 50 }, true);
      if (r.status !== 200) return fail(r, 'positions');
      const rows = Object.entries(r.body.positions || {}).map(([slug, p]) => {
        const t = p.marketMetadata?.title || p.marketMetadata?.question || slug;
        return `${t} [${slug}]\n  net ${p.netPositionDecimal} contracts | cost $${amt(p.cost)} | value $${amt(p.cashValue)} | realized $${amt(p.realized)}${p.expired ? ' | EXPIRED' : ''}`;
      });
      return rows.length ? rows.join('\n') : 'No open positions.';
    },
  },
  {
    name: 'get_activities',
    description: 'Trade / settlement / deposit / withdrawal history, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows (default 25)' },
        market_slug: { type: 'string', description: 'Optional: only this market' },
        types: { type: 'array', items: { type: 'string' }, description: 'Optional filter, e.g. ["ACTIVITY_TYPE_TRADE"]' },
      },
      additionalProperties: false,
    },
    run: async (a) => {
      const r = await pmGet('/v1/portfolio/activities', { limit: a.limit || 25, marketSlug: a.market_slug, types: a.types }, true);
      if (r.status !== 200) return fail(r, 'activities');
      const rows = (r.body.activities || []).map(x => {
        if (x.trade) { const t = x.trade; return `TRADE ${t.marketSlug}: ${t.qtyDecimal} @ $${amt(t.price)} ${t.isAggressor ? '(taker)' : '(maker)'} pnl $${amt(t.realizedPnl)} [${x.timestamp || x.createdAt || ''}]`; }
        if (x.positionResolution) return `RESOLUTION ${fmt(x.positionResolution)}`;
        if (x.accountBalanceChange) return `${x.type}: ${fmt(x.accountBalanceChange)}`;
        return fmt(x);
      });
      return rows.length ? rows.join('\n') : 'No activity.';
    },
  },
  {
    name: 'search_markets',
    description: 'Full-text search of events and markets (public). Returns event titles with their market slugs.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', description: 'default 10' } },
      required: ['query'], additionalProperties: false,
    },
    run: async (a) => {
      const r = await pmGet('/v1/search', { query: a.query, limit: a.limit || 10 });
      if (r.status !== 200) return fail(r, 'search');
      const rows = (r.body.events || []).map(e => `${e.title} [event ${e.slug}]` +
        (e.markets || []).map(m => `\n  - ${m.question} [${m.slug}]${m.lastTradePrice != null ? ` last $${m.lastTradePrice}` : ''}`).join(''));
      return rows.length ? rows.join('\n') : 'No matches.';
    },
  },
  {
    name: 'list_markets',
    description: 'List markets (public) with filters: active, categories (e.g. politics, sports, crypto), minimum volume/liquidity.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'default 20' },
        offset: { type: 'number' },
        active: { type: 'boolean', description: 'default true' },
        categories: { type: 'array', items: { type: 'string' } },
        volume_min: { type: 'number' },
        liquidity_min: { type: 'number' },
      },
      additionalProperties: false,
    },
    run: async (a) => {
      const r = await pmGet('/v1/markets', {
        limit: a.limit || 20, offset: a.offset, active: a.active ?? true, categories: a.categories,
        volumeNumMin: a.volume_min, liquidityNumMin: a.liquidity_min,
      });
      if (r.status !== 200) return fail(r, 'markets');
      const rows = (r.body.markets || []).map(m =>
        `${m.question} [${m.slug}] bid ${m.bestBid ?? '-'} / ask ${m.bestAsk ?? '-'} last ${m.lastTradePrice ?? '-'} | vol ${m.volume} | liq ${m.liquidity}`);
      return rows.length ? rows.join('\n') : 'No markets.';
    },
  },
  {
    name: 'get_market',
    description: 'Full details for one market by slug (public): question, rules/description, status, prices, volume.',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    run: async (a) => {
      const r = await pmGet(`/v1/market/slug/${encodeURIComponent(a.slug)}`);
      return r.status === 200 ? fmt(r.body) : fail(r, 'market');
    },
  },
  {
    name: 'get_book',
    description: 'Order book for a market slug (public): top bid/ask levels with size, state, stats. Use depth to cap levels.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, depth: { type: 'number', description: 'levels per side, default 10' } },
      required: ['slug'], additionalProperties: false,
    },
    run: async (a) => {
      const r = await pmGet(`/v1/markets/${encodeURIComponent(a.slug)}/book`);
      if (r.status !== 200) return fail(r, 'book');
      const d = r.body.marketData || r.body; const n = a.depth || 10;
      const side = (arr) => (arr || []).slice(0, n).map(l => `  $${amt(l.px)} x ${l.qty}`).join('\n') || '  (empty)';
      return `${a.slug} state ${d.state}\nBIDS\n${side(d.bids)}\nOFFERS\n${side(d.offers)}\nstats ${fmt(d.stats || {})}`;
    },
  },
  {
    name: 'get_bbo',
    description: 'Best bid / best ask / last trade / open interest for a market slug (public, lightweight).',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    run: async (a) => {
      const r = await pmGet(`/v1/markets/${encodeURIComponent(a.slug)}/bbo`);
      if (r.status !== 200) return fail(r, 'bbo');
      const d = r.body.marketData || r.body;
      return `${a.slug}: bid $${amt(d.bestBid)} (${d.bidDepth} lvls) | ask $${amt(d.bestAsk)} (${d.askDepth} lvls) | last $${amt(d.lastTradePx)} | OI ${d.openInterest}`;
    },
  },
];

// ---------- Minimal MCP JSON-RPC over HTTP (same as cyre-x-bridge) ----------
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function handleRpc(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'cyre-polymarket-bridge', version: '1.0.1' },
    });
  }
  if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return null;
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      const text = await tool.run(params?.arguments || {});
      return rpcResult(id, { content: [{ type: 'text', text: String(text) }] });
    } catch (e) {
      return rpcResult(id, { content: [{ type: 'text', text: `Tool error: ${e.message}` }], isError: true });
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('cyre-polymarket-bridge up');
  }
  const expected = `/mcp/${SECRET}`;
  if (!SECRET || !req.url.startsWith(expected)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  if (req.method === 'GET') { res.writeHead(405, { 'content-type': 'text/plain', allow: 'POST' }); return res.end('POST only'); }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }

  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on('end', async () => {
    let msg;
    try { msg = JSON.parse(raw); } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(rpcError(null, -32700, 'Parse error')));
    }
    try {
      const isBatch = Array.isArray(msg);
      const outs = [];
      for (const m of (isBatch ? msg : [msg])) { const out = await handleRpc(m); if (out) outs.push(out); }
      if (!outs.length) { res.writeHead(202); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(isBatch ? outs : outs[0]));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rpcError(msg?.id ?? null, -32603, e.message)));
    }
  });
});

server.listen(PORT, () => {
  console.log(`cyre-polymarket-bridge listening on :${PORT}`);
  console.log(`MCP endpoint: /mcp/${SECRET ? '<CONNECT_SECRET set>' : '!! CONNECT_SECRET MISSING !!'}`);
  const missing = ['POLYMARKET_KEY_ID', 'POLYMARKET_SECRET_KEY'].filter(k => !process.env[k]);
  if (missing.length) console.log(`WARNING: missing env vars: ${missing.join(', ')}`);
});

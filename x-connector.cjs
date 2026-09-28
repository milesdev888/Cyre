// x-connector.js — CYRE X (Twitter) bridge for Claude custom connectors
// A minimal MCP (Model Context Protocol) server over HTTP, zero dependencies.
// Deploy on Render as a Web Service. Claude connects to:  https://<service>.onrender.com/mcp/<CONNECT_SECRET>
//
// Env vars (set in Render dashboard, never in code):
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET   — X API v2 credentials (OAuth 1.0a user context)
//   CONNECT_SECRET  — long random string; part of the URL path so only Claude (and you) can call this server
//   PORT            — provided by Render automatically

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const SECRET = process.env.CONNECT_SECRET || '';

// ---------- OAuth 1.0a signing (works for GET with query params and POST with JSON body) ----------
function pctEnc(s) {
  return encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function oauthHeader(method, url, queryParams = {}) {
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  const all = { ...oauth, ...queryParams };
  const paramStr = Object.keys(all).sort().map(k => `${pctEnc(k)}=${pctEnc(all[k])}`).join('&');
  const base = `${method}&${pctEnc(url)}&${pctEnc(paramStr)}`;
  const key = `${pctEnc(process.env.X_API_SECRET)}&${pctEnc(process.env.X_ACCESS_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort().map(k => `${pctEnc(k)}="${pctEnc(oauth[k])}"`).join(', ');
}

async function xGet(path, params = {}) {
  const url = `https://api.twitter.com${path}`;
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(qs ? `${url}?${qs}` : url, {
    headers: { Authorization: oauthHeader('GET', url, params) },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function xPost(path, json) {
  const url = `https://api.twitter.com${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: oauthHeader('POST', url), 'content-type': 'application/json' },
    body: JSON.stringify(json),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

// ---------- Tool implementations ----------
let cachedMe = null;
async function getMe() {
  if (cachedMe) return cachedMe;
  const r = await xGet('/2/users/me');
  if (r.status === 200 && r.body?.data) cachedMe = r.body.data; // {id, name, username}
  return cachedMe || r.body;
}

const TOOLS = [
  {
    name: 'verify_connection',
    description: 'Check that the X credentials work. Returns the connected account (id, name, username).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const me = await getMe();
      return me?.username ? `Connected as @${me.username} (id ${me.id})` : `Auth failed: ${JSON.stringify(me)}`;
    },
  },
  {
    name: 'get_my_tweets',
    description: "Fetch the connected account's most recent tweets (up to 20). Use to check what Guardian or the team has posted.",
    inputSchema: {
      type: 'object',
      properties: { max_results: { type: 'number', description: '5-20, default 10' } },
      additionalProperties: false,
    },
    run: async (args) => {
      const me = await getMe();
      if (!me?.id) return `Auth failed: ${JSON.stringify(me)}`;
      const n = Math.min(Math.max(args?.max_results || 10, 5), 20);
      const r = await xGet(`/2/users/${me.id}/tweets`, {
        max_results: String(n),
        'tweet.fields': 'created_at,public_metrics',
      });
      if (r.status !== 200) return `X API ${r.status}: ${JSON.stringify(r.body)}`;
      const rows = (r.body.data || []).map(t =>
        `[${t.created_at}] (♥${t.public_metrics?.like_count ?? 0} 🔁${t.public_metrics?.retweet_count ?? 0} 💬${t.public_metrics?.reply_count ?? 0})\nid ${t.id}: ${t.text}`
      );
      return rows.length ? rows.join('\n\n') : 'No tweets found.';
    },
  },
  {
    name: 'get_replies',
    description: 'Fetch recent replies to a specific tweet (by tweet id) — e.g. wallet entries under the pinned airdrop post. Note: reply search may not be available on the free X API tier; the raw API error is returned if so.',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_id: { type: 'string', description: 'The id of the tweet whose replies to fetch' },
        max_results: { type: 'number', description: '10-100, default 50' },
        pagination_token: { type: 'string', description: 'Token from a previous call to get the next page' },
      },
      required: ['tweet_id'],
      additionalProperties: false,
    },
    run: async (args) => {
      const n = Math.min(Math.max(args?.max_results || 50, 10), 100);
      const params = {
        query: `conversation_id:${args.tweet_id}`,
        max_results: String(n),
        'tweet.fields': 'created_at,author_id',
        expansions: 'author_id',
        'user.fields': 'username',
      };
      if (args.pagination_token) params.next_token = args.pagination_token;
      const r = await xGet('/2/tweets/search/recent', params);
      if (r.status !== 200) return `X API ${r.status}: ${JSON.stringify(r.body)}`;
      const users = {};
      (r.body.includes?.users || []).forEach(u => { users[u.id] = u.username; });
      const rows = (r.body.data || []).map(t => `@${users[t.author_id] || t.author_id} [${t.created_at}]: ${t.text}`);
      const next = r.body.meta?.next_token ? `\n\n(next page token: ${r.body.meta.next_token})` : '';
      return (rows.length ? rows.join('\n') : 'No replies found in the last 7 days.') + next;
    },
  },
  {
    name: 'get_mentions',
    description: 'Fetch recent tweets mentioning the connected account (up to 20).',
    inputSchema: {
      type: 'object',
      properties: { max_results: { type: 'number', description: '5-20, default 10' } },
      additionalProperties: false,
    },
    run: async (args) => {
      const me = await getMe();
      if (!me?.id) return `Auth failed: ${JSON.stringify(me)}`;
      const n = Math.min(Math.max(args?.max_results || 10, 5), 20);
      const r = await xGet(`/2/users/${me.id}/mentions`, {
        max_results: String(n),
        'tweet.fields': 'created_at,author_id',
        expansions: 'author_id',
        'user.fields': 'username',
      });
      if (r.status !== 200) return `X API ${r.status}: ${JSON.stringify(r.body)}`;
      const users = {};
      (r.body.includes?.users || []).forEach(u => { users[u.id] = u.username; });
      const rows = (r.body.data || []).map(t => `@${users[t.author_id] || t.author_id} [${t.created_at}] (id ${t.id}): ${t.text}`);
      return rows.length ? rows.join('\n') : 'No recent mentions.';
    },
  },
  {
    name: 'post_tweet',
    description:
      'DISABLED by default (X_WRITE_ENABLED must be "true"). Post a tweet from the connected account — founder-gated only. Automated cron/bot writes are prohibited while the account appeal is open.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The tweet text (max 280 chars)' },
        in_reply_to_tweet_id: { type: 'string', description: 'Optional: tweet id to reply to' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    run: async (args) => {
      // Hard kill-switch: any write requires explicit X_WRITE_ENABLED=true in env.
      // Default / unset / "false" → refuse. Read tools remain available.
      if (String(process.env.X_WRITE_ENABLED || '').toLowerCase() !== 'true') {
        return 'REFUSED: X writes are disabled (X_WRITE_ENABLED!=true). Bridge is read-only until the founder re-enables.';
      }
      const payload = { text: String(args.text).slice(0, 280) };
      if (args.in_reply_to_tweet_id) payload.reply = { in_reply_to_tweet_id: args.in_reply_to_tweet_id };
      const r = await xPost('/2/tweets', payload);
      if (r.status === 201 && r.body?.data?.id) return `Posted. Tweet id: ${r.body.data.id}`;
      return `X API ${r.status}: ${JSON.stringify(r.body)}`;
    },
  },
];

// ---------- Minimal MCP JSON-RPC over HTTP ----------
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function handleRpc(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'cyre-x-bridge', version: '1.0.0' },
    });
  }
  if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) {
    return null; // notifications get no response
  }
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
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
  const path = (req.url || '').split('?')[0];

  // Render liveness — no X API calls (keeps Claude's post_tweet quota free)
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    return res.end('cyre-x-bridge up');
  }

  // Optional deep check for manual smoke tests only — not wired as Render healthCheckPath
  if (req.method === 'GET' && path === '/health') {
    const missing = ['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_SECRET','CONNECT_SECRET'].filter(k => !process.env[k]);
    let xAuth = 'unknown';
    if (!missing.length) {
      try {
        const me = await getMe();
        xAuth = me?.username ? `ok:@${me.username}` : 'fail';
      } catch (e) {
        xAuth = 'fail';
      }
    }
    const body = {
      ok: missing.length === 0 && xAuth.startsWith('ok:'),
      service: 'cyre-x-bridge',
      xAuth,
      missingEnv: missing,
      claudeMcp: SECRET ? `/mcp/${SECRET.slice(0, 4)}…` : 'CONNECT_SECRET missing',
      tools: TOOLS.map(t => t.name),
    };
    res.writeHead(body.ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(body));
  }

  const expected = `/mcp/${SECRET}`;
  if (!SECRET || !req.url.startsWith(expected)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }

  if (req.method === 'GET') {
    // We don't maintain a server->client stream; clients using pure POST work fine.
    res.writeHead(405, { 'content-type': 'text/plain', allow: 'POST' });
    return res.end('POST only');
  }

  if (req.method !== 'POST') {
    res.writeHead(405); return res.end();
  }

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
      const msgs = isBatch ? msg : [msg];
      const outs = [];
      for (const m of msgs) {
        const out = await handleRpc(m);
        if (out) outs.push(out);
      }
      if (!outs.length) { res.writeHead(202); return res.end(); } // notification(s) only
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(isBatch ? outs : outs[0]));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rpcError(msg?.id ?? null, -32603, e.message)));
    }
  });
});

server.listen(PORT, () => {
  console.log(`cyre-x-bridge listening on :${PORT}`);
  console.log(`MCP endpoint: /mcp/${SECRET ? '<CONNECT_SECRET set>' : '!! CONNECT_SECRET MISSING !!'}`);
  const missing = ['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_SECRET'].filter(k => !process.env[k]);
  if (missing.length) console.log(`WARNING: missing X env vars: ${missing.join(', ')}`);
});

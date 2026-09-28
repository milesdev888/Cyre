// api/_redis.js — Shared durable store for badge orders / registry / burn ledger.
// Supports:
//   1) Upstash / Vercel KV REST (https://… + token) — REDIS_URL | UPSTASH_REDIS_REST_URL | KV_REST_API_URL
//   2) Redis/Valkey TCP (redis:// or rediss://) — REDIS_URL / REDIS_TCP_URL
// Prefer REST on Vercel when available; TCP works with Render Key Value.

import { createClient } from 'redis';

let tcpClientPromise = null;

function restConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    (String(process.env.REDIS_URL || '').startsWith('https://') ? process.env.REDIS_URL : '') ||
    '';
  if (!url.startsWith('https://')) return null;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.REDIS_TOKEN ||
    '';
  return token ? { url: url.replace(/\/$/, ''), token } : null;
}

function tcpUrl() {
  const u =
    process.env.REDIS_TCP_URL ||
    (String(process.env.REDIS_URL || '').match(/^rediss?:\/\//) ? process.env.REDIS_URL : '') ||
    '';
  return u || null;
}

export function isDurableRedis() {
  return !!(restConfig() || tcpUrl());
}

async function getTcpClient() {
  const url = tcpUrl();
  if (!url) return null;
  if (!tcpClientPromise) {
    tcpClientPromise = (async () => {
      const client = createClient({
        url,
        socket: {
          // Vercel serverless: fail fast; reconnect handled per warm instance.
          connectTimeout: 10_000,
          reconnectStrategy: (retries) => (retries > 5 ? new Error('redis reconnect exhausted') : Math.min(retries * 200, 2000))
        }
      });
      client.on('error', (err) => {
        console.error('redis tcp error', err && err.message);
      });
      await client.connect();
      return client;
    })();
  }
  return tcpClientPromise;
}

/**
 * Run a Redis command. REST uses Upstash JSON array form; TCP uses node-redis.
 * @param {string[]} cmd e.g. ['GET', 'key'] or ['SET', 'key', 'val']
 * @returns {Promise<{ result: any }|null>}
 */
export async function redisCommand(cmd) {
  if (!Array.isArray(cmd) || !cmd.length) return null;

  const rest = restConfig();
  if (rest) {
    const r = await fetch(rest.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + rest.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cmd)
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('redis ' + r.status + ' ' + t.slice(0, 200));
    }
    return r.json();
  }

  const client = await getTcpClient();
  if (!client) return null;

  const [op, ...args] = cmd;
  const method = String(op || '').toLowerCase();
  let result;
  switch (method) {
    case 'get':
      result = await client.get(args[0]);
      break;
    case 'set': {
      // Support SET key val [EX seconds] [NX|XX] — cert nonces use EX
      const opts = {};
      const rest = args.slice(2);
      for (let i = 0; i < rest.length; i++) {
        const flag = String(rest[i]).toUpperCase();
        if (flag === 'NX') opts.NX = true;
        else if (flag === 'XX') opts.XX = true;
        else if (flag === 'EX' && rest[i + 1] != null) {
          opts.EX = Number(rest[++i]);
        } else if (flag === 'PX' && rest[i + 1] != null) {
          opts.PX = Number(rest[++i]);
        }
      }
      result = Object.keys(opts).length
        ? await client.set(args[0], args[1], opts)
        : await client.set(args[0], args[1]);
      break;
    }
    case 'setex':
      result = await client.setEx(args[0], Number(args[1]), args[2]);
      break;
    case 'expire':
      result = await client.expire(args[0], Number(args[1]));
      break;
    case 'incr':
      result = await client.incr(args[0]);
      break;
    case 'hincrby':
      result = await client.hIncrBy(args[0], args[1], Number(args[2]));
      break;
    case 'lpush':
      result = await client.lPush(args[0], args.slice(1).map(String));
      break;
    case 'ltrim':
      result = await client.lTrim(args[0], Number(args[1]), Number(args[2]));
      break;
    case 'lrange':
      result = await client.lRange(args[0], Number(args[1]), Number(args[2]));
      break;
    case 'hsetnx': {
      // HSETNX key field value → 1 if set, 0 if existed
      const ok = await client.hSetNX(args[0], args[1], args[2]);
      result = ok ? 1 : 0;
      break;
    }
    case 'hget':
      result = await client.hGet(args[0], args[1]);
      break;
    case 'hgetall':
      result = await client.hGetAll(args[0]);
      break;
    case 'hdel':
      result = await client.hDel(args[0], args[1]);
      break;
    case 'zadd':
      // ZADD key score member — our callers pass [ZADD, key, scoreString, member]
      result = await client.zAdd(args[0], { score: Number(args[1]), value: String(args[2]) });
      break;
    case 'zrevrange': {
      const start = Number(args[1]);
      const stop = Number(args[2]);
      result = await client.zRange(args[0], start, stop, { REV: true });
      break;
    }
    case 'del':
      result = await client.del(args[0]);
      break;
    default:
      // Generic sendCommand fallback
      result = await client.sendCommand(cmd.map(String));
  }
  return { result };
}

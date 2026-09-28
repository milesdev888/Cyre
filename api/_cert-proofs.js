// api/_cert-proofs.js — Phase 1 proofs: token creator, X code, Telegram admin, website DNS/TXT.
// Re-check marks individual proof rows Lapsed (does not auto-dissolve the certificate).

import crypto from 'node:crypto';
import { redisCommand, isDurableRedis } from './_redis.js';
import fs from 'node:fs';
import path from 'node:path';

const CODE_PREFIX = 'cert:proofcode:';
const FILE_STORE = process.env.CERT_PROOF_STORE || '/tmp/cyre-cert-proof-codes.json';
const SOLANA_RPC =
  process.env.SOLANA_RPC_URL ||
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC ||
  'https://api.mainnet-beta.solana.com';

/** Known launchpad / factory wallets — claims from these → needs_review (Miles). */
export const LAUNCHPAD_WALLETS = new Set(
  [
    // pump.fun
    'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM',
    '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg',
    // moonshot / similar program authorities — extend via env
    ...(String(process.env.CYRE_LAUNCHPAD_WALLETS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean))
  ].map((s) => s)
);

export function isLaunchpadWallet(addr) {
  return LAUNCHPAD_WALLETS.has(String(addr || '').trim());
}

async function solanaRpc(method, params) {
  const r = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'solana rpc error');
  return j.result;
}

/**
 * Best-effort: find the fee-payer / creator of the mint's earliest transaction.
 * Returns base58 wallet or null.
 */
export async function detectTokenCreator(mint) {
  const m = String(mint || '').trim();
  if (!m) return null;
  try {
    // Walk back to the oldest signature (RPC returns newest first, 1000 per page).
    let before;
    let oldest = null;
    for (let page = 0; page < 50; page++) {
      const opts = { limit: 1000 };
      if (before) opts.before = before;
      const sigs = await solanaRpc('getSignaturesForAddress', [m, opts]);
      if (!Array.isArray(sigs) || !sigs.length) break;
      oldest = sigs[sigs.length - 1];
      before = oldest.signature;
      if (sigs.length < 1000) break;
      if (page === 49) return null; // too much history to resolve safely -> manual review
    }
    if (!oldest || !oldest.signature) return null;
    const tx = await solanaRpc('getTransaction', [
      oldest.signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
    ]);
    const keys =
      (tx &&
        tx.transaction &&
        tx.transaction.message &&
        (tx.transaction.message.accountKeys || tx.transaction.message.staticAccountKeys)) ||
      [];
    // First account is typically the fee payer / creator
    const first = keys[0];
    if (!first) return null;
    if (typeof first === 'string') return first;
    return first.pubkey || first.toString?.() || null;
  } catch (e) {
    console.error('detectTokenCreator failed', e && e.message);
    return null;
  }
}

function readCodes() {
  try {
    if (!fs.existsSync(FILE_STORE)) return {};
    return JSON.parse(fs.readFileSync(FILE_STORE, 'utf8')) || {};
  } catch {
    return {};
  }
}
function writeCodes(map) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE_STORE, JSON.stringify(map));
  } catch (e) {
    console.error('proof code write failed', e && e.message);
  }
}

/** Issue a one-time proof code for X / website binding. */
export async function issueProofCode({ serial, kind, hint }) {
  const code = 'cyre-' + crypto.randomBytes(6).toString('hex');
  const record = {
    code,
    serial,
    kind,
    hint: hint || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  };
  if (isDurableRedis()) {
    await redisCommand(['SET', CODE_PREFIX + code, JSON.stringify(record), 'EX', String(24 * 3600)]);
  } else {
    const map = readCodes();
    map[code] = record;
    writeCodes(map);
  }
  return record;
}

export async function loadProofCode(code) {
  const c = String(code || '').trim();
  if (isDurableRedis()) {
    const row = await redisCommand(['GET', CODE_PREFIX + c]);
    if (!row || !row.result) return null;
    try {
      return JSON.parse(row.result);
    } catch {
      return null;
    }
  }
  return readCodes()[c] || null;
}

/**
 * X proof: the caller supplies only the tweet URL. Cyre fetches the tweet itself
 * and takes the text and permanent user ID from X, never from the caller.
 */
export async function verifyXProof({ code, tweetUrl }) {
  const record = await loadProofCode(code);
  if (!record || record.kind !== 'x') return { ok: false, error: 'unknown x proof code' };
  if (Date.parse(record.expiresAt) <= Date.now()) return { ok: false, error: 'code expired' };
  const m = String(tweetUrl || '').match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i);
  if (!m) return { ok: false, error: 'tweetUrl required (https://x.com/<handle>/status/<id>)' };
  let tweet;
  try {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${m[1]}&token=4`);
    if (!r.ok) return { ok: false, error: 'tweet not found or not public' };
    tweet = await r.json();
  } catch {
    return { ok: false, error: 'could not fetch tweet' };
  }
  const text = String((tweet && tweet.text) || '');
  const user = (tweet && tweet.user) || {};
  if (!text.includes(record.code)) return { ok: false, error: 'tweet does not contain proof code' };
  if (!user.id_str) return { ok: false, error: 'could not read tweet author' };
  return {
    ok: true,
    proof: {
      kind: 'x',
      id: String(user.id_str),
      display: user.screen_name ? `@${user.screen_name}` : String(user.id_str),
      status: 'ok',
      checkedAt: new Date().toISOString()
    },
    serial: record.serial
  };
}

/**
 * Telegram: Cyre bot must be an admin of chatId AND the chat description must
 * contain the one-time code (proves the claimant controls the chat, not just the bot).
 */
export async function verifyTelegramProof({ chatId, display, code }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const id = String(chatId || '').trim();
  if (!id) return { ok: false, error: 'chatId required' };
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  try {
    const me = await botUserId(token);
    const r = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: id, user_id: me })
    });
    const j = await r.json();
    const status = j && j.result && j.result.status;
    if (!j.ok || (status !== 'administrator' && status !== 'creator')) {
      return { ok: false, error: 'Cyre bot is not an admin of this chat' };
    }
    if (code !== undefined) {
      const record = await loadProofCode(code);
      if (!record || record.kind !== 'tg') return { ok: false, error: 'unknown telegram proof code' };
      if (Date.parse(record.expiresAt) <= Date.now()) return { ok: false, error: 'code expired' };
      const c = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: id })
      });
      const cj = await c.json();
      const desc = String((cj && cj.result && cj.result.description) || '');
      if (!desc.includes(record.code)) {
        return { ok: false, error: 'chat description does not contain the proof code' };
      }
    }
    const chatIdNum = j.result && j.result.chat ? j.result.chat.id : id;
    return {
      ok: true,
      proof: {
        kind: 'tg',
        id: String(chatIdNum || id),
        display: display || id,
        status: 'ok',
        checkedAt: new Date().toISOString()
      }
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'telegram check failed' };
  }
}

async function botUserId(token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const j = await r.json();
  return j && j.result && j.result.id;
}

/**
 * Website: DNS TXT cyre-verify=<code> OR https://domain/.well-known/cyre.txt containing the code.
 */
export async function verifyWebsiteProof({ domain, code }) {
  const host = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (!host) return { ok: false, error: 'domain required' };
  const expect = String(code || '').trim();
  if (!expect) return { ok: false, error: 'code required' };

  let found = false;
  let method = null;

  // DNS TXT via Google DNS-over-HTTPS
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=TXT`);
    const j = await r.json();
    const answers = (j && j.Answer) || [];
    for (const a of answers) {
      const data = String(a.data || '').replace(/"/g, '');
      if (data === `cyre-verify=${expect}` || data.includes(`cyre-verify=${expect}`)) {
        found = true;
        method = 'dns-txt';
        break;
      }
    }
  } catch (e) {
    console.error('dns txt check failed', e && e.message);
  }

  if (!found) {
    try {
      const r = await fetch(`https://${host}/.well-known/cyre.txt`, {
        headers: { accept: 'text/plain' },
        redirect: 'follow'
      });
      if (r.ok) {
        const t = await r.text();
        if (t && t.includes(expect)) {
          found = true;
          method = 'well-known';
        }
      }
    } catch (e) {
      console.error('well-known check failed', e && e.message);
    }
  }

  if (!found) return { ok: false, error: 'cyre-verify TXT or /.well-known/cyre.txt not found' };
  return {
    ok: true,
    proof: {
      kind: 'web',
      id: host,
      display: host,
      status: 'ok',
      checkedAt: new Date().toISOString(),
      meta: { method }
    }
  };
}

/** Re-check a single proof; returns updated status ok | Lapsed. */
export async function recheckProof(proof) {
  if (!proof || !proof.kind) return proof;
  const now = new Date().toISOString();
  try {
    if (proof.kind === 'web') {
      // Re-read DNS / well-known using stored code if present in meta
      const code = proof.meta && proof.meta.code;
      if (!code) return { ...proof, status: 'ok', checkedAt: now };
      const r = await verifyWebsiteProof({ domain: proof.id, code });
      return { ...proof, status: r.ok ? 'ok' : 'Lapsed', checkedAt: now };
    }
    if (proof.kind === 'tg') {
      const r = await verifyTelegramProof({ chatId: proof.id, display: proof.display });
      return { ...proof, status: r.ok ? 'ok' : 'Lapsed', checkedAt: now };
    }
    if (proof.kind === 'token') {
      // Token creator is permanent — still ok unless mint gone
      const creator = await detectTokenCreator(proof.id);
      return { ...proof, status: creator ? 'ok' : 'Lapsed', checkedAt: now };
    }
    if (proof.kind === 'x') {
      // Without continuous X API we keep ok; lapsed only when explicit fail flag set
      return { ...proof, status: proof.status === 'Lapsed' ? 'Lapsed' : 'ok', checkedAt: now };
    }
  } catch {
    return { ...proof, status: 'Lapsed', checkedAt: now };
  }
  return { ...proof, checkedAt: now };
}

// api/_cert-auth.js — Signed-message auth for Cyre Certificates.
// Domain-bound to cyre.dev, one-time nonce, 30-minute expiry.
// NEVER asks for a transaction — message signatures only (Solana ed25519 or EVM personal_sign).

import crypto from 'node:crypto';
import { verifyMessage } from 'viem';
import { redisCommand, isDurableRedis } from './_redis.js';
import fs from 'node:fs';
import path from 'node:path';

const DOMAIN = 'cyre.dev';
const NONCE_TTL_SEC = 30 * 60;
const NONCE_PREFIX = 'cert:nonce:';
const FILE_STORE = process.env.CERT_NONCE_STORE || '/tmp/cyre-cert-nonces.json';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function b58Decode(str) {
  const s = String(str || '');
  if (!s) return null;
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const bytes = [0];
  for (let i = zeros; i < s.length; i++) {
    const val = B58.indexOf(s[i]);
    if (val < 0) return null;
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < zeros; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

function readFileNonces() {
  try {
    if (!fs.existsSync(FILE_STORE)) return {};
    return JSON.parse(fs.readFileSync(FILE_STORE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeFileNonces(map) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE_STORE, JSON.stringify(map));
  } catch (e) {
    console.error('cert nonce file write failed', e && e.message);
  }
}

export function isEvmAddress(wallet) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(wallet || ''));
}

export function isSolanaAddress(wallet) {
  const b = b58Decode(wallet);
  return !!(b && b.length === 32);
}

/**
 * Build the exact message the wallet must sign.
 * @param {{ action: string, nonce: string, wallet: string, expiresAt: string, extra?: string }} p
 */
export function buildCertMessage(p) {
  const lines = [
    `${DOMAIN} wants you to ${p.action} a Cyre Certificate.`,
    '',
    `Wallet: ${p.wallet}`,
    `Nonce: ${p.nonce}`,
    `Expires: ${p.expiresAt}`,
    '',
    'This is a message signature only — Cyre never asks you to approve a transaction.'
  ];
  if (p.extra) lines.splice(5, 0, p.extra);
  return lines.join('\n');
}

export async function issueNonce({ action, wallet, extra }) {
  const w = String(wallet || '').trim();
  if (!w) throw new Error('wallet required');
  if (!action) throw new Error('action required');
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_SEC * 1000).toISOString();
  const message = buildCertMessage({ action, nonce, wallet: w, expiresAt, extra });
  const record = { nonce, action, wallet: w, expiresAt, message, used: false };

  if (isDurableRedis()) {
    await redisCommand(['SET', NONCE_PREFIX + nonce, JSON.stringify(record), 'EX', String(NONCE_TTL_SEC)]);
  } else {
    const map = readFileNonces();
    // prune expired
    const now = Date.now();
    for (const [k, v] of Object.entries(map)) {
      if (!v || Date.parse(v.expiresAt) <= now || v.used) delete map[k];
    }
    map[nonce] = record;
    writeFileNonces(map);
  }

  return { nonce, expiresAt, message, domain: DOMAIN, ttlSeconds: NONCE_TTL_SEC };
}

async function loadNonce(nonce) {
  if (isDurableRedis()) {
    const row = await redisCommand(['GET', NONCE_PREFIX + nonce]);
    if (!row || !row.result) return null;
    try {
      return JSON.parse(row.result);
    } catch {
      return null;
    }
  }
  const map = readFileNonces();
  return map[nonce] || null;
}

async function consumeNonce(nonce) {
  if (isDurableRedis()) {
    await redisCommand(['DEL', NONCE_PREFIX + nonce]);
    return;
  }
  const map = readFileNonces();
  delete map[nonce];
  writeFileNonces(map);
}

export async function verifySolanaMessage(wallet, message, signature) {
  try {
    const pub = b58Decode(wallet);
    if (!pub || pub.length !== 32) return false;
    let sigBuf;
    const sig = String(signature || '').trim();
    if (/^[0-9a-fA-F]+$/.test(sig) && sig.length === 128) {
      sigBuf = Buffer.from(sig, 'hex');
    } else if (sig.startsWith('0x') && sig.length === 130) {
      sigBuf = Buffer.from(sig.slice(2), 'hex');
    } else {
      // base58 or base64
      sigBuf = b58Decode(sig);
      if (!sigBuf || sigBuf.length !== 64) {
        try {
          sigBuf = Buffer.from(sig, 'base64');
        } catch {
          return false;
        }
      }
    }
    if (!sigBuf || sigBuf.length !== 64) return false;
    const msgBuf = Buffer.from(String(message), 'utf8');
    return crypto.verify(null, msgBuf, { key: pub, format: 'raw', type: 'ed25519' }, sigBuf);
  } catch {
    return false;
  }
}

export async function verifyEvmMessage(wallet, message, signature) {
  try {
    return await verifyMessage({
      address: /** @type {`0x${string}`} */ (wallet),
      message: String(message),
      signature: /** @type {`0x${string}`} */ (signature)
    });
  } catch {
    return false;
  }
}

/**
 * Verify + consume a one-time nonce-bound signed message.
 * @returns {Promise<{ ok: true, wallet: string, action: string } | { ok: false, error: string }>}
 */
export async function verifyCertSignedAction({
  wallet,
  action,
  nonce,
  message,
  signature
}) {
  const w = String(wallet || '').trim();
  const n = String(nonce || '').trim();
  const msg = String(message || '');
  const sig = String(signature || '').trim();
  if (!w || !n || !msg || !sig) return { ok: false, error: 'wallet, nonce, message, signature required' };

  const record = await loadNonce(n);
  if (!record) return { ok: false, error: 'nonce unknown or expired' };
  if (record.used) return { ok: false, error: 'nonce already used' };
  if (Date.parse(record.expiresAt) <= Date.now()) {
    await consumeNonce(n);
    return { ok: false, error: 'nonce expired' };
  }
  if (record.wallet !== w) return { ok: false, error: 'wallet mismatch' };
  if (record.action !== action) return { ok: false, error: 'action mismatch' };
  if (record.message !== msg) return { ok: false, error: 'message mismatch' };
  if (!msg.includes(DOMAIN)) return { ok: false, error: 'message not domain-bound to cyre.dev' };
  if (!msg.includes('Cyre never asks you to approve a transaction')) {
    return { ok: false, error: 'message missing no-transaction clause' };
  }

  let good = false;
  if (isEvmAddress(w)) good = await verifyEvmMessage(w, msg, sig);
  else if (isSolanaAddress(w)) good = await verifySolanaMessage(w, msg, sig);
  else return { ok: false, error: 'unsupported wallet format' };

  if (!good) return { ok: false, error: 'bad signature' };

  await consumeNonce(n);
  return { ok: true, wallet: w, action };
}

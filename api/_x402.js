// api/_x402.js — shared x402 v2 payment gate (zero-dep).
// Used by address/token/passport/handshake/preflight/receipt/delta/batch/program/alerts/oracle/gate.
// Site visitors stay free.
//
// Env (optional until X402_ENABLED=true):
//   X402_ENABLED, X402_NETWORK, X402_NETWORK_BASE, X402_PRICE (per-route override via createX402Gate)
//   CDP_API_KEY_ID, CDP_API_KEY_SECRET
//   X402_PAY_TO, X402_FACILITATOR, X402_PAY_TO_BASE, X402_FACILITATOR_BASE
//   -- BNB Chain / B402 lane (dormant until X402_PAY_TO_BSC is set) --
//   X402_PAY_TO_BSC, X402_NETWORK_BSC (mainnet|testnet), X402_ASSET_BSC
//   X402_FACILITATOR_BSC — Render relay base (default …/internal/b402); Vercel never holds B402 secrets
//   Optional extra fallbacks if relay /supported unavailable: B402_SIGNER_ADDRESS, B402_SPENDER_ADDRESS
//   X402_INTERNAL_KEY — bypass via x-guardian-key; also auth to the B402 relay
// See docs/B402-RESEARCH.md · docs/B402-ENV.md

const DEFAULT_FACILITATOR = 'https://x402.org/facilitator';
const CDP_FACILITATOR = 'https://api.cdp.coinbase.com/platform/v2/x402';
const DEFAULT_B402_RELAY = 'https://cyre-fraud-prediction.onrender.com/internal/b402';
const CDP_KEY_ID = process.env.CDP_API_KEY_ID || '';
const CDP_KEY_SECRET = process.env.CDP_API_KEY_SECRET || '';
const X402_ENABLED = process.env.X402_ENABLED === 'true';
const NET = (process.env.X402_NETWORK || 'devnet').toLowerCase();
const NET_BASE = (process.env.X402_NETWORK_BASE || 'mainnet').toLowerCase();

// BSC mainnet stables are 18 decimals; Base USDC price knobs stay 6-decimal atomic.
const BSC_ASSETS = {
  mainnet: {
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, name: 'Tether USD', version: '1' },
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, name: 'USD Coin', version: '2' }
  },
  testnet: {
    USDT: { address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18, name: 'Tether USD', version: '1' },
    USDC: { address: '0xEC1C60D64a06896Df296438c12edD14E974FDE47', decimals: 6, name: 'USD Coin', version: '2' }
  }
};

const BSC_EXTRA_TTL_MS = 5 * 60 * 1000;
const SETTLE_POLL_MS = 10000;
const SETTLE_POLL_INTERVAL_MS = 400;

/** @type {{ at: number, key: string, extra: object|null }} */
let bscExtraCache = { at: 0, key: '', extra: null };

function bscAssetConfig() {
  const net = (process.env.X402_NETWORK_BSC || 'mainnet').toLowerCase();
  const envKey = net === 'testnet' ? 'testnet' : 'mainnet';
  const sym = String(process.env.X402_ASSET_BSC || 'USDT').trim().toUpperCase();
  const table = BSC_ASSETS[envKey];
  return table[sym] || table.USDT;
}

function buildBscLane() {
  const payTo = process.env.X402_PAY_TO_BSC || '';
  const asset = bscAssetConfig();
  const net = (process.env.X402_NETWORK_BSC || 'mainnet').toLowerCase();
  const network = net === 'testnet' ? 'eip155:97' : 'eip155:56';
  return {
    name: 'bsc',
    payTo,
    facilitator: String(process.env.X402_FACILITATOR_BSC || DEFAULT_B402_RELAY).replace(/\/$/, ''),
    auth: 'relay',
    verifyPath: '/verify',
    settlePath: '/settle',
    // extra filled at offer time from /supported (or env fallback) — never guess
    mainnet: { network, usdc: asset.address, decimals: asset.decimals, extra: {}, scheme: 'exact' },
    devnet: { network, usdc: asset.address, decimals: asset.decimals, extra: {}, scheme: 'exact' }
  };
}

function buildLanes() {
  return [
    {
      name: 'solana',
      payTo: process.env.X402_PAY_TO || '',
      facilitator: (process.env.X402_FACILITATOR || DEFAULT_FACILITATOR).replace(/\/$/, ''),
      auth: 'default',
      verifyPath: '/verify',
      settlePath: '/settle',
      mainnet: { network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
      devnet: { network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 }
    },
    {
      name: 'base',
      payTo: process.env.X402_PAY_TO_BASE || '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
      facilitator: (process.env.X402_FACILITATOR_BASE || (CDP_KEY_ID && CDP_KEY_SECRET ? CDP_FACILITATOR : DEFAULT_FACILITATOR)).replace(/\/$/, ''),
      auth: 'cdp',
      verifyPath: '/verify',
      settlePath: '/settle',
      mainnet: { network: 'eip155:8453', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, extra: { name: 'USD Coin', version: '2' } },
      devnet: { network: 'eip155:84532', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, extra: { name: 'USDC', version: '2' } }
    },
    buildBscLane()
  ];
}

/** Convert 6-decimal USD atomic (Base USDC price knobs) → token atomic for a lane asset. */
export function sixDecimalToLaneAtomic(priceSix, decimals) {
  const p = BigInt(String(priceSix || '0'));
  const d = Number(decimals);
  if (!Number.isFinite(d) || d === 6) return p.toString();
  if (d > 6) return (p * 10n ** BigInt(d - 6)).toString();
  const div = 10n ** BigInt(6 - d);
  return (p / div).toString();
}

export function armedLanes() {
  return buildLanes().filter((l) => l.payTo);
}

export function listArmedLaneNames() {
  return armedLanes().map((l) => l.name);
}

export function clearBscExtraCache() {
  bscExtraCache = { at: 0, key: '', extra: null };
}

function laneNet(lane) {
  if (lane.name === 'base') return NET_BASE;
  if (lane.name === 'bsc') {
    return (process.env.X402_NETWORK_BSC || 'mainnet').toLowerCase() === 'testnet' ? 'devnet' : 'mainnet';
  }
  return NET;
}

function laneEnv(lane) {
  return laneNet(lane) === 'mainnet' ? lane.mainnet : lane.devnet;
}

export function laneRequirements(lane, priceSix) {
  const env = laneEnv(lane);
  const amount = sixDecimalToLaneAtomic(priceSix, env.decimals != null ? env.decimals : 6);
  const req = {
    scheme: env.scheme || 'exact',
    network: env.network,
    amount,
    asset: env.usdc,
    payTo: lane.payTo,
    maxTimeoutSeconds: 60,
    extra: env.extra || {}
  };
  return req;
}

function normAddr(v) {
  const s = String(v || '');
  return s.startsWith('0x') ? s.toLowerCase() : s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function cdpPrivateKey() {
  const crypto = require('crypto');
  const secret = CDP_KEY_SECRET.trim();
  if (secret.includes('BEGIN')) {
    return { key: crypto.createPrivateKey(secret), alg: 'ES256' };
  }
  const raw = Buffer.from(secret, 'base64');
  if (raw.length !== 64) {
    throw new Error('CDP Ed25519 secret must decode to 64 bytes');
  }
  const seed = raw.subarray(0, 32);
  const publicKey = raw.subarray(32);
  return {
    key: crypto.createPrivateKey({
      key: { kty: 'OKP', crv: 'Ed25519', d: seed.toString('base64url'), x: publicKey.toString('base64url') },
      format: 'jwk'
    }),
    alg: 'EdDSA'
  };
}

function cdpJwt(method, urlPath) {
  const crypto = require('crypto');
  const { key, alg } = cdpPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg, kid: CDP_KEY_ID, typ: 'JWT', nonce: crypto.randomBytes(16).toString('hex') };
  const payload = {
    iss: 'cdp',
    sub: CDP_KEY_ID,
    nbf: now,
    exp: now + 120,
    uris: [method + ' ' + 'api.cdp.coinbase.com' + urlPath]
  };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  let sig;
  if (alg === 'EdDSA') {
    sig = crypto.sign(null, Buffer.from(signingInput), key);
  } else {
    sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  }
  return signingInput + '.' + b64url(sig);
}

/** Peel Binance BAPI envelope `{ code, data }` when present. */
export function unwrapFacilitatorData(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.data && typeof data.data === 'object') {
    if (data.code != null ||
        Object.prototype.hasOwnProperty.call(data.data, 'isValid') ||
        Object.prototype.hasOwnProperty.call(data.data, 'success') ||
        Object.prototype.hasOwnProperty.call(data.data, 'kinds') ||
        Object.prototype.hasOwnProperty.call(data.data, 'transaction')) {
      return data.data;
    }
  }
  return data;
}

function envBscExtraFallback() {
  const asset = bscAssetConfig();
  const signer = process.env.B402_SIGNER_ADDRESS || '';
  const spender = process.env.B402_SPENDER_ADDRESS || '';
  if (!signer || !spender) return null;
  return {
    name: process.env.X402_ASSET_BSC_NAME || asset.name,
    version: process.env.X402_ASSET_BSC_VERSION || asset.version,
    assetTransferMethod: process.env.X402_BSC_TRANSFER_METHOD || 'permit2-exact',
    signerAddress: signer,
    spenderAddress: spender
  };
}

function pickSupportedExtra(data, network, assetAddr, method) {
  const kinds = (data && (data.kinds || data.accepted)) || [];
  if (!Array.isArray(kinds)) return null;
  const wantAsset = normAddr(assetAddr);
  const wantMethod = method || 'permit2-exact';
  for (const k of kinds) {
    if (!k || !k.extra) continue;
    const asset = normAddr(k.asset);
    const xfer = k.extra.assetTransferMethod || '';
    const netOk = !k.network || k.network === network;
    const methodOk = !xfer || xfer === wantMethod;
    if (netOk && asset === wantAsset && methodOk && k.extra.signerAddress && k.extra.spenderAddress) {
      return k.extra;
    }
  }
  for (const k of kinds) {
    if (k && k.extra && normAddr(k.asset) === wantAsset && k.extra.signerAddress && k.extra.spenderAddress) {
      return k.extra;
    }
  }
  return null;
}

/**
 * Resolve BSC `extra` from relay POST /supported (cached), else env signer/spender.
 * Returns null when neither is available — caller must omit the BSC accept.
 */
export async function resolveBscExtra(lane) {
  const env = laneEnv(lane);
  const method = process.env.X402_BSC_TRANSFER_METHOD || 'permit2-exact';
  const cacheKey = [env.network, env.usdc, method, lane.facilitator].join('|');
  const now = Date.now();
  if (bscExtraCache.extra && bscExtraCache.key === cacheKey && now - bscExtraCache.at < BSC_EXTRA_TTL_MS) {
    return bscExtraCache.extra;
  }
  try {
    const raw = await callFacilitator(lane, '/supported', {});
    const picked = pickSupportedExtra(raw, env.network, env.usdc, method);
    if (picked) {
      bscExtraCache = { at: now, key: cacheKey, extra: picked };
      return picked;
    }
  } catch (e) {
    console.error('b402 supported fetch failed', e && e.message);
  }
  const fallback = envBscExtraFallback();
  if (fallback) {
    bscExtraCache = { at: now, key: cacheKey, extra: fallback };
    return fallback;
  }
  return null;
}

/**
 * Build offer rows; drop BSC when extra cannot be resolved (never guess).
 * @returns {Promise<Array<{ lane: object, requirements: object }>>}
 */
export async function buildOfferRows(lanes, priceSix) {
  const rows = [];
  for (const lane of lanes) {
    if (lane.name === 'bsc') {
      const extra = await resolveBscExtra(lane);
      if (!extra || !extra.signerAddress || !extra.spenderAddress) continue;
      const requirements = laneRequirements(lane, priceSix);
      requirements.extra = extra;
      rows.push({ lane, requirements });
    } else {
      rows.push({ lane, requirements: laneRequirements(lane, priceSix) });
    }
  }
  return rows;
}

async function callFacilitator(lane, path, body) {
  const base = lane.facilitator;
  if (!base) throw new Error('facilitator URL not configured for lane ' + lane.name);
  const bodyString = JSON.stringify(body);
  const headers = { 'content-type': 'application/json' };

  if (lane.auth === 'relay') {
    const key = process.env.X402_INTERNAL_KEY || '';
    if (key) headers['x-guardian-key'] = key;
  } else if (base.includes('api.cdp.coinbase.com') && CDP_KEY_ID && CDP_KEY_SECRET) {
    // Preserve prior Base behavior: JWT only when talking to CDP facilitator URL.
    const urlPath = new URL(base + path).pathname;
    headers.authorization = 'Bearer ' + cdpJwt('POST', urlPath);
  }

  const r = await fetch(base + path, {
    method: 'POST',
    headers,
    body: bodyString
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = null;
  }
  data = unwrapFacilitatorData(data);
  if (data && (Object.prototype.hasOwnProperty.call(data, 'isValid') ||
      Object.prototype.hasOwnProperty.call(data, 'success') ||
      Object.prototype.hasOwnProperty.call(data, 'kinds'))) {
    return data;
  }
  if (!r.ok) throw new Error('facilitator ' + path + ' ' + r.status + ' ' + text.slice(0, 300));
  return data || {};
}

/**
 * Settle with B402 async poll: success:false + non-empty transaction → retry ≤ ~10s.
 */
export async function settleWithPoll(lane, paymentPayload, requirements) {
  const body = {
    x402Version: 2,
    paymentPayload,
    paymentRequirements: requirements
  };
  if (lane.auth !== 'relay') {
    return callFacilitator(lane, lane.settlePath || '/settle', body);
  }
  const deadline = Date.now() + SETTLE_POLL_MS;
  let last = null;
  while (Date.now() <= deadline) {
    last = await callFacilitator(lane, lane.settlePath || '/settle', body);
    if (last && last.success === true) return last;
    if (last && last.success === false && last.transaction) {
      await new Promise((r) => setTimeout(r, SETTLE_POLL_INTERVAL_MS));
      continue;
    }
    return last;
  }
  return last;
}

/** cyre.dev (www) only — address-profile free path */
export function isCyreSiteRequest(req) {
  const src = String(req.headers.origin || req.headers.referer || '');
  return /^https:\/\/(www\.)?cyre\.dev(\/|$)/.test(src);
}

/** cyre.dev + Vercel preview deploys for this project */
export function isCyreOrPreviewRequest(req) {
  if (isCyreSiteRequest(req)) return true;
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');
  const preview = /^https:\/\/cyre-guardian[\w.-]*\.vercel\.app/;
  return preview.test(origin) || preview.test(referer);
}

/**
 * Local offer-pin check used before facilitator calls.
 * Exported for unit tests.
 */
export function offerMatches(accepted, expected) {
  if (!accepted || !expected) return false;
  try {
    if (BigInt(accepted.amount || '0') < BigInt(expected.amount || '0')) return false;
  } catch (e) {
    return false;
  }
  return accepted.scheme === expected.scheme &&
    accepted.network === expected.network &&
    normAddr(accepted.asset) === normAddr(expected.asset) &&
    normAddr(accepted.payTo) === normAddr(expected.payTo);
}

/**
 * @param {object} opts
 * @param {string} opts.price — atomic USDC amount string (6 decimals; BSC lane converts to asset decimals)
 * @param {string} opts.resourcePath — e.g. '/api/address'
 * @param {string} opts.description
 * @param {string} [opts.serviceName]
 * @param {string[]} [opts.tags]
 * @param {string} [opts.iconUrl]
 * @param {object} opts.discovery — bazaar extension object { bazaar: { info, schema } }
 * @param {(req: any) => boolean} [opts.isFree] — return true to skip payment
 * @param {boolean} [opts.baseOnly] — only arm Base lane
 */
import { detectNetwork, xrplHandoffBody } from '../lib/peers.js';
import { recordTrafficEventFire, classifySource } from './_traffic.js';

export function createX402Gate(opts) {
  const price = String(opts.price);
  const resourcePath = opts.resourcePath;
  const description = opts.description + ' Agent guide: https://cyre.dev/SKILL.md';
  const serviceName = opts.serviceName || 'CYRE Guardian';
  const tags = opts.tags || ['risk', 'fraud', 'solana', 'security'];
  const iconUrl = opts.iconUrl || 'https://cyre.dev/c7-cobra-256.png?v=c7g2';
  const discovery = opts.discovery;
  const isFree = opts.isFree || isCyreSiteRequest;
  const baseOnly = !!opts.baseOnly;

  function resourceInfo(resourceUrl) {
    return {
      url: resourceUrl,
      description,
      mimeType: 'application/json',
      serviceName,
      tags,
      iconUrl
    };
  }

  function paymentRequired(resourceUrl, accepts, error) {
    return { x402Version: 2, error, resource: resourceInfo(resourceUrl), accepts, extensions: discovery };
  }

  return async function x402Gate(req) {
    // XRPL handoff BEFORE payment — agents must not pay to learn Guardian doesn't cover XRPL.
    if (detectNetwork(req) === 'xrpl') {
      return { status: 400, body: xrplHandoffBody(req) };
    }

    if (!X402_ENABLED) return null;
    if (isFree(req)) return null;

    const internalKey = process.env.X402_INTERNAL_KEY || '';
    if (internalKey && req.headers['x-guardian-key'] === internalKey) return null;

    let lanes = armedLanes();
    if (baseOnly) lanes = lanes.filter((l) => l.name === 'base');
    if (!lanes.length) {
      console.error('x402: X402_ENABLED but no treasury set — serving free');
      return null;
    }

    const rows = await buildOfferRows(lanes, price);
    if (!rows.length) {
      console.error('x402: X402_ENABLED but no offerable lanes — serving free');
      return null;
    }
    const accepts = rows.map((r) => r.requirements);

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'cyre.dev';
    const resourceUrl = proto + '://' + host + resourcePath;

    const header = req.headers['payment-signature'] || req.headers['x-payment'];
    if (!header) {
      recordTrafficEventFire({
        route: resourcePath,
        ts: new Date().toISOString(),
        lane: rows[0] && rows[0].lane && rows[0].lane.name,
        amountAtomic: price,
        asset: rows[0] && rows[0].requirements && rows[0].requirements.asset,
        settled: false,
        txHash: null,
        source: classifySource(req, null, null),
        ua: String(req.headers['user-agent'] || '').slice(0, 60)
      });
      return { status: 402, body: paymentRequired(resourceUrl, accepts, 'Payment required') };
    }

    let payment;
    try {
      payment = JSON.parse(Buffer.from(String(header), 'base64').toString('utf8'));
    } catch (e) {
      return { status: 402, body: paymentRequired(resourceUrl, accepts, 'Malformed PAYMENT-SIGNATURE header') };
    }

    const paidNetwork = payment && ((payment.accepted && payment.accepted.network) || payment.network);
    const idx = rows.findIndex((r) => r.requirements.network === paidNetwork);
    if (idx === -1) {
      return { status: 402, body: paymentRequired(resourceUrl, accepts, 'Unsupported payment network') };
    }
    const { lane, requirements: expected } = rows[idx];
    const accepted = payment && payment.accepted;
    if (!accepted) {
      return { status: 402, body: paymentRequired(resourceUrl, accepts, 'Malformed payment payload') };
    }
    if (!offerMatches(accepted, expected)) {
      try {
        if (BigInt(accepted.amount || '0') < BigInt(expected.amount || '0')) {
          return { status: 402, body: paymentRequired(resourceUrl, accepts, 'amount_too_low') };
        }
      } catch (e) {
        return { status: 402, body: paymentRequired(resourceUrl, accepts, 'amount_too_low') };
      }
      return { status: 402, body: paymentRequired(resourceUrl, accepts, 'offer_mismatch') };
    }
    const requirements = accepted;

    // Echo bazaar discovery on paymentPayload.extensions when settling (B402 Bazaar indexes from settle).
    const paymentPayload = discovery
      ? { ...payment, extensions: { ...(payment.extensions || {}), ...discovery } }
      : payment;

    try {
      const v = await callFacilitator(lane, lane.verifyPath || '/verify', {
        x402Version: 2,
        paymentPayload,
        paymentRequirements: requirements
      });
      if (!v || v.isValid !== true) {
        const reason = (v && (v.invalidMessage || v.invalidReason)) || 'Payment invalid';
        return { status: 402, body: paymentRequired(resourceUrl, accepts, reason) };
      }
      const s = await settleWithPoll(lane, paymentPayload, requirements);
      if (!s || s.success !== true) {
        const reason = (s && (s.errorMessage || s.errorReason)) || 'Settlement failed';
        return { status: 402, body: paymentRequired(resourceUrl, accepts, reason) };
      }
      recordTrafficEventFire({
        route: resourcePath,
        ts: new Date().toISOString(),
        lane: lane.name,
        amountAtomic: requirements.amount || price,
        asset: requirements.asset,
        settled: true,
        txHash: s.transaction || s.txHash || null,
        source: classifySource(req, s, payment),
        ua: String(req.headers['user-agent'] || '').slice(0, 60)
      });
      return { settled: s };
    } catch (e) {
      console.error('x402 facilitator error', e && e.message);
      return { status: 502, body: { error: 'Payment processor unreachable. Try again shortly.', detail: String((e && e.message) || e).slice(0, 300) } };
    }
  };
}

/** Apply gate result to a Vercel/Express-style res. Returns true if response was sent. */
export function applyX402Result(res, gate) {
  if (!gate) return false;
  if (gate.status) {
    if (gate.status === 402) {
      try { res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(gate.body)).toString('base64')); } catch (e) { /* non-fatal */ }
    }
    res.status(gate.status).json(gate.body);
    return true;
  }
  if (gate.settled) {
    try {
      const b64 = Buffer.from(JSON.stringify(gate.settled)).toString('base64');
      res.setHeader('PAYMENT-RESPONSE', b64);
      res.setHeader('X-PAYMENT-RESPONSE', b64);
    } catch (e) { /* non-fatal */ }
  }
  return false;
}

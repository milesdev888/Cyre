// api/_attest.js — Guardian passport + decision-receipt attestation (Ed25519, zero-dep).
// Issues a signed, expiring receipt over measured claims so any agent can prove
// "Guardian graded this" or "this agent sealed a decision" to a third party.
//
// Env:
//   PASSPORT_SIGNING_KEY  base64 Ed25519 private seed (32 bytes) or seed+pub (64 bytes).
//                         When missing the passport still serves — just unsigned (fail-safe).
//   PASSPORT_TTL_SECONDS  passport lifetime (default 86400 = 24h)
//   RECEIPT_TTL_SECONDS   decision-receipt lifetime (default 2592000 = 30d)
//
// Token format (portable, header-safe):  base64url(claimsJSON) + "." + base64url(signature)
// Claims are canonicalised (sorted keys) before signing; verifiers must do the same.

import { createPrivateKey, createPublicKey, sign, verify, randomBytes } from 'crypto';

export const ISSUER = 'cyre.dev';
export const ALG = 'Ed25519';
export const PASSPORT_KIND = 'cyre-passport-attestation';
export const RECEIPT_KIND = 'cyre-decision-receipt';
export const POLICY_KIND = 'cyre-spend-policy';
export const INTENT_KIND = 'cyre-intent-seal';
export const CRON_KIND = 'cyre-cron-attestation';
export const LOCKBOX_KIND = 'cyre-intent-lockbox';
export const STREAM_KIND = 'cyre-stream-subscription';
export const EXCHANGE_KIND = 'cyre-exchange-intent';
export const CIRCUIT_KIND = 'cyre-circuit-breaker';
const TTL = Math.max(60, Number(process.env.PASSPORT_TTL_SECONDS) || 86400);
const RECEIPT_TTL = Math.max(60, Number(process.env.RECEIPT_TTL_SECONDS) || 2592000);
const POLICY_TTL = Math.max(60, Number(process.env.POLICY_TTL_SECONDS) || 604800); // 7d
const INTENT_TTL = Math.max(60, Number(process.env.INTENT_TTL_SECONDS) || 86400); // 24h
const CRON_TTL = Math.max(60, Number(process.env.CRON_TTL_SECONDS) || 86400);
const LOCKBOX_TTL = Math.max(60, Number(process.env.LOCKBOX_TTL_SECONDS) || 86400); // 24h
const STREAM_TTL = Math.max(60, Number(process.env.STREAM_TTL_SECONDS) || 86400); // 24h
const EXCHANGE_TTL = Math.max(60, Number(process.env.EXCHANGE_TTL_SECONDS) || 43200); // 12h
const CIRCUIT_TTL = Math.max(60, Number(process.env.CIRCUIT_TTL_SECONDS) || 604800); // 7d

// PKCS#8 DER prefix for an Ed25519 private key (RFC 8410) — lets us load a raw 32-byte seed.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function fromB64url(s) {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(t + '==='.slice((t.length + 3) % 4), 'base64');
}

let cached = null; // { priv, pub, pubB64 } | false
function keys() {
  if (cached !== null) return cached;
  const raw = String(process.env.PASSPORT_SIGNING_KEY || '').trim();
  if (!raw) return (cached = false);
  try {
    const bytes = Buffer.from(raw, 'base64');
    const seed = bytes.length === 64 ? bytes.subarray(0, 32) : bytes;
    if (seed.length !== 32) throw new Error('seed must be 32 bytes');
    const priv = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
    const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
    const pub = spki.subarray(spki.length - 32);
    return (cached = { priv, pub, pubB64: b64url(pub) });
  } catch (e) {
    console.error('attest: bad PASSPORT_SIGNING_KEY —', e && e.message);
    return (cached = false);
  }
}

/** Public key (base64url) the world uses to verify — null when signing is not configured. */
export function issuerPublicKey() {
  const k = keys();
  return k ? k.pubB64 : null;
}

/** Deterministic JSON — sorted keys at every level. */
export function canonical(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
  if (obj && typeof obj === 'object') {
    return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  }
  return JSON.stringify(obj);
}

function signClaims(claims) {
  const k = keys();
  if (!k) return { attestation: null, token: null, unsigned: 'signing key not configured' };
  const msg = Buffer.from(canonical(claims));
  const sig = sign(null, msg, k.priv);
  const token = b64url(msg) + '.' + b64url(sig);
  return {
    attestation: { alg: ALG, issuer: ISSUER, publicKey: k.pubB64, claims, signature: b64url(sig), token },
    token
  };
}

/** Pull the attestable claims out of a measured passport. */
export function claimsFor(passport) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL * 1000).toISOString();
  return {
    kind: PASSPORT_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    address: passport.address,
    chain: 'solana',
    score: passport.score,
    riskLevel: passport.riskLevel,
    signalsTriggered: passport.signalsTriggered,
    signalsEvaluated: passport.signalsEvaluated,
    measuredAt: passport.fetchedAt,
    issuedAt,
    expiresAt
  };
}

/**
 * Sign a passport. Returns { attestation, token } or { attestation: null, token: null, unsigned: reason }.
 */
export function attest(passport) {
  return signClaims(claimsFor(passport));
}

/**
 * Sign a decision receipt — intent hash + signals the agent saw + action taken.
 * Returns { attestation, token } or unsigned reason.
 */
export function attestReceipt(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RECEIPT_TTL * 1000).toISOString();
  const counterparties = Array.isArray(input.counterparties)
    ? [...new Set(input.counterparties.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 10)
    : [];
  const claims = {
    kind: RECEIPT_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    chain: 'solana',
    actor: String(input.actor || ''),
    intentHash: String(input.intentHash || ''),
    action: String(input.action || 'other').slice(0, 32),
    score: typeof input.score === 'number' ? input.score : null,
    riskLevel: input.riskLevel || null,
    signalsTriggered: typeof input.signalsTriggered === 'number' ? input.signalsTriggered : null,
    signalsEvaluated: typeof input.signalsEvaluated === 'number' ? input.signalsEvaluated : null,
    counterparties,
    note: input.note ? String(input.note).slice(0, 160) : null,
    measuredAt: input.measuredAt || null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Sign a spend-policy token — agent constitution other middleware can check.
 */
export function attestPolicy(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + POLICY_TTL * 1000).toISOString();
  const allowHosts = Array.isArray(input.allowHosts)
    ? [...new Set(input.allowHosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  const denyHosts = Array.isArray(input.denyHosts)
    ? [...new Set(input.denyHosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  const claims = {
    kind: POLICY_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    actor: String(input.actor || ''),
    maxSpendAtomic: input.maxSpendAtomic != null ? String(input.maxSpendAtomic) : null,
    allowHosts,
    denyHosts,
    requireTicket: !!input.requireTicket,
    denyFreshEoa: !!input.denyFreshEoa,
    maxRisk: input.maxRisk ? String(input.maxRisk).toUpperCase() : null,
    networks: Array.isArray(input.networks)
      ? [...new Set(input.networks.map((n) => String(n || '').trim()).filter(Boolean))].slice(0, 10)
      : [],
    note: input.note ? String(input.note).slice(0, 160) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Seal an intent hash before pay/sign — later Receipt must match.
 */
export function attestIntent(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INTENT_TTL * 1000).toISOString();
  const claims = {
    kind: INTENT_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    actor: String(input.actor || ''),
    intentHash: String(input.intentHash || ''),
    action: String(input.action || 'other').slice(0, 32),
    resourceUrl: input.resourceUrl ? String(input.resourceUrl).slice(0, 300) : null,
    payTo: input.payTo ? String(input.payTo).slice(0, 128) : null,
    amountAtomic: input.amountAtomic != null ? String(input.amountAtomic) : null,
    note: input.note ? String(input.note).slice(0, 160) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Seal a pre-pay intent lockbox — bearer proves the hash was sealed before settle.
 * Token-held (no central registry); verify/match with the token.
 */
export function attestLockbox(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + LOCKBOX_TTL * 1000).toISOString();
  const claims = {
    kind: LOCKBOX_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    purpose: 'pre-pay-lock',
    actor: String(input.actor || ''),
    intentHash: String(input.intentHash || ''),
    action: String(input.action || 'pay').slice(0, 32),
    resourceUrl: input.resourceUrl ? String(input.resourceUrl).slice(0, 300) : null,
    payTo: input.payTo ? String(input.payTo).slice(0, 128) : null,
    amountAtomic: input.amountAtomic != null ? String(input.amountAtomic) : null,
    network: input.network ? String(input.network).slice(0, 64) : null,
    note: input.note ? String(input.note).slice(0, 160) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Seal a push-stream subscription — watches + fingerprint cursor travel in the token.
 */
export function attestStreamSubscription(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + STREAM_TTL * 1000).toISOString();
  const watches = Array.isArray(input.watches)
    ? input.watches
        .map((w) => ({
          type: String((w && w.type) || 'address').slice(0, 24),
          target: String((w && w.target) || '').trim()
        }))
        .filter((w) => w.target)
        .slice(0, 10)
    : [];
  const claims = {
    kind: STREAM_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    actor: String(input.actor || ''),
    minRisk: input.minRisk ? String(input.minRisk).toUpperCase() : 'HIGH',
    watches,
    fingerprints: input.fingerprints && typeof input.fingerprints === 'object' ? input.fingerprints : {},
    seq: typeof input.seq === 'number' ? input.seq : 0,
    webhookUrl: input.webhookUrl ? String(input.webhookUrl).slice(0, 300) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Seal an exchange intent — gossip the token; matchers call /api/exchange/match.
 */
export function attestExchangeIntent(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + EXCHANGE_TTL * 1000).toISOString();
  const deadlineAt = input.deadlineAt ? String(input.deadlineAt) : new Date(Date.now() + 3600_000).toISOString();
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean))].slice(0, 12)
    : [];
  const claims = {
    kind: EXCHANGE_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    actor: String(input.actor || ''),
    need: String(input.need || '').slice(0, 240),
    budgetAtomic: input.budgetAtomic != null ? String(input.budgetAtomic) : null,
    network: input.network ? String(input.network).slice(0, 64) : 'eip155:8453',
    deadlineAt,
    tags,
    status: input.status ? String(input.status).slice(0, 16) : 'open',
    note: input.note ? String(input.note).slice(0, 160) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Seal an operator circuit breaker — heartbeat + spend freeze rail.
 */
export function attestCircuit(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CIRCUIT_TTL * 1000).toISOString();
  const allowHosts = Array.isArray(input.allowHosts)
    ? [...new Set(input.allowHosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  const denyHosts = Array.isArray(input.denyHosts)
    ? [...new Set(input.denyHosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  const claims = {
    kind: CIRCUIT_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    actor: String(input.actor || ''),
    heartbeatIntervalSeconds: Math.max(60, Math.min(86400, Number(input.heartbeatIntervalSeconds) || 300)),
    maxMissedBeats: Math.max(1, Math.min(10, Number(input.maxMissedBeats) || 2)),
    lastBeatAt: String(input.lastBeatAt || issuedAt),
    frozen: !!input.frozen,
    frozenAt: input.frozenAt ? String(input.frozenAt) : null,
    policyToken: input.policyToken ? String(input.policyToken).slice(0, 2048) : null,
    maxSpendAtomic: input.maxSpendAtomic != null ? String(input.maxSpendAtomic) : null,
    allowHosts,
    denyHosts,
    maxRisk: input.maxRisk ? String(input.maxRisk).toUpperCase() : null,
    networks: Array.isArray(input.networks)
      ? [...new Set(input.networks.map((n) => String(n || '').trim()).filter(Boolean))].slice(0, 10)
      : [],
    note: input.note ? String(input.note).slice(0, 160) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Attest that a watcher/cron run happened (patterns measured, not a verdict).
 */
export function attestCron(input) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CRON_TTL * 1000).toISOString();
  const claims = {
    kind: CRON_KIND,
    v: 1,
    iss: ISSUER,
    id: b64url(randomBytes(12)),
    job: String(input.job || 'watcher').slice(0, 64),
    ranAt: String(input.ranAt || issuedAt),
    walletCount: typeof input.walletCount === 'number' ? input.walletCount : null,
    hitCount: typeof input.hitCount === 'number' ? input.hitCount : null,
    window: input.window ? String(input.window).slice(0, 64) : null,
    digest: input.digest ? String(input.digest).slice(0, 128) : null,
    note: input.note ? String(input.note).slice(0, 160) : null,
    issuedAt,
    expiresAt
  };
  return signClaims(claims);
}

/**
 * Verify a token (or an attestation object). Pure — works without the private key,
 * using either the embedded publicKey pinned to the issuer key when configured.
 *
 * @param {string|object} input
 * @param {number} [now]
 * @param {{ kinds?: string[], allowExpired?: boolean }} [opts]
 */
export function verifyToken(input, now = Date.now(), opts = {}) {
  const allowed = Array.isArray(opts.kinds) && opts.kinds.length ? opts.kinds : [PASSPORT_KIND];
  const allowExpired = !!opts.allowExpired;

  let token = null;
  let pubB64 = null;
  if (typeof input === 'string') token = input.trim();
  else if (input && typeof input === 'object') {
    token = input.token || null;
    pubB64 = input.publicKey || null;
    if (!token && input.claims && input.signature) token = b64url(canonical(input.claims)) + '.' + input.signature;
  }
  if (!token || !token.includes('.')) return { valid: false, reason: 'malformed token' };

  const [c, s] = token.split('.');
  let claims;
  try {
    claims = JSON.parse(fromB64url(c).toString('utf8'));
  } catch (e) {
    return { valid: false, reason: 'claims not JSON' };
  }
  if (!claims || claims.iss !== ISSUER || !allowed.includes(claims.kind)) {
    return { valid: false, reason: 'not a Guardian attestation', claims };
  }

  // Pin to the configured issuer key when we have one; otherwise accept the embedded key
  // only if it is the issuer's (an embedded foreign key is NOT trusted).
  const issuerKey = issuerPublicKey();
  const useKey = issuerKey || pubB64;
  if (!useKey) return { valid: false, reason: 'issuer public key unavailable', claims };
  if (pubB64 && issuerKey && pubB64 !== issuerKey) return { valid: false, reason: 'public key is not the Guardian issuer key', claims };

  let ok = false;
  try {
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), fromB64url(useKey)]);
    const pub = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    // Signature covers the canonical form — re-canonicalise so whitespace/key-order changes don't matter.
    ok = verify(null, Buffer.from(canonical(claims)), pub, fromB64url(s));
  } catch (e) {
    return { valid: false, reason: 'signature check failed', claims };
  }
  if (!ok) return { valid: false, reason: 'bad signature — claims were altered or not issued by Guardian', claims };

  const exp = Date.parse(claims.expiresAt);
  if (!Number.isFinite(exp)) return { valid: false, reason: 'missing expiry', claims };
  if (exp <= now) {
    if (!allowExpired) return { valid: false, reason: 'expired', expired: true, claims };
    return { valid: true, expired: true, claims, expiresInSeconds: 0 };
  }

  return { valid: true, claims, expiresInSeconds: Math.floor((exp - now) / 1000) };
}

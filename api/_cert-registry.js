// api/_cert-registry.js — Cyre Certificate registry (Phase 1).
// Redis: cert:<serial> → record; bind:token|x|tg|web:<id> → serial;
 // events:cert:<serial> → append-only log; counters for CYR / CYR-P serials.
// Existing GRD- badge serials stay in _badge-registry — resolveCert bridges both.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { redisCommand, isDurableRedis } from './_redis.js';
import { getBadgeBySerial, normalizeSerial as normalizeBadgeSerial } from './_badge-registry.js';

const FILE_STORE = process.env.CERT_REGISTRY_STORE || '/tmp/cyre-cert-registry.json';
const CERT_PREFIX = 'cert:';
const BIND_PREFIX = {
  token: 'bind:token:',
  x: 'bind:x:',
  tg: 'bind:tg:',
  web: 'bind:web:'
};
const EVENT_PREFIX = 'events:cert:';
const COUNTER_PROJECT = 'cert:counter:project:';
const COUNTER_PERSONAL = 'cert:counter:personal:';
const SITE = process.env.CYRE_SITE_URL || 'https://cyre.dev';

export function isDurableCertStore() {
  return isDurableRedis();
}

function emptyFileStore() {
  return { bySerial: {}, byBind: {}, events: {}, counters: { project: {}, personal: {} } };
}

function readFileStore() {
  try {
    if (!fs.existsSync(FILE_STORE)) return emptyFileStore();
    const data = JSON.parse(fs.readFileSync(FILE_STORE, 'utf8'));
    if (!data || typeof data !== 'object') return emptyFileStore();
    return {
      bySerial: data.bySerial && typeof data.bySerial === 'object' ? data.bySerial : {},
      byBind: data.byBind && typeof data.byBind === 'object' ? data.byBind : {},
      events: data.events && typeof data.events === 'object' ? data.events : {},
      counters:
        data.counters && typeof data.counters === 'object'
          ? data.counters
          : { project: {}, personal: {} }
    };
  } catch (e) {
    console.error('cert registry file read failed', e && e.message);
    return emptyFileStore();
  }
}

function writeFileStore(store) {
  try {
    const dir = path.dirname(FILE_STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE_STORE, JSON.stringify(store));
  } catch (e) {
    console.error('cert registry file write failed', e && e.message);
  }
}

/** @returns {string|null} CYR-YYYY-NNNNN | CYR-P-YYYY-NNNNN | GRD-YYYY-NNNNN */
export function normalizeCertSerial(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (/^CYR-P-\d{4}-\d{5}$/.test(s)) return s;
  if (/^CYR-\d{4}-\d{5}$/.test(s)) return s;
  const grd = normalizeBadgeSerial(s);
  if (grd) return grd;
  // Short numeric from legacy /v/2 → resolve later via resolveShortSerial
  if (/^\d{1,5}$/.test(s)) return s;
  return null;
}

export function formatProjectSerial(year, n) {
  return `CYR-${String(year)}-${String(Math.floor(Number(n))).padStart(5, '0')}`;
}

export function formatPersonalSerial(year, n) {
  return `CYR-P-${String(year)}-${String(Math.floor(Number(n))).padStart(5, '0')}`;
}

/**
 * Allocate next CYR / CYR-P serial (atomic INCR when Redis is durable).
 * @param {'project'|'personal'} type
 */
export async function allocateCertSerial(type = 'project', year = new Date().getUTCFullYear()) {
  const y = String(year);
  const personal = type === 'personal';
  const counterKey = (personal ? COUNTER_PERSONAL : COUNTER_PROJECT) + y;
  const format = personal ? formatPersonalSerial : formatProjectSerial;

  if (isDurableRedis()) {
    const row = await redisCommand(['INCR', counterKey]);
    const n = Number(row && row.result) || 1;
    return format(y, n);
  }

  const store = readFileStore();
  const bucket = personal ? store.counters.personal : store.counters.project;
  const n = (Number(bucket[y]) || 0) + 1;
  bucket[y] = n;
  writeFileStore(store);
  return format(y, n);
}

/**
 * Resolve short forms like "2" → GRD-2026-00002 (prefer GRD legacy, then CYR).
 */
export async function resolveShortSerial(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase();
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = s.padStart(5, '0');
  const year = String(new Date().getUTCFullYear());
  const candidates = [
    `GRD-${year}-${n}`,
    `CYR-${year}-${n}`,
    `CYR-P-${year}-${n}`,
    `GRD-2026-${n}`,
    `CYR-2026-${n}`,
    `CYR-P-2026-${n}`
  ];
  for (const c of candidates) {
    const found = await getCertBySerial(c);
    if (found) return c;
  }
  return null;
}

function bindKey(kind, id) {
  const prefix = BIND_PREFIX[kind];
  if (!prefix) throw new Error('unknown bind kind');
  return prefix + String(id || '').trim();
}

export async function getBindSerial(kind, id) {
  const key = bindKey(kind, id);
  if (isDurableRedis()) {
    const row = await redisCommand(['GET', key]);
    return (row && row.result) || null;
  }
  const store = readFileStore();
  return store.byBind[key] || null;
}

export async function getCertBySerial(serial) {
  const key = normalizeCertSerial(serial);
  if (!key) return null;
  if (/^\d{1,5}$/.test(key)) {
    const full = await resolveShortSerial(key);
    return full ? getCertBySerial(full) : null;
  }

  // New CYR certificates
  if (key.startsWith('CYR-')) {
    if (isDurableRedis()) {
      const row = await redisCommand(['GET', CERT_PREFIX + key]);
      if (!row || !row.result) return null;
      try {
        return JSON.parse(row.result);
      } catch {
        return null;
      }
    }
    const store = readFileStore();
    return store.bySerial[key] || null;
  }

  // Legacy GRD badges — adapt into cert-shaped public view (no re-number)
  const badge = await getBadgeBySerial(key);
  if (!badge) return null;
  return badgeToCertView(badge);
}

/** Map legacy badge record into certificate verify shape. */
export function badgeToCertView(badge) {
  if (!badge) return null;
  return {
    schema: 'cyre.cert.v1',
    type: 'project',
    serial: badge.serial,
    status: badge.status || 'VALID',
    ownerWallet: badge.ownerWallet || null,
    proofs: badge.mint
      ? [
          {
            kind: 'token',
            id: badge.mint,
            display: badge.symbol ? `$${badge.symbol}` : badge.mint,
            status: badge.status === 'REVOKED' ? 'Lapsed' : 'ok',
            checkedAt: null
          }
        ]
      : [],
    imageHash: badge.imageHash || null,
    photoHidden: false,
    issuedAt: badge.issuedAt,
    expiresAt: badge.expiresAt || null,
    displayName: badge.name || null,
    symbol: badge.symbol || null,
    legacyBadge: true,
    grade: badge.grade,
    score: badge.score,
    mint: badge.mint,
    chainId: badge.chainId,
    pathLabel: badge.pathLabel,
    pathFamily: badge.pathFamily,
    scanUrl: badge.scanUrl,
    verifyUrl: `${SITE}/v/${badge.serial}`
  };
}

/**
 * Append-only event log entry.
 * @param {string} serial
 * @param {'issue'|'proof_added'|'dissolve'|'recheck'|'needs_review'} type
 * @param {object} [detail]
 */
export async function appendCertEvent(serial, type, detail = {}) {
  const key = normalizeCertSerial(serial);
  if (!key || key.startsWith('GRD-') || /^\d+$/.test(key)) return null;
  const ev = {
    at: new Date().toISOString(),
    ...detail,
    type
  };
  if (isDurableRedis()) {
    await redisCommand(['LPUSH', EVENT_PREFIX + key, JSON.stringify(ev)]);
    await redisCommand(['LTRIM', EVENT_PREFIX + key, '0', '199']);
    return ev;
  }
  const store = readFileStore();
  store.events[key] = store.events[key] || [];
  store.events[key].unshift(ev);
  store.events[key] = store.events[key].slice(0, 200);
  writeFileStore(store);
  return ev;
}

export async function listCertEvents(serial, limit = 50) {
  const key = normalizeCertSerial(serial);
  if (!key) return [];
  if (key.startsWith('GRD-') || /^\d+$/.test(key)) return [];
  if (isDurableRedis()) {
    const row = await redisCommand(['LRANGE', EVENT_PREFIX + key, '0', String(Math.max(0, limit - 1))]);
    const arr = (row && row.result) || [];
    return arr
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  const store = readFileStore();
  return (store.events[key] || []).slice(0, limit);
}

/**
 * Issue a new certificate. Refuses if bind already taken by another active cert.
 * @param {object} input
 */
export async function issueCert(input) {
  const type = input.type === 'personal' ? 'personal' : 'project';
  const ownerWallet = String(input.ownerWallet || '').trim();
  if (!ownerWallet) throw new Error('ownerWallet required');

  const proofs = Array.isArray(input.proofs) ? input.proofs : [];
  const pendingProof = input.status === 'PENDING_PROOF';
  const primary = proofs[0];
  if (!pendingProof && (!primary || !primary.kind || !primary.id)) {
    throw new Error('at least one proof required');
  }

  const existingSerial = primary ? await getBindSerial(primary.kind, primary.id) : null;
  if (existingSerial) {
    const existing = await getCertBySerial(existingSerial);
    // Live certificate: slot taken. Dissolved certificate: only its owner may reissue.
    if (existing && (existing.status !== 'REVOKED' || existing.ownerWallet !== ownerWallet)) {
      const err = new Error('bind already claimed');
      err.code = 'BIND_TAKEN';
      err.serial = existingSerial;
      err.ownerWallet = existing.ownerWallet;
      throw err;
    }
  }

  const issuedAt = new Date().toISOString();
  const serial = input.serial || (await allocateCertSerial(type, new Date(issuedAt).getUTCFullYear()));
  const status =
    input.status === 'NEEDS_REVIEW' || input.status === 'PENDING_PROOF' ? input.status : 'VALID';
  const bindNow = status === 'VALID' && primary;

  /** @type {object} */
  const record = {
    schema: 'cyre.cert.v1',
    type,
    serial,
    status,
    ownerWallet,
    proofs: proofs.map((p) => ({
      kind: p.kind,
      id: String(p.id),
      display: p.display || null,
      status: p.status || 'ok',
      checkedAt: p.checkedAt || issuedAt,
      meta: p.meta || undefined
    })),
    imageHash: input.imageHash || null,
    photoUrl: type === 'personal' ? input.photoUrl || null : null,
    photoHidden: false,
    displayName: type === 'personal' ? null : input.displayName || null,
    symbol: input.symbol || null,
    issuedAt,
    expiresAt: input.expiresAt || null,
    needsReview: status === 'NEEDS_REVIEW',
    reviewReason: input.reviewReason || null,
    verifyUrl: `${SITE}/v/${serial}`
  };

  // Personal certificates never store wallet on the public verify projection —
  // keep ownerWallet in Redis for dissolve auth only; publicGetCert redacts it.
  if (isDurableRedis()) {
    await redisCommand(['SET', CERT_PREFIX + serial, JSON.stringify(record)]);
    await redisCommand(['LPUSH', 'cert:index', serial]);
    await redisCommand(['LTRIM', 'cert:index', '0', '9999']);
    if (bindNow) {
      await redisCommand(['SET', bindKey(primary.kind, primary.id), serial]);
    }
  } else {
    const store = readFileStore();
    store.bySerial[serial] = record;
    if (bindNow) {
      store.byBind[bindKey(primary.kind, primary.id)] = serial;
    }
    writeFileStore(store);
  }

  await appendCertEvent(serial, status === 'NEEDS_REVIEW' ? 'needs_review' : 'issue', {
    certType: type,
    bind: primary ? `${primary.kind}:${primary.id}` : null,
    status
  });

  return record;
}

/**
 * Instant dissolve — status REVOKED forever; personal photo hidden.
 */
export async function dissolveCert(serial, reason = 'owner dissolve') {
  const key = normalizeCertSerial(serial);
  if (!key || !key.startsWith('CYR-')) {
    const err = new Error('only CYR certificates can dissolve via this path');
    err.code = 'NOT_CYR';
    throw err;
  }
  const cert = await getCertBySerial(key);
  if (!cert) return null;
  if (cert.status === 'REVOKED') return cert;

  const updated = {
    ...cert,
    status: 'REVOKED',
    revokedAt: new Date().toISOString(),
    revokeReason: reason,
    photoHidden: true,
    photoUrl: null
  };

  if (isDurableRedis()) {
    await redisCommand(['SET', CERT_PREFIX + key, JSON.stringify(updated)]);
  } else {
    const store = readFileStore();
    store.bySerial[key] = updated;
    writeFileStore(store);
  }

  await appendCertEvent(key, 'dissolve', { reason });
  // Bind keys keep pointing at the revoked serial: only the same owner wallet can
  // reissue for that slot (with a new serial); the old serial never reactivates.
  return updated;
}

/** Public verify projection — redact owner wallet + personal photo when hidden. */
export function publicCertView(cert) {
  if (!cert) return null;
  const out = { ...cert };
  if (out.type === 'personal') {
    delete out.ownerWallet;
    if (out.photoHidden || out.status === 'REVOKED') {
      out.photoUrl = null;
      out.photoHidden = true;
    }
  } else {
    // Project certs may show truncated wallet for transparency? Spec: personal never;
    // project — omit raw wallet from public page (proofs carry account IDs only).
    delete out.ownerWallet;
  }
  return out;
}

export async function saveCert(cert) {
  const key = normalizeCertSerial(cert && cert.serial);
  if (!key || !key.startsWith('CYR-')) throw new Error('invalid cert');
  if (isDurableRedis()) {
    await redisCommand(['SET', CERT_PREFIX + key, JSON.stringify(cert)]);
    return cert;
  }
  const store = readFileStore();
  store.bySerial[key] = cert;
  writeFileStore(store);
  return cert;
}

export async function setBind(kind, id, serial) {
  const key = bindKey(kind, id);
  if (isDurableRedis()) {
    await redisCommand(['SET', key, serial]);
    return;
  }
  const store = readFileStore();
  store.byBind[key] = serial;
  writeFileStore(store);
}

export function hashImage(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

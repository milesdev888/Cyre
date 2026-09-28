// api/badge-verify.js — verify + live re-check; auto-REVOKED when live path fails.
// GET ?serial= | ?mint=  → { ok, valid, status, badge, live, stillQualifies }

import {
  getBadgeBySerial,
  getBadgeByMint,
  normalizeSerial,
  revokeBadge,
  hasRevocationHistory
} from './_badge-registry.js';
import { recheckIssuedPath, QUALIFY_PATHS, pathLabel, pathFamily } from './_badge-qualify.js';
import { formatUtc } from './_badge-og-render.js';
import { recordVerifyHit } from './_traffic.js';
import { withOgArtRev } from './_og-art-rev.js';

const DISCLAIMER =
  'Patterns, not verdicts. Issued serial + live re-check. Failed live checks mark the badge REVOKED.';
const SCAN_BASE = process.env.GUARDIAN_SCAN_URL || 'https://guardian-scan.onrender.com';
const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';

async function liveRecheck(badge) {
  if (!badge || !badge.mint) {
    return { ok: false, error: 'no mint on badge', eligible: false, path: 'none' };
  }
  const revokedHistory = await hasRevocationHistory(badge.mint, badge.chainId || 'solana');
  const url = `${SCAN_BASE}/api/scan?address=${encodeURIComponent(badge.mint)}`;
  try {
    const r = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'GuardianBadge/2' },
      cache: 'no-store'
    });
    if (!r.ok) {
      return {
        ok: false,
        error: `scan HTTP ${r.status}`,
        eligible: false,
        path: 'none',
        scannedAt: null
      };
    }
    const payload = await r.json();
    const family = badge.pathFamily || pathFamily(badge.qualifyPath);
    // Path-aware re-check: Established badges never judged on Path A lock bars
    const q = recheckIssuedPath(payload, {
      pathFamily: family,
      qualifyPath: badge.qualifyPath,
      hasRevocationHistory: revokedHistory
    });
    return {
      ok: true,
      eligible: q.eligible,
      path: q.path,
      pathLabel: q.pathLabel,
      pathFamily: q.pathFamily,
      reason: q.reason,
      lpTier: q.lpTier,
      grade: q.grade,
      score: q.score,
      lifetimeEligible: q.lifetimeEligible,
      badgeEligible: q.badgeEligible,
      unlockAt: q.unlockAt,
      expiresAt: q.expiresAt,
      established: q.established || null,
      scannedAt: payload?.reports?.[0]?.scannedAt || payload?.scannedAt || new Date().toISOString(),
      scannedAtUtc: null,
      scanUrl: `${SCAN_BASE}/?address=${encodeURIComponent(badge.mint)}`,
      paths: QUALIFY_PATHS
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'live re-check failed',
      eligible: false,
      path: 'none',
      scannedAt: null
    };
  }
}

export default async function handler(req, res) {
  recordVerifyHit('/api/badge/verify', req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const rawSerial = String((req.query && (req.query.serial || req.query.id)) || '').trim();
  const rawMint = String((req.query && req.query.mint) || '').trim();
  const skipLive = String((req.query && req.query.live) || '') === '0';

  if (!rawSerial && !rawMint) {
    return res.status(200).json({
      ok: true,
      howTo: 'GET /api/badge/verify?serial=GRD-2026-00001 or ?mint=<address>',
      paths: QUALIFY_PATHS,
      disclaimer: DISCLAIMER
    });
  }

  let badge = null;
  if (rawSerial) {
    const serial = normalizeSerial(rawSerial);
    if (!serial) {
      return res.status(400).json({ ok: false, valid: false, error: 'invalid serial format' });
    }
    badge = await getBadgeBySerial(serial);
  } else {
    badge = await getBadgeByMint(rawMint, String((req.query && req.query.chainId) || 'solana'));
  }

  if (!badge) {
    return res.status(404).json({
      ok: true,
      valid: false,
      status: 'MISSING',
      serial: rawSerial || null,
      error: 'serial not found',
      disclaimer: DISCLAIMER
    });
  }

  // Normalize display fields on older records
  badge = {
    ...badge,
    pathLabel: badge.pathLabel || pathLabel(badge.qualifyPath),
    pathFamily: badge.pathFamily || pathFamily(badge.qualifyPath),
    status: badge.status || 'VALID'
  };

  let status = badge.status;
  const isEstablished = (badge.pathFamily || pathFamily(badge.qualifyPath)) === 'established';
  // Established never expires from unlock dates — locks are not Path B evidence
  const expired =
    !isEstablished && badge.expiresAt ? Date.parse(badge.expiresAt) <= Date.now() : false;
  if (expired) status = 'EXPIRED';

  const live = skipLive ? null : await liveRecheck(badge);
  if (live && live.ok) {
    live.scannedAtUtc = live.scannedAt ? formatUtc(live.scannedAt) : null;
  }

  if (live && live.ok && !live.eligible && status !== 'EXPIRED') {
    // Auto-revocation on view when live path fails
    const revoked = await revokeBadge(badge.serial, live.reason || 'live re-check failed');
    if (revoked) badge = { ...badge, ...revoked };
    status = 'REVOKED';
  } else if (live && live.ok && live.eligible && status !== 'EXPIRED' && status !== 'REVOKED') {
    status = 'VALID';
  }

  const stillQualifies = live ? Boolean(live.ok && live.eligible) : null;
  const valid = status === 'VALID';

  return res.status(200).json({
    ok: true,
    valid,
    status,
    expired: status === 'EXPIRED',
    revoked: status === 'REVOKED',
    badge: {
      ...badge,
      status,
      pathLabel: badge.pathLabel,
      pathFamily: badge.pathFamily,
      issuedAtUtc: badge.issuedAt ? formatUtc(badge.issuedAt) : null
    },
    live,
    stillQualifies,
    verifyUrl: `${SITE}/verify/${badge.serial}`,
    ogImage: withOgArtRev(`${SITE}/api/badge/og?serial=${encodeURIComponent(badge.serial)}&v=5`),
    // Full-res RGBA (transparent + scannable QR). Indexed /og.png paints a black square.
    sealUrl: withOgArtRev(`${SITE}/api/seal/${encodeURIComponent(badge.serial)}.png`),
    // Tiny on-page thumb without QR (scan corners, etc.)
    sealUrlUi: withOgArtRev(`${SITE}/api/seal/${encodeURIComponent(badge.serial)}/ui.png`),
    paths: QUALIFY_PATHS,
    disclaimer: DISCLAIMER
  });
}

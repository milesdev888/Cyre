// api/badge-register.js — Phase 2 step 2: qualify via scan paths, then issue a serial.
// POST { mint } — pulls live scan, runs qualify paths, registers if eligible.
// POST { mint, …eligibility fields } — still accepted when badgeEligible + path known.
// Idempotent per mint+chain. Genesis C7 is already GRD-2026-00001.

import {
  registerBadge,
  isDurableBadgeStore,
  getBadgeByMint,
  GENESIS_SERIAL,
  GENESIS_MINT,
  hasRevocationHistory
} from './_badge-registry.js';
import { qualifyFromScan, QUALIFY_PATHS } from './_badge-qualify.js';
import { isCyreSiteRequest } from './_x402.js';

const DISCLAIMER = 'Patterns, not verdicts. Badge serials attest scan eligibility at issue time.';
const SCAN_BASE = process.env.GUARDIAN_SCAN_URL || 'https://guardian-scan.onrender.com';

function readBody(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch (e) {
      return null;
    }
  }
  return b;
}

async function fetchScan(mint) {
  const url = `${SCAN_BASE}/api/scan?address=${encodeURIComponent(mint)}`;
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'GuardianBadge/2' },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`scan HTTP ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const mint = String((req.query && req.query.mint) || '').trim();
    const chainId = String((req.query && req.query.chainId) || 'solana').trim();
    if (mint) {
      const existing = await getBadgeByMint(mint, chainId);
      return res.status(200).json({
        ok: true,
        found: Boolean(existing),
        badge: existing,
        paths: QUALIFY_PATHS,
        disclaimer: DISCLAIMER
      });
    }
    return res.status(200).json({
      ok: true,
      howTo: {
        register: 'POST /api/badge/register { mint } — live-scan qualify, then issue GRD-YYYY-NNNNN',
        verify: 'GET /api/badge/verify?serial=GRD-2026-00001 or /verify/GRD-2026-00001',
        genesis: `${GENESIS_SERIAL} → ${GENESIS_MINT}`
      },
      paths: QUALIFY_PATHS,
      scanBase: SCAN_BASE,
      disclaimer: DISCLAIMER
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  if (!isCyreSiteRequest(req) && process.env.BADGE_REGISTER_OPEN !== '1') {
    if (process.env.VERCEL_ENV === 'production' && isDurableBadgeStore()) {
      return res.status(403).json({
        ok: false,
        error: 'badge register is site-gated in production until x402 step lands'
      });
    }
  }

  const body = readBody(req) || {};
  const mint = String(body.mint || '').trim();
  if (!mint) return res.status(400).json({ ok: false, error: 'mint required' });

  try {
    let qualify;
    if (body.skipScan && body.badgeEligible) {
      qualify = {
        eligible: true,
        path: body.qualifyPath || (body.lifetimeEligible ? 'lifetime' : 'timed'),
        reason: 'caller-supplied eligibility',
        lpTier: body.lpTier,
        lifetimeEligible: Boolean(body.lifetimeEligible),
        badgeEligible: true,
        unlockAt: body.unlockAt || null,
        expiresAt: body.expiresAt || null,
        grade: body.grade,
        score: body.score,
        symbol: body.symbol,
        name: body.name,
        mint,
        chainId: body.chainId || 'solana'
      };
    } else {
      const scan = await fetchScan(mint);
      const revokedHistory = await hasRevocationHistory(mint, body.chainId || 'solana');
      qualify = qualifyFromScan(scan, { hasRevocationHistory: revokedHistory });
    }

    if (!qualify.eligible) {
      return res.status(422).json({
        ok: false,
        error: 'not badge eligible',
        detail: qualify.reason,
        qualify,
        paths: QUALIFY_PATHS
      });
    }

    // Comp / direct registry lane — never creates a paid order.
    const badge = await registerBadge({
      mint,
      chainId: qualify.chainId || body.chainId || 'solana',
      symbol: qualify.symbol || body.symbol,
      name: qualify.name || body.name,
      grade: qualify.grade || body.grade,
      score: qualify.score ?? body.score,
      lpTier: qualify.lpTier || body.lpTier,
      qualifyPath: qualify.path,
      pathLabel: qualify.pathLabel,
      pathFamily: qualify.pathFamily,
      lifetimeEligible: qualify.lifetimeEligible,
      badgeEligible: true,
      expiresAt: qualify.expiresAt || null,
      scanUrl: `${SCAN_BASE}/?address=${encodeURIComponent(mint)}`,
      issuanceSource: 'comp'
    });

    return res.status(200).json({
      ok: true,
      badge,
      qualify,
      verifyUrl: `https://cyre.dev/verify/${badge.serial}`,
      paths: QUALIFY_PATHS,
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    return res.status(400).json({
      ok: false,
      error: e instanceof Error ? e.message : 'register failed'
    });
  }
}

// api/badge-qualify.js — Live qualify check for scan CTA / checkout gate.
// GET ?mint= — returns eligible + CTA only when gates pass and mint is unissued.
// Non-qualifying responses never include a buy/checkout URL.

import { qualifyFromScan, QUALIFY_PATHS } from './_badge-qualify.js';
import { getBadgeByMint, hasRevocationHistory } from './_badge-registry.js';
import { USDC_USD, C7_USD } from './_badge-order.js';

const SCAN_BASE = process.env.GUARDIAN_SCAN_URL || 'https://scan.cyre.dev';
const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';
const DISCLAIMER =
  'Guardian Verified is a measured qualifying-path seal with live re-check — patterns and lock evidence, not investment advice.';

async function fetchScan(mint) {
  const url = `${SCAN_BASE}/api/scan?address=${encodeURIComponent(mint)}`;
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'GuardianBadge/qualify' },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`scan HTTP ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const mint = String((req.query && req.query.mint) || '').trim();
  if (!mint) return res.status(400).json({ ok: false, error: 'mint required' });
  const chainId = String((req.query && req.query.chainId) || 'solana').trim();

  try {
    const existing = await getBadgeByMint(mint, chainId);
    if (existing && existing.status === 'VALID') {
      return res.status(200).json({
        ok: true,
        eligible: false,
        alreadyIssued: true,
        showBuy: false,
        badge: { serial: existing.serial, status: existing.status },
        verifyUrl: `${SITE}/verify/${existing.serial}`,
        paths: QUALIFY_PATHS,
        disclaimer: DISCLAIMER
      });
    }

    const scan = await fetchScan(mint);
    const revokedHistory = await hasRevocationHistory(mint, chainId);
    const qualify = qualifyFromScan(scan, { hasRevocationHistory: revokedHistory });

    if (!qualify.eligible) {
      return res.status(200).json({
        ok: true,
        eligible: false,
        showBuy: false,
        qualify,
        paths: QUALIFY_PATHS,
        disclaimer: DISCLAIMER
      });
    }

    return res.status(200).json({
      ok: true,
      eligible: true,
      showBuy: true,
      qualify,
      cta: 'Get Guardian Verified — $25',
      checkoutUrl: `${SITE}/order?mint=${encodeURIComponent(mint)}`,
      paths: QUALIFY_PATHS,
      disclaimer: DISCLAIMER
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      showBuy: false,
      error: (e && e.message) || 'qualify failed',
      disclaimer: DISCLAIMER
    });
  }
}

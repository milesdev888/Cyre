// api/badge-order.js — Create / read / watch paid Guardian Verified orders.
// POST { mint, usdcChain? } — live-scan qualify; if eligible and unissued → create ORDER (30m lock).
// usdcChain: ethereum | base | arbitrum | solana (default base). Robinhood Chain excluded.
// Non-qualifying mints get 422 with no checkout — money cannot buy a non-qualifying badge.
// GET ?id=ORD-… — order status (public).
// POST ?watch=1 | /api/badge/order/watch — poll for matching payment (same function so ephemeral
// store stays warm with create/status when Redis is unset).

import {
  createPaidOrder,
  resolveOrder,
  publicOrderView,
  USDC_USD,
  C7_USD,
  BASE_TREASURY,
  c7Treasury,
  EVM_USDC_TREASURY,
  SOLANA_USDC_TREASURY,
  USDC_CHAINS,
  USDC_CHAIN_IDS,
  resolveUsdcChain,
  isUsdcChainLive,
  liveUsdcChainIds,
  heldUsdcChainIds,
  solanaUsdcTreasury,
  isDurableOrderStore,
  saveOrder,
  getOrder,
  hydrateOrderToken
} from './_badge-order.js';
import { qualifyFromScan, QUALIFY_PATHS, extractScanReport } from './_badge-qualify.js';
import { getBadgeByMint, hasRevocationHistory } from './_badge-registry.js';
import { watchOrders } from './_badge-pay-watch.js';

const DISCLAIMER =
  'Guardian Verified is a measured qualifying-path seal with live re-check — patterns and lock evidence, not investment advice. Digital assets are volatile. Payment does not guarantee issuance; founder brand-safety approval is required.';
const SCAN_BASE = process.env.GUARDIAN_SCAN_URL || 'https://scan.cyre.dev';
const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';

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
    headers: { accept: 'application/json', 'user-agent': 'GuardianBadge/order' },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`scan HTTP ${r.status}`);
  return r.json();
}

function wantsWatch(req) {
  const q = req.query || {};
  if (q.watch === '1' || q.watch === 'true' || q.action === 'watch') return true;
  const url = String(req.url || '');
  return /\/watch(?:\?|$)/.test(url) || url.includes('badge-order-watch');
}

function founderAuthorized(req) {
  const key = process.env.BADGE_FOUNDER_KEY || process.env.X402_INTERNAL_KEY || '';
  if (!key) {
    return process.env.VERCEL_ENV !== 'production' && process.env.BADGE_FOUNDER_OPEN === '1';
  }
  const hdr =
    (req.headers && (req.headers['x-guardian-key'] || req.headers['X-Guardian-Key'])) || '';
  return String(hdr) === key;
}

/** Watch open orders for USDC / $C7 match. Hydrates from signed token when Redis is unset. */
async function handleWatch(req, res) {
  const body = req.method === 'POST' ? readBody(req) || {} : {};
  const orderId = String(
    (body.orderId || body.id || (req.query && (req.query.orderId || req.query.id)) || '')
  ).trim();
  const token = String((body.token || (req.query && req.query.token) || '')).trim();

  if (token) {
    await hydrateOrderToken(token);
  }

  let inject = null;
  if (body.inject && founderAuthorized(req)) {
    inject = {
      lane: String(body.inject.lane || ''),
      tx: String(body.inject.tx || ''),
      from: body.inject.from || null
    };
  } else if (body.inject && !founderAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'inject requires founder key' });
  }

  try {
    if (orderId) {
      let present = await getOrder(orderId);
      if (!present && token) {
        present = await hydrateOrderToken(token);
      }
      if (!present) {
        return res.status(404).json({
          ok: false,
          error: isDurableOrderStore()
            ? 'order not found'
            : 'order not in this instance — pass signed token from create/status',
          watched: 0,
          results: [],
          order: null,
          needToken: !isDurableOrderStore()
        });
      }
    }

    const results = await watchOrders({ orderId: orderId || undefined, inject });
    let order = orderId ? await getOrder(orderId) : null;
    if (!order) order = await resolveOrder({ id: orderId, token });
    return res.status(200).json({
      ok: true,
      watched: results.length,
      results,
      order: order ? publicOrderView(order) : null
    });
  } catch (e) {
    console.error('order-watch failed', e && e.message);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'watch failed' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-guardian-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Watch shares this function with create/status so warm /tmp sees the order when Redis is unset.
  if (wantsWatch(req) || (req.method === 'POST' && (readBody(req) || {}).action === 'watch')) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method not allowed' });
    }
    return handleWatch(req, res);
  }

  if (req.method === 'GET') {
    const id = String((req.query && (req.query.id || req.query.order)) || '').trim();
    const token = String((req.query && req.query.token) || '').trim();
    if (id || token) {
      const order = await resolveOrder({ id, token });
      if (!order) return res.status(404).json({ ok: false, error: 'order not found' });
      return res.status(200).json(publicOrderView(order));
    }
    return res.status(200).json({
      ok: true,
      howTo: {
        create:
          'POST /api/badge/order { mint, usdcChain?: ethereum|base|arbitrum|solana } — only when live scan qualifies and mint is unissued',
        status: 'GET /api/badge/order?id=ORD-YYYY-NNNNN',
        checkout: `${SITE}/order?mint=<mint>`,
        watch: 'POST /api/badge/order/watch { orderId, token? } — include signed token when order is not in store',
        founder: 'POST /api/badge/founder { action: approve|reject|list, orderId }',
        comp: 'POST /api/badge/register — founder comps bypass payment; never creates an order'
      },
      pricing: {
        usdcUsd: USDC_USD,
        c7Usd: C7_USD,
        lockMinutes: 30,
        usdcChains: USDC_CHAIN_IDS,
        liveUsdcChains: liveUsdcChainIds(),
        heldUsdcChains: heldUsdcChainIds(),
        usdcTreasuryEvm: EVM_USDC_TREASURY,
        usdcTreasurySolana: solanaUsdcTreasury() || null,
        usdcTreasuryBase: BASE_TREASURY,
        c7TreasurySolana: c7Treasury(),
        canonicalUsdc: Object.fromEntries(
          USDC_CHAIN_IDS.map((id) => [
            id,
            {
              name: USDC_CHAINS[id].name,
              asset: USDC_CHAINS[id].asset,
              live: isUsdcChainLive(id)
            }
          ])
        )
      },
      paths: QUALIFY_PATHS,
      disclaimer: DISCLAIMER
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body = readBody(req) || {};
  const mint = String(body.mint || '').trim();
  if (!mint) return res.status(400).json({ ok: false, error: 'mint required' });
  const usdcChainRaw = body.usdcChain != null ? body.usdcChain : body.usdc_chain;
  const usdcMeta = resolveUsdcChain(
    usdcChainRaw != null && usdcChainRaw !== '' ? usdcChainRaw : 'base'
  );
  if (!usdcMeta) {
    return res.status(400).json({
      ok: false,
      error: `unsupported usdcChain — choose one of: ${USDC_CHAIN_IDS.join(', ')}`,
      usdcChains: USDC_CHAIN_IDS,
      liveUsdcChains: liveUsdcChainIds(),
      heldUsdcChains: heldUsdcChainIds(),
      note: 'Robinhood Chain is excluded until canonical USDC is confirmed.'
    });
  }
  if (!isUsdcChainLive(usdcMeta)) {
    return res.status(400).json({
      ok: false,
      error: `USDC on ${usdcMeta.name} is held — receiving treasury not confirmed`,
      usdcChain: usdcMeta.id,
      liveUsdcChains: liveUsdcChainIds(),
      heldUsdcChains: heldUsdcChainIds(),
      note:
        usdcMeta.id === 'solana'
          ? 'Set BADGE_USDC_TREASURY_SOLANA to a confirmed Solana USDC receive address to go live.'
          : 'Confirm the shared EVM treasury is funded/controlled on this chain, or set BADGE_USDC_LIVE_CHAINS.'
    });
  }

  try {
    // Live scan first — chainId comes from the report (ethereum for AAVE), never default solana.
    const scan = await fetchScan(mint);
    const report = extractScanReport(scan) || scan;
    const chainGuess =
      (report && report.chain && report.chain.id) || (report && report.chainId) || null;
    const revokedHistory = await hasRevocationHistory(
      mint,
      String(body.chainId || chainGuess || 'solana').trim()
    );
    const qualify = qualifyFromScan(scan, { hasRevocationHistory: revokedHistory });
    const chainId = String(qualify.chainId || body.chainId || chainGuess || 'solana').trim();

    const existing = await getBadgeByMint(mint, chainId);
    if (existing && existing.status === 'VALID') {
      return res.status(409).json({
        ok: false,
        error: 'already issued',
        badge: { serial: existing.serial, status: existing.status },
        verifyUrl: `${SITE}/verify/${existing.serial}`,
        disclaimer: DISCLAIMER
      });
    }

    // Hard gate: non-qualifying tokens NEVER get an order / buy path.
    if (!qualify.eligible) {
      return res.status(422).json({
        ok: false,
        error: 'not badge eligible — checkout unavailable',
        detail: qualify.reason,
        qualify,
        paths: QUALIFY_PATHS,
        disclaimer: DISCLAIMER
      });
    }

    const order = await createPaidOrder({
      mint,
      chainId,
      qualify,
      siteUrl: SITE,
      usdcChain: usdcMeta.id
    });
    return res.status(201).json({
      ...publicOrderView(order),
      checkoutUrl: order.statusUrl,
      cta: `Get Guardian Verified — $${USDC_USD} USDC or $${C7_USD} in $C7.`,
      paths: QUALIFY_PATHS
    });
  } catch (e) {
    console.error('badge-order create failed', e && e.message);
    return res.status(500).json({
      ok: false,
      error: (e && e.message) || 'order create failed',
      disclaimer: DISCLAIMER
    });
  }
}

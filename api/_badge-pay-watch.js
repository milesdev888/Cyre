// api/_badge-pay-watch.js — Match multi-chain USDC / Solana $C7 payments to open orders.
// No wallet-connect — watches on-chain transfers only.
// USDC: watches ONLY the chain selected at order creation (ethereum|base|arbitrum|solana).
// EVM lanes: unique cent-amount Transfer to shared treasury on that chain's canonical USDC.
// Solana USDC: Solana Pay reference + USDC mint (same pattern as C7).
// On match: re-scan qualify; if lost, do NOT accept payment (QUALIFY_LOST).
// If still eligible → payment accepted → name-screen → AUTO ISSUED or PENDING_FOUNDER_APPROVAL.
// Auto-approve when BADGE_AUTO_APPROVE !== '0' (default ON).

import {
  ORDER_STATUSES,
  applyExpiry,
  getOrder,
  listAwaitingPayment,
  updateOrder,
  BASE_USDC,
  BASE_TREASURY,
  EVM_USDC_TREASURY,
  c7Treasury,
  isC7LaneLive,
  SOLANA_USDC,
  SOLANA_USDC_TREASURY,
  solanaUsdcTreasury,
  USDC_CHAINS,
  resolveUsdcChain,
  usdcRpcUrl
} from './_badge-order.js';
import { recordC7BurnEntry } from './_badge-burn-ledger.js';
import { qualifyFromScan } from './_badge-qualify.js';
import { getBadgeByMint, hasRevocationHistory, registerBadge } from './_badge-registry.js';
import { screenBadgeName } from './_badge-name-screen.js';
import { notifyBadgeAutoIssued, notifyBadgeFlaggedHold } from './_badge-notify.js';
import { C7_MINT } from './_supply.js';

const SCAN_BASE = process.env.GUARDIAN_SCAN_URL || 'https://scan.cyre.dev';
const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/** Default ON — set BADGE_AUTO_APPROVE=0 to force founder queue for every paid order. */
export function isBadgeAutoApproveEnabled() {
  return process.env.BADGE_AUTO_APPROVE !== '0';
}

/**
 * Issue a paid serial from an order (same path as founder approve).
 * @param {object} order
 * @param {object} qualify
 * @param {{ status: string, decidedAt?: string, reason?: string|null, queuedAt?: string }} approval
 */
export async function issuePaidOrderBadge(order, qualify, approval) {
  const q = qualify || order.qualifyAtPayment || order.qualifySnapshot || {};
  const badge = await registerBadge({
    mint: order.mint,
    chainId: order.chainId || 'solana',
    symbol: order.symbol || q.symbol,
    name: order.name || q.name,
    grade: q.grade || 'U',
    score: q.score ?? null,
    lpTier: q.lpTier || 'UNVERIFIED',
    qualifyPath: q.path,
    pathLabel: q.pathLabel,
    pathFamily: q.pathFamily,
    lifetimeEligible: Boolean(q.lifetimeEligible),
    badgeEligible: true,
    expiresAt: q.expiresAt || null,
    scanUrl: `${SCAN_BASE}/?address=${encodeURIComponent(order.mint)}`,
    issuanceSource: 'paid',
    orderId: order.id
  });

  const issued = await updateOrder(order, {
    status: ORDER_STATUSES.ISSUED,
    approval: {
      status: approval.status || 'APPROVED',
      decidedAt: approval.decidedAt || new Date().toISOString(),
      reason: approval.reason != null ? approval.reason : null,
      ...(approval.queuedAt ? { queuedAt: approval.queuedAt } : {}),
      ...(approval.auto ? { auto: true } : {})
    },
    issuance: {
      serial: badge.serial,
      issuedAt: badge.issuedAt,
      verifyUrl: `${SITE}/verify/${badge.serial}`,
      sealUrl: `${SITE}/api/seal/${badge.serial}.png`,
      source: 'paid',
      orderId: order.id
    }
  });
  return { order: issued, badge };
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function fetchScan(mint) {
  const url = `${SCAN_BASE}/api/scan?address=${encodeURIComponent(mint)}`;
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'GuardianBadge/order-watch' },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`scan HTTP ${r.status}`);
  return r.json();
}

/**
 * Re-qualify at payment time. Money must not buy a badge the scan wouldn't grant.
 * @param {object} order
 * @returns {Promise<{ ok: boolean, qualify?: object, reason?: string }>}
 */
export async function requalifyOrderMint(order) {
  const existing = await getBadgeByMint(order.mint, order.chainId || 'solana');
  if (existing && existing.status === 'VALID') {
    return { ok: false, reason: 'mint already has a Guardian Verified serial' };
  }
  try {
    const scan = await fetchScan(order.mint);
    const revokedHistory = await hasRevocationHistory(order.mint, order.chainId || 'solana');
    const qualify = qualifyFromScan(scan, { hasRevocationHistory: revokedHistory });
    if (!qualify.eligible) {
      return { ok: false, qualify, reason: qualify.reason || 'no longer qualifies' };
    }
    return { ok: true, qualify };
  } catch (e) {
    return { ok: false, reason: `re-scan failed: ${(e && e.message) || e}` };
  }
}

function padTopicAddress(addr) {
  const a = String(addr || '').toLowerCase().replace(/^0x/, '');
  return '0x' + a.padStart(64, '0');
}

async function rpcEvm(rpcUrl, method, params) {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'evm rpc error');
  return j.result;
}

async function rpcSolana(method, params, rpcUrl = SOLANA_RPC) {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'solana rpc error');
  return j.result;
}

/**
 * Find ERC-20 Transfer logs to treasury with exact atomic amount on a given EVM USDC.
 * @param {{ rpcUrl: string, usdcAddress: string, treasury: string, amountAtomic: string, fromBlockLookback?: number }} opts
 */
export async function findEvmUsdcPayment(opts) {
  const {
    rpcUrl,
    usdcAddress,
    treasury = EVM_USDC_TREASURY,
    amountAtomic,
    fromBlockLookback = 5000
  } = opts;
  if (!rpcUrl || !usdcAddress || !amountAtomic) return null;
  const amountHex = '0x' + BigInt(String(amountAtomic)).toString(16);
  const blockHex = await rpcEvm(rpcUrl, 'eth_blockNumber', []);
  const latest = parseInt(blockHex, 16);
  const fromBlock = '0x' + Math.max(0, latest - fromBlockLookback).toString(16);
  const logs = await rpcEvm(rpcUrl, 'eth_getLogs', [
    {
      fromBlock,
      toBlock: 'latest',
      address: usdcAddress,
      topics: [TRANSFER_TOPIC, null, padTopicAddress(treasury)]
    }
  ]);
  if (!Array.isArray(logs)) return null;
  for (const log of logs) {
    const value = BigInt(log.data || '0x0');
    if (value === BigInt(String(amountAtomic))) {
      const from = '0x' + String(log.topics[1] || '').slice(-40);
      return {
        tx: log.transactionHash,
        from,
        amountAtomic: String(value),
        amountHex,
        blockNumber: log.blockNumber,
        usdcAddress,
        treasury
      };
    }
  }
  return null;
}

/** @deprecated Prefer findEvmUsdcPayment with Base lane — kept for older callers. */
export async function findBaseUsdcPayment(amountAtomic, fromBlockLookback = 5000) {
  return findEvmUsdcPayment({
    rpcUrl: usdcRpcUrl('base'),
    usdcAddress: BASE_USDC,
    treasury: BASE_TREASURY,
    amountAtomic,
    fromBlockLookback
  });
}

/**
 * Match Solana Pay: signatures for reference pubkey that include SPL transfer to treasury.
 * @param {{ reference: string, amountAtomic: string, mint: string, treasury: string }} lane
 */
export async function findSolanaSplPayment(lane, rpcUrl = SOLANA_RPC) {
  const reference = lane.reference;
  const mint = lane.mint;
  const treasury = lane.treasury;
  if (!reference || !mint || !treasury) return null;
  const sigs = await rpcSolana('getSignaturesForAddress', [reference, { limit: 20 }], rpcUrl);
  if (!Array.isArray(sigs) || !sigs.length) return null;

  for (const s of sigs) {
    const sig = s.signature;
    const tx = await rpcSolana(
      'getTransaction',
      [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      rpcUrl
    );
    if (!tx || !tx.meta || tx.meta.err) continue;
    const hit = extractSplTransfer(tx, mint, treasury, lane.amountAtomic);
    if (hit) {
      return { tx: sig, from: hit.from, amountAtomic: hit.amountAtomic, matchMode: 'reference' };
    }
  }
  return null;
}

/**
 * Scan recent C7 treasury inbound transfers for an exact atomic amount.
 * Plain wallet sends cannot attach a Solana Pay reference — amount is the matcher.
 * @param {string} amountAtomic
 * @param {number} [limit]
 */
export async function findC7ByExactAmount(amountAtomic, limit = 40) {
  const sigs = await rpcSolana('getSignaturesForAddress', [C7_TREASURY, { limit }]);
  if (!Array.isArray(sigs) || !sigs.length) return null;
  for (const s of sigs) {
    const sig = s.signature;
    const tx = await rpcSolana('getTransaction', [
      sig,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
    ]);
    if (!tx || !tx.meta || tx.meta.err) continue;
    const hit = extractSplTransfer(tx, C7_MINT, C7_TREASURY, amountAtomic);
    if (hit) {
      return { tx: sig, from: hit.from, amountAtomic: hit.amountAtomic, matchMode: 'exact_amount' };
    }
  }
  return null;
}

/**
 * Match Solana Pay: C7 transfer to treasury.
 * Reference first; fallback to exact atomic amount (OKX / plain wallet sends).
 * @param {{ reference?: string, amountAtomic: string }} lane
 */
export async function findC7SolanaPayment(lane) {
  const amountAtomic = lane && lane.amountAtomic;
  if (!amountAtomic) return null;
  if (lane.reference) {
    const hit = await findSolanaSplPayment({
      reference: lane.reference,
      amountAtomic,
      mint: C7_MINT,
      treasury: C7_TREASURY
    });
    if (hit) return hit;
  }
  return findC7ByExactAmount(amountAtomic);
}

/**
 * Match Solana USDC via Solana Pay reference (same pattern as C7).
 * @param {{ reference: string, amountAtomic: string, to?: string, asset?: string }} lane
 */
export async function findSolanaUsdcPayment(lane) {
  return findSolanaSplPayment({
    reference: lane.reference,
    amountAtomic: lane.amountAtomic,
    mint: lane.asset || SOLANA_USDC,
    treasury: lane.to || solanaUsdcTreasury()
  });
}

function extractSplTransfer(tx, mint, treasury, amountAtomic) {
  const meta = tx.meta;
  const message = tx.transaction && tx.transaction.message;
  const accountKeys = (message && message.accountKeys) || [];
  const keys = accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));

  const pre = meta.preTokenBalances || [];
  const post = meta.postTokenBalances || [];
  for (const postBal of post) {
    if (postBal.mint !== mint) continue;
    const owner = postBal.owner;
    if (owner !== treasury) continue;
    const preBal = pre.find(
      (p) => p.accountIndex === postBal.accountIndex || (p.owner === owner && p.mint === mint)
    );
    const preAmt = BigInt((preBal && preBal.uiTokenAmount && preBal.uiTokenAmount.amount) || '0');
    const postAmt = BigInt((postBal.uiTokenAmount && postBal.uiTokenAmount.amount) || '0');
    const delta = postAmt - preAmt;
    if (delta === BigInt(String(amountAtomic))) {
      let from = null;
      for (const p of pre) {
        if (p.mint !== mint) continue;
        const q = post.find((x) => x.accountIndex === p.accountIndex);
        const preA = BigInt((p.uiTokenAmount && p.uiTokenAmount.amount) || '0');
        const postA = BigInt((q && q.uiTokenAmount && q.uiTokenAmount.amount) || '0');
        if (preA - postA === delta) {
          from = p.owner || null;
          break;
        }
      }
      return { from, amountAtomic: String(delta), keys };
    }
  }
  return null;
}

function orderUsdcLane(order) {
  return (order.payment && (order.payment.usdc || order.payment.usdcBase)) || null;
}

function orderUsdcChainMeta(order) {
  const lane = orderUsdcLane(order);
  const id = (order.payment && order.payment.usdcChain) || (lane && lane.chain) || 'base';
  return resolveUsdcChain(id) || USDC_CHAINS.base;
}

/**
 * Apply a matched payment to an order (after re-qualify).
 * Name-screens token name/symbol; auto-issues when clean and BADGE_AUTO_APPROVE !== '0'.
 * @param {object} order
 * @param {{ lane: string, tx: string, from?: string|null, amountAtomic: string }} match
 * @param {object} qualify
 */
export async function acceptPayment(order, match, qualify) {
  let burnLedgerId = null;
  if (match.lane === 'c7_solana') {
    const entry = await recordC7BurnEntry({
      orderId: order.id,
      amountAtomic: match.amountAtomic || order.locked.c7Atomic,
      amountDisplay: order.locked.c7Amount,
      tx: match.tx,
      from: match.from || null
    });
    burnLedgerId = entry.id;
  }

  const paidAt = new Date().toISOString();
  const qualifyAtPayment = {
    path: qualify.path,
    pathLabel: qualify.pathLabel,
    pathFamily: qualify.pathFamily,
    grade: qualify.grade,
    score: qualify.score,
    lpTier: qualify.lpTier,
    lifetimeEligible: qualify.lifetimeEligible,
    badgeEligible: qualify.badgeEligible,
    expiresAt: qualify.expiresAt || null,
    reason: qualify.reason,
    symbol: qualify.symbol,
    name: qualify.name
  };

  const screenName = order.name || qualify.name || null;
  const screenSymbol = order.symbol || qualify.symbol || null;
  const screen = screenBadgeName({ name: screenName, symbol: screenSymbol });
  const autoOn = isBadgeAutoApproveEnabled();

  // Payment accepted base patch (always recorded before auto-issue or hold).
  const basePatch = {
    paidAt,
    paymentLane: match.lane,
    paymentTx: match.tx,
    paymentFrom: match.from || null,
    burnLedgerId,
    qualifyAtPayment,
    paidStatusTrail: ORDER_STATUSES.PAID,
    name: screenName,
    symbol: screenSymbol
  };

  if (autoOn && screen.ok) {
    const queued = await updateOrder(order, {
      ...basePatch,
      status: ORDER_STATUSES.PENDING_FOUNDER_APPROVAL,
      screenFlags: null,
      approval: {
        status: 'PENDING_FOUNDER_APPROVAL',
        queuedAt: paidAt
      }
    });
    const { order: issued, badge } = await issuePaidOrderBadge(queued, qualifyAtPayment, {
      status: 'AUTO_APPROVED',
      decidedAt: new Date().toISOString(),
      reason: 'name-screen clean',
      queuedAt: paidAt,
      auto: true
    });
    try {
      await notifyBadgeAutoIssued({
        order: issued,
        badge,
        verifyUrl: issued.issuance && issued.issuance.verifyUrl
      });
    } catch (_) {}
    return issued;
  }

  const screenFlags = screen.ok
    ? null
    : {
        ok: false,
        flags: screen.flags,
        reason: screen.reason,
        screenedAt: paidAt
      };

  const held = await updateOrder(order, {
    ...basePatch,
    status: ORDER_STATUSES.PENDING_FOUNDER_APPROVAL,
    screenFlags,
    approval: {
      status: 'PENDING_FOUNDER_APPROVAL',
      queuedAt: paidAt,
      ...(screenFlags ? { holdReason: screen.reason } : {})
    }
  });

  if (screenFlags) {
    try {
      await notifyBadgeFlaggedHold({
        order: held,
        flags: screen.flags,
        reason: screen.reason
      });
    } catch (_) {}
  }

  return held;
}

/**
 * Watch USDC on the order's selected chain only, then $C7 Solana.
 * @param {object} order
 */
export async function matchOrderPayment(order) {
  const usdcLane = orderUsdcLane(order);
  const meta = orderUsdcChainMeta(order);
  const amountAtomic = (order.locked && order.locked.usdcAtomic) || (usdcLane && usdcLane.amountAtomic);

  if (usdcLane && amountAtomic) {
    if (meta.family === 'evm') {
      const hit = await findEvmUsdcPayment({
        rpcUrl: usdcRpcUrl(meta),
        usdcAddress: usdcLane.asset || meta.asset,
        treasury: usdcLane.to || EVM_USDC_TREASURY,
        amountAtomic
      });
      if (hit) {
        return {
          lane: meta.lane || usdcLane.lane || 'usdc_base',
          tx: hit.tx,
          from: hit.from,
          amountAtomic: hit.amountAtomic
        };
      }
    } else if (meta.family === 'solana' && usdcLane.reference) {
      const hit = await findSolanaUsdcPayment(usdcLane);
      if (hit) {
        return {
          lane: 'usdc_solana',
          tx: hit.tx,
          from: hit.from,
          amountAtomic: hit.amountAtomic
        };
      }
    }
  }

  if (order.payment && order.payment.c7Solana) {
    const c7 = await findC7SolanaPayment(order.payment.c7Solana);
    if (c7) {
      return {
        lane: 'c7_solana',
        tx: c7.tx,
        from: c7.from,
        amountAtomic: c7.amountAtomic
      };
    }
  }
  return null;
}

/**
 * Watch one order or all awaiting payments.
 * @param {{ orderId?: string, inject?: { lane: string, tx: string, from?: string }|null }} opts
 * inject requires founder/test auth at the HTTP layer.
 */
export async function watchOrders(opts = {}) {
  /** @type {object[]} */
  let targets = [];
  if (opts.orderId) {
    const o = await getOrder(opts.orderId);
    if (o) targets = [o];
  } else {
    targets = await listAwaitingPayment();
  }

  const results = [];
  for (let order of targets) {
    order = applyExpiry(order);
    if (order.status === ORDER_STATUSES.EXPIRED) {
      await updateOrder(order, { status: ORDER_STATUSES.EXPIRED });
      results.push({ id: order.id, status: 'EXPIRED', matched: false });
      continue;
    }
    if (order.status !== ORDER_STATUSES.AWAITING_PAYMENT) {
      results.push({ id: order.id, status: order.status, matched: false });
      continue;
    }

    let match = null;
    if (opts.inject && opts.inject.lane && opts.inject.tx) {
      const lane = String(opts.inject.lane);
      const usdcLane = orderUsdcLane(order);
      const amountAtomic =
        lane === 'c7_solana'
          ? order.locked.c7Atomic
          : (usdcLane && usdcLane.amountAtomic) || order.locked.usdcAtomic;
      match = {
        lane,
        tx: opts.inject.tx,
        from: opts.inject.from || null,
        amountAtomic
      };
    } else {
      try {
        match = await matchOrderPayment(order);
      } catch (e) {
        results.push({ id: order.id, watchError: (e && e.message) || String(e) });
      }
    }

    if (!match) {
      results.push({
        id: order.id,
        status: order.status,
        matched: false,
        usdcChain: (order.payment && order.payment.usdcChain) || null
      });
      continue;
    }

    const rq = await requalifyOrderMint(order);
    if (!rq.ok) {
      const lost = await updateOrder(order, {
        status: ORDER_STATUSES.QUALIFY_LOST,
        qualifyLostAt: new Date().toISOString(),
        qualifyLostReason: rq.reason,
        paymentTxSeen: match.tx,
        paymentLaneSeen: match.lane,
        refund: {
          status: 'REFUND_PENDING',
          recordedAt: new Date().toISOString(),
          note: 'Payment seen but mint no longer qualifies — founder refund path.'
        }
      });
      results.push({
        id: order.id,
        status: lost.status,
        matched: true,
        accepted: false,
        reason: rq.reason,
        paymentTx: match.tx
      });
      continue;
    }

    const accepted = await acceptPayment(order, match, rq.qualify);
    results.push({
      id: order.id,
      status: accepted.status,
      matched: true,
      accepted: true,
      paymentLane: match.lane,
      paymentTx: match.tx,
      burnLedgerId: accepted.burnLedgerId,
      autoApproved: accepted.approval && accepted.approval.status === 'AUTO_APPROVED',
      serial: accepted.issuance && accepted.issuance.serial,
      screenFlags: accepted.screenFlags || null,
      usdcChain: (order.payment && order.payment.usdcChain) || null
    });
  }
  return results;
}

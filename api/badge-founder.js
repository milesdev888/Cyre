// api/badge-founder.js — Founder approve / reject / revoke gate for paid orders
// Auth: x-guardian-key = BADGE_FOUNDER_KEY || X402_INTERNAL_KEY
// Actions: list | approve | reject | refunded | revoke
// When durable:false, pass signed order `token` so approve/reject hydrates across instances.

import {
  getOrder,
  listOrders,
  updateOrder,
  publicOrderView,
  ORDER_STATUSES,
  assertPaidSource,
  resolveOrder,
  hydrateOrderToken
} from './_badge-order.js';
import { getBadgeBySerial, revokeBadge } from './_badge-registry.js';
import { issuePaidOrderBadge } from './_badge-pay-watch.js';

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

function founderAuthorized(req) {
  const key = process.env.BADGE_FOUNDER_KEY || process.env.X402_INTERNAL_KEY || '';
  if (!key) return process.env.VERCEL_ENV !== 'production' && process.env.BADGE_FOUNDER_OPEN === '1';
  const hdr =
    (req.headers && (req.headers['x-guardian-key'] || req.headers['X-Guardian-Key'])) || '';
  return String(hdr) === key;
}

async function loadOrder({ orderId, token }) {
  if (token) {
    const hydrated = await hydrateOrderToken(token);
    if (hydrated) {
      if (!orderId || String(hydrated.id).toUpperCase() === String(orderId).toUpperCase()) {
        return hydrated;
      }
    }
  }
  if (orderId) {
    const o = await resolveOrder({ id: orderId, token });
    if (o) return o;
    return getOrder(orderId);
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-guardian-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!founderAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'founder key required' });
  }

  if (req.method === 'GET') {
    const token = String((req.query && req.query.token) || '').trim();
    if (token) {
      const o = await loadOrder({ token });
      return res.status(200).json({
        ok: true,
        pending: o && o.status === ORDER_STATUSES.PENDING_FOUNDER_APPROVAL ? [publicOrderView(o)] : [],
        issued: o && o.status === ORDER_STATUSES.ISSUED ? [publicOrderView(o)] : [],
        order: o ? publicOrderView(o) : null
      });
    }
    const pending = await listOrders({ status: ORDER_STATUSES.PENDING_FOUNDER_APPROVAL, limit: 100 });
    const issued = await listOrders({ status: ORDER_STATUSES.ISSUED, limit: 40 });
    const refunds = await listOrders({ status: ORDER_STATUSES.REFUND_PENDING, limit: 50 });
    return res.status(200).json({
      ok: true,
      pending: pending.map(publicOrderView),
      issued: issued.map(publicOrderView),
      refundPending: refunds.map(publicOrderView),
      durableNote:
        'If durable store is unset, paste the signed order token from the checkout URL to load a pending order.',
      note: 'Comps bypass this queue — use POST /api/badge/register (never creates an order).'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body = readBody(req) || {};
  const action = String(body.action || '').toLowerCase();
  const orderId = String(body.orderId || body.id || '').trim();
  const token = String(body.token || '').trim();
  const serialRaw = String(body.serial || '').trim();

  if (action === 'list') {
    if (token) {
      const o = await loadOrder({ token });
      return res.status(200).json({
        ok: true,
        pending: o && o.status === ORDER_STATUSES.PENDING_FOUNDER_APPROVAL ? [publicOrderView(o)] : [],
        issued: o && o.status === ORDER_STATUSES.ISSUED ? [publicOrderView(o)] : [],
        order: o ? publicOrderView(o) : null
      });
    }
    const pending = await listOrders({ status: ORDER_STATUSES.PENDING_FOUNDER_APPROVAL, limit: 100 });
    const issued = await listOrders({ status: ORDER_STATUSES.ISSUED, limit: 40 });
    return res.status(200).json({
      ok: true,
      pending: pending.map(publicOrderView),
      issued: issued.map(publicOrderView)
    });
  }

  if (action === 'revoke') {
    let order = null;
    let serial = serialRaw;
    if (orderId || token) {
      order = await loadOrder({ orderId, token });
      if (!order) return res.status(404).json({ ok: false, error: 'order not found' });
      try {
        assertPaidSource(order);
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
      if (!serial && order.issuance && order.issuance.serial) {
        serial = order.issuance.serial;
      }
    }
    if (!serial) {
      return res.status(400).json({ ok: false, error: 'serial or issued orderId required' });
    }
    const badge = await getBadgeBySerial(serial);
    if (!badge) return res.status(404).json({ ok: false, error: 'badge not found' });
    if (badge.status === 'REVOKED') {
      return res.status(200).json({
        ok: true,
        alreadyRevoked: true,
        badge,
        order: order ? publicOrderView(order) : null
      });
    }
    const revoked = await revokeBadge(serial, body.reason || 'founder revoke');
    if (!revoked) {
      return res.status(500).json({ ok: false, error: 'revoke failed' });
    }
    let updatedOrder = null;
    if (order && order.status === ORDER_STATUSES.ISSUED) {
      updatedOrder = await updateOrder(order, {
        approval: {
          ...(order.approval || {}),
          status: 'REVOKED',
          revokedAt: new Date().toISOString(),
          reason: body.reason || 'founder revoke'
        },
        issuance: {
          ...(order.issuance || {}),
          revokedAt: revoked.revokedAt,
          revokeReason: revoked.revokeReason
        }
      });
    } else if (!order && revoked.orderId) {
      const linked = await getOrder(revoked.orderId);
      if (linked && linked.status === ORDER_STATUSES.ISSUED) {
        updatedOrder = await updateOrder(linked, {
          approval: {
            ...(linked.approval || {}),
            status: 'REVOKED',
            revokedAt: new Date().toISOString(),
            reason: body.reason || 'founder revoke'
          },
          issuance: {
            ...(linked.issuance || {}),
            revokedAt: revoked.revokedAt,
            revokeReason: revoked.revokeReason
          }
        });
      }
    }
    return res.status(200).json({
      ok: true,
      badge: revoked,
      order: updatedOrder ? publicOrderView(updatedOrder) : order ? publicOrderView(order) : null,
      verifyUrl: `${SITE}/verify/${revoked.serial}`
    });
  }

  if (!orderId && !token) return res.status(400).json({ ok: false, error: 'orderId or token required' });
  const order = await loadOrder({ orderId, token });
  if (!order) return res.status(404).json({ ok: false, error: 'order not found — pass signed token if missing from store' });
  try {
    assertPaidSource(order);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  if (action === 'approve') {
    if (order.status !== ORDER_STATUSES.PENDING_FOUNDER_APPROVAL) {
      return res.status(409).json({
        ok: false,
        error: `order status is ${order.status}, expected PENDING_FOUNDER_APPROVAL`
      });
    }
    const q = order.qualifyAtPayment || order.qualifySnapshot || {};
    const { order: issued, badge } = await issuePaidOrderBadge(order, q, {
      status: 'APPROVED',
      decidedAt: new Date().toISOString(),
      reason: body.reason || null
    });

    return res.status(200).json({
      ok: true,
      order: publicOrderView(issued),
      badge,
      verifyUrl: `${SITE}/verify/${badge.serial}`,
      sealUrl: `${SITE}/api/seal/${badge.serial}.png`
    });
  }

  if (action === 'reject') {
    if (
      order.status !== ORDER_STATUSES.PENDING_FOUNDER_APPROVAL &&
      order.status !== ORDER_STATUSES.QUALIFY_LOST
    ) {
      return res.status(409).json({
        ok: false,
        error: `cannot reject from status ${order.status}`
      });
    }
    const rejected = await updateOrder(order, {
      status: ORDER_STATUSES.REFUND_PENDING,
      approval: {
        status: 'REJECTED',
        decidedAt: new Date().toISOString(),
        reason: body.reason || 'brand-safety veto'
      },
      refund: {
        status: 'REFUND_PENDING',
        recordedAt: new Date().toISOString(),
        note:
          body.note ||
          'Founder brand-safety veto — send refund manually, then mark refunded.'
      }
    });
    return res.status(200).json({
      ok: true,
      order: publicOrderView(rejected),
      next: 'Send refund manually, then POST { action: "refunded", orderId, tx }'
    });
  }

  if (action === 'refunded') {
    if (order.status !== ORDER_STATUSES.REFUND_PENDING && order.status !== ORDER_STATUSES.REJECTED) {
      return res.status(409).json({
        ok: false,
        error: `cannot mark refunded from status ${order.status}`
      });
    }
    const refunded = await updateOrder(order, {
      status: ORDER_STATUSES.REFUNDED,
      refund: {
        status: 'REFUNDED',
        recordedAt: (order.refund && order.refund.recordedAt) || new Date().toISOString(),
        refundedAt: new Date().toISOString(),
        tx: body.tx || null,
        note: body.note || (order.refund && order.refund.note) || null
      }
    });
    return res.status(200).json({ ok: true, order: publicOrderView(refunded) });
  }

  return res.status(400).json({
    ok: false,
    error: 'action must be list|approve|reject|refunded|revoke'
  });
}

// api/_exchange.js — intent exchange match helpers (stateless; intents travel as tokens).

const EVM = /^0x[a-fA-F0-9]{40}$/;

export function summarizeIntent(claims) {
  if (!claims || claims.kind !== 'cyre-exchange-intent') return null;
  const deadline = Date.parse(claims.deadlineAt);
  const expired = Number.isFinite(deadline) && deadline <= Date.now();
  return {
    id: claims.id,
    actor: claims.actor,
    need: claims.need,
    budgetAtomic: claims.budgetAtomic,
    network: claims.network,
    deadlineAt: claims.deadlineAt,
    tags: claims.tags || [],
    status: expired ? 'expired' : claims.status || 'open',
    expired
  };
}

export function matchIntentToVendor(intent, vendor = {}) {
  const reasons = [];
  let ok = true;
  const summary = summarizeIntent(intent);
  if (!summary) return { ok: false, reasons: ['bad_intent'], summary: null };
  if (summary.expired || summary.status !== 'open') {
    return { ok: false, reasons: ['intent_not_open'], summary };
  }

  const budget = intent.budgetAtomic != null ? BigInt(String(intent.budgetAtomic)) : null;
  const offer = vendor.amountAtomic != null ? BigInt(String(vendor.amountAtomic)) : null;
  if (budget != null && offer != null && offer > budget) {
    ok = false;
    reasons.push('over_budget');
  }

  if (intent.network && vendor.network && intent.network !== vendor.network) {
    ok = false;
    reasons.push('network_mismatch');
  }

  const payTo = String(vendor.payTo || '').trim();
  if (payTo && !EVM.test(payTo) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payTo)) {
    ok = false;
    reasons.push('bad_payto');
  }

  const resourceUrl = String(vendor.resourceUrl || '').trim();
  if (resourceUrl) {
    try {
      const u = new URL(resourceUrl);
      if (u.protocol !== 'https:') reasons.push('vendor_http');
    } catch (e) {
      ok = false;
      reasons.push('bad_vendor_url');
    }
  }

  if (!vendor.resourceUrl && !vendor.payTo) {
    ok = false;
    reasons.push('vendor_incomplete');
  }

  return {
    ok,
    reasons,
    summary,
    vendor: {
      resourceUrl: resourceUrl || null,
      payTo: payTo || null,
      amountAtomic: vendor.amountAtomic != null ? String(vendor.amountAtomic) : null,
      network: vendor.network || intent.network
    },
    next: ok
      ? ['Gate vendor payTo: /api/gate', 'Seal lockbox: /api/lockbox', 'Fulfill then /api/receipt']
      : ['Adjust vendor quote or repost intent']
  };
}

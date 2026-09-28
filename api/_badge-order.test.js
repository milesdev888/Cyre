// api/_badge-order.test.js — paid path: unique USDC, C7 lock, expiry, burn ledger, copy rules, comp isolation
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  encodeBase58,
  newSolanaPayReference,
  formatUsdcDisplay,
  lockC7Amount,
  buildSolanaPayUrl,
  createPaidOrder,
  getOrder,
  applyExpiry,
  preferOrderState,
  publicOrderView,
  ORDER_STATUSES,
  ORDER_TTL_MS,
  c7Treasury,
  isC7LaneLive,
  USDC_USD,
  C7_USD,
  assertPaidSource
} from './_badge-order.js';
import { recordC7BurnEntry, listBurnLedger } from './_badge-burn-ledger.js';
import { acceptPayment } from './_badge-pay-watch.js';
import { registerBadge, getBadgeByMint } from './_badge-registry.js';

process.env.BADGE_ORDER_STORE = '/tmp/guardian-badge-orders-test.json';
process.env.BADGE_BURN_LEDGER_STORE = '/tmp/guardian-c7-burn-ledger-test.json';
process.env.BADGE_REGISTRY_STORE = '/tmp/guardian-badge-registry-order-test.json';
process.env.BADGE_C7_PRICE_USD_FALLBACK = '0.00025';
/** Dedicated burn-receive wallet for tests — never the x402 payTo. */
process.env.BADGE_C7_TREASURY = 'BurnTreasury1111111111111111111111111111111';
try {
  fs.unlinkSync(process.env.BADGE_ORDER_STORE);
} catch (_) {}
try {
  fs.unlinkSync(process.env.BADGE_BURN_LEDGER_STORE);
} catch (_) {}
try {
  fs.unlinkSync(process.env.BADGE_REGISTRY_STORE);
} catch (_) {}

assert.equal(formatUsdcDisplay('25003100'), '25.0031');
assert.equal(formatUsdcDisplay('25000000'), '25.0');

const c7 = lockC7Amount(0.00025, 20);
assert.ok(BigInt(c7.amountAtomic) > 0n);
assert.equal(c7.amountAtomic, String(Math.ceil((20 / 0.00025) * 1e6)));

const ref = newSolanaPayReference();
assert.ok(ref.length >= 32);
assert.equal(encodeBase58(Buffer.alloc(32, 1)).length > 0, true);

const payUrl = buildSolanaPayUrl({
  recipient: '9iubApKktcxphCVgBg9CPRPhSH8nkzVRSapxhYwxfCVS',
  amount: c7.amountDisplay,
  splToken: '979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww',
  reference: ref,
  label: 'Guardian Verified'
});
assert.match(payUrl, /^solana:/);
assert.match(payUrl, /reference=/);

const qualify = {
  eligible: true,
  path: 'lifetime',
  pathLabel: 'Lifetime',
  pathFamily: 'secured',
  reason: 'test',
  lpTier: 'PERMANENT',
  lifetimeEligible: true,
  badgeEligible: true,
  grade: 'A',
  score: 90,
  symbol: 'TEST',
  name: 'Test Token',
  mint: 'TestMint1111111111111111111111111111111111111',
  chainId: 'solana'
};

const order = await createPaidOrder({
  mint: qualify.mint,
  chainId: 'solana',
  qualify,
  siteUrl: 'https://cyre.dev'
});

assert.equal(order.source, 'paid');
assert.equal(order.status, ORDER_STATUSES.AWAITING_PAYMENT);
assert.equal(order.locked.usdcUsd, USDC_USD);
assert.equal(order.locked.c7Usd, C7_USD);
assert.match(order.locked.usdcDisplay, /^25\./);
assert.ok(BigInt(order.locked.usdcAtomic) > 25000000n);
assert.ok(BigInt(order.locked.usdcAtomic) < 26000000n);
assert.ok(order.payment.usdcBase.to.startsWith('0x'));
assert.equal(order.payment.usdcChain, 'base');
assert.equal(order.payment.usdc.chain, 'base');
assert.equal(order.payment.usdc.lane, 'usdc_base');
assert.ok(order.payment.usdc.explorerAddressUrl.includes('basescan'));
assert.ok(order.payment.c7Solana.reference);
assert.match(order.payment.c7Solana.solanaPayUrl, /solana:/);
assert.ok(Date.parse(order.expiresAt) - Date.parse(order.createdAt) === ORDER_TTL_MS);

// Multi-chain USDC create — live EVM lanes
for (const chain of ['ethereum', 'arbitrum']) {
  const o = await createPaidOrder({
    mint: qualify.mint + chain,
    chainId: 'solana',
    qualify,
    siteUrl: 'https://cyre.dev',
    usdcChain: chain
  });
  assert.equal(o.payment.usdcChain, chain);
  assert.equal(o.payment.usdc.chain, chain);
  assert.equal(o.locked.usdcChain, chain);
  assert.equal(o.payment.usdc.family, 'evm');
  assert.ok(o.payment.usdc.to.startsWith('0x'));
  assert.ok(!o.payment.usdc.reference);
  assert.ok(o.payment.usdc.eip681Url);
}

// Solana USDC held until BADGE_USDC_TREASURY_SOLANA is set
await assert.rejects(
  () =>
    createPaidOrder({
      mint: qualify.mint + 'solheld',
      chainId: 'solana',
      qualify,
      usdcChain: 'solana'
    }),
  /not live|treasury not confirmed/i
);

// With explicit Solana USDC treasury → live
{
  process.env.BADGE_USDC_TREASURY_SOLANA = c7Treasury();
  const o = await createPaidOrder({
    mint: qualify.mint + 'solusdc',
    chainId: 'solana',
    qualify,
    siteUrl: 'https://cyre.dev',
    usdcChain: 'solana'
  });
  assert.equal(o.payment.usdcChain, 'solana');
  assert.equal(o.payment.usdc.family, 'solana');
  assert.ok(o.payment.usdc.reference);
  assert.match(o.payment.usdc.solanaPayUrl, /spl-token=EPjFWdd5/);
  assert.equal(o.payment.usdc.to, c7Treasury());
  delete process.env.BADGE_USDC_TREASURY_SOLANA;
}

await assert.rejects(
  () =>
    createPaidOrder({
      mint: 'x',
      qualify,
      usdcChain: 'robinhood'
    }),
  /unsupported USDC chain/
);

const loaded = await getOrder(order.id);
assert.equal(loaded.id, order.id);

// Expiry
const expired = applyExpiry({
  ...order,
  expiresAt: new Date(Date.now() - 1000).toISOString()
});
assert.equal(expired.status, ORDER_STATUSES.EXPIRED);

// Paid / pending never expire — lock is price-only
const pendingPastLock = applyExpiry({
  ...order,
  status: ORDER_STATUSES.PENDING_FOUNDER_APPROVAL,
  paidAt: new Date().toISOString(),
  paymentTx: 'FakeTx',
  paymentLane: 'c7_solana',
  expiresAt: new Date(Date.now() - 60_000).toISOString()
});
assert.equal(pendingPastLock.status, ORDER_STATUSES.PENDING_FOUNDER_APPROVAL);

// Stale EXPIRED token must not clobber pending
const kept = preferOrderState(pendingPastLock, expired);
assert.equal(kept.status, ORDER_STATUSES.PENDING_FOUNDER_APPROVAL);
assert.equal(kept.paymentTx, 'FakeTx');

// Accept payment → name-screen clean + auto-approve (default ON) → ISSUED + burn ledger for C7
delete process.env.BADGE_AUTO_APPROVE; // default ON
const paid = await acceptPayment(
  order,
  {
    lane: 'c7_solana',
    tx: 'FakeC7PaymentSig111111111111111111111111111111111111111111111111111',
    from: 'Buyer111111111111111111111111111111111111111',
    amountAtomic: order.locked.c7Atomic
  },
  qualify
);
assert.equal(paid.status, ORDER_STATUSES.ISSUED);
assert.equal(paid.approval && paid.approval.status, 'AUTO_APPROVED');
assert.ok(paid.issuance && paid.issuance.serial);
assert.equal(paid.paymentLane, 'c7_solana');
assert.ok(paid.burnLedgerId);

// Flagged name → hold in founder queue (even with auto-approve ON)
const flaggedQualify = {
  ...qualify,
  mint: 'FlagMint3333333333333333333333333333333333333',
  name: 'Bitcoin Clone',
  symbol: 'BTCX'
};
const flaggedOrder = await createPaidOrder({
  mint: flaggedQualify.mint,
  chainId: 'solana',
  qualify: flaggedQualify,
  siteUrl: 'https://cyre.dev'
});
const held = await acceptPayment(
  flaggedOrder,
  {
    lane: 'usdc_base',
    tx: '0xflaggedpaymenttx',
    from: '0xbuyer',
    amountAtomic: flaggedOrder.locked.usdcAtomic
  },
  flaggedQualify
);
assert.equal(held.status, ORDER_STATUSES.PENDING_FOUNDER_APPROVAL);
assert.ok(held.screenFlags && held.screenFlags.flags && held.screenFlags.flags.length);
assert.ok(held.screenFlags.flags.some((f) => f.includes('bitcoin') || f.includes('btc')));

// Auto-approve OFF → always pending even when clean
process.env.BADGE_AUTO_APPROVE = '0';
const manualQualify = {
  ...qualify,
  mint: 'ManualMint444444444444444444444444444444444444',
  name: 'Manual Hold Token',
  symbol: 'MAN'
};
const manualOrder = await createPaidOrder({
  mint: manualQualify.mint,
  chainId: 'solana',
  qualify: manualQualify,
  siteUrl: 'https://cyre.dev'
});
const manual = await acceptPayment(
  manualOrder,
  {
    lane: 'usdc_base',
    tx: '0xmanualpaymenttx',
    from: '0xbuyer2',
    amountAtomic: manualOrder.locked.usdcAtomic
  },
  manualQualify
);
assert.equal(manual.status, ORDER_STATUSES.PENDING_FOUNDER_APPROVAL);
assert.equal(manual.screenFlags, null);
delete process.env.BADGE_AUTO_APPROVE;

const ledger = await listBurnLedger({ limit: 10 });
assert.ok(ledger.some((e) => e.orderId === order.id && e.id === paid.burnLedgerId));

// Comp isolation
assert.throws(() => assertPaidSource({ source: 'comp' }), /comp issuance/);
assert.doesNotThrow(() => assertPaidSource(paid));

const pub = publicOrderView(paid);
assert.equal(pub.source, 'paid');
assert.ok(pub.disclaimer.toLowerCase().includes('not investment advice'));
assert.ok(!/\b(profit|returns|moon)\b/i.test(JSON.stringify(pub)));

// Comp register never looks like an order
const compMint = 'CompMint2222222222222222222222222222222222222';
const badge = await registerBadge({
  mint: compMint,
  chainId: 'solana',
  symbol: 'CMP',
  name: 'Comp',
  grade: 'A',
  score: 88,
  lpTier: 'PERMANENT',
  qualifyPath: 'lifetime',
  pathLabel: 'Lifetime',
  pathFamily: 'secured',
  lifetimeEligible: true,
  badgeEligible: true,
  issuanceSource: 'comp'
});
assert.equal(badge.issuanceSource, 'comp');
assert.equal(badge.orderId, undefined);
const byMint = await getBadgeByMint(compMint);
assert.equal(byMint.serial, badge.serial);

// Checkout page copy grep (locked vocab, no investment-speak in order UI source)
const page = fs.readFileSync(new URL('./order-page.js', import.meta.url), 'utf8');
assert.match(page, /locked/i);
assert.match(page, /not investment advice/);
assert.match(page, /Pay with USDC on/i);
assert.match(page, /wrong chain/i);
assert.match(page, /funds are safe/i);
assert.equal(
  page.match(/\b(profit|profits|returns|moon|mooning)\b/i),
  null,
  'order-page must not use investment-speak'
);

// badges.html CTA
const badges = fs.readFileSync(new URL('../badges.html', import.meta.url), 'utf8');
assert.match(badges, /href="\/order"/);
assert.match(badges, /locked 30 minutes/);

console.log('_badge-order.test.js: ok');

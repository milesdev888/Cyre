// api/_paybrief.js — shared payTo / URL / amount pattern helpers for bazaar + caution.

import { B58, gradeAddress, riskLevelFromScore, signal } from './_grade.js';

const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const EVM = /^0x[a-fA-F0-9]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
const CYRE_HOST = /(^|\.)cyre\.dev$/i;

export function parseAmountAtomic(raw) {
  if (raw == null || raw === '') return null;
  try {
    const n = BigInt(String(raw));
    if (n < 0n) return null;
    return n;
  } catch (e) {
    return null;
  }
}

export function urlSignals(resourceUrl) {
  const signals = [];
  if (!resourceUrl) return signals;
  let u;
  try {
    u = new URL(resourceUrl);
  } catch (e) {
    signals.push(signal('url_bad', 'Resource URL', 20, true, 'resourceUrl is not a valid URL'));
    return signals;
  }
  if (u.protocol !== 'https:') {
    signals.push(signal('url_http', 'Resource URL', 16, true, 'resourceUrl is not https'));
  } else {
    signals.push(signal('url_https', 'Resource URL', 0, false, 'resourceUrl uses https'));
  }
  if (CYRE_HOST.test(u.hostname)) {
    signals.push(signal('url_self', 'Resource URL', 0, false, 'cyre.dev — Guardian self host'));
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) {
    signals.push(signal('url_ip', 'Resource URL', 18, true, 'resourceUrl host is a raw IP'));
  }
  if ((u.hostname || '').split('.').length < 2) {
    signals.push(signal('url_host', 'Resource URL', 10, true, 'resourceUrl host looks incomplete'));
  }
  if (/\.(xyz|top|tk|ml|ga|cf)$/i.test(u.hostname || '')) {
    signals.push(signal('tld_odd', 'Resource URL', 8, true, `Uncommon TLD on ${u.hostname}`));
  }
  return signals;
}

export function amountSignals(atomic) {
  const signals = [];
  if (atomic == null) {
    signals.push(signal('amount_missing', 'Amount', 0, false, 'No amount provided'));
    return signals;
  }
  if (atomic === 0n) {
    signals.push(signal('amount_zero', 'Amount', 12, true, 'Amount is zero'));
  } else if (atomic > 100_000_000n) {
    signals.push(
      signal('amount_large', 'Amount', 14, true, `Amount ${atomic.toString()} atomic USDC (> $100) — large for a typical agent micro-pay`)
    );
  } else if (atomic < 100n) {
    signals.push(signal('amount_dust', 'Amount', 6, true, 'Amount is dust-level (< $0.0001)'));
  } else {
    signals.push(signal('amount_ok', 'Amount', 0, false, `Amount ${atomic.toString()} atomic USDC`));
  }
  return signals;
}

async function ethRpc(method, params) {
  const r = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'eth rpc error');
  return d.result;
}

async function gradeEvmPayTo(payTo) {
  const addr = payTo.toLowerCase();
  const signals = [];
  if (addr === ZERO) {
    return {
      chain: 'base',
      payTo: addr,
      score: 100,
      riskLevel: 'HIGH',
      signals: [signal('zero_address', 'PayTo', 100, true, 'payTo is the zero address')],
      profile: null,
      freshEoa: false
    };
  }
  const [nonceHex, code, balHex] = await Promise.all([
    ethRpc('eth_getTransactionCount', [addr, 'latest']),
    ethRpc('eth_getCode', [addr, 'latest']),
    ethRpc('eth_getBalance', [addr, 'latest'])
  ]);
  const nonce = Number.parseInt(nonceHex, 16);
  const isContract = !!(code && code !== '0x' && code !== '0x0');
  let balanceEth = 0;
  try {
    balanceEth = Number(BigInt(balHex)) / 1e18;
  } catch (e) {
    balanceEth = 0;
  }
  let freshEoa = false;
  if (!Number.isFinite(nonce)) {
    signals.push(signal('nonce_unknown', 'Activity', 8, true, 'Could not read transaction count'));
  } else if (nonce === 0 && !isContract) {
    freshEoa = true;
    signals.push(signal('fresh_eoa', 'Wallet age', 22, true, 'EOA with nonce 0 — no outbound history on Base'));
  } else if (nonce > 0 && nonce < 5) {
    signals.push(signal('young_eoa', 'Wallet age', 10, true, `EOA nonce ${nonce} — very light history on Base`));
  } else {
    signals.push(
      signal('nonce_ok', 'Wallet age', 0, false, isContract ? 'Contract account' : `EOA nonce ${nonce}`)
    );
  }
  if (isContract) {
    signals.push(
      signal('is_contract', 'Account type', 4, true, 'payTo is a contract — confirm it matches the service')
    );
  } else {
    signals.push(signal('is_eoa', 'Account type', 0, false, 'payTo is an EOA'));
  }
  if (!isContract && balanceEth === 0 && nonce === 0) {
    signals.push(signal('empty_fresh', 'Balance', 12, true, 'Fresh empty EOA — uncommon as a live treasury'));
  }
  const score = Math.min(100, signals.reduce((s, x) => s + (x.triggered ? x.points : 0), 0));
  return {
    chain: 'base',
    payTo: addr,
    score,
    riskLevel: riskLevelFromScore(score),
    signals,
    freshEoa,
    profile: { isContract, nonce: Number.isFinite(nonce) ? nonce : null, balanceEth: Number(balanceEth.toFixed(6)) }
  };
}

async function gradeSolPayTo(payTo) {
  const g = await gradeAddress(payTo, { withAffinity: false });
  const signals = (g.signals || []).map((s) => ({ ...s, scope: 'payTo' }));
  if (g.empty) {
    signals.push(signal('payto_empty', 'PayTo history', 16, true, 'Solana payTo has no measured history'));
  }
  return {
    chain: 'solana',
    payTo,
    empty: !!g.empty,
    score: g.empty ? Math.max(g.score || 0, 16) : g.score,
    riskLevel: g.empty ? 'MEDIUM' : g.riskLevel,
    signals,
    freshEoa: false,
    profile: g.profile || null
  };
}

/** Grade a Base 0x or Solana base58 payTo. */
export async function gradePayTo(payTo, chainHint) {
  const p = String(payTo || '').trim();
  if (!p) return null;
  const hint = String(chainHint || '').toLowerCase();
  if (hint.includes('sol') || (!EVM.test(p) && B58.test(p))) {
    if (!B58.test(p)) return { error: 'invalid_solana', payTo: p };
    return gradeSolPayTo(p);
  }
  if (EVM.test(p) || hint.includes('base') || hint.includes('8453') || hint.includes('eip155')) {
    if (!EVM.test(p)) return { error: 'invalid_evm', payTo: p };
    return gradeEvmPayTo(p);
  }
  if (B58.test(p)) return gradeSolPayTo(p);
  return { error: 'invalid_payto', payTo: p };
}

/**
 * Map a pattern score to a caution band — not insurance, not a verdict.
 * @returns {{ band: string, label: string, hint: string }}
 */
export function cautionBandFromScore(score) {
  const s = Number(score) || 0;
  if (s < 20) {
    return {
      band: 'proceed_with_pins',
      label: 'Low pattern load',
      hint: 'Few triggered patterns — still pin amount/payTo/facilitator and prefer a sealed lockbox before settle.'
    };
  }
  if (s < 50) {
    return {
      band: 'review',
      label: 'Review before settle',
      hint: 'Several patterns fired — re-check offer pins, host, and counterparty before you pay.'
    };
  }
  return {
    band: 'high_caution',
    label: 'High caution',
    hint: 'Elevated pattern load — many agents withhold or require ticket/policy/lockbox before settling. Not a block.'
  };
}

export { EVM, B58, CYRE_HOST };

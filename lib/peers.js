// lib/peers.js — external network referrals (not supported networks).
// Machine-readable routing only. Guardian does not assess or vouch.

/** Solana mainnet CAIP-2 (cloudpayX referral schema). */
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const BASE_MAINNET = 'eip155:8453';

export const SUPPORTED_NETWORKS = [BASE_MAINNET, SOLANA_MAINNET];

export const peers = {
  xrpl: {
    name: 'cloudpayX',
    agentCard: 'https://api.cloudpayxagent.xyz/.well-known/agent-card.json',
    x402: 'https://api.cloudpayxagent.xyz/.well-known/x402',
    openapi: 'https://api.cloudpayxagent.xyz/openapi.json',
    skills: ['xrpl-risk-check', 'xrpl-stablecoin-route', 'xrpl-asset-analysis', 'xrpl-ledger-status']
  }
};

const XRPL_CLASSIC = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const XRPL_XADDR = /^X[1-9A-HJ-NP-Za-km-z]{46}$/;
const XRPL_NETWORKS = new Set(['xrpl', 'xrpl:mainnet', 'xrpl:testnet', 'xrpl:0', 'xrpl:1']);
const XRPL_CURRENCY = new Set(['XRP', 'RLUSD']);
const XRPL_TESTNET = new Set(['xrpl:testnet', 'xrpl:1', 'testnet']);

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function valuesFrom(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    out.push({ key: String(k).toLowerCase(), value: str(v) });
    if (v && typeof v === 'object' && !Array.isArray(v)) valuesFrom(v, out);
  }
}

/** Collect query + body fields from a Vercel/Express-style req. */
export function collectRequestFields(req) {
  const out = [];
  valuesFrom(req && req.query, out);
  valuesFrom(req && req.body, out);
  return out;
}

function fieldsFrom(input) {
  if (input == null) return [];
  if (typeof input === 'string') return [{ key: 'q', value: input.trim() }];
  if (Array.isArray(input)) return input;
  if (input.query || input.body) return collectRequestFields(input);
  const o = [];
  valuesFrom(input, o);
  return o;
}

/**
 * Detect XRPL intent from request fields / free-text.
 * Returns "xrpl" or null. Solana base58 and 0x EVM must not match.
 */
export function detectNetwork(input) {
  if (input == null) return null;

  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    if (XRPL_CLASSIC.test(s) || XRPL_XADDR.test(s)) return 'xrpl';
    const low = s.toLowerCase();
    if (/\bxrpl\b/.test(low) || /\bripple\b/.test(low) || /\brlusd\b/.test(low)) return 'xrpl';
    if (XRPL_CURRENCY.has(s.toUpperCase())) return 'xrpl';
    const m = s.match(/\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/);
    if (m && XRPL_CLASSIC.test(m[0])) return 'xrpl';
    return null;
  }

  const fields = fieldsFrom(input);
  for (const { key, value } of fields) {
    if (!value) continue;
    if (key === 'network' || key === 'chain') {
      if (XRPL_NETWORKS.has(value.toLowerCase())) return 'xrpl';
    }
    if (key === 'currency' || key === 'asset') {
      if (XRPL_CURRENCY.has(value.toUpperCase())) return 'xrpl';
    }
    if (XRPL_CLASSIC.test(value) || XRPL_XADDR.test(value)) return 'xrpl';
  }

  const joined = fields.map((f) => f.value).filter(Boolean).join(' ');
  if (joined && detectNetwork(joined) === 'xrpl') return 'xrpl';
  return null;
}

/** CAIP-2 for the referred XRPL network: xrpl:0 mainnet, xrpl:1 testnet. */
export function requestedXrplNetwork(input) {
  const fields = fieldsFrom(input);
  for (const { key, value } of fields) {
    if (!value) continue;
    if (key === 'network' || key === 'chain') {
      const v = value.toLowerCase();
      if (XRPL_TESTNET.has(v)) return 'xrpl:1';
    }
  }
  const joined = fields.map((f) => f.value).filter(Boolean).join(' ').toLowerCase();
  if (/\bxrpl:1\b/.test(joined) || /\bxrpl:testnet\b/.test(joined) || /\btestnet\b/.test(joined)) {
    return 'xrpl:1';
  }
  return 'xrpl:0';
}

export function recommendedProvider() {
  const p = peers.xrpl;
  return {
    name: p.name,
    relationship: 'external_specialist',
    agent_card_url: p.agentCard
  };
}

/** @deprecated use recommendedProvider — kept name for import clarity in hint. */
export function xrplPeerBlock() {
  return recommendedProvider();
}

/** 400 body for paid routes — cloudpayX referral schema. Never include PAYMENT-REQUIRED. */
export function xrplHandoffBody(input) {
  return {
    status: 'unsupported_network',
    supported_network: [...SUPPORTED_NETWORKS],
    requested_network: requestedXrplNetwork(input),
    recommended_provider: recommendedProvider(),
    pattern_note:
      "Referral only. Guardian did not assess this request and does not vouch for the referred provider's results."
  };
}

export default {
  peers,
  SUPPORTED_NETWORKS,
  detectNetwork,
  requestedXrplNetwork,
  recommendedProvider,
  xrplPeerBlock,
  xrplHandoffBody,
  collectRequestFields
};

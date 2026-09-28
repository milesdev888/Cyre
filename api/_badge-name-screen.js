// api/_badge-name-screen.js — Brand-safety tripwire for badge auto-approve.
// Screens token name + symbol for slurs, scam patterns, and major/brand impersonation.
// Returns { ok: true } or { ok: false, flags: [...], reason }.

/** Offensive / slur starter list (substring match on normalized text). */
export const SLUR_WORDS = Object.freeze([
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'kike',
  'spic',
  'chink',
  'tranny',
  'rape',
  'rapist',
  'pedo',
  'paedo',
  'hitler',
  'nazi',
  'holocaust'
]);

/** Rug / honeypot / fake-airdrop scam language. */
export const SCAM_PATTERNS = Object.freeze([
  'honeypot',
  'honey pot',
  'rugpull',
  'rug pull',
  'rugger',
  'soft rug',
  'hard rug',
  'scam coin',
  'scamtoken',
  'fake airdrop',
  'free airdrop',
  'claim airdrop',
  'airdrop claim',
  'double your',
  '100x guaranteed',
  'guaranteed profit',
  'send eth to',
  'send sol to',
  'drain wallet',
  'phishing'
]);

/**
 * Major / meme tickers and names commonly impersonated.
 * Matched as whole token (symbol) or word boundary-ish on name.
 */
export const MAJOR_IMPERSONATION = Object.freeze([
  'bitcoin',
  'btc',
  'ethereum',
  'ether',
  'eth',
  'solana',
  'sol',
  'usdc',
  'usdt',
  'tether',
  'usd coin',
  'aave',
  'pepe',
  'doge',
  'dogecoin',
  'shiba',
  'shib',
  'bonk',
  'wif',
  'bnb',
  'binance',
  'xrp',
  'ripple',
  'ada',
  'cardano',
  'avax',
  'avalanche',
  'matic',
  'polygon',
  'link',
  'chainlink',
  'uni',
  'uniswap',
  'trump',
  'official trump'
]);

/** Guardian / Cyre / C7 brand terms — flag when used in token name/symbol (not payment mint). */
export const BRAND_IMPERSONATION = Object.freeze([
  'guardian',
  'guardian verified',
  'cyre',
  'c7'
]);

function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-./\\|]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact form for slur substring checks (no spaces). */
function compact(raw) {
  return normalize(raw).replace(/\s+/g, '');
}

/**
 * True if `needle` appears as a whole word / ticker in haystack, or exact symbol match.
 * @param {string} hayNorm normalized name or symbol
 * @param {string} needle
 * @param {{ exactSymbol?: boolean }} [opts]
 */
function matchesTerm(hayNorm, needle, opts = {}) {
  const n = normalize(needle);
  if (!n || !hayNorm) return false;
  if (opts.exactSymbol) {
    return hayNorm === n || hayNorm === compact(n);
  }
  if (hayNorm === n) return true;
  // Word-boundary-ish: spaces around, or start/end
  const re = new RegExp(`(?:^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
  return re.test(hayNorm);
}

/**
 * Screen token name + symbol before auto-issue.
 * @param {{ name?: string|null, symbol?: string|null }} input
 * @returns {{ ok: true } | { ok: false, flags: string[], reason: string }}
 */
export function screenBadgeName(input = {}) {
  const name = String(input.name || '');
  const symbol = String(input.symbol || '');
  const nameN = normalize(name);
  const symbolN = normalize(symbol);
  const nameC = compact(name);
  const symbolC = compact(symbol);
  /** @type {string[]} */
  const flags = [];

  for (const w of SLUR_WORDS) {
    const c = compact(w);
    if ((nameC && nameC.includes(c)) || (symbolC && symbolC.includes(c))) {
      flags.push(`slur:${w}`);
    }
  }

  for (const p of SCAM_PATTERNS) {
    const pn = normalize(p);
    const pc = compact(p);
    if (
      (nameN && (nameN.includes(pn) || nameC.includes(pc))) ||
      (symbolN && (symbolN.includes(pn) || symbolC.includes(pc)))
    ) {
      flags.push(`scam:${p}`);
    }
  }

  for (const m of MAJOR_IMPERSONATION) {
    if (matchesTerm(symbolN, m, { exactSymbol: true }) || matchesTerm(nameN, m)) {
      flags.push(`impersonation:major:${m}`);
    }
  }

  for (const b of BRAND_IMPERSONATION) {
    // Exact C7 mint payments are fine — this screens *token names/symbols* only.
    // "c7" as symbol or name word is brand impersonation of Guardian's token.
    if (matchesTerm(symbolN, b, { exactSymbol: true }) || matchesTerm(nameN, b)) {
      flags.push(`impersonation:brand:${b}`);
    }
  }

  // Dedupe while preserving order
  const seen = new Set();
  const uniq = [];
  for (const f of flags) {
    if (seen.has(f)) continue;
    seen.add(f);
    uniq.push(f);
  }

  if (uniq.length) {
    return {
      ok: false,
      flags: uniq,
      reason: `name-screen flagged: ${uniq.slice(0, 5).join(', ')}${uniq.length > 5 ? '…' : ''}`
    };
  }
  return { ok: true };
}

export default screenBadgeName;

// api/_route-catalog.js — single source of truth for monitor grid + feed route rows.
// Prices are 6-decimal USDC atomic defaults (same knobs as per-route X402_PRICE_* env vars).

/** @typedef {'identity'|'policy'|'settlement'|'circuit'|'exchange'|'stream'|'discovery'|'verify'} RouteFamily */

/**
 * @typedef {object} CatalogRoute
 * @property {string} path
 * @property {RouteFamily} family
 * @property {boolean} paid
 * @property {string} [priceAtomic]
 * @property {string} [priceEnv]
 * @property {boolean} [bazaarExt]
 */

/** @type {CatalogRoute[]} */
export const ROUTE_CATALOG = [
  // identity
  { path: '/api/address', family: 'identity', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE', bazaarExt: true },
  { path: '/api/token', family: 'identity', paid: true, priceAtomic: '10000', priceEnv: 'X402_PRICE_TOKEN', bazaarExt: true },
  { path: '/api/passport', family: 'identity', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE_PASSPORT', bazaarExt: true },
  { path: '/api/lookalike', family: 'identity', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_LOOKALIKE', bazaarExt: true },
  { path: '/api/mintalike', family: 'identity', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_MINTALIKE', bazaarExt: true },
  { path: '/api/delta', family: 'identity', paid: true, priceAtomic: '10000', priceEnv: 'X402_PRICE_DELTA', bazaarExt: true },
  { path: '/api/oracle', family: 'identity', paid: true, priceAtomic: '10000', priceEnv: 'X402_PRICE_ORACLE', bazaarExt: true },
  { path: '/api/program', family: 'identity', paid: true, priceAtomic: '10000', priceEnv: 'X402_PRICE_PROGRAM', bazaarExt: true },

  // policy
  { path: '/api/policy', family: 'policy', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_POLICY', bazaarExt: true },
  { path: '/api/policy/check', family: 'policy', paid: true, priceAtomic: '1000', priceEnv: 'X402_PRICE_POLICY_CHECK', bazaarExt: true },
  { path: '/api/intent', family: 'policy', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_INTENT', bazaarExt: true },
  { path: '/api/offer', family: 'policy', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_OFFER', bazaarExt: true },
  { path: '/api/pack', family: 'policy', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE_PACK', bazaarExt: true },
  { path: '/api/route', family: 'policy', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_ROUTE', bazaarExt: true },
  { path: '/api/host', family: 'policy', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_HOST', bazaarExt: true },

  // settlement
  { path: '/api/escrow', family: 'settlement', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE_ESCROW', bazaarExt: true },
  { path: '/api/lockbox', family: 'settlement', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_LOCKBOX', bazaarExt: true },
  { path: '/api/lockbox/match', family: 'settlement', paid: true, priceAtomic: '1000', priceEnv: 'X402_PRICE_LOCKBOX_MATCH', bazaarExt: true },
  { path: '/api/caution', family: 'settlement', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_CAUTION', bazaarExt: true },
  { path: '/api/ticket', family: 'settlement', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_TICKET', bazaarExt: true },
  { path: '/api/receipt', family: 'settlement', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE_RECEIPT', bazaarExt: true },
  { path: '/api/cron-receipt', family: 'settlement', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_CRON', bazaarExt: true },

  // circuit
  { path: '/api/circuit/seal', family: 'circuit', paid: true, priceAtomic: '3000', priceEnv: 'X402_PRICE_CIRCUIT_SEAL', bazaarExt: true },
  { path: '/api/circuit/heartbeat', family: 'circuit', paid: true, priceAtomic: '1000', priceEnv: 'X402_PRICE_CIRCUIT_HEARTBEAT', bazaarExt: true },
  { path: '/api/circuit/check', family: 'circuit', paid: true, priceAtomic: '1000', priceEnv: 'X402_PRICE_CIRCUIT_CHECK', bazaarExt: true },

  // exchange
  { path: '/api/exchange/post', family: 'exchange', paid: true, priceAtomic: '3000', priceEnv: 'X402_PRICE_EXCHANGE_POST', bazaarExt: true },
  { path: '/api/exchange/match', family: 'exchange', paid: true, priceAtomic: '2000', priceEnv: 'X402_PRICE_EXCHANGE_MATCH', bazaarExt: true },
  { path: '/api/exchange/feed', family: 'exchange', paid: false, bazaarExt: false },

  // stream
  { path: '/api/stream/subscribe', family: 'stream', paid: true, priceAtomic: '3000', priceEnv: 'X402_PRICE_STREAM_SUBSCRIBE', bazaarExt: true },
  { path: '/api/stream/events', family: 'stream', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE_STREAM_EVENTS', bazaarExt: true },

  // discovery
  { path: '/api/bazaar', family: 'discovery', paid: true, priceAtomic: '3000', priceEnv: 'X402_PRICE_BAZAAR', bazaarExt: true },
  { path: '/api/batch', family: 'discovery', paid: true, priceAtomic: '20000', priceEnv: 'X402_PRICE_BATCH', bazaarExt: true },
  { path: '/api/gate', family: 'discovery', paid: true, priceAtomic: '1000', priceEnv: 'X402_PRICE_GATE', bazaarExt: true },
  { path: '/api/handshake', family: 'discovery', paid: true, priceAtomic: '10000', priceEnv: 'X402_PRICE_HANDSHAKE', bazaarExt: true },
  { path: '/api/hint', family: 'discovery', paid: false, bazaarExt: false },
  { path: '/api/supply', family: 'discovery', paid: false, bazaarExt: false },
  { path: '/api/supply/circulating', family: 'discovery', paid: false, bazaarExt: false },
  { path: '/api/preflight', family: 'discovery', paid: true, priceAtomic: '10000', priceEnv: 'X402_PRICE_PREFLIGHT', bazaarExt: true },
  { path: '/api/alerts', family: 'discovery', paid: true, priceAtomic: '15000', priceEnv: 'X402_PRICE_ALERTS', bazaarExt: true },
  { path: '/api/pulse', family: 'discovery', paid: true, priceAtomic: '5000', priceEnv: 'X402_PRICE_PULSE', bazaarExt: true },

  // verify (free)
  { path: '/api/passport/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/receipt/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/policy/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/intent/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/lockbox/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/stream/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/exchange/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/circuit/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/cron-receipt/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/badge/verify', family: 'verify', paid: false, bazaarExt: false },
  { path: '/api/badge/register', family: 'identity', paid: false, bazaarExt: false }
];

export const FAMILY_ORDER = [
  'identity',
  'policy',
  'settlement',
  'circuit',
  'exchange',
  'stream',
  'discovery',
  'verify'
];

export const FAMILY_LABELS = {
  identity: 'Identity',
  policy: 'Policy',
  settlement: 'Settlement',
  circuit: 'Circuit',
  exchange: 'Exchange',
  stream: 'Stream',
  discovery: 'Discovery',
  verify: 'Verify'
};

const BY_PATH = new Map(ROUTE_CATALOG.map((r) => [r.path, r]));

export function catalogRoute(path) {
  return BY_PATH.get(path) || null;
}

export function catalogPriceAtomic(route) {
  if (!route || !route.paid) return null;
  if (route.priceEnv && process.env[route.priceEnv]) {
    return String(process.env[route.priceEnv]);
  }
  return route.priceAtomic || null;
}

export function shortRouteLabel(path) {
  return path.replace(/^\/api\//, '').replace(/\//g, ' · ');
}

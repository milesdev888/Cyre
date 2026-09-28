// api/_offerparse.js — parse x402 PAYMENT-REQUIRED / accepts blobs (pure).

import { signal } from './_grade.js';

const KNOWN_FACILITATORS = [
  'api.cdp.coinbase.com',
  'x402.org',
  'www.x402.org',
  'cyre-fraud-prediction.onrender.com'
];
const CYRE_HOST = /(^|\.)cyre\.dev$/i;
const GUARDIAN_BASE = '0x9ff25c4acf1dcdDf15fd2702c127a285f1dfa712'.toLowerCase();

export function decodePaymentRequired(raw) {
  if (!raw) return { error: 'empty' };
  let obj = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    try {
      if (/^[A-Za-z0-9+/=_-]+$/.test(s) && s.length > 20) {
        obj = JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      } else {
        obj = JSON.parse(s);
      }
    } catch (e) {
      return { error: 'not_json_or_base64' };
    }
  }
  if (!obj || typeof obj !== 'object') return { error: 'invalid' };
  return { body: obj };
}

export function analyzeOffer(body, opts = {}) {
  const signals = [];
  const accepts = Array.isArray(body.accepts) ? body.accepts : [];
  const resource = body.resource || {};
  const resourceUrl = opts.resourceUrl || resource.url || null;
  const facilitator = opts.facilitator || null;
  const intendedAmount = opts.amount != null ? String(opts.amount) : null;
  const intendedPayTo = opts.payTo || null;
  const intendedNetwork = opts.network || null;

  if (!accepts.length) {
    signals.push(signal('no_accepts', 'Accepts', 30, true, '402 body has no accepts[] offers'));
  } else {
    signals.push(signal('has_accepts', 'Accepts', 0, false, `${accepts.length} offer(s) in accepts[]`));
  }

  const networks = [...new Set(accepts.map((a) => a && a.network).filter(Boolean))];
  if (networks.length > 3) {
    signals.push(signal('many_networks', 'Networks', 8, true, `Unusually many networks in one offer: ${networks.join(', ')}`));
  }

  const amounts = accepts.map((a) => (a && a.amount != null ? String(a.amount) : null)).filter(Boolean);
  const uniqueAmounts = [...new Set(amounts)];
  if (uniqueAmounts.length > 1) {
    signals.push(signal('amount_spread', 'Amount', 10, true, `accepts[] lists differing amounts: ${uniqueAmounts.join(', ')}`));
  }

  if (intendedAmount) {
    const match = accepts.some((a) => a && String(a.amount) === intendedAmount);
    if (!match) {
      signals.push(signal('amount_not_listed', 'Offer pin', 28, true, `Intended amount ${intendedAmount} not present in accepts[]`));
    } else {
      signals.push(signal('amount_listed', 'Offer pin', 0, false, 'Intended amount appears in accepts[]'));
    }
  }

  if (intendedPayTo) {
    const norm = (x) => String(x || '').startsWith('0x') ? String(x).toLowerCase() : String(x || '');
    const match = accepts.some((a) => a && norm(a.payTo) === norm(intendedPayTo));
    if (!match) {
      signals.push(signal('payto_not_listed', 'Offer pin', 28, true, 'Intended payTo not present in accepts[]'));
    } else {
      signals.push(signal('payto_listed', 'Offer pin', 0, false, 'Intended payTo appears in accepts[]'));
    }
  }

  if (intendedNetwork) {
    const match = accepts.some((a) => a && a.network === intendedNetwork);
    if (!match) {
      signals.push(signal('network_not_listed', 'Offer pin', 18, true, `Intended network ${intendedNetwork} not in accepts[]`));
    }
  }

  for (const a of accepts.slice(0, 8)) {
    if (!a) continue;
    if (a.payTo && String(a.payTo).toLowerCase() === GUARDIAN_BASE && resourceUrl) {
      try {
        const host = new URL(resourceUrl).hostname;
        if (!CYRE_HOST.test(host)) {
          signals.push(
            signal(
              'payto_recycle',
              'PayTo recycle',
              24,
              true,
              'Offer payTo matches Guardian Base treasury but resource is not cyre.dev'
            )
          );
        }
      } catch (e) {
        /* ignore */
      }
    }
    if (a.amount === '0' || a.amount === 0) {
      signals.push(signal('zero_offer', 'Amount', 12, true, 'An accept lists amount 0'));
    }
  }

  if (resourceUrl) {
    try {
      const u = new URL(resourceUrl);
      if (u.protocol !== 'https:') {
        signals.push(signal('url_http', 'Resource URL', 16, true, 'resourceUrl is not https'));
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) {
        signals.push(signal('url_ip', 'Resource URL', 18, true, 'resourceUrl host is a raw IP'));
      }
    } catch (e) {
      signals.push(signal('url_bad', 'Resource URL', 20, true, 'resourceUrl is not a valid URL'));
    }
  }

  if (facilitator) {
    try {
      const u = new URL(facilitator);
      const host = u.hostname.toLowerCase();
      if (u.protocol !== 'https:') {
        signals.push(signal('facilitator_http', 'Facilitator', 20, true, 'facilitator is not https'));
      }
      if (KNOWN_FACILITATORS.some((k) => host === k || host.endsWith('.' + k))) {
        signals.push(signal('facilitator_known', 'Facilitator', 0, false, `Known facilitator ${host}`));
      } else {
        signals.push(signal('facilitator_unknown', 'Facilitator', 10, true, `Unknown facilitator host ${host}`));
      }
    } catch (e) {
      signals.push(signal('facilitator_bad', 'Facilitator', 22, true, 'facilitator is not a valid URL'));
    }
  }

  if (body.x402Version != null && Number(body.x402Version) !== 2) {
    signals.push(signal('version_odd', 'x402Version', 8, true, `x402Version ${body.x402Version} (expected 2)`));
  }

  const score = Math.min(
    100,
    signals.reduce((s, x) => s + (x.triggered ? x.points || 0 : 0), 0)
  );
  return { signals, score, accepts, networks, resourceUrl, acceptsCount: accepts.length };
}

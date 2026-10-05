// api/paid-routes-402.test.js — bare probe of every paid ROUTE_CATALOG path → 402 + bazaar + Base/Solana
// Run: npm run test:paid-402
// Env is set in-process before any route import (X402_ENABLED is captured at _x402 load).

import assert from 'node:assert/strict';
import { ROUTE_CATALOG } from './_route-catalog.js';

for (const k of Object.keys(process.env)) {
  if (k.startsWith('X402_') || k.startsWith('B402_') || k.startsWith('CDP_')) delete process.env[k];
}

process.env.X402_ENABLED = 'true';
process.env.X402_NETWORK = 'mainnet';
process.env.X402_NETWORK_BASE = 'mainnet';
process.env.X402_PAY_TO = 'SoLPayTo1111111111111111111111111111111111';
process.env.X402_PAY_TO_BASE = '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712';
process.env.X402_SOLANA_FEE_PAYER = 'FeePayer111111111111111111111111111111111';
process.env.X402_INTERNAL_KEY = 'gk-test-paid-402';
// Avoid live facilitator /supported for Solana (fee payer comes from env).
process.env.X402_FACILITATOR = 'https://fac.example.invalid/x402';

function modPathFor(apiPath) {
  const rest = apiPath.replace(/^\/api\//, '');
  return './' + rest.replace(/\//g, '-') + '.js';
}

function mockRes() {
  const out = { statusCode: 0, body: null, headers: Object.create(null) };
  const res = {
    setHeader(k, v) {
      out.headers[String(k).toLowerCase()] = v;
      return this;
    },
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      if (!out.statusCode) out.statusCode = 200;
      return this;
    },
    end() {
      if (!out.statusCode) out.statusCode = 204;
      return this;
    }
  };
  return { res, out };
}

function bareReq() {
  return {
    method: 'GET',
    query: {},
    headers: {
      host: 'cyre.dev',
      'x-forwarded-proto': 'https',
      'user-agent': 'paid-routes-402-test'
    }
  };
}

const paid = ROUTE_CATALOG.filter((r) => r.paid);
assert.equal(paid.length, 36, 'expected 36 paid routes in catalog');

let failures = 0;
for (const route of paid) {
  const modPath = modPathFor(route.path);
  let handler;
  try {
    const mod = await import(modPath + '?t=paid402-' + encodeURIComponent(route.path));
    handler = mod.default;
  } catch (e) {
    console.error('FAIL import', route.path, modPath, e && e.message);
    failures++;
    continue;
  }
  const { res, out } = mockRes();
  try {
    await handler(bareReq(), res);
  } catch (e) {
    console.error('FAIL throw', route.path, e && e.message);
    failures++;
    continue;
  }

  const ok402 = out.statusCode === 402;
  const body = out.body || {};
  const accepts = Array.isArray(body.accepts) ? body.accepts : [];
  const nets = new Set(accepts.map((a) => a && a.network).filter(Boolean));
  const hasBase = nets.has('eip155:8453');
  const hasSol = [...nets].some((n) => String(n).startsWith('solana:'));
  const bazaar = body.extensions && body.extensions.bazaar;
  const hasBazaar = !!(bazaar && bazaar.info && bazaar.schema);
  const hasPrHeader = !!out.headers['payment-required'];
  const amountOk =
    !route.priceAtomic ||
    accepts.some((a) => String(a.amount) === String(route.priceAtomic)) ||
    // BSC 18-dec conversion would differ; Base/Solana stay 6-dec
    accepts.filter((a) => a.network === 'eip155:8453' || String(a.network).startsWith('solana:')).every((a) => String(a.amount) === String(route.priceAtomic));

  if (!ok402 || !hasBase || !hasSol || !hasBazaar || !hasPrHeader || !amountOk) {
    console.error('FAIL', route.path, {
      status: out.statusCode,
      hasBase,
      hasSol,
      hasBazaar,
      hasPrHeader,
      amountOk,
      nets: [...nets],
      amounts: accepts.map((a) => [a.network, a.amount])
    });
    failures++;
  } else {
    console.log('ok', route.path, '402 bazaar base+sol amount', route.priceAtomic);
  }
}

// Free bypass: site origin
{
  const mod = await import('./oracle.js?t=bypass-origin');
  const { res, out } = mockRes();
  // Avoid hermes network in this check — if free, handler may call hermes; stub fetch for speed
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => '', json: async () => ({}) });
  try {
    await mod.default(
      {
        method: 'GET',
        query: {},
        headers: {
          host: 'cyre.dev',
          origin: 'https://cyre.dev',
          'x-forwarded-proto': 'https'
        }
      },
      res
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.notEqual(out.statusCode, 402, 'site origin must bypass 402');
  console.log('ok /api/oracle site-origin bypass status', out.statusCode);
}

// Free bypass: x-guardian-key
{
  const mod = await import('./oracle.js?t=bypass-key');
  const { res, out } = mockRes();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => '', json: async () => ({}) });
  try {
    await mod.default(
      {
        method: 'GET',
        query: {},
        headers: {
          host: 'cyre.dev',
          'x-forwarded-proto': 'https',
          'x-guardian-key': 'gk-test-paid-402'
        }
      },
      res
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.notEqual(out.statusCode, 402, 'x-guardian-key must bypass 402');
  console.log('ok /api/oracle x-guardian-key bypass status', out.statusCode);
}

if (failures) {
  console.error('\nFAILED', failures, 'route(s)');
  process.exit(1);
}
console.log('\nAll', paid.length, 'paid routes return 402 + bazaar + Base/Solana on bare probe.');

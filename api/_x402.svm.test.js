// api/_x402.svm.test.js — Solana (SVM) lane: feePayer resolution + production devnet guard.
// Run: node api/_x402.svm.test.js

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const SOL_MAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOL_DEV = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const FEE_PAYER = 'CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5';
const realFetch = globalThis.fetch;

// api/_x402.js signs CDP JWTs with require('crypto') (provided by Vercel's bundle);
// give plain-Node ESM the same.
import { createRequire } from 'node:module';
globalThis.require = globalThis.require || createRequire(import.meta.url);

function resetEnv(extra = {}) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('X402_') || k.startsWith('B402_') || k.startsWith('CDP_') || k === 'VERCEL_ENV') delete process.env[k];
  }
  Object.assign(process.env, extra);
}

async function loadFresh() {
  return import('./_x402.js?t=svm' + Date.now() + Math.random());
}

function mockSupported(kinds, seen) {
  globalThis.fetch = async (url, init) => {
    if (seen) seen.push({ url: String(url), method: (init && init.method) || 'GET', headers: (init && init.headers) || {} });
    if (String(url).endsWith('/supported')) {
      return new Response(JSON.stringify({ kinds }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
}

async function run() {
  // --- pickSvmFeePayer matches network + scheme ---
  {
    resetEnv();
    const mod = await loadFresh();
    const data = { kinds: [
      { scheme: 'exact', network: SOL_DEV, extra: { feePayer: 'devPayer' } },
      { scheme: 'exact', network: SOL_MAIN, extra: { feePayer: FEE_PAYER } },
    ] };
    assert(mod.pickSvmFeePayer(data, SOL_MAIN) === FEE_PAYER, 'mainnet payer');
    assert(mod.pickSvmFeePayer(data, SOL_DEV) === 'devPayer', 'devnet payer');
    assert(mod.pickSvmFeePayer({ kinds: [] }, SOL_MAIN) === null, 'none');
    console.log('ok pickSvmFeePayer');
  }

  // --- Solana accept carries extra.feePayer from /supported ---
  {
    resetEnv({ X402_NETWORK: 'mainnet', X402_PAY_TO: 'SoLPayTo1111111111111111111111111111111111', X402_FACILITATOR: 'https://fac.example/x402' });
    const mod = await loadFresh();
    mod.clearSvmExtraCache();
    const seen = [];
    mockSupported([{ scheme: 'exact', network: SOL_MAIN, extra: { feePayer: FEE_PAYER } }], seen);
    const rows = await mod.buildOfferRows(mod.armedLanes(), '5000');
    const sol = rows.find((r) => r.lane.name === 'solana');
    assert(sol, 'solana row present');
    assert(sol.requirements.network === SOL_MAIN, 'mainnet network');
    assert(sol.requirements.extra.feePayer === FEE_PAYER, 'feePayer set: ' + JSON.stringify(sol.requirements.extra));
    assert(seen.some((s) => s.url === 'https://fac.example/x402/supported' && s.method === 'GET'), 'GET /supported');
    console.log('ok solana accept has feePayer');
  }

  // --- no feePayer available → Solana omitted, Base still offered ---
  {
    resetEnv({ X402_NETWORK: 'mainnet', X402_PAY_TO: 'SoLPayTo1111111111111111111111111111111111',
      X402_PAY_TO_BASE: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712', X402_FACILITATOR: 'https://fac.example/x402' });
    const mod = await loadFresh();
    mod.clearSvmExtraCache();
    globalThis.fetch = async () => { throw new Error('facilitator down'); };
    const rows = await mod.buildOfferRows(mod.armedLanes(), '5000');
    assert(!rows.some((r) => r.lane.name === 'solana'), 'solana omitted');
    assert(rows.some((r) => r.lane.name === 'base'), 'base kept');
    console.log('ok solana omitted when feePayer unknown');
  }

  // --- env fallback X402_SOLANA_FEE_PAYER ---
  {
    resetEnv({ X402_NETWORK: 'mainnet', X402_PAY_TO: 'SoLPayTo1111111111111111111111111111111111',
      X402_FACILITATOR: 'https://fac.example/x402', X402_SOLANA_FEE_PAYER: FEE_PAYER });
    const mod = await loadFresh();
    mod.clearSvmExtraCache();
    globalThis.fetch = async () => { throw new Error('facilitator down'); };
    const rows = await mod.buildOfferRows(mod.armedLanes(), '5000');
    const sol = rows.find((r) => r.lane.name === 'solana');
    assert(sol && sol.requirements.extra.feePayer === FEE_PAYER, 'env fallback');
    console.log('ok env fallback feePayer');
  }

  // --- CDP facilitator: default for Solana mainnet, GET-scoped JWT on /supported ---
  {
    const crypto = await import('node:crypto');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const d = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
    const x = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
    resetEnv({ X402_NETWORK: 'mainnet', X402_PAY_TO: 'SoLPayTo1111111111111111111111111111111111',
      CDP_API_KEY_ID: 'kid-test', CDP_API_KEY_SECRET: Buffer.concat([d, x]).toString('base64') });
    const mod = await loadFresh();
    mod.clearSvmExtraCache();
    const lane = mod.armedLanes().find((l) => l.name === 'solana');
    assert(lane.facilitator === 'https://api.cdp.coinbase.com/platform/v2/x402', 'cdp default: ' + lane.facilitator);
    const seen = [];
    mockSupported([{ scheme: 'exact', network: SOL_MAIN, extra: { feePayer: FEE_PAYER } }], seen);
    const extra = await mod.resolveSvmExtra(lane);
    assert(extra.feePayer === FEE_PAYER, 'cdp feePayer');
    const call = seen.find((s) => s.url.endsWith('/supported'));
    assert(call && call.method === 'GET' && /^Bearer /.test(call.headers.authorization || ''), 'jwt on GET');
    const payload = JSON.parse(Buffer.from(call.headers.authorization.split('.')[1], 'base64url').toString());
    assert(payload.uris[0] === 'GET api.cdp.coinbase.com/platform/v2/x402/supported', 'jwt uri: ' + payload.uris[0]);
    console.log('ok cdp default + GET jwt');
  }

  // --- production never offers devnet Solana ---
  {
    resetEnv({ VERCEL_ENV: 'production', X402_PAY_TO: 'SoLPayTo1111111111111111111111111111111111',
      X402_PAY_TO_BASE: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712' });
    let mod = await loadFresh();
    assert(!mod.listArmedLaneNames().includes('solana'), 'devnet solana hidden in prod');
    assert(mod.listArmedLaneNames().includes('base'), 'base in prod');
    resetEnv({ VERCEL_ENV: 'preview', X402_PAY_TO: 'SoLPayTo1111111111111111111111111111111111' });
    mod = await loadFresh();
    assert(mod.listArmedLaneNames().includes('solana'), 'devnet solana ok on preview');
    console.log('ok production devnet guard');
  }

  globalThis.fetch = realFetch;
  console.log('\nAll SVM lane tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

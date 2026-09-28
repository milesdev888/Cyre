// api/_x402.bsc.test.js — unit tests for dormant B402 / BSC lane (via Render relay)
// Run: node -e "import('./api/_x402.bsc.test.js')"

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const saved = { ...process.env };

function resetEnv(extra = {}) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('X402_') || k.startsWith('B402_') || k.startsWith('CDP_')) delete process.env[k];
  }
  Object.assign(process.env, extra);
}

async function loadFresh() {
  const id = 'x402bsc' + Date.now() + Math.random();
  return import('./_x402.js?t=' + id);
}

async function run() {
  // --- amount conversion ---
  {
    const mod = await loadFresh();
    assert(mod.sixDecimalToLaneAtomic('5000', 6) === '5000', '6dec identity');
    assert(mod.sixDecimalToLaneAtomic('5000', 18) === '5000000000000000', '$0.005 → 18dec');
    assert(mod.sixDecimalToLaneAtomic('10000', 18) === '10000000000000000', '$0.01 → 18dec');
    console.log('ok amount conversion');
  }

  // --- envelope unwrap ---
  {
    const mod = await loadFresh();
    const inner = { isValid: true, x: 1 };
    assert(mod.unwrapFacilitatorData({ code: '000000', data: inner }) === inner, 'unwrap isValid');
    assert(mod.unwrapFacilitatorData({ code: '000000', data: { success: true } }).success === true, 'unwrap success');
    assert(mod.unwrapFacilitatorData({ isValid: true }).isValid === true, 'passthrough');
    console.log('ok envelope unwrap');
  }

  // --- BSC absent when env unset ---
  {
    resetEnv({ X402_PAY_TO_BASE: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712' });
    const mod = await loadFresh();
    mod.clearBscExtraCache();
    const names = mod.listArmedLaneNames();
    assert(!names.includes('bsc'), 'bsc should be absent: ' + names.join(','));
    assert(names.includes('base'), 'base present');
    console.log('ok bsc absent when unset');
  }

  // --- relay unreachable → BSC accept omitted; Base untouched ---
  {
    resetEnv({
      X402_ENABLED: 'true',
      X402_PAY_TO_BASE: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
      X402_PAY_TO_BSC: '0x1111111111111111111111111111111111111111',
      X402_FACILITATOR_BSC: 'https://b402-relay.example.invalid/internal/b402',
      X402_INTERNAL_KEY: 'gk-test'
      // no B402_SIGNER / SPENDER fallback
    });
    const mod = await loadFresh();
    mod.clearBscExtraCache();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('relay down');
    };
    try {
      const lanes = mod.armedLanes();
      assert(lanes.some((l) => l.name === 'bsc'), 'bsc armed by payTo');
      const rows = await mod.buildOfferRows(lanes, '5000');
      assert(!rows.some((r) => r.lane.name === 'bsc'), 'bsc omitted from offer');
      assert(rows.some((r) => r.lane.name === 'base'), 'base still offered');
      console.log('ok relay unreachable omits bsc accept');
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // --- BSC present with /supported via relay ---
  {
    resetEnv({
      X402_PAY_TO_BASE: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
      X402_PAY_TO_BSC: '0x1111111111111111111111111111111111111111',
      X402_FACILITATOR_BSC: 'https://b402-relay.example.invalid/internal/b402',
      X402_ASSET_BSC: 'USDT',
      X402_INTERNAL_KEY: 'gk-test'
    });
    const mod = await loadFresh();
    mod.clearBscExtraCache();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      assert(String(url).endsWith('/supported'), 'supported path');
      assert(init.headers['x-guardian-key'] === 'gk-test', 'relay auth header');
      assert(!init.headers['X-Tesla-ClientId'] && !init.headers['x-tesla-clientid'], 'no Tesla on Vercel');
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            code: '000000',
            data: {
              kinds: [{
                network: 'eip155:56',
                asset: '0x55d398326f99059fF775485246999027B3197955',
                scheme: 'exact',
                extra: {
                  name: 'Tether USD',
                  version: '1',
                  assetTransferMethod: 'permit2-exact',
                  signerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  spenderAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
                }
              }]
            }
          });
        }
      };
    };
    try {
      const lane = mod.armedLanes().find((l) => l.name === 'bsc');
      const rows = await mod.buildOfferRows([lane], '5000');
      assert(rows.length === 1, 'bsc offered');
      const req = rows[0].requirements;
      assert(req.network === 'eip155:56', 'network mainnet');
      assert(req.asset.toLowerCase() === '0x55d398326f99059ff775485246999027b3197955', 'USDT asset');
      assert(req.amount === '5000000000000000', '18dec amount');
      assert(req.scheme === 'exact', 'scheme exact');
      assert(req.extra.assetTransferMethod === 'permit2-exact', 'permit2-exact');
      assert(req.extra.signerAddress.startsWith('0xaa'), 'signer from supported');
      console.log('ok bsc present via /supported');
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // --- offer_mismatch: wrong asset / wrong payTo ---
  {
    resetEnv({
      X402_PAY_TO_BSC: '0x1111111111111111111111111111111111111111',
      X402_FACILITATOR_BSC: 'https://b402-relay.example.invalid/internal/b402',
      B402_SIGNER_ADDRESS: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      B402_SPENDER_ADDRESS: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    });
    const mod = await loadFresh();
    mod.clearBscExtraCache();
    const lane = mod.armedLanes().find((l) => l.name === 'bsc');
    const expected = mod.laneRequirements(lane, '5000');
    expected.extra = {
      name: 'Tether USD',
      version: '1',
      assetTransferMethod: 'permit2-exact',
      signerAddress: process.env.B402_SIGNER_ADDRESS,
      spenderAddress: process.env.B402_SPENDER_ADDRESS
    };
    assert(
      !mod.offerMatches(
        { ...expected, asset: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
        expected
      ),
      'wrong asset rejected'
    );
    assert(
      !mod.offerMatches(
        { ...expected, payTo: '0x2222222222222222222222222222222222222222' },
        expected
      ),
      'wrong payTo rejected'
    );
    assert(mod.offerMatches(expected, expected), 'exact match ok');
    console.log('ok offer pin rejects wrong asset/payTo');
  }

  // --- settle path mocked (verify + settle) via relay; async poll ---
  {
    resetEnv({
      X402_ENABLED: 'true',
      X402_PAY_TO_BSC: '0x1111111111111111111111111111111111111111',
      X402_FACILITATOR_BSC: 'https://b402-relay.example.invalid/internal/b402',
      X402_INTERNAL_KEY: 'gk-test',
      B402_SIGNER_ADDRESS: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      B402_SPENDER_ADDRESS: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    });
    const mod = await loadFresh();
    mod.clearBscExtraCache();

    const calls = [];
    let settleN = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      calls.push({ url: u, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
      assert(init.headers['x-guardian-key'] === 'gk-test', 'relay key');
      if (u.includes('/supported')) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              code: '000000',
              data: {
                kinds: [{
                  network: 'eip155:56',
                  asset: '0x55d398326f99059fF775485246999027B3197955',
                  scheme: 'exact',
                  extra: {
                    name: 'Tether USD',
                    version: '1',
                    assetTransferMethod: 'permit2-exact',
                    signerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    spenderAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
                  }
                }]
              }
            });
          }
        };
      }
      if (u.endsWith('/verify')) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ code: '000000', data: { isValid: true } });
          }
        };
      }
      if (u.endsWith('/settle')) {
        settleN += 1;
        if (settleN === 1) {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({
                code: '000000',
                data: { success: false, transaction: '0xpending', network: 'eip155:56' }
              });
            }
          };
        }
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              code: '000000',
              data: {
                success: true,
                transaction: '0xabc',
                payer: '0xpayer',
                network: 'eip155:56',
                amount: '5000000000000000'
              }
            });
          }
        };
      }
      throw new Error('unexpected url ' + u);
    };

    try {
      const lane = mod.armedLanes().find((l) => l.name === 'bsc');
      const rows = await mod.buildOfferRows([lane], '5000');
      const expected = rows[0].requirements;

      const gate = mod.createX402Gate({
        price: '5000',
        resourcePath: '/api/address',
        description: 'test',
        discovery: { bazaar: { info: { input: { type: 'http', method: 'GET' } } } },
        isFree: () => false
      });
      const payment = {
        x402Version: 2,
        accepted: expected,
        payload: { signature: '0x00' }
      };
      const header = Buffer.from(JSON.stringify(payment)).toString('base64');
      const result = await gate({
        headers: {
          host: 'cyre.dev',
          'x-forwarded-proto': 'https',
          'payment-signature': header
        }
      });
      assert(result && result.settled && result.settled.success === true, 'settle success after poll');
      assert(settleN === 2, 'polled settle twice');
      const settleCalls = calls.filter((c) => c.url.endsWith('/settle'));
      assert(settleCalls.length === 2, 'two settle posts');
      assert(
        settleCalls[1].body.paymentPayload.extensions &&
          settleCalls[1].body.paymentPayload.extensions.bazaar,
        'bazaar echoed on settle'
      );
      console.log('ok mocked verify+settle poll with bazaar echo');
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  console.log('\nAll B402/BSC lane tests passed.');
}

run()
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  })
  .finally(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
  });

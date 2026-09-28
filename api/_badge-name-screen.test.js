// api/_badge-name-screen.test.js — unit tests for auto-approve tripwire
import assert from 'node:assert/strict';
import { screenBadgeName } from './_badge-name-screen.js';

// Clean names
assert.deepEqual(screenBadgeName({ name: 'Orbit Labs', symbol: 'ORBIT' }), { ok: true });
assert.deepEqual(screenBadgeName({ name: 'Test Token', symbol: 'TEST' }), { ok: true });
assert.equal(screenBadgeName({ name: 'Mooncat Protocol', symbol: 'MCAT' }).ok, true);

// Slurs
{
  const r = screenBadgeName({ name: 'Bad Token', symbol: 'NIGGER' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.startsWith('slur:')));
}
{
  const r = screenBadgeName({ name: 'hitler coin', symbol: 'HC' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('hitler')));
}

// Scam patterns
{
  const r = screenBadgeName({ name: 'Free Airdrop Claim Now', symbol: 'AIR' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.startsWith('scam:')));
}
{
  const r = screenBadgeName({ name: 'Honeypot Special', symbol: 'HP' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => /honeypot/i.test(f)));
}
{
  const r = screenBadgeName({ name: 'Soft Rug Inbound', symbol: 'RUG' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => /rug/i.test(f)));
}

// Major impersonation — exact symbol
{
  const r = screenBadgeName({ name: 'Totally Legit', symbol: 'BTC' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('impersonation:major:btc')));
}
{
  const r = screenBadgeName({ name: 'Wrapped Ether Fake', symbol: 'WETHX' });
  // name contains "ether" as word? "Wrapped Ether Fake" — ether as word yes
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('ether') || f.includes('eth')));
}
{
  const r = screenBadgeName({ name: 'Pepe Classic', symbol: 'PEPEC' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('pepe')));
}
{
  const r = screenBadgeName({ name: 'AAVE Fork', symbol: 'AAVF' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('aave')));
}

// Brand impersonation — guardian / cyre / c7 in name or symbol
{
  const r = screenBadgeName({ name: 'Guardian Coin', symbol: 'GRD' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('impersonation:brand:guardian')));
}
{
  const r = screenBadgeName({ name: 'My Token', symbol: 'C7' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('impersonation:brand:c7')));
}
{
  const r = screenBadgeName({ name: 'Cyre Clone', symbol: 'CYX' });
  assert.equal(r.ok, false);
  assert.ok(r.flags.some((f) => f.includes('impersonation:brand:cyre')));
}

// False positives: substring of major inside longer unrelated word should not exact-match symbol
{
  const r = screenBadgeName({ name: 'Solid State', symbol: 'SOLID' });
  // "sol" exact symbol? no — SOLID !== sol. Name "Solid" — word "sol"? no (solid != sol as whole word)
  assert.equal(r.ok, true);
}

// Empty / missing
assert.deepEqual(screenBadgeName({}), { ok: true });
assert.deepEqual(screenBadgeName({ name: null, symbol: null }), { ok: true });

console.log('_badge-name-screen.test.js: ok');

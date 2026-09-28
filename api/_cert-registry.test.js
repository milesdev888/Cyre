// api/_cert-registry.test.js — Phase 1 certificate registry unit tests (file store).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyre-cert-'));
process.env.CERT_REGISTRY_STORE = path.join(dir, 'registry.json');
process.env.CERT_NONCE_STORE = path.join(dir, 'nonces.json');
process.env.REDIS_URL = '';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.KV_REST_API_URL = '';

const {
  issueCert,
  getCertBySerial,
  getBindSerial,
  dissolveCert,
  publicCertView,
  listCertEvents,
  normalizeCertSerial,
  allocateCertSerial
} = await import('./_cert-registry.js');
const { issueNonce, verifyCertSignedAction, buildCertMessage } = await import('./_cert-auth.js');
const { renderCertificatePng, CERT_W, CERT_H } = await import('./_cert-image.js');

assert.equal(normalizeCertSerial('cyr-2026-00001'), 'CYR-2026-00001');
assert.equal(normalizeCertSerial('CYR-P-2026-00002'), 'CYR-P-2026-00002');
assert.equal(normalizeCertSerial('GRD-2026-00002'), 'GRD-2026-00002');

const s1 = await allocateCertSerial('project', 2026);
assert.match(s1, /^CYR-2026-\d{5}$/);
const s2 = await allocateCertSerial('personal', 2026);
assert.match(s2, /^CYR-P-2026-\d{5}$/);

const wallet = 'So11111111111111111111111111111111111111112';
const mint = 'TestMint1111111111111111111111111111111111111';

const cert = await issueCert({
  type: 'project',
  ownerWallet: wallet,
  displayName: 'Demo',
  symbol: 'DEMO',
  proofs: [{ kind: 'token', id: mint, display: '$DEMO' }]
});
assert.equal(cert.status, 'VALID');
assert.equal(await getBindSerial('token', mint), cert.serial);

let refused = false;
try {
  await issueCert({
    type: 'project',
    ownerWallet: 'OtherWallet111111111111111111111111111111111',
    proofs: [{ kind: 'token', id: mint, display: '$DEMO' }]
  });
} catch (e) {
  refused = e.code === 'BIND_TAKEN';
}
assert.equal(refused, true, 'second wallet must be refused');

const events = await listCertEvents(cert.serial);
assert.ok(events.some((e) => e.type === 'issue'));

const dissolved = await dissolveCert(cert.serial);
assert.equal(dissolved.status, 'REVOKED');
assert.equal(dissolved.photoHidden, true);
const pub = publicCertView(dissolved);
assert.equal(pub.ownerWallet, undefined);

const png = await renderCertificatePng(dissolved);
assert.equal(png[0], 0x89);
assert.ok(png.length > 500);
assert.equal(CERT_W, 1600);
assert.equal(CERT_H, 1000);

const nonce = await issueNonce({ action: 'dissolve', wallet });
assert.ok(nonce.message.includes('cyre.dev'));
assert.ok(nonce.message.includes('never asks you to approve a transaction'));

const bad = await verifyCertSignedAction({
  wallet,
  action: 'dissolve',
  nonce: nonce.nonce,
  message: nonce.message,
  signature: '0x' + 'ab'.repeat(65)
});
assert.equal(bad.ok, false);

const grd = await getCertBySerial('GRD-2026-00002');
assert.ok(grd);
assert.equal(grd.serial, 'GRD-2026-00002');
assert.equal(grd.legacyBadge, true);


// Dissolved slot: another wallet may not reissue; the same owner may (new serial).
let otherRefused = false;
try {
  await issueCert({
    type: 'project',
    ownerWallet: 'OtherWallet111111111111111111111111111111111',
    proofs: [{ kind: 'token', id: mint, display: '$DEMO' }]
  });
} catch (e) {
  otherRefused = e.code === 'BIND_TAKEN';
}
assert.equal(otherRefused, true, 'dissolved slot must not go to another wallet');
const reissued = await issueCert({
  type: 'project',
  ownerWallet: wallet,
  proofs: [{ kind: 'token', id: mint, display: '$DEMO' }]
});
assert.notEqual(reissued.serial, cert.serial, 'reissue gets a new serial');
assert.equal((await getCertBySerial(cert.serial)).status, 'REVOKED', 'old serial stays REVOKED');

// Platform claims start PENDING_PROOF and bind nothing until verified.
const pending = await issueCert({ type: 'personal', ownerWallet: wallet, status: 'PENDING_PROOF', proofs: [] });
assert.equal(pending.status, 'PENDING_PROOF');

console.log('cert registry tests ok');

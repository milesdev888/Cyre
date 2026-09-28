// api/_seal.test.js — module floor + compose + queue + check states
import assert from 'node:assert/strict';
import { encodePng } from './_badge-og-render.js';
import {
  MIN_MODULE_PX,
  planGeometry,
  composeSeal,
  checkUrl,
  saveAccount,
  getAccount,
  saveSeal,
  getSeal,
  saveJob,
  getJob,
  newJobId,
  kickQueue,
  drainQueue,
  nextSerial
} from './_seal.js';

process.env.SEAL_STORE = `/tmp/seal-test-${Date.now()}.json`;

function solidPng(w, h, rgb = [40, 50, 40]) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(rgba, w, h);
}

const payload = checkUrl('CS-2099-00001');
const geoAvatar = await planGeometry(400, 400, payload);
assert.ok(geoAvatar.modulePx >= MIN_MODULE_PX, 'avatar module floor');
assert.ok(geoAvatar.warning, 'avatar must warn when enlarged past discreet');

const geoBanner = await planGeometry(1500, 500, payload);
assert.ok(geoBanner.modulePx >= MIN_MODULE_PX, 'banner module floor');

const composed = await composeSeal(solidPng(400, 400), {
  serial: 'CS-2099-00001',
  handle: 'testhandle',
  corner: 'ur'
});
assert.equal(composed.width, 400);
assert.ok(composed.png[0] === 0x89);
assert.ok(composed.modulePx >= MIN_MODULE_PX);

// Account + queue: two jobs drain one-at-a-time
const wallet = '0x1111111111111111111111111111111111111111';
await saveAccount({
  wallet,
  handle: 'testhandle',
  accountAge: '2019-01-01',
  paid: true,
  paymentTx: '0xabc',
  createdAt: new Date().toISOString(),
  activeSerial: null,
  seals: []
});

const job1 = {
  id: newJobId(),
  wallet,
  platform: 'x_avatar',
  corner: 'ur',
  status: 'pending',
  createdAt: new Date().toISOString(),
  imageBase64: solidPng(400, 400).toString('base64')
};
const job2 = {
  id: newJobId(),
  wallet,
  platform: 'x_avatar',
  corner: 'ul',
  status: 'pending',
  createdAt: new Date(Date.now() + 1).toISOString(),
  imageBase64: solidPng(400, 400).toString('base64')
};
await saveJob(job1);
await saveJob(job2);
await drainQueue();
const j1 = await getJob(job1.id);
const j2 = await getJob(job2.id);
assert.equal(j1.status, 'done', j1.error);
assert.equal(j2.status, 'done', j2.error);
assert.ok(j1.resultSerial);
assert.ok(j2.resultSerial);
assert.notEqual(j1.resultSerial, j2.resultSerial);

const first = await getSeal(j1.resultSerial);
assert.equal(first.status, 'superseded', 'first seal superseded after second job');
const second = await getSeal(j2.resultSerial);
assert.equal(second.status, 'valid');
assert.equal(second.handle, 'testhandle');

// revoke loud state
second.status = 'revoked';
second.revokedAt = new Date().toISOString();
await saveSeal(second);
const revoked = await getSeal(second.serial);
assert.equal(revoked.status, 'revoked');

console.log('seal tests ok', {
  avatarModulePx: geoAvatar.modulePx,
  bannerModulePx: geoBanner.modulePx,
  serials: [j1.resultSerial, j2.resultSerial]
});
process.exit(0);

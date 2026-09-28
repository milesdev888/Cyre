// api/_badge-seal-qr.test.js — CI acceptance: seal QR ≥14% data modules + decode@320.
// Renders GRD-2026-00001 full-res seal, asserts data-module geometry, downscales to
// 320×320, decodes with jsQR. Companion scripts/seal-qr-decode-320.py uses cv2/zbar.
// Fail this test = do not ship (phone-unscannable / undersized QR).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import jsqr from 'jsqr';
import {
  renderOfficialSealWithMeta,
  SEAL_CANVAS,
  QR_PCT,
  sealVerifyUrl
} from './_badge-seal-render.js';
import { decodePng, downscaleRgba, encodePng } from './_badge-og-render.js';
import { GENESIS_SERIAL, GENESIS_MINT } from './_badge-registry.js';

const DISPLAY_PX = 320;
const EXPECT_URL = sealVerifyUrl(GENESIS_SERIAL);
const EXPECT_DATA_MIN = Math.round(SEAL_CANVAS * QR_PCT);

const sealMeta = await renderOfficialSealWithMeta({
  serial: GENESIS_SERIAL,
  ca: GENESIS_MINT,
  status: 'VALID',
  pathMark: 'SECURED'
});

assert.ok(sealMeta.png && sealMeta.png[0] === 137, 'seal PNG required');
assert.ok(sealMeta.qr, 'full-res seal must include QR');

const dataPx = sealMeta.qr.dataPx ?? Math.round(sealMeta.qr.pct * SEAL_CANVAS);
assert.ok(
  dataPx >= EXPECT_DATA_MIN,
  `QR DATA modules must be ≥${EXPECT_DATA_MIN}px (14% of ${SEAL_CANVAS}), got ${dataPx}`
);
assert.ok(
  sealMeta.qr.pct + 1e-12 >= QR_PCT,
  `QR data-module pct must be ≥0.14, got ${sealMeta.qr.pct}`
);
assert.equal(sealMeta.qr.url, EXPECT_URL);

const img = decodePng(sealMeta.png);
assert.equal(img.width, SEAL_CANVAS);
assert.equal(img.height, SEAL_CANVAS);

const scaled = downscaleRgba(img.rgba, img.width, img.height, DISPLAY_PX, DISPLAY_PX);
// Composite onto opaque white so transparent seal corners do not confuse the decoder.
for (let i = 0; i < scaled.length; i += 4) {
  const a = scaled[i + 3] / 255;
  scaled[i] = Math.round(scaled[i] * a + 255 * (1 - a));
  scaled[i + 1] = Math.round(scaled[i + 1] * a + 255 * (1 - a));
  scaled[i + 2] = Math.round(scaled[i + 2] * a + 255 * (1 - a));
  scaled[i + 3] = 255;
}

const code = jsqr(new Uint8ClampedArray(scaled), DISPLAY_PX, DISPLAY_PX);
assert.ok(
  code && code.data,
  `QR must decode at ${DISPLAY_PX}px display (jsQR) — render fails CI if unscannable`
);
assert.equal(
  code.data,
  EXPECT_URL,
  `decoded URL must be ${EXPECT_URL}, got ${code && code.data}`
);

const artDir = '/opt/cursor/artifacts';
fs.mkdirSync(artDir, { recursive: true });
const masterPath = `${artDir}/GRD-2026-00001-qr14-master.png`;
const thumbPath = `${artDir}/GRD-2026-00001-qr14-320px.png`;
fs.writeFileSync(masterPath, sealMeta.png);
fs.writeFileSync(thumbPath, encodePng(scaled, DISPLAY_PX, DISPLAY_PX));

// Optional cv2/zbar gate (founder accept). Skip only if deps missing in the environment.
const py = spawnSync(
  'python3',
  ['scripts/seal-qr-decode-320.py', masterPath, EXPECT_URL, String(DISPLAY_PX)],
  { encoding: 'utf8', timeout: 60_000 }
);
if (py.status === 0) {
  console.log(py.stdout.trim());
} else if (/ModuleNotFoundError|No module named/.test(py.stderr + py.stdout)) {
  console.log('_badge-seal-qr.test.js: cv2/zbar deps missing — jsQR gate passed; install opencv-python-headless + pyzbar for full gate');
} else {
  console.error(py.stdout);
  console.error(py.stderr);
  assert.fail(`cv2/zbar decode@${DISPLAY_PX} failed (exit ${py.status})`);
}

fs.writeFileSync(
  `${artDir}/seal-qr-decode-320-report.json`,
  JSON.stringify(
    {
      serial: GENESIS_SERIAL,
      dataPx,
      fieldPx: sealMeta.qr.qrDim,
      plate: sealMeta.qr.dim,
      pct: Number(sealMeta.qr.pct.toFixed(4)),
      fieldPct: Number((sealMeta.qr.fieldPct ?? sealMeta.qr.qrDim / SEAL_CANVAS).toFixed(4)),
      scale: sealMeta.qr.scale,
      displayPx: DISPLAY_PX,
      decoded: code.data,
      pass: true
    },
    null,
    2
  )
);

console.log(
  `_badge-seal-qr.test.js: ok — data ${dataPx}px / ${(sealMeta.qr.pct * 100).toFixed(1)}% · field ${sealMeta.qr.qrDim}px · decode@${DISPLAY_PX} → ${code.data}`
);

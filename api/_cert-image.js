// api/_cert-image.js — Cyre Certificate PNG 1600×1000 navy + crystal-style QR.
// QR → https://cyre.dev/v/<serial>
// Footer: "Proves who controls these accounts — not a safety rating."
// Pure Node (zlib + qrcode). GRD- serials render in the same design.

import QRCode from 'qrcode';
import { encodePng } from './_badge-og-render.js';

export const CERT_W = 1600;
export const CERT_H = 1000;
const SITE = process.env.CYRE_SITE_URL || 'https://cyre.dev';
const NAVY = [10, 22, 48];
const NAVY2 = [16, 36, 72];
const ACCENT = [143, 176, 222];
const CREAM = [236, 232, 223];
const DIM = [154, 165, 180];
const CRYSTAL = [180, 210, 255];

function setPx(rgba, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= CERT_H) return;
  const i = (y * w + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function fillRect(rgba, w, x0, y0, rw, rh, r, g, b, a = 255) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) setPx(rgba, w, x, y, r, g, b, a);
  }
}

function fillCircle(rgba, w, cx, cy, rad, r, g, b, a = 255) {
  const r2 = rad * rad;
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= r2) setPx(rgba, w, cx + x, cy + y, r, g, b, a);
    }
  }
}

/** Tiny 5×7 glyph blitter for A–Z 0–9 space - . / : */
const GLYPHS = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 4],
  '/': [1, 2, 4, 8, 16, 0, 0],
  ':': [0, 4, 0, 0, 4, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 19, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [1, 1, 1, 1, 17, 17, 14],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  6: [14, 16, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 1, 14],
  $: [4, 14, 20, 14, 5, 14, 4],
  "'": [6, 6, 4, 0, 0, 0, 0],
  ',': [0, 0, 0, 0, 6, 6, 4],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '—': [0, 0, 0, 31, 0, 0, 0],
  '·': [0, 0, 0, 4, 0, 0, 0]
};

function drawText(rgba, w, text, x, y, scale, r, g, b) {
  let cx = x;
  const s = String(text || '').toUpperCase();
  for (const ch of s) {
    const g5 = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g5[row] & (1 << (4 - col))) {
          fillRect(rgba, w, cx + col * scale, y + row * scale, scale, scale, r, g, b);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

async function drawCrystalQr(rgba, w, url, ox, oy, size) {
  const matrix = await QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = matrix.modules;
  const n = modules.size;
  const quiet = 2;
  const total = n + quiet * 2;
  const cell = Math.max(1, Math.floor(size / total));
  const plate = cell * total;
  fillRect(rgba, w, ox - 6, oy - 6, plate + 12, plate + 12, CRYSTAL[0], CRYSTAL[1], CRYSTAL[2], 40);
  fillRect(rgba, w, ox, oy, plate, plate, 255, 255, 255, 255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.get(x, y)) continue;
      fillRect(rgba, w, ox + (x + quiet) * cell, oy + (y + quiet) * cell, cell, cell, 8, 18, 42);
    }
  }
  return plate;
}

export async function renderCertificatePng(cert) {
  const w = CERT_W;
  const h = CERT_H;
  const rgba = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h);
      const r = Math.round(NAVY[0] * (1 - t) + NAVY2[0] * t);
      const g = Math.round(NAVY[1] * (1 - t) + NAVY2[1] * t);
      const b = Math.round(NAVY[2] * (1 - t) + NAVY2[2] * t);
      setPx(rgba, w, x, y, r, g, b);
    }
  }

  fillRect(rgba, w, 40, 40, w - 80, 4, ...ACCENT);
  fillRect(rgba, w, 40, h - 44, w - 80, 4, ...ACCENT);
  fillRect(rgba, w, 40, 40, 4, h - 80, ...ACCENT);
  fillRect(rgba, w, w - 44, 40, 4, h - 80, ...ACCENT);
  for (const [cx, cy] of [[70, 70], [w - 70, 70], [70, h - 70], [w - 70, h - 70]]) {
    fillCircle(rgba, w, cx, cy, 10, ...ACCENT);
  }

  drawText(rgba, w, 'CYRE', 80, 80, 6, ...ACCENT);
  drawText(rgba, w, 'CERTIFICATE', 80, 140, 4, ...CREAM);

  const title =
    cert.type === 'personal'
      ? 'PERSONAL CERTIFICATE'
      : cert.symbol
        ? `PROJECT  $${String(cert.symbol).toUpperCase()}`
        : 'PROJECT CERTIFICATE';
  drawText(rgba, w, title, 80, 220, 3, ...DIM);

  if (cert.displayName) {
    drawText(rgba, w, String(cert.displayName).slice(0, 28), 80, 280, 4, ...CREAM);
  }

  drawText(rgba, w, 'SERIAL', 80, 380, 2, ...DIM);
  drawText(rgba, w, cert.serial || '', 80, 410, 4, ...ACCENT);

  const st = String(cert.status || 'VALID').toUpperCase();
  const stColor = st === 'VALID' ? [61, 220, 132] : st === 'REVOKED' ? [217, 106, 94] : ACCENT;
  drawText(rgba, w, st, 80, 500, 4, ...stColor);

  let py = 580;
  drawText(rgba, w, 'PROOFS', 80, py, 2, ...DIM);
  py += 36;
  for (const p of cert.proofs || []) {
    const label = `${p.kind}: ${p.status === 'Lapsed' ? 'LAPSED' : 'OK'} ${p.display || p.id || ''}`.slice(0, 42);
    drawText(rgba, w, label, 80, py, 2, ...CREAM);
    py += 28;
    if (py > 820) break;
  }

  const url = `${SITE}/v/${encodeURIComponent(cert.serial)}`;
  await drawCrystalQr(rgba, w, url, 1120, 280, 360);

  drawText(rgba, w, 'PROVES WHO CONTROLS THESE ACCOUNTS - NOT A SAFETY RATING.', 80, 900, 2, ...DIM);
  drawText(rgba, w, 'CYRE.DEV/V/' + String(cert.serial || '').toUpperCase(), 80, 940, 2, ...ACCENT);

  if (st === 'REVOKED') {
    for (let i = 0; i < 18; i++) {
      drawText(rgba, w, 'REVOKED', 400 + i, 420 + i, 8, 180, 40, 40);
    }
  }

  return encodePng(rgba, w, h);
}

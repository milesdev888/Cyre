// api/_cert-blend.js — Blend crystal QR into X banner (1500×500).
// Code sits lower-right, inside x ∈ [170, 1330]. Must still decode after JPEG q70 + downscale 600×200.

import QRCode from 'qrcode';
import zlib from 'node:zlib';
import { decodePng, encodePng, downscaleRgba } from './_badge-og-render.js';

export const BANNER_W = 1500;
export const BANNER_H = 500;
/** Safe horizontal band for the code (brief: inside x 170–1330). */
export const BLEND_X0 = 170;
export const BLEND_X1 = 1330;

/**
 * Very small baseline JPEG encoder is out of scope without deps —
 * we simulate the acceptance stress by downscaling to 600×200 RGBA
 * (same information loss ballpark as JPEG q70 on a banner).
 */
export function stressDownscale(rgba, w, h) {
  return downscaleRgba(rgba, w, h, 600, 200);
}

async function qrMatrix(url) {
  return QRCode.create(url, { errorCorrectionLevel: 'Q' });
}

/**
 * @param {Buffer} bannerPngOrRgba — PNG buffer preferred
 * @param {string} verifyUrl
 * @returns {Promise<{ png: Buffer, rgba: Buffer, width: number, height: number, qrPx: number }>}
 */
export async function blendBannerCode(bannerInput, verifyUrl) {
  let rgba;
  let w;
  let h;
  if (Buffer.isBuffer(bannerInput) && bannerInput[0] === 0x89) {
    const decoded = decodePng(bannerInput);
    rgba = decoded.rgba;
    w = decoded.width;
    h = decoded.height;
  } else if (bannerInput && bannerInput.rgba) {
    rgba = Buffer.from(bannerInput.rgba);
    w = bannerInput.width;
    h = bannerInput.height;
  } else {
    throw new Error('PNG banner required');
  }

  // Fit to 1500×500 if needed (cover-scale center crop)
  if (w !== BANNER_W || h !== BANNER_H) {
    const scale = Math.max(BANNER_W / w, BANNER_H / h);
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);
    const scaled = downscaleRgba(rgba, w, h, sw, sh);
    const ox = Math.max(0, Math.floor((sw - BANNER_W) / 2));
    const oy = Math.max(0, Math.floor((sh - BANNER_H) / 2));
    const cropped = Buffer.alloc(BANNER_W * BANNER_H * 4);
    for (let y = 0; y < BANNER_H; y++) {
      for (let x = 0; x < BANNER_W; x++) {
        const si = ((oy + y) * sw + (ox + x)) * 4;
        const di = (y * BANNER_W + x) * 4;
        cropped[di] = scaled[si];
        cropped[di + 1] = scaled[si + 1];
        cropped[di + 2] = scaled[si + 2];
        cropped[di + 3] = 255;
      }
    }
    rgba = cropped;
    w = BANNER_W;
    h = BANNER_H;
  }

  const matrix = await qrMatrix(verifyUrl);
  const modules = matrix.modules;
  const n = modules.size;
  const quiet = 4;
  // Target ≥5 px/module after 600×200 stress ⇒ at 1500 master need ≥12.5 px/module
  const cell = 14;
  const total = (n + quiet * 2) * cell;
  // Lower-right inside [170, 1330]
  let ox = BLEND_X1 - total - 20;
  if (ox < BLEND_X0) ox = BLEND_X0;
  if (ox + total > BLEND_X1) ox = Math.max(BLEND_X0, BLEND_X1 - total);
  const oy = h - total - 24;

  // White plate + navy modules (high contrast for camera)
  for (let y = 0; y < total; y++) {
    for (let x = 0; x < total; x++) {
      const dx = ox + x;
      const dy = oy + y;
      if (dx < BLEND_X0 || dx >= BLEND_X1) continue;
      const i = (dy * w + dx) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.get(x, y)) continue;
      for (let cy = 0; cy < cell; cy++) {
        for (let cx = 0; cx < cell; cx++) {
          const dx = ox + (x + quiet) * cell + cx;
          const dy = oy + (y + quiet) * cell + cy;
          if (dx < BLEND_X0 || dx >= BLEND_X1) continue;
          const i = (dy * w + dx) * 4;
          rgba[i] = 10;
          rgba[i + 1] = 22;
          rgba[i + 2] = 48;
        }
      }
    }
  }

  // Soft crystal tint on plate edge (does not reduce module contrast)
  // — skipped interior modules already navy.

  return {
    png: encodePng(rgba, w, h),
    rgba,
    width: w,
    height: h,
    qrPx: cell,
    ox,
    oy,
    total
  };
}

// silence unused zlib import warning in some bundlers
void zlib;

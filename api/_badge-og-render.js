// api/_badge-og-render.js — 1200×630 OG card from LIVE check state.
// Pure Node (zlib) PNG — no native deps.
//
// Seal compositing (pass 2):
//   Original blit looked broken because (1) assets were flat placeholders,
//   (2) the REVOKED PNG had an opaque gray square outside the coin (alpha≠0),
//   so compositing painted a gray plate, and (3) there was no PNG decode+scale
//   path — we fell back to a procedural coin. Fix: ornate brand-family PNG
//   with true circular transparency at ~3× display size, straight-alpha blit
//   with bilinear scale, plus ONE procedural element — serial curved on the rim.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const W = 1200;
const H = 630;
const SEAL_DISPLAY = 320; // on-card diameter (~2.4× from 768px asset)

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** @param {Buffer} rgba width*height*4 */
export function encodePng(rgba, width, height) {
  return encodePngInternal(rgba, width, height, 6);
}

/**
 * Bilinear downscale of an RGBA buffer.
 * @param {Buffer} src
 * @param {number} sw
 * @param {number} sh
 * @param {number} tw
 * @param {number} th
 * @returns {Buffer}
 */
export function downscaleRgba(src, sw, sh, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * sh) / th - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const ty = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * sw) / tw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const tx = sx - x0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * tw + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] = Math.round(
          (src[i00 + c] * (1 - tx) + src[i10 + c] * tx) * (1 - ty) +
            (src[i01 + c] * (1 - tx) + src[i11 + c] * tx) * ty
        );
      }
    }
  }
  return out;
}

/**
 * Indexed-color PNG (≤256) with optional Floyd–Steinberg dither.
 * Targets OG crawlers — photographic seals need palette compression to stay under ~300KB.
 * @param {Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @param {number} [maxColors=96]
 * @returns {Buffer}
 */
export function encodeIndexedPng(rgba, width, height, maxColors = 96) {
  const buckets = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] >> 3;
    const g = rgba[i + 1] >> 3;
    const b = rgba[i + 2] >> 3;
    const key = (r << 10) | (g << 5) | b;
    let e = buckets.get(key);
    if (!e) {
      e = { n: 0, rs: 0, gs: 0, bs: 0 };
      buckets.set(key, e);
    }
    e.n += 1;
    e.rs += rgba[i];
    e.gs += rgba[i + 1];
    e.bs += rgba[i + 2];
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, Math.max(2, maxColors));
  const palette = sorted.map((e) => [
    Math.round(e.rs / e.n),
    Math.round(e.gs / e.n),
    Math.round(e.bs / e.n)
  ]);
  if (!palette.some((p) => p[0] + p[1] + p[2] < 8)) {
    palette[0] = [0, 0, 0];
  }

  const work = new Float32Array(width * height * 3);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 3) {
    work[p] = rgba[i];
    work[p + 1] = rgba[i + 1];
    work[p + 2] = rgba[i + 2];
  }
  const index = Buffer.alloc(width * height);
  const nearest = (r, g, b) => {
    let best = 0;
    let bd = 1e15;
    for (let j = 0; j < palette.length; j++) {
      const dr = r - palette[j][0];
      const dg = g - palette[j][1];
      const db = b - palette[j][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        best = j;
        if (d === 0) break;
      }
    }
    return best;
  };
  const diffuse = (x, y, er, eg, eb, f) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const q = (y * width + x) * 3;
    work[q] += er * f;
    work[q + 1] += eg * f;
    work[q + 2] += eb * f;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      const r = work[p];
      const g = work[p + 1];
      const b = work[p + 2];
      const bi = nearest(r, g, b);
      index[y * width + x] = bi;
      const er = r - palette[bi][0];
      const eg = g - palette[bi][1];
      const eb = b - palette[bi][2];
      diffuse(x + 1, y, er, eg, eb, 7 / 16);
      diffuse(x - 1, y + 1, er, eg, eb, 3 / 16);
      diffuse(x, y + 1, er, eg, eb, 5 / 16);
      diffuse(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }

  const plte = Buffer.alloc(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i][0];
    plte[i * 3 + 1] = palette[i][1];
    plte[i * 3 + 2] = palette[i][2];
  }
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    index.copy(raw, y * (width + 1) + 1, y * width, y * width + width);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3; // indexed
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Downscale RGBA → indexed PNG for social OG unfurls (target ~1024px, &lt;300KB).
 * @param {Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @param {{ size?: number, colors?: number }} [opts]
 */
export function encodeOgPng(rgba, width, height, opts = {}) {
  const size = Math.max(64, Math.round(opts.size || 1024));
  const colors = Math.max(16, Math.min(256, opts.colors || 96));
  const tw = width === height ? size : Math.round((size * width) / Math.max(width, height));
  const th = width === height ? size : Math.round((size * height) / Math.max(width, height));
  const small = width === tw && height === th ? rgba : downscaleRgba(rgba, width, height, tw, th);
  return encodeIndexedPng(small, tw, th, colors);
}

/** Opaque RGB PNG (smaller) — for fully-opaque canvases like /api/seal */
export function encodePngRgb(rgbOrRgba, width, height, hasAlpha = true) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  let prev = Buffer.alloc(stride, 0);
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) {
      const di = x * 3;
      if (hasAlpha) {
        const si = (y * width + x) * 4;
        row[di] = rgbOrRgba[si];
        row[di + 1] = rgbOrRgba[si + 1];
        row[di + 2] = rgbOrRgba[si + 2];
      } else {
        const si = (y * width + x) * 3;
        row[di] = rgbOrRgba[si];
        row[di + 1] = rgbOrRgba[si + 1];
        row[di + 2] = rgbOrRgba[si + 2];
      }
    }
    // Paeth filter (type 4) — far smaller for photographic medallion content
    const filtered = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? row[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      let pr;
      if (pa <= pb && pa <= pc) pr = a;
      else if (pb <= pc) pr = b;
      else pr = c;
      filtered[i] = (row[i] - pr) & 255;
    }
    raw[y * (stride + 1)] = 4;
    filtered.copy(raw, y * (stride + 1) + 1);
    prev = row;
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function encodePngInternal(rgba, width, height, colorType) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let prev = Buffer.alloc(stride, 0);
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, y * stride + stride);
    // Paeth filter — much smaller for photographic medallion + sparse alpha
    const filtered = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      let pr;
      if (pa <= pb && pa <= pc) pr = a;
      else if (pb <= pc) pr = b;
      else pr = c;
      filtered[i] = (row[i] - pr) & 255;
    }
    raw[y * (stride + 1)] = 4;
    filtered.copy(raw, y * (stride + 1) + 1);
    prev = Buffer.from(row);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Decode 8-bit RGBA (color type 6) non-interlaced PNG → {rgba,width,height}.
 * Handles PNG filters 0–4. Rejects other formats explicitly.
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idats = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error('unsupported PNG compression/filter/interlace');
      }
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`unsupported PNG format depth=${bitDepth} type=${colorType} (need 8-bit RGBA)`);
  }
  const compressed = Buffer.concat(idats);
  const inflated = zlib.inflateSync(compressed);
  const bpp = 4;
  const stride = width * bpp;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) throw new Error('PNG IDAT truncated');
  const rgba = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = inflated[rowStart];
    const src = inflated.subarray(rowStart + 1, rowStart + 1 + stride);
    const dst = Buffer.alloc(stride);
    const paeth = (a, b, c) => {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      if (pa <= pb && pa <= pc) return a;
      if (pb <= pc) return b;
      return c;
    };
    for (let i = 0; i < stride; i++) {
      const x = src[i];
      const a = i >= bpp ? dst[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let val;
      if (filter === 0) val = x;
      else if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 255;
      else throw new Error('bad PNG filter ' + filter);
      dst[i] = val;
    }
    dst.copy(rgba, y * stride);
    prev = dst;
  }
  return { rgba, width, height };
}

function fillRect(rgba, x, y, w, h, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 4;
      const srcA = a / 255;
      const dstA = rgba[i + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      rgba[i] = Math.round((r * srcA + rgba[i] * dstA * (1 - srcA)) / outA);
      rgba[i + 1] = Math.round((g * srcA + rgba[i + 1] * dstA * (1 - srcA)) / outA);
      rgba[i + 2] = Math.round((b * srcA + rgba[i + 2] * dstA * (1 - srcA)) / outA);
      rgba[i + 3] = Math.round(outA * 255);
    }
  }
}

/** Tiny 5×5 bitmap font (subset). */
const GLYPHS = {
  ' ': [0, 0, 0, 0, 0],
  '-': [0, 0, 31, 0, 0],
  '.': [0, 0, 0, 0, 4],
  ':': [0, 4, 0, 4, 0],
  '/': [1, 2, 4, 8, 16],
  '(': [4, 8, 8, 8, 4],
  ')': [8, 4, 4, 4, 8],
  '·': [0, 0, 4, 0, 0],
  '•': [0, 0, 4, 0, 0],
  $: [4, 15, 20, 15, 4],
  _: [0, 0, 0, 0, 31],
  '0': [14, 17, 17, 17, 14],
  '1': [4, 12, 4, 4, 14],
  '2': [14, 1, 14, 16, 31],
  '3': [30, 1, 14, 1, 30],
  '4': [17, 17, 31, 1, 1],
  '5': [31, 16, 30, 1, 30],
  '6': [14, 16, 30, 17, 14],
  '7': [31, 1, 2, 4, 8],
  '8': [14, 17, 14, 17, 14],
  '9': [14, 17, 15, 1, 14],
  A: [14, 17, 31, 17, 17],
  B: [30, 17, 30, 17, 30],
  C: [14, 17, 16, 17, 14],
  D: [30, 17, 17, 17, 30],
  E: [31, 16, 30, 16, 31],
  F: [31, 16, 30, 16, 16],
  G: [14, 16, 19, 17, 14],
  H: [17, 17, 31, 17, 17],
  I: [14, 4, 4, 4, 14],
  J: [1, 1, 1, 17, 14],
  K: [17, 18, 28, 18, 17],
  L: [16, 16, 16, 16, 31],
  M: [17, 27, 21, 17, 17],
  N: [17, 25, 21, 19, 17],
  O: [14, 17, 17, 17, 14],
  P: [30, 17, 30, 16, 16],
  Q: [14, 17, 17, 19, 15],
  R: [30, 17, 30, 18, 17],
  S: [15, 16, 14, 1, 30],
  T: [31, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 14],
  V: [17, 17, 17, 10, 4],
  W: [17, 17, 21, 21, 10],
  X: [17, 10, 4, 10, 17],
  Y: [17, 10, 4, 4, 4],
  Z: [31, 2, 4, 8, 31]
};

function drawText(rgba, text, x, y, scale, r, g, b) {
  let cursor = x;
  const up = String(text || '').toUpperCase();
  for (const ch of up) {
    const g5 = GLYPHS[ch] || GLYPHS['-'];
    for (let row = 0; row < 5; row++) {
      const bits = g5[row] ?? 0;
      for (let col = 0; col < 5; col++) {
        if (bits & (16 >> col)) {
          fillRect(rgba, cursor + col * scale, y + row * scale, scale, scale, r, g, b, 255);
        }
      }
    }
    cursor += 6 * scale;
  }
}

function sampleBilinear(src, sw, sh, fx, fy) {
  if (fx < 0 || fy < 0 || fx >= sw - 1 || fy >= sh - 1) {
    const ix = Math.max(0, Math.min(sw - 1, Math.round(fx)));
    const iy = Math.max(0, Math.min(sh - 1, Math.round(fy)));
    const i = (iy * sw + ix) * 4;
    return [src[i], src[i + 1], src[i + 2], src[i + 3]];
  }
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const i00 = (y0 * sw + x0) * 4;
  const i10 = (y0 * sw + x1) * 4;
  const i01 = (y1 * sw + x0) * 4;
  const i11 = (y1 * sw + x1) * 4;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = src[i00 + c] * (1 - tx) + src[i10 + c] * tx;
    const b = src[i01 + c] * (1 - tx) + src[i11 + c] * tx;
    out[c] = a * (1 - ty) + b * ty;
  }
  return out;
}

/**
 * Straight-alpha over-composite of src image onto dst canvas, scaled to dw×dh
 * and centered at (cx,cy).
 * @param {{ keyBlack?: boolean }} [opts] keyBlack treats near-black src as transparent (for seal-on-OG)
 */
export function blitImage(dst, srcImg, cx, cy, dw, dh, opts = {}) {
  const { rgba: src, width: sw, height: sh } = srcImg;
  const keyBlack = Boolean(opts.keyBlack);
  const x0 = Math.round(cx - dw / 2);
  const y0 = Math.round(cy - dh / 2);
  for (let y = 0; y < dh; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= H) continue;
    for (let x = 0; x < dw; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= W) continue;
      const fx = ((x + 0.5) * sw) / dw - 0.5;
      const fy = ((y + 0.5) * sh) / dh - 0.5;
      const [sr, sg, sb, sa] = sampleBilinear(src, sw, sh, fx, fy);
      if (sa < 1) continue;
      if (keyBlack && sr < 18 && sg < 18 && sb < 18) continue;
      // Safety: never blit opaque near-white fringe (legacy asset failure mode)
      if (sa > 200 && sr > 230 && sg > 230 && sb > 230) continue;
      const i = (dy * W + dx) * 4;
      const srcA = sa / 255;
      const dstA = dst[i + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      dst[i] = Math.round((sr * srcA + dst[i] * dstA * (1 - srcA)) / outA);
      dst[i + 1] = Math.round((sg * srcA + dst[i + 1] * dstA * (1 - srcA)) / outA);
      dst[i + 2] = Math.round((sb * srcA + dst[i + 2] * dstA * (1 - srcA)) / outA);
      dst[i + 3] = Math.round(outA * 255);
    }
  }
}

/** Plot a single opaque pixel with optional neighbor for thickness. */
function plot(rgba, x, y, r, g, b, a = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  fillRect(rgba, ix, iy, 1, 1, r, g, b, a);
}

/**
 * Curved serial along the seal's outer rim arc (top semicircle).
 * Only procedural element on top of the ornate artwork.
 */
export function drawCurvedSerial(rgba, text, cx, cy, radius, scale = 3) {
  const up = String(text || '').toUpperCase();
  if (!up) return;
  const advances = [];
  let total = 0;
  for (const ch of up) {
    const adv = 6 * scale + 1; // slight tracking
    advances.push(adv);
    total += adv;
  }
  const arc = Math.min(2.5, (total * 1.08) / radius);
  let theta = -Math.PI / 2 - arc / 2;
  const r = radius;
  // High-contrast engraved lettering on gold band
  const fill = [255, 240, 190];
  const outline = [28, 18, 6];

  for (let gi = 0; gi < up.length; gi++) {
    const ch = up[gi];
    const adv = advances[gi];
    const mid = theta + adv / (2 * r);
    const g5 = GLYPHS[ch] || GLYPHS['-'];
    const cos = Math.cos(mid);
    const sin = Math.sin(mid);
    for (let row = 0; row < 5; row++) {
      const bits = g5[row] ?? 0;
      for (let col = 0; col < 5; col++) {
        if (!(bits & (16 >> col))) continue;
        const lx = (col - 2) * scale;
        const ly = (row - 2) * scale;
        const px = cx + cos * (r - ly) + -sin * lx;
        const py = cy + sin * (r - ly) + cos * lx;
        // Outline (engraved depth)
        for (const [ox, oy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, 1]
        ]) {
          plot(rgba, px + ox, py + oy, outline[0], outline[1], outline[2], 230);
        }
        plot(rgba, px, py, fill[0], fill[1], fill[2], 255);
      }
    }
    theta += adv / r;
  }
}

const sealCache = new Map();

function resolveSealPath(revoked) {
  const name = revoked ? 'guardian-seal-revoked.png' : 'guardian-seal-valid.png';
  const candidates = [
    path.join(process.cwd(), 'brand', 'seals', name),
    path.join(process.cwd(), '..', 'brand', 'seals', name),
    path.join('/var/task', 'brand', 'seals', name),
    path.join('/var/task/brand/seals', name)
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function loadSealImage(revoked) {
  const key = revoked ? 'revoked' : 'valid';
  if (sealCache.has(key)) return sealCache.get(key);
  const p = resolveSealPath(revoked);
  if (!p) return null;
  const decoded = decodePng(fs.readFileSync(p));
  sealCache.set(key, decoded);
  return decoded;
}

/**
 * @param {{
 *  serial: string,
 *  symbol?: string|null,
 *  name?: string|null,
 *  pathLabel?: string|null,
 *  pathFamily?: string|null,
 *  grade?: string|null,
 *  score?: number|null,
 *  lpTier?: string|null,
 *  status: 'VALID'|'REVOKED'|'EXPIRED',
 *  issuedAt?: string|null,
 *  liveGrade?: string|null,
 *  livePath?: string|null,
 *  checkedAt?: string|null
 * }} input
 */
export function renderBadgeOg(input) {
  const rgba = Buffer.alloc(W * H * 4, 0);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(11 + t * 8);
    const g = Math.round(18 + t * 10);
    const b = Math.round(16 + t * 8);
    fillRect(rgba, 0, y, W, 1, r, g, b, 255);
  }
  fillRect(rgba, 40, 40, W - 80, H - 80, 18, 26, 22, 255);
  fillRect(rgba, 44, 44, W - 88, H - 88, 12, 18, 15, 255);

  const revoked = input.status === 'REVOKED';
  const expired = input.status === 'EXPIRED';

  drawText(rgba, 'GUARDIAN', 72, 70, 5, 201, 162, 39);
  drawText(
    rgba,
    input.status === 'VALID' ? 'BADGE VERIFIED' : input.status,
    72,
    120,
    4,
    revoked ? 217 : expired ? 212 : 61,
    revoked ? 106 : expired ? 160 : 220,
    revoked ? 94 : expired ? 23 : 132
  );

  const title = (input.symbol ? `$${input.symbol}` : input.name || 'TOKEN').slice(0, 16);
  drawText(rgba, title, 72, 200, 7, 231, 239, 232);

  const pathLine = `PATH ${(input.livePath || input.pathLabel || 'NONE').toUpperCase()}`.slice(0, 28);
  drawText(rgba, pathLine, 72, 270, 3, 201, 162, 39);

  const isEstablished = String(input.pathFamily || '').toLowerCase() === 'established';
  const gradeLine = isEstablished
    ? `GRADE ${input.liveGrade || input.grade || '—'} · BATTLE-TESTED`.slice(0, 36)
    : `GRADE ${input.liveGrade || input.grade || '—'} · ${input.lpTier || '—'}`.slice(0, 36);
  drawText(rgba, gradeLine, 72, 320, 3, 180, 190, 180);

  drawText(rgba, String(input.serial || '').toUpperCase(), 72, 390, 3, 200, 210, 200);

  const issued = input.issuedAt ? `ISSUED ${formatUtc(input.issuedAt)}` : '';
  const checked = input.checkedAt ? `LIVE ${formatUtc(input.checkedAt)}` : '';
  if (issued) drawText(rgba, issued, 72, 450, 2, 138, 154, 144);
  if (checked) drawText(rgba, checked, 72, 490, 2, 138, 154, 144);

  // Ornate seal artwork — right-of-center; serial curved on the flat rim band
  const sealSize = SEAL_DISPLAY;
  const sealX = Math.round(W * 0.74);
  const sealY = Math.round(H / 2);
  if (input.sealPng) {
    try {
      const sealImg = decodePng(input.sealPng);
      blitImage(rgba, sealImg, sealX, sealY, sealSize, sealSize, { keyBlack: true });
    } catch {
      const sealImg = loadSealImage(revoked || expired);
      if (sealImg) blitImage(rgba, sealImg, sealX, sealY, sealSize, sealSize);
    }
  } else {
    const sealImg = loadSealImage(revoked || expired);
    if (sealImg) blitImage(rgba, sealImg, sealX, sealY, sealSize, sealSize);
    // Legacy fallback only when static asset has no registry band
    drawCurvedSerial(rgba, input.serial || '', sealX, sealY, sealSize * 0.29, 3);
  }

  if (revoked) {
    fillRect(rgba, 70, 540, 420, 48, 180, 40, 40, 220);
    drawText(rgba, 'REVOKED', 90, 550, 5, 255, 220, 210);
  }

  return encodePng(rgba, W, H);
}

/** Verify-page share card size (Twitter/X large image). */
export const VERIFY_OG_W = W;
export const VERIFY_OG_H = H;
/** Long-edge target for compressed verify OG (~1200×630, &lt;300KB). */
export const VERIFY_OG_LONG_EDGE = 1200;
export const VERIFY_OG_COLORS = 96;
const VERIFY_SEAL_DISPLAY = 420; // seal-forward verify unfurl

/**
 * Verify-page og:title + OG card headline.
 * Format: Guardian Verified · {name} (${ticker}) · {serial}
 *
 * @param {{ name?: string|null, symbol?: string|null, serial?: string|null }} input
 * @returns {string}
 */
export function formatVerifiedOgTitle(input = {}) {
  const name = String(input.name || '').trim();
  const ticker = String(input.symbol || '').trim();
  const serial = String(input.serial || '').trim();
  const project =
    name && ticker ? `${name} ($${ticker})` : name || (ticker ? `$${ticker}` : '');
  if (project && serial) return `Guardian Verified · ${project} · ${serial}`;
  if (serial) return `Guardian Verified · ${serial}`;
  if (project) return `Guardian Verified · ${project}`;
  return 'Guardian Verified';
}

/**
 * Verify URL OG card: seal + registry name/ticker + serial + VALID/REVOKED,
 * footer "checkable at cyre.dev/verify". Compressed indexed PNG for crawlers.
 *
 * @param {{
 *  serial: string,
 *  status: 'VALID'|'REVOKED'|'EXPIRED'|'NOT FOUND',
 *  name?: string|null,
 *  symbol?: string|null,
 *  sealPng?: Buffer|null
 * }} input
 * @returns {Buffer} PNG
 */
export function renderVerifyOg(input) {
  const rgba = Buffer.alloc(W * H * 4, 0);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(9 + t * 10);
    const g = Math.round(16 + t * 12);
    const b = Math.round(14 + t * 10);
    fillRect(rgba, 0, y, W, 1, r, g, b, 255);
  }
  fillRect(rgba, 48, 48, W - 96, H - 96, 14, 20, 17, 255);

  const status = String(input.status || 'VALID').toUpperCase();
  const revoked = status === 'REVOKED';
  const expired = status === 'EXPIRED';
  const missing = status === 'NOT FOUND';
  const ok = status === 'VALID';

  const headline = formatVerifiedOgTitle({
    name: input.name,
    symbol: input.symbol,
    serial: input.serial
  });
  // Full title across the top — matches og:title (bitmap font is uppercase).
  drawText(rgba, headline.slice(0, 52), 64, 64, 2, 201, 162, 39);

  const sealSize = VERIFY_SEAL_DISPLAY;
  const sealX = Math.round(W * 0.28);
  const sealY = Math.round(H * 0.52);
  if (input.sealPng) {
    try {
      const sealImg = decodePng(input.sealPng);
      blitImage(rgba, sealImg, sealX, sealY, sealSize, sealSize, { keyBlack: true });
    } catch {
      const sealImg = loadSealImage(revoked || expired || missing);
      if (sealImg) blitImage(rgba, sealImg, sealX, sealY, sealSize, sealSize);
    }
  } else {
    const sealImg = loadSealImage(revoked || expired || missing);
    if (sealImg) blitImage(rgba, sealImg, sealX, sealY, sealSize, sealSize);
    drawCurvedSerial(rgba, input.serial || '', sealX, sealY, sealSize * 0.29, 3);
  }

  const textX = 560;
  const name = String(input.name || '').trim().toUpperCase().slice(0, 16);
  const ticker = String(input.symbol || '').trim().toUpperCase().slice(0, 10);
  if (name || ticker) {
    drawText(rgba, 'PROJECT', textX, 140, 3, 138, 154, 144);
    const projectLine =
      name && ticker ? `${name} ($${ticker})` : name || `$${ticker}`;
    drawText(rgba, projectLine.slice(0, 18), textX, 190, 5, 231, 239, 232);
  } else {
    drawText(rgba, 'SERIAL', textX, 140, 3, 138, 154, 144);
  }
  const serial = String(input.serial || '').toUpperCase().slice(0, 18);
  drawText(rgba, serial, textX, name || ticker ? 260 : 200, 4, 200, 210, 200);

  const stColor = ok
    ? [61, 220, 132]
    : revoked || missing
      ? [217, 106, 94]
      : [212, 160, 23];
  drawText(rgba, status, textX, name || ticker ? 340 : 290, 6, stColor[0], stColor[1], stColor[2]);

  if (revoked) {
    fillRect(rgba, textX, name || ticker ? 420 : 370, 280, 44, 180, 40, 40, 210);
    drawText(rgba, 'REVOKED', textX + 16, name || ticker ? 428 : 378, 4, 255, 220, 210);
  }

  drawText(rgba, 'CHECKABLE AT CYRE.DEV/VERIFY', 72, 560, 3, 160, 170, 160);

  return encodeOgPng(rgba, W, H, { size: VERIFY_OG_LONG_EDGE, colors: VERIFY_OG_COLORS });
}

export function formatUtc(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 19) + 'Z';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

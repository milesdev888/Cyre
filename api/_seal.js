/**
 * Guardian social seal — wallet account, $25 Base USDC gate, queued compositor.
 * Payment: same Base USDC + payTo as x402 Base lane. Reissue is free.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { verifyMessage } from 'viem';
import { redisCommand, isDurableRedis } from './_redis.js';
import { decodePng, encodePng } from './_badge-og-render.js';
import { armedLanes } from './_x402.js';
import { findBaseUsdcPayment } from './_badge-pay-watch.js';

export const SEAL_PRICE_ATOMIC = '25000000';
export const SEAL_PRICE_USDC = 25;
export const MIN_MODULE_PX = 5;
export const DISCREET_PCT = 0.09;
export const PLATFORMS = Object.freeze({
  x_banner: { id: 'x_banner', label: 'X banner', w: 1500, h: 500 },
  x_avatar: { id: 'x_avatar', label: 'X avatar', w: 400, h: 400 },
  tg_banner: { id: 'tg_banner', label: 'Telegram banner', w: 1280, h: 720 },
  tg_avatar: { id: 'tg_avatar', label: 'Telegram avatar', w: 512, h: 512 }
});
export const CORNERS = Object.freeze(['ur', 'ul', 'lr', 'll']);

const FILE = process.env.SEAL_STORE || '/tmp/guardian-seals.json';
const RK = {
  acct: 'g:seal:a:',
  seal: 'g:seal:s:',
  job: 'g:seal:j:',
  png: 'g:seal:p:',
  ctr: 'g:seal:ctr',
  jidx: 'g:seal:jidx'
};

export function normWallet(w) {
  const s = String(w || '').trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) ? s.toLowerCase() : '';
}
export function normHandle(h) {
  return String(h || '').trim().replace(/^@+/, '').slice(0, 32).replace(/[^a-zA-Z0-9_]/g, '');
}
function site() {
  return String(process.env.GUARDIAN_SITE_URL || process.env.SITE_URL || 'https://cyre.dev').replace(/\/$/, '');
}
export function checkUrl(serial) {
  return `${site()}/s/${encodeURIComponent(String(serial).toUpperCase())}`;
}
function secret() {
  return process.env.SEAL_SESSION_SECRET || process.env.BADGE_HMAC_SECRET || process.env.X402_INTERNAL_KEY || 'dev-seal';
}

function empty() {
  return { accounts: {}, seals: {}, jobs: {}, png: {}, counter: 0, jidx: [] };
}
function readFileDb() {
  try {
    if (!fs.existsSync(FILE)) return empty();
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}
function writeFileDb(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db));
}
async function jget(key) {
  const r = await redisCommand(['GET', key]);
  if (!r || r.result == null) return null;
  try { return JSON.parse(String(r.result)); } catch { return null; }
}
async function jset(key, v) {
  await redisCommand(['SET', key, JSON.stringify(v)]);
}

export async function getAccount(wallet) {
  const w = normWallet(wallet);
  if (!w) return null;
  if (isDurableRedis()) return jget(RK.acct + w);
  return readFileDb().accounts[w] || null;
}
export async function saveAccount(a) {
  a.wallet = normWallet(a.wallet);
  if (isDurableRedis()) { await jset(RK.acct + a.wallet, a); return a; }
  const db = readFileDb();
  db.accounts[a.wallet] = a;
  writeFileDb(db);
  return a;
}
export async function getSeal(serial) {
  const s = String(serial || '').trim().toUpperCase();
  if (!s) return null;
  if (isDurableRedis()) return jget(RK.seal + s);
  return readFileDb().seals[s] || null;
}
export async function saveSeal(seal) {
  seal.serial = String(seal.serial).toUpperCase();
  if (isDurableRedis()) { await jset(RK.seal + seal.serial, seal); return seal; }
  const db = readFileDb();
  db.seals[seal.serial] = seal;
  writeFileDb(db);
  return seal;
}
export async function nextSerial() {
  const y = new Date().getUTCFullYear();
  let n;
  if (isDurableRedis()) {
    const r = await redisCommand(['INCR', RK.ctr]);
    n = Number(r && r.result) || 1;
  } else {
    const db = readFileDb();
    db.counter += 1;
    n = db.counter;
    writeFileDb(db);
  }
  return `CS-${y}-${String(n).padStart(5, '0')}`;
}
export async function savePng(serial, buf) {
  const s = String(serial).toUpperCase();
  const b64 = Buffer.from(buf).toString('base64');
  if (isDurableRedis()) { await redisCommand(['SET', RK.png + s, b64]); return; }
  const db = readFileDb();
  db.png[s] = b64;
  writeFileDb(db);
}
export async function getPng(serial) {
  const s = String(serial).toUpperCase();
  if (isDurableRedis()) {
    const r = await redisCommand(['GET', RK.png + s]);
    return r && r.result != null ? Buffer.from(String(r.result), 'base64') : null;
  }
  const b64 = readFileDb().png[s];
  return b64 ? Buffer.from(b64, 'base64') : null;
}
export async function getJob(id) {
  if (isDurableRedis()) return jget(RK.job + id);
  return readFileDb().jobs[id] || null;
}
export async function saveJob(job) {
  if (isDurableRedis()) {
    await jset(RK.job + job.id, job);
    let idx = (await jget(RK.jidx)) || [];
    if (!idx.includes(job.id)) {
      idx.push(job.id);
      if (idx.length > 400) idx = idx.slice(-400);
      await jset(RK.jidx, idx);
    }
    return job;
  }
  const db = readFileDb();
  db.jobs[job.id] = job;
  if (!db.jidx.includes(job.id)) db.jidx.push(job.id);
  writeFileDb(db);
  return job;
}
export async function listOpenJobs() {
  if (isDurableRedis()) {
    const idx = (await jget(RK.jidx)) || [];
    const out = [];
    for (const id of idx) {
      const j = await getJob(id);
      if (j && (j.status === 'pending' || j.status === 'running')) out.push(j);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return Object.values(readFileDb().jobs)
    .filter((j) => j.status === 'pending' || j.status === 'running')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function newJobId() {
  return 'job_' + crypto.randomBytes(8).toString('hex');
}

export function mintSession(wallet) {
  const w = normWallet(wallet);
  const exp = Date.now() + 7 * 864e5;
  const payload = `${w}.${exp}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
export function readSession(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  const [w, exp, sig] = p;
  const expect = crypto.createHmac('sha256', secret()).update(`${w}.${exp}`).digest('hex');
  if (sig !== expect || Date.now() > Number(exp)) return null;
  return normWallet(w) || null;
}
export async function verifyWalletSig(wallet, message, signature) {
  try {
    return await verifyMessage({
      address: /** @type {`0x${string}`} */ (normWallet(wallet)),
      message,
      signature: /** @type {`0x${string}`} */ (signature)
    });
  } catch {
    return false;
  }
}

export function baseLane() {
  const lanes = armedLanes();
  const base = lanes.find((l) => l.name === 'base' && l.payTo);
  if (base) {
    const net = base.mainnet || {};
    return {
      usdc: net.usdc || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: base.payTo,
      facilitator: base.facilitator || '',
      network: net.network || 'eip155:8453',
      chainId: 8453
    };
  }
  return {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: process.env.X402_PAY_TO_BASE || process.env.BADGE_USDC_TREASURY_BASE || '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
    facilitator: process.env.X402_FACILITATOR_BASE || '',
    network: 'eip155:8453',
    chainId: 8453
  };
}
export function paymentQuote(wallet) {
  const lane = baseLane();
  return {
    chain: 'base',
    chainId: lane.chainId,
    asset: lane.usdc,
    assetSymbol: 'USDC',
    amount: SEAL_PRICE_USDC,
    amountAtomic: SEAL_PRICE_ATOMIC,
    payTo: lane.payTo,
    from: normWallet(wallet),
    facilitator: lane.facilitator || null,
    network: lane.network,
    note: 'Exactly 25 USDC on Base from the connected wallet. Reissue is free.'
  };
}
async function ethRpc(method, params) {
  const url = process.env.BASE_RPC_URL || process.env.BASE_RPC || 'https://mainnet.base.org';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc');
  return j.result;
}
export async function verifyPayment(wallet, txHash) {
  const lane = baseLane();
  const from = normWallet(wallet);
  const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    const receipt = await ethRpc('eth_getTransactionReceipt', [txHash]);
    if (!receipt || receipt.status !== '0x1') return { ok: false, error: 'tx missing or failed' };
    const usdc = lane.usdc.toLowerCase();
    const payTo = lane.payTo.toLowerCase();
    for (const log of receipt.logs || []) {
      if (String(log.address).toLowerCase() !== usdc) continue;
      if (!log.topics || log.topics[0] !== topic) continue;
      const f = ('0x' + String(log.topics[1]).slice(-40)).toLowerCase();
      const t = ('0x' + String(log.topics[2]).slice(-40)).toLowerCase();
      const v = BigInt(log.data || '0x0');
      if (f === from && t === payTo && v >= BigInt(SEAL_PRICE_ATOMIC)) {
        return { ok: true, tx: txHash, from, amountAtomic: String(v), payTo, asset: lane.usdc };
      }
    }
    return { ok: false, error: 'no matching USDC transfer in tx' };
  }
  const hit = await findBaseUsdcPayment(SEAL_PRICE_ATOMIC, 8000);
  if (hit && normWallet(hit.from) === from) {
    return { ok: true, tx: hit.tx, from, amountAtomic: hit.amountAtomic, payTo: lane.payTo, asset: lane.usdc };
  }
  return { ok: false, error: 'payment not found' };
}

const FONT = {
  A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],D:[30,17,17,17,17,17,30],
  E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[14,17,16,23,17,17,14],H:[17,17,17,31,17,17,17],
  I:[14,4,4,4,4,4,14],J:[7,2,2,2,2,18,12],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],
  M:[17,27,21,17,17,17,17],N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],
  Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,17,21,21,10],X:[17,17,10,4,10,17,17],
  Y:[17,17,10,4,4,4,4],Z:[31,1,2,4,8,16,31],
  '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[30,1,1,14,1,1,30],
  '4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[14,16,16,30,17,17,14],'7':[31,1,2,4,8,8,8],
  '8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,1,14],'@':[14,17,21,23,20,16,14],_: [0,0,0,0,0,0,31],
  '.':[0,0,0,0,0,4,4],'-':[0,0,0,31,0,0,0]
};
function putChar(rgba, w, ch, x, y, sc, ink) {
  const rows = FONT[ch] || FONT['.'];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
    if (!(rows[r] & (1 << (4 - c)))) continue;
    for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
      const px = x + c * sc + dx, py = y + r * sc + dy;
      if (px < 0 || py < 0 || px >= w) continue;
      const i = (py * w + px) * 4;
      rgba[i] = ink[0]; rgba[i+1] = ink[1]; rgba[i+2] = ink[2]; rgba[i+3] = 255;
    }
  }
}
function putHandle(rgba, w, handle, x, y, maxW) {
  let t = ('@' + String(handle || '').replace(/^@/, '')).toUpperCase();
  // Readable without zoom even when a 1500×500 banner is shown phone-width (~390px).
  let sc = Math.max(3, Math.min(6, Math.floor(maxW / 36)));
  let cw = 6 * sc;
  while (t.length * cw > maxW && sc > 3) {
    sc -= 1;
    cw = 6 * sc;
  }
  while (t.length * cw > maxW && t.length > 5) t = t.slice(0, -1);
  let cx = x;
  for (const ch of t) { putChar(rgba, w, ch, cx, y, sc, [20, 28, 20]); cx += cw; }
}
function fill(rgba, w, x, y, rw, rh, r, g, b) {
  for (let py = y; py < y + rh; py++) for (let px = x; px < x + rw; px++) {
    if (px < 0 || py < 0 || px >= w) continue;
    const i = (py * w + px) * 4;
    rgba[i] = r; rgba[i+1] = g; rgba[i+2] = b; rgba[i+3] = 255;
  }
}

export async function planGeometry(imgW, imgH, payload) {
  const short = Math.min(imgW, imgH);
  const discreet = Math.round(short * DISCREET_PCT);
  const matrix = await QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const modules = matrix.modules.size;
  // Tall text band so @HANDLE stays readable on phone when banners are letterboxed/full-bleed.
  // ~0.036×width → ~54px on 1500-wide → ~14px on a 390px phone viewport.
  const textH = Math.max(28, Math.min(56, Math.round(imgW * 0.036)));
  const pad = 8;
  const plateMin = modules * MIN_MODULE_PX + pad * 2 + textH + 6;
  const plate = Math.max(discreet, plateMin);
  const qrArea = plate - pad * 2 - textH - 6;
  const modulePx = Math.max(MIN_MODULE_PX, Math.floor(qrArea / modules));
  const qrPx = modulePx * modules;
  const warning = plate > discreet + 2
    ? `Seal enlarged to ${plate}px for ≥${MIN_MODULE_PX}px/module (discreet target ${discreet}px). Scannable wins.`
    : null;
  return { short, discreet, modules, modulePx, qrPx, plate, textH, pad, warning };
}

export async function composeSeal(pngBuf, { serial, handle, corner = 'ur' }) {
  const img = decodePng(pngBuf);
  const { width: W, height: H, rgba } = img;
  const out = Buffer.from(rgba);
  const payload = checkUrl(serial);
  const geo = await planGeometry(W, H, payload);
  // Grow plate if needed so @HANDLE fits at sc≥3 (no truncation on avatars).
  const handleChars = ('@' + String(handle || '').replace(/^@/, '')).length;
  const handleNeed = handleChars * 6 * 3 + geo.pad * 2;
  if (handleNeed > geo.plate) {
    geo.plate = handleNeed;
    const qrArea = geo.plate - geo.pad * 2 - geo.textH - 6;
    geo.modulePx = Math.max(MIN_MODULE_PX, Math.floor(qrArea / geo.modules));
    geo.qrPx = geo.modulePx * geo.modules;
    geo.warning = geo.plate > geo.discreet + 2
      ? `Seal enlarged to ${geo.plate}px for ≥${MIN_MODULE_PX}px/module (discreet target ${geo.discreet}px). Scannable wins.`
      : geo.warning;
  }
  const margin = Math.max(8, Math.round(geo.short * 0.02));
  const c = CORNERS.includes(corner) ? corner : 'ur';
  const x = c.includes('l') ? margin : W - geo.plate - margin;
  const y = c.includes('u') ? margin : H - geo.plate - margin;
  fill(out, W, x, y, geo.plate, geo.plate, 245, 240, 228);
  for (let i = 0; i < geo.plate; i++) {
    for (const [px, py] of [[x+i,y],[x+i,y+geo.plate-1],[x,y+i],[x+geo.plate-1,y+i]]) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const j = (py * W + px) * 4;
      out[j]=216; out[j+1]=188; out[j+2]=102; out[j+3]=255;
    }
  }
  if (geo.modulePx < MIN_MODULE_PX) throw new Error('QR below module floor');
  const qrPng = await QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M', type: 'png', margin: 0, width: geo.qrPx,
    color: { dark: '#141914', light: '#f5f0e4' }
  });
  const qr = decodePng(qrPng);
  const qx = x + Math.floor((geo.plate - geo.qrPx) / 2);
  const qy = y + geo.pad;
  for (let row = 0; row < qr.height; row++) for (let col = 0; col < qr.width; col++) {
    const si = (row * qr.width + col) * 4;
    const dx = qx + col, dy = qy + row;
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
    const di = (dy * W + dx) * 4;
    out[di]=qr.rgba[si]; out[di+1]=qr.rgba[si+1]; out[di+2]=qr.rgba[si+2]; out[di+3]=255;
  }
  putHandle(out, W, handle, x + geo.pad, y + geo.pad + geo.qrPx + 4, geo.plate - geo.pad * 2);
  return {
    png: encodePng(out, W, H), warning: geo.warning, modulePx: geo.modulePx,
    plate: geo.plate, corner: c, checkUrl: payload, width: W, height: H
  };
}

export function assertPlatform(platform, w, h) {
  const p = PLATFORMS[platform];
  if (!p) throw new Error('unknown platform');
  if (w !== p.w || h !== p.h) throw new Error(`image must be ${p.w}×${p.h}`);
  return p;
}

let busy = false;
export function kickQueue() {
  setTimeout(() => { drainQueue().catch((e) => console.error('seal-queue', e && e.message)); }, 0);
}
export async function drainQueue() {
  if (busy) return;
  busy = true;
  try {
    for (;;) {
      const open = await listOpenJobs();
      const next = open.find((j) => j.status === 'pending');
      if (!next) break;
      await runJob(next.id);
    }
  } finally { busy = false; }
}
async function runJob(id) {
  const job = await getJob(id);
  if (!job || job.status !== 'pending') return;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  await saveJob(job);
  try {
    const account = await getAccount(job.wallet);
    if (!account || !account.paid || !account.paymentTx) throw new Error('payment required');
    if (!account.handle) throw new Error('handle missing');
    const pngBuf = Buffer.from(job.imageBase64, 'base64');
    const decoded = decodePng(pngBuf);
    assertPlatform(job.platform, decoded.width, decoded.height);

    const priorSerial = account.activeSerial || null;
    const serial = await nextSerial();
    if (priorSerial) {
      const prev = await getSeal(priorSerial);
      if (prev && prev.status === 'valid') {
        prev.status = 'superseded';
        prev.supersededAt = new Date().toISOString();
        prev.supersededBy = serial;
        await saveSeal(prev);
      }
    }
    const composed = await composeSeal(pngBuf, { serial, handle: account.handle, corner: job.corner || 'ur' });
    const seal = {
      serial, wallet: account.wallet, handle: account.handle,
      accountAge: account.accountAge || null, accountAgeSource: 'user-supplied',
      status: 'valid', platform: job.platform, corner: composed.corner,
      paymentTx: account.paymentTx, createdAt: new Date().toISOString(),
      warning: composed.warning, modulePx: composed.modulePx, plate: composed.plate,
      checkUrl: composed.checkUrl
    };
    await saveSeal(seal);
    await savePng(serial, composed.png);
    account.activeSerial = serial;
    account.seals = account.seals || [];
    if (!account.seals.includes(serial)) account.seals.push(serial);
    await saveAccount(account);
    delete job.imageBase64;
    job.resultSerial = serial;
    job.warning = composed.warning || null;
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
  } catch (err) {
    delete job.imageBase64;
    job.status = 'error';
    job.error = String(err && err.message ? err.message : err);
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
  }
}

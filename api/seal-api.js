/**
 * /api/seal — social seal API
 * Actions: session, activate, me, pay-quote, revoke, submit, job, platforms
 */
import {
  normWallet,
  normHandle,
  mintSession,
  readSession,
  verifyWalletSig,
  getAccount,
  saveAccount,
  getSeal,
  saveSeal,
  getJob,
  saveJob,
  newJobId,
  paymentQuote,
  verifyPayment,
  kickQueue,
  PLATFORMS,
  CORNERS,
  SEAL_PRICE_USDC,
  checkUrl
} from './_seal.js';
import { decodePng } from './_badge-og-render.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > 6_000_000) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sessionWallet(req) {
  const h = String(req.headers['x-seal-session'] || '');
  const auth = String(req.headers.authorization || '');
  const token = h || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  return readSession(token);
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-seal-session');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url || '/', 'http://local');
  const action = url.searchParams.get('action') || '';

  try {
    if (req.method === 'GET' && action === 'platforms') {
      return json(res, 200, { platforms: Object.values(PLATFORMS), corners: CORNERS, priceUsdc: SEAL_PRICE_USDC });
    }

    if (req.method === 'GET' && action === 'pay-quote') {
      const wallet = normWallet(url.searchParams.get('wallet'));
      if (!wallet) return json(res, 400, { error: 'wallet required' });
      return json(res, 200, paymentQuote(wallet));
    }

    if (req.method === 'GET' && action === 'me') {
      const wallet = sessionWallet(req);
      if (!wallet) return json(res, 401, { error: 'session required' });
      const account = await getAccount(wallet);
      if (!account) return json(res, 200, { wallet, registered: false });
      return json(res, 200, {
        registered: true,
        wallet: account.wallet,
        handle: account.handle,
        accountAge: account.accountAge,
        accountAgeSource: 'user-supplied',
        paid: !!account.paid,
        paymentTx: account.paymentTx || null,
        activeSerial: account.activeSerial || null,
        seals: account.seals || [],
        createdAt: account.createdAt
      });
    }

    if (req.method === 'GET' && action === 'job') {
      const wallet = sessionWallet(req);
      if (!wallet) return json(res, 401, { error: 'session required' });
      const id = url.searchParams.get('id');
      const job = await getJob(id);
      if (!job || job.wallet !== wallet) return json(res, 404, { error: 'job not found' });
      kickQueue(); // keep draining while client polls — backlog waits, never times out
      return json(res, 200, {
        id: job.id,
        status: job.status,
        resultSerial: job.resultSerial || null,
        warning: job.warning || null,
        error: job.error || null,
        checkUrl: job.resultSerial ? checkUrl(job.resultSerial) : null,
        imageUrl: job.resultSerial ? `/api/seal-image?serial=${encodeURIComponent(job.resultSerial)}` : null
      });
    }

    if (req.method === 'GET' && action === 'check') {
      // Public JSON for a serial (cacheable)
      const serial = String(url.searchParams.get('serial') || '').toUpperCase();
      const seal = await getSeal(serial);
      if (!seal) return json(res, 404, { error: 'unknown serial' });
      res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
      return json(res, 200, {
        serial: seal.serial,
        handle: seal.handle,
        accountAge: seal.accountAge,
        accountAgeSource: seal.accountAgeSource || 'user-supplied',
        status: seal.status,
        createdAt: seal.createdAt,
        paymentTx: seal.paymentTx,
        platform: seal.platform,
        warning: seal.warning || null,
        checkUrl: checkUrl(seal.serial),
        imageUrl: `/api/seal-image?serial=${encodeURIComponent(seal.serial)}`,
        qrUrl: `/api/seal-image?serial=${encodeURIComponent(seal.serial)}&qr=1`
      });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

    const raw = await readBody(req);
    let body = {};
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('application/json')) {
      body = JSON.parse(raw.toString('utf8') || '{}');
    } else if (ct.includes('multipart/form-data')) {
      return json(res, 415, { error: 'send JSON with base64 image (client resizes to platform PNG)' });
    } else {
      try {
        body = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        body = {};
      }
    }

    if (action === 'session') {
      // Wallet connect = login. Optional handle on first connect = entire signup.
      const wallet = normWallet(body.wallet);
      const message = String(body.message || '');
      const signature = String(body.signature || '');
      if (!wallet || !message || !signature) return json(res, 400, { error: 'wallet, message, signature required' });
      if (!message.includes(wallet)) return json(res, 400, { error: 'message must include wallet' });
      const ok = await verifyWalletSig(wallet, message, signature);
      if (!ok) return json(res, 401, { error: 'bad signature' });
      const token = mintSession(wallet);
      let account = await getAccount(wallet);
      const handle = normHandle(body.handle);
      const accountAge = String(body.accountAge || '').trim().slice(0, 32) || null;
      if (!account && handle) {
        account = {
          wallet,
          handle,
          accountAge,
          accountAgeSource: 'user-supplied',
          paid: false,
          paymentTx: null,
          createdAt: new Date().toISOString(),
          activeSerial: null,
          seals: []
        };
        await saveAccount(account);
      } else if (account && !account.handle && handle) {
        account.handle = handle;
        if (accountAge) account.accountAge = accountAge;
        await saveAccount(account);
      }
      return json(res, 200, {
        session: token,
        wallet,
        registered: !!account,
        needsHandle: !account || !account.handle,
        paid: !!(account && account.paid),
        handle: account ? account.handle : null
      });
    }

    if (action === 'activate') {
      // Payment gate only — handle must already be locked on the account at connect.
      const wallet = sessionWallet(req) || normWallet(body.wallet);
      const txHash = String(body.txHash || '');
      const message = String(body.message || '');
      const signature = String(body.signature || '');
      if (!wallet || !txHash) return json(res, 400, { error: 'wallet session and txHash required' });
      if (message && signature) {
        const ok = await verifyWalletSig(wallet, message, signature);
        if (!ok) return json(res, 401, { error: 'bad signature' });
      }
      const existing = await getAccount(wallet);
      if (!existing || !existing.handle) {
        return json(res, 400, { error: 'connect wallet and register handle first' });
      }
      if (existing.paid) {
        return json(res, 200, {
          session: mintSession(wallet),
          account: existing,
          alreadyPaid: true
        });
      }
      const pay = await verifyPayment(wallet, txHash);
      if (!pay.ok) return json(res, 402, { error: pay.error || 'payment required' });
      existing.paid = true;
      existing.paymentTx = pay.tx;
      existing.paymentAt = new Date().toISOString();
      await saveAccount(existing);
      return json(res, 200, { session: mintSession(wallet), account: existing, payment: pay });
    }

    if (action === 'revoke') {
      const wallet = sessionWallet(req);
      if (!wallet) return json(res, 401, { error: 'session required' });
      const account = await getAccount(wallet);
      if (!account) return json(res, 404, { error: 'no account' });
      const serial = String(body.serial || account.activeSerial || '').toUpperCase();
      const seal = await getSeal(serial);
      if (!seal || seal.wallet !== wallet) return json(res, 404, { error: 'seal not found' });
      seal.status = 'revoked';
      seal.revokedAt = new Date().toISOString();
      await saveSeal(seal);
      if (account.activeSerial === serial) account.activeSerial = null;
      await saveAccount(account);
      return json(res, 200, { serial, status: 'revoked' });
    }

    if (action === 'submit') {
      const wallet = sessionWallet(req);
      if (!wallet) return json(res, 401, { error: 'session required' });
      const account = await getAccount(wallet);
      if (!account || !account.paid) return json(res, 402, { error: 'pay $25 USDC on Base first' });
      const platform = String(body.platform || '');
      if (!PLATFORMS[platform]) return json(res, 400, { error: 'invalid platform' });
      const corner = CORNERS.includes(body.corner) ? body.corner : 'ur';
      const b64 = String(body.imageBase64 || '').replace(/^data:image\/png;base64,/, '');
      if (!b64) return json(res, 400, { error: 'imageBase64 PNG required' });
      let pngBuf;
      try {
        pngBuf = Buffer.from(b64, 'base64');
      } catch {
        return json(res, 400, { error: 'invalid base64' });
      }
      if (pngBuf.length > 5_500_000) return json(res, 400, { error: 'image too large' });
      let decoded;
      try {
        decoded = decodePng(pngBuf);
      } catch {
        return json(res, 400, { error: 'PNG decode failed — client must send PNG' });
      }
      const p = PLATFORMS[platform];
      if (decoded.width !== p.w || decoded.height !== p.h) {
        return json(res, 400, { error: `image must be exactly ${p.w}×${p.h}` });
      }

      // Handle always from account — never from request body
      const job = {
        id: newJobId(),
        wallet,
        platform,
        corner,
        status: 'pending',
        createdAt: new Date().toISOString(),
        imageBase64: b64,
        reissue: !!account.activeSerial
      };
      await saveJob(job);
      kickQueue();
      return json(res, 202, {
        jobId: job.id,
        status: 'pending',
        handle: account.handle,
        reissue: job.reissue,
        message: job.reissue
          ? 'Reissue queued (free). Prior serial becomes superseded when this finishes.'
          : 'Seal job queued. Poll job status — backlog waits, never times out.'
      });
    }

    return json(res, 404, { error: 'unknown action' });
  } catch (err) {
    console.error('seal-api', err);
    return json(res, 500, { error: String(err && err.message ? err.message : err) });
  }
}

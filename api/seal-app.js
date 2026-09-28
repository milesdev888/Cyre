/** /seal — wallet dashboard */
export default async function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>Cyre Seal</title>
<meta name="theme-color" content="#0a0f0a"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<link rel="manifest" href="/seal-manifest.webmanifest"/>
<link rel="apple-touch-icon" href="/c7-cobra-256.png"/>
<style>
:root{--bg:#0a0f0a;--panel:#101710;--line:#1e2a1e;--text:#ede7d5;--dim:#97a08d;--gold:#d8bc66;--ok:#5fbf7a;--bad:#d96a5e}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 480px at 50% -20%,#152015,var(--bg));color:var(--text);font:16px/1.45 "Segoe UI",ui-sans-serif,system-ui,sans-serif}
.wrap{max-width:560px;margin:0 auto;padding:20px 16px 96px}
h1{font-size:1.85rem;margin:.35rem 0 .2rem;letter-spacing:-.02em}
.lead{color:var(--dim);font-size:.9rem;margin:0 0 1rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:1rem;margin:0 0 .85rem}
.card h2{margin:0 0 .75rem;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}
label{display:block;font-size:.75rem;color:var(--dim);margin:.65rem 0 .3rem}
input,select{width:100%;padding:.75rem;border-radius:10px;border:1px solid var(--line);background:#0c120c;color:var(--text);font-size:16px}
button{appearance:none;border:0;border-radius:999px;padding:.75rem 1.1rem;font-weight:700;font-size:.95rem;cursor:pointer;background:linear-gradient(135deg,var(--gold),#e6cc7e);color:#0a0f0a}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
button:disabled{opacity:.45}
.row{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.75rem}
.pill{display:inline-block;padding:.2rem .65rem;border-radius:999px;border:1px solid var(--line);font-size:.75rem;color:var(--dim)}
.msg{display:none;margin-top:.65rem;padding:.7rem .8rem;border-radius:10px;font-size:.85rem}
.msg.show{display:block}
.msg.warn{background:rgba(217,106,94,.12);border:1px solid rgba(217,106,94,.35);color:#f0c2bc}
.msg.wait{border:1px dashed var(--gold);color:var(--gold)}
.msg.ok{border:1px solid rgba(95,191,122,.4);color:var(--ok)}
img.preview{display:none;width:100%;margin-top:.75rem;border-radius:12px;border:1px solid var(--line)}
.ios{display:none;margin-top:1rem;padding:.8rem;border-radius:12px;border:1px solid var(--line);font-size:.85rem;color:var(--dim)}
.mono{font:12px/1.4 ui-monospace,monospace;word-break:break-all;color:var(--dim)}
#signupFields{display:none}
</style>
</head>
<body>
<main class="wrap">
  <span class="pill">Base · USDC</span>
  <h1>Cyre Seal</h1>
  <p class="lead">Wallet is the account. Handle locks on first connect. Pay $25 USDC once on Base to unlock sealing. Reissue is free. QR stays ≥5px per module.</p>

  <section class="card">
    <h2>1 · Connect · signup</h2>
    <div id="signupFields">
      <label for="handle">Handle to seal (locked forever)</label>
      <input id="handle" placeholder="yourhandle" autocomplete="off" autocapitalize="off" spellcheck="false"/>
      <label for="age">Account age (user-supplied · labeled on check page)</label>
      <input id="age" placeholder="e.g. Mar 2018"/>
    </div>
    <div class="row">
      <button type="button" id="connectBtn">Connect wallet</button>
    </div>
    <div class="row"><span class="pill" id="walletPill">Not connected</span></div>
  </section>

  <section class="card">
    <h2>2 · Pay · $25 USDC on Base</h2>
    <p class="mono" id="payHint">Connect first. Same Base USDC treasury as x402.</p>
    <div class="row">
      <button type="button" id="payBtn">Pay $25 USDC</button>
      <button type="button" class="ghost" id="confirmBtn">I paid — submit tx</button>
    </div>
    <label for="txHash">Payment tx hash</label>
    <input id="txHash" class="mono" placeholder="0x…"/>
  </section>

  <section class="card">
    <h2>3 · Seal photo</h2>
    <label for="platform">Platform</label>
    <select id="platform">
      <option value="x_banner">X banner · 1500×500</option>
      <option value="x_avatar">X avatar · 400×400</option>
      <option value="tg_banner">Telegram banner · 1280×720</option>
      <option value="tg_avatar">Telegram avatar · 512×512</option>
    </select>
    <label for="corner">Corner</label>
    <select id="corner">
      <option value="ur" selected>Upper right</option>
      <option value="ul">Upper left</option>
      <option value="lr">Lower right</option>
      <option value="ll">Lower left</option>
    </select>
    <label for="file">Photo</label>
    <input id="file" type="file" accept="image/*"/>
    <div class="row">
      <button type="button" id="submitBtn">Generate seal</button>
      <button type="button" class="ghost" id="revokeBtn">Revoke active</button>
    </div>
    <div class="msg wait" id="waitMsg"></div>
    <div class="msg warn" id="warnMsg"></div>
    <div class="msg ok" id="okMsg"></div>
    <img class="preview" id="preview" alt="Sealed output"/>
  </section>

  <div class="ios" id="iosHint"><b style="color:var(--text)">Add to Home Screen:</b> Safari → Share → Add to Home Screen.</div>
</main>
<script>
const API = '/api/seal-api';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DIM = { x_banner:[1500,500], x_avatar:[400,400], tg_banner:[1280,720], tg_avatar:[512,512] };
let session = localStorage.getItem('sealSession') || '';
let wallet = localStorage.getItem('sealWallet') || '';
let quote = null;
let registered = false;

const $ = (id) => document.getElementById(id);
function show(el, text) { el.textContent = text; el.classList.add('show'); }
function hide(el) { el.classList.remove('show'); el.textContent = ''; }

function setPill() {
  $('walletPill').textContent = wallet ? wallet.slice(0,6)+'…'+wallet.slice(-4) : 'Not connected';
}
function showSignup(need) {
  $('signupFields').style.display = need ? 'block' : 'none';
}
setPill();
showSignup(true);

async function api(action, { qs = '', body } = {}) {
  const headers = {};
  if (session) headers['x-seal-session'] = session;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(API + '?action=' + encodeURIComponent(action) + qs, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.navigator.standalone && !matchMedia('(display-mode: standalone)').matches) {
  $('iosHint').style.display = 'block';
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/seal-sw.js').catch(()=>{});

async function refreshMe() {
  if (!session) return;
  try {
    const me = await api('me');
    registered = !!me.registered;
    showSignup(!me.registered || !me.handle);
    if (me.registered) {
      $('handle').value = me.handle || '';
      $('handle').disabled = !!me.handle;
      $('age').value = me.accountAge || '';
      $('age').disabled = !!me.handle;
      if (me.paid) $('payBtn').textContent = 'Paid · reissue free';
      if (me.activeSerial) {
        show($('okMsg'), 'Active ' + me.activeSerial);
        $('preview').style.display = 'block';
        $('preview').src = '/api/seal-image?serial=' + encodeURIComponent(me.activeSerial) + '&t=' + Date.now();
      }
    }
  } catch (e) { console.warn(e); }
}

$('connectBtn').onclick = async () => {
  try {
    if (!window.ethereum) throw new Error('No wallet');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    wallet = String(accounts[0] || '').toLowerCase();
    try { await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] }); }
    catch (e) {
      if (e && e.code === 4902) await ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: '0x2105', chainName: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org']
      }]});
      else throw e;
    }
    const handle = $('handle').value.trim();
    const accountAge = $('age').value.trim();
    // Probe without handle first if fields empty — existing accounts reconnect
    const message = 'Cyre Seal login\\nWallet: ' + wallet + '\\nAt: ' + new Date().toISOString();
    const signature = await ethereum.request({ method: 'personal_sign', params: [message, wallet] });
    let out = await api('session', { body: { wallet, message, signature } });
    if (out.needsHandle) {
      if (!handle) throw new Error('Enter the handle to seal, then connect again');
      out = await api('session', { body: { wallet, message, signature, handle, accountAge } });
      if (out.needsHandle) throw new Error('Handle required to finish signup');
    }
    session = out.session;
    localStorage.setItem('sealSession', session);
    localStorage.setItem('sealWallet', wallet);
    setPill();
    quote = await api('pay-quote', { qs: '&wallet=' + encodeURIComponent(wallet) });
    $('payHint').textContent = 'Send exactly ' + quote.amount + ' USDC to ' + quote.payTo;
    await refreshMe();
    show($('okMsg'), out.registered ? ('Signed in as @' + (out.handle || handle)) : 'Connected');
  } catch (e) { alert(e.message || e); }
};

function padAddr(a){ return a.toLowerCase().replace(/^0x/,'').padStart(64,'0'); }
function padUint(n){ return BigInt(n).toString(16).padStart(64,'0'); }

$('payBtn').onclick = async () => {
  try {
    if (!wallet || !session) throw new Error('Connect first');
    if (!quote) quote = await api('pay-quote', { qs: '&wallet=' + encodeURIComponent(wallet) });
    const data = '0xa9059cbb' + padAddr(quote.payTo) + padUint(quote.amountAtomic);
    const tx = await ethereum.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: USDC, data, value: '0x0' }] });
    $('txHash').value = tx;
    show($('okMsg'), 'Tx submitted. Wait for confirmation, then submit.');
  } catch (e) { alert(e.message || e); }
};

$('confirmBtn').onclick = async () => {
  try {
    if (!wallet || !session) throw new Error('Connect first');
    const txHash = $('txHash').value.trim();
    if (!txHash) throw new Error('Tx hash required');
    const message = 'Cyre Seal pay\\nWallet: ' + wallet + '\\nTx: ' + txHash;
    const signature = await ethereum.request({ method: 'personal_sign', params: [message, wallet] });
    const out = await api('activate', { body: { wallet, txHash, message, signature } });
    session = out.session; localStorage.setItem('sealSession', session);
    await refreshMe();
    show($('okMsg'), out.alreadyPaid ? 'Already paid — reissue free' : 'Payment recorded · sealing unlocked');
  } catch (e) { alert(e.message || e); }
};

function toPlatformPng(file, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const scale = Math.max(w / img.width, h / img.height);
      const sw = w / scale, sh = h / scale;
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      c.toBlob((blob) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(blob);
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$('submitBtn').onclick = async () => {
  try {
    if (!session) throw new Error('Connect first');
    const file = $('file').files[0];
    if (!file) throw new Error('Choose a photo');
    const platform = $('platform').value;
    const corner = $('corner').value;
    const [w, h] = DIM[platform];
    hide($('warnMsg')); show($('waitMsg'), 'Preparing image…');
    const imageBase64 = await toPlatformPng(file, w, h);
    show($('waitMsg'), 'Queued — one job at a time (never times out).');
    const out = await api('submit', { body: { platform, corner, imageBase64 } });
    for (;;) {
      const j = await api('job', { qs: '&id=' + encodeURIComponent(out.jobId) });
      if (j.status === 'pending' || j.status === 'running') {
        show($('waitMsg'), j.status === 'running' ? 'Sealing…' : 'Queued behind another job…');
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      hide($('waitMsg'));
      if (j.status === 'error') throw new Error(j.error || 'job failed');
      if (j.warning) show($('warnMsg'), j.warning);
      $('preview').style.display = 'block';
      $('preview').src = j.imageUrl + (j.imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
      show($('okMsg'), 'Serial ' + j.resultSerial + (out.reissue ? ' (reissue)' : ''));
      const a = document.createElement('a');
      a.href = j.imageUrl; a.download = j.resultSerial + '.png'; a.click();
      await refreshMe();
      return;
    }
  } catch (e) { hide($('waitMsg')); alert(e.message || e); }
};

$('revokeBtn').onclick = async () => {
  if (!confirm('Revoke active seal?')) return;
  try {
    const out = await api('revoke', { body: {} });
    show($('warnMsg'), 'Revoked ' + out.serial);
    $('preview').style.display = 'none';
    await refreshMe();
  } catch (e) { alert(e.message || e); }
};

if (session && wallet) {
  api('pay-quote', { qs: '&wallet=' + encodeURIComponent(wallet) })
    .then((q) => { quote = q; $('payHint').textContent = 'Send exactly ' + q.amount + ' USDC to ' + q.payTo; })
    .catch(() => {});
  refreshMe();
}
</script>
</body>
</html>`);
}

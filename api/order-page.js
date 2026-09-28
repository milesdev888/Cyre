// api/order-page.js — Checkout + order-status UI for paid Cyre Verified.
// /order?mint=… creates (via API) when qualifying; /order/:id shows status + USDC + $C7 lanes.
// USDC chain chosen at create via "Pay with USDC on…" (ethereum|base|arbitrum|solana).
// Footer disclaimer; locked vocabulary; no investment-speak.

import {
  resolveOrder,
  publicOrderView,
  USDC_USD,
  C7_USD,
  applyExpiry,
  USDC_CHAIN_IDS,
  USDC_CHAINS,
  isUsdcChainLive
} from './_badge-order.js';

const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';
const CONTACT_URL = process.env.BADGE_SUPPORT_URL || 'https://x.com/cyre';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function usdcOptionsHtml(selected) {
  return USDC_CHAIN_IDS.map((id) => {
    const m = USDC_CHAINS[id];
    const live = isUsdcChainLive(id);
    const sel = live && id === selected ? ' selected' : '';
    const dis = live ? '' : ' disabled';
    const label = live ? m.name : `${m.name} (coming soon)`;
    return `<option value="${esc(id)}"${sel}${dis}>${esc(label)}</option>`;
  }).join('');
}

export default async function handler(req, res) {
  const q = req.query || {};
  const orderId = String(q.id || q.order || '').trim().toUpperCase();
  const mintParam = String(q.mint || '').trim();
  const tokenParam = String(q.token || '').trim();
  const usdcChainParam = String(q.usdcChain || q.chain || 'base')
    .trim()
    .toLowerCase();
  let order = null;
  if (orderId || tokenParam) {
    order = await resolveOrder({ id: orderId, token: tokenParam });
    if (order) order = applyExpiry(order);
  }

  const title = order
    ? `Order ${order.id} · Cyre Verified`
    : 'Get Cyre Verified · Checkout';
  const desc = `Pay $${USDC_USD} USDC on Ethereum, Base, Arbitrum, or Solana — or $${C7_USD} in $C7 on Solana. Amounts locked 30 minutes. Founder brand-safety approval required after payment.`;

  const boot = order
    ? publicOrderView(order)
    : { mint: mintParam || null, usdcChain: usdcChainParam || 'base' };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(order ? SITE + '/order/' + order.id : SITE + '/order')}">
<link rel="icon" href="/c7-cobra-256.png?v=c7g2" type="image/png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#0E1622;--panel:#121C2B;--line:#2A3A51;--gold:#5A82BF;--live:#3ddc84;--bad:#d96a5e;--text:#ECE8DF;--dim:#9AA5B4}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,rgba(90,130,191,.12),transparent 55%),linear-gradient(180deg,#0E1622,#0E1622 40%,#0E1622);color:var(--text);font:400 15px/1.55 "IBM Plex Sans",system-ui,sans-serif}
a{color:var(--gold)}
.wrap{max-width:720px;margin:0 auto;padding:28px 18px 64px}
nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;font-size:14px}
.brand{font-family:"Cormorant Garamond",serif;font-weight:700;font-size:22px;color:var(--text);text-decoration:none}
.brand span{color:var(--gold)}
h1{font-family:"Cormorant Garamond",serif;font-weight:700;font-size:clamp(26px,5vw,36px);line-height:1.15;margin:8px 0 10px}
.sub{color:var(--dim);max-width:540px}
.cta-line{margin-top:18px;font-family:"IBM Plex Mono",monospace;font-size:14px;color:var(--gold);letter-spacing:.02em}
.panel{margin-top:22px;padding:18px 16px;background:rgba(18,26,22,.92);border:1px solid var(--line);border-radius:10px}
.panel h2{font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.1em;color:var(--gold);margin-bottom:12px}
.row{display:flex;flex-wrap:wrap;gap:10px 18px;margin:6px 0;font-size:14px}
.row b{color:var(--dim);font-weight:500;min-width:110px}
.mono{font-family:"IBM Plex Mono",monospace;font-size:13px;word-break:break-all}
.lanes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
@media(max-width:640px){.lanes{grid-template-columns:1fr}}
.lane{padding:14px;border:1px solid var(--line);border-radius:8px;background:rgba(10,16,14,.65)}
.lane h3{font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.08em;color:var(--gold);margin-bottom:8px}
.lane .amt{font-size:22px;font-weight:600;margin:4px 0 8px}
.lane .amt span{font-size:13px;color:var(--dim);font-weight:500}
.lane p{font-size:13px;color:var(--dim);line-height:1.5}
.chain-chip{display:inline-flex;align-items:center;gap:8px;margin:6px 0 10px;padding:6px 10px;border-radius:6px;border:1px solid rgba(90,130,191,.35);background:rgba(90,130,191,.08);font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--gold)}
.help{margin-top:12px;padding:10px 12px;border-radius:8px;border:1px dashed rgba(138,154,144,.45);color:var(--dim);font-size:12.5px;line-height:1.55}
.btn{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;padding:12px 18px;border-radius:8px;border:0;background:var(--gold);color:var(--ink);font:600 14px/1 "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;text-decoration:none}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--gold);border:1px solid rgba(90,130,191,.45);margin-left:8px}
.btn-pay{display:flex;width:100%;margin-top:12px;padding:14px 16px;font-size:15px}
.btn-copy{display:inline-flex;align-items:center;margin:4px 6px 0 0;padding:6px 10px;border-radius:6px;border:1px solid rgba(90,130,191,.4);background:transparent;color:var(--gold);font:500 12px/1 "IBM Plex Sans",system-ui,sans-serif;cursor:pointer}
.pay-fallback{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px}
.qr-wrap{display:none;margin-top:14px;text-align:center}
.qr-wrap img{width:180px;height:180px;border-radius:8px;background:#fff;padding:8px;box-sizing:border-box}
.qr-wrap p{margin-top:8px;font-size:12px;color:var(--dim)}
@media(min-width:641px){.qr-wrap{display:block}}
.status{display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid var(--line);font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.06em}
.status.live{border-color:rgba(61,220,132,.45);color:var(--live)}
.status.wait{border-color:rgba(90,130,191,.45);color:var(--gold)}
.status.bad{border-color:rgba(217,106,94,.45);color:var(--bad)}
.copy{cursor:pointer;text-decoration:underline;text-underline-offset:2px}
select.field,input.field{width:100%;padding:12px 14px;border-radius:8px;border:1px solid var(--line);background:#0E1622;color:var(--text);font:500 14px/1.4 "IBM Plex Sans",system-ui,sans-serif}
select.field{margin-top:8px;cursor:pointer}
label.field-label{display:block;margin-top:14px;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.08em;color:var(--gold)}
#msg{margin-top:14px;color:var(--dim);font-size:13.5px;min-height:1.2em}
.issued a{display:inline-block;margin-top:8px;margin-right:12px}
footer{margin-top:36px;padding-top:18px;border-top:1px solid var(--line);color:var(--dim);font-size:12.5px;line-height:1.65}
.lock-note{margin-top:10px;font-size:12.5px;color:var(--dim)}
#usdcRefRow{display:none}
</style>
</head>
<body>
<div class="wrap">
  <nav>
    <a class="brand" href="/">Cyre <span>Verified</span></a>
    <span style="display:flex;gap:16px;font-size:14px">
      <a href="/builders">Builders</a>
      <a href="/verify">Verify</a>
    </span>
  </nav>
  <p class="cta-line" id="cta">Get Cyre Verified — $${USDC_USD} USDC or $${C7_USD} in $C7.</p>
  <h1 id="heading">${order ? esc(order.id) : 'Checkout'}</h1>
  <p class="sub" id="sub">${
    order
      ? 'Amounts are locked for 30 minutes. Pay from any wallet — no wallet-connect. After payment, the order enters founder brand-safety approval before a serial is issued.'
      : 'Enter a mint that already passed Cyre qualifying-path gates on a live scan. Choose the USDC network before locking — the watcher matches only that chain.'
  }</p>

  <div class="panel" id="startPanel" style="${order ? 'display:none' : ''}">
    <h2>MINT</h2>
    <input id="mintInput" class="field mono" placeholder="Token mint address" value="${esc(mintParam)}" />
    <label class="field-label" for="usdcChainSelect">PAY WITH USDC ON…</label>
    <select id="usdcChainSelect" class="field" aria-label="Pay with USDC on">
      ${usdcOptionsHtml(
        isUsdcChainLive(usdcChainParam) ? usdcChainParam : 'base'
      )}
    </select>
    <p class="lock-note">Disabled networks are held until a receiving treasury is confirmed. $C7 on Solana remains available after the order locks.</p>
    <button class="btn" id="startBtn" type="button">Create locked order</button>
    <p class="lock-note">Price and $C7 amount lock for 30 minutes at order creation. Unpaid orders expire.</p>
  </div>

  <div class="panel" id="orderPanel" style="${order ? '' : 'display:none'}">
    <h2>ORDER</h2>
    <div class="row"><b>Status</b> <span class="status wait" id="statusPill">${esc(order ? order.status : '')}</span></div>
    <div class="row"><b>Mint</b> <span class="mono" id="mintOut">${esc(order ? order.mint : '')}</span></div>
    <div class="row"><b>Token</b> <span id="tokenOut">${esc(order ? [order.name, order.symbol && '$' + order.symbol].filter(Boolean).join(' · ') : '')}</span></div>
    <div class="row"><b>Path</b> <span id="pathOut">${esc(order && order.qualifySnapshot ? order.qualifySnapshot.pathLabel || order.qualifySnapshot.path : '')}</span></div>
    <div class="row"><b>Locked until</b> <span class="mono" id="lockOut">${esc(order ? order.expiresAt : '')}</span></div>

    <div class="lanes" id="lanes">
      <div class="lane" id="laneUsdc">
        <h3 id="usdcLaneTitle">LANE A · USDC</h3>
        <div class="chain-chip" id="usdcChainChip">—</div>
        <div class="amt" id="usdcAmt">— <span>USDC</span></div>
        <p id="usdcNote">Tap Pay to open your wallet with USDC prefilled on the locked network. Or copy address + amount.</p>
        <a class="btn btn-pay" id="usdcPayBtn" href="#" rel="noopener">Pay USDC</a>
        <div class="pay-fallback">
          <button type="button" class="btn-copy" data-copy-from="usdcTo">Copy address</button>
          <button type="button" class="btn-copy" data-copy-from="usdcDisplay">Copy amount</button>
        </div>
        <p class="mono" style="margin-top:10px">Network: <span id="usdcNetwork">—</span> · <a id="usdcExplorer" href="#" target="_blank" rel="noreferrer">Explorer</a></p>
        <p class="mono">Treasury: <span class="copy" id="usdcTo">—</span></p>
        <p class="mono">Amount: <span class="copy" id="usdcDisplay">—</span></p>
        <p class="mono" id="usdcRefRow">Reference: <span class="copy" id="usdcRef">—</span></p>
        <p class="mono" id="usdcAssetRow" style="display:none">USDC: <span class="copy" id="usdcAsset">—</span></p>
        <p class="help" id="usdcWrongChainHelp">Sent on the wrong chain? Contact us — funds are safe at the shared treasury address; we match only the locked network.</p>
      </div>
      <div class="lane" id="laneC7">
        <h3>LANE B · $C7 ON SOLANA</h3>
        <div class="amt" id="c7Amt">— <span>$C7</span></div>
        <p>Tap Pay to open a Solana wallet with treasury, amount, $C7 mint, and reference attached — matching is deterministic.</p>
        <a class="btn btn-pay" id="c7PayBtn" href="#" rel="noopener">Pay $C7</a>
        <div class="qr-wrap" id="c7QrWrap">
          <img id="c7Qr" alt="Solana Pay QR" width="180" height="180" />
          <p>Desktop: scan with Phantom / Solflare</p>
        </div>
        <div class="pay-fallback">
          <button type="button" class="btn-copy" data-copy-from="c7To">Copy treasury</button>
          <button type="button" class="btn-copy" data-copy-from="c7Display">Copy amount</button>
          <button type="button" class="btn-copy" data-copy-from="c7Ref">Copy reference</button>
        </div>
        <p class="mono" style="margin-top:10px">Treasury: <span class="copy" id="c7To">—</span></p>
        <p class="mono">Amount: <span class="copy" id="c7Display">—</span></p>
        <p class="mono">Reference: <span class="copy" id="c7Ref">—</span></p>
      </div>
    </div>

    <p class="help" id="wrongChainHelp">
      Sent on the wrong chain? <a href="${esc(CONTACT_URL)}" target="_blank" rel="noreferrer">Contact us</a> — funds are safe at our treasury address on each supported network.
    </p>

    <button class="btn" id="watchBtn" type="button">I paid — check matching</button>
    <button class="btn btn-ghost" id="refreshBtn" type="button">Refresh status</button>

    <div class="issued" id="issuedBox" style="display:none;margin-top:16px">
      <p>Serial issued. Your links:</p>
      <a id="verifyLink" href="#">Verify page</a>
      <a id="sealLink" href="#">Seal PNG</a>
      <div style="margin-top:14px">
        <a class="btn" id="shareSealBtn" href="#" target="_blank" rel="noreferrer">Share your seal on X</a>
      </div>
    </div>
  </div>

  <p id="msg"></p>

  <footer>
    Cyre Verified is a measured qualifying-path seal with live re-check — patterns and lock evidence, not investment advice.
    Digital assets are volatile. Payment locks an amount for matching only; it does not guarantee issuance.
    Founder brand-safety approval is required after payment. Unpaid orders expire after 30 minutes.
    USDC is accepted on Ethereum, Base, Arbitrum, and Solana (chain chosen when the order locks). Robinhood Chain is excluded until canonical USDC is confirmed.
    $C7 payments are recorded in the burn ledger and burned weekly (tx published).
    Verify serials only at cyre.dev/verify. Comp issuance uses a separate registry path and never appears as a paid order.
  </footer>
</div>
<script>
(function(){
  var boot = ${JSON.stringify(boot)};
  var msg = document.getElementById('msg');
  function setMsg(t, bad){ msg.textContent = t || ''; msg.style.color = bad ? 'var(--bad)' : 'var(--dim)'; }
  function pillClass(st){
    if (st === 'ISSUED' || st === 'PENDING_FOUNDER_APPROVAL' || st === 'PAID') return 'status live';
    if (st === 'EXPIRED' || st === 'REJECTED' || st === 'QUALIFY_LOST' || st === 'REFUNDED') return 'status bad';
    return 'status wait';
  }
  function eip681Usdc(usdc){
    if (!usdc) return '';
    if (usdc.eip681Url) return usdc.eip681Url;
    var token = usdc.asset || '';
    var to = usdc.to || '';
    var atomic = usdc.amountAtomic || '';
    var chainId = usdc.chainId || 8453;
    if (!token || !to || !atomic) return '';
    return 'ethereum:' + token + '@' + chainId + '/transfer?address=' + to + '&uint256=' + atomic;
  }
  function setPayLink(el, href, enabled){
    if (!el) return;
    if (href && enabled){
      el.href = href;
      el.removeAttribute('aria-disabled');
      el.style.pointerEvents = '';
      el.style.opacity = '';
    } else {
      el.href = '#';
      el.setAttribute('aria-disabled', 'true');
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    }
  }
  function render(o){
    if (!o || !o.id) return;
    document.getElementById('startPanel').style.display = 'none';
    document.getElementById('orderPanel').style.display = '';
    document.getElementById('heading').textContent = o.id;
    var st = o.status || '';
    var pill = document.getElementById('statusPill');
    pill.textContent = st;
    pill.className = pillClass(st);
    document.getElementById('mintOut').textContent = o.mint || '';
    document.getElementById('tokenOut').textContent = [o.name, o.symbol ? ('$'+o.symbol) : ''].filter(Boolean).join(' · ');
    document.getElementById('pathOut').textContent = (o.qualifySnapshot && (o.qualifySnapshot.pathLabel || o.qualifySnapshot.path)) || '';
    document.getElementById('lockOut').textContent = o.expiresAt || (o.locked && o.locked.lockedUntil) || '';
    var usdc = (o.payment && (o.payment.usdc || o.payment.usdcBase)) || null;
    var c7 = o.payment && o.payment.c7Solana;
    var awaiting = st === 'AWAITING_PAYMENT';
    if (usdc){
      var chainName = usdc.chainName || usdc.chain || 'USDC';
      document.getElementById('usdcLaneTitle').textContent = 'LANE A · USDC ON ' + String(chainName).toUpperCase();
      document.getElementById('usdcChainChip').textContent = chainName + ' · watch this network only';
      document.getElementById('usdcAmt').innerHTML = (usdc.amountDisplay || '') + ' <span>USDC</span>';
      document.getElementById('usdcNote').innerHTML = usdc.note || ('Send the <b>exact</b> locked amount on ' + chainName + ' to the treasury.');
      document.getElementById('usdcNetwork').textContent = chainName;
      document.getElementById('usdcTo').textContent = usdc.to || '';
      document.getElementById('usdcDisplay').textContent = usdc.amountDisplay || '';
      document.getElementById('usdcDisplay').textContent = usdc.amountDisplay || '';
      setPayLink(document.getElementById('usdcPayBtn'), usdc.eip681Url || eip681Usdc(usdc), awaiting && usdc.family !== 'solana');
      var exp = document.getElementById('usdcExplorer');
      if (usdc.explorerAddressUrl){
        exp.href = usdc.explorerAddressUrl;
        exp.textContent = (usdc.explorerName || 'Explorer') + ' · treasury';
        exp.style.display = '';
      } else {
        exp.style.display = 'none';
      }
      var refRow = document.getElementById('usdcRefRow');
      if (usdc.reference){
        refRow.style.display = '';
        document.getElementById('usdcRef').textContent = usdc.reference;
      } else {
        refRow.style.display = 'none';
      }
      var assetRow = document.getElementById('usdcAssetRow');
      if (usdc.asset){
        assetRow.style.display = '';
        document.getElementById('usdcAsset').textContent = usdc.asset;
      }
      // Solana USDC: use Solana Pay link instead of EIP-681
      if (usdc.family === 'solana'){
        setPayLink(document.getElementById('usdcPayBtn'), usdc.solanaPayUrl || '', awaiting && !!usdc.solanaPayUrl);
      }
    }
    if (c7){
      document.getElementById('c7Amt').innerHTML = (c7.amountDisplay || '') + ' <span>$C7</span>';
      document.getElementById('c7To').textContent = c7.to || '';
      document.getElementById('c7Display').textContent = c7.amountDisplay || '';
      document.getElementById('c7Ref').textContent = c7.reference || '';
      var payUrl = c7.solanaPayUrl || '';
      setPayLink(document.getElementById('c7PayBtn'), payUrl, awaiting && !!payUrl);
      var qr = document.getElementById('c7Qr');
      var qrWrap = document.getElementById('c7QrWrap');
      if (qr && payUrl && awaiting){
        qr.src = 'https://quickchart.io/qr?size=180&margin=1&text=' + encodeURIComponent(payUrl);
        qr.alt = 'Solana Pay QR for ' + (o.id || 'order');
        if (qrWrap) qrWrap.style.display = '';
      } else if (qrWrap) {
        qrWrap.style.display = 'none';
      }
    }
    document.getElementById('lanes').style.opacity = awaiting ? '1' : '.55';
    document.getElementById('watchBtn').disabled = !awaiting;
    if (o.issuance && o.issuance.serial){
      document.getElementById('issuedBox').style.display = '';
      var vUrl = o.issuance.verifyUrl || ('https://cyre.dev/verify/' + o.issuance.serial);
      document.getElementById('verifyLink').href = vUrl;
      document.getElementById('verifyLink').textContent = 'Verify · ' + o.issuance.serial;
      document.getElementById('sealLink').href = o.issuance.sealUrl || ('/api/seal/' + o.issuance.serial + '.png');
      var shareText = 'Cyre Verified · ' + o.issuance.serial + '\\n' + vUrl;
      document.getElementById('shareSealBtn').href =
        'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText);
    }
    if (o.id && location.pathname.indexOf(o.id) < 0){
      try { history.replaceState(null, '', '/order/' + o.id + (o.token ? ('?token=' + encodeURIComponent(o.token)) : '')); } catch (e) {}
    }
  }
  async function createOrder(){
    var mint = (document.getElementById('mintInput').value || '').trim();
    var usdcChain = (document.getElementById('usdcChainSelect').value || 'base').trim();
    if (!mint){ setMsg('Mint required.', true); return; }
    setMsg('Checking qualifying-path gates…');
    document.getElementById('startBtn').disabled = true;
    try {
      var r = await fetch('/api/badge/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ mint: mint, usdcChain: usdcChain })
      });
      var j = await r.json();
      if (!r.ok){
        setMsg(j.error || j.detail || 'Checkout unavailable for this mint.', true);
        document.getElementById('startBtn').disabled = false;
        return;
      }
      setMsg('Order locked for 30 minutes · USDC on ' + ((j.payment && j.payment.usdc && j.payment.usdc.chainName) || usdcChain) + '.');
      boot = j;
      if (j.token) {
        try { history.replaceState(null, '', '/order/' + j.id + '?token=' + encodeURIComponent(j.token)); } catch (e) {}
      }
      render(j);
    } catch (e){
      setMsg('Could not create order.', true);
      document.getElementById('startBtn').disabled = false;
    }
  }
  async function ensureToken(id){
    if (boot.token) return boot.token;
    if (!id) return null;
    try {
      var r = await fetch('/api/badge/order?id=' + encodeURIComponent(id), { headers: { accept: 'application/json' } });
      var j = await r.json();
      if (r.ok && j.token){ boot = j; return j.token; }
    } catch (e) {}
    return null;
  }
  async function refresh(){
    if (!boot.id && !(document.getElementById('mintOut').textContent)) return;
    var id = boot.id || document.getElementById('heading').textContent;
    var q = '/api/badge/order?id=' + encodeURIComponent(id);
    if (boot.token) q += '&token=' + encodeURIComponent(boot.token);
    var r = await fetch(q, { headers: { accept: 'application/json' } });
    var j = await r.json();
    if (r.ok){ boot = j; render(j); setMsg('Status refreshed.'); }
  }
  async function watch(){
    var id = boot.id || document.getElementById('heading').textContent;
    setMsg('Watching for matching transfer on the locked USDC network (or $C7)…');
    var tok = await ensureToken(id);
    var r = await fetch('/api/badge/order/watch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ orderId: id, token: tok || boot.token || null })
    });
    var j = await r.json();
    if (j.order){ boot = j.order; render(j.order); }
    if (!j.ok && j.needToken){
      setMsg(j.error || 'Order not registered in watcher — reopen checkout from the create response (signed token).', true);
      return;
    }
    var hit = (j.results || []).find(function(x){ return x.matched; });
    if (hit && hit.accepted) setMsg('Payment matched · queued for founder approval.');
    else if (hit && !hit.accepted) setMsg(hit.reason || 'Payment seen but mint no longer qualifies — refund path.', true);
    else if (j.watched === 0 && !j.order) setMsg(j.error || 'Watcher could not load this order. Refresh status, then check matching again.', true);
    else setMsg('No matching transfer yet. Pay the exact locked amount on the selected network, then check again.');
  }
  document.getElementById('startBtn').addEventListener('click', createOrder);
  document.getElementById('watchBtn').addEventListener('click', watch);
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  function copyText(t){
    if (!t || t === '—') return;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ setMsg('Copied.'); });
  }
  document.querySelectorAll('.copy').forEach(function(el){
    el.addEventListener('click', function(){ copyText(el.textContent); });
  });
  document.querySelectorAll('.btn-copy').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-copy-from');
      var src = id && document.getElementById(id);
      copyText(src ? src.textContent : '');
    });
  });
  document.getElementById('usdcPayBtn').addEventListener('click', function(ev){
    if (this.getAttribute('aria-disabled') === 'true' || this.href === '#' || this.href.endsWith('/#')) {
      ev.preventDefault();
      setMsg('Order not ready for payment.', true);
    } else {
      setMsg('Opening wallet for Base USDC…');
    }
  });
  document.getElementById('c7PayBtn').addEventListener('click', function(ev){
    if (this.getAttribute('aria-disabled') === 'true' || !String(this.getAttribute('href') || '').startsWith('solana:')) {
      ev.preventDefault();
      setMsg('Order not ready for $C7 payment.', true);
    } else {
      setMsg('Opening Solana wallet with reference attached…');
    }
  });
  try {
    var qt = new URLSearchParams(location.search).get('token');
    if (qt && boot) boot.token = qt;
  } catch (e) {}
  (async function bootLoad(){
    if (boot && boot.id){ render(boot); return; }
    // RegExp ctor: a \\/ regex inside this outer template literal collapses to //order/... and kills the page script.
    var pathId = (location.pathname.match(new RegExp('/order/(ORD-[A-Za-z0-9-]+)', 'i')) || [])[1];
    if (pathId){
      var tok = await ensureToken(pathId);
      if (tok || (boot && boot.id)){ render(boot); return; }
    }
    if (boot && boot.mint){
      document.getElementById('mintInput').value = boot.mint;
      if (boot.usdcChain) document.getElementById('usdcChainSelect').value = boot.usdcChain;
    }
  })();
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
}

/**
 * Public check page /s/:serial — valid | revoked | superseded.
 * Single DB read. Cacheable. Loud red revoked. Expandable QR.
 */
import { getSeal, checkUrl } from './_seal.js';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  let serial = String(url.searchParams.get('serial') || '').toUpperCase();
  // /s/CS-… path rewrite may land as ?serial=
  if (!serial && url.pathname.startsWith('/s/')) {
    serial = decodeURIComponent(url.pathname.slice(3)).toUpperCase();
  }

  const seal = serial ? await getSeal(serial) : null;
  if (seal) serial = seal.serial;
  const status = seal ? seal.status : 'missing';
  const handle = seal ? seal.handle : null;
  const age = seal ? seal.accountAge : null;
  const ageLabel = 'user-supplied';

  const title =
    status === 'revoked'
      ? `REVOKED · @${handle || '?'}`
      : status === 'superseded'
        ? `Superseded · @${handle || '?'}`
        : status === 'valid'
          ? `Valid · @${handle}`
          : 'Seal not found';

  const tone =
    status === 'revoked' ? 'revoked' : status === 'superseded' ? 'superseded' : status === 'valid' ? 'valid' : 'missing';

  res.statusCode = seal ? 200 : 404;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} · Cyre Seal</title>
<meta name="robots" content="noindex"/>
<style>
:root{--bg:#070b07;--panel:#101710;--line:#1e2a1e;--text:#ede7d5;--dim:#97a08d;--gold:#d8bc66;--ok:#5fbf7a;--bad:#e24b4b;--warn:#c9a227}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,#152015,var(--bg));color:var(--text);font-family:ui-sans-serif,system-ui,sans-serif}
.wrap{max-width:440px;margin:0 auto;padding:28px 18px 48px}
.brand{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:22px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px 20px;position:relative}
.card.revoked{border-color:var(--bad);box-shadow:0 0 0 3px rgba(226,75,75,.25),0 20px 50px rgba(226,75,75,.15)}
.card.superseded{border-color:var(--warn)}
.card.valid{border-color:rgba(95,191,122,.45)}
.state{display:inline-block;font-weight:800;font-size:13px;letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;border-radius:999px;margin-bottom:16px}
.state.revoked{background:var(--bad);color:#fff;font-size:15px;padding:10px 16px;animation:pulse 1.6s ease-in-out infinite}
.state.superseded{background:rgba(201,162,39,.2);color:var(--warn)}
.state.valid{background:rgba(95,191,122,.18);color:var(--ok)}
.state.missing{background:#222;color:var(--dim)}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
h1{margin:0 0 6px;font-size:28px;letter-spacing:-.02em}
.sub{color:var(--dim);font-size:14px;line-height:1.5;margin:0 0 18px}
.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:14px}
.row span{color:var(--dim)}
.row b{font-weight:600;text-align:right;word-break:break-all}
.banner{margin:14px 0 0;padding:14px;border-radius:12px;font-weight:700;font-size:15px;line-height:1.35}
.banner.revoked{background:var(--bad);color:#fff}
.banner.superseded{background:rgba(201,162,39,.15);color:var(--warn)}
.qr-btn{position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:#0c120c;display:grid;place-items:center;cursor:pointer}
.qr-btn img{width:28px;height:28px;image-rendering:pixelated}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:24px;z-index:20}
.modal.open{display:flex}
.modal img{width:min(88vw,360px);height:auto;background:#fff;border-radius:16px;padding:16px}
.foot{margin-top:22px;color:var(--dim);font-size:12px;line-height:1.5}
a{color:var(--gold)}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">Cyre Guardian · Seal check</div>
  <div class="card ${tone}">
    ${
      seal
        ? `<button class="qr-btn" id="qrBtn" type="button" aria-label="Show full-size QR"><img src="/api/seal-image?serial=${esc(serial)}&qr=1" alt=""/></button>`
        : ''
    }
    <div class="state ${tone}">${esc(status === 'revoked' ? 'REVOKED' : status.toUpperCase())}</div>
    ${
      status === 'revoked'
        ? `<div class="banner revoked">This seal was revoked. Do not trust the profile showing it — treat as an impersonation risk.</div>`
        : status === 'superseded'
          ? `<div class="banner superseded">A newer seal exists for this account. This image is an old export.</div>`
          : ''
    }
    <h1>${seal ? '@' + esc(handle) : 'Unknown seal'}</h1>
    <p class="sub">${
      seal
        ? 'Handle and age come from the wallet account that paid for this seal — not from the image file.'
        : 'No seal is registered for this serial.'
    }</p>
    ${
      seal
        ? `<div class="row"><span>Serial</span><b>${esc(serial)}</b></div>
           <div class="row"><span>Account age</span><b>${esc(age || '—')} <small style="color:var(--dim);font-weight:500">(${esc(ageLabel)})</small></b></div>
           <div class="row"><span>Issued</span><b>${esc((seal.createdAt || '').slice(0, 10))}</b></div>
           <div class="row"><span>Payment</span><b style="font-size:11px">${esc(seal.paymentTx || '—')}</b></div>
           ${
             seal.supersededBy
               ? `<div class="row"><span>Replaced by</span><b><a href="/s/${esc(seal.supersededBy)}">${esc(seal.supersededBy)}</a></b></div>`
               : ''
           }`
        : ''
    }
  </div>
  <p class="foot">Public check · one database read · <a href="/seal">Seal dashboard</a></p>
</div>
<div class="modal" id="modal"><img id="modalImg" alt="Seal QR"/></div>
<script>
(function(){
  var btn=document.getElementById('qrBtn');
  var modal=document.getElementById('modal');
  var img=document.getElementById('modalImg');
  if(!btn) return;
  btn.onclick=function(){ img.src='/api/seal-image?serial=${esc(serial)}&qr=1&t='+Date.now(); modal.classList.add('open'); };
  modal.onclick=function(){ modal.classList.remove('open'); };
})();
</script>
</body>
</html>`);
}

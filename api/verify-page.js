// api/verify-page.js — Cyre Certificate verify UI (live status, proofs, find-box, event log).
// Serves /verify and /v/<serial> (short numeric serials resolve to full GRD-/CYR-).
// GRD- serials keep working and render in the new design.

import {
  getCertBySerial,
  normalizeCertSerial,
  resolveShortSerial,
  listCertEvents,
  publicCertView
} from './_cert-registry.js';
import { withOgArtRev } from './_og-art-rev.js';

const SITE = process.env.CYRE_SITE_URL || 'https://cyre.dev';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Human date for verify UI — e.g. "Sep 9, 2026". */
function formatIssuedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

/** Capitalize certificate type for display — "project" → "Project". */
function formatCertType(type) {
  const t = String(type || 'project').trim();
  if (!t) return 'Project';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export default async function handler(req, res) {
  let serialRaw = String((req.query && req.query.serial) || '').trim();
  let serial = normalizeCertSerial(serialRaw) || '';
  if (serial && /^\d{1,5}$/.test(serial)) {
    serial = (await resolveShortSerial(serial)) || serial;
  }

  const certFull = serial ? await getCertBySerial(serial) : null;
  const cert = certFull ? publicCertView(certFull) : null;
  const events = cert && !cert.legacyBadge ? await listCertEvents(cert.serial) : [];

  const ogImage = withOgArtRev(
    serial
      ? `${SITE}/api/cert/${encodeURIComponent(cert ? cert.serial : serial)}.png`
      : `${SITE}/cyre-coin-512.png`
  );
  const title = cert
    ? `Cyre Certificate · ${cert.serial}`
    : 'Cyre Certificate';
  const desc = cert
    ? `${cert.status || 'VALID'} · proves who controls these accounts — not a safety rating.`
    : 'Look up a Cyre Certificate serial. Live status is the only source of truth.';

  const canonical = serial && cert ? `${SITE}/verify/${cert.serial}` : `${SITE}/verify`;

  const proofsHtml = (cert && cert.proofs && cert.proofs.length
    ? cert.proofs
        .map((p) => {
          const ok = p.status !== 'Lapsed' && p.status !== 'pending';
          const mark = ok ? '✓' : p.status === 'Lapsed' ? 'Lapsed' : '…';
          const cls = ok ? 'ok' : p.status === 'Lapsed' ? 'bad' : 'warn';
          return `<div class="proof ${cls}"><span class="mark">${esc(mark)}</span> <b>${esc(p.kind)}</b> ${esc(p.display || p.id || '')}</div>`;
        })
        .join('')
    : '<div class="proof">No proofs registered yet.</div>');

  const eventsHtml = events.length
    ? events
        .slice(0, 20)
        .map(
          (e) =>
            `<div class="ev"><span class="mono">${esc(e.at || '')}</span> · <b>${esc(e.type)}</b></div>`
        )
        .join('')
    : cert && cert.legacyBadge
      ? '<div class="ev dim">Legacy GRD serial — event log starts with new CYR certificates.</div>'
      : '<div class="ev dim">No events yet.</div>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cyre">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #0a162f; --panel: #121c2b; --line: #2a3a51; --gold: #8fb0de;
    --live: #3ddc84; --bad: #d96a5e; --warn: #5a82bf; --text: #ece8df; --dim: #9aa5b4;
  }
  * { box-sizing: border-box; margin: 0; }
  html { overflow-x: hidden; max-width: 100%; }
  body {
    min-height: 100vh; color: var(--text);
    font: 400 16px/1.55 "IBM Plex Sans", system-ui, sans-serif;
    background:
      radial-gradient(1000px 500px at 15% -10%, rgba(143,176,222,.12), transparent 55%),
      radial-gradient(800px 480px at 90% 0%, rgba(90,130,191,.14), transparent 50%),
      linear-gradient(165deg, #0a162f 0%, #0e1a38 45%, #0a1428 100%);
    padding: 36px max(16px, env(safe-area-inset-right, 0px)) 72px max(16px, env(safe-area-inset-left, 0px));
    overflow-x: hidden;
    max-width: 100%;
  }
  .wrap { max-width: 880px; margin: 0 auto; width: 100%; min-width: 0; }
  .brand { font: 700 36px/1.1 "Cormorant Garamond", Georgia, serif; color: var(--gold); }
  h1 { font: 600 24px/1.25 "Cormorant Garamond", Georgia, serif; margin: 18px 0 6px; }
  .sub { color: var(--dim); margin-bottom: 22px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  input {
    flex: 1 1 220px; background: var(--panel); border: 1px solid var(--line); color: var(--text);
    font: 500 15px/1.4 "IBM Plex Mono", ui-monospace, monospace; padding: 12px 14px; border-radius: 8px;
  }
  button, .btn {
    background: var(--gold); color: var(--ink); border: 0;
    font: 600 14px/1 "IBM Plex Sans", system-ui, sans-serif; padding: 12px 18px; border-radius: 8px; cursor: pointer;
    text-decoration: none; display: inline-block;
  }
  .layout { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 28px; align-items: flex-start; }
  .main { flex: 1 1 320px; min-width: 0; }
  .side { flex: 0 1 320px; }
  .cert-img {
    width: 100%; max-width: 320px; height: auto; border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0,0,0,.45); background: #0a162f;
  }
  .cert-img.revoked { filter: grayscale(.85); opacity: .9; }
  .status { font: 600 16px/1.3 "IBM Plex Sans", system-ui, sans-serif; margin-top: 8px; }
  .status.ok { color: var(--live); } .status.bad { color: var(--bad); } .status.warn { color: var(--warn); }
  .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; word-break: break-all; }
  .panel {
    margin-top: 18px; padding: 16px; border: 1px solid var(--line);
    border-radius: 10px; background: rgba(18,28,43,.85);
  }
  .panel h2 { font: 600 14px/1.3 "IBM Plex Sans", system-ui, sans-serif; margin-bottom: 10px; color: var(--gold); }
  .proof { margin: 8px 0; font-size: 14px; }
  .proof .mark { display: inline-block; min-width: 52px; font-weight: 700; }
  .proof.ok .mark { color: var(--live); } .proof.bad .mark { color: var(--bad); } .proof.warn .mark { color: var(--warn); }
  .ev { font-size: 13px; color: var(--dim); margin: 6px 0; } .ev b { color: var(--text); }
  .dim { color: var(--dim); }
  .stamp {
    display: none; margin-top: 12px; padding: 8px 14px; background: rgba(180,40,40,.92);
    color: #ffe8e4; font: 700 14px/1 "IBM Plex Sans", system-ui, sans-serif; letter-spacing: .08em;
    transform: rotate(-6deg); width: fit-content;
  }
  .stamp.on { display: inline-block; }
  .pledge {
    margin-top: 28px; padding: 14px 16px; border-left: 3px solid var(--gold);
    color: var(--cream, var(--text)); font-size: 14px; background: rgba(143,176,222,.06);
  }
  a { color: var(--gold); }
  nav a { color: var(--gold); text-decoration: none; margin-left: 14px; font-size: 14px; }
  .tiny { margin-top: 36px; color: var(--dim); font-size: 13px; }
</style>
</head>
<body>
  <div class="wrap">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <div class="brand">Cyre</div>
      <nav aria-label="Primary">
        <a href="/builders">Builders</a>
        <a href="/order">Get Certificate</a>
        <a href="/">Home</a>
      </nav>
    </div>
    <h1>Cyre Certificate</h1>
    <p class="sub">Live status on cyre.dev is the only source of truth. Proves who controls these accounts — not a safety rating.</p>
    <label for="serial" class="dim" style="font-size:13px">Serial</label>
    <div class="row" style="margin-top:8px">
      <input id="serial" spellcheck="false" autocomplete="off" placeholder="CYR-2026-00001 or GRD-2026-00002" value="${esc(cert ? cert.serial : serialRaw)}" />
      <button id="go" type="button">Verify</button>
    </div>

    <div class="layout" id="out" ${cert ? '' : 'hidden'}>
      <div class="side">
        <img id="certImg" class="cert-img${cert && cert.status === 'REVOKED' ? ' revoked' : ''}" alt="Cyre Certificate" width="320"
          src="${cert ? esc(`${SITE}/api/cert/${encodeURIComponent(cert.serial)}.png`) : ''}" ${cert ? '' : 'hidden'} />
      </div>
      <div class="main">
        <div class="status ${cert && cert.status === 'VALID' ? 'ok' : 'bad'}" id="status">${cert ? esc(cert.status || 'VALID') : ''}</div>
        <div class="stamp${cert && cert.status === 'REVOKED' ? ' on' : ''}" id="stamp">REVOKED</div>
        <div class="panel">
          <h2>Registered certificate</h2>
          <div><b>Serial</b> <span class="mono" id="serialOut">${cert ? esc(cert.serial) : ''}</span></div>
          <div id="typeOut">${cert ? esc(formatCertType(cert.type)) : ''}</div>
          <div id="nameOut">${cert && cert.displayName ? esc(cert.displayName) : ''}${cert && cert.symbol ? ' · $' + esc(cert.symbol) : ''}</div>
          <div class="dim" id="issuedOut">${cert && cert.issuedAt ? 'Issued ' + esc(formatIssuedDate(cert.issuedAt)) : ''}</div>
        </div>
        <div class="panel">
          <h2>Proofs</h2>
          <div id="proofs">${proofsHtml}</div>
        </div>
        <div class="panel">
          <h2>Where did you find this?</h2>
          <p class="dim" style="font-size:13px;margin-bottom:10px">Enter a handle or link — we check it against registered proofs.</p>
          <div class="row">
            <input id="find" placeholder="@handle or domain" />
            <button id="findGo" type="button">Check</button>
          </div>
          <div id="findOut" style="margin-top:10px;font-weight:600"></div>
        </div>
        <div class="panel">
          <h2>Event log</h2>
          <div id="events">${eventsHtml}</div>
        </div>
      </div>
    </div>

    <div class="pledge">Cyre never asks you to approve a transaction.</div>
    <p class="tiny">Existing GRD- serials keep working in this design. Dissolved certificates stay REVOKED forever.</p>
  </div>
<script>
(function () {
  var SITE = ${JSON.stringify(SITE)};
  var input = document.getElementById('serial');
  var go = document.getElementById('go');
  var out = document.getElementById('out');
  var status = document.getElementById('status');
  var stamp = document.getElementById('stamp');
  var certImg = document.getElementById('certImg');
  var find = document.getElementById('find');
  var findGo = document.getElementById('findGo');
  var findOut = document.getElementById('findOut');

  function goVerify(raw) {
    var s = String(raw || '').trim();
    if (!s) return;
    location.href = '/verify?serial=' + encodeURIComponent(s);
  }
  go.addEventListener('click', function () { goVerify(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') goVerify(input.value); });

  async function checkFind() {
    var q = String(find.value || '').trim();
    if (!q || !input.value) return;
    findOut.textContent = 'Checking…';
    try {
      var r = await fetch('/api/cert?serial=' + encodeURIComponent(input.value) + '&match=' + encodeURIComponent(q), { cache: 'no-store' });
      var j = await r.json();
      findOut.textContent = j.match || 'Not this owner';
      findOut.style.color = j.match === 'Match' ? 'var(--live)' : 'var(--bad)';
    } catch (e) {
      findOut.textContent = 'Check failed';
    }
  }
  findGo.addEventListener('click', checkFind);
  find.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkFind(); });
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).end(html);
}

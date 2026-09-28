// api/founder-page.js — Mobile founder queue: unlock with key, list pending, Approve / Reject / Revoke.
// /founder — key stored in sessionStorage only (never logged). Supports order token hydrate when durable:false.

export default async function handler(req, res) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Founder queue · Guardian Verified</title>
<link rel="icon" href="/c7-cobra-256.png?v=c7g2" type="image/png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#0b1210;--panel:#121a16;--line:#243028;--gold:#c9a227;--live:#3ddc84;--bad:#d96a5e;--text:#e7efe8;--dim:#8a9a90}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;background:radial-gradient(900px 500px at 50% -10%,rgba(201,162,39,.12),transparent 55%),linear-gradient(180deg,#0b1210,#0a100e);color:var(--text);font:400 15px/1.5 "IBM Plex Sans",system-ui,sans-serif}
.wrap{max-width:560px;margin:0 auto;padding:22px 16px 72px}
.brand{font-family:"Cormorant Garamond",serif;font-weight:700;font-size:22px;color:var(--text);text-decoration:none}
.brand span{color:var(--gold)}
h1{font-family:"Cormorant Garamond",serif;font-weight:700;font-size:clamp(26px,6vw,34px);margin:18px 0 8px}
.sub{color:var(--dim);font-size:14px}
.panel{margin-top:18px;padding:16px;background:rgba(18,26,22,.92);border:1px solid var(--line);border-radius:10px}
.panel h2{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;color:var(--gold);margin-bottom:10px}
label{display:block;margin-top:10px;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.08em;color:var(--gold)}
input,textarea{width:100%;margin-top:6px;padding:12px;border-radius:8px;border:1px solid var(--line);background:#0a100e;color:var(--text);font:500 14px/1.4 "IBM Plex Sans",system-ui,sans-serif}
textarea{min-height:88px;font-family:"IBM Plex Mono",monospace;font-size:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;width:100%;margin-top:12px;padding:14px 16px;border-radius:8px;border:0;background:var(--gold);color:var(--ink);font:600 15px/1 "IBM Plex Sans",system-ui,sans-serif;cursor:pointer}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.btn-ok{background:var(--live);color:#062012}
.btn-bad{background:transparent;color:var(--bad);border:1px solid rgba(217,106,94,.55)}
.btn-ghost{background:transparent;color:var(--gold);border:1px solid rgba(201,162,39,.4)}
.btn-revoke{background:transparent;color:var(--bad);border:1px solid rgba(217,106,94,.55);margin-top:10px}
.card{margin-top:12px;padding:14px;border:1px solid var(--line);border-radius:8px;background:rgba(10,16,14,.7)}
.card.flagged{border-color:rgba(217,106,94,.55)}
.card .id{font-family:"IBM Plex Mono",monospace;font-size:14px;color:var(--gold)}
.card .meta{margin-top:6px;font-size:13px;color:var(--dim);word-break:break-all}
.pill{display:inline-block;margin-top:8px;margin-right:6px;padding:3px 9px;border-radius:999px;border:1px solid rgba(201,162,39,.4);font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--gold)}
.pill.flag{border-color:rgba(217,106,94,.55);color:var(--bad)}
.flags{margin-top:8px;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--bad);line-height:1.45}
#msg{margin-top:14px;min-height:1.2em;font-size:13.5px;color:var(--dim)}
#msg.bad{color:var(--bad)}
#msg.ok{color:var(--live)}
.hidden{display:none}
footer{margin-top:28px;color:var(--dim);font-size:12px;line-height:1.55}
</style>
</head>
<body>
<div class="wrap">
  <a class="brand" href="/">Guardian <span>Verified</span></a>
  <h1>Founder queue</h1>
  <p class="sub">Flagged holds and manual Approve / Reject. Recently issued serials can be revoked in one tap. Key stays on this device only.</p>

  <div class="panel" id="lockPanel">
    <h2>UNLOCK</h2>
    <label for="keyInput">FOUNDER KEY</label>
    <input id="keyInput" type="password" autocomplete="current-password" placeholder="BADGE_FOUNDER_KEY" />
    <button class="btn" id="unlockBtn" type="button">Unlock queue</button>
  </div>

  <div class="panel hidden" id="queuePanel">
    <h2>PENDING</h2>
    <p class="sub" id="queueHint">Loading…</p>
    <div id="list"></div>

    <h2 style="margin-top:22px">RECENTLY ISSUED</h2>
    <p class="sub" id="issuedHint">—</p>
    <div id="issuedList"></div>

    <button class="btn btn-ghost" id="refreshBtn" type="button">Refresh</button>
    <button class="btn btn-ghost" id="lockBtn" type="button">Lock</button>

    <h2 style="margin-top:22px">LOAD BY TOKEN</h2>
    <p class="sub">If Redis is unset, paste the signed token from the order URL (<code>?token=</code>) so this phone can see the order.</p>
    <textarea id="tokenInput" placeholder="eyJ…order token…"></textarea>
    <button class="btn btn-ghost" id="loadTokenBtn" type="button">Load order token</button>
  </div>

  <p id="msg"></p>
  <footer>
    Clean names auto-issue after payment when BADGE_AUTO_APPROVE is on. Flagged names land here.
    Approve mints a paid serial. Reject opens the refund path. Revoke marks an issued serial REVOKED.
  </footer>
</div>
<script>
(function(){
  var KEY = 'guardian.founder.key';
  var msg = document.getElementById('msg');
  function setMsg(t, kind){
    msg.textContent = t || '';
    msg.className = kind === 'bad' ? 'bad' : (kind === 'ok' ? 'ok' : '');
  }
  function getKey(){ try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setKey(v){ try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) {} }
  function headers(){
    return { 'content-type': 'application/json', accept: 'application/json', 'x-guardian-key': getKey() };
  }
  function showQueue(on){
    document.getElementById('lockPanel').classList.toggle('hidden', !!on);
    document.getElementById('queuePanel').classList.toggle('hidden', !on);
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function flagHtml(o){
    var sf = o.screenFlags;
    if (!sf || !sf.flags || !sf.flags.length) return '';
    return '<div class="flags">FLAGGED · ' + esc(sf.flags.join(' · ')) +
      (sf.reason ? ('<br>' + esc(sf.reason)) : '') + '</div>';
  }
  function renderList(pending){
    var root = document.getElementById('list');
    root.innerHTML = '';
    document.getElementById('queueHint').textContent = pending.length
      ? (pending.length + ' awaiting brand-safety')
      : 'No pending orders in this instance. Paste an order token below if needed.';
    pending.forEach(function(o){
      var el = document.createElement('div');
      var flagged = !!(o.screenFlags && o.screenFlags.flags && o.screenFlags.flags.length);
      el.className = 'card' + (flagged ? ' flagged' : '');
      var lane = o.paymentLane || '';
      var tx = o.paymentTx || '';
      el.innerHTML =
        '<div class="id">' + esc(o.id) + '</div>' +
        '<div class="meta">' + esc([o.name, o.symbol && ('$'+o.symbol)].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="meta mono">mint ' + esc(o.mint) + '</div>' +
        '<div class="meta">' + esc((o.qualifySnapshot && (o.qualifySnapshot.pathLabel || o.qualifySnapshot.path)) || '') +
          (lane ? (' · ' + esc(lane)) : '') + '</div>' +
        (tx ? ('<div class="meta">tx ' + esc(tx) + '</div>') : '') +
        flagHtml(o) +
        '<span class="pill">' + esc(o.status) + '</span>' +
        (flagged ? '<span class="pill flag">NAME SCREEN</span>' : '') +
        '<div class="btn-row">' +
          '<button type="button" class="btn btn-ok" data-act="approve" data-id="' + esc(o.id) + '">Approve</button>' +
          '<button type="button" class="btn btn-bad" data-act="reject" data-id="' + esc(o.id) + '">Reject</button>' +
        '</div>';
      if (o.token) el.dataset.token = o.token;
      root.appendChild(el);
    });
    root.querySelectorAll('button[data-act]').forEach(function(btn){
      btn.addEventListener('click', function(){
        act(btn.getAttribute('data-act'), btn.getAttribute('data-id'), btn.closest('.card'));
      });
    });
  }
  function renderIssued(issued){
    var root = document.getElementById('issuedList');
    root.innerHTML = '';
    var live = (issued || []).filter(function(o){
      return o && o.issuance && o.issuance.serial && !(o.issuance.revokedAt || (o.approval && o.approval.status === 'REVOKED'));
    });
    document.getElementById('issuedHint').textContent = live.length
      ? (live.length + ' recent issued — one-tap revoke')
      : 'No recent issued paid serials in this instance.';
    live.forEach(function(o){
      var el = document.createElement('div');
      el.className = 'card';
      var serial = o.issuance && o.issuance.serial;
      var verify = o.issuance && o.issuance.verifyUrl;
      var auto = o.approval && o.approval.status === 'AUTO_APPROVED';
      el.innerHTML =
        '<div class="id">' + esc(serial) + '</div>' +
        '<div class="meta">' + esc([o.name, o.symbol && ('$'+o.symbol)].filter(Boolean).join(' · ')) +
          ' · ' + esc(o.id) + '</div>' +
        '<div class="meta mono">mint ' + esc(o.mint) + '</div>' +
        (verify ? ('<div class="meta"><a href="' + esc(verify) + '" style="color:var(--gold)">verify</a></div>') : '') +
        '<span class="pill">' + esc(auto ? 'AUTO_APPROVED' : 'ISSUED') + '</span>' +
        '<button type="button" class="btn btn-revoke" data-act="revoke" data-id="' + esc(o.id) + '" data-serial="' + esc(serial) + '">Revoke</button>';
      if (o.token) el.dataset.token = o.token;
      root.appendChild(el);
    });
    root.querySelectorAll('button[data-act]').forEach(function(btn){
      btn.addEventListener('click', function(){
        act(btn.getAttribute('data-act'), btn.getAttribute('data-id'), btn.closest('.card'), btn.getAttribute('data-serial'));
      });
    });
  }
  async function unlock(){
    var k = (document.getElementById('keyInput').value || '').trim();
    if (!k){ setMsg('Key required.', 'bad'); return; }
    setKey(k);
    setMsg('Checking…');
    try {
      var r = await fetch('/api/badge/founder?action=list', { headers: headers() });
      var j = await r.json();
      if (!r.ok){ setKey(''); setMsg(j.error || 'Unlock failed.', 'bad'); return; }
      showQueue(true);
      renderList(j.pending || []);
      renderIssued(j.issued || []);
      setMsg('Unlocked.', 'ok');
    } catch (e) {
      setKey('');
      setMsg('Unlock failed.', 'bad');
    }
  }
  async function refresh(){
    if (!getKey()){ showQueue(false); return; }
    setMsg('Refreshing…');
    var r = await fetch('/api/badge/founder', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'list' }) });
    var j = await r.json();
    if (!r.ok){ setMsg(j.error || 'Refresh failed.', 'bad'); if (r.status === 401){ setKey(''); showQueue(false); } return; }
    renderList(j.pending || []);
    renderIssued(j.issued || []);
    setMsg('Updated.', 'ok');
  }
  async function loadToken(){
    var tok = (document.getElementById('tokenInput').value || '').trim();
    if (!tok){ setMsg('Paste order token.', 'bad'); return; }
    setMsg('Loading order…');
    var r = await fetch('/api/badge/founder', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: 'list', token: tok })
    });
    var j = await r.json();
    if (!r.ok){ setMsg(j.error || 'Could not load token.', 'bad'); return; }
    var pending = j.pending || [];
    var issued = j.issued || [];
    if (!pending.length && !issued.length && j.order){
      setMsg('Order loaded · status ' + (j.order.status || '') + ' (not pending/issued).', 'bad');
      renderList([]);
      renderIssued([]);
      return;
    }
    renderList(pending);
    renderIssued(issued);
    setMsg((pending.length || issued.length) ? 'Order loaded.' : 'No pending/issued order in that token.', (pending.length || issued.length) ? 'ok' : 'bad');
  }
  async function act(action, id, card, serial){
    if (!getKey()){ setMsg('Unlock first.', 'bad'); return; }
    var tok = card && card.dataset.token;
    if (!tok){
      var pasted = (document.getElementById('tokenInput').value || '').trim();
      if (pasted) tok = pasted;
    }
    if (action === 'revoke'){
      if (!confirm('Revoke ' + (serial || id) + '? This marks the serial REVOKED.')) return;
    }
    setMsg((action === 'approve' ? 'Approving ' : action === 'reject' ? 'Rejecting ' : 'Revoking ') + (serial || id) + '…');
    var r = await fetch('/api/badge/founder', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: action, orderId: id || null, serial: serial || null, token: tok || null })
    });
    var j = await r.json();
    if (!r.ok){ setMsg(j.error || 'Action failed.', 'bad'); return; }
    if (action === 'approve' && j.verifyUrl){
      setMsg('Issued ' + ((j.badge && j.badge.serial) || (j.order && j.order.issuance && j.order.issuance.serial) || '') + ' · ' + j.verifyUrl, 'ok');
    } else if (action === 'revoke'){
      setMsg('Revoked ' + ((j.badge && j.badge.serial) || serial || id), 'ok');
    } else {
      setMsg(id + ' → ' + ((j.order && j.order.status) || action), 'ok');
    }
    refresh();
  }
  document.getElementById('unlockBtn').addEventListener('click', unlock);
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('loadTokenBtn').addEventListener('click', loadToken);
  document.getElementById('lockBtn').addEventListener('click', function(){
    setKey(''); document.getElementById('keyInput').value = ''; showQueue(false); setMsg('Locked.');
  });
  if (getKey()){ showQueue(true); refresh(); }
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(200).send(html);
}

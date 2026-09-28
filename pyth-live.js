/* pyth-live.js — live Pyth Oracle Pulse strip for homepage
   Polls /api/oracle every 60s. Mounts into #pyth-live or after hero. */

(function () {
  'use strict';

  var INTERVAL_MS = 60000;
  var CSS = [
    '#cyre-pyth{position:relative;padding:22px 20px;border-top:1px solid rgba(95,208,255,.12);border-bottom:1px solid rgba(95,208,255,.12);',
    'background:linear-gradient(180deg,rgba(112,72,220,.08),transparent 70%);font-family:Inter,system-ui,sans-serif;color:#eefaff;opacity:0;transition:opacity .45s ease}',
    '#cyre-pyth.is-in{opacity:1}',
    '.cyre-pyth-in{max-width:1080px;margin:0 auto}',
    '.cyre-pyth-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}',
    '.cyre-pyth-title{font-family:Sora,Inter,sans-serif;font-weight:700;font-size:14px;letter-spacing:.04em}',
    '.cyre-pyth-title span{color:#5fd0ff}',
    '.cyre-pyth-live{display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#8892a4}',
    '.cyre-pyth-live i{width:6px;height:6px;border-radius:50%;background:#3ddc84;display:block;animation:cyre-pyth-pulse 2.2s infinite}',
    '@keyframes cyre-pyth-pulse{0%{box-shadow:0 0 0 0 rgba(61,220,132,.45)}70%{box-shadow:0 0 0 6px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}',
    '.cyre-pyth-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}',
    '.cyre-pyth-card{background:rgba(8,12,22,.72);border:1px solid rgba(95,208,255,.18);border-radius:14px;padding:12px 14px}',
    '.cyre-pyth-sym{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8892a4}',
    '.cyre-pyth-price{font-family:Sora,Inter,sans-serif;font-size:20px;font-weight:700;color:#5fd0ff;margin-top:4px}',
    '.cyre-pyth-meta{font-size:11px;color:#8892a4;margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
    '.cyre-pyth-foot{display:flex;justify-content:space-between;gap:10px;margin-top:12px;font-size:11px;color:#8892a4;flex-wrap:wrap}',
    '.cyre-pyth-foot a{color:#5fd0ff;text-decoration:none}',
    '@media (prefers-reduced-motion:reduce){#cyre-pyth *{animation:none!important;transition:none!important}}'
  ].join('');

  function fmtPrice(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 100) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4);
    return n.toFixed(6);
  }

  function mountPoint() {
    var slot = document.getElementById('pyth-live');
    if (slot) return { node: slot, mode: 'replace' };
    var hero = document.querySelector('.hero-grid, .hero, main > section');
    if (hero) return { node: hero, mode: 'after' };
    return null;
  }

  function render(el, d) {
    var feeds = (d && d.feeds) || [];
    var live = feeds.filter(function (f) { return f.evaluated && f.price != null; });
    if (!live.length) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    var mode = d.readingMode === 'pyth-lazer' ? 'Pyth Lazer' : 'Pyth Hermes peer';
    var cards = live.map(function (f) {
      var age = f.lastUpdateAgeSec != null ? f.lastUpdateAgeSec + 's ago' : 'live';
      return '<div class="cyre-pyth-card"><div class="cyre-pyth-sym">' + f.symbol +
        '</div><div class="cyre-pyth-price">' + fmtPrice(f.price) +
        '</div><div class="cyre-pyth-meta">' + age + '</div></div>';
    }).join('');
    el.innerHTML =
      '<div class="cyre-pyth-in">' +
        '<div class="cyre-pyth-head">' +
          '<div class="cyre-pyth-title">Oracle Pulse · <span>live Pyth reading</span></div>' +
          '<span class="cyre-pyth-live"><i></i> ' + mode + '</span>' +
        '</div>' +
        '<div class="cyre-pyth-grid">' + cards + '</div>' +
        '<div class="cyre-pyth-foot">' +
          '<span>Patterns, not verdicts · measured this run</span>' +
          '<a href="/oracle">Full Oracle Pulse →</a>' +
        '</div>' +
      '</div>';
    requestAnimationFrame(function () { el.classList.add('is-in'); });
  }

  function init() {
    var target = mountPoint();
    if (!target) return;
    if (!document.getElementById('cyre-pyth-style')) {
      var st = document.createElement('style');
      st.id = 'cyre-pyth-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var el = document.createElement('section');
    el.id = 'cyre-pyth';
    el.setAttribute('aria-label', 'Live Pyth oracle readings');
    el.style.display = 'none';
    if (target.mode === 'replace') target.node.innerHTML = '';
    if (target.mode === 'replace') target.node.appendChild(el);
    else target.node.parentNode.insertBefore(el, target.node.nextSibling);

    var timer = null;
    function tick() {
      fetch('/api/oracle', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d && d.ok) render(el, d); })
        .catch(function () {});
    }
    tick();
    timer = window.setInterval(tick, INTERVAL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (timer) { clearInterval(timer); timer = null; }
      } else if (!timer) {
        tick();
        timer = window.setInterval(tick, INTERVAL_MS);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

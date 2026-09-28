/* guardian-chain-live.js — live Solana chain pulse on the homepage
   Polls /api/chain-pulse (one cheap getSlot / 30s server-side). No wallet scans. */

(function () {
  'use strict';

  var INTERVAL_MS = 30000;
  var timer = null;

  function fmtSlot(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US');
  }

  function ageSec(iso) {
    if (!iso) return null;
    var ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.floor(ms / 1000);
  }

  function setChip(id, strong, label) {
    var el = document.getElementById(id);
    if (!el) return;
    var s = el.querySelector('strong');
    var l = el.querySelector('.label');
    if (s && strong != null) s.textContent = strong;
    if (l && label != null) l.textContent = label;
  }

  function setLiveBanner(text, ok) {
    var bar = document.getElementById('guardian-chain-bar');
    if (!bar) return;
    bar.textContent = text;
    bar.classList.toggle('is-live', !!ok);
    bar.classList.toggle('is-down', !ok);
  }

  function ensureBanner() {
    if (document.getElementById('guardian-chain-bar')) return;
    var hero = document.querySelector('.hero-grid, .hero');
    if (!hero) return;
    var bar = document.createElement('div');
    bar.id = 'guardian-chain-bar';
    bar.className = 'guardian-chain-bar';
    bar.setAttribute('aria-live', 'polite');
    bar.textContent = 'Cyre connecting to Solana…';
    hero.appendChild(bar);
    if (!document.getElementById('guardian-chain-live-css')) {
      var st = document.createElement('style');
      st.id = 'guardian-chain-live-css';
      st.textContent =
        '.guardian-chain-bar{margin-top:14px;font-family:JetBrains Mono,ui-monospace,monospace;font-size:11px;' +
        'letter-spacing:.06em;color:#8892a4;padding:8px 12px;border-radius:999px;border:1px solid rgba(216,188,102,.18);' +
        'background:rgba(6,10,22,.75);display:inline-flex;align-items:center;gap:8px;max-width:calc(100% - 96px)}' +
        '.guardian-chain-bar::before{content:"";width:7px;height:7px;border-radius:50%;background:#8892a4;flex:none}' +
        '.guardian-chain-bar.is-live{color:#eefaff;border-color:rgba(0,82,255,.35)}' +
        '.guardian-chain-bar.is-live::before{background:#2667ff;box-shadow:0 0 10px rgba(0,82,255,.55);animation:gcl-pulse 2s infinite}' +
        '.guardian-chain-bar.is-down::before{background:#ff4d5e}' +
        '@keyframes gcl-pulse{0%,100%{opacity:1}50%{opacity:.45}}' +
        '@media (prefers-reduced-motion:reduce){.guardian-chain-bar.is-live::before{animation:none}}';
      document.head.appendChild(st);
    }
  }

  function apply(d) {
    if (!d || !d.ok) {
      setChip('chip-live', 'Reconnecting', 'LIVE');
      setChip('chip-watch', 'Solana pulse paused', 'WATCHING');
      setLiveBanner('Cyre reconnecting to Solana…', false);
      return;
    }
    var sec = ageSec(d.fetchedAt);
    var ageTxt = sec != null ? sec + 's ago' : 'just now';
    setChip('chip-live', 'Cyre active', 'LIVE');
    setChip('chip-watch', 'Slot ' + fmtSlot(d.slot), 'WATCHING');
    setLiveBanner('Cyre watching Solana · ' + ageTxt + ' · slot ' + fmtSlot(d.slot), true);
  }

  function tick() {
    fetch('/api/chain-pulse', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(apply)
      .catch(function () { apply(null); });
  }

  function boot() {
    ensureBanner();
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

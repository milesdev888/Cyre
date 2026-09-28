/* guardian-app.js — unified Cyre Console routing + iframe loader */
(function () {
  'use strict';

  var STORAGE_KEY = 'cyre.ga.context';

  var VIEWS = {
    home: { title: 'Cyre Console', subtitle: 'All products in one workspace', frame: null },
    scan: { title: 'Token Scan & Swap', subtitle: 'Look first, swap second', frame: '/scan?embed=1&v=cb1' },
    cortex: { title: 'Neural Cortex', subtitle: 'Agent desks — watch only', frame: '/cortex?embed=1' },
    check: { title: 'Address Check', subtitle: 'Six explainable signals', frame: '/check?embed=1' },
    watch: { title: 'Watch', subtitle: 'Measured wallet alerts', frame: '/watch?embed=1' },
    score: { title: 'Wallet Score', subtitle: 'Shareable score card', frame: '/score?embed=1' },
    passport: { title: 'Passport', subtitle: 'Portable risk profile', frame: '/passport?embed=1' },
    forensics: { title: 'Forensics', subtitle: 'RWA pattern board', frame: '/forensics?embed=1' },
    oracle: { title: 'Oracle Pulse', subtitle: 'Feed monitor', frame: '/oracle?embed=1' },
    signals: { title: 'Signals', subtitle: 'Public pattern feed', frame: '/signals?embed=1' },
    tokenomics: { title: 'Tokenomics', subtitle: '$C7 supply & locks', frame: '/tokenomics?embed=1' },
    roadmap: { title: 'Roadmap', subtitle: 'Shipped · now · next', frame: '/roadmap?embed=1' },
    airdrop: { title: 'Airdrop', subtitle: '3M $C7 community', frame: '/airdrop?embed=1' },
    guardian: { title: 'Talk to Cyre', subtitle: 'Patterns, not verdicts', frame: null, panel: 'guardian' },
  };

  var QUICK_CARDS = [
    { id: 'cortex', tag: 'Monitor', title: 'Neural Cortex', desc: 'Agent-fund desks live — research, signals, risk, paper execution.' },
    { id: 'scan', tag: 'Trade', title: 'Scan & Swap', desc: 'Mint authority, freeze, holders — then Jupiter swap.' },
    { id: 'check', tag: 'Analyze', title: 'Check', desc: 'Paste an address for a measured risk band.' },
    { id: 'watch', tag: 'Monitor', title: 'Watch', desc: 'Up to 10 wallets — burst, dormant, failures.' },
    { id: 'oracle', tag: 'Monitor', title: 'Oracle Pulse', desc: 'RWA feed stale / spike / divergence.' },
    { id: 'passport', tag: 'Analyze', title: 'Passport', desc: 'JSON risk passport you can reuse.' },
    { id: 'forensics', tag: 'Analyze', title: 'Forensics', desc: 'Single-address pattern board.' },
    { id: 'score', tag: 'Analyze', title: 'Score', desc: 'Wallet grade card PNG.' },
    { id: 'signals', tag: 'Monitor', title: 'Signals', desc: 'Public measured pattern hits.' },
  ];

  var MORE_ITEMS = [
    { id: 'score', label: 'Score', hint: 'Grade' },
    { id: 'passport', label: 'Passport', hint: 'Profile' },
    { id: 'forensics', label: 'Forensics', hint: 'Board' },
    { id: 'oracle', label: 'Oracle Pulse', hint: 'Feeds' },
    { id: 'signals', label: 'Signals', hint: 'Hits' },
    { id: 'cortex', label: 'Neural Cortex', hint: 'Desks' },
    { id: 'tokenomics', label: 'Tokenomics', hint: '$C7' },
  ];

  var state = { view: 'home', context: '' };
  var frames = {};

  function $(sel) { return document.querySelector(sel); }

  function loadContext() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) state.context = raw;
    } catch (_) {}
  }

  function saveContext(val) {
    state.context = (val || '').trim();
    try { sessionStorage.setItem(STORAGE_KEY, state.context); } catch (_) {}
  }

  function isEvm(s) {
    return /^0x[a-fA-F0-9]{40}$/.test(s || '');
  }

  function isMint(s) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');
  }

  function isAddress(s) {
    return isMint(s) || isEvm(s);
  }

  function openConsole(addr) {
    var url = 'https://scan.cyre.dev/app' + (addr ? ('?address=' + encodeURIComponent(addr)) : '');
    window.open(url, '_blank', 'noopener');
  }

  function frameUrl(id) {
    var base = VIEWS[id] && VIEWS[id].frame;
    if (!base) return null;
    var url = base;
    if (state.context && id !== 'tokenomics' && id !== 'roadmap' && id !== 'airdrop' && id !== 'guardian' && id !== 'cortex') {
      var sep = url.indexOf('?') >= 0 ? '&' : '?';
      if (id === 'scan') url += sep + 'mint=' + encodeURIComponent(state.context);
      else url += sep + 'address=' + encodeURIComponent(state.context);
    }
    return url;
  }

  function setTopbar(id) {
    var meta = VIEWS[id] || VIEWS.home;
    var h1 = $('#ga-title');
    var sub = $('#ga-subtitle');
    if (h1) h1.textContent = meta.title;
    if (sub) sub.textContent = meta.subtitle;
  }

  function setActiveNav(id) {
    document.querySelectorAll('[data-view]').forEach(function (el) {
      var v = el.getAttribute('data-view');
      el.classList.toggle('is-active', v === id);
    });
  }

  function ensureFrame(id) {
    if (!VIEWS[id] || !VIEWS[id].frame) return null;
    if (frames[id]) return frames[id];
    var wrap = document.createElement('div');
    wrap.className = 'ga-frame-wrap';
    wrap.setAttribute('data-frame', id);
    wrap.style.display = 'none';
    var iframe = document.createElement('iframe');
    iframe.title = VIEWS[id].title;
    iframe.loading = 'lazy';
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    wrap.appendChild(iframe);
    $('#ga-frames').appendChild(wrap);
    frames[id] = { wrap: wrap, iframe: iframe, loaded: false };
    return frames[id];
  }

  function showFrame(id) {
    var guardianPanel = $('#ga-guardian');
    if (guardianPanel) guardianPanel.classList.remove('is-active');

    Object.keys(frames).forEach(function (key) {
      frames[key].wrap.style.display = key === id ? 'block' : 'none';
    });
    var f = ensureFrame(id);
    if (!f) return;
    f.wrap.style.display = 'block';
    var want = frameUrl(id);
    if (!f.loaded || f.lastUrl !== want) {
      f.iframe.src = want;
      f.loaded = true;
      f.lastUrl = want;
    }
  }

  function showGuardianPanel() {
    var home = $('#ga-home');
    var framesRoot = $('#ga-frames');
    var guardianPanel = $('#ga-guardian');
    if (home) home.classList.remove('is-active');
    if (framesRoot) framesRoot.style.display = 'none';
    Object.keys(frames).forEach(function (key) {
      if (frames[key]) frames[key].wrap.style.display = 'none';
    });
    if (guardianPanel) guardianPanel.classList.add('is-active');
  }

  function navigate(id, opts) {
    opts = opts || {};
    if (!VIEWS[id]) id = 'home';
    state.view = id;
    location.hash = id === 'home' ? '' : id;
    setTopbar(id);
    setActiveNav(id);

    if (id === 'home') {
      var home = $('#ga-home');
      var framesRoot = $('#ga-frames');
      var guardianPanel = $('#ga-guardian');
      if (home) home.classList.add('is-active');
      if (framesRoot) framesRoot.style.display = 'none';
      if (guardianPanel) guardianPanel.classList.remove('is-active');
    } else if (VIEWS[id].panel === 'guardian') {
      showGuardianPanel();
    } else {
      var guardianPanel2 = $('#ga-guardian');
      var home2 = $('#ga-home');
      var framesRoot2 = $('#ga-frames');
      if (guardianPanel2) guardianPanel2.classList.remove('is-active');
      if (home2) home2.classList.remove('is-active');
      if (framesRoot2) framesRoot2.style.display = 'block';
      showFrame(id);
    }

    closeMoreSheet();
    if (opts.scrollTop) {
      var main = $('.ga-main');
      if (main) main.scrollTop = 0;
    }
  }

  function buildDashboard() {
    var grid = $('#ga-card-grid');
    if (!grid) return;
    grid.innerHTML = QUICK_CARDS.map(function (c) {
      return '<button type="button" class="ga-card" data-open="' + c.id + '">' +
        '<span class="tag">' + c.tag + '</span>' +
        '<h3>' + c.title + '</h3>' +
        '<p>' + c.desc + '</p></button>';
    }).join('');
    grid.querySelectorAll('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigate(btn.getAttribute('data-open'), { scrollTop: true });
      });
    });
  }

  function buildMoreSheet() {
    var grid = $('#ga-more-grid');
    if (!grid) return;
    grid.innerHTML = MORE_ITEMS.map(function (m) {
      return '<button type="button" data-open="' + m.id + '">' + m.label +
        '<small>' + m.hint + '</small></button>';
    }).join('');
    grid.querySelectorAll('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigate(btn.getAttribute('data-open'), { scrollTop: true });
      });
    });
  }

  function openMoreSheet() {
    var sheet = $('#ga-more-sheet');
    if (sheet) sheet.classList.add('is-open');
  }

  function closeMoreSheet() {
    var sheet = $('#ga-more-sheet');
    if (sheet) sheet.classList.remove('is-open');
  }

  function quickRoute() {
    var input = $('#ga-quick-input');
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    saveContext(val);
    // Multichain console is canonical for token scans (esp. 0x). Solana
    // wallet checks stay in-app; Solana mints can use Scan & Swap embed.
    if (isEvm(val)) {
      openConsole(val);
      return;
    }
    if (isMint(val)) {
      openConsole(val);
      return;
    }
    navigate('check', { scrollTop: true });
  }

  function detectQuickType() {
    var input = $('#ga-quick-input');
    var hint = $('#ga-quick-hint');
    if (!input || !hint) return;
    var val = input.value.trim();
    if (!val) {
      hint.textContent = 'Paste any address — Solana, Ethereum, Base, Arbitrum, Robinhood Chain. Opens the Cyre console.';
      return;
    }
    if (isEvm(val)) {
      hint.textContent = 'EVM contract — opens the multichain Cyre console.';
      return;
    }
    if (isMint(val)) {
      hint.textContent = 'Solana mint — opens the Cyre console (patterns, not verdicts).';
      return;
    }
    hint.textContent = 'Paste a Solana mint/wallet or a 0x contract address.';
  }

  function initFromHash() {
    var params = new URLSearchParams(location.search);
    var addr = params.get('address') || params.get('mint');
    if (addr) saveContext(addr);
    var hash = (location.hash || '').replace(/^#/, '').split('?')[0];
    if (hash && VIEWS[hash]) navigate(hash);
    else navigate('home');
  }

  function initPulse() {
    var el = $('#ga-live');
    if (!el) return;
    function fmtSlot(n) {
      if (n == null || !Number.isFinite(n)) return '—';
      return n.toLocaleString('en-US');
    }
    function tick() {
      fetch('/api/chain-pulse', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) {
            el.textContent = 'Reconnecting…';
            el.classList.remove('is-live');
            return;
          }
          var sec = d.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(d.fetchedAt)) / 1000)) : 0;
          el.textContent = 'Slot ' + fmtSlot(d.slot) + ' · ' + sec + 's ago';
          el.classList.add('is-live');
        })
        .catch(function () {
          el.textContent = 'Reconnecting…';
          el.classList.remove('is-live');
        });
    }
    tick();
    setInterval(tick, 30000);
  }

  function wireNav() {
    document.querySelectorAll('[data-view]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-view');
        if (id === 'more') { openMoreSheet(); return; }
        navigate(id, { scrollTop: true });
      });
    });

    var quickBtn = $('#ga-quick-go');
    var quickInput = $('#ga-quick-input');
    if (quickBtn) quickBtn.addEventListener('click', quickRoute);
    if (quickInput) {
      quickInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') quickRoute();
      });
      quickInput.addEventListener('input', detectQuickType);
      if (state.context) quickInput.value = state.context;
    }

    var sheet = $('#ga-more-sheet');
    if (sheet) {
      sheet.addEventListener('click', function (e) {
        if (e.target === sheet) closeMoreSheet();
      });
    }
    var closeMore = $('#ga-more-close');
    if (closeMore) closeMore.addEventListener('click', closeMoreSheet);

    window.addEventListener('hashchange', initFromHash);
  }

  function boot() {
    loadContext();
    buildDashboard();
    buildMoreSheet();
    wireNav();
    initPulse();
    initFromHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

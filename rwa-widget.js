/* rwa-widget.js — CYRE 7 live RWA market band
   Upload to the repo root. Mounts itself into #rwa-feed, or falls back to
   inserting directly after the hero section. Hides itself if the feed is down. */

(function () {
  'use strict';

  var CSS = [
    '#cyre-rwa{position:relative;padding:26px 20px;border-top:1px solid #1f2634;border-bottom:1px solid #1f2634;',
    'background:linear-gradient(180deg,rgba(216,188,102,.05),transparent 70%);',
    'font-family:Inter,system-ui,-apple-system,sans-serif;color:#ede7d5;opacity:0;transition:opacity .5s ease}',
    '#cyre-rwa.is-in{opacity:1}',
    '#cyre-rwa::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#d8bc66,#e6cc7e)}',
    '.cyre-rwa-in{max-width:1080px;margin:0 auto}',
    '.cyre-rwa-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:16px}',
    '.cyre-rwa-eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#d8bc66}',
    '.cyre-rwa-live{display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#8892a4}',
    '.cyre-rwa-live i{width:5px;height:5px;border-radius:50%;background:#3ddc84;display:block;animation:cyre-rwa-pulse 2.4s infinite}',
    '@keyframes cyre-rwa-pulse{0%{box-shadow:0 0 0 0 rgba(61,220,132,.45)}70%{box-shadow:0 0 0 6px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}',
    '.cyre-rwa-cap{display:flex;align-items:flex-end;gap:12px;margin-bottom:2px}',
    '.cyre-rwa-cap b{font-family:Cormorant Garamond,Inter,sans-serif;font-weight:700;font-size:clamp(28px,7vw,40px);letter-spacing:-.03em;line-height:1}',
    '.cyre-rwa-chg{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;padding-bottom:4px}',
    '.cyre-rwa-label{font-size:12px;color:#8892a4;margin:0 0 20px}',
    '.cyre-rwa-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}',
    '#cyre-rwa table{width:100%;border-collapse:collapse;min-width:280px}',
    '#cyre-rwa th{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#8892a4;text-align:right;font-weight:500;padding:0 0 8px;border-bottom:1px solid #1f2634}',
    '#cyre-rwa th:first-child{text-align:left}',
    '#cyre-rwa td{padding:11px 0;font-size:13.5px;text-align:right;border-bottom:1px solid rgba(31,38,52,.55)}',
    '#cyre-rwa td:first-child{text-align:left;font-weight:500}',
    '#cyre-rwa tr:last-child td{border-bottom:none}',
    '.cyre-rwa-sym{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:#8892a4;margin-left:7px}',
    '.cyre-rwa-num{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
    '.cyre-rwa-up{color:#3ddc84}.cyre-rwa-down{color:#ff7a7a}',
    '.cyre-rwa-foot{display:flex;justify-content:space-between;gap:12px;font-size:10.5px;color:#8892a4;margin:14px 0 0}',
    '.cyre-rwa-foot a{color:#8892a4;text-decoration:none;border-bottom:1px solid #1f2634}',
    '.cyre-rwa-foot a:hover{color:#ede7d5}',
    '@media (prefers-reduced-motion:reduce){#cyre-rwa,#cyre-rwa *{animation:none!important;transition:none!important}}'
  ].join('');

  function money(n) {
    if (n == null) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + n.toLocaleString('en-US');
  }

  function price(n) {
    if (n == null) return '—';
    if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
  }

  function pct(n) {
    if (n == null) return { text: '—', cls: '' };
    var s = (n >= 0 ? '+' : '\u2212') + Math.abs(n).toFixed(2) + '%';
    return { text: s, cls: n >= 0 ? 'cyre-rwa-up' : 'cyre-rwa-down' };
  }

  function clock(iso) {
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function mountPoint() {
    var slot = document.getElementById('rwa-feed');
    if (slot) return { node: slot, mode: 'replace' };

    var hero = document.querySelector('header + section, main > section, section');
    if (hero) return { node: hero, mode: 'after' };
    return null;
  }

  function build() {
    var el = document.createElement('section');
    el.id = 'cyre-rwa';
    el.setAttribute('aria-label', 'Live real-world asset market data');
    return el;
  }

  function render(el, d) {
    var s = d.sector || {};
    var c = pct(s.change24h);

    var rows = (d.assets || []).map(function (a) {
      var p = pct(a.change24h);
      return '<tr><td>' + a.name + '<span class="cyre-rwa-sym">' + a.symbol + '</span></td>' +
        '<td class="cyre-rwa-num">' + price(a.price) + '</td>' +
        '<td class="cyre-rwa-num ' + p.cls + '">' + p.text + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<div class="cyre-rwa-in">' +
        '<div class="cyre-rwa-head">' +
          '<span class="cyre-rwa-eyebrow">RWA market</span>' +
          '<span class="cyre-rwa-live"><i></i> Live \u00b7 60s</span>' +
        '</div>' +
        (s.marketCap
          ? '<div class="cyre-rwa-cap"><b>' + money(s.marketCap) + '</b>' +
            '<span class="cyre-rwa-chg ' + c.cls + '">' + c.text + '</span></div>' +
            '<p class="cyre-rwa-label">Tokenized real-world asset market cap, 24h change</p>'
          : '') +
        '<div class="cyre-rwa-scroll"><table>' +
          '<thead><tr><th scope="col">Asset</th><th scope="col">Price</th><th scope="col">24h</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<p class="cyre-rwa-foot">' +
          '<a href="https://www.coingecko.com" target="_blank" rel="noopener">Data by CoinGecko</a>' +
          '<span>Updated ' + clock(d.updatedAt) + '</span>' +
        '</p>' +
      '</div>';

    requestAnimationFrame(function () { el.classList.add('is-in'); });
  }

  function load(el) {
    fetch('/api/rwa', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.assets || !d.assets.length) {
          el.remove();
          return;
        }
        render(el, d);
      })
      .catch(function () { el.remove(); });
  }

  function init() {
    /* Ad landings must stay product-only — never inject live crypto prices onto /check or /scan. */
    var path = (location.pathname || '').replace(/\.html$/i, '').replace(/\/$/, '') || '/';
    if (path === '/check' || path === '/scan') return;

    var target = mountPoint();
    if (!target) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = build();
    if (target.mode === 'replace') {
      target.node.replaceWith(el);
    } else {
      target.node.insertAdjacentElement('afterend', el);
    }

    load(el);
    setInterval(function () { load(el); }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

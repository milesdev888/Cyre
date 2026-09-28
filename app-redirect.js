/* app-redirect.js — product URLs → Guardian App, scan funnel → console.
 *
 * Canonical scanner is https://scan.cyre.dev/app (dark gold, multichain, auto-run).
 * Standalone /scan (ads, old links, homepage leftovers) redirect there with ?address=.
 * ?embed=1 (and iframe contexts) stay on-page so /app Scan & Swap keeps the
 * protected Jupiter flow.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  if (params.get('embed') === '1') return;
  if (window.self !== window.top) return;

  var path = location.pathname.replace(/\.html$/i, '').replace(/\/$/, '') || '/';

  if (path === '/scan') {
    var addr = (params.get('address') || params.get('mint') || params.get('q') || '').trim();
    var target = 'https://scan.cyre.dev/app' + (addr ? ('?address=' + encodeURIComponent(addr)) : '');
    location.replace(target);
    return;
  }

  var PATH_TO_VIEW = {
    '/watch': 'watch',
    '/score': 'score',
    '/passport': 'passport',
    '/forensics': 'forensics',
    '/oracle': 'oracle',
    '/signals': 'signals',
    '/tokenomics': 'tokenomics',
    '/roadmap': 'roadmap',
    '/airdrop': 'airdrop',
    '/apps': 'home',
  };

  if (path === '/app' || path === '/' || path === '/index-legacy') return;

  var view = PATH_TO_VIEW[path];
  if (!view) return;

  var dest = '/app' + (view === 'home' ? '' : '#' + view) + (location.search || '');
  location.replace(dest);
})();

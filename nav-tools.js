/* nav-tools.js — App-only nav helper for secondary pages */
(function () {
  'use strict';
  if (window.__cyAiNavTools) return;
  window.__cyAiNavTools = true;

  function ensureTheme() {
    if (document.getElementById('cy-ai-vibe')) return;
    var l = document.createElement('link');
    l.id = 'cy-ai-vibe';
    l.rel = 'stylesheet';
    l.href = '/theme-ai-vibe.css';
    document.head.appendChild(l);
  }

  function enhanceHome() {
    var nav = document.querySelector('nav.nav');
    if (!nav) return;
    if (!nav.querySelector('a[href="/app"]')) {
      var app = document.createElement('a');
      app.href = '/app';
      app.className = 'nav-app';
      app.textContent = 'Guardian App';
      var req = nav.querySelector('.req');
      if (req) nav.insertBefore(app, req);
      else nav.appendChild(app);
    }
  }

  function boot() {
    ensureTheme();
    enhanceHome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

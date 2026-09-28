/* ai-vibe-loader.js — theme + nav/popout + core bolt-ons.
   Constellation mesh is Cortex-only (inline in cortex.html). This loader must
   NOT mount vortex / ai-presence on tool pages. */
(function () {
  'use strict';
  function onceLink(id, href) {
    if (document.getElementById(id) || document.querySelector('link[href="' + href + '"]')) return;
    var el = document.createElement('link');
    el.id = id;
    el.rel = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
  }
  function onceScript(id, src) {
    if (document.getElementById(id) || document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.defer = true;
    (document.body || document.documentElement).appendChild(s);
  }
  onceLink('cy-ai-vibe', '/theme-ai-vibe.css?v=cortex-mesh1');
  onceLink('cy-purple-deep', '/theme-purple-deep.css?v=cortex-mesh1');
  function boot() {
    onceScript('cy-rwa-widget', '/rwa-widget.js');
    onceScript('cy-guardian-voice', '/guardian-voice.js');
    onceScript('cy-access-form', '/access-form.js');
    onceScript('cy-nav-tools', '/nav-tools.js');
    onceScript('cy-guardian-popout', '/guardian-popout.js?v=fab-portal1');
    // Scrub any leftover mesh canvas from older cached vortex builds
    onceScript('cy-vortex-scrub', '/vortex.js?v=cortex-mesh1');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* vortex.js — retired as a global hero mesh.
   Neural Cortex keeps its own graph (cortex.html #cx). Tool pages stay plain.
   This file only scrubs leftover #cy-ai-mesh canvases from older caches. */
(function () {
  'use strict';
  function scrub() {
    var mesh = document.getElementById('cy-ai-mesh');
    if (mesh && mesh.parentNode) mesh.parentNode.removeChild(mesh);
    var legacy = document.querySelectorAll('canvas.cy-ai-mesh, .hero > canvas[aria-hidden="true"]');
    for (var i = 0; i < legacy.length; i++) {
      var el = legacy[i];
      if (el && el.id === 'cy-ai-mesh' && el.parentNode) el.parentNode.removeChild(el);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrub);
  } else {
    scrub();
  }
})();

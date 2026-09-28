/* ai-presence.js — retired purple hero bloom / orbit glow.
   No longer loaded by ai-vibe-loader. Kept as a no-op so cached script tags
   cannot reintroduce violet washes on tool pages. Cortex mesh is untouched. */
(function () {
  'use strict';
  if (window.__cyAiPresence) return;
  window.__cyAiPresence = true;
  var mesh = document.getElementById('cy-ai-mesh');
  if (mesh && mesh.parentNode) mesh.parentNode.removeChild(mesh);
})();

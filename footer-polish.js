(function () {
  'use strict';
  function polish() {
    var links = document.querySelectorAll('.foot-links a, footer a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var label = (a.textContent || '').trim().toLowerCase();
      var href = a.getAttribute('href') || '';
      if (href !== '#' && href !== '') continue;
      if (label === 'docs') {
        a.setAttribute('href', '/roadmap');
        a.title = 'Roadmap (docs forthcoming)';
      } else if (label === 'security') {
        a.setAttribute('href', '/roadmap');
        a.title = 'Security notes forthcoming — see roadmap';
      } else if (label === 'privacy' || label === 'terms') {
        a.setAttribute('href', 'mailto:support@cyre.dev');
      } else if (label === 'support') {
        a.setAttribute('href', 'mailto:support@cyre.dev');
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', polish);
  } else {
    polish();
  }
})();

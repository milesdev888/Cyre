/* embed-mode.js — hide page chrome inside Guardian App iframes */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var embedded = params.get('embed') === '1' || window.self !== window.top;
  if (!embedded) return;

  document.documentElement.classList.add('embed-mode');

  if (!document.querySelector('link[data-cyre-embed]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/embed-mode.css';
    link.setAttribute('data-cyre-embed', '1');
    document.head.appendChild(link);
  }
})();

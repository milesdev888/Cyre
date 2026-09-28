(function () {
  'use strict';

  var bodyEl = document.getElementById('docs-body');
  var fallbackEl = document.getElementById('docs-fallback');
  if (!bodyEl) return;

  function stripFrontmatter(md) {
    if (md.startsWith('---')) {
      var end = md.indexOf('\n---', 3);
      if (end !== -1) return md.slice(end + 4).replace(/^\s*/, '');
    }
    return md;
  }

  function showFallback(msg) {
    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.textContent = msg;
    }
    bodyEl.innerHTML = '';
  }

  function render(md) {
    if (typeof marked === 'undefined') {
      showFallback('Could not load the markdown renderer. Open the raw file: /SKILL.md');
      return;
    }
    try {
      if (marked.setOptions) {
        marked.setOptions({ gfm: true, breaks: false });
      }
      var html = typeof marked.parse === 'function'
        ? marked.parse(md)
        : marked(md);
      bodyEl.innerHTML = html;
      if (fallbackEl) fallbackEl.hidden = true;
    } catch (e) {
      showFallback('Could not render SKILL.md. Open the raw file: /SKILL.md');
    }
  }

  bodyEl.innerHTML = '<p class="docs-loading">Loading Guardian API docs…</p>';

  fetch('/SKILL.md', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (text) {
      render(stripFrontmatter(text));
    })
    .catch(function () {
      showFallback('Could not load SKILL.md. Open the machine-readable version: /SKILL.md');
    });
})();

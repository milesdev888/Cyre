(function () {
  'use strict';
  // Skip inside Cyre App iframes — App already owns Talk-to-Guardian chrome.
  // Mounting here made the FAB look "page-dependent" and cover timeline/treasury.
  var params = new URLSearchParams(location.search || '');
  var embedded = params.get('embed') === '1' || window.self !== window.top ||
    (document.documentElement && document.documentElement.classList.contains('embed-mode'));
  if (embedded) return;
  if (document.getElementById('gp-fab') || document.getElementById('gp-root')) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var openedOnce = false;
  var panel = null;
  var fab = null;
  var root = null;
  var video = null;
  var unmuted = false;

  var css = document.createElement('style');
  css.id = 'gp-style';
  css.textContent =
    /* Portal host: fixed to the viewport (html), never a transformed page wrapper. */
    '#gp-root{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9500}' +
    '#gp-root > *{pointer-events:auto}' +
    'html.embed-mode #gp-root{display:none!important}' +
    /* Reserve bottom space so body copy / CoinGecko never sit under the FAB. */
    'html.gp-fab-on,html.gp-fab-on body{padding-bottom:max(88px,calc(72px + env(safe-area-inset-bottom,0px)))!important}' +
    '#gp-fab{position:absolute;right:max(16px,env(safe-area-inset-right,0px));' +
    'bottom:max(16px,env(safe-area-inset-bottom,0px));' +
    'z-index:2;width:64px;height:64px;border-radius:50%;' +
    'padding:0;border:2px solid rgba(143,176,222,.55);background:transparent;cursor:pointer;overflow:visible;' +
    'box-shadow:0 0 0 2px rgba(143,176,222,.25),0 0 28px rgba(143,176,222,.4),0 0 48px rgba(143,176,222,.22);' +
    'transition:transform .2s,box-shadow .2s}' +
    '#gp-fab:hover,#gp-fab:focus-visible{transform:scale(1.05);box-shadow:0 0 0 2px rgba(143,176,222,.65),0 0 36px rgba(143,176,222,.55),0 0 60px rgba(143,176,222,.3);outline:none}' +
    '#gp-fab img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;background:transparent}' +
    '#gp-fab .gp-pulse{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;' +
    'background:#A9C4E8;border:2px solid #0E1622;box-shadow:0 0 10px rgba(143,176,222,.7)}' +
    '#gp-fab .gp-pulse::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(143,176,222,.55);' +
    'animation:gp-pulse-ring 2s ease-out infinite}' +
    '#gp-fab .gp-live{position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);' +
    'font:700 9px JetBrains Mono,ui-monospace,monospace;letter-spacing:.14em;color:#8FB0DE;' +
    'background:rgba(14,22,34,.85);padding:2px 7px;border-radius:999px;border:1px solid rgba(143,176,222,.35)}' +
    '@keyframes gp-pulse-ring{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}' +
    '#gp-panel{position:absolute;right:max(16px,env(safe-area-inset-right,0px));' +
    'bottom:max(96px,calc(88px + env(safe-area-inset-bottom,0px)));z-index:3;' +
    'width:min(380px,calc(100vw - 28px));max-height:min(640px,calc(100vh - 120px));display:none;flex-direction:column;' +
    'background:rgba(14,22,34,.94);backdrop-filter:blur(20px) saturate(1.2);-webkit-backdrop-filter:blur(20px) saturate(1.2);' +
    'border:1px solid rgba(143,176,222,.28);border-radius:20px;' +
    'box-shadow:0 24px 60px -18px rgba(0,0,0,.9),0 0 32px rgba(143,176,222,.22),0 0 48px rgba(143,176,222,.12);' +
    'font-family:Inter,system-ui,sans-serif;color:#ECE8DF;overflow:hidden}' +
    '#gp-panel.is-open{display:flex}' +
    '#gp-panel .gp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
    'padding:14px 16px;border-bottom:1px solid rgba(143,176,222,.18)}' +
    '#gp-panel .gp-head h3{margin:0;font:700 15px Cormorant Garamond,Georgia,serif;letter-spacing:.02em}' +
    '#gp-panel .gp-head h3 span{color:#8FB0DE}' +
    '#gp-panel .gp-x{background:transparent;border:0;color:#9AA5B4;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:8px}' +
    '#gp-panel .gp-x:hover{color:#ECE8DF;background:rgba(143,176,222,.1)}' +
    '#gp-panel .gp-vid-wrap{position:relative;background:#0E1622;aspect-ratio:1;max-height:220px}' +
    '#gp-panel video{width:100%;height:100%;object-fit:cover;display:block;background:#0E1622}' +
    '#gp-panel .gp-hear{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);' +
    'font:600 12px Inter,system-ui,sans-serif;color:#0E1622;background:linear-gradient(135deg,#8FB0DE,#A9C4E8);' +
    'border:0;border-radius:999px;padding:9px 16px;cursor:pointer;box-shadow:0 0 18px rgba(143,176,222,.4);' +
    'display:none}' +
    '#gp-panel .gp-hear.is-on{display:inline-flex}' +
    '#gp-panel .gp-chat{display:flex;flex-direction:column;flex:1;min-height:0;padding:12px 14px 14px}' +
    '#gp-panel .gp-log{flex:1;overflow-y:auto;max-height:200px;display:flex;flex-direction:column;gap:8px;margin-bottom:10px}' +
    '#gp-panel .gp-msg{padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.5;max-width:95%}' +
    '#gp-panel .gp-msg.bot{background:rgba(18,28,43,.85);border:1px solid rgba(143,176,222,.18);align-self:flex-start}' +
    '#gp-panel .gp-msg.user{background:linear-gradient(135deg,rgba(143,176,222,.18),rgba(143,176,222,.14));' +
    'border:1px solid rgba(143,176,222,.28);align-self:flex-end}' +
    '#gp-panel .gp-form{display:flex;gap:8px}' +
    '#gp-panel .gp-form input{flex:1;background:rgba(10,17,27,.9);border:1px solid rgba(143,176,222,.22);' +
    'border-radius:999px;color:#ECE8DF;font:400 13px Inter,system-ui,sans-serif;padding:11px 14px;outline:none}' +
    '#gp-panel .gp-form input:focus{border-color:rgba(143,176,222,.55);box-shadow:0 0 14px rgba(143,176,222,.2)}' +
    '#gp-panel .gp-form button{background:linear-gradient(135deg,#8FB0DE,#A9C4E8);color:#0E1622;border:0;' +
    'border-radius:999px;padding:0 16px;font:700 13px Inter,system-ui,sans-serif;cursor:pointer}' +
    '#gp-panel .gp-form button:disabled{opacity:.55;cursor:wait}' +
    /* Phone: stay bottom-right (never left — left covered timeline/treasury). Lift above homepage scanbar when present. */
    '@media (max-width:720px){' +
      '#gp-fab{width:56px;height:56px;right:max(14px,env(safe-area-inset-right,0px));' +
      'bottom:max(14px,env(safe-area-inset-bottom,0px))}' +
      'body.has-scanbar #gp-fab{bottom:max(84px,calc(72px + env(safe-area-inset-bottom,0px)))}' +
      '#gp-panel{left:max(14px,env(safe-area-inset-left,0px));right:max(14px,env(safe-area-inset-right,0px));width:auto;' +
      'bottom:max(88px,calc(80px + env(safe-area-inset-bottom,0px)));max-height:min(640px,calc(100vh - 110px))}' +
      'body.has-scanbar #gp-panel{bottom:max(150px,calc(140px + env(safe-area-inset-bottom,0px)))}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){#gp-fab .gp-pulse::after{animation:none!important}#gp-fab,#gp-panel{transition:none!important}}';
  document.head.appendChild(css);
  function addMsg(log, text, who) {
    var m = document.createElement('div');
    m.className = 'gp-msg ' + who;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }
  function close() {
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (fab) fab.setAttribute('aria-expanded', 'false');
    if (video) {
      try { video.pause(); } catch (e) {}
    }
  }
  function tryMutedAutoplay() {
    if (!video || reduce || openedOnce) return;
    openedOnce = true;
    video.muted = true;
    video.playsInline = true;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    var hear = panel.querySelector('.gp-hear');
    if (hear) hear.classList.add('is-on');
  }
  function unmute() {
    if (!video) return;
    unmuted = true;
    video.muted = false;
    video.play().catch(function () {});
    var hear = panel.querySelector('.gp-hear');
    if (hear) {
      hear.textContent = 'Playing';
      hear.classList.remove('is-on');
      setTimeout(function () { hear.style.display = 'none'; }, 600);
    }
  }
  function sendChat(input, btn, log) {
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    addMsg(log, text, 'user');
    btn.disabled = true;
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('bad');
        return r.json();
      })
      .then(function (d) {
        var reply =
          (d && (d.reply || d.message || d.text || (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content))) ||
          null;
        addMsg(
          log,
          reply || "I'm watching the chain. Chat is warming up — try again shortly, or ask on the main Cyre panel.",
          'bot'
        );
      })
      .catch(function () {
        addMsg(
          log,
          "I couldn't reach the live chat just now. I'm still watching — try again in a moment, or use the Cyre panel on this page.",
          'bot'
        );
      })
      .finally(function () {
        btn.disabled = false;
        input.focus();
      });
  }
  function open() {
    if (!panel) return;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (fab) fab.setAttribute('aria-expanded', 'true');
    tryMutedAutoplay();
    var input = panel.querySelector('.gp-form input');
    if (input) setTimeout(function () { input.focus(); }, 40);
  }
  function mount() {
    root = document.createElement('div');
    root.id = 'gp-root';
    root.setAttribute('aria-hidden', 'false');
    // Host on <html> so no page transform/filter can retarget position:fixed.
    document.documentElement.appendChild(root);
    document.documentElement.classList.add('gp-fab-on');
    if (document.querySelector('.scanbar, #scanbar, .hero-scan, [data-scanbar]')) {
      document.body.classList.add('has-scanbar');
    }

    fab = document.createElement('button');
    fab.id = 'gp-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Open Cyre');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'gp-panel');
    fab.innerHTML =
      '<img src="/c7-token-icon-256.png?v=c7b" srcset="/c7-token-icon-256.png?v=c7b 1x, /c7-token-icon-512.png?v=c7b 2x" alt="" width="64" height="64">' +
      '<span class="gp-pulse" aria-hidden="true"></span>' +
      '<span class="gp-live">LIVE</span>';
    root.appendChild(fab);

    panel = document.createElement('aside');
    panel.id = 'gp-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Cyre');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML =
      '<div class="gp-head">' +
        '<h3>Cyre <span>LIVE</span></h3>' +
        '<button type="button" class="gp-x" aria-label="Close">\u00d7</button>' +
      '</div>' +
      '<div class="gp-vid-wrap">' +
        '<video src="/guardian-video.mp4" controls playsinline preload="metadata" title="Cyre intro"></video>' +
        '<button type="button" class="gp-hear">Unmute / Hear her</button>' +
      '</div>' +
      '<div class="gp-chat">' +
        '<div class="gp-log" aria-live="polite"></div>' +
        '<form class="gp-form" action="#">' +
          '<input type="text" name="q" autocomplete="off" maxlength="500" placeholder="Ask Cyre\u2026" aria-label="Message Cyre">' +
          '<button type="submit">Send</button>' +
        '</form>' +
      '</div>';
    root.appendChild(panel);
    video = panel.querySelector('video');
    var log = panel.querySelector('.gp-log');
    addMsg(log, "I'm Cyre. Ask me what I'm watching.", 'bot');
    fab.addEventListener('click', function () {
      if (panel.classList.contains('is-open')) close();
      else open();
    });
    panel.querySelector('.gp-x').addEventListener('click', close);
    panel.querySelector('.gp-hear').addEventListener('click', unmute);
    var form = panel.querySelector('.gp-form');
    var input = form.querySelector('input');
    var btn = form.querySelector('button');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sendChat(input, btn, log);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('is-open')) return;
      var t = e.target;
      if (panel.contains(t) || fab.contains(t)) return;
      if (t && t.closest && t.closest('#talk-to-guardian,[data-guardian-open]')) return;
      close();
    });
    function bindTriggers() {
      document.querySelectorAll('#talk-to-guardian,[data-guardian-open]').forEach(function (btn) {
        if (btn.dataset.gpBound) return;
        btn.dataset.gpBound = '1';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          open();
        });
      });
    }
    bindTriggers();
    window.CyreGuardianPopout = { open: open, close: close, toggle: function () {
      if (panel.classList.contains('is-open')) close();
      else open();
    }};
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

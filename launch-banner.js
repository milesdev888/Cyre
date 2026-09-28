(function(){
  if (document.getElementById('cy-banner')) return;

  // Glass theme loader (Hedra design, crystal-recolored)
  if (!document.getElementById('cy-glass')){
    var gl = document.createElement('link');
    gl.id = 'cy-glass';
    gl.rel = 'stylesheet';
    gl.href = '/theme-glass.css';
    document.head.appendChild(gl);
  }

  // AI vibe layer (theme + Tools nav + Guardian pop-out + core bolt-ons)
  if (!document.querySelector('script[src*="/ai-vibe-loader.js"]')){
    var av = document.createElement('script');
    av.src = '/ai-vibe-loader.js?v=cortex-mesh1';
    av.defer = true;
    (document.body || document.documentElement).appendChild(av);
  }

  var css = document.createElement('style');
  css.textContent =
    '#cy-banner{position:relative;overflow:hidden;isolation:isolate;' +
      'background:radial-gradient(ellipse 70% 55% at 50% 40%,rgba(216,188,102,.10),transparent 62%),' +
                 'radial-gradient(ellipse 50% 40% at 18% 80%,rgba(95,191,122,.05),transparent 55%),' +
                 'linear-gradient(180deg,#0d130d 0%,#0a0f0a 55%,#0a0f0a 100%);' +
      'border-top:1px solid rgba(216,188,102,.14);border-bottom:1px solid rgba(216,188,102,.14)}' +
    '#cy-banner::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;' +
      'background:radial-gradient(circle at 50% 0%,rgba(216,188,102,.06),transparent 42%)}' +
    '#cy-banner .cyb-in{position:relative;z-index:2;max-width:1180px;margin:0 auto;padding:80px 24px 64px;text-align:center;' +
      'opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}' +
    '#cy-banner .cyb-in.is-in{opacity:1;transform:none}' +
    '#cy-banner .cyb-eyebrow{display:block;margin:0 0 14px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'letter-spacing:.18em;text-transform:uppercase;color:rgba(196,181,253,.85)}' +
    '#cy-banner h2{font-family:Sora,system-ui,sans-serif;font-weight:700;font-size:clamp(28px,4.6vw,46px);' +
      'color:#eefaff;margin:0 0 14px;letter-spacing:-.02em}' +
    '#cy-banner p{color:#8892a4;font-size:clamp(14px,1.8vw,17px);max-width:640px;margin:0 auto 28px;line-height:1.7}' +
    '#cy-banner .cyb-embed{position:relative;width:100%;height:70vh;max-height:760px;min-height:360px;' +
      'border:1px solid rgba(196,181,253,.16);border-radius:18px;overflow:hidden;background:#0b0618;box-sizing:border-box;' +
      'box-shadow:0 24px 64px -28px rgba(0,0,0,.85),0 0 48px rgba(124,239,255,.08),0 0 64px rgba(196,181,253,.10),' +
                 'inset 0 1px 0 rgba(238,250,255,.06)}' +
    '#cy-banner .cyb-embed::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;' +
      'box-shadow:inset 0 0 0 1px rgba(196,181,253,.06);' +
      'background:linear-gradient(180deg,rgba(238,250,255,.04),transparent 18%,transparent 82%,rgba(11,6,24,.22))}' +
    '#cy-banner .cyb-frame{display:block;width:100%;height:100%;border:0;pointer-events:none;background:#0b0618}' +
    '#cy-banner .cyb-full{display:inline-flex;align-items:center;gap:8px;margin-top:18px;padding:8px 2px;' +
      'font:500 14px Inter,system-ui,sans-serif;color:#7cefff;text-decoration:none;' +
      'border-bottom:1px solid rgba(124,239,255,.28);transition:color .2s,border-color .2s,gap .2s}' +
    '#cy-banner .cyb-full:hover,#cy-banner .cyb-full:focus-visible{color:#eefaff;border-bottom-color:rgba(238,250,255,.55);gap:12px;outline:none}' +
    '#cy-banner .cyb-full span{display:inline-block;transition:transform .2s}' +
    '#cy-banner .cyb-full:hover span,#cy-banner .cyb-full:focus-visible span{transform:translateX(3px)}' +
    '@media (max-width:640px){#cy-banner .cyb-in{padding:56px 18px 48px}#cy-banner .cyb-embed{height:60vh;min-height:280px;border-radius:14px}}' +
    '@media (prefers-reduced-motion:reduce){#cy-banner .cyb-in{opacity:1;transform:none;transition:none}' +
      '#cy-banner .cyb-full,#cy-banner .cyb-full span{transition:none}}';
  document.head.appendChild(css);

  var sec = document.createElement('section');
  sec.id = 'cy-banner';
  sec.setAttribute('aria-labelledby', 'cy-banner-title');
  sec.innerHTML =
    '<div class="cyb-in">' +
      '<span class="cyb-eyebrow">Neural Cortex</span>' +
      '<h2 id="cy-banner-title">Inside the Guardian.</h2>' +
      '<p>The agent graph, live \u2014 research, signals, execution, risk. Patterns, not verdicts.</p>' +
      '<div class="cyb-embed">' +
        '<iframe class="cyb-frame" src="/cortex.html" loading="lazy" title="Guardian Neural Cortex" tabindex="-1"></iframe>' +
      '</div>' +
      '<a class="cyb-full" href="/cortex">Open full screen <span aria-hidden="true">\u2192</span></a>' +
    '</div>';

  // $CYRE nav tab — inserted before "Request access"
  var nav = document.querySelector('nav.nav');
  if (nav && !document.getElementById('cy-nav-token')){
    var tk = document.createElement('a');
    tk.id = 'cy-nav-token';
    tk.href = '/tokenomics';
    tk.textContent = '$C7';
    tk.style.cssText = 'color:var(--gold,#5fd0ff);font-weight:600';
    var rm = document.createElement('a');
    rm.href = '/roadmap';
    rm.textContent = 'Roadmap';
    nav.insertBefore(rm, nav.querySelector('.req'));
    var req = nav.querySelector('.req');
    if (req) nav.insertBefore(tk, req); else nav.appendChild(tk);
  }

  // $CYRE hero button — joins the CTA row next to "Check an address"
  var ctaRow = document.querySelector('.cta-row');
  if (ctaRow && !document.getElementById('cy-hero-token')){
    var wrapA = document.createElement('a');
    wrapA.href = '/tokenomics';
    wrapA.id = 'cy-hero-token';
    var btn = document.createElement('button');
    btn.className = 'btn b-ghost';
    btn.style.cssText = 'color:var(--gold,#5fd0ff);border-color:rgba(95,208,255,.5);display:inline-flex;align-items:center;gap:9px';
    var lg = document.createElement('img');
    lg.src = '/c7-cobra-256-transparent.png?v=c7t1';
    lg.alt = '';
    lg.style.cssText = 'width:22px;height:22px;border-radius:50%;display:block';
    lg.onerror = function(){ lg.remove(); };
    btn.appendChild(lg);
    btn.appendChild(document.createTextNode('$C7 Token'));
    wrapA.appendChild(btn);
    ctaRow.appendChild(wrapA);
  }

  // Telemetry HUD bar under the hero (claims-safe values only)
  var hero = document.querySelector('.hero');
  if (hero && !document.getElementById('cy-hud')){
    var hud = document.createElement('div');
    hud.id = 'cy-hud';
    hud.innerHTML = '<div class="wrap"><div class="hud-bar">' +
      '<div class="hud-item"><span class="hud-label">Guardian</span><span class="hud-val">Online <span class="up">\u25B2 LIVE</span></span></div>' +
      '<div class="hud-item"><span class="hud-label">Address Checker</span><span class="hud-val">Free \u2014 Live</span></div>' +
      '<div class="hud-item"><span class="hud-label">$C7 Launch</span><span class="hud-val">upcoming</span></div>' +
      '<div class="hud-item"><span class="hud-label">Network</span><span class="hud-val">Solana</span></div>' +
    '</div></div>';
    hero.parentNode.insertBefore(hud, hero.nextSibling);
  }

  // Use Case 01 link strip
  var uc = document.createElement('a');
  uc.id = 'cy-usecase';
  uc.href = '/check';
  uc.style.cssText = 'display:block;background:#0d1017;border-top:1px solid #1f2634;border-bottom:1px solid #1f2634;padding:18px 24px;text-align:center;text-decoration:none;font-family:Inter,system-ui,sans-serif;font-size:15px;color:#e8ecf3';
  uc.innerHTML = '<span style="font-family:\'JetBrains Mono\',Menlo,monospace;font-size:12px;color:#4fe3d0;letter-spacing:.1em;margin-right:14px">GUARDIAN CHECK</span>' +
    'Grade any Solana address free \u2014 patterns, not verdicts <span style="color:var(--gold,#5fd0ff)">\u2192</span>';

  var anchor = document.getElementById('guardian') ||
               document.querySelector('#pricing, section.sec:last-of-type');
  if (anchor && anchor.parentNode){
    anchor.parentNode.insertBefore(sec, anchor);
    anchor.parentNode.insertBefore(uc, anchor);
  } else { document.body.appendChild(sec); document.body.appendChild(uc); }

  var panel = sec.querySelector('.cyb-in');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)){
    panel.classList.add('is-in');
  } else {
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if (!e.isIntersecting) return;
        panel.classList.add('is-in');
        io.disconnect();
      });
    },{threshold:.12, rootMargin:'0px 0px -8% 0px'});
    io.observe(sec);
  }
})();

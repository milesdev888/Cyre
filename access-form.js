(function(){
  var ENDPOINT = 'https://formspree.io/f/xqpzddvy';

  var css = document.createElement('style');
  css.textContent =
    '.axm-bg{position:fixed;inset:0;background:rgba(7,8,11,.8);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;}' +
    '.axm{background:#101710;border:1px solid #1e2a1e;border-radius:16px;padding:28px 24px;max-width:420px;width:100%;z-index:9999;font-family:Inter,system-ui,sans-serif;}' +
    '.axm h3{font-family:Cormorant Garamond,Georgia,serif;font-weight:600;font-size:22px;color:#ede7d5;margin:0 0 6px;}' +
    '.axm p.axs{font-size:13px;color:#97a08d;margin:0 0 18px;line-height:1.5;}' +
    '.axm label{display:block;font-size:12px;color:#97a08d;margin:0 0 6px;}' +
    '.axm input,.axm textarea{width:100%;box-sizing:border-box;background:#0d130d;border:1px solid #1e2a1e;border-radius:8px;color:#ede7d5;font:400 14px Inter,sans-serif;padding:11px 12px;margin:0 0 14px;outline:none;}' +
    '.axm input:focus,.axm textarea:focus{border-color:#d8bc66;}' +
    '.axm textarea{min-height:70px;resize:vertical;}' +
    '.axm .axb{width:100%;background:#d8bc66;color:#0a0f0a;border:0;border-radius:999px;padding:13px;font:500 14px Inter,sans-serif;cursor:pointer;}' +
    '.axm .axb:disabled{opacity:.6;cursor:wait;}' +
    '.axm .axx{position:absolute;top:14px;right:16px;background:none;border:0;color:#97a08d;font-size:20px;cursor:pointer;line-height:1;}' +
    '.axm .axe{font-size:13px;color:#ff7a7a;margin:0 0 10px;display:none;}' +
    '.axm .axok{text-align:center;padding:18px 0;display:none;}' +
    '.axm .axok b{display:block;font-family:Cormorant Garamond,Georgia,serif;font-size:20px;color:#d8bc66;margin:0 0 8px;}' +
    '.axm .axok span{font-size:14px;color:#97a08d;}';
  document.head.appendChild(css);

  var bg = null;

  function close(){ if (bg){ bg.remove(); bg = null; } }

  function open(){
    if (bg) return;
    bg = document.createElement('div');
    bg.className = 'axm-bg';
    bg.innerHTML =
      '<div class="axm" style="position:relative">' +
      '<button class="axx" aria-label="Close">\u00d7</button>' +
      '<div class="axf">' +
      '<h3>Request early access</h3>' +
      '<p class="axs">Tell us where to reach you. We onboard a small number of protocols and teams at a time.</p>' +
      '<p class="axe"></p>' +
      '<label for="ax-email">Email</label>' +
      '<input id="ax-email" name="email" type="email" required placeholder="you@protocol.xyz">' +
      '<label for="ax-name">Name / company</label>' +
      '<input id="ax-name" name="name" type="text" placeholder="Jane \u00b7 Ondo">' +
      '<label for="ax-msg">What are you building?</label>' +
      '<textarea id="ax-msg" name="message" placeholder="RWA lending protocol, need pre-settlement fraud scoring\u2026"></textarea>' +
      '<button class="axb">Request access</button>' +
      '</div>' +
      '<div class="axok"><b>Request received</b><span>Cyre has logged it. We\u2019ll be in touch soon.</span></div>' +
      '</div>';
    document.body.appendChild(bg);

    bg.addEventListener('click', function(e){ if (e.target === bg) close(); });
    bg.querySelector('.axx').addEventListener('click', close);

    var btn = bg.querySelector('.axb');
    var err = bg.querySelector('.axe');
    btn.addEventListener('click', function(){
      var email = bg.querySelector('#ax-email').value.trim();
      if (!email || email.indexOf('@') < 1){
        err.textContent = 'Enter a valid email address.';
        err.style.display = 'block';
        return;
      }
      err.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Sending\u2026';
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          email: email,
          name: bg.querySelector('#ax-name').value.trim(),
          message: bg.querySelector('#ax-msg').value.trim(),
          _subject: 'CYRE early access request'
        })
      }).then(function(r){
        if (r.ok){
          bg.querySelector('.axf').style.display = 'none';
          bg.querySelector('.axok').style.display = 'block';
        } else {
          throw new Error('bad status');
        }
      }).catch(function(){
        btn.disabled = false;
        btn.textContent = 'Request access';
        err.textContent = 'Something went wrong \u2014 try again in a moment.';
        err.style.display = 'block';
      });
    });
    setTimeout(function(){ bg.querySelector('#ax-email').focus(); }, 50);
  }

  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });

  function isAccessCta(el){
    if (!el) return false;
    var txt = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (txt.indexOf('request early access') !== -1) return true;
    if (txt === 'request access' || txt === 'contact sales') return true;
    if (el.getAttribute){ var h = el.getAttribute('href'); if (h === '#guardian' || h === '#access') return true; }
    if (el.closest && el.closest('.tier') && (txt.indexOf('request access') !== -1 || txt.indexOf('contact sales') !== -1)) return true;
    return false;
  }

  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('.axm-bg,.axm')) return;
    var el = e.target.closest('a,button');
    if (!isAccessCta(el)) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  }, true);

  function retargetAccessHrefs(){
    var nodes = document.querySelectorAll('a[href="#guardian"]');
    for (var i = 0; i < nodes.length; i++){
      var a = nodes[i];
      var txt = (a.textContent || '').toLowerCase();
      if (txt.indexOf('request') !== -1 || (a.className || '').indexOf('req') !== -1){
        a.setAttribute('href', '#access');
        a.setAttribute('role', 'button');
      }
    }
  }

  function hashAccess(){
    if (location.hash === '#guardian' || location.hash === '#access'){
      if (location.hash === '#guardian'){
        history.replaceState(null, '', '#access');
      }
      open();
    }
  }
  function bootCtas(){
    retargetAccessHrefs();
    hashAccess();
  }
  window.addEventListener('hashchange', hashAccess);
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootCtas);
  } else {
    bootCtas();
  }

  (function ensureFooterPolish(){
    if (document.querySelector('script[src="/footer-polish.js"]')) return;
    var s = document.createElement('script');
    s.src = '/footer-polish.js';
    s.defer = true;
    (document.body || document.documentElement).appendChild(s);
  })();

})();

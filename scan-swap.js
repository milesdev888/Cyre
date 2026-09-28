/* scan-swap.js — Cyre Protected Swap gate (SWAP-SPEC §6)
   Scan first, swap second. Jupiter Plugin embedded; no custom tx code. */

(function () {
  'use strict';

  var SOL = 'So11111111111111111111111111111111111111112';
  var cfg = window.CYRE_SWAP_CONFIG || {};
  var GATE_MS = (cfg.scanGateMinutes || 10) * 60 * 1000;

  var state = 'IDLE';
  var scanned = null;
  var pluginReady = false;
  var expiryTimer = null;

  function $(id) { return document.getElementById(id); }

  function shortMint(m) {
    if (!m || m.length < 12) return m || '—';
    return m.slice(0, 4) + '…' + m.slice(-4);
  }

  function fmtTime(d) {
    try { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }

  function isExpired() {
    return !scanned || (Date.now() - scanned.at > GATE_MS);
  }

  function setProceedEnabled(on) {
    var btn = $('proceed-swap');
    if (btn) btn.disabled = !on;
  }

  function showGateNotice(msg) {
    var el = $('swap-notice');
    if (!el) return;
    if (msg) { el.textContent = msg; el.style.display = 'block'; }
    else el.style.display = 'none';
  }

  function hasInjectedWallet() {
    var s = window.solana || (window.phantom && window.phantom.solana);
    if (s && (s.isPhantom || s.isSolflare || s.publicKey || typeof s.connect === 'function')) return true;
    var sf = window.solflare;
    if (sf && (sf.isSolflare || sf.publicKey || typeof sf.connect === 'function')) return true;
    if (window.backpack) return true;
    return false;
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function shouldPreferExternalSwap() {
    return !hasInjectedWallet();
  }

  function canUseEmbeddedWidget() {
    return hasInjectedWallet();
  }

  function canProceedToSwap() {
    if (state !== 'SCANNED' || !scanned || isExpired()) return false;
    if (scanned.risk === 'HIGH') {
      var box = $('high-read');
      if (!box || !box.checked) return false;
    }
    return true;
  }

  function jupiterAppUrl(mint) {
    var sol = cfg.solMint || SOL;
    return 'https://jup.ag/swap/' + sol + '-' + mint;
  }

  function pageUrlForWallet() {
    return location.href.split('#')[0];
  }

  function walletBrowseLinks() {
    var url = encodeURIComponent(pageUrlForWallet());
    return {
      phantom: 'https://phantom.app/ul/browse/' + url,
      solflare: 'https://solflare.com/ul/v1/browse/' + url,
    };
  }

  function updateWalletHelp(show) {
    var box = $('wallet-help');
    if (!box) return;
    var visible = show && !hasInjectedWallet();
    box.classList.toggle('is-visible', visible);
    if (!visible) return;
    var links = walletBrowseLinks();
    var ph = $('open-phantom');
    var sf = $('open-solflare');
    if (ph) ph.href = links.phantom;
    if (sf) sf.href = links.solflare;
  }

  function updateSwapPanelHelp(show) {
    var box = $('swap-panel-wallet-help');
    if (!box) return;
    box.classList.toggle('is-visible', show && !hasInjectedWallet());
  }

  function updateProceedActions() {
    var external = $('swap-jupiter-app');
    var embedded = $('proceed-swap');
    var preferExternal = shouldPreferExternalSwap();
    var ok = canProceedToSwap();

    if (external) {
      if (scanned && !isExpired()) external.href = jupiterAppUrl(scanned.mint);
      external.classList.toggle('is-primary', preferExternal);
      external.classList.toggle('is-disabled', !ok);
    }
    var panelJup = $('swap-panel-jup-link');
    if (panelJup && scanned && !isExpired()) panelJup.href = jupiterAppUrl(scanned.mint);
    if (embedded) {
      embedded.style.display = preferExternal ? 'none' : '';
      embedded.textContent = 'Proceed to swap here';
      embedded.classList.toggle('ghost', false);
      setProceedEnabled(ok && canUseEmbeddedWidget());
    }
    var panelBtn = $('swap-panel-jup-btn');
    if (panelBtn && scanned && !isExpired()) panelBtn.href = jupiterAppUrl(scanned.mint);
    updateWalletHelp(state === 'SCANNED' || state === 'SWAP');
  }

  function hideSwapPanel() {
    var panel = $('swap-panel');
    var jup = $('jup');
    var external = $('swap-panel-external');
    if (panel) panel.style.display = 'none';
    if (jup) { jup.innerHTML = ''; jup.style.display = ''; }
    if (external) external.style.display = 'none';
    updateWalletHelp(false);
    updateSwapPanelHelp(false);
    if (window.Jupiter && typeof window.Jupiter.close === 'function') {
      try { window.Jupiter.close(); } catch (_) {}
    }
    var rem = $('scan-reminder');
    if (rem) rem.style.display = 'none';
  }

  function showProceedBlock(show) {
    var block = $('proceed-block');
    if (block) block.style.display = show ? 'block' : 'none';
  }

  function updateHighGate(risk) {
    var wrap = $('high-confirm');
    var box = $('high-read');
    if (!wrap || !box) return;
    if (risk === 'HIGH') {
      wrap.style.display = 'block';
      box.checked = false;
      setProceedEnabled(false);
    } else {
      wrap.style.display = 'none';
      box.checked = false;
      setProceedEnabled(!isExpired());
    }
    updateProceedActions();
  }

  function showSwapTeaser(show) {
    var el = $('swap-teaser');
    if (!el) return;
    el.classList.toggle('is-unlocked', !show);
  }

  function resetToIdle() {
    state = 'IDLE';
    scanned = null;
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    hideSwapPanel();
    showProceedBlock(false);
    showSwapTeaser(true);
    showGateNotice('');
    setProceedEnabled(false);
  }

  function onScanSuccess(mint, data) {
    scanned = { mint: mint, risk: data.risk, at: Date.now() };
    state = 'SCANNED';
    hideSwapPanel();
    showProceedBlock(true);
    showSwapTeaser(false);
    updateHighGate(data.risk);
    showGateNotice('');

    var block = $('proceed-block');
    if (block && block.scrollIntoView) {
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    updateProceedActions();

    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = setTimeout(function () {
      if (state === 'SCANNED') {
        setProceedEnabled(false);
        updateProceedActions();
        showGateNotice('Scan expired — run Cyre scan again before swapping.');
      }
      if (state === 'SWAP') {
        rearmGate('Scan expired — re-scan this token before swapping.');
      }
    }, GATE_MS);
  }

  function rearmGate(reason) {
    state = 'SCANNED';
    hideSwapPanel();
    showProceedBlock(true);
    showSwapTeaser(false);
    setProceedEnabled(false);
    updateHighGate(scanned && scanned.risk);
    showGateNotice(reason || 'Output token changed — scan the token you want to swap.');
    updateProceedActions();
  }

  function loadPluginScript(cb) {
    if (pluginReady) return cb();
    var url = cfg.pluginScript || 'https://plugin.jup.ag/plugin-v1.js';
    if (document.querySelector('script[data-cyre-jup-plugin]')) {
      pluginReady = true;
      return cb();
    }
    var s = document.createElement('script');
    s.src = url;
    s.defer = true;
    s.setAttribute('data-preload', '');
    s.setAttribute('data-cyre-jup-plugin', '1');
    s.onload = function () { pluginReady = true; cb(); };
    s.onerror = function () { showGateNotice('Could not load swap widget — refresh and try again.'); };
    document.head.appendChild(s);
  }

  function showExternalSwapPanel() {
    state = 'SWAP';
    showProceedBlock(false);
    showSwapTeaser(false);
    updateWalletHelp(false);

    var panel = $('swap-panel');
    var external = $('swap-panel-external');
    var jup = $('jup');
    var lede = $('swap-panel-lede');
    if (panel) panel.style.display = 'block';
    if (external) external.style.display = 'block';
    if (jup) { jup.innerHTML = ''; jup.style.display = 'none'; }
    if (lede) lede.style.display = 'none';

    var btn = $('swap-panel-jup-btn');
    if (btn && scanned) btn.href = jupiterAppUrl(scanned.mint);

    var rem = $('scan-reminder');
    if (rem && scanned) {
      rem.textContent = 'Scanned ' + shortMint(scanned.mint) + ' at ' + fmtTime(new Date(scanned.at)) + '. Patterns, not verdicts — the trade is yours.';
      rem.style.display = 'block';
    }
    showGateNotice('');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backFromSwap() {
    if (state !== 'SWAP') return;
    hideSwapPanel();
    state = 'SCANNED';
    showProceedBlock(true);
    showSwapTeaser(false);
    var lede = $('swap-panel-lede');
    if (lede) lede.style.display = '';
    updateProceedActions();
  }

  function mountJupiter(mint) {
    if (!cfg.referralAccount) {
      showGateNotice('Swap fee routing is being configured. Scan works; swap unlocks once the Jupiter referral account is set in swap-config.js.');
      return;
    }
    if (!window.Jupiter || typeof window.Jupiter.init !== 'function') {
      showGateNotice('Swap widget still loading — try again in a moment.');
      return;
    }

    var panel = $('swap-panel');
    var jup = $('jup');
    var external = $('swap-panel-external');
    var lede = $('swap-panel-lede');
    if (panel) panel.style.display = 'block';
    if (external) external.style.display = 'none';
    if (lede) lede.style.display = '';
    if (jup) { jup.innerHTML = ''; jup.style.display = ''; }

    var formProps = {
      initialInputMint: cfg.solMint || SOL,
      initialOutputMint: mint,
      fixedMint: mint,
      referralAccount: cfg.referralAccount,
      referralFee: cfg.referralFeeBps || 50,
    };

    var brand = cfg.branding || {};
    window.Jupiter.init({
      displayMode: 'integrated',
      integratedTargetId: 'jup',
      containerStyles: { height: '520px', width: '100%' },
      formProps: formProps,
      branding: {
        name: brand.name || 'Cyre',
        logoUri: brand.logoUri || 'https://cyre.dev/c7-cobra-512.png?v=c7g2',
      },
      onScreenUpdate: function () {
        updateSwapPanelHelp(state === 'SWAP' && !hasInjectedWallet());
      },
      onFormUpdate: function (form) {
        var out = (form && (form.outputMint || form.toMint || (form.to && form.to.address))) || '';
        if (state === 'SWAP' && out && out !== mint) {
          rearmGate('Output token changed inside the widget — scan the token you want to swap.');
        }
      },
    });

    var rem = $('scan-reminder');
    if (rem) {
      rem.textContent = 'Scanned ' + shortMint(mint) + ' at ' + fmtTime(new Date(scanned.at)) + '. Patterns, not verdicts — the trade is yours.';
      rem.style.display = 'block';
    }
    showGateNotice('');
    updateWalletHelp(!hasInjectedWallet());
    updateSwapPanelHelp(true);
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function proceedToSwap() {
    if (!canProceedToSwap()) {
      if (state === 'SCANNED' && isExpired()) {
        showGateNotice('Scan expired — run Cyre scan again before swapping.');
      }
      return;
    }
    if (!canUseEmbeddedWidget()) {
      showExternalSwapPanel();
      return;
    }
    state = 'SWAP';
    showProceedBlock(false);
    showSwapTeaser(false);
    updateWalletHelp(false);
    loadPluginScript(function () { mountJupiter(scanned.mint); });
  }

  function onExternalSwapClick(e) {
    if (!canProceedToSwap()) {
      e.preventDefault();
      if (state === 'SCANNED' && isExpired()) {
        showGateNotice('Scan expired — run Cyre scan again before swapping.');
      } else if (scanned && scanned.risk === 'HIGH') {
        showGateNotice('Confirm you have read the HIGH risk signals above before swapping.');
      }
    }
  }

  function wireUi() {
    var proceed = $('proceed-swap');
    var external = $('swap-jupiter-app');
    var back = $('swap-back');
    var highBox = $('high-read');
    var mintInput = $('mint');

    if (proceed) proceed.addEventListener('click', proceedToSwap);
    if (external) external.addEventListener('click', onExternalSwapClick);
    if (back) back.addEventListener('click', backFromSwap);
    if (highBox) {
      highBox.addEventListener('change', function () {
        if (state === 'SCANNED' && scanned && scanned.risk === 'HIGH') {
          setProceedEnabled(highBox.checked && !isExpired());
          updateProceedActions();
        }
      });
    }
    if (mintInput) {
      mintInput.addEventListener('input', function () {
        if (state !== 'IDLE') resetToIdle();
      });
    }
  }

  window.CyreScanSwap = {
    onScanSuccess: onScanSuccess,
    onScanStart: function () { resetToIdle(); },
    reset: resetToIdle,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUi);
  } else wireUi();
})();

(function () {
  'use strict';

  var FEED_URL = '/api/am?q=cyre.dev';
  var TOTAL_PAID = 36;

  var CATEGORIES = {
    'Core Risk': {
      accent: '#6366f1',
      paths: [
        '/api/address', '/api/token', '/api/passport', '/api/handshake', '/api/preflight',
        '/api/receipt', '/api/delta', '/api/batch', '/api/program', '/api/alerts', '/api/oracle'
      ]
    },
    Middleware: {
      accent: '#8b5cf6',
      paths: [
        '/api/gate', '/api/route', '/api/offer', '/api/pack', '/api/bazaar', '/api/caution',
        '/api/lockbox', '/api/lockbox/match', '/api/policy', '/api/policy/check', '/api/intent',
        '/api/lookalike', '/api/mintalike', '/api/host', '/api/escrow', '/api/pulse',
        '/api/cron-receipt', '/api/ticket'
      ]
    },
    Trinity: {
      accent: '#06b6d4',
      paths: [
        '/api/stream/subscribe', '/api/stream/events', '/api/exchange/post', '/api/exchange/match',
        '/api/circuit/seal', '/api/circuit/heartbeat', '/api/circuit/check'
      ]
    }
  };

  var ALL_PATHS = [];
  Object.keys(CATEGORIES).forEach(function (cat) {
    CATEGORIES[cat].paths.forEach(function (p) {
      ALL_PATHS.push({ path: p, cat: cat });
    });
  });

  var root = document.getElementById('am-root');
  if (!root) return;

  var els = {
    stats: root.querySelector('#am-stats'),
    cats: root.querySelector('#am-cats'),
    tbody: root.querySelector('#am-tbody'),
    pills: root.querySelector('#am-pills'),
    meta: root.querySelector('#am-service-meta'),
    updated: root.querySelector('#am-updated'),
    err: root.querySelector('#am-err'),
    loading: root.querySelector('#am-loading')
  };

  function pathCat(path) {
    for (var i = 0; i < ALL_PATHS.length; i++) {
      if (ALL_PATHS[i].path === path) return ALL_PATHS[i].cat;
    }
    return 'Other';
  }

  function fmtCalls(n) {
    n = Number(n) || 0;
    return n + ' call' + (n === 1 ? '' : 's');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(msg) {
    if (els.err) {
      els.err.hidden = false;
      els.err.textContent = msg;
    }
    if (els.loading) els.loading.hidden = true;
  }

  function hideError() {
    if (els.err) els.err.hidden = true;
  }

  function render(service) {
    hideError();
    if (els.loading) els.loading.hidden = true;

    var indexed = {};
    var totalCalls = 0;
    var prices = {};

    (service.endpoints || []).forEach(function (ep) {
      var path = ep.url.replace('https://cyre.dev', '');
      indexed[path] = ep;
      var q = ep.quality || {};
      var calls = Number(q.l30DaysTotalCalls) || 0;
      totalCalls += calls;
      if (ep.pricing && ep.pricing.amount) {
        var p = Number(ep.pricing.amount);
        if (isFinite(p)) prices[p] = (prices[p] || 0) + 1;
      }
    });

    var indexedCount = 0;
    ALL_PATHS.forEach(function (row) {
      if (indexed[row.path]) indexedCount += 1;
    });
    var pendingCount = TOTAL_PAID - indexedCount;

    var minPrice = Infinity;
    var maxPrice = 0;
    Object.keys(prices).forEach(function (p) {
      var v = Number(p);
      if (v < minPrice) minPrice = v;
      if (v > maxPrice) maxPrice = v;
    });
    var priceRange = minPrice < Infinity
      ? '$' + minPrice.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') +
        '–$' + maxPrice.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
      : '—';

    if (els.stats) {
      els.stats.innerHTML =
        '<div class="am-stat"><div class="n">' + indexedCount + '<span style="font-size:1rem;color:var(--muted)">/' + TOTAL_PAID + '</span></div><div class="l">Paid SKUs on AM</div></div>' +
        '<div class="am-stat"><div class="n">' + pendingCount + '</div><div class="l">Pending index</div></div>' +
        '<div class="am-stat"><div class="n">' + totalCalls + '</div><div class="l">L30D AM-tracked calls</div></div>' +
        '<div class="am-stat"><div class="n" style="font-size:1.35rem">' + esc(priceRange) + '</div><div class="l">Price range (USDC)</div></div>';
    }

    if (els.meta) {
      var chips =
        '<span class="am-chip">id: ' + esc(service.id || '—') + '</span>' +
        '<span class="am-chip">networks: Base + Solana</span>';
      if (!service.enriched) chips += '<span class="am-chip warn">enriched: false</span>';
      if (!service.category) chips += '<span class="am-chip warn">category: (unset)</span>';
      else chips += '<span class="am-chip">category: ' + esc(service.category) + '</span>';
      els.meta.innerHTML = chips;
    }

    if (els.cats) {
      els.cats.innerHTML = Object.keys(CATEGORIES).map(function (name) {
        var c = CATEGORIES[name];
        var idx = 0;
        c.paths.forEach(function (p) { if (indexed[p]) idx += 1; });
        var pct = c.paths.length ? Math.round(100 * idx / c.paths.length) : 0;
        return '<div class="am-cat" style="--accent:' + c.accent + '">' +
          '<div class="am-cat-name">' + esc(name) + '</div>' +
          '<div class="am-cat-stat">' + idx + '<span>/' + c.paths.length + '</span></div>' +
          '<div class="am-bar"><div style="width:' + pct + '%"></div></div>' +
          '<div class="am-cat-sub">' + pct + '% on AM</div></div>';
      }).join('');
    }

    if (els.pills) {
      els.pills.innerHTML = Object.keys(prices).sort(function (a, b) { return Number(a) - Number(b); }).map(function (p) {
        return '<span class="am-pill">$' + Number(p).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' × ' + prices[p] + '</span>';
      }).join('');
    }

    if (els.tbody) {
      var rows = ALL_PATHS.map(function (row) {
        var ep = indexed[row.path];
        var isIdx = !!ep;
        var price = isIdx && ep.pricing ? '$' + ep.pricing.amount : '—';
        var calls = isIdx ? fmtCalls((ep.quality && ep.quality.l30DaysTotalCalls) || 0) : '—';
        var tags = isIdx && ep.tags ? ep.tags.slice(0, 4).join(', ') : '—';
        return '<tr class="' + (isIdx ? 'indexed' : 'pending') + '">' +
          '<td><span class="badge ' + (isIdx ? 'badge-ok' : 'badge-pending') + '">' + (isIdx ? 'Indexed' : 'Pending') + '</span></td>' +
          '<td>' + esc(row.cat) + '</td>' +
          '<td class="mono">' + esc(row.path) + '</td>' +
          '<td class="price">' + esc(price) + '</td>' +
          '<td class="calls">' + esc(calls) + '</td>' +
          '<td class="tags">' + esc(tags) + '</td></tr>';
      });
      els.tbody.innerHTML = rows.join('');
    }

    if (els.updated) {
      els.updated.textContent = 'Last updated ' + new Date().toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }) + ' · live from api.agentic.market';
    }
  }

  function load() {
    hideError();
    if (els.loading) {
      els.loading.hidden = false;
      els.loading.textContent = 'Loading Agentic Market index…';
    }

    fetch(FEED_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('API returned ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var services = data.services || [];
        if (!services.length) throw new Error('No cyre.dev service found in AM response');
        render(services[0]);
      })
      .catch(function (e) {
        showError('Could not load Agentic Market data. ' + (e && e.message ? e.message : 'Network error.') +
          ' Try again in a moment or visit agentic.market directly.');
      });
  }

  load();
})();

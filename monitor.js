(function () {
  'use strict';

  var FEED_URL = '/api/monitor/feed';
  var POLL_MS = 10000;
  var REPLAY_MS = 60000;
  var TAPE_ROWS = 12;

  var root = document.getElementById('monitor-root');
  if (!root) return;

  var state = {
    mode: 'all',
    feed: null,
    err: null,
    lastOk: null,
    replayIdx: 0,
    replayStart: 0,
    replayEvents: [],
    seenKeys: Object.create(null),
    reduceMotion: false,
    hidden: false
  };

  var els = {
    families: root.querySelector('#mon-families'),
    truth: root.querySelector('#mon-truth'),
    durable: root.querySelector('#mon-durable'),
    tape: root.querySelector('#mon-tape'),
    scrub: root.querySelector('#mon-scrub'),
    meta: root.querySelector('#mon-meta'),
    tip: root.querySelector('#mon-tip'),
    err: root.querySelector('#mon-err')
  };

  var cells = Object.create(null);
  var rafId = 0;
  var pollTimer = 0;

  function $(sel) { return root.querySelector(sel); }

  function shortPath(p) {
    return p.replace(/^\/api\//, '');
  }

  function fmtAtomic(n) {
    if (n == null || n === '') return '—';
    try {
      var v = Number(n) / 1e6;
      if (!isFinite(v)) return '—';
      if (v < 0.01) return '$' + v.toFixed(4);
      return '$' + v.toFixed(3);
    } catch (e) {
      return '—';
    }
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toISOString().slice(11, 19);
  }

  function routeState(r) {
    if (r.family === 'verify') {
      return (r.verifies || 0) > 0 ? 'verify' : 'dormant';
    }
    if ((r.externalSettles || 0) > 0) return 'external';
    if ((r.settles || 0) > 0) return 'settled';
    if ((r.probes || 0) > 0) return 'probed';
    return 'dormant';
  }

  function cellAbbrev(path) {
    var s = shortPath(path);
    if (s.length <= 8) return s;
    var parts = s.split(' · ');
    if (parts.length > 1) return parts[parts.length - 1].slice(0, 7);
    return s.slice(0, 7);
  }

  function cellLabel(r) {
    var base = cellAbbrev(r.path);
    var settles = Number(r.settles) || 0;
    var verifies = Number(r.verifies) || 0;
    var count = settles + (r.family === 'verify' ? verifies : 0);
    return count > 0 ? base + ' ' + count : base;
  }

  function buildGrid(feed) {
    if (!els.families) return;
    els.families.innerHTML = '';
    cells = Object.create(null);

    var byFamily = Object.create(null);
    (feed.routes || []).forEach(function (r) {
      if (!byFamily[r.family]) byFamily[r.family] = [];
      byFamily[r.family].push(r);
    });

    var order = ['identity', 'policy', 'settlement', 'circuit', 'exchange', 'stream', 'discovery', 'verify'];
    var labels = {
      identity: 'IDENTITY',
      policy: 'POLICY',
      settlement: 'SETTLEMENT',
      circuit: 'CIRCUIT',
      exchange: 'EXCHANGE',
      stream: 'STREAM',
      discovery: 'DISCOVERY',
      verify: 'VERIFY'
    };

    order.forEach(function (fam) {
      var list = byFamily[fam];
      if (!list || !list.length) return;
      var block = document.createElement('section');
      block.className = 'mon-family';
      block.innerHTML = '<h2>' + labels[fam] + ' <span class="mon-fam-count">' + list.length + '</span></h2>';
      var grid = document.createElement('div');
      grid.className = 'mon-grid';

      list.forEach(function (r) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mon-cell';
        btn.setAttribute('data-path', r.path);
        btn.setAttribute('data-state', routeState(r));
        btn.setAttribute('aria-label', shortPath(r.path));
        btn.innerHTML = '<span class="mon-cell-in" aria-hidden="true"></span><span class="mon-cell-lbl">' + cellLabel(r) + '</span>';
        btn.addEventListener('mouseenter', function (e) { showTip(e, r); });
        btn.addEventListener('focus', function (e) { showTip(e, r); });
        btn.addEventListener('mouseleave', hideTip);
        btn.addEventListener('blur', hideTip);
        grid.appendChild(btn);
        cells[r.path] = btn;
      });

      block.appendChild(grid);
      els.families.appendChild(block);
    });
  }

  function showTip(e, r) {
    if (!els.tip) return;
    var lanes = (r.lanes && r.lanes.length) ? r.lanes.join(', ') : '—';
    var price = r.paid ? fmtAtomic(r.priceAtomic) : 'free';
    els.tip.innerHTML =
      '<b>' + shortPath(r.path) + '</b>' +
      'Price: ' + price + '<br>' +
      'Lanes: ' + lanes + '<br>' +
      'Probes: ' + (r.probes || 0) + ' · Settles: ' + (r.settles || 0) +
      (r.paid ? '' : ' · Verifies: ' + (r.verifies || 0));
    els.tip.style.display = 'block';
    positionTip(e);
  }

  function positionTip(e) {
    if (!els.tip) return;
    var x = (e.clientX || 0) + 14;
    var y = (e.clientY || 0) + 14;
    els.tip.style.left = Math.min(x, window.innerWidth - 300) + 'px';
    els.tip.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  }

  function hideTip() {
    if (els.tip) els.tip.style.display = 'none';
  }

  function updateTruth(feed) {
    if (!els.truth) return;
    var t = feed.totals || {};
    var settles = t.settles || 0;
    var ext = t.externalSettles || 0;
    var internal = t.internalSettles || (settles - ext);
    if (ext > 0) {
      els.truth.className = 'mon-truth is-external';
      els.truth.innerHTML = '<strong>' + ext + '</strong> external settlement' + (ext === 1 ? '' : 's') +
        ' · <strong>' + internal + '</strong> internal verification.';
    } else if (settles > 0) {
      els.truth.className = 'mon-truth';
      els.truth.innerHTML = '<strong>' + settles + '</strong> settlement' + (settles === 1 ? '' : 's') +
        ', all internal verification. No external agent has paid yet.';
    } else {
      var armed = (feed.totals && feed.totals.paidRoutes) || 0;
      els.truth.className = 'mon-truth';
      els.truth.innerHTML = '<strong>' + armed + ' paid routes</strong> armed on the board below. ' +
        'No settlements recorded yet — cells burn green as settlements land.';
    }
    if (els.durable) {
      els.durable.textContent = feed.durable
        ? 'Counters are durable (Redis).'
        : 'Counters are ephemeral on this deploy — history resets on restart. Set REDIS_URL for durable storage.';
    }
  }

  function settledEvents(feed) {
    return (feed.events || []).filter(function (e) { return e.settled; });
  }

  function filterReplayEvents(events) {
    var now = Date.now();
    if (state.mode === 'day') {
      var cut = now - 24 * 60 * 60 * 1000;
      return events.filter(function (e) {
        return new Date(e.ts).getTime() >= cut;
      });
    }
    return events.slice();
  }

  function renderTape(rows, markNew) {
    if (!els.tape) return;
    if (!rows.length) {
      els.tape.innerHTML = '<div class="mon-tape-row">No settlements in this window yet.</div>';
      return;
    }
    els.tape.innerHTML = rows.map(function (e) {
      var key = e.ts + '|' + e.route + '|' + (e.txHash || '');
      var isNew = markNew && !state.seenKeys[key];
      if (markNew) state.seenKeys[key] = 1;
      var srcCls = e.source === 'external' ? 'src-external' : 'src-internal';
      return '<div class="mon-tape-row' + (isNew ? ' is-new' : '') + '">' +
        '<span>' + fmtTime(e.ts) + '</span>' +
        '<span>' + shortPath(e.route) + '</span>' +
        '<span>' + (e.lane || '—') + '</span>' +
        '<span>' + fmtAtomic(e.amountAtomic) + '</span>' +
        '<span>' + (e.txHash || '—') + '</span>' +
        '<span class="' + srcCls + '">' + (e.source || '—') + '</span>' +
        '</div>';
    }).join('');
  }

  function applyRouteSnapshot(routeMap) {
    Object.keys(cells).forEach(function (path) {
      var r = routeMap[path];
      var cell = cells[path];
      if (!cell || !r) return;
      cell.setAttribute('data-state', routeState(r));
      var lbl = cell.querySelector('.mon-cell-lbl');
      if (lbl) lbl.textContent = cellLabel(r);
    });
  }

  function flashCell(path) {
    var cell = cells[path];
    if (!cell) return;
    cell.classList.add('is-flash');
    window.setTimeout(function () { cell.classList.remove('is-flash'); }, state.reduceMotion ? 120 : 480);
  }

  function cumulativeAt(events, idx) {
    var map = Object.create(null);
    (state.feed.routes || []).forEach(function (r) {
      map[r.path] = Object.assign({}, r, {
        probes: 0,
        settles: 0,
        internalSettles: 0,
        externalSettles: 0,
        verifies: 0
      });
    });
    for (var i = 0; i <= idx && i < events.length; i++) {
      var e = events[i];
      var r = map[e.route];
      if (!r) continue;
      if (e.settled) {
        r.settles += 1;
        if (e.source === 'external') r.externalSettles += 1;
        else r.internalSettles += 1;
      }
    }
    return map;
  }

  function tickReplay(now) {
    if (state.mode === 'live' || !state.replayEvents.length) return;
    var elapsed = now - state.replayStart;
    var progress = Math.min(1, elapsed / REPLAY_MS);
    var idx = Math.floor(progress * (state.replayEvents.length - 1));
    if (idx !== state.replayIdx) {
      state.replayIdx = idx;
      applyRouteSnapshot(cumulativeAt(state.replayEvents, idx));
      var slice = state.replayEvents.slice(0, idx + 1).reverse().slice(0, TAPE_ROWS);
      renderTape(slice, false);
      if (els.scrub) els.scrub.value = String(Math.round(progress * 1000));
      var last = state.replayEvents[idx];
      if (last && last.settled) flashCell(last.route);
    }
    if (progress >= 1 && !state.reduceMotion) {
      state.replayStart = now;
      state.replayIdx = 0;
    }
  }

  function loop(now) {
    if (!state.hidden) tickReplay(now);
    rafId = window.requestAnimationFrame(loop);
  }

  function showError(msg) {
    if (!els.err) return;
    els.err.style.display = 'block';
    els.err.textContent = msg + (state.lastOk ? ' Last updated ' + fmtTime(state.lastOk) + ' UTC.' : '');
  }

  function clearError() {
    if (els.err) els.err.style.display = 'none';
  }

  function applyFeed(feed, fromPoll) {
    state.feed = feed;
    state.lastOk = feed.generatedAt;
    clearError();
    buildGrid(feed);
    updateTruth(feed);

    var settled = settledEvents(feed).slice().sort(function (a, b) {
      return new Date(a.ts) - new Date(b.ts);
    });
    state.replayEvents = filterReplayEvents(settled);

    if (state.mode === 'live') {
      renderTape(settled.slice().reverse().slice(0, TAPE_ROWS), fromPoll);
      if (fromPoll) {
        settled.slice(-3).forEach(function (e) { flashCell(e.route); });
      }
    } else {
      state.replayStart = performance.now();
      state.replayIdx = -1;
      if (els.scrub) {
        els.scrub.style.display = state.replayEvents.length > 1 ? 'block' : 'none';
        els.scrub.value = '0';
      }
      applyRouteSnapshot(cumulativeAt(state.replayEvents, state.replayEvents.length - 1));
      renderTape(state.replayEvents.slice().reverse().slice(0, TAPE_ROWS), false);
    }

    if (els.meta) {
      els.meta.textContent = 'Updated ' + fmtTime(feed.generatedAt) + ' UTC · ' +
        (feed.totals && feed.totals.paidRoutes) + ' paid routes';
    }
  }

  async function fetchFeed() {
    try {
      var r = await fetch(FEED_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error('Feed returned ' + r.status);
      var json = await r.json();
      applyFeed(json, true);
    } catch (e) {
      state.err = e;
      showError('Could not load monitor feed. ' + (e && e.message ? e.message : 'Network error.'));
    }
  }

  function setMode(mode) {
    state.mode = mode;
    root.querySelectorAll('.mon-toggle button').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
    });
    if (state.feed) applyFeed(state.feed, false);
    window.clearInterval(pollTimer);
    if (mode === 'live') pollTimer = window.setInterval(fetchFeed, POLL_MS);
  }

  function onScrub() {
    if (!els.scrub || !state.replayEvents.length) return;
    var pct = Number(els.scrub.value) / 1000;
    var idx = Math.floor(pct * (state.replayEvents.length - 1));
    state.replayIdx = idx;
    applyRouteSnapshot(cumulativeAt(state.replayEvents, idx));
    renderTape(state.replayEvents.slice(0, idx + 1).reverse().slice(0, TAPE_ROWS), false);
  }

  root.querySelectorAll('.mon-toggle button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setMode(btn.getAttribute('data-mode'));
    });
  });

  if (els.scrub) els.scrub.addEventListener('input', onScrub);

  document.addEventListener('visibilitychange', function () {
    state.hidden = document.hidden;
  });

  try {
    state.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    state.reduceMotion = false;
  }

  setMode('all');
  fetchFeed();
  rafId = window.requestAnimationFrame(loop);

  window.addEventListener('beforeunload', function () {
    window.cancelAnimationFrame(rafId);
    window.clearInterval(pollTimer);
  });
})();

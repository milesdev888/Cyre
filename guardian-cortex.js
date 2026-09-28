/* guardian-cortex.js — dense sapphire neural graph behind the Guardian core.
   v2 TLC: labels no longer rotate through center (fixed ring positions, legible size),
   clusters distributed evenly so the field never lumps to one side, points fade
   behind the head disc so the morph reads. Same include, same canvas id. */
(function () {
  var stage = document.querySelector('.orb-stage');
  if (!stage) return;

  var canvas = document.getElementById('guardian-cortex');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'guardian-cortex';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = 2, W = 0, H = 0, t0 = performance.now(), raf = 0, visible = true;
  var nodes = [], edges = [];

  var COL = {
    deep: [18, 72, 190],
    mid: [72, 140, 255],
    ice: [186, 224, 255],
    soft: [140, 120, 220]
  };

  /* Labels sit at FIXED stage positions (center-origin, half-width = 1),
     chosen to sit between the SCAN/WATCH/SWAP/SCORE/GATE badges and
     outside the head disc (r > 0.42). They do not rotate. */
  var LABELS = [
    { name: 'scan signals', x:  0.00, y: -0.62 },
    { name: 'risk gate',    x:  0.30, y: -0.58 },
    { name: 'score card',   x:  0.60, y:  0.20 },
    { name: 'swap route',   x:  0.10, y:  0.64 },
    { name: 'watch stream', x: -0.38, y:  0.57 },
    { name: 'oracle feed',  x: -0.63, y: -0.06 }
  ];

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function seed() {
    nodes = []; edges = [];
    var i, j, k, p, q;

    /* Six clusters at even angles — never lumps to one side */
    var CN = 6;
    for (k = 0; k < CN; k++) {
      var a = (k / CN) * Math.PI * 2 - Math.PI / 2;
      var cx = Math.cos(a) * 0.52;
      var cy = Math.sin(a) * 0.48;
      for (i = 0; i < 42; i++) {
        var ang = Math.random() * Math.PI * 2;
        var rr = Math.pow(Math.random(), 0.55) * 0.13;
        nodes.push({
          x: cx + Math.cos(ang) * rr,
          y: cy + Math.sin(ang) * rr * 0.95,
          z: rand(-0.3, 0.45),
          s: rand(0.4, 1.25),
          hue: Math.random() < 0.15 ? 0 : Math.random() < 0.55 ? 1 : (Math.random() < 0.85 ? 2 : 3),
          spark: Math.random(),
          drift: rand(0.2, 1)
        });
      }
    }
    /* Core cluster (dimmed later behind the head) */
    for (i = 0; i < 110; i++) {
      var u = Math.random() * Math.PI * 2;
      var cr = Math.pow(Math.random(), 0.55) * 0.26;
      nodes.push({
        x: Math.cos(u) * cr, y: Math.sin(u) * cr * 0.95,
        z: rand(-0.3, 0.45), s: rand(0.4, 1.1),
        hue: Math.random() < 0.5 ? 1 : 2,
        spark: Math.random(), drift: rand(0.2, 1)
      });
    }
    /* Sparse field fill — lighter than v1 */
    for (i = 0; i < 120; i++) {
      var t = Math.random() * Math.PI * 2;
      var vr = Math.pow(Math.random(), 0.7) * 0.85;
      nodes.push({
        x: Math.cos(t) * vr, y: Math.sin(t) * vr * 0.92,
        z: rand(-0.35, 0.45), s: rand(0.25, 0.8),
        hue: Math.random() < 0.5 ? 1 : 2,
        spark: Math.random() * 0.6, drift: rand(0.15, 0.8)
      });
    }

    for (i = 0; i < nodes.length; i++) {
      p = nodes[i];
      var linked = 0;
      for (j = i + 1; j < nodes.length && linked < 3; j++) {
        q = nodes[j];
        var dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.03) {
          edges.push({ a: i, b: j, w: 1 - Math.sqrt(d2) / 0.18 });
          linked++;
        }
      }
    }
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
    W = Math.max(1, Math.floor(rect.width * dpr));
    H = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  function project(x, y, z, scale, rot) {
    var c = Math.cos(rot), s = Math.sin(rot);
    var xr = x * c - z * s;
    var zr = x * s + z * c;
    var persp = 2.5 / (2.5 + zr);
    return {
      x: W * 0.5 + xr * persp * scale,
      y: H * 0.5 + y * persp * scale,
      a: Math.max(0.08, Math.min(1, (zr + 1.1) / 1.8)),
      p: persp
    };
  }

  /* Fade anything that lands behind the head disc (46% of stage → r 0.23·W) */
  function headFade(x, y) {
    var dx = x - W * 0.5, dy = y - H * 0.5;
    var d = Math.sqrt(dx * dx + dy * dy);
    var r = W * 0.25;
    if (d >= r) return 1;
    return 0.18 + 0.82 * (d / r);
  }

  function drawFrame(now) {
    var elapsed = (now - t0) / 1000;
    var rot = reduce ? 0.25 : elapsed * 0.07;
    var breathe = reduce ? 1 : 1 + Math.sin(elapsed * 0.7) * 0.016;
    var scale = Math.max(40, Math.min(W, H) * 0.42 * breathe);
    var i, e, a, b, p, q, col, sz, pa;

    ctx.clearRect(0, 0, W, H);

    /* Soft sapphire nebula wash */
    var g = ctx.createRadialGradient(W * 0.5, H * 0.48, scale * 0.08, W * 0.5, H * 0.5, scale * 1.05);
    g.addColorStop(0, 'rgba(186,224,255,0.12)');
    g.addColorStop(0.55, 'rgba(72,140,255,0.05)');
    g.addColorStop(1, 'rgba(8,6,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, scale * 1.05, 0, Math.PI * 2);
    ctx.fill();

    /* Edges */
    ctx.lineWidth = Math.max(0.45, dpr * 0.35);
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      a = project(nodes[e.a].x, nodes[e.a].y, nodes[e.a].z, scale, rot);
      b = project(nodes[e.b].x, nodes[e.b].y, nodes[e.b].z, scale, rot);
      pa = e.w * Math.min(a.a, b.a) * 0.2 * Math.min(headFade(a.x, a.y), headFade(b.x, b.y));
      if (pa < 0.02) continue;
      ctx.strokeStyle = rgba(COL.mid, pa);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /* Nodes */
    for (i = 0; i < nodes.length; i++) {
      p = nodes[i];
      var ox = p.x + Math.sin(elapsed * p.drift + i) * 0.008;
      var oy = p.y + Math.cos(elapsed * p.drift * 0.9 + i) * 0.007;
      q = project(ox, oy, p.z, scale, rot);
      col = p.hue === 0 ? COL.deep : p.hue === 1 ? COL.mid : p.hue === 2 ? COL.ice : COL.soft;
      sz = p.s * (0.55 + dpr * 0.28) * q.p;
      pa = (0.2 + p.spark * 0.45) * q.a * headFade(q.x, q.y);
      if (pa < 0.02) continue;
      ctx.beginPath();
      ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, pa);
      ctx.fill();
      if (p.spark > 0.82 && pa > 0.2) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, sz * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + p.spark * 0.3).toFixed(2) + ')';
        ctx.fill();
      }
    }

    /* Cluster labels — fixed positions, legible, never through the center */
    ctx.textAlign = 'center';
    ctx.font = '500 ' + (10.5 * dpr * 0.55).toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    for (i = 0; i < LABELS.length; i++) {
      var L = LABELS[i];
      var lx = W * 0.5 + L.x * scale;
      var ly = H * 0.5 + L.y * scale;
      var flick = reduce ? 1 : 0.85 + 0.15 * Math.sin(elapsed * 0.9 + i * 1.7);
      ctx.fillStyle = 'rgba(6,8,18,0.55)';
      var tw = ctx.measureText(L.name).width;
      ctx.fillRect(lx - tw / 2 - 4 * dpr * 0.55, ly - 7 * dpr * 0.55, tw + 8 * dpr * 0.55, 12 * dpr * 0.55);
      ctx.fillStyle = 'rgba(214,232,255,' + (0.66 * flick).toFixed(2) + ')';
      ctx.fillText(L.name, lx, ly + 3 * dpr * 0.55);
    }

    /* Tiny live HUD — top-left of stage */
    ctx.textAlign = 'left';
    ctx.font = '500 ' + (9.5 * dpr * 0.55).toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(160,200,255,0.5)';
    ctx.fillText('GUARDIAN CORTEX · LIVE', 12 * dpr * 0.55, 16 * dpr * 0.55);
    ctx.fillStyle = 'rgba(120,170,255,0.34)';
    ctx.fillText('scan · watch · oracle · gate', 12 * dpr * 0.55, 29 * dpr * 0.55);
  }

  function loop(now) {
    if (!visible && !reduce) { raf = requestAnimationFrame(loop); return; }
    drawFrame(now || performance.now());
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  seed();
  resize();
  drawFrame(performance.now());
  if (!reduce) raf = requestAnimationFrame(loop);
  window.addEventListener('resize', function () {
    resize();
    if (reduce) drawFrame(performance.now());
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = !!(entries[0] && entries[0].isIntersecting);
    }, { threshold: 0.05 }).observe(stage);
  }
})();

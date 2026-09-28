/* guardian-net.js — round sapphire agent-orb (video-style)
   Dense spherical particle core + satellite nodes with elliptical orbits.
   Draws behind #guardian-head. Green ACTIVE / red GATE accents. */
(function () {
  var stage = document.querySelector('.orb-stage');
  if (!stage) return;

  var canvas = document.getElementById('guardian-net');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'guardian-net';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  var W = 0, H = 0, t0 = performance.now(), raf = 0, visible = true;

  var COL = {
    deep: [18, 72, 190],
    mid: [72, 140, 255],
    ice: [186, 224, 255],
    green: [61, 220, 132],
    red: [255, 77, 94]
  };

  var NODES = [
    { name: 'SCAN', packet: 'MINT DIGEST', a: -2.35, r: 0.78, gate: false },
    { name: 'WATCH', packet: 'ALERT STREAM', a: 2.55, r: 0.8, gate: false },
    { name: 'ORACLE', packet: 'RWA FEED', a: -1.55, r: 0.76, gate: false },
    { name: 'SWAP', packet: 'ROUTE PACKET', a: 0.95, r: 0.82, gate: false },
    { name: 'SCORE', packet: 'GRADE CARD', a: 0.15, r: 0.84, gate: false },
    { name: 'GATE', packet: 'RISK PACKET', a: -0.55, r: 0.8, gate: true }
  ];

  var core = [];
  function seedCore(n) {
    var out = [], i, u, v, th, ph, rr;
    for (i = 0; i < n; i++) {
      u = Math.random(); v = Math.random();
      th = u * Math.PI * 2;
      ph = Math.acos(2 * v - 1);
      rr = Math.pow(Math.random(), 0.45); /* denser center */
      out.push({
        x: Math.sin(ph) * Math.cos(th) * rr,
        y: Math.cos(ph) * rr,
        z: Math.sin(ph) * Math.sin(th) * rr,
        s: 0.35 + Math.random() * 1.1,
        hue: Math.random() < 0.25 ? 0 : Math.random() < 0.55 ? 1 : 2,
        spark: 0.5 + Math.random() * 0.5
      });
    }
    return out;
  }
  core = seedCore(900);

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function resize() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    W = Math.max(1, Math.floor(rect.width * dpr));
    H = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = W; canvas.height = H;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  function project(x, y, z, scale) {
    var persp = 2.4 / (2.4 + z);
    return {
      x: W * 0.5 + x * persp * scale,
      y: H * 0.5 + y * persp * scale,
      a: Math.max(0.15, Math.min(1, (z + 1.05) / 1.7)),
      p: persp
    };
  }

  function drawEllipses(cx, cy, rx, ry, rot, color, count) {
    var i, j, steps = 48, a0, x, y, c = Math.cos(rot), s = Math.sin(rot);
    for (i = 0; i < count; i++) {
      var rxi = rx * (0.72 + i * 0.18);
      var ryi = ry * (0.62 + i * 0.2);
      ctx.beginPath();
      for (j = 0; j <= steps; j++) {
        a0 = (j / steps) * Math.PI * 2;
        x = Math.cos(a0) * rxi;
        y = Math.sin(a0) * ryi;
        var X = cx + x * c - y * s;
        var Y = cy + x * s + y * c;
        if (j === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.7, dpr * 0.55);
      ctx.stroke();
    }
  }

  function drawFrame(now) {
    var elapsed = (now - t0) / 1000;
    var rot = reduce ? 0.4 : elapsed * 0.12;
    var breathe = reduce ? 1 : 1 + Math.sin(elapsed * 0.9) * 0.02;
    var scale = Math.min(W, H) * 0.28 * breathe;
    if (!(scale > 8)) scale = Math.max(40, Math.min(W, H) * 0.28 || 40);
    var c = Math.cos(rot), s = Math.sin(rot);
    var i, p, q, col, sz;

    ctx.clearRect(0, 0, W, H);

    /* Soft round core wash — single sapphire, not multi-hue bloom */
    var g = ctx.createRadialGradient(W * 0.5, H * 0.5, scale * 0.15, W * 0.5, H * 0.5, scale * 1.55);
    g.addColorStop(0, 'rgba(186,224,255,0.2)');
    g.addColorStop(0.45, 'rgba(72,140,255,0.1)');
    g.addColorStop(1, 'rgba(18,72,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, scale * 1.55, 0, Math.PI * 2);
    ctx.fill();

    /* Outer guide ring — perfect circle */
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, scale * 1.72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(72,140,255,0.45)';
    ctx.lineWidth = Math.max(1.2, dpr * 0.9);
    ctx.stroke();

    /* Green + red orbit markers on the outer ring */
    var gx = W * 0.5 + Math.cos(elapsed * 0.35) * scale * 1.72;
    var gy = H * 0.5 + Math.sin(elapsed * 0.35) * scale * 1.72;
    var rx = W * 0.5 + Math.cos(elapsed * 0.35 + Math.PI * 0.85) * scale * 1.72;
    var ry = H * 0.5 + Math.sin(elapsed * 0.35 + Math.PI * 0.85) * scale * 1.72;
    ctx.beginPath(); ctx.arc(gx, gy, 4.5 * dpr * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = rgba(COL.green, 1); ctx.fill();
    ctx.beginPath(); ctx.arc(rx, ry, 4.5 * dpr * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = rgba(COL.red, 1); ctx.fill();

    /* Spokes + nodes */
    for (i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      var ang = n.a + (reduce ? 0 : Math.sin(elapsed * 0.4 + i) * 0.03);
      var nx = Math.cos(ang) * n.r;
      var ny = Math.sin(ang) * n.r * 0.92;
      var np = project(nx, ny, 0.15, scale * 1.55);
      var spokeCol = n.gate ? rgba(COL.red, 0.55) : rgba(COL.mid, 0.4);
      ctx.strokeStyle = spokeCol;
      ctx.lineWidth = Math.max(0.8, dpr * 0.6);
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.5);
      ctx.lineTo(np.x, np.y);
      ctx.stroke();

      /* traveling pulse */
      if (!reduce) {
        var u = (elapsed * 0.35 + i * 0.17) % 1;
        var px = W * 0.5 + (np.x - W * 0.5) * u;
        var py = H * 0.5 + (np.y - H * 0.5) * u;
        ctx.beginPath();
        ctx.arc(px, py, 2.2 * dpr * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = n.gate ? rgba(COL.red, 0.9) : rgba(COL.ice, 0.9);
        ctx.fill();
      }

      drawEllipses(
        np.x, np.y,
        16 * dpr * 0.7, 11 * dpr * 0.7,
        ang * 0.4 + elapsed * 0.2,
        n.gate ? rgba(COL.red, 0.35) : rgba(COL.ice, 0.28),
        2
      );
      ctx.beginPath();
      ctx.arc(np.x, np.y, 3.6 * dpr * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = n.gate ? rgba(COL.red, 1) : rgba(COL.ice, 1);
      ctx.fill();

      ctx.font = (10 * dpr * 0.55) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = n.gate ? 'rgba(255,180,188,0.9)' : 'rgba(230,240,255,0.85)';
      var label = n.name + (n.gate ? '  REVIEW' : '  ACTIVE');
      ctx.fillText(label, np.x, np.y + 22 * dpr * 0.55);
      ctx.fillStyle = n.gate ? 'rgba(255,140,150,0.55)' : 'rgba(150,190,255,0.5)';
      ctx.font = (8 * dpr * 0.55) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText(n.packet, np.x, np.y - 20 * dpr * 0.55);

      /* status dot */
      ctx.beginPath();
      ctx.arc(np.x - ctx.measureText(label).width * 0.5 - 6 * dpr * 0.4, np.y + 22 * dpr * 0.55 - 3, 2.4 * dpr * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = n.gate ? rgba(COL.red, 1) : rgba(COL.green, 1);
      ctx.fill();
    }

    /* Dense spherical core particles — perfectly round cloud */
    for (i = 0; i < core.length; i++) {
      p = core[i];
      var xr = p.x * c - p.z * s;
      var zr = p.x * s + p.z * c;
      q = project(xr, p.y, zr, scale);
      col = p.hue === 0 ? COL.deep : p.hue === 1 ? COL.mid : COL.ice;
      sz = p.s * (0.7 + dpr * 0.35) * q.p;
      var pa = (0.25 + p.spark * 0.35) * q.a;
      ctx.beginPath();
      ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, pa);
      ctx.fill();
      if (p.spark > 0.75) {
        ctx.beginPath();
        ctx.arc(q.x - sz * 0.25, q.y - sz * 0.3, Math.max(0.4, sz * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + p.spark * 0.4).toFixed(2) + ')';
        ctx.fill();
      }
    }

    /* Bright round core highlight */
    var cg = ctx.createRadialGradient(W * 0.5, H * 0.48, 0, W * 0.5, H * 0.5, scale * 0.42);
    cg.addColorStop(0, 'rgba(255,255,255,0.35)');
    cg.addColorStop(0.35, 'rgba(186,224,255,0.12)');
    cg.addColorStop(1, 'rgba(72,140,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, scale * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop(now) {
    if (!visible && !reduce) { raf = requestAnimationFrame(loop); return; }
    drawFrame(now || performance.now());
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  resize();
  drawFrame(performance.now());
  if (!reduce) raf = requestAnimationFrame(loop);
  window.addEventListener('resize', function () {
    resize();
    if (reduce) drawFrame(performance.now());
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0] && entries[0].isIntersecting;
    }, { threshold: 0.05 }).observe(stage);
  }

  /* Keep guardian portrait smaller / centered over the bright core */
  var head = document.getElementById('guardian-head');
  if (head && head.parentElement) {
    head.parentElement.classList.add('net-core');
  }
})();

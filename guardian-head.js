/* guardian-head.js — dust → glass robot forms → BURST → girl1 → girl2 → dust
   Glass bot is procedural (sapphire shell). Then the two portraits:
   robot.jpg (full cyborg) → guardian2.jpg (half-human).
   Beads spill past the disc on burst. prefers-reduced-motion → static glass. */
(function () {
  var canvas = document.getElementById('guardian-head');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
  var W = 640, H = 640, points = [], facets = [];
  var t0 = performance.now(), raf = 0, visible = true;
  var robotImg = null, herImg = null, robotReady = false, herReady = false;

  /* Sapphire glass — deep + mid + ice only */
  var COL = {
    deep:  [18,  72,  190],
    mid:   [72, 140, 255],
    ice:   [186, 224, 255]
  };

  function pickHue() {
    var r = Math.random();
    if (r < 0.32) return 0;
    if (r < 0.72) return 1;
    return 2;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hueColor(hue, a) {
    var c = hue === 0 ? COL.deep : hue === 1 ? COL.mid : COL.ice;
    return rgba(c, a);
  }
  function dist3(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function seed(n) {
    var out = [], i, u, v, th, ph, x, y, z, r, band;
    for (i = 0; i < n; i++) {
      u = Math.random(); v = Math.random();
      th = u * Math.PI * 2; ph = Math.acos(2 * v - 1);
      x = Math.sin(ph) * Math.cos(th) * 0.78;
      y = Math.cos(ph) * 1.05 - 0.08;
      z = Math.sin(ph) * Math.sin(th) * 0.72;
      if (y < -0.15) {
        r = 0.72 + (y + 0.15) * 0.55;
        x *= Math.max(0.42, r); z *= Math.max(0.48, r + 0.05);
      }
      if (y > 0.55) { x *= 0.92; z *= 0.9; }
      if (z < -0.25 && Math.random() > 0.35) continue;
      band = Math.random();
      if (band < 0.12) {
        x = (Math.random() - 0.5) * 0.55; y = 0.18 + (Math.random() - 0.5) * 0.12; z = 0.55 + Math.random() * 0.18;
      } else if (band < 0.2) {
        x = (Math.random() - 0.5) * 0.12; y = 0.02 + (Math.random() - 0.5) * 0.28; z = 0.62 + Math.random() * 0.16;
      } else if (band < 0.28) {
        x = (Math.random() - 0.5) * 0.38; y = -0.28 + (Math.random() - 0.5) * 0.1; z = 0.58 + Math.random() * 0.14;
      }
      /* Scatter past the disc edge — wide enough to read as a burst, still on-canvas */
      var ds = 0.78 + Math.random() * 1.2;
      var da = Math.random() * Math.PI * 2;
      var elev = (Math.random() - 0.4) * 0.9;
      out.push({
        x: x, y: y, z: z,
        gx: x * (0.96 + (Math.random() - 0.5) * 0.06),
        gy: y * (0.98 + (Math.random() - 0.5) * 0.05),
        gz: z * (1.02 + (Math.random() - 0.5) * 0.08),
        dx: x + Math.cos(da) * ds,
        dy: y + Math.sin(da) * ds * 0.68 + elev * 0.28,
        dz: z + (Math.random() - 0.5) * ds * 0.75,
        boom: 0.7 + Math.random() * 0.55,
        hue: pickHue(), s: 0.4 + Math.random() * 0.8, facet: Math.random(),
        spark: 0.55 + Math.random() * 0.45
      });
    }
    return out;
  }

  function buildFacets(pts, count) {
    var out = [], i, i0, i1, i2;
    for (i = 0; i < count; i++) {
      i0 = (Math.random() * pts.length) | 0;
      i1 = (i0 + 1 + ((Math.random() * 18) | 0)) % pts.length;
      i2 = (i0 + 3 + ((Math.random() * 24) | 0)) % pts.length;
      if (dist3(pts[i0], pts[i1]) > 0.62 || dist3(pts[i0], pts[i2]) > 0.62) continue;
      out.push({ i0: i0, i1: i1, i2: i2, hue: pts[i0].hue });
    }
    return out;
  }

  points = seed(720);
  facets = buildFacets(points, 110);

  function loadImg(src, onOk) {
    try {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { onOk(im); if (reduce) drawFrame(performance.now()); };
      im.onerror = function () { onOk(null); };
      im.src = src;
    } catch (e) { onOk(null); }
  }
  loadImg('/robot.jpg', function (im) { robotImg = im; robotReady = !!im; });
  loadImg('/guardian2.jpg', function (im) { herImg = im; herReady = !!im; });

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, rect.width);
    var cssH = Math.max(1, rect.height);
    dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
    var scale = Math.max(dpr, 2000 / Math.max(cssW, cssH));
    scale = Math.min(scale, 4);
    W = Math.max(1, Math.floor(cssW * scale));
    H = Math.max(1, Math.floor(cssH * scale));
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  }

  /* Sequence (~30s) — remembered order:
     dust → glass robot FORMS → BURST → girl1 (robot.jpg) → girl2 (guardian2.jpg) → dust
     0–10%   dust cloud
     10–28%  assemble glass robot
     28–40%  hold glass robot
     40–52%  glass BURST (shatter before the girls)
     52–58%  brief dust after burst
     58–70%  girl 1 — full cyborg
     70–80%  crossfade to girl 2 — half-human
     80–88%  girl 2 hold
     88–100% dissolve to dust */
  var PERIOD = 30;
  function cycleWeights(elapsed) {
    if (reduce) return { dust: 0, form: 1, glass: 1, robot: 0, her: 0, burst: 0 };
    var p = (elapsed % PERIOD) / PERIOD;
    var dust = 0, form = 0, glass = 0, robot = 0, her = 0, burst = 0;
    if (p < 0.10) {
      dust = 1;
    } else if (p < 0.28) {
      var t = smoothstep((p - 0.10) / 0.18);
      dust = 1 - t; form = t; glass = t;
    } else if (p < 0.40) {
      form = 1; glass = 1;
    } else if (p < 0.52) {
      var tB = smoothstep((p - 0.40) / 0.12);
      form = 1 - tB * 0.85; glass = 1 - tB; dust = tB;
      burst = Math.sin(tB * Math.PI); /* peak mid-shatter */
    } else if (p < 0.58) {
      dust = 1;
      burst = 0.18 * (1 - (p - 0.52) / 0.06);
    } else if (p < 0.70) {
      var t1 = smoothstep((p - 0.58) / 0.12);
      dust = 1 - t1; form = t1; robot = t1;
    } else if (p < 0.80) {
      var t2 = smoothstep((p - 0.70) / 0.10);
      form = 1; robot = 1 - t2; her = t2;
    } else if (p < 0.88) {
      form = 1; her = 1;
    } else {
      var t3 = smoothstep((p - 0.88) / 0.12);
      form = 1 - t3; her = 1 - t3; dust = t3;
      burst = Math.sin(t3 * Math.PI) * 0.55; /* softer closing dissolve */
    }
    return { dust: dust, form: form, glass: glass, robot: robot, her: her, burst: burst };
  }

  var phaseWeights = cycleWeights;
  /* Optional QA: /?phase=dust|glass|burst|robot|her */
  try {
    var phaseQ = new URLSearchParams(location.search).get('phase');
    var phaseMap = {
      dust:   { dust: 1, form: 0, glass: 0, robot: 0, her: 0, burst: 0.2 },
      glass:  { dust: 0, form: 1, glass: 1, robot: 0, her: 0, burst: 0 },
      burst:  { dust: 0.7, form: 0.25, glass: 0.2, robot: 0, her: 0, burst: 1 },
      robot:  { dust: 0, form: 1, glass: 0, robot: 1, her: 0, burst: 0 },
      her:    { dust: 0, form: 1, glass: 0, robot: 0, her: 1, burst: 0 }
    };
    if (phaseQ && phaseMap[phaseQ]) {
      var fixedPhase = phaseMap[phaseQ];
      phaseWeights = function () { return fixedPhase; };
      reduce = true;
    }
  } catch (e) { /* ignore */ }

  function projectPoint(p, rot, breathe, w) {
    var fa = w.form;
    var x0 = lerp(p.dx, p.gx, fa);
    var y0 = lerp(p.dy, p.gy, fa);
    var z0 = lerp(p.dz, p.gz, fa);

    /* Outward glass boom — push toward scatter targets (past the disc, still framed) */
    if (w.burst > 0.02) {
      var boom = w.burst * (p.boom || 1) * 0.95;
      x0 = lerp(x0, p.dx, boom);
      y0 = lerp(y0, p.dy, boom);
      z0 = lerp(z0, p.dz, boom);
    }

    if (fa > 0) {
      y0 *= 1 + fa * 0.03;
      if (y0 < -0.1) { x0 *= 1 - fa * 0.1; z0 *= 1 - fa * 0.08; }
    }
    var c = Math.cos(rot), s = Math.sin(rot);
    var xr = x0 * c - z0 * s, zr = x0 * s + z0 * c, yr = y0 * breathe;
    var persp = 2.6 / (2.6 + zr);
    return {
      x: W * 0.5 + xr * persp * W * 0.34,
      y: H * 0.5 + yr * persp * H * 0.32,
      z: zr, a: Math.max(0.12, Math.min(1, (zr + 1.1) / 1.8)),
      hue: p.hue, s: p.s * persp, facet: p.facet, spark: p.spark
    };
  }

  /* Procedural sapphire glass robot — forms before the portrait girls */
  function drawGlassRobot(w) {
    var r = w.glass * (1 - w.burst * 0.85);
    if (r < 0.05) return;
    var cx = W * 0.5, cy = H * 0.48, rx = W * 0.22, ry = H * 0.26;
    ctx.save(); ctx.translate(cx, cy);
    var g = ctx.createLinearGradient(-rx, -ry, rx, ry);
    g.addColorStop(0, 'rgba(186,224,255,' + (0.28 * r).toFixed(3) + ')');
    g.addColorStop(0.22, 'rgba(72,140,255,' + (0.32 * r).toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(12,28,70,' + (0.9 * r).toFixed(3) + ')');
    g.addColorStop(0.82, 'rgba(6,12,32,' + (0.96 * r).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(2,4,14,' + (0.98 * r).toFixed(3) + ')');
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath(); ctx.ellipse(0, ry * 0.02, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,10,24,' + (0.5 * r).toFixed(3) + ')'; ctx.fill();

    ctx.strokeStyle = 'rgba(238,250,255,' + (0.5 * r).toFixed(3) + ')';
    ctx.lineWidth = Math.max(2, dpr * 2.2);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(72,140,255,' + (0.7 * r).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.2, dpr * 1.3);
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = 'rgba(72,140,255,' + (0.4 * r).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, dpr * 1.1);
    ctx.beginPath(); ctx.moveTo(-rx * 0.62, -ry * 0.12);
    ctx.quadraticCurveTo(0, -ry * 0.28, rx * 0.62, -ry * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rx * 0.55, ry * 0.22);
    ctx.quadraticCurveTo(0, ry * 0.34, rx * 0.55, ry * 0.22); ctx.stroke();

    ctx.beginPath(); ctx.ellipse(-rx * 0.32, -ry * 0.38, rx * 0.22, ry * 0.48, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(238,250,255,' + (0.2 * r).toFixed(3) + ')'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(rx * 0.2, -ry * 0.15, rx * 0.1, ry * 0.22, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72,140,255,' + (0.14 * r).toFixed(3) + ')'; ctx.fill();

    /* Soft glass eyes — readable, not bright bloom */
    var eyeY = -ry * 0.04;
    var eyeRx = rx * 0.14, eyeRy = ry * 0.075;
    [-0.34, 0.34].forEach(function (ex) {
      var ex2 = rx * ex;
      ctx.beginPath(); ctx.ellipse(ex2, eyeY, eyeRx * 2.4, eyeRy * 2.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(72,140,255,' + (0.22 * r).toFixed(3) + ')'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex2, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(186,224,255,' + (0.75 * r).toFixed(3) + ')'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex2, eyeY, eyeRx * 0.42, eyeRy * 0.48, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(5,8,18,' + (0.9 * r).toFixed(3) + ')'; ctx.fill();
    });
    ctx.restore();
  }

  function drawPortrait(img, ready, weight, maxAlpha) {
    if (!ready || !img || weight < 0.05) return;
    var alpha = Math.pow(clamp(weight, 0, 1), 0.9) * maxAlpha;
    var iw = img.naturalWidth || 600, ih = img.naturalHeight || 600;
    /* Portrait sits in the center disc; canvas is oversized for burst spill */
    var size = Math.min(W, H) * 0.58, dw = size, dh = size * (ih / iw);
    if (dh > H * 0.62) { dh = H * 0.62; dw = dh * (iw / ih); }
    var dx = (W - dw) * 0.5, dy = (H - dh) * 0.42;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.globalAlpha = alpha * 0.28;
    ctx.fillStyle = 'rgba(8,6,18,1)';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.globalAlpha = alpha * 0.22;
    var eg = ctx.createLinearGradient(0, dy + dh * 0.28, 0, dy + dh * 0.52);
    eg.addColorStop(0, 'rgba(5,8,18,0)');
    eg.addColorStop(0.45, 'rgba(5,8,18,0.85)');
    eg.addColorStop(1, 'rgba(5,8,18,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(dx, dy + dh * 0.22, dw, dh * 0.4);
    ctx.restore();
  }

  function drawFacets(projected, w) {
    var m = w.form * (0.35 + w.glass * 0.9) * (1 - Math.max(w.robot, w.her) * 0.85) * (1 - w.burst * 0.6);
    if (m < 0.08) return;
    var i, f, a, b, c, alpha;
    ctx.lineWidth = Math.max(0.6, dpr * (0.7 + m * 0.5));
    for (i = 0; i < facets.length; i++) {
      f = facets[i]; a = projected[f.i0]; b = projected[f.i1]; c = projected[f.i2];
      if (!a || !b || !c) continue;
      alpha = m * 0.22 * Math.min(a.a, b.a, c.a);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath();
      ctx.fillStyle = 'rgba(40,90,200,' + (alpha * 0.2).toFixed(3) + ')'; ctx.fill();
      ctx.strokeStyle = hueColor(f.hue, alpha); ctx.stroke();
    }
  }

  function drawFrame(now) {
    var elapsed = (now - t0) / 1000;
    var w = phaseWeights(elapsed);
    var rot = reduce ? 0.35 : Math.sin(elapsed * 0.18) * 0.35 + elapsed * 0.045;
    var breathe = reduce ? 1 : 1 + Math.sin(elapsed * 0.9) * 0.016;
    var projected = [], i, j, a, b, dx, dy, dist, alpha, col;
    var faceAmt = Math.max(w.robot, w.her);
    var particleAlpha = (1 - faceAmt * 0.82) * (0.35 + w.form * 0.4 + w.dust * 0.55 + w.burst * 0.55 + w.glass * 0.2);
    var linkAlphaScale = (1 - faceAmt * 0.85) * (0.16 + w.form * 0.4 + w.dust * 0.4 + w.burst * 0.4 + w.glass * 0.25);

    ctx.clearRect(0, 0, W, H);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    for (i = 0; i < points.length; i++) projected.push(projectPoint(points[i], rot, breathe, w));

    drawFacets(projected, w);
    drawGlassRobot(w);
    /* Two girls AFTER the glass burst */
    drawPortrait(robotImg, robotReady, w.robot, 0.72);
    drawPortrait(herImg, herReady, w.her, 0.88);

    ctx.lineWidth = Math.max(0.35, dpr * 0.35);
    var maxDist = (22 - faceAmt * 10 + w.dust * 10 + w.burst * 14 + w.glass * 6) * dpr;
    var step = faceAmt > 0.5 ? 4 : (w.burst > 0.4 ? 1 : 2);
    for (i = 0; i < projected.length; i += step) {
      a = projected[i]; var linked = 0;
      for (j = i + 1; j < projected.length && linked < 3; j++) {
        b = projected[j]; dx = a.x - b.x; if (dx > maxDist || dx < -maxDist) continue;
        dy = a.y - b.y; if (dy > maxDist || dy < -maxDist) continue;
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist || dist < 2) continue;
        alpha = (1 - dist / maxDist) * Math.min(a.a, b.a) * 0.18 * linkAlphaScale;
        if (alpha < 0.02) continue;
        if (a.hue === 2 || b.hue === 2) col = rgba(COL.ice, alpha * 0.95);
        else if (a.hue === 0 || b.hue === 0) col = rgba(COL.deep, alpha * 0.95);
        else col = rgba(COL.mid, alpha * 0.9);
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        linked++;
      }
    }

    for (i = 0; i < projected.length; i++) {
      a = projected[i];
      var burst = Math.max(w.burst, w.dust * 0.55, (1 - w.form) * 0.35);
      var sz = a.s * (0.6 + dpr * 0.24) * (0.7 + burst * 0.75 + w.form * 0.12 + w.glass * 0.08);
      if (faceAmt > 0.35 && w.burst < 0.2) sz *= 1 - faceAmt * 0.55;
      if (w.glass > 0.5 && w.burst < 0.15) sz *= 0.72;
      var cRgb = a.hue === 0 ? COL.deep : a.hue === 1 ? COL.mid : COL.ice;
      var glassA = 0.32 + a.a * 0.24 + burst * 0.28;
      var pa = glassA * Math.max(0.14, particleAlpha);
      var spark = (a.spark || 0.7) * (0.75 + burst * 0.85);

      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      ctx.beginPath();
      ctx.arc(a.x, a.y, sz, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + cRgb[0] + ',' + cRgb[1] + ',' + cRgb[2] + ',' + pa.toFixed(3) + ')';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(a.x, a.y, sz, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.88, pa * 1.55 * spark).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.5, sz * 0.26);
      ctx.stroke();

      var hx = a.x - sz * 0.32;
      var hy = a.y - sz * 0.35;
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(0.4, sz * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.98, 0.42 + spark * 0.55).toFixed(3) + ')';
      ctx.fill();

      if (burst > 0.55 && a.hue === 2) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, sz * 1.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(186,224,255,' + (0.12 + burst * 0.18).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.4, sz * 0.12);
        ctx.stroke();
      }
    }
  }

  function loop(now) {
    if (!visible && !reduce) { raf = requestAnimationFrame(loop); return; }
    drawFrame(now || performance.now());
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  resize(); drawFrame(performance.now());
  if (!reduce) raf = requestAnimationFrame(loop);
  window.addEventListener('resize', function () { resize(); if (reduce) drawFrame(performance.now()); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0] && entries[0].isIntersecting;
    }, { threshold: 0.05 }).observe(canvas);
  }
})();

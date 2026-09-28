/* hero-meteors.js — sapphire glass meteor field (3 blues only). No soft bloom. */
(function () {
  'use strict';
  var hero = document.querySelector('.hero');
  if (!hero || document.getElementById('cy-ai-mesh')) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.createElement('canvas');
  canvas.id = 'cy-ai-mesh';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
  hero.style.overflow = 'hidden';
  var kids = hero.children;
  for (var k = 0; k < kids.length; k++) {
    if (kids[k].style && !kids[k].style.zIndex) {
      var pos = getComputedStyle(kids[k]).position;
      if (pos === 'static') kids[k].style.position = 'relative';
      kids[k].style.zIndex = '1';
    }
  }
  hero.insertBefore(canvas, hero.firstChild);

  var ctx = canvas.getContext('2d', { alpha: true });
  var width = 0, height = 0, dpr = 1;
  var meteors = [];
  var COUNT = 18;
  var raf = 0, t0 = 0, visible = true, resizeTimer = 0;

  var PALETTE = [
    { r: 18,  g: 72,  b: 190 },  // deep sapphire
    { r: 72,  g: 140, b: 255 },  // bright sapphire
    { r: 186, g: 224, b: 255 }   // ice glass
  ];

  function applySize(w, h) {
    var native = window.devicePixelRatio || 1;
    dpr = Math.min(Math.max(native, 2), 3);
    width = w;
    height = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  }

  function resize(opts) {
    opts = opts || {};
    var rect = hero.getBoundingClientRect();
    var w = Math.max(1, rect.width | 0);
    var h = Math.max(1, rect.height | 0);
    var first = !width || !height;
    if (!first && !opts.force && Math.abs(w - width) < 2 && Math.abs(h - height) < 100) return;
    applySize(w, h);
    if (first || !meteors.length || opts.reseed) init();
  }

  function Meteor() { this.reset(true); }
  Meteor.prototype.reset = function (spread) {
    var c = PALETTE[(Math.random() * PALETTE.length) | 0];
    this.r = c.r; this.g = c.g; this.b = c.b;
    // Travel top-right → bottom-left (classic meteor diagonal)
    this.angle = Math.PI * 0.72 + (Math.random() - 0.5) * 0.22;
    this.len = 28 + Math.random() * 55;
    this.thick = 1.1 + Math.random() * 1.4;
    this.speed = reduce ? 0 : (55 + Math.random() * 90); // px/sec — calm
    this.alpha = 0.45 + Math.random() * 0.4;
    this.life = 0;
    this.maxLife = 2.4 + Math.random() * 3.2;
    if (spread) {
      this.x = Math.random() * width * 1.3 - width * 0.15;
      this.y = Math.random() * height * 1.1 - height * 0.05;
      this.life = Math.random() * this.maxLife;
    } else {
      // Spawn just off top / right edge
      if (Math.random() < 0.55) {
        this.x = Math.random() * width * 1.15;
        this.y = -20 - Math.random() * 40;
      } else {
        this.x = width + 20 + Math.random() * 40;
        this.y = Math.random() * height * 0.7;
      }
    }
  };
  Meteor.prototype.update = function (dt) {
    if (reduce) return;
    this.life += dt;
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    if (this.life > this.maxLife || this.x < -80 || this.y > height + 80) this.reset(false);
  };
  Meteor.prototype.draw = function () {
    // Fade in/out over lifetime — no soft glow halo
    var t = this.life / this.maxLife;
    var fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
    var a = this.alpha * fade;
    if (a < 0.02) return;

    var cos = Math.cos(this.angle);
    var sin = Math.sin(this.angle);
    var tx = this.x - cos * this.len;
    var ty = this.y - sin * this.len;

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineCap = 'round';

    // Hard trail streak
    var grad = ctx.createLinearGradient(tx, ty, this.x, this.y);
    grad.addColorStop(0, 'rgba(' + this.r + ',' + this.g + ',' + this.b + ',0)');
    grad.addColorStop(0.55, 'rgba(' + this.r + ',' + this.g + ',' + this.b + ',' + (a * 0.55).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(' + this.r + ',' + this.g + ',' + this.b + ',' + a.toFixed(3) + ')');
    ctx.strokeStyle = grad;
    ctx.lineWidth = this.thick;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    // Crisp head (solid, no bloom)
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.thick * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' +
      Math.min(255, this.r + 50) + ',' +
      Math.min(255, this.g + 50) + ',' +
      Math.min(255, this.b + 40) + ',' +
      Math.min(1, a + 0.15).toFixed(3) + ')';
    ctx.fill();
  };

  function init() {
    meteors.length = 0;
    var n = Math.min(COUNT, Math.max(10, ((width * height) / 42000) | 0));
    for (var i = 0; i < n; i++) meteors.push(new Meteor());
  }

  function frame(now) {
    raf = 0;
    if (!visible && !reduce) return;
    var dt = t0 ? Math.min((now - t0) / 1000, 0.05) : 0.016;
    t0 = now;
    ctx.clearRect(0, 0, width, height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    for (var i = 0; i < meteors.length; i++) {
      meteors[i].update(dt);
      meteors[i].draw();
    }
    if (!reduce && visible) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduce) { frame(performance.now()); return; }
    if (raf) return;
    t0 = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    t0 = 0;
  }
  function scheduleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeTimer = 0;
      resize();
      start();
    }, 120);
  }

  resize({ force: true, reseed: true });
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { resize({ force: true }); start(); }, 280);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible) start(); else stop();
      });
    }, { threshold: 0.02 }).observe(hero);
  }
  start();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && visible) start();
  });
})();

/* ==========================================================================
   Constellation background — moving grey dots joined by thin lines (Image 1)
   Two depth layers: a faint, larger "far" layer and a crisp dark "near" layer.
   ========================================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('constellation');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LAYERS = [
    { // far layer: light grey, larger, slower, very faint links
      name: 'far', density: 1 / 26000, min: 22, max: 70, speed: 0.10,
      radius: [2.2, 6.5], dot: [190, 190, 190], dotAlpha: [0.28, 0.55],
      link: 110, linkColor: [0, 0, 0], linkAlpha: 0.055, linkWidth: 0.7,
    },
    { // near layer: dark dots, crisp thin lines
      name: 'near', density: 1 / 15000, min: 40, max: 130, speed: 0.22,
      radius: [1.6, 4.2], dot: [40, 40, 40], dotAlpha: [0.75, 1],
      link: 128, linkColor: [50, 50, 50], linkAlpha: 0.42, linkWidth: 0.8,
    },
  ];
  // Light: grey dots on white (Image 1). Dark: white/silver dots on near-black.
  const PALETTES = {
    light: { bg: '#ffffff', far: { dot: [190, 190, 190], link: [0, 0, 0], linkAlpha: 0.055 }, near: { dot: [40, 40, 40], link: [50, 50, 50], linkAlpha: 0.42 } },
    dark: { bg: '#121212', far: { dot: [112, 118, 130], link: [255, 255, 255], linkAlpha: 0.05 }, near: { dot: [228, 231, 236], link: [212, 216, 224], linkAlpha: 0.34 } },
  };
  let bgColor = PALETTES.light.bg;
  function setTheme(name) {
    const p = PALETTES[name] || PALETTES.light;
    bgColor = p.bg;
    LAYERS[0].dot = p.far.dot; LAYERS[0].linkColor = p.far.link; LAYERS[0].linkAlpha = p.far.linkAlpha;
    LAYERS[1].dot = p.near.dot; LAYERS[1].linkColor = p.near.link; LAYERS[1].linkAlpha = p.near.linkAlpha;
    canvas.style.background = bgColor;
    if (reduced && W) draw(0);
  }

  let W = 0, H = 0, DPR = 1;
  let particles = [];
  let raf = 0, running = false, last = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function build() {
    particles = [];
    const area = W * H;
    for (const L of LAYERS) {
      const n = Math.max(L.min, Math.min(L.max, Math.round(area * L.density)));
      for (let i = 0; i < n; i++) {
        const big = Math.random() < 0.12; // a few emphasised dots, like the reference image
        particles.push({
          L,
          x: rand(0, W), y: rand(0, H),
          vx: rand(-1, 1) * L.speed, vy: rand(-1, 1) * L.speed,
          r: big ? rand(L.radius[1] * 0.9, L.radius[1] * 1.3) : rand(L.radius[0], L.radius[1] * 0.75),
          a: rand(L.dotAlpha[0], L.dotAlpha[1]),
          phase: rand(0, Math.PI * 2),
        });
      }
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
    if (reduced) draw(0);
  }

  function step(dt) {
    const k = dt / 16.67; // normalise to 60fps
    for (const p of particles) {
      p.x += p.vx * k; p.y += p.vy * k;
      // soft bounce at the edges
      if (p.x < -20) { p.x = -20; p.vx = Math.abs(p.vx); } else if (p.x > W + 20) { p.x = W + 20; p.vx = -Math.abs(p.vx); }
      if (p.y < -20) { p.y = -20; p.vy = Math.abs(p.vy); } else if (p.y > H + 20) { p.y = H + 20; p.vy = -Math.abs(p.vy); }
    }
  }

  function draw(t) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    for (const L of LAYERS) {
      const pts = particles.filter(p => p.L === L);
      const link2 = L.link * L.link;
      // links
      ctx.lineWidth = L.linkWidth;
      ctx.lineCap = 'round';
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > link2) continue;
          const alpha = (1 - Math.sqrt(d2) / L.link) * L.linkAlpha;
          ctx.strokeStyle = 'rgba(' + L.linkColor[0] + ',' + L.linkColor[1] + ',' + L.linkColor[2] + ',' + alpha.toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // dots
      for (const p of pts) {
        const tw = 0.85 + 0.15 * Math.sin(t * 0.0012 + p.phase); // gentle twinkle
        ctx.fillStyle = 'rgba(' + L.dot[0] + ',' + L.dot[1] + ',' + L.dot[2] + ',' + (p.a * tw).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function frame(t) {
    if (!running) return;
    const dt = last ? Math.min(t - last, 50) : 16.67;
    last = t;
    step(dt);
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced) return;
    running = true; last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  resize();
  start();

  // small public hook so the app can pause it when fully covered (flat map mode)
  window.Constellation = { start, stop, setTheme };
})();

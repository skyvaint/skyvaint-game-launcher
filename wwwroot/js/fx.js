// Foreground effects drawn over the interface on their own canvas: cursor sparks, click shockwaves, launch warp
// tunnel and confetti. Each one can be switched off; the canvas only animates while something is alive.
window.SV = window.SV || {};

SV.fx = (() => {
  const cv = document.getElementById('fx');
  const ctx = cv.getContext('2d');
  let opt = { trail: true, ripple: true, warp: true, confetti: true, sparks: 1, accent: [255, 31, 31], accent2: [255, 77, 61] };
  let W = 0, H = 0, raf = 0, last = 0, enabled = true;
  let sparks = [], rings = [], bits = [], stars = [], warp = 0, warpTarget = 0;

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function resize() {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
  }
  addEventListener('resize', resize);
  resize();

  function wake() {
    if (!raf && enabled && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);

    warp += (warpTarget - warp) * Math.min(1, dt * 4);
    if (warp > 0.01) {
      if (stars.length < 220) for (let i = 0; i < 12; i++) stars.push({ a: Math.random() * 6.283, d: Math.random() * 0.2, s: 0.5 + Math.random() * 1.6, c: Math.random() > 0.5 });
      const cx = W / 2, cy = H / 2, max = Math.hypot(W, H) / 2;
      ctx.lineCap = 'round';
      for (const s of stars) {
        const from = s.d;
        s.d += s.d * dt * (2.4 + warp * 5) * s.s + dt * 0.03;
        ctx.strokeStyle = rgba(s.c ? opt.accent : [255, 255, 255], Math.min(1, s.d * 2.2) * warp);
        ctx.lineWidth = 1 + s.d * 3.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.a) * from * max, cy + Math.sin(s.a) * from * max);
        ctx.lineTo(cx + Math.cos(s.a) * s.d * max, cy + Math.sin(s.a) * s.d * max);
        ctx.stroke();
      }
      stars = stars.filter((s) => s.d < 1.15);
    } else stars = [];

    for (const p of sparks) {
      p.life -= dt * p.fade;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
      ctx.fillStyle = rgba(p.c, Math.max(0, p.life));
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    sparks = sparks.filter((p) => p.life > 0);

    for (const r of rings) {
      r.life -= dt * 2.1;
      const rad = (1 - r.life) * r.size;
      ctx.strokeStyle = rgba(opt.accent, Math.max(0, r.life) * 0.9);
      ctx.lineWidth = 1 + r.life * 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = rgba([255, 255, 255], Math.max(0, r.life) * 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.6, 0, 6.283); ctx.stroke();
    }
    rings = rings.filter((r) => r.life > 0);

    for (const b of bits) {
      b.life -= dt * 0.45;
      b.vy += 900 * dt; b.vx *= 1 - dt * 0.6;
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = rgba(b.c, Math.min(1, b.life * 2));
      ctx.fillRect(-b.w / 2, -b.h / 2 * Math.cos(b.rot * 2.3), b.w, b.h * Math.cos(b.rot * 2.3));
      ctx.restore();
    }
    bits = bits.filter((b) => b.life > 0 && b.y < H + 40);

    raf = sparks.length || rings.length || bits.length || warp > 0.01 || warpTarget ? requestAnimationFrame(frame) : 0;
    if (!raf) ctx.clearRect(0, 0, W, H);
  }

  let lastX = 0, lastY = 0;
  addEventListener('mousemove', (e) => {
    if (!enabled || !opt.trail) return;
    const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    if (dist < 14 || sparks.length > 400) return;
    lastX = e.clientX; lastY = e.clientY;
    for (let i = 0; i < Math.round(2 * opt.sparks); i++)
      sparks.push({ x: e.clientX, y: e.clientY, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.7) * 90, r: 1.5 + Math.random() * 2.5, life: 0.9, fade: 1.8, c: Math.random() > 0.5 ? opt.accent : opt.accent2 });
    wake();
  }, { passive: true });

  addEventListener('pointerdown', (e) => { if (enabled && opt.ripple) burst(e.clientX, e.clientY, 0.6); }, { passive: true });

  function burst(x, y, power = 1) {
    if (!enabled) return;
    rings.push({ x, y, size: 90 * power + 40, life: 1 });
    for (let i = 0; i < 14 * power * opt.sparks; i++) {
      const a = Math.random() * 6.283, v = (120 + Math.random() * 300) * power;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 2 + Math.random() * 3, life: 1, fade: 1.5, c: Math.random() > 0.4 ? opt.accent : [255, 255, 255] });
    }
    wake();
  }

  function confetti() {
    if (!enabled || !opt.confetti) return;
    const palette = [opt.accent, opt.accent2, [255, 255, 255], [255, 214, 64]];
    for (const side of [0, 1])
      for (let i = 0; i < 70; i++)
        bits.push({
          x: side ? W + 10 : -10, y: H * (0.55 + Math.random() * 0.3),
          vx: (side ? -1 : 1) * (500 + Math.random() * 900), vy: -(500 + Math.random() * 900),
          w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14,
          life: 1.3 + Math.random() * 0.6, c: palette[i % palette.length],
        });
    wake();
  }

  return {
    configure(next) { opt = { ...opt, ...next }; },
    setEnabled(on) { enabled = on; if (!on) { sparks = []; rings = []; bits = []; warpTarget = 0; } },
    burst, confetti,
    warp(on) { if (!enabled || !opt.warp) on = false; warpTarget = on ? 1 : 0; if (on) wake(); },
  };
})();

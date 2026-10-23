// Space transitions on their own canvas: the opening (a warp through a starfield to a planet rising over the
// horizon), warping out when the launcher hides, warping back in when it returns, and a short re-entry when the
// window gets the focus back from a game. The canvas only animates while one of these is playing.
window.SV = window.SV || {};

SV.space = (() => {
  const cv = document.getElementById('space');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, raf = 0, scene = null, stars = [];
  let accent = [255, 31, 31], accent2 = [255, 77, 61];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function resize() {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
    stars = Array.from({ length: 420 }, () => ({ a: Math.random() * 6.283, d: Math.random(), s: 0.3 + Math.random() * 1.6, tw: Math.random() * 6.28 }));
  }
  addEventListener('resize', resize);
  resize();

  // speed: how fast stars fly outward (negative flies inward); streak: tail length.
  function drawStars(speed, streak, alpha, dt) {
    const cx = W / 2, cy = H / 2, max = Math.hypot(W, H) / 2;
    ctx.lineCap = 'round';
    for (const s of stars) {
      const before = s.d;
      s.d += speed * dt * (0.15 + s.d) * s.s;
      if (s.d > 1.2) s.d = 0.02 + Math.random() * 0.05;
      if (s.d < 0.01) s.d = 1.1;
      const tail = Math.max(0.002, Math.min(0.5, Math.abs(s.d - before) * streak));
      const from = speed >= 0 ? s.d - tail : s.d + tail;
      const glow = Math.min(1, s.d * 1.6) * alpha * (0.6 + 0.4 * Math.sin(s.tw += dt * 3));
      ctx.strokeStyle = s.s > 1.4 ? rgba(accent2, glow) : `rgba(255,255,255,${glow})`;
      ctx.lineWidth = 0.6 + s.d * 2.2 * s.s;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(s.a) * from * max, cy + Math.sin(s.a) * from * max);
      ctx.lineTo(cx + Math.cos(s.a) * s.d * max, cy + Math.sin(s.a) * s.d * max);
      ctx.stroke();
    }
  }

  function nebula(t, alpha) {
    for (const [x, y, r, c, a] of [[0.72, 0.32, 0.55, accent, 0.32], [0.22, 0.7, 0.45, accent2, 0.22], [0.5, 0.5, 0.35, [120, 60, 255], 0.12]]) {
      const g = ctx.createRadialGradient(W * (x + Math.sin(t * 0.3 + x * 9) * 0.02), H * y, 0, W * x, H * y, Math.max(W, H) * r);
      g.addColorStop(0, rgba(c, a * alpha));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // A planet rising over the bottom edge, lit from the top-right by the accent colour.
  function planet(rise, alpha) {
    const r = Math.max(W, H) * 0.9, cx = W * 0.5, cy = H + r - H * 0.22 * rise;
    const body = ctx.createRadialGradient(cx + r * 0.3, cy - r * 0.6, r * 0.1, cx, cy, r);
    body.addColorStop(0, `rgba(40,20,24,${alpha})`);
    body.addColorStop(0.8, `rgba(10,6,8,${alpha})`);
    body.addColorStop(1, `rgba(4,3,4,${alpha})`);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    for (const [w, a] of [[26, 0.18], [8, 0.5], [2, 1]]) {
      ctx.strokeStyle = rgba(accent, a * alpha);
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
    }
    const halo = ctx.createRadialGradient(cx, cy - r, 0, cx, cy - r, H * 0.5);
    halo.addColorStop(0, rgba(accent2, 0.28 * alpha * rise));
    halo.addColorStop(1, rgba(accent2, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
  }

  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

  const SCENES = {
    boot: { length: 3.1, draw(t, dt) {
      ctx.fillStyle = `rgba(2,2,4,${t < 2.6 ? 1 : 1 - (t - 2.6) / 0.5})`;
      ctx.fillRect(0, 0, W, H);
      const fade = t < 2.6 ? 1 : Math.max(0, 1 - (t - 2.6) / 0.5);
      const warp = t < 1.1 ? 1 - t / 1.1 : 0;
      nebula(t, ease((t - 0.6) / 1.2) * fade);
      drawStars(0.1 + warp * 2.4, 3 + warp * 26, fade, dt);
      planet(ease((t - 0.9) / 1.4), fade);
      if (t > 1.0 && t < 1.25) { ctx.fillStyle = `rgba(255,255,255,${(1.25 - t) * 2.4})`; ctx.fillRect(0, 0, W, H); }
    } },
    leave: { length: 0.56, draw(t, dt) {
      const k = t / 0.56;
      ctx.fillStyle = `rgba(2,2,4,${ease(k)})`;
      ctx.fillRect(0, 0, W, H);
      drawStars(0.6 + k * 4, 6 + k * 30, 0.4 + k * 0.6, dt);
      if (k > 0.8) { ctx.fillStyle = `rgba(255,255,255,${(k - 0.8) * 2.5})`; ctx.fillRect(0, 0, W, H); }
    } },
    arrive: { length: 0.75, draw(t, dt) {
      const k = t / 0.75;
      ctx.fillStyle = `rgba(2,2,4,${1 - ease(k)})`;
      ctx.fillRect(0, 0, W, H);
      drawStars(-(2.2 * (1 - k)), 18 * (1 - k) + 2, 1 - k, dt);
    } },
    refocus: { length: 0.45, draw(t, dt) {
      const k = t / 0.45;
      drawStars(1.6 * (1 - k), 14 * (1 - k), 0.7 * (1 - k), dt);
      ctx.fillStyle = rgba(accent, 0.12 * (1 - k));
      ctx.fillRect(0, 0, W, H);
    } },
  };

  function frame(now) {
    if (!scene) { raf = 0; return; }
    const dt = Math.min(0.05, (now - scene.last) / 1000);
    scene.last = now;
    scene.t += dt;
    ctx.clearRect(0, 0, W, H);
    SCENES[scene.name].draw(scene.t, dt);
    if (scene.t >= SCENES[scene.name].length) {
      const done = scene.done;
      scene = null;
      ctx.clearRect(0, 0, W, H);
      cv.classList.remove('on');
      raf = 0;
      done && done();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function play(name, done) {
    if (!SCENES[name]) return done && done();
    if (scene && scene.done && scene.name !== name) scene.done();
    scene = { name, t: 0, last: performance.now(), done };
    cv.classList.add('on');
    if (!raf) raf = requestAnimationFrame(frame);
  }

  return {
    setColors(a, a2) { accent = a; accent2 = a2; },
    play,
    get busy() { return !!scene; },
  };
})();

// The opening: a dark field with thin neon lines drifting across it on a diagonal, soft light streaks gliding
// sideways and a glow in one corner, then a plain fade into the launcher. Everything takes its colours from your theme
// and is drawn live, so there are no files to load and it stays sharp at any size, up to 4K. The resolution steps
// down by itself on a PC that can't keep up, and all of it is thrown away once HOME is showing.
window.SV = window.SV || {};

SV.intro = (() => {
  // Times in ms: the field stays up until `fade`, then dissolves into HOME by `end`.
  const T = { fade: 3000, end: 4300 };
  const ANGLE = 56 * Math.PI / 180;     // the lines' direction: down and to the right
  const DX = Math.cos(ANGLE), DY = Math.sin(ANGLE);
  const LINES = 96, STREAKS = 5, MOTES = 14;

  const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function sprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }
  const glow = (color) => sprite(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, css(color, 1)); r.addColorStop(0.3, css(color, 0.35)); r.addColorStop(1, css(color, 0));
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  // A soft bar of light that fades out towards both ends and both edges.
  const bar = (color) => sprite(512, 32, (g, w, h) => {
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, css(color, 0)); across.addColorStop(0.2, css(color, 1)); across.addColorStop(0.8, css(color, 1)); across.addColorStop(1, css(color, 0));
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const down = g.createLinearGradient(0, 0, 0, h);
    down.addColorStop(0, 'rgba(0,0,0,0)'); down.addColorStop(0.5, 'rgba(0,0,0,1)'); down.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = down; g.fillRect(0, 0, w, h);
  });

  function play({ accent, accent2, bg, sound, onEnter, onDone }) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return false;
    const a = rgb(accent), b = rgb(accent2), base = rgb(bg), white = [255, 255, 255];
    const hot = mix(mix(a, b, 0.5), white, 0.55);
    const glowA = glow(a), glowB = glow(b), glowHot = glow(hot), barA = bar(mix(a, b, 0.35)), barHot = bar(mix(hot, white, 0.5));

    const box = document.createElement('div');
    box.id = 'flow';
    box.append(cv);
    document.body.append(box);

    let W = 0, H = 0, U = 1, scale = 1, back = null;
    function size() {
      const max = Math.min(1, 3840 / (innerWidth * devicePixelRatio), 2160 / (innerHeight * devicePixelRatio));
      const f = devicePixelRatio * max * scale;
      W = cv.width = Math.round(innerWidth * f);
      H = cv.height = Math.round(innerHeight * f);
      U = H / 1080; // sizes below are in pixels at 1080p
      // The deep background hardly changes, so it is painted once, small, and stretched.
      back = sprite(480, 270, (g, w, h) => {
        const l = g.createLinearGradient(0, 0, w, h * 0.4);
        l.addColorStop(0, css(mix(base, [0, 0, 0], 0.5))); l.addColorStop(0.55, css(mix(base, a, 0.1))); l.addColorStop(1, css(mix(base, a, 0.24)));
        g.fillStyle = l; g.fillRect(0, 0, w, h);
      });
    }
    size();

    // A line: a few long, nearly straight runs, sometimes ending in a sharp kink like a circuit trace.
    function makeLine(line, anywhere) {
      const z = Math.random();                // depth: far lines are soft and dim, near ones thin and bright
      const near = z > 0.42;
      const pts = [[0, 0]];
      let u = 0, v = 0;
      for (let i = 0, n = 2 + (Math.random() * 3 | 0); i < n; i++) {
        u += rnd(90, 300);
        v += rnd(-34, 34);
        pts.push([u, v]);
      }
      if (near && Math.random() < 0.55) {     // the kink
        const side = Math.random() < 0.5 ? -1 : 1, s = rnd(20, 46);
        pts.push([u + s * 0.2, v + side * s], [u + s * 0.2 + rnd(30, 70), v + side * s + rnd(-6, 6)]);
        u += s * 0.2 + 50;
      }
      // How far the screen reaches along the lines and across them, so they aren't wasted off-screen.
      const along = (W * DX + H * DY) / U * 0.56, across = (W * DY + H * DX) / U * 0.54;
      Object.assign(line, {
        pts, len: u, z, near, speed: rnd(70, 125) * (0.55 + z * 0.75),
        // Where it crosses the screen, sideways to its direction.
        cross: rnd(-across, across),
        at: anywhere ? rnd(-along - u, along) : -along - u - rnd(0, 500),
        hue: Math.random(), width: near ? rnd(1, 2.1) : rnd(3, 6.5), alpha: near ? rnd(0.5, 1) : rnd(0.1, 0.28),
      });
      return line;
    }
    const lines = Array.from({ length: LINES }, () => makeLine({}, true));

    function makeStreak(s, delay) {
      const dashes = [];
      let x = rnd(0, 0.3);
      while (x < 1) { const l = rnd(0.015, 0.14); dashes.push([x, l, rnd(0.25, 1)]); x += l + rnd(0.012, 0.09); }
      return Object.assign(s, { y: rnd(0.07, 0.93), drift: rnd(-14, 14), vx: rnd(-85, 85), x: rnd(-0.25, 0.35), wide: rnd(0.55, 1.25), life: rnd(2200, 3900), born: performance.now() + delay, dashes, core: Math.random() < 0.65 });
    }
    const streaks = Array.from({ length: STREAKS }, (_, i) => makeStreak({}, i * rnd(120, 520) - 500));

    const motes = Array.from({ length: MOTES }, () => ({ x: Math.random(), y: Math.random(), l: rnd(26, 80), w: rnd(8, 24), a: rnd(0.05, 0.17), sp: rnd(14, 34), turn: rnd(-0.5, 0.5) }));

    function drawLine(l, dt) {
      l.at += l.speed * dt;
      const px = (u) => W / 2 + (u * DX) * U, py = (u) => H / 2 + (u * DY) * U;
      const ox = (u, v) => px(u) - v * DY * U + l.cross * -DY * U, oy = (u, v) => py(u) + v * DX * U + l.cross * DX * U;
      const tail = l.at, head = l.at + l.len;
      const hx = ox(head, 0), hy = oy(head, 0), tx = ox(tail, 0), ty = oy(tail, 0);
      if (tx > W + 200 * U || ty > H + 200 * U) return makeLine(l, false);
      if (Math.max(hx, tx) < -200 * U || Math.max(hy, ty) < -200 * U || Math.min(hx, tx) > W + 200 * U) return;
      const col = l.hue < 0.45 ? a : l.hue < 0.8 ? b : hot;
      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, css(col, 0));
      grad.addColorStop(0.5, css(col, l.alpha * 0.55));
      grad.addColorStop(0.92, css(mix(col, white, 0.25), l.alpha));
      grad.addColorStop(1, css(mix(col, white, 0.6), l.alpha));
      ctx.beginPath();
      for (let i = 0; i < l.pts.length; i++) {
        const [u, v] = l.pts[i];
        const x = ox(l.at + u, v), y = oy(l.at + u, v);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = l.width * U;
      ctx.lineJoin = 'miter';
      ctx.stroke();
      if (l.near && l.z > 0.68) {
        // A faint wider pass: the bloom around the brightest lines.
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = l.width * 5 * U;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const [u, v] = l.pts[l.pts.length - 1], s = 15 * U;
        ctx.globalAlpha = 0.65 * l.alpha;
        ctx.drawImage(glowHot, ox(l.at + u, v) - s, oy(l.at + u, v) - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
      }
    }

    function drawStreak(s, now, dt) {
      const age = now - s.born;
      if (age < 0) return;
      if (age > s.life) return void makeStreak(s, rnd(0, 500));
      const fade = Math.sin(Math.PI * age / s.life);
      s.y += s.drift * dt / 1080;
      s.x += s.vx * dt / 1920;
      const y = s.y * H, left = s.x * W, len = s.wide * W;
      ctx.globalAlpha = 0.52 * fade;
      ctx.drawImage(barA, left, y - 26 * U, len, 52 * U);
      ctx.globalAlpha = 0.7 * fade;
      ctx.drawImage(barA, left, y - 6 * U, len, 12 * U);
      if (s.core) for (const [p, l, br] of s.dashes) {
        ctx.globalAlpha = br * fade;
        ctx.drawImage(barHot, left + p * len, y - 5 * U, l * len, 10 * U);
      }
      ctx.globalAlpha = 1;
    }

    function drawMotes(dt) {
      ctx.save();
      for (const m of motes) {
        m.x += DX * m.sp * dt / 1920;
        m.y += DY * m.sp * dt / 1080;
        if (m.x > 1.1 || m.y > 1.1) { m.x = rnd(-0.1, 0.8); m.y = -0.08; }
        ctx.setTransform(1, 0, 0, 1, m.x * W, m.y * H);
        ctx.rotate(ANGLE + m.turn);
        ctx.globalAlpha = m.a;
        ctx.drawImage(glowB, -m.l * U, -m.w * U, m.l * 2 * U, m.w * 2 * U);
      }
      ctx.restore();
    }

    // The clock starts at the first frame that really gets drawn: the page is still busy loading when this is called,
    // and that wait mustn't eat into the opening.
    let start = 0, clock = 0, raf = 0, last = 0, frames = 0, slow = 0, leaving = false, finished = false, fadeAt = T.fade, guard = 0;

    function enter() {
      if (leaving) return;
      leaving = true;
      box.classList.add('fl-leave');
      onEnter && onEnter();
    }
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      cancelAnimationFrame(raf);
      removeEventListener('keydown', skip, true);
      removeEventListener('mousedown', skip, true);
      enter();
      box.remove();
      // Canvases keep their memory until collected unless they are emptied.
      for (const c of [cv, back, glowA, glowB, glowHot, barA, barHot]) c.width = c.height = 0;
      onDone && onDone();
    }
    // Any key or click goes straight to the fade.
    function skip(e) {
      e.stopPropagation();
      e.preventDefault();
      fadeAt = Math.min(fadeAt, clock);
    }
    addEventListener('keydown', skip, true);
    addEventListener('mousedown', skip, true);

    function frame(now) {
      if (!start) {
        start = last = now;
        box.classList.add('fl-on');
        clearTimeout(guard);
        guard = setTimeout(finish, T.end + 8000);
      }
      // The page is still settling while this plays. Time only counts as drawn time, so a hiccup can't shorten it.
      clock += Math.min(50, now - last);
      const ms = clock;
      if (ms >= fadeAt) enter();
      if (ms >= fadeAt + (T.end - T.fade)) return finish();
      const dt = Math.min(0.05, (now - last) / 1000);
      if (now - last > 26) slow++; else slow = Math.max(0, slow - 1);
      if (++frames > 14 && slow > 9 && scale > 0.4) { scale *= 0.75; size(); slow = 0; frames = 0; }
      last = now;

      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(back, 0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // The corner glow breathes very slowly.
      const g = (1.05 + Math.sin(ms / 1700) * 0.08) * H;
      ctx.globalAlpha = 0.42;
      ctx.drawImage(glowA, W - g * 0.72, H - g * 0.82, g * 1.5, g * 1.5);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowHot, W - g * 0.13, H - g * 0.2, g * 0.3, g * 0.3);
      ctx.globalAlpha = 1;
      drawMotes(dt);
      for (const l of lines) if (!l.near) drawLine(l, dt);
      for (const l of lines) if (l.near) drawLine(l, dt);
      for (const s of streaks) drawStreak(s, now, dt);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    // A hidden window gets no frames, so the opening can't be left hanging over HOME.
    guard = setTimeout(finish, 20000);
    sound && sound('boot');
    return true;
  }

  return { play };
})();

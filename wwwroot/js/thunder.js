// Hover effects for the buttons you choose (Settings → EFFECTS → HOVER):
//   THUNDER  lightning that keeps crackling around the button for as long as the mouse is on it (as on skyvaint.com)
//   3D       the button tilts towards the mouse, with a light that follows it
// Each kind of button can have them or not (HOME icons, app grids, HOME widgets, game tiles, the top bar, menu
// buttons), and any one HOME icon, widget or app grid can override that with data-thunder / data-tilt="on|off".
(() => {
  const A = SV.app;
  const GROUPS = {
    icons: ['HOME icons', '#hi .hi'],
    apps: ['App grid icons', '.hwa'],
    widgets: ['HOME widgets', '#hw .hw:not(.hw-apps), #hwf .hw:not(.hw-apps)'],
    tiles: ['Game tiles', '#shelf .tile'],
    topbar: ['Top bar buttons', '#topbar .func'],
    buttons: ['Menu buttons', '.overlay .btn'],
    profiles: ['Profile cards', '.prof-screen .pf'],
  };
  const DEF = { thunder: { icons: false, apps: false, widgets: false, tiles: false, topbar: false, buttons: false, profiles: false }, tilt: { icons: true, apps: true, widgets: true, tiles: false, topbar: false, buttons: false, profiles: false }, color: 'ssj', strength: 1 };
  const C = () => { const f = A.cfg && A.cfg.fx; if (!f) return DEF; f.hoverFx = { ...DEF, ...(f.hoverFx || {}) }; f.hoverFx.thunder = { ...DEF.thunder, ...(f.hoverFx.thunder || {}) }; f.hoverFx.tilt = { ...DEF.tilt, ...(f.hoverFx.tilt || {}) }; return f.hoverFx; };
  const motionOff = () => !A.cfg || A.cfg.backdrop.motion === false || document.body.dataset.input === 'pad';

  // Which effect a hovered element gets: its own setting first, then its group's.
  function wants(el, kind) {
    if (kind === 'thunder' && !Object.values(C().thunder).some(Boolean)) return false; // all off: nothing has it
    const own = el.closest('[data-' + kind + ']');
    if (own && (own === el || own.contains(el))) { const v = own.dataset[kind]; if (v === 'on') return true; if (v === 'off') return false; }
    const c = C()[kind];
    return Object.entries(GROUPS).some(([g, [, sel]]) => c[g] && el.matches(sel));
  }
  const target = (node) => {
    const sel = Object.values(GROUPS).map((g) => g[1]).join(',');
    return node && node.closest ? node.closest(sel) : null;
  };

  // ---- thunder: an aura like a selected card in Dragon Ball Legends: a breathing glow round the frame, a shine
  //      sweeping across, and short zig-zag sparks flashing on and around it (a bigger burst as the mouse arrives)
  const PAD = 70; // room around the button for bolts that reach out past it
  function start(b) {
    if (b._crackle || motionOff()) return;
    const cv = document.createElement('canvas');
    cv.className = 'arc-hold';
    cv.setAttribute('aria-hidden', 'true');
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.append(cv);
    const g = cv.getContext('2d');
    const conf = C(), k = Math.max(0.4, Math.min(2, conf.strength || 1));
    const cs = getComputedStyle(document.documentElement);
    const glow = { accent: cs.getPropertyValue('--accent').trim() || '#ff1f1f', ssj: '#ffe25a', blue: '#5fd2ff', white: '#dfefff' }[conf.color] || '#ffe25a';
    let W = 0, H = 0, w = 0, h = 0, rad = 0, dpr = 1;
    const size = () => {
      const r = b.getBoundingClientRect();
      // the button's own size before any scale or tilt
      w = b.offsetWidth || r.width; h = b.offsetHeight || r.height;
      dpr = Math.min(2, devicePixelRatio || 1);
      W = w + PAD * 2; H = h + PAD * 2;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const br = parseFloat(getComputedStyle(b).borderRadius) || 0;
      rad = Math.max(1, Math.min(br || Math.min(w, h) * 0.22, Math.min(w, h) / 2));
    };
    size();
    // A point on the rounded-rectangle edge at distance t (0..1) round it, with the outward direction.
    const edge = (t) => {
      const sw = w - 2 * rad, sh = h - 2 * rad, arc = (Math.PI / 2) * rad;
      const L = 2 * sw + 2 * sh + 4 * arc;
      let d = ((t % 1) + 1) % 1 * L;
      const seg = [[sw, (u) => [PAD + rad + u, PAD, 0, -1]], [arc, (u) => { const a = -Math.PI / 2 + u / rad; return [PAD + w - rad + Math.cos(a) * rad, PAD + rad + Math.sin(a) * rad, Math.cos(a), Math.sin(a)]; }],
        [sh, (u) => [PAD + w, PAD + rad + u, 1, 0]], [arc, (u) => { const a = u / rad; return [PAD + w - rad + Math.cos(a) * rad, PAD + h - rad + Math.sin(a) * rad, Math.cos(a), Math.sin(a)]; }],
        [sw, (u) => [PAD + w - rad - u, PAD + h, 0, 1]], [arc, (u) => { const a = Math.PI / 2 + u / rad; return [PAD + rad + Math.cos(a) * rad, PAD + h - rad + Math.sin(a) * rad, Math.cos(a), Math.sin(a)]; }],
        [sh, (u) => [PAD, PAD + h - rad - u, -1, 0]], [arc, (u) => { const a = Math.PI + u / rad; return [PAD + rad + Math.cos(a) * rad, PAD + rad + Math.sin(a) * rad, Math.cos(a), Math.sin(a)]; }]];
      for (const [len, f] of seg) { if (d <= len || len === 0 && false) return f(Math.max(0, d)); d -= len; }
      return seg[0][1](0);
    };
    // One jagged bolt between two points (midpoint displacement), as a list of points.
    const bolt = (x1, y1, x2, y2, rough, depth) => {
      let pts = [[x1, y1], [x2, y2]];
      for (let n = 0; n < depth; n++) {
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
          const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, off = (Math.random() - 0.5) * rough * len;
          next.push([(ax + bx) / 2 - dy / len * off, (ay + by) / 2 + dx / len * off], pts[i]);
        }
        pts = next;
      }
      return pts;
    };
    const stroke = (pts, width, alpha) => {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.globalAlpha = alpha;
      g.globalAlpha = alpha * 0.45; g.lineWidth = width * 3; g.strokeStyle = glow; g.shadowColor = glow; g.shadowBlur = 12; g.stroke();
      g.globalAlpha = alpha; g.lineWidth = width; g.strokeStyle = '#ffffff'; g.shadowBlur = 5; g.stroke();
    };
    let raf = 0, last = 0, hitAt = performance.now(), sweepAt = hitAt + 300;
    const round = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      g.lineCap = 'round'; g.lineJoin = 'miter';
      const age = now - hitAt, burst = age < 320;
      // 1) the aura: a glowing frame that breathes
      const pulse = 0.55 + 0.45 * Math.sin(now / 140);
      g.globalAlpha = (burst ? 1 : 0.55 + 0.35 * pulse);
      g.shadowColor = glow; g.shadowBlur = (14 + 10 * pulse) * k;
      g.strokeStyle = glow; g.lineWidth = 2 * k;
      round(PAD - 1, PAD - 1, w + 2, h + 2, rad + 1); g.stroke();
      g.shadowBlur = 0; g.globalAlpha = 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = 1;
      round(PAD, PAD, w, h, rad); g.stroke();
      // 2) a shine that sweeps across the face now and then
      const sw = (now - sweepAt) / 520;
      if (sw > 1.6) sweepAt = now + 900 + Math.random() * 900;
      if (sw >= 0 && sw <= 1) {
        g.save(); round(PAD, PAD, w, h, rad); g.clip();
        const x = PAD - w * 0.6 + sw * w * 2.2;
        const gr = g.createLinearGradient(x - 40, PAD, x + 40, PAD + h);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(PAD, PAD, w, h); g.restore();
      }
      // 3) the bolts: long zig-zag lightning right across the button, edge to edge, and some reaching well out past
      //    it. Thin, see-through cores, so the button still shows through them.
      if (Math.random() < 0.8 || burst) {
        const n = Math.round((burst ? 4 : 1 + Math.random() * 2.2) * k);
        const big = Math.max(w, h);
        for (let q = 0; q < n; q++) {
          let x1, y1, x2, y2;
          if (Math.random() < 0.65) {
            // across: from one side of the button to the far side
            const s0 = Math.random(), p1 = edge(s0), p2 = edge(s0 + 0.35 + Math.random() * 0.3);
            x1 = p1[0] - p1[2] * 8; y1 = p1[1] - p1[3] * 8;
            x2 = p2[0] + p2[2] * (6 + Math.random() * 14) * k; y2 = p2[1] + p2[3] * (6 + Math.random() * 14) * k;
          } else {
            // out: from the edge, as long as the button itself
            const p1 = edge(Math.random()), ang = Math.atan2(p1[3], p1[2]) + (Math.random() - 0.5) * 1.1, len = big * (0.55 + Math.random() * 0.5) * k;
            x1 = p1[0]; y1 = p1[1]; x2 = p1[0] + Math.cos(ang) * len; y2 = p1[1] + Math.sin(ang) * len;
          }
          const zig = bolt(x1, y1, x2, y2, 0.75, 6);
          stroke(zig, (0.8 + Math.random() * 0.6) * k, burst ? 0.85 : 0.55 + Math.random() * 0.25);
          // forks off the main bolt
          for (let f = 0; f < 2; f++) if (Math.random() < 0.55) {
            const m = zig[Math.floor(zig.length * (0.25 + Math.random() * 0.5))];
            const dir = Math.atan2(y2 - y1, x2 - x1) + (Math.random() < 0.5 ? 0.7 : -0.7) + (Math.random() - 0.5) * 0.5;
            const fl = Math.hypot(x2 - x1, y2 - y1) * (0.25 + Math.random() * 0.3);
            stroke(bolt(m[0], m[1], m[0] + Math.cos(dir) * fl, m[1] + Math.sin(dir) * fl, 0.8, 4), 0.6 * k, 0.45);
          }
        }
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(size);
    ro.observe(b);
    b._crackle = { cv, stop: () => { cancelAnimationFrame(raf); ro.disconnect(); } };
  }
  function stop(b) {
    const c = b._crackle;
    if (!c) return;
    b._crackle = null;
    c.stop();
    c.cv.classList.add('off');
    setTimeout(() => c.cv.remove(), 200);
  }

  // ---- 3D tilt (the `rotate` property, so it adds to whatever scale or lift a button already has)
  function tilt(b, e) {
    const r = b.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    const ang = Math.min(7, Math.hypot(x, y) * 11);
    b.style.rotate = `${(-y).toFixed(3)} ${x.toFixed(3)} 0 ${ang.toFixed(1)}deg`;
    b.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
    b.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
    b.classList.add('tilting');
  }
  function untilt(b) { b.style.rotate = ''; b.classList.remove('tilting'); }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const b = target(e.target);
    if (!b || b.contains(e.relatedTarget) || document.body.classList.contains('hw-edit') || document.body.classList.contains('hi-edit')) return;
    if (wants(b, 'thunder')) start(b);
  });
  document.addEventListener('pointerout', (e) => {
    const b = target(e.target);
    if (!b || b.contains(e.relatedTarget)) return;
    stop(b);
    untilt(b);
  });
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || motionOff()) return;
    const b = target(e.target);
    if (b && wants(b, 'tilt') && !document.body.classList.contains('hw-edit')) tilt(b, e);
  }, { passive: true });

  // ---- Settings → EFFECTS → HOVER
  function rows(rerender) {
    const { R, heading } = A, c = C();
    return [
      heading('HOVER'),
      ...Object.entries(GROUPS).map(([g, [label]]) => R.buttons(label, [c.thunder[g] && 'THUNDER', c.tilt[g] && '3D'].filter(Boolean).join(' + ') || 'Nothing', [
        [c.thunder[g] ? 'THUNDER ✓' : 'THUNDER', () => { c.thunder[g] = !c.thunder[g]; A.changed(); rerender(); }],
        [c.tilt[g] ? '3D ✓' : '3D', () => { c.tilt[g] = !c.tilt[g]; A.changed(); rerender(); }],
      ])),
      R.choice('Thunder colour', '', A.prop(c, 'color'), [['ssj', 'Super Saiyan yellow'], ['blue', 'Electric blue'], ['white', 'White'], ['accent', 'My theme colour']]),
      R.slider('Thunder size', '', A.prop(c, 'strength'), 0.4, 2, 0.1, (v) => Math.round(v * 100) + '%'),
      el('<div class="row-note">One HOME icon, widget or app grid can have its own: right-click it on HOME.</div>'),
    ];
  }
  const el = (h) => A.el(h);

  SV.hoverFx = { rows, GROUPS };
})();

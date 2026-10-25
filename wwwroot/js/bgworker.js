// The animated backdrop, drawn in a worker on an OffscreenCanvas so it never competes with the interface for the
// main thread. Slow-moving layers are drawn into a cache at a lower rate and composited every frame; the canvas
// resolution adapts so a frame stays well inside the display's budget (180 Hz and up).
let ctx = null, mctx = null, sctx = null, actx = null, mainCv = null, slowCv = null, arcCv = null;
const LEVELS = { mesh: 1, terrain: 1, plexus: 1, shapes: 1, rings: 0, aurora: 0, comets: 1, stars: 0, rain: 0, waves: 1, dots: 1, bolts: 1, embers: 1, storm: 0, art: 0, arcs: 0, nebula: 0, planet: 0, city: 0, ocean: 0, sunset: 0, fog: 0, snow: 0, fireflies: 0, bokeh: 0, matrix: 0 };
const MAX_RATIO = { low: 0.5, medium: 0.72, high: 1, auto: 1 };
let opt = {
  levels: { ...LEVELS },
  mesh: { style: 'poly', density: 13, motion: 1, lines: 1, fill: 1, color: 'duo' },
  image: '', imageDim: 0.55, pictures: [], slide: 9, artOpacity: 0.18,
  intensity: 0.8, speed: 1, quality: 'auto', fps: 0, slowFps: 60,
  accent: [255, 31, 31], accent2: [255, 77, 61], bg: [7, 5, 5],
};
let W = 0, H = 0, cssW = 1280, cssH = 720, ratio = 1, t = 0, last = 0, raf = 0, active = false, throttled = false;
let slowAt = -1, arcAt = -1, slowDirty = true;
let mesh = null, meshKey = '', embers = [], bolts = [], nextBolt = 3;
let nodes = [], comets = [], nextComet = 2, pulses = [], stars = [], drops = [];
let picture = null, pictureUrl = '';
let storm = [], nextStorm = 1, flash = { x: 0.5, life: 0 };
let art = { url: '', img: null, prev: null, mix: 1, slideAt: 0, idx: 0 }, gameArt = '';
const mouse = { x: -1, y: -1 };
const images = new Map(); // url -> ImageBitmap | 'loading'
const LOGICAL = 0.85;      // the backdrop's own coordinate space, as a share of the window size

function image(url, onReady) {
  const have = images.get(url);
  if (have && have !== 'loading') return have;
  if (!have) { images.set(url, 'loading'); postMessage({ type: 'need', url }); }
  waiting.push([url, onReady]);
  return null;
}
let waiting = [];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const lv = (k) => Math.max(0, +opt.levels[k] || 0);

  // Wireframe solids for the "shapes" layer: [vertices, edges].
  const PHI = (1 + Math.sqrt(5)) / 2;
  const edgesOf = (v, len) => {
    const e = [];
    for (let i = 0; i < v.length; i++)
      for (let j = i + 1; j < v.length; j++)
        if (Math.abs(Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) - len) < 0.01) e.push([i, j]);
    return e;
  };
  const ICO = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
  const OCT = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const TET = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const SOLIDS = [
    { v: ICO, e: edgesOf(ICO, 2), x: 0.88, y: 0.2, r: 0.075, sp: [0.21, 0.33] },
    { v: OCT, e: edgesOf(OCT, Math.SQRT2), x: 0.08, y: 0.62, r: 0.06, sp: [-0.3, 0.19] },
    { v: CUBE, e: edgesOf(CUBE, 2), x: 0.6, y: 0.86, r: 0.04, sp: [0.26, -0.24] },
    { v: ICO, e: edgesOf(ICO, 2), x: 0.36, y: 0.12, r: 0.03, sp: [-0.4, -0.3] },
    { v: TET, e: edgesOf(TET, 2 * Math.SQRT2), x: 0.22, y: 0.3, r: 0.035, sp: [0.5, 0.27] },
    { v: CUBE, e: edgesOf(CUBE, 2), x: 0.94, y: 0.66, r: 0.05, sp: [-0.18, 0.31] },
    { v: OCT, e: edgesOf(OCT, Math.SQRT2), x: 0.5, y: 0.45, r: 0.03, sp: [0.34, -0.42] },
  ];
function resize() {
  W = Math.max(320, Math.round(cssW * LOGICAL));
  H = Math.max(180, Math.round(cssH * LOGICAL));
  applyRatio();
  buildMesh();
  embers = []; nodes = []; stars = []; drops = [];
  populate();
}

// The canvases' real pixel size: the logical size times the current ratio (lowered when frames run long).
function applyRatio() {
  const pw = Math.max(160, Math.round(W * ratio)), ph = Math.max(90, Math.round(H * ratio));
  for (const c of [mainCv, slowCv, arcCv]) if (c && (c.width !== pw || c.height !== ph)) { c.width = pw; c.height = ph; }
  slowDirty = true; arcAt = -1;
}

function setPicture(url) {
  if (url === pictureUrl) return;
  pictureUrl = url;
  picture = null;
  if (!url) return;
  picture = image(url, (b) => { if (pictureUrl === url) { picture = b; slowDirty = true; } });
}
  // Particle counts follow their layer's level.
  function populate() {
    const fit = (list, n, make) => { n = Math.round(n); while (list.length < n) list.push(make()); if (list.length > n) list.length = n; };
    fit(embers, Math.min(400, 46 * lv('embers')), () => newEmber(true));
    fit(nodes, Math.min(150, 54 * lv('plexus')), () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 22, vy: (Math.random() - 0.5) * 22 }));
    fit(stars, Math.min(600, 160 * lv('stars')), () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.6, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 2.4 }));
    fit(drops, Math.min(700, 130 * lv('rain')), () => newDrop(true));
    populateScenes();
  }

  // The mesh is a set of shared points and the cells (3, 4 or 6 corners) drawn between them.
  function buildMesh() {
    const style = opt.mesh.style, cols = Math.max(3, Math.round(opt.mesh.density));
    const cw = W / cols, rows = Math.max(2, Math.round(H / cw)), ch = H / rows;
    const pts = [], index = new Map(), cells = [];
    const point = (x, y) => {
      const key = Math.round(x * 4) + '|' + Math.round(y * 4);
      let i = index.get(key);
      if (i === undefined) {
        const edge = x <= 0.5 || y <= 0.5 || x >= W - 0.5 || y >= H - 0.5; // border points stay put so the mesh always covers the screen
        i = pts.length;
        index.set(key, i);
        pts.push({ bx: x, by: y, ph: Math.random() * 6.28, amp: edge ? 0 : 0.18 + Math.random() * 0.3, x, y });
      }
      return i;
    };
    const cell = (p) => cells.push({ p, seed: Math.random() });

    if (style === 'hex') {
      const r = W / (cols * 1.5), h = r * Math.sqrt(3);
      for (let c = -1; c * 1.5 * r < W + r; c++)
        for (let row = -1; row * h < H + h; row++) {
          const cx = c * 1.5 * r, cy = row * h + (c % 2 ? h / 2 : 0);
          cell(Array.from({ length: 6 }, (_, k) => point(cx + Math.cos(k * Math.PI / 3) * r, cy + Math.sin(k * Math.PI / 3) * r)));
        }
    } else if (style === 'diamond') {
      for (let y = 0; y <= rows * 2; y++)
        for (let x = 0; x <= cols; x++) {
          const cx = x * cw + (y % 2 ? cw / 2 : 0), cy = y * ch / 2;
          cell([point(cx, cy - ch / 2), point(cx + cw / 2, cy), point(cx, cy + ch / 2), point(cx - cw / 2, cy)]);
        }
    } else {
      const jitter = style === 'poly' ? 0.7 : 0, grid = [];
      for (let y = 0; y <= rows; y++)
        for (let x = 0; x <= cols; x++) {
          const edge = x === 0 || y === 0 || x === cols || y === rows;
          grid.push(point(x * cw + (edge ? 0 : (Math.random() - 0.5) * cw * jitter), y * ch + (edge ? 0 : (Math.random() - 0.5) * ch * jitter)));
        }
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * (cols + 1) + x, a = grid[i], b = grid[i + 1], c = grid[i + cols + 1], d = grid[i + cols + 2];
          if (style === 'grid') cell([a, b, d, c]);
          else if ((x + y) % 2) { cell([a, b, c]); cell([b, d, c]); }
          else { cell([a, b, d]); cell([a, d, c]); }
        }
    }
    mesh = { pts, cells, cell: Math.min(cw, ch) };
    meshKey = [opt.quality, style, cols].join('|');
  }

  function newEmber(anywhere) {
    return {
      x: Math.random() * W, y: anywhere ? Math.random() * H : H + 8,
      vy: 6 + Math.random() * 22, vx: (Math.random() - 0.5) * 10,
      r: 0.6 + Math.random() * 1.8, a: 0.15 + Math.random() * 0.5, ph: Math.random() * 6.28,
    };
  }

  function newDrop(anywhere) {
    return { x: Math.random() * W * 1.3, y: anywhere ? Math.random() * H : -20, len: 8 + Math.random() * 22, v: 520 + Math.random() * 520 };
  }

  function strike() {
    // A jagged polyline from the top edge, with one fork.
    const make = (x, y, len, spread) => {
      const p = [[x, y]];
      while (p.length < len) {
        x += (Math.random() - 0.5) * spread;
        y += H * (0.04 + Math.random() * 0.07);
        p.push([x, y]);
      }
      return p;
    };
    const x0 = W * (0.15 + Math.random() * 0.7);
    const main = make(x0, -4, 9 + Math.floor(Math.random() * 5), W * 0.09);
    const fork = main[3 + Math.floor(Math.random() * 3)];
    bolts.push({ paths: [main, make(fork[0], fork[1], 5, W * 0.11)], life: 1 });
  }

  function drawBase() {
    ctx.fillStyle = rgba(opt.bg, 1);
    ctx.fillRect(0, 0, W, H);
    if (picture) {
      // Slow pan and zoom over the picture, like a documentary shot (off when photo motion is 0).
      const m = opt.photoMotion ?? 1, z = 1 + 0.08 * m * (Math.sin(t * 0.025) + 1) / 2;
      const s = Math.max(W / picture.width, H / picture.height) * z, w = picture.width * s, h = picture.height * s;
      const ox = Math.sin(t * 0.018) * (w - W) / 2, oy = Math.cos(t * 0.014) * (h - H) / 2;
      ctx.globalAlpha = Math.max(0, 1 - opt.imageDim);
      ctx.drawImage(picture, (W - w) / 2 + ox, (H - h) / 2 + oy, w, h);
      ctx.globalAlpha = 1;
    }
    drawGlows();
  }

  function drawGlows() {
    const i = opt.intensity;
    const g1 = ctx.createRadialGradient(W * (0.78 + Math.sin(t * 0.11) * 0.06), H * 0.3, 0, W * 0.78, H * 0.3, W * 0.6);
    g1.addColorStop(0, rgba(opt.accent, 0.26 * i));
    g1.addColorStop(1, rgba(opt.accent, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * 0.05, H * (0.95 + Math.cos(t * 0.09) * 0.05), 0, W * 0.05, H, W * 0.5);
    g2.addColorStop(0, rgba(opt.accent2, 0.2 * i));
    g2.addColorStop(1, rgba(opt.accent2, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }

  function meshColor(seed, x, a) {
    switch (opt.mesh.color) {
      case 'accent': return rgba(opt.accent, a);
      case 'accent2': return rgba(opt.accent2, a);
      case 'white': return rgba([255, 255, 255], a);
      case 'spectrum': return `hsla(${((x / W) * 280 + t * 24 + seed * 40) % 360},95%,60%,${a})`;
      default: return rgba(seed > 0.5 ? opt.accent : opt.accent2, a);
    }
  }

  function drawMesh() {
    const { pts, cells, cell } = mesh, m = opt.mesh, L = lv('mesh'), i = opt.intensity;
    const amp = cell * m.motion;
    for (const p of pts) {
      p.x = p.bx + Math.cos(t * 0.35 + p.ph) * amp * p.amp;
      p.y = p.by + Math.sin(t * 0.28 + p.ph * 1.7) * amp * p.amp;
    }
    const trace = (c) => {
      ctx.moveTo(pts[c.p[0]].x, pts[c.p[0]].y);
      for (let k = 1; k < c.p.length; k++) ctx.lineTo(pts[c.p[k]].x, pts[c.p[k]].y);
      ctx.closePath();
    };
    const fillK = 0.2 * i * L * m.fill, lineK = 0.085 * i * L * m.lines;
    if (fillK > 0.002)
      for (const c of cells) {
        let cx = 0, cy = 0;
        for (const k of c.p) { cx += pts[k].x; cy += pts[k].y; }
        cx /= c.p.length; cy /= c.p.length;
        const wave = 0.5 + 0.5 * Math.sin(t * 0.5 + cx * 0.006 - cy * 0.004 + c.seed * 6.28);
        const alpha = Math.min(0.85, wave * wave * wave * fillK * (0.35 + 0.65 * (cx / W)));
        if (alpha < 0.008) continue;
        ctx.fillStyle = meshColor(c.seed, cx, alpha);
        ctx.beginPath();
        trace(c);
        ctx.fill();
      }
    if (lineK > 0.002) {
      ctx.strokeStyle = meshColor(0.8, W * 0.3, Math.min(0.9, lineK));
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const c of cells) trace(c);
      ctx.stroke();
      ctx.fillStyle = meshColor(0.2, W * 0.7, Math.min(1, 0.3 * i * L * m.lines));
      for (let k = 0; k < pts.length; k += 3) ctx.fillRect(pts[k].x - 1, pts[k].y - 1, 2, 2);
    }
  }

  // Synthwave floor: a perspective wire grid rolling toward the viewer, rippling as it comes.
  function drawTerrain() {
    const L = lv('terrain'), i = opt.intensity * Math.min(L, 2), horizon = H * 0.62, rows = 13, cols = 22, scroll = (t * 0.35) % 1, lift = 0.4 + 0.6 * L;
    const at = (r, c) => {
      const d = (r + scroll) / rows, depth = d * d;
      const y = horizon + (H - horizon) * depth * 1.05;
      const x = W / 2 + (c - cols / 2) * (W / cols) * (0.55 + depth * 2.6);
      return [x, y - (Math.sin(c * 0.7 + t * 0.9 + r * 0.5) * H * 0.03 + Math.cos(c * 0.31 - t * 0.6) * H * 0.02) * depth * lift];
    };
    ctx.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
      const fade = ((r + scroll) / rows);
      ctx.strokeStyle = rgba(r % 3 ? opt.accent : opt.accent2, 0.3 * i * fade);
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) { const [x, y] = at(r, c); c ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(opt.accent, 0.14 * i);
    ctx.beginPath();
    for (let c = 0; c <= cols; c++)
      for (let r = 0; r < rows; r++) { const [x, y] = at(r, c); r ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }

  // Constellation mesh: drifting points joined when close, pulled gently toward the pointer.
  function drawPlexus(dt) {
    const i = opt.intensity, reach = W * 0.12, mx = mouse.x * W, my = mouse.y * H;
    for (const n of nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      if (mouse.x >= 0) {
        const dx = mx - n.x, dy = my - n.y, d = Math.hypot(dx, dy);
        if (d < reach * 2 && d > 1) { n.x += (dx / d) * 14 * dt; n.y += (dy / d) * 14 * dt; }
      }
    }
    ctx.lineWidth = 1;
    for (let a = 0; a < nodes.length; a++) {
      const A = nodes[a];
      for (let b = a + 1; b < nodes.length; b++) {
        const B = nodes[b], d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d > reach) continue;
        ctx.strokeStyle = rgba(opt.accent2, (1 - d / reach) * 0.34 * i);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      if (mouse.x >= 0) {
        const d = Math.hypot(A.x - mx, A.y - my);
        if (d < reach * 1.6) {
          ctx.strokeStyle = rgba(opt.accent, (1 - d / (reach * 1.6)) * 0.5 * i);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(mx, my); ctx.stroke();
        }
      }
      ctx.fillStyle = rgba(opt.accent, 0.6 * i);
      ctx.fillRect(A.x - 1.2, A.y - 1.2, 2.4, 2.4);
    }
  }

  function drawShapes() {
    const L = lv('shapes'), i = opt.intensity * Math.min(L, 1.6), count = Math.min(SOLIDS.length, Math.ceil(4 * L));
    for (let k = 0; k < count; k++) {
      const s = SOLIDS[k];
      const ax = t * s.sp[0], ay = t * s.sp[1], r = Math.min(W, H) * s.r * (2.2 + 0.25 * Math.sin(t * 0.7 + k)) * (0.7 + 0.3 * Math.min(L, 2));
      const cx = W * (s.x + Math.sin(t * 0.12 + k) * 0.02), cy = H * (s.y + Math.cos(t * 0.1 + k * 2) * 0.03);
      const sx = Math.sin(ax), cxr = Math.cos(ax), sy = Math.sin(ay), cyr = Math.cos(ay);
      const pts = s.v.map(([x, y, z]) => {
        const y1 = y * cxr - z * sx, z1 = y * sx + z * cxr, x2 = x * cyr + z1 * sy, z2 = -x * sy + z1 * cyr;
        const p = 3.4 / (3.4 + z2);
        return [cx + x2 * r * p * 0.5, cy + y1 * r * p * 0.5, z2];
      });
      for (const [a, b] of s.e) {
        const depth = (pts[a][2] + pts[b][2]) / 2;
        ctx.strokeStyle = rgba(k % 2 ? opt.accent2 : opt.accent, Math.max(0, 0.34 - depth * 0.09) * i);
        ctx.lineWidth = Math.max(0.5, 1.3 - depth * 0.3);
        ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); ctx.stroke();
      }
      ctx.fillStyle = rgba(opt.accent2, 0.7 * i);
      for (const p of pts) ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }
  }

  // HUD rings: broken arcs turning at different speeds, like a targeting display.
  function drawRings() {
    const L = lv('rings'), i = opt.intensity * Math.min(L, 2), cx = W * 0.76, cy = H * 0.44, base = Math.min(W, H) * 0.16;
    const count = Math.min(7, 2 + Math.round(2 * L));
    for (let k = 0; k < count; k++) {
      const r = base * (0.55 + k * 0.42), spin = t * (0.25 + k * 0.11) * (k % 2 ? -1 : 1), segs = 3 + k;
      ctx.strokeStyle = rgba(k % 2 ? opt.accent2 : opt.accent, (0.34 - k * 0.03) * i);
      ctx.lineWidth = k % 3 === 0 ? 2.2 : 1;
      for (let s = 0; s < segs; s++) {
        const a0 = spin + (s / segs) * 6.283, a1 = a0 + (6.283 / segs) * (0.55 + 0.25 * Math.sin(t * 0.6 + k + s));
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      }
    }
    ctx.strokeStyle = rgba(opt.accent, 0.2 * i);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - base * 0.3, cy); ctx.lineTo(cx + base * 0.3, cy);
    ctx.moveTo(cx, cy - base * 0.3); ctx.lineTo(cx, cy + base * 0.3);
    ctx.stroke();
  }

  function drawAurora() {
    const i = opt.intensity * lv('aurora'), step = Math.max(10, W / 90);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const grad = ctx.createLinearGradient(0, 0, 0, H * 0.75);
      grad.addColorStop(0, rgba(k % 2 ? opt.accent2 : opt.accent, 0));
      grad.addColorStop(0.45, rgba(k % 2 ? opt.accent2 : opt.accent, Math.min(0.6, 0.13 * i)));
      grad.addColorStop(1, rgba(opt.accent, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= W + step; x += step)
        ctx.lineTo(x, H * (0.34 + k * 0.12) + Math.sin(x * 0.004 * (1920 / W) + t * (0.2 + k * 0.09) + k * 1.9) * H * 0.13 + Math.sin(x * 0.011 - t * 0.33) * H * 0.04);
      ctx.lineTo(W, 0);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStars() {
    const i = opt.intensity;
    for (const s of stars) {
      const tw = 0.25 + 0.75 * Math.abs(Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = rgba(s.sp > 2 ? opt.accent2 : [255, 255, 255], tw * 0.8 * i);
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }

  function drawRain(dt) {
    const i = opt.intensity, k = W / 1400;
    ctx.strokeStyle = rgba(opt.accent2, Math.min(0.8, 0.3 * i));
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let n = 0; n < drops.length; n++) {
      const d = drops[n];
      d.y += d.v * dt * k; d.x -= d.v * 0.28 * dt * k;
      if (d.y > H + 30) drops[n] = newDrop(false);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.28 * k, d.y - d.len * k);
    }
    ctx.stroke();
  }

  function drawComets(dt) {
    nextComet -= dt * lv('comets');
    if (nextComet <= 0) {
      comets.push({ x: Math.random() * W * 1.2, y: -10, vx: -(240 + Math.random() * 260), vy: 150 + Math.random() * 170, life: 1 });
      nextComet = 0.7 + Math.random() * 2.6;
    }
    ctx.lineCap = 'round';
    for (const c of comets) {
      c.x += c.vx * dt * (W / 1400); c.y += c.vy * dt * (W / 1400); c.life -= dt * 0.55;
      const tail = 0.16;
      const grad = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * tail, c.y - c.vy * tail);
      grad.addColorStop(0, rgba([255, 255, 255], 0.9 * c.life * opt.intensity));
      grad.addColorStop(0.3, rgba(opt.accent2, 0.6 * c.life * opt.intensity));
      grad.addColorStop(1, rgba(opt.accent, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2 * (W / 1400);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - c.vx * tail, c.y - c.vy * tail); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    comets = comets.filter((c) => c.life > 0 && c.y < H + 40 && c.x > -80);
  }

  function drawWaves() {
    const L = lv('waves'), i = opt.intensity * Math.min(L, 2), step = Math.max(12, W / 80), tall = 0.5 + 0.5 * L;
    for (let k = 0; k < 3; k++) {
      const yAt = (x, off) =>
        H * (0.6 + k * 0.1 + off) +
        Math.sin(x * 0.0026 * (1920 / W) + t * (0.26 + k * 0.07) + k * 2.1) * H * 0.075 * tall +
        Math.sin(x * 0.0068 * (1920 / W) - t * 0.4 + k) * H * 0.02 * tall;
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, rgba(opt.accent2, 0.0));
      grad.addColorStop(0.45, rgba(opt.accent, 0.11 * i));
      grad.addColorStop(1, rgba(opt.accent2, 0.03 * i));
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let x = 0; x <= W + step; x += step) ctx.lineTo(x, yAt(x, 0));
      for (let x = W + step; x >= 0; x -= step) ctx.lineTo(x, yAt(x + 90, 0.05 + 0.03 * Math.sin(t * 0.3 + k)));
      ctx.fill();
      ctx.strokeStyle = rgba(opt.accent2, 0.3 * i);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= W + step; x += step) ctx.lineTo(x, yAt(x, 0));
      ctx.stroke();
    }
  }

  function drawDots() {
    const L = lv('dots'), s = Math.max(9, W / 74), i = opt.intensity * Math.min(L, 2), big = 0.7 + 0.3 * Math.min(L, 3);
    const cx = W * (0.8 + Math.sin(t * 0.17) * 0.1), cy = H * (0.36 + Math.cos(t * 0.13) * 0.14), reach = W * 0.46 * big;
    const dim = new Path2D(), hot = new Path2D();
    for (let y = s / 2; y < H; y += s)
      for (let x = W * (L > 1.5 ? 0.1 : 0.42); x < W; x += s) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > reach) continue;
        const fall = 1 - dist / reach;
        const v = (Math.sin(x * 0.03 + t * 0.9) + Math.cos(y * 0.035 - t * 0.7)) * 0.5 + 0.35;
        const r = Math.max(0, v) * fall * s * 0.3;
        if (r < 0.35) continue;
        const path = v * fall > 0.62 ? hot : dim;
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, 6.283);
      }
    ctx.fillStyle = rgba(opt.accent, 0.3 * i);
    ctx.fill(dim);
    ctx.fillStyle = rgba(opt.accent2, 0.7 * i);
    ctx.fill(hot);
  }

  function drawEmbers(dt) {
    for (let k = 0; k < embers.length; k++) {
      const e = embers[k];
      e.y -= e.vy * dt * (H / 600);
      e.x += (e.vx + Math.sin(t * 1.3 + e.ph) * 8) * dt;
      if (e.y < -10) embers[k] = newEmber(false);
      ctx.fillStyle = rgba(opt.accent2, e.a * opt.intensity * (0.6 + 0.4 * Math.sin(t * 3 + e.ph)));
      ctx.fillRect(e.x, e.y, e.r, e.r * 2.2);
    }
  }

  // The lightning level sets how often bolts strike; at storm levels they also come in pairs.
  function drawBolts(dt) {
    const L = lv('bolts');
    if (L > 0) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        strike();
        if (L >= 2 && Math.random() < 0.5) strike();
        nextBolt = (4 + Math.random() * 7) / (Math.max(0.3, opt.intensity) * L);
      }
    }
    for (const b of bolts) {
      b.life -= dt * 2.6;
      if (b.life <= 0) continue;
      const flick = b.life * (0.6 + 0.4 * Math.random());
      ctx.fillStyle = rgba(opt.accent, 0.07 * flick);
      ctx.fillRect(0, 0, W, H);
      ctx.lineJoin = 'miter';
      for (const [width, color, alpha] of [[9, opt.accent, 0.14], [4, opt.accent, 0.45], [1.4, [255, 236, 230], 0.95]]) {
        ctx.strokeStyle = rgba(color, alpha * flick);
        ctx.lineWidth = width * (W / 1400);
        for (const path of b.paths) {
          ctx.beginPath();
          path.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
      }
    }
    bolts = bolts.filter((b) => b.life > 0);
  }

  // Shockwave rings, fired from the page (selection changes, clicks).
  function drawPulses(dt) {
    for (const p of pulses) {
      p.life -= dt * 1.5;
      const r = (1 - p.life) * W * 0.34 * p.size;
      ctx.strokeStyle = rgba(opt.accent, Math.max(0, p.life) * 0.5 * opt.intensity);
      ctx.lineWidth = 2 + Math.max(0, p.life) * 4;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, Math.max(0, r), 0, 6.283); ctx.stroke();
      ctx.strokeStyle = rgba(opt.accent2, Math.max(0, p.life) * 0.3 * opt.intensity);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, Math.max(0, r * 0.72), 0, 6.283); ctx.stroke();
    }
    pulses = pulses.filter((p) => p.life > 0);
  }

  // Midpoint-displacement bolt from the top edge with a handful of forks, as on skyvaint.com.
  function boltPath(x1, y1, x2, y2, rough, depth) {
    let pts = [[x1, y1], [x2, y2]], spread = Math.hypot(x2 - x1, y2 - y1) * rough;
    for (let d = 0; d < depth; d++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], nx = -(by - ay), ny = bx - ax, len = Math.hypot(nx, ny) || 1, off = (Math.random() - 0.5) * spread;
        next.push([(ax + bx) / 2 + (nx / len) * off, (ay + by) / 2 + (ny / len) * off], pts[i + 1]);
      }
      pts = next;
      spread /= 2;
    }
    return pts;
  }

  function stormStrike() {
    const x = W * (Math.random() < 0.5 ? 0.05 + Math.random() * 0.3 : 0.65 + Math.random() * 0.3);
    const ex = x + (Math.random() - 0.5) * W * 0.25, ey = H * (0.45 + Math.random() * 0.45);
    const main = boltPath(x, -10, ex, ey, 0.32, 7), forks = [];
    for (let f = 0, n = 4 + Math.floor(Math.random() * 4); f < n; f++) {
      const s = main[Math.floor(main.length * (0.25 + Math.random() * 0.5))], ang = Math.atan2(ey, ex - x) + (Math.random() - 0.5) * 1.6, reach = H * (0.08 + Math.random() * 0.16);
      forks.push(boltPath(s[0], s[1], s[0] + Math.cos(ang) * reach, s[1] + Math.sin(ang) * reach, 0.4, 5));
    }
    storm.push({ main, forks, age: 0, life: 0.48 + Math.random() * 0.26 });
    if (storm.length > 10) storm.shift();
    flash = { x: x / W, life: 1 };
  }

  function drawStorm(dt) {
    const L = lv('storm');
    if (L > 0) {
      nextStorm -= dt;
      if (nextStorm <= 0) {
        const burst = 1 + Math.floor(Math.random() * Math.min(4, 1 + L * 1.5));
        for (let k = 0; k < burst; k++) setTimeout(() => { if (raf) stormStrike(); }, k * (70 + Math.random() * 160));
        nextStorm = (0.3 + Math.random() * 0.7) / Math.max(0.2, L) * 1.6;
      }
    }
    if (flash.life > 0) {
      flash.life -= dt / 0.45;
      const g = ctx.createRadialGradient(W * flash.x, 0, 0, W * flash.x, 0, Math.max(W, H) * 0.8);
      g.addColorStop(0, rgba(opt.accent, 0.28 * Math.max(0, flash.life) * opt.intensity));
      g.addColorStop(1, rgba(opt.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const k = W / 1600;
    const stroke = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke(); };
    for (const b of storm) {
      b.age += dt;
      const t = b.age / b.life;
      const flick = t < 0.12 ? 1 : t < 0.2 ? 0.25 : t < 0.32 ? 0.95 : Math.max(0, 1 - (t - 0.32) / 0.68);
      ctx.globalAlpha = flick * 0.22; ctx.strokeStyle = rgba(opt.accent, 1); ctx.lineWidth = 14 * k; stroke(b.main);
      ctx.globalAlpha = flick * 0.55; ctx.lineWidth = 5 * k; stroke(b.main); ctx.lineWidth = 2.5 * k; b.forks.forEach(stroke);
      ctx.globalAlpha = flick; ctx.strokeStyle = 'rgb(255,226,220)'; ctx.lineWidth = 1.6 * k; stroke(b.main); ctx.lineWidth = 0.9 * k; b.forks.forEach(stroke);
    }
    ctx.globalAlpha = 1;
    storm = storm.filter((b) => b.age < b.life);
  }

function loadArt(url) {
  if (!url || url === art.url) return;
  art.url = url;
  const got = (b) => { if (art.url !== url) return; art.prev = art.img; art.img = b; art.mix = 0; };
  const b = image(url, got);
  if (b) got(b);
}
  // Artwork faintly behind everything (the selected game's banner, or your own pictures as a slideshow),
  // fading out toward both sides like the character art on skyvaint.com.
  function drawArt(dt) {
    const pics = opt.pictures || [];
    if (pics.length) {
      art.slideAt -= dt;
      if (art.slideAt <= 0 || !pics.includes(art.url)) { art.idx = (art.idx + 1) % pics.length; loadArt(pics[art.idx]); art.slideAt = opt.slide || 9; }
    } else loadArt(gameArt);
    art.mix = Math.min(1, art.mix + dt / 1.2);
    const alpha = (opt.artOpacity || 0.18) * Math.min(lv('art'), 3), bob = Math.sin(t * 1.1) * H * 0.008;
    const draw = (img, a) => {
      if (!img || a <= 0) return;
      const s = Math.max(W / img.width, H / img.height) * 1.04, w = img.width * s, h = img.height * s;
      ctx.globalAlpha = a;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2 + bob, w, h);
    };
    draw(art.prev, alpha * (1 - art.mix));
    draw(art.img, alpha * art.mix);
    ctx.globalAlpha = 1;
    const fade = ctx.createLinearGradient(0, 0, W, 0);
    fade.addColorStop(0, rgba(opt.bg, 1)); fade.addColorStop(0.3, rgba(opt.bg, 0)); fade.addColorStop(0.7, rgba(opt.bg, 0)); fade.addColorStop(1, rgba(opt.bg, 1));
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
  }

  // Sweeping arcs of halftone dots: big at the band's middle, shrinking to nothing at its edges.
  function drawArcs() {
    const L = lv('arcs'), i = opt.intensity * Math.min(L, 2), s = Math.max(6, W / 160);
    ctx.fillStyle = rgba(opt.accent, 0.42 * i);
    const arcs = [[1.25, -0.35, 1.05, 0.11], [1.1, -0.2, 0.78, 0.07], [-0.3, 1.4, 0.95, 0.09]];
    arcs.forEach(([cxr, cyr, rr, band], k) => {
      const cx = W * cxr, cy = H * cyr, r = Math.max(W, H) * rr, width = Math.max(W, H) * band;
      const rows = Math.max(3, Math.round(width / s)), spin = t * 0.02 * (k % 2 ? -1 : 1);
      ctx.beginPath();
      for (let row = 0; row < rows; row++) {
        const off = (row / (rows - 1) - 0.5) * 2, rad = r + off * width / 2, dotR = s * 0.42 * Math.max(0, 1 - Math.abs(off) ** 1.6);
        if (dotR < 0.4) continue;
        const step = s / rad;
        for (let a = 0; a < 6.283; a += step) {
          const x = cx + Math.cos(a + spin) * rad, y = cy + Math.sin(a + spin) * rad;
          if (x < -s || x > W + s || y < -s || y > H + s) continue;
          ctx.moveTo(x + dotR, y);
          ctx.arc(x, y, dotR, 0, 6.283);
        }
      }
      ctx.fill();
    });
  }
// ---------------------------------------------------------------- frame loop


// ---------------------------------------------------------------- 2.5: scene layers
// Closer-to-real scenes: deep-space nebula and a planet, a night city with lit windows, a moonlit ocean, a sunset
// sky, rolling fog, falling snow, fireflies, out-of-focus bokeh lights and falling code. Slow ones redraw with the
// other slow layers; snow, fireflies, bokeh and code move every frame.
let snow = [], flies = [], bokehs = [], codeCols = [], cityKey = '', city = null;
const rnd = (seed) => { let a = seed >>> 0; return () => ((a = (a + 0x6d2b79f5) | 0), (((a ^ (a >>> 15)) * (1 | a)) >>> 0) / 4294967296); };
const mix = (c1, c2, k) => c1.map((v, i) => Math.round(v * (1 - k) + c2[i] * k));

function populateScenes() {
  const fit = (list, n, make) => { n = Math.round(n); while (list.length < n) list.push(make(true)); if (list.length > n) list.length = n; };
  fit(snow, Math.min(600, 170 * lv('snow')), newFlake);
  fit(flies, Math.min(140, 34 * lv('fireflies')), () => ({ x: Math.random() * W, y: H * (0.35 + Math.random() * 0.65), a: Math.random() * 6.28, sp: 8 + Math.random() * 20, ph: Math.random() * 6.28, r: 1 + Math.random() * 1.8 }));
  fit(bokehs, Math.min(70, 20 * lv('bokeh')), () => ({ x: Math.random() * W, y: Math.random() * H, r: 18 + Math.random() * 70, vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 6, a: 0.05 + Math.random() * 0.12, c: Math.random() }));
  const cols = Math.round((W / 18) * Math.min(1, lv('matrix')));
  while (codeCols.length < cols) codeCols.push({ x: Math.random() * W, y: Math.random() * H, v: 60 + Math.random() * 160, len: 8 + Math.floor(Math.random() * 18) });
  if (codeCols.length > cols) codeCols.length = cols;
}
function newFlake(anywhere) { return { x: Math.random() * W, y: anywhere ? Math.random() * H : -6, r: 0.6 + Math.random() * 2.4, v: 18 + Math.random() * 40, ph: Math.random() * 6.28 }; }

function drawNebula() {
  const i = opt.intensity * lv('nebula');
  ctx.globalCompositeOperation = 'lighter';
  const blobs = [[0.22, 0.35, 0.55, opt.accent], [0.7, 0.25, 0.5, opt.accent2], [0.55, 0.72, 0.6, mix(opt.accent, [80, 60, 255], 0.5)], [0.85, 0.65, 0.35, [255, 255, 255]]];
  blobs.forEach(([x, y, r, c], k) => {
    const cx = W * (x + Math.sin(t * 0.02 + k) * 0.03), cy = H * (y + Math.cos(t * 0.017 + k * 2) * 0.03), rr = W * r;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, rgba(c, (k === 3 ? 0.05 : 0.16) * i));
    g.addColorStop(0.45, rgba(c, (k === 3 ? 0.02 : 0.07) * i));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  ctx.globalCompositeOperation = 'source-over';
}

function drawPlanet() {
  const i = Math.min(1.5, opt.intensity * lv('planet')), r = Math.min(W, H) * 0.42;
  const cx = W * 0.78, cy = H * 1.02 + Math.sin(t * 0.05) * H * 0.01;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.35);
  glow.addColorStop(0, rgba(opt.accent2, 0.35 * i));
  glow.addColorStop(1, rgba(opt.accent2, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r);
  body.addColorStop(0, rgba(mix(opt.accent, [255, 255, 255], 0.35), 0.95));
  body.addColorStop(0.55, rgba(mix(opt.accent, opt.bg, 0.55), 1));
  body.addColorStop(1, rgba(opt.bg, 1));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.clip();
  ctx.globalAlpha = 0.12 * i;
  for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? rgba(opt.accent2, 1) : rgba([0, 0, 0], 1); ctx.fillRect(cx - r, cy - r * 0.9 + k * r * 0.22 + Math.sin(t * 0.04 + k) * 4, r * 2, r * 0.07); }
  ctx.restore(); ctx.globalAlpha = 1;
  ctx.strokeStyle = rgba(mix(opt.accent2, [255, 255, 255], 0.5), 0.5 * i);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
}

function buildCity() {
  const r = rnd(7), out = [];
  for (const layer of [0, 1, 2]) {
    let x = -20;
    const base = [0.42, 0.55, 0.68][layer];
    while (x < W + 20) {
      const w = (18 + r() * 46) * (1 + layer * 0.3), h = H * (0.12 + r() * (0.4 - layer * 0.08));
      const wins = [];
      if (layer === 2) for (let wy = 6; wy < h - 6; wy += 9) for (let wx = 4; wx < w - 4; wx += 7) if (r() < 0.36) wins.push([wx, wy, r()]);
      out.push({ layer, x, w, h, top: H * base + (1 - base) * 0 , wins, ant: r() < 0.15 });
      x += w + r() * 4;
    }
  }
  city = out;
  cityKey = W + 'x' + H;
}
function drawCity() {
  if (!city || cityKey !== W + 'x' + H) buildCity();
  const i = opt.intensity * lv('city');
  const sky = ctx.createLinearGradient(0, H * 0.3, 0, H);
  sky.addColorStop(0, rgba(opt.accent, 0));
  sky.addColorStop(1, rgba(opt.accent, 0.22 * i));
  ctx.fillStyle = sky;
  ctx.fillRect(0, H * 0.3, W, H * 0.7);
  for (const b of city) {
    const y = H - b.h - (2 - b.layer) * H * 0.02;
    ctx.fillStyle = rgba(mix(opt.bg, [0, 0, 0], 0.4 - b.layer * 0.15), 1);
    if (b.layer < 2) ctx.fillStyle = rgba(mix(opt.bg, opt.accent, 0.12 - b.layer * 0.05), 1);
    ctx.fillRect(b.x, y, b.w, b.h + 40);
    if (b.ant) { ctx.fillStyle = rgba(opt.accent, (Math.sin(t * 3 + b.x) > 0 ? 0.9 : 0.25) * i); ctx.fillRect(b.x + b.w / 2 - 1, y - 14, 2, 3); }
    for (const [wx, wy, s] of b.wins) {
      const on = Math.sin(t * 0.07 * (0.3 + s) + s * 40) > -0.6;
      if (!on) continue;
      ctx.fillStyle = rgba(s < 0.15 ? opt.accent2 : [255, 214, 150], (0.35 + s * 0.5) * i);
      ctx.fillRect(b.x + wx, y + wy, 3, 4);
    }
  }
}

function drawOcean() {
  const i = opt.intensity * lv('ocean'), hz = H * 0.6, mx = W * 0.66, my = H * 0.24, mr = Math.min(W, H) * 0.06;
  const halo = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 6);
  halo.addColorStop(0, rgba([255, 255, 255], 0.16 * i)); halo.addColorStop(1, rgba([255, 255, 255], 0));
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, hz);
  ctx.fillStyle = rgba([250, 248, 240], 0.9 * Math.min(1, i));
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill();
  const sea = ctx.createLinearGradient(0, hz, 0, H);
  sea.addColorStop(0, rgba(mix(opt.bg, [20, 40, 70], 0.6), 1)); sea.addColorStop(1, rgba(mix(opt.bg, [0, 0, 0], 0.5), 1));
  ctx.fillStyle = sea; ctx.fillRect(0, hz, W, H - hz);
  for (let k = 0; k < 70; k++) {
    const y = hz + Math.pow(k / 70, 1.6) * (H - hz), spread = 8 + (y - hz) * 0.5, w = spread * (0.6 + 0.4 * Math.sin(t * 0.8 + k * 1.7));
    ctx.fillStyle = rgba([255, 255, 255], (0.08 + 0.3 * (1 - k / 70)) * i * (0.5 + 0.5 * Math.sin(t * 1.3 + k)));
    ctx.fillRect(mx - w / 2 + Math.sin(t * 0.6 + k) * spread * 0.2, y, w, 1.2 + k * 0.03);
  }
  ctx.strokeStyle = rgba(opt.accent2, 0.08 * i);
  for (let k = 0; k < 9; k++) {
    const y = hz + (H - hz) * (k / 9) ** 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.01 + t * 0.7 + k) * (2 + k));
    ctx.stroke();
  }
}

function drawSunset() {
  const i = Math.min(1.5, opt.intensity * lv('sunset')), hz = H * 0.68;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, rgba(mix(opt.bg, [40, 20, 70], 0.6), 0.9 * i));
  sky.addColorStop(0.6, rgba(mix(opt.accent, [255, 120, 60], 0.5), 0.45 * i));
  sky.addColorStop(1, rgba([255, 190, 110], 0.55 * i));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
  const sx = W * 0.5, sr = Math.min(W, H) * 0.11;
  const sun = ctx.createRadialGradient(sx, hz, 0, sx, hz, sr * 4);
  sun.addColorStop(0, rgba([255, 230, 170], 0.9 * Math.min(1, i))); sun.addColorStop(0.25, rgba([255, 160, 90], 0.4 * i)); sun.addColorStop(1, rgba([255, 120, 60], 0));
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba([255, 220, 160], 0.9 * Math.min(1, i));
  ctx.beginPath(); ctx.arc(sx, hz, sr, Math.PI, 0); ctx.fill();
  for (let k = 0; k < 6; k++) {
    const y = H * (0.12 + k * 0.08), x = ((t * (4 + k) * 3 + k * 300) % (W + 600)) - 300;
    ctx.fillStyle = rgba(mix([255, 150, 120], opt.bg, k / 8), 0.25 * i);
    ctx.beginPath(); ctx.ellipse(x, y, 160 + k * 30, 9 + k * 2, 0, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = rgba(mix(opt.bg, [0, 0, 0], 0.5), 1);
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) ctx.lineTo(x, hz + Math.sin(x * 0.006) * 14 + Math.sin(x * 0.019) * 6);
  ctx.lineTo(W, H); ctx.fill();
}

function drawFog() {
  const i = opt.intensity * lv('fog');
  for (let k = 0; k < 4; k++) {
    const y = H * (0.45 + k * 0.15), x = ((t * (6 + k * 4)) % (W * 2)) - W;
    const g = ctx.createLinearGradient(0, y - H * 0.18, 0, y + H * 0.18);
    g.addColorStop(0, rgba([210, 210, 225], 0)); g.addColorStop(0.5, rgba(mix([210, 210, 225], opt.accent2, 0.2), 0.07 * i)); g.addColorStop(1, rgba([210, 210, 225], 0));
    ctx.fillStyle = g;
    for (const off of [0, W]) {
      ctx.beginPath();
      ctx.ellipse(x + off + W / 2, y, W * 0.75, H * 0.16, 0, 0, 6.283);
      ctx.fill();
    }
  }
}

function drawSnow(dt) {
  const i = opt.intensity;
  ctx.fillStyle = rgba([255, 255, 255], 0.75 * i);
  for (const f of snow) {
    f.y += f.v * dt; f.x += Math.sin(t * 0.8 + f.ph) * 12 * dt + 6 * dt;
    if (f.y > H + 6) Object.assign(f, newFlake(false));
    if (f.x > W + 6) f.x = -6;
    ctx.globalAlpha = 0.4 + f.r / 4;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFireflies(dt) {
  const i = opt.intensity;
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flies) {
    f.a += (Math.random() - 0.5) * 2 * dt; f.x += Math.cos(f.a) * f.sp * dt; f.y += Math.sin(f.a) * f.sp * dt * 0.6;
    if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10; if (f.y < H * 0.3) f.a = Math.PI / 2; if (f.y > H + 10) f.a = -Math.PI / 2;
    const glow = Math.max(0, Math.sin(t * 1.6 + f.ph)) ** 2;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 9);
    g.addColorStop(0, rgba([230, 255, 140], 0.85 * glow * i)); g.addColorStop(1, rgba([200, 255, 120], 0));
    ctx.fillStyle = g; ctx.fillRect(f.x - f.r * 9, f.y - f.r * 9, f.r * 18, f.r * 18);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawBokeh(dt) {
  const i = opt.intensity;
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bokehs) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -b.r) { b.y = H + b.r; b.x = Math.random() * W; }
    const c = b.c < 0.5 ? opt.accent : b.c < 0.8 ? opt.accent2 : [255, 230, 190];
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.6, b.x, b.y, b.r);
    g.addColorStop(0, rgba(c, b.a * i)); g.addColorStop(0.9, rgba(c, b.a * 1.4 * i)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789ABCDEF';
function drawCode(dt) {
  const i = opt.intensity * Math.min(1.5, lv('matrix'));
  ctx.font = '13px monospace';
  for (const c of codeCols) {
    c.y += c.v * dt;
    if (c.y - c.len * 14 > H) { c.y = -Math.random() * 200; c.x = Math.random() * W; }
    for (let k = 0; k < c.len; k++) {
      const y = c.y - k * 14;
      if (y < -14 || y > H + 14) continue;
      ctx.fillStyle = k === 0 ? rgba([235, 255, 235], 0.9 * i) : rgba(opt.accent2, (1 - k / c.len) * 0.55 * i);
      ctx.fillText(GLYPHS[(Math.floor(t * 8 + k * 7 + c.x) >>> 0) % GLYPHS.length], c.x, y);
    }
  }
}

let work = 0, frames = 0, statAt = 0, intervalAvg = 1000 / 60, longRun = 0, shortRun = 0;
const raf2 = self.requestAnimationFrame ? (f) => self.requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 1000 / 60);
const caf2 = self.cancelAnimationFrame ? (id) => self.cancelAnimationFrame(id) : clearTimeout;

function slowLayers(dt) {
  ctx = sctx;
  sctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawBase();
  if (lv('sunset')) drawSunset();
  if (lv('nebula')) drawNebula();
  if (lv('planet')) drawPlanet();
  if (lv('ocean')) drawOcean();
  if (lv('art')) drawArt(dt);
  if (lv('arcs')) {
    if (arcAt < 0 || t - arcAt > 0.2) {
      ctx = actx;
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, arcCv.width, arcCv.height);
      actx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawArcs();
      ctx = sctx;
      arcAt = t;
    }
    sctx.drawImage(arcCv, 0, 0, W, H);
  }
  if (lv('stars')) drawStars();
  if (lv('aurora')) drawAurora();
  if (lv('mesh')) drawMesh();
  if (lv('terrain')) drawTerrain();
  if (lv('waves')) drawWaves();
  if (lv('dots')) drawDots();
  if (lv('rings')) drawRings();
  if (lv('plexus')) drawPlexus(Math.max(dt, t - slowAt));
  if (lv('shapes')) drawShapes();
  if (lv('city')) drawCity();
  if (lv('fog')) drawFog();
}

function frame(now) {
  raf = raf2(frame);
  const since = now - last;
  const cap = throttled ? 30 : opt.fps || 0;
  if (cap && since < 1000 / cap - 1.5) return;
  intervalAvg += (Math.min(100, since) - intervalAvg) * 0.05;
  const dt = Math.min(0.1, since / 1000) * opt.speed;
  last = now;
  t += dt;
  const started = performance.now();

  const slowStep = 1 / Math.max(10, opt.slowFps || 60);
  if (slowDirty || slowAt < 0 || t - slowAt >= slowStep * opt.speed || t < slowAt) {
    slowLayers(Math.max(dt, t - slowAt));
    slowAt = t;
    slowDirty = false;
  }
  ctx = mctx;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.drawImage(slowCv, 0, 0);
  mctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (lv('comets') || comets.length) drawComets(dt);
  if (lv('rain')) drawRain(dt);
  if (lv('snow')) drawSnow(dt);
  if (lv('fireflies')) drawFireflies(dt);
  if (lv('bokeh')) drawBokeh(dt);
  if (lv('matrix')) drawCode(dt);
  if (lv('embers')) drawEmbers(dt);
  if (pulses.length) drawPulses(dt);
  if (lv('bolts') || bolts.length) drawBolts(dt);
  if (lv('storm') || storm.length || flash.life > 0) drawStorm(dt);

  // Adaptive resolution: keep the worker's share of each frame small so the display rate holds.
  work += performance.now() - started;
  frames++;
  if (now - statAt > 1000) {
    const avg = work / frames, budget = cap ? 1000 / cap : intervalAvg;
    if (opt.quality === 'auto') {
      if (avg > budget * 0.45) { longRun++; shortRun = 0; } else if (avg < budget * 0.18) { shortRun++; longRun = 0; } else { longRun = 0; shortRun = 0; }
      const max = MAX_RATIO.auto;
      if (longRun >= 1 && ratio > 0.4) { ratio = Math.max(0.4, ratio - 0.1); applyRatio(); longRun = 0; }
      else if (shortRun >= 3 && ratio < max) { ratio = Math.min(max, ratio + 0.05); applyRatio(); shortRun = 0; }
    }
    postMessage({ type: 'stats', fps: Math.round(frames * 1000 / (now - statAt)), ms: +avg.toFixed(2), ratio: +ratio.toFixed(2) });
    statAt = now; work = 0; frames = 0;
  }
}

function sync() {
  if (!mctx) return;
  if (active && !raf) { last = performance.now(); statAt = last; raf = raf2(frame); }
  if (!active && raf) { caf2(raf); raf = 0; }
}

function configure(next) {
  const before = opt.quality;
  opt = { ...opt, ...next, levels: { ...LEVELS, ...(next.levels || opt.levels) }, mesh: { ...opt.mesh, ...(next.mesh || {}) } };
  if (opt.quality !== 'auto') ratio = MAX_RATIO[opt.quality] || 0.72;
  else if (before !== 'auto') ratio = 1;
  if (!mesh) resize();
  else {
    applyRatio();
    if ([opt.mesh.style, Math.max(3, Math.round(opt.mesh.density))].join('|') !== meshKey) buildMesh();
  }
  populate();
  setPicture(opt.image || '');
  slowDirty = true;
  if (!raf) paintOnce();
}

// A paused canvas still shows the current look.
function paintOnce() {
  if (!mctx) return;
  slowLayers(0);
  ctx = mctx;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.drawImage(slowCv, 0, 0);
}

onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      mainCv = m.canvas;
      mctx = mainCv.getContext('2d', { alpha: false });
      slowCv = new OffscreenCanvas(16, 16); sctx = slowCv.getContext('2d', { alpha: false });
      arcCv = new OffscreenCanvas(16, 16); actx = arcCv.getContext('2d');
      cssW = m.w; cssH = m.h;
      resize();
      sync();
      break;
    case 'resize': cssW = m.w; cssH = m.h; resize(); if (!raf) paintOnce(); break;
    case 'configure': configure(m.opt); break;
    case 'active': active = m.on; sync(); break;
    case 'throttled': throttled = m.on; break;
    case 'mouse': mouse.x = m.x; mouse.y = m.y; break;
    case 'strike': if (raf) strike(); break;
    case 'stormStrike': if (raf) stormStrike(); break;
    case 'pulse': if (raf && pulses.length < 6) pulses.push({ x: m.x, y: m.y, size: m.size, life: 1 }); break;
    case 'setArt': gameArt = m.url || ''; break;
    case 'image': {
      images.set(m.url, m.bitmap || null);
      const ready = waiting.filter(([u]) => u === m.url);
      waiting = waiting.filter(([u]) => u !== m.url);
      if (m.bitmap) ready.forEach(([, f]) => f(m.bitmap));
      if (images.size > 40) for (const [k, v] of images) { if (k !== art.url && k !== pictureUrl && v && v.close) { v.close(); images.delete(k); } if (images.size <= 30) break; }
      slowDirty = true;
      if (!raf) paintOnce();
      break;
    }
  }
};
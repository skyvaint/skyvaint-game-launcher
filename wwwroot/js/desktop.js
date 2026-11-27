// One screen of the desktop, drawn by the Tauri shell in two layers:
//   layer=wall  the wallpaper behind the desktop icons (picture, GIF, video, colour or a live effect)
//   layer=top   your widgets and icons, just above the desktop; the mouse goes through everywhere else
// The shell sends the settings as a 'desktop' event; widget clicks and moves go back as messages.
(() => {
  const T = window.__TAURI__;
  const q = new URLSearchParams(location.search);
  const layer = q.get('layer'), label = q.get('label'), screenKey = q.get('screen');
  const mon = { x: +q.get('x'), y: +q.get('y'), w: +q.get('w'), h: +q.get('h'), s: +q.get('s') || 1 };
  // Tauri, or WebView2 in the WinForms launcher (wallpaper windows only).
  const wv = !T && window.chrome && window.chrome.webview;
  const send = (type, data = {}) => { if (T) T.core.invoke('msg', { m: { type, label, ...data } }).catch(() => {}); else if (wv) wv.postMessage({ type, label, ...data }); };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  document.body.classList.add(layer);
  let data = null;

  // ---------- wallpaper ----------
  let fx = null; // the running live effect, if any
  let wallKey = '';
  function wallOf(d) {
    const desk = d.desktop || {};
    if (desk.sameOnAll === false && desk.screens) {
      const own = Object.keys(desk.screens).find((k) => k.replace(/[^a-z0-9]/gi, '').toLowerCase() === screenKey);
      if (own) return desk.screens[own];
    }
    return desk.all || {};
  }
  function drawWall(d) {
    const own = wallOf(d), look = d.look || {};
    // In game: the aurora storm, in your aurora colours.
    const w = d.storm ? { kind: 'vfx', vfx: 'storm', colorA: own.colorA, colorB: own.colorB, speed: 3.2, fps: 30, dim: 0, blur: 0 } : own;
    const key = JSON.stringify([w, look]);
    if (key === wallKey) return;
    wallKey = key;
    const box = $('#wp');
    if (fx) { fx.stop(); fx = null; }
    box.innerHTML = '';
    box.style.setProperty('--fit', w.fit || 'cover');
    box.style.filter = w.blur ? `blur(${w.blur}px)` : '';
    box.style.inset = w.blur ? `-${w.blur * 2}px` : '0';
    $('#dim').style.opacity = w.dim || 0;
    document.body.style.background = w.color || '#000';
    const kind = w.kind || 'none';
    if (kind === 'image' && w.src) box.innerHTML = `<img src="${esc(w.src)}" alt="">`;
    else if (kind === 'video' && w.src) {
      box.innerHTML = `<video src="${esc(w.src)}" autoplay muted loop playsinline></video>`;
      const v = $('video', box);
      v.playbackRate = w.speed || 1;
    } else if (kind === 'vfx') {
      const c = document.createElement('canvas');
      box.append(c);
      fx = startFx(c, w.vfx || 'aurora', w.colorA || look.accent || '#ff1f1f', w.colorB || look.accent2 || '#8b3dff', w.speed || 1, w.fps || 30);
    }
  }

  // Live effects: plain 2D canvas, capped frame rate, drawn at a lower resolution and scaled up (they're soft anyway).
  function startFx(canvas, name, a, b, speed, fps) {
    const g = canvas.getContext('2d');
    // Any CSS colour → #rrggbb, so an alpha can be added to it ('#ff1f1f' + '88').
    const hex = (c) => { g.fillStyle = '#000'; g.fillStyle = c; const v = g.fillStyle; if (/^#[0-9a-f]{6}$/i.test(v)) return v; const m = v.match(/\d+(\.\d+)?/g) || [0, 0, 0]; return '#' + m.slice(0, 3).map((n) => (+n | 0).toString(16).padStart(2, '0')).join(''); };
    a = hex(a); b = hex(b);
    const k = name === 'lines' || name === 'grid' ? 1 : 0.5; // sharp effects at full size, soft ones at half
    let W = 0, H = 0, raf = 0, last = 0, t = 0, dead = false;
    const size = () => { W = canvas.width = Math.round(innerWidth * k); H = canvas.height = Math.round(innerHeight * k); };
    size();
    addEventListener('resize', size);
    const rnd = (n) => Math.random() * n;
    const stars = Array.from({ length: 220 }, () => ({ x: rnd(1), y: rnd(1), z: rnd(1) }));
    const lines = Array.from({ length: 14 }, (_, i) => ({ y: rnd(1), sp: 0.3 + rnd(1), w: 1 + rnd(2), hue: i % 2 }));
    const step = (now) => {
      if (dead) return;
      raf = requestAnimationFrame(step);
      if (now - last < 1000 / fps) return;
      const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
      last = now; t += dt * speed;
      if (name === 'aurora' || name === 'storm') {
        g.fillStyle = '#05040a'; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < (name === 'storm' ? 9 : 4); i++) {
          const x = W * (0.5 + 0.4 * Math.sin(t * 0.13 + i * 1.7)), y = H * (0.5 + 0.35 * Math.cos(t * 0.11 + i * 2.3));
          const r = Math.max(W, H) * (0.35 + 0.1 * Math.sin(t * 0.2 + i));
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, (i % 2 ? a : b) + '88'); gr.addColorStop(1, '#0000');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
        }
        g.globalCompositeOperation = 'source-over';
      } else if (name === 'stars') {
        g.fillStyle = '#020205'; g.fillRect(0, 0, W, H);
        for (const s of stars) {
          s.z -= dt * 0.08 * speed; if (s.z <= 0.01) { s.z = 1; s.x = rnd(1); s.y = rnd(1); }
          const px = W / 2 + (s.x - 0.5) * W / s.z, py = H / 2 + (s.y - 0.5) * H / s.z;
          const r = Math.max(0.5, (1 - s.z) * 2.4);
          g.fillStyle = s.z < 0.3 ? a : '#ffffff'; g.globalAlpha = 1 - s.z;
          g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      } else if (name === 'grid') {
        g.fillStyle = '#04030a'; g.fillRect(0, 0, W, H);
        const hz = H * 0.55; g.strokeStyle = a; g.lineWidth = 1.2;
        const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#000'); sky.addColorStop(1, b + '66');
        g.fillStyle = sky; g.fillRect(0, 0, W, hz);
        for (let i = -20; i <= 20; i++) { g.globalAlpha = 0.6; g.beginPath(); g.moveTo(W / 2 + i * 12, hz); g.lineTo(W / 2 + i * W / 6, H); g.stroke(); }
        for (let j = 0; j < 14; j++) { const p = ((j + (t * 0.6) % 1) / 14) ** 2; const y = hz + p * (H - hz); g.globalAlpha = p; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
        g.globalAlpha = 1;
      } else if (name === 'lines') {
        g.fillStyle = 'rgba(3,3,6,.35)'; g.fillRect(0, 0, W, H);
        for (const l of lines) {
          const x = ((t * 140 * l.sp + l.y * 9999) % (W + 600)) - 300;
          const gr = g.createLinearGradient(x - 300, 0, x, 0); gr.addColorStop(0, '#0000'); gr.addColorStop(1, l.hue ? a : b);
          g.strokeStyle = gr; g.lineWidth = l.w; g.beginPath(); g.moveTo(x - 300, l.y * H); g.lineTo(x, l.y * H); g.stroke();
        }
      } else { // waves
        g.fillStyle = '#04030a'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 5; i++) {
          g.beginPath(); g.moveTo(0, H);
          for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (0.55 + i * 0.07) + Math.sin(x / W * 6 + t * (0.6 + i * 0.2) + i) * H * 0.05);
          g.lineTo(W, H); g.closePath(); g.fillStyle = (i % 2 ? a : b) + '33'; g.fill();
        }
      }
    };
    raf = requestAnimationFrame(step);
    return { stop() { dead = true; cancelAnimationFrame(raf); removeEventListener('resize', size); } };
  }

  // ---------- widgets ----------
  let perf = null, timer = 0;
  const onMine = (w, d) => {
    const mons = d.monitors || [];
    const inside = (m) => w.x != null && w.y != null && w.x >= m.x && w.y >= m.y && w.x < m.x + m.w && w.y < m.y + m.h;
    if (mons.some(inside)) return inside(mon);
    const main = mons.find((m) => m.primary) || mons[0];
    return main ? main.x === mon.x && main.y === mon.y : true; // lost widgets come back on the main screen
  };
  const gameOf = (id) => (data.games || []).find((g) => g.id === id) || {};
  function appHtml(a) {
    const g = a.kind === 'game' ? gameOf(a.gameId) : {};
    const name = a.name || g.name || '';
    const pic = a.icon || g.icon || g.cover || '';
    return `<div class="app" data-app>${pic ? `<img src="${esc(pic)}" alt="">` : `<div class="ph">${esc(name.slice(0, 1))}</div>`}${a.hideName ? '' : `<span>${esc(name)}</span>`}</div>`;
  }
  function body(w) {
    const now = new Date();
    const c24 = w.clock24 != null ? w.clock24 : data.clock24;
    switch (w.kind) {
      case 'clock': return `<div class="big">${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !c24 })}</div><div class="tag" style="margin-top:8px">${esc(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`;
      case 'date': return `<div class="tag">${esc(now.toLocaleDateString([], { weekday: 'long' }))}</div><div class="big">${now.getDate()}</div><div class="mid">${esc(now.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</div>`;
      case 'note': return `<div class="tag">${esc(w.label || 'NOTE')}</div><div class="mid" style="white-space:pre-wrap;max-width:320px">${esc(w.text || '')}</div>`;
      case 'countdown': {
        const days = w.date ? Math.ceil((new Date(w.date + 'T00:00') - now) / 864e5) : null;
        return `<div class="tag">${esc(w.label || 'COUNTDOWN')}</div><div class="big">${days == null ? '—' : Math.max(0, days)}</div><div class="tag">${days === 1 ? 'DAY LEFT' : 'DAYS LEFT'}</div>`;
      }
      case 'perf': return perf
        ? `<div class="tag">CPU · ${perf.cpu}%</div><div class="bar"><i style="width:${perf.cpu}%"></i></div><div class="tag">RAM · ${perf.usedGb} / ${perf.totalGb} GB</div><div class="bar"><i style="width:${perf.ram}%"></i></div>`
        : '<div class="tag">PERFORMANCE</div><div class="mid">…</div>';
      case 'music': return '<div class="tag">MUSIC</div><div class="mid">Nothing playing</div>';
      case 'icon': return (w.apps || []).slice(0, 1).map(appHtml).join('') || '<div class="tag">EMPTY ICON</div>';
      case 'custom': return window.SVW ? SVW.render(w.spec, { perf, accent: (data.look || {}).accent, accent2: (data.look || {}).accent2, name: data.name }) : '';
      case 'apps': return `<div class="grid">${(w.apps || []).map(appHtml).join('')}</div>`;
      default: return `<div class="tag">${esc(w.kind)}</div>`;
    }
  }
  function drawWidgets() {
    const box = $('#ws');
    const all = ((data.widgets || {}).items || []).filter((w) => w.enabled !== false && onMine(w, data));
    const locked = (data.widgets || {}).locked !== false;
    box.innerHTML = '';
    all.forEach((w, i) => {
      const style = w.style || (w.kind === 'icon' ? 'none' : 'glass');
      const n = document.createElement('div');
      n.className = `w ${style} hv-${w.hover || 'glow'}${locked ? '' : ' unlocked'}`;
      n.dataset.id = w.id;
      const x = w.x != null && w.y != null && (w.x >= mon.x && w.x < mon.x + mon.w) ? (w.x - mon.x) / mon.s : innerWidth - 380;
      const y = w.x != null && w.y != null && (w.y >= mon.y && w.y < mon.y + mon.h) ? (w.y - mon.y) / mon.s : 60 + i * 170;
      n.style.cssText = `left:${x}px;top:${y}px;transform:scale(${w.scale || 1});opacity:${w.opacity == null ? 0.92 : w.opacity};--r:${w.radius == null ? 16 : w.radius}px;--px:${w.iconSize || 64}px;--ir:${Math.round((w.radius == null ? 16 : w.radius) * (w.iconSize || 64) / 64)}px`;
      if (w.textColor) n.style.setProperty('--tc', w.textColor);
      if (w.bgColor) n.style.setProperty('--bg', w.bgColor);
      n.innerHTML = body(w) + (locked ? '' : '<div class="tools"><button data-next>NEXT SCREEN</button></div>');
      box.append(n);
      wire(n, w, locked);
    });
    sendRects();
  }
  function sendRects() {
    const rects = [...document.querySelectorAll('.w')].map((n) => { const r = n.getBoundingClientRect(); return [r.left - 6, r.top - 40, r.width + 12, r.height + 46]; });
    send('desktopRects', { rects });
  }
  function wire(n, w, locked) {
    n.querySelectorAll('[data-app]').forEach((a, i) => a.addEventListener('click', () => {
      const it = (w.apps || [])[i];
      if (!it) return;
      if (it.kind === 'game') send('launch', { id: it.gameId });
      else send('openItem', { item: it });
    }));
    // One listener on the card: its insides are redrawn as the clock ticks.
    n.addEventListener('click', (e) => {
      const k = e.target.closest('[data-wk]');
      if (!k) return;
      const b = ((w.spec || {}).blocks || [])[+k.dataset.wk];
      if (!b || !b.target) return;
      if (b.kind === 'game') send('launch', { id: b.gameId });
      else send('openItem', { item: { kind: b.kind, target: b.target, name: b.name, process: b.process || '' } });
    });
    if (locked) return;
    const next = $('[data-next]', n);
    if (next) next.addEventListener('click', (e) => {
      e.stopPropagation();
      const mons = (data.monitors || []).slice().sort((p, r) => p.x - r.x || p.y - r.y);
      const at = mons.findIndex((m) => m.x === mon.x && m.y === mon.y);
      const to = mons[(at + 1) % mons.length] || mon;
      send('widgetMoved', { id: w.id, x: to.x + 80, y: to.y + 80 });
    });
    n.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const sx = e.clientX, sy = e.clientY, ox = n.offsetLeft, oy = n.offsetTop;
      n.setPointerCapture(e.pointerId);
      send('desktopDrag', { on: true });
      const move = (ev) => { n.style.left = Math.max(0, Math.min(innerWidth - 40, ox + ev.clientX - sx)) + 'px'; n.style.top = Math.max(0, Math.min(innerHeight - 40, oy + ev.clientY - sy)) + 'px'; };
      const up = () => {
        n.removeEventListener('pointermove', move);
        send('desktopDrag', { on: false });
        send('widgetMoved', { id: w.id, x: Math.round(mon.x + n.offsetLeft * mon.s), y: Math.round(mon.y + n.offsetTop * mon.s) });
        sendRects();
      };
      n.addEventListener('pointermove', move);
      n.addEventListener('pointerup', up, { once: true });
    });
  }

  function apply(d) {
    data = d;
    const look = d.look || {};
    if (look.accent) document.body.style.setProperty('--accent', look.accent);
    if (look.accent2) document.body.style.setProperty('--accent2', look.accent2);
    if (layer === 'wall') drawWall(d);
    else {
      drawWidgets();
      clearInterval(timer);
      // Clocks and dates tick; nothing else redraws on its own.
      const ticks = (w) => /clock|date|countdown/.test(w.kind) || (w.kind === 'custom' && window.SVW && SVW.live(w.spec));
      if ((d.widgets.items || []).some(ticks)) timer = setInterval(() => {
        document.querySelectorAll('.w').forEach((n) => {
          const w = d.widgets.items.find((x) => x.id === n.dataset.id);
          if (w && ticks(w)) { const tools = $('.tools', n); n.innerHTML = body(w); if (tools) n.append(tools); }
        });
      }, (d.widgets.items || []).some((w) => w.kind === 'custom' && JSON.stringify(w.spec).includes('{seconds}')) ? 1000 : 15000);
    }
  }

  if (layer === 'launch' && window.SVAurora) {
    document.body.style.background = '#000';
    const colors = (q.get('c') || '').split(',').filter(Boolean).map((c) => '#' + c);
    const run = SVAurora.play(document.body, { colors, start: +q.get('t0') || Date.now(), text: false });
    if (wv) wv.addEventListener('message', (e) => { if (e.data && e.data.type === 'fade') run.fade(e.data.ms || 3000); });
    return;
  }
  if (!T && !wv) { document.body.innerHTML = '<p style="color:#fff;padding:20px">This page is drawn by the launcher on your desktop.</p>'; return; }
  // While a game runs the effect stops drawing and a video pauses; they pick up again after.
  let paused = false;
  function pause(on) {
    if (on === paused) return;
    paused = on;
    const v = $('#wp video');
    if (on) { if (fx) { fx.stop(); fx = null; } if (v) v.pause(); }
    else { wallKey = ''; if (data && layer === 'wall') drawWall(data); }
  }
  if (wv) {
    wv.addEventListener('message', (e) => {
      const m = e.data || {};
      if (m.type === 'desktop') { if (!m.paused && paused) pause(false); apply(m); if (m.paused) pause(true); }
      else if (m.type === 'desktopPause') pause(!!m.on);
    });
    send('desktopReady');
    return;
  }
  T.event.listen('desktop', (e) => apply(e.payload)).then(() => send('desktopReady'));
  if (layer === 'top') T.event.listen('perf', (e) => {
    perf = e.payload;
    document.querySelectorAll('.w').forEach((n) => {
      const w = ((data && data.widgets.items) || []).find((x) => x.id === n.dataset.id);
      if (w && (w.kind === 'perf' || (w.kind === 'custom' && window.SVW && SVW.live(w.spec)))) { const tools = $('.tools', n); n.innerHTML = body(w); if (tools) n.append(tools); }
    });
  });
  // A video wallpaper rests while a game fills the screen over it (the shell hides nothing; the page just pauses).
  document.addEventListener('visibilitychange', () => { const v = $('#wp video'); if (v) document.hidden ? v.pause() : v.play().catch(() => {}); });
})();

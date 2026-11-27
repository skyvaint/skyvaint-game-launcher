// Settings → DESKTOP → CREATOR: make your own icons and widgets, with a live preview.
//   ICON CREATOR    a shape, a flat or gradient background, a letter, emoji, symbol or picture on it, a border, glow and
//                   shadow. Saved as a picture (PNG) and kept in MY ICONS, ready for HOME icons, games, the Main Bar
//                   and desktop icons.
//   WIDGET CREATOR  a card (background, corners, border, glow, font) holding blocks: text with live {tokens}, a big
//                   line, bars for CPU and memory, a picture, a button that opens something, lines and space. Put it
//                   on HOME, on the desktop, or both; editing it later updates every copy.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, toast, R, heading, prop } = A;
  const newId = () => Math.random().toString(36).slice(2, 9);
  const C = () => { const c = A.cfg.creator || (A.cfg.creator = {}); c.icons = c.icons || []; c.widgets = c.widgets || []; return c; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const theme = () => { const cs = getComputedStyle(document.documentElement); return { accent: cs.getPropertyValue('--accent').trim() || '#ff1f1f', accent2: cs.getPropertyValue('--accent2').trim() || '#8b3dff' }; };

  // Pictures made here are saved by the shell into the media folder.
  const saves = {};
  host.on('imageSaved', (m) => { const f = saves[m.token]; delete saves[m.token]; f && f(m); });
  const saveImage = (dataUrl, name) => new Promise((resolve) => {
    const token = newId();
    saves[token] = resolve;
    if (!host.native) return setTimeout(() => { delete saves[token]; resolve({ url: dataUrl }); }, 0); // browser preview: keep it inline
    host.send('saveImage', { token, dataUrl, name });
  });

  // ------------------------------------------------------------------ icons

  // Symbols: 24×24 line drawings.
  const SYMBOLS = {
    gamepad: 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.3 1.9L15 14H9l-1.7 1.9A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M16 12h.01M18 13.5h.01',
    play: 'M8 5l11 7-11 7z', star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    heart: 'M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z', music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16', chat: 'M4 5h16v11H9l-5 4z', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
    folder: 'M3 6h6l2 2h10v11H3z', camera: 'M4 7h4l2-3h4l2 3h4v12H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
    flame: 'M12 3s6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 2-5s0 3 2 4c0-5 2-10 2-10z', sword: 'M14 4h6v6L9 21l-3-3zM5 14l5 5M3 21l3-3',
    skull: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 20v-2M14 20v-2', rocket: 'M12 3c4 2 6 6 6 10l-3 3H9l-3-3c0-4 2-8 6-10zM12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 16l-2 5 5-3M15 16l2 5-5-3',
    target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', trophy: 'M7 3h10v5a5 5 0 0 1-10 0zM9 21h6M12 13v8M7 5H3v2a3 3 0 0 0 4 3M17 5h4v2a3 3 0 0 1-4 3',
  };
  const SHAPES = [['squircle', 'Rounded square'], ['circle', 'Circle'], ['square', 'Square'], ['hex', 'Hexagon'], ['diamond', 'Diamond'], ['shield', 'Shield'], ['none', 'No shape']];

  function shapePath(g, shape, x, y, s, r) {
    g.beginPath();
    if (shape === 'circle') g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
    else if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + s / 2 + Math.cos(a) * s / 2, y + s / 2 + Math.sin(a) * s / 2); } g.closePath(); }
    else if (shape === 'diamond') { g.moveTo(x + s / 2, y); g.lineTo(x + s, y + s / 2); g.lineTo(x + s / 2, y + s); g.lineTo(x, y + s / 2); g.closePath(); }
    else if (shape === 'shield') { g.moveTo(x + s * 0.1, y + s * 0.08); g.lineTo(x + s * 0.9, y + s * 0.08); g.lineTo(x + s * 0.9, y + s * 0.5); g.quadraticCurveTo(x + s * 0.9, y + s * 0.85, x + s / 2, y + s); g.quadraticCurveTo(x + s * 0.1, y + s * 0.85, x + s * 0.1, y + s * 0.5); g.closePath(); }
    else { const rr = shape === 'square' ? 0 : Math.min(s / 2, r); g.roundRect(x, y, s, s, rr); }
  }

  const images = {};
  const loadImage = (src) => images[src] || (images[src] = new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));

  // Draws an icon onto a canvas (any size; 512 for saving).
  async function drawIcon(spec, canvas) {
    const S = canvas.width, g = canvas.getContext('2d');
    g.clearRect(0, 0, S, S);
    const t = theme(), c1 = spec.c1 || t.accent, c2 = spec.c2 || t.accent2;
    const pad = S * (spec.glow || spec.shadow ? 0.12 : 0.04), s = S - pad * 2, x = pad, y = pad;
    const shape = spec.shape || 'squircle';
    // shadow and glow
    if (shape !== 'none' && spec.bg !== 'none') {
      g.save();
      if (spec.shadow) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = S * 0.06; g.shadowOffsetY = S * 0.025; }
      if (spec.glow) { g.shadowColor = spec.glowColor || c1; g.shadowBlur = S * 0.02 * spec.glow; g.shadowOffsetY = 0; }
      shapePath(g, shape, x, y, s, s * (spec.radius == null ? 0.24 : spec.radius / 100));
      g.fillStyle = c1; g.fill();
      g.restore();
    }
    g.save();
    if (shape !== 'none') { shapePath(g, shape, x, y, s, s * (spec.radius == null ? 0.24 : spec.radius / 100)); g.clip(); }
    if (spec.bg !== 'none' && shape !== 'none') {
      if (spec.bg === 'gradient') {
        const a = ((spec.angle == null ? 135 : spec.angle) - 90) * Math.PI / 180, cx = S / 2, cy = S / 2, d = s / 2;
        const gr = g.createLinearGradient(cx - Math.cos(a) * d, cy - Math.sin(a) * d, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr;
      } else g.fillStyle = spec.bg === 'dark' ? '#141010' : c1;
      g.fillRect(0, 0, S, S);
      if (spec.shine) { const sh = g.createLinearGradient(0, y, 0, y + s * 0.55); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(0, 0, S, y + s * 0.55); }
    }
    const k = (spec.size == null ? 55 : spec.size) / 100, gs = s * k, fg = spec.fg || '#ffffff';
    const gx = S / 2 + (spec.dx || 0) * s / 100, gy = S / 2 + (spec.dy || 0) * s / 100;
    if (spec.glyph === 'image' && spec.image) {
      const im = await loadImage(spec.image);
      if (im) {
        const fill = spec.imageFit === 'cover' ? Math.max(s / im.width, s / im.height) : Math.min(gs / im.width, gs / im.height);
        const w = im.width * fill, h = im.height * fill;
        g.drawImage(im, (spec.imageFit === 'cover' ? S / 2 : gx) - w / 2, (spec.imageFit === 'cover' ? S / 2 : gy) - h / 2, w, h);
      }
    } else if (spec.glyph === 'symbol') {
      const p = new Path2D(SYMBOLS[spec.symbol] || SYMBOLS.gamepad);
      g.save();
      g.translate(gx - gs / 2, gy - gs / 2); g.scale(gs / 24, gs / 24);
      g.strokeStyle = fg; g.lineWidth = spec.stroke || 2; g.lineJoin = 'round'; g.lineCap = 'round';
      if (spec.filled) { g.fillStyle = fg; g.fill(p); } else g.stroke(p);
      g.restore();
    } else {
      const text = spec.text == null ? 'S' : spec.text;
      const font = { display: "'Bebas Neue','Oswald',Impact,sans-serif", sans: "'Segoe UI',sans-serif", mono: 'Consolas,monospace', serif: 'Georgia,serif' }[spec.font || 'display'];
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = gs * (text.length > 2 ? 0.75 : 1);
      g.font = `${spec.weight || 800} ${px}px ${font}`;
      const mw = g.measureText(text).width;
      if (mw > s * 0.86) { px *= (s * 0.86) / mw; g.font = `${spec.weight || 800} ${px}px ${font}`; }
      g.fillText(text, gx, gy + px * 0.04);
    }
    g.restore();
    if (spec.border && shape !== 'none') {
      shapePath(g, shape, x + spec.border / 2, y + spec.border / 2, s - spec.border, s * (spec.radius == null ? 0.24 : spec.radius / 100));
      g.lineWidth = spec.border * S / 256; g.strokeStyle = spec.borderColor || 'rgba(255,255,255,.6)'; g.stroke();
    }
  }

  const ICON_START = { shape: 'squircle', radius: 24, bg: 'gradient', angle: 135, glyph: 'symbol', symbol: 'gamepad', text: 'S', font: 'display', size: 55, fg: '#ffffff', shine: true, shadow: true, glow: 0, border: 0 };

  // ------------------------------------------------------------------ the creator screen

  function studio({ tag, title, stage, rows, onSave }) {
    const root = el(`<div class="overlay creator"><div class="cr-wrap">
      <div class="cr-stage"></div>
      <div class="sheet cr-side"><div class="sheet-head"><div><div class="tag">[ ${esc(tag)} ]</div><h2>${esc(title)}</h2></div>
        <div class="cr-actions"><button class="btn small ghost" data-x>CANCEL</button><button class="btn small" data-save>SAVE</button></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${A.hints([['confirm', 'Change'], ['adjust', 'Adjust'], ['back', 'Close']])}</div></div></div></div>`);
    const body = root.querySelector('.sheet-body'), p = A.panel(body);
    root.querySelector('.cr-stage').append(stage);
    const build = (at) => { body.replaceChildren(...rows(build)); p.focus(at == null ? p.idx : at); };
    root.querySelector('[data-x]').addEventListener('click', () => A.pop());
    root.querySelector('[data-save]').addEventListener('click', () => onSave(() => A.pop()));
    build(0);
    A.push({ el: root, action: p.action });
    return { build, root };
  }

  // A scratch copy edited by the rows below: `R` rows save through A.changed(), which is harmless here.
  function iconCreator(existing, after) {
    const spec = Object.assign(clone(ICON_START), existing ? clone(existing.spec) : {});
    const stage = el(`<div class="cr-icon"><canvas width="512" height="512" class="cr-big"></canvas>
      <div class="cr-sizes"><canvas width="128" height="128"></canvas><canvas width="64" height="64"></canvas><canvas width="32" height="32"></canvas></div>
      <div class="cr-note">Saved as a 512 × 512 picture.</div></div>`);
    const cans = [...stage.querySelectorAll('canvas')];
    let q = 0;
    const redraw = () => { const n = ++q; requestAnimationFrame(() => { if (n === q) cans.forEach((c) => drawIcon(spec, c)); }); };
    const P = (k) => prop(spec, k);
    const set = (k) => ({ get: () => spec[k], set: (v) => { spec[k] = v; redraw(); } });
    const num = (k, d) => ({ get: () => (spec[k] == null ? d : spec[k]), set: (v) => { spec[k] = v; redraw(); } });
    const col = (k, d) => ({ get: () => spec[k] || d, set: (v) => { spec[k] = v; redraw(); } });
    const t = theme();
    const s = studio({
      tag: 'ICON CREATOR', title: existing ? existing.name || 'ICON' : 'NEW ICON', stage,
      rows: (build) => {
        const re = () => { redraw(); build(); };
        return [
          heading('SHAPE'),
          R.choice('Shape', '', set('shape'), SHAPES, re),
          ...(spec.shape === 'squircle' ? [R.slider('Corners', '', num('radius', 24), 0, 50, 1, (v) => v + '%')] : []),
          R.choice('Background', '', set('bg'), [['gradient', 'Gradient'], ['solid', 'One colour'], ['dark', 'Dark'], ['none', 'See-through']], re),
          R.color('Colour', 'Empty follows your theme.', col('c1', t.accent)),
          ...(spec.bg === 'gradient' ? [R.color('Second colour', '', col('c2', t.accent2)), R.slider('Gradient angle', '', num('angle', 135), 0, 360, 5, (v) => v + '°')] : []),
          R.toggle('Shine', 'A soft light across the top.', set('shine')),
          heading('ON IT'),
          R.choice('What is on it', '', set('glyph'), [['symbol', 'A symbol'], ['text', 'Letters or an emoji'], ['image', 'A picture']], re),
          ...(spec.glyph === 'symbol' ? [
            R.choice('Symbol', '', set('symbol'), Object.keys(SYMBOLS).map((k) => [k, k.toUpperCase()])),
            R.slider('Line thickness', '', num('stroke', 2), 0.75, 4, 0.25, (v) => v.toFixed(2)),
            R.toggle('Filled', '', set('filled')),
          ] : []),
          ...(spec.glyph === 'text' ? [
            R.text('Text', 'One or two letters, or an emoji.', { get: () => spec.text || '', set: (v) => { spec.text = v; redraw(); } }, 'S'),
            R.choice('Font', '', set('font'), [['display', 'Display'], ['sans', 'Clean'], ['mono', 'Code'], ['serif', 'Serif']]),
          ] : []),
          ...(spec.glyph === 'image' ? [
            R.file('Picture', 'A logo or any picture.', { get: () => spec.image || '', set: (v) => { spec.image = v; redraw(); } }, 'image'),
            R.choice('Picture fit', '', set('imageFit'), [['contain', 'Whole picture'], ['cover', 'Fill the shape']]),
          ] : []),
          R.color('Colour on it', '', col('fg', '#ffffff')),
          R.slider('Size', '', num('size', 55), 15, 100, 1, (v) => v + '%'),
          R.slider('Move sideways', '', num('dx', 0), -40, 40, 1, (v) => v + '%'),
          R.slider('Move up or down', '', num('dy', 0), -40, 40, 1, (v) => v + '%'),
          heading('EDGE'),
          R.slider('Border', '', num('border', 0), 0, 24, 1, (v) => (v ? v + ' px' : 'OFF')),
          R.color('Border colour', '', col('borderColor', '#ffffff')),
          R.slider('Glow', '', num('glow', 0), 0, 10, 1, (v) => (v ? v : 'OFF')),
          R.color('Glow colour', '', col('glowColor', t.accent)),
          R.toggle('Shadow', '', set('shadow')),
          heading('START FROM'),
          R.buttons('Ideas', '', [
            ['NEON', () => { Object.assign(spec, { bg: 'dark', glow: 6, border: 4, borderColor: t.accent, fg: t.accent, glowColor: t.accent, shine: false }); re(); }],
            ['GLASS', () => { Object.assign(spec, { bg: 'solid', c1: '#ffffff22', shine: true, glow: 0, border: 2, borderColor: '#ffffff55', fg: '#ffffff' }); re(); }],
            ['MONO', () => { Object.assign(spec, { bg: 'solid', c1: '#111111', fg: '#ffffff', glow: 0, border: 0, shine: false }); re(); }],
            ['RESET', () => { for (const k of Object.keys(spec)) delete spec[k]; Object.assign(spec, clone(ICON_START)); re(); }, 'ghost'],
          ]),
        ];
      },
      onSave: (close) => A.ask({ tag: 'ICON CREATOR', title: 'NAME IT', label: 'Name', value: existing ? existing.name || '' : '', placeholder: 'My icon', button: 'SAVE', done: async (name) => {
        const big = document.createElement('canvas'); big.width = big.height = 512;
        await drawIcon(spec, big);
        let data;
        try { data = big.toDataURL('image/png'); } catch { return toast('That picture can\'t be saved (it comes from a site that doesn\'t allow it). Pick a downloaded copy.', 'bad'); }
        const r = await saveImage(data, name || 'icon');
        if (!r.url) return toast('Couldn\'t save the icon: ' + (r.error || 'unknown'), 'bad');
        const lib = C().icons;
        if (existing) Object.assign(existing, { name: name.trim(), url: r.url, spec: clone(spec) });
        else lib.unshift({ id: newId(), name: name.trim() || 'Icon', url: r.url, spec: clone(spec) });
        A.changed();
        audio.play('confirm');
        close();
        useIcon(existing || lib[0], after);
      } }),
    });
    redraw();
    return s;
  }

  // Where a finished icon goes.
  function useIcon(icon, after) {
    const done = (what) => { A.changed(); toast(`${icon.name} set on ${what}`); after && after(); };
    const homeIcons = (A.cfg.home.icons || []);
    const deskIcons = ((A.cfg.widgets || {}).items || []).filter((w) => w.kind === 'icon' && w.apps && w.apps[0]);
    const bar = (A.cfg.nexus && A.cfg.nexus.items) || [];
    A.openMenu('USE IT FOR', [
      { label: 'JUST KEEP IT', sub: 'It stays in MY ICONS for later', run: () => after && after() },
      ...(homeIcons.length ? [{ label: 'A HOME ICON', sub: `${homeIcons.length} on HOME`, run: () => A.openMenu('HOME ICONS', homeIcons.map((i) => ({ label: i.name || 'Icon', run: () => { i.icon = icon.url; SV.homeIcons && SV.homeIcons.render(); done(i.name || 'the HOME icon'); } }))) }] : []),
      { label: 'A GAME', sub: 'Its icon on HOME and in the lists', run: () => A.openMenu('GAMES', A.cfg.games.map((g) => ({ label: g.name, run: () => { g.icon = icon.url; A.changed('games'); done(g.name); } }))) },
      ...(bar.length ? [{ label: 'THE MAIN BAR', sub: 'A button on your NEXUS bar', run: () => A.openMenu('MAIN BAR', bar.map((b) => ({ label: b.name || b.target || 'Button', run: () => { b.icon = icon.url; done(b.name || 'the Main Bar'); } }))) }] : []),
      ...(deskIcons.length ? [{ label: 'A DESKTOP ICON', sub: `${deskIcons.length} on your desktop`, run: () => A.openMenu('DESKTOP ICONS', deskIcons.map((w) => ({ label: w.apps[0].name || 'Icon', run: () => { w.apps[0].icon = icon.url; done(w.apps[0].name || 'the desktop icon'); } }))) }] : []),
    ]);
  }

  // ------------------------------------------------------------------ widgets

  const BLOCKS = { text: 'Text', big: 'Big text', bar: 'Bar', image: 'Picture', button: 'Button', line: 'Line', space: 'Space' };

  function widgetCreator(existing, after) {
    const spec = clone(existing ? existing.spec : SVW.TEMPLATES.clock);
    delete spec.name;
    spec.look = spec.look || {};
    spec.blocks = spec.blocks || [];
    let editing = -1; // a block being edited, or -1 for the card
    let perf = null;
    const stage = el('<div class="cr-widget"><div class="cr-bgnote">Shown over your wallpaper, as on the desktop.</div><div class="cr-card"></div></div>');
    const card = stage.querySelector('.cr-card');
    const redraw = () => { card.innerHTML = SVW.render(spec, { ...theme(), perf, name: A.cfg.profile && A.cfg.profile.name, music: SV.music && SV.music.track }); };
    const statsTimer = setInterval(() => { if (!document.body.contains(stage)) return clearInterval(statsTimer); host.send('systemStats'); redraw(); }, 2000);
    host.on('systemStats', (m) => { if (m.cpu != null && document.body.contains(stage)) perf = { cpu: m.cpu, ram: m.ramTotal ? (m.ramUsed / m.ramTotal) * 100 : 0 }; });
    const L = spec.look;
    const lk = (k, d) => ({ get: () => (L[k] == null ? d : L[k]), set: (v) => { L[k] = v; redraw(); } });
    const bk = (b, k, d) => ({ get: () => (b[k] == null ? d : b[k]), set: (v) => { b[k] = v; redraw(); } });
    const t = theme();

    const s = studio({
      tag: 'WIDGET CREATOR', title: existing ? existing.name || 'WIDGET' : 'NEW WIDGET', stage,
      rows: (build) => {
        const re = () => { redraw(); build(); };
        const b = spec.blocks[editing];
        if (b) return [
          heading(`BLOCK ${editing + 1} · ${BLOCKS[b.t].toUpperCase()}`),
          R.button('Back to the widget', '', 'BACK', () => { editing = -1; build(0); }),
          ...(b.t === 'text' || b.t === 'big' ? [
            R.text('Text', 'Live values: {time} {date} {day} {cpu} {ram} {song} {name} {greeting} {days:2026-12-25}', bk(b, 'text', ''), 'Your text'),
            R.buttons('Insert', '', [['TIME', () => { b.text = (b.text || '') + '{time}'; re(); }], ['DATE', () => { b.text = (b.text || '') + '{date}'; re(); }], ['DAY', () => { b.text = (b.text || '') + '{day}'; re(); }], ['CPU', () => { b.text = (b.text || '') + '{cpu}'; re(); }], ['SONG', () => { b.text = (b.text || '') + '{song}'; re(); }]]),
            R.slider('Size', '', bk(b, 'size', b.t === 'big' ? 54 : 15), 8, 140, 1, (v) => v + ' px'),
            R.choice('Weight', '', bk(b, 'weight', b.t === 'big' ? 700 : 500), [[300, 'Light'], [500, 'Normal'], [700, 'Bold'], [900, 'Heavy']]),
            R.toggle('Capitals', '', bk(b, 'upper', false)),
            R.slider('Letter spacing', '', bk(b, 'spacing', 0), -0.05, 0.5, 0.01, (v) => v.toFixed(2)),
          ] : []),
          ...(b.t === 'bar' ? [
            R.choice('Shows', '', bk(b, 'of', 'cpu'), [['cpu', 'CPU use'], ['ram', 'Memory use'], ['custom', 'A fixed amount']], re),
            ...(b.of === 'custom' ? [R.slider('Amount', '', bk(b, 'value', 50), 0, 100, 1, (v) => v + '%')] : []),
            R.slider('Length', '', bk(b, 'width', 180), 40, 600, 5, (v) => v + ' px'),
            R.slider('Thickness', '', bk(b, 'h', 6), 2, 30, 1, (v) => v + ' px'),
          ] : []),
          ...(b.t === 'image' ? [
            R.file('Picture or GIF', '', bk(b, 'src', ''), 'image'),
            R.slider('Width', '', bk(b, 'width', 160), 24, 600, 2, (v) => v + ' px'),
            R.slider('Height', '0 keeps its shape.', bk(b, 'h', 0), 0, 600, 2, (v) => (v ? v + ' px' : 'AUTO')),
            R.slider('Corners', '', bk(b, 'radius', 12), 0, 300, 1, (v) => v + ' px'),
          ] : []),
          ...(b.t === 'button' ? [
            R.text('Label', '', bk(b, 'label', 'OPEN'), 'OPEN'),
            R.button('What it opens', b.target ? (b.name || b.target) : 'Nothing yet', 'CHOOSE', () => pickTarget(b, re)),
            R.color('Button colour', '', { get: () => b.bg || t.accent, set: (v) => { b.bg = v; redraw(); } }),
            R.slider('Text size', '', bk(b, 'size', 13), 9, 40, 1, (v) => v + ' px'),
            R.slider('Corners', '', bk(b, 'radius', 10), 0, 40, 1, (v) => v + ' px'),
          ] : []),
          ...(b.t === 'line' ? [R.slider('Length', '', bk(b, 'width', 120), 10, 600, 5, (v) => v + ' px'), R.slider('Thickness', '', bk(b, 'h', 1), 1, 12, 1, (v) => v + ' px')] : []),
          ...(b.t === 'space' ? [R.slider('Height', '', bk(b, 'h', 10), 2, 120, 1, (v) => v + ' px')] : []),
          ...(b.t !== 'space' ? [
            R.color('Colour', 'Empty uses the card\'s text colour.', { get: () => b.color || L.text || '#f5efee', set: (v) => { b.color = v; redraw(); } }),
            R.slider('See-through', '', { get: () => (b.opacity == null ? 1 : b.opacity), set: (v) => { b.opacity = v; redraw(); } }, 0.1, 1, 0.05, (v) => Math.round(v * 100) + '%'),
          ] : []),
          R.buttons('Order', '', [
            ['UP', () => { if (editing > 0) { [spec.blocks[editing - 1], spec.blocks[editing]] = [spec.blocks[editing], spec.blocks[editing - 1]]; editing--; re(); } }],
            ['DOWN', () => { if (editing < spec.blocks.length - 1) { [spec.blocks[editing + 1], spec.blocks[editing]] = [spec.blocks[editing], spec.blocks[editing + 1]]; editing++; re(); } }],
            ['COPY', () => { spec.blocks.splice(editing + 1, 0, clone(b)); editing++; re(); }],
            ['REMOVE', () => { spec.blocks.splice(editing, 1); editing = -1; re(); }, 'danger'],
          ]),
        ];
        return [
          heading('BLOCKS'),
          ...spec.blocks.map((x, i) => R.buttons(`${i + 1}. ${BLOCKS[x.t]}`, x.text || x.label || (x.t === 'bar' ? (x.of || 'cpu').toUpperCase() : x.t === 'image' ? (x.src ? 'Picture set' : 'No picture yet') : ''), [
            ['EDIT', () => { editing = i; build(0); }],
            ['▲', () => { if (i > 0) { [spec.blocks[i - 1], spec.blocks[i]] = [spec.blocks[i], spec.blocks[i - 1]]; re(); } }, 'ghost'],
            ['▼', () => { if (i < spec.blocks.length - 1) { [spec.blocks[i + 1], spec.blocks[i]] = [spec.blocks[i], spec.blocks[i + 1]]; re(); } }, 'ghost'],
          ])),
          R.buttons('Add a block', '', Object.entries(BLOCKS).map(([k, n]) => [n.toUpperCase(), () => {
            spec.blocks.push(k === 'text' ? { t: k, text: 'Text' } : k === 'big' ? { t: k, text: '{time}' } : k === 'button' ? { t: k, label: 'OPEN' } : k === 'bar' ? { t: k, of: 'cpu' } : { t: k });
            editing = spec.blocks.length - 1; redraw(); build(0);
          }])),
          heading('CARD'),
          R.choice('Background', '', lk('bg', 'glass'), [['glass', 'Dark glass'], ['solid', 'One colour'], ['gradient', 'Gradient'], ['none', 'None']], re),
          ...(L.bg === 'glass' || !L.bg ? [R.slider('Glass darkness', '', lk('glass', 0.62), 0, 1, 0.02)] : []),
          ...(L.bg === 'solid' || L.bg === 'gradient' ? [R.color('Colour', '', { get: () => L.c1 || t.accent, set: (v) => { L.c1 = v; redraw(); } })] : []),
          ...(L.bg === 'gradient' ? [R.color('Second colour', '', { get: () => L.c2 || t.accent2, set: (v) => { L.c2 = v; redraw(); } }), R.slider('Gradient angle', '', lk('angle', 135), 0, 360, 5, (v) => v + '°')] : []),
          R.color('Text colour', '', { get: () => L.text || '#f5efee', set: (v) => { L.text = v; redraw(); } }),
          R.choice('Font', '', lk('font', 'sans'), [['sans', 'Clean'], ['display', 'Display'], ['mono', 'Code'], ['serif', 'Serif']]),
          R.choice('Line up', '', lk('align', 'left'), [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
          R.slider('Corners', '', lk('radius', 18), 0, 60, 1, (v) => v + ' px'),
          R.slider('Padding', '', lk('pad', 18), 0, 60, 1, (v) => v + ' px'),
          R.slider('Space between blocks', '', lk('gap', 6), 0, 40, 1, (v) => v + ' px'),
          R.slider('Width', '0 fits the content.', lk('w', 0), 0, 800, 10, (v) => (v ? v + ' px' : 'AUTO')),
          R.slider('Border', '', lk('border', 0), 0, 8, 1, (v) => (v ? v + ' px' : 'OFF')),
          R.color('Border colour', '', { get: () => L.borderColor || '#ffffff', set: (v) => { L.borderColor = v; redraw(); } }),
          R.slider('Glow', '', lk('glow', 0), 0, 60, 2, (v) => (v ? v + ' px' : 'OFF')),
          R.color('Glow colour', '', { get: () => L.glowColor || t.accent, set: (v) => { L.glowColor = v; redraw(); } }),
          heading('START FROM'),
          R.buttons('Templates', 'Replaces what is here.', Object.entries(SVW.TEMPLATES).map(([k, v]) => [v.name.toUpperCase(), () => {
            const n = clone(v); delete n.name; spec.look = n.look; spec.blocks = n.blocks; Object.keys(L).forEach((x) => delete L[x]); Object.assign(L, n.look); spec.look = L; editing = -1; re();
          }])),
        ];
      },
      onSave: (close) => A.ask({ tag: 'WIDGET CREATOR', title: 'NAME IT', label: 'Name', value: existing ? existing.name || '' : '', placeholder: 'My widget', button: 'NEXT', done: (name) => {
        const lib = C().widgets;
        let item = existing;
        if (item) Object.assign(item, { name: name.trim() || item.name, spec: clone(spec) });
        else lib.unshift(item = { id: newId(), name: name.trim() || 'Widget', spec: clone(spec) });
        spread(item);
        A.changed();
        audio.play('confirm');
        close();
        if (!existing) setTimeout(() => placeWidget(item, after), 150); else { toast(`${item.name} updated everywhere`); after && after(); }
      } }),
    });
    redraw();
    return s;
  }

  // Every copy of a widget (HOME and desktop) gets the new design.
  function spread(item) {
    for (const w of (A.cfg.home.widgets || [])) if (w.kind === 'custom' && w.specId === item.id) w.spec = clone(item.spec);
    for (const w of ((A.cfg.widgets || {}).items || [])) if (w.kind === 'custom' && w.specId === item.id) w.spec = clone(item.spec);
    SV.homeWidgets && SV.homeWidgets.render();
  }

  function placeWidget(item, after) {
    const toHome = () => {
      const list = A.cfg.home.widgets || (A.cfg.home.widgets = []);
      if (list.length >= 6) return toast('HOME has room for 6 widgets. Remove one first.', 'bad');
      list.push({ id: newId(), kind: 'custom', specId: item.id, spec: clone(item.spec) });
      SV.homeWidgets && SV.homeWidgets.render();
    };
    const toDesktop = () => {
      const W = A.cfg.widgets || (A.cfg.widgets = { items: [], locked: true });
      W.items.push({ id: newId(), kind: 'custom', specId: item.id, spec: clone(item.spec), enabled: true, style: 'bare', scale: 1, opacity: 1, x: Math.round(screen.availWidth - 420), y: 80 + W.items.length * 40 });
      W.locked = false;
    };
    A.openMenu('PUT IT ON', [
      { label: 'THE DESKTOP', sub: 'Drag it into place, then lock the widgets', run: () => { toDesktop(); A.changed(); toast('On your desktop — drag it, then lock the widgets in WIDGETS'); after && after(); } },
      { label: 'HOME', sub: 'Beside the shelf heading', run: () => { toHome(); A.changed(); after && after(); } },
      { label: 'BOTH', run: () => { toDesktop(); toHome(); A.changed(); after && after(); } },
      { label: 'NOWHERE YET', sub: 'Keep it in MY WIDGETS', run: () => after && after() },
    ]);
  }

  // A button's target: a game, a program, a site, or any HOME icon's target.
  function pickTarget(b, after) {
    A.openMenu('THE BUTTON OPENS', [
      { label: 'A GAME', run: () => A.openMenu('GAMES', A.cfg.games.map((g) => ({ label: g.name, run: () => { Object.assign(b, { kind: 'game', gameId: g.id, name: g.name, target: 'game:' + g.id }); after(); } }))) },
      { label: 'A PROGRAM', run: () => A.pick('exe').then((f) => { if (f.path) { Object.assign(b, { kind: 'app', name: f.title || f.name, target: f.path, process: f.process || '' }); after(); } }) },
      { label: 'A WEBSITE', run: () => A.ask({ tag: 'BUTTON', title: 'WEBSITE', label: 'Address', placeholder: 'https://…', done: (v) => { let u = v.trim(); if (!u) return; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u; Object.assign(b, { kind: 'url', name: u, target: u }); after(); } }) },
    ]);
  }

  // What a custom widget's button does, wherever it is drawn (HOME here; the desktop page sends the same messages).
  function press(b) {
    if (!b || !b.target) return toast('This button doesn\'t open anything yet. Edit the widget to choose.');
    if (b.kind === 'game') return A.launch ? A.launch(A.cfg.games.find((g) => g.id === b.gameId)) : host.send('launch', { id: b.gameId });
    host.send('openItem', { item: { kind: b.kind, target: b.target, name: b.name, process: b.process || '' } });
  }

  // ------------------------------------------------------------------ Settings → CREATOR

  function rows(rerender) {
    const c = C();
    return [
      heading('MAKE'),
      el('<div class="row-note">Design your own icons and widgets with a live preview. Icons are saved as pictures you can use anywhere; widgets go on HOME and the desktop, and editing one later updates every copy.</div>'),
      R.button('Icon creator', 'Shape, colours, a symbol, letters or a picture, border, glow and shadow.', 'NEW ICON', () => iconCreator(null, rerender)),
      R.button('Widget creator', 'A card of text, live values, bars, pictures and buttons.', 'NEW WIDGET', () => widgetCreator(null, rerender)),
      heading(`MY ICONS · ${c.icons.length}`),
      ...(c.icons.length ? c.icons.map((i) => {
        const r = R.buttons(i.name, '', [['USE', () => useIcon(i, rerender)], ['EDIT', () => iconCreator(i, rerender)], ['COPY', () => { const n = clone(i); n.id = newId(); n.name += ' copy'; c.icons.unshift(n); A.changed(); rerender(); }], ['REMOVE', () => { c.icons = c.icons.filter((x) => x !== i); A.changed(); rerender(); }, 'danger']]);
        r.querySelector('.row-l').prepend(el(`<img class="cr-thumb" src="${esc(i.url)}" alt="">`));
        return r;
      }) : [el('<div class="row-note">None yet.</div>')]),
      heading(`MY WIDGETS · ${c.widgets.length}`),
      ...(c.widgets.length ? c.widgets.map((w) => {
        const copies = (A.cfg.home.widgets || []).filter((x) => x.specId === w.id).length + ((A.cfg.widgets || {}).items || []).filter((x) => x.specId === w.id).length;
        return R.buttons(w.name, copies ? `${copies} in use` : 'Not placed', [['PLACE', () => placeWidget(w, rerender)], ['EDIT', () => widgetCreator(w, rerender)], ['REMOVE', () => {
          c.widgets = c.widgets.filter((x) => x !== w);
          A.cfg.home.widgets = (A.cfg.home.widgets || []).filter((x) => x.specId !== w.id);
          if (A.cfg.widgets) A.cfg.widgets.items = A.cfg.widgets.items.filter((x) => x.specId !== w.id);
          A.changed(); SV.homeWidgets && SV.homeWidgets.render(); rerender();
        }, 'danger']]);
      }) : [el('<div class="row-note">None yet.</div>')]),
    ];
  }

  SV.creator = { rows, iconCreator, widgetCreator, drawIcon, press, useIcon };
})();

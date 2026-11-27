// HOME ICONS: your own buttons placed anywhere on HOME, like desktop icons, and opening things like a NEXUS bar does:
// a game, any program, a Start menu or Store app, a website, or anything already on one of your bars.
//  - Edit mode (Settings → HOME ICONS → ARRANGE, or right-click an icon → ARRANGE): drag icons anywhere, with an
//    optional snap grid and guides; a toolbar adds icons and ends editing.
//  - Each icon has its own picture, name, size, shape, background, hover effect and click (single or double).
//  - Each icon shows on every screen or only on one, so every display can have its own layout.
//  - An icon can be put on the Windows desktop too, on any monitor, as a desktop widget you can drag around.
// The icons live in the look (cfg.home.icons), so every profile has its own set.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, toast, R, heading } = A;
  const newId = () => Math.random().toString(36).slice(2, 9);
  const SIZES = { s: 3.4, m: 4.6, l: 6, xl: 7.8 };
  const DEF = { size: 'm', shape: 'rounded', bg: 'glass', hover: 'magnify', label: true, labelStyle: 'shadow', click: 'single', snap: true, grid: 2, opacity: 1 };

  const H = () => {
    const h = A.cfg.home;
    h.icons = h.icons || [];
    h.iconStyle = { ...DEF, ...(h.iconStyle || {}) };
    return h;
  };
  let screens = [], here = '', editing = false;
  host.on('screens', (m) => { screens = m.screens || []; const c = screens.find((s) => s.current); if (c) here = c.name; render(); });

  const layer = el('<div id="hi"></div>');
  $('#home').append(layer);
  const bar = el(`<div id="hiBar"><b>${esc(A.T('ARRANGING HOME ICONS'))}</b><span>${esc(A.T('Drag them anywhere · right-click one for its options'))}</span>
    <button data-a="add">+ ${esc(A.T('ADD ICON'))}</button><button data-a="snap"></button><button data-a="done" class="primary">${esc(A.T('DONE'))}</button></div>`);
  document.body.append(bar);

  const shown = () => H().icons.filter((i) => !i.screen || !here || i.screen === here);
  const style = (i, k) => (i[k] !== undefined && i[k] !== '' ? i[k] : H().iconStyle[k]);

  function pic(i) {
    if (i.icon) return SV.media.html(i.icon, 'hi-img');
    if (i.kind === 'game') {
      const g = A.cfg.games.find((x) => x.id === i.gameId);
      const u = g && (A.artSrc(g, 'icon') || A.artSrc(g, 'cover'));
      if (u) return SV.media.html(u, 'hi-img');
    }
    return `<b>${esc((i.name || '?').slice(0, 1).toUpperCase())}</b>`;
  }

  // Icons play how they appear once, as HOME comes in; not on every redraw.
  function appear() {
    document.body.classList.remove('hi-appear');
    void document.body.offsetWidth;
    document.body.classList.add('hi-appear');
    setTimeout(() => document.body.classList.remove('hi-appear'), 1200);
  }
  host.on('mode', (m) => { if (m.mode === 'home') appear(); });
  host.on('init', () => setTimeout(appear, 120));

  function render() {
    if (!A.cfg) return;
    const h = H();
    layer.innerHTML = shown().map((i) => {
      const size = SIZES[style(i, 'size')] || SIZES.m;
      const own = [i.radius != null && i.radius !== '' ? `--r:${+i.radius}%` : '', i.color ? `--c:${i.color}` : '', i.textColor ? `--tc:${i.textColor}` : ''].filter(Boolean).join(';');
      const px = +i.px || 0;
      const own2 = `${i.thunder ? ` data-thunder="${esc(i.thunder)}"` : ''}${i.tilt ? ` data-tilt="${esc(i.tilt)}"` : ''}`;
      return `<button${own2} class="hi ${i.mono ? 'mono-item' : ''} ap-${esc(i.appear || H().iconStyle.appear || 'pop')} shape-${esc(style(i, 'shape'))} bg-${esc(i.color && style(i, 'bg') !== 'none' ? 'custom' : style(i, 'bg'))} hv-${esc(style(i, 'hover'))} lb-${esc(style(i, 'labelStyle'))} ${i.radius != null && i.radius !== '' ? 'own-r' : ''}" data-id="${esc(i.id)}"
        style="left:${(i.x * 100).toFixed(3)}%;top:${(i.y * 100).toFixed(3)}%;--s:${px ? px + 'px' : size + 'rem'};opacity:${+style(i, 'opacity') || 1};${esc(own)}" title="${esc(i.name || '')}">
        <span class="hi-pic">${pic(i)}</span>${style(i, 'label') ? `<span class="hi-name">${esc(i.name || '')}</span>` : ''}</button>`;
    }).join('');
    document.body.classList.toggle('hi-edit', editing);
    $('[data-a=snap]', bar).textContent = h.iconStyle.snap ? A.T('SNAP: ON') : A.T('SNAP: OFF');
    document.body.style.setProperty('--hi-grid', h.iconStyle.grid + '%');
  }

  // ---- opening

  function open(i) {
    audio.play('confirm');
    if (i.kind === 'game') {
      const g = A.cfg.games.find((x) => x.id === i.gameId);
      return g ? A.launch(g) : toast('That game is no longer on your shelf.', 'bad');
    }
    if (i.kind === 'home') return;
    host.send('openItem', { item: i });
  }

  // ---- dragging (edit mode)

  let drag = null;
  layer.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.hi');
    if (!b || e.button !== 0) return;
    if (!editing) return;
    e.preventDefault();
    const box = layer.getBoundingClientRect(), r = b.getBoundingClientRect();
    drag = { b, i: H().icons.find((x) => x.id === b.dataset.id), dx: e.clientX - r.left, dy: e.clientY - r.top, box, moved: false };
    b.setPointerCapture(e.pointerId);
    b.classList.add('dragging');
  });
  layer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { b, i, box } = drag, st = H().iconStyle;
    let x = (e.clientX - drag.dx - box.left) / box.width, y = (e.clientY - drag.dy - box.top) / box.height;
    if (st.snap) { const g = st.grid / 100; x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
    x = Math.max(0, Math.min(0.98, x)); y = Math.max(0, Math.min(0.96, y));
    b.style.left = (x * 100) + '%'; b.style.top = (y * 100) + '%';
    i.x = x; i.y = y; drag.moved = true;
  });
  // A drag never counts as a click: the click that follows letting go is swallowed.
  let justDragged = 0;
  const endDrag = () => { if (!drag) return; drag.b.classList.remove('dragging'); if (drag.moved) { A.save(); justDragged = performance.now(); } drag = null; };
  layer.addEventListener('pointerup', endDrag);
  layer.addEventListener('pointercancel', endDrag);

  layer.addEventListener('click', (e) => {
    const b = e.target.closest('.hi');
    if (!b || editing || A.stack.length || performance.now() - justDragged < 400) return;
    const i = H().icons.find((x) => x.id === b.dataset.id);
    if (i && style(i, 'click') === 'single') open(i);
  });
  layer.addEventListener('dblclick', (e) => {
    const b = e.target.closest('.hi');
    if (!b || editing || A.stack.length) return;
    const i = H().icons.find((x) => x.id === b.dataset.id);
    if (i && style(i, 'click') === 'double') open(i);
  });
  layer.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.hi');
    if (!b) return;
    e.preventDefault();
    const i = H().icons.find((x) => x.id === b.dataset.id);
    if (i) iconMenu(i);
  });
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a;
    if (a === 'add') addMenu(null, true);
    else if (a === 'snap') { H().iconStyle.snap = !H().iconStyle.snap; A.save(); audio.play('toggle'); render(); }
    else if (a === 'done') setEditing(false);
  });

  function setEditing(on) {
    editing = on;
    if (on) { while (A.stack.length) A.pop(); toast('Drag the icons anywhere. DONE at the bottom when finished.'); }
    else A.save();
    audio.play('toggle');
    render();
  }

  // ---- adding

  // Puts a new icon in the first free spot along the right edge (or at a given place).
  function place(item, at) {
    const used = shown();
    let x = 0.9, y = 0.12;
    if (at) ({ x, y } = at);
    else for (let n = 0; n < 60; n++) {
      x = 0.9 - Math.floor(n / 7) * 0.07; y = 0.14 + (n % 7) * 0.11;
      if (!used.some((u) => Math.abs(u.x - x) < 0.04 && Math.abs(u.y - y) < 0.06)) break;
    }
    const i = { id: newId(), x, y, screen: '', ...item };
    H().icons.push(i);
    A.changed();
    audio.play('pick');
    render();
    toast((i.name || 'Icon') + ' added to HOME' + (editing ? '' : ' · ARRANGE to move it'));
    return i;
  }

  let startMenu = null;
  host.on('startMenu', (m) => { startMenu = m.apps || []; if (waitingStart) { const f = waitingStart; waitingStart = null; f(); } });
  let waitingStart = null;

  function addMenu(after, fromEditor) {
    const done = () => { after && after(); };
    A.openMenu('ADD AN ICON TO HOME', [
      { label: 'A GAME', sub: 'One of your launcher games', run: () => A.openMenu('GAMES', A.cfg.games.map((g) => ({ label: g.name, run: () => { place({ kind: 'game', gameId: g.id, name: g.name }); done(); } }))) },
      { label: 'AN APP FROM THE START MENU', sub: 'Store apps too: Claude, ChatGPT…', run: () => {
        const show = () => A.openMenu('START MENU', (startMenu || []).map((s) => ({ label: s.name, run: () => { place({ kind: 'app', name: s.name, target: s.path, process: s.process || '', icon: s.icon || '' }); done(); } })));
        if (startMenu) return show();
        toast('Reading your Start menu…'); waitingStart = show; host.send('startMenu');
      } },
      { label: 'A PROGRAM', sub: 'Any .exe or shortcut', run: () => A.pick('exe').then((f) => { if (f.path) { place({ kind: 'app', name: f.title || f.name, target: f.path, process: f.process || '', icon: f.icon || '' }); done(); } }) },
      { label: 'A ROBLOX GAME', sub: 'By name like HYPERSHOT, or a game link', run: () => SV.roblox.askGameLink((it) => { place(it); done(); }) },
      { label: 'A WEBSITE', sub: 'Opens in your browser', run: () => A.ask({ tag: 'HOME ICON', title: 'WEBSITE', label: 'Address', placeholder: 'https://…', button: 'ADD', done: (v) => {
        let u = v.trim(); if (!u) return; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
        let hostName = u; try { hostName = new URL(u).hostname.replace(/^www\./, ''); } catch {}
        place({ kind: 'url', name: hostName, target: u, icon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostName)}&sz=128` }); done();
      } }) },
      { label: 'FROM A NEXUS BAR', sub: 'Copy something already on a bar', run: () => {
        const n = A.cfg.nexus, bars = [n, ...(n.bars || [])];
        const items = bars.flatMap((b) => (b.items || []).filter((x) => x.kind !== 'home').map((x) => ({ x, bar: b.name || 'Main bar' })));
        if (!items.length) return toast('Your bars are empty.', 'bad');
        A.openMenu('FROM A BAR', items.map(({ x, bar: name }) => ({ label: x.name, sub: name, run: () => { const { id, ...rest } = x; place({ ...rest }); done(); } })));
      } },
      ...(fromEditor ? [] : [{ label: 'ARRANGE THE ICONS', sub: 'Drag them where you want them', run: () => setEditing(true) }]),
    ]);
  }

  // ---- one icon's look, with sliders and colour pickers

  function iconEditor(i) {
    const root = el(`<div class="overlay"><div class="sheet narrow"><div class="sheet-head"><div><div class="tag">[ HOME ICON ]</div><h2></h2></div></div><div class="sheet-body"></div>
      <div class="hints">${A.hints([['confirm', 'Change'], ['adjust', 'Adjust'], ['back', 'Done']])}</div></div></div>`);
    const body = $('.sheet-body', root), p = A.panel(body), P = (k) => A.prop(i, k);
    const live = () => { A.changed(); render(); };
    const num = (k, fallback) => ({ get: () => (i[k] === undefined || i[k] === '' ? fallback : +i[k]), set: (v) => { i[k] = v; } });
    const build = (at = 0) => {
      $('h2', root).textContent = i.name || 'ICON';
      body.replaceChildren(
        A.heading('WHAT IT IS'),
        R.text('Name', '', P('name'), 'Name'),
        R.file('Picture', 'A picture, GIF or video. ← goes back to the automatic one.', P('icon'), 'media'),
        R.button('Design a picture', 'Make one in the icon creator, then choose this icon for it.', 'CREATE', () => SV.creator && SV.creator.iconCreator(null, () => build(p.idx))),
        A.heading('SIZE AND SHAPE'),
        R.slider('Size', 'Exact size of the button.', num('px', Math.round((SIZES[style(i, 'size')] || SIZES.m) * 16)), 24, 240, 2, (v) => v + ' px'),
        R.slider('Corners', '0 is square, 50 is a circle.', num('radius', 22), 0, 50, 1, (v) => v + '%'),
        R.choice('Background', '', P('bg'), [['', 'Same as the others'], ['glass', 'Dark glass'], ['solid', 'Solid'], ['accent', 'Accent colour'], ['none', 'None']], live),
        R.color('Background colour', 'Your own colour behind the picture.', { get: () => i.color || '#1a1414', set: (v) => { i.color = v; } }, live),
        R.button('No own background colour', '', 'CLEAR', () => { i.color = ''; live(); build(p.idx); }),
        A.heading('NAME'),
        R.toggle('Name under it', '', { get: () => !!style(i, 'label'), set: (v) => { i.label = v; } }, live),
        R.color('Name colour', '', { get: () => i.textColor || '#f5efee', set: (v) => { i.textColor = v; } }, live),
        R.choice('Name style', '', P('labelStyle'), [['', 'Same as the others'], ['shadow', 'Text with a shadow'], ['pill', 'On a dark pill'], ['accent', 'Accent colour']], live),
        A.heading('BEHAVIOUR'),
        R.choice('Mouse over it', '', P('hover'), [['', 'Same as the others'], ['magnify', 'Grows'], ['lift', 'Lifts'], ['glow', 'Glows'], ['spin', 'Tilts'], ['none', 'Nothing']], live),
        R.choice('Opens with', '', P('click'), [['', 'Same as the others'], ['single', 'One click'], ['double', 'Double-click']], live),
        A.heading('EFFECTS'),
        R.choice('Thunder on hover', 'Lightning that keeps crackling while the mouse is on it.', P('thunder'), [['', 'Same as the others'], ['on', 'On'], ['off', 'Off']], live),
        R.choice('3D on hover', 'It tilts towards the mouse.', P('tilt'), [['', 'Same as the others'], ['on', 'On'], ['off', 'Off']], live),
        R.choice('How it appears', 'When HOME comes in.', P('appear'), [['', 'Same as the others'], ['pop', 'Pops'], ['rise', 'Rises'], ['fade', 'Fades in'], ['spin', 'Spins in'], ['none', 'Just there']], live),
        R.toggle('Black and white', 'Only this icon.', { get: () => !!i.mono, set: (v) => { i.mono = v; } }, live),
        R.choice('Screen', 'Each screen can have its own icons.', P('screen'), [['', 'Every screen'], ...screens.map((s) => [s.name, s.label])], live),
        R.button('Put it on the Windows desktop too', 'As a desktop icon you can drag to any monitor, always there.', 'DESKTOP', () => toDesktop(i)),
        R.button('Remove it', '', 'REMOVE', () => { H().icons = H().icons.filter((x) => x !== i); A.changed(); render(); A.pop(); }, true),
      );
      p.focus(at);
    };
    // Sliders and pickers save as they move: redraw HOME behind the sheet as they do.
    root.addEventListener('input', () => setTimeout(render, 0));
    root.addEventListener('click', () => setTimeout(render, 0));
    root.addEventListener('pointerup', () => setTimeout(render, 0));
    build();
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    A.push({ el: root, action: p.action, onClose: () => { A.changed(); render(); } });
  }

  // ---- one icon's options

  const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  function iconMenu(i) {
    const r = () => { A.changed(); render(); };
    const on = (k, label, list, names) => ({ label: `${label}: ${(names || {})[style(i, k)] || String(style(i, k)).toUpperCase()}`, sub: i[k] === undefined || i[k] === '' ? 'Same as the others' : 'This icon only', run: () => { i[k] = cycle(list, style(i, k)); r(); iconMenu(i); } });
    const scr = screens.find((s) => s.name === i.screen);
    A.openMenu(i.name || 'ICON', [
      { label: 'OPEN', run: () => open(i) },
      { label: 'EDIT ITS LOOK', sub: 'Size, corners, colours, name', run: () => iconEditor(i) },
      ...(editing ? [] : [{ label: 'ARRANGE THE ICONS', sub: 'Drag them anywhere on HOME', run: () => setEditing(true) }]),
      { label: 'NAME', sub: i.name, run: () => A.ask({ tag: 'HOME ICON', title: 'NAME', label: 'Name', value: i.name || '', done: (v) => { i.name = v.trim(); r(); } }) },
      { label: 'PICTURE', sub: i.icon ? 'Your own · ← in the picker clears it' : 'Automatic', run: () => A.pick('media').then((f) => { if (f.url) { i.icon = f.url; r(); } }) },
      ...(i.icon ? [{ label: 'AUTOMATIC PICTURE', run: () => { i.icon = ''; r(); } }] : []),
      on('size', 'SIZE', ['s', 'm', 'l', 'xl'], { s: 'SMALL', m: 'MEDIUM', l: 'LARGE', xl: 'EXTRA LARGE' }),
      on('shape', 'SHAPE', ['rounded', 'circle', 'square', 'none'], { rounded: 'ROUNDED', circle: 'CIRCLE', square: 'SQUARE', none: 'JUST THE PICTURE' }),
      on('bg', 'BACKGROUND', ['glass', 'solid', 'accent', 'none'], { glass: 'DARK GLASS', solid: 'SOLID', accent: 'ACCENT', none: 'NONE' }),
      on('hover', 'MOUSE OVER', ['magnify', 'lift', 'glow', 'spin', 'none'], { magnify: 'GROWS', lift: 'LIFTS', glow: 'GLOWS', spin: 'TILTS', none: 'NOTHING' }),
      on('click', 'OPENS WITH', ['single', 'double'], { single: 'ONE CLICK', double: 'DOUBLE-CLICK' }),
      { label: `NAME UNDER IT: ${style(i, 'label') ? 'SHOWN' : 'HIDDEN'}`, run: () => { i.label = !style(i, 'label'); r(); iconMenu(i); } },
      { label: `SCREEN: ${i.screen ? (scr ? scr.label : 'ANOTHER SCREEN') : 'EVERY SCREEN'}`.toUpperCase(), sub: 'Each screen can have its own icons', run: () => A.openMenu('WHICH SCREEN', [
        { label: 'EVERY SCREEN', run: () => { i.screen = ''; r(); } },
        ...screens.map((s) => ({ label: s.label.toUpperCase(), sub: s.current ? 'The one HOME is on now' : '', run: () => { i.screen = s.name; r(); } })),
      ]) },
      { label: 'PUT IT ON THE WINDOWS DESKTOP TOO', sub: 'As a desktop widget you can drag to any monitor', run: () => toDesktop(i) },
      { label: 'DUPLICATE', run: () => { const { id, ...rest } = i; place({ ...rest }, { x: Math.min(0.95, i.x + 0.04), y: Math.min(0.94, i.y + 0.04) }); } },
      { label: 'REMOVE', danger: true, run: () => { H().icons = H().icons.filter((x) => x !== i); r(); } },
    ]);
  }

  function toDesktop(i) {
    const w = A.cfg.widgets || (A.cfg.widgets = { items: [], locked: true });
    const app = i.kind === 'game' ? { kind: 'game', gameId: i.gameId, name: i.name, icon: i.icon || '' } : { name: i.name, target: i.target, args: i.args || '', icon: i.icon || '' };
    w.items.push({ id: newId(), kind: 'icon', enabled: true, visibility: 'always', style: i.color ? 'custom' : 'none', bgColor: i.color || '', textColor: i.textColor || '', scale: 1, opacity: 1,
      iconSize: +i.px || 64, radius: Math.round((i.radius ?? 22) * ((+i.px || 64) / 100)), showName: !!style(i, 'label'), hover: 'glow', apps: [app], x: Math.round(screen.availWidth * 0.8), y: 80 + w.items.length * 40 });
    w.locked = false;
    A.changed();
    audio.play('pick');
    toast(`${i.name} is on your desktop. Drag it to any monitor, then lock it in Settings → WIDGETS.`);
  }

  // ---- Settings → HOME ICONS

  function rows(rerender) {
    const h = H(), st = h.iconStyle, P = (k) => A.prop(st, k);
    const after = () => { A.changed(); render(); };
    return [
      heading('YOUR ICONS ON HOME'),
      el(`<div class="row-note">${esc(A.T('Buttons you place anywhere on HOME, like desktop icons. They open games, programs, Store apps, websites, or anything on your NEXUS bars. Each profile has its own, and each screen can have its own layout.'))}</div>`),
      R.button('Arrange them', 'Drag icons anywhere on HOME. A toolbar adds more and finishes.', 'ARRANGE', () => setEditing(true)),
      R.button('Add an icon', `${h.icons.length} on HOME.`, 'ADD', () => addMenu(rerender)),
      heading('HOW THEY LOOK'),
      R.choice('Size', 'For every icon (each can have its own: right-click it).', P('size'), [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['xl', 'Extra large']], after),
      R.choice('Shape', '', P('shape'), [['rounded', 'Rounded'], ['circle', 'Circle'], ['square', 'Square'], ['none', 'Just the picture']], after),
      R.choice('Background', '', P('bg'), [['glass', 'Dark glass'], ['solid', 'Solid'], ['accent', 'Accent colour'], ['none', 'None']], after),
      R.choice('When the mouse is over one', '', P('hover'), [['magnify', 'Grows'], ['lift', 'Lifts'], ['glow', 'Glows'], ['spin', 'Tilts'], ['none', 'Nothing']], after),
      R.toggle('Names under the icons', '', P('label'), after),
      R.choice('Name style', '', P('labelStyle'), [['shadow', 'Text with a shadow'], ['pill', 'On a dark pill'], ['accent', 'Accent colour']], after),
      R.choice('Opens with', '', P('click'), [['single', 'One click'], ['double', 'Double-click']], after),
      R.slider('Opacity', '', P('opacity'), 0.3, 1, 0.05, (v) => Math.round(v * 100) + '%'),
      heading('ARRANGING'),
      R.toggle('Snap to a grid', 'Icons line up while you drag them.', P('snap'), after),
      R.slider('Grid size', '', P('grid'), 1, 6, 0.5, (v) => v + '% of the screen'),
      ...(h.icons.length ? [heading('ICONS · ' + h.icons.length), ...h.icons.map((i) => R.buttons(i.name || 'Icon', [
        { game: 'GAME', app: 'APP', url: 'WEBSITE' }[i.kind] || 'APP', i.screen ? (screens.find((s) => s.name === i.screen) || { label: 'one screen' }).label : 'every screen',
      ].join(' · '), [
        ['EDIT', () => iconEditor(i)],
        ['OPTIONS', () => iconMenu(i)],
        ['REMOVE', () => { h.icons = h.icons.filter((x) => x !== i); after(); rerender(); }, 'danger'],
      ]))] : []),
    ];
  }

  host.on('init', () => { setTimeout(render, 60); host.send('screens'); });
  host.on('mode', () => setTimeout(render, 0));
  SV.homeIcons = { rows, render, add: addMenu, arrange: () => setEditing(true) };
})();

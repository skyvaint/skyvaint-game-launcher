// Desktop widgets, Rainmeter style: a clock, a music player, a performance meter and a frame of app icons, drawn
// straight onto the desktop by the shell. This is their settings (Settings → WIDGETS); unlock them to drag them.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, toast, R, heading } = A;
  const W = () => A.cfg.widgets || (A.cfg.widgets = { items: [], locked: true });
  const newId = () => Math.random().toString(36).slice(2, 9);
  const KINDS = { clock: 'Clock', music: 'Music player', perf: 'Performance', apps: 'App grid', icon: 'Desktop icon', date: 'Date', note: 'Note', countdown: 'Countdown', custom: 'My widget' };
  let editing = null;

  host.on('widgetEdit', (m) => {
    const w = W().items.find((x) => x.id === m.id);
    if (m.op === 'moved' && w) { w.x = m.x; w.y = m.y; }
    else if (m.op === 'remove') W().items = W().items.filter((x) => x.id !== m.id);
    else if (m.op === 'lock') { W().locked = !W().locked; toast(W().locked ? 'Widgets locked' : 'Widgets unlocked — drag them anywhere'); }
    A.changed();
  });
  host.on('openWidgets', () => { while (A.stack.length) A.pop(); setTimeout(() => A.openSettings('widgets'), 250); });

  function add(kind, after, extra) {
    const n = W().items.filter((x) => x.kind === kind).length;
    const w = { id: newId(), kind, enabled: true, visibility: kind === 'icon' ? 'always' : 'desktop', style: kind === 'icon' ? 'none' : 'glass', scale: 1, opacity: kind === 'icon' ? 1 : 0.92, clock24: A.cfg.behavior.clock24 !== false, apps: [],
      radius: 16, iconSize: 64, showName: true, hover: 'glow', bgColor: '', textColor: '', ...(extra || {}),
      x: Math.round(screen.availWidth - 420), y: 60 + W().items.length * 170 + n * 10 };
    W().items.push(w);
    editing = w.id;
    if (kind === 'icon' && !w.apps.length) { W().locked = false; A.changed(); return addApp(w, () => { toast('Drag it to any screen, then lock the widgets.'); after && after(); }); }
    if (kind === 'note' && !w.text) return A.ask({ tag: 'DESKTOP NOTE', title: 'NOTE', label: 'Text', placeholder: 'Ranked tonight', button: 'ADD', done: (v) => { w.text = v.trim(); A.changed(); after && after(); } });
    if (kind === 'countdown' && !w.date) return A.ask({ tag: 'COUNTDOWN', title: 'WHAT IS IT?', label: 'Name', placeholder: 'GTA 6', button: 'NEXT', done: (l) => { w.label = l.trim(); setTimeout(() => A.ask({ tag: 'COUNTDOWN', title: 'WHEN', label: 'Date (YYYY-MM-DD)', placeholder: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), button: 'ADD', done: (d) => { w.date = d.trim(); A.changed(); after && after(); } }), 80); } });
    A.changed();
    audio.play('pick');
    toast(`${KINDS[kind]} added to your desktop`);
    after && after();
  }

  function addApp(w, after) {
    A.openMenu('ADD TO THE GRID', [
      { label: 'A PROGRAM', sub: 'Any .exe or shortcut', run: () => A.pick('exe').then((f) => { if (f.path) { w.apps.push({ name: f.title || f.name, target: f.path, icon: f.icon || '' }); A.changed(); after(); } }) },
      { label: 'A GAME', sub: 'One of your launcher games', run: () => A.openMenu('GAMES', A.cfg.games.map((g) => ({ label: g.name, run: () => { w.apps.push({ kind: 'game', gameId: g.id, name: g.name, icon: A.artSrc(g, 'icon') || A.artSrc(g, 'cover') }); A.changed(); after(); } }))) },
      { label: 'A ROBLOX GAME', sub: 'By name, or a game link', run: () => SV.roblox.askGameLink((it) => { w.apps.push(it); A.changed(); after(); }) },
      { label: 'A WEBSITE', run: () => A.ask({ tag: 'WIDGET', title: 'WEBSITE', label: 'Address', placeholder: 'https://…', done: (v) => { let u = v.trim(); if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u; let h = ''; try { h = new URL(u).hostname; } catch { return; } w.apps.push({ name: h.replace(/^www\./, ''), target: u, icon: `https://www.google.com/s2/favicons?domain=${h}&sz=128` }); A.changed(); after(); } }) },
      { label: 'EVERYTHING ON MY MAIN NEXUS BAR', run: () => { for (const it of A.cfg.nexus.items || []) if (it.kind !== 'home') w.apps.push({ ...it }); A.changed(); after(); } },
    ]);
  }

  function rows(rerender) {
    const items = W().items, w = items.find((x) => x.id === editing) || items[0];
    if (w) editing = w.id;
    const P = (k) => A.prop(w, k);
    return [
      heading('ON YOUR DESKTOP'),
      el('<div class="row-note">Small panels on your desktop, like Rainmeter. Unlock them to drag them into place, then lock them again. Right-click a widget for its menu.</div>'),
      R.toggle('Locked', 'Unlock to move the widgets with the mouse.', A.at('widgets.locked')),
      R.buttons('Add a desktop icon or card', 'An app, game or site as an icon, or a date, note or countdown card.', [['ICON', () => add('icon', rerender)], ['DATE', () => add('date', rerender)], ['NOTE', () => add('note', rerender)], ['COUNTDOWN', () => add('countdown', rerender)]]),
      R.buttons('Add a widget', '', [['CLOCK', () => add('clock', rerender)], ['MUSIC', () => add('music', rerender)], ['PERFORMANCE', () => add('perf', rerender)], ['APP GRID', () => add('apps', rerender)]]),
      ...items.map((x) => {
        const r = R.buttons(KINDS[x.kind] + (x.id === editing ? '   ◀ EDITING' : ''), `${x.enabled === false ? 'OFF' : 'ON'} · ${x.visibility === 'desktop' ? 'DESKTOP ONLY' : 'ALWAYS'}${x.kind === 'apps' ? ' · ' + x.apps.length + ' APPS' : ''}`, [
          ['EDIT', () => { editing = x.id; rerender(); }],
          ['REMOVE', () => { W().items = W().items.filter((y) => y !== x); A.changed(); rerender(); }, 'danger'],
        ]);
        if (x.id === editing) r.classList.add('editing');
        return r;
      }),
      ...(w ? [
        heading('EDITING · ' + KINDS[w.kind].toUpperCase()),
        R.toggle('Show it', '', P('enabled')),
        R.choice('When it shows', '', P('visibility'), [['desktop', 'Only on the desktop'], ['always', 'Always (under your windows)'], ['notfull', 'Except over fullscreen games']]),
        R.choice('Background', '', P('style'), [['glass', 'Dark glass'], ['accent', 'Accent colour'], ['custom', 'My colour (below)'], ['none', 'None — just the content']]),
        R.color('Background colour', 'Used when Background is "My colour".', { get: () => w.bgColor || '#1a1414', set: (v) => { w.bgColor = v; if (w.style !== 'custom') w.style = 'custom'; } }),
        R.color('Text colour', '', { get: () => w.textColor || '#f5efee', set: (v) => { w.textColor = v; } }),
        R.slider('Corners', 'How round the corners are.', P('radius'), 0, 80, 1, (v) => (v ? v + ' px' : 'square')),
        R.slider('Size', '', P('scale'), 0.5, 2.5, 0.05, (v) => Math.round(v * 100) + '%'),
        R.slider('Opacity', '', P('opacity'), 0.2, 1, 0.05, (v) => Math.round(v * 100) + '%'),
        ...(w.kind === 'icon' ? [
          R.slider('Icon size', '', P('iconSize'), 24, 256, 2, (v) => v + ' px'),
          R.toggle('Name under it', '', P('showName')),
          R.choice('Mouse over it', '', P('hover'), [['glow', 'Glows'], ['lift', 'Lifts'], ['grow', 'Grows'], ['none', 'Nothing']]),
          R.button('What it opens', w.apps[0] ? w.apps[0].name : 'Nothing yet', 'CHANGE', () => { w.apps = []; addApp(w, rerender); }),
          R.button('Picture', w.apps[0] && w.apps[0].icon ? 'Set' : 'Automatic', 'CHANGE', () => A.pick('image').then((f) => { if (f.url && w.apps[0]) { w.apps[0].icon = f.url; A.changed(); rerender(); } })),
        ] : []),
        ...(w.kind === 'note' ? [R.text('Text', '', P('text'), 'Your note'), R.text('Small line', '', P('label'), 'NOTE')] : []),
        ...(w.kind === 'countdown' ? [R.text('Name', '', P('label'), 'GTA 6'), R.text('Date', 'YYYY-MM-DD', P('date'), '2026-12-25')] : []),
        ...(w.kind === 'clock' ? [R.toggle('24-hour', '', P('clock24'))] : []),
        ...(w.kind === 'apps' ? [
          R.button('Add to the grid', `${w.apps.length} apps.`, 'ADD', () => addApp(w, rerender)),
          R.toggle('Names under the icons', '', P('showName')),
          R.slider('Columns', '', { get: () => w.cols || 6, set: (v) => { w.cols = v; } }, 1, 12, 1, (v) => String(v)),
          R.slider('Spacing', 'Space between the icons.', { get: () => w.gap || 0, set: (v) => { w.gap = v; } }, 0, 80, 2, (v) => v + ' px'),
          R.slider('Icon size', '', { get: () => w.gridIcon || 44, set: (v) => { w.gridIcon = v; } }, 20, 160, 2, (v) => v + ' px'),
          ...w.apps.map((a, i) => R.buttons(a.name, a.target || (a.kind === 'game' ? 'GAME' : ''), [
            ['◀', () => { if (i > 0) { [w.apps[i - 1], w.apps[i]] = [w.apps[i], w.apps[i - 1]]; A.changed(); rerender(); } }, 'ghost'],
            ['▶', () => { if (i < w.apps.length - 1) { [w.apps[i + 1], w.apps[i]] = [w.apps[i], w.apps[i + 1]]; A.changed(); rerender(); } }, 'ghost'],
            ['ICON', () => A.pick('image').then((f) => { if (f.url) { a.icon = f.url; A.changed(); rerender(); } })],
            [a.sound ? 'SOUND ✓' : 'SOUND', () => A.pick('audio').then((f) => { if (f.url) { a.sound = f.url; A.changed(); rerender(); } })],
            ['REMOVE', () => { w.apps.splice(i, 1); A.changed(); rerender(); }, 'danger'],
          ])),
        ] : []),
        R.button('Put it back on screen', 'If it ended up somewhere you can’t reach.', 'RESET', () => { delete w.x; delete w.y; A.changed(); rerender(); }),
      ] : []),
    ];
  }

  SV.widgets = { rows, add, addApp };
})();

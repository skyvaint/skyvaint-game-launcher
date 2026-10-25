// NEXUS: the desktop bar. This is where it is set up — which apps, games and sites sit on it, where it docks and
// how it behaves. The bar itself is its own little window (dock.html), drawn by the shell.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, toast, hints, R, heading } = A;
  const nx = () => A.cfg.nexus;
  const newId = () => Math.random().toString(36).slice(2, 9);
  let startMenu = null, startWaiter = null, refresh = null;

  host.on('startMenu', (m) => { startMenu = m.apps || []; if (startWaiter) { const w = startWaiter; startWaiter = null; w(); } });
  host.on('openNexus', (m) => { editing = m.bar || 'main'; while (A.stack.length) A.pop(); setTimeout(open, 250); });
  host.on('nexusEdit', (m) => {
    const items = barOf(m.bar || 'main').items || [], i = items.findIndex((x) => x.id === m.id);
    if (i < 0) return;
    if (m.op === 'remove') { const [gone] = items.splice(i, 1); toast(gone.name + ' removed from the bar'); }
    else if (m.op === 'move') { const j = i + (m.d > 0 ? 1 : -1); if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]]; }
    A.changed();
    refresh && refresh();
  });

  // Adds to the bar being edited (the main bar when nothing else is open).
  function add(item) {
    const bar = cur(), items = bar.items || (bar.items = []);
    if (items.some((x) => (x.kind === 'game' ? x.gameId === item.gameId : x.target === item.target))) return toast(item.name + ' is already on the bar');
    items.push({ id: newId(), ...item });
    if (!bar.enabled) { bar.enabled = true; toast(nameOf(bar) + ' switched on'); }
    audio.play('pick');
    A.changed();
    toast(item.name + ' added to the bar');
    refresh && refresh();
  }

  const gameIcon = (g) => A.artSrc(g, 'icon') || A.artSrc(g, 'cover');
  const addGame = (g) => { if (!A.stack.length) editing = 'main'; add({ kind: 'game', gameId: g.id, name: g.name, icon: gameIcon(g) }); };

  // First run (and "Fill with my apps"): the launcher itself, your main games, the apps you use with them and the site.
  // Your five most recently played installed games (or the first five on the shelf when nothing has been played).
  const seedGames = () => A.cfg.games.filter((g) => A.isInstalled(g))
    .map((g, i) => [g, (A.stats[g.id] || {}).lastPlayed || 0, i]).sort((x, y) => y[1] - x[1] || x[2] - y[2]).slice(0, 5).map((x) => x[0]);
  // Fills the bar being edited (the main bar on first run).
  function seed(apps) {
    const bar = seedInto || nx(), items = bar.items || (bar.items = []), has = (fn) => items.some(fn);
    seedInto = null;
    let n = 0;
    const push = (item) => { items.push({ id: newId(), ...item }); n++; };
    if (!has((x) => x.kind === 'home')) { items.unshift({ id: newId(), kind: 'home', name: 'Skyvaint', icon: '' }); n++; }
    for (const g of seedGames()) if (!has((x) => x.kind === 'game' && x.gameId === g.id)) push({ kind: 'game', gameId: g.id, name: g.name, icon: gameIcon(g) });
    for (const a of apps) if (!has((x) => x.target && x.target.toLowerCase() === a.target.toLowerCase())) push({ kind: 'app', name: a.name, target: a.target, args: a.args || '', process: a.process || '', icon: a.icon || '' });
    if (!has((x) => x.kind === 'url' && /skyvaint\.com/i.test(x.target)))
      push({ kind: 'url', name: 'skyvaint.com', target: 'https://skyvaint.com', icon: 'https://www.google.com/s2/favicons?domain=skyvaint.com&sz=128' });
    bar.enabled = true;
    nx().seeded = true;
    A.changed();
    if (n && seedAsked) toast(`${n} added to ${bar.name || 'the bar'}`); else if (seedAsked) toast('Everything is already on this bar');
    seedAsked = false;
    refresh && refresh();
  }
  let seedAsked = false, seedInto = null;
  const askSeed = (manual) => { seedAsked = manual; seedInto = manual ? cur() : null; host.send('nexusSeed'); };
  host.on('nexusSeed', (m) => seed(m.apps || []));

  host.on('init', () => {
    if (!nx().seeded) askSeed(false);
    // Game logos follow the game's artwork unless you picked one for the bar.
    let fixed = false;
    for (const it of allBars().flatMap((b) => b.items || [])) {
      if (it.kind !== 'game' || it.customIcon) continue;
      const g = A.cfg.games.find((x) => x.id === it.gameId);
      const icon = g ? gameIcon(g) : '';
      if (icon && icon !== it.icon) { it.icon = icon; fixed = true; }
    }
    if (fixed) A.changed();
  });

  function addApp() {
    A.pick('exe').then((f) => {
      if (!f.path) return;
      add({ kind: 'app', name: f.title || f.name, target: f.path, process: f.process || '', icon: f.icon || '' });
    });
  }

  function addSite() {
    A.ask({
      tag: 'NEXUS', title: 'ADD A WEBSITE', label: 'Web address', placeholder: 'https://skyvaint.com', button: 'ADD',
      desc: 'Opens in your normal browser.',
      done: (input) => {
        let url = input.trim();
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
        let host = '';
        try { host = new URL(url).hostname; } catch { return toast("That isn't a web address.", 'bad'); }
        add({ kind: 'url', name: host.replace(/^www\./, ''), target: url, icon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` });
      },
    });
  }

  function addFromStart() {
    const show = () => {
      if (!startMenu.length) return toast('No Start menu apps were found.', 'bad');
      A.openMenu('ADD FROM START MENU', startMenu.map((a) => ({
        label: a.name, sub: a.process ? a.process + '.exe' : '',
        run: () => add({ kind: 'app', name: a.name, target: a.path, process: a.process || '', icon: a.icon || '' }),
      })), 'Everything in your Start menu and on your desktop.');
    };
    if (startMenu) return show();
    toast('Reading your Start menu…');
    startWaiter = show;
    host.send('startMenu');
  }

  function addGameMenu() {
    A.openMenu('ADD A GAME', A.cfg.games.map((g) => ({ label: g.name, sub: g.platform ? g.platform.toUpperCase() : '', run: () => addGame(g) })));
  }

  // ---------------------------------------------------------------- several bars
  // The main bar is cfg.nexus itself; extra bars live in cfg.nexus.bars, each with its own items and settings.
  const BAR_DEFAULTS = { enabled: true, position: 'bottom', size: 52, backing: 'glass', names: true, autohide: false, magnify: true, hideFullscreen: true,
    align: 'center', gap: 12, radius: 22, offset: 0, idleOpacity: 100, opacity: 47, magnifyAmount: 145, glow: 100, indicator: 'dot', bounce: true, alwaysNames: false,
    tagStyle: 'dark', visibility: 'always', fadeStyle: 'fade', fadeMs: 220, length: 0, hoverStyle: 'magnify', clickMode: 'single', launchMode: 'normal' };
  const PRESETS = {
    desktop: { name: 'Desktop dock', visibility: 'desktop', position: 'bottom', length: 55, backing: 'glass', size: 60, hoverStyle: 'magnify' },
    side: { name: 'Side bar', visibility: 'always', position: 'left', backing: 'pill', size: 44, hoverStyle: 'lift', autohide: true },
    top: { name: 'Top strip', visibility: 'always', position: 'top', length: 100, backing: 'square', size: 36, hoverStyle: 'scale', alwaysNames: false },
    blank: { name: 'New bar' },
  };
  let editing = 'main';
  const extras = () => nx().bars || (nx().bars = []);
  const allBars = () => [nx(), ...extras()];
  const barOf = (id) => (id === 'main' ? nx() : extras().find((b) => b.id === id)) || nx();
  const cur = () => barOf(editing);
  const nameOf = (b) => b.name || (b === nx() ? 'Main bar' : 'Bar');
  const idOf = (b) => (b === nx() ? 'main' : b.id);

  function addBar(kind, after) {
    const b = { ...BAR_DEFAULTS, ...PRESETS[kind], id: newId(), items: [] };
    // A new bar starts with the launcher's logo so it isn't empty.
    b.items.push({ id: newId(), kind: 'home', name: 'Skyvaint', icon: '' });
    extras().push(b);
    editing = b.id;
    A.changed();
    audio.play('pick');
    toast(`${b.name} added — pick what goes on it below`);
    after && after(0);
  }
  function removeBar(b, after) {
    A.confirmMenu(`Remove ${nameOf(b)}?`, 'REMOVE', () => {
      nx().bars = extras().filter((x) => x !== b);
      editing = 'main';
      A.changed();
      after && after(0);
    });
  }

  function rows(rerender) {
    refresh = rerender;
    const b = cur(), items = b.items || (b.items = []);
    for (const [k, v] of Object.entries(BAR_DEFAULTS)) if (b[k] === undefined && k !== 'enabled') b[k] = v;
    const P = (k) => A.prop(b, k);
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; audio.play('nav'); A.changed(); rerender(); };
    const bars = allBars();
    return [
      heading(`BARS · ${bars.length}`),
      ...bars.map((x) => {
        const r = R.buttons(nameOf(x) + (idOf(x) === editing ? '   ◀ EDITING' : ''),
          `${x.enabled ? 'ON' : 'OFF'} · ${(x.position || 'bottom').toUpperCase()} · ${(x.items || []).length} ITEMS · ${x.visibility === 'desktop' ? 'DESKTOP ONLY' : 'ALWAYS'}`, [
            ['EDIT', () => { editing = idOf(x); audio.play('confirm'); rerender(0); }],
            ['RENAME', () => A.ask({ tag: 'NEXUS', title: 'RENAME BAR', label: 'Name', value: nameOf(x), done: (v) => { x.name = v; A.changed(); rerender(); } })],
            ...(x === nx() ? [] : [['REMOVE', () => removeBar(x, rerender), 'danger']]),
          ]);
        if (idOf(x) === editing) r.classList.add('editing');
        return r;
      }),
      R.buttons('Add a bar', 'Each bar has its own apps and its own look. A desktop dock only shows on the desktop.', [
        ['DESKTOP DOCK', () => addBar('desktop', rerender)], ['SIDE BAR', () => addBar('side', rerender)], ['TOP STRIP', () => addBar('top', rerender)], ['EMPTY', () => addBar('blank', rerender)],
      ]),

      heading(`EDITING · ${nameOf(b).toUpperCase()}`),
      R.toggle('Show this bar', '', P('enabled')),
      R.choice('When it shows', 'Desktop only hides the bar as soon as any window is in front, and brings it back on the desktop.', P('visibility'), [['always', 'Always'], ['desktop', 'Only on the desktop']]),
      R.toggle('Step aside for fullscreen', 'Hides while a game or video covers the whole screen.', P('hideFullscreen')),
      R.toggle('Auto-hide', 'Tucks away until the pointer reaches that edge.', P('autohide')),
      R.choice('Position', 'Which screen edge it sits on.', P('position'), [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right']]),
      R.choice('Alignment', 'Where along the edge the bar sits.', P('align'), [['center', 'Centre'], ['start', 'Start (left / top)'], ['end', 'End (right / bottom)']]),
      R.slider('Bar length', '0 fits the icons; higher stretches the bar along the edge.', P('length'), 0, 100, 5, (v) => (v ? v + '% of the edge' : 'FIT')),
      R.slider('Distance from the edge', '', P('offset'), 0, 120, 4, (v) => v + ' px'),
      heading('FADE IN AND OUT'),
      R.choice('Appear / hide', 'How the bar comes and goes (opening, desktop-only, fullscreen games).', P('fadeStyle'), [['fade', 'Fade'], ['slide', 'Slide'], ['both', 'Fade and slide'], ['none', 'Instant']]),
      R.slider('Fade time', '', P('fadeMs'), 0, 1500, 50, (v) => v + ' ms'),
      heading('ICONS'),
      R.slider('Icon size', '', P('size'), 32, 96, 4, (v) => v + ' px'),
      R.slider('Spacing', 'Room between the icons.', P('gap'), 0, 48, 2, (v) => v + ' px'),
      R.slider('Corner roundness', '0 is square, 50 is a circle. Logos with their own transparency keep their shape.', P('radius'), 0, 50, 2, (v) => v + '%'),
      R.slider('Idle icon brightness', 'Dims apps that are not running so the running ones stand out.', P('idleOpacity'), 20, 100, 5, (v) => v + '%'),
      heading('BACKING'),
      R.choice('Backing', 'What sits behind the logos.', P('backing'), [['none', 'None — just logos'], ['glass', 'Dark glass'], ['pill', 'Pill'], ['square', 'Square strip'], ['accent', 'Accent colour'], ['gradient', 'Accent gradient'], ['light', 'Light'], ['outline', 'Outline only']]),
      R.slider('Backing opacity', '', P('opacity'), 0, 100, 5, (v) => v + '%'),
      heading('HOVER'),
      R.choice('Hover effect', 'What happens under the pointer.', P('hoverStyle'), [['magnify', 'Magnify (neighbours grow too)'], ['scale', 'Grow just that icon'], ['lift', 'Lift up'], ['glow', 'Glow only'], ['none', 'Nothing']]),
      R.slider('Grow amount', 'For Magnify and Grow.', P('magnifyAmount'), 110, 220, 5, (v) => (v / 100).toFixed(2) + '×'),
      R.slider('Hover glow', 'The light behind the icon under the pointer.', P('glow'), 0, 250, 10, (v) => v + '%'),
      R.toggle('Names on hover', 'A small name tag over the logo under the pointer.', P('names')),
      R.toggle('Names under every icon', 'Always show the names (top and bottom bars).', P('alwaysNames')),
      R.choice('Name tag style', '', P('tagStyle'), [['dark', 'Dark'], ['accent', 'Accent'], ['light', 'Light']]),
      heading('CLICKING AND LAUNCHING'),
      R.choice('Open with', '', P('clickMode'), [['single', 'One click'], ['double', 'Double-click']]),
      R.choice('Launch mode', 'How apps open from this bar. "Bring forward" switches to the app if it is already open instead of starting another.', P('launchMode'),
        [['normal', 'Normal window'], ['maximized', 'Maximized'], ['minimized', 'Minimized'], ['focus', 'Bring forward if open']]),
      R.choice('Running indicator', 'How a running app is marked.', P('indicator'), [['dot', 'Dot'], ['bar', 'Bar'], ['glow', 'Glow'], ['none', 'None']]),
      R.toggle('Bounce on click', '', P('bounce')),

      heading(`ON ${nameOf(b).toUpperCase()} · ${items.length}`),
      ...(items.length ? [] : [el('<div class="row-note">Nothing yet. Add apps below.</div>')]),
      ...items.map((it, i) => R.buttons(it.name, `${{ game: 'GAME', url: 'WEBSITE', home: 'LAUNCHER · opens HOME' }[it.kind] || 'APP'}${it.target ? ' · ' + it.target : ''}${it.launchMode && it.launchMode !== 'bar' ? ' · OPENS ' + it.launchMode.toUpperCase() : ''}   ← → reorders`, [
        ['▲', () => move(i, -1), 'ghost'], ['▼', () => move(i, 1), 'ghost'],
        ['ICON', () => A.pick('image').then((f) => { if (f.url) { it.icon = f.url; it.customIcon = true; A.changed(); rerender(); } })],
        ...(it.kind === 'app' ? [['OPENS', () => A.openMenu(it.name, [['bar', 'Like the bar'], ['normal', 'Normal window'], ['maximized', 'Maximized'], ['minimized', 'Minimized'], ['focus', 'Bring forward if open']]
          .map(([k, label]) => ({ label, sub: (it.launchMode || 'bar') === k ? 'current' : '', run: () => { it.launchMode = k; A.changed(); rerender(); } })))]] : []),
        ...(bars.length > 1 ? [['MOVE TO…', () => A.openMenu('MOVE TO WHICH BAR?', bars.filter((x) => x !== b).map((x) => ({ label: nameOf(x), run: () => { items.splice(i, 1); (x.items || (x.items = [])).push(it); A.changed(); rerender(); } })))]] : []),
        ['REMOVE', () => { items.splice(i, 1); A.changed(); rerender(); }, 'danger'],
      ], { adjust: (d) => move(i, d) })),
      heading('ADD TO THIS BAR'),
      R.button('Add from Start menu', 'Pick any installed app.', 'BROWSE', addFromStart),
      R.button('Add a program', 'Any .exe or shortcut on this PC.', 'PICK FILE', addApp),
      R.button('Add a game', 'One of your launcher games.', 'PICK GAME', addGameMenu),
      R.button('Add a website', 'Opens in your browser.', 'ADD URL', addSite),
      R.button('Add the launcher', 'A logo that opens HOME. Uses your app icon.', 'ADD', () => add({ kind: 'home', name: 'Skyvaint', icon: '', target: '' })),
      R.button('Fill with my apps', 'Your most played games, plus Epic, Steam, Discord, Medal and Bloxstrap if they are on this PC — whatever is missing from this bar.', 'FILL', () => askSeed(true)),
    ];
  }

  function open() {
    const root = el(`
      <div class="overlay"><div class="sheet">
        <div class="sheet-head"><div><div class="tag">[ DESKTOP BARS ]</div><h2>NEXUS</h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Change'], ['adjust', 'Adjust'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), p = A.panel(body);
    const build = (i) => { if (!root.isConnected && i !== 'first') return; body.replaceChildren(...rows((k) => build(k))); p.focus(typeof i === 'number' ? i : p.idx); };
    build('first');
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    A.push({ el: root, action: p.action, onClose: () => { refresh = null; } });
  }

  SV.nexus = { open, rows, addGame };
})();

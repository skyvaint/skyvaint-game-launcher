// NEXUS: the desktop bar. This is where it is set up — which apps, games and sites sit on it, where it docks and
// how it behaves. The bar itself is its own little window (dock.html), drawn by the shell.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, toast, hints, R, heading } = A;
  const nx = () => A.cfg.nexus;
  const newId = () => Math.random().toString(36).slice(2, 9);
  let startMenu = null, startWaiter = null, refresh = null;

  host.on('startMenu', (m) => { startMenu = m.apps || []; if (startWaiter) { const w = startWaiter; startWaiter = null; w(); } });
  host.on('openNexus', () => { while (A.stack.length) A.pop(); setTimeout(open, 250); });
  host.on('nexusEdit', (m) => {
    const items = nx().items, i = items.findIndex((x) => x.id === m.id);
    if (i < 0) return;
    if (m.op === 'remove') { const [gone] = items.splice(i, 1); toast(gone.name + ' removed from the bar'); }
    else if (m.op === 'move') { const j = i + (m.d > 0 ? 1 : -1); if (j >= 0 && j < items.length) [items[i], items[j]] = [items[j], items[i]]; }
    A.changed();
    refresh && refresh();
  });

  function add(item) {
    const items = nx().items;
    if (items.some((x) => (x.kind === 'game' ? x.gameId === item.gameId : x.target === item.target))) return toast(item.name + ' is already on the bar');
    items.push({ id: newId(), ...item });
    if (!nx().enabled) { nx().enabled = true; toast('NEXUS bar switched on'); }
    audio.play('pick');
    A.changed();
    toast(item.name + ' added to the bar');
    refresh && refresh();
  }

  const gameIcon = (g) => A.artSrc(g, 'icon') || A.artSrc(g, 'cover');
  const addGame = (g) => add({ kind: 'game', gameId: g.id, name: g.name, icon: gameIcon(g) });

  // First run (and "Fill with my apps"): the launcher itself, your main games, the apps you use with them and the site.
  const SEED_GAMES = [['fortnite', /^fortnite$/i], ['rocketleague', /^rocket league$/i], ['rematch', /^rematch$/i], ['roblox_player', /^roblox$/i], ['roblox_studio', /^roblox studio$/i]];
  function seed(apps) {
    const items = nx().items, has = (fn) => items.some(fn);
    let n = 0;
    const push = (item) => { items.push({ id: newId(), ...item }); n++; };
    if (!has((x) => x.kind === 'home')) { items.unshift({ id: newId(), kind: 'home', name: 'Skyvaint', icon: '' }); n++; }
    for (const [id, name] of SEED_GAMES) {
      const g = A.cfg.games.find((x) => x.id === id) || A.cfg.games.find((x) => name.test(x.name));
      if (g && !has((x) => x.kind === 'game' && x.gameId === g.id)) push({ kind: 'game', gameId: g.id, name: g.name, icon: gameIcon(g) });
    }
    for (const a of apps) if (!has((x) => x.target && x.target.toLowerCase() === a.target.toLowerCase())) push({ kind: 'app', name: a.name, target: a.target, args: a.args || '', process: a.process || '', icon: a.icon || '' });
    if (!has((x) => x.kind === 'url' && /skyvaint\.com/i.test(x.target)))
      push({ kind: 'url', name: 'skyvaint.com', target: 'https://skyvaint.com', icon: 'https://www.google.com/s2/favicons?domain=skyvaint.com&sz=128' });
    nx().enabled = true;
    nx().seeded = true;
    A.changed();
    if (n && seedAsked) toast(`${n} added to the NEXUS bar`);
    seedAsked = false;
    refresh && refresh();
  }
  let seedAsked = false;
  const askSeed = (manual) => { seedAsked = manual; host.send('nexusSeed'); };
  host.on('nexusSeed', (m) => seed(m.apps || []));

  host.on('init', () => {
    if (!nx().seeded) askSeed(false);
    // Game logos follow the game's artwork unless you picked one for the bar.
    let fixed = false;
    for (const it of nx().items) {
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

  function rows(rerender) {
    refresh = rerender;
    const items = nx().items;
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; audio.play('nav'); A.changed(); rerender(); };
    return [
      heading('NEXUS DESKTOP BAR'),
      R.toggle('Show the bar', 'A dock of your apps, games and sites on the edge of the screen.', A.at('nexus.enabled')),
      R.choice('Position', 'Which screen edge it sits on.', A.at('nexus.position'), [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right']]),
      R.slider('Icon size', '', A.at('nexus.size'), 32, 96, 4, (v) => v + ' px'),
      R.choice('Backing', 'Nothing behind the logos, or a faint glass strip.', A.at('nexus.backing'), [['none', 'None — just logos'], ['glass', 'Glass']]),
      R.toggle('Names on hover', 'A small name tag over the logo under the pointer.', A.at('nexus.names')),
      R.toggle('Auto-hide', 'Tucks away until the pointer reaches that edge.', A.at('nexus.autohide')),
      R.toggle('Magnify on hover', 'Icons grow as the pointer passes over them.', A.at('nexus.magnify')),
      R.toggle('Step aside for fullscreen', 'Hides while a game or video covers the whole screen.', A.at('nexus.hideFullscreen')),
      heading(`ON THE BAR · ${items.length}`),
      ...(items.length ? [] : [el('<div class="row-note">Nothing yet. Add apps below, or choose "Add to desktop bar" in a game\'s options.</div>')]),
      ...items.map((it, i) => R.buttons(it.name, `${{ game: 'GAME', url: 'WEBSITE', home: 'LAUNCHER · opens HOME' }[it.kind] || 'APP'}${it.target ? ' · ' + it.target : ''}   ← → reorders`, [
        ['▲', () => move(i, -1), 'ghost'], ['▼', () => move(i, 1), 'ghost'],
        ['ICON', () => A.pick('image').then((f) => { if (f.url) { it.icon = f.url; it.customIcon = true; A.changed(); rerender(); } })],
        ['REMOVE', () => { items.splice(i, 1); A.changed(); rerender(); }, 'danger'],
      ], { adjust: (d) => move(i, d) })),
      heading('ADD'),
      R.button('Add from Start menu', 'Pick any installed app.', 'BROWSE', addFromStart),
      R.button('Add a program', 'Any .exe or shortcut on this PC.', 'PICK FILE', addApp),
      R.button('Add a game', 'One of your launcher games.', 'PICK GAME', addGameMenu),
      R.button('Add a website', 'Opens in your browser.', 'ADD URL', addSite),
      R.button('Add the launcher', 'A logo that opens HOME. Uses your app icon.', 'ADD', () => add({ kind: 'home', name: 'Skyvaint', icon: '', target: '' })),
      R.button('Fill with my apps', 'Fortnite, Rocket League, REMATCH, Roblox, Studio, Epic, Steam, Discord, Medal, Bloxstrap and skyvaint.com — whatever is missing.', 'FILL', () => askSeed(true)),
    ];
  }

  function open() {
    const root = el(`
      <div class="overlay"><div class="sheet">
        <div class="sheet-head"><div><div class="tag">[ DESKTOP BAR ]</div><h2>NEXUS</h2></div></div>
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

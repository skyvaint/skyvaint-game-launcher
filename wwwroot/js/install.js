// Settings → INSTALLATION: the apps this launcher works with, each one a click to install (or update) through
// winget, Windows' own app installer. Installed ones are marked; a store you just installed is scanned for games.
// BT4 is the custom Budokai Tenkaichi 4 (a mod of Budokai Tenkaichi 3): it runs on PCSX2 with your own copy of the
// game, and plays online with a friend over Parsec (you host, they join as player 2 with only Parsec).
(() => {
  const A = SV.app, { host } = SV;
  const { el, toast } = A;

  const CATALOG = [
    ['STORES AND LAUNCHERS', [
      ['Valve.Steam', 'Steam', 'Your Steam games show up here by themselves.'],
      ['EpicGames.EpicGamesLauncher', 'Epic Games Launcher', 'Needed to start Epic games, Fortnite included.'],
      ['ElectronicArts.EADesktop', 'EA app', 'EA games (EA SPORTS FC, Battlefield…).'],
      ['Ubisoft.Connect', 'Ubisoft Connect', 'Ubisoft games.'],
      ['RockstarGames.Launcher', 'Rockstar Games Launcher', 'GTA V, Red Dead Redemption 2.'],
    ]],
    ['ROBLOX', [
      ['Roblox.Roblox', 'Roblox Player', 'Plays Roblox games.'],
      ['Roblox.RobloxStudio', 'Roblox Studio', 'Make your own Roblox games.'],
      ['pizzaboxer.Bloxstrap', 'Bloxstrap', 'A Roblox starter with more settings (FPS unlock, fonts, Discord status).'],
    ]],
    ['EMULATORS', [
      ['PCSX2Team.PCSX2', 'PCSX2', 'PlayStation 2 emulator. Budokai Tenkaichi runs on it.'],
      ['bt4', 'Budokai Tenkaichi 4 (custom BT4)', 'The custom BT4, on PCSX2 with your own copy of the game (pick the file or mod in the Budokai picker). Play it online: host and your friend joins as player 2 over Parsec, they only need Parsec. Or join a friend\'s Parsec link.'],
    ]],
    ['TOOLS', [
      ['OpenRGB.OpenRGB', 'OpenRGB', 'Controls your RGB lights. LED COLOURS uses it.'],
      ['Parsec.Parsec', 'Parsec', 'Play with friends over the internet (Budokai host / join).'],
      ['Discord.Discord', 'Discord', 'Chat, and your game status through the DISCORD page.'],
      ['OBSProject.OBSStudio', 'OBS Studio', 'Record and stream.'],
      ['Guru3D.Afterburner', 'MSI Afterburner', 'FPS counter, GPU clocks and fans.'],
      ['rocksdanister.LivelyWallpaper', 'Lively Wallpaper', 'More live wallpapers.'],
      ['Rainmeter.Rainmeter', 'Rainmeter', 'Desktop widgets and skins.'],
    ]],
  ];

  let have = null, error = '', loading = false, redraw = null;
  const busy = new Set(), failed = new Map();

  function load() {
    if (loading) return;
    loading = true;
    host.send('installList');
    // The browser preview has no winget: nothing comes back.
    if (!host.native) setTimeout(() => { if (loading) { loading = false; have = new Set(); error = 'Installing only works inside the launcher app.'; redraw && redraw(); } }, 600);
  }
  host.on('installList', (m) => {
    loading = false;
    have = new Set((m.ids || []).map((x) => String(x).toLowerCase()));
    (m.busy || []).forEach((x) => busy.add(x));
    error = m.error || '';
    redraw && redraw();
  });
  host.on('installState', (m) => {
    const item = CATALOG.flatMap(([, l]) => l).find(([id]) => id === m.id), name = item ? item[1] : m.id;
    if (m.state === 'busy') busy.add(m.id);
    else {
      busy.delete(m.id);
      if (m.state === 'done') { failed.delete(m.id); have && have.add(m.id.toLowerCase()); toast(name + ' is installed'); }
      else { failed.set(m.id, m.note || ''); toast(name + " didn't install", 'bad'); }
    }
    redraw && redraw();
  });
  host.on('installedSomething', () => host.send('rescan'));

  const isIn = (id) => !!have && have.has(id.toLowerCase());
  function install(id, name, upgrade) {
    if (!host.native) return toast('Installing only works inside the launcher app.');
    busy.add(id);
    failed.delete(id);
    toast((upgrade ? 'Updating ' : 'Installing ') + name + '… it carries on in the background.');
    host.send('installApp', { id, upgrade: !!upgrade });
    redraw && redraw();
  }
  // BT4: PCSX2 first (and Parsec to play online), then the Budokai picker, set to online when asked.
  function bt4(online) {
    if (!isIn('PCSX2Team.PCSX2')) return install('PCSX2Team.PCSX2', 'PCSX2');
    if (online && !isIn('Parsec.Parsec')) return install('Parsec.Parsec', 'Parsec');
    const c = A.cfg;
    c.features = c.features || {};
    const f = (c.features.budokai = c.features.budokai || {});
    f.on = true;
    if (online) { f.parsec = true; c.budokai = c.budokai || {}; c.budokai.emu = 'pcsx2'; c.budokai.psMode = 'parsec'; }
    A.changed();
    const g = c.games.find((x) => x.target === 'sv:budokai');
    if (g && SV.budokai) { while (A.stack.length) A.pop(); return SV.budokai.open(g); }
    toast('Turn on Budokai Tenkaichi in Settings → GAMES first.', 'bad');
  }

  function rows(rerender) {
    redraw = rerender;
    if (!have && !loading) load();
    const { R, heading } = A;
    const out = [
      el(`<div class="row-note">Installs come from winget, Windows' own app installer, straight from each app's maker. Installing accepts that app's own licence. Some ask Windows for permission first: say yes in that window.</div>`),
      R.button('Check again', loading ? 'Looking at what is installed…' : error || (have ? `${CATALOG.flatMap(([, l]) => l).filter(([id]) => isIn(id)).length} of these are installed.` : ''), 'REFRESH', () => { have = null; load(); rerender(); }),
    ];
    for (const [group, list] of CATALOG) {
      out.push(heading(group));
      for (const [id, name, desc] of list) {
        if (id === 'bt4') {
          const ps2 = isIn('PCSX2Team.PCSX2'), parsec = isIn('Parsec.Parsec'), going = busy.has('PCSX2Team.PCSX2') || busy.has('Parsec.Parsec');
          const need = [!ps2 && 'PCSX2', !parsec && 'Parsec (online only)'].filter(Boolean);
          out.push(going ? R.button(name, desc + '  Installing…', 'INSTALLING…', () => {})
            : !ps2 ? R.button(name, desc + '  Needs ' + need.join(' and ') + '.', 'INSTALL PCSX2', () => bt4(false))
            : R.buttons(name, desc + (parsec ? '  Ready to play, online too.' : '  Parsec gets installed when you pick PLAY ONLINE.'), [
              ['PLAY', () => bt4(false), 'ghost'],
              [parsec ? 'PLAY ONLINE' : 'INSTALL PARSEC', () => bt4(true)],
            ]));
          continue;
        }
        const on = isIn(id), going = busy.has(id), bad = failed.get(id);
        const status = going ? 'Installing… you can leave this page.' : bad != null ? "Didn't install" + (bad ? ': ' + bad : '.') + ' Try again, or install it from its website.' : on ? 'Installed.' : loading || !have ? '' : 'Not installed.';
        out.push(on && !going
          ? R.buttons(name, desc + '  ' + status, [['UPDATE', () => install(id, name, true), 'ghost']])
          : R.button(name, desc + (status ? '  ' + status : ''), going ? 'INSTALLING…' : 'INSTALL', () => { if (!going) install(id, name); }));
      }
    }
    return out;
  }

  SV.install = { rows };
})();

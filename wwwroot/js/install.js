// Settings → INSTALLATION: the apps this launcher works with, each one a click to install (or update) through
// winget, Windows' own app installer. Installed ones are marked; a store you just installed is scanned for games.
// BT4 is a mod for Budokai Tenkaichi 3: it needs PCSX2 and your own copy of the game, then the Budokai picker.
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
      ['bt4', 'Budokai Tenkaichi 4 (BT4)', 'A fan mod of Budokai Tenkaichi 3: needs PCSX2 and your own copy of the game. SET UP opens the Budokai picker, where you choose the game file or mod.'],
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
  function bt4() {
    if (!isIn('PCSX2Team.PCSX2')) return install('PCSX2Team.PCSX2', 'PCSX2');
    const g = A.cfg.games.find((x) => x.target === 'sv:budokai');
    if (g && SV.budokai) return SV.budokai.open(g);
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
          const ready = isIn('PCSX2Team.PCSX2');
          out.push(R.button(name, desc + (ready ? '' : '  PCSX2 first.'), busy.has('PCSX2Team.PCSX2') ? 'INSTALLING…' : ready ? 'SET UP' : 'INSTALL PCSX2', bt4));
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

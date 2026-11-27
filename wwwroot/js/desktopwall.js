// Settings → DESKTOP → DESKTOP WALLPAPER: what the new (Tauri) launcher draws behind your desktop icons, per screen.
// A picture, GIF, video, plain colour or a live effect, with dim and blur. Pictures can also be made the real Windows
// wallpaper, which stays when the launcher is closed. The widgets from WIDGETS are drawn on the same screens.
(() => {
  const A = SV.app, { host } = SV;
  const { el, heading, R, prop, toast } = A;
  const native = () => host.native;
  let screens = [], editing = 'all';
  host.on('screens', (m) => { screens = m.screens || []; });

  const D = () => {
    const d = A.cfg.desktop || (A.cfg.desktop = {});
    if (d.enabled == null) d.enabled = false;
    if (d.sameOnAll == null) d.sameOnAll = true;
    if (!d.all) d.all = { kind: 'vfx', vfx: 'aurora', dim: 0, blur: 0, fit: 'cover', speed: 1, fps: 30 };
    if (!d.screens) d.screens = {};
    return d;
  };
  const wallFor = (name) => {
    const d = D();
    if (name === 'all') return d.all;
    return d.screens[name] || (d.screens[name] = JSON.parse(JSON.stringify(d.all)));
  };

  // The desktop pages use the launcher's colours: tell the shell when they change.
  let lastLook = '';
  function sendLook() {
    if (!native()) return;
    const cs = getComputedStyle(document.documentElement);
    const look = { accent: cs.getPropertyValue('--accent').trim(), accent2: cs.getPropertyValue('--accent2').trim() };
    const key = JSON.stringify(look);
    if (key !== lastLook && look.accent) { lastLook = key; host.send('desktopLook', look); }
  }
  host.on('init', () => { setTimeout(sendLook, 1500); setInterval(sendLook, 4000); });

  function rows(rerender) {
    if (!native()) return [
      heading('DESKTOP WALLPAPER'),
      el('<div class="row-note">Desktop wallpapers only work inside the launcher app.</div>'),
    ];
    const d = D();
    if (!d.sameOnAll && editing === 'all' && screens[0]) editing = screens[0].name;
    if (d.sameOnAll) editing = 'all';
    const w = wallFor(editing);
    const P = (k) => prop(w, k);
    const screenName = (n) => (screens.find((s) => s.name === n) || {}).label || n;
    const list = [
      heading('DESKTOP WALLPAPER'),
      el('<div class="row-note">Drawn behind your desktop icons while the launcher runs. Your desktop widgets (WIDGETS) are drawn on top of it.</div>'),
      R.toggle('Use the launcher on my desktop', 'Wallpaper and desktop widgets. Off gives the desktop back to Windows.', prop(d, 'enabled'), rerender),
      R.toggle('Same on every screen', screens.length > 1 ? `${screens.length} screens found.` : 'One screen found.', prop(d, 'sameOnAll'), rerender),
    ];
    if (!d.sameOnAll && screens.length) list.push(R.choice('Screen', 'Which screen you are setting up.', { get: () => editing, set: (v) => { editing = v; } }, screens.map((s) => [s.name, s.label]), rerender));
    list.push(
      heading(d.sameOnAll ? 'ALL SCREENS' : screenName(editing).toUpperCase()),
      R.choice('What it shows', '', P('kind'), [['vfx', 'A live effect'], ['image', 'A picture or GIF'], ['video', 'A video'], ['color', 'A plain colour'], ['none', 'Nothing (Windows wallpaper)']], rerender),
    );
    if (w.kind === 'vfx') list.push(
      R.choice('Effect', '', P('vfx'), [['aurora', 'Aurora glow'], ['stars', 'Star warp'], ['grid', 'Neon grid'], ['lines', 'Neon lines'], ['waves', 'Waves']]),
      R.color('First colour', 'Empty follows your theme.', { get: () => w.colorA || '#ff1f1f', set: (v) => { w.colorA = v; } }),
      R.color('Second colour', '', { get: () => w.colorB || '#8b3dff', set: (v) => { w.colorB = v; } }),
      R.button('Theme colours', 'Use the colours of the theme you are on.', 'RESET', () => { delete w.colorA; delete w.colorB; A.changed(); rerender(); }),
      R.slider('Speed', '', prop(w, 'speed'), 0.2, 3, 0.1, (v) => v.toFixed(1) + '×'),
      R.choice('Frame rate', 'Lower uses less power. Games get the GPU either way.', prop(w, 'fps'), [[30, '30 per second'], [20, '20 per second'], [60, '60 per second'], [15, '15 per second']]),
    );
    if (w.kind === 'image') list.push(
      R.file('Picture or GIF', '', P('src'), 'image'),
      R.choice('Fit', '', P('fit'), [['cover', 'Fill the screen'], ['contain', 'Whole picture'], ['fill', 'Stretch']]),
      R.button('Make it the Windows wallpaper too', 'Stays when the launcher is closed.', 'SET', () => {
        if (!w.src) return toast('Pick a picture first.');
        host.send('setWindowsWallpaperFrom', { src: w.src, screen: d.sameOnAll ? null : editing });
      }),
    );
    if (w.kind === 'video') list.push(
      R.file('Video', 'MP4 or WEBM. It plays without sound and pauses under fullscreen games.', P('src'), 'video'),
      R.choice('Fit', '', P('fit'), [['cover', 'Fill the screen'], ['contain', 'Whole video']]),
      R.slider('Speed', '', prop(w, 'speed'), 0.25, 2, 0.05, (v) => v.toFixed(2) + '×'),
    );
    if (w.kind !== 'none') list.push(
      R.color('Background colour', w.kind === 'color' ? '' : 'Shows around a picture that doesn\'t fill the screen.', { get: () => w.color || '#000000', set: (v) => { w.color = v; } }),
      R.slider('Darken', 'Makes desktop icons easier to read.', prop(w, 'dim'), 0, 0.85, 0.05),
      R.slider('Blur', '', prop(w, 'blur'), 0, 40, 1, (v) => (v ? v + ' px' : 'OFF')),
    );
    list.push(
      heading('WHILE YOU PLAY'),
      R.toggle('Aurora storm on my other screens', 'While a game runs or starts, every screen but the main one fills with fast auroras behind your windows. Works even with the desktop wallpaper off.', { get: () => d.gameAuroras !== false, set: (v) => { d.gameAuroras = v; } }),
      heading('DESKTOP WIDGETS'),
      R.button('Clocks, notes, icons and app grids', 'Set them up in WIDGETS. They are drawn on the screen they are on.', 'OPEN', () => A.openSettings('widgets')),
      R.button('Screens changed?', 'Plugged in or moved a screen: draw the desktop again.', 'REDRAW', () => { host.send('desktopRefresh'); host.send('screens'); }),
    );
    return list;
  }

  SV.deskWall = { rows };
})();

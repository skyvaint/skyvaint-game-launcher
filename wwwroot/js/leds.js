// Settings → DESKTOP → LED COLOURS: your keyboard, mouse, RAM, fans and other RGB parts, through OpenRGB.
// The shell draws the effect; this page only holds the settings and sends them over (on start, on every change and
// when the theme's colours change).
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, heading, R, prop, toast } = A;
  let status = null, checking = false;

  const L = () => {
    const l = A.cfg.leds || (A.cfg.leds = {});
    const def = { enabled: false, mode: 'theme', color: '#ff1f1f', color2: '#8b3dff', brightness: 1, speed: 1, whilePlaying: 'keep', playColor: '#ffffff', launchFlash: true, host: '127.0.0.1', port: 6742, devices: {} };
    for (const k of Object.keys(def)) if (l[k] == null) l[k] = def[k];
    return l;
  };
  const accents = () => { const cs = getComputedStyle(document.documentElement); return { accent: cs.getPropertyValue('--accent').trim(), accent2: cs.getPropertyValue('--accent2').trim() }; };
  let lastSent = '';
  function apply(force) {
    if (!A.cfg) return;
    const msg = { leds: L(), ...accents() };
    const key = JSON.stringify(msg);
    if (!force && key === lastSent) return;
    lastSent = key;
    host.send('ledApply', msg);
  }
  host.on('init', () => setTimeout(() => apply(true), 1200));
  // Settings saved or the theme changed: send what's new (cheap: only when something differs).
  setInterval(() => apply(false), 1500);

  host.on('ledStatus', (m) => {
    status = m; checking = false;
    if (SV.leds.rerender) SV.leds.rerender();
  });
  const check = (rerender) => { checking = true; status = null; host.send('ledStatus', { leds: L() }); rerender && rerender(); };

  function rows(rerender) {
    SV.leds.rerender = rerender;
    const l = L(), P = (k) => prop(l, k);
    if (!status && !checking && host.native) setTimeout(() => check(rerender), 0);
    const devices = (status && status.devices) || [];
    const state = !host.native ? 'Only inside the launcher app.'
      : checking ? 'Looking for OpenRGB…'
      : status && status.connected ? `Connected · ${devices.length} device${devices.length === 1 ? '' : 's'}`
      : status ? status.error || 'Not connected.' : '';
    return [
      heading('LED COLOURS'),
      el(`<div class="row-note">Lights your keyboard, mouse, RAM, fans, motherboard and graphics card with the launcher, through the free app <b>OpenRGB</b> (openrgb.org). In OpenRGB, open the SDK Server tab and press Start Server (tick "Start at login" in its settings so it is always there). Close other RGB apps such as OMEN Light Studio while OpenRGB has the lights, or they will take turns.</div>`),
      R.button('OpenRGB', state, checking ? '…' : 'CHECK AGAIN', () => check(rerender)),
      R.toggle('Let the launcher colour my lights', 'Off leaves them to OpenRGB or your other RGB apps.', P('enabled'), () => apply(true)),
      heading('EFFECT'),
      R.choice('Effect', '', P('mode'), [['theme', 'My theme colour'], ['static', 'One colour'], ['breathe', 'Breathing'], ['wave', 'Wave between two colours'], ['rainbow', 'Rainbow wave'], ['off', 'Off']], rerender),
      ...(l.mode === 'static' || l.mode === 'breathe' || l.mode === 'wave' ? [
        R.toggle('Follow my theme', 'Uses the colours of the theme you are on, and changes with it.', P('followTheme'), rerender),
        ...(l.followTheme ? [] : [R.color('Colour', '', P('color'))]),
        ...(l.mode === 'wave' && !l.followTheme ? [R.color('Second colour', '', P('color2'))] : []),
      ] : []),
      ...(l.mode === 'breathe' || l.mode === 'wave' || l.mode === 'rainbow' ? [R.slider('Speed', '', P('speed'), 0.2, 4, 0.1, (v) => v.toFixed(1) + '×')] : []),
      R.slider('Brightness', '', P('brightness'), 0.05, 1, 0.05),
      heading('WHILE YOU PLAY'),
      R.toggle('Flash when a game starts', '', P('launchFlash')),
      R.choice('While a game runs', '', P('whilePlaying'), [['keep', 'Keep the effect'], ['dim', 'Dim them'], ['color', 'One colour (below)'], ['off', 'Turn them off']], rerender),
      ...(l.whilePlaying === 'color' ? [R.color('Colour while playing', '', P('playColor'))] : []),
      R.button('Try the flash', '', 'FLASH', () => { apply(true); host.send('ledFlash'); audio.play('confirm'); }),
      heading(`DEVICES${devices.length ? ' · ' + devices.length : ''}`),
      ...(devices.length ? devices.map((d) => R.toggle(d.name, `${d.leds} LED${d.leds === 1 ? '' : 's'}${d.direct ? '' : ' · may not take direct colours'}`, { get: () => l.devices[d.name] !== false, set: (v) => { l.devices[d.name] = v; } }, () => apply(true)))
        : [el(`<div class="row-note">${esc(status && status.connected ? 'OpenRGB found no RGB devices. Check its Devices tab.' : 'Devices show here once OpenRGB is connected.')}</div>`)]),
      heading('CONNECTION'),
      R.text('Address', 'Where OpenRGB runs. This PC is 127.0.0.1.', P('host'), '127.0.0.1'),
      R.text('Port', 'OpenRGB uses 6742.', { get: () => String(l.port), set: (v) => { const n = parseInt(v, 10); if (n > 0 && n < 65536) l.port = n; } }, '6742'),
    ];
  }

  SV.leds = { rows, apply };
})();

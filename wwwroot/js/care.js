// Looking after the launcher: the setup wizard (checks what's installed, picks a performance profile), the
// PERFORMANCE settings tab (profiles, memory limit, shortcuts), and what happens after a setting crashed the page.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, hints, R, heading } = A;
  let check = null, memory = { mb: 0, limit: 0 };

  host.on('careCheck', (m) => { check = m; wizardRefresh && wizardRefresh(); });
  host.on('memory', (m) => { memory = m; const n = document.querySelector('.mem-now'); if (n) n.textContent = memText(); });
  host.on('openMenu', () => { while (A.stack.length) A.pop(); A.openSettings('theme'); });
  const memText = () => `${memory.mb || '…'} MB in use${memory.limit ? ` · limit ${memory.limit} MB` : ''}`;

  // ---- performance profiles

  const HEAVY = ['trail', 'ripple', 'tilt', 'glitch', 'scramble', 'rgb', 'chroma', 'scan', 'shake', 'confetti', 'warp', 'pulse', 'spotlight', 'rays', 'dust', 'breathe', 'bloom',
    'sweep', 'flare', 'rim', 'bars', 'parallax', 'reflect', 'beat', 'grainAnim', 'chromaHover', 'cursorGlow', 'space', 'focusFx'];
  const PROFILES = {
    low: {
      name: 'LOW-END · CLEAN 60', sub: 'Almost no effects, a light backdrop, 60 frames a second, lean on memory. Smooth on any PC.',
      apply(c) {
        for (const k of HEAVY) c.fx[k] = false;
        c.fx.transition = 'fade'; c.fx.fadeWindow = false;
        c.backdrop.quality = 'low'; c.backdrop.fps = 60; c.backdrop.slowFps = 30; c.backdrop.motion = true; c.backdrop.intensity = 0.6;
        for (const l of Object.keys(c.backdrop.levels)) c.backdrop.levels[l] = 0;
        c.backdrop.levels.art = 0.7;
        c.theme.texture = 'none';
        Object.assign(c.perf, { smooth: true, uncapped: false, memorySaver: 'max' });
      },
    },
    balanced: {
      name: 'BALANCED', sub: 'The main effects, a full backdrop, capped at 60 frames a second.',
      apply(c) {
        Object.assign(c.fx, { trail: true, ripple: true, tilt: true, glitch: false, scramble: true, rgb: true, chroma: false, scan: false, shake: true, confetti: true, warp: true, pulse: true,
          spotlight: true, dust: true, bloom: true, sweep: true, rays: false, flare: false, space: true, focusFx: true });
        c.backdrop.quality = 'auto'; c.backdrop.fps = 60;
        Object.assign(c.perf, { smooth: true, uncapped: false, memorySaver: 'balanced' });
      },
    },
    full: {
      name: 'FULL', sub: 'Everything on, at your screen\'s full refresh rate.',
      apply(c) {
        Object.assign(c.fx, { trail: true, ripple: true, tilt: true, glitch: true, scramble: true, rgb: true, shake: true, confetti: true, warp: true, pulse: true, spotlight: true, dust: true, bloom: true, sweep: true, space: true, focusFx: true });
        c.backdrop.quality = 'high'; c.backdrop.fps = 0;
        Object.assign(c.perf, { smooth: true, memorySaver: 'off' });
      },
    },
  };
  function profile(key, quiet) {
    const c = A.cfg;
    c.perf = c.perf || {};
    // The look before is kept, so SHOP → BACK (or Settings → THEME) returns to it.
    if (SV.themes) { c.themes = c.themes || {}; c.themes.previous = { name: 'Your look before ' + PROFILES[key].name.toLowerCase(), data: SV.themes.snapshot(), at: Date.now() }; }
    PROFILES[key].apply(c);
    c.perf.profile = key;
    A.changed('games');
    if (!quiet) { audio.play('pick'); toast(PROFILES[key].name + ' is on'); }
  }
  const recommend = () => {
    if (!check) return 'balanced';
    const gb = (check.ramMb || 0) / 1024;
    return gb && gb < 8.5 || (check.cores || 8) <= 4 ? 'low' : gb < 15 ? 'balanced' : 'full';
  };

  // ---- the setup wizard

  let wizardRefresh = null;
  const ITEMS = [
    ['webview', 'WebView2 (draws the launcher)', true, 'https://developer.microsoft.com/microsoft-edge/webview2/'],
    ['dotnet', '.NET runtime', true, 'https://dotnet.microsoft.com/download/dotnet/9.0'],
    ['steam', 'Steam', false, 'https://store.steampowered.com/about/'],
    ['epic', 'Epic Games Launcher', false, 'https://store.epicgames.com/download'],
    ['roblox', 'Roblox', false, 'https://www.roblox.com/download'],
    ['pcsx2', 'PCSX2 (PS2 games, Budokai)', false, 'https://pcsx2.net/downloads'],
    ['parsec', 'Parsec (play PS2 games with a friend online)', false, 'https://parsec.app/downloads'],
    ['sdk', '.NET SDK (to update from the code)', false, 'https://dotnet.microsoft.com/download/dotnet/9.0'],
    ['git', 'Git (to update from the code)', false, 'https://git-scm.com/download/win'],
  ];
  // Add-ons you tick in the wizard switch on their features (Settings → SYSTEM) and list the apps they need.
  const SUITES = [
    { k: 'bt3', name: 'INSTALL BT3 SUITE', sub: 'Budokai Tenkaichi 3 on PCSX2, your mods with their own saves, and playing with a friend over Parsec.', apps: ['pcsx2', 'parsec'] },
    { k: 'roblox', name: 'INSTALL ROBLOX SUITE', sub: 'Roblox accounts, places, avatars and friends, plus Roblox Studio projects and news.', apps: ['roblox'] },
  ];
  const suiteOn = (k) => (!SV.features ? true : k === 'bt3' ? SV.features.on('budokai') : SV.features.on('roblox'));
  function setSuite(k, v) {
    if (!SV.features) return;
    const f = SV.features.F();
    if (k === 'bt3') f.budokai.on = v;
    else { f.roblox.on = v; A.cfg.dev.enabled = v; }
    A.changed('games');
  }
  const suiteApps = () => SUITES.flatMap((x) => x.apps);
  function wizard() {
    host.send('careCheck');
    let step = 0, pick = null, idx = 0;
    const root = el(`<div class="overlay center"><div class="picker wide wizard">
      <div class="picker-head"><div><div class="tag wz-tag"></div><h2 class="wz-title"></h2></div><div class="picker-note wz-note"></div></div>
      <div class="wz-body"></div>
      <div class="picker-btns wz-btns"></div>
      <div class="hints">${hints([['confirm', 'Choose'], ['move', 'Move'], ['back', 'Later']])}</div></div></div>`);
    const body = $('.wz-body', root), btns = $('.wz-btns', root);
    let actions = [];
    function build() {
      const ok = (k) => (check ? (k === 'webview' ? !!check.webview : k === 'dotnet' ? !!check.dotnet : !!check[k]) : null);
      if (step === 0) {
        $('.wz-tag', root).textContent = '[ SETUP · 1 OF 3 ]';
        $('.wz-title', root).textContent = 'CHECKING YOUR PC';
        $('.wz-note', root).textContent = check ? `${check.cores} CORES · ${Math.round((check.ramMb || 0) / 1024)} GB · ${check.refresh || 60} HZ` : 'LOOKING…';
        const wanted = (k) => !suiteApps().includes(k) || SUITES.some((x) => x.apps.includes(k) && suiteOn(x.k));
        body.innerHTML = `<div class="wz-suites"><div class="tag">[ ADD-ONS · TICK WHAT YOU WANT ]</div>${SUITES.map((x) => `<button class="wz-suite ${suiteOn(x.k) ? 'on' : ''}" data-suite="${x.k}"><i>${suiteOn(x.k) ? '✓' : ''}</i><b>${esc(x.name)}</b><small>${esc(x.sub)}</small></button>`).join('')}</div>
          <div class="wz-list">${ITEMS.filter(([k]) => wanted(k)).map(([k, label, need]) => {
          const s = ok(k);
          return `<div class="wz-item ${s ? 'ok' : s === false ? 'no' : ''}"><i>${s ? '✓' : s === false ? (need ? '✕' : '–') : '…'}</i><b>${esc(label)}</b><small>${s ? 'READY' : s === false ? (need ? 'NEEDED' : 'OPTIONAL · NOT FOUND') : ''}</small>${s === false ? `<button class="btn small" data-get="${k}">GET IT</button>` : ''}</div>`;
        }).join('')}</div>`;
        actions = [{ label: 'NEXT', primary: true, run: () => { step = 1; pick = pick || recommend(); build(); } }, { label: 'CHECK AGAIN', run: () => { check = null; host.send('careCheck'); build(); } }];
      } else if (step === 1) {
        $('.wz-tag', root).textContent = '[ SETUP · 2 OF 3 ]';
        $('.wz-title', root).textContent = 'HOW SMOOTH?';
        $('.wz-note', root).textContent = 'RECOMMENDED · ' + PROFILES[recommend()].name;
        body.innerHTML = `<div class="wz-profiles">${Object.entries(PROFILES).map(([k, p]) => `<button class="wz-prof ${pick === k ? 'on' : ''}" data-p="${k}"><b>${esc(p.name)}</b><small>${esc(p.sub)}</small>${k === recommend() ? '<em>RECOMMENDED</em>' : ''}</button>`).join('')}</div>
          <div class="row-note">You can change every effect afterwards. If a setting ever makes the launcher crash, it is undone by itself.</div>`;
        actions = [{ label: 'NEXT', primary: true, run: () => { profile(pick || recommend(), true); step = 2; build(); } }, { label: 'BACK', run: () => { step = 0; build(); } }];
      } else {
        $('.wz-tag', root).textContent = '[ SETUP · 3 OF 3 ]';
        $('.wz-title', root).textContent = 'ALL SET';
        $('.wz-note', root).textContent = '';
        body.innerHTML = `<div class="row-note">Your games are picked up from Steam, Epic and Roblox by themselves. A few things to know:<br>
          · <b>${esc(A.cfg.behavior.hotkeyShow || 'Ctrl+Alt+Home')}</b> shows the launcher from anywhere, <b>${esc(A.cfg.behavior.hotkeyMenu || 'Ctrl+Alt+M')}</b> opens the menu.<br>
          · The <b>SHOP</b> in the top bar has themes, and you can share yours as a code.<br>
          · Settings → PERFORMANCE changes the profile and sets a memory limit. Run this setup again from there.</div>`;
        actions = [{ label: 'START', primary: true, run: () => { A.cfg.setup = { ...(A.cfg.setup || {}), done: true, seen: true, at: Date.now() }; A.save(); A.pop(); } }];
      }
      btns.innerHTML = actions.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${i === idx ? 'focus' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('');
    }
    body.addEventListener('click', (e) => {
      const g = e.target.closest('[data-get]');
      if (g) { const it = ITEMS.find((x) => x[0] === g.dataset.get); if (it) host.send('openUrl', { url: it[3] }); return; }
      const su = e.target.closest('[data-suite]');
      if (su) { setSuite(su.dataset.suite, !suiteOn(su.dataset.suite)); audio.play('toggle'); build(); return; }
      const p = e.target.closest('[data-p]');
      if (p) { pick = p.dataset.p; audio.play('toggle'); build(); }
    });
    btns.addEventListener('click', (e) => { const b = e.target.closest('.btn'); if (b) { idx = +b.dataset.i; actions[idx].run(); } });
    build();
    wizardRefresh = build;
    A.push({
      el: root, onClose: () => { wizardRefresh = null; },
      action(a) {
        if (a === 'back') { if (!(A.cfg.setup && A.cfg.setup.done)) { A.cfg.setup = { ...(A.cfg.setup || {}), done: true, seen: true, later: true }; A.save(); } A.pop(); }
        else if (step === 1 && (a === 'up' || a === 'down')) { const ks = Object.keys(PROFILES); pick = ks[clamp(ks.indexOf(pick || recommend()) + (a === 'down' ? 1 : -1), 0, ks.length - 1)]; audio.play('nav'); build(); }
        else if (a === 'left' || a === 'right') { idx = clamp(idx + (a === 'left' ? -1 : 1), 0, actions.length - 1); audio.play('nav'); build(); }
        else if (a === 'confirm') actions[idx] && actions[idx].run();
      },
    });
  }

  // First start on a fresh install shows the wizard; a launcher that already has games skips it.
  host.on('init', (m) => {
    // A fresh install starts with no saved settings at all; anyone with saved settings skips the wizard.
    const fresh = m.fresh ?? !m.config;
    const c0 = A.cfg;
    if (!fresh && !(c0.setup && c0.setup.done)) { c0.setup = { ...(c0.setup || {}), done: true, existing: true }; A.save(); }
    // Waits until the opening is over and the launcher is in front with nothing else open.
    let tries = 0;
    const t = setInterval(() => {
      const c = A.cfg, b = document.body.classList;
      if ((c.setup && c.setup.done) || ++tries > 600) return clearInterval(t);
      if (A.mode !== 'home' || !b.contains('entered') || b.contains('away') || A.stack.length || A.launching) return;
      if (document.querySelector('.wizard')) return;
      clearInterval(t);
      wizard();
    }, 1000);
    const q = new URLSearchParams(location.search);
    if (q.get('recovered')) setTimeout(() => { audio.play('error'); toast('That setting made the launcher crash, so it was undone.', 'bad'); }, 1500);
    if (q.get('safe')) setTimeout(() => A.openMenu('THE LAUNCHER CRASHED TWICE', [
      { label: 'USE LOW-END MODE', sub: 'Turns the heavy effects off (your look is kept to go back to)', run: () => profile('low') },
      { label: 'KEEP MY SETTINGS', run: () => {} },
    ], 'Something is too heavy for this PC right now.'), 2000);
  });

  // ---- Settings → PERFORMANCE

  function rows(rerender) {
    const c = A.cfg;
    c.perf = c.perf || {};
    if (c.perf.memorySaver === undefined) c.perf.memorySaver = 'balanced';
    if (c.perf.memoryLimit === undefined) c.perf.memoryLimit = 0;
    host.send('memoryNow');
    const cur = c.perf.profile;
    return [
      heading('PERFORMANCE PROFILE'),
      ...Object.entries(PROFILES).map(([k, p]) => R.button(p.name + (cur === k ? '   ✓' : ''), p.sub, cur === k ? 'AGAIN' : 'USE', () => { profile(k); rerender(); })),
      R.button('Setup wizard', 'Check what is installed and pick a profile again.', 'RUN', () => { while (A.stack.length) A.pop(); wizard(); }),
      heading('MEMORY'),
      el(`<div class="row-note">Now: <b class="mem-now">${esc(memText())}</b></div>`),
      R.choice('Memory saver', 'Balanced lets go of memory while the launcher is out of sight. Max keeps it lean all the time (a little slower to redraw).', A.at('perf.memorySaver'),
        [['off', 'Off'], ['balanced', 'Balanced'], ['max', 'Max']]),
      R.slider('Memory limit', 'Above this, the launcher frees memory straight away (caches, unused pages). 0 is no limit. It is a target, not a hard wall, so nothing crashes.', A.at('perf.memoryLimit'), 0, 2000, 50, (v) => (v ? v + ' MB' : 'NO LIMIT')),
      R.button('Free memory now', '', 'FREE', () => { host.send('trimMemory'); toast('Freeing memory…'); }),
      heading('SHORTCUTS'),
      R.text('Show / hide the launcher', 'Works anywhere, even in a game. Like Ctrl+Alt+Home or Ctrl+Shift+F1.', A.at('behavior.hotkeyShow'), 'Ctrl+Alt+Home'),
      R.text('Open the menu', 'Brings the launcher up with the menu open. "off" turns it off.', A.at('behavior.hotkeyMenu'), 'Ctrl+Alt+M'),
      heading('LAUNCHING GAMES'),
      R.toggle('Stay in front until the game is ready', 'Splash screens and loading windows open behind the launcher; it steps aside once the game is full screen or done loading.', A.at('behavior.holdFront')),
    ];
  }

  SV.care = { wizard, profile, rows, PROFILES };
})();

// Feature switches for the add-ons (Roblox, Roblox Studio, Budokai Tenkaichi 3) and the profile you load at start.
//   Settings → SYSTEM has a section for each add-on. A switched-off add-on takes everything of its own away
//   (its rows on HOME, its card, its steps), and its smaller switches only show while it is on.
//   Profiles: each one is a name, a picture and a whole look (theme, backdrop, effects…). At start the launcher
//   asks which profile to load; the look you change while on a profile is kept with it.
(() => {
  const A = SV.app, { audio } = SV;
  const { el, esc, toast, R, heading } = A;

  const DEFAULTS = {
    roblox: { on: true, card: true, friends: true, games: true, explore: true, avatar: true, closeAll: true },
    studio: { projects: true, news: true, commissions: true },
    budokai: { on: true, parsec: true, dolphin: false, autoUnpack: true, ownSave: true },
  };
  function F() {
    const c = A.cfg;
    c.features = c.features || {};
    for (const [k, d] of Object.entries(DEFAULTS)) c.features[k] = { ...d, ...(c.features[k] || {}) };
    return c.features;
  }
  // on('roblox.friends'): the add-on is on and so is that part of it. Studio's main switch is Developer mode.
  function on(path) {
    if (!A.cfg) return true;
    const [k, part] = path.split('.'), f = F()[k];
    if (!f) return true;
    const main = k === 'studio' ? !!(A.cfg.dev && A.cfg.dev.enabled) : f.on !== false;
    return main && (!part || f[part] !== false);
  }

  // ---- Settings → SYSTEM

  function rows(rerender) {
    const f = F(), at = A.at;
    P();
    const after = () => { A.changed('games'); SV.rails && SV.rails.refresh && SV.rails.refresh(); rerender(); };
    // An add-on that is off shows none of its smaller switches.
    const sub = (key, list) => (on(key) ? list : []);
    return [
      heading('BUDOKAI TENKAICHI 3'),
      R.toggle('Budokai Tenkaichi 3', 'The Budokai card on your shelf, with PCSX2, your mods and playing with a friend.', at('features.budokai.on'), after),
      ...sub('budokai', [
        R.toggle('Play with a friend (Parsec)', 'Adds WITH A FRIEND under PCSX2: your friend sees your game and plays as player 2.', at('features.budokai.parsec'), after),
        R.toggle('Unpack archives when added', 'A .zip, .7z or .rar you add is unpacked straight away. Off: a .zip is unpacked when you play it.', at('features.budokai.autoUnpack'), after),
        R.toggle('Save data for each mod', 'Lets a mod have its own memory card in PCSX2.', at('features.budokai.ownSave'), after),
        R.toggle('Dolphin', 'Adds a Dolphin card that just opens the Dolphin app.', at('features.budokai.dolphin'), after),
      ]),
      heading('ROBLOX'),
      R.toggle('Roblox', 'Your Roblox card, accounts, places and every Roblox row on HOME. Off hides all of them.', at('features.roblox.on'), after),
      ...sub('roblox', [
        R.toggle('Roblox card on the shelf', '', at('features.roblox.card'), after),
        R.toggle('Friends row', 'Who is online and in game, on HOME.', at('features.roblox.friends'), after),
        R.toggle('My Roblox games row', 'Your saved places, on HOME.', at('features.roblox.games'), after),
        R.toggle('Trending, most played and rising rows', 'Explore lists from Roblox, on HOME.', at('features.roblox.explore'), after),
        R.toggle('Select avatar before playing', 'Step 4 in the Roblox picker: put on one of your outfits.', at('features.roblox.avatar'), after),
        R.toggle('Close all Roblox in the power menu', '', at('features.roblox.closeAll'), after),
      ]),
      heading('ROBLOX STUDIO'),
      R.toggle('Roblox Studio', 'Your Studio projects, Studio news and commissions. The same switch as Developer mode.', at('dev.enabled'), after),
      ...sub('studio', [
        R.toggle('Studio projects row', 'Your cloud places and .rbxl files, on HOME.', at('features.studio.projects'), after),
        R.toggle('Studio news row', 'DevForum announcements, on HOME.', at('features.studio.news'), after),
        R.toggle('Commissions row', 'Requests from your Discord channel, on HOME.', at('features.studio.commissions'), after),
      ]),
      heading('PROFILES'),
      R.toggle('Ask which profile at start', 'Shows WHAT PROFILE TO LOAD when the launcher opens.', at('profiles.ask'), () => A.save()),
      R.button('Switch profile', `Now: ${current() ? current().name : 'none yet'}`, 'OPEN', () => { while (A.stack.length) A.pop(); pick(); }),
      R.button('New profile from this look', 'Saves your look now as a new profile.', 'NEW', () => newProfile(rerender)),
    ];
  }

  // ---- profiles

  const P = () => {
    const c = A.cfg;
    c.profiles = c.profiles || {};
    const p = c.profiles;
    p.list = p.list || [];
    if (p.ask === undefined) p.ask = true;
    // The look you have now becomes your first profile.
    if (!p.list.length) { p.list.push({ id: 'p' + Date.now().toString(36), name: c.profile.name || 'Me', avatar: c.profile.avatar || '', look: SV.themes.snapshot(), at: Date.now() }); p.current = p.list[0].id; }
    return p;
  };
  const current = () => { const p = P(); return p.list.find((x) => x.id === p.current) || null; };
  // Your look so far is kept with the profile you were on.
  const keep = () => { const c = current(); if (c) { c.look = SV.themes.snapshot(); c.name = A.cfg.profile.name || c.name; c.avatar = A.cfg.profile.avatar || ''; } };

  function load(x) {
    const p = P();
    if (p.current !== x.id) {
      keep();
      p.current = x.id;
      SV.themes.apply({ id: '', name: x.name, data: x.look });
    }
    A.cfg.profile.name = x.name;
    A.cfg.profile.avatar = x.avatar || '';
    x.used = Date.now();
    A.changed('games');
    toast('Hi ' + x.name);
  }

  function newProfile(after) {
    A.ask({ tag: 'PROFILES', title: 'NEW PROFILE', label: 'Name', placeholder: 'Player 2', button: 'SAVE', done: (name) => {
      name = name.trim();
      if (!name) return;
      const p = P();
      keep();
      const x = { id: 'p' + Date.now().toString(36), name, avatar: '', look: SV.themes.snapshot(), at: Date.now() };
      p.list.push(x); p.current = x.id;
      A.cfg.profile.name = name; A.cfg.profile.avatar = '';
      A.changed('games'); toast('Profile ' + name + ' made with this look');
      after && after();
    } });
  }

  function profileMenu(x, refresh) {
    const p = P();
    A.openMenu(x.name.toUpperCase(), [
      { label: 'LOAD', run: () => { load(x); A.pop(); } },
      { label: 'RENAME', run: () => A.ask({ tag: 'PROFILES', title: 'RENAME', label: 'Name', value: x.name, done: (v) => { x.name = v.trim() || x.name; if (p.current === x.id) A.cfg.profile.name = x.name; A.save(); refresh(); } }) },
      { label: 'PICTURE', run: () => A.pick('image').then((r) => { if (r.url) { x.avatar = r.url; if (p.current === x.id) A.cfg.profile.avatar = x.avatar; A.save(); refresh(); } }) },
      { label: 'GIVE IT THE LOOK I HAVE NOW', run: () => { x.look = SV.themes.snapshot(); A.save(); toast('Saved'); refresh(); } },
      ...(p.list.length > 1 ? [{ label: 'DELETE', danger: true, run: () => A.confirmMenu('Delete ' + x.name + '?', 'DELETE', () => { p.list = p.list.filter((y) => y !== x); if (p.current === x.id) p.current = p.list[0].id; A.save(); refresh(); }) }] : []),
    ]);
  }

  const swatch = (look) => {
    const t = (look && look.theme) || {};
    return `linear-gradient(135deg, ${t.accent || '#ff1f1f'}, ${t.accent2 || t.accent || '#ff4d3d'} 55%, ${t.bg || '#070505'})`;
  };

  // WHAT PROFILE TO LOAD: the main frame at start.
  function pick() {
    const p = P();
    let idx = Math.max(0, p.list.findIndex((x) => x.id === p.current));
    const root = el(`<div class="overlay center prof-overlay"><div class="picker wide prof-picker">
      <div class="picker-head"><div><div class="tag">[ SKYVAINT ]</div><h2>WHAT PROFILE TO LOAD?</h2></div><div class="picker-note">EACH ONE KEEPS ITS OWN LOOK</div></div>
      <div class="prof-cards"></div>
      <div class="hints">${A.hints([['confirm', 'Load'], ['move', 'Move'], ['options', 'Options'], ['back', 'Keep the current one']])}</div>
    </div></div>`);
    const box = root.querySelector('.prof-cards');
    const items = () => [...P().list, { add: true }];
    function build() {
      const list = items();
      idx = Math.min(idx, list.length - 1);
      box.innerHTML = list.map((x, i) => x.add
        ? `<button class="prof-card add ${i === idx ? 'focus' : ''}" data-i="${i}"><div class="prof-art"><b>+</b></div><span>NEW PROFILE</span><small>FROM THE LOOK YOU HAVE NOW</small></button>`
        : `<button class="prof-card ${i === idx ? 'focus' : ''} ${x.id === P().current ? 'now' : ''}" data-i="${i}">
            <div class="prof-art" style="background:${swatch(x.look)}">${x.avatar ? SV.media.html(x.avatar, 'prof-pic') : `<b>${esc((x.name || '?').slice(0, 1).toUpperCase())}</b>`}</div>
            <span>${esc(x.name.toUpperCase())}</span><small>${x.id === P().current ? 'LAST USED' : esc(((x.look && x.look.theme && x.look.theme.preset) || 'OWN LOOK').toUpperCase())}</small></button>`).join('');
    }
    const choose = (i) => {
      const x = items()[i];
      if (!x) return;
      if (x.add) return newProfile(() => { A.pop(); });
      audio.play('confirm');
      A.pop();
      load(x);
    };
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
    box.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; e.preventDefault(); const x = items()[+b.dataset.i]; if (x && !x.add) profileMenu(x, build); });
    build();
    A.push({
      el: root,
      action(a) {
        const n = items().length;
        if (a === 'left' || a === 'up') { idx = (idx - 1 + n) % n; audio.play('nav'); build(); }
        else if (a === 'right' || a === 'down') { idx = (idx + 1) % n; audio.play('nav'); build(); }
        else if (a === 'confirm') choose(idx);
        else if (a === 'options') { const x = items()[idx]; if (x && !x.add) profileMenu(x, build); }
        else if (a === 'back') A.pop();
      },
    });
  }

  // At start: once the opening is over and nothing else is open (the setup wizard on a fresh install goes first).
  SV.host.on('init', (m) => {
    if (!m.config) return;
    let tries = 0;
    const t = setInterval(() => {
      const c = A.cfg, b = document.body.classList;
      if (!c || ++tries > 120) return clearInterval(t);
      if (!(c.setup && c.setup.done)) return;
      if (!P().ask) return clearInterval(t);
      if (A.mode !== 'home' || !b.contains('entered') || b.contains('away') || A.stack.length || A.launching || document.querySelector('.fullvid')) return;
      clearInterval(t);
      pick();
    }, 500);
  });

  SV.features = { on, rows, pick, F, current };
})();

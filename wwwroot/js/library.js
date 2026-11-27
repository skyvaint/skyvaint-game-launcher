// LIBRARY (top bar): everything the launcher uses, in one place, ordered by section: pictures, GIFs, videos, sounds,
// fonts, your icons and widgets, games, profiles, and your data (folders, CONFIG SAVE). Click anything to USE it for
// any setting (a searchable list of every place it can go), open where the file is, play it, or see where it is used.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, toast } = A;

  const SECTIONS = [
    ['all', 'Everything'], ['image', 'Pictures'], ['gif', 'GIFs'], ['video', 'Videos'], ['audio', 'Sounds'], ['font', 'Fonts'],
    ['made', 'My icons and widgets'], ['games', 'Games'], ['profiles', 'Profiles'], ['data', 'Data and folders'],
  ];
  const kindOf = (u) => {
    const x = String(u).split('?')[0].toLowerCase();
    if (/\.gif$/.test(x)) return 'gif';
    if (/\.(mp4|webm|m4v|mov)$/.test(x)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|flac)$/.test(x)) return 'audio';
    if (/\.(ttf|otf|woff2?)$/.test(x)) return 'font';
    if (/\.(png|jpe?g|webp|avif|bmp|ico|svg)$/.test(x) || /^data:image\//.test(x)) return /^data:image\/gif/.test(x) ? 'gif' : 'image';
    return '';
  };
  const fileName = (u) => { try { return decodeURIComponent(String(u).split('?')[0].split('/').pop()) || u; } catch { return u; } };
  // Where in the settings a path points, in words.
  function where(path) {
    const c = A.cfg, p = path.split('.');
    if (p[0] === 'games') { const g = c.games[+p[1]]; return `${g ? g.name : 'A game'} · ${p.slice(2).join(' ')}`; }
    if (p[0] === 'home' && p[1] === 'icons') { const i = (c.home.icons || [])[+p[2]]; return `HOME icon · ${i ? i.name || '' : ''}`; }
    if (p[0] === 'nexus') return 'NEXUS bar';
    if (p[0] === 'widgets') return 'Desktop widget';
    if (p[0] === 'creator') return 'Creator';
    if (p[0] === 'profiles') return 'Profile look';
    if (p[0] === 'themes') return 'Theme';
    if (p[0] === 'sound') return 'Sound · ' + p.slice(1).join(' ');
    return p.join(' › ');
  }

  // Every picture, GIF, video, sound and font named anywhere in the settings, with every place it is used.
  function collect() {
    const found = new Map();
    const walk = (v, path, depth) => {
      if (depth > 12 || v == null) return;
      if (typeof v === 'string') {
        const k = kindOf(v);
        if (k && (/^https?:\/\//.test(v) || /^data:/.test(v) || /^[a-z]:\\/i.test(v))) {
          const e = found.get(v) || { url: v, kind: k, used: [] };
          e.used.push(path);
          found.set(v, e);
        }
        return;
      }
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, path + '.' + i, depth + 1));
      if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'library') walk(x, path ? path + '.' + k : k, depth + 1);
    };
    walk(A.cfg, '', 0);
    // The sound folder you loaded (Settings → Sound) counts too, used or not.
    for (const s of (A.cfg.sound && A.cfg.sound.library) || []) if (!found.has(s.url)) found.set(s.url, { url: s.url, kind: 'audio', used: [], name: s.name });
    return [...found.values()];
  }

  // ------------------------------------------------------------------ the places an asset can be used

  function slots(kind) {
    const c = A.cfg, list = [];
    const add = (group, label, kinds, set, get) => { if (kinds.includes(kind)) list.push({ group, label, set, now: get && get() }); };
    const P = (path) => ({ get: () => path.split('.').reduce((o, k) => (o ? o[k] : undefined), c), set: (v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] = o[k] || {}), c)[last] = v; } });
    const S = (group, label, kinds, path) => { const p = P(path); add(group, label, kinds, p.set, p.get); };
    const pic = ['image', 'gif'], vid = ['video'], media = ['image', 'gif', 'video'];
    S('HOME', 'Backdrop picture', media, 'backdrop.image');
    S('HOME', 'Backdrop video', vid, 'backdrop.video');
    S('PROFILE', 'Profile picture', pic, 'profile.avatar');
    S('OPENING', 'Opening sound', ['audio'], 'fx.introSound');
    S('OPENING', 'Opening video', vid, 'fx.introVideo');
    S('LAUNCH', 'Launch video (every game)', vid, 'fx.launchVideo');
    S('LAUNCH', 'Transition video', vid, 'fx.transitionVideo');
    add('DESKTOP', 'Desktop wallpaper (every screen)', media, (v) => { c.desktop = c.desktop || {}; c.desktop.all = c.desktop.all || {}; c.desktop.all.src = v; c.desktop.all.kind = kind === 'video' ? 'video' : 'image'; c.desktop.enabled = true; });
    S('FONTS', 'Headline font', ['font'], 'theme.fontFile');
    const SOUNDS = [['nav', 'Navigation'], ['confirm', 'Confirm / click'], ['back', 'Back'], ['open', 'Panel opens'], ['toggle', 'Switch'], ['pick', 'Added'], ['star', 'Reward'], ['error', 'Error'], ['slam', 'Wipe'], ['boot', 'Start-up'], ['launch', 'Game launch']];
    for (const [e, l] of SOUNDS) add('SOUNDS', 'Sound · ' + l, ['audio'], (v) => { c.sound.custom = c.sound.custom || {}; c.sound.custom[e] = v; });
    add('SOUNDS', 'Click sound for HOME widgets', ['audio'], (v) => { c.home.widgetFx = { ...(c.home.widgetFx || {}), sound: v }; });
    for (const g of c.games || []) {
      for (const [k, l, kinds] of [['cover', 'cover', media], ['hero', 'banner', media], ['icon', 'icon', pic], ['launchVideo', 'launch video', vid]])
        add('GAMES', `${g.name} · ${l}`, kinds, (v) => (A.setThemeArt ? A.setThemeArt(g, k, v) : (g[k] = v)));
      add('GAMES', `${g.name} · start sound`, ['audio'], (v) => { g.startSound = v; });
    }
    for (const i of (c.home.icons || [])) add('HOME ICONS', `${i.name || 'Icon'} · picture`, media, (v) => { i.icon = v; });
    for (const w of (c.home.widgets || [])) {
      if (w.kind === 'picture') add('HOME WIDGETS', 'Picture widget', media, (v) => { w.image = v; });
      add('HOME WIDGETS', `${w.kind} widget · click sound`, ['audio'], (v) => { w.sound = v; });
    }
    for (const bar of [c.nexus, ...((c.nexus && c.nexus.bars) || [])].filter(Boolean))
      for (const it of bar.items || []) add('NEXUS BAR', `${it.name || 'Button'} · icon`, pic, (v) => { it.icon = v; it.customIcon = true; });
    for (const w of ((c.widgets || {}).items || [])) if (w.apps && w.apps[0]) add('DESKTOP WIDGETS', `${w.apps[0].name || 'Icon'} · picture`, pic, (v) => { w.apps[0].icon = v; });
    return list;
  }

  // A searchable list: type to find any setting or app, ENTER or click to choose.
  function picker(title, items, choose) {
    const root = el(`<div class="overlay lib-pick"><div class="sheet narrow"><div class="sheet-head"><div><div class="tag">[ USE IT FOR ]</div><h2>${esc(title)}</h2></div></div>
      <input class="text lib-q" type="text" spellcheck="false" placeholder="Search settings, games, apps…"><div class="lib-list"></div></div></div>`);
    const q = root.querySelector('.lib-q'), box = root.querySelector('.lib-list');
    let at = 0, shown = [];
    const paint = () => {
      const t = q.value.trim().toLowerCase();
      shown = items.filter((x) => !t || (x.group + ' ' + x.label).toLowerCase().includes(t));
      at = Math.min(at, Math.max(0, shown.length - 1));
      let last = '';
      box.innerHTML = shown.map((x, i) => `${x.group !== last ? `<div class="tag lib-g">[ ${esc(last = x.group)} ]</div>` : ''}<button class="lib-it ${i === at ? 'on' : ''}" data-i="${i}"><b>${esc(x.label)}</b>${x.now ? '<small>IN USE: ' + esc(fileName(x.now)) + '</small>' : ''}</button>`).join('') || '<div class="row-note">Nothing matches.</div>';
    };
    q.addEventListener('input', () => { at = 0; paint(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { at = Math.min(shown.length - 1, at + 1); paint(); box.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { at = Math.max(0, at - 1); paint(); box.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[at]) { const x = shown[at]; A.pop(); choose(x); }
      else if (e.key === 'Escape') A.pop();
      e.stopPropagation();
    });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const x = shown[+b.dataset.i]; A.pop(); choose(x); });
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    paint();
    A.push({ el: root, action: (a) => { if (a === 'back') A.pop(); } });
    setTimeout(() => q.focus(), 60);
  }

  function useAsset(a) {
    const list = slots(a.kind);
    if (!list.length) return toast('Nothing takes this kind of file.', 'bad');
    picker(a.name || fileName(a.url), list, (x) => { x.set(a.url); A.changed('games'); audio.play('confirm'); toast(`${a.name || fileName(a.url)} → ${x.label}`); refresh(); });
  }

  function assetMenu(a) {
    if (a.kind === 'audio' && audio.preview) audio.preview(a.url);
    A.openMenu(a.name || fileName(a.url), [
      { label: 'USE IT FOR…', sub: 'Search every setting, game and app it can go in', run: () => setTimeout(() => useAsset(a), 60) },
      ...(a.kind === 'audio' ? [{ label: '▶ PLAY', run: () => { audio.preview(a.url); setTimeout(() => assetMenu(a), 60); } }] : []),
      { label: 'OPEN FILE LOCATION', sub: /^https?:\/\/media\./.test(a.url) ? 'In the launcher\'s media folder' : /^[a-z]:\\/i.test(a.url) ? a.url : 'It is on the web: opens the link', run: () => host.send('revealAsset', { url: a.url }) },
      ...(a.used.length ? [{ label: `USED IN ${a.used.length} PLACE${a.used.length === 1 ? '' : 'S'}`, sub: a.used.slice(0, 3).map(where).join(' · '), run: () => {} }] : []),
    ]);
  }

  // ------------------------------------------------------------------ the screen

  let root = null, section = 'all', query = '', dirs = null;
  host.on('dataDirs', (m) => { dirs = m.dirs || []; if (root && section === 'data') refresh(); });
  host.on('configSaved', (m) => { if (m.error) toast('CONFIG SAVE failed: ' + m.error, 'bad'); else { toast(`Saved ${m.mb} MB to ${m.path}`); audio.play('star'); } if (root) refresh(); });

  function cards() {
    const c = A.cfg, t = query.trim().toLowerCase();
    const match = (s) => !t || String(s).toLowerCase().includes(t);
    if (section === 'games') return c.games.filter((g) => match(g.name)).map((g) => `<button class="lib-card" data-game="${esc(g.id)}"><i class="lib-th">${A.artSrc && A.artSrc(g, 'cover') ? `<img src="${esc(A.artSrc(g, 'cover'))}" loading="lazy" alt="">` : ''}</i><b>${esc(g.name)}</b><small>${esc((g.platform || '').toUpperCase())}</small></button>`);
    if (section === 'profiles') return ((c.profiles && c.profiles.list) || []).filter((p) => match(p.name)).map((p) => `<button class="lib-card" data-profile="${esc(p.id)}"><i class="lib-th round">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc((p.name || 'P')[0])}</i><b>${esc(p.name)}</b><small>${p.id === c.profiles.current ? 'IN USE' : 'PROFILE'}</small></button>`);
    if (section === 'made') {
      const cr = c.creator || {};
      return [...(cr.icons || []).filter((i) => match(i.name)).map((i) => `<button class="lib-card" data-asset="${esc(i.url)}" data-name="${esc(i.name)}"><i class="lib-th"><img src="${esc(i.url)}" alt=""></i><b>${esc(i.name)}</b><small>MY ICON</small></button>`),
        ...(cr.widgets || []).filter((w) => match(w.name)).map((w) => `<button class="lib-card" data-widget="${esc(w.id)}"><i class="lib-th wk">${window.SVW ? SVW.render(w.spec, {}) : ''}</i><b>${esc(w.name)}</b><small>MY WIDGET</small></button>`)];
    }
    if (section === 'font') {
      const fonts = ['Inter Tight', 'Chakra Petch', 'JetBrains Mono', 'Anton', 'Bebas Neue', 'Manrope', 'Rajdhani', 'Orbitron', 'Russo One', 'Black Ops One', 'Press Start 2P'];
      const own = collect().filter((a) => a.kind === 'font');
      return [...fonts.filter(match).map((f) => `<button class="lib-card" data-font="${esc(f)}"><i class="lib-th font" style="font-family:'${esc(f)}'">Aa</i><b>${esc(f)}</b><small>${A.cfg.theme.fontName === f ? 'HEADLINES' : 'FONT'}</small></button>`),
        ...own.filter((a) => match(a.url)).map((a) => `<button class="lib-card" data-asset="${esc(a.url)}"><i class="lib-th font">Aa</i><b>${esc(fileName(a.url))}</b><small>YOUR FONT FILE</small></button>`)];
    }
    if (section === 'data') {
      if (!dirs && host.native) host.send('dataDirs');
      return [`<button class="lib-card wide save" data-save="1"><i class="lib-th">⬇</i><b>CONFIG SAVE</b><small>Settings, pictures, sign-ins and cookies in one zip</small></button>`,
        ...(dirs || []).filter((d) => match(d.name + d.path)).map((d) => `<button class="lib-card wide" data-dir="${esc(d.path)}"><i class="lib-th">▤</i><b>${esc(d.name)}</b><small>${esc(d.path)}${d.mb != null ? ' · ' + d.mb + ' MB' : ''}</small></button>`)];
    }
    return collect().filter((a) => (section === 'all' || a.kind === section) && match((a.name || '') + ' ' + a.url + ' ' + a.used.map(where).join(' '))).map((a) => {
      const th = a.kind === 'audio' ? '<i class="lib-th">♪</i>' : a.kind === 'video' ? `<i class="lib-th"><video src="${esc(a.url)}" muted preload="metadata"></video></i>` : a.kind === 'font' ? '<i class="lib-th font">Aa</i>' : `<i class="lib-th"><img src="${esc(a.url)}" loading="lazy" alt=""></i>`;
      return `<button class="lib-card" data-asset="${esc(a.url)}">${th}<b>${esc(a.name || fileName(a.url))}</b><small>${a.used.length ? esc(where(a.used[0])) + (a.used.length > 1 ? ` +${a.used.length - 1}` : '') : 'NOT USED YET'}</small></button>`;
    });
  }

  function refresh() {
    if (!root) return;
    const counts = {};
    for (const a of collect()) { counts[a.kind] = (counts[a.kind] || 0) + 1; counts.all = (counts.all || 0) + 1; }
    root.querySelector('.lib-nav').innerHTML = SECTIONS.map(([k, l]) => `<button data-s="${k}" class="${k === section ? 'on' : ''}">${esc(l)}${counts[k] ? `<small>${counts[k]}</small>` : ''}</button>`).join('');
    const list = cards();
    root.querySelector('.lib-grid').innerHTML = list.join('') || '<div class="row-note">Nothing here yet.</div>';
    root.querySelector('.lib-count').textContent = list.length + ' ' + (SECTIONS.find((s) => s[0] === section) || ['', ''])[1].toUpperCase();
    // Videos show a still frame; hovering plays them.
    root.querySelectorAll('.lib-th video').forEach((v) => { const c = v.closest('.lib-card'); c.onmouseenter = () => v.play().catch(() => {}); c.onmouseleave = () => v.pause(); });
  }

  function open(at) {
    if (at) section = at;
    while (A.stack.length) A.pop();
    root = el(`<div class="overlay library"><div class="lib-wrap">
      <div class="lib-side"><div class="tag">[ SKYVAINT ]</div><h2>LIBRARY</h2><div class="lib-nav"></div></div>
      <div class="lib-main"><div class="lib-top"><input class="text lib-search" type="text" spellcheck="false" placeholder="Search everything: files, games, settings…"><span class="tag lib-count"></span><button class="btn small ghost" data-x>CLOSE</button></div>
      <div class="lib-grid"></div></div></div></div>`);
    const search = root.querySelector('.lib-search');
    search.addEventListener('input', () => { query = search.value; refresh(); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') A.pop(); e.stopPropagation(); });
    root.querySelector('[data-x]').addEventListener('click', () => A.pop());
    root.querySelector('.lib-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; section = b.dataset.s; audio.play('nav'); refresh(); });
    root.querySelector('.lib-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.lib-card');
      if (!b) return;
      audio.play('confirm');
      const c = A.cfg;
      if (b.dataset.save) { if (!host.native) return toast('CONFIG SAVE works inside the launcher app.'); toast('Saving… this can take a minute.'); return host.send('configSave'); }
      if (b.dataset.dir) return host.send('openPath', { path: b.dataset.dir });
      if (b.dataset.game) { const g = c.games.find((x) => x.id === b.dataset.game); return A.openMenu(g.name, [
        { label: 'RENAME', sub: g.name, run: () => setTimeout(() => A.ask({ tag: 'GAME', title: 'RENAME', label: 'Name', value: g.name, done: (v) => { if (v.trim()) { g.name = v.trim(); A.changed('games'); refresh(); } } }), 60) },
        { label: 'PICTURES', sub: 'Cover, banner, icon and launch video', run: () => { A.pop && A.openSettings('icons'); } },
        { label: 'PLAY', run: () => { A.pop(); A.launch(g); } },
      ]); }
      if (b.dataset.profile) { const p = (c.profiles.list || []).find((x) => x.id === b.dataset.profile); return A.openMenu(p.name, [
        { label: 'RENAME', run: () => setTimeout(() => A.ask({ tag: 'PROFILE', title: 'RENAME', label: 'Name', value: p.name, done: (v) => { if (v.trim()) { p.name = v.trim(); if (p.id === c.profiles.current) c.profile.name = p.name; A.changed(); refresh(); } } }), 60) },
        { label: 'SWITCH PROFILES', run: () => { A.pop(); SV.features.pick(); } },
      ]); }
      if (b.dataset.widget) { const w = ((c.creator || {}).widgets || []).find((x) => x.id === b.dataset.widget); return SV.creator && SV.creator.widgetCreator(w, refresh); }
      if (b.dataset.font) return A.openMenu(b.dataset.font, [
        { label: 'USE FOR HEADLINES', run: () => { c.theme.font = 'g:' + b.dataset.font; c.theme.fontName = b.dataset.font; A.changed(); toast('Headlines: ' + b.dataset.font); refresh(); } },
        { label: 'USE FOR TEXT AND MENUS', run: () => { c.theme.bodyFont = 'g:' + b.dataset.font; A.changed(); toast('Text: ' + b.dataset.font); } },
        { label: 'USE FOR SMALL LABELS', run: () => { c.theme.monoFont = 'g:' + b.dataset.font; A.changed(); toast('Labels: ' + b.dataset.font); } },
      ]);
      if (b.dataset.asset) {
        const a = collect().find((x) => x.url === b.dataset.asset) || { url: b.dataset.asset, kind: kindOf(b.dataset.asset) || 'image', used: [], name: b.dataset.name };
        if (b.dataset.name) a.name = b.dataset.name;
        assetMenu(a);
      }
    });
    A.push({ el: root, action: (a) => { if (a === 'back') A.pop(); }, onClose: () => { root = null; } });
    refresh();
    setTimeout(() => search.focus(), 80);
  }

  SV.library = { open, collect };
})();

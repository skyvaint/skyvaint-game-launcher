// EXPLORE: things other people made, to try on in one click, like Rainmeter's skin sites.
//   THEMES        whole looks (the same codes as the SHOP)
//   CARD DESIGNS  how the covers in the compact launcher look (shape, corners, border, glow, hover)
//   WIDGETS       desktop widgets (Settings → WIDGETS), ready-made
//   RAINMETER     your Rainmeter skins, each switched on and off from here, and new .rmskin files added through
//                 Rainmeter's own installer
// Other people's items come from the community list on GitHub (themes/catalog.json); yours can be shared back.
// Anything can say what it needs ("requirements: REMATCH"). Without that game it can't be used, but its pictures
// can still be taken as an image pack.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, toast } = A;
  const CATALOG = 'https://raw.githubusercontent.com/skyvaint/skyvaint-game-launcher/main/themes/catalog.json';
  const newId = () => Math.random().toString(36).slice(2, 10);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- requirements and image packs

  // A game counts as there when it is in your games and installed.
  function hasGame(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return true;
    return A.cfg.games.some((g) => {
      const gn = String(g.name || '').toLowerCase();
      return (gn === n || gn.includes(n) || n.includes(gn)) && gn.length > 1 && A.isInstalled(g);
    });
  }
  function meets(req) {
    const games = (req && Array.isArray(req.games) ? req.games : []).filter(Boolean);
    const missing = games.filter((g) => !hasGame(g));
    return { ok: !missing.length, missing };
  }
  // Before using something: fine, or a menu saying what is missing, with its pictures as a way out.
  function gate(req, name, onPack) {
    const m = meets(req);
    if (m.ok) return true;
    audio.play('error');
    A.openMenu(String(name || '').toUpperCase(), [
      { label: 'GET AS IMAGE PACK', sub: 'Its pictures in a folder, so you still have them', run: onPack },
      { label: 'OK' },
    ], `This needs ${m.missing.join(', ')} on this PC. Install it (Settings → INSTALLATION or its store), then it shows up.`);
    return false;
  }
  function edit(x, after) {
    A.ask({
      tag: 'REQUIREMENTS', title: x.name, label: 'Games it needs (commas between them)', placeholder: 'REMATCH, Rocket League',
      value: (x.req && x.req.games || []).join(', '), button: 'SAVE',
      done: (v) => {
        const games = v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
        if (games.length) x.req = { games }; else delete x.req;
        A.save();
        toast(games.length ? 'Needs ' + games.join(', ') : 'No requirements');
        after && after();
      },
    });
  }
  // Every picture or video in a look (game art, wallpapers, avatars…), plus any extra links.
  function pictures(data, extra) {
    const out = new Set();
    const isPic = (s) => typeof s === 'string' && (/media\.skyvaint\.example\//.test(s) || /^https:\/\/\S+\.(png|jpe?g|webp|gif|avif|bmp|ico|mp4|webm)(\?|#|$)/i.test(s));
    const walk = (o) => { if (!o) return; if (typeof o === 'string') { if (isPic(o)) out.add(o); return; } if (typeof o === 'object') for (const v of Object.values(o)) walk(v); };
    walk(data);
    (extra || []).forEach(walk);
    return [...out].slice(0, 120);
  }
  function pack(name, data, extra) {
    const urls = pictures(data, extra);
    if (!urls.length) return toast('No pictures in ' + name + '.', 'bad');
    if (!host.native) return toast(`${urls.length} pictures would be saved (only inside the launcher app).`);
    host.send('imagePack', { name, urls });
    toast(`Saving ${urls.length} pictures from ${name}…`);
  }
  host.on('imagePacked', (m) => toast(m.ok ? `Image pack ready: ${m.count} pictures in ${m.folder}` : (m.error || "Couldn't make the image pack"), m.ok ? '' : 'bad'));
  SV.reqs = { meets, gate, edit, pack, hasGame };

  // ---------------------------------------------------------------- card designs (the compact launcher's covers)

  const CARD_DEFAULT = { shape: 'tall', radius: 0.55, border: 'white', glow: false, hover: 'lift', names: true };
  const CARDS = [
    { id: 'k-epic', name: 'Store', by: 'Skyvaint', card: { ...CARD_DEFAULT } },
    { id: 'k-glow', name: 'Neon glow', by: 'Skyvaint', card: { shape: 'tall', radius: 1, border: 'accent', glow: true, hover: 'grow', names: true } },
    { id: 'k-sharp', name: 'Sharp', by: 'Skyvaint', card: { shape: 'tall', radius: 0, border: 'white', glow: false, hover: 'lift', names: true } },
    { id: 'k-square', name: 'Square tiles', by: 'Skyvaint', card: { shape: 'square', radius: 0.9, border: 'white', glow: false, hover: 'grow', names: false } },
    { id: 'k-wide', name: 'Wide banners', by: 'Skyvaint', card: { shape: 'wide', radius: 0.6, border: 'white', glow: false, hover: 'lift', names: true } },
    { id: 'k-tilt', name: 'Tilt', by: 'Skyvaint', card: { shape: 'tall', radius: 0.8, border: 'accent', glow: true, hover: 'tilt', names: true } },
  ];
  const cardNow = () => ({ ...CARD_DEFAULT, ...(A.cfg.home.gvCard || {}) });
  function applyCard(card) {
    A.cfg.home.gvCard = { ...CARD_DEFAULT, ...card };
    syncCard();
    A.changed();
    audio.play('pick');
  }
  // The compact launcher reads these classes and variables.
  function syncCard() {
    const c = cardNow(), b = document.body;
    b.dataset.gvShape = c.shape; b.dataset.gvBorder = c.border; b.dataset.gvHover = c.hover;
    b.classList.toggle('gv-glow', !!c.glow);
    b.classList.toggle('gv-nonames', c.names === false);
    b.style.setProperty('--gv-r', (Math.max(0, Math.min(1.6, +c.radius || 0))).toFixed(2) + 'rem');
  }
  host.on('init', () => setTimeout(syncCard, 0));

  // ---------------------------------------------------------------- widgets (desktop)

  const WIDGETS = [
    { id: 'w-clock', name: 'Glass clock', by: 'Skyvaint', widget: { kind: 'clock', style: 'glass', scale: 1.2 } },
    { id: 'w-perf', name: 'PC meter', by: 'Skyvaint', widget: { kind: 'perf', style: 'glass', scale: 1 } },
    { id: 'w-date', name: 'Big date', by: 'Skyvaint', widget: { kind: 'date', style: 'none', scale: 1.4 } },
    { id: 'w-music', name: 'Now playing', by: 'Skyvaint', widget: { kind: 'music', style: 'glass', scale: 1 } },
  ];
  const SAFE_W = ['kind', 'style', 'scale', 'opacity', 'radius', 'bgColor', 'textColor', 'hover', 'clock24', 'text', 'label', 'date', 'visibility', 'font', 'showName', 'iconSize'];
  function addWidget(def) {
    const W = A.cfg.widgets || (A.cfg.widgets = { items: [], locked: true });
    const w = { id: newId(), enabled: true, visibility: 'desktop', style: 'glass', scale: 1, opacity: 0.92, apps: [], radius: 16, x: Math.round(screen.availWidth - 420), y: 60 + W.items.length * 170 };
    for (const k of SAFE_W) if (def[k] !== undefined) w[k] = def[k];
    if (!w.kind) return toast("That widget can't be added.", 'bad');
    W.items.push(w);
    A.changed();
    audio.play('pick');
    toast('Widget added to your desktop · Settings → WIDGETS to move or change it');
  }

  // ---------------------------------------------------------------- other people's things (the community list)

  let community = null, state = '';
  async function load() {
    if (community || state === 'loading') return;
    state = 'loading';
    try {
      const r = await fetch(CATALOG + '?t=' + Math.floor(Date.now() / 3.6e6), { cache: 'no-store' });
      const json = r.ok ? await r.json() : {};
      const list = Array.isArray(json) ? json : [...(json.themes || []), ...(json.items || [])];
      community = { theme: [], cards: [], widget: [], rainmeter: [] };
      for (const it of list.slice(0, 200)) {
        const kind = it.kind || 'theme';
        const req = it.req && Array.isArray(it.req.games) ? { games: it.req.games.map(String).slice(0, 8) } : undefined;
        const base = { id: 'c-' + (it.id || it.name), name: String(it.name || 'Untitled').slice(0, 40), by: String(it.by || '').slice(0, 30), preview: /^https:/.test(it.preview || '') ? it.preview : '', req,
          images: Array.isArray(it.images) ? it.images.filter((u) => /^https:/.test(u)).slice(0, 60) : [] };
        try {
          if (kind === 'theme' && it.code) { const th = await SV.themes.fromCode(it.code); community.theme.push({ ...th, ...base, data: th.data, req: req || th.req }); }
          else if (kind === 'cards' && it.card) community.cards.push({ ...base, card: it.card });
          else if (kind === 'widget' && it.widget) community.widget.push({ ...base, widget: it.widget });
          else if (kind === 'rainmeter' && /^https:\/\/\S+\.rmskin(\?|$)/i.test(it.rmskin || '')) community.rainmeter.push({ ...base, rmskin: it.rmskin, desc: String(it.desc || '').slice(0, 160) });
        } catch {}
      }
      state = 'ok';
    } catch { community = { theme: [], cards: [], widget: [], rainmeter: [] }; state = 'offline'; }
    paint();
  }

  // ---------------------------------------------------------------- Rainmeter on this PC

  let rm = null; // { found, skins: [{ config, files, active }], error }
  host.on('rmList', (m) => { rm = m; paint(); });
  host.on('rmDone', (m) => { toast(m.text || 'Done', m.ok ? '' : 'bad'); host.send('rmList'); });

  // ---------------------------------------------------------------- the page

  const TABS = [['theme', 'Themes'], ['cards', 'Card designs'], ['widget', 'Widgets'], ['rainmeter', 'Rainmeter']];
  let root = null, tab = 'theme', query = '', showLocked = false;

  function open(first) {
    if (first) tab = first;
    load();
    if (tab === 'rainmeter' || !rm) host.send('rmList');
    root = el(`<div class="overlay ex-screen"><div class="ex">
      <header class="ex-head"><div><div class="tag">[ EXPLORE ]</div><h2>Explore</h2></div>
        <nav class="ex-tabs">${TABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</nav>
        <label class="gv-search ex-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="text" spellcheck="false" placeholder="Search"></label></header>
      <div class="ex-tools"></div>
      <div class="ex-grid"></div>
      <footer class="ex-foot"></footer>
    </div></div>`);
    root.querySelector('.ex-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; audio.play('nav'); if (tab === 'rainmeter') host.send('rmList'); paint(); } });
    const s = root.querySelector('.ex-search input');
    s.addEventListener('input', () => { query = s.value.trim().toLowerCase(); paint(); });
    s.addEventListener('keydown', (e) => e.stopPropagation());
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    A.push({ el: root, onClose: () => { root = null; }, action: (a) => { if (a === 'back') A.pop(); else if (a === 'tabNext' || a === 'tabPrev') { const i = TABS.findIndex(([k]) => k === tab); tab = TABS[(i + (a === 'tabNext' ? 1 : TABS.length - 1)) % TABS.length][0]; paint(); } } });
    paint();
  }

  const match = (x) => !query || (x.name + ' ' + (x.by || '')).toLowerCase().includes(query);
  const needs = (x) => { const m = meets(x.req); return m.ok ? '' : 'NEEDS ' + m.missing.join(', ').toUpperCase(); };

  function themePreview(th) { return SV.themes.art(th); }
  function cardPreview(c) {
    const k = { ...CARD_DEFAULT, ...c };
    const ratio = k.shape === 'square' ? '1' : k.shape === 'wide' ? '16 / 9' : '3 / 4';
    const bd = k.border === 'none' ? 'none' : k.border === 'accent' ? '2px solid var(--accent)' : '2px solid #fff';
    return `<div class="ex-cardprev"><i style="aspect-ratio:${ratio};border-radius:${Math.min(1.6, +k.radius || 0)}rem;outline:${bd};${k.glow ? 'box-shadow:0 0 1.2rem var(--accent);' : ''}"></i><i style="aspect-ratio:${ratio};border-radius:${Math.min(1.6, +k.radius || 0)}rem"></i></div>`;
  }
  const GLYPH = { clock: '🕒', perf: '📈', date: '📅', music: '🎵', note: '📝', countdown: '⏳', apps: '▦', icon: '◻', custom: '✦' };

  function items() {
    const com = community || { theme: [], cards: [], widget: [], rainmeter: [] };
    if (tab === 'theme') return [
      ...SV.themes.FEATURED.map((th) => ({ x: th, prev: themePreview(th), sub: 'FEATURED' })),
      ...com.theme.map((th) => ({ x: th, prev: th.preview ? `<img src="${esc(th.preview)}" loading="lazy" alt="">` : themePreview(th), sub: th.by ? 'BY ' + th.by.toUpperCase() : 'COMMUNITY' })),
      ...SV.themes.library.map((th) => ({ x: th, prev: themePreview(th), sub: 'YOURS', mine: true })),
    ];
    if (tab === 'cards') return [...CARDS, ...com.cards].map((c) => ({ x: c, prev: c.preview ? `<img src="${esc(c.preview)}" loading="lazy" alt="">` : cardPreview(c.card), sub: c.by ? 'BY ' + c.by.toUpperCase() : '' }));
    if (tab === 'widget') return [...WIDGETS, ...com.widget].map((w) => ({ x: w, prev: w.preview ? `<img src="${esc(w.preview)}" loading="lazy" alt="">` : `<em class="ex-glyph">${GLYPH[w.widget.kind] || '✦'}</em>`, sub: (w.by ? 'BY ' + w.by.toUpperCase() : '') }));
    return (com.rainmeter || []).map((r) => ({ x: r, prev: r.preview ? `<img src="${esc(r.preview)}" loading="lazy" alt="">` : '<em class="ex-glyph">💧</em>', sub: r.by ? 'BY ' + r.by.toUpperCase() : 'RAINMETER SKIN' }));
  }

  function paint() {
    if (!root) return;
    root.querySelectorAll('.ex-tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const tools = root.querySelector('.ex-tools'), grid = root.querySelector('.ex-grid'), foot = root.querySelector('.ex-foot');
    const all = items().filter((i) => match(i.x));
    const locked = all.filter((i) => !meets(i.x.req).ok);
    const shown = showLocked ? all : all.filter((i) => meets(i.x.req).ok);
    tools.innerHTML = '';
    const btn = (label, fn, primary) => { const b = el(`<button class="btn small ${primary ? 'primary' : ''}">${esc(label)}</button>`); b.onclick = fn; tools.append(b); };
    if (tab === 'theme') { btn('Insert a code', () => SV.themes.open()); btn('Save my look', () => SV.themes.open()); }
    if (tab === 'cards') { btn('Share my card design', () => shareCard()); btn('Back to default', () => { applyCard(CARD_DEFAULT); paint(); }); }
    if (tab === 'widget') btn('My widgets', () => { while (A.stack.length) A.pop(); A.openSettings('widgets'); });
    if (locked.length) btn(showLocked ? `Hide ${locked.length} I can't use` : `Show ${locked.length} that need a game`, () => { showLocked = !showLocked; paint(); });

    if (tab === 'rainmeter') return paintRainmeter(grid, foot, shown);
    grid.innerHTML = shown.map((i, n) => `<button class="ex-card ${needs(i.x) ? 'locked' : ''} ${isOn(i.x) ? 'on' : ''}" data-n="${n}"><span class="ex-prev">${i.prev}</span><b>${esc(i.x.name)}</b><small>${esc([needs(i.x), isOn(i.x) ? 'ON' : '', i.sub].filter(Boolean).join(' · '))}</small></button>`).join('')
      || `<div class="ex-empty">${state === 'loading' ? 'Loading…' : state === 'offline' ? "Can't reach the community list right now." : 'Nothing here yet.'}</div>`;
    grid.querySelectorAll('.ex-card').forEach((b) => b.addEventListener('click', () => choose(shown[+b.dataset.n])));
    foot.textContent = tab === 'theme' ? 'Share yours from the SHOP: SHARE CODE → PUT IT IN THE COMMUNITY SHOP.'
      : tab === 'cards' ? 'Card designs change the covers in the compact launcher.'
      : 'Widgets go on your desktop. Add as many as you like, then move them in Settings → WIDGETS.';
  }
  const isOn = (x) => (x.card && JSON.stringify({ ...CARD_DEFAULT, ...x.card }) === JSON.stringify(cardNow())) || (x.data && SV.themes.library.some((t) => t.id === x.id) && A.cfg.themes && A.cfg.themes.current === x.id);

  function choose(i) {
    const x = i.x;
    const packIt = () => pack(x.name, x.data || x.card || x.widget, [...(x.images || []), x.preview]);
    if (tab === 'theme') {
      return A.openMenu(x.name.toUpperCase(), [
        { label: 'APPLY', sub: 'BACK in the SHOP returns to your look', run: () => { SV.themes.apply(x); paint(); } },
        ...(!i.mine ? [{ label: 'GET', sub: 'Keep it in your themes', run: () => { if (!gate(x.req, x.name, packIt)) return; SV.themes.add({ ...clone(x), id: newId(), at: Date.now() }); toast(x.name + ' added to your themes'); paint(); } }] : []),
        { label: 'GET AS IMAGE PACK', sub: 'Only its pictures, in a folder', run: packIt },
      ], [x.by ? 'By ' + x.by : '', needs(x) ? needs(x).toLowerCase().replace(/^needs/, 'Needs') : ''].filter(Boolean).join(' · '));
    }
    if (!gate(x.req, x.name, packIt)) return;
    if (tab === 'cards') { applyCard(x.card); toast(x.name + ' is on'); return paint(); }
    if (tab === 'widget') return addWidget(x.widget);
    if (tab === 'rainmeter') return A.confirmMenu(`Install ${x.name}?`, 'INSTALL', () => host.send('rmInstall', { url: x.rmskin, name: x.name }));
  }

  function shareCard() {
    const json = JSON.stringify({ kind: 'cards', name: 'My card design', by: A.cfg.profile.name || '', card: cardNow() }, null, 2);
    try { navigator.clipboard.writeText(json); } catch {}
    const url = 'https://github.com/skyvaint/skyvaint-game-launcher/issues/new?labels=explore&title=' + encodeURIComponent('Card design: ') + '&body=' + encodeURIComponent('For EXPLORE → Card designs\n\n```json\n' + json + '\n```');
    A.openMenu('SHARE MY CARD DESIGN', [{ label: 'PUT IT IN EXPLORE', sub: 'Opens GitHub with it filled in; you press submit', run: () => host.send('openUrl', { url }) }, { label: 'COPIED', sub: 'It is on your clipboard too' }]);
  }

  // Rainmeter: your skins with on/off, new ones from a file, and community ones to install.
  function paintRainmeter(grid, foot, community) {
    const tools = root.querySelector('.ex-tools');
    const b = (label, fn, primary) => { const n = el(`<button class="btn small ${primary ? 'primary' : ''}">${esc(label)}</button>`); n.onclick = fn; tools.prepend(n); };
    b('Open Rainmeter', () => host.send('rmOpen'));
    b('Add a .rmskin file', () => A.pick('rmskin').then((f) => f && f.path && host.send('rmInstall', { path: f.path })), true);
    if (!host.native) { grid.innerHTML = '<div class="ex-empty">Rainmeter skins show here inside the launcher app.</div>'; foot.textContent = ''; return; }
    if (!rm) { grid.innerHTML = '<div class="ex-empty">Looking for Rainmeter…</div>'; return; }
    if (!rm.found) {
      grid.innerHTML = '<div class="ex-empty">Rainmeter isn\'t installed. Get it in Settings → INSTALLATION (one click), then come back.</div>';
      foot.textContent = '';
      return;
    }
    const skins = (rm.skins || []).filter((s) => !query || s.config.toLowerCase().includes(query));
    grid.innerHTML = `<div class="ex-rm">${skins.map((s, n) => `<div class="ex-rm-row ${s.active ? 'on' : ''}"><span><b>${esc(s.config)}</b><small>${esc(s.active ? 'ON · ' + s.active : s.files.length + (s.files.length === 1 ? ' skin' : ' skins'))}</small></span>
        ${s.files.length > 1 && !s.active ? `<select data-n="${n}">${s.files.map((f) => `<option>${esc(f)}</option>`).join('')}</select>` : ''}
        <button class="btn small ${s.active ? '' : 'primary'}" data-n="${n}">${s.active ? 'TURN OFF' : 'TURN ON'}</button></div>`).join('') || '<div class="ex-empty">No skins yet. Add a .rmskin file.</div>'}</div>`
      + (community.length ? `<div class="tag ex-sub">[ FROM THE COMMUNITY ]</div><div class="ex-grid inner">${community.map((i, n) => `<button class="ex-card" data-c="${n}"><span class="ex-prev">${i.prev}</span><b>${esc(i.x.name)}</b><small>${esc([needs(i.x), i.sub].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>` : '');
    grid.querySelectorAll('.ex-rm-row button').forEach((btn) => btn.addEventListener('click', () => {
      const s = skins[+btn.dataset.n], sel = grid.querySelector(`select[data-n="${btn.dataset.n}"]`);
      host.send('rmToggle', { config: s.config, file: s.active || (sel ? sel.value : s.files[0]), on: !s.active });
    }));
    grid.querySelectorAll('[data-c]').forEach((n) => n.addEventListener('click', () => choose(community[+n.dataset.c])));
    foot.textContent = 'Skins run in Rainmeter, on your desktop. A .rmskin can include plugins (programs): only install ones from people you trust. Rainmeter shows what is inside before it installs.';
  }

  // Settings → THEME
  function rows() {
    const { R } = A;
    return [R.button('Explore', 'Themes, card designs, widgets and Rainmeter skins, made by other people.', 'EXPLORE', () => { while (A.stack.length) A.pop(); open(); })];
  }

  SV.explore = { open, rows, syncCard, CARD_DEFAULT };
})();

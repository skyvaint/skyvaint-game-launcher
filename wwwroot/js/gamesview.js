// The compact launcher, laid out like the Epic Games Launcher: one page in a small rounded window.
// A header you can drag the window by, with Games, Roblox and Apps tabs, Settings and the window buttons; a grid of
// covers you can rearrange by dragging (like icons on a phone); and on the right a panel with the chosen one in a
// small frame and everything in a list. ENTER (or double-click, or PLAY) starts it straight away: no full-screen
// launch, only a short PS2-style aurora in the frame. Right-click a cover to change its picture or name, or hide it.
// The only effect is a slow PS2-style aurora behind it all. The opening is that aurora with your PS2 sound, and the
// panels fly in in 3D partway through.
// Turn it on or off in Settings → THEME → MODE. The classic HOME stays as it was when it is off.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, toast } = A;
  const H = () => A.cfg.home;
  const on = () => !!A.cfg && H().view === 'games';
  const active = () => on() && A.mode === 'home';
  let tab = 'games', sel = 0, query = '', sort = 'custom', root = null, mini = null, dragging = null;

  // ---- what is in each tab, in your order
  const robloxGame = () => A.cfg.games.find((g) => g.target === 'sv:roblox');
  const appsOf = () => ((A.cfg.nexus && A.cfg.nexus.items) || []).filter((it) => it.kind !== 'home');
  const hiddenApps = () => H().gvHidden || (H().gvHidden = []);
  function items() {
    let list;
    if (tab === 'roblox') {
      list = ((SV.roblox && SV.roblox.places()) || []).map((p, i) => ({ key: 'p' + p.placeId, kind: 'place', p, i, name: p.name, art: p.icon || '', last: p.lastPlayed || 0, sub: p.server ? 'PRIVATE SERVER' : 'ROBLOX' }));
    } else if (tab === 'apps') {
      const hid = hiddenApps();
      list = appsOf().filter((it) => !hid.includes(it.id)).map((it) => ({ key: it.id, kind: 'app', it, name: it.name, art: it.icon || '', last: 0,
        sub: { game: 'GAME', url: 'WEBSITE' }[it.kind] || 'APP' }));
    } else {
      list = A.cfg.games.filter((g) => !g.hidden).map((g) => ({ key: g.id, kind: 'game', g, name: g.name, art: A.artSrc(g, 'cover') || A.artSrc(g, 'hero') || A.artSrc(g, 'icon') || '',
        wide: A.artSrc(g, 'hero') || A.artSrc(g, 'cover') || '', last: (A.stats[g.id] || {}).lastPlayed || 0, sub: (g.platform || '').toUpperCase() }));
    }
    const order = (H().gamesOrder || {})[tab] || [];
    const at = (k) => { const i = order.indexOf(k); return i < 0 ? 1e6 : i; };
    if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'recent') list.sort((a, b) => b.last - a.last);
    else list.sort((a, b) => at(a.key) - at(b.key));
    const q = query.trim().toLowerCase();
    return q ? list.filter((x) => x.name.toLowerCase().includes(q)) : list;
  }
  const played = (x) => {
    if (x.kind === 'app') return x.it.target || '';
    if (!x.last) return 'NEVER PLAYED';
    const d = Math.floor((Date.now() - x.last) / 864e5);
    return d <= 0 ? 'PLAYED TODAY' : d === 1 ? 'YESTERDAY' : d + ' DAYS AGO';
  };
  // Pictures: a plain lazy image (a video only shows its first frame), much lighter than the animated ones.
  const isVideo = (u) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);
  const pic = (u, cls, name) => (!u ? `<i class="${cls} gv-noart">${esc((name || '?')[0])}</i>`
    : isVideo(u) ? `<video class="${cls}" src="${esc(u)}" muted preload="metadata" playsinline></video>`
    : `<img class="${cls}" src="${esc(u)}" loading="lazy" decoding="async" draggable="false" alt="">`);

  // ---- the page
  const ICON = {
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    min: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
    max: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  };
  function build() {
    root = el(`<div id="gv">
      <canvas class="gv-bg"></canvas><div class="gv-pic"></div>
      <header class="gv-head gv-fly" style="--d:0">
        <b class="gv-brand">${esc((A.cfg.texts && A.cfg.texts.brand) || 'SKYVAINT')}</b>
        <nav class="gv-tabs"><button data-t="games">Games</button><button data-t="roblox">Roblox</button><button data-t="apps">Apps</button><button class="gv-explore" data-x="1">Explore</button></nav>
        <span class="gv-gap"></span>
        <button class="gv-ib" data-w="settings" title="Settings">${ICON.gear}</button>
        <span class="gv-sep"></span>
        <button class="gv-ib" data-w="min" title="To the tray">${ICON.min}</button>
        <button class="gv-ib" data-w="max" title="Full screen / window">${ICON.max}</button>
        <button class="gv-ib gv-close" data-w="close" title="Close (stays in the tray)">${ICON.x}</button>
      </header>
      <div class="gv-win">
        <div class="gv-main gv-fly" style="--d:1">
          <div class="gv-tools"><label class="gv-search">${ICON.search}<input type="text" spellcheck="false" placeholder="Search"></label>
            <button class="gv-sort"></button></div>
          <div class="gv-grid"></div>
          <div class="gv-foot"><span><kbd>ENTER</kbd> play</span><span><kbd>←↑→↓</kbd> move</span><span>drag to reorder</span><span>right-click to change</span><span><kbd>TAB</kbd> next tab</span></div>
        </div>
        <aside class="gv-side gv-fly" style="--d:2">
          <div class="gv-side-head"><b></b><small class="gv-count"></small></div>
          <div class="gv-frame"><div class="gv-frame-art"></div><div class="gv-frame-fx"></div><div class="gv-frame-info"><small></small><b></b><button class="gv-play">PLAY</button></div></div>
          <div class="gv-list"></div>
        </aside>
      </div></div>`);
    document.body.append(root);
    const head = root.querySelector('.gv-head');
    head.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return SV.explore && SV.explore.open();
      const b = e.target.closest('[data-t]');
      if (b) return setTab(b.dataset.t);
      const w = e.target.closest('[data-w]');
      if (!w) return;
      const k = w.dataset.w;
      if (k === 'settings') return A.openSettings();
      if (k === 'min' || k === 'close') return host.send('setMode', { mode: 'hidden' });
      if (k === 'max') { H().window = !H().window; A.changed(); }
    });
    // Grab the header (not its buttons) to move the window; double-click it for full screen and back.
    head.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.target.closest('button') && H().window) host.send('dragWindow'); });
    head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) { H().window = !H().window; A.changed(); } });
    const search = root.querySelector('.gv-search input');
    search.addEventListener('input', () => { query = search.value; sel = 0; render(); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); search.blur(); } e.stopPropagation(); });
    root.querySelector('.gv-sort').addEventListener('click', () => { sort = sort === 'custom' ? 'az' : sort === 'az' ? 'recent' : 'custom'; audio.play('toggle'); render(); });
    root.querySelector('.gv-play').addEventListener('click', () => play(items()[sel]));
    const grid = root.querySelector('.gv-grid');
    grid.addEventListener('click', (e) => { const c = e.target.closest('.gv-card:not(.gv-add)'); if (!c || performance.now() < dragEnd + 250) return; pick(+c.dataset.i); });
    grid.addEventListener('dblclick', (e) => { const c = e.target.closest('.gv-card:not(.gv-add)'); if (c) play(items()[+c.dataset.i]); });
    grid.addEventListener('pointerdown', dragStart);
    const list = root.querySelector('.gv-list');
    list.addEventListener('click', (e) => { const r = e.target.closest('.gv-row'); if (r) pick(+r.dataset.i, true); });
    list.addEventListener('dblclick', (e) => { const r = e.target.closest('.gv-row'); if (r) play(items()[+r.dataset.i]); });
    for (const box of [grid, list]) box.addEventListener('contextmenu', (e) => {
      const c = e.target.closest('[data-i]');
      if (!c) return;
      e.preventDefault();
      pick(+c.dataset.i, true);
      edit(items()[+c.dataset.i]);
    });
    root.querySelector('.gv-frame').addEventListener('contextmenu', (e) => { e.preventDefault(); edit(items()[sel]); });
    bgStart(root.querySelector('.gv-bg'));
  }
  const TABS = ['games', 'roblox', 'apps'];
  function setTab(t) { if (t === tab) return; tab = t; sel = 0; query = ''; if (root) root.querySelector('.gv-search input').value = ''; audio.play('nav'); render(); }

  function render() {
    if (!root) return;
    const list = items();
    sel = Math.max(0, Math.min(sel, list.length - 1));
    root.querySelectorAll('.gv-tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    root.querySelector('.gv-sort').textContent = { custom: 'My order', az: 'A to Z', recent: 'Recently played' }[sort];
    root.querySelector('.gv-side-head b').textContent = { games: 'Games', roblox: 'Roblox', apps: 'Apps' }[tab];
    root.querySelector('.gv-count').textContent = list.length + (list.length === 1 ? ' item' : ' items');
    root.classList.toggle('gv-apps', tab === 'apps');
    paintBg();
    const add = tab === 'roblox' ? ['Add a place', 'ROBLOX'] : tab === 'apps' ? ['Add an app', 'MAIN BAR'] : null;
    root.querySelector('.gv-grid').innerHTML = list.map((x, i) => `<button class="gv-card ${i === sel ? 'on' : ''}" data-i="${i}" data-k="${esc(x.key)}">
      <span class="gv-cover">${pic(x.art, 'gv-img', x.name)}</span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small></button>`).join('')
      + (add ? `<button class="gv-card gv-add"><span class="gv-cover"><i class="gv-noart">+</i></span><b>${add[0]}</b><small>${add[1]}</small></button>` : '');
    const addB = root.querySelector('.gv-add');
    if (addB) addB.onclick = () => (tab === 'roblox' ? SV.roblox.addPlace(render) : addApp());
    root.querySelector('.gv-list').innerHTML = list.map((x, i) => `<button class="gv-row ${i === sel ? 'on' : ''}" data-i="${i}">${pic(x.art, 'gv-ico', x.name)}<span><b>${esc(x.name)}</b><small>${esc(played(x))}</small></span></button>`).join('')
      || '<div class="gv-empty">Nothing here yet.</div>';
    paintFrame();
  }
  function paintFrame() {
    const x = items()[sel];
    const f = root.querySelector('.gv-frame');
    f.querySelector('.gv-frame-art').innerHTML = x ? pic(x.wide || x.art || '', 'gv-wide', x.name) : '';
    f.querySelector('.gv-frame-info small').textContent = x ? `${x.sub} · ${played(x)}` : '';
    f.querySelector('.gv-frame-info b').textContent = x ? x.name : '';
    root.querySelector('.gv-play').textContent = A.launching ? 'STARTING…' : x && x.kind === 'app' ? 'OPEN' : 'PLAY';
  }
  // Selection: moves the highlight without rebuilding, and keeps the chosen one in view.
  function pick(i, fromList) {
    const list = items();
    if (!list.length) return;
    const next = Math.max(0, Math.min(i, list.length - 1));
    if (next !== sel) audio.play('nav');
    sel = next;
    root.querySelectorAll('.gv-card').forEach((c) => c.classList.toggle('on', +c.dataset.i === sel));
    root.querySelectorAll('.gv-row').forEach((r) => r.classList.toggle('on', +r.dataset.i === sel));
    const c = root.querySelector(`.gv-card[data-i="${sel}"]`), r = root.querySelector(`.gv-row[data-i="${sel}"]`);
    if (c && !fromList) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (r) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    paintFrame();
  }
  const cols = () => {
    const g = root.querySelector('.gv-grid'), c = g.querySelector('.gv-card');
    return c ? Math.max(1, Math.round(g.clientWidth / (c.getBoundingClientRect().width + 16))) : 1;
  };

  // ---- changing a picture or a name, hiding one
  function edit(x) {
    if (!x) return;
    const setPic = (url) => {
      if (x.kind === 'game') A.setThemeArt(x.g, 'cover', url);
      else if (x.kind === 'place') { x.p.icon = url; A.changed(); }
      else { x.it.icon = url; x.it.customIcon = !!url; A.changed(); SV.nexus && SV.nexus.syncIcons && SV.nexus.syncIcons(); }
      render();
    };
    const setName = (v) => {
      if (x.kind === 'game') { x.g.name = v; A.changed('games'); }
      else if (x.kind === 'place') { x.p.name = v; A.changed(); }
      else { x.it.name = v; A.changed(); }
      render();
    };
    const own = x.kind === 'game' ? !!((A.cfg.art || {})[x.g.id] || {}).cover : false;
    A.openMenu(x.name, [
      { label: 'Change picture', sub: 'An image or a short video', run: () => A.pick('image').then((f) => f && f.url && setPic(f.url)) },
      ...(own ? [{ label: 'Original picture', run: () => setPic('') }] : []),
      { label: 'Rename', run: () => A.ask({ tag: 'RENAME', title: x.name, label: 'Name', value: x.name, done: setName }) },
      ...(x.kind === 'game' ? [{ label: 'Hide', sub: 'Settings → GAMES shows it again', run: () => { x.g.hidden = true; A.changed('games'); render(); } }] : []),
      ...(x.kind === 'app' ? [{ label: 'Hide here', sub: 'It stays on the Main Bar', run: () => { hiddenApps().push(x.it.id); A.changed(); render(); } }] : []),
      ...(x.kind === 'app' && hiddenApps().length ? [{ label: 'Show hidden apps', sub: hiddenApps().length + ' hidden', run: () => { H().gvHidden = []; A.changed(); render(); } }] : []),
    ]);
  }
  function addApp() {
    A.pick('exe').then((f) => {
      if (!f || !f.path) return;
      const items2 = (A.cfg.nexus.items = A.cfg.nexus.items || []);
      items2.push({ id: Math.random().toString(36).slice(2, 10), kind: 'app', name: f.title || f.name || f.path.split(/[\\/]/).pop(), target: f.path, process: f.process || '', icon: f.icon || '' });
      A.changed();
      render();
    });
  }

  // ---- playing: straight away, with a short aurora in the small frame instead of the full-screen launch
  function play(x) {
    if (!x || A.launching) return;
    audio.play('confirm');
    if (x.kind === 'place') return SV.roblox.quickPlay ? SV.roblox.quickPlay(x.i) : SV.roblox.openAt(robloxGame(), x.i);
    if (x.kind === 'app') {
      if (x.it.kind === 'game') { const g = A.cfg.games.find((y) => y.id === x.it.gameId); return g ? A.launch(g) : toast('That game is no longer on your shelf.', 'bad'); }
      return host.send('openItem', { item: x.it });
    }
    A.launch(x.g);
  }
  // Called by the launch itself (app.js and the Roblox launch) instead of the full-screen launch screen.
  function frameFx(title) {
    if (!root) return;
    const box = root.querySelector('.gv-frame-fx');
    if (mini) mini.stop();
    mini = window.SVAurora ? SVAurora.play(box, { colors: colors(), start: Date.now(), text: false, accel: 2.4, T: { rise: 250, spin: 650, merge: 1250 } }) : null;
    root.querySelector('.gv-frame').classList.add('starting');
    root.querySelector('.gv-play').textContent = 'STARTING…';
    if (title) root.querySelector('.gv-frame-info b').textContent = title;
  }
  function frameEnd() {
    if (mini) { mini.stop(); mini = null; }
    if (!root) return;
    root.querySelector('.gv-frame').classList.remove('starting');
    paintFrame();
  }

  // ---- drag a cover to a new place, like icons on a phone
  let dragEnd = 0;
  function dragStart(e) {
    const c = e.target.closest('.gv-card:not(.gv-add)');
    if (!c || e.button !== 0 || sort !== 'custom' || query) return;
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
        const r = c.getBoundingClientRect();
        dragging = { c, dx: sx - r.left, dy: sy - r.top, ghost: c.cloneNode(true) };
        dragging.ghost.classList.add('gv-ghost');
        Object.assign(dragging.ghost.style, { width: r.width + 'px', height: r.height + 'px' });
        document.body.append(dragging.ghost);
        c.classList.add('gv-hole');
      }
      dragging.ghost.style.transform = `translate(${ev.clientX - dragging.dx}px, ${ev.clientY - dragging.dy}px) scale(1.06)`;
      // The card under the pointer makes room: the others slide over.
      const over = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList && n.classList.contains('gv-card') && n !== dragging.ghost && !n.classList.contains('gv-add'));
      if (over && over !== c) {
        const grid = c.parentElement, cards = [...grid.querySelectorAll('.gv-card:not(.gv-add)')];
        const before = new Map(cards.map((n) => [n, n.getBoundingClientRect()]));
        const from = cards.indexOf(c), to = cards.indexOf(over);
        grid.insertBefore(c, from < to ? over.nextSibling : over);
        for (const n of cards) {
          const a = before.get(n), b = n.getBoundingClientRect();
          if (!a || n === c || (a.left === b.left && a.top === b.top)) continue;
          n.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
        }
      }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (!dragging) return;
      dragging.ghost.remove();
      c.classList.remove('gv-hole');
      const keys = [...c.parentElement.querySelectorAll('.gv-card:not(.gv-add)')].map((n) => n.dataset.k);
      H().gamesOrder = { ...(H().gamesOrder || {}), [tab]: keys };
      if (tab === 'roblox' && SV.roblox) {
        // Roblox places keep the same order everywhere else too.
        const places = SV.roblox.places(), byKey = new Map(places.map((p) => ['p' + p.placeId, p]));
        const sorted = keys.map((k) => byKey.get(k)).filter(Boolean);
        places.splice(0, places.length, ...sorted, ...places.filter((p) => !sorted.includes(p)));
      }
      dragging = null;
      dragEnd = performance.now();
      A.changed();
      audio.play('pick');
      sel = keys.indexOf(c.dataset.k);
      render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  // ---- keys and controller
  function action(a) {
    if (!root || A.launching || document.body.classList.contains('gv-intro')) return;
    const c = cols();
    if (a === 'left') pick(sel - 1);
    else if (a === 'right') pick(sel + 1);
    else if (a === 'up') pick(sel - c);
    else if (a === 'down') pick(sel + c);
    else if (a === 'confirm') play(items()[sel]);
    else if (a === 'tabNext' || a === 'options') setTab(TABS[(TABS.indexOf(tab) + 1) % TABS.length]);
    else if (a === 'tabPrev') setTab(TABS[(TABS.indexOf(tab) + TABS.length - 1) % TABS.length]);
    else if (a === 'search') root.querySelector('.gv-search input').focus();
    else if (a === 'menu' || a === 'settings') A.openSettings();
    else if (a === 'random') edit(items()[sel]);
    else return false;
    return true;
  }

  // ---- your own background picture (or video): drawn once, the aurora stops while it is there
  let bgShown = null;
  function paintBg() {
    const u = H().gvBg || '';
    root.style.setProperty('--gv-dim', String(H().gvBgDim == null ? 0.35 : H().gvBgDim));
    root.style.setProperty('--gv-blur', (+H().gvBgBlur || 0) + 'px');
    root.classList.toggle('gv-has-pic', !!u);
    if (bg) bg.run(!u && !document.hidden && !away);
    if (u === bgShown) return;
    bgShown = u;
    root.querySelector('.gv-pic').innerHTML = !u ? '' : isVideo(u) ? `<video src="${esc(u)}" autoplay muted loop playsinline></video>` : `<img src="${esc(u)}" decoding="async" alt="">`;
  }

  // ---- the background: a slow PS2-style aurora, drawn small and blurred, only while you can see it
  const colors = () => { const look = (A.cfg.desktop && A.cfg.desktop.all) || {}; return [look.colorA || A.cfg.theme.accent, look.colorB || A.cfg.theme.accent2]; };
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); const n = m ? parseInt(m[1], 16) : 0xff1f1f; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  let bg = null;
  function bgStart(cv) {
    const g = cv.getContext('2d', { alpha: false });
    const blobs = Array.from({ length: 5 }, (_, i) => ({ a: (i / 5) * Math.PI * 2, r: 0.24 + (i % 3) * 0.08, size: 0.5 + (i % 2) * 0.14, k: i }));
    let W = 0, Hh = 0, raf = 0, last = 0, turn = 0, rise = 0, speed = 0.05, target = 0.05;
    const size = () => { W = cv.width = Math.max(2, Math.round(innerWidth / 6)); Hh = cv.height = Math.max(2, Math.round(innerHeight / 6)); };
    size();
    addEventListener('resize', size);
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // about 30 frames a second is plenty for something this slow
      const dt = Math.min(0.1, (t - (last || t)) / 1000);
      last = t;
      speed += (target - speed) * Math.min(1, dt * 1.2);
      turn += speed * dt;
      rise = Math.min(1, rise + dt / 1.6);
      const cols = colors().map(hex);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#050407'; g.fillRect(0, 0, W, Hh);
      g.globalCompositeOperation = 'lighter';
      const R = Math.max(W, Hh);
      for (const b of blobs) {
        const ang = b.a + turn * (b.k % 2 ? 1 : -0.7);
        const x = W / 2 + Math.cos(ang) * b.r * W, y = Hh / 2 + Math.sin(ang) * b.r * Hh * 0.9;
        const rad = b.size * R, c = cols[b.k % cols.length];
        if (!(rad > 0) || !isFinite(x) || !isFinite(y)) continue;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${(0.42 * rise).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      }
    }
    const run = (yes) => { cancelAnimationFrame(raf); raf = 0; last = 0; if (yes) raf = requestAnimationFrame(frame); };
    bg = {
      run, rush(v) { target = v; }, calm() { target = 0.05; },
      reset() { rise = 0; },
      stop() { run(false); removeEventListener('resize', size); },
    };
    run(!document.hidden && !H().gvBg);
  }
  let away = false;
  const rest = () => bg && bg.run(!document.hidden && on() && !away && !(H().gvBg));
  document.addEventListener('visibilitychange', rest);
  host.on('focus', (m) => { away = !m.on; rest(); const v = root && root.querySelector('.gv-pic video'); if (v) { if (away) v.pause(); else v.play().catch(() => {}); } });

  // ---- the opening: the aurora rises with your PS2 sound, speeds up, and the panels fly in partway through
  function intro({ src, volume = 1, drop = 14.35 } = {}) {
    if (!on()) return false;
    sync();
    const body = document.body;
    body.classList.add('gv-intro', 'entered');
    body.classList.remove('preinit');
    if (bg) { bg.reset(); bg.rush(0.9); }
    const au = src ? new Audio(src) : null;
    if (au) { au.volume = Math.max(0, Math.min(1, volume)); au.play().catch(() => {}); }
    // Partway: the panels come in, one after another, from deep behind the screen.
    const at = Math.min(6500, Math.max(1600, drop * 1000 * 0.42));
    setTimeout(() => { body.classList.add('gv-in'); bg && bg.calm(); }, at);
    setTimeout(() => body.classList.remove('gv-intro', 'gv-in'), at + 1600);
    return true;
  }

  // Shows or hides the page to match the setting.
  function sync() {
    const yes = on();
    document.body.classList.toggle('gv-on', yes);
    document.body.classList.toggle('compact', yes);
    if (yes && !root) build();
    if (yes) render();
    if (!yes && root) { frameEnd(); bg && bg.stop(); bg = null; root.remove(); root = null; }
    A.syncBackdrop && A.syncBackdrop();
    A.fit && A.fit();
  }
  host.on('init', () => setTimeout(sync, 0));
  for (const t of ['scan', 'stats', 'running']) host.on(t, () => { if (root && !dragging) render(); });

  function rows() {
    const { R } = A;
    return [
      R.choice('HOME style', 'Compact is the small launcher like the Epic Games Launcher: Games, Roblox and Apps, covers you can drag into your own order, ENTER plays. Classic is the animated full-screen HOME.',
        { get: () => H().view || 'classic', set: (v) => { H().view = v; if (v === 'games' && H().window == null) H().window = true; } }, [['games', 'Compact'], ['classic', 'Classic']], () => sync()),
      ...(SV.explore ? SV.explore.rows() : []),
      R.file('Background picture', 'A picture or video behind the compact HOME, instead of the aurora.  ← clears it.', { get: () => H().gvBg || '', set: (v) => { H().gvBg = v; render(); } }, 'image'),
      R.slider('Background darkness', 'How much the picture is darkened under the panels.', { get: () => (H().gvBgDim == null ? 0.35 : H().gvBgDim), set: (v) => { H().gvBgDim = v; render(); } }, 0, 0.9, 0.05, (v) => Math.round(v * 100) + '%'),
      R.slider('Background blur', '', { get: () => +H().gvBgBlur || 0, set: (v) => { H().gvBgBlur = v; render(); } }, 0, 30, 1, (v) => (v ? v + ' px' : 'OFF')),
      R.toggle('Small window', 'Compact HOME in a rounded window you can drag by its top bar, instead of the whole screen. Double-click the top bar to switch.', { get: () => !!H().window, set: (v) => { H().window = v; } }),
    ];
  }

  SV.gamesView = { active, on, action, sync, frameFx, frameEnd, rows, intro };
})();

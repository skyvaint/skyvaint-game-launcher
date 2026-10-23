// DISCOVER: what's free on Epic this week, what's selling and on sale on Steam, and what's trending on Roblox.
// Roblox games can be played straight away with your accounts; store games open their store page.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, hints } = A;

  const TABS = [
    ['epic', 'FREE ON EPIC', (d) => d.epic],
    ['steamTop', 'STEAM TOP SELLERS', (d) => d.steam && d.steam.top],
    ['steamDeals', 'STEAM DEALS', (d) => d.steam && d.steam.specials],
    ['steamNew', 'STEAM NEW', (d) => d.steam && d.steam.new],
    ['robloxTrending', 'ROBLOX TRENDING', (d) => d.roblox && d.roblox.trending],
    ['robloxRising', 'ROBLOX RISING', (d) => d.roblox && d.roblox.rising],
    ['robloxPlaying', 'ROBLOX PLAYING NOW', (d) => d.roblox && d.roblox.playing],
  ];
  let data = null, tab = 'epic', view = null;

  host.on('discover', (m) => { data = m; if (view) view.render(); });

  const open = (url) => host.send('openUrl', { url });

  // Adds a Roblox game to your places (if needed), makes it current, and opens the Roblox picker on it.
  function playRoblox(item, start) {
    const r = A.cfg.roblox;
    let i = r.places.findIndex((p) => p.placeId === item.placeId);
    if (i < 0) { r.places.push({ placeId: item.placeId, name: item.title, icon: item.image }); i = r.places.length - 1; }
    r.placeIdx = i;
    A.save();
    if (!start) return toast(item.title + ' added to your Roblox places');
    const game = A.cfg.games.find((g) => g.target === 'sv:roblox');
    if (!game) return toast('Add Roblox to your shelf first (Settings → Games → Scan).', 'bad');
    while (A.stack.length) A.pop();
    setTimeout(() => SV.roblox.open(game), 250);
  }

  function menu(item) {
    const roblox = !!item.placeId;
    A.openMenu(item.title, [
      ...(roblox ? [
        { label: 'PLAY ON ROBLOX', sub: 'Pick your account and jump in', run: () => playRoblox(item, true) },
        { label: 'ADD TO MY PLACES', sub: 'Keep it in the Roblox place list', run: () => playRoblox(item, false) },
      ] : []),
      ...(item.steam ? [{ label: 'OPEN IN STEAM', sub: 'Store page in the Steam app', run: () => open(item.steam) }] : []),
      { label: 'OPEN IN BROWSER', sub: item.url.replace('https://', ''), run: () => open(item.url) },
    ], item.sub);
  }

  function show() {
    if (view) return;
    const root = el(`
      <div class="overlay full"><div class="clips discover">
        <div class="clips-head"><div><div class="tag disc-count">[ DISCOVER ]</div><h2>DISCOVER</h2></div>
          <div class="clips-tools"><button class="btn small ghost" data-t="refresh">REFRESH</button><button class="btn small ghost" data-t="close">CLOSE</button></div></div>
        <div class="clips-chips"></div>
        <div class="clips-grid disc-grid"></div>
        <div class="hints">${hints([['confirm', 'Open / play'], ['options', 'More'], ['tabs', 'Section'], ['back', 'Close']])}</div>
      </div></div>`);
    const grid = $('.disc-grid', root), chips = $('.clips-chips', root);
    let idx = 0, items = [];

    function render() {
      chips.innerHTML = TABS.map(([k, label]) => `<button class="chip ${k === tab ? 'on' : ''}" data-k="${k}">${label}</button>`).join('');
      const pick = TABS.find((t) => t[0] === tab);
      items = (data && pick[2](data)) || [];
      $('.disc-count', root).textContent = data ? `[ ${pick[1]} · ${items.length} ]` : '[ LOADING… ]';
      grid.classList.toggle('square', tab.startsWith('roblox'));
      grid.innerHTML = !data ? '<div class="clips-empty">Fetching the latest from Epic, Steam and Roblox…</div>'
        : !items.length ? '<div class="clips-empty">Nothing here right now.</div>'
        : items.map((it, i) => `
          <div class="clip disc ${it.now ? 'hot' : ''}" data-i="${i}">
            <div class="clip-thumb" ${it.image ? `style="background-image:url('${esc(it.image)}')"` : ''}>${it.now ? '<span class="disc-free">FREE NOW</span>' : ''}</div>
            <b>${esc(it.title)}</b><small>${esc(it.sub || '')}</small>
          </div>`).join('');
      focus(clamp(idx, 0, Math.max(0, items.length - 1)), false);
    }
    const cols = () => { const c = grid.querySelectorAll('.clip'); let n = 1; while (n < c.length && c[n].offsetTop === c[0].offsetTop) n++; return n; };
    function focus(i, sound = true) {
      const cards = grid.querySelectorAll('.clip');
      if (!cards.length) return;
      const next = clamp(i, 0, cards.length - 1);
      if (next !== idx && sound) audio.play('nav');
      idx = next;
      cards.forEach((c, k) => c.classList.toggle('focus', k === idx));
      cards[idx].scrollIntoView({ block: 'nearest' });
    }
    const activate = (it) => (it.placeId ? playRoblox(it, true) : open(it.url));
    const setTab = (k) => { tab = k; idx = 0; audio.play('toggle'); render(); };

    chips.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) setTab(c.dataset.k); });
    grid.addEventListener('click', (e) => { const c = e.target.closest('.clip'); if (c) { focus(+c.dataset.i, false); activate(items[idx]); } });
    grid.addEventListener('contextmenu', (e) => { const c = e.target.closest('.clip'); if (c) { e.preventDefault(); focus(+c.dataset.i, false); menu(items[idx]); } });
    grid.addEventListener('mousemove', (e) => { const c = e.target.closest('.clip'); if (c && +c.dataset.i !== idx) focus(+c.dataset.i, false); });
    $('.clips-tools', root).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.t === 'refresh') { data = null; render(); host.send('discover', { fresh: true }); } else A.pop();
    });

    view = { render };
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    render();
    host.send('discover', { fresh: false });
    A.push({
      el: root,
      onClose: () => { view = null; },
      action(a) {
        if (a === 'back') return A.pop();
        if (a === 'tabPrev' || a === 'tabNext') { const i = TABS.findIndex((t) => t[0] === tab); return setTab(TABS[(i + (a === 'tabPrev' ? -1 : 1) + TABS.length) % TABS.length][0]); }
        const it = items[idx];
        if (!it) return;
        if (a === 'left') focus(idx - 1);
        else if (a === 'right') focus(idx + 1);
        else if (a === 'up') focus(Math.max(0, idx - cols()));
        else if (a === 'down') focus(Math.min(items.length - 1, idx + cols()));
        else if (a === 'confirm') { audio.play('confirm'); activate(it); }
        else if (a === 'options') menu(it);
      },
    });
  }

  SV.discover = { open: show };
})();

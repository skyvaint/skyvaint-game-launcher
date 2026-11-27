// The ROBLOX DEV HUB: a full-screen home for Roblox work. OVERVIEW (where things stand, deadlines, your games right
// now, quick actions), PROJECTS (every cloud place and .rbxl file as a card, searchable, sortable, pinnable),
// COMMISSIONS (a board with a column per status), NOTES (a scratchpad and a to-do list), TOOLS (Studio's folders,
// Studio time, stop Studio) and LINKS (the usual Roblox pages plus your own). Mouse, keyboard and controller all
// work: arrows move to the nearest card in that direction, Q / E (LB / RB) change page.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, toast, hints } = A;
  const D = () => {
    const d = A.cfg.dev;
    d.commissions = d.commissions || []; d.pins = d.pins || []; d.todos = d.todos || []; d.links = d.links || [];
    if (typeof d.notes !== 'string') d.notes = '';
    return d;
  };
  const num = (n) => (SV.lists ? SV.lists.num(+n || 0) : String(n || 0));
  const openUrl = (url) => { audio.play('confirm'); host.send('openUrl', { url }); };
  const studioGame = () => A.cfg.games.find((x) => x.id === 'roblox_studio' || /roblox studio/i.test(x.name));
  const ICONS = {
    overview: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    projects: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>',
    commissions: '<rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="10" y="4" width="5" height="11" rx="1.2"/><rect x="17" y="4" width="4" height="7" rx="1.2"/>',
    notes: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h6"/>',
    tools: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  };
  const PAGES = [['overview', 'OVERVIEW'], ['projects', 'PROJECTS'], ['commissions', 'COMMISSIONS'], ['notes', 'NOTES & TO-DO'], ['tools', 'TOOLS'], ['links', 'LINKS']];
  const LINKS = [
    ['Creator Hub', 'https://create.roblox.com/', 'Your dashboard'], ['Creations', 'https://create.roblox.com/dashboard/creations', 'Every experience you own'],
    ['Analytics', 'https://create.roblox.com/dashboard/analytics', 'Players, retention, money'], ['Documentation', 'https://create.roblox.com/docs', 'Engine and Luau reference'],
    ['Engine API', 'https://create.roblox.com/docs/reference/engine', 'Every class and method'], ['Luau', 'https://luau.org/', 'The language itself'],
    ['DevForum', 'https://devforum.roblox.com/', 'Ask, share, read updates'], ['Announcements', 'https://devforum.roblox.com/c/updates/announcements/36', 'What changed this week'],
    ['Creator Store', 'https://create.roblox.com/store/models', 'Models, plugins, audio'], ['Talent Hub', 'https://talent.roblox.com/', 'Find or offer work'],
    ['Roblox status', 'https://status.roblox.com/', 'Is it Roblox or you?'], ['Release notes', 'https://create.roblox.com/docs/release-notes', 'What each update brings'],
  ];
  const STATUS_COLS = ['REQUESTED', 'ACCEPTED', 'IN PROGRESS', 'REVIEW', 'DELIVERED', 'PAID'];

  let root = null, page = 'overview', inNav = false, focusEl = null, query = '', sort = 'playing', showCancelled = false;

  // ---- moving around: the nearest focusable thing in the direction pressed

  const focusables = () => [...root.querySelectorAll('.hb-main [data-f]')].filter((n) => n.offsetParent !== null);
  function setFocus(n, scroll = true) {
    if (focusEl) focusEl.classList.remove('focus');
    focusEl = n || null;
    if (!focusEl) return;
    focusEl.classList.add('focus');
    if (scroll) focusEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function move(dir) {
    const list = focusables();
    if (!list.length) return;
    if (!focusEl || !focusEl.isConnected) return setFocus(list[0]);
    const a = focusEl.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const n of list) {
      if (n === focusEl) continue;
      const b = n.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) { audio.play('nav'); setFocus(best); }
    else if (dir === 'left') { inNav = true; audio.play('nav'); paintNav(); }
  }

  // ---- pages

  const stat = (label, value, hot) => `<div class="hb-stat ${hot ? 'hot' : ''}"><b>${esc(value)}</b><span>${esc(A.T(label))}</span></div>`;
  const tile = (label, sub, icon, attrs = '') => `<button class="hb-tile" data-f ${attrs}><i>${icon || ''}</i><b>${esc(A.T(label))}</b>${sub ? `<small>${esc(A.T(sub))}</small>` : ''}</button>`;
  const section = (title, note, inner) => `<section class="hb-sec"><header><h4>${esc(A.T(title))}</h4>${note ? `<span>${esc(note)}</span>` : ''}</header>${inner}</section>`;
  const svg = (k) => `<svg viewBox="0 0 24 24">${ICONS[k] || ''}</svg>`;

  function cloud() {
    const s = SV.lists ? SV.lists.studioData() : { cloud: [], local: [], loaded: false };
    return s;
  }
  function overview() {
    const d = D(), list = d.commissions, live = list.filter(SV.dev.isOpen), s = cloud();
    const week = live.filter((c) => /TODAY|LATE|IN [1-7]D/.test(SV.dev.due(c)));
    const players = s.cloud.reduce((n, g) => n + (+g.playing || 0), 0), visits = s.cloud.reduce((n, g) => n + (+g.visits || 0), 0);
    const studio = studioGame(), studioSec = studio ? ((A.stats[studio.id] || {}).seconds || 0) : 0;
    const deadlines = live.filter((c) => c.due).sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, 6);
    const top = [...s.cloud].sort((a, b) => (+b.playing || 0) - (+a.playing || 0)).slice(0, 4);
    return `
      <div class="hb-stats">
        ${stat('PLAYERS IN YOUR GAMES NOW', num(players), players > 0)}${stat('TOTAL VISITS', num(visits))}${stat('YOUR GAMES', String(s.cloud.length))}${stat('PLACE FILES', String(s.local.filter((f) => f.exists).length))}
        ${stat('OPEN COMMISSIONS', String(live.length))}${stat('DUE THIS WEEK', String(week.length), week.length > 0)}${stat('EARNED', SV.dev.money(list.filter((c) => c.status === 'PAID')))}${stat('TIME IN STUDIO', A.playtime(studioSec))}
      </div>
      ${section('QUICK ACTIONS', '', `<div class="hb-tiles">
        ${tile('Open Studio', A.running.has(studio && studio.id) ? 'Running now' : 'Start Roblox Studio', svg('projects'), 'data-act="studio"')}
        ${tile('New commission', 'Track a job', svg('commissions'), 'data-act="newjob"')}
        ${tile('Creator Hub', 'Your dashboard', svg('overview'), 'data-act="url" data-url="https://create.roblox.com/"')}
        ${tile('Analytics', 'Players and money', svg('overview'), 'data-act="url" data-url="https://create.roblox.com/dashboard/analytics"')}
        ${tile('Documentation', 'Engine reference', svg('notes'), 'data-act="url" data-url="https://create.roblox.com/docs"')}
        ${tile('DevForum', 'Community', svg('links'), 'data-act="url" data-url="https://devforum.roblox.com/"')}
      </div>`)}
      <div class="hb-cols">
        ${section('DEADLINES', deadlines.length ? '' : 'Nothing due', deadlines.map((c) => `<button class="hb-line ${/LATE/.test(SV.dev.due(c)) ? 'late' : ''}" data-f data-job="${esc(c.id)}"><b>${esc(c.title)}</b><span>${esc([c.client, c.price].filter(Boolean).join(' · '))}</span><em>${esc(SV.dev.due(c))}</em></button>`).join('') || '<div class="hb-empty">No open jobs with a deadline.</div>')}
        ${section('YOUR GAMES RIGHT NOW', s.loaded ? '' : 'Reading Studio…', top.map((g) => `<button class="hb-line" data-f data-cloud="${esc(g.placeId)}"><b>${esc(g.name)}</b><span>${num(g.visits)} visits</span><em class="${+g.playing ? 'live' : ''}">${num(g.playing)} playing</em></button>`).join('') || '<div class="hb-empty">No cloud games found yet.</div>')}
      </div>`;
  }

  function projects() {
    const d = D(), s = cloud(), q = query.toLowerCase();
    const pinned = (c) => d.pins.includes(String(c.placeId));
    const by = { playing: (a, b) => (+b.playing || 0) - (+a.playing || 0), visits: (a, b) => (+b.visits || 0) - (+a.visits || 0), name: (a, b) => String(a.name).localeCompare(String(b.name)), updated: (a, b) => (new Date(b.updated || 0)) - (new Date(a.updated || 0)) }[sort];
    const games = s.cloud.filter((c) => !q || String(c.name).toLowerCase().includes(q)).sort((a, b) => (pinned(b) - pinned(a)) || by(a, b));
    const files = s.local.filter((f) => f.exists && (!q || String(f.name).toLowerCase().includes(q)));
    const chip = (k, label) => `<button class="hb-chip ${sort === k ? 'on' : ''}" data-f data-sort="${k}">${esc(A.T(label))}</button>`;
    return `
      <div class="hb-bar"><input class="hb-search" data-f type="search" spellcheck="false" placeholder="${esc(A.T('Search your games and files…'))}" value="${esc(query)}">
        <div class="hb-chips">${chip('playing', 'MOST PLAYERS')}${chip('visits', 'MOST VISITS')}${chip('updated', 'RECENTLY UPDATED')}${chip('name', 'A–Z')}</div>
        <button class="hb-chip" data-f data-act="refresh">${esc(A.T('REFRESH'))}</button></div>
      ${section(`CLOUD GAMES · ${games.length}`, s.loaded ? 'Right-click or OPTIONS for more' : 'Reading Studio…', `<div class="hb-grid">${games.map((c) => `
        <button class="hb-card ${pinned(c) ? 'pinned' : ''}" data-f data-cloud="${esc(c.placeId)}">
          <div class="hb-thumb" ${c.thumb || c.icon ? `style="background-image:url('${esc(c.thumb || c.icon)}')"` : ''}>${pinned(c) ? '<em>★</em>' : ''}${+c.playing ? `<span class="live">${num(c.playing)} PLAYING</span>` : ''}</div>
          <b>${esc(c.name)}</b><small>${num(c.visits)} visits${c.updated ? ' · updated ' + new Date(c.updated).toLocaleDateString() : ''}</small></button>`).join('') || '<div class="hb-empty">No cloud games match.</div>'}</div>`)}
      ${section(`PLACE FILES · ${files.length}`, '', `<div class="hb-grid files">${files.slice(0, 40).map((f, i) => `
        <button class="hb-card file" data-f data-file="${i}"><div class="hb-thumb"><span class="hb-ext">.rbxl</span></div><b>${esc(f.name)}</b><small>${esc((f.folder || '').toUpperCase())}</small></button>`).join('') || '<div class="hb-empty">No .rbxl files found.</div>'}</div>`)}`;
  }

  function commissions() {
    const d = D(), list = d.commissions;
    const cols = showCancelled ? [...STATUS_COLS, 'CANCELLED'] : STATUS_COLS;
    const discord = (SV.rails && SV.rails.commissions && SV.rails.commissions.items) || [];
    return `
      <div class="hb-bar"><button class="hb-btn primary" data-f data-act="newjob">+ ${esc(A.T('NEW COMMISSION'))}</button>
        <button class="hb-chip ${showCancelled ? 'on' : ''}" data-f data-act="cancelled">${esc(A.T('SHOW CANCELLED'))}</button>
        <span class="hb-sum">${esc(A.T('Earned'))} <b>${esc(SV.dev.money(list.filter((c) => c.status === 'PAID')))}</b> · ${esc(A.T('Waiting on'))} <b>${esc(SV.dev.money(list.filter(SV.dev.isOpen)))}</b></span></div>
      <div class="hb-board">${cols.map((st) => {
        const items = list.filter((c) => c.status === st);
        return `<div class="hb-col s-${st.toLowerCase().replace(/\s+/g, '-')}"><header><b>${esc(A.T(st))}</b><span>${items.length}</span></header>${items.map((c) => `
          <button class="hb-job ${/LATE/.test(SV.dev.due(c)) ? 'late' : ''}" data-f data-job="${esc(c.id)}"><b>${esc(c.title)}</b>
            <small>${esc([c.client, c.price].filter(Boolean).join(' · '))}</small>${SV.dev.due(c) ? `<em>${esc(SV.dev.due(c))}</em>` : ''}</button>`).join('') || '<div class="hb-empty small">—</div>'}</div>`;
      }).join('')}</div>
      ${discord.length ? section('REQUESTS IN YOUR DISCORD CHANNEL', 'OPTIONS turns one into a commission', discord.slice(0, 12).map((m, i) => `<button class="hb-line" data-f data-req="${i}"><b>${esc(m.author)}${m.title ? ' — ' + esc(m.title) : ''}</b><span>${esc(String(m.text || '').slice(0, 120))}</span><em>TRACK</em></button>`).join('')) : ''}`;
  }

  function notes() {
    const d = D();
    return `<div class="hb-cols notes">
      ${section('SCRATCHPAD', 'Saved as you type', `<textarea class="hb-notes" data-f spellcheck="false" placeholder="${esc(A.T('Ideas, script snippets, things to remember…'))}">${esc(d.notes)}</textarea>`)}
      ${section(`TO-DO · ${d.todos.filter((t) => !t.done).length} LEFT`, 'ENTER ticks it off · OPTIONS removes it', `
        <div class="hb-todoadd"><input class="hb-todoin" data-f type="text" spellcheck="false" placeholder="${esc(A.T('Add a task and press Enter'))}"></div>
        ${d.todos.map((t, i) => `<button class="hb-todo ${t.done ? 'done' : ''}" data-f data-todo="${i}"><i>${t.done ? '✓' : ''}</i><span>${esc(t.text)}</span></button>`).join('') || '<div class="hb-empty">Nothing to do. Nice.</div>'}`)}
    </div>`;
  }

  function tools() {
    const studio = studioGame(), on = studio && A.running.has(studio.id), sec = studio ? ((A.stats[studio.id] || {}).seconds || 0) : 0;
    return `
      <div class="hb-stats small">${stat('STUDIO', on ? 'RUNNING' : 'CLOSED', on)}${stat('TIME IN STUDIO', A.playtime(sec))}${stat('LAST OPENED', studio ? A.lastPlayed((A.stats[studio.id] || {}).lastPlayed) : '—')}</div>
      ${section('STUDIO', '', `<div class="hb-tiles">
        ${tile(on ? 'Bring Studio up' : 'Open Studio', '', svg('projects'), 'data-act="studio"')}
        ${on ? tile('Close Studio', 'Asks first', svg('tools'), 'data-act="stopstudio"') : ''}
        ${tile('Plugins folder', 'Your local plugins', svg('tools'), 'data-act="folder" data-which="plugins"')}
        ${tile('Logs folder', 'When Studio misbehaves', svg('notes'), 'data-act="folder" data-which="logs"')}
        ${tile('Roblox folder', 'Versions and settings', svg('tools'), 'data-act="folder" data-which="local"')}
        ${tile('Refresh projects', 'Read Studio again', svg('projects'), 'data-act="refresh"')}
      </div>`)}
      ${section('DEVELOPER SETTINGS', '', `<div class="hb-tiles">
        ${tile('Discord requests', 'Bot token and channel', svg('commissions'), 'data-act="settings" data-tab="feeds"')}
        ${tile('Developer settings', 'Rows, data prompt and more', svg('tools'), 'data-act="settings" data-tab="developer"')}
      </div>`)}`;
  }

  function links() {
    const d = D();
    return `${section('ROBLOX', '', `<div class="hb-tiles">${LINKS.map(([n, u, s]) => tile(n, s, svg('links'), `data-act="url" data-url="${esc(u)}"`)).join('')}</div>`)}
      ${section(`YOUR LINKS · ${d.links.length}`, 'OPTIONS removes one', `<div class="hb-tiles">${d.links.map((l, i) => tile(l.name, l.url.replace(/^https?:\/\//, '').slice(0, 40), svg('links'), `data-act="mylink" data-i="${i}"`)).join('')}
        ${tile('Add a link', 'Any page you use a lot', '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', 'data-act="addlink"')}</div>`)}`;
  }

  const RENDER = { overview, projects, commissions, notes, tools, links };

  function paintNav() {
    root.classList.toggle('in-nav', inNav);
    root.querySelectorAll('.hb-tab').forEach((t) => t.classList.toggle('on', t.dataset.k === page));
  }
  function render(keepFocus) {
    if (!root || !root.isConnected) return;
    const main = $('.hb-main', root);
    const was = keepFocus && focusEl ? [...focusables()].indexOf(focusEl) : -1, top = main.scrollTop;
    $('.hb-title', root).textContent = A.T(PAGES.find((p) => p[0] === page)[1]);
    $('.hb-body', root).innerHTML = RENDER[page]();
    paintNav();
    focusEl = null;
    const list = focusables();
    if (keepFocus) { main.scrollTop = top; setFocus(list[Math.max(0, Math.min(was, list.length - 1))], false); }
    else { main.scrollTop = 0; if (!inNav) setFocus(list[0], false); }
  }
  function go(k) {
    if (k === page) return;
    page = k; audio.play('nav'); render(false);
  }

  // ---- what each thing does

  function menuFor(n) {
    const d = D(), s = cloud();
    if (n.dataset.cloud) {
      const c = s.cloud.find((x) => String(x.placeId) === n.dataset.cloud);
      if (!c) return;
      const pinned = d.pins.includes(String(c.placeId));
      return A.openMenu(c.name, [
        { label: 'EDIT IN STUDIO', run: () => SV.lists.openCloud(c) },
        { label: 'PLAY', run: () => { A.pop(); SV.roblox.playPlace({ placeId: c.placeId, name: c.name, icon: c.icon }); } },
        { label: 'DETAILS', sub: 'Players, peak, votes', run: () => SV.details.roblox({ placeId: c.placeId, universeId: c.universeId, name: c.name, icon: c.icon, thumb: c.thumb }) },
        { label: pinned ? 'UNPIN' : 'PIN TO THE TOP', run: () => { d.pins = pinned ? d.pins.filter((x) => x !== String(c.placeId)) : [...d.pins, String(c.placeId)]; A.changed(); render(true); } },
        ...(c.universeId ? [{ label: 'ANALYTICS', run: () => openUrl(`https://create.roblox.com/dashboard/creations/experiences/${c.universeId}/analytics/overview`) },
          { label: 'CONFIGURE', sub: 'Name, icon, access, monetisation', run: () => openUrl(`https://create.roblox.com/dashboard/creations/experiences/${c.universeId}/overview`) }] : []),
        { label: 'OPEN ON ROBLOX.COM', run: () => openUrl(`https://www.roblox.com/games/${c.placeId}`) },
        { label: 'COPY THE PLACE ID', sub: String(c.placeId), run: () => navigator.clipboard.writeText(String(c.placeId)).then(() => toast('Place ID copied')) },
      ]);
    }
    if (n.dataset.file) {
      const f = s.local.filter((x) => x.exists)[+n.dataset.file];
      return f && A.openMenu(f.name, [{ label: 'OPEN IN STUDIO', run: () => SV.lists.openFile(f) }, { label: 'SHOW IN FOLDER', run: () => host.send('revealFile', { path: f.path }) }]);
    }
    if (n.dataset.job) {
      const c = d.commissions.find((x) => x.id === n.dataset.job);
      return c && SV.dev.commissionMenu(c, () => render(true));
    }
    if (n.dataset.todo) {
      const i = +n.dataset.todo;
      return A.openMenu(d.todos[i].text, [
        { label: d.todos[i].done ? 'NOT DONE' : 'DONE', run: () => { d.todos[i].done = !d.todos[i].done; A.changed(); render(true); } },
        { label: 'DELETE', danger: true, run: () => { d.todos.splice(i, 1); A.changed(); render(true); } },
      ]);
    }
    if (n.dataset.act === 'mylink') {
      const i = +n.dataset.i;
      return A.openMenu(d.links[i].name, [{ label: 'OPEN', run: () => openUrl(d.links[i].url) }, { label: 'REMOVE', danger: true, run: () => { d.links.splice(i, 1); A.changed(); render(true); } }]);
    }
    if (n.dataset.req) {
      const m = ((SV.rails && SV.rails.commissions && SV.rails.commissions.items) || [])[+n.dataset.req];
      return m && A.openMenu(m.author, [
        { label: 'TRACK IT AS A COMMISSION', run: () => SV.dev.addCommission(() => render(true), { title: m.title || String(m.text || '').split('\n')[0].slice(0, 60), client: m.author, notes: m.text, link: m.app }) },
        { label: 'OPEN IN DISCORD', run: () => openUrl(m.app) },
      ]);
    }
  }

  function activate(n) {
    if (!n) return;
    const d = D(), s = cloud(), act = n.dataset.act;
    if (n.matches('input, textarea')) return n.focus();
    if (n.dataset.sort) { sort = n.dataset.sort; audio.play('toggle'); return render(true); }
    if (n.dataset.cloud) { const c = s.cloud.find((x) => String(x.placeId) === n.dataset.cloud); return c && SV.lists.openCloud(c); }
    if (n.dataset.file) { const f = s.local.filter((x) => x.exists)[+n.dataset.file]; return f && SV.lists.openFile(f); }
    if (n.dataset.job || n.dataset.req) return menuFor(n);
    if (n.dataset.todo) { const t = d.todos[+n.dataset.todo]; t.done = !t.done; audio.play(t.done ? 'pick' : 'toggle'); A.changed(); return render(true); }
    if (act === 'url') return openUrl(n.dataset.url);
    if (act === 'mylink') return openUrl(d.links[+n.dataset.i].url);
    if (act === 'studio') { const g = studioGame(); if (g) { A.pop(); return A.launchDirect(g); } return openUrl('https://create.roblox.com/'); }
    if (act === 'stopstudio') { const g = studioGame(); return g && A.confirmMenu('Close Roblox Studio?', 'CLOSE STUDIO', () => host.send('stopGame', { id: g.id })); }
    if (act === 'newjob') return SV.dev.addCommission(() => { page = 'commissions'; render(false); });
    if (act === 'cancelled') { showCancelled = !showCancelled; audio.play('toggle'); return render(true); }
    if (act === 'refresh') { SV.lists.loadStudio(true); toast('Reading Studio projects…'); return; }
    if (act === 'folder') return host.send('devFolder', { which: n.dataset.which });
    if (act === 'settings') { while (A.stack.length) A.pop(); return setTimeout(() => A.openSettings(n.dataset.tab), 200); }
    if (act === 'addlink') return A.ask({ tag: 'DEV HUB', title: 'ADD A LINK', label: 'Address', placeholder: 'https://…', button: 'NEXT', done: (u) => {
      let url = u.trim(); if (!url) return; if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
      setTimeout(() => A.ask({ tag: 'DEV HUB', title: 'NAME IT', label: 'Name', value: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], button: 'ADD', done: (name) => { d.links.push({ name: name.trim() || url, url }); A.changed(); render(true); toast('Link added'); } }), 80);
    } });
  }

  // ---- the frame

  function open() {
    if (!A.cfg.dev.enabled) { A.cfg.dev.enabled = true; A.changed('games'); toast('Developer mode on'); }
    D();
    inNav = false;
    root = el(`<div class="overlay hb-screen"><div class="hb">
      <nav class="hb-nav"><div class="tag">[ ROBLOX ]</div><h2>${esc(A.T('DEV HUB'))}</h2>
        <div class="hb-tabs">${PAGES.map(([k, label]) => `<button class="hb-tab" data-k="${k}">${svg(k)}<span>${esc(A.T(label))}</span></button>`).join('')}</div></nav>
      <main class="hb-main"><header class="hb-head"><h3 class="hb-title"></h3></header><div class="hb-body"></div></main>
      <footer class="hb-foot"><div class="hints">${hints([['confirm', 'Open'], ['move', 'Move'], ['options', 'Options'], ['tabs', 'Switch page'], ['back', 'Close']])}</div></footer>
    </div></div>`);
    const main = $('.hb-main', root);
    $('.hb-tabs', root).addEventListener('click', (e) => { const b = e.target.closest('.hb-tab'); if (b) { inNav = false; go(b.dataset.k); } });
    main.addEventListener('click', (e) => { const n = e.target.closest('[data-f]'); if (n) { setFocus(n, false); activate(n); } });
    main.addEventListener('contextmenu', (e) => { const n = e.target.closest('[data-f]'); if (n) { e.preventDefault(); setFocus(n, false); menuFor(n); } });
    main.addEventListener('mousemove', (e) => { const n = e.target.closest('[data-f]'); if (n && n !== focusEl) setFocus(n, false); });
    main.addEventListener('input', (e) => {
      if (e.target.matches('.hb-search')) { clearTimeout(main._t); main._t = setTimeout(() => { query = e.target.value.trim(); const at = e.target.selectionStart; render(true); const s = $('.hb-search', root); s.focus(); s.setSelectionRange(at, at); }, 180); }
      if (e.target.matches('.hb-notes')) { D().notes = e.target.value; clearTimeout(main._n); main._n = setTimeout(() => A.save(), 400); }
    });
    main.addEventListener('keydown', (e) => {
      if (e.target.matches('.hb-todoin') && e.key === 'Enter' && e.target.value.trim()) { D().todos.unshift({ text: e.target.value.trim(), done: false, at: Date.now() }); A.changed(); audio.play('pick'); render(true); $('.hb-todoin', root).focus(); }
    });
    SV.lists && SV.lists.loadStudio(false);
    host.send('commissions');
    const again = () => { if (root && root.isConnected && !root.querySelector(':focus')) render(true); };
    host.on('studioProjects', again);
    host.on('commissions', () => setTimeout(again, 0));
    A.push({
      el: root, cover: true,
      onClose: () => { root = null; },
      action(a) {
        const i = PAGES.findIndex((p) => p[0] === page);
        if (a === 'tabPrev' || a === 'tabNext') return go(PAGES[(i + (a === 'tabPrev' ? -1 : 1) + PAGES.length) % PAGES.length][0]);
        if (inNav) {
          if (a === 'up' || a === 'down') return go(PAGES[(i + (a === 'up' ? -1 : 1) + PAGES.length) % PAGES.length][0]);
          if (a === 'right' || a === 'confirm') { inNav = false; paintNav(); return setFocus(focusables()[0]); }
          if (a === 'back') return A.pop();
          return;
        }
        if (a === 'up' || a === 'down' || a === 'left' || a === 'right') return move(a);
        if (a === 'confirm') return activate(focusEl);
        if (a === 'options') return focusEl && menuFor(focusEl);
        if (a === 'back') return A.pop();
        if (a === 'search' && page === 'projects') return $('.hb-search', root).focus();
      },
    });
    render(false);
  }

  SV.dev.open = open;
  SV.devhub = { open };
})();

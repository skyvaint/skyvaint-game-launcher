// DEVELOPER mode: a hub for Roblox developers. Quick links into Studio and the Creator Dashboard, a commission
// tracker (your own entries, plus requests read from your Discord channel), your Studio projects with their player
// counts, and DevForum news. Turning developer mode on also adds the Studio rows under HOME.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, toast, hints, R, heading } = A;
  const dev = () => A.cfg.dev;
  const num = (n) => (SV.lists ? SV.lists.num(+n || 0) : String(n || 0));
  const STATUS = ['REQUESTED', 'ACCEPTED', 'IN PROGRESS', 'REVIEW', 'DELIVERED', 'PAID', 'CANCELLED'];
  const openUrl = (url) => { audio.play('confirm'); host.send('openUrl', { url }); };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const due = (c) => {
    if (!c.due) return '';
    const days = Math.ceil((new Date(c.due + 'T23:59:59').getTime() - Date.now()) / 864e5);
    return isNaN(days) ? c.due : days < 0 ? `${-days}D LATE` : days === 0 ? 'DUE TODAY' : `DUE IN ${days}D`;
  };
  const open = (c) => !['PAID', 'CANCELLED', 'DELIVERED'].includes(c.status);

  // New commission: a short chain of questions. Only the title is required.
  function addCommission(after, from = {}) {
    const c = { id: newId(), title: from.title || '', client: from.client || '', price: from.price || '', due: '', status: 'REQUESTED', notes: from.notes || '', link: from.link || '', created: Date.now() };
    const step = (q, key, next) => A.ask({ tag: 'NEW COMMISSION', button: 'NEXT', ...q, value: c[key] || '', done: (v) => { c[key] = v.trim(); setTimeout(next, 80); } });
    step({ title: 'WHAT IS IT?', label: 'Title', placeholder: 'e.g. Lobby map + shop UI' }, 'title', () =>
      step({ title: 'FOR WHO?', label: 'Client', placeholder: 'Discord or Roblox name' }, 'client', () =>
        step({ title: 'PRICE', label: 'Price', placeholder: 'e.g. $120 or 15k Robux' }, 'price', () =>
          step({ title: 'DEADLINE', label: 'Due date (YYYY-MM-DD, empty for none)', placeholder: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), button: 'ADD' }, 'due', () => {
            if (!c.title) return toast('A commission needs a title.', 'bad');
            dev().commissions.unshift(c);
            A.changed();
            audio.play('pick');
            toast('Commission added');
            after && after();
          }))));
  }

  function commissionMenu(c, after) {
    A.openMenu(c.title, [
      ...STATUS.map((s) => ({ label: 'STATUS: ' + s, sub: c.status === s ? 'current' : '', run: () => { c.status = s; if (s === 'PAID') c.paidAt = Date.now(); A.changed(); after(); if (s === 'PAID') { audio.play('star'); SV.fx.confetti(); } } })),
      { label: 'RENAME', run: () => A.ask({ tag: 'COMMISSION', title: 'RENAME', label: 'Title', value: c.title, done: (v) => { c.title = v; A.changed(); after(); } }) },
      { label: 'CLIENT', sub: c.client, run: () => A.ask({ tag: 'COMMISSION', title: 'CLIENT', label: 'Client', value: c.client, done: (v) => { c.client = v; A.changed(); after(); } }) },
      { label: 'PRICE', sub: c.price, run: () => A.ask({ tag: 'COMMISSION', title: 'PRICE', label: 'Price', value: c.price, done: (v) => { c.price = v; A.changed(); after(); } }) },
      { label: 'DEADLINE', sub: c.due, run: () => A.ask({ tag: 'COMMISSION', title: 'DEADLINE', label: 'Due date (YYYY-MM-DD)', value: c.due, done: (v) => { c.due = v.trim(); A.changed(); after(); } }) },
      { label: 'NOTES', sub: c.notes.slice(0, 60), run: () => A.ask({ tag: 'COMMISSION', title: 'NOTES', label: 'Notes', value: c.notes, done: (v) => { c.notes = v; A.changed(); after(); } }) },
      ...(c.link ? [{ label: 'OPEN THE DISCORD MESSAGE', run: () => openUrl(c.link) }] : []),
      { label: 'DELETE', danger: true, run: () => A.confirmMenu(`Delete "${c.title}"?`, 'DELETE', () => { dev().commissions = dev().commissions.filter((x) => x !== c); A.changed(); after(); }) },
    ]);
  }

  // Robux / dollars are free text, so the total only adds up the plain numbers in each price.
  const money = (list) => {
    let usd = 0, robux = 0;
    for (const c of list) {
      const m = String(c.price || '').replace(/,/g, '').match(/([\d.]+)\s*(k)?/i);
      if (!m) continue;
      const v = parseFloat(m[1]) * (m[2] ? 1000 : 1);
      if (/robux|r\$|rbx/i.test(c.price)) robux += v; else usd += v;
    }
    return [usd ? '$' + usd.toLocaleString() : '', robux ? num(robux) + ' R$' : ''].filter(Boolean).join(' + ') || '—';
  };

  function rows(rerender) {
    const list = dev().commissions, live = list.filter(open), paid = list.filter((c) => c.status === 'PAID');
    const studio = SV.lists ? SV.lists.studioData() : { cloud: [], local: [], loaded: false };
    const discord = (SV.rails && SV.rails.commissions && SV.rails.commissions.items) || [];
    return [
      el(`<div class="dev-summary">${[
        ['OPEN COMMISSIONS', String(live.length)], ['DUE THIS WEEK', String(live.filter((c) => { const d = due(c); return /TODAY|LATE|IN [1-7]D/.test(d); }).length)],
        ['EARNED (PAID)', money(paid)], ['WAITING ON', money(live)], ['STUDIO GAMES', String(studio.cloud.length)],
        ['PLAYERS NOW', num(studio.cloud.reduce((s, g) => s + (+g.playing || 0), 0))],
      ].map(([k, v]) => `<div class="stat"><span>${esc(A.T(k))}</span><b>${esc(v)}</b></div>`).join('')}</div>`),
      heading('DATA'),
      R.toggle('Prompt data selection', 'On start, asks which settings to load: the current ones, the copies in the settings folder (.bak and other .json files) or an automatic backup. Whatever you have now is backed up first.', A.at('dev.promptData')),
      R.button('Load other data', 'Pick a settings file and restart on it.', 'CHOOSE', () => host.send('dataFiles', { prompt: false })),
      heading('QUICK'),
      R.buttons('Roblox Studio', 'Open Studio, or jump to your creations on the web.', [
        ['OPEN STUDIO', () => { const g = A.cfg.games.find((x) => x.id === 'roblox_studio' || /roblox studio/i.test(x.name)); if (g) { A.pop(); A.launchDirect(g); } else openUrl('https://create.roblox.com/'); }],
        ['CREATIONS', () => openUrl('https://create.roblox.com/dashboard/creations')],
        ['ANALYTICS', () => openUrl('https://create.roblox.com/dashboard/analytics')],
      ]),
      R.buttons('Help and community', '', [
        ['DOCS', () => openUrl('https://create.roblox.com/docs')],
        ['DEVFORUM', () => openUrl('https://devforum.roblox.com/')],
        ['TALENT HUB', () => openUrl('https://talent.roblox.com/')],
        ['TOOLBOX', () => openUrl('https://create.roblox.com/store/models')],
      ]),
      heading(`COMMISSIONS · ${live.length} OPEN`),
      R.button('New commission', 'Track a job: who it is for, the price, the deadline and where it stands.', 'ADD', () => addCommission(rerender)),
      ...(list.length ? [] : [el('<div class="row-note">No commissions yet. Add one, or turn a Discord request into one below.</div>')]),
      ...list.map((c) => {
        const r = R.buttons(c.title, [c.client, c.price, c.status, due(c)].filter(Boolean).join(' · '), [
          ['STATUS ›', () => { c.status = STATUS[(STATUS.indexOf(c.status) + 1) % STATUS.length]; if (c.status === 'PAID') c.paidAt = Date.now(); A.changed(); audio.play('toggle'); rerender(); }],
          ['MORE', () => commissionMenu(c, rerender)],
        ]);
        r.classList.add('commission', 's-' + c.status.toLowerCase().replace(/\s+/g, '-'));
        return r;
      }),
      ...(discord.length ? [heading('REQUESTS IN YOUR DISCORD CHANNEL'), ...discord.slice(0, 12).map((m) => R.buttons(m.author + (m.title ? ' — ' + m.title : ''), m.text.slice(0, 140), [
        ['TRACK IT', () => addCommission(rerender, { title: m.title || m.text.split('\n')[0].slice(0, 60), client: m.author, notes: m.text, link: m.app })],
        ['OPEN', () => openUrl(m.app)],
      ]))] : [R.button('Discord requests', 'Read commission requests from a Discord channel with your own bot.', 'SET UP', () => { A.pop(); A.openSettings('feeds'); })]),
      heading(`STUDIO PROJECTS · ${studio.cloud.length} CLOUD · ${studio.local.filter((f) => f.exists).length} FILES`),
      ...(studio.loaded ? [] : [el('<div class="row-note">Reading Studio…</div>')]),
      ...studio.cloud.map((c) => R.buttons(c.name, `${num(c.playing)} PLAYING · ${num(c.visits)} VISITS${c.updated ? ' · UPDATED ' + new Date(c.updated).toLocaleDateString() : ''}`, [
        ['EDIT', () => SV.lists.openCloud(c)],
        ['DETAILS', () => SV.details.roblox({ placeId: c.placeId, universeId: c.universeId, name: c.name, icon: c.icon, thumb: c.thumb })],
      ])),
      ...studio.local.filter((f) => f.exists).slice(0, 10).map((f) => R.buttons(f.name, (f.folder || '').toUpperCase(), [['OPEN', () => SV.lists.openFile(f)], ['FOLDER', () => host.send('revealFile', { path: f.path })]])),
      R.button('Refresh Studio projects', '', 'REFRESH', () => { SV.lists.loadStudio(true); toast('Reading Studio projects…'); setTimeout(rerender, 1500); }),
      heading('SETTINGS'),
      R.toggle('Developer mode', 'Adds the Developer button and the Studio, DevForum and commission rows under HOME.', A.at('dev.enabled'), () => A.changed('games')),
    ];
  }

  function hub() {
    if (!dev().enabled) { dev().enabled = true; A.changed('games'); toast('Developer mode on'); }
    const root = el(`
      <div class="overlay"><div class="sheet wide-sheet">
        <div class="sheet-head"><div><div class="tag">[ ${esc(A.T('DEVELOPER'))} ]</div><h2>${esc(A.T('ROBLOX DEV HUB'))}</h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Choose'], ['adjust', 'Move'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), p = A.panel(body);
    const build = (i) => { body.replaceChildren(...rows(() => { if (root.isConnected) build(p.idx); })); p.focus(typeof i === 'number' ? i : 0); };
    SV.lists && SV.lists.loadStudio(false);
    build();
    host.send('commissions');
    const again = () => { if (root.isConnected) build(p.idx); };
    host.on('studioProjects', again);
    host.on('commissions', () => setTimeout(again, 0));
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    A.push({ el: root, action: p.action });
  }

  // Settings → DEVELOPER: the same switch plus the hub.
  function settingsRows(rerender) {
    return [
      heading('DEVELOPER MODE'),
      R.toggle('Developer mode', 'Adds the Developer button (top bar) and the Studio projects, Studio news and commissions rows under HOME.', A.at('dev.enabled'), () => { A.changed('games'); rerender(); }),
      R.button('Open the dev hub', 'Studio, commissions and links in one place.', 'OPEN', hub),
      R.button('New commission', '', 'ADD', () => addCommission(rerender)),
    ];
  }

  // ---------------------------------------------------------------- data picker
  // "Prompt data selection": on start, choose which settings file to load. The shell lists the files, backs up
  // what is there now, writes the chosen one and restarts (without asking again).
  const stamp = (ms) => new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function pickData(files) {
    if (!files || !files.length) return toast('No settings files found.', 'bad');
    A.openMenu('LOAD WHICH DATA?', files.map((f) => ({
      label: (f.current ? '● ' : '') + f.label,
      sub: `${f.current ? 'LOADED NOW · ' : ''}${stamp(f.at)} · ${f.games} GAMES · ${f.accounts} ROBLOX · ${f.bars} BARS${f.sounds ? ' · ' + f.sounds + ' SOUNDS' : ''}`,
      run: () => { if (f.current) return; toast('Loading that data — the launcher restarts'); host.send('loadData', { file: f.file }); },
    })), 'Pick the settings to start with. The ones you have now are backed up first. BACK keeps the current ones.');
  }
  let pendingPick = null;
  host.on('init', () => { if (dev().enabled && dev().promptData) host.send('dataFiles', { prompt: true }); });
  host.on('dataFiles', (m) => {
    if (m.prompt && m.skip) return; // this start came from a pick
    const show = () => pickData(m.files);
    if (!m.prompt) return show();
    // At start: after the opening animation, and only once HOME is actually on screen.
    if (A.mode === 'home') setTimeout(show, 3800); else pendingPick = show;
  });
  host.on('mode', (m) => { if (m.mode === 'home' && pendingPick) { const show = pendingPick; pendingPick = null; setTimeout(show, 900); } });

  SV.dev = { open: hub, rows: settingsRows, addCommission };
})();

// Game lists: some games open a launcher of their own instead of starting straight away. Picking Roblox shows your
// saved places as a shelf (then the account / private server picker); picking Roblox Studio shows your projects
// (cloud games and recent files, read from Studio's own records). HOME draws these with its normal shelf.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { esc, toast } = A;
  const refresh = () => { SV.app.refreshList && SV.app.refreshList(); SV.rails && SV.rails.refresh(); };
  const num = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0));

  // ---------------------------------------------------------------- Roblox places

  let artAsked = new Set();
  // Places only carry a square icon; fetch the wide thumbnail, universe and player count once per place.
  function ensureArt() {
    const want = SV.roblox.places().filter((p) => !artAsked.has(p.placeId) && (!p.thumb || !p.universeId)).map((p) => p.placeId);
    if (!want.length) return;
    want.forEach((id) => artAsked.add(id));
    host.send('robloxPlaceArt', { placeIds: want });
  }
  // Player counts go stale, and a lookup that failed (Roblox busy) should be tried again: ask for every place.
  function refreshArt() {
    const ids = SV.roblox.places().map((p) => p.placeId).filter(Boolean);
    if (!ids.length) return;
    ids.forEach((id) => artAsked.add(id));
    host.send('robloxPlaceArt', { placeIds: ids });
  }
  host.on('robloxPlaceArt', (m) => {
    let changed = false;
    for (const it of m.items || []) {
      const p = SV.roblox.places().find((x) => +x.placeId === +it.placeId);
      if (!p) continue;
      if (it.thumb && p.thumb !== it.thumb) { p.thumb = it.thumb; changed = true; }
      if (!p.icon && it.icon) { p.icon = it.icon; changed = true; }
      if (it.universeId) p.universeId = it.universeId;
      p.playing = it.playing; p.visits = it.visits; p.creator = it.creator;
    }
    if (changed) A.save();
    refresh();
  });

  function placeItem(parent, p, i) {
    return {
      id: 'place_' + p.placeId, scanId: '-', platform: 'roblox', name: p.name,
      cover: p.icon || p.thumb || '', hero: p.thumb || p.icon || '', icon: p.icon || '',
      foot: 'PLAY', tag: `[ ROBLOX · ${p.server ? 'PRIVATE SERVER' : 'PUBLIC SERVERS'} ]`,
      heroTag: p.playing ? `MODE: ${num(p.playing)} PLAYING` : 'MODE: READY',
      tagline: p.creator ? `By ${p.creator}${p.visits ? ' · ' + num(p.visits) + ' visits' : ''}` : 'Pick accounts, then join',
      stats: [
        ['CCU', p.playing ? num(p.playing) : '—'],
        ['PEAK SEEN', peakOf(p.universeId, p.playing)],
        ['LAST PLAYED', A.lastPlayed(p.lastPlayed)],
        ['SERVER', p.server ? 'PRIVATE' : 'PUBLIC'],
        friendsLine(p.universeId) || SV.roblox.stat(),
      ],
      actions: [
        { label: 'PLAY', primary: true, run: () => SV.roblox.openAt(parent, i) },
        { label: p.server ? 'CHANGE SERVER' : 'PRIVATE SERVER', run: () => SV.roblox.setServer(p, refresh) },
        ...(p.server ? [{ label: 'PUBLIC', run: () => { delete p.server; A.save(); refresh(); toast('Using public servers for ' + p.name); } }] : []),
        { label: 'DETAILS', run: () => SV.details.place(p) },
        { label: 'OPTIONS', run: () => placeOptions(p) },
      ],
      _place: p,
    };
  }

  const peakOf = (uni, now) => { const c = SV.ccu && SV.ccu.stats(uni); return c ? num(Math.max(c.peak, +now || 0)) : '—'; };
  const friendsLine = (uni) => {
    const n = SV.friends && uni ? SV.friends.list.filter((f) => f.state === SV.friends.IN_GAME && +f.universeId === +uni).length : 0;
    return n ? ['FRIENDS HERE', String(n)] : null;
  };

  // Trending games follow your saved ones on the Roblox shelf, so there is always something new to try.
  let trending = [];
  host.on('discover', (m) => { trending = ((m.roblox && m.roblox.trending) || []).slice(0, 16); if (SV.app.inList) refresh(); });
  function trendItem(parent, x) {
    const pl = { placeId: x.placeId, name: x.title, icon: x.image };
    return {
      id: 'trend_' + x.universeId, scanId: '-', platform: 'roblox', name: x.title, cover: x.image, hero: x.image, icon: x.image,
      foot: 'TRENDING', tag: '[ ROBLOX · TRENDING ]', heroTag: `MODE: ${num(x.playing)} PLAYING`, tagline: x.sub,
      stats: [['CCU', num(x.playing)], ['PEAK SEEN', peakOf(x.universeId, x.playing)], ['LIKED', x.upVotes + x.downVotes ? Math.round(x.upVotes / (x.upVotes + x.downVotes) * 100) + '%' : '—'], friendsLine(x.universeId) || ['PLACE ID', String(x.placeId)]],
      actions: [
        { label: 'PLAY', primary: true, run: () => SV.roblox.playPlace(pl) },
        { label: 'DETAILS', run: () => SV.details.roblox({ ...pl, universeId: x.universeId }) },
        { label: 'SAVE', run: () => { if (!SV.roblox.places().some((p) => +p.placeId === +x.placeId)) { SV.roblox.places().push({ placeId: +x.placeId, name: x.title, icon: x.image || '' }); A.changed(); refresh(); } toast(x.title + ' saved to your games'); } },
      ],
      _trend: x,
    };
  }

  function placeOptions(p) {
    A.openMenu(p.name, [
      { label: 'PLAY', sub: 'Pick accounts and join', run: () => SV.roblox.openAt(null, SV.roblox.places().indexOf(p)) },
      { label: 'DETAILS', sub: 'Description, players, votes, screenshots', run: () => SV.details.place(p) },
      { label: p.server ? 'CHANGE PRIVATE SERVER' : 'JOIN A PRIVATE SERVER', sub: 'Paste its link or code', run: () => SV.roblox.setServer(p, refresh) },
      ...(p.server ? [{ label: 'BACK TO PUBLIC SERVERS', run: () => { delete p.server; A.save(); refresh(); } }] : []),
      { label: 'OPEN ON ROBLOX.COM', run: () => host.send('openUrl', { url: `https://www.roblox.com/games/${p.placeId}` }) },
      { label: 'EDIT IN STUDIO', run: () => host.send('openStudio', { kind: 'cloud', placeId: +p.placeId, universeId: +(p.universeId || 0) }) },
      { label: 'MOVE LEFT', run: () => SV.roblox.movePlace(p, -1, refresh) },
      { label: 'MOVE RIGHT', run: () => SV.roblox.movePlace(p, 1, refresh) },
      { label: 'REMOVE', danger: true, run: () => SV.roblox.removePlace(p, refresh) },
    ]);
  }

  const roblox = {
    title: 'ROBLOX', label: 'YOUR GAMES',
    items(parent) {
      ensureArt();
      if (!trending.length) host.send('discover', { fresh: false });
      const saved = SV.roblox.places(), mine = new Set(saved.map((p) => +p.placeId));
      return [...saved.map((p, i) => placeItem(parent, p, i)), ...trending.filter((x) => !mine.has(+x.placeId)).map((x) => trendItem(parent, x))];
    },
    add: { label: 'ADD PLACE', run: () => SV.roblox.addPlace(refresh) },
    options: (item) => (item._place ? placeOptions(item._place) : item._trend ? A.openMenu(item.name, item.actions.map((a) => ({ label: a.label, run: a.run }))) : null),
    extra: (parent) => [{ label: 'ACCOUNTS', run: () => SV.roblox.open(parent) }],
  };

  // ---------------------------------------------------------------- Roblox Studio projects

  let studio = { local: [], cloud: [], loaded: false, asked: 0 };
  function loadStudio(force) {
    if (!force && (studio.loaded || Date.now() - studio.asked < 20000)) return;
    studio.asked = Date.now();
    host.send('studioProjects');
  }
  host.on('studioProjects', (m) => { studio = { local: m.local || [], cloud: m.cloud || [], loaded: true, asked: studio.asked }; refresh(); });

  const openFile = (f) => { audio.play('confirm'); toast('Opening ' + f.name + ' in Studio…'); host.send('openStudio', { kind: 'file', path: f.path }); };
  const openCloud = (c) => { audio.play('confirm'); toast('Opening ' + c.name + ' in Studio…'); host.send('openStudio', { kind: 'cloud', placeId: +c.placeId, universeId: +c.universeId }); };

  function studioItems(parent) {
    loadStudio();
    const items = [{
      id: 'studio_open', scanId: '-', platform: 'roblox', name: 'Open Studio', cover: parent ? A.artSrc(parent, 'cover') : '', hero: parent ? A.artSrc(parent, 'hero') : '', icon: parent ? A.artSrc(parent, 'icon') : '',
      foot: 'OPEN', tag: '[ ROBLOX STUDIO ]', heroTag: 'MODE: READY', tagline: 'Start Studio on its home screen',
      stats: [['CLOUD GAMES', String(studio.cloud.length)], ['LOCAL FILES', String(studio.local.filter((f) => f.exists).length)]],
      actions: [{ label: 'OPEN STUDIO', primary: true, run: () => SV.app.launchDirect(parent) }],
    }];
    for (const c of studio.cloud)
      items.push({
        id: 'cloud_' + c.universeId, scanId: '-', platform: 'roblox', name: c.name, cover: c.icon || c.thumb, hero: c.thumb || c.icon, icon: c.icon,
        foot: 'EDIT', tag: '[ STUDIO · CLOUD GAME ]', heroTag: c.playing ? `MODE: ${num(c.playing)} PLAYING` : 'MODE: EDIT',
        tagline: `${c.creator ? 'By ' + c.creator + ' · ' : ''}${num(c.visits)} visits`,
        stats: [['TYPE', 'CLOUD'], ['PLAYING NOW', num(c.playing)], ['VISITS', num(c.visits)], ['UPDATED', c.updated ? new Date(c.updated).toLocaleDateString() : '—']],
        actions: [
          { label: 'EDIT IN STUDIO', primary: true, run: () => openCloud(c) },
          { label: 'PLAY', run: () => SV.roblox.playPlace({ placeId: c.placeId, name: c.name, icon: c.icon }) },
          { label: 'DETAILS', run: () => SV.details.roblox({ placeId: c.placeId, universeId: c.universeId, name: c.name, icon: c.icon, thumb: c.thumb }) },
          { label: 'PAGE', run: () => host.send('openUrl', { url: `https://www.roblox.com/games/${c.placeId}` }) },
        ],
        _cloud: c,
      });
    for (const f of studio.local)
      items.push({
        id: 'file_' + f.order + f.name, scanId: '-', platform: 'roblox', name: f.name, cover: '', hero: '', icon: '',
        foot: f.exists ? 'OPEN' : 'MISSING', tag: '[ STUDIO · LOCAL FILE ]', heroTag: f.exists ? 'MODE: LOCAL' : 'MODE: FILE MISSING',
        tagline: f.path,
        stats: [['TYPE', 'FILE'], ['FOLDER', (f.folder || '—').toUpperCase()], ['SAVED', f.modified ? A.lastPlayed(f.modified) : '—'], ['STATUS', f.exists ? 'READY' : 'MISSING']],
        actions: [
          { label: 'OPEN IN STUDIO', primary: true, run: () => openFile(f) },
          { label: 'SHOW IN FOLDER', run: () => host.send('revealFile', { path: f.path }) },
        ],
        _file: f,
      });
    return items;
  }

  const studioList = {
    title: 'ROBLOX STUDIO', label: 'PROJECTS',
    items: studioItems,
    options: (item) => A.openMenu(item.name, [
      ...item.actions.map((a) => ({ label: a.label, run: a.run })),
      { label: 'REFRESH THE LIST', run: () => loadStudio(true) },
    ]),
    extra: () => [{ label: 'REFRESH', run: () => { loadStudio(true); toast('Reading Studio projects…'); } }],
  };

  SV.lists = {
    roblox, studio: studioList,
    forGame(g) {
      if (!g) return null;
      if (g.target === 'sv:roblox') return 'roblox';
      if (g.id === 'roblox_studio' || /roblox studio/i.test(g.name)) return 'studio';
      return null;
    },
    studioData: () => { loadStudio(); return studio; },
    loadStudio, openFile, openCloud, placeOptions, ensureArt, refreshArt, num,
  };
})();

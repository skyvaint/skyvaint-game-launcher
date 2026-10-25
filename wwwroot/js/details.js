// DETAILS: a full screen about one game. Library games show your own numbers (playtime, last played, account) and,
// for Steam games, the store's description, genres and screenshots. Roblox games show the description, players,
// visits, votes, favourites and screenshots, plus which of your friends are in there right now.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, hints } = A;
  const num = (n) => (SV.lists ? SV.lists.num(+n || 0) : String(n || 0));
  const date = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString() : '—'; };
  const PLATFORM = { epic: 'EPIC GAMES', steam: 'STEAM', roblox: 'ROBLOX', pc: 'PC' };

  const waits = {};
  host.on('gameDetails', (m) => { const done = waits[m.token]; delete waits[m.token]; done && done(m); });
  function lookup(data) {
    return new Promise((resolve) => {
      const token = Math.random().toString(36).slice(2);
      waits[token] = resolve;
      host.send('gameDetails', { token, ...data });
      setTimeout(() => { if (waits[token]) { delete waits[token]; resolve({ error: 'No answer — try again in a moment.' }); } }, 25000);
    });
  }

  // model: { tag, title, hero, icon, stats: [[k, v]], desc, actions: [{ label, primary, run }], load() → Promise<partial model> }
  function show(model) {
    const root = el(`
      <div class="overlay full details"><div class="dt">
        <div class="dt-hero"><div class="dt-img"></div><div class="dt-shade"></div><div class="dt-cap"></div></div>
        <div class="dt-main"><div class="dt-stats"></div><div class="dt-ccu"></div><div class="dt-desc"></div><div class="dt-shots"></div></div>
        <div class="dt-btns"></div>
        <div class="hints">${hints([['confirm', 'Choose'], ['adjust', 'Move'], ['tabs', 'Screenshots'], ['move', 'Scroll'], ['back', 'Close']])}</div>
      </div></div>`);
    const main = $('.dt-main', root);
    let btnIdx = 0, shot = -1, loading = !!model.load;

    function paint() {
      const hero = shot >= 0 && model.shots && model.shots[shot] ? model.shots[shot] : model.hero;
      const img = $('.dt-img', root), anim = SV.media.animated(hero);
      img.style.backgroundImage = hero && !anim ? `url("${hero}")` : '';
      if (anim) { if (img.dataset.src !== hero) { img.innerHTML = SV.media.html(hero, 'dt-media'); img.dataset.src = hero; } } else if (img.dataset.src) { img.innerHTML = ''; img.dataset.src = ''; }
      img.classList.toggle('none', !hero);
      $('.dt-cap', root).innerHTML = `${model.icon ? SV.media.html(model.icon, 'dt-icon') : ''}
        <div><div class="tag">${esc(model.tag || '')}</div><h2>${esc(model.title || '')}</h2>${model.by ? `<small>${esc(model.by)}</small>` : ''}</div>`;
      $('.dt-stats', root).innerHTML = (model.stats || []).filter((s) => s && s[1] != null && s[1] !== '')
        .map(([k, v, hot]) => `<div class="stat ${hot ? 'hot' : ''}"><span>${esc(A.T(k))}</span><b>${esc(v)}</b></div>`).join('');
      $('.dt-ccu', root).innerHTML = model.chart ? `<div class="tag">[ ${esc(A.T('PLAYERS OVER TIME'))} · ${esc(model.chartNote || '')} ]</div>${model.chart}` : '';
      if (model.estimates && model.estimates.length) $('.dt-ccu', root).insertAdjacentHTML('beforeend', `<div class="tag dt-est-tag">[ ${esc(A.T('ESTIMATES'))} ]</div><div class="dt-stats dt-est">${model.estimates
        .filter((e) => e[1]).map(([k, v, n]) => `<div class="stat"><span>${esc(A.T(k))}</span><b>${esc(v)}</b>${n ? `<small>${esc(A.T(n))}</small>` : ''}</div>`).join('')}</div>`);
      const desc = $('.dt-desc', root);
      desc.classList.toggle('loading', loading);
      desc.innerHTML = loading && !model.desc ? '<div class="tag">LOADING DETAILS…</div>'
        : model.desc ? `<div class="tag">[ ABOUT ]</div><p>${esc(model.desc).slice(0, 4000)}</p>` : model.note ? `<p class="dim">${esc(model.note)}</p>` : '';
      const shots = model.shots || [];
      $('.dt-shots', root).innerHTML = shots.length ? `<div class="tag">[ SCREENSHOTS · Q / E ]</div><div class="dt-strip">${shots.map((s, i) =>
        `<button class="dt-shot ${i === shot ? 'on' : ''}" data-i="${i}" style="background-image:url('${esc(s)}')"></button>`).join('')}</div>` : '';
      const acts = model.actions || [];
      btnIdx = clamp(btnIdx, 0, Math.max(0, acts.length - 1));
      $('.dt-btns', root).innerHTML = acts.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${i === btnIdx ? 'focus' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('');
    }
    const run = (i) => { const a = (model.actions || [])[i]; if (a) { audio.play('confirm'); a.run(); } };
    const setShot = (d) => { const n = (model.shots || []).length; if (!n) return audio.play('error'); shot = ((shot + d + n + 1) % (n + 1)) - 1; audio.play('nav'); paint(); };

    $('.dt-btns', root).addEventListener('click', (e) => { const b = e.target.closest('.btn'); if (b) { btnIdx = +b.dataset.i; paint(); run(btnIdx); } });
    $('.dt-shots', root).addEventListener('click', (e) => { const b = e.target.closest('.dt-shot'); if (b) { shot = +b.dataset.i === shot ? -1 : +b.dataset.i; audio.play('nav'); paint(); } });
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });

    A.push({
      el: root,
      action(a) {
        const n = (model.actions || []).length;
        if (a === 'left' || a === 'right') { btnIdx = clamp(btnIdx + (a === 'left' ? -1 : 1), 0, n - 1); audio.play('nav'); paint(); }
        else if (a === 'up' || a === 'down') main.scrollBy({ top: a === 'up' ? -160 : 160, behavior: 'smooth' });
        else if (a === 'tabPrev' || a === 'tabNext') setShot(a === 'tabPrev' ? -1 : 1);
        else if (a === 'confirm') run(btnIdx);
        else if (a === 'back') A.pop();
      },
    });
    paint();
    if (model.load) model.load().then((extra) => { loading = false; Object.assign(model, extra || {}); if (root.isConnected) paint(); });
  }

  const close = () => { while (A.stack.length) A.pop(); SV.rails && SV.rails.close(); };

  // Friends of yours playing this Roblox game right now (from the FRIENDS row's last refresh).
  const friendsIn = (universeId) => (SV.friends ? SV.friends.list.filter((f) => f.state === SV.friends.IN_GAME && universeId && +f.universeId === +universeId) : []);
  const friendActions = (universeId) => friendsIn(universeId).slice(0, 3).map((f) => ({ label: 'JOIN ' + (f.displayName || f.name).toUpperCase(), run: () => SV.friends.join(f) }));

  const ago = (ms) => { if (!ms) return ''; const h = (Date.now() - ms) / 3.6e6; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm ago' : h < 48 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago'; };
  function robloxExtra(d) {
    const votes = (+d.upVotes || 0) + (+d.downVotes || 0), here = friendsIn(d.universeId);
    const c = SV.ccu ? SV.ccu.stats(d.universeId) : null;
    const ageDays = d.created ? Math.max(1, (Date.now() - new Date(d.created).getTime()) / 864e5) : 0;
    const lifetimePerDay = ageDays && d.visits ? Math.round(+d.visits / ageDays) : 0;
    const perDay = c && c.visitsPerDay ? c.visitsPerDay : 0;
    const servers = d.maxPlayers && d.playing ? Math.ceil(+d.playing / +d.maxPlayers) : 0;
    return {
      title: d.name, desc: d.description, by: d.creator ? 'By ' + d.creator : '', shots: d.shots || [], icon: d.icon,
      stats: [
        ['CCU (PLAYING NOW)', num(d.playing), true], ['PEAK CCU (SEEN)', c ? num(Math.max(c.peak, +d.playing || 0)) : ''], ['24H PEAK', c && c.peak24 ? num(c.peak24) : ''],
        ['24H AVERAGE', c && c.avg24 ? num(c.avg24) : ''], ['24H LOW', c && c.samples > 2 ? num(c.low24) : ''],
        ['VISITS', num(d.visits)], ['FAVOURITES', d.favorites != null ? num(d.favorites) : ''],
        ['LIKED', votes ? Math.round((+d.upVotes / votes) * 100) + '%' : ''], ['VOTES', votes ? num(votes) : ''], ['SERVER SIZE', d.maxPlayers ? String(d.maxPlayers) : ''],
        ['GENRE', d.genre && d.genre !== 'All' ? d.genre.toUpperCase() : ''], ['UPDATED', date(d.updated)], ['CREATED', date(d.created)],
        ['FRIENDS HERE', here.length ? here.map((f) => f.displayName || f.name).join(', ') : ''],
      ],
      estimates: [
        ['ACTIVE SERVERS', servers ? '~' + num(servers) : '', 'Players ÷ server size'],
        ['VISITS PER DAY', perDay ? '~' + num(perDay) : lifetimePerDay ? '~' + num(lifetimePerDay) : '', perDay ? 'From the visits seen here' : 'Lifetime average'],
        ['VISITS PER MONTH', perDay ? '~' + num(perDay * 30) : lifetimePerDay ? '~' + num(lifetimePerDay * 30) : '', ''],
        ['FAVOURITES PER 1K VISITS', d.favorites && d.visits ? (+d.favorites / +d.visits * 1000).toFixed(1) : '', 'How many visitors keep it'],
        ['PEAK SEEN', c && c.peakAt ? ago(c.peakAt) : '', ''],
      ],
      chart: c && c.series.length > 1 ? SV.ccu.chart(d.universeId) : '',
      chartNote: c ? `${c.samples} ${A.T('SAMPLES SINCE')} ${new Date(c.since).toLocaleDateString()}` : '',
    };
  }

  SV.details = {
    // A game from your library.
    game(g) {
      const s = A.stats[g.id] || {}, scan = A.scanOf(g) || {};
      const appId = (String(g.scanId || '').match(/^steam_(\d+)$/) || String(g.target || '').match(/rungameid\/(\d+)/) || [])[1];
      const platform = PLATFORM[g.platform] || 'PC';
      const playtime = s.seconds ? (s.seconds >= 3600 ? `${Math.floor(s.seconds / 3600)}h ${Math.floor((s.seconds % 3600) / 60)}m` : `${Math.max(1, Math.round(s.seconds / 60))}m`) : '—';
      const model = {
        tag: `[ ${platform} ]`, title: g.name, hero: A.artSrc(g, 'hero') || A.artSrc(g, 'cover'), icon: A.artSrc(g, 'icon'),
        stats: [['PLATFORM', platform], ['STATUS', A.isInstalled(g) ? 'INSTALLED' : 'NOT INSTALLED'], ['LAST PLAYED', A.lastPlayed(s.lastPlayed)], ['PLAYTIME', playtime],
          ...(g.platform === 'steam' && SV.steam.statFor(g) ? [SV.steam.statFor(g)] : []), ...(g.platform === 'epic' && SV.epic.statFor(g) ? [SV.epic.statFor(g)] : [])],
        desc: g.tagline || '',
        note: g.platform === 'epic' ? 'Epic doesn\'t share store details with other launchers.' : g.platform === 'pc' ? 'A game you added yourself.' : '',
        actions: [
          { label: A.isInstalled(g) ? 'START' : 'INSTALL', primary: true, run: () => { close(); A.launch(g); } },
          { label: 'GO TO IT', run: () => { close(); A.jumpTo(g); } },
          ...(appId ? [{ label: 'STORE PAGE', run: () => host.send('openUrl', { url: `https://store.steampowered.com/app/${appId}` }) }] : []),
          ...(g.target === 'sv:roblox' ? [{ label: 'ACCOUNTS', run: () => { close(); SV.roblox.open(g); } }] : []),
        ],
      };
      if (appId) model.load = () => lookup({ kind: 'steam', appId }).then((m) => {
        if (m.error || !m.details) return { note: m.error || '' };
        const d = m.details;
        return {
          desc: d.description || g.tagline, shots: d.shots || [], by: d.developers ? 'By ' + d.developers : '',
          stats: [...model.stats, ['RELEASED', d.released || ''], ['GENRES', (d.genres || '').toUpperCase()], ['METACRITIC', d.metacritic != null ? String(d.metacritic) : ''],
            ['REVIEWS', d.recommendations ? num(d.recommendations) : '']],
        };
      });
      show(model);
    },

    // A Steam store item that isn't in your library (rows under HOME, DISCOVER).
    steam(appId, name, image, item = {}) {
      const owned = A.cfg.games.find((g) => g.scanId === 'steam_' + appId);
      if (owned) return SV.details.game(owned);
      const model = {
        tag: '[ STEAM STORE ]', title: name, hero: image, stats: [['PRICE', item.sub || '']],
        actions: [
          { label: 'STORE PAGE', primary: true, run: () => host.send('openUrl', { url: SV.steam.installed ? `steam://store/${appId}` : `https://store.steampowered.com/app/${appId}` }) },
          { label: 'OPEN IN BROWSER', run: () => host.send('openUrl', { url: `https://store.steampowered.com/app/${appId}` }) },
        ],
      };
      model.load = () => lookup({ kind: 'steam', appId }).then((m) => {
        if (m.error || !m.details) return { note: m.error || '' };
        const d = m.details;
        return {
          desc: d.description, shots: d.shots || [], by: d.developers ? 'By ' + d.developers : '', hero: (d.shots || [])[0] || image,
          stats: [...model.stats, ['RELEASED', d.released || ''], ['GENRES', (d.genres || '').toUpperCase()], ['METACRITIC', d.metacritic != null ? String(d.metacritic) : ''],
            ['REVIEWS', d.recommendations ? num(d.recommendations) : ''], ['PUBLISHER', d.publishers || '']],
        };
      });
      show(model);
    },

    // One of your saved Roblox places.
    place(p) {
      const i = SV.roblox.places().indexOf(p);
      SV.details.roblox({ placeId: p.placeId, universeId: p.universeId, name: p.name, icon: p.icon, thumb: p.thumb, saved: i, server: !!p.server, lastPlayed: p.lastPlayed });
    },

    // Any Roblox game by place (and, if known, universe) ID.
    roblox(x) {
      const play = () => { close(); if (x.saved >= 0) SV.roblox.openAt(null, x.saved); else SV.roblox.playPlace({ placeId: x.placeId, name: x.name, icon: x.icon }); };
      const model = {
        tag: `[ ROBLOX${x.saved >= 0 ? ' · ' + (x.server ? 'PRIVATE SERVER' : 'SAVED PLACE') : ''} ]`, title: x.name || 'Roblox game', hero: x.thumb || x.icon, icon: x.icon,
        stats: [['PLACE ID', String(x.placeId)], ...(x.saved >= 0 ? [['LAST PLAYED', A.lastPlayed(x.lastPlayed)]] : [])],
        actions: [
          { label: 'PLAY', primary: true, run: play },
          ...friendActions(x.universeId),
          { label: 'ROBLOX PAGE', run: () => host.send('openUrl', { url: `https://www.roblox.com/games/${x.placeId}` }) },
          { label: 'EDIT IN STUDIO', run: () => host.send('openStudio', { kind: 'cloud', placeId: +x.placeId, universeId: +(x.universeId || 0) }) },
        ],
      };
      model.load = () => lookup({ kind: 'roblox', placeId: x.placeId, universeId: x.universeId || 0 }).then((m) => {
        if (m.error || !m.details) return { note: m.error || "Couldn't reach Roblox." };
        const extra = robloxExtra(m.details);
        extra.stats = [...model.stats, ...extra.stats];
        extra.hero = x.thumb || (extra.shots || [])[0] || model.hero;
        if (!x.universeId) extra.actions = [model.actions[0], ...friendActions(m.details.universeId), ...model.actions.slice(1)];
        return extra;
      });
      show(model);
    },
  };
})();

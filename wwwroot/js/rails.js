// Rows under HOME: scroll down (or press down past the buttons) and the launcher slides up to show rows of cards —
// your Roblox games, Roblox Studio projects, games coming soon, Roblox Studio news, and commission requests read
// from a Discord channel. Each row scrolls sideways like the shelf.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, R, heading } = A;
  const rs = () => A.cfg.rails;

  let open = false, railIdx = 0, feeds = { upcoming: null, news: null }, commissions = { items: null, error: '', channelName: '' }, fetchedAt = 0, hasBot = false;
  const cardIdx = {};

  const root = el(`<section id="rails"><div class="rails-sweep"></div><div class="rails-head"><div class="rails-frame"><div class="tag">[ 02 — MORE ]</div><b class="rails-now"></b><span class="rails-dots"></span></div><div class="rails-hint"></div></div><div class="rails-body"></div></section>`);
  document.body.append(root);
  const body = $('.rails-body', root);

  host.on('feeds', (m) => { feeds = { upcoming: m.upcoming || [], news: m.news || [] }; render(); });
  host.on('commissions', (m) => { commissions = { items: m.items || null, error: m.error || '', channelName: m.channelName || '' }; render(); });
  host.on('discordBot', (m) => { hasBot = !!m.has; if (A.cfg) render(); });

  function fetchAll(force) {
    if (!force && Date.now() - fetchedAt < 10 * 60e3) return;
    fetchedAt = Date.now();
    host.send('feeds', { fresh: !!force });
    SV.lists && SV.lists.loadStudio(force);
  }

  const openUrl = (url) => { audio.play('confirm'); host.send('openUrl', { url }); };
  const ago = (iso) => { const ms = Date.now() - new Date(iso).getTime(), h = Math.floor(ms / 3.6e6); return h < 1 ? Math.max(1, Math.floor(ms / 6e4)) + 'M AGO' : h < 48 ? h + 'H AGO' : Math.floor(h / 24) + 'D AGO'; };

  const timeAgo = (ms) => { if (!ms) return ''; const m = Math.floor((Date.now() - ms) / 6e4); return m < 60 ? Math.max(1, m) + 'M AGO' : m < 2880 ? Math.floor(m / 60) + 'H AGO' : Math.floor(m / 1440) + 'D AGO'; };

  // What you played last, games and Roblox places together, newest first.
  function recentCards() {
    const stats = A.stats, games = A.cfg.games.filter((g) => (stats[g.id] || {}).lastPlayed).map((g) => ({ g, at: stats[g.id].lastPlayed }));
    const places = SV.roblox.places().map((p, i) => ({ p, i, at: p.lastPlayed || 0 })).filter((x) => x.at);
    return [...games, ...places].sort((a, b) => b.at - a.at).slice(0, 14).map((x) => x.g ? {
      img: A.artSrc(x.g, 'hero') || A.artSrc(x.g, 'cover'), title: x.g.name, cls: 'wide' + (A.running.has(x.g.id) ? ' live' : ''),
      sub: `${A.running.has(x.g.id) ? 'RUNNING' : A.lastPlayed(x.at)} · ${A.playtime((stats[x.g.id] || {}).seconds)} PLAYED`,
      run: () => { close(); setTimeout(() => A.launch(x.g), 250); },
      options: () => A.openMenu(x.g.name, [
        { label: 'START', run: () => { close(); A.launch(x.g); } },
        { label: 'DETAILS', run: () => SV.details.game(x.g) },
        { label: 'GO TO IT', run: () => { close(); A.jumpTo(x.g); } },
      ]),
    } : {
      img: x.p.thumb || x.p.icon, title: x.p.name, cls: 'wide', sub: `ROBLOX · ${A.lastPlayed(x.at)}`,
      run: () => { close(); SV.roblox.openAt(null, x.i); },
      options: () => A.openMenu(x.p.name, [
        { label: 'PLAY', run: () => { close(); SV.roblox.openAt(null, x.i); } },
        { label: 'DETAILS', run: () => SV.details.place(x.p) },
      ]),
    });
  }

  const PRESENCE = { 2: 'IN GAME', 3: 'IN STUDIO', 1: 'ONLINE', 0: 'OFFLINE' };
  function friendCards() {
    const F = SV.friends, st = F.state;
    if (st === 'noaccount') return [{ glyph: '+', title: 'ADD A ROBLOX ACCOUNT', sub: 'SEE WHO IS ONLINE AND JOIN THEM', cls: 'friend add', run: () => { close(); A.openSettings('accounts'); } }];
    if (st === 'signedout') return [{ glyph: '!', title: 'SIGN IN AGAIN', sub: (SV.roblox.label(F.account()) || '').toUpperCase() + ' IS SIGNED OUT', cls: 'friend add', run: () => { close(); A.openSettings('accounts'); } }];
    if (st === 'error' && !F.list.length) return [{ glyph: '↻', title: "COULDN'T LOAD FRIENDS", sub: 'ENTER TO TRY AGAIN', cls: 'friend add', run: () => { F.refresh(true); toast('Asking Roblox again…'); } }];
    return F.list.slice(0, 60).map((f) => {
      const live = f.state === F.IN_GAME, name = f.displayName || f.name;
      return {
        cls: 'friend p' + (f.state || 0), run: () => (live ? F.join(f) : f.universeId ? SV.details.roblox({ placeId: f.rootPlaceId || f.placeId, universeId: f.universeId, name: f.where }) : toast(`${name} is ${PRESENCE[f.state || 0].toLowerCase()}.`)),
        html: `<div class="fr-face" ${f.head ? `style="background-image:url('${esc(f.head)}')"` : ''}>${f.head ? '' : `<span>${esc((name[0] || '?').toUpperCase())}</span>`}<i></i></div>
          <div class="fr-meta"><b>${esc(name)}</b><small>${live || f.state === F.STUDIO ? esc(f.where || PRESENCE[f.state]) : PRESENCE[f.state || 0]}</small>
          ${live ? `<span class="fr-join">${f.gameIcon ? `<img src="${esc(f.gameIcon)}" alt="">` : ''}JOIN</span>` : ''}</div>`,
        options: () => A.openMenu(name, [
          ...(live ? [{ label: 'JOIN', sub: f.where || 'Their game', run: () => F.join(f) }] : []),
          ...(f.universeId ? [{ label: 'GAME DETAILS', sub: f.where, run: () => SV.details.roblox({ placeId: f.rootPlaceId || f.placeId, universeId: f.universeId, name: f.where }) }] : []),
          { label: 'VIEW PROFILE', run: () => openUrl(`https://www.roblox.com/users/${f.id}/profile`) },
          ...(SV.roblox.accounts().length > 1 ? [{ label: 'SHOW ANOTHER ACCOUNT\'S FRIENDS', run: () => F.chooseAccount(render) }] : []),
          { label: 'REFRESH', run: () => { F.refresh(true); toast('Refreshing friends…'); } },
        ]),
      };
    });
  }

  // Each row: { id, title, note, cards: [{ img, title, sub, cls, html, run, options }] }
  function rails() {
    const out = [], show = rs().show;
    if (show.recent !== false) {
      const cards = recentCards();
      if (cards.length) out.push({ id: 'recent', title: 'JUMP BACK IN', note: 'LAST PLAYED · ENTER STARTS IT', cards });
    }
    if (show.friends !== false && SV.friends) {
      const F = SV.friends, list = F.list, a = F.account();
      const inGame = list.filter((f) => f.state === F.IN_GAME).length, online = list.filter((f) => f.state && f.state !== F.IN_GAME).length;
      out.push({
        id: 'friends', title: 'FRIENDS',
        note: F.state === 'loading' && !list.length ? 'LOADING…' : list.length ? `${inGame} IN GAME · ${online} ONLINE · ${list.length} FRIENDS${a ? ' · AS @' + a.username.toUpperCase() : ''}${F.updated ? ' · ' + timeAgo(F.updated) : ''}` : 'ROBLOX',
        cards: friendCards(),
      });
    }
    if (show.roblox) {
      const places = SV.roblox.places();
      SV.lists && SV.lists.ensureArt();
      out.push({
        id: 'roblox', title: 'ROBLOX GAMES', note: places.length ? `${places.length} SAVED · ENTER TO PICK ACCOUNTS` : 'ADD THE GAMES YOU PLAY',
        cards: [
          ...places.map((p, i) => ({ img: p.thumb || p.icon, title: p.name, sub: (p.server ? 'PRIVATE SERVER' : 'PUBLIC') + (p.playing ? ` · ${SV.lists.num(p.playing)} PLAYING` : ''), cls: 'wide',
            run: () => { close(); SV.roblox.openAt(null, i); }, options: () => SV.lists.placeOptions(p) })),
          { glyph: '+', title: 'ADD PLACE', sub: 'GAME LINK OR ID', cls: 'wide add', run: () => SV.roblox.addPlace(render) },
        ],
      });
    }
    if (show.studio && SV.lists) {
      const s = SV.lists.studioData();
      out.push({
        id: 'studio', title: 'STUDIO PROJECTS', note: s.loaded ? `${s.cloud.length} CLOUD · ${s.local.length} FILES` : 'READING STUDIO…',
        cards: [
          ...s.cloud.map((c) => ({ img: c.thumb || c.icon, title: c.name, sub: `CLOUD · ${SV.lists.num(c.visits)} VISITS`, cls: 'wide', run: () => SV.lists.openCloud(c),
            options: () => A.openMenu(c.name, [{ label: 'EDIT IN STUDIO', run: () => SV.lists.openCloud(c) }, { label: 'PLAY', run: () => { close(); SV.roblox.playPlace({ placeId: c.placeId, name: c.name, icon: c.icon }); } }, { label: 'DETAILS', run: () => SV.details.roblox({ placeId: c.placeId, universeId: c.universeId, name: c.name, icon: c.icon, thumb: c.thumb }) }, { label: 'OPEN ON ROBLOX.COM', run: () => openUrl(`https://www.roblox.com/games/${c.placeId}`) }]) })),
          ...s.local.filter((f) => f.exists).map((f) => ({ title: f.name, sub: 'FILE · ' + (f.folder || '').toUpperCase(), cls: 'wide file', glyph: '.rbxl', run: () => SV.lists.openFile(f),
            options: () => A.openMenu(f.name, [{ label: 'OPEN IN STUDIO', run: () => SV.lists.openFile(f) }, { label: 'SHOW IN FOLDER', run: () => host.send('revealFile', { path: f.path }) }]) })),
        ],
      });
    }
    if (show.upcoming) out.push({
      id: 'upcoming', title: 'COMING SOON', note: feeds.upcoming ? 'STEAM + EPIC' : 'LOADING…',
      cards: (feeds.upcoming || []).map((g) => ({ img: g.image, title: g.title, sub: g.sub, cls: 'wide', run: () => openUrl(g.steam && SV.app.cfg.games.some((x) => x.platform === 'steam') ? g.steam : g.url) })),
    });
    if (show.news) out.push({
      id: 'news', title: 'ROBLOX STUDIO NEWS', note: feeds.news ? 'DEVFORUM ANNOUNCEMENTS' : 'LOADING…',
      cards: (feeds.news || []).map((n) => ({ img: n.image, title: n.title, sub: n.sub, cls: 'wide news' + (n.image ? '' : ' noimg'), glyph: 'DEVFORUM', run: () => openUrl(n.url) })),
    });
    if (show.commissions) {
      const c = commissions;
      let cards;
      if (c.error === 'nobot' || c.error === 'nochannel' || (!hasBot && !c.items))
        cards = [{ glyph: '⚙', title: 'CONNECT DISCORD', sub: 'YOUR BOT TOKEN + THE COMMISSIONS CHANNEL', cls: 'msg add', run: () => { close(); A.openSettings('feeds'); } }];
      else if (c.error) cards = [{ glyph: '!', title: "COULDN'T READ THE CHANNEL", sub: c.error.toUpperCase(), cls: 'msg add', run: () => { close(); A.openSettings('feeds'); } }];
      else cards = (c.items || []).map((x) => ({
        cls: 'msg', run: () => openUrl(x.app), html: `
          <div class="rc-msg-top">${x.avatar ? `<img src="${esc(x.avatar)}" alt="">` : '<i></i>'}<b>${esc(x.author)}</b><small>${esc(ago(x.time))}</small></div>
          ${x.title ? `<div class="rc-msg-title">${esc(x.title)}</div>` : ''}
          <p>${esc(x.text).slice(0, 360)}</p>${x.image ? `<div class="rc-msg-img" style="background-image:url('${esc(x.image)}')"></div>` : ''}`,
        options: () => A.openMenu('Commission from ' + x.author, [
          { label: 'OPEN IN DISCORD', run: () => openUrl(x.app) },
          { label: 'OPEN IN BROWSER', run: () => openUrl(x.url) },
          { label: 'COPY THE TEXT', run: () => { navigator.clipboard.writeText(x.text).then(() => toast('Copied')); } },
        ]),
      }));
      out.push({ id: 'commissions', title: 'COMMISSIONS', note: c.items ? `#${(c.channelName || 'channel').toUpperCase()} · ${c.items.length} LATEST` : 'DISCORD', cards });
    }
    return out.filter((r) => r.cards.length || r.id === 'upcoming' || r.id === 'news' || r.id === 'friends');
  }

  let current = [];
  function render() {
    if (!A.cfg || !open) return;
    current = rails();
    railIdx = clamp(railIdx, 0, Math.max(0, current.length - 1));
    body.innerHTML = current.map((r, ri) => `
      <div class="rail" data-r="${ri}" style="--ri:${ri}">
        <div class="rail-head"><b>${esc(r.title)}</b><span class="tag">${esc(r.note || '')}</span></div>
        <div class="rail-row">${r.cards.length ? r.cards.map((c, ci) => `
          <button class="rail-card ${esc(c.cls || '')}" data-c="${ci}">
            ${c.html ? c.html : `<div class="rc-img" ${c.img ? `style="background-image:url('${esc(c.img)}')"` : ''}>${!c.img && c.glyph ? `<span>${esc(c.glyph)}</span>` : ''}</div>
            <div class="rc-meta"><b>${esc(c.title)}</b><small>${esc(c.sub || '')}</small></div>`}
          </button>`).join('') : '<div class="rail-empty tag">LOADING…</div>'}</div>
      </div>`).join('');
    paint(false);
  }

  function paint(scroll = true) {
    body.querySelectorAll('.rail').forEach((railEl, ri) => {
      railEl.classList.toggle('on', ri === railIdx);
      const n = current[ri] ? current[ri].cards.length : 0;
      const ci = clamp(cardIdx[ri] || 0, 0, Math.max(0, n - 1));
      railEl.querySelectorAll('.rail-card').forEach((c, k) => c.classList.toggle('focus', ri === railIdx && k === ci));
      if (scroll && ri === railIdx) {
        railEl.scrollIntoView({ block: ri === 0 ? 'start' : 'center', behavior: 'smooth' });
        const f = railEl.querySelectorAll('.rail-card')[ci];
        f && f.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    });
    $('.rails-hint', root).innerHTML = A.hints([['confirm', 'Open'], ['move', 'Move'], ['options', 'Options'], ['back', 'Back up']]);
    const now = $('.rails-now', root), title = current[railIdx] ? current[railIdx].title : '';
    if (now.textContent !== title) { now.textContent = title; now.classList.remove('swap'); void now.offsetWidth; now.classList.add('swap'); }
    $('.rails-dots', root).innerHTML = current.map((r, i) => `<i class="${i === railIdx ? 'on' : ''}"></i>`).join('') + `<em>${String(railIdx + 1).padStart(2, '0')} / ${String(current.length).padStart(2, '0')}</em>`;
  }

  function show() {
    if (open || !rs().enabled) return;
    open = true;
    // Frame 1 → 2: HOME lifts and falls back while a slash sweeps across and the rows rise in one after another.
    const b = document.body;
    b.classList.remove('rails-enter');
    void b.offsetWidth;
    b.classList.add('rails-on', 'rails-enter');
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => b.classList.remove('rails-enter'), 1100);
    audio.play('open');
    railIdx = 0;
    body.scrollTop = 0;
    SV.friends && SV.friends.refresh(false);
    fetchAll(false);
    host.send('discordBotState');
    render();
    paint();
  }
  let enterTimer = 0;
  function close() {
    if (!open) return;
    open = false;
    clearTimeout(enterTimer);
    document.body.classList.remove('rails-on', 'rails-enter');
    audio.play('back');
  }

  function action(a) {
    const r = current[railIdx];
    if (a === 'back') return close();
    if (a === 'up') { if (railIdx === 0) return close(); railIdx--; audio.play('nav'); return paint(); }
    if (a === 'down') { if (railIdx < current.length - 1) { railIdx++; audio.play('nav'); paint(); } return; }
    if (!r) return;
    const ci = clamp(cardIdx[railIdx] || 0, 0, Math.max(0, r.cards.length - 1));
    if (a === 'left' || a === 'right') { cardIdx[railIdx] = clamp(ci + (a === 'left' ? -1 : 1), 0, r.cards.length - 1); audio.play('nav'); return paint(); }
    if (a === 'confirm' && r.cards[ci]) r.cards[ci].run();
    if (a === 'options' && r.cards[ci] && r.cards[ci].options) r.cards[ci].options();
    if (a === 'random' || a === 'alt') fetchAll(true);
  }

  body.addEventListener('click', (e) => {
    const c = e.target.closest('.rail-card'), railEl = e.target.closest('.rail');
    if (!c || !railEl || A.stack.length) return;
    railIdx = +railEl.dataset.r; cardIdx[railIdx] = +c.dataset.c; paint(false);
    const card = current[railIdx].cards[cardIdx[railIdx]];
    card && card.run();
  });
  body.addEventListener('contextmenu', (e) => {
    const c = e.target.closest('.rail-card'), railEl = e.target.closest('.rail');
    if (!c || !railEl) return;
    e.preventDefault();
    const card = current[+railEl.dataset.r].cards[+c.dataset.c];
    card && card.options && card.options();
  });
  body.addEventListener('mousemove', (e) => {
    const c = e.target.closest('.rail-card'), railEl = e.target.closest('.rail');
    if (!c || !railEl) return;
    const ri = +railEl.dataset.r, ci = +c.dataset.c;
    if (ri !== railIdx || ci !== cardIdx[ri]) { railIdx = ri; cardIdx[ri] = ci; paint(false); }
  });
  // Sideways wheel inside a row scrolls it; at the top, wheeling up returns to HOME.
  root.addEventListener('wheel', (e) => {
    if (A.stack.length) return;
    if (e.deltaY < 0 && body.scrollTop <= 0) { e.preventDefault(); close(); }
    else { const row = e.target.closest('.rail-row'); if (row && e.shiftKey) { row.scrollLeft += e.deltaY; e.preventDefault(); } }
  }, { passive: false });

  // ---------------------------------------------------------------- settings (FEEDS tab)

  function rows(rerender) {
    host.send('discordBotState');
    const t = (k, label, desc) => R.toggle(label, desc, A.at('rails.show.' + k));
    return [
      heading('ROWS UNDER HOME'),
      R.toggle('Rows under HOME', 'Scroll down on HOME (or press down past the buttons) to slide up rows of cards.', A.at('rails.enabled')),
      t('recent', 'Jump back in', 'The games and Roblox places you played last.'),
      t('friends', 'Friends', 'Your Roblox friends: who is online, what they play, and JOIN.'),
      t('roblox', 'Roblox games', 'Your saved places. Enter opens the account and server picker.'),
      t('studio', 'Studio projects', 'Cloud games and recent files from Roblox Studio.'),
      t('upcoming', 'Coming soon', "Steam's coming-soon list and Epic's next free games."),
      t('news', 'Roblox Studio news', 'Announcements from the Roblox DevForum.'),
      t('commissions', 'Commissions', 'Requests from a Discord channel (set up below).'),
      R.button('Refresh everything', '', 'REFRESH', () => { fetchAll(true); toast('Refreshing the rows…'); }),
      heading('GAME LISTS'),
      R.toggle('Roblox opens its game list', 'Picking Roblox shows your saved places as a shelf first. Off goes straight to the account picker.', A.at('lists.roblox')),
      R.toggle('Studio opens its project list', 'Picking Roblox Studio shows your projects first.', A.at('lists.studio')),
      heading('DISCORD COMMISSIONS'),
      el(`<div class="row-note">A webhook can only <b>send</b> messages — Discord gives no way to read a channel through one. To read the requests your webhook (or anyone) posts, use a bot: create one at discord.com/developers → Bot → Reset Token, invite it to your server with <b>View Channel</b> and <b>Read Message History</b>, and turn on <b>Message Content Intent</b>. Then paste the token and the channel below. The token is stored encrypted on this PC and never shown again.</div>`),
      R.button('Bot token', hasBot ? 'Saved (encrypted). Paste a new one to replace it.' : 'Not set.', hasBot ? 'REPLACE' : 'PASTE', () => A.ask({
        tag: 'DISCORD', title: 'BOT TOKEN', label: 'Token', placeholder: 'MTA…', button: 'SAVE', desc: 'From discord.com/developers → your app → Bot.',
        done: (v) => { host.send('discordBot', { token: v, channel: '' }); toast('Token saved'); setTimeout(rerender, 400); },
      })),
      R.button('Commissions channel', commissions.channelName ? '#' + commissions.channelName : 'Right-click the channel in Discord → Copy Channel ID (or Copy Link).', 'SET', () => A.ask({
        tag: 'DISCORD', title: 'CHANNEL', label: 'Channel ID or link', placeholder: 'https://discord.com/channels/…/…', button: 'SAVE',
        done: (v) => { host.send('discordBot', { token: '', channel: v }); toast('Channel saved'); setTimeout(rerender, 600); },
      })),
      R.button('Test the connection', commissions.error && !['nobot', 'nochannel'].includes(commissions.error) ? commissions.error : commissions.items ? `${commissions.items.length} messages read` : '', 'TEST', () => { host.send('commissions'); toast('Asking Discord…'); setTimeout(rerender, 1500); }),
      R.button('Forget the bot', '', 'FORGET', () => { host.send('discordBotClear'); commissions = { items: null, error: 'nobot', channelName: '' }; setTimeout(rerender, 300); }, true),
    ];
  }

  SV.rails = { show, close, action, rows, refresh: render, get isOpen() { return open; } };
})();

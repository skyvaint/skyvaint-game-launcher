// CLIPS: a browsable library of recorded clips. Medal's library is read directly (titles, games, thumbnails,
// share links); other video folders are scanned too. Favourites and your own categories are stored in the config.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, hints } = A;
  const cc = () => A.cfg.clips;

  let clips = [], loaded = false, scanning = false, medalFound = false;
  let view = null; // the open library screen, if any
  let filter = { kind: 'all', value: '' }, sort = 'new', wantGame = '';

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const isFav = (c) => cc().favorites.includes(c.id);
  const tagsOf = (c) => cc().tagged[c.id] || [];

  const duration = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
  const size = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB');
  function when(ms) {
    const d = new Date(ms), now = new Date();
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 864e5);
    if (days <= 0) return 'TODAY';
    if (days === 1) return 'YESTERDAY';
    if (days < 7) return days + ' DAYS AGO';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).toUpperCase();
  }

  // resh forces a new look at the folders; otherwise the shell may answer with the scan it made at start-up.
  function scan(fresh) {
    if (scanning) return;
    scanning = true;
    host.send('clipsScan', { fresh: fresh === true });
    view && view.render();
  }

  host.on('clips', (m) => {
    clips = m.clips || [];
    medalFound = !!m.medal;
    loaded = true;
    scanning = false;
    // Favourites and tags of clips that no longer exist are left alone: the files may only be on an unplugged drive.
    if (view) { view.applyWanted(); view.render(); }
    dispatchEvent(new Event('sv:clips')); // HOME's clip strip and the quests follow the library
  });
  host.on('clipThumb', (m) => {
    const c = clips.find((x) => x.id === m.id);
    if (!c) return;
    c.thumb = m.url;
    const img = view && view.root.querySelector(`.clip[data-id="${m.id}"] .clip-thumb`);
    if (img) img.style.backgroundImage = `url("${m.url}")`;
  });
  host.on('clipDeleted', (m) => {
    clips = clips.filter((c) => c.id !== m.id);
    toast('Clip moved to the Recycle Bin');
    view && view.render();
  });
  host.on('clipFailed', (m) => { audio.play('error'); toast(m.error, 'bad'); });

  // ---- actions on one clip

  function toggleFav(c) {
    const s = cc();
    s.favorites = isFav(c) ? s.favorites.filter((id) => id !== c.id) : [...s.favorites, c.id];
    audio.play(isFav(c) ? 'star' : 'toggle');
    A.save();
    view && view.refreshCard(c);
  }

  function copyLink(c) {
    if (!c.link) { audio.play('error'); return toast('This clip is not uploaded to Medal, so it has no link yet.', 'bad'); }
    if (host.native) host.send('copyText', { text: c.link });
    else navigator.clipboard && navigator.clipboard.writeText(c.link).catch(() => {});
    audio.play('pick');
    toast('Medal link copied');
  }

  function setTag(c, name, on) {
    const s = cc(), list = tagsOf(c).filter((t) => t !== name);
    if (on) list.push(name);
    if (list.length) s.tagged[c.id] = list; else delete s.tagged[c.id];
    A.save();
    view && view.render();
  }

  function newCategory(then) {
    A.ask({
      tag: 'CLIPS', title: 'NEW CATEGORY', label: 'Category name', placeholder: 'e.g. Rocket League bangers, Fortnite wins, Funny', button: 'CREATE',
      desc: 'Your own shelf for clips. Add clips to it from each clip\'s options.',
      done: (name) => {
        const s = cc();
        if (s.categories.some((x) => norm(x) === norm(name))) return toast('You already have that category.', 'bad');
        s.categories.push(name);
        A.save();
        toast(name + ' created');
        then ? then(name) : view && view.render();
      },
    });
  }

  function categoryMenu(c) {
    const s = cc();
    A.openMenu('ADD TO CATEGORY', [
      ...s.categories.map((name) => {
        const has = tagsOf(c).includes(name);
        return { label: (has ? '✓  ' : '') + name, sub: has ? 'Remove from this category' : 'Add to this category', run: () => { setTag(c, name, !has); toast(has ? 'Removed from ' + name : 'Added to ' + name); } };
      }),
      { label: '+ NEW CATEGORY', sub: 'Create one and put this clip in it', run: () => newCategory((name) => { setTag(c, name, true); }) },
    ], s.categories.length ? '' : 'Make categories like "Rocket League clips" or "Fortnite clips" and sort your best moments into them.');
  }

  function clipMenu(c) {
    A.openMenu(c.name, [
      { label: 'PLAY', run: () => play(c) },
      { label: isFav(c) ? '★ UNFAVOURITE' : '☆ FAVOURITE', run: () => toggleFav(c) },
      { label: 'COPY MEDAL LINK', sub: c.link ? c.link.replace('https://', '') : 'Not uploaded to Medal yet', run: () => copyLink(c) },
      { label: 'ADD TO CATEGORY', sub: tagsOf(c).join(', ') || 'None yet', run: () => categoryMenu(c) },
      { label: 'SHOW IN FOLDER', run: () => host.send('clipReveal', { id: c.id }) },
      { label: 'OPEN IN DEFAULT PLAYER', run: () => host.send('clipOpen', { id: c.id }) },
      { label: 'COPY FILE PATH', run: () => { host.send('clipCopyPath', { id: c.id }); toast('File path copied'); } },
      { label: 'MOVE TO RECYCLE BIN', danger: true, run: () => A.confirmMenu(`Bin "${c.name}"?`, 'MOVE TO RECYCLE BIN', () => host.send('clipDelete', { id: c.id })) },
    ], `${c.game} · ${when(c.time)} · ${size(c.size)}${c.duration ? ' · ' + duration(c.duration) : ''}`);
  }

  // ---- player

  let player = null;
  function play(c) {
    const list = view ? view.list() : [c];
    let cur = c;
    const root = el(`
      <div class="overlay full player">
        <video autoplay controls playsinline></video>
        <div class="player-bar">
          <div class="player-txt"><div class="tag"></div><b></b></div>
          <div class="player-btns"></div>
        </div>
        <div class="hints">${hints([['confirm', 'Play / pause'], ['adjust', 'Seek 5s'], ['tabs', 'Previous / next'], ['alt', 'Favourite'], ['clips', 'Copy Medal link'], ['options', 'Options'], ['back', 'Close']])}</div>
      </div>`);
    const video = $('video', root);
    const load = (next) => {
      cur = next;
      video.src = cur.url;
      video.play().catch(() => {});
      $('.player-txt .tag', root).textContent = `[ ${cur.game} · ${when(cur.time)}${cur.source === 'medal' ? ' · MEDAL' : ''} ]`;
      $('.player-txt b', root).textContent = cur.name;
      paint();
    };
    const paint = () => {
      const btns = [
        [isFav(cur) ? '★ FAVOURITED' : '☆ FAVOURITE', () => { toggleFav(cur); paint(); }, isFav(cur) ? 'primary' : ''],
        ['COPY MEDAL LINK', () => copyLink(cur), cur.link ? '' : 'ghost'],
        ['CATEGORY', () => categoryMenu(cur), ''],
        ['SHOW IN FOLDER', () => host.send('clipReveal', { id: cur.id }), 'ghost'],
      ];
      $('.player-btns', root).replaceChildren(...btns.map(([text, fn, kind]) => {
        const b = el(`<button class="btn small ${kind}">${esc(text)}</button>`);
        b.addEventListener('click', fn);
        return b;
      }));
    };
    const step = (d) => { const i = list.indexOf(cur), next = list[i + d]; if (next) { audio.play('nav'); load(next); } };
    video.addEventListener('error', () => toast('That clip could not be played here — try "Open in default player".', 'bad'));
    load(c);
    player = video;
    SV.audio.setAmbientActive(false);
    A.push({
      el: root,
      onClose: () => { video.pause(); video.removeAttribute('src'); video.load(); player = null; SV.audio.setAmbientActive(true); view && view.focusClip(cur); },
      action(a) {
        if (a === 'back') A.pop();
        else if (a === 'confirm') video.paused ? video.play() : video.pause();
        else if (a === 'left' || a === 'right') video.currentTime = clamp(video.currentTime + (a === 'left' ? -5 : 5), 0, video.duration || 0);
        else if (a === 'up' || a === 'down') video.volume = clamp(video.volume + (a === 'up' ? 0.1 : -0.1), 0, 1);
        else if (a === 'tabPrev' || a === 'tabNext') step(a === 'tabPrev' ? -1 : 1);
        else if (a === 'alt') { toggleFav(cur); paint(); }
        else if (a === 'clips') copyLink(cur);
        else if (a === 'options') clipMenu(cur);
      },
    });
  }

  // ---- library screen

  function open(game = '') {
    if (view) return;
    wantGame = game;
    if (!game) filter = filter.kind ? filter : { kind: 'all', value: '' };
    const root = el(`
      <div class="overlay full"><div class="clips">
        <div class="clips-head">
          <div><div class="tag clips-count"></div><h2>CLIPS</h2></div>
          <div class="clips-tools"><button class="btn small ghost" data-t="sort"></button><button class="btn small primary" data-t="record">● SAVE A CLIP</button><button class="btn small ghost" data-t="more">LIBRARY ⋯</button><button class="btn small ghost" data-t="close">CLOSE</button></div>
        </div>
        <div class="clips-chips"></div>
        <div class="clips-grid"></div>
        <div class="hints">${hints([['confirm', 'Play'], ['alt', 'Favourite'], ['clips', 'Copy Medal link'], ['options', 'Clip options'], ['tabs', 'Category'], ['settings', 'Library'], ['back', 'Close']])}</div>
      </div></div>`);
    const grid = $('.clips-grid', root), chipBox = $('.clips-chips', root);
    let idx = 0, shown = [], chips = [], previewTimer, preview;

    const matches = (c) =>
      filter.kind === 'all' || (filter.kind === 'fav' && isFav(c)) ||
      (filter.kind === 'cat' && tagsOf(c).includes(filter.value)) || (filter.kind === 'game' && c.game === filter.value);
    const sorted = (list) => {
      const out = [...list];
      if (sort === 'old') out.sort((a, b) => a.time - b.time);
      else if (sort === 'long') out.sort((a, b) => b.duration - a.duration);
      else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name) || b.time - a.time);
      else out.sort((a, b) => b.time - a.time);
      return out;
    };
    const SORTS = { new: 'NEWEST', old: 'OLDEST', long: 'LONGEST', name: 'A – Z' };

    function buildChips() {
      const games = {};
      clips.forEach((c) => { games[c.game] = (games[c.game] || 0) + 1; });
      chips = [
        { kind: 'all', value: '', label: 'ALL', n: clips.length },
        { kind: 'fav', value: '', label: '★ FAVOURITES', n: clips.filter(isFav).length },
        ...cc().categories.map((name) => ({ kind: 'cat', value: name, label: name.toUpperCase(), n: clips.filter((c) => tagsOf(c).includes(name)).length, mine: true })),
        ...Object.entries(games).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ kind: 'game', value: name, label: name.toUpperCase(), n })),
      ];
      if (!chips.some((c) => c.kind === filter.kind && c.value === filter.value)) filter = { kind: 'all', value: '' };
      chipBox.replaceChildren(...chips.map((c) => {
        const b = el(`<button class="chip ${c.mine ? 'mine' : ''} ${c.kind === filter.kind && c.value === filter.value ? 'on' : ''}">${esc(c.label)}<i>${c.n}</i></button>`);
        b.addEventListener('click', () => setFilter(c));
        return b;
      }), (() => { const b = el('<button class="chip add">+ CATEGORY</button>'); b.addEventListener('click', () => newCategory()); return b; })());
      const on = chipBox.querySelector('.chip.on');
      on && on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    function setFilter(c) {
      filter = { kind: c.kind, value: c.value };
      idx = 0;
      audio.play('toggle');
      render();
    }

    const card = (c) => `
      <div class="clip ${isFav(c) ? 'fav' : ''}" data-id="${c.id}">
        <div class="clip-thumb" ${c.thumb ? `style="background-image:url('${esc(c.thumb)}')"` : ''}>
          <button class="clip-star" title="Favourite">${isFav(c) ? '★' : '☆'}</button>
          ${c.link ? '<button class="clip-link" title="Copy Medal link">MEDAL ⧉</button>' : ''}
          ${c.duration ? `<span class="clip-len">${duration(c.duration)}</span>` : ''}
        </div>
        <b>${esc(c.name)}</b>
        <small>${esc(c.game)} · ${when(c.time)}${tagsOf(c).length ? ' · ' + esc(tagsOf(c).join(', ')) : ''}</small>
      </div>`;

    function render() {
      buildChips();
      shown = sorted(clips.filter(matches));
      $('.clips-count', root).textContent = scanning && !loaded ? '[ SCANNING YOUR CLIPS… ]'
        : `[ ${shown.length} OF ${clips.length} CLIPS${medalFound ? ' · MEDAL LIBRARY CONNECTED' : ''} ]`;
      $('[data-t=sort]', root).textContent = 'SORT: ' + SORTS[sort];
      stopPreview();
      if (!shown.length) {
        grid.innerHTML = `<div class="clips-empty">${!loaded ? 'Looking through your clip folders…'
          : filter.kind === 'fav' ? 'No favourites yet — press <kbd>F</kbd> on a clip to star it.'
          : filter.kind === 'cat' ? 'Nothing in this category yet. Open a clip\'s options and choose ADD TO CATEGORY.'
          : 'No clips found. Open LIBRARY to add a folder.'}</div>`;
        return;
      }
      grid.innerHTML = shown.map(card).join('');
      focus(clamp(idx, 0, shown.length - 1), false);
    }

    const cols = () => {
      const cards = grid.querySelectorAll('.clip');
      if (cards.length < 2) return 1;
      let n = 1;
      while (n < cards.length && cards[n].offsetTop === cards[0].offsetTop) n++;
      return n;
    };

    function stopPreview() {
      clearTimeout(previewTimer);
      if (preview) { preview.remove(); preview = null; }
    }

    function focus(i, sound = true) {
      const cards = grid.querySelectorAll('.clip');
      if (!cards.length) return;
      const next = clamp(i, 0, cards.length - 1);
      if (next !== idx && sound) audio.play('nav');
      idx = next;
      cards.forEach((c, k) => c.classList.toggle('focus', k === idx));
      cards[idx].scrollIntoView({ block: 'nearest' });
      // A moment on one clip starts it playing silently in place.
      stopPreview();
      if (!cc().autoplay || !A.cfg.backdrop.motion) return;
      const c = shown[idx], thumb = cards[idx].querySelector('.clip-thumb');
      previewTimer = setTimeout(() => {
        if (player || !root.isConnected || !A.isTop(root)) return;
        preview = el('<video class="clip-preview" muted loop playsinline></video>');
        preview.src = c.url + '#t=' + Math.max(0, (c.duration || 0) / 2 - 4).toFixed(1);
        preview.addEventListener('playing', () => preview && preview.classList.add('on'));
        thumb.append(preview);
        preview.play().catch(() => {});
      }, 650);
    }

    const cur = () => shown[idx];

    grid.addEventListener('click', (e) => {
      const node = e.target.closest('.clip');
      if (!node) return;
      const i = [...grid.children].indexOf(node), c = shown[i];
      focus(i, false);
      if (e.target.closest('.clip-star')) return toggleFav(c);
      if (e.target.closest('.clip-link')) return copyLink(c);
      audio.play('confirm');
      play(c);
    });
    grid.addEventListener('contextmenu', (e) => {
      const node = e.target.closest('.clip');
      if (!node) return;
      e.preventDefault();
      focus([...grid.children].indexOf(node), false);
      clipMenu(cur());
    });
    grid.addEventListener('mousemove', (e) => {
      const node = e.target.closest('.clip'), i = node ? [...grid.children].indexOf(node) : -1;
      if (i >= 0 && i !== idx) focus(i, false);
    });
    $('.clips-tools', root).addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.t === 'sort') cycleSort();
      else if (t.dataset.t === 'more') libraryMenu();
      else if (t.dataset.t === 'record') SV.clips.record();
      else A.pop();
    });

    function cycleSort() {
      const keys = Object.keys(SORTS);
      sort = keys[(keys.indexOf(sort) + 1) % keys.length];
      idx = 0;
      audio.play('toggle');
      render();
    }

    function libraryMenu() {
      const s = cc(), mine = filter.kind === 'cat' ? filter.value : '';
      A.openMenu('CLIP LIBRARY', [
        { label: 'NEW CATEGORY', sub: 'Your own shelf — e.g. Rocket League clips', run: () => newCategory() },
        ...(mine ? [
          { label: `RENAME "${mine}"`, run: () => A.ask({ tag: 'CLIPS', title: 'RENAME CATEGORY', label: 'Category name', value: mine, done: (name) => {
            s.categories = s.categories.map((x) => (x === mine ? name : x));
            for (const id in s.tagged) s.tagged[id] = s.tagged[id].map((x) => (x === mine ? name : x));
            filter.value = name; A.save(); render();
          } }) },
          { label: `DELETE "${mine}"`, sub: 'The clips themselves are kept', danger: true, run: () => A.confirmMenu(`Delete the category "${mine}"?`, 'DELETE', () => {
            s.categories = s.categories.filter((x) => x !== mine);
            for (const id in s.tagged) { s.tagged[id] = s.tagged[id].filter((x) => x !== mine); if (!s.tagged[id].length) delete s.tagged[id]; }
            A.save(); render();
          }) },
        ] : []),
        { label: 'SORT: ' + SORTS[sort], sub: 'Newest, oldest, longest or by name', run: cycleSort },
        { label: s.autoplay ? 'HOVER PREVIEW: ON' : 'HOVER PREVIEW: OFF', sub: 'Plays a clip silently when you rest on it', run: () => { s.autoplay = !s.autoplay; A.save(); render(); } },
        { label: s.videos ? 'VIDEOS FOLDER: INCLUDED' : 'VIDEOS FOLDER: HIDDEN', sub: 'Loose recordings from your Windows Videos folder', run: () => { s.videos = !s.videos; A.save(); setTimeout(() => scan(true), 400); } },
        { label: 'ADD A CLIP FOLDER', sub: s.folders.length ? s.folders.length + ' extra folder(s) added' : 'Any other folder with recordings', run: () => A.pick('folder').then((f) => {
          if (!f.path || s.folders.includes(f.path)) return;
          s.folders.push(f.path); A.save(); setTimeout(() => scan(true), 400); toast('Folder added — rescanning');
        }) },
        ...s.folders.map((f) => ({ label: 'REMOVE FOLDER', sub: f, danger: true, run: () => { s.folders = s.folders.filter((x) => x !== f); A.save(); setTimeout(() => scan(true), 400); } })),
        { label: 'RESCAN', sub: 'Look for new clips now', run: () => scan(true) },
      ], medalFound ? 'Medal clips come straight from Medal\'s own library, share links included.' : 'Medal\'s library was not found on this PC; showing video folders only.');
    }

    view = {
      root, render,
      list: () => shown,
      refreshCard(c) {
        const node = grid.querySelector(`.clip[data-id="${c.id}"]`);
        if (filter.kind === 'fav') return render(); // un-starring removes it from this view
        if (node) { node.classList.toggle('fav', isFav(c)); node.querySelector('.clip-star').textContent = isFav(c) ? '★' : '☆'; }
        buildChips();
      },
      focusClip(c) { const i = shown.indexOf(c); if (i >= 0) focus(i, false); },
      // Opened from a game's menu: jump to that game's clips once the list is in.
      applyWanted() {
        if (!wantGame) return;
        const hit = clips.find((c) => norm(c.game) === norm(wantGame)) || clips.find((c) => norm(c.game).includes(norm(wantGame)) || norm(wantGame).includes(norm(c.game)));
        if (hit) filter = { kind: 'game', value: hit.game };
        else if (loaded) toast('No clips of ' + wantGame + ' yet');
        if (loaded) wantGame = '';
      },
    };

    view.applyWanted();
    render();
    if (!loaded) scan();
    A.push({
      el: root,
      onClose: () => { stopPreview(); view = null; },
      action(a) {
        if (a === 'back') return A.pop();
        if (a === 'settings') return libraryMenu();
        if (a === 'tabPrev' || a === 'tabNext') {
          const i = chips.findIndex((c) => c.kind === filter.kind && c.value === filter.value);
          return setFilter(chips[(i + (a === 'tabPrev' ? -1 : 1) + chips.length) % chips.length]);
        }
        const c = cur();
        if (!c) return;
        if (a === 'left') focus(idx - 1);
        else if (a === 'right') focus(idx + 1);
        else if (a === 'up') focus(idx - cols() < 0 ? idx : idx - cols());
        else if (a === 'down') focus(Math.min(shown.length - 1, idx + cols()));
        else if (a === 'confirm') { audio.play('confirm'); play(c); }
        else if (a === 'alt') toggleFav(c);
        else if (a === 'clips') copyLink(c);
        else if (a === 'options') clipMenu(c);
      },
    });
  }

  // Saving a clip: presses your recorder's shortcut for you (Xbox Game Bar, Medal, ShadowPlay, OBS…).
  const RECORDERS = { gamebar: 'Win+Alt+G', gamebarRec: 'Win+Alt+R', nvidia: 'Alt+F10', amd: 'Ctrl+Shift+S', medal: 'F8', obs: 'Ctrl+Alt+R' };
  function record() {
    const c = A.cfg.clips, keys = c.recorder === 'custom' ? c.recordKeys : RECORDERS[c.recorder || 'gamebar'];
    if (!keys) return toast('Set the shortcut of your recorder in Settings → System → Clips.', 'bad');
    SV.audio.play('pick');
    host.send('recordClip', { keys });
    toast('Clip shortcut sent: ' + keys);
  }

  SV.clips = {
    record,
    RECORDERS,
    open,
    play,
    pause() { if (player) player.pause(); },
    list: () => clips,
    get loaded() { return loaded; },
    ensure() { if (!loaded) scan(); },
    // Clips of one game, newest first, matched by name the same way the game filter is.
    forGame(name) { const n = norm(name); return clips.filter((c) => { const g = norm(c.game); return g === n || g.includes(n) || n.includes(g); }).sort((a, b) => b.time - a.time); },
  };
})();

// MY DATA: a frame that shows what's inside a settings file before you load it. Your current settings and every
// backup or copy are listed on the left; the right side opens the chosen one up: the main profile, what's in the main
// menu, your videos, NEXUS bars, accounts, sounds and so on. Nothing changes until you press LOAD THIS DATA.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast } = A;

  const stamp = (ms) => (ms ? new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((b || 0) / 1024)) + ' KB');
  const n = (list) => (Array.isArray(list) ? list.length : 0);
  const count = (v, one, many) => `${v} ${v === 1 ? one : many || one + 's'}`;
  const named = (v) => (v ? String(v).split(/[\\/]/).pop().split('?')[0].slice(0, 42) : '');
  const isLocalPic = (u) => /^(https?:)?\/\/media\.|^https:\/\/media\.skyvaint|^data:image/i.test(u || '');
  const hours = (sec) => (sec >= 3600 ? Math.round(sec / 3600).toLocaleString() + ' h' : Math.round((sec || 0) / 60) + ' min');

  // What a settings file holds, in the words the launcher uses.
  function read(c, stats) {
    const theme = c.theme || {}, bd = c.backdrop || {}, fx = c.fx || {}, nx = c.nexus || {}, snd = c.sound || {}, hm = c.home || {}, lay = c.layout || {};
    const prof = c.profiles && Array.isArray(c.profiles.list) ? c.profiles.list : [];
    const games = Array.isArray(c.games) ? c.games : [];
    const platforms = {};
    for (const g of games) platforms[g.platform || 'pc'] = (platforms[g.platform || 'pc'] || 0) + 1;
    const bars = [{ name: nx.name || 'Main bar', on: !!nx.enabled, items: n(nx.items), where: nx.position || 'bottom' },
      ...(Array.isArray(nx.bars) ? nx.bars : []).map((b, i) => ({ name: b.name || `Bar ${i + 2}`, on: !!b.enabled, items: n(b.items), where: b.position || 'bottom' }))];
    const layers = Object.entries(bd.levels || {}).filter(([, v]) => v > 0).map(([k]) => k);
    const vids = Object.entries(fx.videos || {}).filter(([, v]) => v);
    const videos = [
      ['Opening video', fx.introVideo], ['Launch video', fx.launchVideo], ['Transition video', fx.transitionVideo], ['Backdrop video', bd.video],
      ...vids.map(([k, v]) => [k[0].toUpperCase() + k.slice(1) + ' video', typeof v === 'string' ? v : v.url || v.src || '']),
    ].filter(([, v]) => v);
    const sec = Object.values(stats || {}).reduce((s, x) => s + ((x && x.seconds) || 0), 0);
    const cur = prof.find((p) => p.id === (c.profiles || {}).current);
    return {
      name: (c.profile && c.profile.name) || 'Player', avatar: (c.profile && c.profile.avatar) || '', theme, prof, cur, games, platforms, bars, layers, videos, bd, fx, snd, hm, lay, sec, hasStats: !!stats,
      accounts: { roblox: n(c.roblox && c.roblox.accounts), epic: n(c.epic && c.epic.accounts), steam: n(c.imported && c.imported.steamAccounts) },
      places: n(c.roblox && c.roblox.places), widgets: n(c.widgets && c.widgets.items), sites: n(c.social && c.social.sites), xp: (c.quests && c.quests.xp) || 0,
      discord: !!(c.discord && c.discord.enabled), dev: !!(c.dev && c.dev.enabled), lang: c.language || 'en', themes: n(c.themes && c.themes.mine) || n(c.themes && c.themes.library),
    };
  }

  const stat = (label, value) => `<div class="dv-stat"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
  const line = (label, value) => `<div class="dv-line"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const card = (cls, title, note, html) => `<section class="dv-card ${cls}"><header><b>${esc(title)}</b><span>${esc(note || '')}</span></header>${html}</section>`;
  const yes = (v) => (v ? 'On' : 'Off');

  function preview(d, f, wrap) {
    const accent = d.theme.accent || '#ff1f1f', accent2 = d.theme.accent2 || accent, bg = d.theme.bg || '#070505';
    const initial = esc((d.name[0] || '?').toUpperCase());
    const pic = isLocalPic(d.avatar) ? `<img src="${esc(d.avatar)}" alt="">` : `<b>${initial}</b>`;
    const shown = d.games.slice(0, 8).map((g) => `<span>${esc(g.name || g.id || 'Game')}</span>`).join('');
    const more = d.games.length > 8 ? `<span class="dim">+${d.games.length - 8} more</span>` : '';
    const accounts = d.accounts.roblox + d.accounts.epic + d.accounts.steam;
    const items = d.bars.reduce((s, b) => s + b.items, 0);
    wrap.innerHTML = `
      <div class="dv-hero" style="--p1:${esc(accent)};--p2:${esc(accent2)};--p0:${esc(bg)}">
        <div class="dv-face">${pic}</div>
        <div class="dv-who"><div class="tag">[ MAIN PROFILE ]</div><h3>${esc(d.name)}</h3>
          <p>${esc(f.label)}${f.at ? ' · ' + esc(stamp(f.at)) : ''}${f.size ? ' · ' + esc(size(f.size)) : ''}</p></div>
        <div class="dv-swatches"><i style="background:${esc(accent)}"></i><i style="background:${esc(accent2)}"></i><i style="background:${esc(bg)}"></i></div>
      </div>
      <div class="dv-stats">
        ${stat('GAMES', d.games.length)}${stat('NEXUS BARS', d.bars.length)}${stat('ON THE BARS', items)}${stat('PROFILES', d.prof.length || 1)}${stat('ACCOUNTS', accounts)}${stat(d.hasStats ? 'PLAYED' : 'QUEST XP', d.hasStats ? hours(d.sec) : d.xp)}
      </div>
      <div class="dv-grid">
        ${card('', 'MAIN MENU', d.theme.preset || 'custom', [
          line('Theme', d.theme.preset || 'Custom'), line('Headline font', d.theme.font || 'anton'), line('Tile shape', d.theme.tileShape || 'cut'),
          line('Texture', d.theme.texture || 'none'), line('Bottom strip', d.hm.strip || 'continue'), line('Clips on HOME', yes(d.hm.clips !== false)), line('Big picture', yes(d.lay.hero !== false)),
        ].join(''))}
        ${card('', 'BACKDROP', d.bd.style || 'custom', [
          line('Style', d.bd.style || 'Custom'), line('Layers on', d.layers.length ? d.layers.slice(0, 5).join(', ') + (d.layers.length > 5 ? ` +${d.layers.length - 5}` : '') : 'None'),
          line('Your pictures', n(d.bd.pictures)), line('Quality', d.bd.quality || 'auto'), line('Frame cap', d.bd.fps ? d.bd.fps + ' FPS' : 'Screen rate'),
        ].join(''))}
        ${card('', 'VIDEO', count(d.videos.length, 'video'), d.videos.length ? d.videos.map(([k, v]) => line(k, named(v) || 'Set')).join('') : '<div class="dv-none">No videos of your own in this data.</div>')}
        ${card('dv-bars', 'NEXUS BARS', `${count(d.bars.filter((b) => b.on).length, 'bar')} on`, d.bars.map((b) => `<div class="dv-bar ${b.on ? 'on' : ''}"><i></i><span>${esc(b.name)}</span><small>${esc(b.where)}</small><b>${count(b.items, 'item')}</b></div>`).join(''))}
        ${card('', 'PROFILES', count(d.prof.length, 'look'), d.prof.length ? d.prof.map((p) => `<div class="dv-bar ${d.cur === p ? 'on' : ''}"><i style="${p.look && p.look.theme ? `background:${esc(p.look.theme.accent || '')}` : ''}"></i><span>${esc(p.name)}</span><small>${esc((p.look && p.look.theme && p.look.theme.preset) || 'own look')}</small><b>${d.cur === p ? 'MAIN' : ''}</b></div>`).join('') : '<div class="dv-none">One profile, made the first time it loads.</div>')}
        ${card('', 'ACCOUNTS', count(accounts, 'account'), [line('Roblox', `${d.accounts.roblox} · ${count(d.places, 'place')}`), line('Epic', d.accounts.epic), line('Steam', d.accounts.steam), line('Discord presence', yes(d.discord))].join(''))}
        ${card('', 'SOUND', d.snd.pack || 'default', [
          line('Sound pack', d.snd.pack || 'default'), line('Your own sounds', Object.values(d.snd.custom || {}).filter(Boolean).length), line('Sound library', n(d.snd.library)), line('Music tracks', n(d.snd.bgmTracks)),
        ].join(''))}
        ${card('', 'EXTRAS', d.lang.toUpperCase(), [line('Widgets', d.widgets), line('Social sites', d.sites), line('Quest XP', d.xp), line('Developer mode', yes(d.dev))].join(''))}
        ${card('dv-wide', 'GAMES', Object.entries(d.platforms).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none', `<div class="dv-chips">${shown}${more}</div>`)}
      </div>`;
    wrap.scrollTop = 0;
  }

  // ---- the frame

  let live = null; // the open frame
  host.on('dataFiles', (m) => { if (live && !m.prompt) live.files(m.files || []); });
  host.on('dataRead', (m) => { if (live) live.read(m); });

  function open(given) {
    if (live) return;
    const root = el(`<div class="overlay full dv-screen"><div class="dv">
      <aside class="dv-side">
        <div class="tag">[ MY DATA ]</div><h2>${esc(A.T('DATA'))}</h2>
        <p>${esc(A.T('See what is inside before you load it. What you have now is backed up first.'))}</p>
        <div class="dv-files"></div>
      </aside>
      <main class="dv-main" data-scroll><div class="dv-loading tag">READING…</div></main>
      <div class="dv-foot"><div class="hints">${A.hints([['move', 'Move'], ['confirm', 'Load this data'], ['back', 'Close']])}</div><button class="btn primary dv-load">LOAD THIS DATA</button></div>
    </div></div>`);
    const list = $('.dv-files', root), main = $('.dv-main', root), loadBtn = $('.dv-load', root);
    let files = [], idx = 0, reading = '', timer = 0;
    const cache = new Map();

    const paint = () => {
      list.querySelectorAll('.dv-file').forEach((b, i) => b.classList.toggle('focus', i === idx));
      const f = files[idx];
      loadBtn.textContent = f && f.current ? 'LOADED NOW' : 'LOAD THIS DATA';
      loadBtn.disabled = !f || !!f.current;
      const on = list.children[idx];
      if (on) on.scrollIntoView({ block: 'nearest' });
    };
    function showFile() {
      const f = files[idx];
      if (!f) return;
      clearTimeout(timer);
      if (f.current) { preview(read(A.cfg, A.stats), f, main); return; }
      if (cache.has(f.file)) { preview(read(cache.get(f.file), null), f, main); return; }
      // Moving down the list quickly only reads the one you stop on.
      main.innerHTML = '<div class="dv-loading tag">READING…</div>';
      timer = setTimeout(() => { reading = f.file; host.send('dataRead', { file: f.file }); }, 120);
    }
    function move(i) {
      const next = clamp(i, 0, files.length - 1);
      if (next === idx) return;
      idx = next;
      audio.play('nav');
      paint();
      showFile();
    }
    function load() {
      const f = files[idx];
      if (!f || f.current) return;
      A.confirmMenu(`Load "${f.label}"?`, 'LOAD AND RESTART', () => { toast('Loading that data — the launcher restarts'); host.send('loadData', { file: f.file }); });
    }
    live = {
      files(next) {
        files = next;
        idx = clamp(idx, 0, Math.max(0, files.length - 1));
        list.innerHTML = files.map((f, i) => `<button class="dv-file ${f.current ? 'now' : ''}" data-i="${i}"><b>${esc(f.label)}</b>
          <small>${esc(stamp(f.at))}</small><span>${count(f.games, 'game')} · ${count(f.bars, 'bar')}${f.current ? ' · LOADED NOW' : ''}</span></button>`).join('') || '<div class="dv-none">No settings files found.</div>';
        paint();
        showFile();
      },
      read(m) {
        if (!m.ok) { if (m.file === reading) main.innerHTML = `<div class="dv-none">${esc(A.T("This file couldn't be read."))}</div>`; return; }
        cache.set(m.file, m.config);
        const f = files[idx];
        if (f && f.file === m.file) preview(read(m.config, null), f, main);
      },
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('.dv-file'); if (b) { move(+b.dataset.i); } });
    loadBtn.addEventListener('click', load);
    A.push({
      el: root, cover: true,
      onClose: () => { live = null; clearTimeout(timer); },
      action(a) {
        if (a === 'up') move(idx - 1);
        else if (a === 'down') move(idx + 1);
        else if (a === 'tabPrev' || a === 'left') main.scrollBy({ top: -220, behavior: 'smooth' });
        else if (a === 'tabNext' || a === 'right') main.scrollBy({ top: 220, behavior: 'smooth' });
        else if (a === 'confirm') load();
        else if (a === 'back') A.pop();
      },
    });
    if (given) live.files(given); else host.send('dataFiles', { prompt: false });
  }

  SV.data = { open };
})();

// The music handler: whatever Windows says is playing (Spotify, a browser tab, any media app) as a pill in the
// top bar with its cover art. Hover or click it for the player: cover, song, artist, a seekable progress bar,
// previous / play-pause / next, that app's own volume and the Windows volume.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc } = A;
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const ICON = {
    prev: '<path d="M6 5v14M19 5 9 12l10 7z"/>', next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>', pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
    note: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

  const pill = el(`<button id="np" class="np-pill" title="Now playing"><span class="np-art"></span><span class="np-txt"><b></b><small></small></span><i class="np-eq"><em></em><em></em><em></em></i></button>`);
  $('#topbar .status').prepend(pill);
  const pop = el(`
    <div id="nppop">
      <div class="npp-top"><div class="npp-art"></div><div class="npp-info"><small class="tag npp-app"></small><b class="npp-title"></b><span class="npp-artist"></span></div></div>
      <div class="npp-bar"><i><em></em></i><div class="npp-times"><span class="npp-pos">0:00</span><span class="npp-dur">0:00</span></div></div>
      <div class="npp-ctl"><button data-c="prev">${svg('prev')}</button><button data-c="toggle" class="big"></button><button data-c="next">${svg('next')}</button></div>
      <label class="npp-vol"><span>${A.T('APP')}</span><input type="range" min="0" max="100" data-v="app"><b class="npp-av">—</b></label>
      <label class="npp-vol"><span>${A.T('PC')}</span><input type="range" min="0" max="100" data-v="pc"><b class="npp-pv">—</b></label>
    </div>`);
  document.body.append(pop);

  let t = null, open = false, closeTimer = 0, dragging = false, pcVol = null;
  const pos = () => !t ? 0 : t.playing ? Math.min(t.duration || 0, t.position + ((Date.now() - t.updated) / 1000) * (t.rate || 1)) : t.position;

  function paint() {
    const on = A.cfg.music?.enabled !== false && t && !t.none && (t.title || t.artist);
    pill.classList.toggle('on', !!on);
    if (!on) { if (open) hide(true); return; }
    pill.classList.toggle('playing', !!t.playing);
    const art = t.art ? `<img src="${esc(t.art)}" alt="">` : svg('note');
    $('.np-art', pill).innerHTML = art;
    $('.np-txt b', pill).textContent = t.title || t.app;
    $('.np-txt small', pill).textContent = t.artist || t.app;
    if (!open) return;
    $('.npp-art', pop).innerHTML = art;
    $('.npp-app', pop).textContent = `[ ${(t.app || A.T('NOW PLAYING')).toUpperCase()} ]`;
    $('.npp-title', pop).textContent = t.title;
    $('.npp-artist', pop).textContent = t.artist + (t.album ? ' · ' + t.album : '');
    $('[data-c=toggle]', pop).innerHTML = svg(t.playing ? 'pause' : 'play');
    $('[data-c=prev]', pop).disabled = t.canPrev === false;
    $('[data-c=next]', pop).disabled = t.canNext === false;
    const av = $('[data-v=app]', pop);
    av.parentElement.style.display = t.appVolume == null ? 'none' : '';
    if (!dragging && t.appVolume != null) av.value = t.appVolume;
    $('.npp-av', pop).textContent = t.appVolume == null ? '—' : t.appMuted ? A.T('MUTED') : Math.round(av.value) + '%';
    if (pcVol != null && !dragging) $('[data-v=pc]', pop).value = pcVol;
    $('.npp-pv', pop).textContent = pcVol == null ? '—' : Math.round($('[data-v=pc]', pop).value) + '%';
    tickBar();
  }
  function tickBar() {
    if (!open || !t) return;
    const p = pos(), d = t.duration || 0;
    $('.npp-bar em', pop).style.width = d ? (p / d * 100).toFixed(2) + '%' : '0';
    $('.npp-pos', pop).textContent = fmt(p);
    $('.npp-dur', pop).textContent = d ? fmt(d) : '';
    $('.npp-bar', pop).classList.toggle('seek', t.canSeek !== false && d > 0);
  }
  setInterval(tickBar, 500);

  host.on('nowPlaying', (m) => { t = m; paint(); });
  host.on('systemStats', (m) => { if (m.volume != null) { pcVol = m.volume; if (open) paint(); } });
  // Asks Windows every couple of seconds while HOME is up (and more often while the player is open).
  setInterval(() => { if (A.cfg && A.mode === 'home' && !document.hidden && A.cfg.music?.enabled !== false) host.send('nowPlaying'); }, 2500);
  setInterval(() => { if (open) { host.send('nowPlaying'); host.send('systemStats'); } }, 1000);
  host.on('init', () => setTimeout(() => host.send('nowPlaying'), 2500));

  function place() {
    const r = pill.getBoundingClientRect();
    pop.style.top = r.bottom + 10 + 'px';
    pop.style.left = Math.max(12, Math.min(innerWidth - 360, r.left + r.width / 2 - 170)) + 'px';
  }
  function show() { clearTimeout(closeTimer); if (open) return; open = true; place(); pop.classList.add('on'); host.send('nowPlaying'); host.send('systemStats'); paint(); }
  function hide(now) { clearTimeout(closeTimer); closeTimer = setTimeout(() => { open = false; pop.classList.remove('on'); }, now ? 0 : 280); }
  pill.addEventListener('mouseenter', show);
  pill.addEventListener('mouseleave', () => hide());
  pill.addEventListener('click', () => (open ? hide(true) : show()));
  pop.addEventListener('mouseenter', show);
  pop.addEventListener('mouseleave', () => { if (!dragging) hide(); });

  const cmd = (c, value) => { audio.play('toggle'); host.send('media', { cmd: c, value }); if (t && c === 'toggle') { t.position = pos(); t.updated = Date.now(); t.playing = !t.playing; paint(); } };
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (b) return cmd(b.dataset.c);
    const bar = e.target.closest('.npp-bar.seek i');
    if (bar && t) { const r = bar.getBoundingClientRect(); const s = ((e.clientX - r.left) / r.width) * t.duration; t.position = s; t.updated = Date.now(); cmd('seek', s); tickBar(); }
  });
  for (const input of pop.querySelectorAll('input[type=range]')) {
    let at = 0;
    input.addEventListener('pointerdown', () => { dragging = true; });
    input.addEventListener('change', () => { dragging = false; });
    input.addEventListener('input', () => {
      const now = performance.now();
      if (now - at < 60) return;
      at = now;
      if (input.dataset.v === 'app') host.send('media', { cmd: 'volume', value: +input.value });
      else { host.send('setVolume', { level: +input.value }); pcVol = +input.value; }
      paint();
    });
  }
  // The media keys work while HOME has the keyboard too.
  addEventListener('keydown', (e) => {
    if (e.code === 'MediaPlayPause') cmd('toggle');
    else if (e.code === 'MediaTrackNext') cmd('next');
    else if (e.code === 'MediaTrackPrevious') cmd('prev');
  });

  SV.music = { get track() { return t; }, cmd, refresh: () => host.send('nowPlaying') };
})();

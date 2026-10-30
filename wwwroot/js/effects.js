// Extra looks on top of the backdrop:
//  - lighting: spotlight, rays, dust, breathing edges, bloom, sweeps, lens flare, rim light, cinematic bars,
//    parallax, a reflection under the selection, and a beat glow that follows your background music;
//  - video: a backdrop video plus the Picture slot as a second video, with blend, dim, blur and colour;
//  - sound: your own background music (one or more tracks), fading out while a game runs;
//  - your own videos for the opening, for screen transitions and for game launches;
//  - lines of text that take turns in the top bar.
// Everything here animates with transform / opacity only, and pauses when HOME isn't on screen.
(() => {
  const A = SV.app, { host } = SV;
  const $ = (s) => document.querySelector(s);
  const isVideo = (u) => SV.media && SV.media.isVideo(u);

  const layer = document.createElement('div');
  layer.id = 'lightfx';
  layer.innerHTML = '<i class="lx-spot"></i><i class="lx-rays"></i><i class="lx-dust"></i><i class="lx-edge"></i><i class="lx-flare"></i><i class="lx-rim"></i><i class="lx-bars"></i><i class="lx-beat"></i>';
  document.body.insertBefore(layer, document.getElementById('overlays'));

  // Two video layers under the animated backdrop: the backdrop video, and the Picture slot when it is a video.
  const mkVideo = (id) => {
    const v = document.createElement('video');
    v.id = id;
    Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto', disablePictureInPicture: true });
    v.className = 'bgvid';
    document.body.insertBefore(v, document.getElementById('bg'));
    return v;
  };
  const video = mkVideo('bgvideo'), picVideo = mkVideo('bgpicvideo');
  const setSrc = (v, url) => {
    if (url === (v.dataset.src || '')) return;
    v.dataset.src = url;
    if (url) { v.src = url; v.load(); } else { v.removeAttribute('src'); v.load(); }
  };

  // ---------------------------------------------------------------- pointer: spotlight, flare, rim, parallax
  let raf = 0, px = 0.5, py = 0.4;
  addEventListener('mousemove', (e) => {
    px = e.clientX / innerWidth; py = e.clientY / innerHeight;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      layer.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      layer.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      if (document.body.classList.contains('lx-parallax')) {
        const s = A.cfg.fx.parallaxAmount ?? 1;
        document.documentElement.style.setProperty('--px', ((px - 0.5) * s).toFixed(3));
        document.documentElement.style.setProperty('--py', ((py - 0.5) * s).toFixed(3));
      }
    });
  }, { passive: true });

  // ---------------------------------------------------------------- background music
  const music = new Audio();
  music.preload = 'auto';
  let track = -1, musicTarget = 0, musicFade = 0, ctx = null, analyser = null, beatData = null;
  const tracks = () => (A.cfg.sound.bgmTracks || []).filter(Boolean);
  function nextTrack() {
    const list = tracks();
    if (!list.length) return;
    track = A.cfg.sound.bgmShuffle && list.length > 1 ? (track + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length : (track + 1) % list.length;
    music.src = list[track];
    music.play().catch(() => {});
  }
  music.addEventListener('ended', () => { if (tracks().length > 1 || !A.cfg.sound.bgmLoop) nextTrack(); else { music.currentTime = 0; music.play().catch(() => {}); } });
  // Volume eases toward its target so starting, pausing for a game and leaving HOME all fade.
  setInterval(() => {
    const want = musicTarget * (A.cfg.sound.bgmVolume ?? 0.4) * Math.min(1, (A.cfg.sound.master ?? 0.6) / 0.6);
    musicFade += (want - musicFade) * 0.18;
    if (Math.abs(musicFade - want) < 0.003) musicFade = want;
    music.volume = Math.max(0, Math.min(1, musicFade));
    if (musicFade <= 0.001 && !music.paused && musicTarget === 0) music.pause();
    else if (musicTarget > 0 && music.paused && music.src) music.play().catch(() => {});
  }, 60);
  function musicState() {
    const list = tracks(), s = A.cfg.sound;
    const playing = A.running && A.running.size > 0;
    const on = list.length && A.mode === 'home' && !document.hidden && !(playing && s.bgmPauseInGame !== false);
    musicTarget = on ? 1 : (A.mode !== 'home' && s.bgmInBackground && list.length && !(playing && s.bgmPauseInGame !== false) ? 0.5 : 0);
    if (musicTarget > 0 && (!music.src || !list.includes(music.src.replace(location.origin, '')) && !list.includes(music.src))) { track = -1; nextTrack(); }
    if (!list.length && music.src) { music.removeAttribute('src'); music.load(); }
  }
  // The beat glow listens to the music (only when that effect is on).
  function beat() {
    if (!document.body.classList.contains('lx-beat') || music.paused) { layer.style.setProperty('--beat', 0); return; }
    try {
      if (!ctx) {
        ctx = new AudioContext();
        const src = ctx.createMediaElementSource(music);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        beatData = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser).connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      analyser.getByteFrequencyData(beatData);
      let low = 0;
      for (let i = 1; i < 10; i++) low += beatData[i];
      layer.style.setProperty('--beat', Math.min(1, (low / 9 / 255) ** 2 * 1.6).toFixed(3));
    } catch { /* no audio graph: no beat */ }
  }
  setInterval(beat, 50);

  // ---------------------------------------------------------------- apply settings
  let rotateTimer = 0, rotateIdx = 0;
  const EFFECTS = ['spotlight', 'rays', 'dust', 'breathe', 'bloom', 'sweep', 'flare', 'rim', 'bars', 'parallax', 'reflect', 'beat', 'grainAnim', 'chromaHover'];
  function apply() {
    const f = A.cfg.fx, d = A.cfg.backdrop, b = document.body, motion = d.motion !== false;
    for (const k of EFFECTS) b.classList.toggle('lx-' + k, !!f[k] && (k === 'bloom' || k === 'bars' || motion));
    const st = layer.style;
    st.setProperty('--light', f.light ?? 1);
    st.setProperty('--barsize', (f.barsSize ?? 7) + 'vh');
    document.documentElement.style.setProperty('--glowc', f.glowColor || 'var(--accent)');
    b.dataset.trans = f.transition || 'slash';
    b.dataset.launchvideo = f.launchVideo ? '1' : '';

    // Videos: backdrop video, and the Picture slot when it holds a video (the animated backdrop can't draw those).
    setSrc(video, d.video || '');
    setSrc(picVideo, isVideo(d.image) ? d.image : '');
    const anyVideo = !!(d.video || isVideo(d.image));
    b.classList.toggle('has-video', anyVideo);
    b.dataset.vblend = d.videoBlend || 'screen';
    const root = document.documentElement.style;
    root.setProperty('--bgmix', anyVideo ? (d.videoMix ?? 0.45) : 1);
    root.setProperty('--vfilter', `brightness(${1 - (d.videoDim ?? 0.2)}) blur(${d.videoBlur ?? 0}px) saturate(${d.videoSaturate ?? 1})`);
    root.setProperty('--picvop', isVideo(d.image) ? (1 - (d.imageDim ?? 0.55)) : 0);
    for (const v of [video, picVideo]) v.defaultPlaybackRate = v.playbackRate = d.videoSpeed || 1;
    syncVideos();
    musicState();
    setTimeout(warmAll, 400);

    clearInterval(rotateTimer);
    const lines = String(f.rotateText || '').split(/\n|\|/).map((s) => s.trim()).filter(Boolean);
    if (lines.length) {
      const show = () => { const t = $('.brand .tag'); if (t) decode(t, `[ ${lines[rotateIdx++ % lines.length]} ]`); };
      show();
      rotateTimer = setInterval(show, Math.max(2, f.rotateEvery || 6) * 1000);
    }
  }

  // Videos play only while HOME is on screen and nothing is calming the launcher down for a game.
  // The backdrop video plays while HOME is on screen. A running game ("calm") only pauses it while you are in the
  // game: with HOME in front it plays, so a Roblox left open all day doesn't freeze it. "Pause when not in front"
  // pauses it whenever another window has focus.
  let focused = true;
  const inFront = () => focused;
  function syncVideos() {
    const calm = document.body.classList.contains('calm');
    const on = A.mode === 'home' && !document.hidden && (focused || (!A.cfg.backdrop.videoPauseUnfocused && !calm));
    for (const v of [video, picVideo]) {
      if (on && v.dataset.src) v.dataset.keep = '1'; else delete v.dataset.keep; // the watchdog keeps it going
      if (!v.dataset.src) continue;
      if (on && v.paused) v.play().catch(() => {});
      else if (!on && !v.paused) v.pause();
    }
  }
  document.addEventListener('visibilitychange', () => { syncVideos(); musicState(); });
  host.on('mode', () => setTimeout(() => { syncVideos(); musicState(); }, 0));
  host.on('running', () => setTimeout(() => { syncVideos(); musicState(); }, 0));
  host.on('focus', (m) => { focused = !!m.on; syncVideos(); });
  host.on('mode', (m) => { if (m.mode === 'home') focused = true; }); // coming back always counts as in front

  function decode(node, text) {
    const glyphs = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#/<>*';
    let step = 0;
    const total = 12;
    const timer = setInterval(() => {
      step++;
      node.textContent = [...text].map((c, i) => (c === ' ' || i < (step / total) * text.length ? c : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
      if (step >= total) { clearInterval(timer); node.textContent = text; }
    }, 30);
  }

  // ---------------------------------------------------------------- full-screen videos
  // Every video you set for a moment is loaded ahead of time and kept ready, so it starts the instant it's needed
  // instead of after a load. Times are real seconds on screen: "1 s" means one second, whatever the speed.
  const ready = new Map(); // url -> a loaded <video> waiting to be used
  function readyPlayer(url) {
    let v = ready.get(url);
    if (v && !v.isConnected) { ready.delete(url); return v; }
    v = document.createElement('video');
    Object.assign(v, { playsInline: true, preload: 'auto', disablePictureInPicture: true });
    v.src = url;
    return v;
  }
  function warm(url) {
    if (!url || ready.has(url)) return;
    const v = document.createElement('video');
    Object.assign(v, { playsInline: true, preload: 'auto', muted: true, disablePictureInPicture: true });
    v.src = url;
    v.load();
    ready.set(url, v);
  }
  // Loads every moment's video now (called whenever the settings change).
  function warmAll() {
    const f = A.cfg.fx, m = f.videos || {};
    [f.transitionVideo, f.introVideo, f.launchVideo, ...Object.values(m)].forEach((u) => u && warm(u));
    for (const g of A.cfg.games || []) if (g.launchVideo) warm(g.launchVideo);
  }

  // One player for the opening, transitions and launches.
  //   opts.cover  seconds after it starts when the screen behind it switches
  //   opts.max    the most seconds it stays on screen
  function playOver(url, opts = {}) {
    const box = document.createElement('div');
    box.className = 'fullvid ' + (opts.cls || '');
    if (opts.skip) box.innerHTML = `<span class="tag">[ ${A.T('PRESS ANY KEY TO SKIP')} ]</span>`;
    const v = readyPlayer(url);
    box.prepend(v);
    document.body.append(box);
    v.dataset.keep = 'always';
    v.muted = !!opts.muted;
    v.loop = false;
    try { v.currentTime = 0; } catch {}
    const rate = Math.min(4, Math.max(0.1, +opts.rate || 1));
    v.defaultPlaybackRate = v.playbackRate = rate;
    v.style.filter = opts.filter || '';
    v.style.opacity = opts.opacity != null && opts.opacity < 1 ? opts.opacity : '';
    v.volume = Math.min(1, (A.cfg.sound.master ?? 0.6) * (opts.volume ?? 1));
    let ended = false, covered = false, coverTimer = 0, endTimer = 0, clockOn = false;
    const cover = () => { if (covered) return; covered = true; clearTimeout(coverTimer); opts.covered && opts.covered(); };
    const finish = () => {
      if (ended) return;
      ended = true;
      clearTimeout(coverTimer); clearTimeout(endTimer);
      cover();
      delete v.dataset.keep;
      removeEventListener('keydown', skipKey, true);
      box.classList.add('out');
      const gone = opts.cls === 'intro' ? 420 : 200;
      setTimeout(() => { box.remove(); v.pause(); if (!ready.has(url)) ready.set(url, v); }, gone);
      opts.done && opts.done();
    };
    const skipKey = () => opts.skip && finish();
    // The clock starts when the picture does (or after 250 ms at the latest, so a slow file can't hold things up).
    const startClock = () => {
      if (clockOn) return;
      clockOn = true;
      if (opts.cover != null) coverTimer = setTimeout(cover, Math.max(0, opts.cover) * 1000);
      endTimer = setTimeout(finish, Math.max(0.2, opts.max || 30) * 1000);
    };
    v.addEventListener('playing', startClock, { once: true });
    setTimeout(startClock, 250);
    v.addEventListener('ended', finish, { once: true });
    v.addEventListener('error', finish, { once: true });
    if (opts.skip) { box.addEventListener('click', finish); addEventListener('keydown', skipKey, true); }
    requestAnimationFrame(() => box.classList.add('in'));
    v.play().catch(() => { v.muted = true; v.play().catch(finish); });
    return { finish, video: v };
  }

  // The opening: your intro video, skippable.
  function intro(url, done) {
    playOver(url, { cls: 'intro', skip: true, muted: !!A.cfg.fx.introMuted, max: A.cfg.fx.introMax || 30, done,
      rate: A.cfg.fx.transitionSpeed || 1, filter: videoLook(A.cfg.fx, 'transition') });
  }

  // The video for a moment: its own if you set one, otherwise the transition video when the style is "Video".
  //   moments: list, back, mini, hide, return, off, leave
  function videoFor(moment) {
    const f = A.cfg.fx, own = (f.videos || {})[moment];
    if (own) return own;
    return f.transition === 'video' ? f.transitionVideo || '' : '';
  }

  // A screen transition as a video: `covered` runs at the moment you set, when the video should be covering the
  // screen; the rest of it plays over the new screen.
  function transition(covered, moment) {
    const f = A.cfg.fx, url = moment ? videoFor(moment) : f.transitionVideo;
    if (!url) { covered && covered(); return; }
    playOver(url, { cls: 'transvid', muted: !f.transitionSound, volume: 0.8, cover: Math.min(f.transitionCover ?? 0.4, f.transitionMax || 3), max: f.transitionMax || 3, covered,
      rate: f.transitionSpeed || 1, filter: videoLook(f, 'transition'), opacity: f.transitionOpacity ?? 1 });
  }

  // A video's colour (the transition and launch videos each have their own): a recolour, done with an SVG colour
  // matrix so see-through parts stay see-through, plus hue, saturation, brightness and contrast.
  // `p` is the settings prefix: 'transition' reads fx.transitionTint, fx.transitionHue and so on.
  function videoLook(f, p) {
    const k = (name) => f[p + name];
    const parts = [];
    const tint = k('Tint') || 'none', amt = Math.min(1, Math.max(0, k('TintAmount') ?? 0.6));
    const hex = tint === 'accent' ? A.cfg.theme.accent : tint === 'accent2' ? A.cfg.theme.accent2 : tint === 'custom' ? k('TintColor') : '';
    if (/^#[0-9a-f]{6}$/i.test(hex || '') && amt > 0) {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), L = [0.2126, 0.7152, 0.0722];
      const rows = c.map((ck, ch) => L.map((l, j) => ((1 - amt) * (j === ch ? 1 : 0) + amt * ck * l * 1.15).toFixed(4)).concat(['0', '0']).join(' '));
      let svg = document.getElementById('sv-vlook');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'sv-vlook';
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
        svg.style.position = 'absolute';
        document.body.append(svg);
      }
      const id = 'sv-vtint-' + p;
      let fl = svg.querySelector('#' + id);
      if (!fl) {
        fl = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        fl.id = id;
        fl.setAttribute('color-interpolation-filters', 'sRGB');
        fl.innerHTML = '<feColorMatrix type="matrix"/>';
        svg.append(fl);
      }
      fl.firstElementChild.setAttribute('values', rows.join(' ') + ' 0 0 0 1 0');
      parts.push(`url(#${id})`);
    }
    if (+k('Hue')) parts.push(`hue-rotate(${+k('Hue')}deg)`);
    if ((k('Saturate') ?? 1) !== 1) parts.push(`saturate(${k('Saturate')})`);
    if ((k('Bright') ?? 1) !== 1) parts.push(`brightness(${k('Bright')})`);
    if ((k('Contrast') ?? 1) !== 1) parts.push(`contrast(${k('Contrast')})`);
    return parts.join(' ');
  }

  // The settings rows for a video's speed and colour. `key` is like 'fx.transition' or 'fx.launchVideo'.
  function lookRows(key, speedNote) {
    const { R } = A, at = (n) => A.at(key + n);
    return [
      R.slider('Video speed', ('Faster or slower. ' + (speedNote || '')).trim(), at('Speed'), 0.25, 3, 0.05, (v) => v.toFixed(2) + 'x'),
      R.choice('Video colour', 'Recolours the video. A transparent WebM keeps its see-through parts.', at('Tint'), [['none', 'Original'], ['accent', 'Accent colour'], ['accent2', 'Second accent'], ['custom', 'My colour']]),
      R.color('My colour', 'Used when the video colour is set to My colour.', at('TintColor')),
      R.slider('Colour strength', '', at('TintAmount'), 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
      R.slider('Hue shift', 'Turns every colour around the colour wheel.', at('Hue'), -180, 180, 5, (v) => v + ' deg'),
      R.slider('Saturation', '', at('Saturate'), 0, 3, 0.05, (v) => Math.round(v * 100) + '%'),
      R.slider('Brightness', '', at('Bright'), 0.2, 2, 0.05, (v) => Math.round(v * 100) + '%'),
      R.slider('Contrast', '', at('Contrast'), 0.2, 2, 0.05, (v) => Math.round(v * 100) + '%'),
      R.slider('Video opacity', 'Lower lets the screen show through.', at('Opacity'), 0.1, 1, 0.05, (v) => Math.round(v * 100) + '%'),
    ];
  }

  // A game launch as a video, behind the launch screen's words (or instead of them).
  function launch(url) {
    const box = $('#launchfx');
    let v = box.querySelector('video.lf-video');
    if (!url) { if (v) v.remove(); box.classList.remove('has-video'); return; }
    if (!v) { v = document.createElement('video'); v.className = 'lf-video'; v.playsInline = true; box.prepend(v); }
    v.src = url;
    v.muted = !A.cfg.fx.launchVideoSound;
    v.volume = Math.min(1, A.cfg.sound.master ?? 0.6);
    v.loop = true;
    const f = A.cfg.fx;
    v.style.filter = videoLook(f, 'launchVideo');
    v.style.opacity = f.launchVideoOpacity ?? 1;
    v.dataset.keep = 'always'; // the watchdog keeps it going until the game is up
    box.classList.add('has-video');
    box.classList.toggle('video-only', !!A.cfg.fx.launchVideoOnly);
    v.currentTime = 0;
    v.defaultPlaybackRate = v.playbackRate = Math.min(4, Math.max(0.1, +f.launchVideoSpeed || 1));
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }
  const launchEnd = () => { const v = $('#launchfx video.lf-video'); if (v) { delete v.dataset.keep; v.pause(); } };

  SV.effects = { inFront, sync: () => syncVideos(), apply, intro, decode, transition, videoFor, warmAll, launch, launchEnd, playOver, lookRows, videoLook, music: { next: nextTrack, el: music, refresh: musicState } };
})();

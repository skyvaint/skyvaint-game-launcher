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
    video.playbackRate = picVideo.playbackRate = d.videoSpeed || 1;
    syncVideos();
    musicState();

    clearInterval(rotateTimer);
    const lines = String(f.rotateText || '').split(/\n|\|/).map((s) => s.trim()).filter(Boolean);
    if (lines.length) {
      const show = () => { const t = $('.brand .tag'); if (t) decode(t, `[ ${lines[rotateIdx++ % lines.length]} ]`); };
      show();
      rotateTimer = setInterval(show, Math.max(2, f.rotateEvery || 6) * 1000);
    }
  }

  // Videos play only while HOME is on screen and nothing is calming the launcher down for a game.
  function syncVideos() {
    const on = A.mode === 'home' && !document.hidden && !document.body.classList.contains('calm');
    for (const v of [video, picVideo]) {
      if (!v.dataset.src) continue;
      if (on && v.paused) v.play().catch(() => {});
      else if (!on && !v.paused) v.pause();
    }
  }
  document.addEventListener('visibilitychange', () => { syncVideos(); musicState(); });
  host.on('mode', () => setTimeout(() => { syncVideos(); musicState(); }, 0));
  host.on('running', () => setTimeout(() => { syncVideos(); musicState(); }, 0));
  host.on('focus', (m) => { if (!m.on) for (const v of [video, picVideo]) v.pause(); else syncVideos(); });

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
  // One player for the intro, transitions and launches. `opts.cover` (seconds) is when the screen counts as covered.
  function playOver(url, opts = {}) {
    const box = document.createElement('div');
    box.className = 'fullvid ' + (opts.cls || '');
    box.innerHTML = `<video playsinline></video>${opts.skip ? `<span class="tag">[ ${A.T('PRESS ANY KEY TO SKIP')} ]</span>` : ''}`;
    document.body.append(box);
    const v = box.querySelector('video');
    v.src = url;
    v.muted = !!opts.muted;
    v.volume = Math.min(1, (A.cfg.sound.master ?? 0.6) * (opts.volume ?? 1));
    let ended = false, covered = false;
    const cover = () => { if (covered) return; covered = true; opts.covered && opts.covered(); };
    const finish = () => {
      if (ended) return;
      ended = true;
      cover();
      removeEventListener('keydown', skipKey, true);
      box.classList.add('out');
      setTimeout(() => box.remove(), 450);
      opts.done && opts.done();
    };
    const skipKey = () => opts.skip && finish();
    v.addEventListener('timeupdate', () => { if (opts.cover != null && v.currentTime >= opts.cover) cover(); if (opts.max && v.currentTime >= opts.max) finish(); });
    v.addEventListener('ended', finish);
    v.addEventListener('error', finish);
    if (opts.skip) { box.addEventListener('click', finish); addEventListener('keydown', skipKey, true); }
    setTimeout(finish, Math.max(2, opts.max || 30) * 1000 + 800);
    requestAnimationFrame(() => box.classList.add('in'));
    v.play().catch(() => { v.muted = true; v.play().catch(finish); });
    return { finish, video: v };
  }

  // The opening: your intro video, skippable.
  function intro(url, done) {
    playOver(url, { cls: 'intro', skip: true, muted: !!A.cfg.fx.introMuted, max: A.cfg.fx.introMax || 30, done });
  }

  // A screen transition as a video: `covered` runs at the moment you set (by default 40% in), when the video
  // should be covering the screen; the rest of it plays over the new screen.
  function transition(covered) {
    const f = A.cfg.fx;
    playOver(f.transitionVideo, { cls: 'transvid', muted: !f.transitionSound, volume: 0.8, cover: f.transitionCover ?? 0.4, max: f.transitionMax || 3, covered });
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
    box.classList.add('has-video');
    box.classList.toggle('video-only', !!A.cfg.fx.launchVideoOnly);
    v.currentTime = 0;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }
  const launchEnd = () => { const v = $('#launchfx video.lf-video'); if (v) v.pause(); };

  SV.effects = { apply, intro, decode, transition, launch, launchEnd, playOver, music: { next: nextTrack, el: music, refresh: musicState } };
})();

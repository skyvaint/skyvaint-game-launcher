// Extra looks on top of the backdrop: lighting (a spotlight that follows the pointer, light rays, drifting dust,
// a breathing edge glow, bloom on headlines, light sweeps over the selection), your own MP4 intro, a video
// backdrop, lines of text that take turns in the top bar, and the style of the screen transitions.
(() => {
  const A = SV.app;
  const $ = (s) => document.querySelector(s);

  const layer = document.createElement('div');
  layer.id = 'lightfx';
  layer.innerHTML = '<i class="lx-spot"></i><i class="lx-rays"></i><i class="lx-dust"></i><i class="lx-edge"></i><i class="lx-flare"></i>';
  document.body.insertBefore(layer, document.getElementById('overlays'));

  const video = document.createElement('video');
  video.id = 'bgvideo';
  video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
  document.body.insertBefore(video, document.getElementById('bg'));

  // The spotlight follows the pointer through two CSS variables (cheap: no layout, one composite).
  let raf = 0, px = 0.5, py = 0.4;
  addEventListener('mousemove', (e) => {
    px = e.clientX / innerWidth; py = e.clientY / innerHeight;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; layer.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); layer.style.setProperty('--my', (py * 100).toFixed(1) + '%'); });
  }, { passive: true });

  let rotateTimer = 0, rotateIdx = 0;
  function apply() {
    const f = A.cfg.fx, b = document.body;
    for (const k of ['spotlight', 'rays', 'dust', 'breathe', 'bloom', 'sweep', 'flare']) b.classList.toggle('lx-' + k, !!f[k] && (k === 'bloom' || A.cfg.backdrop.motion !== false));
    layer.style.setProperty('--light', f.light ?? 1);
    b.dataset.trans = f.transition || 'slash';

    // Video backdrop: plays under the animated backdrop, which turns see-through to let it show.
    const v = A.cfg.backdrop.video || '';
    if (v !== (video.dataset.src || '')) {
      video.dataset.src = v;
      if (v) { video.src = v; video.play().catch(() => {}); } else { video.removeAttribute('src'); video.load(); }
    }
    b.classList.toggle('has-video', !!v);
    document.documentElement.style.setProperty('--bgmix', v ? (A.cfg.backdrop.videoMix ?? 0.45) : 1);
    video.playbackRate = A.cfg.backdrop.videoSpeed || 1;

    // Text that takes turns in the top bar (and the opening), changing with a decode effect.
    clearInterval(rotateTimer);
    const lines = String(f.rotateText || '').split(/\n|\|/).map((s) => s.trim()).filter(Boolean);
    if (lines.length) {
      const show = () => { const t = $('.brand .tag'); if (t) decode(t, `[ ${lines[rotateIdx++ % lines.length]} ]`); };
      show();
      rotateTimer = setInterval(show, Math.max(2, f.rotateEvery || 6) * 1000);
    }
  }

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

  // Your own intro video, before HOME appears. Any key, click or button skips it.
  function intro(url, done) {
    const box = document.createElement('div');
    box.id = 'intro';
    box.innerHTML = `<video playsinline></video><span class="tag">[ ${A.T('PRESS ANY KEY TO SKIP')} ]</span>`;
    document.body.append(box);
    const v = box.querySelector('video');
    v.src = url;
    v.muted = !!A.cfg.fx.introMuted;
    v.volume = Math.min(1, A.cfg.sound.master ?? 0.6);
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      removeEventListener('keydown', finish, true);
      box.classList.add('out');
      setTimeout(() => box.remove(), 500);
      done && done();
    };
    v.addEventListener('ended', finish);
    v.addEventListener('error', finish);
    box.addEventListener('click', finish);
    addEventListener('keydown', finish, true);
    const pad = setInterval(() => { if (ended) return clearInterval(pad); for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g && g.buttons.some((b) => b.pressed)) { clearInterval(pad); finish(); } }, 120);
    setTimeout(finish, Math.max(3, A.cfg.fx.introMax || 30) * 1000); // never stuck behind a long video
    v.play().catch(() => { v.muted = true; v.play().catch(finish); });
  }

  SV.effects = { apply, intro, decode };
})();

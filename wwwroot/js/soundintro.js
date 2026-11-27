// The sound opening (Settings → EFFECTS → Opening → "PS2 sound and auroras"): your intro sound plays over a short
// cutscene, your aurora colours spinning faster and faster until they merge into black. On the drop, the hit at the
// end of the sound, there is a flash, HOME comes in and the profile frame opens.
// Timing follows the sound itself, so a slow start-up can't put the drop out of step. It can't be skipped.
window.SV = window.SV || {};

SV.soundIntro = (() => {
  function play({ src, drop = 14.35, volume = 1, profiles = true, colors, onEnter }) {
    const body = document.body;
    const cover = document.createElement('div');
    cover.id = 'sintro';
    cover.innerHTML = '<i class="si-flash"></i>';
    document.body.append(cover);
    body.classList.add('si-on');
    cover.classList.add('si-aurora');
    // The cutscene: the auroras rise with the swell, spin faster and faster, and merge to black as the sound fades.
    const D = drop * 1000;
    const aur = window.SVAurora ? SVAurora.play(cover, { colors, start: Date.now(), text: false, accel: 0.35, T: { rise: 1600, spin: Math.max(3000, D - 5200), merge: Math.max(4200, D - 3600) } }) : null;

    const au = new Audio(src);
    au.volume = Math.max(0, Math.min(1, volume));
    au.preload = 'auto';
    let started = 0, done = false, raf = 0, rose = false;
    // Where we are in the sound, in seconds. Without sound (missing file, blocked), a plain clock stands in.
    const now = () => (au.currentTime > 0 && !au.paused ? au.currentTime : (performance.now() - started) / 1000);

    function hit() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      release();
      cover.classList.add('si-drop');
      if (aur) { aur.fade(600); setTimeout(() => aur.stop(), 900); }
      body.classList.remove('si-on');
      onEnter && onEnter();
      if (profiles) SV.profilesShown = true;
      if (profiles && SV.features && SV.features.pick) setTimeout(() => { try { SV.features.pick(); } catch {} }, 120);
      setTimeout(() => cover.remove(), 1600);
      // The sound plays out (its tail is the drop); a skipped one fades quickly.
      if (au.currentTime < drop - 0.2) { const f = setInterval(() => { au.volume = Math.max(0, au.volume - 0.08); if (au.volume <= 0) { clearInterval(f); au.pause(); } }, 40); }
      au.addEventListener('ended', () => { au.src = ''; }, { once: true });
    }
    // It can't be skipped: keys and clicks do nothing until the drop.
    function hold(e) { e.stopPropagation(); e.preventDefault(); }
    addEventListener('keydown', hold, true);
    addEventListener('mousedown', hold, true);
    const release = () => { removeEventListener('keydown', hold, true); removeEventListener('mousedown', hold, true); };

    function tick() {
      const t = now();
      // The wallpaper rises with the swell, then settles a little darker in the quiet before the drop.
      if (!aur && !rose && t > 0.9) { rose = true; cover.classList.add('si-rise'); }
      if (!aur && t > drop - 3.2) cover.classList.add('si-hush');
      if (t >= drop) return hit();
      raf = requestAnimationFrame(tick);
    }
    started = performance.now();
    au.play().catch(() => {}).finally(() => { started = performance.now() - (au.currentTime || 0) * 1000; });
    raf = requestAnimationFrame(tick);
    // A hidden window gets no frames: never leave the cover up.
    setTimeout(hit, (drop + 6) * 1000);
    return true;
  }
  return { play };
})();

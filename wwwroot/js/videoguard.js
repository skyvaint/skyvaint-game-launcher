// Keeps videos playing. Every video that should be playing (it carries data-keep) is checked a few times a second;
// one that paused or stopped moving is told to play again, and if that doesn't help it is reloaded at the same
// spot. Errors (a dropped connection, a decoder hiccup) reload it the same way.
//   data-keep="1"      plays while the launcher is on screen and no game has calmed it down
//   data-keep="always" plays whenever the page is visible (launch and transition videos)
(() => {
  const seen = new WeakMap(); // video -> { t, still, wait, reloadAt, tries }
  const EVERY = 500;

  const wanted = (v) => {
    const keep = v.dataset.keep;
    if (!keep || !v.isConnected || document.hidden) return false;
    if (!v.getAttribute('src') && !v.currentSrc) return false;
    if (v.ended && !v.loop) return false; // a one-shot video that finished is done, not stuck
    if (keep === 'always') return true;
    // A running game only pauses them while you are in it; with the launcher in front they play.
    return !document.body.classList.contains('calm') || !!(SV.effects && SV.effects.inFront && SV.effects.inFront());
  };

  function play(v) {
    const p = v.play();
    if (p && p.catch) p.catch((e) => {
      // Sound not allowed yet: play it muted rather than not at all.
      if (e && e.name === 'NotAllowedError' && !v.muted) { v.muted = true; v.play().catch(() => {}); }
    });
  }

  // Reloads the video and carries on from where it was, at the same speed.
  function reload(v) {
    const s = seen.get(v) || {};
    const now = performance.now();
    // Each reload waits longer than the last (3 s, 6 s, 12 s… up to a minute), so a file that is slow to load
    // gets the time it needs instead of being restarted over and over.
    const pause = Math.min(60000, 3000 * 2 ** (s.tries || 0));
    if (s.reloadAt && now - s.reloadAt < pause) return;
    s.reloadAt = now;
    s.tries = (s.tries || 0) + 1;
    seen.set(v, s);
    const src = v.getAttribute('src') || v.currentSrc;
    if (!src) return;
    const at = v.currentTime || 0, rate = v.playbackRate || 1, muted = v.muted;
    v.addEventListener('loadedmetadata', () => {
      try { if (isFinite(v.duration) && v.duration > 0) v.currentTime = Math.min(at, Math.max(0, v.duration - 0.1)); } catch {}
      v.defaultPlaybackRate = v.playbackRate = rate;
      v.muted = muted;
      play(v);
    }, { once: true });
    v.src = src;
    v.load();
  }

  function watch(v) {
    if (seen.has(v)) return;
    seen.set(v, { t: -1, still: 0, wait: 0, reloadAt: 0, tries: 0 });
    // Once it plays fine for a while, a later hiccup starts over at the short wait.
    v.addEventListener('playing', () => { const s = seen.get(v); if (s) setTimeout(() => { if (!v.paused) s.tries = 0; }, 8000); });
    v.addEventListener('error', () => { if (v.dataset.keep) setTimeout(() => reload(v), 400); });
  }

  function check() {
    for (const v of document.querySelectorAll('video[data-keep]')) {
      watch(v);
      const s = seen.get(v);
      if (!wanted(v)) { s.still = 0; s.wait = 0; s.t = v.currentTime; continue; }
      if (v.paused) play(v);
      const moved = v.seeking || v.currentTime !== s.t;
      s.t = v.currentTime;
      if (moved) { s.still = 0; s.wait = 0; continue; }
      // Still loading (not enough of the file yet): give it time; only a load that goes nowhere for 20 s is redone.
      if (v.readyState < 3 && v.networkState === 2) { s.still = 0; if (++s.wait >= 40) { s.wait = 0; reload(v); } continue; }
      s.wait = 0;
      // Loaded but not moving for about two seconds: start it over from the same spot.
      if (++s.still >= 4) { s.still = 0; reload(v); }
      else if (s.still === 2) play(v);
    }
  }

  setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => setTimeout(check, 50));
  SV.videoGuard = { check, reload };
})();

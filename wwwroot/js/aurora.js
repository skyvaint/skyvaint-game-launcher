// The aurora launch (Settings → EFFECTS → Launch transition → "Auroras, then SKYVAINT"): your aurora colours rise on
// every screen, start to spin, merge into the middle and go black; after a breath of black the SKYVAINT title comes
// in, the way skyvaint.com shows it; then the launcher fades over 3 seconds into the game. The shell lines the
// timing up with the game's window and does the final fade; every screen runs the same clock (`start`).
window.SVAurora = (() => {
  const T0 = { rise: 1200, spin: 3400, merge: 4600, text: 6000 }; // ms from the start (a launch)
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); const n = m ? parseInt(m[1], 16) : 0xff1f1f; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

  /**
   * Plays the sequence into `host` (a full-screen element).
   * opts: { colors: ['#..', '#..'], start: Date.now() of the shared start, text: true for the screen with the title,
   *         name: the game, onText }
   */
  function play(host, opts = {}) {
    const box = document.createElement('div');
    box.className = 'aurl';
    box.innerHTML = `<canvas></canvas><div class="aurl-black"></div>
      <div class="aurl-title"><div class="aurl-eyebrow">◆ ${esc(opts.label || 'NOW LOADING')} ◆ ${esc(opts.name || '')} ◆</div>
      <div class="aurl-word">${[...'SKYVAINT'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
      <div class="aurl-line"><i></i></div></div>`;
    host.append(box);
    const cv = box.querySelector('canvas'), g = cv.getContext('2d', { alpha: false });
    const cols = (opts.colors && opts.colors.length ? opts.colors : ['#ff1f1f', '#8b3dff']).map(hex);
    const blobs = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2, r: 0.32 + (i % 3) * 0.07, size: 0.42 + (i % 2) * 0.12, c: cols[i % cols.length] }));
    const start = opts.start || Date.now();
    const T = { ...T0, ...(opts.T || {}) }, accel = opts.accel == null ? 0.9 : opts.accel;
    let raf = 0, W = 0, H = 0, texted = false, dead = false;
    const size = () => { const k = 0.5; W = cv.width = Math.max(2, Math.round(innerWidth * k)); H = cv.height = Math.max(2, Math.round(innerHeight * k)); };
    size();
    addEventListener('resize', size);
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    function frame() {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      const ms = Date.now() - start;
      const rise = ease(ms / T.rise);
      const spinT = Math.max(0, ms - T.rise) / 1000;
      const merge = ease((ms - T.spin) / (T.merge - T.spin));
      // Spin speeds up the whole way in.
      const turn = spinT * spinT * accel + spinT * 0.6;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#040306'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const R = Math.max(W, H);
      for (const b of blobs) {
        const ang = b.a + turn;
        const dist = b.r * (1 - merge) * R;
        const x = W / 2 + Math.cos(ang) * dist * (W / R), y = H / 2 + Math.sin(ang) * dist * 0.7 * (H / R) * (R / H);
        const rad = b.size * R * (1 - merge * 0.75);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const al = 0.55 * rise * (1 - merge * 0.3);
        gr.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${al})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      box.style.setProperty('--black', merge.toFixed(3));
      if (ms >= T.text && opts.text && !texted) { texted = true; box.classList.add('aurl-text'); opts.onText && opts.onText(); }
      if (ms > T.merge + 400 && !opts.text) { cancelAnimationFrame(raf); raf = 0; } // other screens: black from here
    }
    raf = requestAnimationFrame(frame);
    return {
      stop() { dead = true; cancelAnimationFrame(raf); removeEventListener('resize', size); cv.width = cv.height = 0; box.remove(); },
      fade(ms = 3000) { box.style.transition = `opacity ${ms}ms ease`; box.style.opacity = '0'; },
      el: box,
    };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // The styles, so desktop.html (other screens) gets them too.
  const css = `
  .aurl { position: fixed; inset: 0; z-index: 9000; background: #000; overflow: hidden; pointer-events: none; }
  .aurl canvas { position: absolute; inset: 0; width: 100%; height: 100%; filter: blur(18px) saturate(1.25); transform: scale(1.06); }
  .aurl-black { position: absolute; inset: 0; background: #000; opacity: var(--black, 0); }
  .aurl-title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.6vh; opacity: 0; }
  .aurl.aurl-text .aurl-title { opacity: 1; }
  .aurl-eyebrow { font: 500 clamp(10px, .85vw, 15px)/1 'JetBrains Mono', Consolas, monospace; letter-spacing: .2em; color: #a3a3a3; text-transform: uppercase;
    opacity: 0; transform: translateY(8px); transition: opacity .9s ease .5s, transform .9s ease .5s; }
  .aurl.aurl-text .aurl-eyebrow { opacity: 1; transform: none; }
  .aurl-word { display: flex; font: 900 clamp(64px, 13vw, 260px)/.9 'Inter Tight', 'Segoe UI Variable Display', 'Segoe UI', sans-serif; letter-spacing: -.02em; }
  .aurl-word span { display: block; background: linear-gradient(100deg, #ffffff 0%, #d4d4d4 22%, #6e6e6e 42%, #ffffff 55%, #a6a6a6 72%, #f0f0f0 100%);
    background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
    opacity: 0; transform: translateY(.35em); filter: blur(10px); transition: opacity .8s ease, transform .9s cubic-bezier(.2,.8,.2,1), filter .9s ease; transition-delay: calc(var(--i) * 70ms); }
  .aurl.aurl-text .aurl-word span { opacity: 1; transform: none; filter: none; animation: aurl-shine 3.2s ease-in-out 1s infinite; }
  @keyframes aurl-shine { 0% { background-position: 100% 0; } 60%, 100% { background-position: -20% 0; } }
  .aurl-line { width: min(38vw, 620px); height: 1px; background: rgba(255,255,255,.14); overflow: hidden; opacity: 0; transition: opacity .8s ease .8s; }
  .aurl.aurl-text .aurl-line { opacity: 1; }
  .aurl-line i { display: block; width: 30%; height: 100%; background: #fff; animation: aurl-load 1.6s ease-in-out infinite; }
  @keyframes aurl-load { from { transform: translateX(-110%); } to { transform: translateX(360%); } }`;
  const st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).append(st);

  return { play, T: T0 };
})();

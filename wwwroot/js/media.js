// Animated pictures (GIF) and videos (MP4 / WebM) as game icons, covers and banners.
// The shelf, banner and rows are redrawn all the time, which used to restart a GIF or video from frame one, and
// a big GIF could freeze the screen while it loaded. Now:
//  - every animation runs on its own clock, shared by every copy on screen, so redraws never restart it;
//  - GIFs are decoded into frames in a worker (mediaworker.js), never on the interface thread;
//  - videos are real <video> players kept in a pool and moved into place, so they are never reloaded;
//  - everything a game uses is loaded ahead of time (preload), and ready() says when a slot can be shown.
window.SV = window.SV || {};

SV.media = (() => {
  const isVideo = (u) => /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(String(u || ''));
  const isGif = (u) => /\.gif(\?|#|$)/i.test(String(u || '')) || /tenor\.com\/.+\.gif|giphy\.com\/media/i.test(String(u || ''));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // One clock per address, started the first time it is needed.
  const clocks = new Map();
  const startOf = (url) => { if (!clocks.has(url)) clocks.set(url, performance.now()); return clocks.get(url); };
  const waiters = new Map(); // url -> [resolve] for ready()
  const settle = (url) => { (waiters.get(url) || []).forEach((f) => f()); waiters.delete(url); };

  // ---------------------------------------------------------------- GIF: decoded in a worker, drawn by the clock
  const gifs = new Map(); // url -> { frames, total, w, h } | 'loading' | 'native'
  let worker = null;
  try {
    worker = new Worker('js/mediaworker.js');
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.ok) gifs.set(m.url, { frames: m.frames, total: m.total, w: m.w, h: m.h });
      else toNative(m.url);
      settle(m.url);
      kick();
    };
  } catch { worker = null; }

  function toNative(url) {
    gifs.set(url, 'native');
    // A plain <img> still animates, just without the shared clock.
    for (const c of [...document.querySelectorAll('canvas.anim-gif')]) if (c.dataset.src === url)
      c.replaceWith(Object.assign(document.createElement('img'), { className: c.className.replace('anim-gif', ''), src: url, draggable: false, alt: '' }));
  }

  // The download is an ordinary async fetch (it doesn't block); the decoding happens in the worker.
  async function load(url, first) {
    if (gifs.has(url)) return;
    gifs.set(url, 'loading');
    if (!worker || typeof ImageDecoder === 'undefined') { toNative(url); settle(url); return; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.arrayBuffer();
      worker.postMessage({ url, data, type: res.headers.get('content-type') || 'image/gif', first }, [data]);
    } catch { toNative(url); settle(url); }
  }

  const liveGifs = document.getElementsByClassName('anim-gif');
  const liveSlots = document.getElementsByClassName('anim-vslot');
  let raf = 0;
  function kick() { if (!raf && (liveGifs.length || liveSlots.length)) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    for (const c of liveGifs) {
      const url = c.dataset.src, g = gifs.get(url);
      if (!g) { load(url, true); continue; }
      if (typeof g === 'string') continue;
      if (c.width !== g.w || c.height !== g.h) { c.width = g.w; c.height = g.h; c._f = -1; }
      const at = (now - startOf(url)) % g.total;
      let f = 0;
      while (f < g.frames.length - 1 && g.frames[f].end <= at) f++;
      if (f !== c._f) { c._f = f; c.getContext('2d').drawImage(g.frames[f].bmp, 0, 0); c.classList.add('ready'); }
    }
    for (const s of liveSlots) if (!s.firstChild) mount(s);
    if (liveGifs.length) raf = requestAnimationFrame(tick);
  }
  // Only redraws that add a GIF or video slot matter (the title text, clock and rows change constantly otherwise).
  const SLOT = 'canvas.anim-gif, .anim-vslot';
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes)
      if (n.nodeType === 1 && (n.matches(SLOT) || n.querySelector(SLOT))) { cancelAnimationFrame(raf); raf = 0; tick(performance.now()); return; }
  }).observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------- video: a pool of players, moved into place
  const pool = new Map(); // url -> [video]
  function player(url) {
    const list = pool.get(url) || [];
    pool.set(url, list);
    let v = list.find((x) => !x.isConnected);
    if (!v) {
      v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto', disablePictureInPicture: true });
      v.src = url;
      v.addEventListener('loadeddata', () => settle(url));
      list.push(v);
    }
    return v;
  }
  function sync(v, url) {
    if (isFinite(v.duration) && v.duration > 0) {
      const want = ((performance.now() - startOf(url)) / 1000) % v.duration;
      if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
    }
    v.play().catch(() => {});
  }
  function mount(slot) {
    const url = slot.dataset.src, v = player(url);
    v.className = 'vfill';
    v.style.objectFit = /icon/.test(slot.dataset.cls || '') ? 'contain' : 'cover';
    slot.append(v);
    if (v.readyState >= 1) sync(v, url); else v.addEventListener('loadedmetadata', () => sync(v, url), { once: true });
  }

  // The markup for a picture slot: <img> for still pictures, a clock-driven canvas for GIFs, a pooled video.
  function html(url, cls = '') {
    if (!url) return '';
    if (isVideo(url)) { startOf(url); return `<span class="${cls} anim-vslot" data-src="${esc(url)}" data-cls="${esc(cls)}"></span>`; }
    if (isGif(url) && gifs.get(url) !== 'native') { startOf(url); return `<canvas class="${cls} anim-gif" data-src="${esc(url)}"></canvas>`; }
    return `<img class="${cls}" src="${esc(url)}" draggable="false" alt="" decoding="async">`;
  }

  // Loads a list of addresses ahead of time: GIFs decoded, videos buffered, pictures in the cache.
  const warmed = new Set();
  function preload(urls) {
    for (const url of urls) {
      if (!url || warmed.has(url)) continue;
      warmed.add(url);
      if (isVideo(url)) player(url).load();
      else if (isGif(url)) load(url, false);
      else { const i = new Image(); i.decoding = 'async'; i.src = url; }
    }
  }

  // Resolves once every picture inside `root` can be shown (or after `wait` ms at the latest).
  function ready(root, wait = 900) {
    const jobs = [];
    for (const img of root.querySelectorAll('img')) if (!img.complete) jobs.push(new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }));
    for (const c of root.querySelectorAll('canvas.anim-gif')) {
      const g = gifs.get(c.dataset.src);
      if (!g || g === 'loading') { load(c.dataset.src, true); jobs.push(new Promise((r) => waiters.set(c.dataset.src, [...(waiters.get(c.dataset.src) || []), r]))); }
    }
    for (const s of root.querySelectorAll('.anim-vslot')) {
      const v = player(s.dataset.src);
      if (v.readyState < 2) jobs.push(new Promise((r) => waiters.set(s.dataset.src, [...(waiters.get(s.dataset.src) || []), r])));
    }
    return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, wait))]);
  }

  const animated = (url) => isVideo(url) || isGif(url);
  return { html, isVideo, isGif, animated, preload, ready };
})();

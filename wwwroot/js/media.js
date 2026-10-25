// Animated pictures (GIF) and videos (MP4 / WebM) as game icons, covers and banners.
// The shelf, banner and rows are redrawn all the time (moving the selection, scrolling the rows), which used to
// restart a GIF or video from frame one every time. Here each animation runs on its own clock, shared by every
// copy on screen: GIFs are decoded once into frames and drawn on a canvas at "now" on that clock, and videos jump
// to the same moment when they appear. Wherever it is shown, and however often it is redrawn, it just keeps going.
window.SV = window.SV || {};

SV.media = (() => {
  const isVideo = (u) => /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(String(u || ''));
  const isGif = (u) => /\.gif(\?|#|$)/i.test(String(u || '')) || /tenor\.com\/.+\.gif|giphy\.com\/media/i.test(String(u || ''));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // One clock per address, started the first time it is shown.
  const clocks = new Map();
  const startOf = (url) => { if (!clocks.has(url)) clocks.set(url, performance.now()); return clocks.get(url); };

  // ---------------------------------------------------------------- GIF: decode once, draw by the clock
  const gifs = new Map(); // url -> { frames: [{ bmp, end }], total, w, h } | 'loading' | 'native'
  const MAX_BYTES = 400 * 1024 * 1024; // decoded frames above this are left to the browser's own GIF player

  async function decode(url) {
    gifs.set(url, 'loading');
    try {
      if (typeof ImageDecoder === 'undefined') throw new Error('no decoder');
      const res = await fetch(url);
      if (!res.ok) throw new Error('http ' + res.status);
      const type = res.headers.get('content-type') || 'image/gif';
      const dec = new ImageDecoder({ data: await res.arrayBuffer(), type: type.startsWith('image/') ? type : 'image/gif' });
      await dec.tracks.ready;
      const count = dec.tracks.selectedTrack.frameCount;
      const frames = [];
      let t = 0, bytes = 0, w = 0, h = 0;
      for (let i = 0; i < count; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        w = image.displayWidth; h = image.displayHeight;
        bytes += w * h * 4;
        if (bytes > MAX_BYTES) { image.close(); throw new Error('too big'); }
        // Frame durations are in microseconds; very short ones play at the usual 10 fps minimum, as browsers do.
        const ms = image.duration ? image.duration / 1000 : 100;
        t += ms < 20 ? 100 : ms;
        frames.push({ bmp: await createImageBitmap(image), end: t });
        image.close();
      }
      dec.close();
      if (!frames.length) throw new Error('empty');
      gifs.set(url, { frames, total: t, w, h });
    } catch {
      gifs.set(url, 'native');
      // Fall back to a plain <img>: still animates, just without the shared clock.
      for (const c of [...document.querySelectorAll('canvas.anim-gif')]) if (c.dataset.src === url) c.replaceWith(Object.assign(document.createElement('img'), { className: c.className.replace('anim-gif', ''), src: url, draggable: false, alt: '' }));
    }
    kick();
  }

  const live = document.getElementsByClassName('anim-gif');
  let raf = 0;
  function kick() { if (!raf && live.length) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    for (const c of live) {
      const url = c.dataset.src, g = gifs.get(url);
      if (!g) { decode(url); continue; }
      if (typeof g === 'string') continue;
      if (c.width !== g.w || c.height !== g.h) { c.width = g.w; c.height = g.h; c._f = -1; }
      const at = (now - startOf(url)) % g.total;
      let f = 0;
      while (f < g.frames.length - 1 && g.frames[f].end <= at) f++;
      if (f !== c._f) { c._f = f; c.getContext('2d').drawImage(g.frames[f].bmp, 0, 0); }
    }
    if (live.length) raf = requestAnimationFrame(tick);
  }
  // New canvases show up whenever the shelf or rows redraw.
  new MutationObserver(() => kick()).observe(document.documentElement, { childList: true, subtree: true });

  // ---------------------------------------------------------------- video: jump to the clock when shown
  function sync(v) {
    const url = v.dataset.src;
    if (!url || !isFinite(v.duration) || v.duration <= 0) return;
    const want = ((performance.now() - startOf(url)) / 1000) % v.duration;
    if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
    v.play().catch(() => {});
  }
  document.addEventListener('loadedmetadata', (e) => { if (e.target.matches && e.target.matches('video.anim-video')) sync(e.target); }, true);

  // The markup for a picture slot: <img> for still pictures, a clock-driven canvas for GIFs, a muted looping video.
  function html(url, cls = '') {
    if (!url) return '';
    if (isVideo(url)) { startOf(url); return `<video class="${cls} anim-video" data-src="${esc(url)}" src="${esc(url)}" muted loop playsinline autoplay preload="auto" disablepictureinpicture></video>`; }
    if (isGif(url) && gifs.get(url) !== 'native') { startOf(url); return `<canvas class="${cls} anim-gif" data-src="${esc(url)}"></canvas>`; }
    return `<img class="${cls}" src="${esc(url)}" draggable="false" alt="">`;
  }

  // For CSS backgrounds (row cards, details banner): videos and GIFs get an element inside instead.
  const animated = (url) => isVideo(url) || isGif(url);

  return { html, isVideo, isGif, animated };
})();

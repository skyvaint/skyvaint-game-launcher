// Animated backdrop. The drawing happens in a worker (bgworker.js) on an OffscreenCanvas, so the interface keeps the
// main thread to itself; this file only forwards settings, events and pictures to it. Every layer has a level: 0 is
// off, 1 is the designed look, higher means more of it.
window.SV = window.SV || {};

SV.bg = (() => {
  const cv = document.getElementById('bg');
  const worker = new Worker('js/bgworker.js');
  const off = cv.transferControlToOffscreen();
  const post = (type, data = {}, transfer) => worker.postMessage({ type, ...data }, transfer || []);
  let active = false, stats = { fps: 0, ms: 0, ratio: 1 };

  post('init', { canvas: off, w: innerWidth, h: innerHeight }, [off]);

  // The worker asks for pictures by address; they load here (where the page's image rules apply) and go over as bitmaps.
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'stats') { stats = m; return; }
    if (m.type !== 'need') return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => createImageBitmap(img).then((bitmap) => post('image', { url: m.url, bitmap }, [bitmap])).catch(() => post('image', { url: m.url, bitmap: null }));
    img.onerror = () => post('image', { url: m.url, bitmap: null });
    img.src = m.url;
  };

  function sync() { post('active', { on: active && !document.hidden }); }

  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => post('resize', { w: innerWidth, h: innerHeight }), 120); });
  document.addEventListener('visibilitychange', sync);
  let mouseAt = 0;
  addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - mouseAt < 30) return; // the plexus only needs a rough idea of where the pointer is
    mouseAt = now;
    post('mouse', { x: e.clientX / innerWidth, y: e.clientY / innerHeight });
  }, { passive: true });
  document.addEventListener('mouseleave', () => post('mouse', { x: -1, y: -1 }));

  return {
    configure(next) { post('configure', { opt: JSON.parse(JSON.stringify(next)) }); },
    strike: () => post('strike'),
    pulse: (x, y, size = 1) => post('pulse', { x, y, size }),
    // The selected game's banner, shown faintly by the "art" layer when no pictures of your own are set.
    setArt(url) { post('setArt', { url: url || '' }); },
    stormStrike: () => post('stormStrike'),
    setActive(on) { active = on; sync(); },
    setThrottled(on) { post('throttled', { on }); },
    get stats() { return stats; },
  };
})();
// Core of the interface: config, HOME shelf, launching, the overlay/menu toolkit and settings.
// Accounts (accounts.js) and the clip library (clips.js) build on what this file exposes as SV.app.
(() => {
  const { host, audio, bg, fx, input } = SV;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Interface wording goes through the language pack (i18n.js); anything it doesn't know stays in English.
  const T = (s) => (SV.i18n ? SV.i18n.t(s) : s);

  // ------------------------------------------------------------------ config

  const PRESETS = {
    predator:  { name: 'Predator',  accent: '#ff1f1f', accent2: '#ff4d3d', bg: '#070505' },
    ego:       { name: 'Ego',       accent: '#ff3ec8', accent2: '#8b3dff', bg: '#08050b' },
    console:   { name: 'Console',   accent: '#1f6bff', accent2: '#38c6ff', bg: '#03060f' },
    volt:      { name: 'Volt',      accent: '#a6ff00', accent2: '#19c37d', bg: '#050805' },
    solar:     { name: 'Solar',     accent: '#ffb300', accent2: '#ff5a1f', bg: '#090604' },
    ice:       { name: 'Ice',       accent: '#5ce1ff', accent2: '#7b8cff', bg: '#04070a' },
    mono:      { name: 'Mono',      accent: '#f2f2f2', accent2: '#8d8d8d', bg: '#060606' },
    inferno:   { name: 'Inferno',   accent: '#ff5a00', accent2: '#ffd000', bg: '#0a0503' },
    toxic:     { name: 'Toxic',     accent: '#39ff14', accent2: '#d4ff00', bg: '#040804' },
    royal:     { name: 'Royal',     accent: '#7a5cff', accent2: '#c05cff', bg: '#07050f' },
    sakura:    { name: 'Sakura',    accent: '#ff7eb6', accent2: '#ffc2d9', bg: '#0b0609' },
    ocean:     { name: 'Ocean',     accent: '#00b3ff', accent2: '#00ffd0', bg: '#02070b' },
    sunset:    { name: 'Sunset',    accent: '#ff5e62', accent2: '#ff9966', bg: '#0b0506' },
    gold:      { name: 'Gold',      accent: '#ffd700', accent2: '#b8860b', bg: '#080703' },
    mint:      { name: 'Mint',      accent: '#3dffb5', accent2: '#8affea', bg: '#030807' },
    blood:     { name: 'Blood',     accent: '#b30000', accent2: '#ff2a2a', bg: '#050202' },
    cyber:     { name: 'Cyber',     accent: '#fcee0a', accent2: '#00f0ff', bg: '#07070a' },
    vapor:     { name: 'Vapor',     accent: '#ff71ce', accent2: '#01cdfe', bg: '#090613' },
    forest:    { name: 'Forest',    accent: '#2ecc71', accent2: '#a3d977', bg: '#040705' },
    lava:      { name: 'Lava',      accent: '#ff3b00', accent2: '#ff0066', bg: '#0a0303' },
    arctic:    { name: 'Arctic',    accent: '#e0f7ff', accent2: '#7fd4ff', bg: '#05080b' },
    grape:     { name: 'Grape',     accent: '#a020f0', accent2: '#ff4fd8', bg: '#08040b' },
    rocket:    { name: 'Rocket',    accent: '#0a66ff', accent2: '#ff7a00', bg: '#03060c' },
    storm:     { name: 'Storm',     accent: '#8b3dff', accent2: '#1fb6ff', bg: '#06050d' },
    pitch:     { name: 'Pitch',     accent: '#19c37d', accent2: '#f2f2f2', bg: '#030806' },
    bubblegum: { name: 'Bubblegum', accent: '#ff5fa2', accent2: '#5fd0ff', bg: '#0a0508' },
    ember:     { name: 'Ember',     accent: '#ff8a3d', accent2: '#b3261e', bg: '#080403' },
    phantom:   { name: 'Phantom',   accent: '#9aa7ff', accent2: '#4b4f8f', bg: '#05060b' },
  };

  // A fresh install starts with an empty shelf: games only come from what the scan finds on this PC (or what
  // you add yourself). These only dress up well-known games when they are found.
  const TAGLINES = {
    roblox_player: 'Pick an account, pick a place, jump in.', roblox_studio: 'Build it. Script it. Ship it.',
    steam_2138720: 'Five a side. No fouls, no offsides, no excuses.', epic_Fortnite: 'Drop in. Build up. Be the last one standing.',
    epic_Sugar: 'Rocket-powered cars. One oversized ball.',
  };
  const COLOURS = {
    roblox_player: ['#e2231a', '#3a3a3a'], roblox_studio: ['#00a2ff', '#0b2f4a'],
    steam_2138720: ['#19c37d', '#0b2f4a'], epic_Fortnite: ['#8b3dff', '#1fb6ff'], epic_Sugar: ['#0a66ff', '#ff7a00'],
  };
  // Games older versions put on every new shelf, whether this PC had them or not.
  const OLD_STARTERS = { rematch: 'steam_2138720', fortnite: 'epic_Fortnite', rocketleague: 'epic_Sugar' };

  const LAYERS = ['mesh', 'terrain', 'plexus', 'shapes', 'rings', 'aurora', 'comets', 'stars', 'rain', 'waves', 'dots', 'bolts', 'embers', 'storm', 'art', 'arcs',
    'nebula', 'planet', 'city', 'ocean', 'sunset', 'fog', 'snow', 'fireflies', 'bokeh', 'matrix'];
  // Real photos (Unsplash, served by picsum.photos) for the background picture. They pan and zoom slowly.
  const PHOTOS = [
    ['', 'None'], [1002, 'Earth from space'], [120, 'Milky Way night'], [1067, 'City at sunset'], [1015, 'Fjord'], [1036, 'Snowy peaks'], [1016, 'Canyon at dusk'],
    [1018, 'Green cliffs'], [1039, 'Forest waterfall'], [1043, 'Valley forest'], [1044, 'Misty river'], [1050, 'Sea cliffs'], [1056, 'Above the clouds'],
    [110, 'Golden field'], [124, 'Turquoise sea'], [13, 'Quiet beach'], [177, 'Mountain hiker'], [184, 'Desert dunes at night'], [190, 'Forest path'], [218, 'Island lagoon'],
  ];
  const photoUrl = (id) => (id ? `https://picsum.photos/id/${id}/1920/1080` : '');
  // Ready-made mixes of backdrop layers. "Website" is the skyvaint.com look: storm lightning, faint art, halftone arcs.
  const BACKDROPS = {
    website:   { name: 'skyvaint.com', levels: { storm: 1, art: 1, arcs: 1, embers: 0.4 } },
    storm:     { name: 'Storm', levels: { storm: 2.2, rain: 1.4, art: 0.6, embers: 0.3 } },
    cosmos:    { name: 'Cosmos', levels: { stars: 1.6, aurora: 1, comets: 1.4, plexus: 0.6, art: 0.5 } },
    synthwave: { name: 'Synthwave', levels: { terrain: 1.4, waves: 1, rings: 1, comets: 0.8, dots: 0.6 } },
    classic:   { name: 'Classic mesh', levels: { mesh: 1, terrain: 1, plexus: 1, shapes: 1, comets: 1, waves: 1, dots: 1, bolts: 1, embers: 1 } },
    minimal:   { name: 'Minimal', levels: { art: 1.2 } },
    deepspace: { name: 'Deep space', levels: { nebula: 1.3, stars: 1.6, planet: 1, comets: 0.8 } },
    nightcity: { name: 'Night city in the rain', levels: { city: 1.2, rain: 1.1, fog: 0.6, bolts: 0.3 } },
    ocean:     { name: 'Moonlit ocean', levels: { ocean: 1.2, stars: 1, fog: 0.4 } },
    sunset:    { name: 'Sunset', levels: { sunset: 1.2, fog: 0.4, embers: 0.3 } },
    winter:    { name: 'Winter night', levels: { snow: 1.4, fog: 0.8, aurora: 0.7, stars: 0.6 } },
    forest:    { name: 'Fireflies', levels: { fireflies: 1.5, fog: 1, stars: 0.7 } },
    bokeh:     { name: 'Bokeh lights', levels: { bokeh: 1.5, fog: 0.3, embers: 0.4 } },
    matrix:    { name: 'Digital rain', levels: { matrix: 1.3, storm: 0.3 } },
    storm2:    { name: 'Thunderstorm', levels: { storm: 2, rain: 1.6, fog: 0.9, bolts: 1 } },
    aurora2:   { name: 'Northern lights', levels: { aurora: 1.8, stars: 1.4, snow: 0.4, fog: 0.4 } },
  };
  // Every piece of on-screen wording that can be changed in Settings → Texts.
  const TEXTS = {
    brand: ['Brand name', 'SKYVAINT'], tag: ['Tag line', 'GAME LAUNCHER'], shelf: ['Shelf heading', 'CHOOSE YOUR GAME'],
    start: ['Start button', 'START'], launching: ['Launch screen heading', 'NOW STARTING'], ready: ['Banner label', 'READY'],
    welcome: ['Welcome line (opening)', 'WELCOME BACK'], ticker: ['Ticker filler', 'PRESS START'], status: ['Idle status', 'READY'],
  };
  const FONTS = {
    anton: ['Anton', "'Anton','Impact',sans-serif"],
    bebas: ['Bebas Neue', "'Bebas Neue','Impact',sans-serif"],
    russo: ['Russo One', "'Russo One','Impact',sans-serif"],
    orbitron: ['Orbitron', "'Orbitron','Segoe UI',sans-serif"],
    blackops: ['Black Ops One', "'Black Ops One','Impact',sans-serif"],
    rajdhani: ['Rajdhani', "'Rajdhani','Segoe UI',sans-serif"],
    manrope: ['Manrope', "'Manrope','Segoe UI',sans-serif"],
    mono: ['JetBrains Mono', "'JetBrains Mono',Consolas,monospace"],
    pixel: ['Press Start 2P', "'Press Start 2P',monospace"],
  };

  const defaults = () => ({
    v: 6,
    profile: { name: 'Player', avatar: '' },
    theme: { preset: 'predator', ...PRESETS.predator, tileShape: 'cut', font: 'anton', uiScale: 1, vignette: true, hero: true, ticker: true, meshStyle: 'mixed',
      tileSize: 1, heroSide: 'right', glow: 1, cut: 1.1, tickerSpeed: 1, tickerText: '', texture: 'grain', textureOpacity: 0.6 },
    appIcon: { style: 'bolt', shape: 'rounded', useTheme: true, letter: 'S', image: '', markColor: '#ffffff', fit: 'cover', zoom: 100, offsetX: 0, offsetY: 0, bare: false, logo: 'auto' },
    texts: Object.fromEntries(Object.entries(TEXTS).map(([k, v]) => [k, v[1]])),
    home: { clips: true },
    nexus: { enabled: false, seeded: false, position: 'bottom', size: 52, backing: 'none', names: true, autohide: false, magnify: true, hideFullscreen: true, items: [],
      align: 'center', gap: 12, radius: 22, offset: 0, idleOpacity: 100, opacity: 47, magnifyAmount: 145, glow: 100, indicator: 'dot', bounce: true, alwaysNames: false, tagStyle: 'dark' },
    discord: { enabled: false, clientId: '', details: 'Playing {game}', state: 'on {platform}', idle: true, idleDetails: 'In the launcher', idleState: '{count} games ready',
      elapsed: true, largeImage: '', largeText: '', smallImage: '', smallText: '', button1Label: '', button1Url: '', button2Label: '', button2Url: '' },
    quests: { day: '', week: '', base: {}, weekBase: {}, claimed: [], xp: 0, custom: [] },
    // Each backdrop layer has a level: 0 is off, 1 the designed look, more is more.
    backdrop: { style: 'website', levels: { mesh: 0, terrain: 0, plexus: 0, shapes: 0, rings: 0, aurora: 0, comets: 0, stars: 0, rain: 0, waves: 0, dots: 0, bolts: 0, embers: 0.4, storm: 1, art: 1, arcs: 1,
      nebula: 0, planet: 0, city: 0, ocean: 0, sunset: 0, fog: 0, snow: 0, fireflies: 0, bokeh: 0, matrix: 0 }, photoMotion: 1,
      pictures: [], slide: 9, artOpacity: 0.18,
      meshStyle: 'poly', meshDensity: 13, meshMotion: 1, meshLines: 1, meshFill: 1, meshColor: 'duo', image: '', imageDim: 0.55,
      intensity: 0.8, speed: 1, quality: 'auto', fps: 0, slowFps: 60, motion: true, calmWhilePlaying: true, video: '', videoMix: 0.45, videoSpeed: 1, photo: '' },
    perf: { smooth: true, meter: false, uncapped: false, dgpu: false },
    fx: { trail: true, ripple: true, tilt: true, glitch: true, scramble: true, rgb: true, chroma: false, scan: false, shake: true, confetti: true, warp: true, pulse: true,
      launchStyle: 'slabs', sparks: 1, space: true, focusFx: true, bootStyle: 'space', fadeWindow: true, wipe: true,
      spotlight: true, rays: false, dust: true, breathe: false, bloom: true, sweep: true, flare: false, light: 1, transition: 'slash',
      introVideo: '', introMuted: false, introMax: 30, rotateText: '', rotateEvery: 6, cursorGlow: false },
    sound: { master: 0.6, pack: 'pulse', events: { nav: true, confirm: true, back: true, boot: true, launch: true }, custom: { boot: '', launch: '', nav: '', confirm: '', back: '', toggle: '', open: '', pick: '', star: '', error: '', slam: '' }, ambient: 0, haptics: true, hover: true, hoverGap: 220, hoverVolume: 0.6, hoverDwell: 70, library: [],
      pitch: 0, echo: 0 },
    behavior: { bootAnim: true, afterLaunch: 'hidden', onGameExit: 'home', closeAction: 'hidden', autostartMode: 'hidden', miniOnTop: true, miniSize: 'm', clock24: true,
      promptAccount: true, hideUninstalled: false, waitForGame: true, launchWait: 120, launchSettle: 2 },
    games: [],
    imported: { steam: false, epic: false, roblox: false, robloxManager: false },
    epic: { accounts: [], last: {} },
    roblox: { accounts: [], selected: [], places: [], placeIdx: 0, multiInstance: true, launchDelay: 5 },
    lists: { roblox: true, studio: true },
    rails: { enabled: true, show: { recent: true, friends: true, roblox: true, trending: true, topPlaying: true, rising: true, steamTop: true, steamDeals: true, epicFree: true, steamNew: true, clips: true, studio: true, upcoming: true, news: true, commissions: true } },
    clips: { favorites: [], categories: [], tagged: {}, folders: [], videos: true, medal: '', autoplay: true },
    dev: { enabled: false, commissions: [], showStudioHome: true },
    language: 'en',
  });

  function merge(base, extra) {
    for (const k in extra) {
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') merge(base[k], extra[k]);
      else base[k] = extra[k];
    }
    return base;
  }

  let cfg = defaults(), stats = {}, scan = [], running = new Set(), mode = 'home', autostart = false;
  let saveTimer;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => host.send('saveConfig', { config: cfg }), 250); };

  const at = (path) => {
    const keys = path.split('.'), last = keys.pop();
    const obj = keys.reduce((o, k) => o[k], cfg);
    return { get: () => obj[last], set: (v) => { obj[last] = v; } };
  };
  const prop = (obj, key) => ({ get: () => obj[key] ?? '', set: (v) => { obj[key] = v; } });

  // ------------------------------------------------------------------ colour + vector art

  const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  function shiftHue(hex, deg) {
    let [r, g, b] = toRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = ((h * 60 + deg) % 360 + 360) % 360;
    if (s < 0.25) s = 0.8; // nudging a grey should still land on a colour
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
  }

  const hash = (s) => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  function rng(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seeded generated artwork as an inline SVG: the stand-in cover for anything without a picture.
  // Styles: tri (jittered triangles), wire (the same, as glowing wireframe), shard (tall splinters),
  // hex (honeycomb), facet (studded pyramids), rings (nested polygons). "mixed" picks one per seed.
  const MESH_STYLES = ['tri', 'wire', 'shard', 'hex', 'facet', 'rings'];
  function meshSVG(seed, c1, c2, n = 6, style = cfg.theme.meshStyle) {
    if (!MESH_STYLES.includes(style)) style = MESH_STYLES[hash(seed + 'style') % MESH_STYLES.length];
    const rand = rng(hash(seed)), A = toRgb(c1), B = toRgb(c2);
    const shade = (mix, light) => toHex(A.map((v, i) => (v * clamp(mix, 0, 1) + B[i] * (1 - clamp(mix, 0, 1))) * light));
    const at2 = (x, y) => clamp((x / 100 + (1 - y / 100)) / 2 + (rand() - 0.5) * 0.45, 0, 1);
    let out = '';
    const poly = (pts, fill, stroke = fill, width = 0.4) => {
      out += `<polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
    };
    const mid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

    if (style === 'tri' || style === 'wire') {
      const pts = [];
      for (let y = 0; y <= n; y++)
        for (let x = 0; x <= n; x++) {
          const edge = x === 0 || y === 0 || x === n || y === n;
          pts.push([(x / n) * 100 + (edge ? 0 : (rand() - 0.5) * 11), (y / n) * 100 + (edge ? 0 : (rand() - 0.5) * 11)]);
        }
      const tri = (a, b, c) => {
        const p = [pts[a], pts[b], pts[c]], [cx, cy] = mid(p), mix = at2(cx, cy), light = 0.35 + rand() * 0.8;
        if (style === 'wire') poly(p, shade(mix, light * 0.22), shade(mix, 0.75 + light * 0.4), 0.55);
        else poly(p, shade(mix, light));
      };
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = y * (n + 1) + x;
          if ((x + y) % 2) { tri(i, i + 1, i + n + 1); tri(i + 1, i + n + 2, i + n + 1); }
          else { tri(i, i + 1, i + n + 2); tri(i, i + n + 2, i + n + 1); }
        }
    } else if (style === 'shard') {
      const cuts = (k) => Array.from({ length: k + 1 }, (_, i) => (i === 0 ? -8 : i === k ? 108 : (i / k) * 100 + (rand() - 0.5) * (70 / k)));
      const top = cuts(n + 2), bottom = cuts(n + 2), lean = 18 + rand() * 22;
      for (let i = 0; i < top.length - 1; i++) {
        const a = [top[i] + lean, 0], b = [top[i + 1] + lean, 0], c = [bottom[i + 1] - lean, 100], d = [bottom[i] - lean, 100];
        const split = 25 + rand() * 50, m1 = [a[0] + (d[0] - a[0]) * split / 100, split], m2 = [b[0] + (c[0] - b[0]) * split / 100, split + (rand() - 0.5) * 30];
        poly([a, b, m2, m1], shade(at2(a[0], 20), 0.4 + rand() * 0.8));
        poly([m1, m2, c, d], shade(at2(d[0], 80), 0.3 + rand() * 0.75));
      }
    } else if (style === 'hex') {
      const r = 100 / (n * 1.5), h = r * Math.sqrt(3) / 2;
      for (let row = -1; row * h * 2 < 100 + h * 2; row++)
        for (let col = -1; col * r * 1.5 < 100 + r; col++) {
          const cx = col * r * 1.5, cy = row * h * 2 + (col % 2 ? h : 0);
          const pts = Array.from({ length: 6 }, (_, k) => [cx + Math.cos(k * Math.PI / 3) * r, cy + Math.sin(k * Math.PI / 3) * r]);
          const fill = shade(at2(cx, cy), 0.3 + rand() * 0.85);
          poly(pts, fill, shade(at2(cx, cy), 0.2), 0.7);
        }
    } else if (style === 'facet') {
      const s = 100 / n;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const a = [x * s, y * s], b = [x * s + s, y * s], c = [x * s + s, y * s + s], d = [x * s, y * s + s];
          const m = [x * s + s * (0.3 + rand() * 0.4), y * s + s * (0.3 + rand() * 0.4)], mix = at2(m[0], m[1]), base = 0.45 + rand() * 0.4;
          poly([a, b, m], shade(mix, base * 1.45));
          poly([b, c, m], shade(mix, base * 0.95));
          poly([c, d, m], shade(mix, base * 0.5));
          poly([d, a, m], shade(mix, base * 1.1));
        }
    } else {
      const cx = 20 + rand() * 60, cy = 20 + rand() * 60, sides = 5 + Math.floor(rand() * 4), count = n + 4, spin = rand() * 6;
      poly([[0, 0], [100, 0], [100, 100], [0, 100]], shade(0.5, 0.25));
      for (let k = count; k > 0; k--) {
        const r = (k / count) * 130, rot = spin + k * 0.21;
        const pts = Array.from({ length: sides }, (_, j) => [cx + Math.cos(rot + j * 6.283 / sides) * r, cy + Math.sin(rot + j * 6.283 / sides) * r]);
        poly(pts, shade(k / count, 0.3 + (k % 2 ? 0.55 : 0.15) + rand() * 0.25), shade(1 - k / count, 1.1), 0.3);
      }
    }
    return `<svg class="mesh" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${out}</svg>`;
  }

  // A game's picture: one you chose wins, otherwise whatever the scan found (Steam's library art, Epic's store
  // art, the program's own icon), otherwise a generated mesh.
  const artSrc = (g, key) => g[key] || (scanOf(g) || {})[key] || '';

  function art(g, kind) {
    const src = kind === 'hero' ? artSrc(g, 'hero') || artSrc(g, 'cover') : artSrc(g, 'cover') || artSrc(g, 'hero');
    if (src) return SV.media.html(src, 'art-img');
    const icon = artSrc(g, 'icon');
    return meshSVG(g.id + kind, g.c1 || cfg.theme.accent, g.c2 || cfg.theme.accent2, kind === 'hero' ? 9 : 6) +
      (icon ? SV.media.html(icon, 'art-icon') : '') +
      `<span class="art-name">${esc(g.name)}</span>`;
  }

  // ------------------------------------------------------------------ apply settings

  const TEXTURES = [['none', 'None'], ['grain', 'Film grain'], ['carbon', 'Carbon fibre'], ['hex', 'Hex grid'], ['scan', 'Scanlines'], ['halftone', 'Halftone'],
    ['diagonal', 'Diagonal lines'], ['grid', 'Blueprint grid'], ['circuit', 'Circuit'], ['paper', 'Paper'], ['noise', 'Heavy noise'], ['dots', 'Polka'],
    ['crosshatch', 'Crosshatch'], ['brick', 'Brick'], ['triangles', 'Triangles'], ['plaid', 'Plaid'], ['zigzag', 'Zigzag'], ['checker', 'Checker'], ['vhs', 'VHS lines'], ['topo', 'Topographic'],
    ['tt-carbon-fibre-v2', 'Carbon weave (web)'], ['tt-cubes', 'Cubes (web)'], ['tt-diagonal-striped-brick', 'Striped brick (web)'], ['tt-dark-mosaic', 'Dark mosaic (web)'], ['tt-black-linen', 'Black linen (web)'], ['tt-asfalt-dark', 'Asphalt (web)'], ['tt-brushed-alum-dark', 'Brushed metal (web)'], ['tt-dark-matter', 'Dark matter (web)'], ['tt-hexellence', 'Hexellence (web)'], ['tt-wood-pattern', 'Wood (web)'], ['tt-stardust', 'Stardust (web)'], ['tt-skulls', 'Skulls (web)'], ['tt-inspiration-geometry', 'Geometry (web)'], ['tt-45-degree-fabric-dark', 'Dark fabric (web)'], ['tt-dark-wood', 'Dark wood (web)'], ['tt-concrete-wall-3', 'Concrete (web)'], ['tt-escheresque-dark', 'Escher (web)'], ['tt-broken-noise', 'Broken noise (web)'], ['tt-crissxcross', 'Criss-cross (web)'],
    ['custom', 'My own picture']];

  function applyBackdrop(style) {
    const preset = BACKDROPS[style];
    if (!preset) return;
    for (const k of LAYERS) cfg.backdrop.levels[k] = preset.levels[k] || 0;
    cfg.backdrop.style = style;
  }

  function applyConfig() {
    if (SV.i18n && SV.i18n.lang !== (cfg.language || 'en')) { SV.i18n.set(cfg.language || 'en'); if (typeof renderHints === 'function') renderHints(); }
    const t = cfg.theme, a = toRgb(t.accent), a2 = toRgb(t.accent2), b = toRgb(t.bg), root = document.documentElement.style;
    root.setProperty('--accent', t.accent);
    root.setProperty('--accent2', t.accent2);
    root.setProperty('--bg', t.bg);
    root.setProperty('--a', a.join(','));
    root.setProperty('--a2', a2.join(','));
    root.setProperty('--on-accent', lum(a) > 0.6 ? '#0b0808' : '#ffffff');
    root.setProperty('--display', (FONTS[t.font] || FONTS.anton)[1]);
    root.setProperty('--ts', t.tileSize);
    root.setProperty('--glow', t.glow);
    root.setProperty('--cut', t.cut + 'rem');
    root.setProperty('--tick', t.tickerSpeed);
    const cls = document.body.classList, d = cfg.backdrop, f = cfg.fx;
    document.body.dataset.shape = t.tileShape;
    document.body.dataset.font = t.font;
    cls.toggle('no-vig', !t.vignette);
    cls.toggle('no-hero', !t.hero);
    cls.toggle('no-ticker', !t.ticker);
    cls.toggle('no-motion', !d.motion);
    for (const k of ['tilt', 'glitch', 'rgb', 'chroma', 'scan']) cls.toggle('fx-' + k, !!f[k] && d.motion);
    cls.toggle('hero-left', t.heroSide === 'left');
    document.body.dataset.launch = f.launchStyle;
    document.body.dataset.tex = t.texture;
    root.setProperty('--texo', t.textureOpacity);
    root.setProperty('--texurl', t.textureImage ? `url("${t.textureImage}")` : 'none');
    SV.space.setColors(a, a2);
    const tx = cfg.texts;
    $('.brand-name').textContent = tx.brand;
    $('.brand .tag').textContent = `[ ${tx.tag} ]`;
    $('.boot-sub').textContent = `[ ${tx.tag} ]`;
    $('#launchfx .lf-mid > .tag').textContent = `[ ${tx.launching} ]`;
    $('.mini-name').textContent = tx.brand;
    cls.toggle('perf-smooth', !!cfg.perf.smooth);
    cls.toggle('no-rails', !cfg.rails.enabled);
    meter(cfg.perf.meter);

    bg.configure({
      levels: d.levels, image: d.image, imageDim: d.imageDim, photoMotion: d.photoMotion ?? 1, pictures: d.pictures, slide: d.slide, artOpacity: d.artOpacity,
      mesh: { style: d.meshStyle, density: d.meshDensity, motion: d.meshMotion, lines: d.meshLines, fill: d.meshFill, color: d.meshColor },
      intensity: d.intensity, speed: d.motion ? d.speed : 0.15, quality: d.quality, fps: +d.fps || 0, slowFps: +d.slowFps || 60, accent: a, accent2: a2, bg: b,
    });
    fx.configure({ trail: f.trail, ripple: f.ripple, warp: f.warp, confetti: f.confetti, sparks: f.sparks, accent: a, accent2: a2 });
    audio.configure(cfg.sound);
    input.setHaptics(cfg.sound.haptics);
    SV.effects && SV.effects.apply();
    applyCalm();
    fit();

    $('#profileName').textContent = cfg.profile.name;
    const av = $('#avatar');
    av.textContent = cfg.profile.avatar ? '' : (cfg.profile.name[0] || 'S').toUpperCase();
    av.style.backgroundImage = cfg.profile.avatar ? `url("${cfg.profile.avatar}")` : '';
    tick();
  }

  function applyCalm() {
    const calm = running.size > 0 && cfg.backdrop.calmWhilePlaying;
    bg.setThrottled(calm);
    fx.setEnabled(mode === 'home' && cfg.backdrop.motion && !calm);
    document.body.classList.toggle('calm', calm);
  }

  // FPS counter: the interface's own frame rate (this thread) next to the backdrop worker's.
  let meterOn = false, meterRaf = 0, meterFrames = 0, meterAt = 0, meterWorst = 0, meterLast = 0;
  function meter(on) {
    meterOn = !!on;
    let box = $('#fpsMeter');
    if (!meterOn) { if (box) box.remove(); cancelAnimationFrame(meterRaf); meterRaf = 0; return; }
    if (!box) { box = el('<div id="fpsMeter"></div>'); document.body.append(box); }
    if (meterRaf) return;
    meterAt = meterLast = performance.now();
    const loop = (now) => {
      meterFrames++;
      meterWorst = Math.max(meterWorst, now - meterLast);
      meterLast = now;
      if (now - meterAt >= 500) {
        const fps = Math.round(meterFrames * 1000 / (now - meterAt)), s = bg.stats;
        box.innerHTML = `<b>${fps}</b> FPS <span>UI</span> · <b>${s.fps || '–'}</b> <span>BG</span> · ${s.ms || 0}ms · ${Math.round((s.ratio || 1) * 100)}% · worst ${meterWorst.toFixed(1)}ms`;
        box.classList.toggle('low', fps < 100);
        meterFrames = 0; meterAt = now; meterWorst = 0;
      }
      meterRaf = meterOn ? requestAnimationFrame(loop) : 0;
    };
    meterRaf = requestAnimationFrame(loop);
  }

  function fit() {
    const px = mode === 'home' ? Math.min(innerHeight / 67.5, innerWidth / 120) * cfg.theme.uiScale : 16;
    document.documentElement.style.fontSize = px.toFixed(2) + 'px';
  }
  addEventListener('resize', fit);

  function tick() {
    const d = new Date(), o = { hour: '2-digit', minute: '2-digit', hour12: !cfg.behavior.clock24 };
    const s = d.toLocaleTimeString([], o);
    $('#clock').textContent = s;
    $('#miniClock').textContent = s;
  }
  setInterval(tick, 10000);

  function toast(text, kind = '') {
    const t = el(`<div class="toast ${kind}">${esc(text)}</div>`);
    $('#toasts').append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  // ------------------------------------------------------------------ HOME

  const ICON = {
    clips: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M10 9.2v5.6l4.8-2.8z"/>',
    accounts: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.700 2 7.500 6"/>',
    mini: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.6-1.6-.6-2.5c0-1 .8-1.5 1.8-1.5H18a3 3 0 0 0 3-3c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="15.5" cy="8" r="1"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
    power: '<path d="M12 3v9M6.3 6.7a8 8 0 1 0 11.4 0"/>',
    tasks: '<rect x="3.500" y="3.500" width="17" height="17" rx="2"/><rect x="9" y="9" width="6" height="6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
    random: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="8.5" cy="8.5" r=".9"/><circle cx="15.5" cy="8.5" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="8.5" cy="15.5" r=".9"/><circle cx="15.5" cy="15.5" r=".9"/>',
    stats: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
    discover: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    quests: '<path d="M6 3h12v5a6 6 0 0 1-12 0zM9 20h6M12 14v6M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/>',
    dev: '<path d="M5.2 3.6l15.2 4.1-4.1 15.2L1.1 18.8z"/><path d="M10.2 10.1l3.9 1-1 3.9-3.9-1z"/>',
    nexus: '<rect x="3" y="15" width="18" height="5" rx="1.5"/><rect x="5.5" y="9" width="4" height="4" rx="1"/><rect x="10.5" y="9" width="4" height="4" rx="1"/><rect x="15.5" y="9" width="3" height="4" rx="1"/>',
  };
  const FUNCS = [
    { id: 'search', label: 'Search', desc: 'Find a game by typing its name', run: () => openSearch() },
    { id: 'random', label: 'Random', desc: 'Can\'t decide? Spin for a game', run: () => roll() },
    { id: 'stats', label: 'Playtime', desc: 'How long you played each game', run: () => openPlaytime() },
    { id: 'discover', label: 'Discover', desc: 'Free games, deals and trending Roblox', run: () => SV.discover.open() },
    { id: 'quests', label: 'Quests', desc: 'Daily goals that earn XP', run: () => SV.quests.open() },
    { id: 'clips', label: 'Clips', desc: 'Your recorded clips', run: () => SV.clips.open() },
    { id: 'dev', label: 'Developer', desc: 'Roblox Studio, commissions and dev tools', dev: true, run: () => SV.dev.open() },
    { id: 'nexus', label: 'Nexus', desc: 'Your desktop app bar', run: () => SV.nexus.open() },
    { id: 'accounts', label: 'Accounts', desc: 'Steam, Epic and Roblox accounts', run: () => openSettings('accounts') },
    { id: 'tasks', label: 'Stop', desc: 'Close running games and apps', run: () => openTasks() },
    { id: 'mini', label: 'Minimize', desc: 'Shrink to the small widget', run: () => leaveTo('mini') },
    { id: 'theme', label: 'Theme', desc: 'Colours, backdrops and effects', run: () => openSettings('theme') },
    { id: 'sound', label: 'Sound', desc: 'Sound packs and volume', run: () => openSettings('sound') },
    { id: 'settings', label: 'Settings', desc: 'Games, behaviour, language and more', run: () => openSettings('games') },
    { id: 'power', label: 'Power', desc: 'Quit, sleep or switch to mini', run: () => openPower() },
  ];
  // The Developer button only shows in developer mode.
  const funcs = () => FUNCS.filter((f) => !f.dev || cfg.dev.enabled);
  const PLATFORM = { epic: 'EPIC GAMES', steam: 'STEAM', roblox: 'ROBLOX', pc: 'PC' };
  const FILTERS = [['all', 'ALL'], ['steam', 'STEAM'], ['epic', 'EPIC'], ['roblox', 'ROBLOX'], ['pc', 'PC']];
  const TILE = 13, GAP = 1.2, GROW = 1.4;

  let heroToken = 0;
  let sel = 0, zone = 'shelf', topIdx = 0, actIdx = 0, heroFlip = 0, launching = false, filter = 'all', shown = [];
  const current = () => shown[sel]; // undefined on the trailing "add game" tile
  const platformOf = (g) => (PLATFORM[g.platform] ? g.platform : 'pc');
  const scanOf = (g) => scan.find((s) => s.scanId === g.scanId);
  const isInstalled = (g) => { const s = scanOf(g); return s ? s.installed !== false : true; };

  // A game list (Roblox places, Studio projects) replaces the shelf while it is open; BACK returns to the games.
  let sub = null;
  function enterList(kind, parent) {
    const p = SV.lists && SV.lists[kind];
    if (!p) return false;
    sub = { kind, p, parent, back: sel };
    sel = 0; zone = 'shelf';
    audio.play('confirm');
    SV.title.slash(renderHome, 30);
    return true;
  }
  function exitList() {
    if (!sub) return;
    const back = sub.back;
    sub = null;
    sel = back; zone = 'shelf';
    audio.play('back');
    SV.title.slash(renderHome, 30);
  }
  function refreshList() { if (sub && mode === 'home') { const keep = sel; renderHome(); select(keep, true); } }
  // Starts the game itself, skipping its list (Studio's "Open Studio").
  const launchDirect = (g) => g && launch(g, { direct: true });

  function visibleGames() {
    if (sub) return sub.p.items(sub.parent);
    const games = cfg.games.filter((g) => (filter === 'all' || platformOf(g) === filter) && !(cfg.behavior.hideUninstalled && !isInstalled(g)));
    return filter === 'all' ? [...games, ...setupCards()] : games;
  }

  // Store cards for platforms with nothing on the shelf yet: get the launcher, sign in, and the games come in by
  // themselves on the next scan. Nobody starts with someone else's games.
  const STORES = {
    steam: { name: 'Steam', get: 'https://store.steampowered.com/about/', open: 'steam://open/games', c: ['#1b2838', '#66c0f4'],
      installed: () => SV.steam && SV.steam.installed },
    epic: { name: 'Epic Games', get: 'https://store.epicgames.com/download', open: 'com.epicgames.launcher://store', c: ['#2a2a2a', '#0078f2'],
      installed: () => SV.epic && SV.epic.installed },
  };
  function rescanStores(quiet) {
    host.send('steamState');
    host.send('epicState');
    if (!quiet) toast('Looking for games on this PC…');
    if (host.native) host.send('rescan');
  }
  function setupCards() {
    if (sub) return [];
    return Object.entries(STORES).filter(([k]) => !cfg.games.some((g) => g.platform === k)).map(([k, s]) => {
      const have = !!s.installed();
      return {
        id: 'setup_' + k, setup: k, name: have ? `Link ${s.name}` : `Get ${s.name}`, platform: k, c1: s.c[0], c2: s.c[1],
        foot: have ? 'LINK' : 'GET', tag: `[ SET UP · ${s.name.toUpperCase()} ]`, heroTag: have ? 'MODE: NO GAMES FOUND YET' : 'MODE: NOT INSTALLED',
        tagline: have ? `Sign in to ${s.name} and install a game. It shows up here by itself.` : `Install ${s.name}, sign in, and your games show up here.`,
        stats: [['STORE', s.name.toUpperCase()], ['ON THIS PC', have ? 'INSTALLED' : 'NOT INSTALLED'], ['GAMES FOUND', '0']],
        actions: [
          have ? { label: 'OPEN ' + s.name.toUpperCase(), primary: true, run: () => { audio.play('confirm'); host.send('openUrl', { url: s.open }); toast(`Sign in to ${s.name}, then come back here.`); } }
            : { label: 'GET ' + s.name.toUpperCase(), primary: true, run: () => { audio.play('confirm'); host.send('openUrl', { url: s.get }); toast(`Install ${s.name}, sign in, then come back here.`); } },
          { label: 'LOOK AGAIN', run: () => rescanStores() },
          { label: 'HIDE', run: () => { cfg.setupHidden = [...(cfg.setupHidden || []), k]; changed('games'); } },
        ].filter((a) => a.label !== 'HIDE' || cfg.games.length),
      };
    }).filter((c) => !(cfg.setupHidden || []).includes(c.setup));
  }

  // Every GIF and video a game uses is loaded ahead of time, so switching to it is instant.
  function preloadArt() {
    const urls = [];
    for (const g of cfg.games) for (const k of ['cover', 'hero', 'icon']) { const u = artSrc(g, k); if (u && SV.media.animated(u)) urls.push(u); }
    SV.media.preload(urls);
  }
  function renderHome() {
    setTimeout(preloadArt, 200);
    const used = sub ? [] : FILTERS.filter(([k]) => k === 'all' || cfg.games.some((g) => platformOf(g) === k));
    if (!sub && !used.some(([k]) => k === filter)) filter = 'all';
    shown = visibleGames();
    const addTile = sub ? !!sub.p.add : filter === 'all';
    document.body.classList.toggle('in-list', !!sub);
    sel = clamp(sel, 0, Math.max(0, shown.length - (addTile ? 0 : 1)));

    $('#funcs').innerHTML = funcs().map((f, i) =>
      `<button class="func" data-i="${i}" data-id="${f.id}" aria-label="${esc(T(f.label))}"><svg viewBox="0 0 24 24">${ICON[f.id]}</svg><span class="func-tip"><b>${esc(T(f.label))}</b><small>${esc(T(f.desc))}</small></span></button>`).join('');
    $('#filters').innerHTML = sub ? `<button class="chip on crumb" data-k="__back">‹ ALL GAMES</button><span class="crumb-now">${esc(sub.p.title)} <i>${shown.length}</i></span>`
      : used.length > 2 ? used.map(([k, label]) =>
      `<button class="chip ${k === filter ? 'on' : ''}" data-k="${k}">${label}<i>${k === 'all' ? cfg.games.length : cfg.games.filter((g) => platformOf(g) === k).length}</i></button>`).join('') : '';

    $('#tiles').innerHTML = shown.map((g, i) => `
      <div class="tile ${isInstalled(g) ? '' : 'absent'}" data-i="${i}">
        <div class="tile-in">${art(g, 'cover')}<div class="sheen"></div>
          <div class="tile-foot"><b>${esc(g.name)}</b><span>${g.foot ? esc(g.foot) : isInstalled(g) ? esc(cfg.texts.start) : 'INSTALL'}</span></div></div>
        <div class="badge">RUNNING</div>
      </div>`).join('') + (addTile ? `
      <div class="tile add" data-i="${shown.length}">
        <div class="tile-in">${meshSVG('add', cfg.theme.accent, cfg.theme.bg)}<div class="plus">+</div>
          <div class="tile-foot"><b>${sub ? esc(sub.p.add.label) : 'ADD GAME'}</b><span>NEW</span></div></div>
      </div>` : '');

    const own = cfg.theme.tickerText.split(',').map((w) => w.trim()).filter(Boolean);
    const words = own.length ? [...own, ...own, ...own].slice(0, Math.max(6, own.length))
      : [...shown.filter((g) => !g.setup).slice(0, 14).map((g) => g.name), cfg.texts.shelf, cfg.profile.name, cfg.texts.ticker, (PRESETS[cfg.theme.preset]?.name || 'CUSTOM') + ' MODE'];
    const run = words.map((w, i) => `<span class="${i % 2 ? 'solid' : ''}">${esc(w)}</span><i>✦</i>`).join('');
    $('#tickerRun').innerHTML = run + run;

    select(sel, true);
    updateRunning();
  }

  function setFilter(next) {
    if (next === filter) return;
    filter = next;
    sel = 0;
    audio.play('toggle');
    renderHome();
  }
  function cycleFilter(d) {
    const keys = [...document.querySelectorAll('#filters .chip')].map((c) => c.dataset.k);
    if (keys.length) setFilter(keys[(keys.indexOf(filter) + d + keys.length) % keys.length]);
  }

  // Decodes the title out of noise, console-boot style.
  let scrambleTimer;
  function scramble(node, text) {
    clearInterval(scrambleTimer);
    if (!cfg.fx.scramble || !cfg.backdrop.motion || text.length > 40) { node.textContent = text; return; }
    const glyphs = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#/<>*';
    let step = 0;
    const total = 9;
    scrambleTimer = setInterval(() => {
      step++;
      node.textContent = [...text].map((c, i) => (c === ' ' || i < (step / total) * text.length ? c : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
      if (step >= total) { clearInterval(scrambleTimer); node.textContent = text; }
    }, 28);
  }

  function select(i, silent) {
    const n = document.querySelectorAll('#tiles .tile').length, next = clamp(i, 0, Math.max(0, n - 1));
    const moved = next !== sel;
    if (moved && !silent) audio.play('nav');
    sel = next;
    actIdx = 0;

    document.querySelectorAll('#tiles .tile').forEach((tile, k) => {
      const x = k < sel ? (k - sel) * (TILE + GAP) : k === sel ? 0 : TILE * GROW + GAP + (k - sel - 1) * (TILE + GAP);
      tile.style.setProperty('--x', x.toFixed(2));
      tile.classList.toggle('on', k === sel);
      tile.classList.toggle('past', k < sel);
      // Tiles far off-screen do not need to paint.
      tile.classList.toggle('far', k < sel - 2 || k > sel + 9);
    });

    const g = current(), num = String(sel + 1).padStart(2, '0');
    $('#shelfLabel').textContent = sub ? `[ ${sub.p.title} › ${num} / ${String(n).padStart(2, '0')} — ${sub.p.label} ]` : `[ ${num} / ${String(n).padStart(2, '0')} — ${cfg.texts.shelf} ]`;
    $('#gTag').textContent = g ? (g.tag || `[ ${PLATFORM[platformOf(g)]} ]`) : sub ? `[ ${sub.p.title} ]` : '[ LIBRARY ]';
    const title = $('#gTitle'), text = g ? g.name : sub ? sub.p.add.label.toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Add a game';
    title.classList.remove('swap');
    void title.offsetWidth; // restart the entrance animation
    title.classList.add('swap');
    if (silent) { clearInterval(scrambleTimer); title.textContent = text; } else scramble(title, text);
    $('#gIcon').innerHTML = g && artSrc(g, 'icon') ? SV.media.html(artSrc(g, 'icon'), 'gicon') : '';
    renderStats();
    renderActions();
    if (moved) for (const n of [$('#gStats'), $('#gIcon')]) { n.classList.remove('fadein'); void n.offsetWidth; n.classList.add('fadein'); }

    // The banner loads into the hidden layer and only fades in once its picture, GIF or video is ready, so a
    // quick run through the shelf never shows a half-loaded or frozen banner.
    const layers = [...document.querySelectorAll('#hero .hero-layer')];
    const nextLayer = layers.find((l) => !l.classList.contains('on')) || layers[0], prevLayer = layers.find((l) => l !== nextLayer);
    nextLayer.innerHTML = g ? art(g, 'hero') : meshSVG('add-hero', cfg.theme.accent, cfg.theme.bg, 9);
    const token = ++heroToken;
    SV.media.ready(nextLayer).then(() => {
      if (token !== heroToken) return;
      nextLayer.classList.add('on');
      prevLayer.classList.remove('on');
    });
    $('#heroNum').textContent = num;
    $('#heroTag').textContent = g ? (g.heroTag || (isInstalled(g) ? 'MODE: READY' : 'MODE: NOT INSTALLED')) : 'MODE: SETUP';
    $('#heroName').textContent = g ? (g.tagline || g.name) : sub ? 'Paste a game link or place ID' : 'Any .exe, Steam or Epic game';
    if (moved && !silent && cfg.fx.pulse) bg.pulse(0.14, 0.3, 0.6);
    const bgArt = g ? artSrc(g, 'hero') || artSrc(g, 'cover') : '';
    bg.setArt(SV.media.isVideo(bgArt) ? '' : bgArt); // the backdrop can't play videos; it uses the still picture only
    renderHomeClips();
    focusHome();
  }

  // HOME's clip strip: the newest clips of the selected game, playable from right there.
  let homeClips = [], clipIdx = 0;
  function renderHomeClips() {
    const box = $('#homeClips'), g = sub ? sub.parent : current();
    homeClips = cfg.home.clips && g ? SV.clips.forGame(g.name).slice(0, 4) : [];
    box.classList.toggle('on', homeClips.length > 0);
    if (!homeClips.length) { box.innerHTML = ''; if (zone === 'hclips') zone = 'detail'; return; }
    clipIdx = clamp(clipIdx, 0, homeClips.length - 1);
    const total = SV.clips.forGame(g.name).length;
    box.innerHTML = `<div class="tag">[ YOUR CLIPS · ${esc(g.name.toUpperCase())} · ${total} ]</div><div class="hc-row">` + homeClips.map((c, i) => `
      <button class="hc" data-i="${i}"><i style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : ''}"></i><span>${esc(c.name)}</span></button>`).join('') +
      `<button class="hc all" data-all="1"><i></i><span>ALL ${total}</span></button></div>`;
  }
  addEventListener('sv:clips', () => { if (mode === 'home') renderHomeClips(); });

  function playtime(sec) {
    if (!sec) return '—';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
  }
  function lastPlayed(ms) {
    if (!ms) return 'NEVER';
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 864e5);
    return days <= 0 ? 'TODAY' : days === 1 ? 'YESTERDAY' : days < 30 ? `${days} DAYS AGO` : new Date(ms).toLocaleDateString();
  }

  function renderStats() {
    const g = current(), s = (g && stats[g.id]) || {};
    let items;
    if (sub) items = g ? g.stats || [] : [[sub.p.label, String(shown.length)]];
    else if (g && g.setup) items = g.stats;
    else if (!g) items = [['GAMES', String(cfg.games.length)], ['DETECTED ON THIS PC', String(scan.length)]];
    else {
      const status = running.has(g.id) ? 'RUNNING' : isInstalled(g) ? 'READY' : 'NOT INSTALLED';
      items = [['PLATFORM', PLATFORM[platformOf(g)]], ['LAST PLAYED', lastPlayed(s.lastPlayed)], ['PLAYTIME', playtime(s.seconds)], ['STATUS', status]];
      const who = g.platform === 'epic' ? SV.epic.statFor(g) : g.platform === 'steam' ? SV.steam.statFor(g) : g.target === 'sv:roblox' ? SV.roblox.stat() : null;
      if (who) items.push(who);
    }
    $('#gStats').innerHTML = items.map(([k, v]) => `<div class="stat ${v === 'RUNNING' ? 'hot' : ''}"><span>${esc(T(k))}</span><b>${esc(T(v))}</b></div>`).join('');
  }

  function actions() {
    const g = current();
    if (sub) {
      const back = { label: 'BACK', run: exitList };
      if (!g) return [...(sub.p.add ? [{ label: sub.p.add.label, primary: true, run: sub.p.add.run }] : []), back];
      return [...g.actions, ...(sub.p.extra ? sub.p.extra(sub.parent) : []), back];
    }
    if (!g) return [{ label: 'ADD GAME', primary: true, run: () => addGame() }, { label: 'SCAN THIS PC', run: () => openScan() }];
    if (g.setup) return g.actions;
    const list = [{ label: running.has(g.id) ? 'RESUME' : isInstalled(g) ? 'START' : 'INSTALL', primary: true, run: () => launch(g) }];
    if (g.platform === 'epic' && cfg.epic.accounts.length) list.push({ label: 'ACCOUNT', run: () => SV.epic.choose(g, launchAs(g)) });
    if (running.has(g.id)) list.push({ label: 'STOP', run: () => stopGame(g) });
    list.push({ label: 'DETAILS', run: () => SV.details.game(g) });
    list.push({ label: 'OPTIONS', run: () => openGameMenu(g) });
    return list;
  }
  function renderActions() {
    $('#actions').innerHTML = actions().map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-i="${i}">${esc(T(a.label))}</button>`).join('');
  }

  function focusHome() {
    document.body.dataset.zone = zone;
    document.querySelectorAll('#funcs .func').forEach((f, i) => f.classList.toggle('focus', zone === 'top' && i === topIdx));
    document.querySelectorAll('#actions .btn').forEach((b, i) => b.classList.toggle('focus', zone === 'detail' && i === actIdx));
    document.querySelectorAll('#homeClips .hc').forEach((b, i) => b.classList.toggle('focus', zone === 'hclips' && i === clipIdx));
  }

  function setZone(z) {
    if (z !== zone) audio.play('nav');
    zone = z;
    focusHome();
  }

  function homeAction(a) {
    if (launching || rolling) return;
    if (SV.rails && SV.rails.isOpen) return SV.rails.action(a);
    if (a === 'search') return openSearch();
    if (a === 'random') return sub ? null : roll();
    if (a === 'stats') return openPlaytime();
    if (a === 'settings') return openSettings('theme');
    if (a === 'clips' || a === 'alt') return SV.clips.open();
    if (a === 'tasks') return openTasks();
    if (a === 'tabPrev' || a === 'tabNext') return cycleFilter(a === 'tabPrev' ? -1 : 1);
    if (a === 'options') return sub ? (current() && sub.p.options ? sub.p.options(current()) : null) : current() && !current().setup ? openGameMenu(current()) : openScan();
    if (a === 'back') return zone === 'shelf' ? (sub ? exitList() : openPower()) : (audio.play('back'), setZone('shelf'));

    if (zone === 'shelf') {
      if (a === 'left') select(sel - 1);
      else if (a === 'right') select(sel + 1);
      else if (a === 'up') setZone('top');
      else if (a === 'down') setZone('detail');
      else if (a === 'confirm') actions()[0].run();
    } else if (zone === 'top') {
      if (a === 'left' || a === 'right') { topIdx = clamp(topIdx + (a === 'left' ? -1 : 1), 0, funcs().length - 1); audio.play('nav'); focusHome(); }
      else if (a === 'down') setZone('shelf');
      else if (a === 'confirm') { audio.play('confirm'); funcs()[topIdx].run(); }
    } else if (zone === 'hclips') {
      const n = document.querySelectorAll('#homeClips .hc').length;
      if (a === 'left' || a === 'right') { clipIdx = clamp(clipIdx + (a === 'left' ? -1 : 1), 0, n - 1); audio.play('nav'); focusHome(); }
      else if (a === 'up') setZone('detail');
      else if (a === 'down') SV.rails.show();
      else if (a === 'confirm') openHomeClip(clipIdx);
    } else {
      const list = actions();
      if (a === 'left' || a === 'right') { actIdx = clamp(actIdx + (a === 'left' ? -1 : 1), 0, list.length - 1); audio.play('nav'); focusHome(); }
      else if (a === 'up') setZone('shelf');
      else if (a === 'down') { if (homeClips.length) setZone('hclips'); else SV.rails.show(); }
      else if (a === 'confirm') list[actIdx].run();
    }
  }

  function openHomeClip(i) {
    const g = current();
    if (i >= homeClips.length) return g && SV.clips.open(g.name);
    audio.play('confirm');
    SV.clips.play(homeClips[i]);
  }
  $('#homeClips').addEventListener('click', (e) => {
    const b = e.target.closest('.hc');
    if (!b || stack.length) return;
    clipIdx = b.dataset.all ? homeClips.length : +b.dataset.i;
    openHomeClip(clipIdx);
  });

  // Leaving HOME (to mini or the tray): the page drifts back and blurs while the shell fades the window into
  // transparency, so it melts away instead of cutting out.
  function leaveTo(m) {
    if (mode !== 'home') return host.send('setMode', { mode: m });
    // A slash wipe sweeps across first, then the page drifts back while the window fades into transparency.
    SV.title.slash(() => {
      if (cfg.fx.space) softLeave();
      host.send('setMode', { mode: m });
    }, 60);
  }
  let leaveTimer = 0;
  function softLeave() {
    document.body.classList.add('leaving');
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => document.body.classList.remove('leaving'), 900);
  }

  // The launcher's logo (top bar, opening, mini widget) follows the app icon, unless it is the plain bolt.
  let appIconUrl = '';
  function applyLogo() {
    const ic = cfg.appIcon || {}, use = appIconUrl && (ic.logo === 'icon' || (ic.logo !== 'bolt' && ic.style !== 'bolt'));
    document.body.classList.toggle('logo-icon', !!use);
    for (const img of document.querySelectorAll('img.app-logo')) if (use && img.getAttribute('src') !== appIconUrl) img.src = appIconUrl;
  }
  host.on('appIcon', (m) => { appIconUrl = m.url || ''; applyLogo(); });

  $('#tiles').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile || stack.length || rolling) return;
    const i = +tile.dataset.i;
    zone = 'shelf';
    if (i === sel) actions()[0].run(); else select(i);
  });
  // Scrolling down anywhere on HOME but the shelf slides the rows up from underneath.
  $('#home').addEventListener('wheel', (e) => {
    if (stack.length || e.target.closest('#shelf') || e.deltaY <= 0) return;
    SV.rails.show();
  }, { passive: true });
  let wheelAt = 0;
  $('#shelf').addEventListener('wheel', (e) => {
    if (stack.length || rolling || performance.now() - wheelAt < 140) return;
    wheelAt = performance.now();
    zone = 'shelf';
    select(sel + (e.deltaY + e.deltaX > 0 ? 1 : -1));
  }, { passive: true });
  $('#funcs').addEventListener('click', (e) => {
    const b = e.target.closest('.func');
    if (b) { topIdx = +b.dataset.i; zone = 'top'; focusHome(); audio.play('confirm'); funcs()[topIdx].run(); }
  });
  $('#filters').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; if (c.dataset.k === '__back') exitList(); else setFilter(c.dataset.k); });
  $('#actions').addEventListener('click', (e) => {
    const b = e.target.closest('.btn');
    if (b) { actIdx = +b.dataset.i; zone = 'detail'; focusHome(); actions()[actIdx].run(); }
  });

  // The selected tile and the feature panel lean toward the pointer.
  function tilt(node, strength) {
    node.addEventListener('mousemove', (e) => {
      if (!cfg.fx.tilt) return;
      const b = node.getBoundingClientRect();
      node.style.setProperty('--ry', (((e.clientX - b.left) / b.width - 0.5) * strength).toFixed(2));
      node.style.setProperty('--rx', ((0.5 - (e.clientY - b.top) / b.height) * strength).toFixed(2));
    });
    node.addEventListener('mouseleave', () => { node.style.setProperty('--rx', 0); node.style.setProperty('--ry', 0); });
  }
  tilt($('#hero'), 9);
  tilt($('#tiles'), 5);

  const GLYPH = {
    kb: { confirm: 'ENTER', back: 'ESC', options: 'TAB', settings: 'T', mini: 'M', tasks: 'X', tabs: 'Q / E', adjust: '← →', clips: 'C', alt: 'F', move: '↑ ↓ ← →',
      search: '/', random: 'R', stats: 'P' },
    pad: { confirm: '✕', back: '○', options: 'OPTIONS', settings: '△', mini: 'PS', tasks: 'X', tabs: 'L1 / R1', adjust: '← →', clips: '□', alt: '□', move: 'D-PAD',
      search: 'R3', random: 'SELECT', stats: 'L3' },
  };
  // Every hint is also a button: clicking it does what the key does, so the controls are always one click away.
  const HINT_ACT = { confirm: 'confirm', back: 'back', options: 'options', settings: 'settings', mini: 'mini', tasks: 'tasks', tabs: 'tabNext', clips: 'clips',
    alt: 'alt', search: 'search', random: 'random', stats: 'stats' };
  const hints = (list) => list.map(([key, label]) =>
    `<span class="hint" ${HINT_ACT[key] ? `data-act="${HINT_ACT[key]}" role="button"` : ''}><kbd class="kb">${GLYPH.kb[key]}</kbd><kbd class="pad">${GLYPH.pad[key]}</kbd>${esc(T(label))}</span>`).join('');
  document.addEventListener('click', (e) => {
    const h = e.target.closest('.hint[data-act]');
    if (h && input.onAction) input.onAction(h.dataset.act);
  });
  // The footer hints: rebuilt when the language changes.
  const renderHints = () => {
    $('#hints').innerHTML = hints([['confirm', 'Start'], ['search', 'Search'], ['random', 'Random'], ['clips', 'Clips'], ['tasks', 'Stop'], ['tabs', 'Filter'], ['options', 'Game options'], ['settings', 'Customize'], ['back', 'Power']]) +
      `<span class="hint right"><kbd>CTRL + ALT + HOME</kbd>${esc(T('Summon from anywhere'))}</span>`;
  };
  renderHints();

  function updateRunning() {
    document.querySelectorAll('#tiles .tile').forEach((t) => t.classList.toggle('running', running.has(shown[+t.dataset.i]?.id)));
    document.querySelectorAll('#miniTiles .mt').forEach((t) => t.classList.toggle('running', running.has(t.dataset.id)));
    const names = cfg.games.filter((g) => running.has(g.id)).map((g) => g.name);
    $('#statusText').textContent = names.length ? 'PLAYING ' + names[0].toUpperCase() : 'READY';
    document.body.classList.toggle('playing', names.length > 0);
    renderStats();
    renderActions();
    focusHome();
    applyCalm();
  }

  // ------------------------------------------------------------------ launching

  // The full-screen "now starting" sequence. `sub` is a line under the title, `list` optional HTML (Roblox accounts),
  // `g` the game, whose banner takes over the screen once it has loaded.
  function launchFx(title, sub = '', list = '', g = null) {
    launching = true;
    audio.play('launch');
    input.rumble(0.8, 260);
    bg.strike();
    $('#lfTitle').textContent = title;
    $('#lfSub').textContent = sub;
    $('#lfList').innerHTML = list;
    $('#lfStatus').textContent = 'STARTING…';
    $('#lfSteps').innerHTML = '';
    $('#lfBanner').innerHTML = (g ? art(g, 'hero') : '') + `<span class="tag">[ ${esc(cfg.texts.ready)} ]</span><b>${esc(g ? g.name : title)}</b>`;
    const node = $('#launchfx');
    node.classList.remove('out', 'waiting', 'ready');
    node.classList.add('on');
    fx.warp(true);
    if (cfg.fx.shake && cfg.backdrop.motion) {
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
    }
    setTimeout(() => bg.strike(), 380);
    setTimeout(() => fx.confetti(), 700);
  }

  // Callback for the account picker: start the game as the chosen account (no id = whoever Epic has signed in).
  const launchAs = (g) => (a) => launch(g, { account: a.id, asked: true });

  function launch(g, opts = {}) {
    if (launching) return;
    // Games with a list of their own (Roblox places, Studio projects) open it instead of starting.
    if (!opts.direct && !sub && SV.lists) {
      const kind = SV.lists.forGame(g);
      if (kind && cfg.lists[kind] !== false && enterList(kind, g)) return;
    }
    if (g.target === 'sv:roblox') return SV.roblox.open(g);
    if (!g.target) { audio.play('error'); toast('No launch target set — open Options to add one.', 'bad'); return; }

    // Epic games ask which account when there is a choice; the answer comes back through opts.account.
    let account = opts.account;
    if (g.platform === 'epic' && !account && !opts.asked && cfg.epic.accounts.length > 1) {
      if (cfg.behavior.promptAccount) return SV.epic.choose(g, launchAs(g));
      account = cfg.epic.last[g.id];
    }
    const who = account && cfg.epic.accounts.find((a) => a.id === account);
    if (who) { cfg.epic.last[g.id] = who.id; who.lastUsed = Date.now(); save(); }

    launchFx(g.name, who ? 'AS ' + who.name.toUpperCase() : g.platform === 'steam' ? SV.steam.launchName(g) : '', '', g);
    setTimeout(() => host.send('launch', { id: g.id, account: who ? who.id : undefined, wait: isInstalled(g) }), 1300);
    armLaunchTimeout();
  }

  // The launch screen stays up until the shell says the game's window is really there (it does that by changing
  // mode). This timer is only the backstop for a shell that never answers.
  let launchTimer;
  function armLaunchTimeout(seconds) {
    clearTimeout(launchTimer);
    launchTimer = setTimeout(endLaunch, (seconds ?? cfg.behavior.launchWait + 45) * 1000);
  }

  function endLaunch() {
    if (!launching) return;
    launching = false;
    clearTimeout(launchTimer);
    fx.warp(false);
    $('#launchfx').classList.remove('on', 'out', 'waiting', 'ready');
  }

  // The shell reports what it is doing; each report becomes a row, and the one before it is ticked off.
  function launchStep(text) {
    const box = $('#lfSteps');
    box.querySelectorAll('.lf-step.now').forEach((s) => s.classList.replace('now', 'done'));
    box.append(el(`<div class="lf-step now"><i></i><span>${esc(text)}</span></div>`));
    while (box.children.length > 7) box.firstElementChild.remove();
  }
  host.on('launchStep', (m) => {
    if (!launching) return toast(m.text); // a switch with no launch screen up still says what it is doing
    launchStep(m.text);
    $('#lfStatus').textContent = '';
    armLaunchTimeout(380); // signing in to Epic by hand can take minutes
  });
  host.on('launchWaiting', (m) => {
    if (!launching) return;
    $('#launchfx').classList.add('waiting');
    launchStep(m.text || 'Waiting for the game window');
    $('#lfStatus').textContent = 'ESC SENDS IT TO THE BACKGROUND';
    armLaunchTimeout((m.seconds || 120) + 30);
  });
  // The game's window is up: its banner fills the screen, then the shell fades the launcher away over the game.
  host.on('launchReady', () => {
    if (!launching) return;
    document.querySelectorAll('#lfSteps .lf-step.now').forEach((s) => s.classList.replace('now', 'done'));
    fx.warp(false);
    audio.play('pick');
    $('#launchfx').classList.remove('waiting');
    $('#launchfx').classList.add('ready');
  });
  $('#launchfx').addEventListener('click', () => { if (launching) host.send('launchSkip'); });

  // ------------------------------------------------------------------ MINI

  const MINI = { s: [78, 104], m: [104, 138], l: [132, 176] };

  // The widget shows what you actually play: most recent first, installed only.
  const miniGames = () => cfg.games.filter(isInstalled)
    .map((g, i) => [g, (stats[g.id] || {}).lastPlayed || 0, i])
    .sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 8).map((x) => x[0]);

  function renderMini() {
    const [w, h] = MINI[cfg.behavior.miniSize] || MINI.m;
    const box = $('#miniTiles'), games = miniGames();
    box.style.setProperty('--mw', w + 'px');
    box.style.setProperty('--mh', h + 'px');
    box.innerHTML = games.map((g) => `
      <button class="mt" data-id="${esc(g.id)}" title="Start ${esc(g.name)}">
        <div class="mt-art">${art(g, 'cover')}<i class="dot"></i></div><span>${esc(g.name)}</span>
      </button>`).join('') || '<div class="mini-empty">No games yet — open HOME to add some.</div>';

    const n = clamp(games.length, 1, 7);
    host.send('miniSize', { w: Math.max(300, 28 + n * w + (n - 1) * 10), h: 46 + 12 + h + 28 + 10 });
    updateRunning();
  }

  // Launching from the widget skips the big animation, unless an account has to be chosen first.
  const needsPrompt = (g) => g.target === 'sv:roblox' || (g.platform === 'epic' && cfg.epic.accounts.length > 1 && cfg.behavior.promptAccount);
  let pendingLaunch = null;

  $('#miniHome').addEventListener('click', () => host.send('setMode', { mode: 'home' }));
  $('#miniHide').addEventListener('click', () => host.send('setMode', { mode: 'hidden' }));
  $('#miniTiles').addEventListener('click', (e) => {
    const b = e.target.closest('.mt');
    const g = b && cfg.games.find((x) => x.id === b.dataset.id);
    if (!g || b.classList.contains('go')) return;
    audio.play('confirm');
    if (needsPrompt(g)) { pendingLaunch = g; return host.send('setMode', { mode: 'home' }); }
    b.classList.add('go');
    setTimeout(() => b.classList.remove('go'), 1600);
    host.send('launch', { id: g.id });
  });

  // ------------------------------------------------------------------ overlay screens + row navigation

  const stack = [];

  function push(screen) {
    stack.push(screen);
    $('#overlays').append(screen.el);
    requestAnimationFrame(() => screen.el.classList.add('in'));
    audio.play('open');
    document.body.classList.add('overlaid');
  }

  function pop() {
    const screen = stack.pop();
    if (!screen) return;
    audio.play('back');
    screen.el.classList.remove('in');
    setTimeout(() => screen.el.remove(), 220);
    screen.onClose && screen.onClose();
    if (!stack.length) document.body.classList.remove('overlaid');
  }

  const isTop = (root) => stack.length > 0 && stack[stack.length - 1].el === root;

  // Vertical list of [data-row] elements. Each row may carry _adjust(dir) and _activate().
  function panel(root, { onTab } = {}) {
    let idx = 0;
    const rows = () => [...root.querySelectorAll('[data-row]')];
    const focus = (i, scroll = true) => {
      const list = rows();
      if (!list.length) return;
      idx = clamp(i, 0, list.length - 1);
      list.forEach((r, k) => r.classList.toggle('focus', k === idx));
      if (scroll) list[idx].scrollIntoView({ block: 'nearest' });
    };
    root.addEventListener('mousemove', (e) => {
      const r = e.target.closest('[data-row]'), i = r ? rows().indexOf(r) : -1;
      if (i >= 0 && i !== idx) focus(i, false);
    });
    return {
      focus,
      get idx() { return idx; },
      action(a) {
        const list = rows(), row = list[idx];
        if (a === 'up' || a === 'down') {
          const next = clamp(idx + (a === 'up' ? -1 : 1), 0, list.length - 1);
          if (next !== idx) { audio.play('nav'); focus(next); }
        } else if (a === 'left' || a === 'right') row && row._adjust && row._adjust(a === 'left' ? -1 : 1);
        else if (a === 'confirm') row && row._activate && row._activate();
        else if (a === 'back') pop();
        else if ((a === 'tabPrev' || a === 'tabNext') && onTab) onTab(a === 'tabPrev' ? -1 : 1);
      },
    };
  }

  function row(label, desc, control, { adjust, activate } = {}) {
    const r = el(`<div class="row" data-row><div class="row-l"><b>${esc(T(label))}</b><small>${esc(T(desc || ''))}</small></div><div class="row-c"></div></div>`);
    r.querySelector('.row-c').append(control);
    r._adjust = adjust;
    r._activate = activate;
    return r;
  }
  const heading = (text) => el(`<div class="row-head tag">[ ${esc(T(text))} ]</div>`);

  // `changed` runs after every edit: re-apply, persist, and optionally refresh game lists.
  function changed(what) {
    applyConfig();
    save();
    if (what === 'games') { renderHome(); renderMini(); }
  }

  const R = {
    toggle(label, desc, ref, after) {
      const c = el('<button class="tog"><i></i></button>');
      const paint = () => c.classList.toggle('on', !!ref.get());
      const set = (v) => { if (!!ref.get() === v) return; ref.set(v); paint(); audio.play('toggle'); changed(); after && after(v); };
      c.addEventListener('click', () => set(!ref.get()));
      paint();
      return row(label, desc, c, { adjust: (d) => set(d > 0), activate: () => set(!ref.get()) });
    },

    slider(label, desc, ref, min, max, step, fmt = (v) => Math.round(v * 100) + '%') {
      const c = el('<div class="slider"><div class="track"><i></i><b></b></div><span></span></div>');
      const track = c.firstElementChild;
      const paint = () => {
        const p = (ref.get() - min) / (max - min);
        c.style.setProperty('--p', p);
        c.lastElementChild.textContent = fmt(ref.get());
      };
      const set = (v) => {
        v = clamp(Math.round(v / step) * step, min, max);
        if (v === ref.get()) return;
        ref.set(+v.toFixed(4)); paint(); changed();
      };
      const fromPointer = (e) => { const b = track.getBoundingClientRect(); set(min + clamp((e.clientX - b.left) / b.width, 0, 1) * (max - min)); };
      track.addEventListener('pointerdown', (e) => { track.setPointerCapture(e.pointerId); fromPointer(e); });
      track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) fromPointer(e); });
      track.addEventListener('pointerup', () => audio.play('toggle'));
      paint();
      return row(label, desc, c, { adjust: (d) => { set(ref.get() + d * step); audio.play('nav'); } });
    },

    choice(label, desc, ref, options, after) {
      const c = el('<div class="choice"><button>‹</button><span></span><button>›</button></div>');
      const paint = () => { c.children[1].textContent = (options.find((o) => o[0] === ref.get()) || options[0])[1]; };
      const step = (d) => {
        const i = Math.max(0, options.findIndex((o) => o[0] === ref.get()));
        ref.set(options[(i + d + options.length) % options.length][0]);
        paint(); audio.play('toggle'); changed(); after && after(ref.get());
      };
      c.children[0].addEventListener('click', () => step(-1));
      c.children[2].addEventListener('click', () => step(1));
      c.children[1].addEventListener('click', () => step(1));
      paint();
      return row(label, desc, c, { adjust: step, activate: () => step(1) });
    },

    color(label, desc, ref, after) {
      const c = el('<div class="color"><label class="chip"><input type="color"></label><code></code></div>');
      const inp = c.querySelector('input');
      const paint = () => { inp.value = ref.get(); c.querySelector('.chip').style.background = ref.get(); c.querySelector('code').textContent = ref.get().toUpperCase(); };
      const set = (v) => { ref.set(v); paint(); changed(); after && after(v); };
      inp.addEventListener('input', () => set(inp.value));
      paint();
      return row(label, desc + ' ← → shifts the hue.', c, { adjust: (d) => { set(shiftHue(ref.get(), d * 12)); audio.play('nav'); }, activate: () => inp.click() });
    },

    text(label, desc, ref, placeholder, what) {
      const c = el(`<input class="text" type="text" spellcheck="false" placeholder="${esc(placeholder || '')}">`);
      c.value = ref.get();
      c.addEventListener('input', () => { ref.set(c.value); changed(what); });
      const r = row(label, desc, c, { activate: () => c.focus() });
      r._input = c;
      return r;
    },

    file(label, desc, ref, kind, what) {
      const c = el('<div class="file"><span></span><button class="btn small">BROWSE</button><button class="btn small ghost">CLEAR</button></div>');
      const paint = () => { c.firstElementChild.textContent = ref.get() ? 'CUSTOM' : 'DEFAULT'; c.classList.toggle('set', !!ref.get()); };
      const browse = () => pick(kind).then((f) => { if (f.url) { ref.set(f.url); paint(); changed(what); audio.play('confirm'); } });
      const clear = () => { if (ref.get()) { ref.set(''); paint(); changed(what); audio.play('back'); } };
      c.children[1].addEventListener('click', browse);
      c.children[2].addEventListener('click', clear);
      paint();
      return row(label, desc, c, { activate: browse, adjust: (d) => d < 0 && clear() });
    },

    button(label, desc, text, fn, danger) {
      const c = el(`<button class="btn small ${danger ? 'danger' : ''}">${esc(text)}</button>`);
      c.addEventListener('click', fn);
      return row(label, desc, c, { activate: fn });
    },

    // A backdrop layer's strength: 0 switches it off, 100% is the designed look, beyond that is more of it.
    level(label, desc, key) {
      return R.slider(label, desc, at('backdrop.levels.' + key), 0, 3, 0.1, (v) => (v <= 0 ? 'OFF' : Math.round(v * 100) + '%'));
    },

    // A row with several small buttons; the first is what ENTER does.
    buttons(label, desc, list, opts = {}) {
      const c = el('<div class="file"></div>');
      list.forEach(([text, fn, kind]) => {
        const b = el(`<button class="btn small ${kind || ''}">${esc(text)}</button>`);
        b.addEventListener('click', fn);
        c.append(b);
      });
      return row(label, desc, c, { activate: list[0] && list[0][1], adjust: opts.adjust });
    },
  };

  const picks = {};
  function pick(kind) {
    if (!host.native) toast('File pickers only work inside the launcher app.');
    const token = Math.random().toString(36).slice(2);
    return new Promise((resolve) => { picks[token] = resolve; host.send('pickFile', { kind, token }); });
  }
  host.on('filePicked', (m) => { const done = picks[m.token]; delete picks[m.token]; done && done(m); });

  // A one-field sheet: asks for a line of text and hands it to `done` when saved.
  function ask({ tag, title, label, desc, value = '', placeholder = '', button = 'SAVE', done }) {
    const draft = { value };
    const root = el(`
      <div class="overlay"><div class="sheet narrow">
        <div class="sheet-head"><div><div class="tag">[ ${esc(tag)} ]</div><h2>${esc(title)}</h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Edit'], ['back', 'Cancel']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), p = panel(body);
    const submit = () => {
      const v = draft.value.trim();
      if (!v) { audio.play('error'); return; }
      if (isTop(root)) pop();
      audio.play('confirm');
      done(v);
    };
    const text = R.text(label, desc, prop(draft, 'value'), placeholder);
    text._input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); submit(); } });
    body.append(text, R.button(button, '', button, submit));
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    push({ el: root, action: p.action });
    p.focus(0);
    setTimeout(() => { text._input.focus(); text._input.select(); }, 260);
  }

  // ------------------------------------------------------------------ settings

  const TABS = [['theme', 'THEME'], ['backdrop', 'BACKDROP'], ['effects', 'EFFECTS'], ['sound', 'SOUND'], ['texts', 'TEXTS'], ['feeds', 'FEEDS'], ['games', 'GAMES'], ['accounts', 'ACCOUNTS'], ['nexus', 'NEXUS'], ['discord', 'DISCORD'], ['developer', 'DEVELOPER'], ['system', 'SYSTEM']];
  const pct = (v) => Math.round(v * 100) + '%';

  function settingsRows(tab, rerender) {
    if (tab === 'theme') {
      const swatches = el('<div class="swatches"></div>');
      const keys = Object.keys(PRESETS);
      const usePreset = (k) => { Object.assign(cfg.theme, { preset: k }, PRESETS[k]); audio.play('toggle'); changed('games'); rerender(); };
      keys.forEach((k) => {
        const p = PRESETS[k];
        const b = el(`<button class="sw ${cfg.theme.preset === k ? 'on' : ''}" style="--c1:${p.accent};--c2:${p.accent2};--c0:${p.bg}"><i></i><span>${p.name}</span></button>`);
        b.addEventListener('click', () => usePreset(k));
        swatches.append(b);
      });
      const custom = () => { cfg.theme.preset = 'custom'; renderHome(); };
      const presetRow = row('Colour theme', `${keys.length} presets.  ← → steps through them.`, swatches, {
        adjust: (d) => usePreset(keys[(Math.max(0, keys.indexOf(cfg.theme.preset)) + d + keys.length) % keys.length]),
      });
      presetRow.classList.add('tall');
      return [
        presetRow,
        R.button('Surprise me', 'Rolls a random accent pair on the current background.', 'RANDOM', () => {
          const hue = Math.random() * 360;
          Object.assign(cfg.theme, { preset: 'custom', accent: shiftHue('#ff2a2a', hue), accent2: shiftHue('#ff2a2a', hue + 30 + Math.random() * 150) });
          audio.play('pick'); changed('games'); rerender();
        }),
        R.color('Accent', 'Main highlight colour.', at('theme.accent'), custom),
        R.color('Second accent', 'Used in gradients, glows and the mesh.', at('theme.accent2'), custom),
        R.color('Background', 'Base colour behind everything.', at('theme.bg'), custom),
        R.choice('Cover mesh', 'Generated artwork for games without a picture.', at('theme.meshStyle'),
          [['mixed', 'Mixed'], ['tri', 'Triangles'], ['wire', 'Wireframe'], ['shard', 'Shards'], ['hex', 'Honeycomb'], ['facet', 'Facets'], ['rings', 'Rings']], () => changed('games')),
        R.choice('Tile shape', 'Corner style for tiles, buttons and panels.', at('theme.tileShape'), [['cut', 'Cut corner'], ['round', 'Rounded'], ['sharp', 'Sharp']]),
        R.choice('Headline font', 'Typeface for titles.', at('theme.font'), Object.entries(FONTS).map(([k, f]) => [k, f[0]])),
        R.choice('Texture', 'A surface laid over the whole screen.', at('theme.texture'), TEXTURES),
        R.slider('Texture strength', '', at('theme.textureOpacity'), 0, 2, 0.1, pct),
        R.file('Texture picture', 'For the My own picture texture: any image, tiled over the screen. Seamless patterns work best.  ← clears it.', { get: () => cfg.theme.textureImage || '', set: (v) => { cfg.theme.textureImage = v; if (v) cfg.theme.texture = 'custom'; } }, 'image'),
        heading('APP ICON'),
        R.choice('Icon', 'The launcher\'s icon in the taskbar, tray and bar.', at('appIcon.style'), [['bolt', 'Bolt'], ['letter', 'Letter'], ['ring', 'Ring'], ['diamond', 'Diamond'], ['image', 'My picture']]),
        R.choice('Icon shape', '', at('appIcon.shape'), [['rounded', 'Rounded square'], ['circle', 'Circle'], ['square', 'Square']]),
        R.toggle('Icon uses theme colours', 'Off keeps the classic red.', at('appIcon.useTheme')),
        R.text('Icon letter', 'For the Letter icon. One or two characters.', at('appIcon.letter'), 'S'),
        R.color('Icon mark colour', 'Colour of the bolt, letter or ring.', at('appIcon.markColor')),
        R.file('Icon picture', 'For the My picture icon: any image, PNG with transparency works great.  ← clears it.', { get: () => cfg.appIcon.image, set: (v) => { cfg.appIcon.image = v; if (v) cfg.appIcon.style = 'image'; } }, 'image'),
      R.choice('Picture fit', 'Fill crops the picture to the shape; Fit shows all of it on the theme colour.', at('appIcon.fit'), [['cover', 'Fill'], ['contain', 'Fit']]),
      R.slider('Picture zoom', '', at('appIcon.zoom'), 30, 300, 5, (v) => v + '%'),
      R.slider('Picture left / right', '', at('appIcon.offsetX'), -50, 50, 1, (v) => (v > 0 ? '+' : '') + v),
      R.slider('Picture up / down', '', at('appIcon.offsetY'), -50, 50, 1, (v) => (v > 0 ? '+' : '') + v),
      R.toggle('Picture without a frame', 'Uses the picture as it is: no shape, no background — the whole image is the icon.', at('appIcon.bare')),
      R.choice('Launcher logo', 'The big logo in the top bar, the opening and the mini widget.', at('appIcon.logo'), [['auto', 'My icon (unless bolt)'], ['icon', 'Always my icon'], ['bolt', 'Classic bolt']]),
        R.button('Use it on my shortcuts', 'Puts this icon on the desktop and Start menu shortcuts to the launcher.', 'APPLY', () => host.send('applyIconToShortcuts')),
        R.slider('Tile size', 'Size of the game tiles on the shelf.', at('theme.tileSize'), 0.7, 1.3, 0.05, pct),
        R.slider('Glow', 'Strength of the glow around the selection.', at('theme.glow'), 0, 2.5, 0.1, pct),
        R.slider('Corner cut', 'How deep the cut corners go.', at('theme.cut'), 0.3, 2.4, 0.1, (v) => v.toFixed(1)),
        R.choice('Feature panel side', 'Which side the big artwork sits on.', at('theme.heroSide'), [['right', 'Right'], ['left', 'Left']]),
        R.slider('Ticker speed', 'How fast the headline strip scrolls.', at('theme.tickerSpeed'), 0.3, 3, 0.1, (v) => v.toFixed(1) + '×'),
        R.text('Ticker text', 'Your own words, separated by commas. Empty uses your game names.', at('theme.tickerText'), 'GG, NO MERCY, CLUTCH', 'games'),
        R.slider('Interface size', 'Scales the whole HOME screen.', at('theme.uiScale'), 0.85, 1.15, 0.05, pct),
        R.toggle('Feature panel', 'Large artwork panel beside the game details.', at('theme.hero')),
        R.toggle('Ticker', 'Scrolling headline strip.', at('theme.ticker')),
        R.toggle('Vignette', 'Darkened screen edges.', at('theme.vignette')),
      ];
    }

    if (tab === 'backdrop') {
      const setAll = (fn) => { for (const k of LAYERS) cfg.backdrop.levels[k] = fn(k); audio.play('toggle'); changed(); rerender(); };
      const base = defaults().backdrop;
      const styles = Object.entries(BACKDROPS).map(([k, v]) => [k, v.name]);
      return [
        heading('STYLE'),
        R.choice('Backdrop style', 'A ready-made mix of the layers below. Pick Custom to keep your own mix.', at('backdrop.style'), [...styles, ['custom', 'Custom']], (v) => { if (v !== 'custom') { applyBackdrop(v); changed(); rerender(); } }),
        heading('SKYVAINT.COM'),
        R.level('Storm lightning', 'Branching bolts in bursts, with a flash across the sky.', 'storm'),
        R.level('Artwork', 'The selected game\'s art, faint behind everything (or your pictures below).', 'art'),
        R.slider('Artwork strength', '', at('backdrop.artOpacity'), 0.04, 0.6, 0.02, pct),
        R.level('Halftone arcs', 'Sweeping arcs of dots.', 'arcs'),
        R.button('Artwork pictures', cfg.backdrop.pictures.length ? `${cfg.backdrop.pictures.length} picture(s) cycling instead of the game art.` : 'Add your own pictures to cycle behind everything.', 'ADD', () => pick('image').then((f) => { if (f.url) { cfg.backdrop.pictures.push(f.url); changed(); rerender(); } })),
        ...(cfg.backdrop.pictures.length ? [
          R.slider('Picture time', 'How long each picture stays.', at('backdrop.slide'), 3, 30, 1, (v) => v + ' s'),
          R.button('Clear pictures', 'Go back to the selected game\'s art.', 'CLEAR', () => { cfg.backdrop.pictures = []; changed(); rerender(); }, true),
        ] : []),
        heading('MESH BACKGROUND'),
        R.level('Mesh', 'The drifting mesh behind everything. Slide to 0 to switch it off.', 'mesh'),
        R.choice('Mesh style', 'Shape of the mesh cells.', at('backdrop.meshStyle'), [['poly', 'Low-poly'], ['tri', 'Triangles'], ['grid', 'Grid'], ['diamond', 'Diamonds'], ['hex', 'Honeycomb']]),
        R.slider('Mesh density', 'How many cells across the screen.', at('backdrop.meshDensity'), 5, 30, 1, (v) => v + ' cells'),
        R.slider('Mesh movement', 'How far the mesh points wander.', at('backdrop.meshMotion'), 0, 3, 0.1, pct),
        R.slider('Mesh lines', 'Brightness of the wireframe.', at('backdrop.meshLines'), 0, 4, 0.1, pct),
        R.slider('Mesh glow', 'Brightness of the cells that light up.', at('backdrop.meshFill'), 0, 4, 0.1, pct),
        R.choice('Mesh colour', 'Which colours the mesh uses.', at('backdrop.meshColor'), [['duo', 'Both accents'], ['accent', 'Accent'], ['accent2', 'Second accent'], ['spectrum', 'Spectrum'], ['white', 'White']]),
        heading('MORE MESHES'),
        R.level('Wire terrain', 'Perspective grid floor rolling toward you.', 'terrain'),
        R.level('Constellation', 'Points that link up when close and reach for the pointer.', 'plexus'),
        R.level('Wireframe solids', 'Slowly turning 3D shapes. Higher adds more of them.', 'shapes'),
        R.level('HUD rings', 'Broken rings turning like a targeting display.', 'rings'),
        heading('WEATHER'),
        R.level('Lightning', 'How often bolts strike. 300% is a storm.', 'bolts'),
        R.level('Rain', 'Streaks of rain across the screen.', 'rain'),
        R.level('Comets', 'Shooting stars.', 'comets'),
        R.level('Embers', 'Rising particles.', 'embers'),
        R.level('Stars', 'A twinkling starfield.', 'stars'),
        R.level('Aurora', 'Soft curtains of light across the top.', 'aurora'),
        heading('SHAPES'),
        R.level('Wave ribbons', 'Flowing ribbons across the lower screen. Higher makes them taller.', 'waves'),
        R.level('Halftone dots', 'Pulsing dot field.', 'dots'),
        heading('SCENES'),
        R.level('Nebula', 'Glowing clouds of deep space.', 'nebula'),
        R.level('Planet', 'A huge planet rising from the bottom corner.', 'planet'),
        R.level('Night city', 'A skyline with windows lighting up.', 'city'),
        R.level('Moonlit ocean', 'A moon over the sea, its light glittering on the waves.', 'ocean'),
        R.level('Sunset sky', 'A setting sun with drifting clouds.', 'sunset'),
        R.level('Fog', 'Slow banks of fog rolling past.', 'fog'),
        R.level('Snow', 'Falling snow.', 'snow'),
        R.level('Fireflies', 'Glowing fireflies wandering about.', 'fireflies'),
        R.level('Bokeh', 'Out-of-focus lights floating up, like a camera shot.', 'bokeh'),
        R.level('Digital rain', 'Falling columns of code.', 'matrix'),
        heading('PHOTO'),
        R.choice('Photo backdrop', `${PHOTOS.length - 1} real photos. Combine with any style above.`, { get: () => (PHOTOS.find(([id]) => id && photoUrl(id) === cfg.backdrop.image) || [''])[0], set: (v) => { cfg.backdrop.image = photoUrl(v); } }, PHOTOS),
        R.file('Your own picture', 'Any image behind the effects.  ← clears it.', at('backdrop.image'), 'image'),
        R.slider('Picture dimming', 'How much the picture is darkened.', at('backdrop.imageDim'), 0, 0.95, 0.05, pct),
        R.slider('Photo motion', 'Slow pan and zoom over the picture. 0 keeps it still.', at('backdrop.photoMotion'), 0, 3, 0.1, pct),
        heading('VIDEO'),
        R.file('Video backdrop', 'An MP4 or WebM that loops behind everything.  ← clears it.', at('backdrop.video'), 'video'),
        R.slider('Effects over the video', 'How much of the animated backdrop is drawn on top of the video.', at('backdrop.videoMix'), 0, 1, 0.05, pct),
        R.slider('Video speed', '', at('backdrop.videoSpeed'), 0.25, 2, 0.05, (v) => v.toFixed(2) + '×'),
        heading('TUNING'),
        R.slider('Intensity', 'How bright the backdrop effects are.', at('backdrop.intensity'), 0.1, 1.5, 0.1, pct),
        R.slider('Speed', 'How fast everything moves.', at('backdrop.speed'), 0.2, 2.5, 0.1, (v) => v.toFixed(1) + '×'),
        R.choice('Render quality', 'Auto lowers the backdrop resolution by itself whenever frames run long, so the frame rate holds.', at('backdrop.quality'), [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]),
      R.choice('Frame rate', 'Cap for the backdrop. Match display runs at your monitor rate (144, 180, 240...).', at('backdrop.fps'), [[0, 'Match display'], [60, '60'], [120, '120'], [144, '144'], [180, '180'], [240, '240']]),
      R.choice('Slow layers refresh', 'Mesh, dots, waves and arcs move slowly, so they can redraw less often than the bolts and embers.', at('backdrop.slowFps'), [[30, '30 fps'], [60, '60 fps'], [120, '120 fps'], [999, 'Every frame']]),
        R.toggle('Interface motion', 'Turn off to remove UI animations and slow the backdrop.', at('backdrop.motion')),
        R.toggle('Calm while a game runs', 'Halves the frame rate and pauses decorative motion so games get the GPU.', at('backdrop.calmWhilePlaying')),
        heading('SHORTCUTS'),
        R.button('Everything on', 'Every layer at 100%.', 'MAX', () => setAll(() => 1)),
        R.button('Everything off', 'A plain background (and picture, if set).', 'CLEAR', () => setAll(() => 0)),
        R.button('Back to default', 'The original mix of layers.', 'RESET', () => setAll((k) => base.levels[k])),
      ];
    }

    if (tab === 'effects') return [
      heading('LIGHTING'),
      R.slider('Light strength', 'How bright all the lighting effects below are.', at('fx.light'), 0.2, 2, 0.1, pct),
      R.toggle('Spotlight', 'A soft light follows your pointer across the screen.', at('fx.spotlight')),
      R.toggle('Light rays', 'Slow god rays falling from the top corner.', at('fx.rays')),
      R.toggle('Dust in the light', 'Tiny specks drifting through the air.', at('fx.dust')),
      R.toggle('Breathing edges', 'The screen edges glow and fade in your accent colour.', at('fx.breathe')),
      R.toggle('Bloom', 'Headlines and the selection glow like neon.', at('fx.bloom')),
      R.toggle('Light sweeps', 'A streak of light passes over the selected tile and banner.', at('fx.sweep')),
      R.toggle('Lens flare', 'A flare that drifts with the pointer.', at('fx.flare')),
      heading('TRANSITIONS'),
      R.choice('Transition style', 'How the screen changes: opening a list, going to mini, hiding and coming back.', at('fx.transition'),
        [['slash', 'Slash'], ['shutter', 'Shutter'], ['fade', 'Fade to black'], ['iris', 'Iris'], ['zoom', 'Zoom blur'], ['glitch', 'Glitch'], ['bars', 'Light bars'], ['none', 'None']]),
      R.button('Preview transition', '', 'PLAY', () => SV.title.slash(null, 160)),
      heading('INTRO VIDEO'),
      R.file('Intro video', 'Your own MP4 or WebM, played full screen when the launcher opens. Any key skips it.  ← clears it.', at('fx.introVideo'), 'video'),
      R.toggle('Intro without sound', '', at('fx.introMuted')),
      R.slider('Longest intro', 'Skips ahead after this long, even if the video is longer.', at('fx.introMax'), 3, 120, 1, (v) => v + ' s'),
      R.button('Preview intro', cfg.fx.introVideo ? '' : 'Pick a video first.', 'PLAY', () => { if (!cfg.fx.introVideo) return toast('Pick an intro video first.', 'bad'); while (stack.length) pop(); SV.effects.intro(cfg.fx.introVideo); }),
      heading('CHANGING TEXT'),
      R.text('Top bar lines', 'Lines that take turns under the logo, separated by | (e.g. NO MERCY | GG ONLY | SKYVAINT). Empty keeps the tag line.', at('fx.rotateText'), 'NO MERCY | GG ONLY'),
      R.slider('Change every', '', at('fx.rotateEvery'), 2, 30, 1, (v) => v + ' s'),
      heading('POINTER'),
      R.toggle('Cursor sparks', 'A trail of sparks follows the mouse.', at('fx.trail')),
      R.toggle('Click shockwave', 'Rings and sparks burst from every click.', at('fx.ripple')),
      R.toggle('3D tilt', 'The selected tile and feature panel lean toward the pointer.', at('fx.tilt')),
      heading('SELECTION'),
      R.toggle('Title decode', 'Game names unscramble into place.', at('fx.scramble')),
      R.toggle('Glitch', 'A split-second glitch when the selection changes.', at('fx.glitch')),
      R.toggle('Shock pulse', 'A ring ripples through the backdrop as you move.', at('fx.pulse')),
      R.toggle('Spinning border', 'A rotating light chases round the selected tile.', at('fx.rgb')),
      heading('SCREEN'),
      R.toggle('Chromatic split', 'Red and cyan fringes on headlines.', at('fx.chroma')),
      R.toggle('CRT scanlines', 'Heavier scanlines with a faint flicker.', at('fx.scan')),
      R.slider('Spark amount', 'How many sparks the pointer and clicks throw.', at('fx.sparks'), 0.3, 4, 0.1, pct),
      heading('PERFORMANCE'),
      R.toggle('Smooth mode', 'Swaps the costliest effects (blurred panels, glow filters, blended textures) for cheap look-alikes. Keeps 144-240 fps.', at('perf.smooth')),
      R.toggle('FPS counter', 'Frame rate of the interface and the backdrop, top left.', at('perf.meter')),
      R.toggle('High-performance GPU', 'Draws the launcher on your dedicated graphics card (NVIDIA) instead of the integrated one. Smoother, uses more battery. Needs a restart.', at('perf.dgpu')),
      R.toggle('Unlock frame rate', 'Lets the launcher draw faster than your monitor (no v-sync). Needs a restart. Can tear.', at('perf.uncapped')),
      heading('SPACE'),
      R.choice('Opening', 'What plays when the launcher opens.', at('fx.bootStyle'), [['space', 'Warp to a planet'], ['bolt', 'Lightning bolt']]),
      R.toggle('Slash wipe', 'Slabs sweep across when minimizing, hiding to the tray and coming back.', at('fx.wipe')),
      R.toggle('Fade the window', 'Hiding to the tray, minimizing and coming back fade the whole window in and out of transparency.', at('fx.fadeWindow')),
      R.toggle('Warp in and out', 'Warps out when hiding to the tray or mini, and back in when HOME returns.', at('fx.space')),
      R.toggle('Away mode', 'Dims and pauses HOME while a game has the focus, with a short re-entry when you come back.', at('fx.focusFx')),
      R.button('Preview opening', '', 'PLAY', () => { while (stack.length) pop(); setTimeout(boot, 300); }),
      heading('LAUNCH'),
      R.choice('Launch transition', 'How the screen wipes when a game starts.', at('fx.launchStyle'), [['slabs', 'Slabs'], ['blinds', 'Blinds'], ['iris', 'Iris'], ['flash', 'Flash']]),
      R.toggle('Warp tunnel', 'Stars streak past while a game starts.', at('fx.warp')),
      R.toggle('Confetti', 'Cannons fire from both corners on launch.', at('fx.confetti')),
      R.toggle('Screen shake', 'A jolt when you hit START.', at('fx.shake')),
      R.button('Preview launch', 'Runs the launch sequence without starting anything.', 'PLAY', () => { launchFx('PREVIEW', 'NOTHING IS STARTING'); setTimeout(endLaunch, 2400); }),
      R.button('Overdrive', 'Ten seconds of everything. Also: ↑ ↑ ↓ ↓ ← → ← →', 'GO', overdrive),
    ];

    if (tab === 'feeds') return SV.rails.rows(rerender);
    if (tab === 'sound') {
      const packs = Object.entries(audio.PACKS).map(([k, p]) => [k, p.name]);
      const ev = (key, label, desc) => R.toggle(label, desc, at('sound.events.' + key));
      const custom = (key, label) => R.file(label, 'Replace with your own audio file.  ← clears it.', at('sound.custom.' + key), 'audio');
      return [
        R.slider('Master volume', 'All launcher sounds.', at('sound.master'), 0, 1, 0.05, pct),
        R.choice('Sound pack', `${packs.length} packs — the timbre of every interface sound.`, at('sound.pack'), packs, () => setTimeout(() => audio.play('pick'), 80)),
        R.button('Preview', 'Play the start-up chime with the current pack.', 'PLAY', () => audio.play('boot')),
        R.button('Preview launch', 'Play the launch sound with the current pack.', 'PLAY', () => audio.play('launch')),
        ev('nav', 'Navigation ticks', 'Moving between items.'),
        ev('confirm', 'Confirm sound', 'Selecting something.'),
        ev('back', 'Back sound', 'Closing or cancelling.'),
        ev('boot', 'Start-up chime', 'Plays with the opening animation.'),
        ev('launch', 'Launch sound', 'Plays when a game starts.'),
        R.slider('Pitch', 'Shifts every interface sound up or down.', at('sound.pitch'), -12, 12, 1, (v) => (v > 0 ? '+' : '') + v + ' st'),
        R.slider('Echo', 'Adds a trailing echo to the sounds.', at('sound.echo'), 0, 1, 0.05, pct),
        R.slider('Ambient hum', 'Low drone under the HOME screen.', at('sound.ambient'), 0, 1, 0.05, pct),
        R.toggle('Controller rumble', 'Vibrate on launch.', at('sound.haptics')),
        R.toggle('Hover sounds', 'The cursor tick also plays when the mouse moves onto a button or tile.', at('sound.hover')),
        R.slider('Hover sound gap', 'Shortest time between two hover ticks, so sweeping the mouse across a row stays clean.', at('sound.hoverGap'), 60, 600, 20, (v) => Math.round(v) + 'ms'),
        R.slider('Hover sound volume', 'How loud the hover tick is next to the other sounds.', at('sound.hoverVolume'), 0.1, 1, 0.05, pct),
        R.slider('Hover settle time', 'How long the pointer has to rest on something before it ticks. Higher = quieter when sweeping.', at('sound.hoverDwell'), 0, 250, 10, (v) => Math.round(v) + 'ms'),
        R.button('Preview slam', 'The impact used by the opening and the wipe.', 'PLAY', () => audio.play('slam')),
        heading('BT3 SOUNDS'),
        R.button('Use the BT3 sounds', 'The real Budokai Tenkaichi 3 menu sounds, pulled from your own ISO into BT3 Modding\Exports\Launcher Sounds.', 'LOAD', () => {
          toast('Loading the BT3 sounds…');
          host.send('soundFolder', { path: 'bt3' });
          host.send('soundLibrary', { path: 'bt3' });
        }),
        R.button('Browse every sound', cfg.sound.library.length ? `${cfg.sound.library.length} sounds — play any of them and pick what it is used for.` : 'Load the BT3 sounds first.', 'BROWSE', () => browseSounds()),
        heading('YOUR OWN SOUNDS'),
        R.button('Load a sound folder', 'Pick a folder of sound files named like the sounds below (nav / cursor / move, confirm / select / ok, back / cancel / return, open, toggle, pick, star, error, slam / hit, boot / intro, launch / start). Each match replaces that sound.', 'PICK FOLDER',
          () => pick('folder').then((f) => { if (f.path) { toast('Reading the folder…'); host.send('soundFolder', { path: f.path }); } })),
        R.button('Clear all custom sounds', 'Back to the sound pack.', 'CLEAR', () => { for (const k of Object.keys(cfg.sound.custom)) cfg.sound.custom[k] = ''; changed(); rerender(); }),
        custom('nav', 'Navigation / cursor'),
        custom('confirm', 'Confirm / click'),
        custom('back', 'Back / return'),
        custom('open', 'Panel opens'),
        custom('toggle', 'Switch / option change'),
        custom('pick', 'Added / picked'),
        custom('star', 'Reward / quest claimed'),
        custom('error', 'Error'),
        custom('slam', 'Slam / impact'),
        custom('boot', 'Start-up'),
        custom('launch', 'Game launch'),
      ];
    }

    if (tab === 'games') {
      const move = (i, d) => {
        const j = i + d;
        if (j < 0 || j >= cfg.games.length) return;
        [cfg.games[i], cfg.games[j]] = [cfg.games[j], cfg.games[i]];
        audio.play('nav'); changed('games'); rerender(j + 3);
      };
      return [
        R.button('Add a game', 'Any .exe, shortcut, steam:// or Epic link.', 'ADD', () => addGame(rerender)),
        R.button('Scan this PC', 'Finds Steam, Epic and Roblox games not on your shelf yet.', 'SCAN', () => openScan(rerender)),
        R.toggle('Hide games that are not installed', 'Keeps your whole Steam library in the list but off the shelf.', at('behavior.hideUninstalled'), () => changed('games')),
        ...cfg.games.map((g, i) => R.buttons(g.name, `${PLATFORM[platformOf(g)]}${isInstalled(g) ? '' : ' · not installed'}   ← → reorders`, [
          ['EDIT', () => openEditor(g, rerender)], ['▲', () => move(i, -1), 'ghost'], ['▼', () => move(i, 1), 'ghost'],
        ], { adjust: (d) => move(i, d) })),
      ];
    }

    if (tab === 'accounts') return [...SV.steam.rows(rerender), ...SV.epic.rows(rerender), ...SV.roblox.rows(rerender)];
    if (tab === 'nexus') return SV.nexus.rows(rerender);
    if (tab === 'developer') return SV.dev.rows(rerender);
    if (tab === 'texts') return [
      heading('WORDING'),
      ...Object.entries(TEXTS).map(([k, [label, fallback]]) => R.text(label, 'Default: ' + fallback, at('texts.' + k), fallback, 'games')),
      R.button('Default wording', 'Put every text back.', 'RESET', () => { cfg.texts = defaults().texts; changed('games'); rerender(); }),
    ];
    if (tab === 'discord') {
      const d = 'discord.';
      return [
        heading('DISCORD RICH PRESENCE'),
        el(`<div class="row-note">Shows what you are playing on your Discord profile, worded your way. Needs the Discord app running and an Application ID: create an application at discord.com/developers (its name is what Discord shows as "Playing …"), then paste its ID here. Words in {braces} fill in: {game} {platform} {account} {count} {profile}.<br>Status: <b class="discord-status">${esc(discordStatus)}</b></div>`),
        R.toggle('Rich Presence', '', at(d + 'enabled'), () => host.send('discordReconnect')),
        R.text('Application ID', 'From discord.com/developers → your application → General Information.', at(d + 'clientId'), '123456789012345678'),
        R.button('Connect now', 'Try again straight away.', 'CONNECT', () => host.send('discordReconnect')),
        heading('WHILE PLAYING'),
        R.text('Top line', '', at(d + 'details'), 'Playing {game}'),
        R.text('Second line', '', at(d + 'state'), 'on {platform}'),
        R.toggle('Show time elapsed', '', at(d + 'elapsed')),
        heading('WHILE IN THE LAUNCHER'),
        R.toggle('Show a status when no game is running', '', at(d + 'idle')),
        R.text('Top line', '', at(d + 'idleDetails'), 'In the launcher'),
        R.text('Second line', '', at(d + 'idleState'), '{count} games ready'),
        heading('PICTURES AND BUTTONS'),
        R.text('Large picture', 'An image link (https://…) or the name of an art asset uploaded to your Discord application.', at(d + 'largeImage'), 'https://…/logo.png'),
        R.text('Large picture text', 'Shown when hovering the picture.', at(d + 'largeText'), '{profile}'),
        R.text('Small picture', '', at(d + 'smallImage'), ''),
        R.text('Small picture text', '', at(d + 'smallText'), ''),
        R.text('Button 1 label', '', at(d + 'button1Label'), 'My website'),
        R.text('Button 1 link', '', at(d + 'button1Url'), 'https://skyvaint.com'),
        R.text('Button 2 label', '', at(d + 'button2Label'), ''),
        R.text('Button 2 link', '', at(d + 'button2Url'), ''),
      ];
    }

    const startChoice = { get: () => (autostart ? cfg.behavior.autostartMode : 'off'), set: (v) => { autostart = v !== 'off'; if (autostart) cfg.behavior.autostartMode = v; host.send('setAutostart', { on: autostart }); } };
    return [
      R.choice('Language', 'The language of the interface. Your game names and own wording stay as they are.', at('language'), SV.i18n.LANGS, () => { changed('games'); rerender(0); }),
      R.text('Profile name', 'Shown in the top bar.', at('profile.name'), 'your name', 'games'),
      R.toggle('Clips on HOME', 'Shows your newest clips of the selected game under its buttons.', at('home.clips'), () => renderHomeClips()),
      R.file('Profile picture', 'Square images work best.  ← clears it.', at('profile.avatar'), 'image'),
      R.choice('After starting a game', 'What the launcher does once the game is launching.', at('behavior.afterLaunch'), [['hidden', 'Hide to tray'], ['mini', 'Shrink to mini'], ['stay', 'Stay open']]),
      R.toggle('Hold the launch screen', 'Keeps the starting screen up until the game window is actually on screen.', at('behavior.waitForGame')),
      R.slider('Longest wait', 'Give up waiting for the game window after this long.', at('behavior.launchWait'), 15, 300, 15, (v) => v + ' s'),
      R.slider('Banner time', 'How long the game banner shows once the game has loaded, before the launcher fades away.', at('behavior.launchSettle'), 0, 8, 0.5, (v) => v.toFixed(1) + ' s'),
      R.choice('When the game closes', 'Only applies to games started from here.', at('behavior.onGameExit'), [['home', 'Return to HOME'], ['none', 'Do nothing']]),
      R.toggle('Ask which account', 'Prompt for an Epic account each time when more than one is saved. Off uses the last one per game.', at('behavior.promptAccount')),
      R.choice('Closing the window', 'Alt + F4 never quits; the launcher keeps running.', at('behavior.closeAction'), [['hidden', 'Hide to tray'], ['mini', 'Shrink to mini']]),
      R.choice('Start with Windows', 'Runs in the background at sign-in.', startChoice, [['off', 'Off'], ['hidden', 'On — in tray'], ['mini', 'On — as mini']]),
      R.toggle('Opening animation', 'Bolt intro when HOME first appears.', at('behavior.bootAnim')),
      R.toggle('Mini stays on top', 'Keep the mini widget above other windows.', at('behavior.miniOnTop')),
      R.choice('Mini size', 'Size of the game tiles in the mini widget.', at('behavior.miniSize'), [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], renderMini),
      R.toggle('24-hour clock', '', at('behavior.clock24')),
      R.button('Reset look and sound', 'Restores theme, backdrop, effects and sound. Games, accounts and clips are kept.', 'RESET', () => confirmMenu('Reset look and sound?', 'RESET', () => {
        const d = defaults();
        Object.assign(cfg, { theme: d.theme, backdrop: d.backdrop, fx: d.fx, sound: d.sound });
        changed('games'); rerender(0); toast('Defaults restored');
      }), true),
      R.button('Quit launcher', 'Closes it completely, including the tray icon.', 'QUIT', () => host.send('quit'), true),
    ];
  }

  function openSettings(first = 'theme') {
    const root = el(`
      <div class="overlay"><div class="sheet">
        <div class="sheet-head"><div><div class="tag">[ CUSTOMIZE ]</div><h2>SETTINGS</h2></div><div class="tabs"></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Change'], ['adjust', 'Adjust'], ['tabs', 'Switch tab'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), tabs = $('.tabs', root);
    let tab = first;
    const p = panel(body, { onTab: (d) => show(TABS[(TABS.findIndex((t) => t[0] === tab) + d + TABS.length) % TABS.length][0]) });

    function show(next, focusIdx = 0) {
      if (next !== tab) audio.play('nav');
      tab = next;
      tabs.innerHTML = TABS.map(([k, label]) => `<button class="tab ${k === tab ? 'on' : ''}" data-k="${k}">${esc(T(label))}</button>`).join('');
      body.replaceChildren(...settingsRows(tab, (i) => { if (root.isConnected) show(tab, i ?? p.idx); }));
      p.focus(focusIdx);
    }
    tabs.addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) show(b.dataset.k); });
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    show(tab);
    push({ el: root, action: p.action });
  }

  // ------------------------------------------------------------------ menus, editor, scan

  function openMenu(title, items, note) {
    const root = el(`<div class="overlay center"><div class="menu"><div class="tag">[ ${esc(T(title))} ]</div>${note ? `<p>${esc(T(note))}</p>` : ''}<div class="menu-list"></div></div></div>`);
    const list = $('.menu-list', root);
    items.forEach((it) => {
      const b = el(`<button class="item ${it.danger ? 'danger' : ''}" data-row><b>${esc(T(it.label))}</b><small>${esc(T(it.sub || ''))}</small></button>`);
      const run = () => { pop(); audio.play('confirm'); it.run && it.run(); };
      b._activate = run;
      b.addEventListener('click', run);
      list.append(b);
    });
    const p = panel(list);
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    push({ el: root, action: p.action });
    p.focus(0);
  }

  const confirmMenu = (title, yes, fn) => openMenu(title, [{ label: 'CANCEL' }, { label: yes, danger: true, run: fn }]);

  // ------------------------------------------------------------------ stopping games and processes

  const stopGame = (g) => confirmMenu(`Stop ${g.name}?`, 'STOP GAME', () => host.send('stopGame', { id: g.id }));

  let tasksView = null;
  function openTasks() {
    if (tasksView) return;
    let all = false, data = { games: [], roblox: [], procs: [] };
    const root = el(`
      <div class="overlay"><div class="sheet">
        <div class="sheet-head"><div><div class="tag">[ RUNNING NOW ]</div><h2>STOP</h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Stop / end'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), p = panel(body);
    const note = (text) => el(`<div class="row-note">${esc(text)}</div>`);
    const ask = () => host.send('tasks', { all });
    const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !cfg.behavior.clock24 });
    const build = () => {
      const rows = [heading('GAMES')];
      if (!data.games.length) rows.push(note('No games running.'));
      data.games.forEach((g) => rows.push(R.buttons(g.name, `${g.count} process${g.count === 1 ? '' : 'es'}`, [
        ['STOP', () => confirmMenu(`Stop ${g.name}?`, 'STOP GAME', () => host.send('stopGame', { id: g.id })), 'danger']])));
      if (data.roblox.length) {
        rows.push(heading('ROBLOX INSTANCES — EACH CLOSES ON ITS OWN'));
        data.roblox.forEach((r) => rows.push(R.buttons(SV.roblox.nameFor(r.account) || 'Started outside the launcher', `PID ${r.pid} · since ${clock(r.started)} · ${r.mem} MB`, [
          ['CLOSE', () => host.send('killProcess', { pid: r.pid }), 'danger']])));
      }
      rows.push(heading(all ? 'EVERY PROCESS' : 'OPEN PROGRAMS'));
      rows.push(R.buttons(all ? 'Showing every process' : 'Showing programs with a window', 'Windows itself is never listed.', [
        [all ? 'PROGRAMS ONLY' : 'SHOW ALL', () => { all = !all; audio.play('toggle'); ask(); }], ['REFRESH', ask, 'ghost']]));
      data.procs.forEach((x) => rows.push(R.buttons(x.title || x.name, `${x.name}.exe · PID ${x.pid} · ${x.mem} MB`, [
        ['END', () => confirmMenu(`End ${x.name}?`, 'END PROCESS', () => host.send('killProcess', { pid: x.pid })), 'danger']])));
      const top = body.scrollTop;
      body.replaceChildren(...rows);
      p.focus(p.idx, false);
      body.scrollTop = top;
    };
    tasksView = { set(d) { data = d; if (isTop(root)) build(); }, ask };
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    const timer = setInterval(() => { if (isTop(root)) ask(); }, 5000);
    push({ el: root, action: p.action, onClose: () => { tasksView = null; clearInterval(timer); } });
    build();
    ask();
  }
  host.on('tasks', (m) => { if (tasksView) tasksView.set(m); });
  host.on('tasksChanged', () => { if (tasksView) tasksView.ask(); });
  host.on('taskResult', (m) => { if (m.ok) { audio.play('back'); toast(m.text); } else { audio.play('error'); toast(m.text, 'bad'); } });

  function openPower() {
    if (SV.title) return SV.title.leave(false);
    openMenu('POWER', [
      { label: 'MINIMIZE', sub: 'Shrink to the mini widget', run: () => leaveTo('mini') },
      { label: 'HIDE TO TRAY', sub: 'Keep running in the background', run: () => leaveTo('hidden') },
      { label: 'STOP GAMES / PROCESSES', sub: 'End a game, one Roblox instance, or any program', run: () => openTasks() },
      ...SV.roblox.powerItems(),
      { label: 'QUIT LAUNCHER', sub: 'Close completely', danger: true, run: () => host.send('quit') },
    ]);
  }

  function removeGame(g, after) {
    confirmMenu(`Remove ${g.name}?`, 'REMOVE', () => {
      cfg.games = cfg.games.filter((x) => x !== g);
      changed('games'); after && after(); toast(g.name + ' removed');
    });
  }

  function openGameMenu(g) {
    // Moves past the neighbour that is actually visible, so a filtered shelf still reorders as it looks.
    const move = (d) => {
      const other = shown[shown.indexOf(g) + d];
      if (!other) return;
      const i = cfg.games.indexOf(g), j = cfg.games.indexOf(other);
      cfg.games.splice(i, 1);
      cfg.games.splice(j, 0, g);
      sel = clamp(sel + d, 0, shown.length - 1);
      changed('games');
    };
    openMenu(g.name, [
      { label: running.has(g.id) ? 'RESUME' : 'START', run: () => launch(g) },
      ...(running.has(g.id) ? [{ label: 'STOP GAME', sub: 'Ends its processes now', danger: true, run: () => stopGame(g) }] : []),
      ...(g.platform === 'epic' ? [{ label: 'CHOOSE ACCOUNT', sub: 'Pick which Epic account to start with', run: () => SV.epic.choose(g, launchAs(g)) }] : []),
      ...(g.platform === 'steam' && SV.steam.accounts.length > 1 ? [{ label: 'STEAM ACCOUNT', sub: 'Which Steam account this game starts on', run: () => SV.steam.choose(g) }] : []),
      { label: 'CLIPS', sub: 'Your clips of ' + g.name, run: () => SV.clips.open(g.name) },
      { label: 'EDIT', sub: 'Name, artwork, colours, launch target', run: () => openEditor(g) },
      { label: 'DETAILS', sub: 'Playtime, store info, screenshots', run: () => SV.details.game(g) },
      { label: 'CHANGE ICON', sub: 'A picture, GIF or MP4 for this game\'s icon', run: () => pick('media').then((f) => { if (f.url) { g.icon = f.url; changed('games'); toast('Icon changed'); } }) },
      { label: 'CHANGE BANNER', sub: 'A picture, GIF or MP4 for the big panel', run: () => pick('media').then((f) => { if (f.url) { g.hero = f.url; changed('games'); toast('Banner changed'); } }) },
      { label: 'ICON FROM A PROGRAM', sub: 'Use the icon of any .exe', run: () => pick('exe').then((f) => { if (f.icon) { g.icon = f.icon; changed('games'); toast('Icon changed'); } }) },
      ...(g.icon ? [{ label: 'DEFAULT ICON', sub: 'Back to the detected icon', run: () => { g.icon = ''; changed('games'); } }] : []),
      { label: 'CHANGE COVER', sub: 'A picture, GIF or MP4 for the tile', run: () => pick('media').then((f) => { if (f.url) { g.cover = f.url; changed('games'); toast('Cover changed'); } }) },
      { label: 'MOVE LEFT', run: () => move(-1) },
      { label: 'MOVE RIGHT', run: () => move(1) },
      { label: 'MOVE TO FRONT', run: () => { cfg.games = [g, ...cfg.games.filter((x) => x !== g)]; sel = 0; changed('games'); } },
      { label: 'ADD TO DESKTOP BAR', sub: 'Pin it to the NEXUS bar', run: () => SV.nexus.addGame(g) },
      { label: 'REMOVE', danger: true, run: () => removeGame(g) },
    ]);
  }

  function openEditor(g, after) {
    const root = el(`
      <div class="overlay"><div class="sheet narrow">
        <div class="sheet-head"><div><div class="tag">[ EDIT GAME ]</div><h2></h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Edit'], ['adjust', 'Adjust'], ['back', 'Done']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), head = $('h2', root);
    const p = panel(body);
    const special = (g.target || '').startsWith('sv:');
    const build = (focusIdx = 0) => {
      head.textContent = g.name || 'NEW GAME';
      const name = R.text('Name', '', prop(g, 'name'), 'Game name', 'games');
      name._input.addEventListener('input', () => { head.textContent = g.name || 'NEW GAME'; });
      body.replaceChildren(
        name,
        R.text('Tagline', 'Short line shown on the feature panel.', prop(g, 'tagline'), 'Optional', 'games'),
        ...(special ? [] : [
          R.text('Launch target', 'Path to an .exe, or a steam:// / Epic link.', prop(g, 'target'), 'C:\\Games\\game.exe'),
          R.button('Browse for a game', 'Pick an .exe or shortcut and fill in the details.', 'BROWSE', () => pick('exe').then((f) => {
            if (!f.path) return;
            Object.assign(g, { target: f.path, process: f.process || g.process, platform: 'pc', icon: f.icon || g.icon || '' });
            if (!g.name) g.name = f.title;
            changed('games'); build(p.idx);
          })),
          R.text('Launch arguments', 'Optional command-line arguments.', prop(g, 'args'), '-windowed'),
        ]),
        R.text('Process name', 'Used to detect when the game is running. Comma-separate several.', prop(g, 'process'), 'Game-Win64-Shipping'),
        R.file('Cover art', 'Tile artwork: a picture, GIF or MP4. DEFAULT uses the official art when there is some.  ← clears it.', prop(g, 'cover'), 'media', 'games'),
        R.file('Banner', 'Wide artwork for the feature panel: a picture, GIF or MP4.  ← clears it.', prop(g, 'hero'), 'media', 'games'),
        R.file('Icon', 'Small badge beside the name: a picture, GIF or MP4.  ← clears it.', prop(g, 'icon'), 'media', 'games'),
        R.button('Find artwork online', 'Looks the game up by name and fills in a cover and banner.', 'SEARCH', () => {
          if (!g.name.trim()) return toast('Give the game a name first.', 'bad');
          toast('Searching for artwork…');
          findArt(g.name).then((a) => {
            if (!a.cover && !a.hero) return toast('No artwork found for that name.', 'bad');
            if (a.cover) g.cover = a.cover;
            if (a.hero) g.hero = a.hero;
            changed('games'); build(p.idx); toast('Artwork added');
          });
        }),
        R.color('Mesh colour 1', 'Used for the generated cover when there is no artwork.', prop(g, 'c1'), () => changed('games')),
        R.color('Mesh colour 2', '', prop(g, 'c2'), () => changed('games')),
        R.button('Remove this game', '', 'REMOVE', () => removeGame(g, () => { pop(); }), true),
      );
      p.focus(focusIdx);
    };
    build();
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    push({ el: root, action: p.action, onClose: () => {
      if (!g.name.trim() && !g.target) cfg.games = cfg.games.filter((x) => x !== g); // abandoned blank entry
      changed('games'); after && after();
    } });
  }

  function addGame(after) {
    const g = { id: 'game_' + Date.now().toString(36), name: '', platform: 'pc', target: '', args: '', process: '', tagline: '', cover: '', hero: '', icon: '', c1: cfg.theme.accent, c2: cfg.theme.accent2 };
    cfg.games.push(g);
    filter = 'all';
    renderHome();
    sel = cfg.games.length - 1;
    openEditor(g, after);
  }

  const known = (s) => cfg.games.some((g) => g.scanId === s.scanId || g.target === s.target);
  function fromScan(s) {
    const c = COLOURS[s.scanId] || [shiftHue(cfg.theme.accent, hash(s.name) % 360), shiftHue(cfg.theme.accent2, hash(s.scanId) % 360)];
    const { installed, owners, ...rest } = s; // facts about this PC right now, not something to store
    return { id: s.scanId, args: '', tagline: TAGLINES[s.scanId] || '', cover: '', hero: '', icon: '', c1: c[0], c2: c[1], ...rest };
  }

  let scanWaiter = null;
  function openScan(after) {
    scanWaiter = () => {
      const fresh = scan.filter((s) => !known(s));
      if (!fresh.length) return toast(scan.length ? 'Every detected game is already in your library.' : 'No Steam, Epic or Roblox games detected.');
      const add = (list) => {
        list.forEach((s) => cfg.games.push(fromScan(s)));
        changed('games'); after && after();
        toast(list.length === 1 ? list[0].name + ' added' : `${list.length} games added`);
      };
      openMenu('DETECTED GAMES', [
        ...(fresh.length > 1 ? [{ label: `ADD ALL ${fresh.length}`, sub: 'Everything below', run: () => add(fresh) }] : []),
        ...fresh.map((s) => ({ label: s.name, sub: PLATFORM[s.platform] + (s.installed === false ? ' · not installed' : ''), run: () => add([s]) })),
      ], 'Pick a game to add it to your shelf.');
    };
    if (host.native) host.send('rescan'); else { scanWaiter(); scanWaiter = null; }
  }
  // A Steam account seen for the first time (another person signed in on this PC) brings its games onto the shelf,
  // installed ones first. Each account is imported once, so games removed from the shelf afterwards stay removed.
  function importSteamAccounts() {
    const done = cfg.imported.steamAccounts || (cfg.imported.steamAccounts = []);
    const steam = scan.filter((s) => s.platform === 'steam');
    let added = 0;
    for (const id of new Set(steam.flatMap((s) => s.owners || []))) {
      if (done.includes(id)) continue;
      const mine = steam.filter((s) => (s.owners || []).includes(id) && !known(s));
      [...mine.filter((s) => s.installed !== false), ...mine.filter((s) => s.installed === false)].forEach((s) => cfg.games.push(fromScan(s)));
      added += mine.length;
      done.push(id);
    }
    return added;
  }

  // Brings in each store's games the first time the scan finds any (installed ones first). Runs at start-up and
  // after every scan, so installing Steam or Epic later and signing in fills the shelf without any setup.
  function autoImport() {
    let added = 0;
    const take = (list) => list.filter((s) => !known(s)).forEach((s) => { cfg.games.push(fromScan(s)); added++; });
    for (const k of ['roblox', 'epic', 'steam']) {
      const found = scan.filter((s) => s.platform === k);
      if (cfg.imported[k] || !found.length) continue;
      take([...found.filter((s) => s.installed !== false), ...found.filter((s) => s.installed === false)]);
      cfg.imported[k] = true;
    }
    return added + importSteamAccounts();
  }

  host.on('scan', (m) => {
    scan = m.scan || [];
    const added = autoImport();
    if (added) { save(); toast(added === 1 ? 'Found 1 new game on this PC' : `Found ${added} new games on this PC`); }
    if (scanWaiter) { scanWaiter(); scanWaiter = null; }
    else if ((m.art || added) && !launching) { renderHome(); renderMini(); } // artwork finished downloading, or new games
  });

  function findArt(name) {
    const token = Math.random().toString(36).slice(2);
    return new Promise((resolve) => { picks[token] = resolve; host.send('findArt', { token, name }); });
  }
  host.on('artFound', (m) => { const done = picks[m.token]; delete picks[m.token]; done && done(m); });

  // Puts a game in front of you on the shelf, clearing the platform filter so it is there to select.
  function jumpTo(g) {
    filter = 'all';
    sub = null;
    renderHome();
    const i = shown.indexOf(g);
    if (i < 0) return toast(g.name + ' is hidden because it is not installed.', 'bad');
    zone = 'shelf';
    select(i);
  }

  // ------------------------------------------------------------------ quick search

  // Ranks a name against what was typed: name starts with it, then a word does, then anywhere in it, then the
  // letters in order (so "cs2" finds Counter-Strike 2 and "rl" Rocket League). -1 is no match.
  function matchScore(name, q) {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 400 - n.length;
    if (n.split(/[\s\-_:.]+/).some((w) => w.startsWith(q))) return 300 - n.length;
    if (n.includes(q)) return 200 - n.indexOf(q);
    let i = 0;
    for (const c of n) if (c === q[i]) i++;
    return i === q.length ? 100 - n.length : -1;
  }

  function openSearch() {
    const root = el(`
      <div class="overlay center"><div class="menu search">
        <div class="tag">[ FIND A GAME ]</div>
        <input class="text" type="text" spellcheck="false" placeholder="Type a game name…">
        <div class="menu-list"></div>
        <div class="hints">${hints([['confirm', 'Go to it'], ['back', 'Close']])}<span class="hint"><kbd>SHIFT + ENTER</kbd>Start now</span></div>
      </div></div>`);
    const box = $('input', root), list = $('.menu-list', root), p = panel(list);
    const pool = () => cfg.games.filter((g) => !(cfg.behavior.hideUninstalled && !isInstalled(g)));
    const go = (g, start) => {
      if (isTop(root)) pop();
      jumpTo(g);
      if (start) launch(g); else audio.play('confirm');
    };
    let hits = [];
    const refresh = () => {
      const q = box.value.trim().toLowerCase();
      // Nothing typed yet: what you played most recently.
      hits = q
        ? pool().map((g) => [g, matchScore(g.name || '', q)]).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1]).map((x) => x[0])
        : pool().filter((g) => (stats[g.id] || {}).lastPlayed).sort((a, b) => stats[b.id].lastPlayed - stats[a.id].lastPlayed);
      hits = hits.slice(0, 8);
      list.replaceChildren(...hits.map((g) => {
        const state = running.has(g.id) ? 'RUNNING' : isInstalled(g) ? 'LAST PLAYED ' + lastPlayed((stats[g.id] || {}).lastPlayed) : 'NOT INSTALLED';
        const b = el(`<button class="item hit" data-row><span class="hit-art">${art(g, 'cover')}</span>
          <span class="hit-txt"><b>${esc(g.name)}</b><small>${PLATFORM[platformOf(g)]} · ${state}</small></span></button>`);
        b._activate = () => go(g);
        b.addEventListener('click', (e) => go(g, e.shiftKey));
        return b;
      }));
      if (!hits.length) list.append(el(`<div class="row-note">${q ? `No game matches “${esc(box.value.trim())}”.` : 'Start typing to find a game.'}</div>`));
      p.focus(0, false);
    };
    // The box keeps the keyboard, so the arrows, ENTER and ESC are handled here rather than by input.js.
    box.addEventListener('keydown', (e) => {
      const move = { ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      if (!move && e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (move) p.action(move);
      else if (e.key === 'Escape') pop();
      else if (hits[p.idx]) go(hits[p.idx], e.shiftKey);
      else audio.play('error');
    });
    box.addEventListener('input', refresh);
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    push({ el: root, action: p.action });
    refresh();
    box.focus();
  }

  // ------------------------------------------------------------------ roulette

  // Can't decide: spins along the shelf, slowing down, and lands on a random installed game.
  let rolling = false;
  function roll() {
    if (rolling || launching || stack.length) return;
    let pool = shown.map((g, i) => i).filter((i) => !shown[i].setup && isInstalled(shown[i]));
    if (pool.length > 1) pool = pool.filter((i) => i !== sel); // always land somewhere new
    if (!pool.length) { audio.play('error'); return toast('Nothing installed on this shelf to pick from.', 'bad'); }

    const n = shown.length, target = pool[Math.floor(Math.random() * pool.length)], steps = 16 + Math.floor(Math.random() * 6);
    let i = ((target - steps) % n + n) % n, k = 0;
    const stop = () => { rolling = false; document.body.classList.remove('rolling'); };
    rolling = true;
    zone = 'shelf';
    document.body.classList.add('rolling');
    select(i, true);
    const spin = () => {
      if (mode !== 'home' || stack.length || launching) return stop();
      i = (i + 1) % n;
      k++;
      select(i, true);
      audio.play('nav');
      if (k < steps) return setTimeout(spin, 40 + 300 * (k / steps) ** 3);
      stop();
      const g = shown[i], tile = $('#tiles .tile.on');
      audio.play('pick');
      input.rumble(0.5, 160);
      bg.strike();
      if (cfg.fx.pulse) bg.pulse(0.14, 0.3, 1);
      if (tile) { const b = tile.getBoundingClientRect(); fx.burst(b.left + b.width / 2, b.top + b.height / 2, 1.3); }
      scramble($('#gTitle'), g.name);
      toast(`${g.name} — ENTER to start, R to roll again`);
    };
    setTimeout(spin, 60);
  }

  // ------------------------------------------------------------------ playtime

  function openPlaytime() {
    const root = el(`
      <div class="overlay"><div class="sheet">
        <div class="sheet-head"><div><div class="tag">[ YOUR LIBRARY ]</div><h2>PLAYTIME</h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Go to game'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), p = panel(body);
    const sec = (g) => (stats[g.id] || {}).seconds || 0;
    const played = cfg.games.filter((g) => sec(g) > 0).sort((a, b) => sec(b) - sec(a));
    const total = played.reduce((s, g) => s + sec(g), 0), most = played.length ? sec(played[0]) : 1;
    const week = Date.now() - 7 * 864e5;
    const summary = el(`<div class="pt-summary">${[
      ['TOTAL PLAYTIME', playtime(total)],
      ['GAMES PLAYED', `${played.length} / ${cfg.games.length}`],
      ['MOST PLAYED', played[0] ? played[0].name : '—'],
      ['PLAYED THIS WEEK', String(cfg.games.filter((g) => ((stats[g.id] || {}).lastPlayed || 0) > week).length)],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`);
    const rows = played.map((g, i) => {
      const bar = el(`<div class="pt-bar"><i style="--w:${(sec(g) / most * 100).toFixed(1)}%"></i><span>${playtime(sec(g))}</span></div>`);
      const open = () => { while (stack.length) pop(); jumpTo(g); };
      const r = row(`${String(i + 1).padStart(2, '0')}   ${g.name}`,
        `${PLATFORM[platformOf(g)]} · ${Math.max(1, Math.round(sec(g) / total * 100))}% of all play · last played ${lastPlayed((stats[g.id] || {}).lastPlayed).toLowerCase()}`,
        bar, { activate: open });
      r.addEventListener('click', open);
      return r;
    });
    body.replaceChildren(summary, heading('MOST PLAYED'), ...(rows.length ? rows : [el('<div class="row-note">Nothing played yet. Start a game and its time shows up here.</div>')]),
      el('<div class="row-note">Time is counted while the launcher sees a game\'s process running.</div>'));
    root.addEventListener('mousedown', (e) => { if (e.target === root) pop(); });
    push({ el: root, action: p.action });
    p.focus(0);
  }

  // ------------------------------------------------------------------ overdrive (easter egg)

  function overdrive() {
    while (stack.length) pop();
    document.body.classList.add('overdrive');
    audio.play('boot');
    toast('OVERDRIVE');
    const beat = setInterval(() => { bg.strike(); fx.burst(Math.random() * innerWidth, Math.random() * innerHeight, 1.4); bg.pulse(Math.random(), Math.random(), 1.2); }, 320);
    fx.confetti();
    setTimeout(() => { clearInterval(beat); document.body.classList.remove('overdrive'); }, 10000);
  }
  const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];
  let konami = 0;

  // ------------------------------------------------------------------ input routing

  input.onAction = (a) => {
    if (mode !== 'home' || document.body.classList.contains('booting')) return;
    konami = a === KONAMI[konami] ? konami + 1 : a === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) { konami = 0; if (!document.body.classList.contains('overdrive')) return overdrive(); }
    if (launching) { if (a === 'back' || a === 'confirm') host.send('launchSkip'); return; }
    if (a === 'mini') {
      if (launching) return;
      while (stack.length) pop();
      return leaveTo('mini');
    }
    if (stack.length) stack[stack.length - 1].action(a);
    else homeAction(a);
  };
  SV.onPad = (on, id) => toast(on ? 'Controller connected' + (id ? ' — ' + id.split('(')[0].trim() : '') : 'Controller disconnected');

  // ------------------------------------------------------------------ boot + mode

  let introPlayed = false;
  function boot() {
    const body = document.body;
    body.classList.remove('preinit');
    // Your own intro video plays first, then the normal opening (or straight to HOME if that is off).
    if (mode === 'home' && cfg.fx.introVideo && !introPlayed && SV.effects) { introPlayed = true; return SV.effects.intro(cfg.fx.introVideo, boot); }
    if (mode !== 'home' || !cfg.behavior.bootAnim) { body.classList.add('entered'); return; }
    $('#bootName').innerHTML = [...cfg.texts.brand].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
    $('#bootWelcome').textContent = cfg.texts.welcome ? `${cfg.texts.welcome}, ${cfg.profile.name}`.toUpperCase() : '';
    // Space opening: a warp through the stars to a planet rising over the horizon, then the name.
    if (cfg.fx.bootStyle === 'space' && cfg.backdrop.motion) {
      body.classList.add('booting', 'boot-space');
      audio.play('boot');
      SV.space.play('boot');
      setTimeout(() => body.classList.add('boot-name-in'), 1150);
      setTimeout(() => { bg.stormStrike(); bg.strike(); }, 1300);
      setTimeout(() => { body.classList.add('boot-out', 'entered'); }, 2700);
      setTimeout(() => { body.classList.remove('booting', 'boot-out', 'boot-space', 'boot-name-in'); }, 3300);
      return;
    }
    body.classList.add('booting');
    audio.play('boot');
    setTimeout(() => bg.strike(), 700);
    setTimeout(() => bg.strike(), 1500);
    setTimeout(() => { body.classList.add('boot-out', 'entered'); }, 2500);
    setTimeout(() => { body.classList.remove('booting', 'boot-out'); }, 3200);
  }

  function setMode(m) {
    const was = mode;
    mode = m;
    document.body.dataset.mode = m === 'home' ? 'home' : 'mini';
    bg.setActive(m === 'home');
    audio.setAmbientActive(m === 'home');
    input.setEnabled(m === 'home');
    fit();
    endLaunch();
    applyCalm();
    if (m !== 'home') SV.clips.pause();
    if (m === 'home' && was !== 'home') {
      document.body.classList.remove('entered');
      void document.body.offsetWidth;
      document.body.classList.add('entered'); // replay the entrance
      if (cfg.fx.wipe) SV.title.reveal();
      else if (cfg.fx.space && cfg.backdrop.motion && !document.body.classList.contains('booting')) SV.space.play('arrive');
      audio.play('open');
      if (pendingLaunch) { const g = pendingLaunch; pendingLaunch = null; setTimeout(() => launch(g), 350); }
    }
  }

  // Brings a saved config up to the current shape and pulls in what the scan found, once per source.
  function upgrade(saved) {
    const from = saved ? saved.v || 1 : 3;
    if (from < 2) cfg.behavior.afterLaunch = 'hidden'; // 2.0: starting a game sends the launcher to the tray
    // 2.1: backdrop layers went from on/off switches to levels; keep whatever was switched off, off.
    if (from < 3 && saved.backdrop) for (const k of LAYERS) if (saved.backdrop[k] === false) cfg.backdrop.levels[k] = 0;
    // 2.2: the backdrop moves to the skyvaint.com look (storm, art, arcs) and gets the space transitions.
    if (from < 4) applyBackdrop('website');
    // 2.3: the backdrop draws in a worker and follows the display's own rate, with its resolution adapting itself.
    if (from < 5) { cfg.backdrop.quality = 'auto'; cfg.backdrop.fps = 0; cfg.backdrop.slowFps = 60; cfg.sound.pack = 'tenkaichi'; }
    // 2.4: no more built-in games. Drop the old starter entries from shelves on PCs that don't have those games
    // (not found by the scan, never played, no picture chosen). Libraries that already hold Epic games were
    // picked by hand, so the new Epic import leaves them alone.
    if (saved && from < 6) {
      cfg.games = cfg.games.filter((g) => {
        const scanId = OLD_STARTERS[g.id];
        if (!scanId || g.scanId !== scanId) return true;
        return scan.some((s) => s.scanId === scanId) || ((stats[g.id] || {}).seconds || 0) > 0 || g.cover || g.hero;
      });
      if (cfg.games.some((g) => g.platform === 'epic')) cfg.imported.epic = true;
    }
    cfg.v = 6;
    // Configs from before per-account import: whichever Steam accounts already have games on the shelf count as done.
    if (!cfg.imported.steamAccounts)
      cfg.imported.steamAccounts = [...new Set(scan.filter((s) => s.platform === 'steam' && known(s)).flatMap((s) => s.owners || []))];
    let added = autoImport();
    // Scanned artwork is looked up live (see artSrc), so only pictures the user picked are kept in the config.
    for (const g of cfg.games) {
      const s = scanOf(g);
      if (s) for (const k of ['cover', 'hero', 'icon']) if (g[k] && g[k] === s[k]) g[k] = '';
    }
    return added;
  }

  host.on('init', (m) => {
    scan = m.scan || [];
    stats = m.stats || {};
    autostart = !!m.autostart;
    cfg = merge(defaults(), m.config || {});
    if (m.config && Array.isArray(m.config.games)) cfg.games = m.config.games;
    const added = upgrade(m.config);
    SV.epic.init(m.epic);
    SV.steam.init(m.steam);
    const imported = SV.roblox.init(m.robloxImport);
    mode = m.mode || 'home';
    document.body.dataset.mode = mode === 'home' ? 'home' : 'mini';
    applyConfig();
    renderHome();
    renderMini();
    bg.setActive(mode === 'home');
    audio.setAmbientActive(mode === 'home');
    input.setEnabled(mode === 'home');
    save();
    applyLogo();
    host.send('appIcon');
    boot();
    setTimeout(() => { SV.clips.ensure(); SV.quests.badge(); }, 3600);
    if (added) setTimeout(() => toast(`${added} games found on this PC`), 3400);
    else if (!cfg.games.length) setTimeout(() => toast('No games found yet — link Steam or Epic, or add any game yourself.'), 3400);
    if (imported) setTimeout(() => toast('Roblox manager accounts and places brought over'), 4200);
  });
  host.on('mode', (m) => setMode(m.mode));
  // Leaving HOME by other means (tray, hotkey, closing the window): the shell waits for this warp-out.
  host.on('leave', () => { if (mode === 'home') SV.title.slash(() => { if (cfg.fx.space) softLeave(); }, 60); });
  // Alt-tabbing to a game dims and pauses HOME; coming back plays a short re-entry.
  // Coming back after installing or signing in to a store: look again, so its games appear without a restart.
  const setupShown = () => mode === 'home' && !sub && shown.some((g) => g.setup);
  for (const t of ['steamState', 'epicState']) host.on(t, () => setTimeout(() => { if (setupShown() && !stack.length && !launching) { const keep = sel; renderHome(); select(keep, true); } }, 0));
  host.on('focus', (m) => {
    if (m.on && setupShown()) rescanStores(true);
    if (!cfg.fx.focusFx || mode !== 'home') return;
    document.body.classList.toggle('away', !m.on);
    bg.setActive(m.on);
    if (m.on && cfg.backdrop.motion) SV.space.play('refocus');
  });
  host.on('soundLibrary', (m) => { cfg.sound.library = m.sounds || []; save(); });

  // The sound browser: groups, then every sound in the group; choosing one plays it and offers what to use it for.
  const SOUND_USES = [['nav', 'Navigation / cursor'], ['confirm', 'Confirm / click'], ['back', 'Back / return'], ['open', 'Panel opens'], ['toggle', 'Switch / option'],
    ['pick', 'Added / picked'], ['star', 'Reward / quest'], ['error', 'Error'], ['slam', 'Slam / wipe'], ['boot', 'Start-up'], ['launch', 'Game launch']];
  function browseSounds() {
    const lib = cfg.sound.library || [];
    if (!lib.length) { audio.play('error'); return toast('Load the BT3 sounds first.', 'bad'); }
    const groups = [['SE_System', 'MENU SOUNDS', 'Cursor, select, cancel — what the menus use'], ['SE_Progress', 'SCREEN SOUNDS', 'Transitions, results, unlocks'], ['SE_Battle', 'BATTLE SOUNDS', 'Hits, ki blasts, impacts'], ['', 'OTHER', 'Anything else in the folder']];
    const inGroup = (key) => lib.filter((s) => (key ? s.name.startsWith(key) : !groups.some(([k]) => k && s.name.startsWith(k))));
    openMenu('SOUNDS', groups.filter(([k]) => inGroup(k).length).map(([k, label, sub]) => ({
      label: `${label} · ${inGroup(k).length}`, sub,
      run: () => setTimeout(() => openMenu(label, inGroup(k).map((s) => {
        const used = SOUND_USES.filter(([e]) => cfg.sound.custom[e] === s.url).map(([, l]) => l.split(' /')[0]);
        return { label: s.name.replace(/^SE_\w+?_/, '#'), sub: `${s.secs ? s.secs + 's' : ''}${used.length ? ' · USED FOR ' + used.join(', ').toUpperCase() : ''}`, run: () => soundMenu(s) };
      }), 'Enter plays it and shows what it can be used for.'), 60),
    })), 'Every sound from the folder, grouped the way the game stores them.');
  }
  function soundMenu(s) {
    audio.preview(s.url);
    setTimeout(() => openMenu(s.name, [
      { label: '▶ PLAY AGAIN', run: () => { audio.preview(s.url); setTimeout(() => soundMenu(s), 60); } },
      ...SOUND_USES.map(([e, label]) => ({ label: 'USE AS: ' + label.toUpperCase(), sub: cfg.sound.custom[e] === s.url ? 'already' : '', run: () => { cfg.sound.custom[e] = s.url; changed(); toast(`${s.name} is now the ${label.toLowerCase()} sound`); } })),
    ]), 60);
  }

  host.on('soundFolder', (m) => {
    const files = m.files || {}, keys = Object.keys(files);
    if (!keys.length) { audio.play('error'); return toast('No sound files with matching names were found in that folder.', 'bad'); }
    Object.assign(cfg.sound.custom, files);
    changed();
    audio.play('pick');
    toast(`${keys.length} sound${keys.length > 1 ? 's' : ''} loaded: ${keys.join(', ')}`);
  });
  // Hover sounds: the cursor tick when the mouse lands on something you can pick.
  // Mouse hover ticks. Controllers and keys move one step at a time, but a mouse crosses ten buttons in a second,
  // so a hover only ticks once the pointer settles on something (it isn't just passing over), and ticks are quiet,
  // spaced out and capped per second. Tiles sliding under a still pointer never tick.
  let hoverEl = null, hoverAt = 0, movedAt = 0, mx = -1, my = -1, dwell = 0, recent = [];
  document.addEventListener('mousemove', (e) => {
    if (Math.abs(e.clientX - mx) + Math.abs(e.clientY - my) < 3) return;
    mx = e.clientX; my = e.clientY; movedAt = performance.now();
  }, { passive: true });
  document.addEventListener('mouseover', (e) => {
    if (!cfg.sound.hover || mode !== 'home') return;
    const t = e.target.closest('.btn, .func, .tile, [data-row], [data-card], .pcard, .ts-item, .lv-btn, .rail-card, .chip, .hc, .qc, .q-card, .mt, .hint[data-act]');
    if (!t || t === hoverEl) return;
    hoverEl = t;
    clearTimeout(dwell);
    if (performance.now() - movedAt > 80) return;
    dwell = setTimeout(() => {
      const now = performance.now();
      if (hoverEl !== t || !t.matches(':hover')) return;
      recent = recent.filter((x) => now - x < 1000);
      if (now - hoverAt < (cfg.sound.hoverGap ?? 220) || recent.length >= 4) return;
      hoverAt = now;
      recent.push(now);
      audio.play('hover', cfg.sound.hoverVolume ?? 0.6);
    }, cfg.sound.hoverDwell ?? 70);
  }, { passive: true });
  host.on('notice', (m) => { audio.play(m.ok ? 'pick' : 'error'); toast(m.text, m.ok ? '' : 'bad'); });
  let discordStatus = 'Off';
  host.on('discordStatus', (m) => { discordStatus = m.status; const n = document.querySelector('.discord-status'); if (n) n.textContent = m.status; });
  host.on('running', (m) => { running = new Set(m.ids || []); if (m.stats) stats = m.stats; updateRunning(); });
  host.on('stats', (m) => { stats = { ...stats, ...m.stats }; renderStats(); SV.quests.refresh(); });
  host.on('launchFailed', (m) => {
    audio.play('error');
    toast('Could not start: ' + m.error, 'bad');
    const now = $('#lfSteps .lf-step.now');
    if (!launching || !now) return endLaunch();
    // Leave the failed step on screen long enough to read which one it was.
    now.classList.replace('now', 'bad');
    $('#launchfx').classList.remove('waiting');
    $('#lfStatus').textContent = m.error;
    fx.warp(false);
    setTimeout(endLaunch, 3200);
  });
  host.on('requestLaunch', (m) => { const g = cfg.games.find((x) => x.id === m.id); if (g) { while (stack.length) pop(); setTimeout(() => launch(g), 300); } });

  SV.app = {
    get cfg() { return cfg; },
    get mode() { return mode; },
    get launching() { return launching; },
    $, el, esc, clamp, hash, shiftHue, meshSVG, toast, hints, at, prop, lastPlayed, T,
    stack, push, pop, isTop, panel, row, heading, R, pick, ask, openMenu, confirmMenu, changed, save, openSettings, leaveTo, openTasks, refreshList, launchDirect, exitList,
    get inList() { return !!sub; },
    launchFx, endLaunch, armLaunchTimeout, renderStats, renderActions, artSrc, scanOf, isInstalled, launch, jumpTo, playtime,
    get running() { return running; },
    get stats() { return stats; },
  };
})();

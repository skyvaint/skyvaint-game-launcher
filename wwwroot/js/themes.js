// Themes and the SHOP. A theme is your whole look (colours, fonts, backdrop, effects, sounds, layout) saved under a
// name. Keep as many as you like and swap between them; the look you had before is always one click away. Any
// theme turns into a code you can send to someone, and a code turns back into a theme. The SHOP (top bar) has
// featured themes, the community's (a list on GitHub), your library, and a box for a code.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, hints, meshSVG, R, heading } = A;
  const KEYS = ['theme', 'backdrop', 'fx', 'sound', 'layout', 'home'];
  const CATALOG = 'https://raw.githubusercontent.com/skyvaint/skyvaint-game-launcher/main/themes/catalog.json';
  const T = () => { const c = A.cfg; c.themes = c.themes || {}; c.themes.library = c.themes.library || []; return c.themes; };
  const newId = () => Math.random().toString(36).slice(2, 10);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---- taking and putting back a look

  function snapshot() { const s = {}; for (const k of KEYS) if (A.cfg[k]) s[k] = clone(A.cfg[k]); return s; }

  function merge(into, from) {
    for (const [k, v] of Object.entries(from)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && into[k] && typeof into[k] === 'object' && !Array.isArray(into[k])) merge(into[k], v);
      else into[k] = clone(v);
    }
  }
  function put(look) {
    for (const k of KEYS) {
      if (!look[k]) continue;
      A.cfg[k] = A.cfg[k] || {};
      // A backdrop with its own layer mix starts from all layers off, so the old mix doesn't leak in.
      if (k === 'backdrop' && look.backdrop.levels && A.cfg.backdrop.levels) for (const l of Object.keys(A.cfg.backdrop.levels)) A.cfg.backdrop.levels[l] = 0;
      merge(A.cfg[k], look[k]);
    }
  }

  /// Applies a theme; the look you had is kept as "previous" so you can go straight back.
  function apply(th) {
    const t = T();
    t.previous = { name: 'Your look before ' + th.name, data: snapshot(), at: Date.now() };
    put(th.data);
    t.current = th.id || '';
    audio.play('pick');
    A.changed('games');
    toast(th.name + ' is on · BACK in the SHOP returns to your previous look');
  }
  function back() {
    const t = T();
    if (!t.previous) return toast('No previous look yet.');
    const prev = t.previous;
    t.previous = { name: 'The look you just left', data: snapshot(), at: Date.now() };
    put(prev.data);
    t.current = '';
    audio.play('back');
    A.changed('games');
    toast('Back to ' + prev.name.replace(/^Your look before /, 'your look before '));
  }

  function saveCurrent(after) {
    A.ask({ tag: 'THEMES', title: 'SAVE THIS LOOK', label: 'Theme name', placeholder: 'Midnight', button: 'SAVE', done: (name) => {
      const t = T();
      const th = { id: newId(), name: name.trim(), by: A.cfg.profile.name || '', data: snapshot(), at: Date.now() };
      t.library.unshift(th);
      t.current = th.id;
      A.save(); audio.play('confirm'); toast(th.name + ' saved to your themes'); after && after();
    } });
  }

  // ---- codes: SVT1.<base64url of the compressed theme>

  // Pictures and sounds you picked live on your PC only, so a shared code leaves them out.
  const local = (v) => typeof v === 'string' && /media\.skyvaint\.example/.test(v);
  function portable(data) {
    const strip = (o) => { for (const [k, v] of Object.entries(o)) { if (local(v)) o[k] = ''; else if (Array.isArray(v)) o[k] = v.filter((x) => !local(x) && !(x && typeof x === 'object' && Object.values(x).some(local))); else if (v && typeof v === 'object') strip(v); } return o; };
    return strip(clone(data));
  }
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function toCode(th) {
    const json = JSON.stringify({ n: th.name, b: th.by || '', d: portable(th.data) });
    const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
    let s = ''; for (let i = 0; i < packed.length; i += 0x8000) s += String.fromCharCode(...packed.subarray(i, i + 0x8000));
    return 'SVT1.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function fromCode(code) {
    const m = String(code).trim().match(/SVT1\.([A-Za-z0-9_-]+)/);
    if (!m) throw new Error("That isn't a theme code (they start with SVT1.)");
    const json = new TextDecoder().decode(await pipe(unb64(m[1]), new DecompressionStream('deflate-raw')));
    const o = JSON.parse(json);
    const data = {};
    for (const k of KEYS) if (o.d && o.d[k] && typeof o.d[k] === 'object') data[k] = o.d[k];
    if (!Object.keys(data).length) throw new Error('That code has no look in it.');
    return { id: newId(), name: String(o.n || 'Shared theme').slice(0, 40), by: String(o.b || '').slice(0, 30), data, at: Date.now() };
  }
  const copy = (text) => { try { navigator.clipboard.writeText(text); } catch {} };

  async function share(th) {
    const code = await toCode(th);
    copy(code);
    A.openMenu('SHARE ' + th.name.toUpperCase(), [
      { label: 'CODE COPIED', sub: code.length > 90 ? code.slice(0, 90) + '…' : code, run: () => { copy(code); toast('Copied again'); } },
      { label: 'PUT IT IN THE COMMUNITY SHOP', sub: 'Opens a GitHub page with your code filled in; you press submit', run: () => {
        const url = 'https://github.com/skyvaint/skyvaint-game-launcher/issues/new?labels=theme&title=' + encodeURIComponent('Theme: ' + th.name) + '&body=' + encodeURIComponent(`Theme for the SHOP\n\n${code}`);
        if (url.length > 7800) return toast('This theme is too big for a link; paste the code on GitHub yourself.', 'bad');
        host.send('openUrl', { url });
      } },
    ], 'Anyone can paste the code in SHOP → INSERT A CODE. Pictures and sounds from your PC stay out of it.');
  }
  function insertCode(after) {
    A.ask({ tag: 'SHOP', title: 'INSERT A CODE', label: 'Theme code', placeholder: 'SVT1.…', button: 'GET', done: async (code) => {
      try {
        const th = await fromCode(code);
        T().library.unshift(th); A.save();
        A.openMenu(th.name.toUpperCase(), [{ label: 'APPLY NOW', run: () => apply(th) }, { label: 'KEEP FOR LATER', run: () => {} }], `Added to your themes${th.by ? ' · by ' + th.by : ''}.`);
        after && after();
      } catch (e) { audio.play('error'); toast(e.message || 'That code did not work', 'bad'); }
    } });
  }

  // ---- featured themes (built in) and the community list

  const look = (accent, accent2, bg, extra = {}) => ({ theme: { accent, accent2, bg, ...(extra.theme || {}) }, ...(extra.backdrop ? { backdrop: extra.backdrop } : {}), ...(extra.fx ? { fx: extra.fx } : {}) });
  const FEATURED = [
    { id: 'f-crimson', name: 'Crimson Strike', by: 'Skyvaint', data: look('#ff1f1f', '#ff7a1a', '#070505', { backdrop: { style: 'storm', levels: { storm: 2.2, rain: 1.4, art: 0.6, embers: 0.3 } } }) },
    { id: 'f-neon', name: 'Neon Night', by: 'Skyvaint', data: look('#a970ff', '#00e5ff', '#06040d', { backdrop: { style: 'cosmos', levels: { stars: 1.6, aurora: 1, comets: 1.4, plexus: 0.6, art: 0.5 } }, fx: { rgb: true, bloom: true } }) },
    { id: 'f-arctic', name: 'Arctic', by: 'Skyvaint', data: look('#5ce1ff', '#e8f6ff', '#04070b', { backdrop: { levels: { snow: 1.2, aurora: 0.8, art: 0.6 } }, fx: { glitch: false } }) },
    { id: 'f-gold', name: 'Gold Rush', by: 'Skyvaint', data: look('#ffcc33', '#ff7a00', '#0a0703', { backdrop: { levels: { embers: 1.2, bokeh: 0.8, art: 0.7 } } }) },
    { id: 'f-toxic', name: 'Toxic', by: 'Skyvaint', data: look('#39ff14', '#00ffa3', '#040805', { backdrop: { levels: { matrix: 1, plexus: 0.6, art: 0.5 } } }) },
    { id: 'f-mono', name: 'Clean Mono', by: 'Skyvaint', data: look('#f2f2f2', '#8d8d8d', '#060606', { fx: { glitch: false, rgb: false, scramble: false, trail: false, ripple: false, dust: false, sweep: false, shake: false, confetti: false } }) },
  ];
  let community = null, communityState = '';
  async function loadCommunity() {
    if (community || communityState === 'loading') return;
    communityState = 'loading';
    try {
      const r = await fetch(CATALOG + '?t=' + Math.floor(Date.now() / 3.6e6), { cache: 'no-store' });
      const list = r.ok ? await r.json() : [];
      community = [];
      for (const it of (Array.isArray(list) ? list : list.themes || []).slice(0, 60)) {
        try { const th = await fromCode(it.code); th.id = 'c-' + (it.id || th.name); th.by = it.by || th.by; community.push(th); } catch {}
      }
      communityState = 'ok';
    } catch { community = []; communityState = 'offline'; }
    refresh && refresh();
  }

  // ---- the SHOP

  const art = (th) => {
    const t = (th.data && th.data.theme) || {};
    const a1 = t.accent || '#ff1f1f', a2 = t.accent2 || '#ff7a1a', bg = t.bg || '#070505';
    return `<div class="shop-art" style="--s1:${esc(a1)};--s2:${esc(a2)};--s3:${esc(bg)}">${meshSVG('th' + (th.id || th.name), a1, a2, 5)}<span class="shop-sw"><i></i><i></i><i></i></span></div>`;
  };
  let refresh = null;

  function open() {
    loadCommunity();
    const root = el(`
      <div class="overlay center"><div class="picker wide shop">
        <div class="picker-head"><div><div class="tag">[ SHOP · THEMES ]</div><h2>SHOP</h2></div><div class="picker-note"></div></div>
        <div class="server-row shop-top"></div>
        <div class="picker-step tag">[ YOUR THEMES ]</div><div class="pcards small" data-z="mine"></div>
        <div class="picker-step tag">[ FEATURED ]</div><div class="pcards small" data-z="featured"></div>
        <div class="picker-step tag shop-com-tag">[ COMMUNITY ]</div><div class="pcards small" data-z="community"></div>
        <div class="hints">${hints([['confirm', 'Choose'], ['move', 'Move'], ['back', 'Close']])}</div>
      </div></div>`);
    const top = $('.shop-top', root);
    const ZONES = ['top', 'mine', 'featured', 'community'];
    let zone = 'mine', topIdx = 0;
    const rows = {};
    const isOn = (th) => T().current && T().current === th.id;
    const card = (th, owned) => ({
      html: art(th), name: th.name, sub: (isOn(th) ? 'ON · ' : '') + (th.by ? 'BY ' + th.by.toUpperCase() : owned ? 'YOURS' : ''), picked: isOn(th),
      run: () => menu(th, owned),
    });
    const lists = {
      mine: () => [...T().library.map((th) => card(th, true)), { glyph: '+', name: 'SAVE THIS LOOK', sub: 'As a new theme', run: () => saveCurrent(build) }],
      featured: () => FEATURED.map((th) => card(th, false)),
      community: () => (community && community.length ? community.map((th) => card(th, false))
        : [{ glyph: communityState === 'loading' ? '…' : '·', name: communityState === 'loading' ? 'LOADING' : 'NONE YET', sub: communityState === 'offline' ? 'OFFLINE' : 'SHARE YOURS', run: () => {} }]),
    };
    const tops = () => [
      { label: 'INSERT A CODE', run: () => insertCode(build) },
      { label: 'SAVE THIS LOOK', run: () => saveCurrent(build) },
      ...(T().previous ? [{ label: '↶ BACK TO PREVIOUS LOOK', run: () => { back(); build(); } }] : []),
    ];
    function menu(th, owned) {
      const t = T();
      const inLib = t.library.find((x) => x.id === th.id || (x.name === th.name && x.by === th.by));
      A.openMenu(th.name.toUpperCase(), [
        { label: 'APPLY', sub: 'Your current look is kept: BACK returns to it', run: () => { apply(inLib || th); build(); } },
        ...(!owned && !inLib ? [{ label: 'GET', sub: 'Add it to your themes', run: () => { const c = { ...clone(th), id: newId(), at: Date.now() }; t.library.unshift(c); A.save(); toast(th.name + ' added to your themes'); build(); } }] : []),
        { label: 'SHARE CODE', sub: 'Copy a code anyone can paste in', run: () => share(th) },
        ...(owned ? [
          { label: 'UPDATE WITH MY CURRENT LOOK', run: () => { th.data = snapshot(); th.at = Date.now(); A.save(); toast(th.name + ' updated'); } },
          { label: 'RENAME', run: () => A.ask({ tag: 'THEMES', title: 'RENAME', label: 'Name', value: th.name, done: (v) => { th.name = v.trim() || th.name; A.save(); build(); } }) },
          { label: 'DELETE', danger: true, run: () => A.confirmMenu(`Delete ${th.name}?`, 'DELETE', () => { t.library = t.library.filter((x) => x !== th); if (t.current === th.id) t.current = ''; A.save(); build(); }) },
        ] : []),
      ], th.by ? 'By ' + th.by : '');
    }
    for (const z of ['mine', 'featured', 'community']) rows[z] = rowOf($(`[data-z=${z}]`, root), lists[z], () => setZone(z));
    function setZone(z) { if (z !== zone) { zone = z; paint(); } }
    function paint() {
      for (const z of ['mine', 'featured', 'community']) rows[z].focus(zone === z);
      top.querySelectorAll('.btn').forEach((b, i) => b.classList.toggle('focus', zone === 'top' && i === topIdx));
    }
    function build() {
      for (const z of ['mine', 'featured', 'community']) rows[z].build();
      top.innerHTML = tops().map((b, i) => `<button class="btn small ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('');
      const cur = T().library.find((x) => x.id === T().current) || FEATURED.find((x) => x.id === T().current);
      $('.picker-note', root).textContent = cur ? 'WEARING · ' + cur.name.toUpperCase() : `${T().library.length} SAVED`;
      paint();
    }
    top.addEventListener('click', (e) => { const b = e.target.closest('.btn'); if (b) { topIdx = +b.dataset.i; setZone('top'); tops()[topIdx].run(); } });
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    build();
    refresh = build;
    A.push({
      el: root, onClose: () => { if (refresh === build) refresh = null; },
      action(a) {
        const dir = a === 'left' ? -1 : a === 'right' ? 1 : 0;
        if (a === 'up' || a === 'down') { const next = ZONES[ZONES.indexOf(zone) + (a === 'up' ? -1 : 1)]; if (next) { audio.play('nav'); setZone(next); } }
        else if (a === 'back') A.pop();
        else if (zone === 'top') { const l = tops(); if (dir) { topIdx = clamp(topIdx + dir, 0, l.length - 1); audio.play('nav'); paint(); } else if (a === 'confirm') l[topIdx].run(); }
        else if (dir) rows[zone].move(dir);
        else if (a === 'confirm') rows[zone].run();
      },
    });
  }

  // A row of cards (same look as the other pickers).
  function rowOf(box, cards, onMove) {
    let idx = 0;
    const paint = () => box.querySelectorAll('.pcard').forEach((c, i) => { c.classList.toggle('focus', i === idx); if (i === idx) c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    return {
      build() {
        const list = cards();
        idx = clamp(idx, 0, Math.max(0, list.length - 1));
        box.replaceChildren(...list.map((c, i) => {
          const n = el(`<button class="pcard ${c.picked ? 'picked' : ''} ${c.glyph ? 'plain' : ''}"><div class="pcard-art">${c.glyph ? `<em>${c.glyph}</em>` : c.html}<i class="pcard-check">✓</i></div><b>${esc(c.name)}</b><small>${esc(c.sub || '')}</small></button>`);
          n.addEventListener('click', () => { idx = i; paint(); c.run(); });
          n.addEventListener('mousemove', () => { if (idx !== i) { idx = i; paint(); onMove && onMove(); } });
          return n;
        }));
        paint();
      },
      move(d) { const n = cards().length, next = clamp(idx + d, 0, n - 1); if (next !== idx) { idx = next; audio.play('nav'); paint(); } },
      run() { const c = cards()[idx]; c && c.run(); },
      focus(on) { box.classList.toggle('active', on); },
    };
  }

  // Settings → THEME gets the same library as rows.
  function rows(rerender) {
    const t = T();
    return [
      heading('YOUR THEMES'),
      R.button('Open the SHOP', 'Featured and community themes, codes, and your library.', 'SHOP', () => { while (A.stack.length) A.pop(); open(); }),
      R.button('Save this look as a theme', '', 'SAVE', () => saveCurrent(rerender)),
      ...(t.previous ? [R.button('Back to the previous look', t.previous.name, 'BACK', () => { back(); rerender(); })] : []),
      ...t.library.map((th) => R.buttons(th.name, (t.current === th.id ? 'ON · ' : '') + new Date(th.at || Date.now()).toLocaleDateString(), [
        ['APPLY', () => { apply(th); rerender(); }], ['CODE', () => share(th)],
      ])),
      R.button('Insert a code', 'Turn a code someone sent you into a theme.', 'INSERT', () => insertCode(rerender)),
    ];
  }

  SV.themes = { open, apply, back, snapshot, toCode, fromCode, rows };
})();

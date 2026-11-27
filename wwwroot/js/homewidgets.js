// Widgets on HOME: small cards in the empty space to the right of the shelf heading. You pick which ones and their
// order in Settings → WIDGETS: the date, what you played today, the game running, your PC's CPU and memory, the music
// playing, quests ready, friends online, the launcher's own memory, a note, a picture or GIF of your own, and a
// countdown to a date. Live values are only fetched while HOME is on screen.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, toast, R, heading } = A;
  const MAX = 30;
  const KINDS = {
    date: ['Date', 'Today\'s date'], today: ['Played today', 'Your playtime since midnight'], playing: ['Game running', 'What you are playing'],
    pc: ['PC', 'CPU and memory use'], music: ['Music', 'The song playing on your PC'], quests: ['Quests', 'Quests ready to claim'],
    friends: ['Friends online', 'Your Roblox friends'], memory: ['Launcher memory', 'What the launcher itself uses'],
    note: ['Note', 'A line of your own'], picture: ['Picture', 'A picture or GIF of your own'], countdown: ['Countdown', 'Days left until a date'],
    apps: ['App grid', 'Your apps and games as icons, placed anywhere'],
  };
  const ICON = {
    date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    playing: '<rect x="2.5" y="7" width="19" height="11" rx="4"/><path d="M7.5 11v3M6 12.5h3"/>', pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    music: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>', quests: '<path d="M6 3h12v5a6 6 0 0 1-12 0zM9 20h6M12 14v6"/>',
    friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    memory: '<rect x="4" y="7" width="16" height="10" rx="1.5"/><path d="M8 7V4M12 7V4M16 7V4M8 20v-3M12 20v-3M16 20v-3"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M8 12h8M8 16h6"/>', picture: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
    countdown: '<path d="M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  };
  const W = () => { const h = A.cfg.home; h.widgets = h.widgets || []; return h.widgets; };
  // The HOME widgets that also exist as desktop widgets (on any screen, always there).
  const DESKTOP = { date: 'date', note: 'note', countdown: 'countdown', music: 'music', pc: 'perf' };
  const newId = () => Math.random().toString(36).slice(2, 9);
  let pc = null, mem = 0, lastHtml = '';

  const box = el('<div id="hw"></div>');
  const head = document.querySelector('#shelf .shelf-head');
  if (head) head.append(box);

  // Played today: the total at the first look of the day is kept, and today's time is what was added since.
  function todaySeconds() {
    const total = Object.values(A.stats || {}).reduce((s, x) => s + ((x && x.seconds) || 0), 0);
    const day = new Date().toDateString(), h = A.cfg.home;
    if (!h.dayBase || h.dayBase.day !== day) { h.dayBase = { day, total }; A.save(); }
    return Math.max(0, total - h.dayBase.total);
  }

  function value(w) {
    const now = new Date();
    switch (w.kind) {
      case 'date': return [now.toLocaleDateString([], { weekday: 'short', day: 'numeric' }).toUpperCase(), now.toLocaleDateString([], { month: 'long' }).toUpperCase()];
      case 'today': { const s = todaySeconds(); return [s >= 60 ? A.playtime(s) : '0m', 'PLAYED TODAY']; }
      case 'playing': {
        const ids = [...(A.running || [])], g = ids.length && A.cfg.games.find((x) => x.id === ids[0]);
        return g ? [g.name, ids.length > 1 ? `+${ids.length - 1} MORE RUNNING` : 'PLAYING NOW'] : ['READY', `${A.cfg.games.length} GAMES`];
      }
      case 'pc': return pc ? [`${Math.round(pc.cpu)}%`, `CPU · RAM ${Math.round(pc.ram)}%`] : ['…', 'CPU · RAM'];
      case 'music': { const t = SV.music && SV.music.track; return t && t.title ? [t.title, (t.artist || t.app || 'NOW PLAYING').toUpperCase()] : ['Nothing playing', 'MUSIC']; }
      case 'quests': { const n = SV.quests && SV.quests.readyCount ? SV.quests.readyCount() : 0; return [String(n), n === 1 ? 'QUEST READY' : 'QUESTS READY']; }
      case 'friends': {
        const F = SV.friends, list = (F && F.list) || [], on = list.filter((f) => f.state).length, inGame = list.filter((f) => F && f.state === F.IN_GAME).length;
        return [String(on), inGame ? `ONLINE · ${inGame} IN GAME` : 'FRIENDS ONLINE'];
      }
      case 'memory': return [mem ? `${mem} MB` : '…', 'LAUNCHER'];
      case 'note': return [w.text || 'Your note', (w.label || 'NOTE').toUpperCase()];
      case 'countdown': {
        const t = new Date((w.date || '') + 'T00:00:00').getTime();
        if (isNaN(t)) return ['—', (w.label || 'COUNTDOWN').toUpperCase()];
        const days = Math.ceil((t - Date.now()) / 864e5);
        return [days > 1 ? `${days} DAYS` : days === 1 ? 'TOMORROW' : days === 0 ? 'TODAY' : 'DONE', (w.label || 'COUNTDOWN').toUpperCase()];
      }
      default: return ['', ''];
    }
  }

  // How the widgets look and behave together (Settings → WIDGETS → ON HOME, and the EDIT bar on HOME).
  const FX = () => { const h = A.cfg.home; h.widgetFx = { gap: 0.55, grid: 2, snap: true, hover: 'lift', appear: 'rise', sound: '', ...(h.widgetFx || {}) }; return h.widgetFx; };
  const fill = (s) => (window.SVW ? SVW.fill(s, { perf: pc, music: SV.music && SV.music.track, name: A.cfg.profile && A.cfg.profile.name }) : s);
  let editing = false;
  // Widgets dragged somewhere on HOME live on their own layer; the rest stay in the row by the shelf heading.
  const free = el('<div id="hwf"></div>');
  const home = document.getElementById('home');
  if (home) home.append(free);

  // A widget's own look (right-click it): colours, corners, border, glow, text, width, see-through, turn.
  const LOOK = ['bgc', 'fg', 'rad', 'bd', 'bdc', 'gl', 'glc', 'op', 'rot', 'font', 'fs', 'wid', 'hei', 'pad'];
  const WFONTS = { inter: "'Inter Tight','Segoe UI',sans-serif", chakra: "'Chakra Petch','Segoe UI',sans-serif", anton: "'Anton','Impact',sans-serif", mono: "'JetBrains Mono',Consolas,monospace", serif: 'Georgia,serif' };
  function lookCss(w) {
    const c = [], px = (v) => `${+v}px`;
    const ok = (v) => /^#[0-9a-f]{3,8}$/i.test(v || '');
    if (ok(w.bgc)) c.push(`background:${w.bgc} !important`);
    if (ok(w.fg)) c.push(`color:${w.fg} !important`);
    if (w.rad != null) c.push(`border-radius:${px(w.rad)}`);
    const sh = [];
    if (w.bd) sh.push(`inset 0 0 0 ${px(w.bd)} ${ok(w.bdc) ? w.bdc : 'rgba(255,255,255,.5)'}`);
    if (w.gl) sh.push(`0 0 ${px(w.gl)} ${ok(w.glc) ? w.glc : 'var(--accent)'}`);
    if (sh.length) c.push(`box-shadow:${sh.join(',')} !important`);
    if (w.op != null) c.push(`opacity:${+w.op}`);
    if (w.rot) c.push(`--rot:${+w.rot}deg`);
    if (WFONTS[w.font]) c.push(`--wf:${WFONTS[w.font].replace(/"/g, '')}`);
    if (w.fs) c.push(`font-size:${+w.fs}em`);
    if (w.wid) c.push(`width:${px(w.wid)};max-width:none`);
    if (w.hei) c.push(`height:${px(w.hei)}`);
    if (w.pad != null) c.push(`padding:${px(w.pad)}`);
    return c.length ? c.join(';') + ';' : '';
  }

  // Swaps only the widgets that changed, and keeps each one's element: replacing them all on every tick of a clock
  // or a CPU number lost clicks and hover effects.
  function sync(host, htmls) {
    const old = new Map([...host.children].map((n) => [n.dataset.id, n]));
    let at = null;
    for (const html of htmls) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      const want = t.content.firstElementChild;
      let n = old.get(want.dataset.id);
      old.delete(want.dataset.id);
      if (n && n.tagName === want.tagName) {
        if (n._html !== html) {
          for (const a of [...want.attributes]) if (n.getAttribute(a.name) !== a.value) n.setAttribute(a.name, a.value);
          for (const a of [...n.attributes]) if (!want.hasAttribute(a.name)) n.removeAttribute(a.name);
          if (n.innerHTML !== want.innerHTML) n.replaceChildren(...want.childNodes);
        }
      } else { if (n) n.remove(); n = want; }
      n._html = html;
      const next = at ? at.nextSibling : host.firstChild;
      if (next !== n) host.insertBefore(n, next);
      at = n;
    }
    for (const n of old.values()) n.remove();
  }

  function card(w, i) {
    const fx = FX();
    const cls = `hv-${w.hover || fx.hover} ap-${w.appear || fx.appear}${w.x != null ? ' placed' : ''}`;
    const style = `--ws:${w.scale || 1};${w.x != null ? `left:${(w.x * 100).toFixed(2)}%;top:${(w.y * 100).toFixed(2)}%;` : ''}${lookCss(w)}`;
    const tools = (editing ? '<em class="hw-grip" title="Drag to resize"></em>' : '') ;
    const fxa = ` data-id="${esc(w.id)}"${w.thunder ? ` data-thunder="${w.thunder}"` : ''}${w.tilt ? ` data-tilt="${w.tilt}"` : ''}`;
    if (w.kind === 'custom' && window.SVW) return `<div${fxa} class="hw hw-custom ${cls} ${w.mono ? 'mono-item' : ''}" data-i="${i}" style="${style}">${SVW.render(w.spec, { perf: pc, music: SV.music && SV.music.track, name: A.cfg.profile && A.cfg.profile.name })}${tools}</div>`;
    if (w.kind === 'apps') {
      const pic = (a) => { const g = a.kind === 'game' && A.cfg.games.find((x) => x.id === a.gameId); return a.icon || (g && A.artSrc && (A.artSrc(g, 'icon') || A.artSrc(g, 'cover'))) || ''; };
      const icons = (w.apps || []).map((a, k) => `<span class="hwa ${w.iconHover || 'grow'}" data-app="${k}" style="--d:${k * 45}ms">${pic(a) ? `<img src="${esc(pic(a))}" alt="" draggable="false">` : `<em>${esc((a.name || '?')[0])}</em>`}${w.names ? `<small>${esc(a.name || '')}</small>` : ''}</span>`).join('');
      return `<div${fxa} class="hw hw-apps ${cls} ${w.bg ? 'bg-' + w.bg : ''} ${w.mono ? 'mono-item' : ''}" data-i="${i}" style="${style}--cols:${w.cols || 4};--gap:${w.gap == null ? 10 : w.gap}px;--px:${w.icon || 52}px;--ir:${w.radius == null ? 14 : w.radius}px">${icons || '<small class="hwa-empty">Add apps: right-click</small>'}${tools}</div>`;
    }
    if (w.kind === 'picture') return `<button${fxa} class="hw hw-picture ${cls} ${w.mono ? 'mono-item' : ''}" data-i="${i}" style="${style}" title="${esc(w.label || '')}">${w.image ? SV.media.html(w.image, 'hw-img') : `<i><svg viewBox="0 0 24 24">${ICON.picture}</svg></i>`}${tools}</button>`;
    let [b, small] = value(w);
    if (w.title) b = fill(w.title);
    if (w.sub) small = fill(w.sub);
    const t = w.kind === 'music' && SV.music && SV.music.track;
    const art = t && t.title && t.art ? `<i class="hw-art"><img src="${esc(t.art)}" alt=""></i>` : '';
    const icon = w.hideIcon ? '' : art || `<i><svg viewBox="0 0 24 24">${ICON[w.kind] || ''}</svg></i>`;
    return `<button${fxa} class="hw hw-${w.kind} ${cls} ${w.mono ? 'mono-item' : ''}" data-i="${i}" style="${style}">${icon}<span><b>${esc(b)}</b><small>${esc(small)}</small></span>${tools}</button>`;
  }

  function render() {
    if (!A.cfg) return;
    const list = W(), fx = FX();
    const row = [], placed = [];
    list.forEach((w, i) => (w.x != null ? placed : row).push(card(w, i)));
    const html = row.join('') + '\u0000' + placed.join('') + editing;
    document.body.style.setProperty('--hw-gap', fx.gap + 'rem');
    if (html === lastHtml) return;
    lastHtml = html;
    for (const w of list) if (!w.id) w.id = newId();
    if (!(drag && drag.moved)) { sync(box, row); sync(free, placed); }
    document.body.classList.toggle('has-hw', list.length > 0);
  }
  // The appear animation plays when HOME comes in, not every time a number changes.
  function appear() {
    document.body.classList.remove('hw-appear');
    void document.body.offsetWidth;
    document.body.classList.add('hw-appear');
    setTimeout(() => document.body.classList.remove('hw-appear'), 1400);
  }
  host.on('mode', (m) => { if (m.mode === 'home') appear(); });
  host.on('init', () => setTimeout(appear, 80));

  // ---- EDIT: drag the widgets anywhere on HOME (they snap to a grid), click one to change it

  const bar = el(`<div id="hwBar"><b class="tag">[ WIDGETS ]</b>
    <button class="btn small ghost" data-b="snap"></button>
    <button class="btn small ghost" data-b="grid-">GRID −</button><span class="hwb-grid"></span><button class="btn small ghost" data-b="grid+">GRID +</button>
    <button class="btn small ghost" data-b="gap-">SPACE −</button><button class="btn small ghost" data-b="gap+">SPACE +</button>
    <button class="btn small ghost" data-b="add">ADD</button><button class="btn small" data-b="done">DONE</button></div>`);
  document.body.append(bar);
  const paintBar = () => { const fx = FX(); bar.querySelector('[data-b=snap]').textContent = fx.snap ? 'SNAP ON' : 'SNAP OFF'; bar.querySelector('.hwb-grid').textContent = fx.grid + '%'; };
  function setEditing(on) {
    editing = on;
    if (on) { while (A.stack.length) A.pop(); toast('Drag the widgets anywhere on HOME. Click one to change it. DONE when finished.'); paintBar(); }
    else A.save();
    document.body.classList.toggle('hw-edit', on);
    audio.play('toggle');
    lastHtml = '';
    render();
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const fx = FX();
    switch (b.dataset.b) {
      case 'done': return setEditing(false);
      case 'snap': fx.snap = !fx.snap; break;
      case 'grid-': fx.grid = Math.max(0.5, +(fx.grid - 0.5).toFixed(1)); break;
      case 'grid+': fx.grid = Math.min(10, +(fx.grid + 0.5).toFixed(1)); break;
      case 'gap-': fx.gap = Math.max(0, +(fx.gap - 0.15).toFixed(2)); break;
      case 'gap+': fx.gap = Math.min(3, +(fx.gap + 0.15).toFixed(2)); break;
      case 'add': return addMenu(() => { lastHtml = ''; render(); });
    }
    audio.play('toggle');
    paintBar();
    A.changed();
    lastHtml = '';
    render();
  });

  let drag = null, justDragged = 0;
  const onDown = (e) => {
    const b = e.target.closest('.hw');
    if (!editing || !b || e.button !== 0) return;
    e.preventDefault();
    const r = b.getBoundingClientRect(), hb = home.getBoundingClientRect();
    const grip = e.target.closest('.hw-grip');
    drag = { b, grip: !!grip, x0: r.left, w0: r.width, s0: W()[+b.dataset.i].scale || 1, w: W()[+b.dataset.i], dx: e.clientX - r.left, dy: e.clientY - r.top, hb, moved: false, sx: e.clientX, sy: e.clientY };
  };
  const onMove = (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    const { w, hb } = drag, fx = FX();
    if (drag.grip) {
      // The corner: bigger or smaller.
      drag.moved = true;
      w.scale = +Math.max(0.3, Math.min(4, drag.s0 * (1 + (e.clientX - drag.sx) / Math.max(40, drag.w0)))).toFixed(2);
      drag.b.style.setProperty('--ws', w.scale);
      return;
    }
    if (!drag.moved) {
      // Out of the row and onto the free layer, where it follows the mouse.
      drag.moved = true;
      if (drag.b.parentElement !== free) { free.append(drag.b); drag.b.classList.add('placed'); }
      drag.b.classList.add('dragging');
    }
    let x = (e.clientX - drag.dx - hb.left) / hb.width, y = (e.clientY - drag.dy - hb.top) / hb.height;
    if (fx.snap) { const g = fx.grid / 100; x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
    x = Math.max(0, Math.min(0.97, x)); y = Math.max(0, Math.min(0.95, y));
    w.x = +x.toFixed(4); w.y = +y.toFixed(4);
    drag.b.style.left = (x * 100) + '%'; drag.b.style.top = (y * 100) + '%';
  };
  const onUp = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag.b.classList.remove('dragging');
    drag = null;
    if (moved) { justDragged = performance.now(); A.save(); lastHtml = ''; render(); }
  };
  for (const c of [box, free]) c.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);

  // One widget's own look and behaviour.
  function widgetEditor(w) {
    const root = el(`<div class="overlay"><div class="sheet narrow"><div class="sheet-head"><div><div class="tag">[ HOME WIDGET ]</div><h2>${esc((KINDS[w.kind] || ['MY WIDGET'])[0]).toUpperCase()}</h2></div></div><div class="sheet-body"></div>
      <div class="hints">${A.hints([['confirm', 'Change'], ['adjust', 'Adjust'], ['back', 'Done']])}</div></div></div>`);
    const body = root.querySelector('.sheet-body'), p = A.panel(body), P = (k) => A.prop(w, k);
    const re = () => { lastHtml = ''; render(); };
    const lv = (k, d) => ({ get: () => (w[k] == null ? d : w[k]), set: (v) => { w[k] = v; re(); } });
    const lc = (k, d) => ({ get: () => w[k] || d, set: (v) => { w[k] = v; re(); } });
    const opt = (k) => ({ get: () => w[k] || '', set: (v) => { if (v) w[k] = v; else delete w[k]; re(); } });
    const build = (at = 0) => {
      body.replaceChildren(
        heading('TEXT'),
        ...(w.kind === 'custom' || w.kind === 'picture' || w.kind === 'apps' ? [] : [
          R.text('Big line', 'Empty shows the live value. {time} {date} {cpu} {song} work here too.', opt('title'), 'Automatic'),
          R.text('Small line', 'Empty shows the usual label.', opt('sub'), 'Automatic'),
          R.toggle('Icon', '', { get: () => !w.hideIcon, set: (v) => { if (v) delete w.hideIcon; else w.hideIcon = true; re(); } }),
        ]),
        ...(w.kind === 'apps' ? [
          heading('APPS'),
          R.button('Add to the grid', `${(w.apps || []).length} apps.`, 'ADD', () => { w.apps = w.apps || []; SV.widgets.addApp(w, () => { re(); build(p.idx); }); }),
          ...(w.apps || []).map((a, k) => R.buttons(a.name || 'App', '', [
            ['<', () => { if (k > 0) { [w.apps[k - 1], w.apps[k]] = [w.apps[k], w.apps[k - 1]]; A.changed(); re(); build(p.idx); } }, 'ghost'],
            ['>', () => { if (k < w.apps.length - 1) { [w.apps[k + 1], w.apps[k]] = [w.apps[k], w.apps[k + 1]]; A.changed(); re(); build(p.idx); } }, 'ghost'],
            ['NAME', () => A.ask({ tag: 'APP', title: 'NAME', label: 'Name', value: a.name || '', done: (v) => { a.name = v.trim(); A.changed(); re(); build(p.idx); } })],
            ['ICON', () => A.pick('image').then((f) => { if (f.url) { a.icon = f.url; A.changed(); re(); } })],
            ['REMOVE', () => { w.apps.splice(k, 1); A.changed(); re(); build(p.idx); }, 'danger'],
          ])),
          heading('GRID'),
          R.toggle('Names under the icons', 'Off shows only the icons.', { get: () => !!w.names, set: (v) => { w.names = v; re(); } }),
          R.slider('Columns', '', { get: () => w.cols || 4, set: (v) => { w.cols = v; re(); } }, 1, 12, 1, (v) => String(v)),
          R.slider('Spacing', 'Space between the icons.', { get: () => (w.gap == null ? 10 : w.gap), set: (v) => { w.gap = v; re(); } }, 0, 60, 1, (v) => v + ' px'),
          R.slider('Icon size', '', { get: () => w.icon || 52, set: (v) => { w.icon = v; re(); } }, 24, 160, 2, (v) => v + ' px'),
          R.slider('Icon corners', '', { get: () => (w.radius == null ? 14 : w.radius), set: (v) => { w.radius = v; re(); } }, 0, 80, 1, (v) => v + ' px'),
          R.choice('Behind the icons', '', { get: () => w.bg || '', set: (v) => { if (v) w.bg = v; else delete w.bg; re(); } }, [['', 'Nothing'], ['glass', 'Dark glass']]),
          R.choice('Mouse over an icon', '', { get: () => w.iconHover || 'grow', set: (v) => { w.iconHover = v; re(); } }, [['grow', 'Gets bigger'], ['glow', 'Glows'], ['still', 'Nothing']]),
        ] : []),
        ...(w.kind === 'custom' ? [R.button('Design', 'Change it in the widget creator.', 'EDIT', () => { const m = ((A.cfg.creator || {}).widgets || []).find((x) => x.id === w.specId); if (m && SV.creator) SV.creator.widgetCreator(m, re); })] : []),
        heading('SIZE AND PLACE'),
        R.slider('Size', 'Or drag the corner while arranging.', { get: () => w.scale || 1, set: (v) => { w.scale = v; re(); } }, 0.3, 4, 0.05, (v) => Math.round(v * 100) + '%'),
        R.button('Place', w.x != null ? 'Placed by you on HOME' : 'In the row by the shelf heading', 'BACK TO THE ROW', () => { delete w.x; delete w.y; A.changed(); re(); build(p.idx); }),
        R.slider('From the left', 'Moves it out of the row.', { get: () => (w.x == null ? 0 : w.x), set: (v) => { if (w.x == null) w.y = 0.2; w.x = v; re(); } }, 0, 0.97, 0.005, (v) => (w.x == null ? 'ROW' : (v * 100).toFixed(1) + '%')),
        R.slider('From the top', '', { get: () => (w.y == null ? 0 : w.y), set: (v) => { if (w.x == null) w.x = 0.4; w.y = v; re(); } }, 0, 0.95, 0.005, (v) => (w.y == null ? 'ROW' : (v * 100).toFixed(1) + '%')),
        R.slider('Turn', '', lv('rot', 0), -180, 180, 1, (v) => v + '°'),
        R.slider('Width', '0 fits what is inside.', lv('wid', 0), 0, 900, 5, (v) => (v ? v + ' px' : 'AUTO')),
        R.slider('Height', '0 fits what is inside.', lv('hei', 0), 0, 700, 5, (v) => (v ? v + ' px' : 'AUTO')),
        R.slider('Space inside', '', lv('pad', w.kind === 'apps' ? 8 : 12), 0, 60, 1, (v) => v + ' px'),
        heading('LOOK'),
        R.color('Background', '', lc('bgc', '#141010')),
        R.color('Text colour', '', lc('fg', '#f5efee')),
        R.choice('Font', '', { get: () => w.font || '', set: (v) => { if (v) w.font = v; else delete w.font; re(); } }, [['', 'Same as the launcher'], ['inter', 'Inter Tight'], ['chakra', 'Chakra Petch'], ['anton', 'Anton'], ['mono', 'JetBrains Mono'], ['serif', 'Serif']]),
        R.slider('Text size', '', lv('fs', 1), 0.5, 4, 0.05, (v) => Math.round(v * 100) + '%'),
        R.slider('Corners', '', lv('rad', 11), 0, 120, 1, (v) => v + ' px'),
        R.slider('Border', '', lv('bd', 0), 0, 12, 1, (v) => (v ? v + ' px' : 'OFF')),
        R.color('Border colour', '', lc('bdc', '#ffffff')),
        R.slider('Glow', '', lv('gl', 0), 0, 80, 2, (v) => (v ? v + ' px' : 'OFF')),
        R.color('Glow colour', '', lc('glc', A.cfg.theme.accent)),
        R.slider('See-through', '', lv('op', 1), 0.1, 1, 0.05, (v) => Math.round(v * 100) + '%'),
        R.buttons('This look', '', [
          ['USE FOR ALL', () => { for (const o of W()) if (o !== w) for (const k of LOOK) { if (['wid', 'hei', 'rot'].includes(k)) continue; if (w[k] == null) delete o[k]; else o[k] = w[k]; } A.changed(); re(); toast('Every widget has this look now'); }],
          ['DUPLICATE', () => { if (W().length >= MAX) return toast('HOME is full of widgets.', 'bad'); const c = JSON.parse(JSON.stringify(w)); c.id = newId(); if (c.x != null) { c.x = Math.min(0.9, c.x + 0.03); c.y = Math.min(0.9, c.y + 0.03); } W().push(c); A.changed(); re(); }],
          ['RESET LOOK', () => { for (const k of LOOK) delete w[k]; A.changed(); re(); build(p.idx); }, 'ghost'],
        ]),
        heading('EFFECTS'),
        R.choice('Thunder on hover', w.kind === 'apps' ? 'Around each icon while the mouse is on it.' : 'Lightning while the mouse is on it.', { get: () => w.thunder || '', set: (v) => { if (v) w.thunder = v; else delete w.thunder; re(); } }, [['', 'Same as the others'], ['on', 'On'], ['off', 'Off']]),
        R.choice('3D on hover', 'Tilts towards the mouse.', { get: () => w.tilt || '', set: (v) => { if (v) w.tilt = v; else delete w.tilt; re(); } }, [['', 'Same as the others'], ['on', 'On'], ['off', 'Off']]),
        R.toggle('Black and white', 'Only this widget.', { get: () => !!w.mono, set: (v) => { w.mono = v; re(); } }),
        heading('BEHAVIOUR'),
        R.choice('Mouse over it', '', { get: () => w.hover || '', set: (v) => { if (v) w.hover = v; else delete w.hover; re(); } }, [['', 'Same as the others'], ['lift', 'Lifts'], ['glow', 'Glows'], ['grow', 'Grows'], ['tilt', 'Tilts'], ['none', 'Nothing']]),
        R.choice('How it appears', 'When HOME comes in.', { get: () => w.appear || '', set: (v) => { if (v) w.appear = v; else delete w.appear; re(); appear(); } }, [['', 'Same as the others'], ['rise', 'Rises'], ['fade', 'Fades in'], ['pop', 'Pops'], ['slide', 'Slides in'], ['none', 'Just there']]),
        R.button('Sound when clicked', w.sound ? 'Your own sound' : 'The usual click', w.sound ? 'CHANGE' : 'PICK', () => A.pick('audio').then((f) => { if (f.url) { w.sound = f.url; A.changed(); audio.preview && audio.preview(f.url); build(p.idx); } })),
        ...(w.sound ? [R.button('Use the usual click', '', 'CLEAR', () => { delete w.sound; A.changed(); build(p.idx); })] : []),
        R.button('Remove it', '', 'REMOVE', () => { const l = W(); l.splice(l.indexOf(w), 1); A.changed(); re(); A.pop(); }, true),
      );
      p.focus(at);
    };
    build();
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    A.push({ el: root, action: p.action, onClose: () => { A.changed(); re(); } });
  }


  const onClick = (e) => {
    const b = e.target.closest('.hw');
    if (!b || A.stack.length) return;
    const w = W()[+b.dataset.i];
    if (!w) return;
    if (performance.now() - justDragged < 350) return;
    if (editing) return widgetEditor(w);
    if (w.kind === 'custom') { const k = e.target.closest('[data-wk]'); if (k && SV.creator) SV.creator.press((w.spec.blocks || [])[+k.dataset.wk]); return; }
    if (w.kind === 'apps') {
      const k = e.target.closest('[data-app]'), a = k && (w.apps || [])[+k.dataset.app];
      if (!a) return;
      const s2 = w.sound || FX().sound;
      if (s2 && audio.effect) audio.effect(s2); else audio.play('confirm');
      if (a.kind === 'game') { const g = A.cfg.games.find((x) => x.id === a.gameId); if (g) A.launch(g); }
      else host.send('openItem', { item: a });
      return;
    }
    const snd = w.sound || FX().sound;
    if (snd && audio.effect) audio.effect(snd); else audio.play('confirm');
    if (w.kind === 'quests') SV.quests.open();
    else if (w.kind === 'friends') SV.rails.show();
    else if (w.kind === 'music') { const np = document.getElementById('np'); np ? np.click() : host.send('nowPlaying'); }
    else if (w.kind === 'playing') A.openTasks();
    else if (w.kind === 'today') SV.app && document.querySelector('#funcs .func[data-id=more]') && A.openSettings && toast('Your playtime per game is under MORE → Playtime');
    else if (w.kind === 'note' || w.kind === 'countdown' || w.kind === 'picture') edit(w, render);
    else if (w.kind === 'pc') document.querySelector('#topbar .status') && document.querySelector('#topbar .status').dispatchEvent(new MouseEvent('mouseenter'));
  };
  box.addEventListener('click', onClick);
  free.addEventListener('click', onClick);
  // Right-click a widget on HOME: its options straight away.
  for (const c of [box, free]) c.addEventListener('contextmenu', (e) => { const b = e.target.closest('.hw'); if (!b) return; e.preventDefault(); const w = W()[+b.dataset.i]; if (w) widgetEditor(w); });

  // Live values: only while HOME is actually on screen.
  let tick = 0;
  setInterval(() => {
    if (!A.cfg || A.mode !== 'home' || document.hidden || document.body.classList.contains('covered') || !W().length) return;
    tick++;
    const kinds = new Set(W().map((w) => w.kind));
    const custom = W().filter((w) => w.kind === 'custom' && window.SVW && SVW.live(w.spec));
    if ((kinds.has('pc') || custom.some((w) => JSON.stringify(w.spec).match(/cpu|ram|"bar"/))) && tick % 2 === 0) host.send('systemStats');
    if (custom.some((w) => JSON.stringify(w.spec).match(/song|artist/)) && tick % 2 === 1) host.send('nowPlaying');
    if (kinds.has('memory') && (tick % 5 === 1 || !mem)) host.send('memoryNow');
    if (kinds.has('music') && tick % 2 === 1) host.send('nowPlaying');
    render();
  }, 1500);
  host.on('systemStats', (m) => { if (m.cpu != null) pc = { cpu: m.cpu, ram: m.ramTotal ? (m.ramUsed / m.ramTotal) * 100 : 0 }; });
  host.on('memory', (m) => { if (m.mb) mem = m.mb; });
  host.on('init', () => setTimeout(render, 50));
  for (const t of ['running', 'stats', 'nowPlaying', 'robloxFriends']) host.on(t, () => setTimeout(render, 0));

  // ---- Settings → WIDGETS

  function edit(w, after) {
    if (w.kind === 'note') return A.ask({ tag: 'HOME WIDGET', title: 'NOTE', label: 'Text', value: w.text || '', placeholder: 'Ranked grind tonight', button: 'NEXT', done: (v) => {
      w.text = v.trim(); setTimeout(() => A.ask({ tag: 'HOME WIDGET', title: 'LABEL', label: 'Small line under it', value: w.label || 'NOTE', button: 'SAVE', done: (l) => { w.label = l.trim(); A.changed(); after && after(); } }), 80);
    } });
    if (w.kind === 'countdown') return A.ask({ tag: 'HOME WIDGET', title: 'COUNTDOWN', label: 'What is it?', value: w.label || '', placeholder: 'GTA 6', button: 'NEXT', done: (l) => {
      w.label = l.trim(); setTimeout(() => A.ask({ tag: 'HOME WIDGET', title: 'WHEN', label: 'Date (YYYY-MM-DD)', value: w.date || '', placeholder: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), button: 'SAVE', done: (d) => { w.date = d.trim(); A.changed(); after && after(); } }), 80);
    } });
    if (w.kind === 'picture') return A.pick('media').then((f) => { if (f.url) { w.image = f.url; A.changed(); after && after(); } });
  }

  function addMenu(after) {
    if (W().length >= MAX) return toast(`HOME has room for ${MAX} widgets. Remove one first.`, 'bad');
    const mine = (A.cfg.creator && A.cfg.creator.widgets) || [];
    A.openMenu('ADD TO HOME', [...mine.map((m) => ({ label: m.name.toUpperCase(), sub: 'Your own widget', run: () => { W().push({ id: newId(), kind: 'custom', specId: m.id, spec: JSON.parse(JSON.stringify(m.spec)) }); A.changed(); render(); after && after(); } })), ...Object.entries(KINDS).map(([k, [label, sub]]) => ({ label: label.toUpperCase(), sub, run: () => {
      const w = { id: newId(), kind: k };
      if (k === 'apps') { w.apps = ((A.cfg.nexus && A.cfg.nexus.items) || []).filter((it) => it.kind !== 'home').slice(0, 8).map((it) => ({ ...it })); w.names = false; }
      W().push(w);
      A.changed();
      audio.play('pick');
      render();
      if (k === 'note' || k === 'countdown' || k === 'picture') setTimeout(() => edit(w, after), 120); else after && after();
    } }))]);
  }

  function rows(rerender) {
    const list = W();
    const re = () => { render(); rerender && rerender(); };
    return [
      heading('ON HOME'),
      el(`<div class="row-note">Small cards beside the shelf heading on HOME, up to ${MAX}. Click one on HOME to open what it is about.</div>`),
      R.button('Add a widget to HOME', `${list.length} of ${MAX} used.`, 'ADD', () => addMenu(re)),
      R.button('Arrange them', 'Drag them anywhere on HOME, change size, text, sound and more. Right-click one on HOME does the same.', 'EDIT', () => setEditing(true)),
      R.slider('Spacing', 'Space between the widgets in the row.', { get: () => FX().gap, set: (v) => { FX().gap = v; re(); } }, 0, 3, 0.05, (v) => v.toFixed(2) + ' rem'),
      R.slider('Grid size', 'How far a dragged widget jumps at a time.', { get: () => FX().grid, set: (v) => { FX().grid = v; } }, 0.5, 10, 0.5, (v) => v + '%'),
      R.toggle('Snap to the grid', '', { get: () => FX().snap, set: (v) => { FX().snap = v; } }),
      R.choice('Mouse over them', 'Each widget can have its own too.', { get: () => FX().hover, set: (v) => { FX().hover = v; lastHtml = ''; re(); } }, [['lift', 'Lifts'], ['glow', 'Glows'], ['grow', 'Grows'], ['tilt', 'Tilts'], ['none', 'Nothing']]),
      R.choice('How they appear', 'When HOME comes in.', { get: () => FX().appear, set: (v) => { FX().appear = v; lastHtml = ''; re(); appear(); } }, [['rise', 'Rise'], ['fade', 'Fade in'], ['pop', 'Pop'], ['slide', 'Slide in'], ['none', 'Just there']]),
      R.file('Click sound', 'For every widget, unless one has its own.', { get: () => FX().sound || '', set: (v) => { FX().sound = v; } }, 'audio'),
      R.button('Your own widgets', 'Made in Settings → CREATOR.', 'CREATOR', () => A.openSettings('creator')),
      ...list.map((w, i) => R.buttons(w.kind === 'custom' ? 'My widget' : KINDS[w.kind] ? KINDS[w.kind][0] : w.kind, w.kind === 'custom' ? 'From the creator' : w.kind === 'note' ? (w.text || '') : w.kind === 'countdown' ? `${w.label || ''} ${w.date || ''}` : w.kind === 'picture' ? (w.image ? 'Set' : 'No picture yet') : KINDS[w.kind][1], [
        ['◀', () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; A.changed(); re(); } }, 'ghost'],
        ['▶', () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; A.changed(); re(); } }, 'ghost'],
        ...(['note', 'countdown', 'picture'].includes(w.kind) ? [['EDIT', () => edit(w, re)]] : []),
        ...(DESKTOP[w.kind] ? [['DESKTOP', () => { SV.widgets.add(DESKTOP[w.kind], rerender, { text: w.text || '', label: w.label || '', date: w.date || '' }); }]] : []),
        ['REMOVE', () => { list.splice(i, 1); A.changed(); re(); }, 'danger'],
      ])),
    ];
  }

  SV.homeWidgets = { rows, render, add: addMenu, arrange: () => setEditing(true) };
})();

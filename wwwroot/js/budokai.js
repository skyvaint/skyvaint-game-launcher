// Budokai Tenkaichi: a picker like Roblox's. 1 emulator (PCSX2; Dolphin only if switched on, and it just opens
// the app), 2 your game file or mod (each with its own name and picture), 3 how to play (on your own, or with a
// friend over Parsec). The shell finds the emulators and does the starting.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, clamp, toast, hints, meshSVG } = A;
  const B = () => {
    const c = A.cfg;
    c.budokai = c.budokai || {};
    const b = c.budokai;
    b.emu = b.emu || 'pcsx2';
    b.files = b.files || []; b.folders = b.folders || []; b.meta = b.meta || {}; b.hidden = b.hidden || [];
    b.selected = b.selected || {}; b.friends = b.friends || [];
    b.mode = b.mode || 'solo';
    b.psMode = b.psMode || 'solo'; // PCSX2: on your own, or with a friend over Parsec
    b.myPad = b.myPad || 'controller'; // player 1: your controller (and keyboard), or the keyboard only
    b.friendPad = b.friendPad || 0;    // which controller your friend's is (0 = work it out)
    if (b.fullscreen === undefined) b.fullscreen = true;
    if (b.emu === 'dolphin' && !feat('budokai.dolphin')) b.emu = 'pcsx2';
    if (b.psMode === 'parsec' && !feat('budokai.parsec')) b.psMode = 'solo';
    return b;
  };
  const feat = (k) => !SV.features || SV.features.on(k);
  // Dolphin only shows when it's switched on in Settings → SYSTEM, and then it just opens the Dolphin app.
  const EMUS_ALL = [['pcsx2', 'PCSX2', 'PS2'], ['dolphin', 'DOLPHIN', 'OPENS THE APP']];
  const emus = () => EMUS_ALL.filter(([k]) => k !== 'dolphin' || feat('budokai.dolphin'));
  const kindFor = (emu) => (emu === 'dolphin' ? 'wii' : 'ps2');
  let state = { pcsx2: '', dolphin: '', found: [], scanned: false };
  let refresh = null, current = null;

  host.on('budokaiState', (m) => {
    if (m.ok) state = { pcsx2: m.pcsx2 || '', dolphin: m.dolphin || '', found: m.found || [], scanned: true };
    else state.scanned = true;
    refresh && refresh();
  });
  const scan = () => { const b = B(); host.send('budokaiScan', { pcsx2: b.pcsx2Path || '', dolphin: b.dolphinPath || '', folders: b.folders, files: b.files }); };

  const metaOf = (f) => B().meta[f.path] || {};
  const nameOf = (f) => metaOf(f).name || f.name;
  const files = () => {
    const b = B(), kind = kindFor(b.emu);
    return state.found.filter((f) => f.kind === kind && !b.hidden.includes(f.path));
  };
  const chosen = () => { const b = B(), list = files(); return list.find((f) => f.path === b.selected[b.emu]) || list[0] || null; };

  // A row of cards you move along (same look as the Roblox picker).
  function cardRow(box, cards, onMove) {
    let idx = 0;
    const paint = () => box.querySelectorAll('.pcard').forEach((c, i) => { c.classList.toggle('focus', i === idx); if (i === idx) c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    const build = (keep) => {
      const list = cards();
      idx = clamp(keep ?? idx, 0, Math.max(0, list.length - 1));
      box.replaceChildren(...list.map((c, i) => {
        const node = el(`<button class="pcard ${c.picked ? 'picked' : ''} ${c.glyph ? 'plain' : ''}">
          <div class="pcard-art">${c.glyph ? `<em>${c.glyph}</em>` : c.html}<i class="pcard-check">✓</i></div>
          <b>${esc(c.name)}</b><small>${esc(c.sub || '')}</small></button>`);
        node.addEventListener('click', () => { idx = i; paint(); c.run(); });
        node.addEventListener('mousemove', () => { if (idx !== i) { idx = i; paint(); onMove && onMove(); } });
        node.addEventListener('contextmenu', (e) => { e.preventDefault(); idx = i; paint(); c.options && c.options(); });
        return node;
      }));
      paint();
    };
    return {
      build, get idx() { return idx; },
      move(d) { const n = cards().length, next = clamp(idx + d, 0, n - 1); if (next !== idx) { idx = next; audio.play('nav'); paint(); } },
      run() { const c = cards()[idx]; c && c.run(); },
      options() { const c = cards()[idx]; c && c.options && c.options(); },
      focus(on) { box.classList.toggle('active', on); },
    };
  }

  const gb = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : Math.round(n / 1e6) + ' MB');

  // ---- your game files

  const isArchive = (p) => /\.(zip|7z|rar)$/i.test(p);

  // Archives (zip, 7z, rar) are unpacked right away, next to them, and the game inside is what gets added.
  function addFiles(after) {
    A.pick('iso').then(async (r) => {
      const picked = r.paths || (r.path ? [r.path] : []);
      if (!picked.length) return;
      const b = B(), added = [];
      for (const p of picked) {
        let path = p;
        if (isArchive(p) && (feat('budokai.autoUnpack') || !/\.zip$/i.test(p))) {
          const box = el(`<div class="bt-unpack"><div class="tag">[ UNPACKING ]</div><b>${esc(p.split(/[\\/]/).pop())}</b><span>0%</span><i><em></em></i></div>`);
          document.body.append(box);
          const r2 = await unzip(p, (pct) => { box.querySelector('span').textContent = pct + '%'; box.querySelector('em').style.width = pct + '%'; });
          box.remove();
          if (!r2.ok) { audio.play('error'); toast(r2.error || 'Could not unpack it', 'bad'); continue; }
          path = r2.path;
          if (!b.hidden.includes(p)) b.hidden.push(p);
        }
        if (!b.files.includes(path)) b.files.push(path);
        b.hidden = b.hidden.filter((x) => x !== path);
        added.push(path);
      }
      if (!added.length) return;
      if (added.length === 1) b.selected[b.emu] = added[0];
      A.save(); audio.play('confirm'); toast(added.length > 1 ? added.length + ' added' : 'Added · ready to play'); scan(); after && after();
    });
  }
  function addFolder(after) {
    A.pick('folder').then((r) => {
      if (!r.path) return;
      const b = B();
      if (!b.folders.includes(r.path)) b.folders.push(r.path);
      A.save(); toast('Looking in ' + r.path); scan(); after && after();
    });
  }
  function fileMenu(f) {
    const b = B(), meta = (b.meta[f.path] = b.meta[f.path] || {});
    A.openMenu(nameOf(f).toUpperCase(), [
      { label: 'CHANGE PICTURE', sub: 'A picture, GIF or video for this game or mod', run: () => A.pick('media').then((r) => { if (r.url) { meta.icon = r.url; A.save(); refresh && refresh(); } }) },
      ...(meta.icon ? [{ label: 'REMOVE PICTURE', run: () => { delete meta.icon; A.save(); refresh && refresh(); } }] : []),
      ...(f.kind === 'ps2' && feat('budokai.ownSave') ? [
        { label: meta.memcard ? 'CHANGE SAVE DATA' : 'SAVE DATA (MEMORY CARD)', sub: meta.memcard ? meta.memcard.split(/[\\/]/).pop() : 'A save this mod needs (.ps2 memory card). PCSX2 uses it for this game only.',
          run: () => A.pick('iso').then((r) => { if (r.path) { meta.memcard = r.path; A.save(); toast('Save data set for ' + nameOf(f)); refresh && refresh(); } }) },
        ...(meta.memcard ? [{ label: 'USE MY USUAL SAVE', sub: 'Stop using its own save data', run: () => { delete meta.memcard; A.save(); refresh && refresh(); } }] : []),
      ] : []),
      { label: 'RENAME', run: () => A.ask({ tag: 'BUDOKAI', title: 'RENAME', label: 'Name', value: nameOf(f), done: (v) => { meta.name = v.trim(); A.save(); refresh && refresh(); } }) },
      { label: 'HIDE FROM THE LIST', sub: f.path, danger: true, run: () => { b.hidden.push(f.path); A.save(); refresh && refresh(); } },
    ]);
  }

  // ---- friends (Dolphin NetPlay codes)

  function addFriend(after) {
    A.ask({ tag: 'BUDOKAI · NETPLAY', title: 'ADD A FRIEND', label: 'Their host code', placeholder: 'a1b2c3d4', button: 'NEXT', done: (code) => {
      code = code.trim();
      if (!code) return;
      A.ask({ tag: 'BUDOKAI · NETPLAY', title: 'NAME', label: 'Who is it?', placeholder: 'Goku', button: 'SAVE', done: (name) => {
        const b = B();
        b.friends.push({ name: name.trim() || code, code });
        b.friend = b.friends.length - 1;
        A.save(); after && after();
      } });
    } });
  }

  function options(after) {
    const b = B();
    A.openMenu('BUDOKAI OPTIONS', [
      { label: 'ADD GAME FILES', sub: 'ISO, CHD, RVZ, WBFS… or a .zip with the game inside', run: () => addFiles(after) },
      ...(feat('budokai.parsec') ? [{ label: 'JOIN A PARSEC LINK', sub: "A friend's Parsec invite link (they host, you play as player 2)", run: () => A.ask({ tag: 'BUDOKAI · PARSEC', title: 'JOIN A FRIEND', label: 'Their Parsec link', placeholder: 'https://parsec.gg/g/…', button: 'JOIN', done: (link) => parsec('join', { link }, (m) => { if (!m.found) return getParsec(); if (!m.ok) { audio.play('error'); toast(m.error, 'bad'); } else toast('Opening it in Parsec…'); }) }) },
      { label: 'OPEN PARSEC', sub: 'Play PS2 mods with a friend over the internet', run: () => parsec('open', {}, (m) => (m.found ? toast('Parsec is opening') : getParsec())) }] : []),
      { label: 'ADD A FOLDER', sub: 'Every game file in it shows up', run: () => addFolder(after) },
      { label: 'FULLSCREEN · ' + (b.fullscreen ? 'ON' : 'OFF'), run: () => { b.fullscreen = !b.fullscreen; A.save(); } },
      { label: 'MY CONTROLS · ' + (b.myPad === 'controller' ? 'CONTROLLER + KEYBOARD' : 'KEYBOARD ONLY'), sub: 'Player 1 in PCSX2', run: () => { b.myPad = b.myPad === 'controller' ? 'keyboard' : 'controller'; A.save(); toast('Player 1: ' + (b.myPad === 'controller' ? 'your controller and keyboard' : 'keyboard only')); after && after(); } },
      { label: "FRIEND'S CONTROLLER · " + (b.friendPad ? 'NUMBER ' + b.friendPad : 'AUTOMATIC'), sub: "If your friend's buttons move you (or nothing), try another number", run: () => { b.friendPad = (b.friendPad + 1) % 5; A.save(); toast("Friend's controller: " + (b.friendPad ? 'number ' + b.friendPad : 'automatic')); after && after(); } },
      { label: 'PCSX2 PROGRAM', sub: state.pcsx2 || 'Not found — pick pcsx2-qt.exe', run: () => A.pick('exe').then((r) => { if (r.path) { b.pcsx2Path = r.path; A.save(); scan(); } }) },
      ...(feat('budokai.dolphin') ? [{ label: 'DOLPHIN PROGRAM', sub: state.dolphin || 'Not found — pick Dolphin.exe', run: () => A.pick('exe').then((r) => { if (r.path) { b.dolphinPath = r.path; A.save(); scan(); } }) }] : []),
      { label: 'SEARCH AGAIN', run: () => { scan(); toast('Searching…'); } },
      ...(b.hidden.length ? [{ label: `SHOW ${b.hidden.length} HIDDEN`, run: () => { b.hidden = []; A.save(); after && after(); } }] : []),
    ]);
  }

  // ---- playing

  const waits = {};
  const progress = {};
  host.on('budokaiUnzip', (m) => { const s = $('#lfStatus'); if (s && A.launching) s.textContent = `UNPACKING · ${m.pct}%`; progress[m.token] && progress[m.token](m.pct); });
  host.on('budokaiUnzipped', (m) => { const w = waits[m.token]; delete waits[m.token]; w && w(m); });
  const unzip = (path, onPct) => new Promise((ok) => { const token = Math.random().toString(36).slice(2); waits[token] = (m) => { delete progress[token]; ok(m); }; if (onPct) progress[token] = onPct; host.send('budokaiUnzip', { path, token }); });

  host.on('budokaiDone', (m) => {
    // Remember your usual memory card (whatever was in slot 1 before a mod's own save went in).
    if (m.usualCard && !/^Skyvaint - /.test(m.usualCard)) { B().usualCard = m.usualCard; A.save(); }
    if (!m.ok && m.mode === 'app') { audio.play('error'); toast(m.error || "Couldn't open Dolphin", 'bad'); }
    if (!A.launching) return;
    if (!m.ok) { audio.play('error'); toast(m.error || 'Could not start', 'bad'); setTimeout(A.endLaunch, 1800); return; }
    audio.play('confirm');
    setTimeout(A.endLaunch, 1200);
    if (m.mode === 'host') showCode(m.code, m.clicked);
    else if (m.mode === 'join' && !m.clicked) toast('Dolphin is open: Tools → Start NetPlay → Connect (the code is filled in).');
  });

  function showCode(code, clicked) {
    const root = el(`<div class="overlay center"><div class="panel bt-code">
      <div class="tag">[ BUDOKAI · YOU ARE HOSTING ]</div>
      ${code ? `<h2>YOUR CODE</h2><div class="bt-code-big">${esc(code)}</div><div class="row-note">Copied. Send it to your friend: they pick JOIN A FRIEND and type it in.</div>`
        : `<h2>ALMOST THERE</h2><div class="row-note">${clicked ? 'Dolphin is hosting; your code is in its NetPlay window (top left, "Room ID").' : 'In Dolphin: Tools → Start NetPlay → Host, pick the game, press Host. Your code shows in the NetPlay window.'}</div>`}
      <div class="picker-btns">${code ? '<button class="btn primary" data-c="copy">COPY</button>' : ''}<button class="btn" data-c="ok">OK</button></div>
    </div></div>`);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      if (b.dataset.c === 'copy') { navigator.clipboard && navigator.clipboard.writeText(code).catch(() => {}); toast('Copied ' + code); }
      else A.pop();
    });
    A.push({ el: root, action(a) { if (a === 'back' || a === 'confirm') A.pop(); } });
  }

  // ---- Parsec: your friend sees your PCSX2 and plays as player 2 with their own controller

  let parsecWait = null;
  host.on('budokaiParsecState', (m) => { const w = parsecWait; parsecWait = null; w && w(m); });
  const parsec = (action, extra, then) => { parsecWait = then; host.send('budokaiParsec', { action, ...extra }); };

  function getParsec(again) {
    A.openMenu('PARSEC ISN\'T INSTALLED', [
      { label: 'GET PARSEC (FREE)', sub: 'Install it, sign in, then come back here. Your friend needs it too.', run: () => { host.send('openUrl', { url: 'https://parsec.app/downloads' }); toast('Install Parsec, sign in, then press PLAY again.'); } },
      ...(again ? [{ label: 'I INSTALLED IT · TRY AGAIN', run: again }] : []),
    ]);
  }

  function withFriend(g) {
    const b = B();
    parsec('prepare', { exe: state.pcsx2 || b.pcsx2Path || '', myPad: b.myPad, friendPad: b.friendPad }, (m) => {
      if (!m.found) { audio.play('error'); return getParsec(() => withFriend(g)); }
      if (!m.ok) { audio.play('error'); return toast(m.error || "Couldn't get Parsec ready", 'bad'); }
      audio.play('confirm');
      const root = el(`<div class="overlay center"><div class="panel bt-code bt-parsec">
        <div class="tag">[ BUDOKAI · PLAY WITH A FRIEND ]</div>
        <h2>PARSEC IS OPEN</h2>
        <ol class="bt-steps">
          <li>Sign in to Parsec if it asks (it's free).</li>
          <li>In Parsec, press <b>Share</b> on your computer and copy the invite link.</li>
          <li>Send the link to your friend. They install Parsec, open the link and join you.</li>
          <li>When they join, let them use a <b>gamepad</b>. Their controller is player 2.</li>
        </ol>
        <div class="row-note">You are player 1 on ${b.myPad === 'controller' ? 'your controller (the keyboard works too)' : 'your keyboard'}. Your friend is player 2 (controller ${esc(String(+(m.pad || 'SDL-0').split('-')[1] + 1))}). Turn your controller on <b>before</b> they join. If their buttons move you, change FRIEND'S CONTROLLER in Options. They don't need the game or the mod.</div>
        <div class="picker-btns"><button class="btn primary" data-c="go">START THE GAME</button><button class="btn" data-c="parsec">OPEN PARSEC</button><button class="btn" data-c="no">CANCEL</button></div>
      </div></div>`);
      const go = () => { A.pop(); play(g, null, true); };
      root.addEventListener('click', (e) => {
        const x = e.target.closest('[data-c]');
        if (!x) return;
        if (x.dataset.c === 'go') go();
        else if (x.dataset.c === 'parsec') parsec('open', {}, () => {});
        else A.pop();
      });
      A.push({ el: root, action(a) { if (a === 'confirm') go(); else if (a === 'back') A.pop(); } });
    });
  }

  async function play(g, onceCode, parsecReady) {
    const b = B(), f = chosen();
    if (b.emu === 'dolphin') {
      if (!state.dolphin) { audio.play('error'); toast("Dolphin isn't found. Pick it in OPTIONS.", 'bad'); return; }
      while (A.stack.length) A.pop();
      audio.play('confirm'); toast('Opening Dolphin');
      host.send('budokaiPlay', { emu: 'dolphin', exe: state.dolphin, mode: 'app', path: '' });
      return;
    }
    if (!f) { audio.play('error'); toast('Add your game file first.', 'bad'); return addFiles(refresh); }
    const exe = b.emu === 'dolphin' ? state.dolphin : state.pcsx2;
    if (!exe) { audio.play('error'); toast((b.emu === 'dolphin' ? 'Dolphin' : 'PCSX2') + " isn't found. Pick it in OPTIONS.", 'bad'); return; }
    if (b.emu === 'pcsx2' && b.psMode === 'parsec' && !parsecReady) { while (A.stack.length > 1) A.pop(); return withFriend(g); }
    const mode = b.emu === 'dolphin' ? b.mode : 'solo';
    const friend = onceCode ? { name: onceCode, code: onceCode } : b.friends[b.friend ?? 0];
    if (mode === 'join' && !friend) { audio.play('error'); toast('Add a friend code first.', 'bad'); return addFriend(refresh); }
    while (A.stack.length) A.pop();
    A.launchFx(nameOf(f), { solo: b.emu === 'dolphin' ? 'DOLPHIN' : parsecReady ? 'PCSX2 · WITH A FRIEND' : 'PCSX2', join: 'JOINING ' + (friend ? friend.name.toUpperCase() : ''), host: 'HOSTING' }[mode], '', g);
    A.armLaunchTimeout(mode === 'solo' ? 60 : 120);
    let path = f.path;
    if (f.zip) {
      const r = await unzip(f.path);
      if (!r.ok) { toast(r.error || 'Could not unpack it', 'bad'); setTimeout(A.endLaunch, 1500); return; }
      path = r.path;
      // From now on the unpacked file is used directly.
      if (!b.files.includes(path)) b.files.push(path);
      b.hidden.push(f.path);
      if (metaOf(f).name || metaOf(f).icon) b.meta[path] = { ...metaOf(f) };
      b.selected[b.emu] = path;
      A.save(); scan();
    }
    b.lastPlayed = Date.now();
    A.save();
    host.send('budokaiPlay', { emu: b.emu, exe, path, mode, code: friend ? friend.code : '', nickname: b.nickname || A.cfg.profile.name, fullscreen: !!b.fullscreen, game: g ? g.id : '',
      memcard: feat('budokai.ownSave') ? (b.meta[path] || metaOf(f)).memcard || '' : '', usualCard: b.usualCard || '', myPad: b.emu === 'pcsx2' ? b.myPad : '' });
  }

  // ---- the picker

  function open(g) {
    current = g;
    const icon = A.artSrc ? A.artSrc(g, 'icon') : '';
    const root = el(`
      <div class="overlay center"><div class="picker wide bt-picker">
        <div class="picker-head">${icon ? `<img class="picker-icon" src="${esc(icon)}" alt="">` : ''}
          <div><div class="tag">[ BUDOKAI TENKAICHI ]</div><h2>READY TO FIGHT?</h2></div><div class="picker-note"></div></div>
        <div class="picker-step tag">[ 1 — EMULATOR ]</div>
        <div class="pcards small" data-z="emu"></div>
        <div class="picker-step tag">[ 2 — GAME OR MOD ]</div>
        <div class="pcards small" data-z="files"></div>
        <div class="picker-step tag bt-step3">[ 3 — HOW TO PLAY ]</div>
        <div class="server-row bt-mode"></div>
        <div class="server-row bt-friends"></div>
        <div class="picker-btns"></div>
        <div class="hints">${hints([['confirm', 'Choose'], ['move', 'Move'], ['options', 'Options'], ['back', 'Cancel']])}</div>
      </div></div>`);
    const modeBox = $('.bt-mode', root), friendBox = $('.bt-friends', root), btnBox = $('.picker-btns', root);
    const ZONES = ['emu', 'files', 'mode', 'friends', 'btns'];
    let zone = 'files', modeIdx = 0, friendIdx = 0, btnIdx = 0;

    const emuCards = () => emus().map(([k, name, sub]) => ({
      glyph: k === 'pcsx2' ? 'PS2' : 'Wii', name, sub: (state[k] ? sub : state.scanned ? 'NOT FOUND · OPTIONS' : 'LOOKING…'), picked: B().emu === k,
      run: () => { B().emu = k; audio.play('toggle'); A.save(); build(); },
    }));
    const fileCards = () => [
      ...files().map((f) => {
        const m = metaOf(f);
        return {
          html: m.icon ? SV.media.html(m.icon, 'bt-art') : meshSVG('bt' + f.path, A.cfg.theme.accent, A.cfg.theme.accent2, 5) + `<span class="bt-tag">${f.kind === 'wii' ? 'Wii' : 'PS2'}</span>`,
          name: nameOf(f), sub: (f.zip ? 'ZIP · UNPACKS ON PLAY · ' : '') + (m.memcard ? 'OWN SAVE · ' : '') + gb(f.size), picked: chosen() === f,
          run: () => { B().selected[B().emu] = f.path; audio.play('toggle'); A.save(); build(); }, options: () => fileMenu(f),
        };
      }),
      { glyph: '+', name: 'ADD GAME / MOD', sub: 'ISO, CHD, ZIP, 7Z, RAR…', run: () => addFiles(build) },
      ...(state.scanned ? [] : [{ glyph: '…', name: 'SEARCHING', sub: 'YOUR GAME FILES', run: () => {} }]),
    ];
    const emuRow = cardRow($('[data-z=emu]', root), emuCards, () => setZone('emu'));
    const fileRow = cardRow($('[data-z=files]', root), fileCards, () => setZone('files'));

    const modes = () => (B().emu === 'dolphin'
      ? [{ label: 'OPENS THE DOLPHIN APP', on: true, run: () => {} }]
      : [['solo', 'ON MY OWN'], ...(feat('budokai.parsec') ? [['parsec', 'WITH A FRIEND · PARSEC']] : [])].map(([k, label]) => ({ label, on: B().psMode === k, run: () => { B().psMode = k; audio.play('toggle'); A.save(); build(); } })));
    const friends = () => {
      const b = B();
      return []; // Dolphin NetPlay codes are gone: Dolphin is only opened now
      // eslint-disable-next-line no-unreachable
      return [
        ...b.friends.map((f, i) => ({ label: `${f.name.toUpperCase()} · ${f.code}`, on: (b.friend ?? 0) === i, run: () => { b.friend = i; audio.play('toggle'); A.save(); build(); },
          options: () => A.openMenu(f.name.toUpperCase(), [
            { label: 'CHANGE CODE', run: () => A.ask({ tag: 'BUDOKAI', title: 'CODE', label: 'Host code', value: f.code, done: (v) => { f.code = v.trim(); A.save(); build(); } }) },
            { label: 'RENAME', run: () => A.ask({ tag: 'BUDOKAI', title: 'RENAME', label: 'Name', value: f.name, done: (v) => { f.name = v.trim() || f.name; A.save(); build(); } }) },
            { label: 'REMOVE', danger: true, run: () => { b.friends.splice(i, 1); b.friend = 0; A.save(); build(); } },
          ]) })),
        { label: '+ ADD FRIEND CODE', run: () => addFriend(build) },
      ];
    };
    const buttons = () => {
      const b = B(), f = chosen();
      const label = !f ? 'ADD YOUR GAME FIRST' : b.emu === 'pcsx2' ? (b.psMode === 'parsec' ? 'PLAY WITH A FRIEND' : 'PLAY') : 'OPEN DOLPHIN';
      return [{ label: b.emu === 'dolphin' ? 'OPEN DOLPHIN' : label, primary: true, run: () => (f || b.emu === 'dolphin' ? play(g) : addFiles(build)) }, { label: 'OPTIONS', run: () => options(build) }];
    };

    function paint() {
      emuRow.focus(zone === 'emu');
      fileRow.focus(zone === 'files');
      modeBox.querySelectorAll('.btn').forEach((x, i) => x.classList.toggle('focus', zone === 'mode' && i === modeIdx));
      friendBox.querySelectorAll('.btn').forEach((x, i) => x.classList.toggle('focus', zone === 'friends' && i === friendIdx));
      btnBox.querySelectorAll('.btn').forEach((x, i) => x.classList.toggle('focus', zone === 'btns' && i === btnIdx));
    }
    function setZone(z) { if (z !== zone) { zone = z; paint(); } }
    const strip = (box, list, idx) => { box.innerHTML = list.map((s, i) => `<button class="btn small ${s.on ? 'primary' : ''}" data-i="${i}">${esc(s.label)}</button>`).join(''); return clamp(idx, 0, Math.max(0, list.length - 1)); };
    function build() {
      emuRow.build(emus().findIndex(([k]) => k === B().emu));
      const list = files(), sel = list.indexOf(chosen());
      fileRow.build(sel >= 0 ? sel : undefined);
      const b = B();
      modeIdx = strip(modeBox, modes(), modeIdx);
      if (b.emu === 'pcsx2') modeBox.insertAdjacentHTML('beforeend', `<span class="server-note">${b.psMode === 'parsec' ? 'YOUR FRIEND SEES YOUR GAME OVER PARSEC AND PLAYS AS PLAYER 2 · THEY ONLY NEED PARSEC' : feat('budokai.parsec') ? 'PICK WITH A FRIEND TO PLAY ONLINE OVER PARSEC' : 'ON YOUR OWN'}</span>`);
      else modeBox.insertAdjacentHTML('beforeend', '<span class="server-note">JUST OPENS DOLPHIN · SWITCH IT OFF IN SETTINGS → SYSTEM</span>');
      friendIdx = strip(friendBox, friends(), friendIdx);
      friendBox.style.display = friends().length ? '' : 'none';
      btnBox.innerHTML = buttons().map((x, i) => `<button class="btn ${x.primary ? 'primary' : ''}" data-i="${i}">${esc(x.label)}</button>`).join('');
      $('.picker-note', root).textContent = chosen() ? nameOf(chosen()).toUpperCase() : '';
      paint();
    }

    modeBox.addEventListener('click', (e) => { const x = e.target.closest('.btn'); if (x) { modeIdx = +x.dataset.i; setZone('mode'); modes()[modeIdx].run(); } });
    friendBox.addEventListener('click', (e) => { const x = e.target.closest('.btn'); if (x) { friendIdx = +x.dataset.i; setZone('friends'); friends()[friendIdx].run(); } });
    friendBox.addEventListener('contextmenu', (e) => { const x = e.target.closest('.btn'); if (x) { e.preventDefault(); const f = friends()[+x.dataset.i]; f && f.options && f.options(); } });
    btnBox.addEventListener('click', (e) => { const x = e.target.closest('.btn'); if (x) { btnIdx = +x.dataset.i; setZone('btns'); buttons()[btnIdx].run(); } });
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });

    build();
    refresh = build;
    scan();
    A.push({
      el: root, onClose: () => { if (refresh === build) refresh = null; },
      action(a) {
        const dir = a === 'left' ? -1 : a === 'right' ? 1 : 0;
        const zs = ZONES.filter((z) => z !== 'friends' || friends().length);
        if (a === 'up' || a === 'down') { const next = zs[zs.indexOf(zone) + (a === 'up' ? -1 : 1)]; if (next) { audio.play('nav'); setZone(next); } }
        else if (a === 'back') A.pop();
        else if (a === 'options') { if (zone === 'files') fileRow.options(); else if (zone === 'friends') { const f = friends()[friendIdx]; f && f.options ? f.options() : options(build); } else options(build); }
        else if (zone === 'emu') { if (dir) emuRow.move(dir); else if (a === 'confirm') emuRow.run(); }
        else if (zone === 'files') { if (dir) fileRow.move(dir); else if (a === 'confirm') fileRow.run(); }
        else {
          const list = zone === 'mode' ? modes() : zone === 'friends' ? friends() : buttons();
          let i = zone === 'mode' ? modeIdx : zone === 'friends' ? friendIdx : btnIdx;
          if (dir) { i = clamp(i + dir, 0, list.length - 1); audio.play('nav'); }
          if (zone === 'mode') modeIdx = i; else if (zone === 'friends') friendIdx = i; else btnIdx = i;
          if (dir) paint(); else if (a === 'confirm' && list[i]) list[i].run();
        }
      },
    });
  }

  SV.budokai = { open, scan };
})();

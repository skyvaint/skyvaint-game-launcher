// Accounts: the "who's playing?" pickers for Epic games and Roblox, and the settings rows that manage them.
// Epic accounts are saved sign-ins the shell swaps in before the Epic launcher starts; Roblox accounts each
// live in their own browser profile (this is the old Roblox manager, folded in).
(() => {
  const A = SV.app, { host, audio, bg, fx } = SV;
  const { $, el, esc, clamp, hash, shiftHue, meshSVG, toast, hints, R, heading } = A;
  const cfg = () => A.cfg;
  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // A horizontal row of big cards with keyboard / pad navigation. `cards()` is re-read on every rebuild.
  function cardRow(box, cards, onMove) {
    let idx = 0;
    const paint = () => box.querySelectorAll('.pcard').forEach((c, i) => {
      c.classList.toggle('focus', i === idx);
      if (i === idx) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    const build = (keep) => {
      const list = cards();
      idx = clamp(keep ?? idx, 0, Math.max(0, list.length - 1));
      box.replaceChildren(...list.map((c, i) => {
        const node = el(`
          <button class="pcard ${c.hot ? 'hot' : ''} ${c.picked ? 'picked' : ''} ${c.glyph ? 'plain' : ''}">
            <div class="pcard-art">${c.glyph ? `<em>${c.glyph}</em>` : c.html}<i class="pcard-check">✓</i></div>
            <b>${esc(c.name)}</b><small>${esc(c.sub || '')}</small>
          </button>`);
        node.addEventListener('click', () => { idx = i; paint(); c.run(); });
        node.addEventListener('mousemove', () => { if (idx !== i) { idx = i; paint(); onMove && onMove(); } });
        return node;
      }));
      paint();
    };
    return {
      build,
      get idx() { return idx; },
      set idx(v) { idx = v; paint(); },
      move(d) { const n = cards().length, next = clamp(idx + d, 0, n - 1); if (next !== idx) { idx = next; audio.play('nav'); paint(); } },
      run() { const c = cards()[idx]; c && c.run(); },
      focus(on) { box.classList.toggle('active', on); },
    };
  }

  // Any account (Epic or Roblox) can carry a picture of your own in `avatar`.
  const setPicture = (a, after) => A.pick('image').then((f) => {
    if (!f.url) return;
    a.avatar = f.url;
    A.changed('games'); after && after(); epicRefresh && epicRefresh(); refresh(); toast('Picture set');
  });
  const clearPicture = (a, after) => { a.avatar = ''; A.changed('games'); after && after(); epicRefresh && epicRefresh(); refresh(); };

  // ================================================================== EPIC

  let epicState = { installed: true, active: null, awaiting: false };
  let epicRefresh = null; // rebuilds the open picker, if any
  const pendingNames = {};

  const epicColours = (a) => [shiftHue('#ff2a2a', hash(a.name) % 360), shiftHue('#ff2a2a', (hash(a.name) >>> 7) % 360)];
  function epicAvatar(a) {
    const [c1, c2] = epicColours(a);
    return meshSVG('epic' + a.id, c1, c2, 5) + (a.avatar
      ? `<img class="face" src="${esc(a.avatar)}" draggable="false" alt="">`
      : `<span class="initial">${esc((a.name[0] || '?').toUpperCase())}</span>`);
  }
  // "Needs sign-in": the saved sign-in is empty, so Epic will ask once (tick "Remember me") and it is saved after that.
  const epicSub = (a) => (epicState.usable && epicState.usable[a.id] === false ? 'NEEDS SIGN-IN'
    : epicState.active === a.id ? 'SIGNED IN NOW' : a.lastUsed ? 'LAST USED ' + A.lastPlayed(a.lastUsed) : 'SAVED');

  function saveCurrent(suggest = '') {
    if (!epicState.installed) return toast("The Epic Games Launcher doesn't look installed.", 'bad');
    A.ask({
      tag: 'EPIC GAMES', title: 'NAME THIS ACCOUNT', label: 'Account name', value: suggest, placeholder: 'e.g. Main, Smurf, skyvaint2',
      desc: 'Saves whoever the Epic launcher is signed in as right now. Use the Epic display name so you recognise it.',
      done: (name) => {
        // Saving under a name you already use updates that account; any other name is a new one.
        const same = cfg().epic.accounts.find((a) => a.name.trim().toLowerCase() === name.toLowerCase());
        const id = same ? same.id : newId();
        pendingNames[id] = name;
        host.send('epicCapture', { id });
      },
    });
  }

  function signInAnother() {
    A.openMenu('SIGN IN TO ANOTHER EPIC ACCOUNT', [
      { label: 'CANCEL' },
      { label: 'OPEN EPIC SIGN-IN', sub: 'Closes the Epic launcher and reopens it signed out', run: () => {
        host.send('epicSignIn');
        toast('Epic is reopening — sign in there and keep "Remember me" ticked.');
      } },
    ], 'The account signed in now is saved first if it is one of yours. Sign in on Epic\'s own window; this app never sees your password. When Epic is back in, you will be asked to name the account.');
  }

  function addEpic() {
    A.openMenu('ADD EPIC ACCOUNT', [
      { label: 'SAVE THE ONE SIGNED IN NOW', sub: 'Whoever the Epic launcher is using at the moment', run: () => saveCurrent() },
      { label: 'SIGN IN TO ANOTHER ACCOUNT', sub: 'Reopens Epic on its sign-in screen', run: signInAnother },
    ], cfg().epic.accounts.length ? '' : 'Save each Epic account once. After that, Fortnite and Rocket League ask which one to play as.');
  }

  host.on('epicCaptured', (m) => {
    const name = pendingNames[m.id] || pendingNames[Object.keys(pendingNames).pop()] || 'Epic account';
    for (const k in pendingNames) delete pendingNames[k];
    if (!m.ok) { audio.play('error'); return toast(m.error || 'Could not save that account.', 'bad'); }
    const list = cfg().epic.accounts, existing = list.find((a) => a.id === m.id);
    if (existing) {
      existing.epicId = m.epicId || existing.epicId;
      toast(`${existing.name} updated with the current Epic sign-in`);
    } else {
      list.push({ id: m.id, name, epicId: m.epicId || '', avatar: '', lastUsed: 0 });
      audio.play('pick');
      toast(`${name} saved`);
    }
    if (m.warn) setTimeout(() => toast('Epic did not look signed in with "Remember me" — switching may ask you to sign in.', 'bad'), 900);
    epicState.active = m.id;
    A.changed('games');
    epicRefresh && epicRefresh();
  });
  host.on('epicState', (m) => { epicState = m.epic || epicState; A.renderStats(); epicRefresh && epicRefresh(); });
  host.on('epicFailed', (m) => { audio.play('error'); toast(m.error, 'bad'); });
  host.on('epicPrepared', (m) => {
    epicState = m.epic || epicState;
    if (m.ok) { audio.play('pick'); toast('Epic is ready on that account'); } else { audio.play('error'); toast(m.error || 'Could not switch Epic.', 'bad'); }
    A.renderStats(); epicRefresh && epicRefresh();
  });
  host.on('epicSignedIn', (m) => {
    epicState = m.epic || epicState;
    saveCurrent();
  });

  function epicMenu(a) {
    A.openMenu(a.name, [
      { label: 'RENAME', run: () => A.ask({ tag: 'EPIC GAMES', title: 'RENAME', label: 'Account name', value: a.name, done: (v) => { a.name = v; A.changed('games'); epicRefresh && epicRefresh(); } }) },
      { label: 'CHANGE PICTURE', sub: 'Pick an image for this account', run: () => setPicture(a) },
      ...(a.avatar ? [{ label: 'REMOVE PICTURE', run: () => clearPicture(a) }] : []),
      { label: 'SWITCH EPIC TO THIS ACCOUNT', sub: 'Signs the Epic launcher in as this account, without starting a game', run: () => { host.send('epicPrepare', { id: a.id }); toast('Switching Epic to ' + a.name + '…'); } },
      { label: 'UPDATE SIGN-IN', sub: 'Save the current Epic sign-in over this account', run: () => { pendingNames[a.id] = a.name; host.send('epicCapture', { id: a.id }); } },
      { label: 'FORGET', danger: true, run: () => removeEpic(a) },
    ]);
  }

  function removeEpic(a, after) {
    A.confirmMenu(`Forget ${a.name}?`, 'FORGET', () => {
      cfg().epic.accounts = cfg().epic.accounts.filter((x) => x !== a);
      host.send('epicRemove', { id: a.id });
      A.changed('games'); after && after(); toast(`${a.name} removed from this launcher`);
    });
  }

  SV.epic = {
    init(state) { if (state) epicState = state; },
    get installed() { return !!(epicState && epicState.installed); },

    statFor() {
      const list = cfg().epic.accounts;
      if (!list.length) return null;
      const now = list.find((a) => a.id === epicState.active);
      return ['EPIC ACCOUNT', now ? now.name.toUpperCase() : 'NOT SAVED'];
    },

    // Asks which Epic account to start `g` with, then calls done(account). An account without an id means "don't switch".
    choose(g, done) {
      host.send('epicState');
      const root = el(`
        <div class="overlay center"><div class="picker">
          <div class="picker-head">${A.artSrc(g, 'icon') ? `<img class="picker-icon" src="${esc(A.artSrc(g, 'icon'))}" alt="">` : ''}
            <div><div class="tag">[ EPIC GAMES · ${esc(g.name)} ]</div><h2>WHO'S PLAYING?</h2></div></div>
          <div class="pcards active"></div>
          <div class="hints">${hints([['confirm', 'Play as'], ['adjust', 'Choose'], ['options', 'Rename / picture'], ['back', 'Cancel']])}</div>
        </div></div>`);
      const close = () => { if (A.isTop(root)) A.pop(); };
      const cards = () => {
        const list = cfg().epic.accounts.map((a) => ({
          html: epicAvatar(a), name: a.name, sub: epicSub(a), hot: epicState.active === a.id,
          run: () => { close(); audio.play('pick'); done(a); },
        }));
        if (!epicState.active || !list.length)
          list.push({ glyph: '▶', name: list.length ? 'CURRENT SIGN-IN' : 'JUST PLAY', sub: 'Whoever Epic is signed in as', run: () => { close(); done({ name: '' }); } });
        list.push({ glyph: '+', name: 'ADD ACCOUNT', sub: 'Save another Epic sign-in', run: addEpic });
        return list;
      };
      const row = cardRow($('.pcards', root), cards);
      const remembered = cfg().epic.accounts.findIndex((a) => a.id === (cfg().epic.last[g.id] || epicState.active));
      row.build(Math.max(0, remembered));
      epicRefresh = () => row.build();
      root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
      A.push({
        el: root, onClose: () => { epicRefresh = null; },
        action(a) {
          if (a === 'left' || a === 'right') row.move(a === 'left' ? -1 : 1);
          else if (a === 'confirm') row.run();
          else if (a === 'options') { const acc = cfg().epic.accounts[row.idx]; acc ? epicMenu(acc) : addEpic(); }
          else if (a === 'back') A.pop();
        },
      });
    },

    rows(rerender) {
      const list = cfg().epic.accounts;
      return [
        heading('EPIC GAMES — FORTNITE, ROCKET LEAGUE'),
        ...list.map((a) => R.buttons(a.name, epicSub(a).toLowerCase(), [
          ['RENAME', () => A.ask({ tag: 'EPIC GAMES', title: 'RENAME', label: 'Account name', value: a.name, done: (v) => { a.name = v; A.changed('games'); rerender(); } })],
          ['PICTURE', () => setPicture(a, rerender)],
          ['FORGET', () => removeEpic(a, rerender), 'danger'],
        ])),
        R.button('Save the signed-in Epic account', list.length ? 'Adds whoever the Epic launcher is using now.' : 'Start here: saves the account Epic is using right now.', 'SAVE', () => saveCurrent()),
        R.button('Sign in to another Epic account', 'Reopens Epic signed out so you can add a second account.', 'SIGN IN', signInAnother),
      ];
    },
  };

  // ================================================================== STEAM

  // Steam remembers its own sign-ins; the shell only chooses which one Steam opens with, so there is nothing to save
  // here. `steam.accounts` is Steam's list for this PC, and a game's owners come from the scan.
  let steam = { installed: true, accounts: [], active: null, signedIn: null, awaiting: false };
  const steamAcc = (id) => steam.accounts.find((a) => a.steamId === id);
  const steamName = (a) => (a.persona && a.persona !== a.name ? `${a.persona} (${a.name})` : a.name);
  const ownersOf = (g) => ((SV.app.scanOf(g) || {}).owners || []).filter(steamAcc);

  // Mirrors the shell's choice: picked by hand, else whoever is in if they own it, else an owner Steam remembers.
  function steamAccountFor(g) {
    if (g.steamAccount && steamAcc(g.steamAccount)) return g.steamAccount;
    const owners = ownersOf(g);
    return !owners.length || owners.includes(steam.active) ? steam.active : owners[0];
  }

  function addSteam() {
    A.openMenu('ADD STEAM ACCOUNT', [
      { label: 'CANCEL' },
      { label: 'OPEN STEAM SIGN-IN', sub: 'Closes Steam and reopens it on its account chooser', run: () => {
        host.send('steamAddAccount');
        toast('Steam is reopening. Pick "Add account", sign in and tick "Remember me".');
      } },
    ], 'Sign in on Steam\'s own window; this app never sees the password. Once that account is in, its games are scanned and it can be switched to from here.');
  }

  function steamSwitch(a) {
    host.send('steamSwitch', { id: a.steamId });
    toast('Switching Steam to ' + a.persona + '…');
  }

  host.on('steamState', (m) => { steam = m.steam || steam; A.renderStats(); });
  host.on('steamFailed', (m) => { audio.play('error'); toast(m.error, 'bad'); });
  host.on('steamPrepared', (m) => {
    steam = m.steam || steam;
    if (m.ok) { audio.play('pick'); toast('Steam is ready on that account'); } else { audio.play('error'); toast(m.error || 'Could not switch Steam.', 'bad'); }
    A.renderStats();
  });
  host.on('steamSignedIn', (m) => {
    steam = m.steam || steam;
    const a = steamAcc(steam.signedIn);
    audio.play('pick');
    toast(a ? `${a.persona} is signed in to Steam` : 'Steam is signed in');
    A.renderStats();
  });

  SV.steam = {
    init(state) { if (state) steam = state; },
    get installed() { return !!(steam && steam.installed); },
    get accounts() { return steam.accounts; },
    accountFor: steamAccountFor,

    statFor(g) {
      if (steam.accounts.length < 2) return null;
      const a = steamAcc(steamAccountFor(g));
      return ['STEAM ACCOUNT', a ? a.persona.toUpperCase() : 'NOT SIGNED IN'];
    },

    // Shown on the launch screen when starting the game means switching Steam to someone else.
    launchName(g) {
      const id = steamAccountFor(g), a = steamAcc(id);
      return a && id !== steam.active ? 'AS ' + a.persona.toUpperCase() : '';
    },

    // Picks which account a game always starts on; "automatic" follows whoever owns it.
    choose(g) {
      const owners = ownersOf(g);
      A.openMenu(g.name + ' · STEAM ACCOUNT', [
        { label: 'AUTOMATIC', sub: owners.length ? 'Owned by ' + owners.map((id) => steamAcc(id).persona).join(', ') : 'Whoever Steam is signed in as',
          run: () => { delete g.steamAccount; A.changed('games'); toast(g.name + ' starts on its owner'); } },
        ...steam.accounts.map((a) => ({
          label: a.persona, sub: (g.steamAccount === a.steamId ? 'CHOSEN · ' : '') + (owners.includes(a.steamId) ? 'owns it' : 'account ' + a.name),
          run: () => { g.steamAccount = a.steamId; A.changed('games'); toast(`${g.name} starts on ${a.persona}`); },
        })),
      ], 'Useful for a game that is not installed yet, so its owner is not known.');
    },

    rows(rerender) {
      const sub = (a) => [a.name, a.steamId === steam.signedIn ? 'signed in now' : a.steamId === steam.active ? 'opens next' : 'saved on this PC',
        a.remembered ? '' : 'needs sign-in'].filter(Boolean).join(' · ');
      return [
        heading('STEAM — GAMES START ON THE ACCOUNT THAT OWNS THEM'),
        ...(!steam.installed ? [el('<div class="row-note">Steam doesn\'t look installed.</div>')] : steam.accounts.map((a) => R.buttons(a.persona, sub(a), [
          ['SWITCH', () => steamSwitch(a)],
        ]))),
        R.button('Add another Steam account', 'Opens Steam\'s own sign-in. Tick "Remember me" so it can be switched to later.', 'ADD', () => { addSteam(); rerender && rerender(); }),
      ];
    },
  };

  // ================================================================== ROBLOX

  const MAX_ACCOUNTS = 24;
  const rb = () => cfg().roblox;
  let clients = 0, robloxGame = null, instances = []; // instances: open Roblox clients as { pid, account, started, mem }
  const instancesOf = (a) => instances.filter((i) => i.account === a.id);
  const closeInstance = (pid) => host.send('killProcess', { pid });

  const label = (a) => a.alias || a.displayName || a.username;
  const isPicked = (a) => rb().selected.includes(a.id);
  const picked = () => rb().accounts.filter(isPicked);
  const place = () => rb().places[rb().placeIdx];

  // Each account gets its own colour pair, derived from its username so it never changes.
  const colours = (a) => [shiftHue(cfg().theme.accent, hash(a.username) % 360), shiftHue(cfg().theme.accent2, (hash(a.username) >>> 5) % 360)];
  function face(a, kind = 'head') {
    const [c1, c2] = colours(a), src = a.avatar || (kind === 'body' ? a.body || a.head : a.head);
    return meshSVG(a.id + kind, c1, c2, 6) + (src
      ? `<img class="face" src="${esc(src)}" draggable="false" alt="">`
      : `<span class="initial">${esc((label(a)[0] || '?').toUpperCase())}</span>`);
  }

  let robloxRefresh = null;
  const refresh = () => { robloxRefresh && robloxRefresh(); };

  function addAccount(id) {
    if (!id && rb().accounts.length >= MAX_ACCOUNTS) return toast(`That's the limit — ${MAX_ACCOUNTS} accounts.`, 'bad');
    host.send('robloxAddAccount', { id: id || newId() });
    toast('Sign in on the Roblox window that just opened.');
  }

  host.on('robloxAccountReady', (m) => {
    const fresh = { userId: m.userId, username: m.username, displayName: m.displayName, head: m.head, body: m.body };
    const list = rb().accounts, existing = list.find((a) => a.id === m.id);
    if (existing) {
      Object.assign(existing, fresh);
      toast(`${label(existing)} is signed in`);
    } else if (list.some((a) => a.userId === m.userId)) {
      host.send('robloxRemoveAccount', { id: m.id }); // same Roblox user in a second profile: drop the duplicate
      return toast(`@${m.username} is already in your list.`, 'bad');
    } else {
      list.push({ id: m.id, alias: '', lastPlayed: 0, ...fresh });
      audio.play('pick');
      toast(`@${m.username} added`);
    }
    A.changed('games');
    refresh();
  });
  host.on('robloxAccountCancelled', () => toast('Sign-in window closed — nothing was added.'));
  host.on('robloxChecked', (m) => {
    const a = rb().accounts.find((x) => x.id === m.id), name = a ? label(a) : 'Account';
    if (m.ok) { audio.play('pick'); toast(`${name} is signed in as @${m.name} and ready to launch`); }
    else { audio.play('error'); toast(`${name}: ${m.error}`, 'bad'); }
  });

  function removeAccount(a, after) {
    A.confirmMenu(`Remove ${label(a)}?`, 'REMOVE', () => {
      rb().accounts = rb().accounts.filter((x) => x !== a);
      rb().selected = rb().selected.filter((id) => id !== a.id);
      host.send('robloxRemoveAccount', { id: a.id });
      A.changed('games'); after && after(); refresh(); toast(`${label(a)} removed and signed out here`);
    });
  }

  const rename = (a, after) => A.ask({
    tag: '@' + a.username, title: 'RENAME', label: 'Label', value: a.alias || '', placeholder: a.displayName,
    desc: 'Shown instead of the Roblox display name.', done: (v) => { a.alias = v; A.changed('games'); after && after(); refresh(); },
  });

  // ---- places

  const lookups = {};
  host.on('robloxPlaceResolved', (m) => { const done = lookups[m.token]; delete lookups[m.token]; done && done(m); });

  // Accepts a full private-server link, a roblox.com share link, or the bare code. undefined = not recognised.
  function parseServer(text) {
    const t = String(text).trim();
    const link = t.match(/privateServerLinkCode=([\w-]+)/i);
    if (link) return { code: link[1], placeId: +(t.match(/games\/(\d+)/) || [])[1] || 0 };
    if (/^https:\/\/(www\.)?roblox\.com\/share/i.test(t)) return { share: t };
    if (/^[\w-]{6,128}$/.test(t)) return { code: t };
    return undefined;
  }

  function addPlace(after) {
    A.ask({
      tag: 'ROBLOX PLACES', title: 'ADD A PLACE', label: 'Game link or place ID', button: 'ADD', placeholder: 'https://www.roblox.com/games/…',
      desc: 'Like roblox.com/games/920587237, the number alone, or a private server link.',
      done: (input) => {
        toast('Looking it up on Roblox…');
        const token = newId();
        lookups[token] = (m) => {
          if (m.error || !m.place) { audio.play('error'); return toast(m.error || 'Could not find that place.', 'bad'); }
          const r = rb(), existing = r.places.findIndex((x) => x.placeId === m.place.placeId);
          if (existing >= 0) r.placeIdx = existing;
          else { r.places.push(m.place); r.placeIdx = r.places.length - 1; }
          // A pasted private-server link carries both the place and the code, so keep the code too.
          const pasted = parseServer(input);
          if (pasted && pasted.code && /privateServerLinkCode/i.test(input)) r.places[r.placeIdx].server = { code: pasted.code };
          A.changed(); after && after(); refresh(); toast(m.place.name + ' added');
        };
        host.send('robloxResolvePlace', { token, input });
      },
    });
  }

  function setServer(p, after) {
    A.ask({
      tag: p.name, title: 'PRIVATE SERVER', label: 'Private server link or code', placeholder: 'https://www.roblox.com/games/…?privateServerLinkCode=…',
      desc: 'Paste the invite link, a roblox.com/share link, or just the code.',
      done: (input) => {
        const s = parseServer(input);
        if (!s) { audio.play('error'); return toast("That isn't a private server link or code.", 'bad'); }
        if (s.placeId && s.placeId !== p.placeId) { audio.play('error'); return toast('That link is for a different game — add that game as its own place.', 'bad'); }
        p.server = s.share ? { share: s.share } : { code: s.code };
        A.changed(); after && after(); refresh(); toast('Private server saved for ' + p.name);
      },
    });
  }

  function removePlace(p, after) {
    A.confirmMenu(`Remove ${p.name}?`, 'REMOVE', () => {
      const r = rb();
      r.places = r.places.filter((x) => x !== p);
      r.placeIdx = clamp(r.placeIdx, 0, Math.max(0, r.places.length - 1));
      A.changed(); after && after(); refresh();
    });
  }

  function cyclePlace(d) {
    const r = rb();
    if (r.places.length < 2) return;
    r.placeIdx = (r.placeIdx + d + r.places.length) % r.places.length;
    audio.play('toggle');
    A.save();
    refresh();
  }

  function placeMenu() {
    const p = place(), r = rb();
    A.openMenu('PLACES', [
      ...r.places.map((x, i) => ({
        label: x.name, sub: `${x.server ? 'Private server' : 'Public servers'}${i === r.placeIdx ? ' · current' : ''}`,
        run: () => { r.placeIdx = i; A.save(); refresh(); },
      })),
      { label: 'ADD A PLACE', sub: 'Paste a game link or place ID', run: () => addPlace() },
      ...(p ? [{ label: p.server ? 'CHANGE PRIVATE SERVER' : 'JOIN A PRIVATE SERVER', sub: 'Paste its link or code for ' + p.name, run: () => setServer(p) }] : []),
      ...(p && p.server ? [{ label: 'BACK TO PUBLIC SERVERS', sub: 'Forget the private server for ' + p.name, run: () => { delete p.server; A.save(); refresh(); toast('Using public servers'); } }] : []),
      ...(p ? [{ label: 'REMOVE CURRENT', sub: p.name, danger: true, run: () => removePlace(p) }] : []),
    ], r.places.length ? 'Pick where your accounts will join.' : 'Add the Roblox game you want to play.');
  }

  // ---- playing

  const STATUS = { launching: 'STARTING…', launched: 'LAUNCHED', failed: 'FAILED' };

  function play(list) {
    if (A.launching || !list.length) return;
    const p = place();
    if (!p) { audio.play('error'); toast('Add a place to play first.', 'bad'); return addPlace(); }
    if (list.length > 1 && !rb().multiInstance) toast('Multi-instance is off — only one client will stay open.');
    while (A.stack.length) A.pop();

    A.launchFx(p.name, p.server ? 'PRIVATE SERVER' : '', list.map((a) =>
      `<div class="lf-acct" data-id="${esc(a.id)}"><div class="lf-face">${face(a)}</div><b>${esc(label(a))}</b><span>QUEUED</span></div>`).join(''), robloxGame);
    const now = Date.now();
    list.forEach((a) => { a.lastPlayed = now; });
    p.lastPlayed = now;
    A.save();
    setTimeout(() => host.send('robloxPlay', { ids: list.map((a) => a.id), placeId: p.placeId, server: p.server || null, game: robloxGame ? robloxGame.id : '' }), 900);
    A.armLaunchTimeout(240 + list.length * 45); // safety net only; the shell reports when it is done
  }

  host.on('robloxPlayStatus', (m) => {
    const a = rb().accounts.find((x) => x.id === m.id), name = a ? label(a) : 'Account';
    const line = $(`#lfList .lf-acct[data-id="${CSS.escape(m.id)}"]`);
    if (line) {
      line.dataset.status = m.status;
      line.lastElementChild.textContent = m.status === 'failed' ? (m.error || 'FAILED') : STATUS[m.status];
    }
    if (m.status === 'launched') { audio.play('confirm'); if (A.mode !== 'home') toast(name + ' launched'); }
    if (m.status === 'failed') { audio.play('error'); toast(`${name}: ${m.error || 'failed'}`, 'bad'); }
  });
  host.on('robloxPlayDone', (m) => {
    if (!A.launching) return;
    // On success the shell keeps the launch screen until Roblox's window is up, then switches mode, which clears it.
    if (m.ok) A.armLaunchTimeout();
    else setTimeout(A.endLaunch, 1800);
  });
  host.on('robloxClients', (m) => { clients = m.count; instances = m.instances || []; A.renderStats(); refresh(); });

  SV.roblox = {
    // Takes over what the standalone Roblox manager had saved, the first time only. True when something came across.
    init(old) {
      const r = rb(), flags = cfg().imported;
      if (flags.robloxManager || !old) return false;
      flags.robloxManager = true;
      if (r.accounts.length || !Array.isArray(old.accounts) || !old.accounts.length) return false;
      r.accounts = old.accounts;
      r.places = Array.isArray(old.places) ? old.places : [];
      r.selected = Array.isArray(old.selected) ? old.selected : [];
      r.placeIdx = clamp(old.placeIdx || 0, 0, Math.max(0, r.places.length - 1));
      if (typeof old.multiInstance === 'boolean') r.multiInstance = old.multiInstance;
      if (typeof old.launchDelay === 'number') r.launchDelay = old.launchDelay;
      return true;
    },

    nameFor(accountId) { const a = rb().accounts.find((x) => x.id === accountId); return a ? label(a) : ''; },
    accounts: () => rb().accounts,
    label,
    face,

    // Joins a friend's game as the account they are friends with: straight into their server when Roblox says
    // which one, otherwise by following them in.
    joinFriend(f, accountId) {
      const a = rb().accounts.find((x) => x.id === accountId);
      if (!a) { audio.play('error'); return toast('Add a Roblox account first.', 'bad'); }
      if (A.launching) return;
      while (A.stack.length) A.pop();
      const game = cfg().games.find((x) => x.target === 'sv:roblox') || null, who = f.displayName || f.name;
      A.launchFx(f.where || 'JOINING ' + who.toUpperCase(), 'WITH ' + who.toUpperCase(),
        `<div class="lf-acct" data-id="${esc(a.id)}"><div class="lf-face">${face(a)}</div><b>${esc(label(a))}</b><span>QUEUED</span></div>`, game);
      a.lastPlayed = Date.now();
      A.save();
      setTimeout(() => host.send('robloxPlay', { ids: [a.id], placeId: +(f.rootPlaceId || f.placeId || 0), followUserId: f.id, jobId: f.gameId || '', server: null, game: game ? game.id : '' }), 900);
      A.armLaunchTimeout(240);
    },

    // For the game lists and the rows under HOME.
    places: () => rb().places,
    // The account / server picker with one place already chosen.
    openAt(g, i) {
      const r = rb();
      if (i >= 0 && i < r.places.length) { r.placeIdx = i; A.save(); }
      SV.roblox.open(g || robloxGame || cfg().games.find((x) => x.target === 'sv:roblox') || { id: 'roblox_player', name: 'Roblox', target: 'sv:roblox' });
    },
    // Plays a place that may not be saved yet (from DISCOVER or Studio): adds it, then opens the picker on it.
    playPlace(pl) {
      const r = rb(), id = +pl.placeId;
      let i = r.places.findIndex((x) => +x.placeId === id);
      if (i < 0) { r.places.push({ placeId: id, name: pl.name, icon: pl.icon || '' }); i = r.places.length - 1; A.changed(); }
      SV.roblox.openAt(null, i);
    },
    addPlace: (after) => addPlace(after),
    setServer: (p, after) => setServer(p, after),
    removePlace: (p, after) => removePlace(p, after),
    movePlace(p, d, after) {
      const r = rb(), i = r.places.indexOf(p), j = i + d;
      if (i < 0 || j < 0 || j >= r.places.length) return;
      [r.places[i], r.places[j]] = [r.places[j], r.places[i]];
      A.save(); after && after();
    },

    stat() {
      const n = rb().accounts.length;
      return clients ? ['CLIENTS OPEN', String(clients)] : ['ACCOUNTS', n ? String(n) : 'NONE YET'];
    },

    powerItems: () => (clients ? [{ label: 'CLOSE ALL ROBLOX', sub: `Ends ${clients} open client${clients > 1 ? 's' : ''}`, danger: true,
      run: () => A.confirmMenu('Close every Roblox client?', 'CLOSE ALL', () => host.send('robloxCloseClients')) }] : []),

    // The Roblox "who's playing?" screen, top to bottom: 1 account(s), 2 place, 3 server, then play.
    open(g) {
      robloxGame = g;
      const icon = A.artSrc(g, 'icon');
      const root = el(`
        <div class="overlay center"><div class="picker wide">
          <div class="picker-head">${icon ? `<img class="picker-icon" src="${esc(icon)}" alt="">` : ''}
            <div><div class="tag">[ ROBLOX ]</div><h2>WHO'S PLAYING?</h2></div><div class="picker-note"></div></div>
          <div class="picker-step tag">[ 1 — ACCOUNT · TICK ONE OR MORE ]</div>
          <div class="pcards" data-z="accounts"></div>
          <div class="picker-step tag">[ 2 — PLACE ]</div>
          <div class="pcards small" data-z="places"></div>
          <div class="picker-step tag">[ 3 — SERVER ]</div>
          <div class="server-row"></div>
          <div class="picker-btns"></div>
          <div class="hints">${hints([['confirm', 'Choose'], ['move', 'Move'], ['options', 'Options'], ['back', 'Cancel']])}</div>
        </div></div>`);
      const serverBox = $('.server-row', root), btnBox = $('.picker-btns', root);
      const ZONES = ['accounts', 'places', 'server', 'btns'];
      let zone = 'accounts', srvIdx = 0, btnIdx = 0;

      const toggle = (a) => {
        const r = rb();
        r.selected = isPicked(a) ? r.selected.filter((id) => id !== a.id) : [...r.selected, a.id];
        audio.play('toggle'); A.save(); build();
      };
      const accountCards = () => [
        ...rb().accounts.map((a) => ({ html: face(a), name: label(a), sub: instancesOf(a).length ? 'RUNNING · TAB TO CLOSE' : '@' + a.username, hot: instancesOf(a).length > 0, picked: isPicked(a), run: () => toggle(a) })),
        { glyph: '+', name: 'ADD ACCOUNT', sub: 'Sign in on roblox.com', run: () => addAccount() },
      ];
      const placeCards = () => [
        ...rb().places.map((p, i) => ({
          html: p.icon ? `<div class="place-art" style="background-image:url('${esc(p.icon)}')"></div>` : meshSVG('place' + p.placeId, cfg().theme.accent, cfg().theme.accent2, 4),
          name: p.name, sub: p.server ? 'PRIVATE SERVER' : 'PUBLIC SERVERS', picked: i === rb().placeIdx,
          run: () => { rb().placeIdx = i; audio.play('toggle'); A.save(); build(); },
        })),
        { glyph: '+', name: 'ADD PLACE', sub: 'Game link or place ID', run: () => addPlace() },
      ];
      const accRow = cardRow($('[data-z=accounts]', root), accountCards, () => setZone('accounts'));
      const placeRow = cardRow($('[data-z=places]', root), placeCards, () => setZone('places'));
      const focused = () => rb().accounts[accRow.idx];
      const chosen = () => (picked().length ? picked() : focused() ? [focused()] : []);
      const servers = () => {
        const p = place();
        if (!p) return [{ label: 'ADD A PLACE FIRST', run: () => addPlace() }];
        return [
          { label: 'PUBLIC SERVERS', on: !p.server, run: () => { if (p.server) { delete p.server; A.save(); toast('Using public servers'); } audio.play('toggle'); build(); } },
          { label: p.server ? 'PRIVATE SERVER  ·  CHANGE LINK' : 'PRIVATE SERVER  ·  PASTE LINK', on: !!p.server, run: () => setServer(p) },
        ];
      };
      const openOnly = () => {
        while (A.stack.length) A.pop();
        A.launchFx('Roblox', '', '', g);
        setTimeout(() => host.send('launch', { id: g.id }), 1300);
        A.armLaunchTimeout();
      };
      const buttons = () => {
        const n = chosen().length;
        return [
          { label: n > 1 ? `PLAY ${n} ACCOUNTS` : n ? 'PLAY AS ' + label(chosen()[0]).toUpperCase() : 'ADD AN ACCOUNT FIRST', primary: true, run: () => (n ? play(chosen()) : addAccount()) },
          { label: 'OPEN ROBLOX ONLY', run: openOnly },
        ];
      };

      function paint() {
        accRow.focus(zone === 'accounts');
        placeRow.focus(zone === 'places');
        serverBox.querySelectorAll('.btn').forEach((b, i) => b.classList.toggle('focus', zone === 'server' && i === srvIdx));
        btnBox.querySelectorAll('.btn').forEach((b, i) => b.classList.toggle('focus', zone === 'btns' && i === btnIdx));
      }
      function setZone(z) { if (z !== zone) { zone = z; paint(); } }
      function build() {
        accRow.build();
        placeRow.build();
        const list = servers(), p = place();
        srvIdx = clamp(srvIdx, 0, list.length - 1);
        serverBox.innerHTML = list.map((s, i) => `<button class="btn small ${s.on ? 'primary' : ''}" data-i="${i}">${esc(s.label)}</button>`).join('') +
          (p ? `<span class="server-note">${esc(p.server ? (p.server.code ? 'LINK CODE ' + p.server.code.slice(0, 12) + '…' : 'SHARE LINK SAVED') + ' · FOR ' + p.name : 'JOINS A NORMAL SERVER OF ' + p.name)}</span>` : '');
        btnBox.innerHTML = buttons().map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('');
        $('.picker-note', root).textContent = clients ? `${clients} CLIENT${clients > 1 ? 'S' : ''} OPEN` : picked().length ? `${picked().length} TICKED` : '';
        paint();
      }

      serverBox.addEventListener('click', (e) => { const b = e.target.closest('.btn'); if (b) { srvIdx = +b.dataset.i; setZone('server'); servers()[srvIdx].run(); } });
      btnBox.addEventListener('click', (e) => { const b = e.target.closest('.btn'); if (b) { btnIdx = +b.dataset.i; setZone('btns'); buttons()[btnIdx].run(); } });
      root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });

      accRow.build(0);
      placeRow.build(rb().placeIdx);
      build();
      robloxRefresh = build;
      A.push({
        el: root, onClose: () => { if (robloxRefresh === build) robloxRefresh = null; },
        action(a) {
          const dir = a === 'left' ? -1 : a === 'right' ? 1 : 0;
          if (a === 'up' || a === 'down') {
            const next = ZONES[ZONES.indexOf(zone) + (a === 'up' ? -1 : 1)];
            if (next) { audio.play('nav'); setZone(next); }
          } else if (a === 'back') A.pop();
          else if (a === 'options') {
            if (zone === 'places' && rb().places[placeRow.idx]) { rb().placeIdx = placeRow.idx; build(); placeMenu(); }
            else { const acc = focused(); acc ? accountMenu(acc) : addAccount(); }
          }
          else if (zone === 'accounts') { if (dir) { accRow.move(dir); build(); } else if (a === 'confirm') accRow.run(); }
          else if (zone === 'places') { if (dir) placeRow.move(dir); else if (a === 'confirm') placeRow.run(); }
          else if (zone === 'server') {
            const list = servers();
            if (dir) { srvIdx = clamp(srvIdx + dir, 0, list.length - 1); audio.play('nav'); paint(); }
            else if (a === 'confirm') list[srvIdx].run();
          }
          else if (dir) { btnIdx = clamp(btnIdx + dir, 0, buttons().length - 1); audio.play('nav'); paint(); }
          else if (a === 'confirm') buttons()[btnIdx].run();
        },
      });
    },

    rows(rerender) {
      const r = rb();
      return [
        heading('ROBLOX ACCOUNTS'),
        ...r.accounts.map((a) => R.buttons(label(a), `@${a.username} · ID ${a.userId}`, [
          ['RENAME', () => rename(a, rerender)],
          [a.avatar ? 'RESET PICTURE' : 'PICTURE', () => (a.avatar ? clearPicture(a, rerender) : setPicture(a, rerender))],
          ['SIGN IN AGAIN', () => addAccount(a.id)],
          ['REMOVE', () => removeAccount(a, rerender), 'danger'],
        ])),
        R.button('Add a Roblox account', 'Opens the real Roblox sign-in page in its own isolated profile.', 'SIGN IN', () => addAccount()),
        heading('ROBLOX PLACES'),
        ...r.places.map((p, i) => R.buttons(p.name, `Place ID ${p.placeId}${p.server ? ' · private server' : ' · public servers'}${i === r.placeIdx ? ' · current' : ''}`, [
          ['USE', () => { r.placeIdx = i; audio.play('toggle'); A.save(); rerender(); }],
          ['SERVER', () => setServer(p, rerender)],
          ['REMOVE', () => removePlace(p, rerender), 'danger'],
        ])),
        R.button('Add a place', 'Paste a roblox.com game link or a place ID.', 'ADD', () => addPlace(rerender)),
        R.toggle('Multi-instance', 'Lets several Roblox clients run at once. Unofficial — close Roblox before changing it.', A.at('roblox.multiInstance')),
        R.slider('Delay between accounts', 'Pause between each client when launching several.', A.at('roblox.launchDelay'), 1, 15, 1, (v) => v + ' s'),
      ];
    },
  };

  function accountMenu(a) {
    A.openMenu(label(a), [
      ...instancesOf(a).map((i) => ({ label: 'CLOSE THIS INSTANCE', sub: `Only this account's Roblox window (PID ${i.pid}); the others keep running`, danger: true, run: () => closeInstance(i.pid) })),
      { label: 'PLAY THIS ACCOUNT', sub: place() ? 'On ' + place().name : 'Add a place first', run: () => play([a]) },
      { label: 'RENAME', sub: 'Give it your own label', run: () => rename(a) },
      { label: 'CHANGE PICTURE', sub: 'Use your own image instead of the Roblox avatar', run: () => setPicture(a) },
      ...(a.avatar ? [{ label: 'USE ROBLOX AVATAR', sub: 'Drop the custom picture', run: () => clearPicture(a) }] : []),
      { label: 'CHECK SIGN-IN', sub: 'Asks Roblox who this account is signed in as, without starting anything', run: () => { host.send('robloxCheck', { id: a.id }); toast('Checking ' + label(a) + '…'); } },
      { label: 'SIGN IN AGAIN', sub: 'Refreshes the session and the avatar', run: () => addAccount(a.id) },
      { label: 'REMOVE', danger: true, run: () => removeAccount(a) },
    ]);
  }
})();

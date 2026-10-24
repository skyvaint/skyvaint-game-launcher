// Roblox friends for the rows under HOME: who is online and in which game, read with one of your saved accounts.
// Refreshes by itself every minute while HOME is up, and the same timer keeps place player counts and Studio
// projects fresh, so the rows never show stale numbers or a one-off error for long.
(() => {
  const A = SV.app, { host } = SV;
  const { toast } = A;

  const IN_GAME = 2, STUDIO = 3, ONLINE = 1;
  let friends = [], state = 'idle', error = '', askedAt = 0, gotAt = 0, me = 0, fails = 0;
  const rb = () => A.cfg.roblox;
  const notify = () => { SV.rails && SV.rails.refresh(); };

  // Whose friends: the account you picked for it, else the first ticked account, else the first one.
  function account() {
    const r = rb();
    return r.accounts.find((a) => a.id === r.friendsAccount) || r.accounts.find((a) => r.selected.includes(a.id)) || r.accounts[0] || null;
  }

  function refresh(force) {
    const a = account();
    if (!a) { if (state !== 'noaccount') { state = 'noaccount'; notify(); } return; }
    // After failures, wait longer before asking again (1, 2, 4 … up to 8 minutes).
    const gap = fails ? Math.min(8, 2 ** (fails - 1)) * 60e3 : 45e3;
    if (!force && Date.now() - askedAt < gap) return;
    askedAt = Date.now();
    if (state !== 'ok') { state = 'loading'; notify(); }
    host.send('robloxFriends', { id: a.id });
  }

  const rank = (f) => (f.state === IN_GAME ? 0 : f.state === STUDIO ? 1 : f.state === ONLINE ? 2 : 3);
  host.on('robloxFriends', (m) => {
    const a = account();
    if (!a || m.id !== a.id) return;
    if (m.ok) {
      fails = 0;
      me = m.me || 0;
      friends = (m.friends || []).sort((x, y) => rank(x) - rank(y) || String(x.displayName || x.name).localeCompare(String(y.displayName || y.name)));
      state = 'ok';
      gotAt = Date.now();
    } else {
      fails++;
      error = m.error || 'failed';
      // Keep showing the last good list through a blip; only a sign-out replaces it.
      if (error === 'signed-out') { state = 'signedout'; friends = []; }
      else if (state !== 'ok') state = 'error';
    }
    notify();
  });

  function join(f) {
    if (f.state !== IN_GAME) return toast(`${f.displayName || f.name} isn't in a game right now.`, 'bad');
    SV.roblox.joinFriend(f, account().id);
  }

  function chooseAccount(after) {
    const r = rb();
    A.openMenu('WHOSE FRIENDS?', r.accounts.map((a) => ({
      label: SV.roblox.label(a), sub: '@' + a.username + (account() === a ? ' · showing now' : ''),
      run: () => { r.friendsAccount = a.id; A.save(); friends = []; state = 'idle'; fails = 0; refresh(true); after && after(); },
    })), 'The FRIENDS row shows this account\'s friends, and joining a friend uses it.');
  }

  // Every minute while HOME is showing: friends, then (less often) player counts and Studio projects.
  let ticks = 0;
  setInterval(() => {
    if (!A.cfg || A.mode !== 'home' || document.hidden) return;
    ticks++;
    refresh(false);
    if (ticks % 5 === 0) SV.lists && SV.lists.refreshArt();
    if (ticks % 10 === 0) SV.lists && SV.lists.loadStudio(true);
  }, 60e3);
  host.on('init', () => setTimeout(() => refresh(true), 6000));
  host.on('mode', (m) => { if (m.mode === 'home') refresh(false); });

  SV.friends = {
    get list() { return friends; },
    get state() { return state; },
    get error() { return error; },
    get updated() { return gotAt; },
    get me() { return me; },
    account, refresh, join, chooseAccount, IN_GAME, STUDIO, ONLINE,
  };
})();

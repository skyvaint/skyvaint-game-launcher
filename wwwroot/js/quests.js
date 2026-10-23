// QUESTS: a quest board made from your own library. Daily and weekly quests track themselves (play time, variety,
// clips); game challenges are things only you can see happen in-game (a Victory Royale, a hat trick), ticked off
// when done; milestones are lifetime goals; and you can write your own. Everything pays XP toward a rank.
(() => {
  const A = SV.app, { host, audio, fx } = SV;
  const { $, el, esc, clamp, hash, toast, hints } = A;
  const q = () => A.cfg.quests;

  const RANKS = ['ROOKIE', 'CONTENDER', 'PRO', 'VETERAN', 'ELITE', 'CHAMPION', 'GRAND CHAMPION', 'LEGEND', 'PREDATOR', 'SKYVAINT'];
  const level = (xp) => Math.floor(Math.sqrt(xp / 120)) + 1;
  const levelXp = (lv) => (lv - 1) * (lv - 1) * 120;
  const rank = (lv) => RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 3))];

  // Tiers by reward: colour, name.
  const TIERS = [[0, 'COMMON', '#9aa4b2'], [100, 'RARE', '#3d9bff'], [220, 'EPIC', '#b45cff'], [400, 'LEGENDARY', '#ffb21f']];
  const tierOf = (xp) => TIERS.filter(([min]) => xp >= min).pop();

  const ICON = {
    play: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    total: '<path d="M4 18V9M9 18V5M14 18v-6M19 18V8"/><path d="M3 21h18"/>',
    variety: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11.5" r=".9"/><circle cx="18" cy="13.8" r=".9"/>',
    clips: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M10 9.2v5.6l4.8-2.8z"/>',
    challenge: '<path d="M6 3h12v5a6 6 0 0 1-12 0zM9 20h6M12 14v6M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/>',
    milestone: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    custom: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    fire: '<path d="M12 22c4 0 7-2.700 7-7 0-4-3-6-4-9-1 2-2 3-3.500 3C11 6 12 3 10 1 9 5 5 8 5 14c0 4.300 3 8 7 8z"/>',
    xp: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };
  const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICON[k]}</svg>`;

  // In-game challenges per game (matched by name). {game} is the game's name.
  const CHALLENGES = [
    [/fortnite/i, ['Get a Victory Royale', 'Get 10 eliminations in one match', 'Finish top 10 three times', 'Win a Zero Build match', 'Win a match with a friend', 'Land at the hottest drop and survive the first circle']],
    [/rocket league/i, ['Win 3 ranked matches in a row', 'Score an aerial goal', 'Get a hat trick', 'Win a match without conceding', 'Make 5 saves in one match', 'Score a ceiling shot']],
    [/rematch/i, ['Win 3 matches', 'Score 5 goals in one session', 'Get MVP in a match', 'Win a match with a last-minute goal', 'Keep a clean sheet as keeper']],
    [/^roblox$/i, ['Play 3 different experiences', "Join a friend's server", 'Earn a new badge', 'Try a game from DISCOVER', 'Win a round in a competitive game']],
    [/roblox studio/i, ['Publish an update to one of your games', 'Script a new feature', 'Fix a bug in your game', 'Build a new map section']],
    [/.*/, ['Win a match in {game}', 'Unlock an achievement in {game}', 'Beat your best score in {game}', 'Play {game} with a friend']],
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function weekStart(d = new Date()) {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // back to Monday
    return s;
  }
  const seconds = () => { const out = {}; for (const [id, s] of Object.entries(A.stats || {})) out[id] = (s && s.seconds) || 0; return out; };
  const delta = (base, id) => Math.max(0, ((A.stats[id] || {}).seconds || 0) - (base[id] || 0));
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const gameOf = (id) => A.cfg.games.find((g) => g.id === id);
  const fmtTime = (sec) => sec >= 3600 ? `${(sec / 3600).toFixed(sec % 3600 ? 1 : 0)}H` : `${Math.floor(sec / 60)}M`;

  // Games worth suggesting: recently played first, then installed ones.
  function pool() {
    const games = A.cfg.games.filter((g) => A.isInstalled(g));
    return games.map((g) => [g, (A.stats[g.id] || {}).lastPlayed || 0]).sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 8);
  }

  function clipsSince(ms, game) {
    const list = SV.clips.list();
    return list.filter((c) => c.time >= ms && (!game || norm(c.game).includes(norm(game.name)) || norm(game.name).includes(norm(c.game)))).length;
  }

  const seeded = (key) => { let a = hash(key); return () => ((a = Math.imul(a ^ (a >>> 15), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)) >>> 0) / 4294967296; };

  // Deterministic for a given day/week, so the same quests come back after a restart.
  function make(kind, key) {
    const rand = seeded(key + kind), games = pool(), list = [], used = new Set();
    const pickGame = () => games[Math.floor(rand() * games.length)];
    const add = (x) => { if (!used.has(x.id)) { used.add(x.id); list.push(x); } };
    const daily = kind === 'daily';
    for (let i = 0; list.length < (daily ? 4 : 4) && i < 30; i++) {
      const r = rand(), g = pickGame();
      if (daily) {
        if (r < 0.45 && g) { const m = [15, 20, 30, 45][Math.floor(rand() * 4)]; add({ id: `play-${g.id}`, type: 'play', game: g.id, target: m * 60, text: `Play ${g.name} for ${m} minutes`, xp: 60 + m * 2 }); }
        else if (r < 0.62) add({ id: 'variety-2', type: 'variety', target: 2, text: 'Play 2 different games', xp: 90 });
        else if (r < 0.8) { const m = [45, 60, 90][Math.floor(rand() * 3)]; add({ id: `total-${m}`, type: 'total', target: m * 60, text: `Play ${m} minutes in total`, xp: 70 + m }); }
        else if (g) add({ id: `clip-${g.id}`, type: 'clips', game: g.id, target: 1, text: `Record a clip in ${g.name}`, xp: 110 });
      } else {
        if (r < 0.4 && g) { const h = [2, 3, 5][Math.floor(rand() * 3)]; add({ id: `play-${g.id}`, type: 'play', game: g.id, target: h * 3600, text: `Play ${g.name} for ${h} hours`, xp: 250 + h * 60 }); }
        else if (r < 0.6) add({ id: 'variety-4', type: 'variety', target: 4, text: 'Play 4 different games', xp: 300 });
        else if (r < 0.8) { const n = [3, 5, 8][Math.floor(rand() * 3)]; add({ id: `clips-${n}`, type: 'clips', target: n, text: `Record ${n} clips`, xp: 200 + n * 30 }); }
        else { const h = [6, 10][Math.floor(rand() * 2)]; add({ id: `total-${h}h`, type: 'total', target: h * 3600, text: `Play ${h} hours in total`, xp: 350 + h * 25 }); }
      }
    }
    return list;
  }

  // This week's in-game challenges: up to two for each of your three most played games.
  function challenges() {
    const rand = seeded(q().week + 'challenge'), out = [];
    const top = [...A.cfg.games].filter((g) => A.isInstalled(g))
      .sort((a, b) => ((A.stats[b.id] || {}).seconds || 0) - ((A.stats[a.id] || {}).seconds || 0)).slice(0, 3);
    for (const g of top) {
      const bank = CHALLENGES.find(([re]) => re.test(g.name))[1].slice();
      for (let k = 0; k < 2 && bank.length; k++) {
        const text = bank.splice(Math.floor(rand() * bank.length), 1)[0].replace('{game}', g.name);
        out.push({ id: `ch-${g.id}-${norm(text).slice(0, 24)}`, type: 'challenge', game: g.id, target: 1, text, xp: 180 + Math.floor(rand() * 5) * 30, manual: true });
      }
    }
    return out;
  }

  // Lifetime goals: the next step for your top games' play time, your clip count and your library.
  function milestones() {
    const out = [], STEPS = [3600, 36000, 180000, 360000, 900000];
    const top = [...A.cfg.games].sort((a, b) => ((A.stats[b.id] || {}).seconds || 0) - ((A.stats[a.id] || {}).seconds || 0)).slice(0, 4);
    for (const g of top) {
      const have = (A.stats[g.id] || {}).seconds || 0;
      const step = STEPS.find((s) => !q().claimed.includes(`m:play-${g.id}-${s}`));
      if (step) out.push({ id: `play-${g.id}-${step}`, type: 'milestone', game: g.id, target: step, value: have, text: `${step / 3600} hours in ${g.name}`, xp: 150 + STEPS.indexOf(step) * 150, unit: 'time' });
    }
    const clips = SV.clips.list().length, CS = [10, 50, 100, 250, 500, 1000];
    const cs = CS.find((s) => !q().claimed.includes(`m:clips-${s}`));
    if (cs) out.push({ id: `clips-${cs}`, type: 'milestone', target: cs, value: clips, text: `${cs} clips in your library`, xp: 120 + CS.indexOf(cs) * 120, icon: 'clips' });
    const lib = A.cfg.games.length, LS = [10, 25, 50, 100];
    const ls = LS.find((s) => !q().claimed.includes(`m:lib-${s}`));
    if (ls) out.push({ id: `lib-${ls}`, type: 'milestone', target: ls, value: lib, text: `${ls} games in the launcher`, xp: 100 + LS.indexOf(ls) * 100, icon: 'variety' });
    return out;
  }

  // New day / new week: snapshot the counters the progress is measured from.
  function roll() {
    const s = q(), today = dayKey(), week = dayKey(weekStart());
    let changed = false;
    if (s.day !== today) { s.day = today; s.base = seconds(); s.claimed = s.claimed.filter((c) => !c.startsWith('d:')); changed = true; }
    if (s.week !== week) { s.week = week; s.weekBase = seconds(); s.claimed = s.claimed.filter((c) => !c.startsWith('w:') && !c.startsWith('c:')); changed = true; }
    if (changed) A.save();
  }

  // [fraction 0..1, have, target]
  function progress(quest, scope) {
    const s = q();
    if (quest.type === 'milestone') return [clamp(quest.value / quest.target, 0, 1), quest.value, quest.target];
    if (quest.manual) return [0, 0, 1];
    const base = scope === 'd' ? s.base : s.weekBase;
    const since = scope === 'd' ? new Date(s.day + 'T00:00:00').getTime() : weekStart().getTime();
    let value = 0;
    if (quest.type === 'play') value = delta(base, quest.game);
    else if (quest.type === 'total') value = A.cfg.games.reduce((sum, g) => sum + delta(base, g.id), 0);
    else if (quest.type === 'variety') value = A.cfg.games.filter((g) => delta(base, g.id) > 0).length;
    else if (quest.type === 'clips') value = clipsSince(since, gameOf(quest.game));
    return [clamp(value / quest.target, 0, 1), value, quest.target];
  }

  const daily = () => make('daily', q().day);
  const weekly = () => make('weekly', q().week);

  function readyCount() {
    roll();
    const s = q();
    const auto = [...daily().map((x) => ['d', x]), ...weekly().map((x) => ['w', x]), ...milestones().map((x) => ['m', x])];
    return auto.filter(([scope, x]) => progress(x, scope)[0] >= 1 && !s.claimed.includes(scope + ':' + x.id)).length;
  }

  // A claimed daily keeps the streak going.
  function bumpStreak() {
    const s = q(), today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
    s.streak = s.streak || { last: '', count: 0 };
    if (s.streak.last === today) return;
    s.streak.count = s.streak.last === dayKey(y) ? s.streak.count + 1 : 1;
    s.streak.last = today;
  }
  const streak = () => { const st = q().streak, y = new Date(); y.setDate(y.getDate() - 1); return st && (st.last === dayKey() || st.last === dayKey(y)) ? st.count : 0; };

  function award(xp, why, from) {
    const s = q(), before = level(s.xp);
    s.xp += xp;
    A.save();
    audio.play('star');
    fx.confetti();
    if (from) { const r = from.getBoundingClientRect(); fx.burst(r.left + r.width / 2, r.top + r.height / 2, 1.2); }
    toast(`+${xp} XP · ${why}`);
    if (level(s.xp) > before) setTimeout(() => { audio.play('boot'); toast(`LEVEL ${level(s.xp)} · ${rank(level(s.xp))}`); }, 900);
    SV.quests.badge();
  }

  // The rank emblem: a shield with the level, coloured by rank.
  function emblem(lv) {
    const hue = (Math.floor((lv - 1) / 3) * 37) % 360;
    return `<svg class="q-emblem" viewBox="0 0 100 112" style="--h:${hue}">
      <defs><linearGradient id="qe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent2)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>
      <path d="M50 4 92 18v38c0 26-18 44-42 52C26 100 8 82 8 56V18z" fill="url(#qe)" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
      <path d="M50 14 82 25v31c0 20-13 34-32 41-19-7-32-21-32-41V25z" fill="rgba(0,0,0,.35)"/>
      <text x="50" y="66" text-anchor="middle" font-family="Anton, Impact" font-size="38" fill="#fff">${lv}</text></svg>`;
  }

  let view = null;
  function open() {
    if (view) return;
    roll();
    if (!SV.clips.loaded) SV.clips.ensure();
    const root = el(`
      <div class="overlay full"><div class="quests qb">
        <div class="qb-head"></div>
        <div class="qb-tabs"></div>
        <div class="qb-body"></div>
        <div class="hints">${hints([['confirm', 'Claim / tick'], ['move', 'Move'], ['tabs', 'Section'], ['options', 'Options'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.qb-body', root), head = $('.qb-head', root), tabsBox = $('.qb-tabs', root);
    const SECTIONS = [['daily', 'DAILY'], ['weekly', 'WEEKLY'], ['challenges', 'CHALLENGES'], ['milestones', 'MILESTONES'], ['mine', 'YOUR QUESTS']];
    let section = 'daily', idx = 0;
    const until = (end) => { const ms = end - Date.now(), h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4); return h >= 24 ? `${Math.floor(h / 24)}D ${h % 24}H` : `${h}H ${m}M`; };

    function card(scope, quest) {
      const s = q(), key = scope + ':' + quest.id, done = s.claimed.includes(key);
      const [pct, have, target] = progress(quest, scope), ready = !quest.manual && pct >= 1 && !done;
      const game = gameOf(quest.game), banner = game && (A.artSrc(game, 'hero') || A.artSrc(game, 'cover')), gicon = game && A.artSrc(game, 'icon');
      const [, tierName, tierColor] = tierOf(quest.xp);
      const type = quest.icon || quest.type;
      const amount = quest.manual ? (done ? 'DONE' : 'TICK WHEN DONE')
        : (quest.type === 'play' || quest.type === 'total' || quest.unit === 'time') ? `${fmtTime(Math.min(have, target))} / ${fmtTime(target)}` : `${Math.min(have, target)} / ${target}`;
      const node = el(`
        <div class="qc ${done ? 'claimed' : ''} ${ready ? 'ready' : ''} ${quest.manual ? 'manual' : ''}" style="--tier:${tierColor}" data-card>
          ${banner ? `<div class="qc-art" style="background-image:url('${esc(banner)}')"></div>` : ''}
          <div class="qc-top">
            <div class="qc-type">${svg(type)}</div>
            <div class="qc-tier">${tierName}</div>
            ${gicon ? `<img class="qc-game" src="${esc(gicon)}" alt="">` : game ? `<span class="qc-game txt">${esc(game.name)}</span>` : ''}
          </div>
          <b class="qc-text">${esc(quest.text)}</b>
          <div class="qc-bar"><i style="width:${Math.round((done ? 1 : pct) * 100)}%"></i></div>
          <div class="qc-foot">
            <span class="qc-amt">${done ? svg('check', 'ok') + 'CLAIMED' : ready ? 'COMPLETE — CLAIM' : esc(amount)}</span>
            <span class="qc-xp">${svg('xp')}${quest.xp}</span>
          </div>
        </div>`);
      node._activate = () => {
        if (done) return audio.play('nav');
        if (quest.manual) {
          A.confirmMenu(`Did you: ${quest.text}?`, 'YES, I DID IT', () => { q().claimed.push(key); award(quest.xp, quest.text, node); build(); });
          return;
        }
        if (!ready) { audio.play('error'); toast(`${Math.round(pct * 100)}% there — ${amount}`); return; }
        q().claimed.push(key);
        if (scope === 'd') bumpStreak();
        award(quest.xp, quest.text, node);
        build();
      };
      return node;
    }

    function custom(cq) {
      const game = gameOf(cq.game), banner = game && (A.artSrc(game, 'hero') || A.artSrc(game, 'cover')), gicon = game && A.artSrc(game, 'icon');
      const xp = cq.xp || 50, [, tierName, tierColor] = tierOf(xp);
      const node = el(`
        <div class="qc manual ${cq.done ? 'claimed' : ''}" style="--tier:${tierColor}" data-card>
          ${banner ? `<div class="qc-art" style="background-image:url('${esc(banner)}')"></div>` : ''}
          <div class="qc-top"><div class="qc-type">${svg('custom')}</div><div class="qc-tier">${tierName}</div>${gicon ? `<img class="qc-game" src="${esc(gicon)}" alt="">` : ''}</div>
          <b class="qc-text">${esc(cq.text)}</b>
          <div class="qc-bar"><i style="width:${cq.done ? 100 : 0}%"></i></div>
          <div class="qc-foot"><span class="qc-amt">${cq.done ? svg('check', 'ok') + 'DONE' : 'YOUR QUEST · ENTER WHEN DONE'}</span><span class="qc-xp">${svg('xp')}${xp}</span></div>
        </div>`);
      node._activate = () => {
        cq.done = !cq.done;
        if (cq.done) award(xp, cq.text, node); else { q().xp = Math.max(0, q().xp - xp); A.save(); audio.play('back'); }
        build();
      };
      node._options = () => A.openMenu(cq.text, [
        { label: cq.done ? 'MARK NOT DONE' : 'MARK DONE', run: node._activate },
        { label: 'REWARD: 50 XP', run: () => { cq.xp = 50; A.save(); build(); } },
        { label: 'REWARD: 150 XP', run: () => { cq.xp = 150; A.save(); build(); } },
        { label: 'REWARD: 300 XP', run: () => { cq.xp = 300; A.save(); build(); } },
        { label: 'REWARD: 500 XP', run: () => { cq.xp = 500; A.save(); build(); } },
        { label: 'DELETE QUEST', danger: true, run: () => { q().custom = q().custom.filter((x) => x !== cq); A.save(); build(); } },
      ]);
      node.addEventListener('contextmenu', (e) => { e.preventDefault(); node._options(); });
      return node;
    }

    function addCustom() {
      A.ask({
        tag: 'QUESTS', title: 'NEW QUEST', label: 'What do you want to do?', placeholder: 'e.g. Reach Champion 1 in Rocket League', button: 'ADD',
        desc: 'Your own goal. Mention a game to get its art and icon. Tick it off when you have done it.',
        done: (text) => {
          const games = A.cfg.games.filter((g) => norm(text).includes(norm(g.name)));
          q().custom.push({ id: Date.now().toString(36), text, game: games[0] ? games[0].id : '', xp: 150, done: false });
          A.save(); section = 'mine'; build();
        },
      });
    }

    function cards() {
      const s = q();
      if (section === 'daily') return daily().map((x) => card('d', x));
      if (section === 'weekly') return weekly().map((x) => card('w', x));
      if (section === 'challenges') return challenges().map((x) => card('c', x));
      if (section === 'milestones') return milestones().map((x) => card('m', x));
      const add = el(`<div class="qc add" data-card><div class="qc-type">${svg('custom')}</div><b class="qc-text">ADD A QUEST</b><small>Your own goal, like a rank to reach.</small></div>`);
      add._activate = addCustom;
      return [...s.custom.map(custom), add];
    }

    function build() {
      roll();
      const s = q(), lv = level(s.xp), from = levelXp(lv), to = levelXp(lv + 1), st = streak();
      const all = [...daily().map((x) => ['d', x]), ...weekly().map((x) => ['w', x]), ...challenges().map((x) => ['c', x])];
      const doneCount = all.filter(([sc, x]) => s.claimed.includes(sc + ':' + x.id)).length;
      head.innerHTML = `
        ${emblem(lv)}
        <div class="qb-who"><div class="tag">[ QUESTS · ${esc(A.cfg.profile.name.toUpperCase())} ]</div><h2>${rank(lv)}</h2>
          <div class="qb-level"><i style="width:${Math.round(((s.xp - from) / (to - from)) * 100)}%"></i></div>
          <small>LEVEL ${lv} · ${s.xp - from} / ${to - from} XP TO LEVEL ${lv + 1}</small></div>
        <div class="qb-stats">
          <div><span>${svg('fire')}</span><b>${st}</b><small>DAY STREAK</small></div>
          <div><span>${svg('check')}</span><b>${doneCount}/${all.length}</b><small>THIS WEEK</small></div>
          <div><span>${svg('xp')}</span><b>${s.xp}</b><small>TOTAL XP</small></div>
        </div>`;
      const nextDay = new Date(s.day + 'T00:00:00').getTime() + 864e5, nextWeek = weekStart().getTime() + 7 * 864e5;
      const note = { daily: `RESETS IN ${until(nextDay)}`, weekly: `RESETS IN ${until(nextWeek)}`, challenges: `IN-GAME · NEW ONES IN ${until(nextWeek)}`, milestones: 'LIFETIME', mine: `${s.custom.length} WRITTEN` };
      tabsBox.innerHTML = SECTIONS.map(([k, label]) => {
        const n = k === 'daily' ? daily().filter((x) => progress(x, 'd')[0] >= 1 && !s.claimed.includes('d:' + x.id)).length
          : k === 'weekly' ? weekly().filter((x) => progress(x, 'w')[0] >= 1 && !s.claimed.includes('w:' + x.id)).length
          : k === 'milestones' ? milestones().filter((x) => progress(x, 'm')[0] >= 1 && !s.claimed.includes('m:' + x.id)).length : 0;
        return `<button class="qb-tab ${k === section ? 'on' : ''}" data-k="${k}">${label}${n ? `<i>${n}</i>` : ''}<small>${k === section ? note[k] : ''}</small></button>`;
      }).join('');
      const list = cards();
      if (!pool().length && (section === 'daily' || section === 'weekly')) list.unshift(el('<div class="row-note">Play a game from the launcher to get quests for it.</div>'));
      body.replaceChildren(...list);
      focus(idx);
    }

    const nodes = () => [...body.querySelectorAll('[data-card]')];
    function focus(i) {
      const list = nodes();
      if (!list.length) return;
      idx = clamp(i, 0, list.length - 1);
      list.forEach((n, k) => n.classList.toggle('focus', k === idx));
      list[idx].scrollIntoView({ block: 'nearest' });
    }
    const cols = () => { const list = nodes(); if (list.length < 2) return 1; const top = list[0].offsetTop; return Math.max(1, list.filter((n) => n.offsetTop === top).length); };
    const setSection = (k) => { if (k === section) return; section = k; idx = 0; audio.play('nav'); build(); };

    tabsBox.addEventListener('click', (e) => { const b = e.target.closest('.qb-tab'); if (b) setSection(b.dataset.k); });
    body.addEventListener('click', (e) => { const n = e.target.closest('[data-card]'); if (n) { idx = nodes().indexOf(n); focus(idx); n._activate && n._activate(); } });
    body.addEventListener('mousemove', (e) => { const n = e.target.closest('[data-card]'), i = n ? nodes().indexOf(n) : -1; if (i >= 0 && i !== idx) focus(i); });

    const refresh = () => { if (view) build(); };
    view = { refresh };
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    build();
    A.push({
      el: root,
      onClose: () => { view = null; SV.quests.badge(); },
      action(a) {
        const c = cols(), keys = SECTIONS.map((x) => x[0]);
        if (a === 'left' || a === 'right') { audio.play('nav'); focus(idx + (a === 'left' ? -1 : 1)); }
        else if (a === 'up' || a === 'down') { audio.play('nav'); focus(idx + (a === 'up' ? -c : c)); }
        else if (a === 'tabPrev' || a === 'tabNext') setSection(keys[(keys.indexOf(section) + (a === 'tabPrev' ? -1 : 1) + keys.length) % keys.length]);
        else if (a === 'confirm') { const n = nodes()[idx]; n && n._activate && n._activate(); }
        else if (a === 'options') { const n = nodes()[idx]; if (n && n._options) n._options(); else addCustom(); }
        else if (a === 'back') A.pop();
      },
    });
  }

  SV.quests = {
    open,
    readyCount,
    refresh() { if (view) view.refresh(); SV.quests.badge(); },
    // A count on the Quests button when something is ready to claim.
    badge() {
      const n = readyCount(), btn = document.querySelector('#funcs .func[data-id="quests"]');
      if (btn) btn.dataset.badge = n ? String(n) : '';
    },
  };
  addEventListener('sv:clips', () => SV.quests.refresh());
})();

// Bridge to the native shell. Outside the shell (plain browser) a small mock keeps the UI usable for development.
window.SV = window.SV || {};

SV.host = (() => {
  const wv = window.chrome && window.chrome.webview;
  const handlers = {};

  const on = (type, fn) => (handlers[type] = handlers[type] || []).push(fn);
  const emit = (msg) => (handlers[msg.type] || []).forEach((fn) => fn(msg));

  // A handler that throws must not stop the others (or later messages): log it and carry on.
  const emitSafe = (msg) => (handlers[msg.type] || []).forEach((fn) => {
    try { fn(msg); } catch (err) { report(`${msg.type}: ${err && err.stack ? err.stack : err}`); }
  });
  if (wv) wv.addEventListener('message', (e) => emitSafe(e.data));

  // Errors go to the shell's log (%LOCALAPPDATA%\SkyvaintGameLauncher\logs\launcher.log) and, while the page is
  // still starting, onto the screen, instead of leaving it black.
  const errors = [];
  function report(text) {
    errors.push(String(text).slice(0, 2000));
    try { if (wv) wv.postMessage({ type: 'clientError', text: String(text).slice(0, 4000) }); } catch {}
    if (document.body && document.body.classList.contains('preinit')) showStartError();
  }
  window.addEventListener('error', (e) => report(e.error && e.error.stack ? e.error.stack : `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => report('Unhandled promise: ' + (e.reason && e.reason.stack ? e.reason.stack : e.reason)));
  function showStartError() {
    let box = document.getElementById('start-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'start-error';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0707;color:#f5efee;font:14px/1.5 Segoe UI,sans-serif;padding:8vh 8vw;overflow:auto;opacity:1';
      document.documentElement.appendChild(box);
    }
    box.innerHTML = '<div style="font:700 28px Segoe UI,sans-serif;margin-bottom:12px">The launcher hit a problem while starting</div>'
      + '<div style="opacity:.8;margin-bottom:18px">Please send a screenshot of this (or the file %LOCALAPPDATA%\\SkyvaintGameLauncher\\logs\\launcher.log) to the developer. Closing and opening the launcher again may help.</div>'
      + '<pre style="white-space:pre-wrap;background:#1a1111;padding:14px;border-radius:8px;font:12px/1.45 Consolas,monospace"></pre>'
      + '<button style="margin-top:16px;padding:10px 18px;background:#e2231a;color:#fff;border:0;border-radius:6px;font:600 14px Segoe UI,sans-serif;cursor:pointer">CONTINUE ANYWAY</button>';
    box.querySelector('pre').textContent = errors.join('\n\n');
    box.querySelector('button').onclick = () => { box.remove(); document.body && document.body.classList.remove('preinit'); };
  }
  // Still invisible long after start: the page never got going. Show why (or at least that it's stuck).
  setTimeout(() => {
    if (document.body && document.body.classList.contains('preinit')) {
      if (!errors.length) errors.push(wv ? 'The launcher did not send its start-up data within 20 seconds.' : 'Still starting after 20 seconds.');
      report('Start-up timed out (page still hidden).');
    }
  }, 20000);

  function send(type, data = {}) {
    if (wv) wv.postMessage({ type, ...data });
    else setTimeout(() => mock(type, data), 0);
  }

  const KEY = 'sv-mock-config';
  const NAMES = ['skyvaint', 'TheKing_13', 'EgoStriker', 'PredatorMode'];
  let mockVol = null, mockMuted = false;
  let mockMode = new URLSearchParams(location.search).get('mode') || 'home', made = 0, epicActive = null;
  const STEAM_IDS = ['76561199101789792', '76561198000000042'];
  const steam = { installed: true, active: STEAM_IDS[0], signedIn: STEAM_IDS[0], awaiting: false, accounts: [
    { steamId: STEAM_IDS[0], name: 'main_account', persona: 'skyvaint', remembered: true },
    { steamId: STEAM_IDS[1], name: 'second_account', persona: 'Brother', remembered: true }] };

  const mockScan = () => [
    { scanId: 'roblox_player', name: 'Roblox', platform: 'roblox', target: 'sv:roblox', process: 'RobloxPlayerBeta', installed: true },
    { scanId: 'roblox_studio', name: 'Roblox Studio', platform: 'roblox', target: 'sv:roblox-studio', process: 'RobloxStudioBeta', installed: true },
    ...['Counter-Strike 2', 'Marvel Rivals', 'THE FINALS', 'TEKKEN 7', 'DOOM', 'Warframe'].map((name, i) => (
      { scanId: 'steam_' + (700 + i), name, platform: 'steam', target: 'steam://rungameid/' + (700 + i), process: '', installed: i < 3, owners: [STEAM_IDS[i % 2]] })),
  ];
  const mockClips = () => Array.from({ length: 46 }, (_, i) => {
    const game = ['Rocket League', 'Rocket League', 'Fortnite', 'Roblox', 'Rematch'][i % 5];
    return { id: 'm' + i, name: ['⚽ Goal', 'Triple kill', 'Ceiling shot', 'Clutch 1v3', 'Flip reset'][i % 5], game, source: i % 6 ? 'medal' : 'folder', url: '',
      size: 1.2e8 + i * 3e6, time: Date.now() - i * 5.1e7, thumb: '', duration: 14 + (i * 7) % 40, link: i % 3 ? 'https://medal.tv/games/demo/clips/mock' + i : '' };
  });

  function mock(type, d) {
    if (type === 'ready') {
      let config = null;
      try { config = JSON.parse(localStorage.getItem(KEY)); } catch {}
      const stats = { steam_700: { seconds: 182000, lastPlayed: Date.now() - 864e5 }, steam_701: { seconds: 54000, lastPlayed: Date.now() - 3 * 864e5 }, fortnite: { seconds: 97000, lastPlayed: Date.now() } };
      emit({ type: 'init', config, stats, scan: mockScan(), mode: mockMode, autostart: false, epic: { installed: true, active: epicActive }, steam, robloxImport: null });
    } else if (type === 'saveConfig') {
      try { localStorage.setItem(KEY, JSON.stringify(d.config)); } catch {}
    } else if (type === 'setMode') {
      mockMode = d.mode === 'hidden' ? 'mini' : d.mode;
      emit({ type: 'mode', mode: mockMode });
    } else if (type === 'launch') {
      if (d.account) epicActive = d.account;
      emit({ type: 'stats', stats: { [d.id]: { lastPlayed: Date.now(), seconds: 4200 } } });
      emit({ type: 'epicState', epic: { installed: true, active: epicActive } });
      const steps = d.account ? ['Closing the Epic Games Launcher', 'Saving the last sign-in', 'Switching Epic to the chosen account', 'Starting the Epic Games Launcher', 'Signing in', 'Starting the game'] : ['Starting the game'];
      steps.forEach((text, i) => setTimeout(() => emit({ type: 'launchStep', text }), i * 500));
      const at = steps.length * 500;
      setTimeout(() => emit({ type: 'launchWaiting', seconds: 120 }), at);
      setTimeout(() => emit({ type: 'launchReady' }), at + 1500);
      setTimeout(() => { emit({ type: 'mode', mode: mockMode }); emit({ type: 'running', ids: [d.id] }); }, at + 3500);
      setTimeout(() => emit({ type: 'running', ids: [] }), at + 10000);
    } else if (type === 'tasks') {
      emit({ type: 'tasks', all: d.all, games: [{ id: 'fortnite', name: 'Fortnite', count: 2 }], roblox: [{ pid: 4242, account: null, started: Date.now() - 6e5, mem: 812 }], procs: [{ pid: 100, name: 'chrome', title: 'Mock window', mem: 640 }] });
    } else if (type === 'stopGame' || type === 'killProcess') {
      emit({ type: 'taskResult', ok: true, text: 'Stopped (mock)' });
    } else if (type === 'discover') {
      const item = (i, kind) => ({ title: kind + ' game ' + (i + 1), image: '', sub: kind === 'epic' ? 'FREE NOW · UNTIL NOV 2' : '-50% · $9.99', url: 'https://example.com', now: kind === 'epic' && i === 0 });
      setTimeout(() => emit({ type: 'discover', epic: [0, 1].map((i) => item(i, 'epic')), steam: { top: [0, 1, 2].map((i) => item(i, 'steam')), specials: [], new: [] },
        roblox: { trending: [0, 1, 2, 3].map((i) => ({ title: 'Roblox hit ' + (i + 1), image: '', sub: '12,345 PLAYING', url: 'https://www.roblox.com/games/1', placeId: 1000 + i })), rising: [], playing: [] } }), 300);
    } else if (type === 'startMenu') {
      setTimeout(() => emit({ type: 'startMenu', apps: [{ name: 'Discord', path: 'C:\\Discord.lnk', process: 'Discord', icon: '' }, { name: 'Spotify', path: 'C:\\Spotify.lnk', process: 'Spotify', icon: '' }] }), 300);
    } else if (type === 'applyIconToShortcuts') {
      emit({ type: 'notice', ok: true, text: 'Icon applied to 2 shortcuts (mock)' });
    } else if (type === 'launchSkip') {
      emit({ type: 'mode', mode: mockMode });
    } else if (type === 'findArt') {
      setTimeout(() => emit({ type: 'artFound', token: d.token }), 300);
    } else if (type === 'pickFile') {
      emit({ type: 'filePicked', token: d.token });
    } else if (type === 'rescan') {
      emit({ type: 'scan', scan: mockScan() });
    } else if (type === 'epicState') {
      emit({ type: 'epicState', epic: { installed: true, active: epicActive } });
    } else if (type === 'steamState') {
      emit({ type: 'steamState', steam });
    } else if (type === 'steamSwitch') {
      steam.active = steam.signedIn = d.id;
      setTimeout(() => emit({ type: 'steamPrepared', ok: true, steam }), 1200);
    } else if (type === 'steamAddAccount') {
      setTimeout(() => emit({ type: 'steamSignedIn', steam }), 1500);
    } else if (type === 'epicCapture') {
      epicActive = d.id;
      emit({ type: 'epicCaptured', id: d.id, ok: true, epicId: 'mock' + d.id, warn: false });
    } else if (type === 'epicSignIn') {
      epicActive = null;
      setTimeout(() => emit({ type: 'epicSignedIn', epic: { installed: true, active: null } }), 1500);
    } else if (type === 'robloxAddAccount') {
      const name = NAMES[made++ % NAMES.length];
      setTimeout(() => emit({ type: 'robloxAccountReady', id: d.id, userId: 1000000 + made * 7919, username: name, displayName: name, head: '', body: '' }), 500);
    } else if (type === 'robloxResolvePlace') {
      const id = (d.input.match(/\d{3,}/) || [])[0];
      setTimeout(() => emit(id
        ? { type: 'robloxPlaceResolved', token: d.token, place: { placeId: +id, name: 'Future Soccer', icon: '' } }
        : { type: 'robloxPlaceResolved', token: d.token, error: "That doesn't look like a place ID or game link." }), 400);
    } else if (type === 'robloxPlay') {
      d.ids.forEach((id, i) => {
        setTimeout(() => emit({ type: 'robloxPlayStatus', id, status: 'launching' }), i * 1400);
        setTimeout(() => { emit({ type: 'robloxPlayStatus', id, status: 'launched' }); emit({ type: 'robloxClients', count: i + 1 }); }, i * 1400 + 1000);
      });
      setTimeout(() => emit({ type: 'robloxPlayDone', ok: true }), d.ids.length * 1400);
    } else if (type === 'robloxCloseClients') {
      emit({ type: 'robloxClients', count: 0 });
    } else if (type === 'robloxFriends') {
      const names = ['TheKing_13', 'EgoStriker', 'PredatorMode', 'NightOwl', 'BlockBuilder', 'Zappy', 'Mira', 'Voltage'];
      setTimeout(() => emit({ type: 'robloxFriends', id: d.id, ok: true, me: 1, friends: names.map((name, i) => ({
        id: 2000 + i, name, displayName: name, state: [2, 2, 1, 3, 0, 1, 0, 0][i], where: ['Future Soccer', 'Blox Fruits', '', 'Roblox Studio', '', '', '', ''][i],
        placeId: 1000 + i, rootPlaceId: 1000 + i, universeId: i < 2 ? 500 + i : 0, gameId: i < 2 ? 'job-' + i : '', head: '', gameIcon: '' })) }), 400);
    } else if (type === 'gameDetails') {
      setTimeout(() => emit({ type: 'gameDetails', token: d.token, details: d.kind === 'roblox'
        ? { universeId: 500, placeId: d.placeId, name: 'Future Soccer', description: 'A mock description of the game.\nSecond line.', creator: 'Mock Studio', playing: 12345, visits: 98765432, maxPlayers: 12, created: '2023-01-02', updated: new Date().toISOString(), genre: 'Sports', upVotes: 900, downVotes: 100, favorites: 45000, shots: [], icon: '' }
        : { name: 'Mock', description: 'A mock Steam description.', developers: 'Mock Dev', publishers: 'Mock Pub', genres: 'Action, Shooter', released: 'Aug 21, 2012', metacritic: 83, recommendations: 4200000, shots: [] } }), 500);
    } else if (type === 'systemStats') {
      mockVol = mockVol ?? 42;
      setTimeout(() => emit({ type: 'systemStats', cpu: 10 + Math.random() * 30, ramTotal: 34359738368, ramUsed: 15e9 + Math.random() * 2e9, volume: mockVol, muted: !!mockMuted,
        drives: [{ name: 'C:', label: 'Windows', total: 1000204886016, free: 210e9 }, { name: 'D:', label: 'Games', total: 2000398934016, free: 140e9 }] }), 80);
    } else if (type === 'setVolume') { mockVol = d.level;
    } else if (type === 'muteVolume') { mockMuted = d.on;
    } else if (type === 'clipsScan') {
      setTimeout(() => emit({ type: 'clips', clips: mockClips(), medal: 'C:\\Medal' }), 300);
    } else if (type === 'clipDelete') {
      emit({ type: 'clipDeleted', id: d.id });
    }
  }

  return { on, send, native: !!wv, report };
})();

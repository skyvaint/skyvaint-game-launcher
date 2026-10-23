// Bridge to the native shell. Outside the shell (plain browser) a small mock keeps the UI usable for development.
window.SV = window.SV || {};

SV.host = (() => {
  const wv = window.chrome && window.chrome.webview;
  const handlers = {};

  const on = (type, fn) => (handlers[type] = handlers[type] || []).push(fn);
  const emit = (msg) => (handlers[msg.type] || []).forEach((fn) => fn(msg));

  if (wv) wv.addEventListener('message', (e) => emit(e.data));

  function send(type, data = {}) {
    if (wv) wv.postMessage({ type, ...data });
    else setTimeout(() => mock(type, data), 0);
  }

  const KEY = 'sv-mock-config';
  const NAMES = ['skyvaint', 'TheKing_13', 'EgoStriker', 'PredatorMode'];
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
    } else if (type === 'clipsScan') {
      setTimeout(() => emit({ type: 'clips', clips: mockClips(), medal: 'C:\\Medal' }), 300);
    } else if (type === 'clipDelete') {
      emit({ type: 'clipDeleted', id: d.id });
    }
  }

  return { on, send, native: !!wv };
})();

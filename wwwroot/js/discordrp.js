// The Discord Rich Presence builder (Settings → DISCORD): a live preview of how your profile will look, the
// activity type, lines that take turns, party size, pictures (GIFs work), buttons, saved profiles you can switch
// between, and a presence of its own for any game. The shell fills in the words and sends it to Discord.
(() => {
  const A = SV.app, { host } = SV;
  const { el, esc, toast, R, heading } = A;
  const D = () => A.cfg.discord;
  const VARS = [['{game}', 'the game you play'], ['{platform}', 'Steam, Epic, Roblox…'], ['{account}', 'your Epic account'], ['{count}', 'games on your shelf'],
    ['{profile}', 'your profile name'], ['{song}', 'the song playing on your PC'], ['{artist}', 'its artist'], ['{time}', 'the time now']];
  const TYPES = [[0, 'Playing'], [2, 'Listening to'], [3, 'Watching'], [5, 'Competing in']];
  const FIELDS = ['details', 'state', 'idleDetails', 'idleState', 'largeImage', 'largeText', 'smallImage', 'smallText', 'button1Label', 'button1Url', 'button2Label', 'button2Url',
    'activityType', 'partySize', 'partyMax', 'elapsed', 'idle', 'rotateEvery'];
  let previewGame = '';

  // Fills the {words} roughly like the shell does, for the preview.
  function fill(s, g) {
    const t = SV.music && SV.music.track;
    const first = (x) => String(x || '').split('|')[0].trim();
    return first(s).replace(/\{game\}/g, g ? g.name : '').replace(/\{platform\}/g, g ? ({ steam: 'Steam', epic: 'Epic Games', roblox: 'Roblox' }[g.platform] || 'PC') : '')
      .replace(/\{count\}/g, A.cfg.games.length).replace(/\{profile\}/g, A.cfg.profile.name).replace(/\{song\}/g, t?.title || '').replace(/\{artist\}/g, t?.artist || '')
      .replace(/\{time\}/g, new Date().toTimeString().slice(0, 5)).replace(/\{account\}/g, '');
  }

  function preview() {
    const d = D(), g = A.cfg.games.find((x) => x.id === previewGame), own = g ? (d.perGame || {})[g.id] || {} : {};
    const get = (k, fb) => (own[k] ? own[k] : d[k] ?? fb);
    const details = fill(g ? get('details', 'Playing {game}') : get('idleDetails', 'In the launcher'), g);
    const state = fill(g ? get('state', 'on {platform}') : get('idleState', '{count} games ready'), g);
    const big = fill(get('largeImage', ''), g), small = fill(get('smallImage', ''), g);
    const type = (TYPES.find(([k]) => k === +(d.activityType || 0)) || TYPES[0])[1];
    const btns = [1, 2].map((n) => get('button' + n + 'Label', '')).filter(Boolean);
    const party = +d.partyMax > 0 ? ` (${Math.max(1, +d.partySize || 1)} of ${d.partyMax})` : '';
    return el(`<div class="rp-preview">
      <div class="tag">[ PREVIEW${g ? ' · WHILE PLAYING ' + esc(g.name.toUpperCase()) : ' · IN THE LAUNCHER'} ]</div>
      <div class="rp-card">
        <small>${esc(type.toUpperCase())} YOUR APP</small>
        <div class="rp-body">
          <div class="rp-big" ${/^https?:/.test(big) ? `style="background-image:url('${esc(big)}')"` : ''}>${/^https?:/.test(small) ? `<i style="background-image:url('${esc(small)}')"></i>` : ''}</div>
          <div class="rp-lines"><b>Your app name</b>${details ? `<span>${esc(details)}</span>` : ''}${state ? `<span>${esc(state + party)}</span>` : ''}${d.elapsed !== false ? '<span class="rp-time">00:12 elapsed</span>' : ''}</div>
        </div>
        ${btns.map((b) => `<div class="rp-btn">${esc(fill(b, g))}</div>`).join('')}
      </div>
      <small class="rp-note">The top line is your Discord application's name (set it at discord.com/developers). Lines with | take turns.</small>
    </div>`);
  }

  function rows(rerender, status) {
    const d = D(), at = (k) => A.at('discord.' + k);
    d.profiles = d.profiles || [];
    d.perGame = d.perGame || {};
    const refreshPreview = () => { const old = document.querySelector('.rp-preview'); if (old) old.replaceWith(preview()); };
    const text = (label, desc, key, ph) => { const r = R.text(label, desc, at(key), ph); r.addEventListener('input', () => setTimeout(refreshPreview, 30)); return r; };
    const pg = previewGame && d.perGame[previewGame] ? d.perGame[previewGame] : null;
    const game = A.cfg.games.find((x) => x.id === previewGame);
    return [
      heading('DISCORD RICH PRESENCE'),
      preview(),
      el(`<div class="row-note">Status: <b class="discord-status">${esc(status())}</b></div>`),
      R.toggle('Rich Presence', '', at('enabled'), () => host.send('discordReconnect')),
      R.text('Application ID', 'From discord.com/developers → your application → General Information.', at('clientId'), '123456789012345678'),
      R.button('Connect now', 'Try again straight away.', 'CONNECT', () => host.send('discordReconnect')),
      R.choice('Activity type', 'What Discord says you are doing.', at('activityType'), TYPES, refreshPreview),
      heading('WHILE PLAYING'),
      text('Top line', 'Separate options with | to make them take turns.', 'details', 'Playing {game}'),
      text('Second line', '', 'state', 'on {platform}'),
      R.toggle('Show time elapsed', '', at('elapsed'), refreshPreview),
      heading('WHILE IN THE LAUNCHER'),
      R.toggle('Show a status when no game is running', '', at('idle')),
      text('Top line', '', 'idleDetails', 'In the launcher'),
      text('Second line', '', 'idleState', '{count} games ready'),
      heading('PICTURES, PARTY AND BUTTONS'),
      text('Large picture', 'An image or GIF link (https://…), or an art asset name from your Discord application.', 'largeImage', 'https://…/logo.gif'),
      text('Large picture text', 'Shown when hovering the picture.', 'largeText', '{profile}'),
      text('Small picture', 'The little badge on the corner.', 'smallImage', ''),
      text('Small picture text', '', 'smallText', ''),
      R.slider('Party size', 'Shows "(2 of 5)". 0 max hides it.', at('partySize'), 0, 20, 1, (v) => String(v)),
      R.slider('Party max', '', at('partyMax'), 0, 20, 1, (v) => (v ? String(v) : 'OFF')),
      text('Button 1 label', '', 'button1Label', 'My website'),
      text('Button 1 link', '', 'button1Url', 'https://skyvaint.com'),
      text('Button 2 label', '', 'button2Label', ''),
      text('Button 2 link', '', 'button2Url', ''),
      R.slider('Lines take turns every', 'For lines with | in them.', at('rotateEvery'), 6, 120, 1, (v) => v + ' s'),
      el(`<div class="row-note rp-vars">Words that fill in: ${VARS.map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join(' · ')}</div>`),

      heading('PER GAME'),
      R.choice('Game', 'Pick a game to preview it, and to give it a presence of its own.', { get: () => previewGame, set: (v) => { previewGame = v; } },
        [['', 'None (launcher)'], ...A.cfg.games.map((g) => [g.id, g.name + (d.perGame[g.id] ? '  ✓' : '')])], () => rerender()),
      ...(game ? (pg ? [
        R.text('Top line for ' + game.name, 'Empty uses the general one.', A.prop(pg, 'details'), ''),
        R.text('Second line', '', A.prop(pg, 'state'), ''),
        R.text('Large picture', '', A.prop(pg, 'largeImage'), ''),
        R.text('Large picture text', '', A.prop(pg, 'largeText'), ''),
        R.button('Use the general presence', '', 'REMOVE', () => { delete d.perGame[game.id]; A.changed(); rerender(); }, true),
      ] : [R.button('Give ' + game.name + ' its own presence', '', 'ADD', () => { d.perGame[game.id] = { details: '', state: '', largeImage: '', largeText: '' }; A.changed(); rerender(); })]) : []),

      heading('PROFILES'),
      R.button('Save as a profile', 'Keep this whole setup to switch back to later.', 'SAVE', () => A.ask({ tag: 'DISCORD', title: 'SAVE PROFILE', label: 'Name', placeholder: 'LOCKED IN', done: (name) => {
        const p = { name }; for (const k of FIELDS) p[k] = d[k];
        d.profiles = d.profiles.filter((x) => x.name !== name).concat(p); A.changed(); toast('Profile saved'); rerender();
      } })),
      ...d.profiles.map((p, i) => R.buttons(p.name, fill(p.details || '', null), [
        ['USE', () => { for (const k of FIELDS) if (p[k] !== undefined) d[k] = p[k]; A.changed(); host.send('discordReconnect'); toast(p.name + ' is on'); rerender(); }],
        ['DELETE', () => { d.profiles.splice(i, 1); A.changed(); rerender(); }, 'danger'],
      ])),
    ];
  }

  SV.rp = { rows };
})();

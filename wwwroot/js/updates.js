// UPDATES: new versions of the launcher from its GitHub releases, keeping Roblox up to date, and the settings
// backups (which are what protect your games, accounts, playtime and pictures from being wiped).
// The shell does the work (MainForm.Updates.cs); this is the Settings → UPDATES tab and the "new version" notices.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, esc, toast, R, heading } = A;
  const up = () => A.cfg.updates;
  let st = { current: '', roblox: {}, backups: [] }, refresh = null;

  const ago = (ms) => {
    if (!ms) return 'never';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  };
  const when = (ms) => new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  const note = (html) => el(`<div class="row-note">${html}</div>`);

  host.on('updates', (m) => {
    st = m;
    // First start on a new version: say so once.
    if (m.current && up() && up().lastSeen !== m.current) {
      const was = up().lastSeen;
      up().lastSeen = m.current;
      A.save();
      if (was) setTimeout(() => toast(`Updated to ${m.current}`), 3800);
    }
    refresh && refresh();
  });
  host.on('updateAvailable', (m) => {
    audio.play('star');
    toast(`Version ${m.version} is out — Settings → UPDATES`);
  });

  function rows(rerender) {
    refresh = () => rerender();
    if (!st.current) host.send('updatesState');
    const u = up(), L = st.latest, rb = st.roblox || {};
    const newer = L && L.newer;
    const out = [heading('THIS APP')];

    out.push(R.buttons(`Version ${st.current || '…'}`,
      st.checking ? 'Looking for updates…'
        : st.error ? st.error
        : L ? (newer ? `Version ${L.version} is available` : 'You have the latest version') + ` · checked ${ago(st.checkedAt)}`
        : 'Not checked yet.',
      [['CHECK NOW', () => { audio.play('confirm'); host.send('checkUpdates'); }], ['GITHUB', () => host.send('openRelease'), 'ghost']]));

    if (newer) {
      const busy = st.installing;
      out.push(R.buttons(`New: ${L.name}`,
        busy ? `${st.installStep}${st.installPct >= 0 && st.installStep === 'Downloading' ? ' · ' + st.installPct + '%' : ''}…`
          : st.dev ? 'This copy runs from the build folder, so update it with git and a rebuild.'
          : `${L.prerelease ? 'BETA · ' : ''}${L.published ? 'Released ' + ago(Date.parse(L.published)) + ' · ' : ''}${L.size ? mb(L.size) + ' · ' : ''}downloads, closes, swaps the files and opens again. Your settings stay.`,
        busy ? [] : [
          ['UPDATE NOW', () => { audio.play('confirm'); host.send('installUpdate'); }],
          ['SKIP THIS ONE', () => { u.skipped = L.tag; A.changed(); toast(`You won't be reminded about ${L.version}`); rerender(); }, 'ghost'],
        ]));
      if (L.notes) out.push(note(`<b>WHAT'S NEW</b><br>${esc(L.notes.slice(0, 1500)).replace(/\r?\n/g, '<br>')}`));
    }
    out.push(
      R.toggle('Check by itself', 'Looks for a new release every few hours.', A.prop(u, 'auto')),
      R.toggle('Tell me about new releases', 'A notification and a message here when a new version comes out.', A.prop(u, 'notify')),
      R.toggle('Include beta versions', 'Pre-releases count as updates too.', A.prop(u, 'beta')),
    );

    out.push(R.button('Apps on this PC', 'What the launcher works with (Bloxstrap, Medal, Steam, Epic, Discord) and what is still missing.', 'OPEN', () => SV.setup && SV.setup.open()));

    out.push(heading('ROBLOX'));
    out.push(R.toggle('Keep Roblox updated', 'Checks for a new Roblox version and installs it through Bloxstrap in the background, so games start without the update wait. Never while Roblox is open or you are playing.', A.prop(u, 'roblox')));
    out.push(R.buttons(`Roblox ${rb.latest || ''}`.trim(),
      rb.checking ? 'Checking…' : rb.updating ? (rb.status || 'Updating…') : (rb.status || 'Not checked yet.') + (rb.checkedAt ? ` · ${ago(rb.checkedAt)}` : ''),
      rb.updating || rb.checking ? [] : [['UPDATE NOW', () => { audio.play('confirm'); host.send('updateRoblox'); }]]));
    if (rb.status && rb.bloxstrap === false) out.push(note('Bloxstrap isn\'t installed, so Roblox updates itself when it starts.'));

    out.push(heading('GRAPHICS'));
    out.push(R.buttons(`Safe graphics: ${st.safeGraphics ? 'ON' : 'OFF'}`,
      st.safeGraphics
        ? `Drawing without GPU acceleration because ${st.safeReason || 'it was switched on'}. Smoother with it off, if your graphics driver allows. Changes apply on the next start.`
        : 'Turn on if the launcher ever shows a black screen. Changes apply on the next start.',
      [[st.safeGraphics ? 'TURN OFF' : 'TURN ON', () => { audio.play('toggle'); host.send('safeGraphics', { on: !st.safeGraphics }); st.safeGraphics = !st.safeGraphics; rerender(); }],
       ['OPEN LOG', () => host.send('openLog'), 'ghost']]));

    out.push(heading(`BACKUPS · ${(st.backups || []).length}`));
    out.push(R.buttons('Your settings are backed up',
      'Games, accounts, bars, playtime and your own pictures are copied outside the settings folder every 30 minutes and at every start. If they ever go missing, the launcher puts them back by itself.',
      [['BACK UP NOW', () => { audio.play('confirm'); host.send('backupNow'); }], ['OPEN FOLDER', () => host.send('openBackups'), 'ghost']]));
    for (const b of (st.backups || []).slice(0, 12)) {
      out.push(R.buttons(when(b.at), `${b.games} games · ${b.accounts} Roblox accounts · ${b.bars} bars`, [
        ['RESTORE', () => A.confirmMenu(`Go back to the settings from ${when(b.at)}? The launcher restarts. What you have now is backed up first.`, 'RESTORE', () => host.send('restoreBackup', { file: b.file }))],
      ]));
    }
    if (st.test) out.push(note('<b>TEST RUN</b> — this copy uses its own data folder (--data), not your real settings.'));
    return out;
  }

  SV.updates = { rows };
})();

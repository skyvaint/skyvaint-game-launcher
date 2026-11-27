// Settings → DATA: keep every picture, GIF, video and sound on this PC. Anything your setup still loads from the
// internet is downloaded by the shell (MainForm.Assets.cs) and every setting that used it is switched to the saved
// copy: games, profiles, saved themes, NEXUS bars, the backdrop and the sounds. Store artwork the scan found is
// pinned to the game at the same time. And everything you use can be copied to a folder you choose.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { toast } = A;
  const MEDIA = 'https://media.skyvaint.example/';

  // Settings that hold addresses which must stay addresses: where a game or link opens, Discord's pictures (Discord
  // fetches them itself), update checks and the like. Everything else that starts with http is a candidate; the
  // shell only keeps what really is a picture, video or sound.
  const SKIP_KEYS = new Set(['url', 'target', 'link', 'links', 'href', 'server', 'share', 'join', 'clientId', 'button1Url', 'button2Url', 'catalog', 'fontFile']);
  const SKIP_TREES = new Set(['discord', 'updates', 'dev', 'social', '_sv']);

  function walk(node, visit, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 14) return;
    for (const [k, v] of Object.entries(node)) {
      if (depth === 0 && SKIP_TREES.has(k)) continue;
      if (SKIP_KEYS.has(k)) continue;
      if (typeof v === 'string') visit(node, k, v);
      else if (v && typeof v === 'object') walk(v, visit, depth + 1);
    }
  }
  const remote = (s) => /^https?:\/\//i.test(s) && !s.startsWith(MEDIA) && !/^https?:\/\/(media\.)?skyvaint\.example\//i.test(s);

  // Store art found by the scan, which a game uses while it has none of its own.
  function scanArt() {
    const out = [];
    for (const g of A.cfg.games || []) {
      const s = A.scanOf(g);
      if (!s) continue;
      for (const k of ['cover', 'hero', 'icon']) if (!g[k] && s[k] && remote(s[k])) out.push({ g, k, url: s[k] });
    }
    return out;
  }

  function remoteUrls() {
    const set = new Set();
    walk(A.cfg, (_, __, v) => { if (remote(v)) set.add(v); });
    for (const x of scanArt()) set.add(x.url);
    return [...set];
  }
  function localFiles() {
    const set = new Set();
    walk(A.cfg, (_, __, v) => { if (v.startsWith(MEDIA)) set.add(v.slice(MEDIA.length).split(/[?#]/)[0]); });
    for (const g of A.cfg.games || []) for (const k of ['cover', 'hero', 'icon']) { const u = A.artSrc(g, k); if (u && u.startsWith(MEDIA)) set.add(u.slice(MEDIA.length)); }
    return [...set];
  }

  let busy = false, after = null, lastPct = -1;
  host.on('assetsProgress', (m) => {
    const pct = Math.floor((m.done / Math.max(1, m.total)) * 4) * 25;
    if (pct !== lastPct && pct < 100) { lastPct = pct; toast(`Saving your pictures and videos… ${m.done} / ${m.total}`); }
  });
  host.on('assetsLocalized', (m) => {
    busy = false;
    const map = m.map || {};
    const pinned = scanArt();
    let switched = 0;
    walk(A.cfg, (obj, k, v) => { if (map[v]) { obj[k] = map[v]; switched++; } });
    for (const x of pinned) if (map[x.url]) { x.g[x.k] = map[x.url]; switched++; }
    const saved = Object.keys(map).length, failed = (m.failed || []).length;
    if (saved) { A.changed('games'); SV.nexus && SV.nexus.syncIcons(); }
    audio.play(failed && !saved ? 'error' : 'pick');
    toast(saved ? `${saved} files saved on this PC · ${switched} settings use them now${failed ? ` · ${failed} couldn't be downloaded` : ''}` : failed ? `${failed} couldn't be downloaded (not pictures, or the site refused).` : 'Everything was already on this PC.', saved || !failed ? '' : 'bad');
    after && after();
  });

  function localize(done) {
    if (busy) return toast('Already saving…');
    const urls = remoteUrls();
    if (!urls.length) return toast('Everything is already on this PC.');
    busy = true; after = done; lastPct = -1;
    toast(`Saving ${urls.length} pictures and videos on this PC…`);
    host.send('localizeAssets', { urls });
  }

  function exportAll() {
    const files = localFiles();
    if (!files.length) return toast('Save them on this PC first: there is nothing local to copy yet.', 'bad');
    host.send('exportAssets', { files });
  }

  function rows(rerender) {
    const { R, heading } = A, n = remoteUrls().length, local = localFiles().length;
    return [
      heading('YOUR PICTURES AND VIDEOS'),
      R.button('Keep them all on this PC', n ? `${n} pictures, GIFs or videos still load from the internet. Saves them in the launcher's folder and switches every setting to the saved copies: they work offline and can't disappear.` : 'Everything you use is already on this PC.', n ? 'SAVE ALL' : 'DONE', () => localize(rerender)),
      R.button('Copy them to a folder', `Every picture, GIF, video and sound you use (${local} files), sorted into folders wherever you like.`, 'COPY', exportAll),
      R.button('Open the launcher\'s pictures folder', 'Where they are kept. It is backed up with the rest of your data.', 'OPEN', () => host.send('openMedia')),
    ];
  }

  SV.assets = { rows, localize, exportAll, remoteUrls, localFiles };
})();

// Social + browser: the side panel next to HOME with TikTok, Instagram, YouTube and your own sites, and a full
// browser in wide mode. The panel itself is drawn by the shell (those sites can't load inside this page); this
// is its button and settings (Settings → SOCIAL).
(() => {
  const A = SV.app, { host, audio } = SV;
  const { el, toast, R, heading } = A;
  const S = () => A.cfg.social || (A.cfg.social = { enabled: true, side: 'right', width: 420, sites: [], mobile: true });
  const DEFAULT_SITES = [['TikTok', 'https://www.tiktok.com/'], ['Instagram', 'https://www.instagram.com/'], ['YouTube', 'https://www.youtube.com/'], ['X', 'https://x.com/'],
    ['Twitch', 'https://www.twitch.tv/'], ['Discord', 'https://discord.com/app'], ['Reddit', 'https://www.reddit.com/'], ['Google', 'https://www.google.com/']];
  let open = false;

  const sites = () => { const s = S(); if (!s.sites || !s.sites.length) s.sites = DEFAULT_SITES.map(([name, url]) => ({ name, url })); return s.sites; };
  const toggle = () => { sites(); A.save(); host.send('side', { action: 'toggle' }); };
  const go = (url) => { sites(); host.send('side', { action: 'open', url }); };

  host.on('sideState', (m) => { open = !!m.open; document.body.classList.toggle('side-open', open); });
  host.on('sideWidth', (m) => { S().width = m.width; A.save(); });
  // ＋ in the browser saves the page you are on straight away, no need to close anything.
  host.on('socialAdd', (m) => {
    if (m.url) {
      let name = String(m.title || '').split(/[|\-–·:]/)[0].trim();
      try { if (!name) name = new URL(m.url).hostname.replace(/^www\./, '').split('.')[0]; } catch {}
      sites().push({ name: (name || 'Site').slice(0, 24), url: m.url });
      A.changed();
      host.send('side', { action: 'refresh' });
      toast((name || 'Site') + ' saved to your sites');
      return;
    }
    addSite();
  });
  host.on('sideView', (m) => { S().view = m.mode; A.save(); });

  function addSite(after) {
    A.ask({
      tag: 'SOCIAL', title: 'ADD A SITE', label: 'Web address', placeholder: 'https://www.tiktok.com/@you', button: 'ADD',
      done: (input) => {
        let url = input.trim();
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
        let host2 = '';
        try { host2 = new URL(url).hostname.replace(/^www\./, ''); } catch { return toast("That isn't a web address.", 'bad'); }
        sites().push({ name: host2.split('.')[0].replace(/^./, (c) => c.toUpperCase()), url });
        A.changed();
        host.send('side', { action: 'refresh' });
        host.send('side', { action: 'go', url });
        toast(host2 + ' added');
        after && after();
      },
    });
  }

  function rows(rerender) {
    const list = sites();
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; A.changed(); rerender(); };
    return [
      heading('SOCIAL + BROWSER'),
      el('<div class="row-note">A browser panel beside HOME for TikTok, Instagram and anything else. Its rail holds your sites; ⤢ makes it a full browser. Sign-ins are kept.</div>'),
      R.button('Open the panel', '', open ? 'CLOSE' : 'OPEN', () => { toggle(); setTimeout(rerender, 300); }),
      R.choice('View', 'Beside HOME, wide, filling the launcher, or in its own window you can move and maximize.', { get: () => S().view || 'side', set: (v) => { S().view = v; } },
        [['side', 'Side panel'], ['wide', 'Wide'], ['full', 'Full screen'], ['window', 'Its own window']], () => host.send('side', { action: 'view', mode: S().view })),
      R.choice('Side', '', A.at('social.side'), [['right', 'Right'], ['left', 'Left']], () => host.send('side', { action: open ? 'open' : 'close' })),
      R.slider('Width', 'You can also drag its edge.', A.at('social.width'), 300, 1400, 20, (v) => v + ' px'),
      R.toggle('Phone layout', 'Asks sites for their phone version, which fits a narrow panel (TikTok, Instagram).', A.at('social.mobile')),
      R.text('Go to an address', 'Or type words to search.', { get: () => '', set: (v) => { if (v.trim()) go(v.trim()); } }, 'tiktok.com/@someone'),
      heading(`YOUR SITES · ${list.length}`),
      ...list.map((s, i) => R.buttons(s.name, s.url, [
        ['OPEN', () => go(s.url)], ['▲', () => move(i, -1), 'ghost'], ['▼', () => move(i, 1), 'ghost'],
        ['RENAME', () => A.ask({ tag: 'SOCIAL', title: 'RENAME', label: 'Name', value: s.name, done: (v) => { s.name = v; A.changed(); rerender(); } })],
        ['REMOVE', () => { list.splice(i, 1); A.changed(); rerender(); }, 'danger'],
      ])),
      R.button('Add a site', '', 'ADD', () => addSite(rerender)),
      R.button('Back to the default sites', '', 'RESET', () => { S().sites = []; sites(); A.changed(); rerender(); }, true),
    ];
  }

  SV.social = { toggle, go, rows, get open() { return open; } };
})();

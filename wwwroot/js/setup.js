// SETUP: on first start (and whenever a recommended app is still missing) a sheet lists what the launcher works
// with and isn't on this PC yet: Bloxstrap when there's no Roblox, Medal for clips, Steam, Epic, Discord. GET opens
// the official download page; coming back to the launcher looks again. The shell does the detection
// (MainForm.Setup.cs). Also reachable from Settings → UPDATES → "Apps on this PC".
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc, toast, hints, R, heading } = A;
  const setup = () => A.cfg.setup || (A.cfg.setup = { seen: false, skipped: [] });
  let items = [], view = null, wantOpen = false;

  const missing = () => items.filter((i) => !i.installed);

  // After the opening animation, only once HOME is on screen.
  host.on('init', () => { setTimeout(() => host.send('setupCheck', { auto: true }), 4500); });

  host.on('setupCheck', (m) => {
    items = m.items || [];
    if (view) return view.refresh();
    if (wantOpen) { wantOpen = false; return open(); }
    if (!m.auto) return;
    const s = setup();
    // A fresh install goes through the setup wizard first; that already lists what is missing.
    if (!s.done) return;
    // First start: show it if anything at all is missing. Later: only for recommended apps not skipped.
    const ask = !s.seen ? missing().length > 0 : missing().some((i) => i.recommended && !s.skipped.includes(i.id));
    const first = !s.seen;
    if (ask && A.mode === 'home' && !A.stack.length) open(first);
    if (first) { s.seen = true; A.save(); }
  });

  // Back from a download page / installer: look again so freshly installed apps tick off.
  host.on('focus', (m) => { if (m.on && view) host.send('setupCheck', {}); });

  function rows(rerender) {
    const s = setup(), miss = missing();
    const out = [heading(miss.length ? `MISSING · ${miss.length}` : 'ALL SET')];
    if (!miss.length) out.push(el('<div class="row-note">Everything the launcher works with is on this PC.</div>'));
    for (const i of miss) {
      const skipped = s.skipped.includes(i.id);
      out.push(R.buttons(`${i.name}${i.recommended ? '   · RECOMMENDED' : ''}`, i.why + (skipped ? ' (skipped — not asked about at start)' : ''), [
        ['GET', () => { audio.play('confirm'); host.send('setupGet', { id: i.id }); toast(`Opening the ${i.name} download page — come back here when it's installed`); }],
        skipped
          ? ['ASK AGAIN', () => { s.skipped = s.skipped.filter((x) => x !== i.id); A.save(); rerender(); }, 'ghost']
          : ['SKIP', () => { s.skipped.push(i.id); A.save(); audio.play('back'); rerender(); }, 'ghost'],
      ]));
    }
    const have = items.filter((i) => i.installed);
    if (have.length) {
      out.push(heading(`ON THIS PC · ${have.length}`));
      for (const i of have) out.push(el(`<div class="row-note">✓ <b>${esc(i.name)}</b> — ${esc(i.why)}</div>`));
    }
    out.push(R.button('Check again', 'After installing something, look again.', 'CHECK', () => { audio.play('confirm'); host.send('setupCheck', {}); }));
    return out;
  }

  function open(first) {
    if (view) return;
    if (!items.length) { wantOpen = true; host.send('setupCheck', {}); return; }
    const root = el(`
      <div class="overlay"><div class="sheet">
        <div class="sheet-head"><div><div class="tag">[ ${first === true ? 'FIRST START' : 'APPS ON THIS PC'} ]</div><h2>SET UP YOUR PC</h2></div></div>
        <div class="sheet-body"></div>
        <div class="hints">${hints([['confirm', 'Choose'], ['back', 'Close']])}</div>
      </div></div>`);
    const body = $('.sheet-body', root), p = A.panel(body);
    const build = (i) => { if (!root.isConnected && i !== 'first') return; body.replaceChildren(...rows(() => build())); p.focus(typeof i === 'number' ? i : p.idx || 0); };
    view = { refresh: () => build() };
    build('first');
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    A.push({ el: root, action: p.action, onClose: () => { view = null; } });
  }

  SV.setup = { open };
})();

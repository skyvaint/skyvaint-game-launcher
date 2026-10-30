// The LEAVE screen (off, sleep to the tray, mini, return) and the slash wipe used when the window leaves or comes back.

(() => {
  const A = SV.app, { host, audio, bg, fx } = SV;
  const { el, esc, hints } = A;

  const ICONS = {
    off: '<path d="M12 3v9M6.3 6.7a8 8 0 1 0 11.4 0"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    home: '<path d="M3 11.2 12 3l9 8.2V21h-6v-6H9v6H3z"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    stop: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`;

  // ---------------------------------------------------------------- slash wipe

  const wipe = el('<div id="wipe"><i></i><i></i><i></i><b></b></div>');
  document.body.append(wipe);
  let wipeTimer = 0;
  // Covers the screen with three slashing slabs; `covered` runs once it is fully covered, then it slides away.
  // `moment` says which change this is (list, back, mini, hide, off, leave); a moment with its own video plays that.
  function slash(covered, hold = 120, moment = '') {
    if (SV.effects && moment && SV.effects.videoFor(moment) && (A.cfg.fx.videos || {})[moment]) { SV.effects.transition(covered, moment); return; }
    if (!A.cfg.fx.wipe || A.cfg.fx.transition === 'none') { covered && covered(); return; }
    if (A.cfg.fx.transition === 'video' && A.cfg.fx.transitionVideo && SV.effects) { SV.effects.transition(covered, moment || 'list'); return; }
    clearTimeout(wipeTimer);
    wipe.className = '';
    void wipe.offsetWidth;
    wipe.className = 'cover';
    document.body.classList.add('wiping');
    audio.play('slam');
    wipeTimer = setTimeout(() => {
      covered && covered();
      wipeTimer = setTimeout(() => { wipe.className = 'open'; document.body.classList.remove('wiping'); wipeTimer = setTimeout(() => { wipe.className = ''; }, 520); }, hold);
    }, 300);
  }
  // Coming back: start covered, then open up.
  function reveal() {
    if (SV.effects && (A.cfg.fx.videos || {}).return) { SV.effects.transition(null, 'return'); return; }
    if (!A.cfg.fx.wipe || A.cfg.fx.transition === 'none') return;
    if (A.cfg.fx.transition === 'video' && A.cfg.fx.transitionVideo && SV.effects) { SV.effects.transition(null, 'return'); return; }
    clearTimeout(wipeTimer);
    wipe.className = 'held';
    void wipe.offsetWidth;
    wipeTimer = setTimeout(() => { wipe.className = 'open'; audio.play('slam'); wipeTimer = setTimeout(() => { wipe.className = ''; }, 520); }, 60);
  }

  // ---------------------------------------------------------------- LEAVE

  function leave() {
    const choices = [
      { id: 'off', icon: 'off', label: 'OFF', sub: 'Quit the launcher', danger: true, run: () => A.confirmMenu('Turn the launcher off?', 'TURN OFF', () => slash(() => host.send('quit'), 400, 'off')) },
      { id: 'sleep', icon: 'moon', label: 'SLEEP', sub: 'Hide to the tray', run: () => { closeAll(); SV.app.leaveTo('hidden'); } },
      { id: 'mini', icon: 'home', label: 'MINI', sub: 'The small widget', run: () => { closeAll(); SV.app.leaveTo('mini'); } },
      { id: 'return', icon: 'back', label: 'RETURN', sub: 'Back to HOME', run: () => A.pop() },

    ];
    const extra = [
      { label: 'STOP GAMES / PROCESSES', run: () => SV.app.openTasks && SV.app.openTasks() },
      ...SV.roblox.powerItems().map((x) => ({ label: x.label, run: x.run })),
    ];
    const root = el(`
      <div class="overlay center leave-screen"><div class="leave">
        <div class="tag">[ LEAVE ]</div>
        <div class="lv-row">${choices.map((c, i) => `<button class="lv-btn ${c.danger ? 'danger' : ''}" data-i="${i}">${svg(c.icon)}<b>${c.label}</b><small>${esc(c.sub)}</small></button>`).join('')}</div>
        <div class="lv-extra">${extra.map((x, i) => `<button class="btn small ghost" data-x="${i}">${esc(x.label)}</button>`).join('')}</div>
        <div class="hints">${hints([['confirm', 'Choose'], ['adjust', 'Move'], ['back', 'Cancel']])}</div>
      </div></div>`);
    let idx = 1;
    const paint = () => root.querySelectorAll('.lv-btn').forEach((b, i) => b.classList.toggle('on', i === idx));
    root.querySelector('.lv-row').addEventListener('click', (e) => { const b = e.target.closest('.lv-btn'); if (b) { idx = +b.dataset.i; paint(); audio.play('confirm'); choices[idx].run(); } });
    root.querySelector('.lv-row').addEventListener('mousemove', (e) => { const b = e.target.closest('.lv-btn'); if (b && +b.dataset.i !== idx) { idx = +b.dataset.i; paint(); } });
    root.querySelector('.lv-extra').addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) extra[+b.dataset.x].run(); });
    root.addEventListener('mousedown', (e) => { if (e.target === root) A.pop(); });
    paint();
    A.push({
      el: root,
      action(a) {
        if (a === 'left' || a === 'right') { idx = (idx + (a === 'left' ? -1 : 1) + choices.length) % choices.length; audio.play('nav'); paint(); }
        else if (a === 'confirm') { audio.play('confirm'); choices[idx].run(); }
        else if (a === 'back') A.pop();
      },
    });
  }
  const closeAll = () => { while (A.stack.length) A.pop(); };

  SV.title = { leave, slash, reveal };
})();

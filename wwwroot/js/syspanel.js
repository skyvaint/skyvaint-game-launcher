// The profile panel: hover (or click) your picture in the top bar for CPU and memory use, how full each drive is,
// the Windows volume, and quick buttons for MINI and HOME. Live numbers refresh every second and a half while open.
(() => {
  const A = SV.app, { host, audio } = SV;
  const { $, el, esc } = A;
  const gb = (b) => (b / 1073741824 >= 100 ? Math.round(b / 1073741824) : (b / 1073741824).toFixed(1)) + ' GB';

  const who = $('#topbar .who');
  const panel = el(`
    <div id="syspanel">
      <div class="sp-head"><span class="sp-avatar"></span><div><b class="sp-name"></b><small class="tag">[ ${esc(A.T('THIS PC'))} ]</small></div></div>
      <div class="sp-meters"></div>
      <div class="sp-vol"><button class="sp-mute" title="Mute"></button><input type="range" min="0" max="100" step="1"><b class="sp-volnum">—</b></div>
      <div class="sp-btns"><button class="btn small" data-a="mini">MINI MODE</button><button class="btn small" data-a="home">HOME</button><button class="btn small ghost" data-a="tasks">STOP APPS</button></div>
    </div>`);
  document.body.append(panel);
  const meters = $('.sp-meters', panel), range = $('.sp-vol input', panel), mute = $('.sp-mute', panel);
  let open = false, timer = 0, closeTimer = 0, last = null, dragging = false;

  const SPEAKER = (m) => `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/>${m ? '<path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'}</svg>`;
  const bar = (label, value, pct, hot) => `<div class="sp-meter ${hot ? 'hot' : ''}"><div class="sp-row"><span>${esc(A.T(label))}</span><b>${esc(value)}</b></div><i><em style="width:${Math.max(1, Math.min(100, pct)).toFixed(1)}%"></em></i></div>`;

  function paint(s) {
    last = s;
    $('.sp-name', panel).textContent = A.cfg.profile.name;
    const av = $('.sp-avatar', panel);
    av.textContent = A.cfg.profile.avatar ? '' : (A.cfg.profile.name[0] || 'S').toUpperCase();
    av.style.backgroundImage = A.cfg.profile.avatar ? `url("${A.cfg.profile.avatar}")` : '';
    if (!s) { meters.innerHTML = '<div class="tag">LOADING…</div>'; return; }
    const ramPct = s.ramTotal ? (s.ramUsed / s.ramTotal) * 100 : 0;
    meters.innerHTML = [
      bar('CPU', Math.round(s.cpu) + '%', s.cpu, s.cpu > 85),
      bar('RAM', `${gb(s.ramUsed || 0)} / ${gb(s.ramTotal || 0)}`, ramPct, ramPct > 85),
      ...(s.drives || []).map((d) => {
        const used = d.total - d.free, pct = (used / d.total) * 100;
        return bar(`${d.name} ${d.label || ''}`.trim(), `${gb(used)} ${A.T('used')} · ${gb(d.free)} ${A.T('free')}`, pct, d.free / d.total < 0.1);
      }),
    ].join('');
    if (!dragging && s.volume != null) range.value = s.volume;
    $('.sp-volnum', panel).textContent = s.volume != null ? (s.muted ? A.T('MUTED') : Math.round(range.value) + '%') : '—';
    mute.innerHTML = SPEAKER(!!s.muted);
    panel.classList.toggle('muted', !!s.muted);
  }

  function place() {
    const r = who.getBoundingClientRect();
    panel.style.top = (r.bottom + 10) + 'px';
    panel.style.right = Math.max(12, innerWidth - r.right - 20) + 'px';
  }

  function show() {
    clearTimeout(closeTimer);
    if (open) return;
    open = true;
    place();
    paint(last);
    panel.classList.add('on');
    host.send('systemStats');
    clearInterval(timer);
    timer = setInterval(() => host.send('systemStats'), 1500);
  }
  function hide(now) {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { open = false; panel.classList.remove('on'); clearInterval(timer); }, now ? 0 : 260);
  }

  who.addEventListener('mouseenter', show);
  who.addEventListener('mouseleave', () => hide());
  who.addEventListener('click', () => (open ? hide(true) : show()));
  panel.addEventListener('mouseenter', show);
  panel.addEventListener('mouseleave', () => { if (!dragging) hide(); });
  host.on('systemStats', (m) => { if (open) paint(m); else last = m; });

  // Volume: changes as you drag, sent at most every 60 ms.
  let sendAt = 0;
  range.addEventListener('input', () => {
    $('.sp-volnum', panel).textContent = range.value + '%';
    const now = performance.now();
    if (now - sendAt > 60) { sendAt = now; host.send('setVolume', { level: +range.value }); }
  });
  range.addEventListener('pointerdown', () => { dragging = true; });
  range.addEventListener('change', () => { dragging = false; host.send('setVolume', { level: +range.value }); audio.play('toggle'); setTimeout(() => host.send('systemStats'), 120); });
  range.addEventListener('wheel', (e) => { e.preventDefault(); range.value = Math.max(0, Math.min(100, +range.value + (e.deltaY < 0 ? 2 : -2))); host.send('setVolume', { level: +range.value }); $('.sp-volnum', panel).textContent = range.value + '%'; }, { passive: false });
  mute.addEventListener('click', () => { host.send('muteVolume', { on: !(last && last.muted) }); audio.play('toggle'); setTimeout(() => host.send('systemStats'), 120); });

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    audio.play('confirm');
    hide(true);
    if (b.dataset.a === 'mini') { while (A.stack.length) A.pop(); A.leaveTo('mini'); }
    else if (b.dataset.a === 'home') { while (A.stack.length) A.pop(); SV.rails && SV.rails.close(); }
    else if (b.dataset.a === 'tasks') A.openTasks();
  });
  addEventListener('resize', () => { if (open) place(); });
})();

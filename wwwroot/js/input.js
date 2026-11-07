// Turns keyboard and gamepad input into one small set of actions:
// up down left right confirm back options settings mini tabPrev tabNext clips alt search random stats
// While a controller is in use the mouse pointer is hidden and hover effects are switched off, so a pointer left
// parked on a button doesn't fight with what the controller has selected.
window.SV = window.SV || {};

SV.input = (() => {
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm',
    Escape: 'back', Backspace: 'back',
    Tab: 'options', KeyO: 'options', KeyT: 'settings', KeyM: 'mini',
    KeyQ: 'tabPrev', KeyE: 'tabNext', KeyC: 'clips', KeyF: 'alt', KeyX: 'tasks',
    Slash: 'search', KeyR: 'random', KeyP: 'stats',
  };
  // Standard gamepad mapping (DualShock / DualSense / Xbox all report this in Chromium).
  const BUTTONS = {
    0: 'confirm', 1: 'back', 2: 'alt', 3: 'settings', 4: 'tabPrev', 5: 'tabNext', 8: 'random', 9: 'options',
    10: 'stats', 11: 'search', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'mini', 17: 'mini',
  };
  const REPEATS = new Set(['up', 'down', 'left', 'right']);
  const FIRST_REPEAT = 380, NEXT_REPEAT = 110;
  // The stick has to pass PRESS to count and fall below RELEASE to let go, so resting near the edge doesn't flicker.
  const PRESS = 0.55, RELEASE = 0.35, SCROLL_DEAD = 0.18;
  // A mouse has to really move to take over: the browser sends made-up "mouse moved" events after the page changes
  // under a still pointer, and a bumped desk is only a few pixels.
  const MOUSE_TAKEOVER = 10;

  let onAction = () => {}, onDevice = () => {};
  let device = 'kb', enabled = true, haptics = true, family = 'xbox';
  const held = {}; // action -> next repeat time
  const stick = { x: 0, y: 0 };

  function setDevice(d) {
    if (d === device) return;
    device = d;
    document.body.dataset.input = d;
    onDevice(d);
  }

  const typing = (el) => el && (el.tagName === 'INPUT' && el.type !== 'color' || el.tagName === 'TEXTAREA');

  addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (typing(e.target)) {
      if (e.code === 'Escape' || e.code === 'Enter') { e.target.blur(); e.preventDefault(); }
      return;
    }
    // "/" sits on a different key on many layouts (Shift + 7 on Spanish ones), so it is matched by character too.
    const action = KEYS[e.code] || (e.key === '/' ? 'search' : undefined);
    if (!action || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    if (e.repeat && !REPEATS.has(action)) return;
    setDevice('kb');
    onAction(action);
  });

  let moved = 0, movedAt = 0;
  addEventListener('mousemove', (e) => {
    if (device !== 'pad') return;
    const now = performance.now();
    if (now - movedAt > 250) moved = 0;
    movedAt = now;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (moved >= MOUSE_TAKEOVER) setDevice('kb');
  }, { passive: true });
  for (const type of ['mousedown', 'wheel']) addEventListener(type, () => { if (device === 'pad') setDevice('kb'); }, { passive: true, capture: true });

  // What the right stick scrolls: the top screen's long list, or the rows under HOME.
  function scroller() {
    const top = document.querySelector('#overlays > .overlay:last-child');
    const scope = top || (document.body.classList.contains('rails-on') ? document.getElementById('rails') : null);
    if (!scope) return null;
    for (const el of scope.querySelectorAll('.st-body, .rails-body, .sheet-body, .dt-body, [data-scroll], .picker-list, .menu-list')) {
      if (el.scrollHeight > el.clientHeight + 4) return el;
    }
    return null;
  }

  function padFamily(id) {
    const s = String(id || '').toLowerCase();
    return /dualsense|dualshock|wireless controller|playstation|054c/.test(s) ? 'ps' : /nintendo|pro controller|057e/.test(s) ? 'nintendo' : 'xbox';
  }

  function pollPads(now, dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const down = new Set();
    let sx = 0, sy = 0, ry = 0, pressedAny = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const standard = pad.mapping === 'standard';
      pad.buttons.forEach((b, i) => { if (b.pressed && BUTTONS[i]) { down.add(BUTTONS[i]); pressedAny = true; } });
      const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      if (Math.abs(x) > Math.abs(sx)) sx = x;
      if (Math.abs(y) > Math.abs(sy)) sy = y;
      if (standard && Math.abs(pad.axes[3] || 0) > Math.abs(ry)) ry = pad.axes[3];
      // Pads without the standard layout often report the D-pad as one "hat" axis (-1 up, then clockwise in steps).
      if (!standard && pad.axes.length > 9) {
        const hat = pad.axes[9];
        if (hat >= -1.05 && hat <= 1.05) {
          const step = Math.round((hat + 1) / (2 / 7));
          if (step === 0 || step === 1 || step === 7) down.add('up');
          if (step >= 1 && step <= 3) down.add('right');
          if (step >= 3 && step <= 5) down.add('down');
          if (step >= 5 && step <= 7) down.add('left');
        }
      }
    }
    // Left stick: with hysteresis, one direction at a time, so a diagonal doesn't move twice.
    const was = (d) => d in held;
    if (Math.abs(sx) >= Math.abs(sy)) {
      if (sx < -PRESS || (was('left') && sx < -RELEASE)) down.add('left');
      else if (sx > PRESS || (was('right') && sx > RELEASE)) down.add('right');
    } else if (sy < -PRESS || (was('up') && sy < -RELEASE)) down.add('up');
    else if (sy > PRESS || (was('down') && sy > RELEASE)) down.add('down');

    // Right stick scrolls long lists smoothly.
    if (Math.abs(ry) > SCROLL_DEAD) {
      const el = scroller();
      if (el) { setDevice('pad'); el.scrollTop += ry * Math.abs(ry) * dt * 1.6; }
    }

    for (const action of down) {
      if (!(action in held)) {
        held[action] = now + FIRST_REPEAT;
        setDevice('pad');
        onAction(action);
      } else if (REPEATS.has(action) && now >= held[action]) {
        held[action] = now + NEXT_REPEAT;
        onAction(action);
      }
    }
    for (const action in held) if (!down.has(action)) delete held[action];
    return pressedAny;
  }

  // Poll every frame only while a pad is connected and the window is in use; otherwise idle. Pads are looked for
  // on a slow timer as well: after the page loads again nothing announces a pad that was already connected.
  let padsOn = 0, last = 0, running = false;
  function loop(now) {
    if (padsOn > 0 && enabled && !document.hidden && document.hasFocus()) {
      pollPads(now, Math.min(50, now - (last || now)));
      last = now;
      requestAnimationFrame(loop);
    } else {
      running = false;
      last = 0;
    }
  }
  function wake() { if (!running && padsOn > 0 && !document.hidden) { running = true; requestAnimationFrame(loop); } }
  function look() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    if (list.length !== padsOn) {
      padsOn = list.length;
      if (padsOn) {
        family = padFamily(list[0].id);
        document.body.dataset.pad = family;
      } else if (device === 'pad') setDevice('kb');
    }
    wake();
  }
  addEventListener('gamepadconnected', (e) => { look(); SV.onPad && SV.onPad(true, e.gamepad.id); });
  addEventListener('gamepaddisconnected', () => { look(); SV.onPad && SV.onPad(false); });
  addEventListener('focus', look);
  document.addEventListener('visibilitychange', look);
  setInterval(look, 1500);

  function rumble(strength = 0.6, ms = 180) {
    if (!haptics || device !== 'pad') return;
    for (const pad of navigator.getGamepads()) {
      const act = pad && pad.vibrationActuator;
      if (act && act.playEffect)
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
    }
  }

  return {
    set onAction(fn) { onAction = fn; },
    set onDevice(fn) { onDevice = fn; },
    setEnabled(on) { enabled = on; wake(); },
    setHaptics(on) { haptics = on; },
    rumble,
    get device() { return device; },
    get family() { return family; },
  };
})();

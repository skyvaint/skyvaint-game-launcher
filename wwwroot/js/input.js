// Turns keyboard and gamepad input into one small set of actions:
// up down left right confirm back options settings mini tabPrev tabNext clips alt search random stats
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

  let onAction = () => {}, onDevice = () => {};
  let device = 'kb', enabled = true, haptics = true;
  const held = {}; // action -> next repeat time

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

  addEventListener('mousemove', () => { if (device === 'pad') setDevice('kb'); }, { passive: true });

  function pollPads(now) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const down = new Set();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => { if (b.pressed && BUTTONS[i]) down.add(BUTTONS[i]); });
      const [x = 0, y = 0] = pad.axes;
      if (x < -0.55) down.add('left'); else if (x > 0.55) down.add('right');
      if (y < -0.55) down.add('up'); else if (y > 0.55) down.add('down');
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
  }

  // Poll every frame only while a pad is connected and the window is in use; otherwise idle.
  let connected = 0;
  function loop(now) {
    if (connected > 0 && enabled && !document.hidden && document.hasFocus()) {
      pollPads(now);
      requestAnimationFrame(loop);
    } else {
      setTimeout(() => requestAnimationFrame(loop), 400);
    }
  }
  addEventListener('gamepadconnected', (e) => { connected++; SV.onPad && SV.onPad(true, e.gamepad.id); });
  addEventListener('gamepaddisconnected', () => { connected = Math.max(0, connected - 1); SV.onPad && SV.onPad(false); });
  requestAnimationFrame(loop);

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
    setEnabled(on) { enabled = on; },
    setHaptics(on) { haptics = on; },
    rumble,
    get device() { return device; },
  };
})();

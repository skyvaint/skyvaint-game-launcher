// All interface sounds are synthesised with WebAudio, so there are no audio assets to load.
// A "pack" changes the timbre; an "event" is a short note sequence. Custom files can override any event.
window.SV = window.SV || {};

SV.audio = (() => {
  // Optional per-pack extras: unison (extra detuned voices), octave (level of a voice an octave up),
  // drop (semitones each note falls), vibrato [Hz, cents], attack (s), q (filter resonance), sweep (filter closes from N× lowpass).
  const PACKS = {
    // Fighting-game menu feel (Budokai Tenkaichi style): bright two-tone cursor chirps, a ringing "shing" on select,
    // a falling blip on cancel and a heavy impact for slams. Its own note sequences replace the shared ones.
    tenkaichi: { name: 'Tenkaichi', wave: 'square', base: 988, decay: 0.7, lowpass: 6500, noise: 0.55, gain: 0.42, octave: 0.45, q: 1.5,
      events: {
        nav: [[0, 0, 0.035, 0.5], [12, 0.025, 0.05, 0.38]],
        toggle: [[7, 0, 0.04, 0.45], [12, 0.03, 0.05, 0.35]],
        confirm: [[-12, 0, 0.05, 0.55], [0, 0.03, 0.07, 0.5], [12, 0.06, 0.38, 0.4], [19, 0.08, 0.42, 0.25]],
        back: [[5, 0, 0.05, 0.5], [-7, 0.04, 0.16, 0.45, -14]],
        open: [[-5, 0, 0.05, 0.45], [7, 0.04, 0.12, 0.4]],
        pick: [[0, 0, 0.05, 0.5], [12, 0.04, 0.06, 0.5], [24, 0.08, 0.3, 0.35]],
        star: [[12, 0, 0.05, 0.45], [19, 0.05, 0.05, 0.45], [24, 0.1, 0.06, 0.45], [31, 0.15, 0.5, 0.35]],
        slam: [[-36, 0, 0.42, 0.95, -52], [-24, 0, 0.16, 0.45, -36]],
      },
      noisy: { slam: [0, 0.32], confirm: [0, 0.18], boot: [0.2, 1.4], launch: [0, 1.1] } },
    pulse:   { name: 'Pulse',   wave: 'sine',     base: 660, decay: 1.0, lowpass: 9000, noise: 0.0 },
    bolt:    { name: 'Bolt',    wave: 'sawtooth', base: 330, decay: 0.8, lowpass: 2600, noise: 0.6 },
    arcade:  { name: 'Arcade',  wave: 'square',   base: 523, decay: 0.6, lowpass: 5200, noise: 0.0, gain: 0.5 },
    glass:   { name: 'Glass',   wave: 'triangle', base: 880, decay: 2.4, lowpass: 12000, noise: 0.0 },
    neon:    { name: 'Neon',    wave: 'sawtooth', base: 440, decay: 1.3, lowpass: 3800, noise: 0.2, unison: 2, gain: 0.55, sweep: 3 },
    chip:    { name: 'Chiptune', wave: 'square',  base: 784, decay: 0.45, lowpass: 7000, noise: 0.0, gain: 0.4, vibrato: [14, 30] },
    sub:     { name: 'Sub',     wave: 'sine',     base: 165, decay: 1.4, lowpass: 900, noise: 0.3, gain: 1.6, octave: 0.25 },
    crystal: { name: 'Crystal', wave: 'triangle', base: 1175, decay: 3.0, lowpass: 14000, noise: 0.0, octave: 0.5, gain: 0.8 },
    laser:   { name: 'Laser',   wave: 'sawtooth', base: 990, decay: 0.7, lowpass: 6000, noise: 0.1, drop: 14, gain: 0.5 },
    organ:   { name: 'Organ',   wave: 'sine',     base: 392, decay: 1.6, lowpass: 5000, noise: 0.0, octave: 0.6, unison: 1, attack: 0.03 },
    zap:     { name: 'Zap',     wave: 'square',   base: 294, decay: 0.5, lowpass: 3200, noise: 0.8, drop: -9, gain: 0.45, q: 8 },
    vapor:   { name: 'Vapor',   wave: 'triangle', base: 349, decay: 3.2, lowpass: 2400, noise: 0.1, unison: 2, attack: 0.06, vibrato: [4, 12] },
    marimba: { name: 'Marimba', wave: 'sine',     base: 587, decay: 0.55, lowpass: 8000, noise: 0.0, octave: 0.35, gain: 1.2 },
    thunder: { name: 'Thunder', wave: 'sawtooth', base: 98,  decay: 1.5, lowpass: 700, noise: 1.0, gain: 1.5, unison: 1, q: 3 },
    hologram:{ name: 'Hologram', wave: 'sine',    base: 740, decay: 1.8, lowpass: 10000, noise: 0.15, vibrato: [7, 45], octave: 0.3, sweep: 2 },
    reactor: { name: 'Reactor', wave: 'square',   base: 220, decay: 1.1, lowpass: 1500, noise: 0.5, unison: 2, gain: 0.5, q: 10, sweep: 5 },
    bubble:  { name: 'Bubble',  wave: 'sine',     base: 520, decay: 0.5, lowpass: 9000, noise: 0.0, drop: -12, gain: 1.1 },
    stadium: { name: 'Stadium', wave: 'triangle', base: 262, decay: 1.2, lowpass: 4200, noise: 0.9, octave: 0.5, unison: 1, attack: 0.02 },
  };

  // [semitones from base, start (s), length (s), gain, slide to semitone]
  const EVENTS = {
    nav:     [[12, 0, 0.06, 0.45]],
    confirm: [[0, 0, 0.08, 0.55], [7, 0.06, 0.16, 0.55]],
    back:    [[5, 0, 0.07, 0.45], [-2, 0.05, 0.13, 0.45]],
    toggle:  [[7, 0, 0.05, 0.4]],
    error:   [[-7, 0, 0.1, 0.5], [-8, 0.1, 0.18, 0.5]],
    open:    [[0, 0, 0.07, 0.4], [4, 0.05, 0.07, 0.4], [7, 0.1, 0.16, 0.4]],
    pick:    [[7, 0, 0.06, 0.5], [12, 0.05, 0.08, 0.5], [16, 0.1, 0.2, 0.45]],
    star:    [[12, 0, 0.06, 0.45], [19, 0.06, 0.07, 0.45], [24, 0.12, 0.3, 0.4]],
    boot:    [[-12, 0, 1.7, 0.5], [-5, 0.18, 1.5, 0.4], [0, 0.36, 1.4, 0.4], [4, 0.6, 1.3, 0.35], [7, 0.85, 1.6, 0.35], [12, 1.15, 1.9, 0.3]],
    launch:  [[-12, 0, 0.9, 0.6, 0], [0, 0.1, 0.8, 0.4, 12], [7, 0.55, 0.7, 0.4], [12, 0.75, 1.0, 0.45], [19, 0.9, 1.3, 0.3]],
    slam:    [[-24, 0, 0.35, 0.8, -40], [-12, 0, 0.12, 0.4]],
  };
  const NOISY = { boot: [0.2, 1.4], launch: [0.0, 1.1], confirm: [0, 0.08], slam: [0, 0.28] };
  const EVENT_NAMES = Object.keys(EVENTS).concat(['back', 'toggle', 'error', 'open', 'pick', 'star']).filter((v, i, a) => a.indexOf(v) === i);

  let ctx, master, ambientNodes, echoGain;
  let opt = { master: 0.6, pack: 'pulse', events: {}, custom: {}, ambient: 0, pitch: 0, echo: 0 };
  let ambientOn = true;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = opt.master;
      master.connect(ctx.destination);
      // Echo: a feedback delay beside the dry signal, silent until the echo setting is raised.
      const delay = ctx.createDelay(1), feedback = ctx.createGain();
      echoGain = ctx.createGain();
      delay.delayTime.value = 0.19;
      feedback.gain.value = 0.42;
      echoGain.gain.value = opt.echo * 0.7;
      master.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(echoGain).connect(ctx.destination);
    } catch { return false; }
    return true;
  }

  function voice(pack, freq, t0, dur, level, slideTo, detune) {
    const osc = ctx.createOscillator(), amp = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = pack.wave;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    if (pack.vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = pack.vibrato[0];
      depth.gain.value = pack.vibrato[1];
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    lp.type = 'lowpass';
    lp.Q.value = pack.q || 0.7;
    if (pack.sweep) {
      lp.frequency.setValueAtTime(Math.min(18000, pack.lowpass * pack.sweep), t0);
      lp.frequency.exponentialRampToValueAtTime(pack.lowpass, t0 + dur);
    } else lp.frequency.value = pack.lowpass;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(level, t0 + (pack.attack || 0.008));
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(lp).connect(amp).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function note(pack, [semi, start, len, gain, slide], when) {
    const t0 = when + start, dur = len * pack.decay;
    const f = pack.base * Math.pow(2, (semi + (opt.pitch || 0)) / 12);
    const to = slide != null ? pack.base * Math.pow(2, (slide + (opt.pitch || 0)) / 12) : pack.drop ? f * Math.pow(2, -pack.drop / 12) : 0;
    const voices = 1 + (pack.unison || 0), level = gain * 0.28 * (pack.gain || 1) / Math.sqrt(voices);
    for (let v = 0; v < voices; v++) voice(pack, f, t0, dur, level, to, v ? (v % 2 ? 1 : -1) * 9 * Math.ceil(v / 2) : 0);
    if (pack.octave) voice(pack, f * 2, t0, dur * 0.8, level * pack.octave, to * 2, 0);
  }

  function whoosh(pack, [start, len], when, rising) {
    const n = Math.floor(ctx.sampleRate * len), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), amp = ctx.createGain(), t0 = when + start;
    src.buffer = buf;
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(rising ? 300 : 3000, t0);
    bp.frequency.exponentialRampToValueAtTime(rising ? 6000 : 500, t0 + len);
    const peak = 0.05 + 0.12 * pack.noise;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + len * 0.6);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(bp).connect(amp).connect(master);
    src.start(t0);
  }

  // Your own files: decoded once, then played through WebAudio so rapid cursor sounds don't stutter or cut off.
  const buffers = new Map();
  function playFile(url) {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    const have = buffers.get(url);
    if (have && have !== 'loading') {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = have;
      g.gain.value = 1;
      src.connect(g).connect(master);
      src.start();
      return true;
    }
    if (!have) {
      buffers.set(url, 'loading');
      fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { buffers.set(url, buf); playFile(url); })
        .catch(() => { buffers.delete(url); const a = new Audio(url); a.volume = Math.min(1, opt.master); a.play().catch(() => {}); });
    }
    return true;
  }

  let lastAt = {};
  function play(event) {
    if (opt.master <= 0 || opt.events[event] === false) return;
    const now = performance.now();
    if (now - (lastAt[event] || 0) < 28) return; // the same sound twice in one frame is just louder, not useful
    lastAt[event] = now;
    const custom = opt.custom && opt.custom[event];
    if (custom) { playFile(custom); return; }
    if (!ensure()) return;
    const pack = PACKS[opt.pack] || PACKS.pulse, seq = (pack.events && pack.events[event]) || EVENTS[event];
    if (!seq) return;
    if (ctx.state === 'suspended') ctx.resume();
    const when = ctx.currentTime + 0.01, noisy = (pack.noisy || NOISY)[event];
    seq.forEach((n) => note(pack, n, when));
    if (noisy && (pack.noise > 0 || event !== 'confirm')) whoosh(pack, noisy, when, event !== 'boot' && event !== 'slam');
  }

  // Low drone under the HOME screen. Two detuned voices through a slowly breathing filter.
  function updateAmbient() {
    const level = ambientOn ? opt.ambient : 0;
    if (level <= 0) {
      if (ambientNodes) ambientNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      return;
    }
    if (!ensure()) return;
    if (!ambientNodes) {
      const gain = ctx.createGain(), lp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      gain.gain.value = 0;
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lfo.frequency.value = 0.07;
      depth.gain.value = 140;
      lfo.connect(depth).connect(lp.frequency);
      [55, 55.4, 82.5, 110.3].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      });
      lp.connect(gain).connect(master);
      lfo.start();
      ambientNodes = { gain };
    }
    ambientNodes.gain.gain.setTargetAtTime(level * 0.22, ctx.currentTime, 0.8);
  }

  function configure(sound) {
    opt = { ...opt, ...sound };
    if (master) master.gain.setTargetAtTime(opt.master, ctx.currentTime, 0.05);
    if (echoGain) echoGain.gain.setTargetAtTime((opt.echo || 0) * 0.7, ctx.currentTime, 0.05);
    updateAmbient();
  }

  function setAmbientActive(on) {
    ambientOn = on;
    if (ctx) updateAmbient();
  }

  return { play, configure, setAmbientActive, PACKS, EVENT_NAMES, preview: (url) => playFile(url) };
})();

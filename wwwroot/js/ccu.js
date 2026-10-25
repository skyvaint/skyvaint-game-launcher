// Roblox player counts over time. Roblox only says how many are playing right now, so every count the launcher sees
// (trending lists, your saved places every few minutes, details screens) is kept here for a week. That gives each
// game a peak, a low, an average and a chart. Kept in this PC's browser storage, not in the settings file.
(() => {
  const KEY = 'sv-ccu', KEEP = 7 * 864e5, GAP = 4 * 60e3, MAX_GAMES = 150;
  let db = {};
  try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { db = {}; }
  let saveTimer = 0;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { } }, 1500); };

  // One sample: { t: time, n: players, v: visits (when known) }.
  function record(universeId, playing, extra = {}) {
    const id = String(universeId || ''), n = +playing;
    if (!id || id === '0' || !isFinite(n)) return;
    const g = db[id] || (db[id] = { name: '', s: [] }), now = Date.now();
    if (extra.name) g.name = extra.name;
    const last = g.s[g.s.length - 1];
    const sample = { t: now, n };
    if (extra.visits) sample.v = +extra.visits;
    if (last && now - last.t < GAP) { g.s[g.s.length - 1] = { ...last, ...sample, t: last.t, n: Math.max(last.n, n) }; }
    else g.s.push(sample);
    g.s = g.s.filter((x) => now - x.t < KEEP);
    g.peak = Math.max(g.peak || 0, n);
    if (n >= (g.peak || 0)) g.peakAt = now;
    const ids = Object.keys(db);
    if (ids.length > MAX_GAMES) {
      ids.sort((a, b) => (db[a].s.at(-1)?.t || 0) - (db[b].s.at(-1)?.t || 0)).slice(0, ids.length - MAX_GAMES).forEach((k) => delete db[k]);
    }
    save();
  }

  function stats(universeId) {
    const g = db[String(universeId || '')];
    if (!g || !g.s.length) return null;
    const now = Date.now(), day = g.s.filter((x) => now - x.t < 864e5), all = g.s;
    const nums = (l) => l.map((x) => x.n);
    const avg = (l) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0);
    // Visits gained per day, from the oldest and newest samples that carry a visit count.
    const withV = all.filter((x) => x.v);
    let visitsPerDay = 0;
    if (withV.length > 1) {
      const a = withV[0], b = withV[withV.length - 1], days = (b.t - a.t) / 864e5;
      if (days > 0.02) visitsPerDay = Math.max(0, Math.round((b.v - a.v) / days));
    }
    return {
      now: all.at(-1).n, peak: g.peak || Math.max(...nums(all)), peakAt: g.peakAt || 0,
      peak24: day.length ? Math.max(...nums(day)) : 0, low24: day.length ? Math.min(...nums(day)) : 0, avg24: avg(nums(day)), avg7: avg(nums(all)),
      samples: all.length, since: all[0].t, visitsPerDay, series: all,
    };
  }

  // A small line chart of the last week (or whatever has been seen), as inline SVG.
  function chart(universeId, w = 600, h = 120) {
    const s = stats(universeId);
    if (!s || s.series.length < 2) return '';
    const pts = s.series, t0 = pts[0].t, t1 = pts.at(-1).t, max = Math.max(1, ...pts.map((p) => p.n));
    const x = (t) => ((t - t0) / Math.max(1, t1 - t0)) * (w - 4) + 2, y = (n) => h - 4 - (n / max) * (h - 18);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.n).toFixed(1)}`).join('');
    const peak = pts.reduce((a, b) => (b.n > a.n ? b : a));
    return `<svg class="ccu-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="ccuFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <path d="${line}L${x(t1).toFixed(1)},${h}L${x(t0).toFixed(1)},${h}Z" fill="url(#ccuFill)"/>
      <path d="${line}" fill="none" stroke="var(--accent2)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(peak.t).toFixed(1)}" cy="${y(peak.n).toFixed(1)}" r="4" fill="#fff"/></svg>`;
  }

  // Counts arrive from several places; each one goes into the history.
  SV.host.on('discover', (m) => {
    const r = m.roblox || {};
    for (const list of [r.trending, r.rising, r.playing]) for (const g of list || []) record(g.universeId, g.playing, { name: g.title });
  });
  SV.host.on('robloxPlaceArt', (m) => { for (const it of m.items || []) record(it.universeId, it.playing, { name: it.name, visits: it.visits }); });
  SV.host.on('studioProjects', (m) => { for (const c of m.cloud || []) record(c.universeId, c.playing, { name: c.name, visits: c.visits }); });
  SV.host.on('gameDetails', (m) => { const d = m.details; if (d && d.universeId && d.playing != null) record(d.universeId, d.playing, { name: d.name, visits: d.visits }); });

  SV.ccu = { record, stats, chart };
})();

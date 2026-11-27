// Widgets you build yourself in the WIDGET CREATOR. A widget is a card (its look) holding blocks top to bottom:
// text with live {tokens}, a big line, a bar, a picture, a button and empty space. The same drawing is used on HOME,
// on the desktop and in the creator's preview, so what you design is what you get. Loaded by index.html and desktop.html.
window.SVW = (() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // {time} {time12} {seconds} {date} {day} {month} {year} {greeting} {name} {cpu} {ram} {song} {artist} {days:2026-12-25}
  const TOKENS = [
    ['{time}', 'Time, 24-hour'], ['{time12}', 'Time, 12-hour'], ['{date}', 'Date'], ['{day}', 'Weekday'], ['{month}', 'Month'], ['{year}', 'Year'],
    ['{greeting}', 'Good morning / afternoon / evening'], ['{name}', 'Your profile name'], ['{cpu}', 'CPU use %'], ['{ram}', 'Memory use %'],
    ['{song}', 'Song playing'], ['{artist}', 'Artist playing'], ['{days:2026-12-25}', 'Days until a date'],
  ];
  function fill(text, ctx) {
    const d = new Date();
    const h = d.getHours();
    return String(text || '').replace(/\{(\w+)(?::([^}]*))?\}/g, (all, k, arg) => {
      switch (k) {
        case 'time': return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        case 'time12': return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        case 'seconds': return String(d.getSeconds()).padStart(2, '0');
        case 'date': return d.toLocaleDateString([], { day: 'numeric', month: 'long' });
        case 'day': return d.toLocaleDateString([], { weekday: 'long' });
        case 'month': return d.toLocaleDateString([], { month: 'long' });
        case 'year': return String(d.getFullYear());
        case 'greeting': return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        case 'name': return (ctx && ctx.name) || '';
        case 'cpu': return ctx && ctx.perf ? Math.round(ctx.perf.cpu) + '%' : '…';
        case 'ram': return ctx && ctx.perf ? Math.round(ctx.perf.ram) + '%' : '…';
        case 'song': return (ctx && ctx.music && ctx.music.title) || 'Nothing playing';
        case 'artist': return (ctx && ctx.music && ctx.music.artist) || '';
        case 'days': { const t = new Date((arg || '') + 'T00:00:00').getTime(); return isNaN(t) ? '—' : String(Math.max(0, Math.ceil((t - Date.now()) / 864e5))); }
        default: return all;
      }
    });
  }
  // Does anything in this widget change by itself (so it needs redrawing now and then)?
  const live = (spec) => (spec.blocks || []).some((b) => /\{(time|time12|seconds|cpu|ram|song|artist|greeting)\b/.test((b.text || '') + (b.label || '')) || b.t === 'bar');

  const FONTS = { sans: "'Segoe UI Variable Display','Segoe UI',sans-serif", display: "'Bebas Neue','Oswald','Segoe UI',sans-serif", mono: "'Cascadia Code',Consolas,monospace", serif: "Georgia,'Times New Roman',serif" };

  function cardStyle(look, accent, accent2) {
    const L = look || {};
    const c1 = L.c1 || accent || '#ff1f1f', c2 = L.c2 || accent2 || '#8b3dff';
    const bg = L.bg === 'solid' ? c1 : L.bg === 'gradient' ? `linear-gradient(${L.angle == null ? 135 : L.angle}deg, ${c1}, ${c2})`
      : L.bg === 'none' ? 'transparent' : `rgba(14,10,10,${L.glass == null ? 0.62 : L.glass})`;
    const s = [
      `background:${bg}`, `border-radius:${L.radius == null ? 18 : L.radius}px`, `padding:${L.pad == null ? 18 : L.pad}px`,
      `color:${L.text || '#f5efee'}`, `font-family:${FONTS[L.font] || FONTS.sans}`, `text-align:${L.align || 'left'}`,
      `width:${L.w ? L.w + 'px' : 'auto'}`, 'box-sizing:border-box', 'display:flex', 'flex-direction:column',
      `gap:${L.gap == null ? 6 : L.gap}px`, `align-items:${L.align === 'center' ? 'center' : L.align === 'right' ? 'flex-end' : 'flex-start'}`,
    ];
    if (!L.bg || L.bg === 'glass') s.push('backdrop-filter:blur(18px) saturate(1.3)');
    if (L.border) s.push(`border:${L.border}px solid ${L.borderColor || 'rgba(255,255,255,.18)'}`);
    const shadows = [];
    if (L.glow) shadows.push(`0 0 ${L.glow}px ${L.glowColor || c1}`);
    if (L.shadow !== false && L.bg !== 'none') shadows.push('0 10px 30px rgba(0,0,0,.35)');
    if (shadows.length) s.push(`box-shadow:${shadows.join(',')}`);
    return s.join(';');
  }

  function block(b, ctx, i) {
    const op = b.opacity == null ? 1 : b.opacity;
    const txt = (size, weight) => `font-size:${b.size || size}px;font-weight:${b.weight || weight};opacity:${op};${b.upper ? 'text-transform:uppercase;' : ''}${b.spacing ? `letter-spacing:${b.spacing}em;` : ''}${b.color ? `color:${b.color};` : ''}line-height:1.15;white-space:pre-wrap;max-width:100%`;
    switch (b.t) {
      case 'text': return `<div style="${txt(15, 500)}">${esc(fill(b.text, ctx))}</div>`;
      case 'big': return `<div style="${txt(54, 700)};letter-spacing:${b.spacing == null ? -0.02 : b.spacing}em">${esc(fill(b.text, ctx))}</div>`;
      case 'bar': {
        const v = b.of === 'cpu' ? (ctx && ctx.perf ? ctx.perf.cpu : 0) : b.of === 'ram' ? (ctx && ctx.perf ? ctx.perf.ram : 0) : +b.value || 0;
        return `<div style="width:${b.width || 180}px;max-width:100%;height:${b.h || 6}px;border-radius:${(b.h || 6) / 2}px;background:rgba(255,255,255,.14);overflow:hidden;opacity:${op}"><i style="display:block;height:100%;width:${Math.max(0, Math.min(100, v))}%;background:${b.color || 'var(--accent,#ff1f1f)'};transition:width .6s"></i></div>`;
      }
      case 'image': return b.src ? `<img src="${esc(b.src)}" alt="" style="width:${b.width || 160}px;max-width:100%;height:${b.h ? b.h + 'px' : 'auto'};object-fit:cover;border-radius:${b.radius == null ? 12 : b.radius}px;opacity:${op}">` : '';
      case 'button': return `<button data-wk="${i}" style="font:600 ${b.size || 13}px/1 inherit;letter-spacing:.08em;padding:9px 14px;border-radius:${b.radius == null ? 10 : b.radius}px;border:0;cursor:pointer;color:${b.color || '#fff'};background:${b.bg || 'var(--accent,#ff1f1f)'};opacity:${op}">${esc(fill(b.label || 'OPEN', ctx))}</button>`;
      case 'space': return `<div style="height:${b.h || 10}px"></div>`;
      case 'line': return `<div style="width:${b.width || 120}px;max-width:100%;height:${b.h || 1}px;background:${b.color || 'currentColor'};opacity:${b.opacity == null ? 0.3 : b.opacity}"></div>`;
      default: return '';
    }
  }

  /** The widget's HTML. ctx: { perf: {cpu, ram}, music: {title, artist}, name, accent, accent2 } */
  function render(spec, ctx) {
    const s = spec || {};
    return `<div class="wk-card" style="${cardStyle(s.look, ctx && ctx.accent, ctx && ctx.accent2)}">${(s.blocks || []).map((b, i) => block(b, ctx, i)).join('')}</div>`;
  }

  // Ready-made starting points for the creator.
  const TEMPLATES = {
    clock: { name: 'Big clock', look: { bg: 'glass', radius: 22, pad: 22, font: 'display' }, blocks: [{ t: 'big', text: '{time}', size: 72 }, { t: 'text', text: '{day} · {date}', upper: true, spacing: 0.2, size: 12, opacity: 0.7 }] },
    greeting: { name: 'Greeting', look: { bg: 'none', pad: 6, align: 'left' }, blocks: [{ t: 'text', text: '{greeting},', size: 22, opacity: 0.8 }, { t: 'big', text: '{name}', size: 60 }] },
    stats: { name: 'PC stats', look: { bg: 'glass', radius: 16, pad: 18, font: 'mono' }, blocks: [{ t: 'text', text: 'CPU {cpu}', size: 12, upper: true, spacing: 0.2 }, { t: 'bar', of: 'cpu', width: 200 }, { t: 'text', text: 'RAM {ram}', size: 12, upper: true, spacing: 0.2 }, { t: 'bar', of: 'ram', width: 200 }] },
    countdown: { name: 'Countdown', look: { bg: 'gradient', radius: 20, pad: 20, align: 'center' }, blocks: [{ t: 'text', text: 'GTA 6', upper: true, spacing: 0.25, size: 12 }, { t: 'big', text: '{days:2026-12-25}', size: 64 }, { t: 'text', text: 'DAYS LEFT', size: 11, spacing: 0.3, opacity: 0.8 }] },
    launcher: { name: 'Launch button', look: { bg: 'glass', radius: 18, pad: 16, align: 'center' }, blocks: [{ t: 'text', text: 'READY?', upper: true, spacing: 0.3, size: 11, opacity: 0.7 }, { t: 'button', label: 'PLAY', target: '', size: 15 }] },
    music: { name: 'Now playing', look: { bg: 'glass', radius: 16, pad: 16 }, blocks: [{ t: 'text', text: 'NOW PLAYING', size: 11, spacing: 0.25, opacity: 0.7 }, { t: 'text', text: '{song}', size: 20, weight: 700 }, { t: 'text', text: '{artist}', size: 13, opacity: 0.7 }] },
    blank: { name: 'Empty card', look: { bg: 'glass', radius: 18, pad: 18 }, blocks: [{ t: 'text', text: 'Your text' }] },
  };

  return { render, fill, live, TOKENS, TEMPLATES, FONTS };
})();

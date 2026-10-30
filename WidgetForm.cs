using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// A desktop widget, Rainmeter style: a see-through window that draws one thing straight onto the desktop.
/// Kinds: "clock" (time and date), "music" (cover, song, controls), "perf" (CPU / RAM with little graphs, drives)
/// and "apps" (a frame of app icons). Unlock the widgets to drag them anywhere; they can show only on the desktop.
/// </summary>
sealed class WidgetForm : Form
{
    readonly MainForm owner;
    readonly Func<string, string?> localFile;
    public string WidgetId { get; }
    string kind = "clock", style = "glass", accentHex = "#ff1f1f";
    float scale = 1, opacity = 0.92f;
    bool locked = true, suppressed, h24 = true;
    Color accent = Color.FromArgb(255, 31, 31), accent2 = Color.FromArgb(255, 77, 61), bg = Color.FromArgb(7, 5, 5);
    JsonObject? data;
    JsonArray apps = new();
    readonly Dictionary<string, Bitmap?> images = new();
    readonly List<(RectangleF r, string action)> hits = new();
    readonly Queue<double> cpuHist = new(), ramHist = new();
    Point? dragFrom;
    int hover = -1;
    float fade = 0, fadeTarget = 1;
    readonly System.Windows.Forms.Timer anim = new() { Interval = 15 };

    public WidgetForm(MainForm owner, Func<string, string?> localFile, string id)
    {
        this.owner = owner;
        this.localFile = localFile;
        WidgetId = id;
        Text = "skyvaint widget";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        anim.Tick += (_, _) => StepFade();
    }

    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= 0x80000 | 0x80 | 0x08000000; return cp; } // layered, tool window, no-activate
    }
    protected override void OnPaint(PaintEventArgs e) { }
    protected override void OnPaintBackground(PaintEventArgs e) { }

    Size BaseSize => kind switch
    {
        "music" => new Size(360, 132), "perf" => new Size(300, 190), "apps" => new Size(Math.Max(140, Math.Min(6, Math.Max(1, apps.Count)) * 76 + 24), 40 + (int)Math.Ceiling(Math.Max(1, apps.Count) / 6.0) * 86),
        _ => new Size(330, 140),
    };

    /// <summary>Settings for this widget (kind, place, size, look) and the theme colours.</summary>
    public void Configure(JsonObject w, JsonObject? theme, bool locked)
    {
        kind = w["kind"]?.ToString() ?? "clock";
        style = w["style"]?.ToString() ?? "glass";
        scale = Math.Clamp((float)(Num(w["scale"]) ?? 1), 0.5f, 2.5f);
        opacity = Math.Clamp((float)(Num(w["opacity"]) ?? 0.92), 0.2f, 1f);
        h24 = w["clock24"]?.GetValue<bool>() ?? true;
        apps = w["apps"] as JsonArray ?? new JsonArray();
        this.locked = locked;
        accentHex = theme?["accent"]?.ToString() ?? accentHex;
        accent = Hex(accentHex, accent);
        accent2 = Hex(theme?["accent2"]?.ToString(), accent2);
        bg = Hex(theme?["bg"]?.ToString(), bg);
        var k = DeviceDpi / 96f * scale;
        var size = new Size((int)(BaseSize.Width * k), (int)(BaseSize.Height * k));
        var screen = (Screen.PrimaryScreen ?? Screen.AllScreens[0]).WorkingArea;
        int x = (int)(Num(w["x"]) ?? screen.Right - size.Width - 40), y = (int)(Num(w["y"]) ?? screen.Top + 40);
        x = Math.Clamp(x, screen.Left - size.Width + 40, screen.Right - 40);
        y = Math.Clamp(y, screen.Top, screen.Bottom - 40);
        var r = new Rectangle(x, y, size.Width, size.Height);
        if (Bounds != r) Bounds = r;
        if (!Visible && !suppressed) Show();
        Cursor = locked ? Cursors.Default : Cursors.SizeAll;
        Render();
        if (fade != fadeTarget) anim.Start();
    }

    public void SetData(JsonObject d) { data = d; if (kind == "perf") { Push(cpuHist, Num(d["cpu"]) ?? 0); Push(ramHist, d["ramTotal"] is { } t ? (Num(d["ramUsed"]) ?? 0) / Math.Max(1, Num(t) ?? 1) * 100 : 0); } Render(); }
    static void Push(Queue<double> q, double v) { q.Enqueue(v); while (q.Count > 40) q.Dequeue(); }

    public void Suppress(bool on)
    {
        if (on == suppressed) return;
        suppressed = on;
        fadeTarget = on ? 0 : 1;
        if (!on && !Visible) Show();
        anim.Start();
    }
    void StepFade()
    {
        fade = fadeTarget > fade ? Math.Min(fadeTarget, fade + 0.08f) : Math.Max(fadeTarget, fade - 0.08f);
        Render();
        if (fade == fadeTarget) { anim.Stop(); if (fade <= 0) Hide(); }
    }

    // ---------- input ----------

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Left && !locked) dragFrom = e.Location;
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (dragFrom is { } from && e.Button == MouseButtons.Left)
        {
            Location = new Point(Left + e.X - from.X, Top + e.Y - from.Y);
            Render();
            return;
        }
        int h = hits.FindIndex(x => x.r.Contains(e.Location));
        if (h != hover) { hover = h; Cursor = h >= 0 ? Cursors.Hand : locked ? Cursors.Default : Cursors.SizeAll; Render(); }
    }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); if (hover != -1) { hover = -1; Render(); } }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (dragFrom != null)
        {
            bool moved = Math.Abs(e.X - dragFrom.Value.X) > 3 || Math.Abs(e.Y - dragFrom.Value.Y) > 3;
            dragFrom = null;
            if (moved) { owner.OnWidgetMessage(new JsonObject { ["type"] = "moved", ["id"] = WidgetId, ["x"] = Left, ["y"] = Top }); return; }
        }
        if (e.Button == MouseButtons.Right) { ShowMenu(); return; }
        var hit = hits.FirstOrDefault(x => x.r.Contains(e.Location));
        if (hit.action != null) owner.OnWidgetMessage(new JsonObject { ["type"] = "action", ["id"] = WidgetId, ["action"] = hit.action });
    }

    void ShowMenu()
    {
        var menu = new ContextMenuStrip { ShowImageMargin = false, Font = new Font("Segoe UI Semibold", 9f), BackColor = Color.FromArgb(18, 12, 12), ForeColor = Color.FromArgb(245, 239, 238) };
        void Add(string text, string type) { var b = new ToolStripMenuItem(text) { ForeColor = Color.FromArgb(245, 239, 238) }; b.Click += (_, _) => owner.OnWidgetMessage(new JsonObject { ["type"] = type, ["id"] = WidgetId }); menu.Items.Add(b); }
        Add(locked ? "Unlock widgets (drag to move)" : "Lock widgets", "lock");
        Add("Widget settings…", "manage");
        Add("Remove this widget", "remove");
        menu.Closed += (_, _) => BeginInvoke(() => menu.Dispose());
        menu.Show(Cursor.Position);
    }

    // ---------- drawing ----------

    Bitmap? frame;
    void Render()
    {
        if (!IsHandleCreated || Width <= 0 || Height <= 0) return;
        if (frame == null || frame.Width != Width || frame.Height != Height) { frame?.Dispose(); frame = new Bitmap(Width, Height, PixelFormat.Format32bppArgb); }
        using (var g = Graphics.FromImage(frame))
        {
            g.Clear(Color.Transparent);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            hits.Clear();
            var k = DeviceDpi / 96f * scale;
            var all = new RectangleF(0, 0, Width, Height);
            if (style != "none")
            {
                using var path = Rounded(RectangleF.Inflate(all, -1, -1), 16 * k);
                using var fill = new SolidBrush(style == "accent" ? Color.FromArgb(200, accent) : Color.FromArgb(170, bg));
                g.FillPath(fill, path);
                using var pen = new Pen(Color.FromArgb(locked ? 70 : 200, accent), (locked ? 1 : 2) * k);
                g.DrawPath(pen, path);
            }
            else if (!locked)
            {
                using var pen = new Pen(Color.FromArgb(180, accent), 2 * k) { DashStyle = DashStyle.Dash };
                g.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
            }
            switch (kind)
            {
                case "music": DrawMusic(g, k); break;
                case "perf": DrawPerf(g, k); break;
                case "apps": DrawApps(g, k); break;
                default: DrawClock(g, k); break;
            }
        }
        Blit(frame, (byte)Math.Clamp(255 * opacity * Ease(fade), 0, 255));
    }

    static float Ease(float x) => 1 - MathF.Pow(1 - Math.Clamp(x, 0, 1), 3);
    Font F(float px, FontStyle s = FontStyle.Regular, string family = "Segoe UI") => new(family, px, s, GraphicsUnit.Pixel);
    static readonly Brush White = new SolidBrush(Color.FromArgb(245, 239, 238)), Muted = new SolidBrush(Color.FromArgb(169, 152, 150));

    void DrawClock(Graphics g, float k)
    {
        var now = DateTime.Now;
        using var big = F(64 * k, FontStyle.Bold, "Segoe UI Black");
        using var small = F(15 * k, FontStyle.Bold, "Segoe UI Semibold");
        using var acc = new SolidBrush(accent2);
        g.DrawString(now.ToString(h24 ? "HH:mm" : "h:mm"), big, White, 18 * k, 14 * k);
        g.DrawString(now.ToString("dddd").ToUpperInvariant(), small, acc, 22 * k, 96 * k);
        g.DrawString(now.ToString("d MMMM yyyy").ToUpperInvariant(), small, Muted, 22 * k, 114 * k);
    }

    void DrawMusic(Graphics g, float k)
    {
        var t = data?["track"] as JsonObject;
        float pad = 14 * k, art = Height - 2 * pad;
        var artRect = new RectangleF(pad, pad, art, art);
        using (var path = Rounded(artRect, 10 * k))
        {
            var file = data?["artFile"]?.ToString();
            var img = string.IsNullOrEmpty(file) ? null : Load(file);
            g.SetClip(path);
            if (img != null) g.DrawImage(img, artRect);
            else { using var b = new LinearGradientBrush(artRect, accent, accent2, 45f); g.FillPath(b, path); }
            g.ResetClip();
        }
        float x = pad * 2 + art, w = Width - x - pad;
        using var title = F(17 * k, FontStyle.Bold, "Segoe UI Semibold");
        using var sub = F(12.5f * k);
        using var fmt = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
        var name = t?["title"]?.ToString() is { Length: > 0 } s ? s : "Nothing playing";
        g.DrawString(name, title, White, new RectangleF(x, pad, w, 24 * k), fmt);
        g.DrawString(t?["artist"]?.ToString() ?? "", sub, Muted, new RectangleF(x, pad + 24 * k, w, 18 * k), fmt);
        // progress
        double dur = Num(t?["duration"]) ?? 0, pos = Num(t?["position"]) ?? 0;
        if (t?["playing"]?.GetValue<bool>() == true && t["updated"] != null) pos = Math.Min(dur, pos + (DateTimeOffset.Now.ToUnixTimeMilliseconds() - (Num(t["updated"]) ?? 0)) / 1000);
        var bar = new RectangleF(x, pad + 52 * k, w, 4 * k);
        using (var back = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillRectangle(back, bar);
        if (dur > 0) { using var fill = new SolidBrush(accent); g.FillRectangle(fill, bar.X, bar.Y, (float)(bar.Width * pos / dur), bar.Height); }
        // controls
        float cy = Height - pad - 16 * k, size = 30 * k;
        string[] acts = ["prev", "toggle", "next"];
        bool playing = t?["playing"]?.GetValue<bool>() == true;
        for (int i = 0; i < 3; i++)
        {
            var r = new RectangleF(x + i * (size + 14 * k), cy - size / 2, size, size);
            hits.Add((r, "media:" + acts[i]));
            bool hot = hover == hits.Count - 1;
            using (var b = new SolidBrush(i == 1 ? accent : Color.FromArgb(hot ? 70 : 35, 255, 255, 255))) g.FillEllipse(b, r);
            using var ink = new SolidBrush(Color.White);
            float cx = r.X + r.Width / 2, mid = r.Y + r.Height / 2, s2 = r.Width * 0.22f;
            if (i == 1 && playing) { g.FillRectangle(ink, cx - s2, mid - s2, s2 * 0.7f, s2 * 2); g.FillRectangle(ink, cx + s2 * 0.3f, mid - s2, s2 * 0.7f, s2 * 2); }
            else if (i == 1) g.FillPolygon(ink, [new PointF(cx - s2 * 0.7f, mid - s2), new PointF(cx + s2, mid), new PointF(cx - s2 * 0.7f, mid + s2)]);
            else
            {
                float d = i == 0 ? -1 : 1;
                g.FillPolygon(ink, [new PointF(cx - d * s2 * 0.6f, mid - s2), new PointF(cx + d * s2 * 0.8f, mid), new PointF(cx - d * s2 * 0.6f, mid + s2)]);
                g.FillRectangle(ink, d > 0 ? cx + s2 * 0.8f : cx - s2 * 0.8f - 2 * k, mid - s2, 2 * k, s2 * 2);
            }
        }
    }

    void DrawPerf(Graphics g, float k)
    {
        float pad = 14 * k, y = pad;
        using var label = F(11 * k, FontStyle.Bold, "Consolas");
        using var val = F(20 * k, FontStyle.Bold, "Segoe UI Semibold");
        void Graph(string name, double now, Queue<double> hist, string text)
        {
            g.DrawString(name, label, Muted, pad, y);
            g.DrawString(text, val, White, pad, y + 12 * k);
            var r = new RectangleF(Width * 0.45f, y + 2 * k, Width * 0.55f - pad, 34 * k);
            if (hist.Count > 1)
            {
                var pts = hist.Select((v, i) => new PointF(r.X + i * r.Width / 39f, r.Bottom - (float)(Math.Clamp(v, 0, 100) / 100 * r.Height))).ToArray();
                using var area = new GraphicsPath();
                area.AddLines(pts);
                area.AddLine(pts[^1], new PointF(pts[^1].X, r.Bottom));
                area.AddLine(new PointF(pts[^1].X, r.Bottom), new PointF(pts[0].X, r.Bottom));
                using var fill = new LinearGradientBrush(r, Color.FromArgb(120, accent), Color.FromArgb(0, accent), 90f);
                g.FillPath(fill, area);
                using var pen = new Pen(accent2, 1.6f * k);
                g.DrawLines(pen, pts);
            }
            y += 48 * k;
        }
        double cpu = Num(data?["cpu"]) ?? 0, used = Num(data?["ramUsed"]) ?? 0, total = Math.Max(1, Num(data?["ramTotal"]) ?? 1);
        Graph("CPU", cpu, cpuHist, $"{cpu:0}%");
        Graph("RAM", used / total * 100, ramHist, $"{used / 1073741824:0.0} / {total / 1073741824:0} GB");
        foreach (var d in (data?["drives"] as JsonArray)?.OfType<JsonObject>().Take(2) ?? [])
        {
            double tot = Num(d["total"]) ?? 1, free = Num(d["free"]) ?? 0;
            g.DrawString($"{d["name"]}  {free / 1073741824:0} GB FREE", label, Muted, pad, y);
            var r = new RectangleF(pad, y + 15 * k, Width - 2 * pad, 4 * k);
            using (var back = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillRectangle(back, r);
            using (var fill = new SolidBrush(free / tot < 0.1 ? Color.FromArgb(255, 80, 60) : accent)) g.FillRectangle(fill, r.X, r.Y, (float)(r.Width * (1 - free / tot)), r.Height);
            y += 24 * k;
        }
    }

    void DrawApps(Graphics g, float k)
    {
        float pad = 12 * k, cell = 76 * k, icon = 44 * k;
        using var name = F(10.5f * k, FontStyle.Bold, "Segoe UI Semibold");
        using var fmt = new StringFormat { Alignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
        if (apps.Count == 0) { g.DrawString("Add apps in Settings → Widgets", name, Muted, new RectangleF(0, Height / 2f - 8 * k, Width, 20 * k), fmt); return; }
        int i = 0;
        foreach (var a in apps.OfType<JsonObject>())
        {
            int col = i % 6, row = i / 6;
            var c = new RectangleF(pad + col * cell, pad + row * 86 * k, cell, 84 * k);
            hits.Add((c, "app:" + i));
            bool hot = hover == hits.Count - 1;
            if (hot) { using var hb = new SolidBrush(Color.FromArgb(60, accent)); using var hp = Rounded(RectangleF.Inflate(c, -3 * k, -3 * k), 10 * k); g.FillPath(hb, hp); }
            var ir = new RectangleF(c.X + (cell - icon) / 2, c.Y + 8 * k - (hot ? 3 * k : 0), icon, icon);
            var img = Load(a["icon"]?.ToString() ?? "");
            if (img != null) g.DrawImage(img, ir);
            else { using var b = new LinearGradientBrush(ir, accent2, accent, 60f); using var p = Rounded(ir, 10 * k); g.FillPath(b, p); }
            g.DrawString(a["name"]?.ToString() ?? "", name, White, new RectangleF(c.X + 2, c.Y + 58 * k, cell - 4, 16 * k), fmt);
            i++;
        }
    }

    Bitmap? Load(string url)
    {
        if (string.IsNullOrEmpty(url)) return null;
        if (images.TryGetValue(url, out var b)) return b;
        var file = File.Exists(url) ? url : localFile(url);
        Bitmap? img = null;
        try { if (file != null) { using var s = new MemoryStream(File.ReadAllBytes(file)); using var i = Image.FromStream(s); img = new Bitmap(i); } } catch { }
        if (images.Count > 60) { foreach (var v in images.Values) v?.Dispose(); images.Clear(); }
        images[url] = img;
        return img;
    }

    static GraphicsPath Rounded(RectangleF r, float radius)
    {
        var p = new GraphicsPath();
        float d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static double? Num(JsonNode? n) { try { return n == null ? null : double.TryParse(n.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : null; } catch { return null; } }
    static Color Hex(string? hex, Color fallback)
    {
        try { return string.IsNullOrEmpty(hex) || hex.Length != 7 ? fallback : Color.FromArgb(Convert.ToInt32(hex[1..3], 16), Convert.ToInt32(hex[3..5], 16), Convert.ToInt32(hex[5..7], 16)); }
        catch { return fallback; }
    }

    // ---------- the layered window ----------

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);

    void Blit(Bitmap bmp, byte alpha)
    {
        IntPtr screen = GetDC(IntPtr.Zero), mem = CreateCompatibleDC(screen), hbmp = IntPtr.Zero, old = IntPtr.Zero;
        try
        {
            hbmp = bmp.GetHbitmap(Color.FromArgb(0));
            old = SelectObject(mem, hbmp);
            var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
            var src = new POINT();
            var dst = new POINT { x = Left, y = Top };
            var blend = new BLENDFUNCTION { SourceConstantAlpha = alpha, AlphaFormat = 1 };
            UpdateLayeredWindow(Handle, screen, ref dst, ref size, mem, ref src, 0, ref blend, 2);
        }
        finally
        {
            if (old != IntPtr.Zero) SelectObject(mem, old);
            if (hbmp != IntPtr.Zero) DeleteObject(hbmp);
            DeleteDC(mem);
            ReleaseDC(IntPtr.Zero, screen);
        }
    }

    protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); Render(); }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { anim.Dispose(); frame?.Dispose(); foreach (var b in images.Values) b?.Dispose(); }
        base.Dispose(disposing);
    }
}

using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// NEXUS: a desktop bar of the apps, games and links you pick, docked to a screen edge. It is a see-through window:
/// only the logos are drawn, straight onto the desktop (per-pixel alpha), with an optional glass backing. It never
/// takes the focus, can tuck itself away until the pointer reaches that edge, and steps aside for fullscreen games.
/// </summary>
sealed class DockForm : Form
{
    sealed class Item
    {
        public string Id = "", Name = "", Icon = "", Kind = "";
        public bool Running;
        public float Scale = 1, Target = 1, Lift;
        public DateTime Bounce = DateTime.MinValue;
        public Bitmap? Tile, Shadow;
        public string TileKey = "";
    }

    readonly MainForm owner;
    readonly Func<string, string?> localFile;
    readonly string cacheDir;
    readonly System.Windows.Forms.Timer edge = new() { Interval = 200 };
    readonly System.Windows.Forms.Timer anim = new() { Interval = 15 };
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) };
    readonly Dictionary<string, Bitmap?> images = new();
    readonly HashSet<string> loading = new();
    List<Item> items = new();

    string position = "bottom", backing = "none", indicator = "dot", tagStyle = "dark", align = "center";
    int size = 52, spacing = 12, offset = 0, backingAlpha = 120;
    float radius = 0.22f, glowAmt = 1f, magnifyAmt = 1.45f, idleAlpha = 1f;
    bool autohide, magnify = true, names = true, alwaysNames, bounceOn = true, suppressed, tuckWanted;
    // Fading in and out (appearing at start, desktop-only mode, fullscreen games): 0 hidden, 1 shown.
    float fade = 0, fadeTarget = 1;
    int fadeMs = 220, lengthPct = 0;
    string fadeStyle = "fade", hoverStyle = "magnify", clickMode = "single";
    DateTime lastClick = DateTime.MinValue;
    int lastClickItem = -1;
    // Bars sharing an edge sit side by side: the shell gives each one a start along the edge, and a size factor
    // when they don't all fit (so they shrink together instead of overlapping).
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public float SizeFactor { get; set; } = 1;
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public int? AlongStart { get; set; }
    public string Edge => position;
    public bool Grouped { get; private set; }
    public bool Hidden => suppressed;
    /// <summary>How long the bar is along its edge at a given size factor.</summary>
    public int LengthAt(float factor) { var keep = SizeFactor; SizeFactor = factor; Measure(); int len = L; SizeFactor = keep; Measure(); return len; }
    /// <summary>The part of the bar you see at a size: its window minus the clear room on both ends that magnified
    /// logos grow into. Bars sharing an edge are packed by this, so they really sit next to each other.</summary>
    public (int window, int visible) LengthsAt(float factor)
    {
        var keep = SizeFactor; SizeFactor = factor; Measure();
        int window = L, visible = lengthPct > 0 ? L : Math.Min(L, (int)Math.Ceiling(L - growPx));
        SizeFactor = keep; Measure();
        return (window, visible);
    }
    /// <summary>Puts the bar where the shell's group layout says.</summary>
    public void Relayout() { foreach (var it in items) it.TileKey = ""; Place(); }
    public int EdgeLength => Vertical ? Area().Height : Area().Width;
    /// <summary>Which bar this is (the main bar is "main"); sent back with every click.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public string BarId { get; set; } = "main";
    float tuck; // 0 shown, 1 tucked away
    Color accent = Color.FromArgb(255, 31, 31), accent2 = Color.FromArgb(255, 77, 61), bg = Color.FromArgb(7, 5, 5);
    Color? dotColor, hoverColor; // your own colours for the running dot / bar / glow and the hover glow
    float growPx;
    PointF? mouse; // in (along, across) space
    int hover = -1;
    DateTime outsideSince = DateTime.Now;
    Bitmap? frame;

    // Geometry, in device pixels. "Along" runs down the bar, "across" goes from the screen edge inward.
    float k, ic, gap, pad, maxS, v0;
    int L, T;

    public DockForm(MainForm owner, Func<string, string?> localFile, string cacheDir)
    {
        this.owner = owner;
        this.localFile = localFile;
        this.cacheDir = cacheDir;
        Text = "skyvaint nexus";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        edge.Tick += (_, _) => CheckEdge();
        anim.Tick += (_, _) => Step();
        showDelay.Tick += (_, _) => { showDelay.Stop(); Apply(false); };
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            // WS_EX_LAYERED (per-pixel alpha), WS_EX_TOOLWINDOW (no taskbar / alt-tab), WS_EX_NOACTIVATE (never steals focus)
            cp.ExStyle |= 0x80000 | 0x80 | 0x08000000;
            return cp;
        }
    }

    protected override void OnPaint(PaintEventArgs e) { }
    protected override void OnPaintBackground(PaintEventArgs e) { }

    public void SetState(JsonObject next)
    {
        var s = next["settings"];
        position = s?["position"]?.ToString() ?? "bottom";
        backing = s?["backing"]?.ToString() ?? "none";
        size = Clamp(Int(s?["size"], 52), 32, 96);
        autohide = Bool(s?["autohide"], false);
        magnify = Bool(s?["magnify"], true);
        names = Bool(s?["names"], true);
        spacing = Clamp(Int(s?["gap"], 12), 0, 48);
        offset = Clamp(Int(s?["offset"], 0), 0, 120);
        radius = Clamp(Int(s?["radius"], 22), 0, 50) / 100f;
        backingAlpha = Clamp(Int(s?["opacity"], 47), 0, 100) * 255 / 100;
        glowAmt = Clamp(Int(s?["glow"], 100), 0, 250) / 100f;
        magnifyAmt = Clamp(Int(s?["magnifyAmount"], 145), 110, 220) / 100f;
        idleAlpha = Clamp(Int(s?["idleOpacity"], 100), 20, 100) / 100f;
        indicator = s?["indicator"]?.ToString() ?? "dot";
        tagStyle = s?["tagStyle"]?.ToString() ?? "dark";
        align = s?["align"]?.ToString() ?? "center";
        alwaysNames = Bool(s?["alwaysNames"], false);
        bounceOn = Bool(s?["bounce"], true);
        Grouped = Bool(s?["group"], true);
        fadeMs = Clamp(Int(s?["fadeMs"], 220), 0, 2000);
        fadeStyle = s?["fadeStyle"]?.ToString() ?? "fade";
        lengthPct = Clamp(Int(s?["length"], 0), 0, 100);
        hoverStyle = s?["hoverStyle"]?.ToString() ?? (magnify ? "magnify" : "scale");
        magnify = hoverStyle == "magnify";
        clickMode = s?["clickMode"]?.ToString() ?? "single";
        var t = next["theme"];
        accent = Hex(t?["accent"]?.ToString(), accent);
        accent2 = Hex(t?["accent2"]?.ToString(), accent2);
        dotColor = s?["dotColor"]?.ToString() is { Length: 7 } dc ? Hex(dc, accent2) : null;
        hoverColor = s?["hoverColor"]?.ToString() is { Length: 7 } hc ? Hex(hc, accent) : null;
        bg = Hex(t?["bg"]?.ToString(), bg);

        var old = items.ToDictionary(i => i.Id);
        var list = new List<Item>();
        foreach (var n in (next["items"] as JsonArray)?.OfType<JsonObject>() ?? [])
        {
            var id = n["id"]?.ToString() ?? "";
            var it = old.TryGetValue(id, out var o) ? o : new Item { Id = id };
            it.Name = n["name"]?.ToString() ?? "";
            it.Kind = n["kind"]?.ToString() ?? "";
            var icon = n["icon"]?.ToString() ?? "";
            if (icon != it.Icon) { it.Icon = icon; it.TileKey = ""; }
            it.Running = Bool(n["running"], false);
            list.Add(it);
        }
        items = list;
        hover = Math.Min(hover, items.Count - 1);

        if (autohide) edge.Start();
        else
        {
            edge.Stop();
            tuckWanted = false;
            tuck = 0;
        }
        Place();
        if (fade != fadeTarget) Wake(); // the first time: fade in
    }

    // Coming back waits a moment and only happens if it still should, so a quick change of focus (pressing the
    // taskbar, holding the click on an app, a window closing and another taking its place) can't make the bar
    // flash in and fade straight back out. Hiding is still immediate.
    readonly System.Windows.Forms.Timer showDelay = new() { Interval = 180 };

    /// <summary>Steps aside while a fullscreen program (usually a game) has the screen, or while a desktop-only
    /// bar is covered.</summary>
    public void Suppress(bool on)
    {
        if (on) { showDelay.Stop(); Apply(true); return; }
        if (!suppressed) { showDelay.Stop(); return; }
        if (!showDelay.Enabled) showDelay.Start();
    }

    void Apply(bool on)
    {
        if (on == suppressed) return;
        suppressed = on;
        fadeTarget = on ? 0 : 1;
        if (!on)
        {
            Place();
            if (!Visible) Show();
        }
        if (fadeMs == 0 || fadeStyle == "none") { fade = fadeTarget; if (on) Hide(); else Render(); return; }
        Wake();
    }

    bool Vertical => position is "left" or "right";

    void Measure()
    {
        k = DeviceDpi / 96f;
        ic = size * k * SizeFactor;
        gap = spacing * k;
        pad = 12 * k;
        maxS = magnify ? magnifyAmt : 1.1f;
        v0 = 16 * k + offset * DeviceDpi / 96f; // room under the logos for the shadow and the "running" dot, plus the gap from the edge
        int n = Math.Max(1, items.Count);
        float grow = ic * (maxS - 1) * 2.4f;
        growPx = grow;
        L = (int)(n * ic + (n - 1) * gap + 2 * pad + grow);
        // A longer bar: at least this share of the screen edge (0 fits the icons).
        if (lengthPct > 0) { var edgeLen = Vertical ? Area().Height : Area().Width; L = Math.Max(L, (int)(edgeLen * lengthPct / 100f)); }
        float tip = Vertical ? 190 * k : 34 * k;
        if (alwaysNames && !Vertical) tip += 18 * k;
        T = (int)(v0 + ic * maxS + 10 * k + tip);
        var area = Area();
        L = Math.Min(L, (Vertical ? area.Height : area.Width) - 8);
    }

    Rectangle Area() => (Screen.PrimaryScreen ?? Screen.AllScreens[0]).WorkingArea;

    Rectangle Target()
    {
        var a = Area();
        // Where along the edge: centred, or pushed to the start or end of it.
        int AlongX(int span) => AlongStart is int at ? at : align == "start" ? 8 : align == "end" ? span - L - 8 : (span - L) / 2;
        return position switch
        {
            "top" => new Rectangle(a.Left + AlongX(a.Width), a.Top, L, T),
            "left" => new Rectangle(a.Left, a.Top + AlongX(a.Height), T, L),
            "right" => new Rectangle(a.Right - T, a.Top + AlongX(a.Height), T, L),
            _ => new Rectangle(a.Left + AlongX(a.Width), a.Bottom - T, L, T),
        };
    }

    void Place()
    {
        Measure();
        var r = Target();
        if (Bounds != r) Bounds = r;
        if (!Visible && !suppressed) Show();
        Render();
    }

    // ---------- coordinates ----------

    RectangleF RectUV(float u0, float u1, float a0, float a1) => position switch
    {
        "top" => RectangleF.FromLTRB(u0, a0, u1, a1),
        "left" => RectangleF.FromLTRB(a0, u0, a1, u1),
        "right" => RectangleF.FromLTRB(T - a1, u0, T - a0, u1),
        _ => RectangleF.FromLTRB(u0, T - a1, u1, T - a0),
    };

    PointF ToUV(Point p) => position switch
    {
        "top" => new PointF(p.X, p.Y),
        "left" => new PointF(p.Y, p.X),
        "right" => new PointF(p.Y, T - p.X),
        _ => new PointF(p.X, T - p.Y),
    };

    /// <summary>Where each logo sits along the bar at its current size (macOS-dock style: grown icons push out).</summary>
    (float start, float end, float[] centre) Arrange(Func<Item, float> scale)
    {
        var c = new float[items.Count];
        float total = items.Sum(i => ic * scale(i)) + Math.Max(0, items.Count - 1) * gap;
        float u = (L - total) / 2;
        for (int i = 0; i < items.Count; i++)
        {
            float w = ic * scale(items[i]);
            c[i] = u + w / 2;
            u += w + gap;
        }
        return ((L - total) / 2, (L + total) / 2, c);
    }

    // ---------- input ----------

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        mouse = ToUV(e.Location);
        outsideSince = DateTime.Now;
        var (_, _, c) = Arrange(i => i.Scale);
        hover = -1;
        float lift = v0 - tuck * (v0 + ic * maxS);
        for (int i = 0; i < c.Length; i++)
        {
            float w = ic * items[i].Scale;
            if (Math.Abs(mouse.Value.X - c[i]) <= (w + gap) / 2 && mouse.Value.Y <= lift + w + 4 * k) { hover = i; break; }
        }
        Cursor = hover >= 0 ? Cursors.Hand : Cursors.Default;
        Wake();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        mouse = null;
        hover = -1;
        Wake();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button == MouseButtons.Left && hover >= 0 && clickMode == "double")
        {
            // Double-click mode: the first click only marks the icon; a second one within 450 ms opens it.
            bool second = lastClickItem == hover && (DateTime.Now - lastClick).TotalMilliseconds < 450;
            lastClick = DateTime.Now; lastClickItem = hover;
            if (!second) { Wake(); return; }
            lastClickItem = -1;
        }
        if (e.Button == MouseButtons.Left && hover >= 0)
        {
            if (bounceOn) items[hover].Bounce = DateTime.Now;
            Wake();
            owner.OnDockMessage(new JsonObject { ["type"] = "open", ["id"] = items[hover].Id, ["bar"] = BarId });
        }
        else if (e.Button == MouseButtons.Right) ShowMenu(hover >= 0 ? items[hover] : null);
    }

    void ShowMenu(Item? it)
    {
        var menu = new ContextMenuStrip { Renderer = new ToolStripProfessionalRenderer(new MenuColors(accent)), ShowImageMargin = false, Font = new Font("Segoe UI Semibold", 9f) };
        menu.ForeColor = Color.FromArgb(245, 239, 238);
        void Add(string text, string type, JsonNode? d = null, bool danger = false)
        {
            var b = new ToolStripMenuItem(text) { ForeColor = danger ? Color.FromArgb(255, 122, 112) : Color.FromArgb(245, 239, 238) };
            b.Click += (_, _) => owner.OnDockMessage(new JsonObject { ["type"] = type, ["id"] = it?.Id ?? "", ["d"] = d?.DeepClone(), ["bar"] = BarId });
            menu.Items.Add(b);
        }
        if (it != null)
        {
            var title = new ToolStripLabel(it.Name.ToUpperInvariant()) { ForeColor = accent2, Font = new Font("Segoe UI", 8f, FontStyle.Bold) };
            menu.Items.Add(title);
            Add("Open", "open");
            if (it.Kind == "app") Add("Show in folder", "reveal");
            Add(Vertical ? "Move up" : "Move left", "move", -1);
            Add(Vertical ? "Move down" : "Move right", "move", 1);
            menu.Items.Add(new ToolStripSeparator());
        }
        Add("Manage bar…", "manage");
        if (it != null) Add("Remove from bar", "remove", null, true);
        menu.Closed += (_, _) => BeginInvoke(() => menu.Dispose());
        menu.Show(Cursor.Position);
    }

    sealed class MenuColors(Color accent) : ProfessionalColorTable
    {
        static readonly Color Back = Color.FromArgb(18, 12, 12);
        public override Color ToolStripDropDownBackground => Back;
        public override Color MenuBorder => Color.FromArgb(accent.R / 2, accent.G / 2, accent.B / 2);
        public override Color MenuItemBorder => accent;
        public override Color MenuItemSelected => accent;
        public override Color MenuItemSelectedGradientBegin => accent;
        public override Color MenuItemSelectedGradientEnd => accent;
        public override Color SeparatorDark => Color.FromArgb(50, 40, 40);
        public override Color SeparatorLight => Back;
        public override Color ImageMarginGradientBegin => Back;
        public override Color ImageMarginGradientMiddle => Back;
        public override Color ImageMarginGradientEnd => Back;
    }

    // ---------- auto-hide ----------

    void CheckEdge()
    {
        if (suppressed || !autohide) return;
        var p = PointToClient(Cursor.Position);
        bool inside = ClientRectangle.Contains(p);
        if (inside)
        {
            var uv = ToUV(p);
            var (s, e, _) = Arrange(i => i.Scale);
            float reach = tuckWanted ? 8 * k : v0 + ic * maxS + 12 * k;
            inside = uv.X >= s - pad && uv.X <= e + pad && uv.Y <= reach;
        }
        if (inside || hover >= 0)
        {
            outsideSince = DateTime.Now;
            if (tuckWanted) { tuckWanted = false; Wake(); }
        }
        else if (!tuckWanted && (DateTime.Now - outsideSince).TotalMilliseconds > 900) { tuckWanted = true; Wake(); }
    }

    // ---------- animation ----------

    void Wake()
    {
        if (!anim.Enabled) anim.Start();
        Step();
    }

    void Step()
    {
        bool moving = false;
        var (_, _, baseC) = Arrange(_ => 1f);
        for (int i = 0; i < items.Count; i++)
        {
            var it = items[i];
            float target = 1;
            if (mouse is { } m && tuck < 0.5f)
            {
                if (hoverStyle == "magnify")
                {
                    float d = Math.Abs(m.X - baseC[i]) / (ic + gap);
                    if (d < 2.2f) target = 1 + (maxS - 1) * (MathF.Cos(d / 2.2f * MathF.PI) + 1) / 2;
                }
                else if (i == hover && hoverStyle == "scale") target = maxS;
                else if (i == hover && hoverStyle == "lift") target = 1.08f;
            }
            float liftTarget = i == hover && hoverStyle == "lift" ? 1 : 0;
            it.Lift += (liftTarget - it.Lift) * 0.3f;
            if (Math.Abs(it.Lift - liftTarget) > 0.01f) moving = true; else it.Lift = liftTarget;
            it.Target = target;
            float next = it.Scale + (target - it.Scale) * 0.28f;
            if (Math.Abs(next - target) < 0.002f) next = target;
            if (next != it.Scale) moving = true;
            it.Scale = next;
            if ((DateTime.Now - it.Bounce).TotalMilliseconds < 700) moving = true;
        }
        if (fade != fadeTarget)
        {
            float stepF = fadeMs <= 0 ? 1 : 15f / fadeMs;
            fade = fadeTarget > fade ? Math.Min(fadeTarget, fade + stepF) : Math.Max(fadeTarget, fade - stepF);
            moving = true;
            if (fade <= 0 && suppressed) { Hide(); }
        }
        float tt = tuckWanted ? 1 : 0, nt = tuck + (tt - tuck) * 0.22f;
        if (Math.Abs(nt - tt) < 0.003f) nt = tt;
        if (nt != tuck) moving = true;
        tuck = nt;
        Render();
        if (!moving) anim.Stop();
    }

    // ---------- drawing ----------

    void Render()
    {
        if (!IsHandleCreated || L <= 0 || T <= 0) return;
        int w = Width, h = Height;
        if (frame == null || frame.Width != w || frame.Height != h)
        {
            frame?.Dispose();
            frame = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        }
        using (var g = Graphics.FromImage(frame))
        {
            g.Clear(Color.Transparent);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBilinear;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            Draw(g);
        }
        Blit(frame);
    }

    void Draw(Graphics g)
    {
        var (start, end, c) = Arrange(i => i.Scale);
        float hide = tuck * (v0 + ic * maxS + 14 * k);
        if (fadeStyle == "slide" || fadeStyle == "both") hide += (1 - Ease(fade)) * (v0 + ic * maxS + 14 * k);
        float tallest = items.Count == 0 ? ic : items.Max(i => i.Scale) * ic;

        // An almost invisible strip so the pointer is caught between the logos too (fully clear pixels click through).
        var strip = RectUV(start - pad, end + pad, 0, Math.Max(8 * k, v0 + tallest + 6 * k - hide));
        using (var catcher = new SolidBrush(Color.FromArgb(1, 0, 0, 0))) g.FillRectangle(catcher, strip);

        if (backing != "none" && tuck < 0.98f)
        {
            float a0b = v0 - 10 * k - hide, a1b = v0 + ic + 8 * k - hide;
            var glass = lengthPct > 0 ? RectUV(4 * k, L - 4 * k, a0b, a1b) : RectUV(start - pad, end + pad, a0b, a1b);
            float round = backing == "pill" ? Math.Min(glass.Width, glass.Height) / 2 : backing == "square" ? 2 * k : 16 * k;
            using var path = Rounded(glass, round);
            int fa = (int)(backingAlpha * (1 - tuck));
            Color fillC = backing switch { "accent" => accent, "light" => Color.FromArgb(235, 235, 240), _ => bg };
            if (backing != "outline")
            {
                if (backing == "gradient")
                {
                    using var lg = new LinearGradientBrush(glass, Color.FromArgb(fa, accent), Color.FromArgb(fa, accent2), Vertical ? 90f : 0f);
                    g.FillPath(lg, path);
                }
                else
                {
                    using var fill = new SolidBrush(Color.FromArgb(fa, fillC));
                    g.FillPath(fill, path);
                }
            }
            using var pen = new Pen(Color.FromArgb((int)((backing == "outline" ? 200 : 90) * (1 - tuck)), accent), (backing == "outline" ? 1.8f : 1.2f) * k);
            g.DrawPath(pen, path);
        }

        if (tuck > 0.4f)
        {
            float mid = L / 2f, half = Math.Min(60 * k, (end - start) / 3 + 10 * k);
            var line = RectUV(mid - half, mid + half, 2 * k, 5 * k);
            using var path = Rounded(line, 2 * k);
            using var b = new SolidBrush(Color.FromArgb((int)(200 * Math.Min(1, (tuck - 0.4f) / 0.6f)), accent));
            g.FillPath(b, path);
        }
        if (tuck > 0.97f) return;

        for (int i = 0; i < items.Count; i++)
        {
            var it = items[i];
            float w = ic * it.Scale;
            float bounce = 0;
            double ms = (DateTime.Now - it.Bounce).TotalMilliseconds;
            if (ms < 700) bounce = (float)(18 * k * Math.Abs(Math.Sin(ms / 700 * Math.PI * 2)) * (1 - ms / 700));
            float a0 = v0 + bounce - hide + it.Lift * 12 * k;
            var r = RectUV(c[i] - w / 2, c[i] + w / 2, a0, a0 + w);
            var tile = TileFor(it);

            if (i == hover && glowAmt > 0 && hoverStyle != "none")
            {
                var glow = RectangleF.Inflate(r, w * 0.32f * glowAmt, w * 0.32f * glowAmt);
                using var gp = new GraphicsPath();
                gp.AddEllipse(glow);
                using var pb = new PathGradientBrush(gp) { CenterColor = Color.FromArgb((int)Math.Min(255, 120 * glowAmt), hoverColor ?? accent), SurroundColors = [Color.FromArgb(0, hoverColor ?? accent)] };
                g.FillEllipse(pb, glow);
            }
            // Running apps glow softly all the time with the "glow" indicator.
            if (it.Running && indicator == "glow")
            {
                var glow = RectangleF.Inflate(r, w * 0.22f, w * 0.22f);
                using var gp = new GraphicsPath();
                gp.AddEllipse(glow);
                using var pb = new PathGradientBrush(gp) { CenterColor = Color.FromArgb(110, dotColor ?? accent2), SurroundColors = [Color.FromArgb(0, dotColor ?? accent2)] };
                g.FillEllipse(pb, glow);
            }
            if (it.Shadow != null)
            {
                var sr = RectangleF.Inflate(r, w * 0.08f, w * 0.08f);
                sr.Offset(0, 3 * k);
                g.DrawImage(it.Shadow, sr);
            }
            if (tile != null)
            {
                // Apps that aren't running can be dimmed so the running ones stand out.
                float alpha = it.Running || i == hover ? 1f : idleAlpha;
                if (alpha >= 0.999f) g.DrawImage(tile, r);
                else
                {
                    using var ia = new ImageAttributes();
                    ia.SetColorMatrix(new ColorMatrix { Matrix33 = alpha });
                    g.DrawImage(tile, Rectangle.Round(r), 0, 0, tile.Width, tile.Height, GraphicsUnit.Pixel, ia);
                }
            }
            if (it.Running && indicator == "dot")
            {
                float d = 5 * k, mid = c[i];
                var dot = RectUV(mid - d / 2, mid + d / 2, 4 * k - hide, 4 * k + d - hide);
                using var halo = new SolidBrush(Color.FromArgb(90, dotColor ?? accent2));
                g.FillEllipse(halo, RectangleF.Inflate(dot, 2.5f * k, 2.5f * k));
                using var b = new SolidBrush(dotColor ?? accent2);
                g.FillEllipse(b, dot);
            }
            else if (it.Running && indicator == "bar")
            {
                float mid = c[i], half = w * 0.3f;
                var bar = RectUV(mid - half, mid + half, 4 * k - hide, 7 * k - hide);
                using var path = Rounded(bar, 1.5f * k);
                using var b = new SolidBrush(dotColor ?? accent2);
                g.FillPath(b, path);
            }
            if (alwaysNames && !Vertical && i != hover && it.Name != "" && tuck < 0.05f)
            {
                using var font = new Font("Segoe UI Semibold", 8f * k, GraphicsUnit.Pixel);
                var label = RectUV(c[i] - (ic + gap) / 2, c[i] + (ic + gap) / 2, a0 + w + 2 * k, a0 + w + 16 * k);
                using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
                using var shadow = new SolidBrush(Color.FromArgb(160, 0, 0, 0));
                var sh = label; sh.Offset(0, 1);
                g.DrawString(it.Name, font, shadow, sh, fmt);
                using var tb = new SolidBrush(Color.FromArgb(230, 245, 239, 238));
                g.DrawString(it.Name, font, tb, label, fmt);
            }
        }

        if (names && hover >= 0 && hover < items.Count && tuck < 0.05f && items[hover].Name != "")
        {
            var it = items[hover];
            using var font = new Font("Segoe UI Semibold", 9f * k, GraphicsUnit.Pixel);
            var text = it.Name;
            var sz = g.MeasureString(text, font);
            float pw = sz.Width + 16 * k, ph = sz.Height + 6 * k, w = ic * it.Scale;
            float a0 = v0 + w + 8 * k;
            RectangleF pill = Vertical ? RectUV(c[hover] - ph / 2, c[hover] + ph / 2, a0, a0 + pw) : RectUV(c[hover] - pw / 2, c[hover] + pw / 2, a0, a0 + ph);
            if (!Vertical) pill.X = Math.Clamp(pill.X, 2, Width - pill.Width - 2);
            using var path = Rounded(pill, 6 * k);
            using var fill = new SolidBrush(tagStyle == "accent" ? Color.FromArgb(240, accent) : tagStyle == "light" ? Color.FromArgb(240, 245, 245, 248) : Color.FromArgb(232, 14, 10, 10));
            using var pen = new Pen(Color.FromArgb(150, accent), 1f * k);
            g.FillPath(fill, path);
            if (tagStyle == "dark") g.DrawPath(pen, path);
            using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            using var tb = new SolidBrush(tagStyle == "light" ? Color.FromArgb(20, 16, 16) : Color.FromArgb(245, 239, 238));
            g.DrawString(text, font, tb, pill, fmt);
        }
    }

    static GraphicsPath Rounded(RectangleF r, float radius)
    {
        var p = new GraphicsPath();
        float d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
        if (d <= 0.5f) { p.AddRectangle(r); return p; }
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    // ---------- logos ----------

    /// <summary>The logo, prepared once at the largest size it is drawn: pictures with their own transparency (app
    /// logos) are kept as they are; square art (game covers) gets rounded corners.</summary>
    Bitmap? TileFor(Item it)
    {
        int px = Math.Max(32, (int)Math.Ceiling(ic * maxS));
        var key = it.Icon + "|" + px + "|" + it.Name + "|" + accent.ToArgb() + "|" + radius;
        if (it.TileKey == key) return it.Tile;
        var src = Source(it.Icon);
        if (src == null && it.Icon != "" && loading.Contains(it.Icon)) return it.Tile; // still downloading
        it.Tile?.Dispose();
        it.Shadow?.Dispose();
        it.Tile = MakeTile(src, it.Name, px);
        it.Shadow = MakeShadow(it.Tile);
        it.TileKey = key;
        return it.Tile;
    }

    Bitmap MakeTile(Bitmap? src, string name, int px)
    {
        var tile = new Bitmap(px, px, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(tile);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);
        var full = new RectangleF(0, 0, px, px);
        if (src != null)
        {
            if (HasTransparency(src))
            {
                float s = Math.Min((float)px / src.Width, (float)px / src.Height);
                g.DrawImage(src, (px - src.Width * s) / 2, (px - src.Height * s) / 2, src.Width * s, src.Height * s);
            }
            else
            {
                using var clip = Rounded(full, px * radius);
                g.SetClip(clip);
                float s = Math.Max((float)px / src.Width, (float)px / src.Height);
                g.DrawImage(src, (px - src.Width * s) / 2, (px - src.Height * s) / 2, src.Width * s, src.Height * s);
            }
            return tile;
        }
        using (var path = Rounded(full, px * radius))
        using (var fill = new LinearGradientBrush(full, accent2, Color.FromArgb(accent.R * 3 / 5, accent.G * 3 / 5, accent.B * 3 / 5), 60f))
            g.FillPath(fill, path);
        var letter = string.IsNullOrEmpty(name) ? "?" : name[..1].ToUpperInvariant();
        using var font = new Font("Impact", px * 0.5f, GraphicsUnit.Pixel);
        using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString(letter, font, Brushes.White, full, fmt);
        return tile;
    }

    static bool HasTransparency(Bitmap b)
    {
        try
        {
            int n = 0, clear = 0;
            for (int i = 0; i <= 8; i++)
                foreach (var (x, y) in new[] { (i * (b.Width - 1) / 8, 0), (i * (b.Width - 1) / 8, b.Height - 1), (0, i * (b.Height - 1) / 8), (b.Width - 1, i * (b.Height - 1) / 8) })
                {
                    n++;
                    if (b.GetPixel(x, y).A < 200) clear++;
                }
            return clear * 3 >= n;
        }
        catch { return false; }
    }

    /// <summary>A soft drop shadow: the logo's silhouette in black, shrunk and stretched back up so it blurs.</summary>
    static Bitmap? MakeShadow(Bitmap? tile)
    {
        if (tile == null) return null;
        int s = Math.Max(6, tile.Width / 7);
        var small = new Bitmap(s, s, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(small))
        {
            g.Clear(Color.Transparent);
            g.InterpolationMode = InterpolationMode.HighQualityBilinear;
            var m = new ColorMatrix(new[]
            {
                new float[] { 0, 0, 0, 0, 0 }, new float[] { 0, 0, 0, 0, 0 }, new float[] { 0, 0, 0, 0, 0 },
                new float[] { 0, 0, 0, 0.55f, 0 }, new float[] { 0, 0, 0, 0, 1 },
            });
            using var attrs = new ImageAttributes();
            attrs.SetColorMatrix(m);
            int inset = Math.Max(1, s / 6);
            g.DrawImage(tile, new Rectangle(inset, inset, s - inset * 2, s - inset * 2), 0, 0, tile.Width, tile.Height, GraphicsUnit.Pixel, attrs);
        }
        return small;
    }

    Bitmap? Source(string url)
    {
        if (string.IsNullOrEmpty(url)) return null;
        if (images.TryGetValue(url, out var cached)) return cached;
        var file = localFile(url);
        if (file != null)
        {
            images[url] = LoadImage(file);
            return images[url];
        }
        if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) { images[url] = null; return null; }
        var cache = Path.Combine(cacheDir, "dock_" + Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(url)), 0, 8).ToLowerInvariant());
        if (File.Exists(cache))
        {
            images[url] = LoadImage(cache);
            return images[url];
        }
        if (loading.Add(url)) _ = Download(url, cache);
        return null;
    }

    async Task Download(string url, string cache)
    {
        try
        {
            var bytes = await http.GetByteArrayAsync(url);
            Directory.CreateDirectory(cacheDir);
            await File.WriteAllBytesAsync(cache, bytes);
        }
        catch { }
        if (IsDisposed) return;
        BeginInvoke(() =>
        {
            loading.Remove(url);
            images[url] = File.Exists(cache) ? LoadImage(cache) : null;
            foreach (var it in items) if (it.Icon == url) it.TileKey = "";
            Render();
        });
    }

    static Bitmap? LoadImage(string file)
    {
        try
        {
            using var stream = new MemoryStream(File.ReadAllBytes(file));
            using var img = Image.FromStream(stream);
            return new Bitmap(img);
        }
        catch { return null; }
    }

    /// <summary>Debug aid: saves the last drawn frame and a few numbers.</summary>
    public string Dump(string file)
    {
        Render();
        frame?.Save(file);
        return $"bounds={Bounds} L={L} T={T} items={items.Count} k={k} visible={Visible} tuck={tuck} lastBlit={lastBlit}";
    }

    bool lastBlit;

    // ---------- the layered window ----------

    void Blit(Bitmap bmp)
    {
        IntPtr screen = GetDC(IntPtr.Zero), mem = CreateCompatibleDC(screen), hbmp = IntPtr.Zero, old = IntPtr.Zero;
        try
        {
            hbmp = bmp.GetHbitmap(Color.FromArgb(0));
            old = SelectObject(mem, hbmp);
            var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
            var src = new POINT();
            var dst = new POINT { x = Left, y = Top };
            byte alpha = fadeStyle == "slide" ? (byte)255 : (byte)Math.Clamp((int)(255 * Ease(fade)), 0, 255);
            var blend = new BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = alpha, AlphaFormat = 1 };
            lastBlit = UpdateLayeredWindow(Handle, screen, ref dst, ref size, mem, ref src, 0, ref blend, 2);
        }
        finally
        {
            if (old != IntPtr.Zero) SelectObject(mem, old);
            if (hbmp != IntPtr.Zero) DeleteObject(hbmp);
            DeleteDC(mem);
            ReleaseDC(IntPtr.Zero, screen);
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Render();
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        foreach (var it in items) it.TileKey = "";
        Place();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            edge.Dispose();
            anim.Dispose();
            showDelay.Dispose();
            frame?.Dispose();
            foreach (var it in items) { it.Tile?.Dispose(); it.Shadow?.Dispose(); }
            foreach (var b in images.Values) b?.Dispose();
        }
        base.Dispose(disposing);
    }

    // ---------- helpers ----------

    static int Clamp(int v, int lo, int hi) => Math.Max(lo, Math.Min(hi, v));
    static float Ease(float x) => x <= 0 ? 0 : x >= 1 ? 1 : 1 - MathF.Pow(1 - x, 3);
    static int Int(JsonNode? n, int fallback) { try { return n == null ? fallback : (int)n.GetValue<double>(); } catch { try { return n!.GetValue<int>(); } catch { return fallback; } } }
    static bool Bool(JsonNode? n, bool fallback) { try { return n?.GetValue<bool>() ?? fallback; } catch { return fallback; } }
    static Color Hex(string? hex, Color fallback)
    {
        try
        {
            if (string.IsNullOrEmpty(hex) || hex[0] != '#' || hex.Length != 7) return fallback;
            return Color.FromArgb(Convert.ToInt32(hex[1..3], 16), Convert.ToInt32(hex[3..5], 16), Convert.ToInt32(hex[5..7], 16));
        }
        catch { return fallback; }
    }

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
}

using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// The panel that comes up when you hover the launcher (its tray icon, or its logo on a NEXUS bar): OPEN and QUIT,
/// then live CPU, GPU, VRAM, memory, disk and network, and how full each drive is. Drawn by hand (no web page), and
/// it only reads anything while it is open.
/// </summary>
sealed class StatsFlyout : Form
{
    readonly Action open, quit;
    readonly System.Windows.Forms.Timer tick = new() { Interval = 1000 }, watch = new() { Interval = 120 };
    Rectangle anchor;
    DateTime outsideSince = DateTime.MaxValue;
    LiveStats.Snapshot? live;
    JsonObject? sys;
    int hot = -1; // 0 open, 1 quit
    Rectangle openR, quitR;

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    public StatsFlyout(Action open, Action quit)
    {
        this.open = open; this.quit = quit;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        BackColor = Color.FromArgb(24, 24, 28);
        DoubleBuffered = true;
        Text = "Skyvaint";
        tick.Tick += (_, _) => Read();
        watch.Tick += (_, _) => Watch();
    }
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x80 | 0x08000000; return cp; } } // tool window, no activate

    float K => DeviceDpi / 96f;
    int S(float v) => (int)Math.Round(v * K);

    /// <summary>Shows the panel next to <paramref name="near"/>, kept on screen and away from the edge it came from.</summary>
    public void ShowAt(Rectangle near, Point cursor, string edge)
    {
        anchor = near;
        outsideSince = DateTime.MaxValue;
        if (!Visible) { Read(); }
        var size = Measure();
        var wa = Screen.FromPoint(cursor).WorkingArea;
        int gap = S(10), x = cursor.X - size.Width / 2, y = cursor.Y - size.Height / 2;
        // Away from the edge it sits on: above a bar at the bottom, below one at the top, beside one on a side.
        switch (edge)
        {
            case "top": y = near.Bottom + gap; break;
            case "left": x = near.Right + gap; break;
            case "right": x = near.Left - size.Width - gap; break;
            default: y = near.Top - size.Height - gap; break;
        }
        x = Math.Clamp(x, wa.Left + S(8), wa.Right - size.Width - S(8));
        y = Math.Clamp(y, wa.Top + S(8), wa.Bottom - size.Height - S(8));
        Bounds = new Rectangle(x, y, size.Width, size.Height);
        if (!Visible)
        {
            Show();
            try { int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4); } catch { }
            tick.Start();
            watch.Start();
        }
        Invalidate();
    }

    public void HideNow()
    {
        tick.Stop();
        watch.Stop();
        Hide();
        LiveStats.Close();
    }

    // Goes away once the pointer has been off both the panel and what opened it for a moment.
    void Watch()
    {
        var p = Cursor.Position;
        var keep = Rectangle.Inflate(Bounds, S(10), S(10));
        if (keep.Contains(p) || Rectangle.Inflate(anchor, S(6), S(6)).Contains(p)) { outsideSince = DateTime.MaxValue; return; }
        if (outsideSince == DateTime.MaxValue) outsideSince = DateTime.Now;
        else if ((DateTime.Now - outsideSince).TotalMilliseconds > 450) HideNow();
    }

    async void Read()
    {
        var (l, s) = await Task.Run(() => (LiveStats.Sample(), SafeSys()));
        if (IsDisposed) return;
        live = l ?? live;
        sys = s ?? sys;
        var size = Measure();
        if (Visible && size.Height != Height) Height = size.Height;
        Invalidate();
    }
    static JsonObject? SafeSys() { try { return SystemStats.Read(); } catch { return null; } }

    List<JsonObject> Drives() => (sys?["drives"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
    Size Measure() => new(S(300), S(16 + 36 + 14) + 6 * S(36) + S(28) + Drives().Count * S(36) + S(12));

    // ---------- drawing ----------

    // Sizes come as whole numbers (ulong), the CPU as a decimal: read either.
    static double Num(JsonNode? n) => n != null && double.TryParse(n.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;

    // Same units as Task Manager (1 GB = 1024 MB).
    const double KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;
    static string Bytes(double b) => b >= TB ? (b / TB).ToString("0.0") + " TB" : b >= GB ? (b / GB).ToString(b >= 100 * GB ? "0" : "0.0") + " GB" : b >= MB ? (b / MB).ToString("0") + " MB" : (b / KB).ToString("0") + " KB";
    static string Speed(double b) => b >= MB ? (b / MB).ToString("0.0") + " MB/s" : (b / KB).ToString("0") + " KB/s";

    protected override void OnPaint(PaintEventArgs e)
    {
        try { Paint(e); } catch (Exception ex) { StartupGuard.Log("Stats panel", ex); }
    }

    void Paint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        using var title = new Font("Segoe UI Variable Display", 10.5f, FontStyle.Bold);
        using var label = new Font("Segoe UI Variable Text", 9.5f, FontStyle.Bold);
        using var value = new Font("Segoe UI Variable Text", 9f);
        using var small = new Font("Segoe UI Variable Text", 7.5f, FontStyle.Bold);
        using var white = new SolidBrush(Color.FromArgb(245, 245, 245));
        using var grey = new SolidBrush(Color.FromArgb(150, 150, 158));
        using (var edge = new Pen(Color.FromArgb(40, 255, 255, 255))) g.DrawRectangle(edge, 0, 0, Width - 1, Height - 1);

        int pad = S(16), y = S(16), w = Width - pad * 2;
        // Header: the name, OPEN and QUIT.
        g.DrawString("SKYVAINT", title, white, pad - S(2), y + S(8));
        quitR = new Rectangle(Width - pad - S(62), y + S(4), S(62), S(28));
        openR = new Rectangle(quitR.Left - S(8) - S(68), y + S(4), S(68), S(28));
        Button(g, openR, "OPEN", hot == 0 ? Color.FromArgb(225, 225, 225) : Color.White, Color.FromArgb(10, 10, 12), label);
        Button(g, quitR, "QUIT", hot == 1 ? Color.FromArgb(196, 43, 28) : Color.FromArgb(48, 48, 54), Color.White, label);
        y += S(36 + 14);

        double ramT = Num(sys?["ramTotal"]), ramU = Num(sys?["ramUsed"]);
        double cpu = Num(sys?["cpu"]);
        var l = live;
        Row(g, ref y, pad, w, "CPU", cpu.ToString("0") + "%", cpu / 100, label, value, white, grey);
        Row(g, ref y, pad, w, "GPU", l == null ? "…" : l.Gpu.ToString("0") + "%", (l?.Gpu ?? 0) / 100, label, value, white, grey);
        Row(g, ref y, pad, w, "VRAM", l == null ? "…" : l.VramTotal > 0 ? $"{Bytes(l.VramUsed)} / {Bytes(l.VramTotal)}" : Bytes(l.VramUsed), l != null && l.VramTotal > 0 ? l.VramUsed / l.VramTotal : 0, label, value, white, grey);
        Row(g, ref y, pad, w, "MEMORY", ramT > 0 ? $"{Bytes(ramU)} / {Bytes(ramT)}" : "…", ramT > 0 ? ramU / ramT : 0, label, value, white, grey);
        Row(g, ref y, pad, w, "DISK", l == null ? "…" : l.Disk.ToString("0") + "% busy", (l?.Disk ?? 0) / 100, label, value, white, grey);
        Row(g, ref y, pad, w, "NETWORK", l == null ? "…" : $"↓ {Speed(l.NetIn)}   ↑ {Speed(l.NetOut)}", -1, label, value, white, grey);

        y += S(8);
        g.DrawString("STORAGE", small, grey, pad - S(2), y);
        y += S(20);
        foreach (var d in Drives())
        {
            double total = Num(d["total"]), free = Num(d["free"]);
            string name = d["name"]?.ToString() ?? "", lab = d["label"]?.ToString() ?? "";
            Row(g, ref y, pad, w, lab.Length > 0 ? $"{name}  {lab}" : name, $"{Bytes(free)} free of {Bytes(total)}", total > 0 ? (total - free) / total : 0, label, value, white, grey);
        }
    }

    void Button(Graphics g, Rectangle r, string text, Color back, Color fore, Font f)
    {
        using var path = Round(r, S(6));
        using var b = new SolidBrush(back);
        g.FillPath(b, path);
        using var t = new SolidBrush(fore);
        var sz = g.MeasureString(text, f);
        g.DrawString(text, f, t, r.Left + (r.Width - sz.Width) / 2, r.Top + (r.Height - sz.Height) / 2);
    }

    void Row(Graphics g, ref int y, int pad, int w, string name, string val, double frac, Font label, Font value, Brush white, Brush grey)
    {
        g.DrawString(name, label, white, pad - S(2), y);
        var sz = g.MeasureString(val, value);
        g.DrawString(val, value, grey, pad + w - sz.Width + S(2), y + S(1));
        if (frac >= 0)
        {
            var track = new Rectangle(pad, y + S(22), w, S(4));
            using var tb = new SolidBrush(Color.FromArgb(46, 46, 52));
            using var tp = Round(track, S(2));
            g.FillPath(tb, tp);
            frac = Math.Clamp(frac, 0, 1);
            if (frac > 0.005)
            {
                var fill = new Rectangle(pad, track.Top, Math.Max(S(4), (int)(w * frac)), track.Height);
                // White, turning amber then red as it fills up.
                var c = frac > 0.9 ? Color.FromArgb(235, 80, 70) : frac > 0.75 ? Color.FromArgb(240, 180, 70) : Color.FromArgb(235, 235, 240);
                using var fb = new SolidBrush(c);
                using var fp = Round(fill, S(2));
                g.FillPath(fb, fp);
            }
        }
        y += S(36);
    }

    static GraphicsPath Round(Rectangle r, int rad)
    {
        var p = new GraphicsPath();
        int d = Math.Max(1, Math.Min(rad * 2, Math.Min(r.Width, r.Height)));
        p.AddArc(r.Left, r.Top, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    // ---------- the two buttons ----------

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        int h = openR.Contains(e.Location) ? 0 : quitR.Contains(e.Location) ? 1 : -1;
        Cursor = h >= 0 ? Cursors.Hand : Cursors.Default;
        if (h != hot) { hot = h; Invalidate(); }
    }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); if (hot != -1) { hot = -1; Invalidate(); } }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        if (openR.Contains(e.Location)) { HideNow(); open(); }
        else if (quitR.Contains(e.Location)) { HideNow(); quit(); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { tick.Dispose(); watch.Dispose(); LiveStats.Close(); }
        base.Dispose(disposing);
    }
}

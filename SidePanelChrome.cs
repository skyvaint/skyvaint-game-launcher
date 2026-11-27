using System.Drawing.Drawing2D;

namespace Skyvaint;

// The side browser's own controls, drawn by hand so they look like the rest of the launcher (and skyvaint.com):
// line icons instead of font symbols, a soft round hover, a rounded address pill with a padlock, a thin loading bar,
// and rail tiles that light up for the site you are on.

/// <summary>A round icon button: back, forward, reload, add, view, open outside, close.</summary>
sealed class IconBtn : Control
{
    public string Icon;
    public Color Accent = Color.FromArgb(255, 31, 31);
    bool hot, down;
    public IconBtn(string icon, int size = 34)
    {
        Icon = icon;
        Size = new Size(size, size);
        Cursor = Cursors.Hand;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
        Margin = new Padding(2, 0, 2, 0);
    }
    protected override void OnMouseEnter(EventArgs e) { hot = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hot = down = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        float s = Math.Min(Width, Height), k = down ? 0.9f : 1f;
        if (hot)
        {
            using var b = new SolidBrush(Color.FromArgb(down ? 70 : 42, 255, 255, 255));
            float d = s * 0.92f * k;
            g.FillEllipse(b, (Width - d) / 2, (Height - d) / 2, d, d);
        }
        using var pen = new Pen(Color.FromArgb(hot ? 255 : 210, 245, 245, 245), 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        float cx = Width / 2f, cy = Height / 2f, r = s * 0.22f * k;
        switch (Icon)
        {
            case "back": g.DrawLines(pen, new[] { new PointF(cx + r * 0.4f, cy - r), new PointF(cx - r * 0.6f, cy), new PointF(cx + r * 0.4f, cy + r) }); break;
            case "forward": g.DrawLines(pen, new[] { new PointF(cx - r * 0.4f, cy - r), new PointF(cx + r * 0.6f, cy), new PointF(cx - r * 0.4f, cy + r) }); break;
            case "reload":
                g.DrawArc(pen, cx - r, cy - r, r * 2, r * 2, -60, 300);
                g.DrawLines(pen, new[] { new PointF(cx + r * 0.5f, cy - r * 1.25f), new PointF(cx + r * 0.62f, cy - r * 0.72f), new PointF(cx + r * 0.05f, cy - r * 0.6f) });
                break;
            case "stop": g.DrawLine(pen, cx - r * 0.8f, cy - r * 0.8f, cx + r * 0.8f, cy + r * 0.8f); g.DrawLine(pen, cx + r * 0.8f, cy - r * 0.8f, cx - r * 0.8f, cy + r * 0.8f); break;
            case "add": g.DrawLine(pen, cx - r, cy, cx + r, cy); g.DrawLine(pen, cx, cy - r, cx, cy + r); break;
            case "view": g.DrawRectangle(pen, cx - r, cy - r * 0.8f, r * 2, r * 1.6f); g.DrawLine(pen, cx + r * 0.2f, cy - r * 0.8f, cx + r * 0.2f, cy + r * 0.8f); break;
            case "out":
                g.DrawLines(pen, new[] { new PointF(cx + r * 0.1f, cy - r), new PointF(cx - r, cy - r), new PointF(cx - r, cy + r), new PointF(cx + r, cy + r), new PointF(cx + r, cy - r * 0.1f) });
                g.DrawLine(pen, cx - r * 0.1f, cy + r * 0.1f, cx + r * 1.05f, cy - r * 1.05f);
                g.DrawLines(pen, new[] { new PointF(cx + r * 0.35f, cy - r * 1.05f), new PointF(cx + r * 1.05f, cy - r * 1.05f), new PointF(cx + r * 1.05f, cy - r * 0.35f) });
                break;
            case "close": g.DrawLine(pen, cx - r * 0.8f, cy - r * 0.8f, cx + r * 0.8f, cy + r * 0.8f); g.DrawLine(pen, cx + r * 0.8f, cy - r * 0.8f, cx - r * 0.8f, cy + r * 0.8f); break;
        }
    }
}

/// <summary>The rounded address bar: a padlock for secure sites, and the text box inside.</summary>
sealed class AddressPill : Panel
{
    public bool Secure;
    public Color Fill = Color.FromArgb(28, 28, 28);
    public bool Focus_;
    public AddressPill()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
        Padding = new Padding(30, 8, 12, 0);
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = new RectangleF(0.5f, 0.5f, Width - 1, Height - 1);
        using var path = new GraphicsPath();
        float d = r.Height;
        path.AddArc(r.X, r.Y, d, d, 90, 180);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 180);
        path.CloseFigure();
        using var b = new SolidBrush(Fill);
        g.FillPath(b, path);
        using var edge = new Pen(Focus_ ? Color.FromArgb(200, 255, 255, 255) : Color.FromArgb(40, 255, 255, 255), 1f);
        g.DrawPath(edge, path);
        // padlock
        using var pen = new Pen(Color.FromArgb(Secure ? 210 : 110, 235, 235, 235), 1.5f);
        float x = 11, y = Height / 2f;
        g.DrawRectangle(pen, x, y - 2, 9, 7);
        g.DrawArc(pen, x + 1.5f, y - 7, 6, 8, 180, 180);
    }
}

/// <summary>A site in the rail: its icon on a rounded tile, lit up while you are on that site.</summary>
sealed class RailTile : Control
{
    public Image? Pic;
    public string Letter = "";
    public bool Active;
    public Color Accent = Color.FromArgb(255, 31, 31);
    bool hot;
    public RailTile()
    {
        Size = new Size(42, 42);
        Cursor = Cursors.Hand;
        Margin = new Padding(0, 0, 0, 8);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
    }
    protected override void OnMouseEnter(EventArgs e) { hot = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hot = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        float grow = hot ? 2 : 0;
        var r = new RectangleF(4 - grow, 3 - grow, 34 + grow * 2, 34 + grow * 2);
        using var path = Round(r, 10);
        using var b = new SolidBrush(Active ? Color.FromArgb(60, 255, 255, 255) : hot ? Color.FromArgb(34, 255, 255, 255) : Color.FromArgb(16, 255, 255, 255));
        g.FillPath(b, path);
        if (Active)
        {
            using var edge = new Pen(Color.FromArgb(220, 255, 255, 255), 1.4f);
            g.DrawPath(edge, path);
            using var bar = new SolidBrush(Accent);
            g.FillRectangle(bar, 0, 12, 2.5f, 18);
        }
        if (Pic != null) g.DrawImage(Pic, r.X + (r.Width - 22) / 2, r.Y + (r.Height - 22) / 2, 22, 22);
        else
        {
            using var f = new Font("Segoe UI Semibold", 12f);
            using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(Letter, f, Brushes.White, r, fmt);
        }
    }
    static GraphicsPath Round(RectangleF r, float rad)
    {
        var p = new GraphicsPath();
        float d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}

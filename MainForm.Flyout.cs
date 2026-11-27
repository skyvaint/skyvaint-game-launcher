namespace Skyvaint;

// Hovering the launcher (its tray icon, or the Skyvaint logo on a NEXUS bar) brings up StatsFlyout: OPEN, QUIT and
// live stats. It waits a moment first, so passing over it on the way somewhere else doesn't pop it up.
public sealed partial class MainForm
{
    StatsFlyout? flyout;
    System.Windows.Forms.Timer? hoverWait;
    Point hoverAt;
    Rectangle hoverNear;
    string hoverEdge = "bottom";

    /// <summary>The pointer is on the launcher at <paramref name="cursor"/>; <paramref name="near"/> is what it is
    /// on, and <paramref name="edge"/> the screen edge that sits on (the panel opens away from it).</summary>
    internal void LauncherHover(Rectangle near, Point cursor, string edge)
    {
        if (quitting) return;
        if (flyout is { Visible: true }) { flyout.ShowAt(near, cursor, edge); return; }
        // Moved more than a little: the wait starts again.
        if (hoverWait != null && Math.Abs(cursor.X - hoverAt.X) + Math.Abs(cursor.Y - hoverAt.Y) < 12) return;
        hoverAt = cursor; hoverNear = near; hoverEdge = edge;
        hoverWait ??= new System.Windows.Forms.Timer { Interval = 380 };
        hoverWait.Tick -= HoverWaited;
        hoverWait.Tick += HoverWaited;
        hoverWait.Stop();
        hoverWait.Start();
    }

    void HoverWaited(object? sender, EventArgs e)
    {
        hoverWait?.Stop();
        var p = Cursor.Position;
        // Still there?
        if (!Rectangle.Inflate(hoverNear, 6, 6).Contains(p)) { hoverWait?.Dispose(); hoverWait = null; return; }
        hoverWait?.Dispose(); hoverWait = null;
        flyout ??= new StatsFlyout(() => SetMode("home"), Quit);
        flyout.ShowAt(hoverNear, p, hoverEdge);
    }

    void HideFlyout() { try { flyout?.HideNow(); } catch { } }

    /// <summary>The tray icon: Windows doesn't say where it is, so the panel goes by the pointer and the taskbar.</summary>
    void HookTrayHover()
    {
        tray.MouseMove += (_, _) =>
        {
            var p = Cursor.Position;
            var s = Screen.FromPoint(p);
            var wa = s.WorkingArea;
            string edge = wa.Bottom < s.Bounds.Bottom ? "bottom" : wa.Top > s.Bounds.Top ? "top" : wa.Left > s.Bounds.Left ? "left" : wa.Right < s.Bounds.Right ? "right" : "bottom";
            int r = (int)(16 * DeviceDpi / 96f);
            LauncherHover(new Rectangle(p.X - r, p.Y - r, r * 2, r * 2), p, edge);
        };
        tray.MouseDown += (_, _) => HideFlyout();
    }
}

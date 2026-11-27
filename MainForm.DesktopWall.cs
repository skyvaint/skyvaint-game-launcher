using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Skyvaint;

// Settings → DESKTOP → DESKTOP WALLPAPER: on each screen, a window drawn behind the desktop icons (inside Explorer's
// Progman/WorkerW, the way Lively and Wallpaper Engine do it) showing wwwroot/desktop.html: your picture, GIF, video,
// colour or a live effect. The windows live in the shell, so they keep going while the HOME page sleeps, and they
// pause while a game runs. Quitting gives the desktop back to Windows' own wallpaper.
public sealed partial class MainForm
{
    readonly List<WallForm> walls = new();
    string wallShape = "";
    JsonObject deskLook = new();
    bool wallsPaused;

    bool OnDesktopMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "desktopLook":
                deskLook = new JsonObject { ["accent"] = m["accent"]?.ToString(), ["accent2"] = m["accent2"]?.ToString() };
                SyncDesktop();
                return true;
            case "desktopRefresh":
                wallShape = "";
                SyncDesktop();
                return true;
            case "setWindowsWallpaperFrom":
            {
                var name = Path.GetFileName(Uri.TryCreate(m["src"]?.ToString(), UriKind.Absolute, out var u) ? Uri.UnescapeDataString(u.AbsolutePath) : "");
                var file = name == "" ? "" : Path.Combine(MediaDir, name);
                bool ok = File.Exists(file) && SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, file, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
                Send(new JsonObject { ["type"] = "notice", ["ok"] = ok, ["text"] = ok ? "Windows wallpaper set (on every screen)." : "Windows didn't take that picture." });
                return true;
            }
        }
        return false;
    }

    static string ScreenKey(string name) => new string(name.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

    JsonObject? WallOf(JsonObject desk, Screen s)
    {
        if (desk["sameOnAll"]?.GetValue<bool>() != false) return desk["all"] as JsonObject;
        if (desk["screens"] is JsonObject per)
            foreach (var (k, v) in per)
                if (ScreenKey(k) == ScreenKey(s.DeviceName) && v is JsonObject o) return o;
        return desk["all"] as JsonObject;
    }

    /// <summary>Builds, rebuilds or closes the wallpaper windows to match the settings, then sends them the settings.</summary>
    void SyncDesktop()
    {
        if (InvokeRequired) { BeginInvoke(SyncDesktop); return; }
        if (quitting) return;
        var desk = config?["desktop"] as JsonObject;
        bool on = desk?["enabled"]?.GetValue<bool>() == true;
        var screens = Screen.AllScreens;
        var want = screens.Select(s =>
        {
            var w = desk == null ? null : WallOf(desk, s);
            var kind = w?["kind"]?.ToString() ?? "none";
            return (on && kind != "none" && kind != "") || Storm(s);
        }).ToArray();
        string shape = string.Join(";", screens.Select((s, i) => $"{s.DeviceName}:{s.Bounds}:{want[i]}"));
        if (shape != wallShape)
        {
            CloseWalls(false);
            for (int i = 0; i < screens.Length; i++)
                if (want[i]) walls.Add(new WallForm(this, screens[i], i));
            foreach (var w in walls) w.Show();
            wallShape = shape;
        }
        foreach (var w in walls) w.Post(WallPayload(w.ScreenOf));
        if (walls.Count > 0) HookScreens();
    }

    /// <summary>While you play (or a game is starting), screens other than the main one get the faster aurora storm.</summary>
    bool Storm(Screen s) => wallsPaused && !s.Primary && (config?["desktop"]?["gameAuroras"]?.GetValue<bool>() ?? true);

    JsonObject WallPayload(Screen s) => new()
    {
        ["storm"] = Storm(s),
        ["type"] = "desktop",
        ["desktop"] = config?["desktop"]?.DeepClone(),
        ["look"] = deskLook.DeepClone(),
        ["paused"] = wallsPaused && !Storm(s),
        ["monitors"] = new JsonArray(Screen.AllScreens.Select(s => (JsonNode)new JsonObject
        {
            ["x"] = s.Bounds.X, ["y"] = s.Bounds.Y, ["w"] = s.Bounds.Width, ["h"] = s.Bounds.Height, ["primary"] = s.Primary,
        }).ToArray()),
    };

    /// <summary>A game started or every game ended: the effects stop drawing while you play.</summary>
    void DesktopPause(bool pause)
    {
        if (pause == wallsPaused) return;
        wallsPaused = pause;
        BeginInvoke(SyncDesktop);
    }

    void CloseWalls(bool quittingNow)
    {
        bool had = walls.Count > 0;
        foreach (var w in walls) { try { w.Close(); w.Dispose(); } catch { } }
        walls.Clear();
        wallShape = "";
        // Windows draws its own wallpaper again over what the launcher left there (nothing is changed or saved).
        if (had || quittingNow) { if (quittingNow) RedrawWindowsWallpaper(); else Task.Run(RedrawWindowsWallpaper); }
    }

    static void RedrawWindowsWallpaper()
    {
        var buf = new System.Text.StringBuilder(520);
        if (SystemParametersInfo(SPI_GETDESKWALLPAPER, buf.Capacity, buf, 0))
            SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, buf.ToString(), 0);
    }

    /// <summary>One screen's wallpaper.</summary>
    sealed class WallForm : Form
    {
        readonly MainForm owner;
        readonly Screen screen;
        readonly int index;
        readonly WebView2 view = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
        public Screen ScreenOf => screen;
        bool ready;
        JsonObject? pending;

        public WallForm(MainForm owner, Screen screen, int index)
        {
            this.owner = owner;
            this.screen = screen;
            this.index = index;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Bounds = screen.Bounds;
            BackColor = Color.Black;
            Text = "Skyvaint wallpaper";
            Controls.Add(view);
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x08000000 | 0x80; // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW: never focused, not in Alt+Tab
                return cp;
            }
        }
        protected override bool ShowWithoutActivation => true;

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            BehindIcons(Handle, screen.Bounds);
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, CacheDir, WebOptions());
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.SetVirtualHostNameToFolderMapping("skyvaint.example", Path.Combine(AppContext.BaseDirectory, "wwwroot"), CoreWebView2HostResourceAccessKind.Allow);
                core.AddWebResourceRequestedFilter("https://media.skyvaint.example/*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += owner.ServeMedia;
                core.WebMessageReceived += (_, ev) =>
                {
                    try
                    {
                        var m = JsonNode.Parse(ev.WebMessageAsJson) as JsonObject;
                        if (m?["type"]?.ToString() == "desktopReady") { ready = true; Post(pending ?? owner.WallPayload(screen)); pending = null; }
                    }
                    catch { }
                };
                var b = screen.Bounds;
                core.Navigate($"https://skyvaint.example/desktop.html?layer=wall&label=wall-{index}&screen={ScreenKey(screen.DeviceName)}&x={b.X}&y={b.Y}&w={b.Width}&h={b.Height}&s=1");
            }
            catch (Exception ex) { StartupGuard.Log("Desktop wallpaper", ex); }
        }

        public void Post(JsonObject msg)
        {
            if (!ready || view.CoreWebView2 == null) { if (msg["type"]?.ToString() == "desktop") pending = msg; return; }
            try { view.CoreWebView2.PostWebMessageAsJson(msg.ToJsonString()); } catch { }
        }
    }

    // ---- behind the desktop icons

    static void BehindIcons(IntPtr h, Rectangle b)
    {
        IntPtr progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return;
        // Asks Explorer to split off the window that holds the wallpaper.
        SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), 0, 1000, out _);
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out _);
        int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77); // the virtual screen's top-left
        IntPtr defView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (defView != IntPtr.Zero)
        {
            // Windows 11 24H2 and later: icons and wallpaper both live inside Progman. Go between them.
            SetWindowLong(h, -20, GetWindowLong(h, -20) | 0x80000); // WS_EX_LAYERED
            SetLayeredWindowAttributes(h, 0, 255, 2);
            SetParent(h, progman);
            SetWindowPos(h, defView, b.X - vx, b.Y - vy, b.Width, b.Height, 0x10); // SWP_NOACTIVATE
            return;
        }
        // Older Windows: the WorkerW next to the one holding the icons.
        IntPtr worker = IntPtr.Zero;
        EnumTopWindows((top, _) =>
        {
            if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                worker = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
            return true;
        }, IntPtr.Zero);
        if (worker == IntPtr.Zero) return;
        SetParent(h, worker);
        SetWindowPos(h, IntPtr.Zero, b.X - vx, b.Y - vy, b.Width, b.Height, 0x10 | 0x4); // NOACTIVATE | NOZORDER
    }

    const int SPI_GETDESKWALLPAPER = 0x73, SPI_SETDESKWALLPAPER = 0x14, SPIF_UPDATEINIFILE = 1, SPIF_SENDCHANGE = 2;
    delegate bool WallEnumProc(IntPtr hwnd, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string? title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string? title);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, int msg, IntPtr w, IntPtr l, int flags, int timeout, out IntPtr result);
    [DllImport("user32.dll", EntryPoint = "EnumWindows")] static extern bool EnumTopWindows(WallEnumProc proc, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, int flags);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, int key, byte alpha, int flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(int action, int param, string? value, int flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(int action, int param, System.Text.StringBuilder value, int flags);
}

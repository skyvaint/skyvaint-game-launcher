using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Skyvaint;

/// <summary>
/// The side panel: a real browser docked to the side of HOME, for TikTok, Instagram, YouTube and any other site
/// (those sites refuse to load inside the launcher's own page, so this is its own browser view). A rail of your
/// sites down one side, back / forward / reload and an address bar on top, a wide mode that turns it into a full
/// browser, and a grip to drag its width. Sign-ins stay, like in a normal browser.
/// </summary>
sealed class SidePanel : Panel
{
    readonly MainForm owner;
    readonly Func<CoreWebView2Environment?> env;
    readonly Panel header = new() { Dock = DockStyle.Top, Height = 44 };
    readonly FlowLayoutPanel rail = new() { Dock = DockStyle.Left, Width = 54, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 8, 0, 8) };
    readonly Panel grip = new() { Dock = DockStyle.Left, Width = 6, Cursor = Cursors.SizeWE };
    readonly TextBox address = new() { BorderStyle = BorderStyle.None, Font = new Font("Segoe UI", 10f) };
    readonly ToolTip tips = new();
    WebView2? view;
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(10) };
    Color accent = Color.FromArgb(255, 31, 31), bg = Color.FromArgb(14, 10, 10);
    int normalWidth = 420, dragX = -1;
    bool wide, mobile = true;
    string sitesKey = "";

    const string MobileUA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    public SidePanel(MainForm owner, Func<CoreWebView2Environment?> env)
    {
        this.owner = owner;
        this.env = env;
        Visible = false;
        Dock = DockStyle.Right;
        Width = normalWidth;
        BackColor = bg;
        Controls.Add(header);
        Controls.Add(rail);
        Controls.Add(grip);
        BuildHeader();
        grip.MouseDown += (_, e) => { if (e.Button == MouseButtons.Left) dragX = Cursor.Position.X; };
        grip.MouseMove += (_, _) =>
        {
            if (dragX < 0) return;
            int dx = dragX - Cursor.Position.X;
            dragX = Cursor.Position.X;
            Width = Math.Clamp(Width + (Dock == DockStyle.Left ? -dx : dx), 300, Math.Max(400, (Parent?.Width ?? 1600) - 400));
        };
        grip.MouseUp += (_, _) =>
        {
            if (dragX < 0) return;
            dragX = -1;
            if (!wide) { normalWidth = Width; owner.OnSideMessage(new JsonObject { ["type"] = "width", ["width"] = Width }); }
        };
    }

    Button Btn(string text, string tip, Action click, int width = 34)
    {
        var b = new Button { Text = text, Width = width, Height = 32, FlatStyle = FlatStyle.Flat, ForeColor = Color.FromArgb(245, 239, 238), BackColor = Color.Transparent, Font = new Font("Segoe UI Symbol", 11f), Cursor = Cursors.Hand, TabStop = false };
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(60, accent);
        b.Click += (_, _) => click();
        tips.SetToolTip(b, tip);
        return b;
    }

    void BuildHeader()
    {
        var row = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(4, 6, 4, 0) };
        row.Controls.Add(Btn("◀", "Back", () => { if (view?.CanGoBack == true) view.GoBack(); }));
        row.Controls.Add(Btn("▶", "Forward", () => { if (view?.CanGoForward == true) view.GoForward(); }));
        row.Controls.Add(Btn("⟳", "Reload", () => view?.Reload()));
        var box = new Panel { Width = 200, Height = 30, Padding = new Padding(8, 6, 8, 0), Margin = new Padding(4, 1, 4, 0) };
        address.Dock = DockStyle.Fill;
        address.KeyDown += (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; Go(address.Text); } };
        box.Controls.Add(address);
        row.Controls.Add(box);
        row.Controls.Add(Btn("⤢", "Wide (full browser)", ToggleWide));
        row.Controls.Add(Btn("↗", "Open in your browser", () => { var u = view?.Source?.AbsoluteUri; if (!string.IsNullOrEmpty(u)) try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(u) { UseShellExecute = true })?.Dispose(); } catch { } }));
        row.Controls.Add(Btn("✕", "Close", () => owner.OnSideMessage(new JsonObject { ["type"] = "close" })));
        header.Controls.Add(row);
        header.Resize += (_, _) => box.Width = Math.Max(80, header.Width - 6 * 38 - 20);
    }

    /// <summary>Colours, sites, side and width from the settings.</summary>
    public void Configure(JsonObject? social, JsonObject? theme)
    {
        accent = Hex(theme?["accent"]?.ToString(), accent);
        var b = Hex(theme?["bg"]?.ToString(), Color.FromArgb(7, 5, 5));
        bg = Color.FromArgb(Math.Min(255, b.R + 8), Math.Min(255, b.G + 6), Math.Min(255, b.B + 6));
        BackColor = rail.BackColor = bg;
        header.BackColor = Color.FromArgb(Math.Min(255, bg.R + 6), Math.Min(255, bg.G + 5), Math.Min(255, bg.B + 5));
        grip.BackColor = Color.FromArgb(90, accent);
        address.BackColor = Color.FromArgb(30, 24, 24);
        address.ForeColor = Color.FromArgb(245, 239, 238);
        if (address.Parent is Panel p) p.BackColor = address.BackColor;
        var side = social?["side"]?.ToString() == "left" ? DockStyle.Left : DockStyle.Right;
        if (Dock != side) { Dock = side; grip.Dock = side == DockStyle.Left ? DockStyle.Right : DockStyle.Left; }
        try { normalWidth = Math.Clamp(social?["width"]?.GetValue<int>() ?? 420, 300, 2400); } catch { }
        if (!wide) Width = normalWidth;
        try { mobile = social?["mobile"]?.GetValue<bool>() ?? true; } catch { }
        if (view?.CoreWebView2 != null) view.CoreWebView2.Settings.UserAgent = mobile && !wide ? MobileUA : "";
        var sites = Sites(social);
        var key = string.Join("|", sites.Select(s => s.url));
        if (key != sitesKey) { sitesKey = key; BuildRail(sites); }
    }

    static readonly (string name, string url)[] Defaults =
    [
        ("TikTok", "https://www.tiktok.com/"), ("Instagram", "https://www.instagram.com/"), ("YouTube", "https://www.youtube.com/"), ("X", "https://x.com/"),
        ("Twitch", "https://www.twitch.tv/"), ("Discord", "https://discord.com/app"), ("Reddit", "https://www.reddit.com/"), ("Google", "https://www.google.com/"),
    ];
    static List<(string name, string url)> Sites(JsonObject? social)
    {
        var list = (social?["sites"] as JsonArray)?.OfType<JsonObject>().Select(s => (s["name"]?.ToString() ?? "", s["url"]?.ToString() ?? "")).Where(s => s.Item2 != "").ToList();
        return list is { Count: > 0 } ? list : Defaults.ToList();
    }

    void BuildRail(List<(string name, string url)> sites)
    {
        rail.Controls.Clear();
        foreach (var (name, url) in sites)
        {
            var b = Btn(name.Length > 0 ? name[..1] : "?", name, () => Go(url), 42);
            b.Height = 42;
            b.Margin = new Padding(0, 0, 0, 6);
            b.Font = new Font("Segoe UI Semibold", 12f);
            rail.Controls.Add(b);
            _ = LoadIcon(b, url);
        }
        rail.Controls.Add(Btn("+", "Add a site (Settings → Social)", () => owner.OnSideMessage(new JsonObject { ["type"] = "addSite" }), 42));
    }

    static async Task LoadIcon(Button b, string url)
    {
        try
        {
            var host = new Uri(url).Host;
            var bytes = await http.GetByteArrayAsync($"https://www.google.com/s2/favicons?domain={host}&sz=64");
            using var ms = new MemoryStream(bytes);
            var img = new Bitmap(Image.FromStream(ms), 24, 24);
            if (b.IsDisposed) return;
            b.BeginInvoke(() => { b.Image = img; b.Text = ""; });
        }
        catch { }
    }

    async Task EnsureView()
    {
        if (view != null) return;
        var e = env();
        if (e == null) return;
        view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = bg };
        Controls.Add(view);
        view.BringToFront();
        await view.EnsureCoreWebView2Async(e);
        var core = view.CoreWebView2;
        core.Settings.UserAgent = mobile && !wide ? MobileUA : "";
        core.Settings.AreDevToolsEnabled = false;
        // Links that would open a new window open here instead.
        core.NewWindowRequested += (_, a) => { a.Handled = true; core.Navigate(a.Uri); };
        core.SourceChanged += (_, _) => { if (!address.Focused) address.Text = core.Source; };
        core.DocumentTitleChanged += (_, _) => owner.OnSideMessage(new JsonObject { ["type"] = "title", ["title"] = core.DocumentTitle, ["url"] = core.Source });
    }

    /// <summary>Opens an address, or searches for words that aren't one.</summary>
    public async void Go(string text)
    {
        text = text.Trim();
        if (text == "") return;
        string url = text;
        if (!System.Text.RegularExpressions.Regex.IsMatch(text, @"^[a-z][a-z0-9+.-]*://", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            url = text.Contains('.') && !text.Contains(' ') ? "https://" + text : "https://www.google.com/search?q=" + Uri.EscapeDataString(text);
        if (!Visible) Open();
        await EnsureView();
        try { view?.CoreWebView2?.Navigate(url); } catch { }
        address.Text = url;
    }

    public async void Open(string? url = null)
    {
        Visible = true;
        BringToFront();
        await EnsureView();
        if (url != null) Go(url);
        else if (view?.CoreWebView2 != null && (view.Source == null || view.Source.AbsoluteUri == "about:blank")) Go(Sites(null)[0].url);
        owner.OnSideMessage(new JsonObject { ["type"] = "opened" });
    }

    public void Close() => Visible = false;

    void ToggleWide()
    {
        wide = !wide;
        Width = wide ? Math.Max(normalWidth, (int)((Parent?.Width ?? 1600) * 0.62)) : normalWidth;
        if (view?.CoreWebView2 != null) { view.CoreWebView2.Settings.UserAgent = mobile && !wide ? MobileUA : ""; view.Reload(); }
    }

    static Color Hex(string? hex, Color fallback)
    {
        try { return string.IsNullOrEmpty(hex) || hex.Length != 7 ? fallback : Color.FromArgb(Convert.ToInt32(hex[1..3], 16), Convert.ToInt32(hex[3..5], 16), Convert.ToInt32(hex[5..7], 16)); }
        catch { return fallback; }
    }
}

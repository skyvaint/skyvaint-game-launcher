using System.Text.Json.Nodes;

namespace Skyvaint;

// LED colours (Settings → DESKTOP → LED COLOURS): your RGB devices through OpenRGB. The page sends the settings
// ("ledApply"); a background thread draws the effect: one colour, your theme, breathing, a rainbow wave or a wave
// between two colours. While a game runs the lights can take their own colour, and starting a game flashes them.
// Nothing is sent to OpenRGB until the feature is switched on, and losing OpenRGB just pauses it.
public sealed partial class MainForm
{
    readonly object ledLock = new();
    JsonObject? ledCfg;
    string ledAccent = "#ff1f1f", ledAccent2 = "#ff4d3d";
    Thread? ledThread;
    DateTime ledFlashUntil = DateTime.MinValue;
    bool ledPlaying;

    bool OnLedMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "ledApply":
                lock (ledLock)
                {
                    ledCfg = m["leds"]?.DeepClone() as JsonObject;
                    ledAccent = m["accent"]?.ToString() is { Length: > 0 } a ? a : ledAccent;
                    ledAccent2 = m["accent2"]?.ToString() is { Length: > 0 } b ? b : ledAccent2;
                }
                if (ledCfg?["enabled"]?.GetValue<bool>() == true) StartLeds();
                return true;
            case "ledStatus":
                Task.Run(() =>
                {
                    var reply = new JsonObject { ["type"] = "ledStatus" };
                    try
                    {
                        using var rgb = new OpenRgb();
                        rgb.Connect(LedHost(), LedPort());
                        reply["connected"] = true;
                        reply["devices"] = new JsonArray(rgb.Devices.Select(d => (JsonNode)new JsonObject
                        {
                            ["index"] = d.Index, ["name"] = d.Name, ["leds"] = d.Leds, ["type"] = d.Type, ["direct"] = d.HasDirect,
                        }).ToArray());
                    }
                    catch (Exception ex) { reply["connected"] = false; reply["error"] = ex.Message; }
                    BeginInvoke(() => Send(reply));
                });
                return true;
            case "ledFlash":
                ledFlashUntil = DateTime.Now.AddMilliseconds(900);
                return true;
        }
        return false;
    }

    string LedHost() { lock (ledLock) return ledCfg?["host"]?.ToString() is { Length: > 0 } h ? h : "127.0.0.1"; }
    int LedPort() { lock (ledLock) return ledCfg?["port"]?.GetValue<int>() is int p and > 0 ? p : 6742; }

    /// <summary>Called when a game starts and when what's running changes.</summary>
    void LedGameStarted() => ledFlashUntil = DateTime.Now.AddMilliseconds(900);
    void LedPlaying(bool any) => ledPlaying = any;

    void StartLeds()
    {
        if (ledThread is { IsAlive: true }) return;
        ledThread = new Thread(LedLoop) { IsBackground = true, Name = "LED colours", Priority = ThreadPriority.BelowNormal };
        ledThread.Start();
    }

    void LedLoop()
    {
        OpenRgb? rgb = null;
        var started = DateTime.Now;
        DateTime lastSend = DateTime.MinValue, retryAt = DateTime.MinValue;
        string lastKey = "";
        while (!quitting)
        {
            JsonObject? cfg;
            string a1, a2;
            lock (ledLock) { cfg = ledCfg?.DeepClone() as JsonObject; a1 = ledAccent; a2 = ledAccent2; }
            if (cfg?["enabled"]?.GetValue<bool>() != true) { rgb?.Dispose(); return; }
            try
            {
                if (rgb is not { Connected: true })
                {
                    if (DateTime.Now < retryAt) { Thread.Sleep(500); continue; }
                    rgb?.Dispose();
                    rgb = new OpenRgb();
                    rgb.Connect(LedHost(), LedPort());
                    foreach (var d in rgb.Devices) if (Wanted(cfg, d)) rgb.TakeOver(d);
                    lastKey = "";
                }
                double t = (DateTime.Now - started).TotalSeconds;
                bool flash = DateTime.Now < ledFlashUntil && cfg["launchFlash"]?.GetValue<bool>() != false;
                string mode = cfg["mode"]?.ToString() ?? "theme";
                if (ledPlaying && !flash)
                {
                    var play = cfg["whilePlaying"]?.ToString() ?? "keep";
                    if (play == "off") mode = "off";
                    else if (play == "color") mode = "playcolor";
                    else if (play == "dim") mode = "dim:" + mode;
                }
                bool animated = flash || mode.Contains("breathe") || mode.Contains("wave") || mode.Contains("rainbow");
                double bright = Math.Clamp(cfg["brightness"]?.GetValue<double>() ?? 1, 0, 1);
                double speed = Math.Clamp(cfg["speed"]?.GetValue<double>() ?? 1, 0.1, 5);
                int c1 = Hex(cfg["color"]?.ToString(), Hex(a1, 0xff1f1f)), c2 = Hex(cfg["color2"]?.ToString(), Hex(a2, 0x8b3dff));
                if (cfg["followTheme"]?.GetValue<bool>() == true || mode.EndsWith("theme")) { c1 = Hex(a1, c1); c2 = Hex(a2, c2); }
                int play1 = Hex(cfg["playColor"]?.ToString(), 0xffffff);

                string key = $"{flash}|{mode}|{c1}|{c2}|{bright}|{play1}";
                if (!animated && key == lastKey && (DateTime.Now - lastSend).TotalSeconds < 5) { Thread.Sleep(200); continue; }
                foreach (var d in rgb.Devices)
                {
                    if (!Wanted(cfg, d) || d.Leds == 0) continue;
                    var px = new int[d.Leds];
                    for (int i = 0; i < px.Length; i++)
                    {
                        double f = px.Length > 1 ? i / (double)px.Length : 0;
                        int c = flash ? Mix(Hex(a1, c1), 0xffffff, 0.35 + 0.65 * Math.Max(0, (ledFlashUntil - DateTime.Now).TotalMilliseconds / 900))
                            : Effect(mode, t * speed, f, c1, c2, play1);
                        px[i] = Scale(c, bright);
                    }
                    rgb.SetLeds(d, px);
                }
                lastKey = key;
                lastSend = DateTime.Now;
                Thread.Sleep(animated ? 33 : 200);
            }
            catch (Exception ex)
            {
                StartupGuard.Log("LED colours: " + ex.Message);
                rgb?.Dispose();
                rgb = null;
                retryAt = DateTime.Now.AddSeconds(10);
            }
        }
        rgb?.Dispose();
    }

    static bool Wanted(JsonObject cfg, OpenRgb.Device d) =>
        cfg["devices"] is not JsonObject off || off[d.Name]?.GetValue<bool>() != false;

    static int Effect(string mode, double t, double f, int c1, int c2, int play)
    {
        bool dim = mode.StartsWith("dim:");
        if (dim) mode = mode[4..];
        int c = mode switch
        {
            "off" => 0,
            "playcolor" => play,
            "breathe" or "breathe-theme" => Scale(c1, 0.12 + 0.88 * (0.5 + 0.5 * Math.Sin(t * 2.2))),
            "rainbow" => Hsv((t * 60 + f * 360) % 360),
            "wave" or "wave-theme" => Mix(c1, c2, 0.5 + 0.5 * Math.Sin(t * 2.4 + f * Math.PI * 2)),
            _ => c1, // static, theme
        };
        return dim ? Scale(c, 0.25) : c;
    }

    static int Hex(string? s, int fallback)
    {
        if (string.IsNullOrEmpty(s)) return fallback;
        s = s.Trim().TrimStart('#');
        if (s.Length == 3) s = string.Concat(s.Select(ch => $"{ch}{ch}"));
        return s.Length >= 6 && int.TryParse(s[..6], System.Globalization.NumberStyles.HexNumber, null, out int v) ? v : fallback;
    }
    static int Scale(int c, double k) => ((int)((c >> 16 & 255) * k) << 16) | ((int)((c >> 8 & 255) * k) << 8) | (int)((c & 255) * k);
    static int Mix(int a, int b, double t)
    {
        t = Math.Clamp(t, 0, 1);
        int ch(int s) => (int)((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * t);
        return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    }
    static int Hsv(double h)
    {
        double x = 1 - Math.Abs(h / 60 % 2 - 1);
        (double r, double g, double b) = h < 60 ? (1d, x, 0d) : h < 120 ? (x, 1d, 0d) : h < 180 ? (0d, 1d, x) : h < 240 ? (0d, x, 1d) : h < 300 ? (x, 0d, 1d) : (1d, 0d, x);
        return ((int)(r * 255) << 16) | ((int)(g * 255) << 8) | (int)(b * 255);
    }
}

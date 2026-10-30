using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;

namespace Skyvaint;

// Newer extras: the app icon, Discord Rich Presence, the NEXUS desktop bar, the DISCOVER feeds and the Start-menu
// app list used to fill the bar.
public sealed partial class MainForm
{
    CoreWebView2Environment? mainEnv;
    // One window per NEXUS bar: "main" is the original bar (config.nexus), the others live in config.nexus.bars.
    readonly Dictionary<string, DockForm> docks = new();
    readonly Dictionary<string, string> dockSigs = new();
    DockForm? dock => docks.GetValueOrDefault("main") ?? docks.Values.FirstOrDefault();
    string iconSignature = "", dockSignature = "", presenceSignature = "";
    readonly DiscordRpc discord = new();
    readonly Dictionary<string, DateTime> runningSince = new();
    DateTime lastDiscordTry = DateTime.MinValue;
    JsonObject? discoverCache;
    DateTime discoverAt = DateTime.MinValue;
    static readonly HttpClient Web = new() { Timeout = TimeSpan.FromSeconds(20) };

    bool OnExtraMessage(JsonObject m)
    {
        string Str(string key) => m[key]?.ToString() ?? "";
        switch (Str("type"))
        {
            case "applyIconToShortcuts":
                try
                {
                    var ico = Path.Combine(DataDir, "appicon.ico");
                    AppIcon.SaveIco(ico, s => AppIcon.Draw(s, config, MediaDir));
                    int n = AppIcon.ApplyToShortcuts(ico);
                    Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = n == 0 ? "No shortcuts to this launcher were found." : $"Icon applied to {n} shortcut{(n == 1 ? "" : "s")}" });
                }
                catch (Exception ex) { Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "Couldn't update the shortcuts: " + ex.Message }); }
                return true;

            case "discover":
                _ = Discover(m["fresh"]?.GetValue<bool>() ?? false);
                return true;

            case "openUrl":
                var url = Str("url");
                if (Regex.IsMatch(url, @"^(https?|steam|com\.epicgames\.launcher|roblox|discord|parsec)://", RegexOptions.IgnoreCase))
                    try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose(); } catch { }
                return true;

            case "startMenu":
                _ = StartMenuApps();
                return true;

            case "nexusOpen":
                OpenNexusItem(Str("id"));
                return true;

            case "nexusSeed":
                Send(new JsonObject { ["type"] = "nexusSeed", ["apps"] = SeedApps() });
                return true;

            case "appIcon":
                SendAppIcon();
                return true;

            case "soundFolder":
                Send(new JsonObject { ["type"] = "soundFolder", ["files"] = SoundFolder(Str("path") == "bt3" ? Bt3Sounds : Str("path")) });
                return true;

            case "soundLibrary":
                Send(new JsonObject { ["type"] = "soundLibrary", ["sounds"] = SoundLibrary(Str("path") == "bt3" ? Path.Combine(Bt3Sounds, "All") : Str("path")) });
                return true;

            case "dockDump" when DebugPort > 0:
                Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = string.Join(" | ", docks.Select(kv => kv.Key + ":" + kv.Value.Handle + ":" + kv.Value.Visible + ":" + kv.Value.Bounds)) + " || forms=" + string.Join(",", Application.OpenForms.OfType<DockForm>().Select(f => f.Handle + ":" + f.Visible)) });
                return true;

            case "recordClip":
                SendHotkey(Str("keys"));
                return true;

            case "discordReconnect":
                lastDiscordTry = DateTime.MinValue;
                presenceSignature = "";
                _ = UpdatePresence(force: true);
                return true;
        }
        return false;
    }

    // ---------- app icon ----------

    void UpdateIcons()
    {
        var sig = (config?["appIcon"]?.ToJsonString() ?? "") + config?["theme"]?["accent"] + config?["theme"]?["accent2"];
        if (sig == iconSignature) return;
        iconSignature = sig;
        try
        {
            var old = Icon;
            Icon = AppIcon.ToIcon(AppIcon.Draw(64, config, MediaDir));
            tray.Icon = AppIcon.ToIcon(AppIcon.Draw(32, config, MediaDir));
            foreach (var d in docks.Values) d.Icon = Icon;
        }
        catch { }
        try
        {
            // The full-size picture, for the logo inside the launcher and on the NEXUS bar.
            var name = "appicon_" + Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(sig)), 0, 6).ToLowerInvariant() + ".png";
            var file = Path.Combine(MediaDir, name);
            if (!File.Exists(file))
            {
                using (var big = AppIcon.Draw(256, config, MediaDir)) big.Save(file, System.Drawing.Imaging.ImageFormat.Png);
                foreach (var stale in Directory.EnumerateFiles(MediaDir, "appicon_*.png"))
                    if (!stale.EndsWith(name, StringComparison.OrdinalIgnoreCase)) try { File.Delete(stale); } catch { }
            }
            appIconUrl = $"https://{MediaHost}/{name}";
            SendAppIcon();
            // Shortcuts already pointed at our .ico pick up the change too.
            var ico = Path.Combine(DataDir, "appicon.ico");
            if (File.Exists(ico))
            {
                AppIcon.SaveIco(ico, s => AppIcon.Draw(s, config, MediaDir));
                AppIcon.RefreshShell();
            }
        }
        catch { }
        dockSigs.Clear();
        PushDock();
    }

    string appIconUrl = "";

    /// <summary>Where the BT3 sounds pulled from the user's own ISO were exported.</summary>
    static string Bt3Sounds => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "BT3 Modding", "Exports", "Launcher Sounds");

    /// <summary>Every sound file in a folder (and its subfolders), copied into the media folder once, for the sound
    /// browser: name, address, length in seconds.</summary>
    JsonArray SoundLibrary(string folder)
    {
        var list = new JsonArray();
        if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return list;
        foreach (var file in Directory.EnumerateFiles(folder, "*.*", SearchOption.AllDirectories)
                     .Where(f => Regex.IsMatch(f, @"\.(wav|mp3|ogg|m4a|flac)$", RegexOptions.IgnoreCase)).OrderBy(f => f).Take(600))
        {
            try
            {
                var name = Path.GetFileNameWithoutExtension(file);
                var dest = "lib_" + Regex.Replace(name, @"[^A-Za-z0-9_-]", "_") + "_" +
                           Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(file.ToLowerInvariant())), 0, 4).ToLowerInvariant() + Path.GetExtension(file).ToLowerInvariant();
                var target = Path.Combine(MediaDir, dest);
                if (!File.Exists(target) || new FileInfo(target).Length != new FileInfo(file).Length) File.Copy(file, target, overwrite: true);
                double secs = 0;
                if (file.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
                {
                    var head = new byte[44];
                    using (var fs = File.OpenRead(file)) fs.ReadExactly(head);
                    int rate = BitConverter.ToInt32(head, 24), bytesPerSec = BitConverter.ToInt32(head, 28);
                    if (bytesPerSec > 0) secs = Math.Round((new FileInfo(file).Length - 44) / (double)bytesPerSec, 2);
                }
                list.Add(new JsonObject { ["name"] = name, ["url"] = $"https://{MediaHost}/{dest}", ["secs"] = secs });
            }
            catch { }
        }
        return list;
    }

    /// <summary>Matches sound files in a folder to the launcher's sounds by name (nav.wav, cursor.mp3, cancel.ogg…),
    /// copies each match into the media folder and returns sound → address.</summary>
    JsonObject SoundFolder(string folder)
    {
        var map = new JsonObject();
        if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return map;
        var aliases = new (string ev, string[] words)[]
        {
            ("nav", ["nav", "cursor", "move", "hover", "select_move", "scroll", "tick"]),
            ("confirm", ["confirm", "select", "ok", "decide", "click", "accept", "enter"]),
            ("back", ["back", "cancel", "return", "close", "exit"]),
            ("open", ["open", "menu", "window", "popup"]),
            ("toggle", ["toggle", "switch", "option", "change"]),
            ("pick", ["pick", "add", "get", "item"]),
            ("star", ["star", "reward", "levelup", "level", "quest", "achievement", "unlock"]),
            ("error", ["error", "buzzer", "wrong", "deny", "invalid"]),
            ("slam", ["slam", "hit", "impact", "punch", "smash", "whoosh", "transition"]),
            ("boot", ["boot", "intro", "title", "opening", "startup"]),
            ("launch", ["launch", "start", "fight", "go", "battle"]),
        };
        var files = Directory.EnumerateFiles(folder)
            .Where(f => Regex.IsMatch(f, @"\.(wav|mp3|ogg|m4a|flac)$", RegexOptions.IgnoreCase))
            .Select(f => (file: f, name: Regex.Replace(Path.GetFileNameWithoutExtension(f).ToLowerInvariant(), @"[^a-z_]", "")))
            .ToList();
        foreach (var (ev, words) in aliases)
        {
            // Exact name first, then a name that starts with or contains one of the words.
            var hit = words.Select(w => files.FirstOrDefault(f => f.name == w)).FirstOrDefault(f => f.file != null);
            if (hit.file == null) hit = words.Select(w => files.FirstOrDefault(f => f.name.StartsWith(w))).FirstOrDefault(f => f.file != null);
            if (hit.file == null) hit = words.Select(w => files.FirstOrDefault(f => f.name.Contains(w))).FirstOrDefault(f => f.file != null);
            if (hit.file == null) continue;
            try
            {
                var dest = $"audio_{ev}_{Guid.NewGuid():N}{Path.GetExtension(hit.file).ToLowerInvariant()}";
                File.Copy(hit.file, Path.Combine(MediaDir, dest), overwrite: true);
                map[ev] = $"https://{MediaHost}/{dest}";
            }
            catch { }
        }
        return map;
    }

    void SendAppIcon() => Send(new JsonObject { ["type"] = "appIcon", ["url"] = appIconUrl });

    /// <summary>Turns a page image address (our media host, the app's own files, file:///) into a file on disk;
    /// "" when it is ours but missing, null when it lives on the internet.</summary>
    string? LocalImageFile(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return "";
        if (u.IsFile) return File.Exists(u.LocalPath) ? u.LocalPath : "";
        if (u.Host.Equals(MediaHost, StringComparison.OrdinalIgnoreCase))
        {
            var f = Path.Combine(MediaDir, Path.GetFileName(Uri.UnescapeDataString(u.AbsolutePath)));
            return File.Exists(f) ? f : "";
        }
        if (u.Host.Equals(AppHost, StringComparison.OrdinalIgnoreCase))
        {
            var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "wwwroot"));
            var f = Path.GetFullPath(Path.Combine(root, Uri.UnescapeDataString(u.AbsolutePath).TrimStart('/')));
            return f.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(f) ? f : "";
        }
        return u.Scheme is "http" or "https" ? null : "";
    }

    /// <summary>The apps the user named, found on this PC, for filling the bar the first time.</summary>
    JsonArray SeedApps()
    {
        var list = new JsonArray();
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        void Add(string name, string? target, string process, string? iconFrom = null, string args = "")
        {
            if (string.IsNullOrEmpty(target) || !File.Exists(target)) return;
            var key = "nexus_" + Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(target.ToLowerInvariant())), 0, 8).ToLowerInvariant();
            list.Add(new JsonObject
            {
                ["name"] = name, ["target"] = target, ["args"] = args, ["process"] = process,
                ["icon"] = ShellImage.SaveIcon(iconFrom != null && File.Exists(iconFrom) ? iconFrom : target, MediaDir, MediaHost, key),
            });
        }
        string? First(params string[] paths) => paths.FirstOrDefault(p => p != "" && File.Exists(p));
        string? Newest(string folder, string pattern, string exe)
        {
            try { return Directory.GetDirectories(folder, pattern).OrderByDescending(d => d).Select(d => Path.Combine(d, exe)).FirstOrDefault(File.Exists); }
            catch { return null; }
        }

        Add("Epic Games", First(Path.Combine(pf, @"Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe"),
            Path.Combine(pf86, @"Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe"),
            Path.Combine(pf86, @"Epic Games\Launcher\Portal\Binaries\Win32\EpicGamesLauncher.exe")), "EpicGamesLauncher");
        string? steam = null;
        try { steam = Microsoft.Win32.Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamExe", null)?.ToString()?.Replace('/', '\\'); } catch { }
        Add("Steam", First(steam ?? "", Path.Combine(pf86, @"Steam\steam.exe")), "steam");
        var discordDir = Path.Combine(local, "Discord");
        Add("Discord", Path.Combine(discordDir, "Update.exe"), "Discord", Newest(discordDir, "app-*", "Discord.exe"), "--processStart Discord.exe");
        Add("Medal", First(Path.Combine(local, @"Medal\Medal.exe"), Path.Combine(local, @"Medal\current\Medal.exe")), "Medal", Path.Combine(local, @"Medal\current\Medal.exe"));
        Add("Bloxstrap", Path.Combine(local, @"Bloxstrap\Bloxstrap.exe"), "Bloxstrap");
        return list;
    }

    // ---------- NEXUS desktop bar ----------

    /// <summary>Every bar: the main one first, then the extra bars, each with its own settings and items.</summary>
    IEnumerable<(string id, JsonObject bar)> Bars()
    {
        if (config?["nexus"] is JsonObject main)
        {
            yield return ("main", main);
            foreach (var b in (main["bars"] as JsonArray)?.OfType<JsonObject>() ?? [])
                if (b["id"]?.ToString() is { Length: > 0 } id) yield return (id, b);
        }
    }
    IEnumerable<JsonObject> ItemsOf(JsonObject bar) => (bar["items"] as JsonArray)?.OfType<JsonObject>() ?? [];
    IEnumerable<JsonObject> NexusItems() => Bars().SelectMany(b => ItemsOf(b.bar));
    static bool BarOn(JsonObject bar) { try { return bar["enabled"]?.GetValue<bool>() ?? false; } catch { return false; } }

    /// <summary>Opens a window for every bar that is switched on and closes the rest.</summary>
    async void EnsureDock()
    {
        if (mainEnv == null) return;
        var wanted = Bars().Where(b => BarOn(b.bar)).Select(b => b.id).ToHashSet();
        foreach (var id in docks.Keys.Where(id => !wanted.Contains(id)).ToList())
        {
            docks[id].Close();
            docks[id].Dispose();
            docks.Remove(id);
            dockSigs.Remove(id);
        }
        bool made = false;
        foreach (var id in wanted)
            if (!docks.ContainsKey(id)) { docks[id] = new DockForm(this, LocalImageFile, CacheDir) { Icon = Icon, BarId = id }; made = true; }
        if (made) await Task.Yield();
        WatchForeground();
        PushDock(force: true);
        EnsureWidgets();
        UpdateBarVisibility();
    }

    internal void OnDockMessage(JsonObject m)
    {
        var id = m["id"]?.ToString() ?? "";
        switch (m["type"]?.ToString())
        {
            case "open":
                OpenNexusItem(id, m["bar"]?.ToString() ?? "main");
                OpenedFromBar();
                break;
            case "manage":
                SetMode("home");
                Send(new JsonObject { ["type"] = "openNexus", ["bar"] = m["bar"]?.ToString() ?? "main" });
                break;
            case "remove":
            case "move":
                // The page owns the settings; let it make the change and save, which updates the bar.
                Send(new JsonObject { ["type"] = "nexusEdit", ["op"] = m["type"]?.ToString(), ["id"] = id, ["d"] = m["d"]?.DeepClone(), ["bar"] = m["bar"]?.ToString() ?? "main" });
                break;
            case "reveal":
                var target = NexusItems().FirstOrDefault(i => i["id"]?.ToString() == id)?["target"]?.ToString();
                if (target != null && File.Exists(target)) Process.Start("explorer.exe", $"/select,\"{target}\"")?.Dispose();
                break;
        }
    }

    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder name, int max);

    /// <summary>Brings an already running app to the front. False when it isn't running (or has no window).</summary>
    static bool FocusRunning(string process)
    {
        if (string.IsNullOrEmpty(process)) return false;
        foreach (var p in Process.GetProcessesByName(process))
        {
            using (p)
            {
                var h = p.MainWindowHandle;
                if (h == IntPtr.Zero) continue;
                if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
                SetForegroundWindow(h);
                return true;
            }
        }
        return false;
    }

    void OpenNexusItem(string id, string barId = "main")
    {
        var item = NexusItems().FirstOrDefault(i => i["id"]?.ToString() == id);
        if (item == null) return;
        // The icon's own click sound, played by the page (it keeps playing even while the launcher is hidden).
        if (item["sound"]?.ToString() is { Length: > 0 } sound) Send(new JsonObject { ["type"] = "playSound", ["url"] = sound });
        var kind = item["kind"]?.ToString();
        var target = item["target"]?.ToString() ?? "";
        // How it opens: the item's own choice, else the bar's (normal, maximized, minimized, or bring an open one forward).
        var bar = Bars().FirstOrDefault(b => b.id == barId).bar;
        var launch = item["launchMode"]?.ToString() is { Length: > 0 } own && own != "bar" ? own : bar?["launchMode"]?.ToString() ?? "normal";
        try
        {
            if (launch == "focus" && kind == "app" && FocusRunning(item["process"]?.ToString() ?? "")) return;
            if (kind == "home") SetMode("home");
            else if (kind == "game") TrayLaunch(item["gameId"]?.ToString() ?? "");
            else if (kind == "url")
            {
                if (Regex.IsMatch(target, @"^[a-z][a-z0-9+.-]*://", RegexOptions.IgnoreCase))
                    Process.Start(new ProcessStartInfo(target) { UseShellExecute = true })?.Dispose();
            }
            else
            {
                var psi = new ProcessStartInfo(target) { UseShellExecute = true, WindowStyle = launch switch { "maximized" => ProcessWindowStyle.Maximized, "minimized" => ProcessWindowStyle.Minimized, _ => ProcessWindowStyle.Normal } };
                var args = item["args"]?.ToString();
                if (!string.IsNullOrWhiteSpace(args)) psi.Arguments = args;
                if (File.Exists(target)) psi.WorkingDirectory = Path.GetDirectoryName(target)!;
                Process.Start(psi)?.Dispose();
            }
        }
        catch (Exception ex)
        {
            tray.ShowBalloonTip(4000, "Couldn't open " + item["name"], ex.Message, ToolTipIcon.Error);
        }
    }

    /// <summary>Sends each bar its items and which of them are running; only when something changed.</summary>
    void PushDock(bool force = false)
    {
        if (docks.Count == 0) return;
        HashSet<string>? live = null;
        foreach (var (id, bar) in Bars())
        {
            if (!docks.TryGetValue(id, out var d)) continue;
            var items = new JsonArray();
            foreach (var i in ItemsOf(bar))
            {
                bool on = false;
                var kind = i["kind"]?.ToString();
                if (kind == "game") on = running.Contains(i["gameId"]?.ToString() ?? "");
                else if (kind == "home") on = Visible && mode == "home";
                else if (i["process"]?.ToString() is { Length: > 0 } proc)
                {
                    live ??= LiveProcessNames();
                    on = live.Contains(proc);
                }
                var icon = i["icon"]?.ToString() ?? "";
                if (icon == "" && kind == "home") icon = appIconUrl;
                else if (icon == "" && kind == "app") icon = AutoIcon(i["target"]?.ToString() ?? "");
                items.Add(new JsonObject
                {
                    ["id"] = i["id"]?.DeepClone(), ["name"] = i["name"]?.DeepClone(),
                    ["icon"] = icon,
                    ["kind"] = kind, ["running"] = on,
                });
            }
            var settings = (JsonObject)bar.DeepClone();
            settings.Remove("items");
            settings.Remove("bars");
            var stateJson = new JsonObject { ["items"] = items, ["theme"] = config?["theme"]?.DeepClone(), ["settings"] = settings };
            var sig = stateJson.ToJsonString();
            if (!force && dockSigs.GetValueOrDefault(id) == sig) continue;
            dockSigs[id] = sig;
            d.SetState(stateJson);
        }
    }

    // Apps put on a bar without a picture (by hand in config.json, or when the icon couldn't be read at the time)
    // get the logo Windows shows for them: the program, the shortcut, or a shell folder such as the Recycle Bin.
    readonly Dictionary<string, string> autoIcons = new(StringComparer.OrdinalIgnoreCase);
    string AutoIcon(string target)
    {
        if (target == "") return "";
        if (autoIcons.TryGetValue(target, out var known)) return known;
        var path = Environment.ExpandEnvironmentVariables(target);
        // "calc.exe" and friends: the copy in System32.
        if (!path.Contains('\\') && !path.Contains(':')) path = Path.Combine(Environment.SystemDirectory, path);
        var key = "nexus_" + Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(target.ToLowerInvariant())), 0, 8).ToLowerInvariant();
        var url = ShellImage.SaveIcon(path, MediaDir, MediaHost, key);
        autoIcons[target] = url;
        return url;
    }

    static HashSet<string> LiveProcessNames()
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in Process.GetProcesses())
        {
            try { names.Add(p.ProcessName); } catch { }
            p.Dispose();
        }
        return names;
    }

    /// <summary>True while another program covers the whole screen (a game, a fullscreen video).</summary>
    bool SomethingFullscreen()
    {
        var front = GetForegroundWindow();
        if (front == IntPtr.Zero || front == Handle || docks.Values.Any(d => d.Handle == front) || !GetWindowRect(front, out var r)) return false;
        GetWindowThreadProcessId(front, out uint pid);
        try
        {
            using var owner = Process.GetProcessById((int)pid);
            if (owner.ProcessName is "explorer" or "SearchHost" or "ShellExperienceHost") return false;
        }
        catch { return false; }
        var screen = Screen.FromHandle(front).Bounds;
        return r.Left <= screen.Left && r.Top <= screen.Top && r.Right >= screen.Right && r.Bottom >= screen.Bottom;
    }

    // The desktop itself is in front: what "desktop only" bars wait for.
    static readonly HashSet<string> DesktopClasses = new(StringComparer.OrdinalIgnoreCase) { "Progman", "WorkerW" };
    // The taskbar and its pop-ups. Having one of these in front does NOT mean the desktop is showing: pressing (or
    // holding) a taskbar button gives the taskbar the focus while the app window is still on screen. So for these we
    // look at what is actually open instead (this was what made the desktop bar flash up and fade out again).
    static readonly HashSet<string> ShellClasses = new(StringComparer.OrdinalIgnoreCase)
        { "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow", "TopLevelWindowForOverflowXamlIsland", "XamlExplorerHostIslandWindow" };
    static bool IsShellClass(string name) => DesktopClasses.Contains(name) || ShellClasses.Contains(name);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
    delegate bool EnumProc(IntPtr hWnd, IntPtr param);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong32(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowTextLengthW")] static extern int GetTitleLength(IntPtr hWnd);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int value, int size);

    /// <summary>A real app window someone would be looking at: shown, not minimized, not hidden by Windows
    /// (cloaked), not a tool window or a pop-up owned by another window, and with a title.</summary>
    bool IsAppWindow(IntPtr h)
    {
        if (!IsWindowVisible(h) || IsIconic(h) || GetTitleLength(h) == 0) return false;
        if (GetWindow(h, 4 /* GW_OWNER */) != IntPtr.Zero) return false;
        int ex = GetWindowLong32(h, -20 /* GWL_EXSTYLE */);
        if ((ex & 0x80 /* WS_EX_TOOLWINDOW */) != 0) return false;
        // Click-through and never-focused windows are overlays (Discord, Medal, GeForce, Steam...), not something
        // covering the desktop. They used to keep desktop-only bars hidden until you clicked the desktop.
        if ((ex & 0x20 /* WS_EX_TRANSPARENT */) != 0 || (ex & 0x08000000 /* WS_EX_NOACTIVATE */) != 0) return false;
        if (DwmGetWindowAttribute(h, 14 /* DWMWA_CLOAKED */, out int cloaked, 4) == 0 && cloaked != 0) return false;
        if (docks.Values.Any(d => d.Handle == h) || widgetForms.Values.Any(w => w.Handle == h)) return false;
        if (h == Handle && mode != "home") return false; // the mini widget doesn't cover the desktop
        var name = new System.Text.StringBuilder(256);
        GetClassName(h, name, name.Capacity);
        if (IsShellClass(name.ToString())) return false;
        if (!GetWindowRect(h, out var r) || r.Right - r.Left <= 120 || r.Bottom - r.Top <= 80) return false;
        // Only windows on the screen the bars live on count: an app open on a second monitor shouldn't stop the
        // desktop dock from showing on this one. Windows parked off-screen don't count either.
        var screen = (Screen.PrimaryScreen ?? Screen.AllScreens[0]).Bounds;
        int w = Math.Min(r.Right, screen.Right) - Math.Max(r.Left, screen.Left);
        int hgt = Math.Min(r.Bottom, screen.Bottom) - Math.Max(r.Top, screen.Top);
        return w > 120 && hgt > 80;
    }

    /// <summary>True when the desktop is what you see: it (or the taskbar) has the focus, the window in front was
    /// just minimized, or no app window is open at all (everything minimized or closed).</summary>
    bool DesktopInFront()
    {
        var front = GetForegroundWindow();
        if (front == IntPtr.Zero || docks.Values.Any(d => d.Handle == front) || widgetForms.Values.Any(w => w.Handle == front)) return !AnyAppWindow();
        var name = new System.Text.StringBuilder(256);
        GetClassName(front, name, name.Capacity);
        if (DesktopClasses.Contains(name.ToString())) return true;
        // The taskbar, a minimized or hidden window, anything else: the desktop shows only if nothing is open over it.
        return !AnyAppWindow();
    }

    bool AnyAppWindow()
    {
        bool any = false;
        EnumWindows((h, _) => { if (IsAppWindow(h)) { any = true; return false; } return true; }, IntPtr.Zero);
        return any;
    }

    /// <summary>Shows or hides each bar for what is in front right now (desktop-only bars, fullscreen games).</summary>
    void UpdateBarVisibility()
    {
        // A window change can still come in while the launcher is closing.
        if (IsDisposed || Disposing || quitting) return;
        bool? full = null, desk = null;
        bool opening = DateTime.Now < openingUntil;
        foreach (var (id, bar) in Bars())
        {
            if (!docks.TryGetValue(id, out var d)) continue;
            bool hideInGame = true;
            try { hideInGame = bar["hideFullscreen"]?.GetValue<bool>() ?? true; } catch { }
            var vis = bar["visibility"]?.ToString() ?? "always";
            // "desktop": only on the desktop. "apps": everywhere except the desktop (where the desktop bars take over).
            bool hide = (hideInGame && (full ??= SomethingFullscreen()))
                || (vis == "desktop" && (opening || !(desk ??= DesktopInFront())))
                || (vis == "apps" && (desk ??= DesktopInFront()));
            d.Suppress(hide);
        }
        LayoutGroups();
        // Widgets follow the same rules: "desktop" ones only show on the desktop.
        foreach (var w in WidgetConfigs())
        {
            if (!widgetForms.TryGetValue(w["id"]?.ToString() ?? "", out var f)) continue;
            var vis = w["visibility"]?.ToString() ?? "desktop";
            f.Suppress((vis == "desktop" && !(desk ??= DesktopInFront())) || (full ??= SomethingFullscreen()) && vis != "always");
        }
    }

    /// <summary>Bars that share an edge (and are showing) sit side by side in the middle with a gap; when they
    /// don't all fit, they all shrink by the same amount. A bar that hides frees its room for the others.</summary>
    string groupSig = "";
    void LayoutGroups()
    {
        var sig = new System.Text.StringBuilder();
        foreach (var edge in docks.Values.Where(d => d.Grouped).GroupBy(d => d.Edge))
        {
            var shown = edge.Where(d => !d.Hidden).ToList();
            foreach (var d in edge.Where(d => d.Hidden)) { d.AlongStart = null; d.SizeFactor = 1; }
            if (shown.Count < 2) { foreach (var d in shown) if (d.AlongStart != null || d.SizeFactor != 1) { d.AlongStart = null; d.SizeFactor = 1; d.Relayout(); } continue; }
            // Packed by what you see of each bar (not its window, which keeps clear room on both ends for logos
            // that grow on hover), so the bars sit right next to each other in the middle as one row.
            int gap = 14, span = shown[0].EdgeLength;
            var lengths = shown.Select(d => d.LengthsAt(1)).ToList();
            float total = lengths.Sum(x => x.visible) + gap * (shown.Count - 1), factor = Math.Min(1f, (span - 40) / Math.Max(1f, total));
            if (factor < 1) { lengths = shown.Select(d => d.LengthsAt(factor)).ToList(); total = lengths.Sum(x => x.visible) + gap * (shown.Count - 1); }
            int at = (int)((span - total) / 2);
            for (int i = 0; i < shown.Count; i++)
            {
                var d = shown[i];
                int start = at - (lengths[i].window - lengths[i].visible) / 2;
                sig.Append(d.BarId).Append(':').Append(start).Append(':').Append(factor.ToString("0.000")).Append('|');
                if (d.AlongStart != start || Math.Abs(d.SizeFactor - factor) > 0.001f) { d.AlongStart = start; d.SizeFactor = factor; d.Relayout(); }
                at += lengths[i].visible + gap;
            }
        }
        groupSig = sig.ToString();
    }

    // Windows says the moment another window comes to the front (clicking the launcher, opening an app), so
    // desktop-only bars hide straight away instead of on the next 3-second check.
    delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint thread, uint time);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc proc, uint pid, uint thread, uint flags);
    WinEventProc? foregroundProc;
    IntPtr foregroundHook, minimizeHook;
    DateTime openingUntil = DateTime.MinValue;
    readonly System.Windows.Forms.Timer barRecheck = new() { Interval = 350 };
    void WatchForeground()
    {
        if (foregroundHook != IntPtr.Zero) return;
        // Windows changes its mind a few times while a window minimizes or closes, so look again a moment later too.
        barRecheck.Tick += (_, _) => { barRecheck.Stop(); if (docks.Count > 0 || widgetForms.Count > 0) UpdateBarVisibility(); };
        foregroundProc = (_, _, _, _, _, _, _) =>
        {
            if (docks.Count == 0 && widgetForms.Count == 0) return;
            UpdateBarVisibility();
            barRecheck.Stop(); barRecheck.Start();
        };
        foregroundHook = SetWinEventHook(3 /* EVENT_SYSTEM_FOREGROUND */, 3, IntPtr.Zero, foregroundProc, 0, 0, 0 /* out of context */);
        minimizeHook = SetWinEventHook(0x16 /* EVENT_SYSTEM_MINIMIZESTART */, 0x17 /* MINIMIZEEND */, IntPtr.Zero, foregroundProc, 0, 0, 0);
        // Closing the last window often leaves nothing in front, and Windows sends no event for that. Rather than
        // waiting for the 3-second check (or for you to click the desktop), look twice a second while any bar
        // depends on the desktop.
        barWatch.Tick += (_, _) =>
        {
            if (docks.Count > 0 && Bars().Any(b => BarOn(b.bar) && (b.bar["visibility"]?.ToString() ?? "always") != "always"))
                UpdateBarVisibility();
        };
        barWatch.Start();
    }
    readonly System.Windows.Forms.Timer barWatch = new() { Interval = 500 };

    /// <summary>Something was opened from a bar: desktop-only bars fade away now, before its window appears.
    /// If nothing comes to the front after a few seconds, they come back.</summary>
    void OpenedFromBar()
    {
        // Long enough for slower apps (Steam, Epic, games) to put up a window, so the bar doesn't come back and
        // then fade out again when the window finally shows.
        openingUntil = DateTime.Now.AddSeconds(7);
        UpdateBarVisibility();
        var back = new System.Windows.Forms.Timer { Interval = 7100 };
        back.Tick += (_, _) => { back.Stop(); back.Dispose(); UpdateBarVisibility(); };
        back.Start();
    }

    void PollExtras()
    {
        if (docks.Count > 0)
        {
            UpdateBarVisibility();
            PushDock();
        }
        _ = UpdatePresence();
    }

    // ---------- Start menu apps (for adding to the bar) ----------

    Task StartMenuApps()
    {
        var done = new TaskCompletionSource<JsonArray>();
        var worker = new Thread(() =>
        {
            var list = new JsonArray();
            try
            {
                var shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic? shell = shellType == null ? null : Activator.CreateInstance(shellType);
                var folders = new[]
                {
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                }.Where(Directory.Exists).Distinct();
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var folder in folders)
                    foreach (var lnk in Directory.EnumerateFiles(folder, "*.lnk", SearchOption.AllDirectories))
                    {
                        var name = Path.GetFileNameWithoutExtension(lnk);
                        if (Regex.IsMatch(name, @"uninstall|readme|help|website|documentation|release notes", RegexOptions.IgnoreCase) || !seen.Add(name)) continue;
                        string process = "";
                        try
                        {
                            string target = shell?.CreateShortcut(lnk).TargetPath ?? "";
                            if (target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) process = Path.GetFileNameWithoutExtension(target);
                        }
                        catch { }
                        var key = "nexus_" + Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(lnk.ToLowerInvariant())), 0, 8).ToLowerInvariant();
                        list.Add(new JsonObject
                        {
                            ["name"] = name, ["path"] = lnk, ["process"] = process,
                            ["icon"] = ShellImage.SaveIcon(lnk, MediaDir, MediaHost, key),
                        });
                    }
            }
            catch { }
            done.TrySetResult(list);
        }) { IsBackground = true };
        worker.SetApartmentState(ApartmentState.STA);
        worker.Start();
        return done.Task.ContinueWith(t => BeginInvoke(() =>
            Send(new JsonObject { ["type"] = "startMenu", ["apps"] = new JsonArray(t.Result.OrderBy(a => a?["name"]?.ToString()).Select(a => a!.DeepClone()).ToArray()) })));
    }

    // ---------- Discord Rich Presence ----------

    string Fill(string? template, JsonObject? game)
    {
        var text = template ?? "";
        var gameName = game?["name"]?.ToString() ?? "";
        var platform = game?["platform"]?.ToString() switch { "epic" => "Epic Games", "steam" => "Steam", "roblox" => "Roblox", null => "", _ => "PC" };
        string account = "";
        if (game?["platform"]?.ToString() == "epic")
            account = (config?["epic"]?["accounts"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(a => a["id"]?.ToString() == EpicCurrent())?["name"]?.ToString() ?? "";
        var song = LastTrack?["title"]?.ToString() ?? "";
        var artist = LastTrack?["artist"]?.ToString() ?? "";
        text = text.Replace("{song}", song).Replace("{artist}", artist).Replace("{time}", DateTime.Now.ToString("HH:mm"));
        return text.Replace("{game}", gameName).Replace("{platform}", platform).Replace("{account}", account)
            .Replace("{count}", Games().Count().ToString()).Replace("{profile}", config?["profile"]?["name"]?.ToString() ?? "")
            .Trim();
    }

    static string? Clip(string text, int max) => string.IsNullOrWhiteSpace(text) ? null : text.Length <= max ? (text.Length < 2 ? text + " " : text) : text[..max];

    async Task UpdatePresence(bool force = false)
    {
        var d = config?["discord"];
        bool on = false;
        try { on = d?["enabled"]?.GetValue<bool>() ?? false; } catch { }
        var clientId = d?["clientId"]?.ToString()?.Trim() ?? "";
        if (!on || !Regex.IsMatch(clientId, @"^\d{15,22}$"))
        {
            if (discord.Connected) { discord.SetActivity(null); discord.Close(); }
            var status = !on ? "Off" : "Add your Discord Application ID";
            if (status != discord.Status || force) Send(new JsonObject { ["type"] = "discordStatus", ["status"] = status });
            presenceSignature = "";
            return;
        }
        discord.StatusChanged ??= s => { try { BeginInvoke(() => Send(new JsonObject { ["type"] = "discordStatus", ["status"] = s })); } catch { } };
        if (!discord.Connected || discord.ClientId != clientId)
        {
            if ((DateTime.Now - lastDiscordTry).TotalSeconds < 15 && !force) return;
            lastDiscordTry = DateTime.Now;
            await discord.Connect(clientId);
            Send(new JsonObject { ["type"] = "discordStatus", ["status"] = discord.Status });
            presenceSignature = "";
            if (!discord.Connected) return;
        }

        // The game shown is the one running longest; with nothing running, the launcher's own idle status.
        var playing = Games().Where(g => running.Contains(g["id"]?.ToString() ?? ""))
            .OrderBy(g => runningSince.GetValueOrDefault(g["id"]?.ToString() ?? "", DateTime.Now)).FirstOrDefault();
        bool idle = true;
        try { idle = d?["idle"]?.GetValue<bool>() ?? true; } catch { }
        JsonObject? activity = null;
        if (playing != null || idle)
        {
            // A game can have its own presence (Discord settings → per game); it wins over the general lines.
            var own = playing != null ? d?["perGame"]?[playing["id"]?.ToString() ?? ""] as JsonObject : null;
            // A line you cleared on purpose stays empty; only a setting that was never saved uses the default.
            string Get(string key, string fallback) => own != null && own.ContainsKey(key) && own[key]?.ToString() is { Length: > 0 } ov ? ov
                : d is JsonObject o && o.ContainsKey(key) ? o[key]?.ToString() ?? "" : fallback;
            // Lines with | in them take turns: "LOCKED IN | GRINDING | ONE MORE GAME".
            int every = 15;
            try { every = Math.Clamp(d?["rotateEvery"]?.GetValue<int>() ?? 15, 6, 600); } catch { }
            long turn = DateTimeOffset.Now.ToUnixTimeSeconds() / every;
            string Turn(string s) { var parts = s.Split('|').Select(x => x.Trim()).Where(x => x != "").ToArray(); return parts.Length <= 1 ? s : parts[turn % parts.Length]; }
            activity = new JsonObject
            {
                ["details"] = Clip(Fill(Turn(playing != null ? Get("details", "Playing {game}") : Get("idleDetails", "In the launcher")), playing), 128),
                ["state"] = Clip(Fill(Turn(playing != null ? Get("state", "on {platform}") : Get("idleState", "{count} games ready")), playing), 128),
            };
            // What Discord says you are doing: Playing, Listening to, Watching or Competing in.
            try { if (d?["activityType"]?.GetValue<int>() is int type && type is 2 or 3 or 5) activity["type"] = type; } catch { }
            int partySize = 0, partyMax = 0;
            try { partySize = d?["partySize"]?.GetValue<int>() ?? 0; partyMax = d?["partyMax"]?.GetValue<int>() ?? 0; } catch { }
            if (partyMax > 0) activity["party"] = new JsonObject { ["id"] = "skyvaint", ["size"] = new JsonArray(Math.Clamp(partySize, 1, partyMax), partyMax) };
            bool elapsed = true;
            try { elapsed = d?["elapsed"]?.GetValue<bool>() ?? true; } catch { }
            if (elapsed)
            {
                var since = playing != null ? runningSince.GetValueOrDefault(playing["id"]?.ToString() ?? "", DateTime.Now) : launchedAt;
                activity["timestamps"] = new JsonObject { ["start"] = new DateTimeOffset(since).ToUnixTimeSeconds() };
            }
            var assets = new JsonObject();
            void Asset(string key, string field) { if (Clip(Fill(Turn(Get(field, "")), playing), 256) is { } v) assets[key] = v; }
            Asset("large_image", "largeImage"); Asset("large_text", "largeText"); Asset("small_image", "smallImage"); Asset("small_text", "smallText");
            if (assets.Count > 0) activity["assets"] = assets;
            var buttons = new JsonArray();
            foreach (var n in new[] { "1", "2" })
            {
                var label = Fill(d?["button" + n + "Label"]?.ToString(), playing);
                var link = d?["button" + n + "Url"]?.ToString() ?? "";
                if (label != "" && Regex.IsMatch(link, @"^https?://", RegexOptions.IgnoreCase))
                    buttons.Add(new JsonObject { ["label"] = label.Length > 32 ? label[..32] : label, ["url"] = link });
            }
            if (buttons.Count > 0) activity["buttons"] = buttons;
            // Discord rejects the whole activity if a line is sent as null, so empty lines are left out.
            foreach (var key in activity.Where(kv => kv.Value == null).Select(kv => kv.Key).ToList()) activity.Remove(key);
        }
        var sig = activity?.ToJsonString() ?? "clear";
        if (sig == presenceSignature && !force) return;
        presenceSignature = sig;
        discord.SetActivity(activity);
        if (!discord.Connected) Send(new JsonObject { ["type"] = "discordStatus", ["status"] = discord.Status });
    }

    readonly DateTime launchedAt = DateTime.Now;

    // ---------- clips: press the recorder's hotkey for you ----------

    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    /// <summary>Presses a shortcut like "Win+Alt+G" or "Alt+F10" (Game Bar, Medal, ShadowPlay, OBS…).</summary>
    static void SendHotkey(string keys)
    {
        var vks = new List<byte>();
        foreach (var part in keys.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var p = part.ToUpperInvariant();
            byte? vk = p switch
            {
                "CTRL" or "CONTROL" => 0x11, "ALT" => 0x12, "SHIFT" => 0x10, "WIN" or "WINDOWS" => 0x5B, "PRTSC" or "PRINTSCREEN" or "PRINT" => 0x2C,
                "HOME" => 0x24, "END" => 0x23, "INSERT" or "INS" => 0x2D, "DELETE" or "DEL" => 0x2E, "PAGEUP" => 0x21, "PAGEDOWN" => 0x22, "SPACE" => 0x20,
                _ when p.Length > 1 && p[0] == 'F' && int.TryParse(p[1..], out var f) && f is >= 1 and <= 24 => (byte)(0x6F + f),
                _ when p.Length == 1 && char.IsLetterOrDigit(p[0]) => (byte)p[0],
                _ => null,
            };
            if (vk.HasValue) vks.Add(vk.Value);
        }
        if (vks.Count == 0) return;
        foreach (var vk in vks) keybd_event(vk, 0, 0, UIntPtr.Zero);
        for (int i = vks.Count - 1; i >= 0; i--) keybd_event(vks[i], 0, 2, UIntPtr.Zero);
    }

    void TrackRunningSince(HashSet<string> now)
    {
        foreach (var id in now) if (!runningSince.ContainsKey(id)) runningSince[id] = DateTime.Now;
        foreach (var id in runningSince.Keys.Where(k => !now.Contains(k)).ToList()) runningSince.Remove(id);
    }

    // ---------- DISCOVER ----------

    async Task Discover(bool fresh)
    {
        if (!fresh && discoverCache != null && (DateTime.Now - discoverAt).TotalMinutes < 10)
        {
            Send(discoverCache.DeepClone().AsObject());
            return;
        }
        var epic = Task.Run(DiscoverEpic);
        var steam = Task.Run(DiscoverSteam);
        var roblox = Task.Run(DiscoverRoblox);
        var reply = new JsonObject { ["type"] = "discover" };
        try { reply["epic"] = await epic; } catch { reply["epic"] = new JsonArray(); }
        try { reply["steam"] = await steam; } catch { reply["steam"] = new JsonObject(); }
        try { reply["roblox"] = await roblox; } catch { reply["roblox"] = new JsonObject(); }
        discoverCache = reply;
        discoverAt = DateTime.Now;
        Send(reply.DeepClone().AsObject());
    }

    // Roblox's public APIs answer 429 (too many requests) or a 5xx now and then, which used to turn into missing art,
    // blank rows or "couldn't reach Roblox". Those get a few tries with a growing pause; anything else fails at once.
    static Task<JsonNode?> GetJson(string url) => GetJsonWith(Web, url);

    internal static async Task<JsonNode?> GetJsonWith(HttpClient http, string url, int tries = 4)
    {
        for (int attempt = 1; ; attempt++)
        {
            HttpResponseMessage? resp = null;
            try
            {
                resp = await http.GetAsync(url);
                int code = (int)resp.StatusCode;
                if (resp.IsSuccessStatusCode) return JsonNode.Parse(await resp.Content.ReadAsStringAsync());
                if (attempt >= tries || (code != 429 && code < 500)) resp.EnsureSuccessStatusCode();
                var wait = resp.Headers.RetryAfter?.Delta ?? TimeSpan.FromMilliseconds(700 * Math.Pow(2, attempt - 1));
                await Task.Delay(wait > TimeSpan.FromSeconds(8) ? TimeSpan.FromSeconds(8) : wait);
            }
            catch (TaskCanceledException) when (attempt < tries) { await Task.Delay(600 * attempt); }
            catch (HttpRequestException ex) when (attempt < tries && ex.StatusCode == null) { await Task.Delay(600 * attempt); } // network blip
            finally { resp?.Dispose(); }
        }
    }

    static async Task<JsonArray> DiscoverEpic()
    {
        var list = new JsonArray();
        var data = await GetJson("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US");
        foreach (var e in (data?["data"]?["Catalog"]?["searchStore"]?["elements"] as JsonArray)?.OfType<JsonObject>() ?? [])
        {
            JsonObject? Free(string key) => (e["promotions"]?[key] as JsonArray)?.OfType<JsonObject>()
                .SelectMany(p => (p["promotionalOffers"] as JsonArray)?.OfType<JsonObject>() ?? [])
                .FirstOrDefault(o => o["discountSetting"]?["discountPercentage"]?.GetValue<int>() == 0);
            var now = Free("promotionalOffers");
            var soon = now == null ? Free("upcomingPromotionalOffers") : null;
            if (now == null && soon == null) continue;
            string Image(params string[] kinds) => kinds.Select(k => (e["keyImages"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(i => i["type"]?.ToString() == k)?["url"]?.ToString()).FirstOrDefault(u => !string.IsNullOrEmpty(u)) ?? "";
            var slug = (e["offerMappings"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault()?["pageSlug"]?.ToString()
                ?? (e["catalogNs"]?["mappings"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault()?["pageSlug"]?.ToString() ?? e["productSlug"]?.ToString() ?? "";
            DateTime.TryParse((now ?? soon)!["endDate"]?.ToString(), out var end);
            DateTime.TryParse(soon?["startDate"]?.ToString(), out var start);
            list.Add(new JsonObject
            {
                ["title"] = e["title"]?.ToString(),
                ["image"] = Image("OfferImageWide", "DieselStoreFrontWide", "Thumbnail", "OfferImageTall"),
                ["tall"] = Image("OfferImageTall", "Thumbnail"),
                ["sub"] = now != null ? $"FREE NOW · UNTIL {end:MMM d}".ToUpperInvariant() : $"FREE FROM {start:MMM d}".ToUpperInvariant(),
                ["now"] = now != null,
                ["url"] = slug != "" ? $"https://store.epicgames.com/p/{slug}" : "https://store.epicgames.com/free-games",
            });
        }
        return list;
    }

    static async Task<JsonObject> DiscoverSteam()
    {
        var data = await GetJson("https://store.steampowered.com/api/featuredcategories?cc=us&l=en");
        JsonArray Take(string key) => new((data?[key]?["items"] as JsonArray)?.OfType<JsonObject>()
            .GroupBy(i => i["id"]?.ToString()).Select(g => g.First())
            .Select(i =>
            {
                int discount = 0;
                try { discount = i["discount_percent"]?.GetValue<int>() ?? 0; } catch { }
                long price = 0;
                try { price = i["final_price"]?.GetValue<long>() ?? 0; } catch { }
                return (JsonNode)new JsonObject
                {
                    ["title"] = i["name"]?.ToString(),
                    ["image"] = i["large_capsule_image"]?.ToString() ?? i["header_image"]?.ToString(),
                    ["sub"] = (discount > 0 ? $"-{discount}% · " : "") + (price == 0 ? "FREE" : $"${price / 100.0:0.00}"),
                    ["url"] = $"https://store.steampowered.com/app/{i["id"]}",
                    ["steam"] = $"steam://store/{i["id"]}",
                };
            }).ToArray() ?? []);
        return new JsonObject { ["top"] = Take("top_sellers"), ["specials"] = Take("specials"), ["new"] = Take("new_releases") };
    }

    static async Task<JsonObject> DiscoverRoblox()
    {
        var data = await GetJson("https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=skyvaint&device=computer&country=all");
        var result = new JsonObject();
        var universes = new List<long>();
        var sorts = (data?["sorts"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
        foreach (var (key, sortId) in new[] { ("trending", "top-trending"), ("rising", "up-and-coming"), ("playing", "top-playing-now") })
        {
            var games = (sorts.FirstOrDefault(s => s["sortId"]?.ToString() == sortId)?["games"] as JsonArray)?.OfType<JsonObject>().Take(24).ToList() ?? [];
            result[key] = new JsonArray(games.Select(g =>
            {
                long up = 0, down = 0, players = 0, uni = 0;
                try { up = g["totalUpVotes"]?.GetValue<long>() ?? 0; down = g["totalDownVotes"]?.GetValue<long>() ?? 0; players = g["playerCount"]?.GetValue<long>() ?? 0; uni = g["universeId"]?.GetValue<long>() ?? 0; } catch { }
                universes.Add(uni);
                var liked = up + down > 0 ? $" · {100 * up / (up + down)}% LIKED" : "";
                return (JsonNode)new JsonObject
                {
                    ["title"] = g["name"]?.ToString(), ["universeId"] = uni, ["placeId"] = g["rootPlaceId"]?.DeepClone(),
                    ["sub"] = $"{players:N0} PLAYING{liked}", ["url"] = $"https://www.roblox.com/games/{g["rootPlaceId"]}", ["image"] = "",
                    ["playing"] = players, ["upVotes"] = up, ["downVotes"] = down,
                };
            }).ToArray());
        }
        // Game icons, fetched in batches.
        var icons = new Dictionary<long, string>();
        foreach (var batch in universes.Distinct().Where(u => u > 0).Chunk(50))
        {
            try
            {
                var thumbs = await GetJson($"https://thumbnails.roblox.com/v1/games/icons?universeIds={string.Join(',', batch)}&size=512x512&format=Png&isCircular=false");
                foreach (var t in (thumbs?["data"] as JsonArray)?.OfType<JsonObject>() ?? [])
                    if (t["state"]?.ToString() == "Completed") icons[t["targetId"]!.GetValue<long>()] = t["imageUrl"]!.ToString();
            }
            catch { }
        }
        foreach (var list in result.Select(kv => kv.Value).OfType<JsonArray>())
            foreach (var g in list.OfType<JsonObject>())
                if (icons.TryGetValue(g["universeId"]!.GetValue<long>(), out var url)) g["image"] = url;
        return result;
    }
}

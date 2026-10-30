using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Skyvaint;

// Budokai Tenkaichi: the page's picker (emulator, game file or mod, then solo / join a friend / host) asks the
// shell to find PCSX2 and Dolphin, list your game files, and start the game, including Dolphin NetPlay.
public sealed partial class MainForm
{
    string? pcsx2Found, dolphinFound;

    bool OnBudokaiMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "budokaiScan": _ = BudokaiScan(m); return true;
            case "budokaiPlay": _ = BudokaiPlay(m); return true;
            case "budokaiUnzip": _ = BudokaiUnzip(m["path"]?.ToString() ?? "", m["token"]?.ToString() ?? ""); return true;
            case "budokaiParsec": BudokaiParsec(m); return true;
        }
        return false;
    }

    static IEnumerable<string> Strings(JsonNode? n) => (n as JsonArray)?.Select(x => x?.ToString() ?? "").Where(x => x != "") ?? [];

    async Task BudokaiScan(JsonObject m)
    {
        var reply = new JsonObject { ["type"] = "budokaiState" };
        try
        {
            var r = await Task.Run(() =>
            {
                var pcsx2 = Emulators.FindPcsx2(m["pcsx2"]?.ToString());
                var dolphin = Emulators.FindDolphin(m["dolphin"]?.ToString());
                // Your folders, plus the usual places game files end up.
                string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var folders = Strings(m["folders"]).ToList();
                foreach (var d in new[] { Path.Combine(home, "Downloads"), Path.Combine(home, "Desktop"), Path.Combine(home, "OneDrive", "Desktop"), Path.Combine(home, "Documents", "PCSX2", "games"), Path.Combine(home, "OneDrive", "Documents", "PCSX2", "games") })
                    if (Directory.Exists(d)) folders.Add(d);
                if (dolphin != null) folders.Add(Path.GetDirectoryName(dolphin)!);
                var files = Emulators.ScanFiles(folders, Strings(m["files"]));
                return (pcsx2, dolphin, files);
            });
            pcsx2Found = r.pcsx2; dolphinFound = r.dolphin;
            reply["ok"] = true;
            reply["pcsx2"] = r.pcsx2 ?? "";
            reply["dolphin"] = r.dolphin ?? "";
            reply["found"] = r.files;
        }
        catch (Exception ex) { reply["ok"] = false; reply["error"] = ex.Message; }
        Send(reply);
    }

    /// <summary>Unpacks the game file out of a .zip (next to it, in a folder of the same name), so an emulator can
    /// open it. Progress goes to the page as budokaiUnzip messages.</summary>
    /// <summary>Unpacks the game out of an archive (zip, 7z or rar), next to it in a folder of the same name, so an
    /// emulator can open it, and returns the game file inside. Progress goes to the page as budokaiUnzip messages.</summary>
    async Task BudokaiUnzip(string archivePath, string token)
    {
        var reply = new JsonObject { ["type"] = "budokaiUnzipped", ["token"] = token };
        void Pct(long pct) => BeginInvoke(() => Send(new JsonObject { ["type"] = "budokaiUnzip", ["token"] = token, ["pct"] = pct }));
        try
        {
            reply["path"] = await Task.Run(() =>
            {
                var dir = Path.Combine(Path.GetDirectoryName(archivePath)!, Path.GetFileNameWithoutExtension(archivePath));
                if (archivePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) return UnzipGame(archivePath, dir, Pct);
                return UnpackWithTar(archivePath, dir, Pct);
            });
            reply["ok"] = true;
        }
        catch (Exception ex) { reply["ok"] = false; reply["error"] = ex.Message; }
        Send(reply);
    }

    static string UnzipGame(string zip, string dir, Action<long> pct)
    {
        using var archive = System.IO.Compression.ZipFile.OpenRead(zip);
        var entry = archive.Entries.Where(e => Emulators.KindOfName(e.FullName)).OrderByDescending(e => e.Length).FirstOrDefault()
            ?? throw new Exception("There is no game file in that zip.");
        Directory.CreateDirectory(dir);
        var dest = Path.Combine(dir, Path.GetFileName(entry.FullName));
        if (File.Exists(dest) && new FileInfo(dest).Length == entry.Length) return dest;
        // Everything else in the zip (patches, save files, readme) comes out too, next to the game.
        foreach (var other in archive.Entries.Where(e => e != entry && e.Length > 0 && e.Length < 200_000_000))
        {
            try { var p = Path.GetFullPath(Path.Combine(dir, other.FullName)); if (p.StartsWith(Path.GetFullPath(dir), StringComparison.OrdinalIgnoreCase)) { Directory.CreateDirectory(Path.GetDirectoryName(p)!); if (!File.Exists(p)) System.IO.Compression.ZipFileExtensions.ExtractToFile(other, p); } } catch { }
        }
        var part = dest + ".part";
        using (var src = entry.Open())
        using (var outp = File.Create(part))
        {
            var buf = new byte[1 << 20];
            long doneBytes = 0, last = -1;
            int n;
            while ((n = src.Read(buf, 0, buf.Length)) > 0)
            {
                outp.Write(buf, 0, n);
                doneBytes += n;
                long p = entry.Length > 0 ? doneBytes * 100 / entry.Length : 0;
                if (p != last) { last = p; pct(p); }
            }
        }
        File.Move(part, dest, true);
        return dest;
    }

    /// <summary>7z and rar: Windows 11's own tar unpacks them. Progress is guessed from how much has come out.</summary>
    static string UnpackWithTar(string archive, string dir, Action<long> pct)
    {
        var tar = Path.Combine(Environment.SystemDirectory, "tar.exe");
        if (!File.Exists(tar)) throw new Exception("This Windows can't unpack that kind of archive. Use a .zip, or unpack it with 7-Zip.");
        string? Found() => Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).Where(f => Emulators.KindOfName(f) && !f.EndsWith(".part")).OrderByDescending(f => new FileInfo(f).Length).FirstOrDefault() : null;
        var done = Found();
        if (done != null && new FileInfo(done).Length > 50_000_000) { var marker = Path.Combine(dir, ".unpacked"); if (File.Exists(marker)) return done; }
        Directory.CreateDirectory(dir);
        long size = new FileInfo(archive).Length;
        using var p = Process.Start(new ProcessStartInfo(tar, $"-xf \"{archive}\" -C \"{dir}\"") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true })
            ?? throw new Exception("Couldn't start unpacking.");
        var err = p.StandardError.ReadToEndAsync();
        while (!p.WaitForExit(700))
        {
            try { long got = Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).Sum(f => new FileInfo(f).Length); pct(Math.Min(99, got * 100 / Math.Max(1, size * 2))); } catch { }
        }
        if (p.ExitCode != 0) throw new Exception("Unpacking failed: " + (err.Result.Split('\n').FirstOrDefault(l => l.Trim() != "") ?? "unknown error").Trim());
        var game = Found() ?? throw new Exception("There is no game file in that archive.");
        File.WriteAllText(Path.Combine(dir, ".unpacked"), DateTime.Now.ToString("o"));
        pct(100);
        return game;
    }

    /// <summary>Parsec: "prepare" opens Parsec and makes your friend's controller player 2 in PCSX2;
    /// "join" opens a friend's Parsec link; "open" just brings Parsec up.</summary>
    void BudokaiParsec(JsonObject m)
    {
        var reply = new JsonObject { ["type"] = "budokaiParsecState", ["action"] = m["action"]?.ToString() ?? "" };
        var parsec = Emulators.FindParsec();
        reply["found"] = parsec != null;
        try
        {
            switch (m["action"]?.ToString())
            {
                case "check": break;
                case "prepare":
                case "open":
                    if (parsec == null) break;
                    if (m["action"]?.ToString() == "prepare")
                    {
                        var exe = Emulators.FindPcsx2(m["exe"]?.ToString()) ?? pcsx2Found ?? throw new Exception("PCSX2 isn't found.");
                        var me = m["myPad"]?.ToString() ?? "";
                        if (me != "") Emulators.SetupPlayer1(exe, me == "controller");
                        int.TryParse(m["friendPad"]?.ToString(), out var friendPad);
                        reply["pad"] = Emulators.SetupPlayer2(exe, friendPad);
                    }
                    if (Process.GetProcessesByName("parsecd").Length == 0)
                        Process.Start(new ProcessStartInfo(parsec) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(parsec) })?.Dispose();
                    else
                        Process.Start(new ProcessStartInfo(parsec) { UseShellExecute = true })?.Dispose(); // brings its window up
                    break;
                case "join":
                    var link = (m["link"]?.ToString() ?? "").Trim();
                    if (!System.Text.RegularExpressions.Regex.IsMatch(link, @"^(https://(www\.)?parsec\.(gg|app)/|parsec://)", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                        throw new Exception("That doesn't look like a Parsec link (it starts with https://parsec.gg/).");
                    if (parsec == null) break;
                    Process.Start(new ProcessStartInfo(link) { UseShellExecute = true })?.Dispose();
                    break;
            }
            reply["ok"] = true;
        }
        catch (Exception ex) { reply["ok"] = false; reply["error"] = ex.Message; }
        Send(reply);
    }

    async Task BudokaiPlay(JsonObject m)
    {
        string Str(string k) => m[k]?.ToString() ?? "";
        string emu = Str("emu"), path = Str("path"), how = Str("mode"), code = Str("code").Trim(), nick = Str("nickname").Trim();
        bool full = m["fullscreen"]?.GetValue<bool>() ?? true;
        void Step(string t) => BeginInvoke(() => Send(new JsonObject { ["type"] = "launchStep", ["text"] = t }));
        var done = new JsonObject { ["type"] = "budokaiDone", ["mode"] = how };
        try
        {
            if (emu == "dolphin" && how == "app")
            {
                // Dolphin is only opened, nothing is set up in it.
                var app = Emulators.FindDolphin(Str("exe")) ?? dolphinFound ?? throw new Exception("Dolphin wasn't found (pick Dolphin.exe in the Budokai options).");
                Process.Start(new ProcessStartInfo(app) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(app) })?.Dispose();
                done["ok"] = true;
                BeginInvoke(() => Send(done));
                return;
            }
            if (!File.Exists(path)) throw new Exception("That game file isn't there any more.");
            if (emu == "pcsx2")
            {
                var exe = Emulators.FindPcsx2(Str("exe")) ?? pcsx2Found ?? throw new Exception("PCSX2 isn't installed (or pick its .exe in the Budokai options).");
                // This game's own save data (memory card) goes in slot 1; without one, your usual card is put back.
                try
                {
                    var before = Emulators.UseMemoryCard(exe, Str("memcard"), Str("usualCard"), Path.GetFileNameWithoutExtension(path));
                    if (before != null) done["usualCard"] = before;
                }
                catch (Exception ex) { Step("Save data: " + ex.Message); }
                // Your controls for player 1 (controller and keyboard, or keyboard only).
                if (Str("myPad") != "") { try { Emulators.SetupPlayer1(exe, Str("myPad") == "controller"); } catch (Exception ex) { Step("Controls: " + ex.Message); } }
                Step("Starting PCSX2");
                var args = (full ? "-fullscreen " : "") + "-fastboot -- \"" + path + "\"";
                Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe) })?.Dispose();
                done["ok"] = true;
            }
            else
            {
                var exe = Emulators.FindDolphin(Str("exe")) ?? dolphinFound ?? throw new Exception("Dolphin wasn't found (pick Dolphin.exe in the Budokai options).");
                if (how == "solo")
                {
                    Step("Starting Dolphin");
                    var args = (full ? "--config=Dolphin.Display.Fullscreen=True " : "") + "-b -e \"" + path + "\"";
                    Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe) })?.Dispose();
                    done["ok"] = true;
                }
                else
                {
                    if (how == "join" && code == "") throw new Exception("Type your friend's code first.");
                    Step(how == "join" ? "Filling in " + code : "Getting ready to host");
                    var net = new Dictionary<string, string> { ["TraversalChoice"] = "traversal", ["UseUPNP"] = "True" };
                    if (nick != "") net["Nickname"] = nick;
                    if (how == "join") net["HostCode"] = code;
                    Emulators.SetDolphinIni(exe, "NetPlay", net);
                    Emulators.AddDolphinGameFolder(exe, Path.GetDirectoryName(path)!);
                    Step("Starting Dolphin");
                    using var p = Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe) }) ?? throw new Exception("Dolphin didn't start.");
                    var result = await Task.Run<(bool clicked, string? hostCode)>(() =>
                    {
                        var setup = Emulators.OpenNetPlaySetup(p, Step);
                        if (setup == null) return (false, null);
                        if (how == "join") { Step("Connecting to " + code); return (Emulators.Join(setup), null); }
                        Step("Hosting " + Path.GetFileNameWithoutExtension(path));
                        if (!Emulators.Host(setup, Path.GetFileNameWithoutExtension(path))) return (false, null);
                        Step("Waiting for your code");
                        return (true, Emulators.ReadHostCode(p, 45000));
                    });
                    done["ok"] = true;
                    done["clicked"] = result.clicked;
                    if (result.hostCode != null) done["code"] = result.hostCode;
                    else if (how == "join") done["code"] = code;
                    var copy = result.hostCode ?? (how == "join" ? code : null);
                    if (copy != null) BeginInvoke(() => { try { Clipboard.SetText(copy); } catch { } });
                }
            }
        }
        catch (Exception ex) { done["ok"] = false; done["error"] = ex.Message; }
        BeginInvoke(() => Send(done));
    }
}

using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Skyvaint;

// UPDATES: the launcher's own updates from its GitHub releases, keeping Roblox up to date, and the settings backups.
// The page shows all of it in Settings → UPDATES (wwwroot/js/updates.js).
public sealed partial class MainForm
{
    const string Repo = "skyvaint/skyvaint-game-launcher";
    static readonly HttpClient Gh = MakeGh();
    static HttpClient MakeGh()
    {
        var h = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        h.DefaultRequestHeaders.UserAgent.ParseAdd("SkyvaintGameLauncher");
        h.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return h;
    }

    readonly System.Windows.Forms.Timer updateTimer = new() { Interval = 10 * 60 * 1000 };
    bool updateTimerOn, appChecking, appInstalling, robloxChecking, robloxUpdating;
    DateTime lastAppCheck = DateTime.MinValue, lastRobloxCheck = DateTime.MinValue;
    JsonObject? latestRelease, robloxInfo;
    string appError = "", notifiedTag = "", installStep = "";
    int installPct = -1;

    static Version CurrentVersion => typeof(MainForm).Assembly.GetName().Version ?? new Version(0, 0, 0);
    static string VersionText(Version v) => $"{v.Major}.{v.Minor}.{Math.Max(0, v.Build)}";

    /// <summary>A build running from the source folder's bin\ or obj\: the next build would undo an update, so
    /// those update with git and a rebuild instead.</summary>
    static bool DevBuild => Regex.IsMatch(AppContext.BaseDirectory, @"\\(bin|obj)\\", RegexOptions.IgnoreCase);

    bool UpdFlag(string key, bool fallback)
    {
        try { return config?["updates"]?[key]?.GetValue<bool>() ?? fallback; } catch { return fallback; }
    }
    string UpdText(string key) => config?["updates"]?[key]?.ToString() ?? "";

    bool OnUpdateMessage(JsonObject m)
    {
        string Str(string key) => m[key]?.ToString() ?? "";
        switch (Str("type"))
        {
            case "updatesState":
                SendUpdateState();
                return true;
            case "checkUpdates":
                _ = CheckApp(manual: true);
                _ = CheckRoblox(install: false);
                return true;
            case "installUpdate":
                _ = InstallUpdate();
                return true;
            case "openRelease":
                var url = latestRelease?["url"]?.ToString() ?? $"https://github.com/{Repo}/releases";
                try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose(); } catch { }
                return true;
            case "updateRoblox":
                _ = CheckRoblox(install: true, manual: true);
                return true;
            case "backupNow":
                DataSafety.Snapshot(ConfigPath, force: true);
                DataSafety.Snapshot(StatePath, force: true);
                _ = Task.Run(() => DataSafety.MirrorMedia(MediaDir));
                Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = "Backup saved" });
                SendUpdateState();
                return true;
            case "openBackups":
                try { Directory.CreateDirectory(DataSafety.BackupDir); Process.Start("explorer.exe", $"\"{DataSafety.BackupDir}\"")?.Dispose(); } catch { }
                return true;
            case "safeGraphics":
                StartupGuard.SetSafe(m["on"]?.GetValue<bool>() == true);
                Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = "Takes effect the next time the launcher starts" });
                return true;
            case "openLog":
                try { if (File.Exists(StartupGuard.LogFile)) Process.Start("explorer.exe", $"/select,\"{StartupGuard.LogFile}\"")?.Dispose(); } catch { }
                return true;
            case "restoreBackup":
                RestoreBackup(Str("file"));
                return true;
            case "dataFiles":
                Send(new JsonObject { ["type"] = "dataFiles", ["files"] = DataFiles(), ["prompt"] = m["prompt"]?.GetValue<bool>() == true, ["skip"] = DataSafety.SkipDataPrompt });
                return true;
            case "loadData":
                LoadDataFile(Str("file"));
                return true;
        }
        return false;
    }

    /// <summary>Once the page is up: say if the settings had to be put back, and start the update checks.</summary>
    void OnPageReadyUpdates()
    {
        if (recoveredFrom != null)
        {
            var when = File.GetLastWriteTime(recoveredFrom).ToString("d MMM HH:mm");
            Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = $"Your settings were missing or replaced, so they were put back from the backup of {when}." });
            recoveredFrom = null;
        }
        SendUpdateState();
        if (updateTimerOn) return;
        updateTimerOn = true;
        updateTimer.Tick += (_, _) => _ = AutoChecks();
        updateTimer.Start();
        // The first look comes a little after start, out of the way of the opening animation and the game scan.
        var first = new System.Windows.Forms.Timer { Interval = 30000 };
        first.Tick += (_, _) => { first.Stop(); first.Dispose(); _ = AutoChecks(); };
        first.Start();
    }

    async Task AutoChecks()
    {
        _ = Task.Run(() => DataSafety.MirrorMedia(MediaDir));
        if (UpdFlag("auto", true) && DateTime.Now - lastAppCheck > TimeSpan.FromHours(6)) await CheckApp(manual: false);
        if (UpdFlag("roblox", true) && DateTime.Now - lastRobloxCheck > TimeSpan.FromMinutes(45)) await CheckRoblox(install: true);
    }

    JsonObject UpdateState() => new()
    {
        ["type"] = "updates",
        ["current"] = VersionText(CurrentVersion),
        ["dev"] = DevBuild,
        ["test"] = DataSafety.IsTest,
        ["checking"] = appChecking,
        ["installing"] = appInstalling,
        ["installStep"] = installStep,
        ["installPct"] = installPct,
        ["error"] = appError,
        ["checkedAt"] = lastAppCheck == DateTime.MinValue ? 0 : new DateTimeOffset(lastAppCheck).ToUnixTimeMilliseconds(),
        ["latest"] = latestRelease?.DeepClone(),
        ["roblox"] = (robloxInfo?.DeepClone() as JsonObject ?? new JsonObject()).Also(r => { r["checking"] = robloxChecking; r["updating"] = robloxUpdating; }),
        ["backups"] = DataSafety.Describe(ConfigPath),
        ["safeGraphics"] = StartupGuard.SafeGraphics,
        ["safeReason"] = StartupGuard.SafeReason,
        ["logFile"] = StartupGuard.LogFile,
        ["backupDir"] = DataSafety.BackupDir,
    };

    void SendUpdateState() { try { Send(UpdateState()); } catch { } }

    // ---------- the launcher ----------

    static Version? ParseVersion(string tag)
    {
        var m = Regex.Match(tag ?? "", @"(\d+)\.(\d+)(?:\.(\d+))?");
        if (!m.Success) return null;
        return new Version(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0);
    }

    /// <summary>Looks at the GitHub releases for a newer version. Without <paramref name="manual"/> it is the
    /// background check, which only speaks up (tray balloon + toast) when there is something new.</summary>
    async Task CheckApp(bool manual)
    {
        if (appChecking) return;
        appChecking = true;
        appError = "";
        SendUpdateState();
        try
        {
            bool beta = UpdFlag("beta", false);
            var list = await GetJsonWith(Gh, $"https://api.github.com/repos/{Repo}/releases?per_page=15", 2) as JsonArray;
            var best = (list ?? new JsonArray()).OfType<JsonObject>()
                .Where(r => r["draft"]?.GetValue<bool>() != true && (beta || r["prerelease"]?.GetValue<bool>() != true))
                .Select(r => (r, v: ParseVersion(r["tag_name"]?.ToString() ?? "")))
                .Where(x => x.v != null)
                .OrderByDescending(x => x.v)
                .FirstOrDefault();
            lastAppCheck = DateTime.Now;
            if (best.r == null)
            {
                latestRelease = null;
                appError = "No releases published yet.";
            }
            else
            {
                var asset = (best.r["assets"] as JsonArray)?.OfType<JsonObject>()
                    .Where(a => (a["name"]?.ToString() ?? "").EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(a => (a["name"]?.ToString() ?? "").Contains("win-x64", StringComparison.OrdinalIgnoreCase))
                    .FirstOrDefault();
                bool newer = best.v! > CurrentVersion;
                var tag = best.r["tag_name"]?.ToString() ?? "";
                latestRelease = new JsonObject
                {
                    ["tag"] = tag,
                    ["version"] = VersionText(best.v!),
                    ["name"] = best.r["name"]?.ToString() is { Length: > 0 } n ? n : tag,
                    ["notes"] = best.r["body"]?.ToString() ?? "",
                    ["published"] = best.r["published_at"]?.ToString() ?? "",
                    ["url"] = best.r["html_url"]?.ToString() ?? "",
                    ["asset"] = asset?["browser_download_url"]?.ToString() ?? "",
                    ["size"] = asset?["size"]?.GetValue<long>() ?? 0,
                    ["prerelease"] = best.r["prerelease"]?.GetValue<bool>() == true,
                    ["newer"] = newer,
                };
                if (newer && !manual && UpdFlag("notify", true) && tag != UpdText("skipped") && tag != notifiedTag)
                {
                    notifiedTag = tag;
                    tray.ShowBalloonTip(8000, "Skyvaint " + VersionText(best.v!) + " is out", "Open Settings → UPDATES to see what's new and update.", ToolTipIcon.Info);
                    Send(new JsonObject { ["type"] = "updateAvailable", ["version"] = VersionText(best.v!), ["tag"] = tag });
                }
            }
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            appError = "The releases page wasn't found (is the GitHub repo private?).";
        }
        catch (Exception ex)
        {
            appError = "Couldn't reach GitHub: " + ex.Message;
        }
        appChecking = false;
        SendUpdateState();
        if (manual && appError == "")
            Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = latestRelease?["newer"]?.GetValue<bool>() == true ? $"Version {latestRelease["version"]} is available" : "You're on the latest version" });
    }

    /// <summary>Downloads the release zip, then a small script swaps the files in once the launcher has closed and
    /// starts the new one. Settings live in %APPDATA% and are not touched.</summary>
    async Task InstallUpdate()
    {
        if (appInstalling) return;
        var url = latestRelease?["asset"]?.ToString() ?? "";
        if (DevBuild)
        {
            Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "This copy runs from the source folder's build output. Pull the new version and rebuild instead." });
            return;
        }
        if (url == "")
        {
            Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "That release has no download attached. Opening it on GitHub." });
            OnUpdateMessage(new JsonObject { ["type"] = "openRelease" });
            return;
        }
        appInstalling = true;
        installPct = 0;
        installStep = "Downloading";
        SendUpdateState();
        try
        {
            var work = Path.Combine(Path.GetTempPath(), "SkyvaintUpdate");
            if (Directory.Exists(work)) Directory.Delete(work, recursive: true);
            Directory.CreateDirectory(work);
            var zip = Path.Combine(work, "update.zip");
            using (var resp = await Gh.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
            {
                resp.EnsureSuccessStatusCode();
                long total = resp.Content.Headers.ContentLength ?? 0, done = 0;
                await using var src = await resp.Content.ReadAsStreamAsync();
                await using var dst = File.Create(zip);
                var buf = new byte[1 << 16];
                var tick = DateTime.Now;
                for (int n; (n = await src.ReadAsync(buf)) > 0;)
                {
                    await dst.WriteAsync(buf.AsMemory(0, n));
                    done += n;
                    if (total > 0 && (DateTime.Now - tick).TotalMilliseconds > 250)
                    {
                        tick = DateTime.Now;
                        installPct = (int)(done * 100 / total);
                        SendUpdateState();
                    }
                }
            }
            installStep = "Unpacking";
            installPct = 100;
            SendUpdateState();
            var unpacked = Path.Combine(work, "files");
            await Task.Run(() => ZipFile.ExtractToDirectory(zip, unpacked));
            var exeName = Path.GetFileName(Environment.ProcessPath ?? "SkyvaintGameLauncher.exe");
            // The zip may hold the files at its root or inside one folder.
            var root = Directory.GetFiles(unpacked, exeName, SearchOption.AllDirectories).Select(f => Path.GetDirectoryName(f)).FirstOrDefault()
                ?? Directory.GetFiles(unpacked, "SkyvaintGameLauncher.exe", SearchOption.AllDirectories).Select(f => Path.GetDirectoryName(f)).FirstOrDefault();
            if (root == null) throw new Exception("the download doesn't contain the launcher");
            var target = AppContext.BaseDirectory.TrimEnd('\\');
            var script = Path.Combine(work, "apply.cmd");
            int pid = Environment.ProcessId;
            File.WriteAllText(script, string.Join("\r\n",
                "@echo off",
                ":wait",
                $"tasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul && (timeout /t 1 /nobreak >nul & goto wait)",
                $"robocopy \"{root}\" \"{target}\" /E /R:5 /W:1 /NFL /NDL /NJH /NJS /NP >nul",
                $"start \"\" \"{Path.Combine(target, exeName)}\"",
                ""));
            installStep = "Restarting";
            SendUpdateState();
            Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"{script}\"") { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden })?.Dispose();
            await Task.Delay(400);
            Quit();
        }
        catch (Exception ex)
        {
            appInstalling = false;
            installPct = -1;
            installStep = "";
            appError = "Update failed: " + ex.Message;
            SendUpdateState();
            Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = appError });
        }
    }

    // ---------- Roblox ----------

    static string LocalApp => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    static string BloxstrapExe => Path.Combine(LocalApp, "Bloxstrap", "Bloxstrap.exe");

    /// <summary>Every Roblox player version on this PC (Bloxstrap's and Roblox's own installs).</summary>
    static HashSet<string> InstalledRobloxVersions()
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var dir in new[] { Path.Combine(LocalApp, "Bloxstrap", "Versions"), Path.Combine(LocalApp, "Roblox", "Versions") })
        {
            try
            {
                if (!Directory.Exists(dir)) continue;
                foreach (var v in Directory.GetDirectories(dir))
                    if (File.Exists(Path.Combine(v, "RobloxPlayerBeta.exe"))) found.Add(Path.GetFileName(v));
            }
            catch { }
        }
        return found;
    }

    static bool RobloxRunning()
    {
        var p = Process.GetProcessesByName("RobloxPlayerBeta");
        foreach (var x in p) x.Dispose();
        return p.Length > 0;
    }

    /// <summary>Compares the installed Roblox with the newest one Roblox has published, and with
    /// <paramref name="install"/> brings it up to date through Bloxstrap (without starting Roblox). Never while
    /// Roblox is open, since updating closes it.</summary>
    async Task CheckRoblox(bool install, bool manual = false)
    {
        if (robloxChecking || robloxUpdating) return;
        robloxChecking = true;
        SendUpdateState();
        try
        {
            var j = await GetJsonWith(Web, "https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer", 2);
            var guid = j?["clientVersionUpload"]?.ToString() ?? "";
            var ver = j?["version"]?.ToString() ?? "";
            var installed = InstalledRobloxVersions();
            bool bloxstrap = File.Exists(BloxstrapExe);
            bool upToDate = guid != "" && installed.Contains(guid);
            lastRobloxCheck = DateTime.Now;
            robloxInfo = new JsonObject
            {
                ["latest"] = ver, ["guid"] = guid, ["upToDate"] = upToDate, ["installed"] = installed.Count > 0,
                ["bloxstrap"] = bloxstrap, ["checkedAt"] = DateTimeOffset.Now.ToUnixTimeMilliseconds(),
                ["status"] = guid == "" ? "Couldn't read Roblox's version" : upToDate ? "Up to date" : installed.Count == 0 ? "Roblox isn't installed" : "Update available",
            };
            robloxChecking = false;
            if (!upToDate && guid != "" && install)
            {
                if (!bloxstrap)
                    robloxInfo["status"] = "Update available — Roblox updates itself the next time it starts";
                else if (RobloxRunning())
                    robloxInfo["status"] = "Update available — waiting until Roblox is closed";
                else if (launchBusy || (!manual && (running.Count > 0 || SomethingFullscreen())))
                    // Bloxstrap shows a small progress window; not in the middle of a game.
                    robloxInfo["status"] = "Update available — waiting until you're not playing";
                else
                    await UpdateRobloxNow(ver, guid, manual);
            }
            else if (manual && upToDate)
                Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = "Roblox is up to date" });
        }
        catch (Exception ex)
        {
            robloxInfo ??= new JsonObject();
            robloxInfo["status"] = "Couldn't check: " + ex.Message;
        }
        robloxChecking = false;
        SendUpdateState();
    }

    async Task UpdateRobloxNow(string ver, string guid, bool manual)
    {
        robloxUpdating = true;
        robloxInfo!["status"] = "Updating to " + ver + "…";
        SendUpdateState();
        if (manual) Send(new JsonObject { ["type"] = "notice", ["ok"] = true, ["text"] = "Updating Roblox to " + ver });
        try
        {
            // Bloxstrap's own flags: -player picks the player, -nolaunch installs/updates without starting Roblox.
            using var p = Process.Start(new ProcessStartInfo(BloxstrapExe, "-player -nolaunch -quiet") { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(BloxstrapExe)! });
            if (p != null)
            {
                var deadline = DateTime.Now.AddMinutes(10);
                while (!p.HasExited && DateTime.Now < deadline) await Task.Delay(1000);
            }
            bool ok = InstalledRobloxVersions().Contains(guid);
            robloxInfo["upToDate"] = ok;
            robloxInfo["status"] = ok ? "Up to date (updated to " + ver + ")" : "Bloxstrap ran, but the new version isn't there yet";
            if (ok) tray.ShowBalloonTip(4000, "Roblox updated", "Roblox " + ver + " is ready, so games start without the update wait.", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            robloxInfo["status"] = "Update failed: " + ex.Message;
        }
        robloxUpdating = false;
        SendUpdateState();
    }

    // ---------- backups ----------

    /// <summary>Puts a backup back and restarts, so everything loads from it.</summary>
    void RestoreBackup(string file)
    {
        restoring = true; // from here on the page's (old) settings and stats are not written
        if (!DataSafety.Restore(file, ConfigPath, StatePath))
        {
            restoring = false;
            Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "That backup couldn't be read." });
            return;
        }
        Restart();
    }

    // ---------- picking which data to load (developer mode → "Prompt data selection") ----------

    /// <summary>A settings file's summary for the picker: when it was saved and what is in it.</summary>
    static JsonObject? DataSummary(string file, string label, bool current)
    {
        try
        {
            if (JsonNode.Parse(File.ReadAllText(file)) is not JsonObject j || j["games"] == null) return null;
            return new JsonObject
            {
                ["file"] = file, ["label"] = label, ["current"] = current,
                ["at"] = new DateTimeOffset(File.GetLastWriteTime(file)).ToUnixTimeMilliseconds(),
                ["games"] = (j["games"] as JsonArray)?.Count ?? 0,
                ["accounts"] = (j["roblox"]?["accounts"] as JsonArray)?.Count ?? 0,
                ["bars"] = 1 + ((j["nexus"]?["bars"] as JsonArray)?.Count ?? 0),
                ["sounds"] = (j["sound"]?["library"] as JsonArray)?.Count ?? 0,
            };
        }
        catch { return null; }
    }

    /// <summary>Every settings file there is to choose from: the current one, the copies next to it (.bak and
    /// other .json files) and the newest automatic backups.</summary>
    JsonArray DataFiles()
    {
        var list = new JsonArray();
        void Add(string f, string label, bool current) { if (DataSummary(f, label, current) is { } s) list.Add(s); }
        Add(ConfigPath, "Current settings", true);
        try
        {
            foreach (var f in Directory.GetFiles(DataDir).OrderByDescending(x => File.GetLastWriteTime(x)))
            {
                var n = Path.GetFileName(f);
                if (n.Equals("config.json", StringComparison.OrdinalIgnoreCase) || n.StartsWith("state", StringComparison.OrdinalIgnoreCase) || n.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)) continue;
                if (n.EndsWith(".json", StringComparison.OrdinalIgnoreCase) || n.EndsWith(".bak", StringComparison.OrdinalIgnoreCase)) Add(f, n, false);
            }
        }
        catch { }
        foreach (var f in DataSafety.List("config").Take(10)) Add(f, "Backup", false);
        return list;
    }

    /// <summary>Loads a chosen settings file: what is there now is backed up first, then the launcher restarts on
    /// the chosen one (without asking again).</summary>
    void LoadDataFile(string file)
    {
        try
        {
            var full = Path.GetFullPath(file);
            bool allowed = full.StartsWith(Path.GetFullPath(DataDir), StringComparison.OrdinalIgnoreCase) || full.StartsWith(Path.GetFullPath(DataSafety.BackupDir), StringComparison.OrdinalIgnoreCase);
            if (!allowed || JsonNode.Parse(File.ReadAllText(full)) is not JsonObject chosen) throw new Exception("not a settings file");
            if (full.Equals(Path.GetFullPath(ConfigPath), StringComparison.OrdinalIgnoreCase)) return; // already loaded
            restoring = true; // the page's current settings must not be saved over the chosen ones
            DataSafety.Snapshot(ConfigPath, force: true);
            DataSafety.Snapshot(StatePath, force: true);
            // Same install marker as now, so the start-up check doesn't take the chosen file for a wipe.
            DataSafety.Stamp(chosen, config);
            WriteJson(ConfigPath, chosen);
            Restart(chosen: true);
        }
        catch (Exception ex)
        {
            restoring = false;
            Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "Couldn't load that file: " + ex.Message });
        }
    }

    void Restart(bool chosen = false)
    {
        try
        {
            var psi = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false };
            psi.ArgumentList.Add("--wait-pid");
            psi.ArgumentList.Add(Environment.ProcessId.ToString());
            if (chosen) psi.ArgumentList.Add("--data-chosen");
            if (DataSafety.IsTest) { psi.ArgumentList.Add("--data"); psi.ArgumentList.Add(DataSafety.Override!); }
            Process.Start(psi)?.Dispose();
        }
        catch { }
        Quit();
    }
}

static class JsonExtras
{
    /// <summary>Runs a tweak on an object and hands it back (for building messages inline).</summary>
    public static T Also<T>(this T value, Action<T> tweak) { tweak(value); return value; }
}

using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// Where the launcher keeps its data, and the safety net around it.
///
/// Everything you set up lives in %APPDATA%\SkyvaintGameLauncher (config.json, state.json and media\). That folder
/// used to be the only copy, so anything that replaced or deleted it (a test run, a rebuild script, a bad write)
/// wiped games, accounts, playtime and pictures. Now:
///  - every save first keeps a dated copy in %LOCALAPPDATA%\SkyvaintGameLauncher\backups (outside the data folder,
///    so removing the data folder doesn't take the backups with it);
///  - custom pictures, sounds and videos are mirrored there too;
///  - on start, a missing, broken or replaced config is put back from the newest backup by itself;
///  - <c>--data &lt;folder&gt;</c> runs the launcher on a separate, throw-away data folder for testing.
/// </summary>
static class DataSafety
{
    /// <summary>Set by <c>--data &lt;folder&gt;</c>: a test run keeps all of its data there.</summary>
    public static string? Override { get; set; }
    public static bool IsTest => Override != null;

    /// <summary>Set by <c>--data-chosen</c>: this start follows a pick in the data picker, so don't ask again.</summary>
    public static bool SkipDataPrompt { get; set; }

    static string AppDataDir => Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
    static string LocalDir => Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    public static string Roaming => Override ?? Path.Combine(AppDataDir, "SkyvaintGameLauncher");
    public static string Local => Override != null ? Path.Combine(Override, "local") : Path.Combine(LocalDir, "SkyvaintGameLauncher");
    public static string RobloxLocal => Override != null ? Path.Combine(Override, "roblox-webview") : Path.Combine(LocalDir, "SkyvaintRobloxManager", "webview");
    public static string BackupDir => Path.Combine(Local, "backups");
    static string MediaMirror => Path.Combine(BackupDir, "media");

    const int Keep = 60;
    static readonly TimeSpan Every = TimeSpan.FromMinutes(30);

    // Pictures, sounds and videos the user picked. Downloaded art and thumbnails come back by themselves.
    static readonly string[] Precious = ["image_", "audio_", "media_", "acct_", "place_", "appicon"];

    /// <summary>The marker that ties a config to this install. A config without it, while backups with it exist,
    /// was replaced by something else (a fresh start or a test file), not edited by you.</summary>
    public const string MarkKey = "_sv";

    static JsonObject? Load(string file)
    {
        try { return File.Exists(file) ? JsonNode.Parse(File.ReadAllText(file)) as JsonObject : null; }
        catch { return null; }
    }

    static string? Mark(JsonObject? config) => config?[MarkKey]?["id"]?.ToString();

    /// <summary>Gives a config its install marker (once) and keeps it on every save.</summary>
    public static void Stamp(JsonObject config, JsonObject? previous = null)
    {
        if (Mark(config) != null) return;
        var id = Mark(previous) ?? Guid.NewGuid().ToString("N");
        config[MarkKey] = new JsonObject { ["id"] = id, ["since"] = DateTimeOffset.Now.ToUnixTimeMilliseconds() };
    }

    /// <summary>Backups of one file, newest first.</summary>
    public static List<string> List(string name)
    {
        try
        {
            return Directory.Exists(BackupDir)
                ? Directory.GetFiles(BackupDir, name + "-*.json").OrderByDescending(f => Path.GetFileName(f), StringComparer.Ordinal).ToList()
                : new List<string>();
        }
        catch { return new List<string>(); }
    }

    /// <summary>Keeps a dated copy of the file as it is now, before it gets replaced. At most one every 30 minutes
    /// unless <paramref name="force"/>; the newest 60 are kept.</summary>
    public static void Snapshot(string file, bool force = false)
    {
        try
        {
            if (Load(file) == null) return;
            var name = Path.GetFileNameWithoutExtension(file);
            Directory.CreateDirectory(BackupDir);
            var newest = List(name).FirstOrDefault();
            if (!force && newest != null && DateTime.Now - File.GetLastWriteTime(newest) < Every) return;
            var dest = Path.Combine(BackupDir, $"{name}-{DateTime.Now:yyyyMMdd-HHmmss}.json");
            File.Copy(file, dest, overwrite: true);
            File.SetLastWriteTime(dest, DateTime.Now);
            foreach (var old in List(name).Skip(Keep)) { try { File.Delete(old); } catch { } }
        }
        catch { }
    }

    /// <summary>Run once at start, before anything reads the data. Puts the config (and the stats with it) back from
    /// the newest backup when it is missing, unreadable, or was replaced by a config from somewhere else. Returns
    /// the backup that was used, or null when nothing needed fixing.</summary>
    public static string? RecoverOnStart(string configPath, string statePath, string mediaDir)
    {
        string? used = null;
        try
        {
            var current = Load(configPath);
            var backups = List(Path.GetFileNameWithoutExtension(configPath));
            var good = backups.Select(f => (file: f, json: Load(f))).FirstOrDefault(b => b.json != null && Mark(b.json) != null);
            bool wiped = good.file != null && (current == null || Mark(current) == null);
            if (wiped)
            {
                // Keep what was there too, in case it was wanted after all.
                if (File.Exists(configPath)) { try { File.Copy(configPath, Path.Combine(BackupDir, $"replaced-config-{DateTime.Now:yyyyMMdd-HHmmss}.json"), true); } catch { } }
                Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
                File.Copy(good.file, configPath, overwrite: true);
                used = good.file;
                RestoreStateNear(statePath, good.file, onlyIfBroken: false);
            }
            else if (current == null)
            {
                // No marked backup yet (first run after this update), but an older unmarked one beats nothing.
                var any = backups.FirstOrDefault(f => Load(f) != null);
                if (any != null) { Directory.CreateDirectory(Path.GetDirectoryName(configPath)!); File.Copy(any, configPath, overwrite: true); used = any; }
            }
            RestoreStateNear(statePath, used, onlyIfBroken: true);
            RestoreMedia(mediaDir);
        }
        catch { }
        return used;
    }

    /// <summary>Puts state.json (playtime, last played) back from the backup closest to <paramref name="near"/>.</summary>
    static void RestoreStateNear(string statePath, string? near, bool onlyIfBroken)
    {
        try
        {
            if (onlyIfBroken && Load(statePath) != null) return;
            var name = Path.GetFileNameWithoutExtension(statePath);
            var list = List(name);
            if (list.Count == 0) return;
            string? pick = null;
            if (near != null)
            {
                // Same timestamp format in both names, so plain string order finds the one taken at or before it.
                var stamp = Path.GetFileNameWithoutExtension(near)[(Path.GetFileNameWithoutExtension(near).IndexOf('-') + 1)..];
                pick = list.FirstOrDefault(f => string.CompareOrdinal(Path.GetFileNameWithoutExtension(f)[(name.Length + 1)..], stamp) <= 0);
            }
            pick ??= list.FirstOrDefault(f => Load(f) != null);
            if (pick != null && Load(pick) != null) File.Copy(pick, statePath, overwrite: true);
        }
        catch { }
    }

    /// <summary>Puts a chosen backup back (from the UPDATES tab). The current files are kept as a backup first.</summary>
    public static bool Restore(string backupFile, string configPath, string statePath)
    {
        try
        {
            var full = Path.GetFullPath(backupFile);
            if (!full.StartsWith(Path.GetFullPath(BackupDir), StringComparison.OrdinalIgnoreCase) || Load(full) == null) return false;
            Snapshot(configPath, force: true);
            Snapshot(statePath, force: true);
            File.Copy(full, configPath, overwrite: true);
            RestoreStateNear(statePath, full, onlyIfBroken: false);
            return true;
        }
        catch { return false; }
    }

    /// <summary>The config backups for the UPDATES tab: when, and how much was in them.</summary>
    public static JsonArray Describe(string configPath)
    {
        var list = new JsonArray();
        foreach (var f in List(Path.GetFileNameWithoutExtension(configPath)).Take(30))
        {
            var j = Load(f);
            if (j == null) continue;
            list.Add(new JsonObject
            {
                ["file"] = f,
                ["at"] = new DateTimeOffset(File.GetLastWriteTime(f)).ToUnixTimeMilliseconds(),
                ["games"] = (j["games"] as JsonArray)?.Count ?? 0,
                ["accounts"] = (j["roblox"]?["accounts"] as JsonArray)?.Count ?? 0,
                ["bars"] = 1 + ((j["nexus"]?["bars"] as JsonArray)?.Count ?? 0),
                ["size"] = new FileInfo(f).Length,
            });
        }
        return list;
    }

    // ---------- pictures, sounds and videos ----------

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateHardLink(string newFile, string existingFile, IntPtr security);

    static bool IsPrecious(string file) { var n = Path.GetFileName(file); return Precious.Any(p => n.StartsWith(p, StringComparison.OrdinalIgnoreCase)); }

    // A hard link costs no disk space and keeps the file even if the original is deleted; a copy is the fallback.
    static void Link(string from, string to)
    {
        if (!CreateHardLink(to, from, IntPtr.Zero)) File.Copy(from, to, overwrite: false);
    }

    /// <summary>Mirrors new custom media into the backups. Cheap: only files the mirror doesn't have yet.</summary>
    public static void MirrorMedia(string mediaDir)
    {
        try
        {
            if (!Directory.Exists(mediaDir)) return;
            Directory.CreateDirectory(MediaMirror);
            foreach (var f in Directory.EnumerateFiles(mediaDir).Where(IsPrecious))
            {
                var dest = Path.Combine(MediaMirror, Path.GetFileName(f));
                if (File.Exists(dest)) continue;
                try { Link(f, dest); } catch { }
            }
        }
        catch { }
    }

    /// <summary>Brings back custom media that disappeared from the data folder.</summary>
    static void RestoreMedia(string mediaDir)
    {
        try
        {
            if (!Directory.Exists(MediaMirror)) return;
            Directory.CreateDirectory(mediaDir);
            foreach (var f in Directory.EnumerateFiles(MediaMirror))
            {
                var dest = Path.Combine(mediaDir, Path.GetFileName(f));
                if (File.Exists(dest)) continue;
                try { Link(f, dest); } catch { }
            }
        }
        catch { }
    }
}

using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json.Nodes;

namespace Skyvaint;

// LIBRARY → Data and folders: every folder the launcher keeps things in (with its size), opening any of them,
// showing where a picture or sound is, and CONFIG SAVE: one zip of your settings, pictures and the sign-ins and
// cookies of the launcher's own browsers (the WebView data), without the throw-away caches.
public sealed partial class MainForm
{
    static string ConfigSaves => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Skyvaint Config Saves");

    (string name, string path)[] LauncherDirs() => new[]
    {
        ("Settings, playtime and pictures", DataDir),
        ("Pictures, GIFs, videos and sounds you picked", MediaDir),
        ("Launcher data (WebView, backups, logs)", DataSafety.Local),
        ("Launcher page data and cookies", CacheDir),
        ("Roblox account sign-ins", DataSafety.RobloxLocal),
        ("Side browser sign-ins (Social)", Path.Combine(DataSafety.Local, "browser-webview")),
        ("Automatic backups", Path.Combine(DataSafety.Local, "backups")),
        ("Logs", Path.Combine(DataSafety.Local, "logs")),
        ("CONFIG SAVE zips", ConfigSaves),
        ("The launcher program", AppContext.BaseDirectory.TrimEnd('\\')),
    };

    static readonly string[] CacheFolders = { "Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "GrShaderCache", "ShaderCache", "GraphiteDawnCache", "CacheStorage", "Crashpad", "component_crx_cache", "extensions_crx_cache" };
    static bool IsCache(string relative) => relative.Split('\\', '/').Any(p => CacheFolders.Contains(p, StringComparer.OrdinalIgnoreCase));

    static long FolderBytes(string dir)
    {
        long total = 0;
        try
        {
            foreach (var f in Directory.EnumerateFiles(dir, "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }))
                try { total += new FileInfo(f).Length; } catch { }
        }
        catch { }
        return total;
    }

    bool OnLibraryMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "dataDirs":
                Task.Run(() =>
                {
                    var list = new JsonArray();
                    foreach (var (name, path) in LauncherDirs())
                    {
                        bool there = Directory.Exists(path);
                        list.Add(new JsonObject { ["name"] = name, ["path"] = path, ["mb"] = there ? Math.Round(FolderBytes(path) / 1048576.0, 1) : null, ["exists"] = there });
                    }
                    BeginInvoke(() => Send(new JsonObject { ["type"] = "dataDirs", ["dirs"] = list }));
                });
                return true;
            case "openPath":
            {
                var path = m["path"]?.ToString() ?? "";
                if (LauncherDirs().Any(d => string.Equals(d.path, path, StringComparison.OrdinalIgnoreCase)))
                {
                    try { Directory.CreateDirectory(path); Process.Start("explorer.exe", $"\"{path}\"")?.Dispose(); } catch { }
                }
                return true;
            }
            case "revealAsset":
            {
                var url = m["url"]?.ToString() ?? "";
                try
                {
                    string? file = null;
                    if (Uri.TryCreate(url, UriKind.Absolute, out var u))
                    {
                        if (u.Host.Equals("media.skyvaint.example", StringComparison.OrdinalIgnoreCase)) file = Path.Combine(MediaDir, Path.GetFileName(Uri.UnescapeDataString(u.AbsolutePath)));
                        else if (u.IsFile) file = u.LocalPath;
                        else if (u.Scheme is "http" or "https") { Detached.Start(new ProcessStartInfo(url) { UseShellExecute = true }); return true; }
                    }
                    else if (Path.IsPathRooted(url)) file = url;
                    if (file != null && File.Exists(file)) Process.Start("explorer.exe", $"/select,\"{file}\"")?.Dispose();
                    else Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "That file isn't on this PC any more." });
                }
                catch { }
                return true;
            }
            case "configSave":
                try { SaveState(); } catch { }
                Task.Run(ConfigSave);
                return true;
        }
        return false;
    }

    void ConfigSave()
    {
        var reply = new JsonObject { ["type"] = "configSaved" };
        try
        {
            Directory.CreateDirectory(ConfigSaves);
            var zipPath = Path.Combine(ConfigSaves, $"Skyvaint-config-{DateTime.Now:yyyy-MM-dd_HHmm}.zip");
            int skipped = 0;
            using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
            {
                void addFolder(string dir, string into)
                {
                    if (!Directory.Exists(dir)) return;
                    foreach (var f in Directory.EnumerateFiles(dir, "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }))
                    {
                        var rel = Path.GetRelativePath(dir, f);
                        if (IsCache(rel) || f.Equals(zipPath, StringComparison.OrdinalIgnoreCase)) continue;
                        try
                        {
                            // Files the WebView has open (cookies, history) are read while it keeps them open.
                            using var src = new FileStream(f, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                            var entry = zip.CreateEntry(into + "/" + rel.Replace('\\', '/'), CompressionLevel.Fastest);
                            using var dst = entry.Open();
                            src.CopyTo(dst);
                        }
                        catch { skipped++; }
                    }
                }
                addFolder(DataDir, "settings");
                addFolder(DataSafety.Local, "launcher-local");
                addFolder(DataSafety.RobloxLocal, "roblox-signins");
                var readme = zip.CreateEntry("READ ME.txt");
                using (var w = new StreamWriter(readme.Open()))
                {
                    w.WriteLine("Skyvaint Game Launcher - CONFIG SAVE, " + DateTime.Now);
                    w.WriteLine();
                    w.WriteLine("settings/        = " + DataDir + "  (config.json, state.json, media)");
                    w.WriteLine("launcher-local/  = " + DataSafety.Local + "  (WebView data with cookies and sign-ins, backups, logs; caches left out)");
                    w.WriteLine("roblox-signins/  = " + DataSafety.RobloxLocal);
                    w.WriteLine();
                    w.WriteLine("To bring it back: quit the launcher, copy each folder back to the path above, start the launcher.");
                    if (skipped > 0) w.WriteLine($"{skipped} files were in use and could not be copied.");
                }
            }
            reply["path"] = zipPath;
            reply["mb"] = Math.Round(new FileInfo(zipPath).Length / 1048576.0, 1);
            reply["skipped"] = skipped;
            try { Process.Start("explorer.exe", $"/select,\"{zipPath}\"")?.Dispose(); } catch { }
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        BeginInvoke(() => Send(reply));
    }
}

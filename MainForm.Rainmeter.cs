using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace Skyvaint;

// EXPLORE → RAINMETER: your Rainmeter skins, switched on and off from the launcher (Rainmeter itself draws them on
// the desktop), and new .rmskin packages put in through Rainmeter's own installer, which shows what is inside first.
// Also image packs: the pictures of a theme or profile you can't use, saved to a folder.
public sealed partial class MainForm
{
    static readonly HttpClient PackWeb = new() { Timeout = TimeSpan.FromSeconds(60) };

    bool OnRainmeterMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "rmList": _ = Task.Run(RainmeterList).ContinueWith(t => { try { BeginInvoke(() => Send(t.Result)); } catch { } }, TaskScheduler.Default); return true;
            case "rmToggle": RainmeterToggle(m["config"]?.ToString() ?? "", m["file"]?.ToString() ?? "", m["on"]?.GetValue<bool>() == true); return true;
            case "rmInstall": _ = RainmeterInstall(m["path"]?.ToString(), m["url"]?.ToString(), m["name"]?.ToString() ?? "the skin"); return true;
            case "rmOpen": { var exe = RainmeterExe(); if (exe != null) StartQuiet(exe, ""); else RmDone(false, "Rainmeter isn't installed."); return true; }
            case "imagePack": _ = ImagePack(m["name"]?.ToString() ?? "Pack", (m["urls"] as JsonArray)?.Select(x => x?.ToString() ?? "").Where(x => x != "").ToList() ?? []); return true;
        }
        return false;
    }

    void RmDone(bool ok, string text) => Send(new JsonObject { ["type"] = "rmDone", ["ok"] = ok, ["text"] = text });

    static string? RainmeterDir()
    {
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var hk = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                using var k = hk.OpenSubKey(@"SOFTWARE\Rainmeter");
                if (k?.GetValue("") is string d && File.Exists(Path.Combine(d, "Rainmeter.exe"))) return d;
            }
            catch { }
        }
        foreach (var d in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) })
        {
            var p = Path.Combine(d, "Rainmeter");
            if (File.Exists(Path.Combine(p, "Rainmeter.exe"))) return p;
        }
        return null;
    }
    static string? RainmeterExe() => RainmeterDir() is { } d ? Path.Combine(d, "Rainmeter.exe") : null;
    static string RainmeterIni => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Rainmeter", "Rainmeter.ini");

    /// <summary>Rainmeter.ini as sections of key=value.</summary>
    static Dictionary<string, Dictionary<string, string>> ReadIni(string file)
    {
        var all = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(file)) return all;
        Dictionary<string, string>? cur = null;
        foreach (var raw in File.ReadAllLines(file))
        {
            var line = raw.Trim();
            if (line.StartsWith('[') && line.EndsWith(']')) { cur = new(StringComparer.OrdinalIgnoreCase); all[line[1..^1]] = cur; continue; }
            int eq = line.IndexOf('=');
            if (cur != null && eq > 0) cur[line[..eq].Trim()] = line[(eq + 1)..].Trim();
        }
        return all;
    }

    JsonObject RainmeterList()
    {
        var reply = new JsonObject { ["type"] = "rmList", ["found"] = RainmeterExe() != null };
        var skins = new JsonArray();
        try
        {
            var ini = ReadIni(RainmeterIni);
            string skinDir = ini.TryGetValue("Rainmeter", out var main) && main.TryGetValue("SkinPath", out var sp) && sp.Length > 0
                ? Environment.ExpandEnvironmentVariables(sp)
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Rainmeter", "Skins");
            if (Directory.Exists(skinDir))
            {
                foreach (var dir in Directory.EnumerateDirectories(skinDir, "*", SearchOption.AllDirectories).Take(800))
                {
                    var rel = Path.GetRelativePath(skinDir, dir);
                    if (rel.Split(Path.DirectorySeparatorChar).Any(p => p.StartsWith('@'))) continue; // @Resources and the like
                    var files = Directory.GetFiles(dir, "*.ini").Select(Path.GetFileName).OfType<string>().OrderBy(x => x).ToList();
                    if (files.Count == 0) continue;
                    // Active=N: the Nth .ini (in name order) is on; 0 or missing is off.
                    string active = "";
                    if (ini.TryGetValue(rel, out var sec) && sec.TryGetValue("Active", out var a) && int.TryParse(a, out int n) && n > 0 && n <= files.Count) active = files[n - 1];
                    skins.Add(new JsonObject { ["config"] = rel, ["files"] = new JsonArray(files.Select(f => (JsonNode)f).ToArray()), ["active"] = active });
                }
            }
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        reply["skins"] = skins;
        return reply;
    }

    static bool SafeRm(string s) => s.Length is > 0 and < 260 && !s.Contains('"') && !s.Contains("..");

    void RainmeterToggle(string config, string file, bool on)
    {
        var exe = RainmeterExe();
        if (exe == null) { RmDone(false, "Rainmeter isn't installed."); return; }
        if (!SafeRm(config) || (on && !SafeRm(file))) return;
        StartQuiet(exe, on ? $"!ActivateConfig \"{config}\" \"{file}\"" : $"!DeactivateConfig \"{config}\"");
        // Rainmeter writes its settings a moment later.
        _ = Task.Delay(1200).ContinueWith(_ => { var list = RainmeterList(); try { BeginInvoke(() => { Send(list); RmDone(true, (on ? "On: " : "Off: ") + config); }); } catch { } }, TaskScheduler.Default);
    }

    static void StartQuiet(string exe, string args)
    {
        try { Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! })?.Dispose(); } catch (Exception ex) { StartupGuard.Log("Rainmeter", ex); }
    }

    async Task RainmeterInstall(string? path, string? url, string name)
    {
        var dir = RainmeterDir();
        if (dir == null) { RmDone(false, "Rainmeter isn't installed. Get it in Settings → INSTALLATION first."); return; }
        try
        {
            if (string.IsNullOrEmpty(path) && url != null)
            {
                // Only https links to a .rmskin, and not more than 60 MB.
                if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != "https" || !u.AbsolutePath.EndsWith(".rmskin", StringComparison.OrdinalIgnoreCase)) { RmDone(false, "That link isn't a .rmskin file."); return; }
                using var r = await PackWeb.GetAsync(u, HttpCompletionOption.ResponseHeadersRead);
                if (!r.IsSuccessStatusCode || (r.Content.Headers.ContentLength ?? 0) > 60_000_000) { RmDone(false, "Couldn't download " + name + "."); return; }
                var bytes = await r.Content.ReadAsByteArrayAsync();
                if (bytes.Length > 60_000_000) { RmDone(false, name + " is too big."); return; }
                path = Path.Combine(Path.GetTempPath(), "skyvaint-" + Guid.NewGuid().ToString("N")[..8] + ".rmskin");
                await File.WriteAllBytesAsync(path, bytes);
            }
            if (string.IsNullOrEmpty(path) || !File.Exists(path) || !path.EndsWith(".rmskin", StringComparison.OrdinalIgnoreCase)) { RmDone(false, "Pick a .rmskin file."); return; }
            var installer = Path.Combine(dir, "SkinInstaller.exe");
            // Rainmeter's installer shows what is inside and asks before it installs anything.
            if (File.Exists(installer)) Process.Start(new ProcessStartInfo(installer, $"\"{path}\"") { UseShellExecute = false })?.Dispose();
            else Process.Start(new ProcessStartInfo(path) { UseShellExecute = true })?.Dispose();
            RmDone(true, "Rainmeter's installer is open: install " + name + " there.");
        }
        catch (Exception ex) { StartupGuard.Log("Rainmeter install", ex); RmDone(false, "Couldn't open Rainmeter's installer."); }
    }

    /// <summary>Saves the pictures of a theme or profile into Documents\Skyvaint Image Packs\&lt;name&gt;.</summary>
    async Task ImagePack(string name, List<string> urls)
    {
        var reply = new JsonObject { ["type"] = "imagePacked", ["ok"] = false };
        try
        {
            string safe = new string(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).ToArray()).Trim();
            if (safe.Length == 0) safe = "Pack";
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Skyvaint Image Packs", safe.Length > 60 ? safe[..60] : safe);
            Directory.CreateDirectory(folder);
            int n = 0;
            foreach (var url in urls.Distinct().Take(120))
            {
                try
                {
                    if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != "https") continue;
                    string ext = Path.GetExtension(u.AbsolutePath).ToLowerInvariant();
                    if (ext is not (".png" or ".jpg" or ".jpeg" or ".webp" or ".gif" or ".avif" or ".bmp" or ".ico" or ".mp4" or ".webm")) continue;
                    string dest = Path.Combine(folder, $"{++n:000}{ext}");
                    if (u.Host.Equals(MediaHost, StringComparison.OrdinalIgnoreCase))
                    {
                        // One of your own pictures: copied from the launcher's media folder.
                        var src = Path.Combine(MediaDir, Path.GetFileName(u.AbsolutePath));
                        if (File.Exists(src)) File.Copy(src, dest, overwrite: true); else n--;
                        continue;
                    }
                    using var r = await PackWeb.GetAsync(u, HttpCompletionOption.ResponseHeadersRead);
                    if (!r.IsSuccessStatusCode || (r.Content.Headers.ContentLength ?? 0) > 40_000_000) { n--; continue; }
                    var bytes = await r.Content.ReadAsByteArrayAsync();
                    if (bytes.Length > 40_000_000) { n--; continue; }
                    await File.WriteAllBytesAsync(dest, bytes);
                }
                catch { }
            }
            reply["ok"] = n > 0;
            reply["count"] = n;
            reply["folder"] = folder;
            if (n == 0) reply["error"] = "None of its pictures could be saved.";
            else Process.Start(new ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = false })?.Dispose();
        }
        catch (Exception ex) { StartupGuard.Log("Image pack", ex); reply["error"] = "Couldn't make the image pack."; }
        Send(reply);
    }
}

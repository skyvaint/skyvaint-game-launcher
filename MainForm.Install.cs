using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Skyvaint;

// Settings → INSTALLATION: apps the launcher works with (stores, Roblox Studio, PCSX2, OpenRGB…), installed with
// winget, Windows' own app installer. The page asks which of them are installed and starts installs and updates;
// each one runs hidden and the page hears when it is done.
public sealed partial class MainForm
{
    readonly HashSet<string> installing = new(StringComparer.OrdinalIgnoreCase);

    bool OnInstallMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "installList": _ = InstallList(); return true;
            case "installApp": _ = InstallApp(m["id"]?.ToString() ?? "", m["upgrade"]?.GetValue<bool>() == true); return true;
        }
        return false;
    }

    static ProcessStartInfo Winget(string args) => new("winget", args)
    {
        UseShellExecute = false, CreateNoWindow = true,
        RedirectStandardOutput = true, RedirectStandardError = true,
    };

    /// <summary>Every winget package id on this PC (from "winget export", which gives exact ids, unlike "winget list").</summary>
    async Task InstallList()
    {
        var ids = new JsonArray();
        string error = "";
        try
        {
            string file = Path.Combine(Path.GetTempPath(), "skyvaint-winget-" + Guid.NewGuid().ToString("N") + ".json");
            using (var p = Process.Start(Winget($"export -o \"{file}\" --accept-source-agreements --disable-interactivity")))
            {
                if (p == null) throw new Exception("winget didn't start");
                _ = p.StandardOutput.ReadToEndAsync();
                _ = p.StandardError.ReadToEndAsync();
                await p.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(90));
            }
            if (File.Exists(file))
            {
                var json = JsonNode.Parse(await File.ReadAllTextAsync(file));
                foreach (var src in json?["Sources"] as JsonArray ?? [])
                    foreach (var pkg in src?["Packages"] as JsonArray ?? [])
                        if (pkg?["PackageIdentifier"]?.ToString() is { Length: > 0 } id) ids.Add(id);
                try { File.Delete(file); } catch { }
            }
        }
        catch (Exception ex)
        {
            error = ex is System.ComponentModel.Win32Exception ? "winget isn't on this PC. Get \"App Installer\" from the Microsoft Store." : "Couldn't read what is installed.";
            StartupGuard.Log("Install list", ex);
        }
        Send(new JsonObject { ["type"] = "installList", ["ids"] = ids, ["busy"] = new JsonArray(installing.Select(x => (JsonNode)x).ToArray()), ["error"] = error });
    }

    async Task InstallApp(string id, bool upgrade)
    {
        // Only package ids: letters, digits, dots, dashes (nothing that could reach the command line as an option).
        if (id.Length is 0 or > 80 || !id.All(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_') || !installing.Add(id)) return;
        StartupGuard.Log((upgrade ? "Update: " : "Install: ") + id);
        Send(new JsonObject { ["type"] = "installState", ["id"] = id, ["state"] = "busy" });
        int code = -1;
        string tail = "";
        try
        {
            string verb = upgrade ? "upgrade" : "install";
            using var p = Process.Start(Winget($"{verb} --id {id} -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity"));
            if (p != null)
            {
                var outText = p.StandardOutput.ReadToEndAsync();
                _ = p.StandardError.ReadToEndAsync();
                await p.WaitForExitAsync().WaitAsync(TimeSpan.FromMinutes(30));
                code = p.ExitCode;
                tail = (await outText).Split('\n').Select(l => l.Trim()).LastOrDefault(l => l.Length > 3 && !l.All(c => c is '-' or '\\' or '|' or '/' or ' ')) ?? "";
            }
        }
        catch (Exception ex) { StartupGuard.Log("Install " + id, ex); }
        finally { installing.Remove(id); }
        // Already there / nothing newer count as fine.
        bool ok = code == 0 || code == unchecked((int)0x8A15002B) || code == unchecked((int)0x8A150061);
        StartupGuard.Log($"{(upgrade ? "Update" : "Install")} {id}: {(ok ? "done" : "failed " + code)}");
        Send(new JsonObject { ["type"] = "installState", ["id"] = id, ["state"] = ok ? "done" : "failed", ["note"] = ok ? "" : tail });
        if (ok) _ = RescanAfterInstall();
    }

    // A store or game app that was just installed: the page looks again, so its games show up.
    async Task RescanAfterInstall()
    {
        await Task.Delay(1500);
        try { Send(new JsonObject { ["type"] = "installedSomething" }); } catch { }
    }
}

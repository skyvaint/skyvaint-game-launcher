using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace Skyvaint;

// SETUP CHECK: what the launcher works with that isn't on this PC yet. On first start (and whenever something is
// still missing) the page offers to get it: Bloxstrap when there's no Roblox, Medal for clips, and the rest.
// Everything is optional except the WebView2 runtime, which the launcher's screen itself is drawn with.
public sealed partial class MainForm
{
    /// <summary>Official download pages. Opening a page (instead of downloading an installer ourselves) keeps the
    /// choice and the install with the user.</summary>
    const string WebView2Download = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    static bool AnyExists(params string?[] paths) => paths.Any(p => !string.IsNullOrEmpty(p) && File.Exists(p));

    static bool RobloxPlayerInstalled()
    {
        foreach (var dir in new[] { Path.Combine(LocalApp, "Bloxstrap", "Versions"), Path.Combine(LocalApp, "Roblox", "Versions"), Path.Combine(LocalApp, "Fishstrap", "Versions") })
        {
            try
            {
                if (Directory.Exists(dir) && Directory.GetDirectories(dir).Any(v => File.Exists(Path.Combine(v, "RobloxPlayerBeta.exe")))) return true;
            }
            catch { }
        }
        return false;
    }

    /// <summary>Each thing the launcher can use, whether this PC has it, and where to get it.</summary>
    JsonArray SetupItems()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string? steam = null;
        try { steam = Microsoft.Win32.Registry.GetValue(@"HKEY_CURRENT_USER\Software\Valve\Steam", "SteamExe", null)?.ToString()?.Replace('/', '\\'); } catch { }
        bool bloxstrap = File.Exists(BloxstrapExe);
        bool roblox = RobloxPlayerInstalled();

        JsonObject Item(string id, string name, string why, bool installed, string url, bool recommended) => new()
        {
            ["id"] = id, ["name"] = name, ["why"] = why, ["installed"] = installed, ["url"] = url, ["recommended"] = recommended,
        };
        return new JsonArray
        {
            // No Roblox at all: Bloxstrap installs it and keeps it updated (the launcher's Roblox update uses it too).
            Item("bloxstrap", "Bloxstrap", roblox && !bloxstrap
                    ? "Roblox is installed. Bloxstrap is optional: it lets the launcher keep Roblox updated in the background."
                    : "Roblox isn't on this PC. Bloxstrap installs Roblox, keeps it updated and adds FPS unlock and more.",
                bloxstrap, "https://bloxstraplabs.com/", recommended: !roblox),
            Item("medal", "Medal", "Records your clips. The CLIPS page and quests read your Medal library.",
                AnyExists(Path.Combine(LocalApp, "Medal", "Medal.exe"), Path.Combine(LocalApp, "Medal", "current", "Medal.exe")),
                "https://medal.tv/download", recommended: true),
            Item("steam", "Steam", "Your Steam library shows up on the shelf by itself.",
                AnyExists(steam, Path.Combine(pf86, "Steam", "steam.exe"), Path.Combine(pf, "Steam", "steam.exe")),
                "https://store.steampowered.com/about/", recommended: false),
            Item("epic", "Epic Games Launcher", "Fortnite, Rocket League and your other Epic games, with account switching.",
                EpicAccounts.Installed, "https://store.epicgames.com/download", recommended: false),
            Item("discord", "Discord", "Shows what you're playing on your profile (Rich Presence) and the friends rows.",
                AnyExists(Path.Combine(LocalApp, "Discord", "Update.exe")), "https://discord.com/download", recommended: false),
            Item("webview2", "Microsoft Edge WebView2", "Draws the launcher's screens. Already working if you can read this.",
                WebView2Version() != null, WebView2Download, recommended: true),
        };
    }

    static string? WebView2Version()
    {
        try { return CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch { return null; }
    }

    /// <summary>Before the page exists: without the WebView2 runtime there is nothing to show, so ask here.</summary>
    static bool EnsureWebView2(IWin32Window? owner, string title)
    {
        if (WebView2Version() != null) return true;
        var answer = MessageBox.Show(owner,
            "The launcher needs the Microsoft Edge WebView2 Runtime, which isn't installed on this PC.\n\nOpen Microsoft's download page now? Install it, then start the launcher again.",
            title, MessageBoxButtons.YesNo, MessageBoxIcon.Information);
        if (answer == DialogResult.Yes) OpenSetupUrl(WebView2Download);
        return false;
    }

    static void OpenSetupUrl(string url)
    {
        if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return;
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose(); } catch { }
    }

    bool OnSetupMessage(JsonObject m)
    {
        string Str(string key) => m[key]?.ToString() ?? "";
        switch (Str("type"))
        {
            case "setupCheck":
                Send(new JsonObject { ["type"] = "setupCheck", ["items"] = SetupItems(), ["auto"] = m["auto"]?.GetValue<bool>() == true });
                return true;
            case "setupGet":
                // Only the pages listed above; the id picks one, so the page can't open anything else.
                var item = SetupItems().OfType<JsonObject>().FirstOrDefault(i => i["id"]?.ToString() == Str("id"));
                if (item != null) OpenSetupUrl(item["url"]?.ToString() ?? "");
                return true;
        }
        return false;
    }
}

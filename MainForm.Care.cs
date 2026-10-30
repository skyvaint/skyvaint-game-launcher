using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace Skyvaint;

// Looking after the launcher itself: hotkeys you can change, a memory limit, undoing a setting that crashed the
// page, updating straight from the code (pull, rebuild, start again), and the setup wizard's checks.
public sealed partial class MainForm
{
    // ---------- hotkeys ----------

    string hotkeySig = "";

    static (uint mods, uint vk)? ParseHotkey(string keys)
    {
        uint mods = 0, vk = 0;
        foreach (var part in keys.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var p = part.ToUpperInvariant();
            switch (p)
            {
                case "ALT": mods |= 1; break;
                case "CTRL": case "CONTROL": mods |= 2; break;
                case "SHIFT": mods |= 4; break;
                case "WIN": case "WINDOWS": mods |= 8; break;
                default:
                    vk = p switch
                    {
                        "HOME" => 0x24, "END" => 0x23, "INSERT" or "INS" => 0x2D, "DELETE" or "DEL" => 0x2E, "PAGEUP" => 0x21, "PAGEDOWN" => 0x22,
                        "SPACE" => 0x20, "TAB" => 0x09, "ESC" or "ESCAPE" => 0x1B, "ENTER" => 0x0D, "`" or "BACKQUOTE" => 0xC0,
                        _ when p.Length > 1 && p[0] == 'F' && int.TryParse(p[1..], out var f) && f is >= 1 and <= 24 => (uint)(0x6F + f),
                        _ when p.Length == 1 && char.IsLetterOrDigit(p[0]) => p[0],
                        _ => 0,
                    };
                    break;
            }
        }
        return vk == 0 ? null : (mods | 0x4000 /* no repeat */, vk);
    }

    /// <summary>Show / hide the launcher (default Ctrl+Alt+Home) and open the menu (default Ctrl+Alt+M).</summary>
    void RegisterHotkeys()
    {
        string show = config?["behavior"]?["hotkeyShow"]?.ToString() is { Length: > 0 } a ? a : "Ctrl+Alt+Home";
        string menu = config?["behavior"]?["hotkeyMenu"]?.ToString() is { Length: > 0 } b ? b : "Ctrl+Alt+M";
        var sig = show + "|" + menu;
        if (sig == hotkeySig) return;
        hotkeySig = sig;
        UnregisterHotKey(Handle, 1);
        UnregisterHotKey(Handle, 2);
        bool ok1 = ParseHotkey(show) is { } h1 && RegisterHotKey(Handle, 1, h1.mods, h1.vk);
        bool ok2 = menu.Equals("off", StringComparison.OrdinalIgnoreCase) || (ParseHotkey(menu) is { } h2 && RegisterHotKey(Handle, 2, h2.mods, h2.vk));
        if (pageReady && (!ok1 || !ok2))
            Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = $"{(!ok1 ? show : menu)} is taken by another app. Pick another shortcut." });
    }

    void OpenMenuHotkey()
    {
        if (mode != "home") SetMode("home");
        Activate();
        Send(new JsonObject { ["type"] = "openMenu" });
    }

    // ---------- memory ----------

    readonly System.Windows.Forms.Timer memoryTimer = new() { Interval = 10000 };
    [DllImport("kernel32.dll")] static extern bool SetProcessWorkingSetSize(IntPtr process, IntPtr min, IntPtr max);

    /// <summary>The launcher's own memory plus its page processes, in MB.</summary>
    async Task<(long mb, List<int> pids)> MemoryNow()
    {
        var pids = new List<int> { Environment.ProcessId };
        try
        {
            // The page runs in WebView2's own processes: its browser process and everything under it.
            // The page objects belong to the window's thread.
            int root = InvokeRequired ? (int)Invoke(() => web?.CoreWebView2 != null ? (int)web.CoreWebView2.BrowserProcessId : 0) : web?.CoreWebView2 != null ? (int)web.CoreWebView2.BrowserProcessId : 0;
            if (root > 0) pids.AddRange(Tree(root));
        }
        catch { }
        await Task.CompletedTask;
        long bytes = 0;
        foreach (var id in pids.Distinct())
        {
            try { using var p = Process.GetProcessById(id); bytes += p.PrivateMemorySize64; } catch { }
        }
        return (bytes / (1024 * 1024), pids);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32 { public uint dwSize, cntUsage, th32ProcessID; public IntPtr th32DefaultHeapID; public uint th32ModuleID, cntThreads, th32ParentProcessID; public int pcPriClassBase; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile; }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref PROCESSENTRY32 e);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref PROCESSENTRY32 e);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    /// <summary>A process and every process started under it.</summary>
    static List<int> Tree(int root)
    {
        var parent = new Dictionary<int, int>();
        var snap = CreateToolhelp32Snapshot(2, 0);
        try
        {
            var e = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf<PROCESSENTRY32>() };
            if (Process32FirstW(snap, ref e)) do parent[(int)e.th32ProcessID] = (int)e.th32ParentProcessID; while (Process32NextW(snap, ref e));
        }
        finally { CloseHandle(snap); }
        var all = new List<int> { root };
        for (int i = 0; i < all.Count; i++) all.AddRange(parent.Where(kv => kv.Value == all[i] && kv.Key != all[i] && !all.Contains(kv.Key)).Select(kv => kv.Key));
        return all;
    }

    int MemoryLimit() { try { return Math.Max(0, config?["perf"]?["memoryLimit"]?.GetValue<int>() ?? 0); } catch { return 0; } }
    string MemorySaver() => config?["perf"]?["memorySaver"]?.ToString() ?? "balanced";

    /// <summary>Frees what it can: the pages are told to use little memory, caches are dropped, and Windows takes
    /// back the memory the processes aren't using right now.</summary>
    async Task Trim(List<int> pids, bool hard)
    {
        try
        {
            // Only pages that are out of sight are made lean: shrinking one that is on screen can leave it black.
            foreach (var core in new[] { OutOfSight() ? web?.CoreWebView2 : null, sidePanel != null && !sidePanel.Visible && !sidePanel.InWindow ? sidePanel.Core : null })
            {
                if (core == null) continue;
                core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
                if (hard) { try { await core.CallDevToolsProtocolMethodAsync("Network.clearBrowserCache", "{}"); } catch { } }
            }
        }
        catch { }
        GC.Collect(2, GCCollectionMode.Aggressive, true, true);
        foreach (var id in pids.Distinct())
        {
            try { using var p = Process.GetProcessById(id); SetProcessWorkingSetSize(p.Handle, -1, -1); } catch { }
        }
    }

    /// <summary>True only when the launcher can't be seen at all (in the tray or minimized). The mini mode and the
    /// dock are on screen, so they count as seen.</summary>
    bool OutOfSight() => !Visible || WindowState == FormWindowState.Minimized;

    /// <summary>The page goes back to full memory the moment it can be seen again, so it draws straight away.</summary>
    void WakePages()
    {
        try { if (web?.CoreWebView2 != null) web.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal; } catch { }
        try { if (sidePanel?.Core != null) sidePanel.Core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal; } catch { }
    }

    void StartMemoryCare()
    {
        VisibleChanged += (_, _) => { if (Visible) WakePages(); };
        Activated += (_, _) => WakePages();
        Resize += (_, _) => { if (WindowState != FormWindowState.Minimized) WakePages(); };
        memoryTimer.Tick += async (_, _) =>
        {
            var saver = MemorySaver();
            int limit = MemoryLimit();
            var (mb, pids) = await MemoryNow();
            bool away = OutOfSight();
            // Off: nothing. Balanced and Max: lean only while out of sight (a page on screen is never shrunk,
            // that is what could turn it black). Max also trims harder.
            var level = saver != "off" && away ? CoreWebView2MemoryUsageTargetLevel.Low : CoreWebView2MemoryUsageTargetLevel.Normal;
            try { if (web?.CoreWebView2 != null && saver != "off") web.CoreWebView2.MemoryUsageTargetLevel = level; } catch { }
            if (limit > 0 && mb > limit && away) { await Trim(pids, hard: true); (mb, _) = await MemoryNow(); }
            else if (saver != "off" && away) await Trim(pids, hard: saver == "max");
            if (pageReady) Send(new JsonObject { ["type"] = "memory", ["mb"] = mb, ["limit"] = limit });
        };
        memoryTimer.Start();
    }

    // ---------- a setting that crashed the page is undone ----------

    JsonObject? configBeforeChange;
    DateTime changedAt = DateTime.MinValue;
    DateTime lastCrash = DateTime.MinValue;

    /// <summary>Called with the settings as they were, each time the page saves new ones.</summary>
    void RememberBeforeChange(JsonObject? previous)
    {
        if (previous == null) return;
        configBeforeChange = previous.DeepClone() as JsonObject;
        changedAt = DateTime.Now;
    }

    void WatchPageCrashes(CoreWebView2 core)
    {
        core.ProcessFailed += (_, e) =>
        {
            BeginInvoke(() =>
            {
                bool recent = DateTime.Now - changedAt < TimeSpan.FromSeconds(20);
                bool again = DateTime.Now - lastCrash < TimeSpan.FromSeconds(60);
                lastCrash = DateTime.Now;
                string query = "";
                // Crashed or froze right after a change: put the settings from before it back.
                if ((recent || again) && configBeforeChange != null)
                {
                    config = configBeforeChange;
                    configBeforeChange = null;
                    WriteJson(ConfigPath, config);
                    query = "?recovered=1";
                }
                if (again) query = query == "" ? "?safe=1" : query + "&safe=1";
                try { web.CoreWebView2?.Navigate("https://skyvaint.example/index.html" + query); } catch { try { web.Reload(); } catch { } }
            });
        };
    }

    // ---------- update straight from the code ----------

    /// <summary>The source folder this copy was built from (bin\Release\net9.0-windows sits inside it).</summary>
    static string? SourceDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 5 && dir != null; i++, dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "SkyvaintGameLauncher.csproj"))) return dir.FullName;
        return null;
    }

    static string? OnPath(string exe)
    {
        foreach (var d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try { var p = Path.Combine(d.Trim(), exe); if (File.Exists(p)) return p; } catch { }
        }
        return null;
    }

    /// <summary>Pulls the newest code, rebuilds from scratch and starts again with your data. The launcher saves
    /// and closes first; a small window shows the build, and stays open if something goes wrong.</summary>
    void UpdateFromCode()
    {
        var src = SourceDir();
        if (src == null) { Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "This copy wasn't built from source here. Use INSTALL UPDATE instead." }); return; }
        if (OnPath("dotnet.exe") == null) { Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "The .NET SDK isn't installed, so the launcher can't rebuild itself." }); return; }
        bool git = OnPath("git.exe") != null && Directory.Exists(Path.Combine(src, ".git"));
        var exe = Path.Combine(src, "bin", "Release", "net9.0-windows", "SkyvaintGameLauncher.exe");
        var script = Path.Combine(Path.GetTempPath(), "skyvaint-update.cmd");
        File.WriteAllText(script, $"""
@echo off
title Skyvaint - updating
echo Waiting for the launcher to save and close...
:wait
tasklist /FI "PID eq {Environment.ProcessId}" | find "{Environment.ProcessId}" >NUL && (timeout /t 1 /nobreak >NUL & goto wait)
cd /d "{src}"
{(git ? "echo Getting the newest code...\r\ngit pull --ff-only || echo Could not pull (local changes?). Building what is here." : "echo No git here: rebuilding the code as it is.")}
echo Rebuilding from scratch...
dotnet build -c Release --no-incremental -nologo -v q
if errorlevel 1 (
  echo.
  echo The build failed. Your data is untouched. Press a key to start the old copy.
  pause >NUL
)
start "" "{exe}"
""");
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"{script}\"") { UseShellExecute = true, WindowStyle = ProcessWindowStyle.Minimized })?.Dispose();
        Quit();
    }

    // ---------- the setup wizard's checks ----------

    JsonObject SetupCheck()
    {
        string? webview = null;
        try { webview = CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch { }
        long ramMb = 0;
        try { ramMb = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024 * 1024); } catch { }
        bool Proto(string p) => GameScanner.ProtocolCommand(p).HasValue;
        return new JsonObject
        {
            ["type"] = "careCheck",
            ["webview"] = webview ?? "",
            ["dotnet"] = Environment.Version.ToString(),
            ["os"] = Environment.OSVersion.VersionString,
            ["cores"] = Environment.ProcessorCount,
            ["ramMb"] = ramMb,
            ["refresh"] = RefreshRate(),
            ["steam"] = Proto("steam"),
            ["epic"] = Proto("com.epicgames.launcher"),
            ["roblox"] = Proto("roblox-player"),
            ["pcsx2"] = Emulators.FindPcsx2(null) != null,
            ["parsec"] = Emulators.FindParsec() != null,
            ["sdk"] = OnPath("dotnet.exe") != null,
            ["git"] = OnPath("git.exe") != null,
        };
    }

    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
    [DllImport("gdi32.dll")] static extern int GetDeviceCaps(IntPtr dc, int index);
    static int RefreshRate()
    {
        var dc = GetDC(IntPtr.Zero);
        try { return GetDeviceCaps(dc, 116 /* VREFRESH */); } finally { ReleaseDC(IntPtr.Zero, dc); }
    }

    bool OnCareMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "careCheck": Send(SetupCheck()); return true;
            case "updateFromCode": UpdateFromCode(); return true;
            case "memoryNow": _ = Task.Run(async () => { var (mb, _) = await MemoryNow(); BeginInvoke(() => Send(new JsonObject { ["type"] = "memory", ["mb"] = mb, ["limit"] = MemoryLimit() })); }); return true;
            case "trimMemory": _ = Task.Run(async () => { var (_, pids) = await MemoryNow(); BeginInvoke(async () => { await Trim(pids, hard: true); var (mb, _) = await MemoryNow(); Send(new JsonObject { ["type"] = "memory", ["mb"] = mb, ["limit"] = MemoryLimit() }); }); }); return true;
        }
        return false;
    }
}

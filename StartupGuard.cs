using System.Text;

namespace Skyvaint;

/// <summary>
/// Keeps the launcher from ending up on a silent black screen. The window is near-black and the page stays invisible
/// until it has started, so anything that stops the start (a failing scan on someone's PC, a graphics driver that
/// can't draw with the GPU settings we ask for) used to look like "it's all pitch black" with nothing to go on.
///
///  - Everything that goes wrong is written to %LOCALAPPDATA%\SkyvaintGameLauncher\logs\launcher.log.
///  - A start that never reaches the page leaves a marker behind; the next start then uses safe graphics (no forced
///    GPU tricks, software drawing), and keeps doing so once that works. Settings → UPDATES can switch it back.
///  - <c>--safe-graphics</c> forces safe graphics for one start.
/// </summary>
static class StartupGuard
{
    static string LogDir => Path.Combine(DataSafety.Local, "logs");
    public static string LogFile => Path.Combine(LogDir, "launcher.log");
    static string PendingFlag => Path.Combine(DataSafety.Local, "start-pending.flag");
    static string SafeFlag => Path.Combine(DataSafety.Local, "safe-graphics.flag");
    static readonly object gate = new();

    /// <summary>Set by <c>--safe-graphics</c>.</summary>
    public static bool ForceSafe { get; set; }

    /// <summary>This start draws without the GPU tricks: asked for, chosen before, or the last start never loaded.</summary>
    public static bool SafeGraphics { get; private set; }
    /// <summary>Why safe graphics is on (shown in Settings → UPDATES).</summary>
    public static string SafeReason { get; private set; } = "";

    public static void Log(string what, Exception? ex = null)
    {
        try
        {
            lock (gate)
            {
                Directory.CreateDirectory(LogDir);
                var fi = new FileInfo(LogFile);
                if (fi.Exists && fi.Length > 1_000_000) File.Move(LogFile, LogFile + ".old", overwrite: true);
                var sb = new StringBuilder();
                sb.Append('[').Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")).Append("] ").Append(what);
                if (ex != null) sb.Append(Environment.NewLine).Append(ex);
                sb.Append(Environment.NewLine);
                File.AppendAllText(LogFile, sb.ToString());
            }
        }
        catch { }
    }

    /// <summary>Called before the page is created: decides the graphics mode and marks the start as pending.</summary>
    public static void BeginStart()
    {
        try
        {
            Directory.CreateDirectory(DataSafety.Local);
            if (ForceSafe) { SafeGraphics = true; SafeReason = "started with --safe-graphics"; }
            else if (File.Exists(SafeFlag)) { SafeGraphics = true; SafeReason = File.ReadAllText(SafeFlag).Trim(); }
            else if (File.Exists(PendingFlag))
            {
                // The previous start never got as far as showing the page: try again without the GPU tricks.
                SafeGraphics = true;
                SafeReason = "the last start didn't finish loading (" + File.ReadAllText(PendingFlag).Trim() + ")";
                Log("Previous start never reached the page; using safe graphics.");
            }
            File.WriteAllText(PendingFlag, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        }
        catch { }
        Log($"Start {typeof(StartupGuard).Assembly.GetName().Version}, {Environment.OSVersion}, safe graphics: {(SafeGraphics ? "on (" + SafeReason + ")" : "off")}");
    }

    /// <summary>The page is up. A safe start that worked stays safe, so it doesn't go black again next time.</summary>
    public static void Reached()
    {
        try
        {
            if (File.Exists(PendingFlag)) File.Delete(PendingFlag);
            if (SafeGraphics && !ForceSafe && !File.Exists(SafeFlag)) File.WriteAllText(SafeFlag, SafeReason);
        }
        catch { }
    }

    /// <summary>Settings → UPDATES: use the normal (GPU) drawing again from the next start, or switch safe mode on.</summary>
    public static void SetSafe(bool on)
    {
        try
        {
            if (on) File.WriteAllText(SafeFlag, "switched on in Settings");
            else { if (File.Exists(SafeFlag)) File.Delete(SafeFlag); if (File.Exists(PendingFlag)) File.Delete(PendingFlag); }
        }
        catch { }
    }

    /// <summary>The WebView2 switches for this start.</summary>
    public static string BrowserArgs(bool uncapped, bool dgpu)
    {
        const string common = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling";
        if (SafeGraphics) return common + " --disable-gpu --disable-gpu-compositing";
        var args = common + " --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist";
        if (uncapped) args += " --disable-frame-rate-limit --disable-gpu-vsync";
        if (dgpu) args += " --force_high_performance_gpu";
        return args;
    }
}

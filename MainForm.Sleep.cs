using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace Skyvaint;

// Page sleep: what gets the launcher near 100 MB while it sits in the tray.
//
// A live WebView2 is a whole browser (browser, GPU, renderer, network and storage processes) and never gets anywhere
// near that low, however much it is trimmed. Everything that has to keep running while you play already lives in
// this shell: spotting games, playtime, the hotkeys, the tray, Discord presence, the NEXUS bars and the widgets. So a
// while after the window goes away the page is closed for real, and all those processes end with it. Showing the
// launcher again loads the page back, without the opening animation.
public sealed partial class MainForm
{
    const int SleepAfterSeconds = 20;

    bool pageAsleep;
    Task? waking;
    DateTime awaySince = DateTime.MaxValue;
    readonly Queue<JsonObject> wakeQueue = new();

    // What the shell tells the page that matters even if nobody is looking: these wake it up and arrive afterwards.
    // Everything else is about what's on screen, and the page asks for it again when it loads.
    static readonly HashSet<string> NeedsPage = ["requestLaunch", "openNexus", "openMenu", "openWidgets", "nexusEdit", "widgetEdit", "socialAdd", "playSound"];

    static WebView2 NewPageView() => new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(7, 5, 5) };

    bool SleepAllowed()
    {
        if (config?["perf"]?["sleepHidden"] is JsonValue v && v.TryGetValue(out bool on) && !on) return false;
        if (MemorySaver() == "off") return false;
        // Music set to keep playing in the background is played by the page.
        var sound = config?["sound"];
        bool bgm = sound?["bgmInBackground"] is JsonValue b && b.TryGetValue(out bool yes) && yes;
        if (bgm && (sound?["bgmTracks"] as JsonArray)?.Count > 0) return false;
        return true;
    }

    /// <summary>Anything still going on that needs the page or its WebView2.</summary>
    bool PageBusy() => !pageReady || launchBusy || robloxPlaying || epicAwaiting || steamAwaiting || restoring || quitting || robloxUpdating
        || Application.OpenForms.OfType<LoginForm>().Any();

    /// <summary>Runs from the memory timer. Counts from the moment the launcher went out of sight.</summary>
    void CheckPageSleep()
    {
        if (!OutOfSight()) { awaySince = DateTime.MaxValue; return; }
        if (awaySince == DateTime.MaxValue) awaySince = DateTime.Now;
        if (pageAsleep || PageBusy() || !SleepAllowed()) return;
        if ((DateTime.Now - awaySince).TotalSeconds >= SleepAfterSeconds) PageSleep();
    }

    void PageSleep()
    {
        StartupGuard.Log("Page sleep");
        pageAsleep = true;
        pageReady = false;
        ReleaseRobloxPage();
        UnloadSidePanel();
        var old = web;
        web = NewPageView();
        Controls.Add(web);
        web.BringToFront();
        Controls.Remove(old);
        old.Dispose();
        mainEnv = null;
        mappedRoots = new List<string>();
        // The environments are COM objects; the browser processes end once nothing holds on to them.
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect(2, GCCollectionMode.Aggressive, true, true);
        try { using var me = System.Diagnostics.Process.GetCurrentProcess(); SetProcessWorkingSetSize(me.Handle, -1, -1); } catch { }
    }

    Task WakePage() => waking ??= DoWake();

    async Task DoWake()
    {
        StartupGuard.Log("Page wake");
        // The old browser may still be closing and holding its folder for a moment.
        for (int tries = 0; ; tries++)
        {
            try { await StartPage("?wake=1"); break; }
            catch (Exception ex) when (tries < 4)
            {
                StartupGuard.Log("Page wake, trying again", ex);
                await Task.Delay(400);
            }
            catch (Exception ex)
            {
                StartupGuard.Log("Page wake failed", ex);
                waking = null;
                return;
            }
        }
    }

    /// <summary>The page reported "ready" after a sleep.</summary>
    void PageAwake()
    {
        pageAsleep = false;
        waking = null;
        awaySince = OutOfSight() ? DateTime.Now : DateTime.MaxValue;
        Send(new JsonObject { ["type"] = "running", ["ids"] = new JsonArray(running.Select(i => (JsonNode)i!).ToArray()), ["stats"] = Stats().DeepClone() });
        while (wakeQueue.TryDequeue(out var m)) Send(m);
        if (Visible) { web.Focus(); WakePages(); }
    }

    // ---------- the Roblox pages and the side browser ----------

    readonly System.Windows.Forms.Timer robloxIdle = new() { Interval = 90000 };
    bool robloxIdleHooked;

    /// <summary>The hidden Roblox page is kept for a minute and a half after its last use, then let go.</summary>
    void TouchRobloxPage()
    {
        if (!robloxIdleHooked)
        {
            robloxIdleHooked = true;
            robloxIdle.Tick += async (_, _) =>
            {
                robloxIdle.Stop();
                if (!await robloxPageGate.WaitAsync(0)) { robloxIdle.Start(); return; }
                try { ReleaseRobloxPage(); } finally { robloxPageGate.Release(); }
            };
        }
        robloxIdle.Stop();
        robloxIdle.Start();
    }

    void ReleaseRobloxPage()
    {
        robloxIdle.Stop();
        if (friendsView != null) { Retire(friendsView); friendsView = null; }
        robloxEnv = null;
    }

    void UnloadSidePanel()
    {
        if (sidePanel == null || sidePanel.Visible || sidePanel.InWindow) return;
        sidePanel.Unload();
        browserEnv = null;
        browserEnvTask = null;
    }
}

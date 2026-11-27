using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Skyvaint;

// The aurora launch (wwwroot/js/aurora.js): the page plays it on the launcher's screen and asks for it here with
// "launchSequence". The shell then
//   - covers every other screen with the same auroras (they go black after the merge),
//   - keeps the launcher in front until the SKYVAINT title has had its moment, even if the game is already up,
//   - fades the launcher (and the other screens) out over 3 seconds into the game,
//   - and, if asked, keeps every other app quiet until all of that is done.
public sealed partial class MainForm
{
    DateTime seqStart = DateTime.MinValue;
    int seqTextAt, seqHold, seqFade = 3000;
    bool seqActive;
    readonly List<SeqForm> seqForms = new();
    readonly List<string> seqMuted = new();
    readonly object seqMuteLock = new();
    bool seqQuiet;
    System.Windows.Forms.Timer? seqMuteTimer;

    bool OnLaunchSeqMessage(JsonObject m)
    {
        // The page's launch screen closed (any kind of launch, Roblox too): the sequence is over.
        if (m["type"]?.ToString() == "launchSequenceEnd") { if (seqActive) { EndSequence(); DesktopPause(running.Count > 0); } return true; }
        if (m["type"]?.ToString() != "launchSequence") return false;
        seqActive = true;
        long start = m["start"]?.GetValue<long>() ?? DateTimeOffset.Now.ToUnixTimeMilliseconds();
        seqStart = DateTimeOffset.FromUnixTimeMilliseconds(start).LocalDateTime;
        seqTextAt = m["textAt"]?.GetValue<int>() ?? 6000;
        seqHold = m["hold"]?.GetValue<int>() ?? 1800;
        seqFade = Math.Clamp(m["fade"]?.GetValue<int>() ?? 3000, 200, 10000);
        var colors = (m["colors"] as JsonArray)?.Select(c => (c?.ToString() ?? "").TrimStart('#')).Where(c => c.Length == 6).ToArray() ?? [];
        // The other screens.
        var here = Visible ? Screen.FromControl(this) : Screen.PrimaryScreen;
        foreach (var s in Screen.AllScreens)
        {
            if (here != null && s.DeviceName == here.DeviceName) continue;
            var f = new SeqForm(this, s, start, string.Join(",", colors));
            seqForms.Add(f);
            f.Show();
        }
        if (m["quiet"]?.GetValue<bool>() == true) QuietOthers(true);
        DesktopPause(true); // other screens: the in-game aurora storm, from the launch on
        var mine = seqStart;
        // The other screens are black from the merge on: they fade away once the title has shown, whatever the game does.
        _ = Task.Delay(Math.Max(0, seqTextAt + seqHold - (int)(DateTime.Now - seqStart).TotalMilliseconds)).ContinueWith(_ => { try { BeginInvoke(() => { if (seqStart == mine) ReleaseScreens(); }); } catch { } }, TaskScheduler.Default);
        // Never stuck: everything (sound included) is put back after 20 seconds whatever happens.
        _ = Task.Delay(20000).ContinueWith(_ => { try { BeginInvoke(() => { if (seqStart == mine) EndSequence(); }); } catch { } }, TaskScheduler.Default);
        return true;
    }

    /// <summary>How long the launcher still waits once the game is up: until the title has shown long enough.</summary>
    int SeqSettle(int settle)
    {
        if (!seqActive) return settle;
        var until = seqStart.AddMilliseconds(seqTextAt + seqHold);
        return Math.Max(0, (int)(until - DateTime.Now).TotalMilliseconds);
    }

    /// <summary>The fade into the game: the launcher and the other screens together.</summary>
    async Task SeqFadeOut()
    {
        foreach (var f in seqForms) f.Fade(seqFade);
        int steps = Math.Max(12, seqFade / 30);
        for (int i = 1; i <= steps && !quitting; i++)
        {
            double t = (double)i / steps;
            base.Opacity = 1.0 - t * t * (3 - 2 * t);
            await Task.Delay(seqFade / steps);
        }
    }

    /// <summary>The other screens' launch windows fade out (the aurora storm wallpaper stays behind them).</summary>
    void ReleaseScreens()
    {
        var forms = seqForms.ToList();
        seqForms.Clear();
        foreach (var f in forms) f.Fade(900);
        _ = Task.Delay(1000).ContinueWith(_ => { try { BeginInvoke(() => { foreach (var f in forms) { try { f.Close(); f.Dispose(); } catch { } } }); } catch { } }, TaskScheduler.Default);
    }

    void EndSequence()
    {
        seqActive = false;
        seqStart = DateTime.MinValue;
        ReleaseScreens();
        QuietOthers(false);
        // A game that was never seen running must not leave the in-game auroras on.
        _ = Task.Delay(8000).ContinueWith(_ => { try { BeginInvoke(() => { if (!seqActive) DesktopPause(running.Count > 0); }); } catch { } }, TaskScheduler.Default);
    }

    /// <summary>Mutes every other app (the game too, as it starts) and later unmutes exactly those it muted.</summary>
    void QuietOthers(bool on)
    {
        seqMuteTimer?.Stop();
        seqMuteTimer?.Dispose();
        seqMuteTimer = null;
        if (!on)
        {
            // Behind the same lock as the sweep: one still running can't mute anything after this.
            void restore()
            {
                lock (seqMuteLock)
                {
                    seqQuiet = false;
                    foreach (var k in seqMuted) try { NowPlaying.AppVolume.SetApp(k, null, false); } catch { }
                    seqMuted.Clear();
                }
            }
            // Quitting: straight away, or the apps would stay muted.
            if (quitting) restore(); else Task.Run(restore);
            return;
        }
        lock (seqMuteLock) seqQuiet = true;
        void sweep() => Task.Run(() =>
        {
            lock (seqMuteLock)
            {
                if (!seqQuiet) return;
                try
                {
                    foreach (var (key, _, _, muted) in NowPlaying.AppVolume.All())
                    {
                        if (muted || key is "skyvaintgamelauncher" or "msedgewebview2" || seqMuted.Contains(key)) continue;
                        seqMuted.Add(key);
                        NowPlaying.AppVolume.SetApp(key, null, true);
                    }
                }
                catch { }
            }
        });
        sweep();
        seqMuteTimer = new System.Windows.Forms.Timer { Interval = 400 };
        seqMuteTimer.Tick += (_, _) => sweep();
        seqMuteTimer.Start();
    }

    /// <summary>One other screen during the aurora launch.</summary>
    sealed class SeqForm : Form
    {
        readonly MainForm owner;
        readonly Screen screen;
        readonly long start;
        readonly string colors;
        readonly WebView2 view = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };

        public SeqForm(MainForm owner, Screen screen, long start, string colors)
        {
            this.owner = owner; this.screen = screen; this.start = start; this.colors = colors;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Bounds = screen.Bounds;
            BackColor = Color.Black;
            TopMost = true;
            Text = "Skyvaint launch";
            Controls.Add(view);
        }
        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x80; return cp; } }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, CacheDir, WebOptions());
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.SetVirtualHostNameToFolderMapping("skyvaint.example", Path.Combine(AppContext.BaseDirectory, "wwwroot"), CoreWebView2HostResourceAccessKind.Allow);
                core.Navigate($"https://skyvaint.example/desktop.html?layer=launch&t0={start}&c={Uri.EscapeDataString(colors)}");
            }
            catch (Exception ex) { StartupGuard.Log("Launch screens", ex); }
        }

        public async void Fade(int ms)
        {
            try { view.CoreWebView2?.PostWebMessageAsJson("{\"type\":\"fade\",\"ms\":" + ms + "}"); } catch { }
            int steps = Math.Max(12, ms / 30);
            try { for (int i = 1; i <= steps && !IsDisposed; i++) { Opacity = 1.0 - (double)i / steps; await Task.Delay(ms / steps); } } catch { }
        }
    }
}

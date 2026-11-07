using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Skyvaint;

// Desktop widgets (clock, music, performance, app grid): one WidgetForm each, fed fresh numbers every second.
// The page owns their settings (config.widgets); moving or removing one on the desktop is sent back to it to save.
public sealed partial class MainForm
{
    readonly Dictionary<string, WidgetForm> widgetForms = new();
    System.Windows.Forms.Timer? widgetTimer;
    bool widgetBusy;

    IEnumerable<JsonObject> WidgetConfigs() => (config?["widgets"]?["items"] as JsonArray)?.OfType<JsonObject>() ?? [];
    bool WidgetsLocked() { try { return config?["widgets"]?["locked"]?.GetValue<bool>() ?? true; } catch { return true; } }

    void EnsureWidgets()
    {
        var wanted = WidgetConfigs().Where(w => w["enabled"]?.GetValue<bool>() != false && w["id"] != null).ToDictionary(w => w["id"]!.ToString());
        foreach (var id in widgetForms.Keys.Where(id => !wanted.ContainsKey(id)).ToList())
        {
            widgetForms[id].Close();
            widgetForms[id].Dispose();
            widgetForms.Remove(id);
        }
        foreach (var (id, w) in wanted)
        {
            if (!widgetForms.TryGetValue(id, out var f)) widgetForms[id] = f = new WidgetForm(this, LocalImageFile, id);
            f.Configure(w, config?["theme"] as JsonObject, WidgetsLocked());
        }
        if (widgetForms.Count > 0)
        {
            WatchForeground();
            if (widgetTimer == null) { widgetTimer = new System.Windows.Forms.Timer { Interval = 1000 }; widgetTimer.Tick += (_, _) => _ = FeedWidgets(); }
            widgetTimer.Start();
            _ = FeedWidgets();
        }
        else widgetTimer?.Stop();
        UpdateBarVisibility();
    }

    async Task FeedWidgets()
    {
        if (widgetBusy || widgetForms.Count == 0) return;
        widgetBusy = true;
        try
        {
            var kinds = WidgetConfigs().Select(w => w["kind"]?.ToString()).ToHashSet();
            JsonObject? stats = kinds.Contains("perf") ? SystemStats.Read() : null;
            JsonObject? track = null;
            if (kinds.Contains("music")) track = await Task.Run(ReadTrack);
            foreach (var w in WidgetConfigs())
            {
                if (!widgetForms.TryGetValue(w["id"]?.ToString() ?? "", out var f)) continue;
                var kind = w["kind"]?.ToString();
                var d = kind == "perf" ? (JsonObject)stats!.DeepClone() : new JsonObject();
                if (kind == "music") { d["track"] = track?.DeepClone(); d["artFile"] = TrackArtFile ?? ""; }
                f.SetData(d);
            }
        }
        catch { }
        finally { widgetBusy = false; }
    }

    internal void OnWidgetMessage(JsonObject m)
    {
        var id = m["id"]?.ToString() ?? "";
        switch (m["type"]?.ToString())
        {
            case "moved":
            case "remove":
            case "lock":
                // The page owns the settings: it saves the change, which comes back here.
                Send(new JsonObject { ["type"] = "widgetEdit", ["op"] = m["type"]?.ToString(), ["id"] = id, ["x"] = m["x"]?.DeepClone(), ["y"] = m["y"]?.DeepClone() });
                break;
            case "manage":
                SetMode("home");
                Send(new JsonObject { ["type"] = "openWidgets" });
                break;
            case "action":
                var action = m["action"]?.ToString() ?? "";
                if (action.StartsWith("media:")) _ = Task.Run(async () => { await TrackCommand(action[6..]); await Task.Delay(300); BeginInvoke(() => _ = FeedWidgets()); });
                else if (action.StartsWith("app:") && int.TryParse(action[4..], out var i))
                {
                    var app = (WidgetConfigs().FirstOrDefault(w => w["id"]?.ToString() == id)?["apps"] as JsonArray)?.OfType<JsonObject>().ElementAtOrDefault(i);
                    var target = app?["target"]?.ToString() ?? "";
                    try
                    {
                        if (app?["sound"]?.ToString() is { Length: > 0 } s) Send(new JsonObject { ["type"] = "playSound", ["url"] = s });
                        if (app?["kind"]?.ToString() == "game") TrayLaunch(app["gameId"]?.ToString() ?? "");
                        else if (target != "") Process.Start(new ProcessStartInfo(target) { UseShellExecute = true, Arguments = app?["args"]?.ToString() ?? "" })?.Dispose();
                        OpenedFromBar();
                    }
                    catch { }
                }
                break;
        }
    }
}

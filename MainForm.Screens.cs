using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace Skyvaint;

// More than one screen. Settings → SYSTEM → Screen picks where HOME opens: the screen with the mouse (the old way),
// the main screen, the one it was on last, or one particular screen. MORE → Next screen (and the tray) moves the
// launcher to the next screen, and the launcher follows when screens are plugged in, unplugged or rearranged.
public sealed partial class MainForm
{
    bool screensHooked;

    /// <summary>Where HOME should open, from Settings → SYSTEM → Screen.</summary>
    Screen TargetScreen()
    {
        var all = Screen.AllScreens;
        var choice = Behavior("screen", "cursor");
        Screen? byName(string? name) => name == null ? null : all.FirstOrDefault(s => s.DeviceName.Equals(name, StringComparison.OrdinalIgnoreCase));
        return choice switch
        {
            "primary" => Screen.PrimaryScreen ?? all[0],
            "last" => byName(state["screen"]?.ToString()) ?? Screen.FromPoint(Cursor.Position),
            "cursor" => Screen.FromPoint(Cursor.Position),
            _ => byName(choice) ?? Screen.PrimaryScreen ?? all[0],
        };
    }

    JsonArray ScreenList()
    {
        var list = new JsonArray();
        var all = Screen.AllScreens;
        var now = Visible ? Screen.FromControl(this).DeviceName : "";
        for (int i = 0; i < all.Length; i++)
        {
            var s = all[i];
            list.Add(new JsonObject
            {
                ["name"] = s.DeviceName,
                ["label"] = $"Screen {i + 1} · {s.Bounds.Width}×{s.Bounds.Height}{(s.Primary ? " · main" : "")}",
                ["primary"] = s.Primary,
                ["current"] = s.DeviceName == now,
            });
        }
        return list;
    }

    void SendScreens() => Send(new JsonObject { ["type"] = "screens", ["screens"] = ScreenList() });

    /// <summary>Moves the launcher to a screen (the next one when <paramref name="name"/> is empty).</summary>
    void MoveToScreen(string? name)
    {
        var all = Screen.AllScreens;
        if (all.Length == 0) return;
        var here = Visible ? Screen.FromControl(this) : TargetScreen();
        int at = Array.FindIndex(all, s => s.DeviceName == here.DeviceName);
        var next = string.IsNullOrEmpty(name) || name is "cursor" or "last"
            ? all[(at + 1) % all.Length]
            : name == "primary" ? (Screen.PrimaryScreen ?? all[0]) : all.FirstOrDefault(s => s.DeviceName == name) ?? all[(at + 1) % all.Length];
        PlaceOn(next);
    }

    /// <summary>HOME as a compact window (Settings → Theme → MODE): rounded, about three quarters of the screen.</summary>
    bool HomeWindowed => config?["home"]?["window"] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    /// <summary>Where HOME goes on a screen: the whole screen, or the compact window (centred, or where you dragged it).</summary>
    Rectangle HomeBounds(Screen s)
    {
        if (!HomeWindowed) return s.Bounds;
        var wa = s.WorkingArea;
        float k = DeviceDpi / 96f;
        int w = (int)Math.Min(wa.Width * 0.74, 1560 * k), h = (int)Math.Min(wa.Height * 0.8, 940 * k);
        int x = wa.Left + (wa.Width - w) / 2, y = wa.Top + (wa.Height - h) / 2;
        if (state["winX"] is JsonValue sx && state["winY"] is JsonValue sy && sx.TryGetValue<int>(out int px) && sy.TryGetValue<int>(out int py))
        {
            // Where you left it, if that is still on this screen.
            var r = new Rectangle(px, py, w, h);
            if (wa.Contains(new Point(px + w / 2, py + 40))) { x = Math.Clamp(px, wa.Left, wa.Right - w); y = Math.Clamp(py, wa.Top, wa.Bottom - h); }
        }
        return new Rectangle(x, y, w, h);
    }

    /// <summary>The page's header was grabbed: Windows moves the window.</summary>
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    void DragWindow()
    {
        if (mode != "home" || !HomeWindowed) return;
        ReleaseCapture();
        SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); // WM_NCLBUTTONDOWN on the caption
    }

    void PlaceOn(Screen target)
    {
        state["screen"] = target.DeviceName;
        stateDirty = true;
        if (!Visible) { SendScreens(); return; }
        suppressMove = true;
        if (mode == "mini")
        {
            // Same corner on the other screen.
            var from = Screen.FromControl(this).WorkingArea;
            var to = target.WorkingArea;
            int x = to.Left + (int)((Left - from.Left) / (double)Math.Max(1, from.Width - Width) * Math.Max(0, to.Width - Width));
            int y = to.Top + (int)((Top - from.Top) / (double)Math.Max(1, from.Height - Height) * Math.Max(0, to.Height - Height));
            Location = new Point(Math.Clamp(x, to.Left, Math.Max(to.Left, to.Right - Width)), Math.Clamp(y, to.Top, Math.Max(to.Top, to.Bottom - Height)));
            state["miniX"] = Left;
            state["miniY"] = Top;
        }
        else if (mode == "home") { state.Remove("winX"); state.Remove("winY"); Bounds = HomeBounds(target); }
        suppressMove = false;
        SendScreens();
    }

    /// <summary>Screens plugged in, unplugged or rearranged: HOME keeps filling a screen that still exists.</summary>
    void HookScreens()
    {
        if (screensHooked) return;
        screensHooked = true;
        SystemEvents.DisplaySettingsChanged += (_, _) =>
        {
            if (IsDisposed || quitting) return;
            BeginInvoke(() =>
            {
                if (mode == "home" && Visible)
                {
                    var still = Screen.AllScreens.FirstOrDefault(s => s.Bounds.IntersectsWith(Bounds)) ?? TargetScreen();
                    suppressMove = true;
                    Bounds = HomeBounds(still);
                    suppressMove = false;
                }
                SendScreens();
            });
        };
    }

    bool OnScreenMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "screens":
                HookScreens();
                SendScreens();
                return true;
            case "dragWindow":
                DragWindow();
                return true;
            case "moveScreen":
                MoveToScreen(m["to"]?.ToString());
                return true;
            case "openItem":
            {
                // A HOME icon: the same as a NEXUS bar button (bring a running app forward, or open it on its own).
                var item = m["item"] as JsonObject;
                var target = item?["target"]?.ToString() ?? "";
                if (target == "") return true;
                try
                {
                    if (item?["process"]?.ToString() is { Length: > 0 } proc && FocusRunning(proc)) return true;
                    if (item?["kind"]?.ToString() == "url" && !System.Text.RegularExpressions.Regex.IsMatch(target, @"^[a-z][a-z0-9+.-]*://", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return true;
                    var psi = new ProcessStartInfo(target) { UseShellExecute = true, Arguments = item?["args"]?.ToString() ?? "" };
                    if (File.Exists(target)) psi.WorkingDirectory = Path.GetDirectoryName(target)!;
                    Detached.Start(psi);
                    if (Behavior("afterLaunch", "hidden") != "home" && item?["kind"]?.ToString() != "url") OpenedFromBar();
                }
                catch (Exception ex) { Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "Couldn't open " + item?["name"] + ": " + ex.Message }); }
                return true;
            }
            case "devFolder":
            {
                var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                var dir = m["which"]?.ToString() switch
                {
                    "plugins" => Path.Combine(local, "Roblox", "Plugins"),
                    "logs" => Path.Combine(local, "Roblox", "logs"),
                    _ => Path.Combine(local, "Roblox"),
                };
                if (Directory.Exists(dir)) { try { Process.Start("explorer.exe", $"\"{dir}\"")?.Dispose(); } catch { } }
                else Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "That folder isn't on this PC yet: " + dir });
                return true;
            }
        }
        return false;
    }
}

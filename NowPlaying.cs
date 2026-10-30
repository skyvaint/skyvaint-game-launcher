using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Windows.Media.Control;

namespace Skyvaint;

/// <summary>
/// "Now playing" from Windows' media controls (the same source as the media overlay on your volume keys), so it
/// works with Spotify, browsers, YouTube, Apple Music and anything else that reports what it plays. Gives the
/// song, artist, cover art, position and controls, plus the volume of that app on its own (Windows volume mixer).
/// </summary>
sealed class NowPlaying
{
    GlobalSystemMediaTransportControlsSessionManager? manager;
    readonly string mediaDir, mediaHost;
    string artKey = "", artUrl = "";

    public NowPlaying(string mediaDir, string mediaHost) { this.mediaDir = mediaDir; this.mediaHost = mediaHost; }

    async Task<GlobalSystemMediaTransportControlsSession?> Session()
    {
        manager ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        return manager.GetCurrentSession();
    }

    /// <summary>The current track, or { playing: false, none: true } when nothing reports anything.</summary>
    public async Task<JsonObject> Read()
    {
        var o = new JsonObject { ["type"] = "nowPlaying" };
        try
        {
            var s = await Session();
            if (s == null) { o["none"] = true; return o; }
            var props = await s.TryGetMediaPropertiesAsync();
            var pb = s.GetPlaybackInfo();
            var tl = s.GetTimelineProperties();
            o["title"] = props.Title ?? "";
            o["artist"] = props.Artist is { Length: > 0 } a ? a : props.AlbumArtist ?? "";
            o["album"] = props.AlbumTitle ?? "";
            o["app"] = AppName(s.SourceAppUserModelId);
            o["playing"] = pb.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            o["canNext"] = pb.Controls.IsNextEnabled;
            o["canPrev"] = pb.Controls.IsPreviousEnabled;
            o["canSeek"] = pb.Controls.IsPlaybackPositionEnabled;
            o["position"] = tl.Position.TotalSeconds;
            o["duration"] = (tl.EndTime - tl.StartTime).TotalSeconds;
            o["updated"] = tl.LastUpdatedTime.ToUnixTimeMilliseconds();
            o["rate"] = pb.PlaybackRate ?? 1.0;
            // Cover art: saved once per track so the page (and the widgets) can show it.
            var key = (props.Title ?? "") + "|" + o["artist"] + "|" + props.AlbumTitle;
            if (key != artKey)
            {
                artKey = key;
                artUrl = "";
                if (props.Thumbnail != null)
                {
                    try
                    {
                        using var stream = await props.Thumbnail.OpenReadAsync();
                        using var net = stream.AsStreamForRead();
                        using var ms = new MemoryStream();
                        await net.CopyToAsync(ms);
                        var name = "np_" + Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(key)), 0, 6).ToLowerInvariant() + ".jpg";
                        await File.WriteAllBytesAsync(Path.Combine(mediaDir, name), ms.ToArray());
                        foreach (var old in Directory.EnumerateFiles(mediaDir, "np_*.jpg"))
                            if (!old.EndsWith(name, StringComparison.OrdinalIgnoreCase)) try { File.Delete(old); } catch { }
                        artUrl = $"https://{mediaHost}/{name}";
                        ArtFile = Path.Combine(mediaDir, name);
                    }
                    catch { }
                }
            }
            o["art"] = artUrl;
            var vol = AppVolume.Get(s.SourceAppUserModelId);
            if (vol.HasValue) { o["appVolume"] = Math.Round(vol.Value.level * 100); o["appMuted"] = vol.Value.muted; }
        }
        catch (Exception ex) { o["none"] = true; o["error"] = ex.Message; }
        return o;
    }

    /// <summary>The cover art file of the current track (for the desktop widget), or null.</summary>
    public string? ArtFile { get; private set; }

    public async Task Command(string cmd, double value = 0)
    {
        var s = await Session();
        if (s == null) return;
        switch (cmd)
        {
            case "toggle": await s.TryTogglePlayPauseAsync(); break;
            case "next": await s.TrySkipNextAsync(); break;
            case "prev": await s.TrySkipPreviousAsync(); break;
            case "seek": await s.TryChangePlaybackPositionAsync(TimeSpan.FromSeconds(value).Ticks); break;
            case "volume": AppVolume.Set(s.SourceAppUserModelId, (float)(value / 100)); break;
            case "mute": AppVolume.Mute(s.SourceAppUserModelId, value > 0); break;
        }
    }

    static string AppName(string aumid)
    {
        if (string.IsNullOrEmpty(aumid)) return "";
        var n = aumid.Split('!')[0];
        n = Path.GetFileNameWithoutExtension(n.Contains('_') && !n.Contains('.') ? n.Split('_')[0] : n);
        if (n.Contains('.')) n = n.Split('.').Last(x => x.Length > 2);
        return n switch { "msedge" => "Edge", "chrome" => "Chrome", "brave" => "Brave", "opera" => "Opera", "firefox" => "Firefox", _ => char.ToUpper(n[0]) + n[1..] };
    }

    // ---------- the playing app's own volume (Windows volume mixer) ----------

    static class AppVolume
    {
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device); }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }

        [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioSessionManager2
        {
            int GetAudioSessionControl(IntPtr guid, uint flags, out IntPtr ctl);
            int GetSimpleAudioVolume(IntPtr guid, uint flags, out IntPtr vol);
            [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
        }

        [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl2 s); }

        [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioSessionControl2
        {
            int GetState(out int s); int GetDisplayName(out IntPtr n); int SetDisplayName(string n, ref Guid c); int GetIconPath(out IntPtr p);
            int SetIconPath(string p, ref Guid c); int GetGroupingParam(out Guid g); int SetGroupingParam(ref Guid g, ref Guid c);
            int RegisterAudioSessionNotification(IntPtr n); int UnregisterAudioSessionNotification(IntPtr n);
            int GetSessionIdentifier(out IntPtr id); int GetSessionInstanceIdentifier(out IntPtr id); int GetProcessId(out uint pid);
        }

        [ComImport, Guid("87CE5498-68D6-44E5-9215-6F7EE6A7E6A4"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface ISimpleAudioVolume
        {
            int SetMasterVolume(float level, ref Guid ctx); int GetMasterVolume(out float level);
            int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        }

        // Every audio session whose process matches the app that is playing (browsers have several).
        static List<ISimpleAudioVolume> For(string aumid)
        {
            var found = new List<ISimpleAudioVolume>();
            if (string.IsNullOrEmpty(aumid)) return found;
            var key = Path.GetFileNameWithoutExtension(aumid.Split('!')[0]).ToLowerInvariant();
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            if (enumerator.GetDefaultAudioEndpoint(0, 1, out var device) != 0) return found;
            var iid = typeof(IAudioSessionManager2).GUID;
            if (device.Activate(ref iid, 0x17, IntPtr.Zero, out var o) != 0) return found;
            if (((IAudioSessionManager2)o).GetSessionEnumerator(out var list) != 0) return found;
            list.GetCount(out int n);
            for (int i = 0; i < n; i++)
            {
                list.GetSession(i, out var ctl);
                ctl.GetProcessId(out uint pid);
                if (pid == 0) continue;
                string name;
                try { using var p = System.Diagnostics.Process.GetProcessById((int)pid); name = p.ProcessName.ToLowerInvariant(); } catch { continue; }
                if (key.Contains(name) || name.Contains(key) || (key.Contains("spotify") && name == "spotify")) found.Add((ISimpleAudioVolume)ctl);
            }
            return found;
        }

        public static (float level, bool muted)? Get(string aumid)
        {
            try
            {
                var v = For(aumid).FirstOrDefault();
                if (v == null) return null;
                v.GetMasterVolume(out var level);
                v.GetMute(out var muted);
                return (level, muted);
            }
            catch { return null; }
        }

        public static void Set(string aumid, float level)
        {
            var ctx = Guid.Empty;
            try { foreach (var v in For(aumid)) { v.SetMasterVolume(Math.Clamp(level, 0, 1), ref ctx); if (level > 0) v.SetMute(false, ref ctx); } } catch { }
        }

        public static void Mute(string aumid, bool on)
        {
            var ctx = Guid.Empty;
            try { foreach (var v in For(aumid)) v.SetMute(on, ref ctx); } catch { }
        }
    }
}

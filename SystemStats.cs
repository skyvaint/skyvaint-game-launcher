using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// The numbers in the profile panel: CPU use, memory, each drive's used and free space, and the Windows volume
/// (read and set through the Core Audio API, the same control as the taskbar volume slider).
/// </summary>
static class SystemStats
{
    [StructLayout(LayoutKind.Sequential)]
    struct FILETIME { public uint Low, High; public ulong Value => ((ulong)High << 32) | Low; }

    [DllImport("kernel32.dll")]
    static extern bool GetSystemTimes(out FILETIME idle, out FILETIME kernel, out FILETIME user);

    [StructLayout(LayoutKind.Sequential)]
    struct MEMORYSTATUSEX
    {
        public uint Length, MemoryLoad;
        public ulong TotalPhys, AvailPhys, TotalPageFile, AvailPageFile, TotalVirtual, AvailVirtual, AvailExtendedVirtual;
    }

    [DllImport("kernel32.dll")]
    static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX status);

    static ulong lastIdle, lastTotal;
    static double lastCpu;

    /// <summary>CPU use since the previous call (the first call compares with the moment the launcher started).</summary>
    static double Cpu()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return lastCpu;
        ulong total = kernel.Value + user.Value; // kernel time includes idle time
        ulong dTotal = total - lastTotal, dIdle = idle.Value - lastIdle;
        lastTotal = total; lastIdle = idle.Value;
        if (dTotal == 0) return lastCpu;
        lastCpu = Math.Clamp(100.0 * (dTotal - dIdle) / dTotal, 0, 100);
        return lastCpu;
    }

    public static JsonObject Read()
    {
        var o = new JsonObject { ["cpu"] = Math.Round(Cpu(), 1) };
        var mem = new MEMORYSTATUSEX { Length = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (GlobalMemoryStatusEx(ref mem))
        {
            o["ramTotal"] = mem.TotalPhys;
            o["ramUsed"] = mem.TotalPhys - mem.AvailPhys;
        }
        var drives = new JsonArray();
        foreach (var d in DriveInfo.GetDrives())
        {
            try
            {
                if (!d.IsReady || d.DriveType is not (DriveType.Fixed or DriveType.Removable)) continue;
                drives.Add(new JsonObject
                {
                    ["name"] = d.Name.TrimEnd('\\'), ["label"] = d.VolumeLabel, ["total"] = d.TotalSize, ["free"] = d.AvailableFreeSpace,
                });
            }
            catch { }
        }
        o["drives"] = drives;
        try
        {
            var (vol, muted) = Volume.Get();
            o["volume"] = Math.Round(vol * 100);
            o["muted"] = muted;
        }
        catch { }
        return o;
    }

    // ---------- Windows volume (Core Audio) ----------

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int NotImpl1();
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object endpoint);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint count);
        int SetMasterVolumeLevel(float level, ref Guid context);
        int SetMasterVolumeLevelScalar(float level, ref Guid context);
        int GetMasterVolumeLevel(out float level);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
        int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
        int GetChannelVolumeLevel(uint channel, out float level);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    public static class Volume
    {
        static IAudioEndpointVolume Endpoint()
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0 /* render */, 1 /* multimedia */, out var device));
            var iid = typeof(IAudioEndpointVolume).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 0x17 /* CLSCTX_ALL */, IntPtr.Zero, out var endpoint));
            return (IAudioEndpointVolume)endpoint;
        }

        public static (float level, bool muted) Get()
        {
            var ep = Endpoint();
            ep.GetMasterVolumeLevelScalar(out var level);
            ep.GetMute(out var muted);
            return (level, muted);
        }

        public static void Set(float level)
        {
            var ep = Endpoint();
            var ctx = Guid.Empty;
            ep.SetMasterVolumeLevelScalar(Math.Clamp(level, 0f, 1f), ref ctx);
            if (level > 0) ep.SetMute(false, ref ctx);
        }

        public static void Mute(bool on)
        {
            var ctx = Guid.Empty;
            Endpoint().SetMute(on, ref ctx);
        }
    }
}

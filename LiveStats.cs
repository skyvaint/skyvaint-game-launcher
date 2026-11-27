using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Skyvaint;

/// <summary>
/// GPU use, video memory, disk activity and network speed, from Windows' own performance counters (the ones Task
/// Manager shows). Only read while something shows them: <see cref="Sample"/> is called once a second by the hover
/// panel, and <see cref="Close"/> lets go of everything when it hides.
/// </summary>
static class LiveStats
{
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern int PdhOpenQuery(string? source, IntPtr user, out IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern int PdhAddEnglishCounter(IntPtr query, string path, IntPtr user, out IntPtr counter);
    [DllImport("pdh.dll")] static extern int PdhCollectQueryData(IntPtr query);
    [DllImport("pdh.dll")] static extern int PdhCloseQuery(IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)] static extern int PdhGetFormattedCounterArray(IntPtr counter, uint format, ref uint bytes, out uint count, IntPtr buffer);

    const uint PDH_FMT_DOUBLE = 0x200, PDH_FMT_NOCAP100 = 0x8000;
    const int PDH_MORE_DATA = unchecked((int)0x800007D2);

    static IntPtr query, gpu, vram, diskIdle, netIn, netOut;
    static readonly object gate = new();

    public record Snapshot(double Gpu, double VramUsed, double VramTotal, double Disk, double NetIn, double NetOut);

    static void Open()
    {
        if (query != IntPtr.Zero) return;
        if (PdhOpenQuery(null, IntPtr.Zero, out query) != 0) { query = IntPtr.Zero; return; }
        PdhAddEnglishCounter(query, @"\GPU Engine(*engtype_3D)\Utilization Percentage", IntPtr.Zero, out gpu);
        PdhAddEnglishCounter(query, @"\GPU Adapter Memory(*)\Dedicated Usage", IntPtr.Zero, out vram);
        PdhAddEnglishCounter(query, @"\PhysicalDisk(_Total)\% Idle Time", IntPtr.Zero, out diskIdle);
        PdhAddEnglishCounter(query, @"\Network Interface(*)\Bytes Received/sec", IntPtr.Zero, out netIn);
        PdhAddEnglishCounter(query, @"\Network Interface(*)\Bytes Sent/sec", IntPtr.Zero, out netOut);
        PdhCollectQueryData(query); // rates need two readings: the first is the baseline
    }

    /// <summary>Every instance's value of one counter.</summary>
    static List<double> Values(IntPtr counter)
    {
        var list = new List<double>();
        if (counter == IntPtr.Zero) return list;
        uint bytes = 0;
        if (PdhGetFormattedCounterArray(counter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref bytes, out _, IntPtr.Zero) != PDH_MORE_DATA || bytes == 0) return list;
        var buf = Marshal.AllocHGlobal((int)bytes);
        try
        {
            if (PdhGetFormattedCounterArray(counter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref bytes, out uint n, buf) != 0) return list;
            // Each item: a name pointer, then PDH_FMT_COUNTERVALUE { uint status; (pad) double value }.
            int size = IntPtr.Size + 16;
            for (int i = 0; i < n; i++)
            {
                IntPtr at = buf + i * size;
                uint status = (uint)Marshal.ReadInt32(at + IntPtr.Size);
                if (status is 0 or 1) list.Add(BitConverter.Int64BitsToDouble(Marshal.ReadInt64(at + IntPtr.Size + 8)));
            }
        }
        finally { Marshal.FreeHGlobal(buf); }
        return list;
    }

    public static Snapshot? Sample()
    {
        lock (gate)
        {
            try
            {
                Open();
                if (query == IntPtr.Zero || PdhCollectQueryData(query) != 0) return null;
                double g = Math.Clamp(Values(gpu).Sum(), 0, 100);
                var v = Values(vram);
                var idle = Values(diskIdle);
                return new Snapshot(g, v.Count > 0 ? v.Max() : 0, VramTotal(),
                    idle.Count > 0 ? Math.Clamp(100 - idle[0], 0, 100) : 0, Values(netIn).Sum(), Values(netOut).Sum());
            }
            catch { return null; }
        }
    }

    public static void Close()
    {
        lock (gate)
        {
            if (query != IntPtr.Zero) PdhCloseQuery(query);
            query = gpu = vram = diskIdle = netIn = netOut = IntPtr.Zero;
        }
    }

    static double vramTotal = -1;
    /// <summary>The biggest graphics card's own memory, as its driver reports it.</summary>
    static double VramTotal()
    {
        if (vramTotal >= 0) return vramTotal;
        vramTotal = 0;
        try
        {
            using var cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}");
            foreach (var name in cls?.GetSubKeyNames() ?? [])
            {
                if (name.Length != 4 || !name.All(char.IsDigit)) continue;
                using var k = cls!.OpenSubKey(name);
                var q = k?.GetValue("HardwareInformation.qwMemorySize");
                double bytes = q switch { long l => l, byte[] b when b.Length >= 8 => BitConverter.ToInt64(b, 0), _ => 0 };
                if (bytes <= 0 && k?.GetValue("HardwareInformation.MemorySize") is int i) bytes = (uint)i;
                vramTotal = Math.Max(vramTotal, bytes);
            }
        }
        catch { }
        return vramTotal;
    }
}

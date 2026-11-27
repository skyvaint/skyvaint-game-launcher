using System.Net.Sockets;
using System.Text;

namespace Skyvaint;

/// <summary>
/// A small client for OpenRGB's SDK server (OpenRGB → SDK Server → Start, port 6742). OpenRGB talks to the RGB parts
/// of almost every brand (keyboards, mice, RAM, fans, motherboards, GPUs); this asks it for the devices and sets
/// their colours. Protocol version 1 is enough: names, LED counts and setting colours directly.
/// </summary>
public sealed class OpenRgb : IDisposable
{
    public sealed record Device(int Index, string Name, int Type, int Leds, bool HasDirect);

    const uint RequestControllerCount = 0, RequestControllerData = 1, RequestProtocolVersion = 40, SetClientName = 50,
        UpdateLeds = 1050, SetCustomMode = 1100;
    const uint ClientProtocol = 1;

    TcpClient? tcp;
    NetworkStream? net;
    uint protocol;
    public List<Device> Devices { get; } = new();
    public bool Connected => tcp?.Connected == true;

    public void Connect(string host = "127.0.0.1", int port = 6742)
    {
        Dispose();
        tcp = new TcpClient { NoDelay = true, ReceiveTimeout = 3000, SendTimeout = 3000 };
        var task = tcp.ConnectAsync(host, port);
        if (!task.Wait(1500) || !tcp.Connected) throw new IOException("OpenRGB isn't answering. Open OpenRGB and start its SDK server (SDK Server tab → Start Server).");
        net = tcp.GetStream();
        Send(0, SetClientName, Encoding.ASCII.GetBytes("Skyvaint Game Launcher\0"));
        Send(0, RequestProtocolVersion, BitConverter.GetBytes(ClientProtocol));
        var (_, _, ver) = Receive(RequestProtocolVersion);
        protocol = Math.Min(ClientProtocol, ver.Length >= 4 ? BitConverter.ToUInt32(ver, 0) : 0);
        Refresh();
    }

    public void Refresh()
    {
        Devices.Clear();
        Send(0, RequestControllerCount, []);
        var (_, _, countData) = Receive(RequestControllerCount);
        uint count = BitConverter.ToUInt32(countData, 0);
        for (uint i = 0; i < count && i < 64; i++)
        {
            Send(i, RequestControllerData, BitConverter.GetBytes(protocol));
            var (_, _, data) = Receive(RequestControllerData);
            try { Devices.Add(Parse((int)i, data)); } catch { }
        }
    }

    /// <summary>Lets the launcher drive the device's LEDs itself (OpenRGB's "Direct" mode).</summary>
    public void TakeOver(Device d) => Send((uint)d.Index, SetCustomMode, []);

    /// <summary>Colours, one per LED, as 0xRRGGBB.</summary>
    public void SetLeds(Device d, ReadOnlySpan<int> rgb)
    {
        int n = Math.Min(rgb.Length, d.Leds);
        var data = new byte[4 + 2 + n * 4];
        BitConverter.TryWriteBytes(data.AsSpan(0), (uint)data.Length);
        BitConverter.TryWriteBytes(data.AsSpan(4), (ushort)n);
        for (int i = 0; i < n; i++)
        {
            int c = rgb[i], o = 6 + i * 4;
            data[o] = (byte)(c >> 16); data[o + 1] = (byte)(c >> 8); data[o + 2] = (byte)c; data[o + 3] = 0;
        }
        Send((uint)d.Index, UpdateLeds, data);
    }

    void Send(uint device, uint id, byte[] data)
    {
        var head = new byte[16];
        Encoding.ASCII.GetBytes("ORGB").CopyTo(head, 0);
        BitConverter.TryWriteBytes(head.AsSpan(4), device);
        BitConverter.TryWriteBytes(head.AsSpan(8), id);
        BitConverter.TryWriteBytes(head.AsSpan(12), (uint)data.Length);
        net!.Write(head);
        if (data.Length > 0) net.Write(data);
    }

    /// <summary>Reads packets until the one asked for (OpenRGB may send "device list changed" in between).</summary>
    (uint device, uint id, byte[] data) Receive(uint want)
    {
        for (int guard = 0; guard < 32; guard++)
        {
            var head = ReadExact(16);
            if (Encoding.ASCII.GetString(head, 0, 4) != "ORGB") throw new IOException("Not an OpenRGB server.");
            uint dev = BitConverter.ToUInt32(head, 4), id = BitConverter.ToUInt32(head, 8), size = BitConverter.ToUInt32(head, 12);
            if (size > 16_000_000) throw new IOException("OpenRGB sent too much.");
            var data = ReadExact((int)size);
            if (id == want) return (dev, id, data);
        }
        throw new IOException("OpenRGB didn't answer the question.");
    }

    byte[] ReadExact(int n)
    {
        var buf = new byte[n];
        int at = 0;
        while (at < n)
        {
            int r = net!.Read(buf, at, n - at);
            if (r <= 0) throw new IOException("OpenRGB closed the connection.");
            at += r;
        }
        return buf;
    }

    Device Parse(int index, byte[] b)
    {
        int p = 4; // data size
        int I32() { int v = BitConverter.ToInt32(b, p); p += 4; return v; }
        uint U32() { uint v = BitConverter.ToUInt32(b, p); p += 4; return v; }
        ushort U16() { ushort v = BitConverter.ToUInt16(b, p); p += 2; return v; }
        string Str() { int len = U16(); var s = Encoding.UTF8.GetString(b, p, Math.Max(0, len - 1)); p += len; return s; }

        int type = I32();
        string name = Str();
        if (protocol >= 1) Str(); // vendor
        Str(); Str(); Str(); Str(); // description, version, serial, location
        int modes = U16();
        I32(); // active mode
        bool direct = false;
        for (int m = 0; m < modes; m++)
        {
            string mode = Str();
            I32(); uint flags = U32();
            U32(); U32();              // speed min/max
            if (protocol >= 3) { U32(); U32(); }
            U32(); U32();              // colours min/max
            U32();                     // speed
            if (protocol >= 3) U32();
            U32(); U32();              // direction, colour mode
            int colors = U16(); p += colors * 4;
            if (mode.Equals("Direct", StringComparison.OrdinalIgnoreCase) || mode.Equals("Custom", StringComparison.OrdinalIgnoreCase)) direct = true;
        }
        int zones = U16();
        for (int z = 0; z < zones; z++)
        {
            Str(); I32(); U32(); U32(); U32();
            int matrix = U16(); p += matrix;
            if (protocol >= 4) { int segs = U16(); for (int s = 0; s < segs; s++) { Str(); I32(); U32(); U32(); } }
        }
        int leds = U16();
        return new Device(index, name, type, leds, direct);
    }

    public void Dispose()
    {
        try { net?.Dispose(); } catch { }
        try { tcp?.Dispose(); } catch { }
        net = null; tcp = null;
    }
}

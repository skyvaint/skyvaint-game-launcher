using System.IO.Pipes;
using System.Text;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// Discord Rich Presence over Discord's local pipe (the same channel games use). Needs the desktop Discord app
/// running and an Application ID from discord.com/developers — that application's name is what Discord shows as
/// "Playing ...". Nothing is sent anywhere but to the local Discord app.
/// </summary>
sealed class DiscordRpc : IDisposable
{
    NamedPipeClientStream? pipe;
    readonly object gate = new();
    public string ClientId { get; private set; } = "";
    public string Status { get; private set; } = "Off";
    public bool Connected => pipe?.IsConnected == true;
    /// <summary>Called (off the UI thread) whenever Discord's answer changes what the status line should say.</summary>
    public Action<string>? StatusChanged;
    string user = "you";
    void SetStatus(string s) { if (s == Status) return; Status = s; StatusChanged?.Invoke(s); }

    public async Task<bool> Connect(string clientId)
    {
        Close();
        ClientId = clientId;
        for (int i = 0; i < 10 && pipe == null; i++)
        {
            var p = new NamedPipeClientStream(".", $"discord-ipc-{i}", PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                await p.ConnectAsync(400);
                pipe = p;
            }
            catch { p.Dispose(); }
        }
        if (pipe == null)
        {
            Status = "Discord isn't running";
            return false;
        }
        try
        {
            Write(0, new JsonObject { ["v"] = 1, ["client_id"] = clientId });
            var (op, data) = await Read();
            if (op == 1 && data?["evt"]?.ToString() == "READY")
            {
                user = data["data"]?["user"]?["username"]?.ToString() ?? "you";
                Status = "Connected as " + user;
                _ = ReadLoop(pipe);
                return true;
            }
            Status = data?["message"]?.ToString() is { Length: > 0 } msg ? "Discord said: " + msg : "Discord refused that Application ID";
        }
        catch (Exception ex) { Status = "Couldn't talk to Discord: " + ex.Message; }
        Close();
        return false;
    }

    public void SetActivity(JsonObject? activity)
    {
        if (!Connected) return;
        try
        {
            Write(1, new JsonObject
            {
                ["cmd"] = "SET_ACTIVITY",
                ["args"] = new JsonObject { ["pid"] = Environment.ProcessId, ["activity"] = activity },
                ["nonce"] = Guid.NewGuid().ToString(),
            });
        }
        catch
        {
            Status = "Disconnected from Discord";
            Close();
        }
    }

    void Write(int op, JsonNode payload)
    {
        var body = Encoding.UTF8.GetBytes(payload.ToJsonString());
        var frame = new byte[8 + body.Length];
        BitConverter.GetBytes(op).CopyTo(frame, 0);
        BitConverter.GetBytes(body.Length).CopyTo(frame, 4);
        body.CopyTo(frame, 8);
        lock (gate)
        {
            pipe!.Write(frame, 0, frame.Length);
            pipe.Flush();
        }
    }

    async Task<(int op, JsonNode? data)> Read()
    {
        var head = await ReadExactly(8);
        int op = BitConverter.ToInt32(head, 0), length = BitConverter.ToInt32(head, 4);
        var body = await ReadExactly(length);
        return (op, JsonNode.Parse(Encoding.UTF8.GetString(body)));
    }

    async Task<byte[]> ReadExactly(int count)
    {
        var buffer = new byte[count];
        int read = 0;
        while (read < count)
        {
            int n = await pipe!.ReadAsync(buffer.AsMemory(read, count - read));
            if (n == 0) throw new IOException("pipe closed");
            read += n;
        }
        return buffer;
    }

    // Discord answers every update; the answers have to be read or the pipe fills up.
    async Task ReadLoop(NamedPipeClientStream mine)
    {
        try
        {
            while (pipe == mine && mine.IsConnected)
            {
                // Each update gets an answer: the activity as Discord will show it, or an error saying why not.
                var (_, data) = await Read();
                if (data?["cmd"]?.ToString() != "SET_ACTIVITY") continue;
                if (data["evt"]?.ToString() == "ERROR") SetStatus("Discord refused the activity: " + (data["data"]?["message"]?.ToString() ?? "unknown error"));
                else if (data["data"] is JsonObject shown) SetStatus($"Showing as {user}: " + (shown["details"]?.ToString() ?? shown["name"]?.ToString() ?? "activity"));
                else SetStatus("Connected as " + user + " (nothing shown right now)");
            }
        }
        catch { }
        if (pipe == mine)
        {
            Status = "Disconnected from Discord";
            Close();
        }
    }

    public void Close()
    {
        try { pipe?.Dispose(); } catch { }
        pipe = null;
    }

    public void Dispose() => Close();
}

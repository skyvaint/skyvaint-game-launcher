using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Skyvaint;

// Your pictures, GIFs, videos and sounds, kept on this PC. Artwork that is still loaded from the internet (store art,
// GIF links, Roblox thumbnails, pictures picked from a link) is downloaded into the media folder, and the page then
// points everything at the saved copies, so it all works offline and can't disappear when a site changes. The media
// folder is mirrored into the backups like the rest of your own pictures (the media_ prefix). Everything you use can
// also be copied to a folder of your choice, sorted by kind.
public sealed partial class MainForm
{
    static readonly HttpClient AssetWeb = MakeAssetWeb();
    static HttpClient MakeAssetWeb()
    {
        var h = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };
        h.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) SkyvaintGameLauncher");
        return h;
    }

    const long AssetMaxBytes = 400L * 1024 * 1024;
    bool assetsBusy;

    static readonly Dictionary<string, string> AssetTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/png"] = ".png", ["image/jpeg"] = ".jpg", ["image/jpg"] = ".jpg", ["image/webp"] = ".webp", ["image/gif"] = ".gif", ["image/avif"] = ".avif",
        ["image/bmp"] = ".bmp", ["image/x-icon"] = ".ico", ["image/vnd.microsoft.icon"] = ".ico", ["image/svg+xml"] = ".svg",
        ["video/mp4"] = ".mp4", ["video/webm"] = ".webm", ["video/quicktime"] = ".mov",
        ["audio/mpeg"] = ".mp3", ["audio/mp3"] = ".mp3", ["audio/wav"] = ".wav", ["audio/x-wav"] = ".wav", ["audio/ogg"] = ".ogg", ["audio/webm"] = ".weba", ["audio/aac"] = ".aac", ["audio/mp4"] = ".m4a", ["audio/flac"] = ".flac",
    };
    static readonly HashSet<string> AssetExts = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".ico", ".svg", ".mp4", ".webm", ".m4v", ".mov", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".weba" };

    bool OnAssetMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "saveImage":
            {
                // A picture made in the creator (icons): a PNG from the page, kept in the media folder.
                var reply = new JsonObject { ["type"] = "imageSaved", ["token"] = m["token"]?.ToString() };
                try
                {
                    var data = m["dataUrl"]?.ToString() ?? "";
                    const string head = "data:image/png;base64,";
                    if (!data.StartsWith(head, StringComparison.Ordinal)) throw new InvalidDataException("Not a PNG picture.");
                    var bytes = Convert.FromBase64String(data[head.Length..]);
                    if (bytes.Length > 20_000_000) throw new InvalidDataException("The picture is too big.");
                    Directory.CreateDirectory(MediaDir);
                    var name = $"made_{Guid.NewGuid():N}.png";
                    File.WriteAllBytes(Path.Combine(MediaDir, name), bytes);
                    reply["url"] = $"https://{MediaHost}/{name}";
                }
                catch (Exception ex) { reply["error"] = ex.Message; }
                Send(reply);
                return true;
            }
            case "localizeAssets":
                LocalizeAssets((m["urls"] as JsonArray)?.Select(x => x?.ToString() ?? "").Where(x => x != "").Distinct().ToList() ?? []);
                return true;
            case "exportAssets":
                ExportAssets((m["files"] as JsonArray)?.Select(x => x?.ToString() ?? "").Where(x => x != "").Distinct().ToList() ?? []);
                return true;
            case "openMedia":
                try { Directory.CreateDirectory(MediaDir); Process.Start("explorer.exe", $"\"{MediaDir}\"")?.Dispose(); } catch { }
                return true;
        }
        return false;
    }

    async void LocalizeAssets(List<string> urls)
    {
        if (assetsBusy) return;
        assetsBusy = true;
        var map = new JsonObject();
        var failed = new JsonArray();
        int done = 0;
        try
        {
            Directory.CreateDirectory(MediaDir);
            using var gate = new SemaphoreSlim(4);
            var jobs = urls.Select(async url =>
            {
                await gate.WaitAsync();
                try
                {
                    var local = await Task.Run(() => SaveAsset(url));
                    lock (map) { if (local != null) map[url] = local; else failed.Add(url); }
                }
                finally
                {
                    gate.Release();
                    int now = Interlocked.Increment(ref done);
                    BeginInvoke(() => Send(new JsonObject { ["type"] = "assetsProgress", ["done"] = now, ["total"] = urls.Count }));
                }
            }).ToList();
            await Task.WhenAll(jobs);
        }
        catch (Exception ex) { StartupGuard.Log("Saving assets", ex); }
        finally { assetsBusy = false; }
        Send(new JsonObject { ["type"] = "assetsLocalized", ["map"] = map, ["failed"] = failed });
    }

    /// <summary>Downloads one address into the media folder and hands back its local address, or null if it isn't
    /// a picture, video or sound (or couldn't be fetched). The same address always gets the same file name, so asking
    /// twice downloads once.</summary>
    async Task<string?> SaveAsset(string url)
    {
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https")) return null;
            string id = "media_" + Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(url)))[..20].ToLowerInvariant();
            var existing = Directory.EnumerateFiles(MediaDir, id + ".*").FirstOrDefault();
            if (existing != null) return "https://media.skyvaint.example/" + Path.GetFileName(existing);

            using var res = await AssetWeb.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
            if (!res.IsSuccessStatusCode) return null;
            if (res.Content.Headers.ContentLength > AssetMaxBytes) return null;
            string mime = res.Content.Headers.ContentType?.MediaType ?? "";
            string ext = AssetTypes.GetValueOrDefault(mime) ?? "";
            if (ext == "")
            {
                var fromUrl = Path.GetExtension(uri.AbsolutePath);
                // Some servers say "binary data" for everything; the address's own extension decides then.
                if ((mime == "" || mime == "application/octet-stream" || mime == "binary/octet-stream") && AssetExts.Contains(fromUrl)) ext = fromUrl.ToLowerInvariant();
                else return null;
            }
            string temp = Path.Combine(MediaDir, id + ".part");
            await using (var src = await res.Content.ReadAsStreamAsync())
            await using (var dst = File.Create(temp))
            {
                var buf = new byte[1 << 16];
                long total = 0;
                int n;
                while ((n = await src.ReadAsync(buf)) > 0)
                {
                    total += n;
                    if (total > AssetMaxBytes) throw new Exception("too big");
                    await dst.WriteAsync(buf.AsMemory(0, n));
                }
            }
            string name = id + ext;
            File.Move(temp, Path.Combine(MediaDir, name), overwrite: true);
            return "https://media.skyvaint.example/" + name;
        }
        catch
        {
            try { foreach (var f in Directory.EnumerateFiles(MediaDir, "*.part")) File.Delete(f); } catch { }
            return null;
        }
    }

    /// <summary>Copies every picture, GIF, video and sound the settings use into a folder you choose, one subfolder
    /// per kind.</summary>
    void ExportAssets(List<string> files)
    {
        string? root = null;
        using (var pick = new FolderBrowserDialog { Description = "Where should your pictures, GIFs, videos and sounds be copied?", UseDescriptionForTitle = true })
            if (pick.ShowDialog(this) == DialogResult.OK) root = pick.SelectedPath;
        if (root == null) return;
        string dest = Path.Combine(root, $"Skyvaint assets {DateTime.Now:yyyy-MM-dd HHmm}");
        _ = Task.Run(() =>
        {
            int copied = 0;
            foreach (var name in files)
            {
                try
                {
                    var file = Path.Combine(MediaDir, Path.GetFileName(name));
                    if (!File.Exists(file)) continue;
                    var ext = Path.GetExtension(file).ToLowerInvariant();
                    string kind = ext is ".gif" ? "GIFs" : ext is ".mp4" or ".webm" or ".m4v" or ".mov" ? "Videos" : ext is ".mp3" or ".wav" or ".ogg" or ".m4a" or ".aac" or ".flac" or ".weba" ? "Sounds" : "Pictures";
                    Directory.CreateDirectory(Path.Combine(dest, kind));
                    File.Copy(file, Path.Combine(dest, kind, Path.GetFileName(file)), overwrite: true);
                    copied++;
                }
                catch { }
            }
            BeginInvoke(() =>
            {
                Send(new JsonObject { ["type"] = "notice", ["ok"] = copied > 0, ["text"] = copied > 0 ? $"{copied} files copied to {dest}" : "Nothing was copied." });
                if (copied > 0) try { Process.Start("explorer.exe", $"\"{dest}\"")?.Dispose(); } catch { }
            });
        });
    }
}

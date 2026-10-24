using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Skyvaint;

// The rows under HOME and the game lists: Roblox Studio projects (recent files and cloud games, read from Studio's
// own records), artwork for saved Roblox places, upcoming releases, Roblox Studio news (DevForum announcements) and
// commission requests read from a Discord channel with the user's own bot.
public sealed partial class MainForm
{
    JsonObject? feedsCache;
    DateTime feedsAt = DateTime.MinValue;
    static string BotFile => Path.Combine(DataDir, "discordbot.bin");

    bool OnFeedsMessage(JsonObject m)
    {
        string Str(string key) => m[key]?.ToString() ?? "";
        switch (Str("type"))
        {
            case "studioProjects":
                _ = StudioProjects();
                return true;
            case "robloxPlaceArt":
                _ = RobloxPlaceArt(m["placeIds"] as JsonArray);
                return true;
            case "feeds":
                _ = Feeds(m["fresh"]?.GetValue<bool>() ?? false);
                return true;
            case "commissions":
                _ = SendCommissions();
                return true;
            case "discordBot":
                SaveBot(Str("token"), Str("channel"));
                return true;
            case "discordBotClear":
                try { File.Delete(BotFile); } catch { }
                Send(new JsonObject { ["type"] = "discordBot", ["has"] = false });
                return true;
            case "discordBotState":
                Send(new JsonObject { ["type"] = "discordBot", ["has"] = File.Exists(BotFile) });
                return true;
            case "openStudio":
                OpenStudio(m);
                return true;
            case "revealFile":
                var path = Str("path");
                if (File.Exists(path)) Process.Start("explorer.exe", "/select,\"" + path + "\"")?.Dispose();
                return true;
        }
        return false;
    }

    // ---------- Roblox Studio projects ----------

    async Task StudioProjects()
    {
        var local = new JsonArray();
        var universes = new List<long>();
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Roblox\RobloxStudio");
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var name in key?.GetSubKeyNames() ?? [])
            {
                using var sub = key!.OpenSubKey(name);
                if (sub == null) continue;
                if (name.EndsWith("rbxRecentFiles_v03", StringComparison.OrdinalIgnoreCase))
                {
                    for (int i = 0; i < 40; i++)
                    {
                        var path = sub.GetValue($"{i}name")?.ToString();
                        if (string.IsNullOrEmpty(path)) continue;
                        path = path.Replace('/', '\\');
                        if (!seen.Add(path)) continue;
                        bool exists = File.Exists(path);
                        var title = Path.GetFileNameWithoutExtension(path);
                        title = Regex.Replace(title, @"^place \d+ ", "", RegexOptions.IgnoreCase); // Studio's "place 123 Name" downloads
                        local.Add(new JsonObject
                        {
                            ["path"] = path, ["name"] = title, ["exists"] = exists, ["order"] = i,
                            ["modified"] = exists ? new DateTimeOffset(File.GetLastWriteTimeUtc(path)).ToUnixTimeMilliseconds() : 0,
                            ["folder"] = Path.GetFileName(Path.GetDirectoryName(path) ?? ""),
                        });
                    }
                }
                else if (name.StartsWith("rbxRecentRobloxApiGames", StringComparison.OrdinalIgnoreCase))
                {
                    for (int i = 0; i < 60; i++)
                        if (long.TryParse(sub.GetValue($"d{i}gameId")?.ToString(), out var u) && !universes.Contains(u)) universes.Add(u);
                }
            }
        }
        catch { }

        var cloud = new JsonArray();
        try
        {
            foreach (var g in await UniverseInfo(universes.Take(40).ToList()))
                cloud.Add(g);
        }
        catch { }
        Send(new JsonObject { ["type"] = "studioProjects", ["local"] = local, ["cloud"] = cloud });
    }

    /// <summary>Name, root place, players, visits, icon and a wide thumbnail for each universe (public APIs).</summary>
    static async Task<List<JsonObject>> UniverseInfo(List<long> ids)
    {
        var result = new List<JsonObject>();
        if (ids.Count == 0) return result;
        var icons = new Dictionary<long, string>();
        var thumbs = new Dictionary<long, string>();
        foreach (var batch in ids.Chunk(30))
        {
            var list = string.Join(',', batch);
            var info = GetJson($"https://games.roblox.com/v1/games?universeIds={list}");
            var ic = GetJson($"https://thumbnails.roblox.com/v1/games/icons?universeIds={list}&size=512x512&format=Png&isCircular=false");
            var th = GetJson($"https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds={list}&countPerUniverse=1&size=768x432&format=Png&isCircular=false");
            try
            {
                foreach (var t in ((await ic)?["data"] as JsonArray)?.OfType<JsonObject>() ?? [])
                    if (t["state"]?.ToString() == "Completed") icons[t["targetId"]!.GetValue<long>()] = t["imageUrl"]!.ToString();
            }
            catch { }
            try
            {
                foreach (var t in ((await th)?["data"] as JsonArray)?.OfType<JsonObject>() ?? [])
                {
                    var first = (t["thumbnails"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(x => x["state"]?.ToString() == "Completed");
                    if (first != null) thumbs[t["universeId"]!.GetValue<long>()] = first["imageUrl"]!.ToString();
                }
            }
            catch { }
            foreach (var g in ((await info)?["data"] as JsonArray)?.OfType<JsonObject>() ?? [])
            {
                long id = g["id"]!.GetValue<long>();
                long playing = 0, visits = 0;
                try { playing = g["playing"]?.GetValue<long>() ?? 0; visits = g["visits"]?.GetValue<long>() ?? 0; } catch { }
                result.Add(new JsonObject
                {
                    ["universeId"] = id, ["placeId"] = g["rootPlaceId"]?.DeepClone(), ["name"] = g["name"]?.ToString(),
                    ["creator"] = g["creator"]?["name"]?.ToString(), ["playing"] = playing, ["visits"] = visits,
                    ["updated"] = g["updated"]?.ToString(), ["icon"] = icons.GetValueOrDefault(id, ""), ["thumb"] = thumbs.GetValueOrDefault(id, ""),
                });
            }
        }
        // Keep the order Studio had them in (most recent first).
        return result.OrderBy(r => ids.IndexOf(r["universeId"]!.GetValue<long>())).ToList();
    }

    void OpenStudio(JsonObject m)
    {
        try
        {
            if (m["kind"]?.ToString() == "file")
            {
                var path = m["path"]?.ToString() ?? "";
                if (File.Exists(path) && Regex.IsMatch(path, @"\.rbxlx?$", RegexOptions.IgnoreCase))
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true })?.Dispose();
                else Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "That file isn't there any more." });
            }
            else
            {
                long place = m["placeId"]?.GetValue<long>() ?? 0, universe = m["universeId"]?.GetValue<long>() ?? 0;
                if (place <= 0) return;
                var uri = $"roblox-studio:1+launchmode:edit+task:EditPlace+placeId:{place}" + (universe > 0 ? $"+universeId:{universe}" : "");
                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true })?.Dispose();
            }
        }
        catch (Exception ex) { Send(new JsonObject { ["type"] = "notice", ["ok"] = false, ["text"] = "Couldn't open Studio: " + ex.Message }); }
    }

    // ---------- Roblox place artwork ----------

    async Task RobloxPlaceArt(JsonArray? placeIds)
    {
        var map = new Dictionary<long, long>(); // place -> universe
        foreach (var p in placeIds?.Select(x => { try { return x!.GetValue<long>(); } catch { return 0L; } }).Where(x => x > 0).Distinct().Take(40) ?? [])
        {
            try
            {
                var u = await GetJson($"https://apis.roblox.com/universes/v1/places/{p}/universe");
                var id = u?["universeId"]?.GetValue<long>() ?? 0;
                if (id > 0) map[p] = id;
            }
            catch { }
        }
        var items = new JsonArray();
        try
        {
            var info = await UniverseInfo(map.Values.Distinct().ToList());
            foreach (var (place, uni) in map)
            {
                var g = info.FirstOrDefault(x => x["universeId"]!.GetValue<long>() == uni);
                if (g == null) continue;
                var copy = (JsonObject)g.DeepClone();
                copy["placeId"] = place;
                items.Add(copy);
            }
        }
        catch { }
        Send(new JsonObject { ["type"] = "robloxPlaceArt", ["items"] = items });
    }

    // ---------- upcoming releases, Studio news, commissions ----------

    async Task Feeds(bool fresh)
    {
        if (!fresh && feedsCache != null && (DateTime.Now - feedsAt).TotalMinutes < 10)
        {
            Send(feedsCache.DeepClone().AsObject());
            return;
        }
        var upcoming = Task.Run(Upcoming);
        var news = Task.Run(StudioNews);
        var reply = new JsonObject { ["type"] = "feeds" };
        try { reply["upcoming"] = await upcoming; } catch { reply["upcoming"] = new JsonArray(); }
        try { reply["news"] = await news; } catch { reply["news"] = new JsonArray(); }
        feedsCache = reply;
        feedsAt = DateTime.Now;
        Send(reply.DeepClone().AsObject());
        await SendCommissions();
    }

    static async Task<JsonArray> Upcoming()
    {
        var list = new JsonArray();
        // Steam's coming-soon list, with release dates looked up per game.
        try
        {
            var data = await GetJson("https://store.steampowered.com/api/featuredcategories?cc=us&l=en");
            var items = (data?["coming_soon"]?["items"] as JsonArray)?.OfType<JsonObject>().GroupBy(i => i["id"]?.ToString()).Select(g => g.First()).Take(14).ToList() ?? [];
            var dates = await Task.WhenAll(items.Select(async i =>
            {
                try
                {
                    var d = await GetJson($"https://store.steampowered.com/api/appdetails?appids={i["id"]}&filters=release_date&cc=us&l=en");
                    return d?[i["id"]!.ToString()]?["data"]?["release_date"]?["date"]?.ToString() ?? "";
                }
                catch { return ""; }
            }));
            for (int k = 0; k < items.Count; k++)
            {
                var i = items[k];
                list.Add(new JsonObject
                {
                    ["title"] = i["name"]?.ToString(), ["image"] = i["large_capsule_image"]?.ToString() ?? i["header_image"]?.ToString(),
                    ["sub"] = string.IsNullOrEmpty(dates[k]) ? "STEAM · COMING SOON" : "STEAM · " + dates[k].ToUpperInvariant(),
                    ["url"] = $"https://store.steampowered.com/app/{i["id"]}", ["steam"] = $"steam://store/{i["id"]}", ["source"] = "steam",
                });
            }
        }
        catch { }
        // Epic's upcoming free games.
        try
        {
            foreach (var e in (await DiscoverEpic()).OfType<JsonObject>().Where(e => e["now"]?.GetValue<bool>() == false))
            {
                var c = (JsonObject)e.DeepClone();
                c["sub"] = "EPIC · " + c["sub"];
                c["source"] = "epic";
                list.Insert(0, c);
            }
        }
        catch { }
        return list;
    }

    static async Task<JsonArray> StudioNews()
    {
        var list = new JsonArray();
        var data = await GetJson("https://devforum.roblox.com/c/updates/announcements/36.json");
        foreach (var t in (data?["topic_list"]?["topics"] as JsonArray)?.OfType<JsonObject>().Take(18) ?? [])
        {
            if (t["pinned"]?.GetValue<bool>() == true && t["title"]?.ToString()?.StartsWith("About the") == true) continue;
            DateTime.TryParse(t["created_at"]?.ToString(), out var when);
            long likes = 0, replies = 0;
            try { likes = t["like_count"]?.GetValue<long>() ?? 0; replies = t["posts_count"]?.GetValue<long>() ?? 0; } catch { }
            list.Add(new JsonObject
            {
                ["title"] = t["title"]?.ToString(), ["image"] = t["image_url"]?.ToString() ?? "",
                ["sub"] = $"{when:MMM d} · {likes:N0} LIKES · {Math.Max(0, replies - 1):N0} REPLIES".ToUpperInvariant(),
                ["url"] = $"https://devforum.roblox.com/t/{t["slug"]}/{t["id"]}", ["time"] = new DateTimeOffset(when).ToUnixTimeMilliseconds(),
            });
        }
        return list;
    }

    // The bot token never goes back to the page: it is kept encrypted for this Windows user, next to the channel.
    void SaveBot(string token, string channel)
    {
        token = token.Trim();
        if (token.StartsWith("Bot ", StringComparison.OrdinalIgnoreCase)) token = token[4..].Trim();
        channel = Regex.Match(channel ?? "", @"(\d{15,22})\s*$").Groups[1].Value;
        try
        {
            if (token != "" || channel != "")
            {
                var old = LoadBot();
                var json = new JsonObject { ["token"] = token != "" ? token : old.token, ["channel"] = channel != "" ? channel : old.channel };
                File.WriteAllBytes(BotFile, ProtectedData.Protect(Encoding.UTF8.GetBytes(json.ToJsonString()), null, DataProtectionScope.CurrentUser));
            }
        }
        catch { }
        Send(new JsonObject { ["type"] = "discordBot", ["has"] = File.Exists(BotFile) });
        _ = SendCommissions();
    }

    static (string token, string channel) LoadBot()
    {
        try
        {
            var j = JsonNode.Parse(ProtectedData.Unprotect(File.ReadAllBytes(BotFile), null, DataProtectionScope.CurrentUser));
            return (j?["token"]?.ToString() ?? "", j?["channel"]?.ToString() ?? "");
        }
        catch { return ("", ""); }
    }

    async Task SendCommissions()
    {
        var reply = new JsonObject { ["type"] = "commissions" };
        var (token, channel) = LoadBot();
        if (token == "" || channel == "")
        {
            reply["error"] = token == "" ? "nobot" : "nochannel";
            Send(reply);
            return;
        }
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bot", token);
            http.DefaultRequestHeaders.UserAgent.ParseAdd("DiscordBot (https://skyvaint.com, 2.4)");
            var chanResp = await http.GetAsync($"https://discord.com/api/v10/channels/{channel}");
            if (!chanResp.IsSuccessStatusCode)
            {
                reply["error"] = chanResp.StatusCode switch
                {
                    System.Net.HttpStatusCode.Unauthorized => "The bot token was refused.",
                    System.Net.HttpStatusCode.Forbidden => "The bot can't see that channel (invite it and give it View Channel + Read Message History).",
                    System.Net.HttpStatusCode.NotFound => "That channel ID wasn't found.",
                    _ => "Discord said " + (int)chanResp.StatusCode,
                };
                Send(reply);
                return;
            }
            var chan = JsonNode.Parse(await chanResp.Content.ReadAsStringAsync());
            var guild = chan?["guild_id"]?.ToString() ?? "@me";
            reply["channelName"] = chan?["name"]?.ToString() ?? "";
            var msgs = JsonNode.Parse(await http.GetStringAsync($"https://discord.com/api/v10/channels/{channel}/messages?limit=30")) as JsonArray;
            var list = new JsonArray();
            foreach (var msg in msgs?.OfType<JsonObject>() ?? [])
            {
                var author = msg["author"];
                var embed = (msg["embeds"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault();
                var text = new StringBuilder(msg["content"]?.ToString() ?? "");
                if (embed != null)
                {
                    if (embed["description"] != null) text.Append(text.Length > 0 ? "\n" : "").Append(embed["description"]);
                    foreach (var f in (embed["fields"] as JsonArray)?.OfType<JsonObject>() ?? [])
                        text.Append(text.Length > 0 ? "\n" : "").Append(f["name"]).Append(": ").Append(f["value"]);
                }
                var image = (msg["attachments"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault(a => a["content_type"]?.ToString()?.StartsWith("image") == true)?["url"]?.ToString()
                    ?? embed?["image"]?["url"]?.ToString() ?? embed?["thumbnail"]?["url"]?.ToString() ?? "";
                var authorId = author?["id"]?.ToString();
                var avatar = author?["avatar"]?.ToString();
                list.Add(new JsonObject
                {
                    ["id"] = msg["id"]?.ToString(),
                    ["title"] = embed?["title"]?.ToString() ?? "",
                    ["author"] = embed?["author"]?["name"]?.ToString() ?? author?["global_name"]?.ToString() ?? author?["username"]?.ToString() ?? "",
                    ["avatar"] = !string.IsNullOrEmpty(avatar) ? $"https://cdn.discordapp.com/avatars/{authorId}/{avatar}.png?size=128" : "",
                    ["text"] = text.ToString(),
                    ["image"] = image,
                    ["time"] = msg["timestamp"]?.ToString(),
                    ["url"] = $"https://discord.com/channels/{guild}/{channel}/{msg["id"]}",
                    ["app"] = $"discord://-/channels/{guild}/{channel}/{msg["id"]}",
                });
            }
            reply["items"] = list;
        }
        catch (Exception ex) { reply["error"] = "Couldn't reach Discord: " + ex.Message; }
        Send(reply);
    }
}

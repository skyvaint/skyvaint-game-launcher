using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Skyvaint;

// Roblox friends (who is online, in which game) read with a saved account's own sign-in, and the details screen's
// lookups: a Roblox game's description, votes, favourites and screenshots, or a Steam game's store page.
public sealed partial class MainForm
{
    // One hidden page per account stays signed in on roblox.com, so refreshing friends is a script run, not a page load.
    WebView2? friendsView;
    string friendsAccount = "";
    bool friendsBusy;

    const string FriendsScript = """
(async () => {
  const post = (o) => chrome.webview.postMessage(o);
  try {
    let csrf = '';
    const send = async (url, body) => {
      for (let i = 0; i < 3; i++) {
        const r = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'include',
          headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf } : {}, body: body ? JSON.stringify(body) : undefined });
        const next = r.headers.get('x-csrf-token');
        if (r.status === 403 && next && next !== csrf) { csrf = next; continue; }
        if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 900 * (i + 1))); continue; }
        return r.ok ? r.json() : null;
      }
      return null;
    };
    const me = await fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' });
    if (!me.ok) return post({ kind: 'friends', ok: false, error: 'signed-out' });
    const user = await me.json();
    const list = await send(`https://friends.roblox.com/v1/users/${user.id}/friends`);
    const ids = ((list && list.data) || []).map((f) => f.id).slice(0, 300);
    const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    const people = {};
    for (const f of (list && list.data) || []) people[f.id] = { id: f.id, name: f.name || '', displayName: f.displayName || '' };
    for (const part of chunks(ids, 100)) {
      const names = await send('https://users.roblox.com/v1/users', { userIds: part, excludeBannedUsers: false });
      for (const u of (names && names.data) || []) Object.assign(people[u.id] = people[u.id] || { id: u.id }, { name: u.name, displayName: u.displayName });
      const pres = await send('https://presence.roblox.com/v1/presence/users', { userIds: part });
      for (const p of (pres && pres.userPresences) || []) Object.assign(people[p.userId] = people[p.userId] || { id: p.userId }, {
        state: p.userPresenceType, where: p.lastLocation || '', placeId: p.placeId || p.rootPlaceId || 0, rootPlaceId: p.rootPlaceId || 0,
        gameId: p.gameId || '', universeId: p.universeId || 0, lastOnline: p.lastOnline || '' });
      const heads = await send(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${part.join(',')}&size=150x150&format=Png&isCircular=false`);
      for (const h of (heads && heads.data) || []) if (people[h.targetId] && h.state === 'Completed') people[h.targetId].head = h.imageUrl;
    }
    const unis = [...new Set(Object.values(people).map((p) => p.universeId).filter(Boolean))];
    const games = {};
    for (const part of chunks(unis, 50)) {
      const icons = await send(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${part.join(',')}&size=150x150&format=Png&isCircular=false`);
      for (const ic of (icons && icons.data) || []) if (ic.state === 'Completed') games[ic.targetId] = ic.imageUrl;
    }
    for (const p of Object.values(people)) if (p.universeId) p.gameIcon = games[p.universeId] || '';
    post({ kind: 'friends', ok: true, me: user.id, friends: Object.values(people) });
  } catch (e) { post({ kind: 'friends', ok: false, error: String(e) }); }
})()
""";

    bool OnSocialMessage(JsonObject m)
    {
        string Str(string key) => m[key]?.ToString() ?? "";
        switch (Str("type"))
        {
            case "robloxFriends":
                _ = RobloxFriends(Str("id"));
                return true;
            case "gameDetails":
                _ = GameDetails(m);
                return true;
        }
        return false;
    }

    async Task RobloxFriends(string id)
    {
        if (id == "" || friendsBusy) return;
        friendsBusy = true;
        var reply = new JsonObject { ["type"] = "robloxFriends", ["id"] = id };
        try
        {
            if (friendsView != null && friendsAccount != id) { Retire(friendsView); friendsView = null; }
            if (friendsView == null)
            {
                friendsView = await Worker(id);
                friendsAccount = id;
                var loaded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                friendsView.CoreWebView2.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
                friendsView.CoreWebView2.DOMContentLoaded += (_, _) => loaded.TrySetResult();
                friendsView.CoreWebView2.Navigate("https://www.roblox.com/home");
                await Task.WhenAny(loaded.Task, Task.Delay(25000));
                if (!loaded.Task.IsCompleted) throw new Exception("Roblox's site didn't load. Check your connection.");
            }
            var core = friendsView.CoreWebView2;
            var src = core.Source.ToLowerInvariant();
            if (src.Contains("/login") || src.Contains("/newlogin")) throw new Exception("signed-out");
            var result = new TaskCompletionSource<JsonObject?>(TaskCreationOptions.RunContinuationsAsynchronously);
            void OnMessage(object? _, CoreWebView2WebMessageReceivedEventArgs e)
            {
                if (!IsRobloxPage(e.Source)) return;
                try { if (JsonNode.Parse(e.WebMessageAsJson) is JsonObject o && o["kind"]?.ToString() == "friends") result.TrySetResult(o); } catch { }
            }
            core.WebMessageReceived += OnMessage;
            try
            {
                await core.ExecuteScriptAsync(FriendsScript);
                await Task.WhenAny(result.Task, Task.Delay(30000));
            }
            finally { core.WebMessageReceived -= OnMessage; }
            var info = result.Task.IsCompleted ? result.Task.Result : null;
            if (info == null) throw new Exception("Roblox didn't answer. Trying again shortly.");
            if (info["ok"]?.GetValue<bool>() != true) throw new Exception(info["error"]?.ToString() ?? "failed");
            reply["ok"] = true;
            reply["me"] = info["me"]?.DeepClone();
            reply["friends"] = info["friends"]?.DeepClone();
        }
        catch (Exception ex)
        {
            reply["ok"] = false;
            reply["error"] = ex.Message == "signed-out" ? "signed-out" : ex.Message;
            // A broken page is rebuilt on the next refresh.
            if (friendsView != null) { Retire(friendsView); friendsView = null; }
        }
        finally { friendsBusy = false; }
        Send(reply);
    }

    async Task GameDetails(JsonObject m)
    {
        string kind = m["kind"]?.ToString() ?? "";
        var reply = new JsonObject { ["type"] = "gameDetails", ["token"] = m["token"]?.ToString() ?? "" };
        try
        {
            if (kind == "roblox") reply["details"] = await RobloxDetails(Long(m["placeId"]), Long(m["universeId"]));
            else if (kind == "steam") reply["details"] = await SteamDetails(m["appId"]?.ToString() ?? "");
            else reply["details"] = new JsonObject();
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        Send(reply);
    }

    static long Long(JsonNode? n)
    {
        try { return n == null ? 0 : long.TryParse(n.ToString(), out var v) ? v : 0; } catch { return 0; }
    }

    static async Task<JsonObject> RobloxDetails(long placeId, long universeId)
    {
        if (universeId <= 0 && placeId > 0)
            universeId = Long((await GetJson($"https://apis.roblox.com/universes/v1/places/{placeId}/universe"))?["universeId"]);
        if (universeId <= 0) throw new Exception("Roblox has no game with that ID.");
        var info = GetJson($"https://games.roblox.com/v1/games?universeIds={universeId}");
        var votes = GetJson($"https://games.roblox.com/v1/games/votes?universeIds={universeId}");
        var favs = GetJson($"https://games.roblox.com/v1/games/{universeId}/favorites/count");
        var shots = GetJson($"https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds={universeId}&countPerUniverse=6&size=768x432&format=Png&isCircular=false");
        var icon = GetJson($"https://thumbnails.roblox.com/v1/games/icons?universeIds={universeId}&size=512x512&format=Png&isCircular=false");
        var g = ((await info)?["data"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault() ?? throw new Exception("Roblox has no game with that ID.");
        var d = new JsonObject
        {
            ["universeId"] = universeId, ["placeId"] = g["rootPlaceId"]?.DeepClone(), ["name"] = g["name"]?.ToString(),
            ["description"] = g["description"]?.ToString() ?? "", ["creator"] = g["creator"]?["name"]?.ToString() ?? "",
            ["playing"] = g["playing"]?.DeepClone(), ["visits"] = g["visits"]?.DeepClone(), ["maxPlayers"] = g["maxPlayers"]?.DeepClone(),
            ["created"] = g["created"]?.ToString(), ["updated"] = g["updated"]?.ToString(), ["genre"] = g["genre"]?.ToString() ?? "",
        };
        try
        {
            var v = ((await votes)?["data"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault();
            d["upVotes"] = v?["upVotes"]?.DeepClone(); d["downVotes"] = v?["downVotes"]?.DeepClone();
        }
        catch { }
        try { d["favorites"] = (await favs)?["favoritesCount"]?.DeepClone(); } catch { }
        try
        {
            var list = new JsonArray();
            foreach (var t in (((await shots)?["data"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault()?["thumbnails"] as JsonArray)?.OfType<JsonObject>() ?? [])
                if (t["state"]?.ToString() == "Completed") list.Add(t["imageUrl"]?.ToString());
            d["shots"] = list;
        }
        catch { d["shots"] = new JsonArray(); }
        try { d["icon"] = (((await icon)?["data"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault())?["imageUrl"]?.ToString() ?? ""; } catch { }
        return d;
    }

    static async Task<JsonObject> SteamDetails(string appId)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(appId, @"^\d+$")) throw new Exception("Not a Steam game.");
        var data = (await GetJson($"https://store.steampowered.com/api/appdetails?appids={appId}&l=en&cc=us"))?[appId];
        if (data?["success"]?.GetValue<bool>() != true) throw new Exception("Steam has no store page for this game.");
        var a = data["data"]!;
        string Join(string key, string field = "") => string.Join(", ", (a[key] as JsonArray)?.Select(x => field == "" ? x?.ToString() : x?[field]?.ToString()).Where(x => !string.IsNullOrEmpty(x)) ?? []);
        var shots = new JsonArray();
        foreach (var s in (a["screenshots"] as JsonArray)?.OfType<JsonObject>().Take(6) ?? []) shots.Add(s["path_full"]?.ToString());
        return new JsonObject
        {
            ["name"] = a["name"]?.ToString(), ["description"] = System.Net.WebUtility.HtmlDecode(a["short_description"]?.ToString() ?? ""),
            ["developers"] = Join("developers"), ["publishers"] = Join("publishers"), ["genres"] = Join("genres", "description"),
            ["released"] = a["release_date"]?["date"]?.ToString() ?? "", ["metacritic"] = a["metacritic"]?["score"]?.DeepClone(),
            ["recommendations"] = a["recommendations"]?["total"]?.DeepClone(), ["shots"] = shots,
            ["url"] = $"https://store.steampowered.com/app/{appId}",
        };
    }
}

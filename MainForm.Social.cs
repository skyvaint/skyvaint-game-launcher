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

    // ---------- the side panel (social sites / browser) ----------

    SidePanel? sidePanel;
    bool sideWanted;
    SidePanel? Side()
    {
        if (sidePanel != null || mainEnv == null) return sidePanel;
        sidePanel = new SidePanel(this, () => mainEnv);
        Controls.Add(sidePanel);
        web.BringToFront(); // the page fills whatever the panel leaves
        return sidePanel;
    }
    void SendSideState() => Send(new JsonObject { ["type"] = "sideState", ["open"] = sidePanel?.Visible == true });
    // The panel belongs to HOME: it steps out of the way in mini mode and comes back with HOME.
    void SideForMode()
    {
        if (sidePanel == null) return;
        if (sidePanel.InWindow) return; // its own window stays wherever you put it
        if (mode == "home") { if (sideWanted && !sidePanel.Visible) sidePanel.Open(); }
        else if (sidePanel.Visible) sidePanel.Visible = false;
    }
    internal void OnSideMessage(JsonObject m)
    {
        switch (m["type"]?.ToString())
        {
            case "close": sidePanel?.Close(); sideWanted = false; SendSideState(); break;
            case "opened": SendSideState(); break;
            case "width": Send(new JsonObject { ["type"] = "sideWidth", ["width"] = m["width"]?.DeepClone() }); break;
            case "addSite": Send(new JsonObject { ["type"] = "socialAdd", ["url"] = m["url"]?.DeepClone(), ["title"] = m["title"]?.DeepClone() }); break;
            case "view": Send(new JsonObject { ["type"] = "sideView", ["mode"] = m["mode"]?.DeepClone() }); break;
        }
    }

    NowPlaying? nowPlaying;
    /// <summary>The last track Windows reported (for Discord's {song} / {artist} and the widgets).</summary>
    internal JsonObject? LastTrack { get; private set; }
    NowPlaying Np => nowPlaying ??= new NowPlaying(MediaDir, "media.skyvaint.example");

    internal async Task<JsonObject> ReadTrack()
    {
        var t = await Np.Read();
        LastTrack = t;
        return t;
    }
    internal string? TrackArtFile => nowPlaying?.ArtFile;
    internal Task TrackCommand(string cmd, double value = 0) => Np.Command(cmd, value);

    bool OnSocialMessage(JsonObject m)
    {
        string Str(string key) => m[key]?.ToString() ?? "";
        switch (Str("type"))
        {
            case "side":
                {
                    var p = Side();
                    if (p == null) return true;
                    p.Configure(config?["social"] as JsonObject, config?["theme"] as JsonObject);
                    switch (Str("action"))
                    {
                        // The panel only shows with HOME; asked for while hidden, it comes up when HOME does.
                        case "open": sideWanted = true; if (mode == "home") p.Open(Str("url") is { Length: > 0 } u ? u : null); break;
                        case "toggle": if (p.Visible) { p.Close(); sideWanted = false; } else { sideWanted = true; if (mode == "home") p.Open(); } break;
                        case "close": p.Close(); sideWanted = false; break;
                        case "go": p.Go(Str("url")); sideWanted = true; break;
                        case "refresh": break; // settings changed (a site added): Configure above rebuilt the rail
                        case "view": p.SetView(Str("mode")); sideWanted = true; if (mode == "home" || Str("mode") == "window") p.Open(); break;
                    }
                    SendSideState();
                }
                return true;
            case "nowPlaying":
                _ = Task.Run(async () => { var t = await ReadTrack(); BeginInvoke(() => Send(t)); });
                return true;
            case "media":
                {
                    var cmd = Str("cmd");
                    double value = 0;
                    try { value = m["value"]?.GetValue<double>() ?? 0; } catch { }
                    _ = Task.Run(async () => { await TrackCommand(cmd, value); await Task.Delay(250); var t = await ReadTrack(); BeginInvoke(() => Send(t)); });
                }
                return true;
            case "robloxFriends":
                _ = RobloxFriends(Str("id"));
                return true;
            case "robloxOutfits":
                _ = RobloxOutfits(Str("id"));
                return true;
            case "robloxWear":
                _ = RobloxWear(Str("id"), Long(m["outfitId"]), Str("token"));
                return true;
            case "gameDetails":
                _ = GameDetails(m);
                return true;
            case "systemStats":
                {
                    var stats = SystemStats.Read();
                    stats["type"] = "systemStats";
                    Send(stats);
                }
                return true;
            case "setVolume":
                try { SystemStats.Volume.Set((float)((m["level"]?.GetValue<double>() ?? 50) / 100.0)); } catch { }
                return true;
            case "muteVolume":
                try { SystemStats.Volume.Mute(m["on"]?.GetValue<bool>() ?? true); } catch { }
                return true;
        }
        return false;
    }

    // Every script on an account's hidden roblox.com page goes through here, one at a time.
    readonly SemaphoreSlim robloxPageGate = new(1, 1);

    /// <summary>Runs a script on the account's signed-in roblox.com page and returns the message it posts back
    /// with the given kind. Throws "signed-out" when that account needs signing in again.</summary>
    async Task<JsonObject> RunOnRoblox(string id, string script, string kind, int timeoutMs = 30000)
    {
        await robloxPageGate.WaitAsync();
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
                try { if (JsonNode.Parse(e.WebMessageAsJson) is JsonObject o && o["kind"]?.ToString() == kind) result.TrySetResult(o); } catch { }
            }
            core.WebMessageReceived += OnMessage;
            try
            {
                await core.ExecuteScriptAsync(script);
                await Task.WhenAny(result.Task, Task.Delay(timeoutMs));
            }
            finally { core.WebMessageReceived -= OnMessage; }
            var info = result.Task.IsCompleted ? result.Task.Result : null;
            if (info == null) throw new Exception("Roblox didn't answer. Try again in a moment.");
            if (info["ok"]?.GetValue<bool>() != true) throw new Exception(info["error"]?.ToString() ?? "failed");
            return info;
        }
        catch
        {
            // A broken page is rebuilt next time.
            if (friendsView != null) { Retire(friendsView); friendsView = null; }
            throw;
        }
        finally { robloxPageGate.Release(); }
    }

    async Task RobloxFriends(string id)
    {
        if (id == "" || friendsBusy) return;
        friendsBusy = true;
        var reply = new JsonObject { ["type"] = "robloxFriends", ["id"] = id };
        try
        {
            var info = await RunOnRoblox(id, FriendsScript, "friends");
            reply["ok"] = true;
            reply["me"] = info["me"]?.DeepClone();
            reply["friends"] = info["friends"]?.DeepClone();
        }
        catch (Exception ex) { reply["ok"] = false; reply["error"] = ex.Message; }
        finally { friendsBusy = false; }
        Send(reply);
    }

    // ---------- avatars: your saved Roblox outfits, and putting one on before you play ----------

    const string RobloxCallJs = """
  let csrf = '';
  const send = async (url, body) => {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf } : {}, body: body ? JSON.stringify(body) : undefined });
      const next = r.headers.get('x-csrf-token');
      if (r.status === 403 && next && next !== csrf) { csrf = next; continue; }
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 900 * (i + 1))); continue; }
      let j = null; try { j = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, json: j };
    }
    return { ok: false, status: 429, json: null };
  };
""";

    const string OutfitsScript = """
(async () => {
  const post = (o) => chrome.webview.postMessage(o);
  try {
__CALL__
    const me = await fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' });
    if (!me.ok) return post({ kind: 'outfits', ok: false, error: 'signed-out' });
    const user = await me.json();
    const list = [];
    for (let page = 1; page <= 4; page++) {
      const r = await send(`https://avatar.roblox.com/v2/avatar/users/${user.id}/outfits?page=${page}&itemsPerPage=50&isEditable=true`);
      const data = (r.json && r.json.data) || [];
      for (const o of data) list.push({ id: o.id, name: o.name || 'Outfit' });
      if (data.length < 50) break;
    }
    const thumbs = {};
    for (let i = 0; i < list.length; i += 50) {
      const ids = list.slice(i, i + 50).map((o) => o.id).join(',');
      for (let tries = 0; tries < 4; tries++) {
        const t = await send(`https://thumbnails.roblox.com/v1/users/outfits?userOutfitIds=${ids}&size=420x420&format=Png&isCircular=false`);
        const rows = (t.json && t.json.data) || [];
        for (const x of rows) if (x.state === 'Completed') thumbs[x.targetId] = x.imageUrl;
        if (!rows.some((x) => x.state === 'Pending')) break;
        await new Promise((ok) => setTimeout(ok, 1200));
      }
    }
    for (const o of list) o.thumb = thumbs[o.id] || '';
    const cur = await send(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=420x420&format=Png&isCircular=false`);
    const now = cur.json && cur.json.data && cur.json.data[0];
    post({ kind: 'outfits', ok: true, userId: user.id, outfits: list, current: now && now.state === 'Completed' ? now.imageUrl : '' });
  } catch (e) { post({ kind: 'outfits', ok: false, error: String(e) }); }
})()
""";

    // Puts an outfit on: the same steps as Roblox's own avatar editor (body type, scales, skin colours, items).
    const string WearScript = """
(async (outfitId) => {
  const post = (o) => chrome.webview.postMessage(o);
  try {
__CALL__
    const A = 'https://avatar.roblox.com';
    let d = (await send(`${A}/v3/outfits/${outfitId}/details`)).json;
    const v3 = !!(d && d.assets);
    if (!v3) d = (await send(`${A}/v1/outfits/${outfitId}/details`)).json;
    if (!d || !d.assets) return post({ kind: 'wear', ok: false, error: 'Roblox could not find that outfit.' });
    if (d.playerAvatarType) await send(`${A}/v1/avatar/set-player-avatar-type`, { playerAvatarType: d.playerAvatarType });
    if (d.scale) await send(`${A}/v1/avatar/set-scales`, d.scale);
    if (v3 && d.bodyColor3s) await send(`${A}/v2/avatar/set-body-colors`, d.bodyColor3s);
    else if (d.bodyColors) await send(`${A}/v1/avatar/set-body-colors`, d.bodyColors);
    const assets = d.assets.map((a) => (a.meta ? { id: a.id, meta: a.meta } : { id: a.id }));
    let r = await send(`${A}/v2/avatar/set-wearing-assets`, { assets });
    if (!r.ok) r = await send(`${A}/v1/avatar/set-wearing-assets`, { assetIds: d.assets.map((a) => a.id) });
    if (!r.ok) return post({ kind: 'wear', ok: false, error: `Roblox said no (${r.status}).` });
    const bad = (r.json && (r.json.invalidAssetIds || r.json.invalidAssets)) || [];
    post({ kind: 'wear', ok: true, skipped: bad.length });
  } catch (e) { post({ kind: 'wear', ok: false, error: String(e) }); }
})(__ID__)
""";

    async Task RobloxOutfits(string id)
    {
        var reply = new JsonObject { ["type"] = "robloxOutfits", ["id"] = id };
        try
        {
            var info = await RunOnRoblox(id, OutfitsScript.Replace("__CALL__", RobloxCallJs), "outfits", 45000);
            reply["ok"] = true;
            reply["outfits"] = info["outfits"]?.DeepClone();
            reply["current"] = info["current"]?.DeepClone();
        }
        catch (Exception ex) { reply["ok"] = false; reply["error"] = ex.Message; }
        Send(reply);
    }

    async Task RobloxWear(string id, long outfitId, string token)
    {
        var reply = new JsonObject { ["type"] = "robloxWorn", ["id"] = id, ["token"] = token };
        try
        {
            var info = await RunOnRoblox(id, WearScript.Replace("__CALL__", RobloxCallJs).Replace("__ID__", outfitId.ToString()), "wear", 30000);
            reply["ok"] = true;
            reply["skipped"] = info["skipped"]?.DeepClone();
        }
        catch (Exception ex) { reply["ok"] = false; reply["error"] = ex.Message; }
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

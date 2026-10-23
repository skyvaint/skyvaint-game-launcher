using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Skyvaint;

internal static class ArtFinder
{
	private static readonly HttpClient Http;

	private static readonly Dictionary<string, JsonNode?> StoreListings;

	static ArtFinder()
	{
		Http = new HttpClient
		{
			Timeout = TimeSpan.FromSeconds(25L)
		};
		StoreListings = new Dictionary<string, JsonNode>();
		Http.DefaultRequestHeaders.UserAgent.ParseAdd("SkyvaintGameLauncher/2.0");
	}

	public static Dictionary<string, Dictionary<string, string>> EpicCatalog()
	{
		Dictionary<string, Dictionary<string, string>> map = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
		try
		{
			string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Epic", "EpicGamesLauncher", "Data", "Catalog", "catcache.bin");
			if (!File.Exists(path))
			{
				return map;
			}
			foreach (JsonObject item in (JsonNode.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(File.ReadAllText(path)))) as JsonArray)?.OfType<JsonObject>() ?? Array.Empty<JsonObject>())
			{
				string id = item["id"]?.ToString();
				if (string.IsNullOrEmpty(id) || !(item["keyImages"] is JsonArray images))
				{
					continue;
				}
				Dictionary<string, string> kinds = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
				foreach (JsonObject item2 in images.OfType<JsonObject>())
				{
					string type = item2["type"]?.ToString();
					string url = item2["url"]?.ToString();
					if (!string.IsNullOrEmpty(type) && !string.IsNullOrEmpty(url))
					{
						kinds[type] = url;
					}
				}
				map[id] = kinds;
			}
		}
		catch
		{
		}
		return map;
	}

	public static async Task<string?> MicrosoftStoreImage(string productId, string purpose)
	{
		JsonNode listing;
		lock (StoreListings)
		{
			StoreListings.TryGetValue(productId, out listing);
		}
		if (listing == null)
		{
			listing = JsonNode.Parse(await Http.GetStringAsync("https://displaycatalog.mp.microsoft.com/v7.0/products/" + productId + "?market=US&languages=en-us"));
			lock (StoreListings)
			{
				StoreListings[productId] = listing;
			}
		}
		string uri = ((from i in (listing?["Product"]?["LocalizedProperties"]?[0]?["Images"] as JsonArray)?.OfType<JsonObject>()
			where i["ImagePurpose"]?.ToString() == purpose && (i["Width"]?.GetValue<int>() ?? 0) <= 2600
			orderby i["Width"]?.GetValue<int>() ?? 0 descending
			select i).FirstOrDefault())?["Uri"]?.ToString();
		return string.IsNullOrEmpty(uri) ? null : (uri.StartsWith("//") ? ("https:" + uri) : uri);
	}

	public static async Task<(string cover, string hero)?> SteamArt(string name)
	{
		List<JsonObject> items = (JsonNode.Parse(await Http.GetStringAsync("https://store.steampowered.com/api/storesearch/?cc=us&l=en&term=" + Uri.EscapeDataString(name)))?["items"] as JsonArray)?.OfType<JsonObject>().ToList() ?? new List<JsonObject>();
		string id = (items.FirstOrDefault((JsonObject i) => Norm(i["name"]?.ToString() ?? "") == Norm(name)) ?? items.FirstOrDefault((JsonObject i) => Norm(i["name"]?.ToString() ?? "").StartsWith(Norm(name))))?["id"]?.ToString();
		if (string.IsNullOrEmpty(id))
		{
			return null;
		}
		return ("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" + id + "/library_600x900.jpg", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" + id + "/library_hero.jpg");
		static string Norm(string s)
		{
			return new string(s.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
		}
	}

	public static async Task<bool> Save(string url, string file)
	{
		_ = 1;
		try
		{
			byte[] bytes = await Http.GetByteArrayAsync(url);
			if (bytes.Length < 200)
			{
				return false;
			}
			string part = file + ".part";
			await File.WriteAllBytesAsync(part, bytes);
			File.Move(part, file, overwrite: true);
			return true;
		}
		catch
		{
			return false;
		}
	}

	public static async Task<bool> Download(IEnumerable<WantedArt> wanted)
	{
		bool any = false;
		foreach (WantedArt w in wanted)
		{
			try
			{
				if (!File.Exists(w.File))
				{
					string url = await w.Url();
					if (!string.IsNullOrEmpty(url))
					{
						bool flag = any;
						any = flag | await Save(url, w.File);
					}
				}
			}
			catch
			{
			}
		}
		return any;
	}
}

using System;
using System.IO;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Skyvaint;

internal static class RobloxApi
{
	private static readonly HttpClient Http = new HttpClient
	{
		Timeout = TimeSpan.FromSeconds(15L)
	};

	private static Task<JsonNode?> Get(string url)
	{
		return MainForm.GetJsonWith(Http, url);
	}

	private static async Task<string?> Thumbnail(string url)
	{
		for (int attempt = 0; attempt < 4; attempt++)
		{
			JsonNode item = (await Get(url))?["data"]?[0];
			if (item?["state"]?.ToString() == "Completed")
			{
				return item["imageUrl"]?.ToString();
			}
			await Task.Delay(900);
		}
		return null;
	}

	private static async Task<string?> Download(string? url, string mediaDir, string mediaHost, string fileName)
	{
		if (string.IsNullOrEmpty(url))
		{
			return null;
		}
		string path = Path.Combine(mediaDir, fileName);
		await File.WriteAllBytesAsync(path, await Http.GetByteArrayAsync(url));
		return $"https://{mediaHost}/{fileName}?v={DateTimeOffset.Now.ToUnixTimeSeconds()}";
	}

	public static async Task<(string? head, string? body)> Avatar(long userId, string mediaDir, string mediaHost)
	{
		string head = await Thumbnail($"{"https://thumbnails.roblox.com/v1/users/"}avatar-headshot?userIds={userId}&size=150x150&format=Png&isCircular=false");
		return new ValueTuple<string, string>(item2: await Download(await Thumbnail($"{"https://thumbnails.roblox.com/v1/users/"}avatar?userIds={userId}&size=420x420&format=Png"), mediaDir, mediaHost, $"acct_{userId}_body.png"), item1: await Download(head, mediaDir, mediaHost, $"acct_{userId}_head.png"));
	}

	public static async Task<JsonObject> ResolvePlace(string input, string mediaDir, string mediaHost)
	{
		Match match = Regex.Match(input, "(?:games/|placeId=)(\\d{3,})", RegexOptions.IgnoreCase);
		if (!match.Success)
		{
			match = Regex.Match(input, "(\\d{3,})");
		}
		if (!match.Success)
		{
			throw new Exception("That doesn't look like a place ID or game link.");
		}
		long placeId = long.Parse(match.Groups[1].Value);
		JsonNode universe = (await Get($"https://apis.roblox.com/universes/v1/places/{placeId}/universe"))?["universeId"];
		if (universe == null)
		{
			throw new Exception("Roblox has no place with that ID.");
		}
		long universeId = universe.GetValue<long>();
		string name = (await Get($"https://games.roblox.com/v1/games?universeIds={universeId}"))?["data"]?[0]?["name"]?.ToString();
		string icon = null;
		try
		{
			icon = await Download(await Thumbnail($"https://thumbnails.roblox.com/v1/games/icons?universeIds={universeId}&size=256x256&format=Png&isCircular=false"), mediaDir, mediaHost, $"place_{placeId}.png");
		}
		catch
		{
		}
		return new JsonObject
		{
			["placeId"] = placeId,
			["name"] = name ?? $"Place {placeId}",
			["icon"] = icon ?? ""
		};
	}
}

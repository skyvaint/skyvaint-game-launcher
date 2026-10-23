using System;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Skyvaint;

internal sealed record PrivateServer(string? Code, string? ShareUrl)
{
	public static PrivateServer? From(JsonNode? node)
	{
		if (!(node is JsonObject o))
		{
			return null;
		}
		string code = o["code"]?.ToString();
		if (!string.IsNullOrEmpty(code) && Regex.IsMatch(code, "^[\\w-]{6,128}$"))
		{
			return new PrivateServer(code, null);
		}
		if (Uri.TryCreate(o["share"]?.ToString(), UriKind.Absolute, out Uri u) && u.Scheme == "https" && (u.Host == "www.roblox.com" || u.Host == "roblox.com") && u.AbsolutePath.StartsWith("/share"))
		{
			return new PrivateServer(null, u.AbsoluteUri);
		}
		return null;
	}
}

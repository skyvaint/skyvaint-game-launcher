using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace Skyvaint;

internal static class GameScanner
{
	public static JsonArray Scan(string mediaDir, string mediaHost, List<WantedArt> wanted)
	{
		JsonArray found = new JsonArray();
		try
		{
			ScanEpic(found, mediaDir, mediaHost, wanted);
		}
		catch
		{
		}
		try
		{
			ScanSteam(found, mediaDir, mediaHost, wanted);
		}
		catch
		{
		}
		try
		{
			ScanRoblox(found, mediaDir, mediaHost, wanted);
		}
		catch
		{
		}
		return found;
	}

	private static void Remote(JsonObject game, string key, string name, string mediaDir, string mediaHost, List<WantedArt> wanted, Func<Task<string?>> url)
	{
		if (string.IsNullOrEmpty(game[key]?.ToString()))
		{
			string file = Path.Combine(mediaDir, name);
			if (File.Exists(file))
			{
				game[key] = "https://" + mediaHost + "/" + name;
			}
			else
			{
				wanted.Add(new WantedArt(file, url));
			}
		}
	}

	private static void ScanEpic(JsonArray found, string mediaDir, string mediaHost, List<WantedArt> wanted)
	{
		string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Epic", "EpicGamesLauncher", "Data", "Manifests");
		if (!Directory.Exists(dir))
		{
			return;
		}
		Dictionary<string, Dictionary<string, string>> catalog = ArtFinder.EpicCatalog();
		string[] files = Directory.GetFiles(dir, "*.item");
		foreach (string file in files)
		{
			try
			{
				JsonNode j = JsonNode.Parse(File.ReadAllText(file));
				if (j == null || !(j["AppCategories"] is JsonArray cats) || !cats.Any((JsonNode c) => c?.ToString() == "games"))
				{
					continue;
				}
				string app = j["AppName"]?.ToString() ?? "";
				string name = (j["DisplayName"]?.ToString() ?? app).Replace("®", "").Replace("™", "").Trim();
				string exe = j["LaunchExecutable"]?.ToString() ?? "";
				string proc = j["MainWindowProcessName"]?.ToString();
				if (string.IsNullOrWhiteSpace(proc))
				{
					proc = Path.GetFileName(exe);
				}
				JsonObject game = new JsonObject
				{
					["scanId"] = "epic_" + app,
					["name"] = name,
					["platform"] = "epic",
					["target"] = "com.epicgames.launcher://apps/" + app + "?action=launch&silent=true",
					["process"] = Path.GetFileNameWithoutExtension(proc ?? ""),
					["installed"] = true
				};
				string full = Path.Combine(j["InstallLocation"]?.ToString() ?? "", exe.Replace('/', '\\'));
				if (File.Exists(full))
				{
					game["icon"] = ShellImage.SaveIcon(full, mediaDir, mediaHost, "icon_epic_" + Safe(app));
				}
				if (catalog.TryGetValue(j["CatalogItemId"]?.ToString() ?? "", out Dictionary<string, string> images))
				{
					Take("cover", new string[3] { "DieselGameBoxTall", "OfferImageTall", "Thumbnail" });
					Take("hero", new string[3] { "DieselGameBox", "OfferImageWide", "Featured" });
					if (string.IsNullOrEmpty(game["icon"]?.ToString()))
					{
						Take("icon", new string[1] { "AndroidIcon" });
					}
				}
				found.Add(game);
				void Take(string key, string[] kinds)
				{
					string url = kinds.Select((string k) => images.GetValueOrDefault(k)).FirstOrDefault((string u) => !string.IsNullOrEmpty(u));
					if (url != null)
					{
						string tag = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(url)), 0, 4).ToLowerInvariant();
						Remote(game, key, $"epic_{Safe(app)}_{key}_{tag}", mediaDir, mediaHost, wanted, () => Task.FromResult(url));
					}
				}
			}
			catch
			{
			}
		}
	}

	private static void ScanSteam(JsonArray found, string mediaDir, string mediaHost, List<WantedArt> wanted)
	{
		string steam = Registry.CurrentUser.OpenSubKey("Software\\Valve\\Steam")?.GetValue("SteamPath") as string;
		if (string.IsNullOrEmpty(steam) || !Directory.Exists(steam))
		{
			return;
		}
		steam = Path.GetFullPath(steam);
		List<string> libs = new List<string> { steam };
		string vdf = Path.Combine(steam, "steamapps", "libraryfolders.vdf");
		if (File.Exists(vdf))
		{
			foreach (Match m in Regex.Matches(File.ReadAllText(vdf), "\"path\"\\s+\"([^\"]+)\""))
			{
				libs.Add(Path.GetFullPath(m.Groups[1].Value.Replace("\\\\", "\\")));
			}
		}
		Dictionary<string, SteamApp> info = new Dictionary<string, SteamApp>();
		try
		{
			info = SteamAppInfo.Read(Path.Combine(steam, "appcache", "appinfo.vdf"));
		}
		catch
		{
		}
		Dictionary<string, JsonObject> seen = new Dictionary<string, JsonObject>();
		string[] files;
		foreach (string item in libs.Distinct<string>(StringComparer.OrdinalIgnoreCase))
		{
			string apps = Path.Combine(item, "steamapps");
			if (!Directory.Exists(apps))
			{
				continue;
			}
			files = Directory.GetFiles(apps, "appmanifest_*.acf");
			for (int i = 0; i < files.Length; i++)
			{
				string text = File.ReadAllText(files[i]);
				string id = Regex.Match(text, "\"appid\"\\s+\"(\\d+)\"").Groups[1].Value;
				string name = Regex.Match(text, "\"name\"\\s+\"([^\"]+)\"").Groups[1].Value;
				if (!(id == "") && !(name == "") && !(id == "228980"))
				{
					Add(id, name, installed: true, Regex.Match(text, "\"LastOwner\"\\s+\"(\\d{17})\"").Groups[1].Value);
				}
			}
		}
		string userdata = Path.Combine(steam, "userdata");
		if (!Directory.Exists(userdata))
		{
			return;
		}
		files = Directory.GetFiles(userdata, "localconfig.vdf", SearchOption.AllDirectories);
		foreach (string local in files)
		{
			string owner = SteamAccounts.ToSteamId(Path.GetFileName(Path.GetDirectoryName(Path.GetDirectoryName(local))) ?? "");
			string text2;
			try
			{
				text2 = File.ReadAllText(local);
			}
			catch
			{
				continue;
			}
			foreach (Match item2 in Regex.Matches(text2, "\"(\\d+)\"\\s*\\{[^{}]*\"(?:LastPlayed|Playtime)\""))
			{
				string id2 = item2.Groups[1].Value;
				if (info.TryGetValue(id2, out SteamApp app) && app.IsGame && app.Name != "" && id2 != "480")
				{
					Add(id2, app.Name, installed: false, owner);
				}
			}
		}
		void Add(string text3, string text5, bool installed, string text4)
		{
			if (seen.TryGetValue(text3, out JsonObject known))
			{
				JsonArray list = (JsonArray)known["owners"];
				if (text4 != "" && !list.Any((JsonNode o) => o?.ToString() == text4))
				{
					list.Add(text4);
				}
			}
			else
			{
				info.TryGetValue(text3, out SteamApp app2);
				JsonObject obj3 = new JsonObject
				{
					["scanId"] = "steam_" + text3,
					["name"] = text5.Replace("®", "").Replace("™", "").Trim(),
					["platform"] = "steam",
					["target"] = "steam://rungameid/" + text3,
					["process"] = app2?.Process ?? "",
					["installed"] = installed
				};
				JsonArray value;
				if (!(text4 == ""))
				{
					JsonNode reference = text4;
					value = new JsonArray(new ReadOnlySpan<JsonNode>(in reference));
				}
				else
				{
					value = new JsonArray();
				}
				obj3["owners"] = value;
				JsonObject game = obj3;
				seen[text3] = game;
				CopySteamArt(steam, text3, mediaDir, mediaHost, game);
				Remote(game, "cover", "steam_" + text3 + "_cover.jpg", mediaDir, mediaHost, wanted, () => Task.FromResult("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" + text3 + "/library_600x900.jpg"));
				Remote(game, "hero", "steam_" + text3 + "_hero.jpg", mediaDir, mediaHost, wanted, () => Task.FromResult("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" + text3 + "/library_hero.jpg"));
				if (app2 != null)
				{
					string ico = Path.Combine(steam, "steam", "games", app2.ClientIcon + ".ico");
					string small = Path.Combine(steam, "appcache", "librarycache", text3, app2.Icon + ".jpg");
					string icon = ((app2.ClientIcon != "" && File.Exists(ico)) ? ShellImage.SaveIcon(ico, mediaDir, mediaHost, "icon_steam_" + text3) : "");
					if (icon == "" && app2.Icon != "" && File.Exists(small))
					{
						try
						{
							File.Copy(small, Path.Combine(mediaDir, "icon_steam_" + text3 + ".jpg"), overwrite: true);
							icon = $"https://{mediaHost}/icon_steam_{text3}.jpg";
						}
						catch
						{
						}
					}
					if (icon != "")
					{
						game["icon"] = icon;
					}
					else if (app2.Icon != "")
					{
						Remote(game, "icon", "icon_steam_" + text3 + ".jpg", mediaDir, mediaHost, wanted, () => Task.FromResult($"https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/{text3}/{app2.Icon}.jpg"));
					}
				}
				found.Add(game);
			}
		}
	}

	private static void CopySteamArt(string steam, string id, string mediaDir, string mediaHost, JsonObject game)
	{
		string cache = Path.Combine(steam, "appcache", "librarycache");
		List<string> files;
		if (Directory.Exists(cache))
		{
			files = new List<string>();
			string sub = Path.Combine(cache, id);
			if (Directory.Exists(sub))
			{
				files.AddRange(Directory.GetFiles(sub, "*.*", SearchOption.AllDirectories));
			}
			files.AddRange(Directory.GetFiles(cache, id + "_*.*"));
			Take("cover", new string[2] { "library_capsule.jpg", "library_600x900.jpg" });
			Take("hero", new string[1] { "library_hero.jpg" });
			Take("logo", new string[1] { "logo.png" });
		}
		void Take(string key, string[] endings)
		{
			string src = endings.Select((string e) => files.FirstOrDefault((string f) => f.EndsWith(e, StringComparison.OrdinalIgnoreCase))).FirstOrDefault((string f) => f != null);
			if (src == null)
			{
				return;
			}
			string destName = $"steam_{id}_{key}{Path.GetExtension(src)}";
			string dest = Path.Combine(mediaDir, destName);
			try
			{
				if (!File.Exists(dest) || new FileInfo(dest).Length != new FileInfo(src).Length)
				{
					File.Copy(src, dest, overwrite: true);
				}
				game[key] = "https://" + mediaHost + "/" + destName;
			}
			catch
			{
			}
		}
	}

	private static void ScanRoblox(JsonArray found, string mediaDir, string mediaHost, List<WantedArt> wanted)
	{
		Add("roblox_player", "Roblox", "sv:roblox", "RobloxPlayerBeta", "roblox-player", "RobloxPlayerBeta.exe");
		Add("roblox_studio", "Roblox Studio", "sv:roblox-studio", "RobloxStudioBeta", "roblox-studio", "RobloxStudioBeta.exe");
		void Add(string scanId, string name, string target, string process, string protocol, string exeName)
		{
			(string, string)? command = ProtocolCommand(protocol);
			if (command.HasValue)
			{
				JsonObject game = new JsonObject
				{
					["scanId"] = scanId,
					["name"] = name,
					["platform"] = "roblox",
					["target"] = target,
					["process"] = process,
					["installed"] = true
				};
				string exe = FindRobloxExe(exeName) ?? command.Value.Item1;
				if (File.Exists(exe))
				{
					game["icon"] = ShellImage.SaveIcon(exe, mediaDir, mediaHost, "icon_" + scanId);
				}
				if (scanId == "roblox_player")
				{
					Remote(game, "cover", "roblox_cover", mediaDir, mediaHost, wanted, () => ArtFinder.MicrosoftStoreImage("9NBLGGGZM6WM", "Poster"));
					Remote(game, "hero", "roblox_hero", mediaDir, mediaHost, wanted, () => ArtFinder.MicrosoftStoreImage("9NBLGGGZM6WM", "Hero"));
				}
				found.Add(game);
			}
		}
	}

	public static (string exe, string args)? ProtocolCommand(string protocol)
	{
		string command = Registry.ClassesRoot.OpenSubKey(protocol + "\\shell\\open\\command")?.GetValue(null) as string;
		if (string.IsNullOrWhiteSpace(command))
		{
			return null;
		}
		Match m = Regex.Match(command, "^\\s*\"([^\"]+)\"(.*)$");
		if (!m.Success)
		{
			m = Regex.Match(command, "^\\s*(\\S+)(.*)$");
		}
		string args = m.Groups[2].Value.Replace("\"%1\"", "").Replace("%1", "").Trim();
		return (m.Groups[1].Value, args);
	}

	private static string? FindRobloxExe(string exeName)
	{
		string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
		return new string[2]
		{
			Path.Combine(local, "Bloxstrap", "Versions"),
			Path.Combine(local, "Roblox", "Versions")
		}.Where(Directory.Exists).SelectMany((string d) => Directory.GetFiles(d, exeName, SearchOption.AllDirectories)).OrderByDescending(File.GetLastWriteTimeUtc)
			.FirstOrDefault();
	}

	private static string Safe(string s)
	{
		return new string(s.Where(char.IsLetterOrDigit).Take(40).ToArray());
	}
}

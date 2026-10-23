using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace Skyvaint;

internal static class SteamAppInfo
{
	private static readonly HashSet<string> Generic = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "launcher", "start", "gamelauncher", "start_protected_game", "game", "setup", "play" };

	public static Dictionary<string, SteamApp> Read(string path)
	{
		Dictionary<string, SteamApp> apps = new Dictionary<string, SteamApp>();
		if (!File.Exists(path))
		{
			return apps;
		}
		byte[] data = File.ReadAllBytes(path);
		if (BitConverter.ToUInt32(data, 0) != 123094057)
		{
			return apps;
		}
		long tableAt = BitConverter.ToInt64(data, 8);
		int pos = (int)tableAt;
		string[] strings = new string[BitConverter.ToUInt32(data, pos)];
		pos += 4;
		for (int i = 0; i < strings.Length; i++)
		{
			strings[i] = ReadString(data, ref pos);
		}
		pos = 16;
		while (pos + 8 <= tableAt)
		{
			uint appId = BitConverter.ToUInt32(data, pos);
			if (appId == 0)
			{
				break;
			}
			int size = (int)BitConverter.ToUInt32(data, pos + 4);
			int next = pos + 8 + size;
			try
			{
				int p = pos + 8 + 60;
				Dictionary<string, object> root = ReadMap(data, ref p, strings, top: true);
				if (root != null)
				{
					Dictionary<string, object> infoNode = Child(root, "appinfo");
					if (infoNode != null)
					{
						Dictionary<string, object> common = Child(infoNode, "common");
						string name = (common?.GetValueOrDefault("name") as string) ?? "";
						string type = (common?.GetValueOrDefault("type") as string) ?? "";
						apps[appId.ToString()] = new SteamApp(name, type, FindProcess(Child(infoNode, "config")), (common?.GetValueOrDefault("clienticon") as string) ?? "", (common?.GetValueOrDefault("icon") as string) ?? "");
					}
				}
			}
			catch
			{
			}
			pos = next;
		}
		return apps;
	}

	private static Dictionary<string, object>? Child(Dictionary<string, object> map, string key)
	{
		return map.GetValueOrDefault(key) as Dictionary<string, object>;
	}

	private static string FindProcess(Dictionary<string, object>? config)
	{
		if (config != null)
		{
			Dictionary<string, object> launch = Child(config, "launch");
			if (launch != null)
			{
				foreach (Dictionary<string, object> entry in launch.Values.OfType<Dictionary<string, object>>())
				{
					if ((!(Child(entry, "config")?.GetValueOrDefault("oslist") is string os) || os.Contains("windows")) && entry.GetValueOrDefault("executable") is string exe && exe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
					{
						string name = Path.GetFileNameWithoutExtension(exe.Replace('\\', '/').Split('/')[^1]);
						if (!Generic.Contains(name))
						{
							return name;
						}
					}
				}
				return "";
			}
		}
		return "";
	}

	private static Dictionary<string, object> ReadMap(byte[] d, ref int p, string[] strings, bool top = false)
	{
		Dictionary<string, object> map = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
		do
		{
			byte type = d[p++];
			if (type == 8 || type == 11)
			{
				return map;
			}
			string key = strings[BitConverter.ToInt32(d, p)];
			p += 4;
			switch (type)
			{
			case 0:
				map[key] = ReadMap(d, ref p, strings);
				break;
			case 1:
				map[key] = ReadString(d, ref p);
				break;
			case 2:
			case 3:
			case 4:
			case 6:
				p += 4;
				break;
			case 7:
			case 10:
				p += 8;
				break;
			case 5:
				while (d[p] != 0 || d[p + 1] != 0)
				{
					p += 2;
				}
				p += 2;
				break;
			default:
				throw new InvalidDataException();
			}
		}
		while (!top);
		return map;
	}

	private static string ReadString(byte[] d, ref int p)
	{
		int start = p;
		while (d[p] != 0)
		{
			p++;
		}
		string result = Encoding.UTF8.GetString(d, start, p - start);
		p++;
		return result;
	}
}

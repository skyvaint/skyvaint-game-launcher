using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace Skyvaint;

internal static class SteamAccounts
{
	public sealed record Account(string SteamId, string Name, string Persona, bool Remembered);

	private const string Key = "Software\\Valve\\Steam";

	private const long IdBase = 76561197960265728L;

	public static string? Dir
	{
		get
		{
			string path = Registry.CurrentUser.OpenSubKey("Software\\Valve\\Steam")?.GetValue("SteamPath") as string;
			if (!string.IsNullOrEmpty(path))
			{
				return Path.GetFullPath(path);
			}
			return null;
		}
	}

	private static string? Exe
	{
		get
		{
			string d = Dir;
			if (d == null || !File.Exists(Path.Combine(d, "steam.exe")))
			{
				return null;
			}
			return Path.Combine(d, "steam.exe");
		}
	}

	private static string? LoginUsers
	{
		get
		{
			string d = Dir;
			if (d == null)
			{
				return null;
			}
			return Path.Combine(d, "config", "loginusers.vdf");
		}
	}

	public static bool Installed => Exe != null;

	public static bool Running
	{
		get
		{
			Process[] procs = Process.GetProcessesByName("steam");
			Process[] array = procs;
			for (int i = 0; i < array.Length; i++)
			{
				array[i].Dispose();
			}
			return procs.Length != 0;
		}
	}

	public static string ToSteamId(string accountNumber)
	{
		if (!long.TryParse(accountNumber, out var n))
		{
			return accountNumber;
		}
		return (76561197960265728L + n).ToString();
	}

	public static List<Account> List()
	{
		List<Account> list = new List<Account>();
		try
		{
			string path = LoginUsers;
			if (path == null || !File.Exists(path))
			{
				return list;
			}
			foreach (Match item in Regex.Matches(File.ReadAllText(path), "\"(\\d{17})\"\\s*\\{([^{}]*)\\}"))
			{
				Match m = item;
				string name = Field("AccountName");
				if (!(name == ""))
				{
					string persona = Field("PersonaName");
					list.Add(new Account(m.Groups[1].Value, name, (persona == "") ? name : persona, Field("RememberPassword") != "0"));
				}
				string Field(string text)
				{
					return Regex.Match(m.Groups[2].Value, "\"" + text + "\"\\s+\"([^\"]*)\"", RegexOptions.IgnoreCase).Groups[1].Value;
				}
			}
		}
		catch
		{
		}
		return list;
	}

	public static string? SignedIn()
	{
		if (!Running)
		{
			return null;
		}
		long number = (uint)((Registry.CurrentUser.OpenSubKey("Software\\Valve\\Steam\\ActiveProcess")?.GetValue("ActiveUser") is int i) ? i : 0);
		if (number <= 0)
		{
			return null;
		}
		return (76561197960265728L + number).ToString();
	}

	public static string? Current()
	{
		string now = SignedIn();
		if (now != null)
		{
			return now;
		}
		string auto = Registry.CurrentUser.OpenSubKey("Software\\Valve\\Steam")?.GetValue("AutoLoginUser") as string;
		return List().FirstOrDefault((Account a) => a.Name.Equals(auto, StringComparison.OrdinalIgnoreCase))?.SteamId;
	}

	public static async Task Close()
	{
		if (!Running)
		{
			return;
		}
		string exe = Exe;
		if (exe == null)
		{
			return;
		}
		try
		{
			Process.Start(new ProcessStartInfo(exe, "-shutdown")
			{
				UseShellExecute = true
			})?.Dispose();
		}
		catch
		{
		}
		for (int i = 0; i < 40; i++)
		{
			if (!Running)
			{
				break;
			}
			await Task.Delay(500);
		}
		if (!Running)
		{
			return;
		}
		string[] array = new string[2] { "steam", "steamwebhelper" };
		for (int j = 0; j < array.Length; j++)
		{
			Process[] processesByName = Process.GetProcessesByName(array[j]);
			foreach (Process p in processesByName)
			{
				try
				{
					p.Kill();
				}
				catch
				{
				}
				p.Dispose();
			}
		}
		await Task.Delay(1000);
		if (Running)
		{
			return;
		}
		try
		{
			Registry.CurrentUser.CreateSubKey("Software\\Valve\\Steam\\ActiveProcess").SetValue("ActiveUser", 0, RegistryValueKind.DWord);
		}
		catch
		{
		}
	}

	public static void Select(string? accountName)
	{
		using (RegistryKey key = Registry.CurrentUser.CreateSubKey("Software\\Valve\\Steam"))
		{
			key.SetValue("AutoLoginUser", accountName ?? "");
			if (accountName != null)
			{
				key.SetValue("RememberPassword", 1, RegistryValueKind.DWord);
			}
		}
		string path = LoginUsers;
		if (path == null || !File.Exists(path))
		{
			return;
		}
		string backup = path + ".skyvaint.bak";
		if (!File.Exists(backup))
		{
			File.Copy(path, backup);
		}
		string text = Regex.Replace(File.ReadAllText(path), "(\"\\d{17}\"\\s*\\{)([^{}]*)(\\})", delegate(Match m)
		{
			string value = m.Groups[2].Value;
			bool flag = accountName != null && Regex.IsMatch(value, "\"AccountName\"\\s+\"" + Regex.Escape(accountName) + "\"", RegexOptions.IgnoreCase);
			value = SetField(value, "MostRecent", flag ? "1" : "0", add: true);
			if (flag)
			{
				string[] array = new string[2] { "AllowAutoLogin", "AutoLogin" };
				foreach (string name in array)
				{
					value = SetField(value, name, "1", add: false);
				}
			}
			return m.Groups[1].Value + value + m.Groups[3].Value;
		});
		File.WriteAllText(path, text);
	}

	private static string SetField(string body, string name, string value, bool add)
	{
		Regex field = new Regex("(\"" + name + "\"\\s+\")[^\"]*(\")", RegexOptions.IgnoreCase);
		if (field.IsMatch(body))
		{
			return field.Replace(body, "${1}" + value + "${2}", 1);
		}
		if (!add)
		{
			return body;
		}
		return body.TrimEnd() + $"\n\t\t\"{name}\"\t\t\"{value}\"\n\t";
	}

	public static void Open(bool silent)
	{
		Process.Start(new ProcessStartInfo(Exe ?? throw new Exception("Steam doesn't look installed."), silent ? "-silent" : "")
		{
			UseShellExecute = true
		})?.Dispose();
	}

	public static async Task<bool> WaitForSignIn(string steamId, int seconds, Func<bool> cancel)
	{
		DateTime until = DateTime.Now.AddSeconds(seconds);
		while (DateTime.Now < until && !cancel())
		{
			if (SignedIn() == steamId)
			{
				return true;
			}
			await Task.Delay(700);
		}
		return false;
	}
}

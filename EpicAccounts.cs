using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace Skyvaint;

internal static class EpicAccounts
{
	private const string IdKey = "Software\\Epic Games\\Unreal Engine\\Identifiers";

	private static readonly string[] Processes = new string[2] { "EpicGamesLauncher", "EpicWebHelper" };

	private static readonly string Saved = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EpicGamesLauncher", "Saved");

	public static bool Installed => IniPath() != null;

	public static bool Running
	{
		get
		{
			Process[] procs = Process.GetProcessesByName("EpicGamesLauncher");
			Process[] array = procs;
			for (int i = 0; i < array.Length; i++)
			{
				array[i].Dispose();
			}
			return procs.Length != 0;
		}
	}

	private static string? IniPath()
	{
		string config = Path.Combine(Saved, "Config");
		if (!Directory.Exists(config))
		{
			return null;
		}
		return Directory.GetFiles(config, "GameUserSettings.ini", SearchOption.AllDirectories).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
	}

	private static string ReadLog()
	{
		try
		{
			using FileStream fs = new FileStream(Path.Combine(Saved, "Logs", "EpicGamesLauncher.log"), FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
			using StreamReader reader = new StreamReader(fs);
			return reader.ReadToEnd();
		}
		catch
		{
			return "";
		}
	}

	private static string HeadOf(string text)
	{
		int end = text.IndexOf('\n');
		if (end >= 0)
		{
			return text.Substring(0, end);
		}
		return text;
	}

	public static string LogHead()
	{
		return HeadOf(ReadLog());
	}

	public static async Task<bool> WaitForSignIn(string previousHead, int seconds, Func<bool> cancelled)
	{
		DateTime until = DateTime.UtcNow.AddSeconds(seconds);
		while (DateTime.UtcNow < until && !cancelled())
		{
			await Task.Delay(700);
			string text = ReadLog();
			if (text.Length != 0 && !(HeadOf(text) == previousHead) && text.Contains("OnSignIn 1"))
			{
				return true;
			}
		}
		return false;
	}

	public static async Task<bool> LaunchUri(string uri, Func<bool> gameStarted)
	{
		for (int attempt = 0; attempt < 3; attempt++)
		{
			int seen = Count(ReadLog());
			Process.Start(new ProcessStartInfo(uri)
			{
				UseShellExecute = true
			})?.Dispose();
			for (int i = 0; i < 12; i++)
			{
				await Task.Delay(600);
				if (Count(ReadLog()) > seen || gameStarted())
				{
					return true;
				}
			}
		}
		return false;
		static int Count(string text)
		{
			int n = 0;
			int i2 = 0;
			while ((i2 = text.IndexOf("Started processing URI", i2, StringComparison.Ordinal)) >= 0)
			{
				n++;
				i2 += "Started processing URI".Length;
			}
			return n;
		}
	}

	public static (string? id, DateTime at) CurrentEpicId()
	{
		try
		{
			string data = Path.Combine(Saved, "Data");
			List<FileInfo> files = (Directory.Exists(data) ? (from f in new DirectoryInfo(data).GetFiles("*.dat")
				where Regex.IsMatch(f.Name, "^[0-9a-f]{32}\\.dat$", RegexOptions.IgnoreCase)
				orderby f.LastWriteTimeUtc descending
				select f).ToList() : new List<FileInfo>());
			using RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Epic Games\\Unreal Engine\\Identifiers");
			string reg = (key?.GetValue("AccountId") as string)?.ToLowerInvariant();
			if (!string.IsNullOrEmpty(reg))
			{
				return (id: reg, at: files.FirstOrDefault((FileInfo f) => f.Name.StartsWith(reg, StringComparison.OrdinalIgnoreCase))?.LastWriteTimeUtc ?? DateTime.MinValue);
			}
			return (files.Count > 0) ? (id: Path.GetFileNameWithoutExtension(files[0].Name).ToLowerInvariant(), at: files[0].LastWriteTimeUtc) : (id: null, at: DateTime.MinValue);
		}
		catch
		{
			return (id: null, at: DateTime.MinValue);
		}
	}

	private static bool IsRemembered(string iniText)
	{
		Match section = Regex.Match(iniText, "\\[RememberMe\\](.*?)(?=^\\[|\\z)", RegexOptions.Multiline | RegexOptions.Singleline);
		if (!section.Success)
		{
			return false;
		}
		string value = Regex.Match(section.Groups[1].Value, "^Enable=(\\S*)", RegexOptions.Multiline).Groups[1].Value;
		string data = Regex.Match(section.Groups[1].Value, "^Data=(\\S*)", RegexOptions.Multiline).Groups[1].Value;
		if (value.Equals("True", StringComparison.OrdinalIgnoreCase))
		{
			return data.Length >= 400;
		}
		return false;
	}

	public static bool HasRememberedLogin()
	{
		try
		{
			string ini = IniPath();
			return ini != null && IsRemembered(File.ReadAllText(ini));
		}
		catch
		{
			return false;
		}
	}

	public static bool SnapshotUsable(string dir, string id)
	{
		try
		{
			string path = SnapshotPath(dir, id);
			if (!File.Exists(path))
			{
				return false;
			}
			using StreamReader reader = new StreamReader(new MemoryStream(Convert.FromBase64String(JsonNode.Parse(ProtectedData.Unprotect(File.ReadAllBytes(path), null, DataProtectionScope.CurrentUser))["ini"].ToString())), detectEncodingFromByteOrderMarks: true);
			return IsRemembered(reader.ReadToEnd());
		}
		catch
		{
			return false;
		}
	}

	public static (int length, string enable) RememberedShape()
	{
		try
		{
			string ini = IniPath();
			if (ini == null)
			{
				return (length: -1, enable: "");
			}
			Match section = Regex.Match(File.ReadAllText(ini), "\\[RememberMe\\](.*?)(?=^\\[|\\z)", RegexOptions.Multiline | RegexOptions.Singleline);
			if (!section.Success)
			{
				return (length: -1, enable: "");
			}
			return (length: Regex.Match(section.Groups[1].Value, "^Data=(\\S*)", RegexOptions.Multiline).Groups[1].Value.Length, enable: Regex.Match(section.Groups[1].Value, "^Enable=(\\S*)", RegexOptions.Multiline).Groups[1].Value);
		}
		catch
		{
			return (length: -1, enable: "");
		}
	}

	private static string SnapshotPath(string dir, string id)
	{
		return Path.Combine(dir, new string(id.Where(char.IsLetterOrDigit).Take(40).ToArray()) + ".bin");
	}

	public static bool HasSnapshot(string dir, string id)
	{
		return File.Exists(SnapshotPath(dir, id));
	}

	public static void Capture(string dir, string id)
	{
		string ini = IniPath() ?? throw new Exception("The Epic Games Launcher doesn't look installed.");
		Directory.CreateDirectory(dir);
		JsonObject snap = new JsonObject
		{
			["ini"] = Convert.ToBase64String(File.ReadAllBytes(ini)),
			["accountId"] = CurrentEpicId().id
		};
		byte[] sealedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(snap.ToJsonString()), null, DataProtectionScope.CurrentUser);
		File.WriteAllBytes(SnapshotPath(dir, id), sealedBytes);
	}

	public static void Remove(string dir, string id)
	{
		try
		{
			File.Delete(SnapshotPath(dir, id));
		}
		catch
		{
		}
	}

	public static void Restore(string dir, string id)
	{
		string? path = IniPath() ?? throw new Exception("The Epic Games Launcher doesn't look installed.");
		string path2 = SnapshotPath(dir, id);
		if (!File.Exists(path2))
		{
			throw new Exception("That account has no saved sign-in — save it again from Accounts.");
		}
		JsonNode snap = JsonNode.Parse(ProtectedData.Unprotect(File.ReadAllBytes(path2), null, DataProtectionScope.CurrentUser));
		File.WriteAllBytes(path, Convert.FromBase64String(snap["ini"].ToString()));
		string accountId = snap["accountId"]?.ToString();
		if (!string.IsNullOrEmpty(accountId))
		{
			using (RegistryKey key = Registry.CurrentUser.CreateSubKey("Software\\Epic Games\\Unreal Engine\\Identifiers"))
			{
				key.SetValue("AccountId", accountId);
			}
		}
	}

	public static void ClearLogin()
	{
		string ini = IniPath();
		if (ini != null)
		{
			string cleared = Regex.Replace(File.ReadAllText(ini), "\\[RememberMe\\].*?(?=^\\[|\\z)", "[RememberMe]\r\nEnable=True\r\n\r\n", RegexOptions.Multiline | RegexOptions.Singleline);
			File.WriteAllText(ini, cleared);
		}
	}

	public static async Task Close()
	{
		List<Process> procs = Processes.SelectMany(Process.GetProcessesByName).ToList();
		foreach (Process p in procs)
		{
			try
			{
				p.Kill();
			}
			catch
			{
			}
		}
		foreach (Process p2 in procs)
		{
			try
			{
				using CancellationTokenSource timeout = new CancellationTokenSource(6000);
				await p2.WaitForExitAsync(timeout.Token);
			}
			catch
			{
			}
			p2.Dispose();
		}
		if (procs.Count > 0)
		{
			await Task.Delay(500);
		}
	}

	public static void Open(bool silent = false)
	{
		(string, string)? command = GameScanner.ProtocolCommand("com.epicgames.launcher");
		if (command.HasValue && File.Exists(command.Value.Item1))
		{
			Process.Start(new ProcessStartInfo(command.Value.Item1, silent ? "-silent" : "")
			{
				UseShellExecute = true,
				WorkingDirectory = Path.GetDirectoryName(command.Value.Item1)
			})?.Dispose();
		}
		else
		{
			Process.Start(new ProcessStartInfo("com.epicgames.launcher://store")
			{
				UseShellExecute = true
			})?.Dispose();
		}
	}
}

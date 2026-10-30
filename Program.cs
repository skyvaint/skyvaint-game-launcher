using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Windows.Forms;

namespace Skyvaint;

internal static class Program
{
	[STAThread]
	private static void Main(string[] args)
	{
		int dump = Array.IndexOf(args, "--dump");
		if (dump >= 0 && dump + 1 < args.Length)
		{
			Dump(args[dump + 1]);
			return;
		}
		// --data <folder>: run on a separate, throw-away data folder (for testing a build) so the real settings,
		// accounts, playtime and pictures in %APPDATA%\SkyvaintGameLauncher are never touched. Must be set before
		// MainForm is used, because its paths are read from here.
		int data = Array.IndexOf(args, "--data");
		if (data >= 0 && data + 1 < args.Length)
		{
			DataSafety.Override = Path.GetFullPath(args[data + 1]);
			Directory.CreateDirectory(DataSafety.Override);
		}
		// --data-chosen: restarted after picking which settings to load; the picker doesn't ask again.
		DataSafety.SkipDataPrompt = args.Contains("--data-chosen");
		// --wait-pid <id>: started by a restart (restoring a backup, finishing an update); wait for the old one to close.
		int wait = Array.IndexOf(args, "--wait-pid");
		if (wait >= 0 && wait + 1 < args.Length && int.TryParse(args[wait + 1], out var oldPid))
		{
			try { using var old = System.Diagnostics.Process.GetProcessById(oldPid); old.WaitForExit(20000); } catch { }
		}
		// A test run gets its own single-instance names, so it can run next to the real launcher.
		string inst = DataSafety.IsTest ? ".Test" + Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(DataSafety.Override!.ToLowerInvariant())), 0, 4) : "";
		bool first;
		using (new Mutex(initiallyOwned: true, "SkyvaintGameLauncher.Single" + inst, out first))
		{
			using EventWaitHandle wake = new EventWaitHandle(initialState: false, EventResetMode.AutoReset, "SkyvaintGameLauncher.Wake" + inst);
			// "--quit" asks the running launcher to close the same way as tray -> Quit (it saves first).
			using EventWaitHandle quit = new EventWaitHandle(initialState: false, EventResetMode.AutoReset, "SkyvaintGameLauncher.Quit" + inst);
			if (!first)
			{
				if (args.Contains("--quit")) quit.Set(); else wake.Set();
				return;
			}
			if (args.Contains("--quit")) return; // nothing running to close
			ApplicationConfiguration.Initialize();
			int port = Array.IndexOf(args, "--debug-port");
			MainForm.DebugPort = ((port >= 0 && port + 1 < args.Length && int.TryParse(args[port + 1], out var n)) ? n : 0);
			var form = new MainForm(wake, args.Contains("--background"), args.Contains("--dev"));
			new Thread(() => { quit.WaitOne(); try { form.BeginInvoke(form.QuitFromOutside); } catch { } }) { IsBackground = true }.Start();
			Application.Run(form);
		}
	}

	private static void Dump(string folder)
	{
		Directory.CreateDirectory(folder);
		string media = Path.Combine(folder, "media");
		Directory.CreateDirectory(media);
		JsonSerializerOptions options = new JsonSerializerOptions
		{
			WriteIndented = true
		};
		try
		{
			File.WriteAllText(Path.Combine(folder, "games.json"), GameScanner.Scan(media, "media.test", new List<WantedArt>()).ToJsonString(options));
			Clips clips = new Clips(media, "media.test", delegate
			{
			});
			JsonArray found = clips.Scan(null, [Clips.DefaultFolder]);
			File.WriteAllText(Path.Combine(folder, "clips.json"), found.ToJsonString(options));
			File.WriteAllText(Path.Combine(folder, "summary.json"), new JsonObject
			{
				["clipRoots"] = new JsonArray(((IEnumerable<string>)clips.Roots).Select((Func<string, JsonNode>)((string r) => r)).ToArray()),
				["medal"] = Clips.FindMedal(null),
				["epicInstalled"] = EpicAccounts.Installed,
				["epicIdKnown"] = EpicAccounts.CurrentEpicId().id != null,
				["epicRemembered"] = EpicAccounts.HasRememberedLogin(),
				["epicRunning"] = EpicAccounts.Running,
				["epicDataLength"] = EpicAccounts.RememberedShape().length,
				["epicRememberEnabled"] = EpicAccounts.RememberedShape().enable
			}.ToJsonString(options));
		}
		catch (Exception ex)
		{
			File.WriteAllText(Path.Combine(folder, "error.txt"), ex.ToString());
		}
	}
}

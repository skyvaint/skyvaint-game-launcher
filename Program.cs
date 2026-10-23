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
		bool first;
		using (new Mutex(initiallyOwned: true, "SkyvaintGameLauncher.Single", out first))
		{
			using EventWaitHandle wake = new EventWaitHandle(initialState: false, EventResetMode.AutoReset, "SkyvaintGameLauncher.Wake");
			if (!first)
			{
				wake.Set();
				return;
			}
			ApplicationConfiguration.Initialize();
			int port = Array.IndexOf(args, "--debug-port");
			MainForm.DebugPort = ((port >= 0 && port + 1 < args.Length && int.TryParse(args[port + 1], out var n)) ? n : 0);
			Application.Run(new MainForm(wake, args.Contains("--background"), args.Contains("--dev")));
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

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.VisualBasic.FileIO;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace Skyvaint;

public sealed partial class MainForm : Form
{
	private sealed class DarkColors : ProfessionalColorTable
	{
		private static readonly Color Bg = Color.FromArgb(18, 12, 12);

		private static readonly Color Hot = Color.FromArgb(138, 0, 0);

		public override Color ToolStripDropDownBackground => Bg;

		public override Color ImageMarginGradientBegin => Bg;

		public override Color ImageMarginGradientMiddle => Bg;

		public override Color ImageMarginGradientEnd => Bg;

		public override Color MenuBorder => Color.FromArgb(70, 20, 20);

		public override Color MenuItemBorder => Hot;

		public override Color MenuItemSelected => Hot;

		public override Color SeparatorDark => Color.FromArgb(60, 40, 40);

		public override Color SeparatorLight => Bg;
	}

	private sealed class DarkRenderer : ToolStripProfessionalRenderer
	{
		public DarkRenderer()
			: base(new DarkColors())
		{
		}
	}

	private struct RECT
	{
		public int Left;

		public int Top;

		public int Right;

		public int Bottom;
	}

	private static readonly string RobloxOldData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SkyvaintRobloxManager");

	private static readonly string RobloxCacheDir = DataSafety.RobloxLocal;

	private CoreWebView2Environment? robloxEnv;

	private int robloxClients;

	private bool robloxPlaying;

	private bool epicAwaiting;

	private Mutex? singletonMutex;

	private EventWaitHandle? singletonEvent;

	private Dictionary<string, List<string>> steamOwners = new Dictionary<string, List<string>>();

	private bool steamAwaiting;

	private string? steamBefore;

	private string? steamSeen;

	private const string LaunchScript = "(async (share) => {\n  const post = (o) => chrome.webview.postMessage(o);\n  try {\n    const me = await fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' });\n    if (!me.ok) return post({ ok: false, error: 'signed-out' });\n    const user = await me.json();\n    let csrf = '';\n    const call = async (url, body) => {\n      let r = null;\n      for (let i = 0; i < 3; i++) {\n        r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf }, body: JSON.stringify(body) });\n        const next = r.headers.get('x-csrf-token');\n        if (r.status === 403 && next && next !== csrf) { csrf = next; continue; }\n        break;\n      }\n      return r;\n    };\n    let link = null;\n    if (share) {\n      const r = await call('https://apis.roblox.com/sharelinks/v1/resolve-link', { linkId: share, linkType: 'Server' });\n      if (r && r.ok) link = (await r.json()).privateServerInviteData || null;\n    }\n    const t = await call('https://auth.roblox.com/v1/authentication-ticket', {});\n    post({ ok: !!(t && t.ok), status: t ? t.status : 0, userId: user.id, name: user.name, link });\n  } catch (e) { post({ ok: false, error: String(e) }); }\n})(__SHARE__)";

	private readonly Clips clips;

	private bool clipsScanning;

	private List<string> mappedRoots = new List<string>();

	private JsonArray? clipCache;

	private const string AppHost = "skyvaint.example";

	private const string MediaHost = "media.skyvaint.example";

	private const string RunKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

	private const string RunName = "SkyvaintGameLauncher";

	private const int PollSeconds = 3;

	// All of these follow DataSafety: the real folders normally, a throw-away folder for a --data test run.
	private static readonly string DataDir = DataSafety.Roaming;

	private static readonly string MediaDir = Path.Combine(DataDir, "media");

	private static readonly string ConfigPath = Path.Combine(DataDir, "config.json");

	private static readonly string StatePath = Path.Combine(DataDir, "state.json");

	private static readonly string CacheDir = Path.Combine(DataSafety.Local, "webview");

	private readonly WebView2 web = new WebView2
	{
		Dock = DockStyle.Fill,
		DefaultBackgroundColor = Color.FromArgb(7, 5, 5)
	};

	private readonly NotifyIcon tray = new NotifyIcon();

	private readonly System.Windows.Forms.Timer poll = new System.Windows.Forms.Timer
	{
		Interval = 3000
	};

	private readonly EventWaitHandle wake;

	private readonly bool background;

	private readonly bool dev;

	private JsonObject? config;

	private JsonObject state = new JsonObject();

	private string mode = "home";

	private Size miniSize = new Size(420, 220);

	private HashSet<string> running = new HashSet<string>();

	private readonly HashSet<string> launchedByUs = new HashSet<string>();

	private bool quitting;

	private bool pageReady;

	private bool suppressMove;

	private bool stateDirty;

	private bool launchBusy;

	private bool launchSkip;

	private DateTime lastStateSave = DateTime.Now;

	private bool artBusy;

	/// <summary>The backup the settings were put back from at start (null when nothing was wrong).</summary>
	private string? recoveredFrom;

	/// <summary>Set while a backup is being put back: the page's old settings must not be saved over it.</summary>
	private bool restoring;

	private static readonly HashSet<string> NotGames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
	{
		"SkyvaintGameLauncher", "steam", "steamwebhelper", "EpicGamesLauncher", "EpicWebHelper", "Bloxstrap", "explorer", "SearchHost", "ShellExperienceHost", "StartMenuExperienceHost",
		"msedgewebview2", "ApplicationFrameHost"
	};

	private readonly Dictionary<int, string> robloxPids = new Dictionary<int, string>();

	private readonly Queue<(string id, DateTime at)> robloxPending = new Queue<(string, DateTime)>();

	private string robloxSignature = "";

	private static readonly HashSet<string> Protected = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
	{
		"System", "Idle", "Registry", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "svchost",
		"dwm", "fontdrvhost", "explorer", "sihost", "ctfmon", "taskhostw", "RuntimeBroker", "SearchHost", "StartMenuExperienceHost", "ShellExperienceHost",
		"TextInputHost", "SecurityHealthSystray", "conhost", "dllhost", "LockApp", "ApplicationFrameHost", "SystemSettings", "MemCompression", "audiodg", "spoolsv",
		"WUDFHost", "SkyvaintGameLauncher", "msedgewebview2"
	};

	private static string EpicDir => Path.Combine(DataDir, "epic");

	public static int DebugPort { get; set; }

	private bool OnAccountMessage(JsonObject m)
	{
		switch (Str("type"))
		{
		case "epicCapture":
			EpicCapture(Str("id"));
			return true;
		case "epicSignIn":
			EpicSignInNew();
			return true;
		case "epicRemove":
			EpicAccounts.Remove(EpicDir, Str("id"));
			return true;
		case "epicState":
			Send(new JsonObject
			{
				["type"] = "epicState",
				["epic"] = EpicState()
			});
			return true;
		case "epicPrepare":
			EpicSwitchOnly(Str("id"));
			return true;
		case "steamState":
			Send(new JsonObject
			{
				["type"] = "steamState",
				["steam"] = SteamState()
			});
			return true;
		case "steamSwitch":
			SteamSwitchOnly(Str("id"));
			return true;
		case "steamAddAccount":
			SteamSignInNew();
			return true;
		case "robloxAddAccount":
			RobloxSignIn(Str("id"));
			return true;
		case "robloxRemoveAccount":
			RobloxForget(Str("id"));
			return true;
		case "robloxResolvePlace":
			RobloxResolvePlace(Str("token"), Str("input"));
			return true;
		case "robloxCheck":
			RobloxCheck(Str("id"));
			return true;
		case "robloxPlay":
		{
			List<string> ids = (from text in (m["ids"] as JsonArray)?.Select((JsonNode jsonNode) => jsonNode?.ToString() ?? "")
				where text != ""
				select text).ToList() ?? new List<string>();
			RobloxPlay(ids, Long(m["placeId"]), PrivateServer.From(m["server"]), Str("game"), mode == "home", Long(m["followUserId"]), Str("jobId"));
			return true;
		}
		case "robloxCloseClients":
		{
			Process[] processesByName = Process.GetProcessesByName("RobloxPlayerBeta");
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
			return true;
		}
		default:
			return false;
		}
		string Str(string key)
		{
			return m[key]?.ToString() ?? "";
		}
	}

	private List<(string id, string epicId)> EpicList()
	{
		return (from a in (config?["epic"]?["accounts"] as JsonArray)?.OfType<JsonObject>()
			select (a["id"]?.ToString() ?? "", (a["epicId"]?.ToString() ?? "").ToLowerInvariant()) into a
			where a.Item1 != ""
			select a).ToList() ?? new List<(string, string)>();
	}

	private string? EpicCurrent()
	{
		if (!EpicAccounts.HasRememberedLogin())
		{
			return null;
		}
		string active = state["epicActive"]?.ToString();
		if (!EpicList().Any<(string, string)>(((string id, string epicId) a) => a.id == active))
		{
			return null;
		}
		return active;
	}

	private JsonObject EpicState()
	{
		return new JsonObject
		{
			["installed"] = EpicAccounts.Installed,
			["active"] = EpicCurrent(),
			["epicId"] = EpicAccounts.CurrentEpicId().id,
			["awaiting"] = epicAwaiting,
			["remembered"] = EpicAccounts.HasRememberedLogin(),
			["usable"] = new JsonObject(from a in EpicList()
				select KeyValuePair.Create(a.id, (JsonNode)EpicAccounts.SnapshotUsable(EpicDir, a.id)))
		};
	}

	private void EpicCapture(string id)
	{
		JsonObject reply = new JsonObject
		{
			["type"] = "epicCaptured",
			["id"] = id
		};
		try
		{
			if (!EpicAccounts.Installed)
			{
				throw new Exception("The Epic Games Launcher doesn't look installed.");
			}
			if (!EpicAccounts.HasRememberedLogin())
			{
				throw new Exception("Epic isn't remembering a sign-in right now. Sign in to the Epic launcher with \"Remember me\" ticked, then save again.");
			}
			string epicId = EpicAccounts.CurrentEpicId().id ?? "";
			EpicAccounts.Capture(EpicDir, id);
			state["epicActive"] = id;
			epicAwaiting = false;
			SaveState();
			reply["id"] = id;
			reply["ok"] = true;
			reply["epicId"] = epicId;
			reply["warn"] = false;
		}
		catch (Exception ex)
		{
			reply["ok"] = false;
			reply["error"] = ex.Message;
		}
		Send(reply);
	}

	private async Task EpicSignInNew()
	{
		try
		{
			string busy = EpicGameRunning();
			if (busy != null)
			{
				throw new Exception("Close " + busy + " before switching Epic accounts.");
			}
			string current = EpicCurrent();
			await EpicAccounts.Close();
			if (current != null)
			{
				try
				{
					EpicAccounts.Capture(EpicDir, current);
				}
				catch
				{
				}
			}
			EpicAccounts.ClearLogin();
			state.Remove("epicActive");
			SaveState();
			epicAwaiting = true;
			EpicAccounts.Open();
			if (mode == "home")
			{
				SetMode("mini");
			}
			Send(new JsonObject
			{
				["type"] = "epicState",
				["epic"] = EpicState()
			});
		}
		catch (Exception ex)
		{
			Send(new JsonObject
			{
				["type"] = "epicFailed",
				["error"] = ex.Message
			});
		}
	}

	private async Task EpicSwitchOnly(string id)
	{
		string error = await PrepareEpic(id);
		Send(new JsonObject
		{
			["type"] = "epicPrepared",
			["ok"] = error == null,
			["error"] = error,
			["epic"] = EpicState()
		});
	}

	private void PollEpicSignIn()
	{
		if (epicAwaiting && EpicAccounts.HasRememberedLogin())
		{
			epicAwaiting = false;
			SetMode("home");
			Send(new JsonObject
			{
				["type"] = "epicSignedIn",
				["epic"] = EpicState()
			});
		}
	}

	private string? EpicGameRunning()
	{
		return Games().FirstOrDefault((JsonObject g) => g["platform"]?.ToString() == "epic" && running.Contains(g["id"]?.ToString() ?? ""))?["name"]?.ToString();
	}

	private async Task<string?> PrepareEpic(string? accountId)
	{
		try
		{
			List<JsonObject> accounts = (config?["epic"]?["accounts"] as JsonArray)?.OfType<JsonObject>().ToList() ?? new List<JsonObject>();
			string current = EpicCurrent();
			bool num = !string.IsNullOrEmpty(accountId) && accounts.Any((JsonObject a) => a["id"]?.ToString() == accountId) && current != accountId;
			bool usable = true;
			if (num)
			{
				if (!EpicAccounts.HasSnapshot(EpicDir, accountId))
				{
					return "That account has no saved sign-in — save it again from Accounts.";
				}
				usable = EpicAccounts.SnapshotUsable(EpicDir, accountId);
				string busy = EpicGameRunning();
				if (busy != null)
				{
					return "Close " + busy + " first — Epic can only be signed in to one account at a time.";
				}
				if (EpicAccounts.Running)
				{
					Step("Closing the Epic Games Launcher");
					await EpicAccounts.Close();
				}
				if (current != null)
				{
					Step("Saving " + NameOf(current) + "'s sign-in");
					try
					{
						EpicAccounts.Capture(EpicDir, current);
					}
					catch
					{
					}
				}
				Step("Switching Epic to " + NameOf(accountId));
				EpicAccounts.Restore(EpicDir, accountId);
				state["epicActive"] = accountId;
				SaveState();
			}
			if (EpicAccounts.Running)
			{
				return null;
			}
			Step("Starting the Epic Games Launcher");
			string head = EpicAccounts.LogHead();
			EpicAccounts.Open(usable);
			string who = ((!string.IsNullOrEmpty(accountId)) ? accountId : current);
			Step((who != null) ? ("Signing in as " + NameOf(who)) : "Signing in to Epic");
			bool flag = usable;
			if (flag)
			{
				flag = await EpicAccounts.WaitForSignIn(head, 12, () => quitting);
			}
			bool signedIn = flag;
			if (!signedIn)
			{
				EpicAccounts.Open();
				flag = usable;
				if (flag)
				{
					flag = await EpicAccounts.WaitForSignIn(head, 8, () => quitting);
				}
				signedIn = flag;
			}
			if (!signedIn)
			{
				Step("Sign in to Epic" + ((who != null) ? (" as " + NameOf(who)) : "") + " — tick Remember me");
				if (mode == "home")
				{
					SetMode("mini");
				}
				if (!(await EpicAccounts.WaitForSignIn(head, 300, () => quitting)))
				{
					return "Epic never finished signing in.";
				}
				await Task.Delay(1500);
				if (who != null && EpicAccounts.HasRememberedLogin())
				{
					try
					{
						EpicAccounts.Capture(EpicDir, who);
						state["epicActive"] = who;
						SaveState();
					}
					catch
					{
					}
				}
				else if (who != null)
				{
					tray.ShowBalloonTip(6000, "Epic sign-in not remembered", "Tick \"Remember me\" when signing in to Epic, or this account will ask you to sign in every time.", ToolTipIcon.Warning);
				}
			}
			await Task.Delay(2000);
			return null;
			string NameOf(string? id)
			{
				return accounts.FirstOrDefault((JsonObject a) => a["id"]?.ToString() == id)?["name"]?.ToString() ?? "your account";
			}
		}
		catch (Exception ex)
		{
			return ex.Message;
		}
	}

	private void RememberSteamOwners(JsonArray scan)
	{
		steamOwners = (from g in scan.OfType<JsonObject>()
			where g["owners"] is JsonArray
			select g).ToDictionary((JsonObject g) => g["scanId"]?.ToString() ?? "", (JsonObject g) => ((JsonArray)g["owners"]).Select((JsonNode o) => o?.ToString() ?? "").ToList());
	}

	private JsonObject SteamState()
	{
		return new JsonObject
		{
			["installed"] = SteamAccounts.Installed,
			["active"] = SteamAccounts.Current(),
			["signedIn"] = SteamAccounts.SignedIn(),
			["awaiting"] = steamAwaiting,
			["accounts"] = new JsonArray(((IEnumerable<SteamAccounts.Account>)SteamAccounts.List()).Select((Func<SteamAccounts.Account, JsonNode>)((SteamAccounts.Account a) => new JsonObject
			{
				["steamId"] = a.SteamId,
				["name"] = a.Name,
				["persona"] = a.Persona,
				["remembered"] = a.Remembered
			})).ToArray())
		};
	}

	private string? SteamAccountFor(JsonObject game, string? asked)
	{
		if (!string.IsNullOrEmpty(asked))
		{
			return asked;
		}
		HashSet<string> known = (from a in SteamAccounts.List()
			select a.SteamId).ToHashSet();
		string chosen = game["steamAccount"]?.ToString();
		if (!string.IsNullOrEmpty(chosen) && known.Contains(chosen))
		{
			return chosen;
		}
		if (!steamOwners.TryGetValue(game["scanId"]?.ToString() ?? "", out List<string> owners) || owners.Count == 0)
		{
			return null;
		}
		string current = SteamAccounts.Current();
		if (current != null && owners.Contains(current))
		{
			return null;
		}
		return owners.FirstOrDefault(known.Contains);
	}

	private string? SteamGameRunning()
	{
		return Games().FirstOrDefault((JsonObject g) => g["platform"]?.ToString() == "steam" && running.Contains(g["id"]?.ToString() ?? ""))?["name"]?.ToString();
	}

	private async Task<string?> PrepareSteam(string steamId)
	{
		try
		{
			SteamAccounts.Account account = SteamAccounts.List().FirstOrDefault((SteamAccounts.Account a) => a.SteamId == steamId);
			if (account == null)
			{
				return "That Steam account isn't saved on this PC any more. Add it again from Accounts.";
			}
			if (SteamAccounts.Current() == steamId)
			{
				return null;
			}
			string busy = SteamGameRunning();
			if (busy != null)
			{
				return "Close " + busy + " first. Steam can only be signed in to one account at a time.";
			}
			if (SteamAccounts.Running)
			{
				Step("Closing Steam");
				await SteamAccounts.Close();
			}
			Step("Switching Steam to " + account.Persona);
			SteamAccounts.Select(account.Name);
			Step("Starting Steam");
			SteamAccounts.Open(silent: true);
			Step("Signing in as " + account.Persona);
			if (!(await SteamAccounts.WaitForSignIn(steamId, 45, () => quitting)))
			{
				SteamAccounts.Open(silent: false);
				Step("Sign in to Steam as " + account.Name + " and tick Remember me");
				if (mode == "home")
				{
					SetMode("mini");
				}
				if (!(await SteamAccounts.WaitForSignIn(steamId, 300, () => quitting)))
				{
					return "Steam never finished signing in.";
				}
			}
			Send(new JsonObject
			{
				["type"] = "steamState",
				["steam"] = SteamState()
			});
			await Task.Delay(2500);
			return null;
		}
		catch (Exception ex)
		{
			return ex.Message;
		}
	}

	private async Task SteamSwitchOnly(string steamId)
	{
		string error = await PrepareSteam(steamId);
		Send(new JsonObject
		{
			["type"] = "steamPrepared",
			["ok"] = error == null,
			["error"] = error,
			["steam"] = SteamState()
		});
	}

	private async Task SteamSignInNew()
	{
		try
		{
			if (!SteamAccounts.Installed)
			{
				throw new Exception("Steam doesn't look installed.");
			}
			string busy = SteamGameRunning();
			if (busy != null)
			{
				throw new Exception("Close " + busy + " before adding a Steam account.");
			}
			steamBefore = SteamAccounts.SignedIn();
			await SteamAccounts.Close();
			SteamAccounts.Select(null);
			steamAwaiting = true;
			SteamAccounts.Open(silent: false);
			if (mode == "home")
			{
				SetMode("mini");
			}
			Send(new JsonObject
			{
				["type"] = "steamState",
				["steam"] = SteamState()
			});
		}
		catch (Exception ex)
		{
			Send(new JsonObject
			{
				["type"] = "steamFailed",
				["error"] = ex.Message
			});
		}
	}

	private void PollSteamSignIn()
	{
		string now = SteamAccounts.SignedIn();
		if (now == steamSeen)
		{
			return;
		}
		steamSeen = now;
		Send(new JsonObject
		{
			["type"] = "steamState",
			["steam"] = SteamState()
		});
		if (now != null)
		{
			if (steamAwaiting && now != steamBefore)
			{
				steamAwaiting = false;
				SetMode("home");
				Send(new JsonObject
				{
					["type"] = "steamSignedIn",
					["steam"] = SteamState()
				});
			}
			Send(new JsonObject
			{
				["type"] = "scan",
				["scan"] = ScanGames(),
				["art"] = true
			});
		}
	}

	private JsonObject? RobloxImport()
	{
		try
		{
			JsonObject old = ReadJson(Path.Combine(RobloxOldData, "config.json"));
			if (old == null)
			{
				return null;
			}
			string media = Path.Combine(RobloxOldData, "media");
			if (Directory.Exists(media))
			{
				string[] files = Directory.GetFiles(media);
				foreach (string file in files)
				{
					string dest = Path.Combine(MediaDir, Path.GetFileName(file));
					if (!File.Exists(dest))
					{
						File.Copy(file, dest);
					}
				}
			}
			return new JsonObject
			{
				["accounts"] = old["accounts"]?.DeepClone(),
				["places"] = old["places"]?.DeepClone(),
				["selected"] = old["selected"]?.DeepClone(),
				["placeIdx"] = old["placeIdx"]?.DeepClone(),
				["multiInstance"] = old["behavior"]?["multiInstance"]?.DeepClone(),
				["launchDelay"] = old["behavior"]?["launchDelay"]?.DeepClone()
			};
		}
		catch
		{
			return null;
		}
	}

	private async Task<CoreWebView2Environment> RobloxEnv()
	{
		if (robloxEnv == null)
		{
			Directory.CreateDirectory(RobloxCacheDir);
			robloxEnv = await CoreWebView2Environment.CreateAsync(null, RobloxCacheDir, WebOptions());
		}
		return robloxEnv;
	}

	private static string ProfileFor(string id)
	{
		return "acct_" + new string(id.Where(char.IsLetterOrDigit).Take(40).ToArray());
	}

	private async Task RobloxSignIn(string id)
	{
		if (id == "")
		{
			return;
		}
		JsonObject user = null;
		try
		{
			TaskCompletionSource done = new TaskCompletionSource();
			LoginForm form = new LoginForm(await RobloxEnv(), ProfileFor(id), base.Icon);
			form.FormClosed += delegate
			{
				done.TrySetResult();
			};
			form.Show(this);
			await done.Task;
			user = form.User;
			form.Dispose();
			Activate();
			web.Focus();
		}
		catch (Exception)
		{
		}
		if (user == null)
		{
			Send(new JsonObject
			{
				["type"] = "robloxAccountCancelled",
				["id"] = id
			});
			return;
		}
		long userId = user["id"].GetValue<long>();
		string head = null;
		string body = null;
		try
		{
			(head, body) = await RobloxApi.Avatar(userId, MediaDir, "media.skyvaint.example");
		}
		catch
		{
		}
		Send(new JsonObject
		{
			["type"] = "robloxAccountReady",
			["id"] = id,
			["userId"] = userId,
			["username"] = user["name"]?.ToString(),
			["displayName"] = user["displayName"]?.ToString(),
			["head"] = head ?? "",
			["body"] = body ?? ""
		});
	}

	private async Task<WebView2> Worker(string id)
	{
		CoreWebView2Environment env = await RobloxEnv();
		WebView2 view = new WebView2
		{
			Location = new Point(-4000, -4000),
			Size = new Size(1000, 700)
		};
		base.Controls.Add(view);
		CoreWebView2ControllerOptions options = env.CreateCoreWebView2ControllerOptions();
		options.ProfileName = ProfileFor(id);
		await view.EnsureCoreWebView2Async(env, options);
		view.CoreWebView2.IsMuted = true;
		view.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = false;
		view.CoreWebView2.NewWindowRequested += delegate(object? _, CoreWebView2NewWindowRequestedEventArgs e)
		{
			e.Handled = true;
		};
		return view;
	}

	private void Retire(WebView2 view)
	{
		view.Visible = false;
		BeginInvoke(delegate
		{
			try
			{
				base.Controls.Remove(view);
				view.Dispose();
			}
			catch
			{
			}
		});
	}

	private async Task RobloxForget(string id)
	{
		if (id == "")
		{
			return;
		}
		WebView2 view = null;
		try
		{
			view = await Worker(id);
			await view.CoreWebView2.Profile.ClearBrowsingDataAsync();
		}
		catch (Exception)
		{
		}
		finally
		{
			if (view != null)
			{
				Retire(view);
			}
		}
	}

	private async Task RobloxPlay(List<string> ids, long placeId, PrivateServer? server, string gameId, bool applyAfterLaunch, long followUserId = 0, string jobId = "")
	{
		if (robloxPlaying || ids.Count == 0 || (placeId <= 0 && followUserId <= 0))
		{
			return;
		}
		robloxPlaying = true;
		bool any = false;
		int delay = 5;
		int started = 0;
		DateTime since = DateTime.Now;
		try
		{
			delay = Math.Clamp(config?["roblox"]?["launchDelay"]?.GetValue<int>() ?? 5, 1, 30);
		}
		catch
		{
		}
		foreach (string id in ids)
		{
			if (any)
			{
				await Task.Delay(delay * 1000);
			}
			Send(new JsonObject
			{
				["type"] = "robloxPlayStatus",
				["id"] = id,
				["status"] = "launching"
			});
			DateTime at = DateTime.Now;
			var (ok, error) = await LaunchAccount(id, placeId, server, start: true, followUserId, jobId);
			// A page that didn't load or answer is usually a blip: one more go before giving up.
			if (!ok && error != null && (error.Contains("didn't load") || error.Contains("didn't respond") || error.Contains("didn't hand over")))
			{
				await Task.Delay(1500);
				(ok, error) = await LaunchAccount(id, placeId, server, start: true, followUserId, jobId);
			}
			if (ok)
			{
				robloxPending.Enqueue((id, at));
			}
			Send(new JsonObject
			{
				["type"] = "robloxPlayStatus",
				["id"] = id,
				["status"] = (ok ? "launched" : "failed"),
				["error"] = error
			});
			any = any || ok;
			if (ok)
			{
				started++;
			}
		}
		if (any && gameId != "")
		{
			MarkLaunched(gameId);
		}
		Send(new JsonObject
		{
			["type"] = "robloxPlayDone",
			["ok"] = any
		});
		if (any && applyAfterLaunch)
		{
			nint window = IntPtr.Zero;
			if (!BehaviorFlag("waitForGame", fallback: true))
			{
				await Task.Delay(1400);
			}
			else
			{
				window = await WaitForRoblox(since, started);
			}
			await AfterLaunch(window);
		}
		robloxPlaying = false;
	}

	private async Task<nint> WaitForRoblox(DateTime since, int need)
	{
		int limit = 120;
		int settle = 1500;
		try
		{
			limit = Math.Clamp(config?["behavior"]?["launchWait"]?.GetValue<int>() ?? 120, 10, 600);
		}
		catch
		{
		}
		try
		{
			settle = Math.Clamp((int)((config?["behavior"]?["launchSettle"]?.GetValue<double>() ?? 1.5) * 1000.0), 0, 15000);
		}
		catch
		{
		}
		string logs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Roblox", "logs");
		launchSkip = false;
		Send(new JsonObject
		{
			["type"] = "launchWaiting",
			["seconds"] = limit,
			["text"] = "Waiting until Roblox is in the game"
		});
		DateTime until = DateTime.Now.AddSeconds(limit);
		bool joined = false;
		while (DateTime.Now < until && !launchSkip && !quitting && !joined)
		{
			await Task.Delay(800);
			try
			{
				int count = 0;
				FileInfo[] files = new DirectoryInfo(logs).GetFiles("*_Player_*.log");
				foreach (FileInfo file in files)
				{
					if (file.LastWriteTime < since || file.Name.Contains("Crash"))
					{
						continue;
					}
					using FileStream fs = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
					using StreamReader reader = new StreamReader(fs);
					if (reader.ReadToEnd().Contains("game_join_loadtime"))
					{
						count++;
					}
				}
				joined = count >= need;
			}
			catch
			{
			}
		}
		nint window = IntPtr.Zero;
		foreach (Process p in Process.GetProcessesByName("RobloxPlayerBeta").OrderByDescending(delegate(Process process)
		{
			try
			{
				return process.StartTime;
			}
			catch
			{
				return DateTime.MinValue;
			}
		}))
		{
			try
			{
				if (window == IntPtr.Zero && IsGameWindow(p.MainWindowHandle))
				{
					window = p.MainWindowHandle;
				}
			}
			catch
			{
			}
			p.Dispose();
		}
		if (joined && window != IntPtr.Zero && !launchSkip)
		{
			Send(new JsonObject { ["type"] = "launchReady" });
			await Task.Delay(settle);
		}
		return window;
	}

	private long RobloxUserId(string id)
	{
		try
		{
			return ((config?["roblox"]?["accounts"] as JsonArray)?.OfType<JsonObject>().FirstOrDefault((JsonObject a) => a["id"]?.ToString() == id)?["userId"]?.GetValue<long>()).GetValueOrDefault();
		}
		catch
		{
			return 0L;
		}
	}

	private static bool IsRobloxPage(string url)
	{
		if (Uri.TryCreate(url, UriKind.Absolute, out Uri u) && u.Scheme == "https")
		{
			if (!(u.Host == "roblox.com"))
			{
				return u.Host.EndsWith(".roblox.com");
			}
			return true;
		}
		return false;
	}

	private async Task<(bool ok, string? error)> LaunchAccount(string id, long placeId, PrivateServer? server, bool start = true, long followUserId = 0, string jobId = "")
	{
		WebView2 view = null;
		try
		{
			view = await Worker(id);
			CoreWebView2 core = view.CoreWebView2;
			TaskCompletionSource loaded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
			TaskCompletionSource<JsonObject?> result = new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
			TaskCompletionSource<string> ticket = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
			core.LaunchingExternalUriScheme += delegate(object? _, CoreWebView2LaunchingExternalUriSchemeEventArgs e)
			{
				e.Cancel = true;
			};
			core.DOMContentLoaded += delegate
			{
				loaded.TrySetResult();
			};
			core.WebMessageReceived += delegate(object? _, CoreWebView2WebMessageReceivedEventArgs e)
			{
				if (!IsRobloxPage(e.Source))
				{
					return;
				}
				try
				{
					result.TrySetResult(JsonNode.Parse(e.WebMessageAsJson) as JsonObject);
				}
				catch
				{
				}
			};
			core.WebResourceResponseReceived += delegate(object? _, CoreWebView2WebResourceResponseReceivedEventArgs e)
			{
				if (e.Request.Uri.Contains("/v1/authentication-ticket") && e.Response.StatusCode == 200 && e.Response.Headers.Contains("rbx-authentication-ticket"))
				{
					ticket.TrySetResult(e.Response.Headers.GetHeader("rbx-authentication-ticket"));
				}
			};
			core.Navigate($"https://www.roblox.com/games/{((placeId > 0) ? placeId : 920587237)}");
			await Task.WhenAny(loaded.Task, Task.Delay(25000));
			if (!loaded.Task.IsCompleted)
			{
				return (ok: false, error: "Roblox's site didn't load — check your connection");
			}
			string url = core.Source.ToLowerInvariant();
			if (url.Contains("/login") || url.Contains("/newlogin"))
			{
				return (ok: false, error: "Signed out — sign in again");
			}
			string share = ((server?.ShareUrl != null) ? Regex.Match(server.ShareUrl, "[?&]code=([^&#]+)").Groups[1].Value : "");
			await core.ExecuteScriptAsync("(async (share) => {\n  const post = (o) => chrome.webview.postMessage(o);\n  try {\n    const me = await fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' });\n    if (!me.ok) return post({ ok: false, error: 'signed-out' });\n    const user = await me.json();\n    let csrf = '';\n    const call = async (url, body) => {\n      let r = null;\n      for (let i = 0; i < 3; i++) {\n        r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf }, body: JSON.stringify(body) });\n        const next = r.headers.get('x-csrf-token');\n        if (r.status === 403 && next && next !== csrf) { csrf = next; continue; }\n        break;\n      }\n      return r;\n    };\n    let link = null;\n    if (share) {\n      const r = await call('https://apis.roblox.com/sharelinks/v1/resolve-link', { linkId: share, linkType: 'Server' });\n      if (r && r.ok) link = (await r.json()).privateServerInviteData || null;\n    }\n    const t = await call('https://auth.roblox.com/v1/authentication-ticket', {});\n    post({ ok: !!(t && t.ok), status: t ? t.status : 0, userId: user.id, name: user.name, link });\n  } catch (e) { post({ ok: false, error: String(e) }); }\n})(__SHARE__)".Replace("__SHARE__", (share == "") ? "null" : JsonValue.Create(share).ToJsonString()));
			await Task.WhenAny(result.Task, Task.Delay(25000));
			JsonObject info = (result.Task.IsCompleted ? result.Task.Result : null);
			if (info == null)
			{
				return (ok: false, error: "Roblox didn't respond — try again");
			}
			if (info["error"]?.ToString() == "signed-out")
			{
				return (ok: false, error: "Signed out — sign in again");
			}
			if (info["error"] != null)
			{
				return (ok: false, error: "Roblox didn't respond — try again");
			}
			long expected = RobloxUserId(id);
			long actual = info["userId"]?.GetValue<long>() ?? 0;
			if (expected != 0L && actual != 0L && actual != expected)
			{
				return (ok: false, error: $"This profile is signed in as @{info["name"]} — use Sign in again");
			}
			JsonNode? jsonNode = info["ok"];
			if (jsonNode == null || !jsonNode.GetValue<bool>())
			{
				return (ok: false, error: $"Roblox refused a launch ticket (error {info["status"]}) — sign in again");
			}
			await Task.WhenAny(ticket.Task, Task.Delay(5000));
			if (!ticket.Task.IsCompleted)
			{
				return (ok: false, error: "Roblox didn't hand over a launch ticket — try again");
			}
			if (!start)
			{
				return (ok: true, error: info["name"]?.ToString());
			}
			string code = server?.Code;
			if (server?.ShareUrl != null)
			{
				code = info["link"]?["linkCode"]?.ToString();
				if (string.IsNullOrEmpty(code))
				{
					return (ok: false, error: "Roblox couldn't open that private server link — check it");
				}
				long linked = 0L;
				try
				{
					linked = (info["link"]?["placeId"]?.GetValue<long>()).GetValueOrDefault();
				}
				catch
				{
				}
				if (linked > 0)
				{
					placeId = linked;
				}
			}
			long tracker = Random.Shared.NextInt64(100000000000L, 999999999999L);
			// Joining a friend: straight into their server when Roblox says which one, otherwise follow them in.
			string request = (code != null) ? $"request=RequestPrivateGame&browserTrackerId={tracker}&placeId={placeId}&accessCode=&linkCode={Uri.EscapeDataString(code)}"
				: (jobId != "" && placeId > 0) ? $"request=RequestGameJob&browserTrackerId={tracker}&placeId={placeId}&gameId={Uri.EscapeDataString(jobId)}&isPlayTogetherGame=false"
				: followUserId > 0 ? $"request=RequestFollowUser&browserTrackerId={tracker}&userId={followUserId}"
				: $"request=RequestGame&browserTrackerId={tracker}&placeId={placeId}&isPlayTogetherGame=false";
			string join = Uri.EscapeDataString("https://assetgame.roblox.com/game/PlaceLauncher.ashx?" + request);
			Process.Start(new ProcessStartInfo($"roblox-player:1+launchmode:play+gameinfo:{ticket.Task.Result}+launchtime:{DateTimeOffset.Now.ToUnixTimeMilliseconds()}+placelauncherurl:{join}+browsertrackerid:{tracker}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InGame")
			{
				UseShellExecute = true
			})?.Dispose();
			return (ok: true, error: null);
		}
		catch (Exception ex)
		{
			return (ok: false, error: ex.Message);
		}
		finally
		{
			if (view != null)
			{
				Retire(view);
			}
		}
	}

	private async Task RobloxCheck(string id)
	{
		var (ok, detail) = await LaunchAccount(id, 0L, null, start: false);
		Send(new JsonObject
		{
			["type"] = "robloxChecked",
			["id"] = id,
			["ok"] = ok,
			["name"] = (ok ? detail : null),
			["error"] = (ok ? null : detail)
		});
	}

	private async Task RobloxResolvePlace(string token, string input)
	{
		JsonObject reply = new JsonObject
		{
			["type"] = "robloxPlaceResolved",
			["token"] = token
		};
		try
		{
			JsonObject jsonObject = reply;
			jsonObject["place"] = await RobloxApi.ResolvePlace(input, MediaDir, "media.skyvaint.example");
		}
		catch (HttpRequestException)
		{
			reply["error"] = "Couldn't reach Roblox, or no place has that ID.";
		}
		catch (Exception ex2)
		{
			reply["error"] = ex2.Message;
		}
		Send(reply);
	}

	private void ApplyMultiInstance()
	{
		bool want = false;
		try
		{
			JsonNode roblox = config?["roblox"];
			want = (roblox?["multiInstance"]?.GetValue<bool>() ?? true) && ((roblox?["accounts"] as JsonArray)?.Count ?? 0) > 1;
		}
		catch
		{
		}
		if (want && singletonMutex == null)
		{
			try
			{
				singletonMutex = new Mutex(initiallyOwned: true, "ROBLOX_singletonMutex");
			}
			catch
			{
			}
			try
			{
				singletonEvent = new EventWaitHandle(initialState: false, EventResetMode.ManualReset, "ROBLOX_singletonEvent");
				return;
			}
			catch
			{
				return;
			}
		}
		if (!want && (singletonMutex != null || singletonEvent != null))
		{
			singletonMutex?.Dispose();
			singletonEvent?.Dispose();
			singletonMutex = null;
			singletonEvent = null;
		}
	}

	private (string? medal, List<string> folders) ClipSources()
	{
		JsonNode settings = config?["clips"];
		List<string> folders = (from f in (settings?["folders"] as JsonArray)?.Select((JsonNode f) => f?.ToString() ?? "")
			where f != ""
			select f).ToList() ?? new List<string>();
		bool videos = true;
		try
		{
			videos = settings?["videos"]?.GetValue<bool>() ?? true;
		}
		catch
		{
		}
		if (videos)
		{
			folders.Add(Clips.DefaultFolder);
		}
		return (medal: settings?["medal"]?.ToString(), folders: folders);
	}

	private void PrepareClips()
	{
		try
		{
			(string? medal, List<string> folders) tuple = ClipSources();
			string medal = tuple.medal;
			List<string> folders = tuple.folders;
			clipCache = clips.Scan(medal, folders);
			MapClipHosts();
		}
		catch (Exception)
		{
		}
	}

	private void MapClipHosts()
	{
		CoreWebView2 core = web.CoreWebView2;
		for (int i = 0; i < Math.Max(mappedRoots.Count, clips.Roots.Count); i++)
		{
			if (i < mappedRoots.Count)
			{
				try
				{
					core.ClearVirtualHostNameToFolderMapping(Clips.HostFor(i));
				}
				catch
				{
				}
			}
			if (i < clips.Roots.Count)
			{
				core.SetVirtualHostNameToFolderMapping(Clips.HostFor(i), clips.Roots[i], CoreWebView2HostResourceAccessKind.Allow);
			}
		}
		mappedRoots = clips.Roots.ToList();
	}

	private void SendClips(JsonArray list)
	{
		Send(new JsonObject
		{
			["type"] = "clips",
			["clips"] = list,
			["medal"] = Clips.FindMedal(ClipSources().medal)
		});
	}

	private void OnClipMessage(JsonObject m)
	{
		string path = clips.PathOf(Str("id"));
		switch (Str("type"))
		{
		case "clipsScan":
			ScanClips(m["fresh"]?.GetValue<bool>() ?? false);
			break;
		case "clipReveal":
			if (path != null && File.Exists(path))
			{
				Process.Start("explorer.exe", "/select,\"" + path + "\"")?.Dispose();
			}
			break;
		case "clipOpen":
			if (path != null && File.Exists(path))
			{
				Process.Start(new ProcessStartInfo(path)
				{
					UseShellExecute = true
				})?.Dispose();
			}
			break;
		case "clipCopyPath":
			if (path != null)
			{
				try
				{
					Clipboard.SetText(path);
					break;
				}
				catch
				{
					break;
				}
			}
			break;
		case "clipDelete":
			if (path != null)
			{
				try
				{
					FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
					clips.Forget(Str("id"));
					Send(new JsonObject
					{
						["type"] = "clipDeleted",
						["id"] = Str("id")
					});
					break;
				}
				catch (Exception ex)
				{
					Send(new JsonObject
					{
						["type"] = "clipFailed",
						["error"] = ex.Message
					});
					break;
				}
			}
			break;
		}
		string Str(string key)
		{
			return m[key]?.ToString() ?? "";
		}
	}

	private void ScanClips(bool fresh)
	{
		if (clipCache != null && !fresh)
		{
			JsonArray ready = clipCache;
			clipCache = null;
			SendClips(ready);
		}
		else
		{
			if (clipsScanning)
			{
				return;
			}
			clipsScanning = true;
			clipCache = null;
			string medal;
			List<string> folders;
			(medal, folders) = ClipSources();
			Task.Run(delegate
			{
				try
				{
					return clips.Scan(medal, folders);
				}
				catch
				{
					return new JsonArray();
				}
			}).ContinueWith(delegate(Task<JsonArray> t)
			{
				if (!quitting && base.IsHandleCreated)
				{
					BeginInvoke(delegate
					{
						clipsScanning = false;
						if (web.CoreWebView2 != null)
						{
							if (clips.Roots.SequenceEqual<string>(mappedRoots, StringComparer.OrdinalIgnoreCase))
							{
								SendClips(t.Result);
							}
							else
							{
								MapClipHosts();
								clipCache = t.Result;
								pageReady = false;
								web.CoreWebView2.Reload();
							}
						}
					});
				}
			});
		}
	}

	private void OnClipThumb(string id, string url)
	{
		if (quitting || !base.IsHandleCreated)
		{
			return;
		}
		try
		{
			BeginInvoke(delegate
			{
				JsonObject jsonObject = clipCache?.OfType<JsonObject>().FirstOrDefault((JsonObject c) => c["id"]?.ToString() == id);
				if (jsonObject != null)
				{
					jsonObject["thumb"] = url;
				}
				Send(new JsonObject
				{
					["type"] = "clipThumb",
					["id"] = id,
					["url"] = url
				});
			});
		}
		catch
		{
		}
	}

	public MainForm(EventWaitHandle wake, bool background, bool dev)
	{
		MainForm mainForm = this;
		this.wake = wake;
		this.background = background;
		this.dev = dev;
		Text = "skyvaint game launcher";
		base.FormBorderStyle = FormBorderStyle.None;
		base.StartPosition = FormStartPosition.Manual;
		BackColor = Color.FromArgb(7, 5, 5);
		base.Bounds = Screen.PrimaryScreen.Bounds;
		base.Icon = MakeIcon(64);
		if (background)
		{
			base.Opacity = 0.0;
		}
		base.Controls.Add(web);
		Directory.CreateDirectory(MediaDir);
		Directory.CreateDirectory(CacheDir);
		// Before anything reads the data: put back a config or stats that went missing, broke, or were replaced by
		// something else (a fresh start, a test file), and any custom pictures that disappeared. See DataSafety.
		recoveredFrom = DataSafety.RecoverOnStart(ConfigPath, StatePath, MediaDir);
		config = ReadJson(ConfigPath);
		if (config != null)
		{
			bool marked = config[DataSafety.MarkKey] != null;
			DataSafety.Stamp(config);
			if (!marked) WriteJson(ConfigPath, config);
			DataSafety.Snapshot(ConfigPath, force: true);
		}
		state = ReadJson(StatePath) ?? new JsonObject();
		DataSafety.Snapshot(StatePath, force: true);
		Task.Run(() => DataSafety.MirrorMedia(MediaDir));
		if (background)
		{
			mode = Behavior("autostartMode", "hidden");
		}
		clips = new Clips(MediaDir, "media.skyvaint.example", OnClipThumb);
		ApplyMultiInstance();
		BuildTray();
		UpdateIcons();
		poll.Tick += delegate
		{
			mainForm.PollGames();
			mainForm.PollEpicSignIn();
			mainForm.PollSteamSignIn();
			mainForm.PollExtras();
		};
		// Losing and regaining the focus (alt-tabbing to a game and back) gets its own small transition.
		base.Activated += delegate { if (mode == "home") Send(new JsonObject { ["type"] = "focus", ["on"] = true }); };
		base.Deactivate += delegate { if (mode == "home") Send(new JsonObject { ["type"] = "focus", ["on"] = false }); };
		base.Load += async delegate
		{
			await mainForm.InitWebView();
		};
		Thread thread = new Thread((ThreadStart)delegate
		{
			while (wake.WaitOne())
			{
				if (!mainForm.quitting && mainForm.IsHandleCreated)
				{
					mainForm.BeginInvoke(delegate
					{
						mainForm.SetMode("home");
					});
				}
			}
		});
		thread.IsBackground = true;
		thread.Start();
	}

	/// <summary>Chromium switches: GPU rasterization on regardless of the driver blocklist, and, when the user unlocked
	/// it, no frame-rate limit or v-sync (read from the saved config, so it applies from the next start).</summary>
	private static string BrowserArgs()
	{
		var args = "--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --disable-background-timer-throttling";
		try
		{
			var saved = ReadJson(ConfigPath);
			if (saved?["perf"]?["uncapped"]?.GetValue<bool>() == true) args += " --disable-frame-rate-limit --disable-gpu-vsync";
			if (saved?["perf"]?["dgpu"]?.GetValue<bool>() == true) args += " --force_high_performance_gpu";
		}
		catch { }
		return args;
	}

	private static CoreWebView2EnvironmentOptions WebOptions()
	{
		return new CoreWebView2EnvironmentOptions(BrowserArgs());
	}

	private async Task InitWebView()
	{
		_ = 1;
		// No WebView2 runtime: nothing could be drawn, so offer Microsoft's download page instead of a cryptic error.
		if (!EnsureWebView2(this, Text))
		{
			quitting = true;
			Close();
			return;
		}
		try
		{
			CoreWebView2EnvironmentOptions options = ((DebugPort > 0) ? new CoreWebView2EnvironmentOptions(BrowserArgs() + $" --remote-debugging-port={DebugPort}") : WebOptions());
			CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, CacheDir, options);
			await web.EnsureCoreWebView2Async(env);
		mainEnv = env;
		}
		catch (Exception ex)
		{
			MessageBox.Show("Could not start the WebView2 runtime:\n\n" + ex.Message, Text);
			quitting = true;
			Close();
			return;
		}
		CoreWebView2 coreWebView = web.CoreWebView2;
		CoreWebView2Settings settings = coreWebView.Settings;
		settings.AreDefaultContextMenusEnabled = dev;
		settings.AreDevToolsEnabled = dev;
		settings.AreBrowserAcceleratorKeysEnabled = dev;
		settings.IsStatusBarEnabled = false;
		settings.IsZoomControlEnabled = false;
		settings.IsNonClientRegionSupportEnabled = true;
		coreWebView.SetVirtualHostNameToFolderMapping("skyvaint.example", Path.Combine(AppContext.BaseDirectory, "wwwroot"), CoreWebView2HostResourceAccessKind.Allow);
		coreWebView.AddWebResourceRequestedFilter("https://media.skyvaint.example/*", CoreWebView2WebResourceContext.All);
		coreWebView.WebResourceRequested += ServeMedia;
		coreWebView.WebMessageReceived += delegate(object? _, CoreWebView2WebMessageReceivedEventArgs e)
		{
			try
			{
				OnMessage(JsonNode.Parse(e.WebMessageAsJson).AsObject());
			}
			catch (Exception)
			{
			}
		};
		coreWebView.NewWindowRequested += delegate(object? _, CoreWebView2NewWindowRequestedEventArgs e)
		{
			e.Handled = true;
		};
		PrepareClips();
		coreWebView.Navigate("https://skyvaint.example/index.html");
		EnsureDock();
		RegisterHotKey(base.Handle, 1, 3u, 36u);
		poll.Start();
	}

	// Pictures and videos the page shows (art, icons, clips, your own files). Reading them happens off the window's
	// thread (a big GIF or video used to freeze the whole launcher while it loaded), and files you picked yourself
	// never change, so the page keeps them cached instead of asking again on every redraw.
	private async void ServeMedia(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
	{
		Uri uri;
		try { uri = new Uri(e.Request.Uri); } catch { return; }
		if (!uri.Host.Equals("media.skyvaint.example", StringComparison.OrdinalIgnoreCase)) return;
		CoreWebView2Environment env = (sender as CoreWebView2)?.Environment ?? web.CoreWebView2.Environment;
		CoreWebView2Deferral deferral = e.GetDeferral();
		try
		{
			string name = Path.GetFileName(Uri.UnescapeDataString(uri.AbsolutePath));
			string file = Path.Combine(MediaDir, name);
			string video = Path.GetExtension(name).ToLowerInvariant() switch { ".mp4" or ".m4v" => "video/mp4", ".webm" => "video/webm", ".mov" => "video/quicktime", _ => "" };
			var (stream, mime) = await Task.Run<(Stream?, string)>(() =>
			{
				if (name == "" || !File.Exists(file)) return (null, "");
				if (video != "") return (new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, FileOptions.Asynchronous | FileOptions.SequentialScan), video);
				byte[] bytes = File.ReadAllBytes(file);
				return (new MemoryStream(bytes), MimeOf(name, bytes));
			});
			if (stream == null)
			{
				e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "");
				return;
			}
			CoreWebView2WebResourceResponse response = env.CreateWebResourceResponse(stream, 200, "OK", "");
			response.Headers.AppendHeader("Content-Type", mime);
			response.Headers.AppendHeader("Access-Control-Allow-Origin", "*");
			// Files you picked are saved under a unique name, so they can be cached for good.
			bool picked = System.Text.RegularExpressions.Regex.IsMatch(name, @"^(image|media|video|audio|icon)_[0-9a-f]{32}\.", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
			response.Headers.AppendHeader("Cache-Control", picked ? "max-age=31536000, immutable" : "max-age=300");
			e.Response = response;
		}
		catch (Exception)
		{
		}
		finally
		{
			deferral.Complete();
		}
	}

	private static string MimeOf(string name, byte[] b)
	{
		string text = Path.GetExtension(name).ToLowerInvariant();
		if (text != null)
		{
			int length = text.Length;
			if (length != 4)
			{
				if (length == 5)
				{
					char c = text[1];
					if ((uint)c <= 102u)
					{
						switch (c)
						{
						case 'a':
							if (!(text == ".avif"))
							{
								break;
							}
							return "image/avif";
						case 'f':
							if (!(text == ".flac"))
							{
								break;
							}
							return "audio/flac";
						}
					}
					else if (c != 'j')
					{
						if (c == 'w' && text == ".webp")
						{
							return "image/webp";
						}
					}
					else if (text == ".jpeg")
					{
						goto IL_018d;
					}
				}
			}
			else
			{
				switch (text[1])
				{
				case 'p':
					if (!(text == ".png"))
					{
						goto IL_01c9;
					}
					return "image/png";
				case 'j':
					break;
				case 'g':
					if (!(text == ".gif"))
					{
						goto IL_01c9;
					}
					return "image/gif";
				case 'b':
					if (!(text == ".bmp"))
					{
						goto IL_01c9;
					}
					return "image/bmp";
				case 'm':
					goto IL_0105;
				case 'w':
					if (!(text == ".wav"))
					{
						goto IL_01c9;
					}
					return "audio/wav";
				case 'o':
					if (!(text == ".ogg"))
					{
						goto IL_01c9;
					}
					return "audio/ogg";
				default:
					goto IL_01c9;
				}
				if (text == ".jpg")
				{
					goto IL_018d;
				}
			}
		}
		goto IL_01c9;
		IL_0105:
		if (!(text == ".mp3"))
		{
			if (!(text == ".m4a"))
			{
				goto IL_01c9;
			}
			return "audio/mp4";
		}
		return "audio/mpeg";
		IL_01c9:
		if (b.Length > 12)
		{
			if (b[0] == 137 && b[1] == 80)
			{
				return "image/png";
			}
			if (b[0] == byte.MaxValue && b[1] == 216)
			{
				return "image/jpeg";
			}
			if (b[0] == 71 && b[1] == 73)
			{
				return "image/gif";
			}
			if (b[0] == 82 && b[1] == 73 && b[8] == 87 && b[9] == 69)
			{
				return "image/webp";
			}
		}
		return "application/octet-stream";
		IL_018d:
		return "image/jpeg";
	}

	private JsonArray ScanGames()
	{
		List<WantedArt> wanted = new List<WantedArt>();
		JsonArray found = GameScanner.Scan(MediaDir, "media.skyvaint.example", wanted);
		RememberSteamOwners(found);
		if (wanted.Count == 0 || artBusy)
		{
			return found;
		}
		artBusy = true;
		Task.Run(() => ArtFinder.Download(wanted)).ContinueWith(delegate(Task<bool> t)
		{
			if (!quitting && base.IsHandleCreated)
			{
				BeginInvoke(delegate
				{
					artBusy = false;
					if (t.Status == TaskStatus.RanToCompletion && t.Result)
					{
						JsonArray jsonArray = GameScanner.Scan(MediaDir, "media.skyvaint.example", new List<WantedArt>());
						RememberSteamOwners(jsonArray);
						Send(new JsonObject
						{
							["type"] = "scan",
							["scan"] = jsonArray,
							["art"] = true
						});
					}
				});
			}
		});
		return found;
	}

	private async Task FindArt(string token, string name)
	{
		JsonObject reply = new JsonObject
		{
			["type"] = "artFound",
			["token"] = token
		};
		try
		{
			(string cover, string hero)? art = await ArtFinder.SteamArt(name);
			if (art.HasValue)
			{
				string id = Guid.NewGuid().ToString("N");
				if (await ArtFinder.Save(art.Value.cover, Path.Combine(MediaDir, "art_" + id + "_cover.jpg")))
				{
					reply["cover"] = $"https://{"media.skyvaint.example"}/art_{id}_cover.jpg";
				}
				if (await ArtFinder.Save(art.Value.hero, Path.Combine(MediaDir, "art_" + id + "_hero.jpg")))
				{
					reply["hero"] = $"https://{"media.skyvaint.example"}/art_{id}_hero.jpg";
				}
			}
		}
		catch
		{
		}
		Send(reply);
	}

	private void Send(JsonObject msg)
	{
		if (pageReady && web.CoreWebView2 != null)
		{
			web.CoreWebView2.PostWebMessageAsJson(msg.ToJsonString());
		}
	}

	private void OnMessage(JsonObject m)
	{
		switch (Str("type"))
		{
		case "ready":
			pageReady = true;
			steamSeen = SteamAccounts.SignedIn();
			Send(new JsonObject
			{
				["type"] = "init",
				["config"] = config?.DeepClone(),
				["stats"] = Stats().DeepClone(),
				["scan"] = ScanGames(),
				["mode"] = mode,
				["autostart"] = IsAutostart(),
				["epic"] = EpicState(),
				["steam"] = SteamState(),
				["robloxImport"] = RobloxImport()
			});
			SetMode(mode, notify: false);
			base.Opacity = 1.0;
			PollGames();
			OnPageReadyUpdates();
			break;
		case "saveConfig":
		{
			// While a backup is being put back the page still holds the old settings; don't let it write them.
			if (restoring) break;
			var incoming = m["config"]?.DeepClone() as JsonObject;
			if (incoming != null) DataSafety.Stamp(incoming, config);
			config = incoming;
			if (config != null)
			{
				WriteJson(ConfigPath, config);
			}
			if (mode == "mini")
			{
				base.TopMost = BehaviorFlag("miniOnTop", fallback: true);
			}
			ApplyMultiInstance();
			UpdateIcons();
			EnsureDock();
			PushDock();
			UpdatePresence();
			break;
		}
		case "launch":
			Launch(Str("id"), m["account"]?.ToString(), applyAfterLaunch: true, m["wait"]?.GetValue<bool>() ?? true);
			break;
		case "setMode":
			SetMode(m["mode"]?.ToString() ?? "home");
			break;
		case "miniSize":
			miniSize = new Size(m["w"].GetValue<int>(), m["h"].GetValue<int>());
			if (mode == "mini" && base.Visible)
			{
				SetMode("mini", notify: false);
			}
			break;
		case "pickFile":
			PickFile(m["kind"]?.ToString() ?? "image", Str("token"));
			break;
		case "setAutostart":
			SetAutostart(m["on"]?.GetValue<bool>() ?? false);
			break;
		case "rescan":
			Send(new JsonObject
			{
				["type"] = "scan",
				["scan"] = ScanGames()
			});
			break;
		case "launchSkip":
			launchSkip = true;
			if (launchBusy)
			{
				AfterLaunch();
			}
			break;
		case "findArt":
			FindArt(Str("token"), Str("name"));
			break;
		case "copyText":
			try
			{
				Clipboard.SetText(Str("text"));
				break;
			}
			catch
			{
				break;
			}
		case "quit":
			Quit();
			break;
		default:
			if (!OnAccountMessage(m) && !OnTaskMessage(m) && !OnExtraMessage(m) && !OnFeedsMessage(m) && !OnSocialMessage(m) && !OnUpdateMessage(m) && !OnSetupMessage(m))
			{
				OnClipMessage(m);
			}
			break;
		}
		string Str(string key)
		{
			return m[key]?.ToString() ?? "";
		}
	}

	private void SetMode(string m, bool notify = true)
	{
		mode = m;
		if (notify)
		{
			Send(new JsonObject
			{
				["type"] = "mode",
				["mode"] = m
			});
		}
		bool appearing = !base.Visible;
		if (m == "hidden")
		{
			FadeAway();
			return;
		}
		fadeToken++;
		if (appearing && FadeOn()) base.Opacity = 0.0;
		else if (base.Opacity < 1.0 && !holdOpacity) base.Opacity = 1.0;
		if (m == "mini")
		{
			SetRoundCorners(round: true);
			float scale = (float)base.DeviceDpi / 96f;
			Size size = new Size((int)((float)miniSize.Width * scale), (int)((float)miniSize.Height * scale));
			Rectangle area = Screen.FromPoint(base.Visible ? base.Location : System.Windows.Forms.Cursor.Position).WorkingArea;
			int x = state["miniX"]?.GetValue<int>() ?? (area.Right - size.Width - 24);
			int y = state["miniY"]?.GetValue<int>() ?? (area.Bottom - size.Height - 24);
			Rectangle target = Screen.FromPoint(new Point(x + size.Width / 2, y + size.Height / 2)).WorkingArea;
			x = Math.Clamp(x, target.Left, Math.Max(target.Left, target.Right - size.Width));
			y = Math.Clamp(y, target.Top, Math.Max(target.Top, target.Bottom - size.Height));
			suppressMove = true;
			base.Bounds = new Rectangle(x, y, size.Width, size.Height);
			suppressMove = false;
			base.TopMost = BehaviorFlag("miniOnTop", fallback: true);
			Show();
			if (appearing && FadeOn()) _ = FadeTo(1.0, 220);
		}
		else
		{
			Screen screen = (base.Visible ? Screen.FromControl(this) : Screen.FromPoint(System.Windows.Forms.Cursor.Position));
			SetRoundCorners(round: false);
			base.TopMost = false;
			suppressMove = true;
			base.Bounds = screen.Bounds;
			suppressMove = false;
			Show();
			Activate();
			web.Focus();
			if (appearing && FadeOn()) _ = FadeTo(1.0, 260);
		}
	}

	int fadeToken;
	bool holdOpacity;

	bool FadeOn()
	{
		try { return config?["fx"]?["fadeWindow"]?.GetValue<bool>() ?? true; } catch { return true; }
	}

	/// <summary>Eases the whole window's opacity to the target, so it melts away instead of vanishing.</summary>
	private async Task FadeTo(double target, int ms)
	{
		int token = ++fadeToken;
		double from = base.Opacity;
		int steps = Math.Max(1, ms / 15);
		for (int i = 1; i <= steps; i++)
		{
			await Task.Delay(15);
			if (token != fadeToken || quitting || IsDisposed) return;
			double t = (double)i / steps;
			t = 1 - (1 - t) * (1 - t) * (1 - t); // ease out
			base.Opacity = Math.Clamp(from + (target - from) * t, 0.0, 1.0);
		}
	}

	/// <summary>Hides to the tray by fading the window into transparency first.</summary>
	private async void FadeAway()
	{
		if (!base.Visible) return;
		if (base.Opacity <= 0.05 || !FadeOn())
		{
			Hide();
			base.Opacity = 1.0;
			return;
		}
		int ms = mode == "home" ? 420 : 300;
		await FadeTo(0.0, ms);
		if (mode != "hidden") return; // shown again meanwhile
		Hide();
		base.Opacity = 1.0;
	}

	private void ToggleHome()
	{
		if (mode == "home" && base.Visible) LeaveTo("mini");
		else SetMode("home");
	}

	/// <summary>Leaves HOME with the page's warp-out first, when space transitions are on.</summary>
	private async void LeaveTo(string m)
	{
		bool animate = true;
		try { animate = config?["fx"]?["space"]?.GetValue<bool>() ?? true; } catch { }
		if (animate && mode == "home" && base.Visible && m != "home")
		{
			// The page drifts back and blurs while the window itself fades out.
			Send(new JsonObject { ["type"] = "leave", ["to"] = m });
			if (m == "mini" && FadeOn())
			{
				await FadeTo(0.0, 380);
				if (mode != "home") return;
				holdOpacity = true;
				try { SetMode(m); } finally { holdOpacity = false; }
				await FadeTo(1.0, 220);
				return;
			}
		}
		SetMode(m);
	}

	protected override void OnMove(EventArgs e)
	{
		base.OnMove(e);
		if (!(mode != "mini") && !suppressMove && base.Visible)
		{
			state["miniX"] = base.Left;
			state["miniY"] = base.Top;
			stateDirty = true;
		}
	}

	protected override void WndProc(ref Message m)
	{
		if (m.Msg == 786)
		{
			ToggleHome();
		}
		base.WndProc(ref m);
	}

	protected override void OnFormClosing(FormClosingEventArgs e)
	{
		if (!quitting && e.CloseReason == CloseReason.UserClosing)
		{
			e.Cancel = true;
			LeaveTo(Behavior("closeAction", "hidden"));
			return;
		}
		UnregisterHotKey(base.Handle, 1);
		tray.Visible = false;
		try { discord.SetActivity(null); discord.Close(); } catch { }
		foreach (var d in docks.Values) d.Close();
		SaveState();
		base.OnFormClosing(e);
	}

	private void Quit()
	{
		quitting = true;
		Close();
	}

	private void SetRoundCorners(bool round)
	{
		int pref = ((!round) ? 1 : 2);
		try
		{
			DwmSetWindowAttribute(base.Handle, 33, ref pref, 4);
		}
		catch
		{
		}
	}

	private IEnumerable<JsonObject> Games()
	{
		return (config?["games"] as JsonArray)?.OfType<JsonObject>() ?? Array.Empty<JsonObject>();
	}

	private JsonObject? FindGame(string id)
	{
		return Games().FirstOrDefault((JsonObject g) => g["id"]?.ToString() == id);
	}

	private void LaunchFailed(string id, string error, JsonObject? game = null)
	{
		Send(new JsonObject
		{
			["type"] = "launchFailed",
			["id"] = id,
			["error"] = error
		});
		if (mode == "hidden")
		{
			tray.ShowBalloonTip(4000, "Couldn't start " + (game?["name"] ?? ((JsonNode?)"the game")), error, ToolTipIcon.Error);
		}
	}

	private void Step(string text)
	{
		Send(new JsonObject
		{
			["type"] = "launchStep",
			["text"] = text
		});
	}

	private async Task Launch(string id, string? account, bool applyAfterLaunch, bool wait = true)
	{
		if (launchBusy)
		{
			return;
		}
		JsonObject game = FindGame(id);
		string target = game?["target"]?.ToString();
		if (string.IsNullOrWhiteSpace(target))
		{
			LaunchFailed(id, "This game has no launch target set.");
			return;
		}
		launchBusy = true;
		launchSkip = false;
		string[] names = Array.Empty<string>();
		HashSet<int> before = new HashSet<int>();
		string name = game["name"]?.ToString() ?? "the game";
		try
		{
			bool epic = target.StartsWith("com.epicgames.launcher://", StringComparison.OrdinalIgnoreCase);
			if (epic)
			{
				string error = await PrepareEpic(account);
				if (error != null)
				{
					LaunchFailed(id, error, game);
					return;
				}
			}
			else if (target.StartsWith("steam://", StringComparison.OrdinalIgnoreCase))
			{
				string steamId = SteamAccountFor(game, account);
				if (steamId != null)
				{
					string error2 = await PrepareSteam(steamId);
					if (error2 != null)
					{
						LaunchFailed(id, error2, game);
						return;
					}
				}
			}
			names = ProcessNames(game);
			before = PidsOf(names);
			Step("Starting " + name);
			if (epic)
			{
				await EpicAccounts.LaunchUri(target, () => PidsOf(names).Except(before).Any());
			}
			else
			{
				ProcessStartInfo psi;
				if (target.StartsWith("sv:roblox"))
				{
					(string, string) command = GameScanner.ProtocolCommand((target == "sv:roblox") ? "roblox-player" : "roblox-studio") ?? throw new Exception(name + " doesn't look installed.");
					psi = new ProcessStartInfo(command.Item1, command.Item2)
					{
						UseShellExecute = true
					};
				}
				else
				{
					psi = new ProcessStartInfo(target)
					{
						UseShellExecute = true
					};
					string args = game["args"]?.ToString();
					if (!string.IsNullOrWhiteSpace(args))
					{
						psi.Arguments = args;
					}
					if (File.Exists(target))
					{
						psi.WorkingDirectory = Path.GetDirectoryName(target);
					}
				}
				Process.Start(psi)?.Dispose();
			}
		}
		catch (Exception ex)
		{
			LaunchFailed(id, ex.Message, game);
			return;
		}
		finally
		{
			launchBusy = false;
		}
		MarkLaunched(id);
		if (game["platform"]?.ToString() == "epic")
		{
			Send(new JsonObject
			{
				["type"] = "epicState",
				["epic"] = EpicState()
			});
		}
		if (applyAfterLaunch)
		{
			nint num = ((!(mode == "home" && wait) || !BehaviorFlag("waitForGame", fallback: true)) ? IntPtr.Zero : (await WaitForGame(names, before, 1)));
			nint window = num;
			await AfterLaunch(window);
		}
	}

	private static string[] ProcessNames(JsonObject game)
	{
		return (from p in (game["process"]?.ToString() ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
			select (!p.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) ? p : p.Substring(0, p.Length - 4)).ToArray();
	}

	private static HashSet<int> PidsOf(string[] names)
	{
		HashSet<int> pids = new HashSet<int>();
		for (int i = 0; i < names.Length; i++)
		{
			Process[] processesByName = Process.GetProcessesByName(names[i]);
			foreach (Process p in processesByName)
			{
				pids.Add(p.Id);
				p.Dispose();
			}
		}
		return pids;
	}

	private static bool IsGameWindow(nint handle)
	{
		if (handle == IntPtr.Zero || !IsWindowVisible(handle) || !GetWindowRect(handle, out var r))
		{
			return false;
		}
		if (r.Right - r.Left >= 480)
		{
			return r.Bottom - r.Top >= 300;
		}
		return false;
	}

	private async Task<nint> WaitForGame(string[] names, HashSet<int> before, int need)
	{
		int limit = 120;
		int settle = 1500;
		try
		{
			limit = Math.Clamp(config?["behavior"]?["launchWait"]?.GetValue<int>() ?? 120, 10, 600);
		}
		catch
		{
		}
		try
		{
			settle = Math.Clamp((int)((config?["behavior"]?["launchSettle"]?.GetValue<double>() ?? 1.5) * 1000.0), 0, 15000);
		}
		catch
		{
		}
		if (names.Length == 0)
		{
			limit = Math.Min(limit, 45);
		}
		launchSkip = false;
		Send(new JsonObject
		{
			["type"] = "launchWaiting",
			["seconds"] = limit
		});
		DateTime until = DateTime.Now.AddSeconds(limit);
		nint found = IntPtr.Zero;
		while (DateTime.Now < until && !launchSkip && !quitting && found == IntPtr.Zero)
		{
			await Task.Delay(600);
			int count = 0;
			nint first = IntPtr.Zero;
			for (int i = 0; i < names.Length; i++)
			{
				Process[] processesByName = Process.GetProcessesByName(names[i]);
				foreach (Process p in processesByName)
				{
					try
					{
						nint handle = p.MainWindowHandle;
						if (IsGameWindow(handle))
						{
							count += ((!before.Contains(p.Id)) ? 1 : need);
							if (first == IntPtr.Zero)
							{
								first = handle;
							}
						}
					}
					catch
					{
					}
					p.Dispose();
				}
			}
			if (count >= need)
			{
				found = first;
			}
			if (names.Length != 0)
			{
				continue;
			}
			nint front = GetForegroundWindow();
			GetWindowThreadProcessId(front, out var pid);
			try
			{
				using Process owner = Process.GetProcessById((int)pid);
				if (!NotGames.Contains(owner.ProcessName) && IsGameWindow(front))
				{
					found = front;
				}
			}
			catch
			{
			}
		}
		if (found != IntPtr.Zero && !launchSkip)
		{
			Send(new JsonObject { ["type"] = "launchReady" });
			await Task.Delay(settle);
		}
		return found;
	}

	private void MarkLaunched(string id)
	{
		launchedByUs.Add(id);
		StatFor(id)["lastPlayed"] = DateTimeOffset.Now.ToUnixTimeMilliseconds();
		SaveState();
		Send(new JsonObject
		{
			["type"] = "stats",
			["stats"] = Stats().DeepClone()
		});
	}

	private async Task AfterLaunch(nint gameWindow = 0)
	{
		string after = Behavior("afterLaunch", "hidden");
		if (after != "stay" && after != mode)
		{
			if (gameWindow != IntPtr.Zero && mode == "home" && base.Visible)
			{
				await FadeOut();
			}
			SetMode(after);
			base.Opacity = 1.0;
		}
		else
		{
			Send(new JsonObject
			{
				["type"] = "mode",
				["mode"] = mode
			});
		}
		if (gameWindow != IntPtr.Zero)
		{
			SetForegroundWindow(gameWindow);
		}
	}

	private async Task FadeOut()
	{
		try
		{
			for (int i = 1; i <= 12; i++)
			{
				if (quitting)
				{
					break;
				}
				base.Opacity = 1.0 - (double)i / 12.0;
				await Task.Delay(35);
			}
		}
		catch
		{
		}
	}

	private void PollGames()
	{
		if (stateDirty && (DateTime.Now - lastStateSave).TotalSeconds > 5.0)
		{
			SaveState();
		}
		List<(string, string[])> wanted = new List<(string, string[])>();
		foreach (JsonObject g in Games())
		{
			string[] procs = (from text in (g["process"]?.ToString() ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
				select (!text.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) ? text : text.Substring(0, text.Length - 4)).ToArray();
			if (procs.Length != 0)
			{
				wanted.Add((g["id"]?.ToString() ?? "", procs));
			}
		}
		if (wanted.Count == 0 && running.Count == 0)
		{
			return;
		}
		HashSet<string> live = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		int roblox = 0;
		Process[] processes = Process.GetProcesses();
		foreach (Process p in processes)
		{
			try
			{
				live.Add(p.ProcessName);
				if (p.ProcessName.Equals("RobloxPlayerBeta", StringComparison.OrdinalIgnoreCase))
				{
					roblox++;
				}
			}
			catch
			{
			}
			p.Dispose();
		}
		PublishRoblox();
		HashSet<string> now = (from w in wanted
			where w.Item2.Any(live.Contains)
			select w.Item1).ToHashSet();
		TrackRunningSince(now);
		foreach (string id in now)
		{
			JsonObject stat = StatFor(id);
			stat["seconds"] = (stat["seconds"]?.GetValue<long>() ?? 0) + 3;
			stateDirty = true;
		}
		if (now.SetEquals(running))
		{
			if (now.Count > 0 && (DateTime.Now - lastStateSave).TotalSeconds > 60.0)
			{
				SaveState();
				Send(new JsonObject
				{
					["type"] = "stats",
					["stats"] = Stats().DeepClone()
				});
			}
			return;
		}
		List<string> list = running.Except(now).ToList();
		running = now;
		SaveState();
		Send(new JsonObject
		{
			["type"] = "running",
			["ids"] = new JsonArray(((IEnumerable<string>)now).Select((Func<string, JsonNode>)((string i) => i)).ToArray()),
			["stats"] = Stats().DeepClone()
		});
		bool oursEnded = list.Any(launchedByUs.Contains);
		foreach (string id2 in list)
		{
			launchedByUs.Remove(id2);
		}
		if (oursEnded && now.Count == 0 && !robloxPlaying && mode != "home" && Behavior("onGameExit", "home") == "home")
		{
			SetMode("home");
		}
	}

	private JsonObject Stats()
	{
		JsonObject s = state["stats"] as JsonObject;
		if (s == null)
		{
			s = (JsonObject)(state["stats"] = new JsonObject());
		}
		return s;
	}

	private JsonObject StatFor(string id)
	{
		JsonObject stats = Stats();
		JsonObject s = stats[id] as JsonObject;
		if (s == null)
		{
			s = (JsonObject)(stats[id] = new JsonObject());
		}
		return s;
	}

	private void PickFile(string kind, string token)
	{
		JsonObject reply = new JsonObject
		{
			["type"] = "filePicked",
			["token"] = token
		};
		if (kind == "folder")
		{
			using (FolderBrowserDialog folders = new FolderBrowserDialog
			{
				Description = "Choose a folder",
				UseDescriptionForTitle = true
			})
			{
				if (folders.ShowDialog(this) == DialogResult.OK)
				{
					reply["path"] = folders.SelectedPath;
				}
				Send(reply);
				return;
			}
		}
		OpenFileDialog openFileDialog = new OpenFileDialog();
		OpenFileDialog openFileDialog2 = openFileDialog;
		string filter = kind == "media" ? "Pictures, GIFs and videos|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif;*.bmp;*.ico;*.mp4;*.webm;*.m4v;*.mov|Pictures|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif;*.bmp;*.ico|Videos|*.mp4;*.webm;*.m4v;*.mov" : kind == "video" ? "Videos|*.mp4;*.webm;*.m4v;*.mov" : ((kind == "image") ? "Images|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.avif;*.bmp;*.ico" : ((!(kind == "audio")) ? "Games and shortcuts|*.exe;*.lnk;*.url;*.bat|All files|*.*" : "Audio|*.mp3;*.wav;*.ogg;*.m4a;*.flac"));
		openFileDialog2.Filter = filter;
		using OpenFileDialog dlg = openFileDialog;
		if (dlg.ShowDialog(this) == DialogResult.OK)
		{
			string path = dlg.FileName;
			reply["name"] = Path.GetFileName(path);
			if (kind == "exe")
			{
				string product = null;
				try
				{
					product = FileVersionInfo.GetVersionInfo(path).ProductName;
				}
				catch
				{
				}
				reply["path"] = path;
				reply["title"] = (string.IsNullOrWhiteSpace(product) ? Path.GetFileNameWithoutExtension(path) : product);
				reply["process"] = (path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? Path.GetFileNameWithoutExtension(path) : "");
				if (path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
				{
					reply["icon"] = ShellImage.SaveIcon(path, MediaDir, "media.skyvaint.example", $"icon_{Guid.NewGuid():N}");
				}
			}
			else
			{
				string dest = $"{kind}_{Guid.NewGuid():N}{Path.GetExtension(path).ToLowerInvariant()}";
				File.Copy(path, Path.Combine(MediaDir, dest), overwrite: true);
				reply["url"] = "https://media.skyvaint.example/" + dest;
			}
		}
		Send(reply);
	}

	private void BuildTray()
	{
		ContextMenuStrip menu = new ContextMenuStrip
		{
			ShowImageMargin = false,
			Renderer = new DarkRenderer()
		};
		menu.Opening += delegate
		{
			menu.Items.Clear();
			Add(menu, "Open HOME", delegate
			{
				SetMode("home");
			}, bold: true);
			Add(menu, "Mini mode", delegate
			{
				SetMode("mini");
			});
			menu.Items.Add(new ToolStripSeparator());
			foreach (JsonObject current in (from g in Games()
				orderby StatFor(g["id"]?.ToString() ?? "")["lastPlayed"]?.GetValue<long>() ?? 0 descending
				select g).Take(12))
			{
				string id = current["id"]?.ToString() ?? "";
				string text = (running.Contains(id) ? "●  " : "▸  ") + current["name"];
				Add(menu, text, delegate
				{
					TrayLaunch(id);
				});
			}
			menu.Items.Add(new ToolStripSeparator());
			Add(menu, "Quit", Quit);
		};
		tray.Icon = MakeIcon(32);
		tray.Text = "skyvaint game launcher";
		tray.ContextMenuStrip = menu;
		tray.Visible = true;
		tray.MouseClick += delegate(object? _, MouseEventArgs e)
		{
			if (e.Button == MouseButtons.Left)
			{
				SetMode("home");
			}
		};
	}

	private void TrayLaunch(string id)
	{
		JsonObject game = FindGame(id);
		if ((!(game?["target"]?.ToString() == "sv:roblox") && (!(game?["platform"]?.ToString() == "epic") || EpicList().Count <= 1 || !BehaviorFlag("promptAccount", fallback: true))) || !pageReady)
		{
			Launch(id, null, applyAfterLaunch: false);
			return;
		}
		SetMode("home");
		Send(new JsonObject
		{
			["type"] = "requestLaunch",
			["id"] = id
		});
	}

	private static void Add(ContextMenuStrip menu, string text, Action action, bool bold = false)
	{
		ToolStripMenuItem item = new ToolStripMenuItem(text)
		{
			ForeColor = Color.FromArgb(245, 239, 238)
		};
		if (bold)
		{
			item.Font = new Font(item.Font, FontStyle.Bold);
		}
		item.Click += delegate
		{
			action();
		};
		menu.Items.Add(item);
	}

	/// <summary>The launcher's icon as set in Theme → App icon (a bolt on the theme colours by default).</summary>
	private Icon MakeIcon(int size) => AppIcon.ToIcon(AppIcon.Draw(size, config, MediaDir));

	private string Behavior(string key, string fallback)
	{
		try
		{
			return config?["behavior"]?[key]?.GetValue<string>() ?? fallback;
		}
		catch
		{
			return fallback;
		}
	}

	private bool BehaviorFlag(string key, bool fallback)
	{
		try
		{
			return config?["behavior"]?[key]?.GetValue<bool>() ?? fallback;
		}
		catch
		{
			return fallback;
		}
	}

	private static bool IsAutostart()
	{
		using RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
		return key?.GetValue("SkyvaintGameLauncher") != null;
	}

	private static void SetAutostart(bool on)
	{
		using RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", writable: true);
		if (key != null)
		{
			if (on)
			{
				key.SetValue("SkyvaintGameLauncher", "\"" + Environment.ProcessPath + "\" --background");
			}
			else
			{
				key.DeleteValue("SkyvaintGameLauncher", throwOnMissingValue: false);
			}
		}
	}

	private void SaveState()
	{
		if (restoring) return; // a backup's stats were just put back; don't write the old ones over them
		WriteJson(StatePath, state);
		stateDirty = false;
		lastStateSave = DateTime.Now;
	}

	private static JsonObject? ReadJson(string path)
	{
		try
		{
			return File.Exists(path) ? (JsonNode.Parse(File.ReadAllText(path)) as JsonObject) : null;
		}
		catch
		{
			return null;
		}
	}

	private static void WriteJson(string path, JsonObject json)
	{
		// The settings and the stats keep dated backups outside the data folder (see DataSafety).
		if (path == ConfigPath || path == StatePath) DataSafety.Snapshot(path);
		try
		{
			string text = path + ".tmp";
			File.WriteAllText(text, json.ToJsonString(new JsonSerializerOptions
			{
				WriteIndented = true
			}));
			File.Move(text, path, overwrite: true);
		}
		catch
		{
		}
	}

	[DllImport("user32.dll")]
	private static extern bool RegisterHotKey(nint hWnd, int id, uint modifiers, uint vk);

	[DllImport("user32.dll")]
	private static extern bool UnregisterHotKey(nint hWnd, int id);

	[DllImport("dwmapi.dll")]
	private static extern int DwmSetWindowAttribute(nint hwnd, int attr, ref int value, int size);

	[DllImport("user32.dll")]
	private static extern bool IsWindowVisible(nint hWnd);

	[DllImport("user32.dll")]
	private static extern bool GetWindowRect(nint hWnd, out RECT rect);

	[DllImport("user32.dll")]
	private static extern bool SetForegroundWindow(nint hWnd);

	[DllImport("user32.dll")]
	private static extern nint GetForegroundWindow();

	[DllImport("user32.dll")]
	private static extern uint GetWindowThreadProcessId(nint hWnd, out uint processId);

	private bool OnTaskMessage(JsonObject m)
	{
		switch (Str("type"))
		{
		case "tasks":
			SendTasks(m["all"]?.GetValue<bool>() ?? false);
			return true;
		case "stopGame":
			StopGame(Str("id"));
			return true;
		case "killProcess":
			KillProcess(m["pid"]?.GetValue<int>() ?? 0);
			return true;
		default:
			return false;
		}
		string Str(string key)
		{
			return m[key]?.ToString() ?? "";
		}
	}

	private List<(int pid, string? account, DateTime started, long mem)> TrackRoblox()
	{
		List<(int, string, DateTime, long)> list = new List<(int, string, DateTime, long)>();
		HashSet<int> live = new HashSet<int>();
		while (robloxPending.Count > 0 && (DateTime.Now - robloxPending.Peek().at).TotalMinutes > 3.0)
		{
			robloxPending.Dequeue();
		}
		foreach (Process p in Process.GetProcessesByName("RobloxPlayerBeta").OrderBy(delegate(Process process)
		{
			try
			{
				return process.StartTime;
			}
			catch
			{
				return DateTime.MaxValue;
			}
		}))
		{
			try
			{
				live.Add(p.Id);
				if (!robloxPids.ContainsKey(p.Id) && robloxPending.Count > 0 && p.StartTime >= robloxPending.Peek().at.AddSeconds(-1.0))
				{
					robloxPids[p.Id] = robloxPending.Dequeue().id;
				}
				list.Add((p.Id, robloxPids.GetValueOrDefault(p.Id), p.StartTime, p.WorkingSet64));
			}
			catch
			{
			}
			p.Dispose();
		}
		foreach (int gone in robloxPids.Keys.Where((int k) => !live.Contains(k)).ToList())
		{
			robloxPids.Remove(gone);
		}
		return list;
	}

	private static JsonArray RobloxJson(List<(int pid, string? account, DateTime started, long mem)> list)
	{
		return new JsonArray(list.Select<(int, string, DateTime, long), JsonNode>(((int pid, string account, DateTime started, long mem) r) => new JsonObject
		{
			["pid"] = r.pid,
			["account"] = r.account,
			["started"] = new DateTimeOffset(r.started).ToUnixTimeMilliseconds(),
			["mem"] = r.mem / 1048576
		}).ToArray());
	}

	private void PublishRoblox()
	{
		List<(int, string, DateTime, long)> list = TrackRoblox();
		string signature = string.Join(",", list.Select<(int, string, DateTime, long), string>(((int pid, string account, DateTime started, long mem) r) => r.pid + ":" + r.account));
		if (!(signature == robloxSignature))
		{
			robloxSignature = signature;
			robloxClients = list.Count;
			Send(new JsonObject
			{
				["type"] = "robloxClients",
				["count"] = list.Count,
				["instances"] = RobloxJson(list)
			});
		}
	}

	private void SendTasks(bool all)
	{
		JsonArray games = new JsonArray();
		foreach (JsonObject g in Games())
		{
			string id = g["id"]?.ToString() ?? "";
			if (running.Contains(id))
			{
				games.Add(new JsonObject
				{
					["id"] = id,
					["name"] = g["name"]?.ToString(),
					["count"] = PidsOf(ProcessNames(g)).Count
				});
			}
		}
		int session = Process.GetCurrentProcess().SessionId;
		List<JsonObject> procs = new List<JsonObject>();
		Process[] processes = Process.GetProcesses();
		foreach (Process p in processes)
		{
			try
			{
				if (p.SessionId == session && !Protected.Contains(p.ProcessName) && !(p.ProcessName == "RobloxPlayerBeta"))
				{
					string title = ((p.MainWindowHandle != IntPtr.Zero) ? p.MainWindowTitle : "");
					if (all || !(title == ""))
					{
						procs.Add(new JsonObject
						{
							["pid"] = p.Id,
							["name"] = p.ProcessName,
							["title"] = title,
							["mem"] = p.WorkingSet64 / 1048576
						});
					}
				}
			}
			catch
			{
			}
			finally
			{
				p.Dispose();
			}
		}
		Send(new JsonObject
		{
			["type"] = "tasks",
			["all"] = all,
			["games"] = games,
			["roblox"] = RobloxJson(TrackRoblox()),
			["procs"] = new JsonArray(procs.OrderByDescending((JsonObject jsonObject) => jsonObject["mem"].GetValue<long>()).Take(all ? 120 : 60).Select((Func<JsonObject, JsonNode>)((JsonObject result) => result))
				.ToArray())
		});
	}

	private void TaskResult(bool ok, string text)
	{
		Send(new JsonObject
		{
			["type"] = "taskResult",
			["ok"] = ok,
			["text"] = text
		});
	}

	private void StopGame(string id)
	{
		JsonObject game = FindGame(id);
		string[] names = ((game == null) ? Array.Empty<string>() : ProcessNames(game));
		if (names.Length == 0)
		{
			TaskResult(ok: false, "That game has no process name set, so there is nothing to look for. Add one in its options.");
			return;
		}
		int stopped = 0;
		string[] array = names;
		for (int i = 0; i < array.Length; i++)
		{
			Process[] processesByName = Process.GetProcessesByName(array[i]);
			foreach (Process p in processesByName)
			{
				try
				{
					p.Kill(entireProcessTree: true);
					stopped++;
				}
				catch
				{
				}
				p.Dispose();
			}
		}
		TaskResult(stopped > 0, (stopped > 0) ? $"{game["name"]} stopped" : $"{game["name"]} was not running");
		RefreshTasksSoon();
	}

	private void KillProcess(int pid)
	{
		try
		{
			using Process p = Process.GetProcessById(pid);
			if (pid == Environment.ProcessId || Protected.Contains(p.ProcessName) || p.SessionId != Process.GetCurrentProcess().SessionId)
			{
				TaskResult(ok: false, "That one belongs to Windows or to this launcher and is left alone.");
				return;
			}
			string name = p.ProcessName;
			p.Kill(entireProcessTree: true);
			TaskResult(ok: true, (name == "RobloxPlayerBeta") ? "Roblox instance closed" : (name + " ended"));
		}
		catch (ArgumentException)
		{
			TaskResult(ok: false, "That process has already closed.");
		}
		catch (Exception ex2)
		{
			TaskResult(ok: false, "Could not end it: " + ex2.Message);
		}
		RefreshTasksSoon();
	}

	private async Task RefreshTasksSoon()
	{
		await Task.Delay(700);
		if (!quitting)
		{
			PollGames();
			PublishRoblox();
			Send(new JsonObject { ["type"] = "tasksChanged" });
		}
	}
}

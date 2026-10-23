using System;
using System.Drawing;
using System.Text.Json.Nodes;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Skyvaint;

internal sealed class LoginForm : Form
{
	private const string Probe = "fetch('https://users.roblox.com/v1/users/authenticated',{credentials:'include'}).then(r=>r.ok?r.json():null).then(u=>{if(u&&u.id)chrome.webview.postMessage({id:u.id,name:u.name,displayName:u.displayName})}).catch(()=>{})";

	private readonly WebView2 web = new WebView2
	{
		Dock = DockStyle.Fill,
		DefaultBackgroundColor = Color.FromArgb(18, 12, 12)
	};

	private readonly System.Windows.Forms.Timer probe = new System.Windows.Forms.Timer
	{
		Interval = 2000
	};

	public JsonObject? User { get; private set; }

	public LoginForm(CoreWebView2Environment env, string profile, Icon icon)
	{
		LoginForm loginForm = this;
		Text = "Sign in to Roblox — your details go straight to roblox.com";
		base.Icon = icon;
		base.ClientSize = new Size(560, 780);
		MinimumSize = new Size(420, 560);
		base.StartPosition = FormStartPosition.CenterParent;
		BackColor = Color.FromArgb(18, 12, 12);
		base.Controls.Add(web);
		base.Load += async delegate
		{
			try
			{
				CoreWebView2ControllerOptions options = env.CreateCoreWebView2ControllerOptions();
				options.ProfileName = profile;
				await loginForm.web.EnsureCoreWebView2Async(env, options);
			}
			catch (Exception ex)
			{
				MessageBox.Show(loginForm, "Could not open the sign-in page:\n\n" + ex.Message, loginForm.Text);
				loginForm.Close();
				return;
			}
			CoreWebView2 core = loginForm.web.CoreWebView2;
			core.Settings.IsStatusBarEnabled = false;
			core.NewWindowRequested += delegate(object? obj, CoreWebView2NewWindowRequestedEventArgs e)
			{
				e.Handled = true;
				core.Navigate(e.Uri);
			};
			core.WebMessageReceived += delegate(object? obj2, CoreWebView2WebMessageReceivedEventArgs e)
			{
				if (!IsRoblox(e.Source))
				{
					return;
				}
				try
				{
					loginForm.User = JsonNode.Parse(e.WebMessageAsJson).AsObject();
					loginForm.Close();
				}
				catch
				{
				}
			};
			core.NavigationCompleted += delegate
			{
				loginForm.RunProbe();
			};
			loginForm.probe.Tick += delegate
			{
				loginForm.RunProbe();
			};
			loginForm.probe.Start();
			core.Navigate("https://www.roblox.com/login");
		};
		base.FormClosed += delegate
		{
			loginForm.probe.Stop();
		};
	}

	private static bool IsRoblox(string url)
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

	private void RunProbe()
	{
		if (User == null && web.CoreWebView2 != null && IsRoblox(web.CoreWebView2.Source))
		{
			web.CoreWebView2.ExecuteScriptAsync("fetch('https://users.roblox.com/v1/users/authenticated',{credentials:'include'}).then(r=>r.ok?r.json():null).then(u=>{if(u&&u.id)chrome.webview.postMessage({id:u.id,name:u.name,displayName:u.displayName})}).catch(()=>{})");
		}
	}
}

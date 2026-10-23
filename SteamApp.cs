using System;

namespace Skyvaint;

internal sealed record SteamApp(string Name, string Type, string Process, string ClientIcon, string Icon)
{
	public bool IsGame => Type.Equals("game", StringComparison.OrdinalIgnoreCase);
}

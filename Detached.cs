using System.Diagnostics;

namespace Skyvaint;

/// <summary>
/// Starts games, apps, stores and links, through Windows itself.
///
/// This used to start them with Explorer as their parent (and links through rundll32), so that Task Manager wouldn't
/// file them under the launcher. A link handed to rundll32 counts as started even when nothing opens, and games
/// stopped launching, so it is a plain start again. Don't bring that back without launching real Steam, Epic and
/// Roblox games from the installed launcher.
/// </summary>
static class Detached
{
    public static bool Start(ProcessStartInfo psi)
    {
        Process.Start(psi)?.Dispose();
        return true;
    }
}

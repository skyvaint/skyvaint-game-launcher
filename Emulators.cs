using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows.Automation;
using Microsoft.Win32;

namespace Skyvaint;

/// <summary>
/// PCSX2 (PS2) and Dolphin (Wii / GameCube) for Budokai Tenkaichi: finding them, listing your game files and mods,
/// starting a game, and Dolphin NetPlay (joining a friend by code, or hosting and reading back your code).
/// Dolphin has no command line for NetPlay, so the launcher fills in its settings and then clicks through its
/// NetPlay window for you with UI Automation; anything it can't click is left ready for you to press.
/// </summary>
static class Emulators
{
    static readonly string[] Ps2Ext = [".iso", ".chd", ".cso", ".zso", ".bin", ".gz", ".elf"];
    static readonly string[] WiiExt = [".iso", ".rvz", ".wbfs", ".gcz", ".ciso", ".wia", ".gcm", ".nkit"];

    // ---------- finding the emulators ----------

    public static string? FindPcsx2(string? custom)
    {
        if (!string.IsNullOrEmpty(custom) && File.Exists(custom)) return custom;
        foreach (var dir in InstallDirs("PCSX2"))
            foreach (var name in new[] { "pcsx2-qt.exe", "pcsx2-qtx64.exe", "pcsx2x64.exe", "pcsx2.exe" })
                if (File.Exists(Path.Combine(dir, name))) return Path.Combine(dir, name);
        return Search(["pcsx2-qt.exe", "pcsx2-qtx64.exe", "pcsx2.exe"]);
    }

    public static string? FindDolphin(string? custom)
    {
        if (!string.IsNullOrEmpty(custom) && File.Exists(custom)) return custom;
        foreach (var dir in InstallDirs("Dolphin"))
            if (File.Exists(Path.Combine(dir, "Dolphin.exe"))) return Path.Combine(dir, "Dolphin.exe");
        return Search(["Dolphin.exe"]);
    }

    // ---------- Parsec (play a PS2 game with a friend over the internet) ----------

    /// <summary>Parsec's program: installed for everyone (Program Files) or just for you (AppData).</summary>
    public static string? FindParsec()
    {
        var dirs = new List<string>(InstallDirs("Parsec"))
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Parsec"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Parsec"),
        };
        foreach (var d in dirs)
            if (File.Exists(Path.Combine(d, "parsecd.exe"))) return Path.Combine(d, "parsecd.exe");
        return null;
    }

    // Every PS2 button and the controller input it gets (PCSX2 2.x names).
    static readonly (string key, string input)[] PadMap =
    [
        ("Up", "DPadUp"), ("Right", "DPadRight"), ("Down", "DPadDown"), ("Left", "DPadLeft"),
        ("Triangle", "FaceNorth"), ("Circle", "FaceEast"), ("Cross", "FaceSouth"), ("Square", "FaceWest"),
        ("Select", "Back"), ("Start", "Start"),
        ("L1", "LeftShoulder"), ("L2", "+LeftTrigger"), ("R1", "RightShoulder"), ("R2", "+RightTrigger"),
        ("L3", "LeftStick"), ("R3", "RightStick"),
        ("LUp", "-LeftY"), ("LRight", "+LeftX"), ("LDown", "+LeftY"), ("LLeft", "-LeftX"),
        ("RUp", "-RightY"), ("RRight", "+RightX"), ("RDown", "+RightY"), ("RLeft", "-RightX"),
        ("Analog", "Guide"), ("LargeMotor", "LargeMotor"), ("SmallMotor", "SmallMotor"),
    ];

    static string Pcsx2Ini(string exe) => Path.Combine(Pcsx2Dir(exe), "inis", "PCSX2.ini");

    /// <summary>Player 1 in PCSX2: your first controller as well as your keyboard (PCSX2 takes both at once), or
    /// back to the keyboard only. Only the controller lines the launcher adds are ever removed.</summary>
    public static void SetupPlayer1(string pcsx2Exe, bool controller)
    {
        var ini = Pcsx2Ini(pcsx2Exe);
        var mine = PadMap.Select(p => (p.key, "SDL-0/" + p.input)).ToList();
        if (controller)
        {
            SetIni(ini, "InputSources", new Dictionary<string, string> { ["SDL"] = "true" });
            SetIni(ini, "Pad1", new Dictionary<string, string> { ["Type"] = "DualShock2" });
            AddIniLines(ini, "Pad1", mine);
        }
        else RemoveIniLines(ini, "Pad1", mine);
    }

    /// <summary>Turns on player 2 in PCSX2 and gives it your friend's controller. Over Parsec, their controller
    /// shows up on your PC as a normal one, after yours: the first controller if you play on the keyboard, the
    /// second if your controller is player 1. `number` (1-4) picks it by hand. Returns which one it uses.</summary>
    public static string SetupPlayer2(string pcsx2Exe, int number = 0)
    {
        var ini = Pcsx2Ini(pcsx2Exe);
        bool youUseFirst = SectionLines(ini, "Pad1").Any(l => l.Contains("SDL-0/"));
        string dev = number > 0 ? "SDL-" + (number - 1) : youUseFirst ? "SDL-1" : "SDL-0";
        var keys = new Dictionary<string, string> { ["Type"] = "DualShock2" };
        foreach (var (k, input) in PadMap) keys[k] = dev + "/" + input;
        SetIni(ini, "InputSources", new Dictionary<string, string> { ["SDL"] = "true" });
        SetIni(ini, "Pad2", keys);
        return dev;
    }

    static List<string> SectionLines(string path, string section)
    {
        var res = new List<string>();
        if (!File.Exists(path)) return res;
        bool inside = false;
        foreach (var raw in File.ReadLines(path))
        {
            var l = raw.Trim();
            if (l.StartsWith('[')) { inside = l.Equals($"[{section}]", StringComparison.OrdinalIgnoreCase); continue; }
            if (inside && l != "") res.Add(l);
        }
        return res;
    }

    static string Norm(string l) { int i = l.IndexOf('='); return i < 0 ? l.Trim() : l[..i].Trim() + " = " + l[(i + 1)..].Trim(); }

    /// <summary>Adds "key = value" lines to a section, next to the key's other lines (PCSX2 reads a key that is
    /// there more than once as several bindings). Lines already there are left alone.</summary>
    static void AddIniLines(string path, string section, IEnumerable<(string key, string value)> add)
    {
        var lines = File.Exists(path) ? File.ReadAllLines(path).ToList() : new List<string>();
        var bak = path + ".skyvaint.bak";
        if (File.Exists(path) && !File.Exists(bak)) File.Copy(path, bak);
        int start = lines.FindIndex(l => l.Trim().Equals($"[{section}]", StringComparison.OrdinalIgnoreCase));
        if (start < 0) { if (lines.Count > 0 && lines[^1].Trim() != "") lines.Add(""); lines.Add($"[{section}]"); start = lines.Count - 1; }
        foreach (var (k, v) in add)
        {
            int end = lines.FindIndex(start + 1, l => l.TrimStart().StartsWith('['));
            if (end < 0) end = lines.Count;
            while (end > start + 1 && lines[end - 1].Trim() == "") end--;
            var line = $"{k} = {v}";
            if (lines.Skip(start + 1).Take(end - start - 1).Any(l => Norm(l) == line)) continue;
            int last = -1;
            for (int i = start + 1; i < end; i++) if (lines[i].Split('=')[0].Trim().Equals(k, StringComparison.OrdinalIgnoreCase)) last = i;
            lines.Insert(last >= 0 ? last + 1 : end, line);
        }
        File.WriteAllLines(path, lines, new UTF8Encoding(false));
    }

    static void RemoveIniLines(string path, string section, IEnumerable<(string key, string value)> remove)
    {
        if (!File.Exists(path)) return;
        var gone = remove.Select(r => $"{r.key} = {r.value}").ToHashSet();
        var lines = File.ReadAllLines(path).ToList();
        bool inside = false, changed = false;
        for (int i = 0; i < lines.Count; i++)
        {
            var l = lines[i].Trim();
            if (l.StartsWith('[')) { inside = l.Equals($"[{section}]", StringComparison.OrdinalIgnoreCase); continue; }
            if (inside && gone.Contains(Norm(l))) { lines.RemoveAt(i--); changed = true; }
        }
        if (changed) File.WriteAllLines(path, lines, new UTF8Encoding(false));
    }

    static IEnumerable<string> InstallDirs(string name)
    {
        var dirs = new List<string>();
        foreach (var root in new[] { Registry.LocalMachine, Registry.CurrentUser })
            foreach (var path in new[] { @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" })
            {
                try
                {
                    using var key = root.OpenSubKey(path);
                    if (key == null) continue;
                    foreach (var sub in key.GetSubKeyNames())
                    {
                        using var app = key.OpenSubKey(sub);
                        if (app?.GetValue("DisplayName") is not string dn || !dn.Contains(name, StringComparison.OrdinalIgnoreCase)) continue;
                        if (app.GetValue("InstallLocation") is string loc && loc != "") dirs.Add(loc);
                        if (app.GetValue("DisplayIcon") is string icon && icon != "") dirs.Add(Path.GetDirectoryName(icon.Split(',')[0].Trim('"')) ?? "");
                    }
                }
                catch { }
            }
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        foreach (var b in new[] { pf, pf86, Path.Combine(local, "Programs") })
            if (Directory.Exists(b))
                foreach (var d in Directory.GetDirectories(b, name + "*")) dirs.Add(d);
        return dirs.Where(d => d != "" && Directory.Exists(d)).Distinct(StringComparer.OrdinalIgnoreCase);
    }

    // Portable copies (like the Budokai netplay packs) usually sit in Downloads, the Desktop or a games folder.
    static string? Search(string[] names)
    {
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var roots = new List<string>
        {
            Path.Combine(home, "Downloads"), Path.Combine(home, "Desktop"), Path.Combine(home, "Documents"),
            Path.Combine(home, "OneDrive", "Desktop"), Path.Combine(home, "OneDrive", "Documents"), Path.Combine(home, "Games"), @"C:\Games",
        };
        foreach (var drive in DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed && d.Name != @"C:\"))
            roots.Add(drive.RootDirectory.FullName);
        foreach (var root in roots.Where(Directory.Exists))
        {
            var hit = Find(root, names, 4);
            if (hit != null) return hit;
        }
        return null;
    }

    static string? Find(string dir, string[] names, int depth)
    {
        try
        {
            foreach (var n in names) { var p = Path.Combine(dir, n); if (File.Exists(p)) return p; }
            if (depth == 0) return null;
            foreach (var sub in Directory.EnumerateDirectories(dir))
            {
                var nm = Path.GetFileName(sub);
                if (nm.StartsWith('.') || nm is "node_modules" or "Windows" or "$Recycle.Bin" or "System Volume Information" or "AppData") continue;
                var hit = Find(sub, names, depth - 1);
                if (hit != null) return hit;
            }
        }
        catch { }
        return null;
    }

    // ---------- your game files ----------

    /// <summary>Game files in the given folders (and their subfolders, a few levels down), plus single files.</summary>
    public static JsonArray ScanFiles(IEnumerable<string> folders, IEnumerable<string> files)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var list = new JsonArray();
        void Add(string path)
        {
            if (!seen.Add(path) || !File.Exists(path)) return;
            if (path.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) { AddZip(path); return; }
            var kind = KindOf(path);
            if (kind == null) return;
            var fi = new FileInfo(path);
            if (kind == "ps2" && fi.Length < 20_000_000 && fi.Extension.ToLowerInvariant() is ".bin" or ".gz") return; // small .bin files are rarely games
            list.Add(new JsonObject { ["path"] = path, ["name"] = Path.GetFileNameWithoutExtension(path), ["kind"] = kind, ["size"] = fi.Length, ["folder"] = fi.DirectoryName });
        }
        void AddZip(string path)
        {
            try
            {
                using var z = System.IO.Compression.ZipFile.OpenRead(path);
                var e = z.Entries.Where(x => KindOfName(x.FullName)).OrderByDescending(x => x.Length).FirstOrDefault();
                if (e == null || e.Length < 50_000_000) return;
                // Already unpacked next to it (in a folder of the same name): the unpacked file is listed instead.
                var unpacked = Path.Combine(Path.GetDirectoryName(path)!, Path.GetFileNameWithoutExtension(path), Path.GetFileName(e.FullName));
                if (File.Exists(unpacked) && new FileInfo(unpacked).Length == e.Length) { Add(unpacked); return; }
                var ext = Path.GetExtension(e.FullName).ToLowerInvariant();
                list.Add(new JsonObject { ["path"] = path, ["name"] = Path.GetFileNameWithoutExtension(path), ["kind"] = WiiExt.Contains(ext) && !Ps2Ext.Contains(ext) ? "wii" : (Ps2Ext.Contains(ext) && !WiiExt.Contains(ext) ? "ps2" : "ps2"), ["size"] = e.Length, ["zip"] = true, ["folder"] = Path.GetDirectoryName(path) });
            }
            catch { }
        }
        foreach (var f in files) Add(f);
        foreach (var folder in folders.Where(Directory.Exists))
            foreach (var f in Walk(folder, 3)) Add(f);
        return list;
    }

    static IEnumerable<string> Walk(string dir, int depth)
    {
        string[] here = [];
        try { here = Directory.GetFiles(dir); } catch { }
        foreach (var f in here) yield return f;
        if (depth == 0) yield break;
        string[] subs = [];
        try { subs = Directory.GetDirectories(dir); } catch { }
        foreach (var s in subs) foreach (var f in Walk(s, depth - 1)) yield return f;
    }

    // ---------- PCSX2 save data (memory cards) ----------

    /// <summary>PCSX2's own folder: next to it when it runs portable, otherwise Documents\PCSX2.</summary>
    public static string Pcsx2Dir(string exe)
    {
        var dir = Path.GetDirectoryName(exe) ?? "";
        if (File.Exists(Path.Combine(dir, "portable.ini")) || File.Exists(Path.Combine(dir, "portable.txt"))) return dir;
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "PCSX2");
    }

    /// <summary>Puts a save file (memory card) in slot 1 for the next start, or puts your usual one back when
    /// `card` is empty. Returns the name that was in slot 1 before, so the usual one can be put back later.</summary>
    public static string? UseMemoryCard(string exe, string card, string usual, string label)
    {
        var root = Pcsx2Dir(exe);
        var ini = Path.Combine(root, "inis", "PCSX2.ini");
        var before = GetIni(ini, "MemoryCards", "Slot1_Filename");
        string name;
        if (card == "")
        {
            if (string.IsNullOrEmpty(usual) || usual == before) return before;
            name = usual;
        }
        else
        {
            var cards = Path.Combine(root, "memcards");
            Directory.CreateDirectory(cards);
            if (Path.GetDirectoryName(Path.GetFullPath(card))!.Equals(Path.GetFullPath(cards), StringComparison.OrdinalIgnoreCase)) name = Path.GetFileName(card);
            else
            {
                // A copy goes into PCSX2's card folder, once; after that the game saves into that copy.
                var safe = string.Concat(label.Where(c => !Path.GetInvalidFileNameChars().Contains(c))).Trim();
                name = $"Skyvaint - {(safe == "" ? "mod" : safe)}{Path.GetExtension(card)}";
                var dest = Path.Combine(cards, name);
                if (!File.Exists(dest) && !Directory.Exists(dest))
                {
                    if (Directory.Exists(card)) CopyDir(card, dest); else File.Copy(card, dest);
                }
            }
        }
        SetIni(ini, "MemoryCards", new Dictionary<string, string> { ["Slot1_Enable"] = "true", ["Slot1_Filename"] = name });
        return before;
    }

    static void CopyDir(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var f in Directory.GetFiles(from)) File.Copy(f, Path.Combine(to, Path.GetFileName(f)));
        foreach (var d in Directory.GetDirectories(from)) CopyDir(d, Path.Combine(to, Path.GetFileName(d)));
    }

    /// <summary>True for a name that looks like a game file (used to find one inside a .zip).</summary>
    public static bool KindOfName(string name) { var e = Path.GetExtension(name).ToLowerInvariant(); return Ps2Ext.Contains(e) || WiiExt.Contains(e); }

    /// <summary>"ps2", "wii" (Wii or GameCube) or null. A .iso is told apart by the disc's own header.</summary>
    public static string? KindOf(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        bool ps2 = Ps2Ext.Contains(ext), wii = WiiExt.Contains(ext);
        if (ps2 && !wii) return "ps2";
        if (wii && !ps2) return "wii";
        if (!ps2) return null;
        try
        {
            using var fs = File.OpenRead(path);
            var head = new byte[0x20];
            if (fs.Read(head, 0, head.Length) < head.Length) return "ps2";
            uint wiiMagic = (uint)(head[0x18] << 24 | head[0x19] << 16 | head[0x1A] << 8 | head[0x1B]);
            uint gcMagic = (uint)(head[0x1C] << 24 | head[0x1D] << 16 | head[0x1E] << 8 | head[0x1F]);
            return wiiMagic == 0x5D1C9EA3 || gcMagic == 0xC2339F3D ? "wii" : "ps2";
        }
        catch { return "ps2"; }
    }

    // ---------- Dolphin's settings ----------

    /// <summary>Where Dolphin keeps its settings for this copy of it.</summary>
    public static string DolphinUserDir(string exe)
    {
        var dir = Path.GetDirectoryName(exe) ?? "";
        if (File.Exists(Path.Combine(dir, "portable.txt"))) return Path.Combine(dir, "User");
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Dolphin Emulator");
            if (key?.GetValue("UserConfigPath") is string p && p != "") return p;
        }
        catch { }
        var docs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Dolphin Emulator");
        if (Directory.Exists(docs)) return docs;
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Dolphin Emulator");
    }

    /// <summary>Sets keys in Dolphin.ini (a copy of the file as it was is kept once, as Dolphin.ini.skyvaint.bak).</summary>
    public static void SetDolphinIni(string exe, string section, IDictionary<string, string> values) =>
        SetIni(Path.Combine(DolphinUserDir(exe), "Config", "Dolphin.ini"), section, values);

    /// <summary>Reads one key from an ini file, or null.</summary>
    public static string? GetIni(string path, string section, string key)
    {
        if (!File.Exists(path)) return null;
        bool inside = false;
        foreach (var raw in File.ReadLines(path))
        {
            var l = raw.Trim();
            if (l.StartsWith('[')) { inside = l.Equals($"[{section}]", StringComparison.OrdinalIgnoreCase); continue; }
            if (inside && l.Split('=')[0].Trim().Equals(key, StringComparison.OrdinalIgnoreCase)) return l[(l.IndexOf('=') + 1)..].Trim();
        }
        return null;
    }

    /// <summary>Sets keys in an ini file. The file as it first was is kept once, as *.skyvaint.bak.</summary>
    public static void SetIni(string path, string section, IDictionary<string, string> values)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var lines = File.Exists(path) ? File.ReadAllLines(path).ToList() : new List<string>();
        var bak = path + ".skyvaint.bak";
        if (File.Exists(path) && !File.Exists(bak)) File.Copy(path, bak);
        int start = lines.FindIndex(l => l.Trim().Equals($"[{section}]", StringComparison.OrdinalIgnoreCase));
        if (start < 0) { if (lines.Count > 0 && lines[^1].Trim() != "") lines.Add(""); lines.Add($"[{section}]"); start = lines.Count - 1; }
        int end = lines.FindIndex(start + 1, l => l.TrimStart().StartsWith('['));
        if (end < 0) end = lines.Count;
        // New keys go right after the section's last setting, not after the blank lines that end it.
        while (end > start + 1 && lines[end - 1].Trim() == "") end--;
        foreach (var (k, v) in values)
        {
            int at = -1;
            for (int i = start + 1; i < end; i++)
                if (lines[i].Split('=')[0].Trim().Equals(k, StringComparison.OrdinalIgnoreCase)) { at = i; break; }
            var line = $"{k} = {v}";
            if (at >= 0) lines[at] = line; else { lines.Insert(end, line); end++; }
        }
        File.WriteAllLines(path, lines, new UTF8Encoding(false));
    }

    /// <summary>Makes sure the game's folder is in Dolphin's game list, so NetPlay can offer it.</summary>
    public static void AddDolphinGameFolder(string exe, string folder)
    {
        var path = Path.Combine(DolphinUserDir(exe), "Config", "Dolphin.ini");
        var lines = File.Exists(path) ? File.ReadAllLines(path) : [];
        var have = lines.Where(l => Regex.IsMatch(l, @"^\s*ISOPath\d+\s*=")).Select(l => l[(l.IndexOf('=') + 1)..].Trim()).ToList();
        if (have.Any(h => string.Equals(h.TrimEnd('\\', '/'), folder.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase))) return;
        SetDolphinIni(exe, "General", new Dictionary<string, string> { [$"ISOPath{have.Count}"] = folder, ["ISOPaths"] = (have.Count + 1).ToString() });
    }

    // ---------- Dolphin NetPlay, clicked through for you ----------

    static AutomationElement? WaitWindow(Process p, Func<AutomationElement, bool> match, int ms)
    {
        var until = DateTime.Now.AddMilliseconds(ms);
        while (DateTime.Now < until && !p.HasExited)
        {
            try
            {
                var cond = new PropertyCondition(AutomationElement.ProcessIdProperty, p.Id);
                foreach (AutomationElement w in AutomationElement.RootElement.FindAll(TreeScope.Children, cond))
                    if (match(w)) return w;
            }
            catch { }
            Thread.Sleep(300);
        }
        return null;
    }

    static AutomationElement? FindByName(AutomationElement root, ControlType type, Func<string, bool> name)
    {
        try
        {
            foreach (AutomationElement e in root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, type)))
                if (name(e.Current.Name ?? "")) return e;
        }
        catch { }
        return null;
    }

    static bool Press(AutomationElement? e)
    {
        if (e == null) return false;
        try
        {
            if (e.TryGetCurrentPattern(InvokePattern.Pattern, out var ip)) { ((InvokePattern)ip).Invoke(); return true; }
            if (e.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var sp)) { ((SelectionItemPattern)sp).Select(); return true; }
            if (e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out var ep)) { ((ExpandCollapsePattern)ep).Expand(); return true; }
        }
        catch { }
        return false;
    }

    static string Clean(string s) => s.Replace("&", "").Trim();

    /// <summary>Opens Dolphin's NetPlay window from the main window's Tools menu. Returns it, or null.</summary>
    public static AutomationElement? OpenNetPlaySetup(Process p, Action<string> step)
    {
        var main = WaitWindow(p, w => w.Current.Name.StartsWith("Dolphin", StringComparison.OrdinalIgnoreCase), 30000);
        if (main == null) return null;
        Thread.Sleep(1200); // let it finish building its menus
        step("Opening NetPlay");
        for (int attempt = 0; attempt < 3; attempt++)
        {
            var tools = FindByName(main, ControlType.MenuItem, n => Clean(n).Equals("Tools", StringComparison.OrdinalIgnoreCase));
            if (Press(tools))
            {
                Thread.Sleep(500);
                var start = FindByName(AutomationElement.RootElement, ControlType.MenuItem, n => Clean(n).StartsWith("Start NetPlay", StringComparison.OrdinalIgnoreCase))
                         ?? FindByName(main, ControlType.MenuItem, n => Clean(n).StartsWith("Start NetPlay", StringComparison.OrdinalIgnoreCase));
                if (Press(start))
                {
                    var setup = WaitWindow(p, w => w.Current.Name.Contains("NetPlay", StringComparison.OrdinalIgnoreCase) && w.Current.Name.Contains("Setup", StringComparison.OrdinalIgnoreCase), 6000);
                    if (setup != null) return setup;
                }
            }
            Thread.Sleep(800);
        }
        return null;
    }

    /// <summary>Joins with the code already written to Dolphin.ini: Connect tab, then Connect.</summary>
    public static bool Join(AutomationElement setup)
    {
        Press(FindByName(setup, ControlType.TabItem, n => Clean(n).Equals("Connect", StringComparison.OrdinalIgnoreCase)));
        Thread.Sleep(300);
        return Press(FindByName(setup, ControlType.Button, n => Clean(n).Equals("Connect", StringComparison.OrdinalIgnoreCase)));
    }

    /// <summary>Hosts the game whose name looks like `game`: Host tab, pick it, then Host.</summary>
    public static bool Host(AutomationElement setup, string game)
    {
        Press(FindByName(setup, ControlType.TabItem, n => Clean(n).Equals("Host", StringComparison.OrdinalIgnoreCase)));
        Thread.Sleep(500);
        var words = Regex.Split(game.ToLowerInvariant(), @"[^a-z0-9]+").Where(w => w.Length > 2).ToArray();
        AutomationElement? pick = null;
        foreach (var type in new[] { ControlType.ListItem, ControlType.DataItem, ControlType.TreeItem })
        {
            try
            {
                foreach (AutomationElement e in setup.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, type)))
                {
                    var n = (e.Current.Name ?? "").ToLowerInvariant();
                    if (n.Contains("tenkaichi") || n.Contains("sparking") || (words.Length > 0 && words.Count(w => n.Contains(w)) >= Math.Min(2, words.Length))) { pick = e; break; }
                    pick ??= e; // otherwise the first game in the list
                }
            }
            catch { }
            if (pick != null) break;
        }
        Press(pick);
        Thread.Sleep(300);
        return Press(FindByName(setup, ControlType.Button, n => Clean(n).Equals("Host", StringComparison.OrdinalIgnoreCase)));
    }

    /// <summary>Reads your host code from Dolphin's NetPlay window once it's up (8 letters / digits).</summary>
    public static string? ReadHostCode(Process p, int ms)
    {
        var until = DateTime.Now.AddMilliseconds(ms);
        var code = new Regex(@"\b[0-9a-f]{8}\b", RegexOptions.IgnoreCase);
        while (DateTime.Now < until && !p.HasExited)
        {
            var win = WaitWindow(p, w => w.Current.Name.Contains("NetPlay", StringComparison.OrdinalIgnoreCase) && !w.Current.Name.Contains("Setup", StringComparison.OrdinalIgnoreCase), 1500);
            if (win != null)
            {
                try
                {
                    foreach (AutomationElement e in win.FindAll(TreeScope.Descendants, Condition.TrueCondition))
                    {
                        var texts = new List<string> { e.Current.Name ?? "" };
                        if (e.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) texts.Add(((ValuePattern)vp).Current.Value ?? "");
                        foreach (var t in texts)
                        {
                            var m = code.Match(t);
                            if (m.Success && m.Value != "00000000") return m.Value;
                        }
                    }
                }
                catch { }
            }
            Thread.Sleep(700);
        }
        return null;
    }
}

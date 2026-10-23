using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace Skyvaint;

/// <summary>
/// The launcher's own icon (window, tray, dock, shortcuts), drawn from the settings: a bolt, a letter, a ring or a
/// picture of your own, on a rounded square, circle or plain square, in the theme's colours or the classic red.
/// </summary>
static class AppIcon
{
    static Color Hex(string? hex, Color fallback)
    {
        try
        {
            if (string.IsNullOrEmpty(hex) || hex[0] != '#' || hex.Length != 7) return fallback;
            return Color.FromArgb(Convert.ToInt32(hex[1..3], 16), Convert.ToInt32(hex[3..5], 16), Convert.ToInt32(hex[5..7], 16));
        }
        catch { return fallback; }
    }

    static GraphicsPath Shape(string shape, float size)
    {
        var path = new GraphicsPath();
        float w = size - 1;
        if (shape == "circle") path.AddEllipse(0, 0, w, w);
        else if (shape == "square") path.AddRectangle(new RectangleF(0, 0, w, w));
        else
        {
            float d = size * 0.44f;
            path.AddArc(0, 0, d, d, 180, 90);
            path.AddArc(w - d, 0, d, d, 270, 90);
            path.AddArc(w - d, w - d, d, d, 0, 90);
            path.AddArc(0, w - d, d, d, 90, 90);
            path.CloseFigure();
        }
        return path;
    }

    public static Bitmap Draw(int size, JsonNode? config, string mediaDir)
    {
        var icon = config?["appIcon"];
        string style = icon?["style"]?.ToString() ?? "bolt", shape = icon?["shape"]?.ToString() ?? "rounded";
        bool theme = true;
        try { theme = icon?["useTheme"]?.GetValue<bool>() ?? true; } catch { }
        var c1 = theme ? Hex(config?["theme"]?["accent2"]?.ToString(), Color.FromArgb(255, 59, 47)) : Color.FromArgb(255, 59, 47);
        var c2 = theme ? Hex(config?["theme"]?["accent"]?.ToString(), Color.FromArgb(138, 0, 0)) : Color.FromArgb(138, 0, 0);
        c2 = Color.FromArgb(c2.R * 3 / 5, c2.G * 3 / 5, c2.B * 3 / 5); // the dark end of the gradient
        var mark = Hex(icon?["markColor"]?.ToString(), Color.White);

        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.Clear(Color.Transparent);
        using var body = Shape(shape, size);

        if (style == "image" && PictureFile(icon?["image"]?.ToString(), mediaDir) is { } file)
        {
            try
            {
                // Your own picture: fill the shape or fit inside it, zoomed and nudged, or used as-is with no frame.
                using var src = LoadPicture(file);
                string fit = icon?["fit"]?.ToString() ?? "cover";
                bool bare = false;
                try { bare = icon?["bare"]?.GetValue<bool>() ?? false; } catch { }
                float zoom = 1, ox = 0, oy = 0;
                try { zoom = Math.Clamp((float)(icon?["zoom"]?.GetValue<double>() ?? 100) / 100f, 0.3f, 3f); } catch { }
                try { ox = (float)(icon?["offsetX"]?.GetValue<double>() ?? 0) / 100f; } catch { }
                try { oy = (float)(icon?["offsetY"]?.GetValue<double>() ?? 0) / 100f; } catch { }
                float s = (fit == "contain" || bare ? Math.Min((float)size / src.Width, (float)size / src.Height) : Math.Max((float)size / src.Width, (float)size / src.Height)) * zoom;
                float w = src.Width * s, h = src.Height * s;
                float x = (size - w) / 2 + ox * size, y = (size - h) / 2 + oy * size;
                if (!bare)
                {
                    if (fit == "contain")
                        using (var back = new LinearGradientBrush(new Rectangle(0, 0, size, size), c1, c2, 60f)) g.FillPath(back, body);
                    g.SetClip(body);
                }
                g.DrawImage(src, x, y, w, h);
                g.ResetClip();
                return bmp;
            }
            catch { } // unreadable picture: fall through to the drawn icon
        }

        using (var fill = new LinearGradientBrush(new Rectangle(0, 0, size, size), c1, c2, 60f)) g.FillPath(fill, body);
        using var brush = new SolidBrush(mark);

        if (style == "letter")
        {
            var text = (icon?["letter"]?.ToString() ?? "S").Trim();
            if (text == "") text = "S";
            text = text.Length > 2 ? text[..2] : text;
            using var font = new Font("Impact", size * (text.Length > 1 ? 0.42f : 0.6f), FontStyle.Regular, GraphicsUnit.Pixel);
            using var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(text.ToUpperInvariant(), font, brush, new RectangleF(0, size * 0.03f, size, size), format);
        }
        else if (style == "ring")
        {
            using var pen = new Pen(mark, size * 0.1f);
            g.DrawEllipse(pen, size * 0.22f, size * 0.22f, size * 0.56f, size * 0.56f);
            g.FillEllipse(brush, size * 0.42f, size * 0.42f, size * 0.16f, size * 0.16f);
        }
        else if (style == "diamond")
        {
            g.FillPolygon(brush, new[] { new PointF(size / 2f, size * 0.16f), new PointF(size * 0.84f, size / 2f), new PointF(size / 2f, size * 0.84f), new PointF(size * 0.16f, size / 2f) });
        }
        else
        {
            (float x, float y)[] bolt = [(62, 4), (18, 78), (46, 78), (34, 136), (84, 54), (54, 54)];
            float s = size * 0.76f / 140f, ox = (size - 100 * s) / 2f, oy = size * 0.12f;
            g.FillPolygon(brush, bolt.Select(p => new PointF(ox + p.x * s, oy + p.y * s)).ToArray());
        }
        return bmp;
    }

    static string? PictureFile(string? url, string mediaDir)
    {
        if (string.IsNullOrEmpty(url) || !Uri.TryCreate(url, UriKind.Absolute, out var u)) return null;
        var file = Path.Combine(mediaDir, Path.GetFileName(u.AbsolutePath));
        return File.Exists(file) ? file : null;
    }

    /// <summary>Reads a picture without keeping the file locked (so it can be replaced while the launcher runs).</summary>
    static Bitmap LoadPicture(string file)
    {
        using var stream = new MemoryStream(File.ReadAllBytes(file));
        using var img = Image.FromStream(stream);
        return new Bitmap(img);
    }

    /// <summary>Tells Explorer that icons changed, so shortcuts redraw with the new one.</summary>
    public static void RefreshShell() => SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);

    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);

    /// <summary>Makes an Icon that owns a copy of its handle, so the drawing can be freed straight away.</summary>
    public static Icon ToIcon(Bitmap bmp)
    {
        var handle = bmp.GetHicon();
        try { return (Icon)Icon.FromHandle(handle).Clone(); }
        finally { DestroyIcon(handle); bmp.Dispose(); }
    }

    /// <summary>Writes a real multi-size .ico file (PNG frames), for shortcuts to point at.</summary>
    public static void SaveIco(string path, Func<int, Bitmap> draw)
    {
        int[] sizes = [16, 24, 32, 48, 64, 128, 256];
        var frames = sizes.Select(s =>
        {
            using var bmp = draw(s);
            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            return ms.ToArray();
        }).ToList();
        using var file = new BinaryWriter(File.Create(path));
        file.Write((short)0); file.Write((short)1); file.Write((short)sizes.Length);
        int offset = 6 + 16 * sizes.Length;
        for (int i = 0; i < sizes.Length; i++)
        {
            file.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i])); file.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i]));
            file.Write((byte)0); file.Write((byte)0); file.Write((short)1); file.Write((short)32);
            file.Write(frames[i].Length); file.Write(offset);
            offset += frames[i].Length;
        }
        foreach (var f in frames) file.Write(f);
    }

    [DllImport("shell32.dll")] static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);

    /// <summary>Points every desktop / Start menu shortcut to this launcher at the given .ico. Returns how many changed.</summary>
    public static int ApplyToShortcuts(string ico)
    {
        var exe = Environment.ProcessPath ?? "";
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return 0;
        dynamic shell = Activator.CreateInstance(shellType)!;
        var folders = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"),
        }.Where(Directory.Exists).Distinct();
        int changed = 0;
        foreach (var folder in folders)
            foreach (var lnk in Directory.EnumerateFiles(folder, "*.lnk", SearchOption.AllDirectories))
            {
                try
                {
                    dynamic s = shell.CreateShortcut(lnk);
                    if (!string.Equals((string)s.TargetPath, exe, StringComparison.OrdinalIgnoreCase)) continue;
                    s.IconLocation = ico + ",0";
                    s.Save();
                    changed++;
                }
                catch { }
            }
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero); // tell Explorer icons changed
        return changed;
    }
}

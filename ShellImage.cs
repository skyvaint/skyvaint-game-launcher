using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace Skyvaint;

internal static class ShellImage
{
	[ComImport]
	[Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
	[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface IShellItemImageFactory
	{
		[PreserveSig]
		int GetImage(SIZE size, int flags, out nint bitmap);
	}

	private struct SIZE
	{
		public int cx;

		public int cy;
	}

	private const int BiggerSizeOk = 1;

	private const int IconOnly = 4;

	private const int ThumbnailOnly = 8;

	[DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
	private static extern void SHCreateItemFromParsingName(string path, nint bindContext, [MarshalAs(UnmanagedType.LPStruct)] Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);

	[DllImport("gdi32.dll")]
	private static extern bool DeleteObject(nint handle);

	private static Bitmap? Get(string path, int size, int flags, bool alpha)
	{
		SHCreateItemFromParsingName(path, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out IShellItemImageFactory factory);
		try
		{
			if (factory.GetImage(new SIZE
			{
				cx = size,
				cy = size
			}, flags, out var handle) != 0 || handle == IntPtr.Zero)
			{
				return null;
			}
			try
			{
				using Bitmap raw = Image.FromHbitmap(handle);
				if (!alpha)
				{
					return new Bitmap(raw);
				}
				BitmapData bits = raw.LockBits(new Rectangle(Point.Empty, raw.Size), ImageLockMode.ReadOnly, raw.PixelFormat);
				try
				{
					using Bitmap view = new Bitmap(raw.Width, raw.Height, bits.Stride, PixelFormat.Format32bppPArgb, bits.Scan0);
					return new Bitmap(view);
				}
				finally
				{
					raw.UnlockBits(bits);
				}
			}
			finally
			{
				DeleteObject(handle);
			}
		}
		finally
		{
			Marshal.ReleaseComObject(factory);
		}
	}

	public static string SaveIcon(string exe, string mediaDir, string mediaHost, string name)
	{
		try
		{
			string dest = Path.Combine(mediaDir, name + ".png");
			if (!File.Exists(dest) || File.GetLastWriteTimeUtc(dest) < File.GetLastWriteTimeUtc(exe))
			{
				using Bitmap bmp = Get(exe, 256, 5, alpha: true);
				if (bmp == null)
				{
					return "";
				}
				bmp.Save(dest, ImageFormat.Png);
			}
			return $"https://{mediaHost}/{name}.png";
		}
		catch
		{
			return "";
		}
	}

	public static bool SaveThumbnail(string file, string dest, int size = 480)
	{
		try
		{
			using Bitmap bmp = Get(file, size, 9, alpha: false);
			if (bmp == null)
			{
				return false;
			}
			bmp.Save(dest, ImageFormat.Jpeg);
			return true;
		}
		catch
		{
			return false;
		}
	}
}

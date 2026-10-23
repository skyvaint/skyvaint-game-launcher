using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading;
using Microsoft.Data.Sqlite;

namespace Skyvaint;

internal sealed class Clips
{
	private static readonly string[] Extensions = new string[6] { ".mp4", ".mkv", ".mov", ".webm", ".m4v", ".avi" };

	private const int MaxLoose = 600;

	private const int MaxDepth = 5;

	private readonly string mediaDir;

	private readonly string mediaHost;

	private readonly Action<string, string> onThumb;

	private readonly BlockingCollection<(string id, string path)> queue = new BlockingCollection<(string, string)>();

	private readonly Dictionary<string, string> paths = new Dictionary<string, string>();

	public List<string> Roots { get; } = new List<string>();

	public static string DefaultFolder => Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);

	public Clips(string mediaDir, string mediaHost, Action<string, string> onThumb)
	{
		this.mediaDir = mediaDir;
		this.mediaHost = mediaHost;
		this.onThumb = onThumb;
		Thread thread = new Thread(Work);
		thread.IsBackground = true;
		thread.Priority = ThreadPriority.BelowNormal;
		thread.SetApartmentState(ApartmentState.STA);
		thread.Start();
	}

	public static string HostFor(int root)
	{
		return $"clips{root}.skyvaint.example";
	}

	public static string? FindMedal(string? hint)
	{
		List<string> candidates = new List<string> { hint };
		foreach (DriveInfo drive in from d in DriveInfo.GetDrives()
			where d.DriveType == DriveType.Fixed && d.IsReady
			select d)
		{
			candidates.Add(Path.Combine(drive.RootDirectory.FullName, "Medal"));
		}
		candidates.Add(Path.Combine(DefaultFolder, "Medal"));
		candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "Medal"));
		return candidates.FirstOrDefault((string c) => !string.IsNullOrEmpty(c) && Directory.Exists(Path.Combine(c, "Databases")) && Directory.GetFiles(Path.Combine(c, "Databases"), "medal-*.db").Length != 0);
	}

	public string? PathOf(string id)
	{
		lock (paths)
		{
			return paths.GetValueOrDefault(id);
		}
	}

	public void Forget(string id)
	{
		lock (paths)
		{
			paths.Remove(id);
		}
	}

	public JsonArray Scan(string? medalHint, IEnumerable<string> folders)
	{
		Roots.Clear();
		(string, string) item;
		while (queue.TryTake(out item))
		{
		}
		lock (paths)
		{
			paths.Clear();
		}
		JsonArray list = new JsonArray();
		HashSet<string> known = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		string medal = FindMedal(medalHint);
		if (medal != null)
		{
			try
			{
				ScanMedal(medal, list, known);
			}
			catch
			{
			}
		}
		List<(FileInfo, int)> loose = new List<(FileInfo, int)>();
		foreach (string folder in folders.Where(Directory.Exists).Select(Path.GetFullPath).Distinct<string>(StringComparer.OrdinalIgnoreCase))
		{
			if (medal == null || !folder.StartsWith(medal, StringComparison.OrdinalIgnoreCase))
			{
				Walk(new DirectoryInfo(folder), RootIndex(folder), 0, loose);
			}
		}
		foreach (var item2 in (from f in loose
			where !known.Contains(f.Item1.FullName)
			orderby f.Item1.LastWriteTimeUtc descending
			select f).Take(600))
		{
			FileInfo file = item2.Item1;
			int root = item2.Item2;
			string id = "f" + Hash(file.FullName.ToLowerInvariant());
			string[] parts = Path.GetRelativePath(Roots[root], file.FullName).Split(Path.DirectorySeparatorChar);
			string thumbName = "thumb_" + Hash($"{file.FullName.ToLowerInvariant()}|{file.Length}|{file.LastWriteTimeUtc.Ticks}") + ".jpg";
			bool hasThumb = File.Exists(Path.Combine(mediaDir, thumbName));
			lock (paths)
			{
				paths[id] = file.FullName;
			}
			if (!hasThumb)
			{
				queue.Add((id, file.FullName));
			}
			list.Add(new JsonObject
			{
				["id"] = id,
				["name"] = Path.GetFileNameWithoutExtension(file.Name),
				["game"] = ((parts.Length > 1) ? parts[0] : new DirectoryInfo(Roots[root]).Name),
				["source"] = "folder",
				["url"] = Url(root, parts),
				["size"] = file.Length,
				["time"] = new DateTimeOffset(file.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
				["thumb"] = (hasThumb ? ("https://" + mediaHost + "/" + thumbName) : ""),
				["duration"] = 0,
				["link"] = ""
			});
		}
		return list;
	}

	private void ScanMedal(string medal, JsonArray list, HashSet<string> known)
	{
		string source = Directory.GetFiles(Path.Combine(medal, "Databases"), "medal-*.db").OrderByDescending(File.GetLastWriteTimeUtc).First();
		string copy = Path.Combine(Path.GetTempPath(), "skyvaint-medal.db");
		File.Copy(source, copy, overwrite: true);
		string[] array = new string[2] { "-wal", "-shm" };
		foreach (string ext in array)
		{
			try
			{
				if (File.Exists(source + ext))
				{
					File.Copy(source + ext, copy + ext, overwrite: true);
				}
				else
				{
					File.Delete(copy + ext);
				}
			}
			catch
			{
			}
		}
		using SqliteConnection db = new SqliteConnection(new SqliteConnectionStringBuilder
		{
			DataSource = copy,
			Pooling = false
		}.ToString());
		db.Open();
		using SqliteCommand cmd = db.CreateCommand();
		cmd.CommandText = "select coalesce(local_content_id, remote_content_id), video_path, thumbnail_path, created_at,\n       json_extract(metadata, '$.title'), json_extract(metadata, '$.clipDuration'),\n       json_extract(metadata, '$.remoteContent.contentShareUrl'),\n       remote_content_id, json_extract(metadata, '$.contentSize')\nfrom contents where video_path is not null order by created_at desc";
		using SqliteDataReader reader = cmd.ExecuteReader();
		while (reader.Read())
		{
			string path = (reader.IsDBNull(1) ? "" : reader.GetString(1));
			if (!(path == "") && File.Exists(path))
			{
				string dir = Path.GetDirectoryName(path);
				string clipsRoot = Directory.GetParent(dir)?.FullName ?? dir;
				int root = RootIndex(clipsRoot);
				string[] parts = Path.GetRelativePath(clipsRoot, path).Split(Path.DirectorySeparatorChar);
				string thumb = (reader.IsDBNull(2) ? "" : reader.GetString(2));
				string thumbUrl = "";
				if (thumb != "" && File.Exists(thumb))
				{
					string thumbDir = Path.GetDirectoryName(thumb);
					thumbUrl = Url(RootIndex(thumbDir), new string[1] { Path.GetFileName(thumb) });
				}
				string id = "m" + Hash(reader.IsDBNull(0) ? path.ToLowerInvariant() : reader.GetString(0));
				string title = Text(reader, 4);
				string link = Text(reader, 6) ?? "";
				if (link == "" && !string.IsNullOrEmpty(Text(reader, 7)))
				{
					link = "https://medal.tv/clips/" + Text(reader, 7);
				}
				long created = (reader.IsDBNull(3) ? 0 : reader.GetInt64(3));
				known.Add(path);
				lock (paths)
				{
					paths[id] = path;
				}
				list.Add(new JsonObject
				{
					["id"] = id,
					["name"] = (string.IsNullOrWhiteSpace(title) ? Path.GetFileNameWithoutExtension(path) : title),
					["game"] = new DirectoryInfo(dir).Name,
					["source"] = "medal",
					["url"] = Url(root, parts),
					["size"] = (reader.IsDBNull(8) ? new FileInfo(path).Length : Convert.ToInt64(reader.GetValue(8))),
					["time"] = ((created < 100000000000L) ? (created * 1000) : created),
					["thumb"] = thumbUrl,
					["duration"] = (reader.IsDBNull(5) ? 0.0 : Convert.ToDouble(reader.GetValue(5), CultureInfo.InvariantCulture)),
					["link"] = link
				});
			}
		}
	}

	private static string? Text(SqliteDataReader r, int i)
	{
		if (!r.IsDBNull(i))
		{
			return r.GetValue(i).ToString();
		}
		return null;
	}

	private int RootIndex(string folder)
	{
		int i = Roots.FindIndex((string r) => r.Equals(folder, StringComparison.OrdinalIgnoreCase));
		if (i >= 0)
		{
			return i;
		}
		Roots.Add(folder);
		return Roots.Count - 1;
	}

	private static string Url(int root, string[] parts)
	{
		return "https://" + HostFor(root) + "/" + string.Join('/', parts.Select(Uri.EscapeDataString));
	}

	private static void Walk(DirectoryInfo dir, int root, int depth, List<(FileInfo, int)> into)
	{
		try
		{
			foreach (FileInfo f in dir.EnumerateFiles())
			{
				if (Extensions.Contains(f.Extension.ToLowerInvariant()))
				{
					into.Add((f, root));
				}
			}
			if (depth >= 5)
			{
				return;
			}
			foreach (DirectoryInfo d in dir.EnumerateDirectories())
			{
				if ((d.Attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0)
				{
					Walk(d, root, depth + 1, into);
				}
			}
		}
		catch
		{
		}
	}

	private static string Hash(string s)
	{
		return Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s)), 0, 10).ToLowerInvariant();
	}

	private void Work()
	{
		foreach (var (id, path) in queue.GetConsumingEnumerable())
		{
			if (PathOf(id) != path)
			{
				continue;
			}
			try
			{
				FileInfo file = new FileInfo(path);
				string name = "thumb_" + Hash($"{path.ToLowerInvariant()}|{file.Length}|{file.LastWriteTimeUtc.Ticks}") + ".jpg";
				if (ShellImage.SaveThumbnail(path, Path.Combine(mediaDir, name)))
				{
					onThumb(id, "https://" + mediaHost + "/" + name);
				}
			}
			catch
			{
			}
		}
	}
}

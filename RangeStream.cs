namespace Skyvaint;

/// <summary>
/// A window onto part of a file, for answering a video player's "give me bytes 1000-2000" (HTTP Range) requests.
/// Video players ask for pieces of the file to seek and loop; without this, big videos stalled or wouldn't loop.
/// </summary>
sealed class RangeStream : Stream
{
    readonly Stream inner;
    long left;

    public RangeStream(Stream inner, long start, long length)
    {
        this.inner = inner;
        inner.Seek(start, SeekOrigin.Begin);
        left = length;
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        if (left <= 0) return 0;
        int n = inner.Read(buffer, offset, (int)Math.Min(count, left));
        left -= n;
        return n;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    protected override void Dispose(bool disposing) { if (disposing) inner.Dispose(); base.Dispose(disposing); }
}

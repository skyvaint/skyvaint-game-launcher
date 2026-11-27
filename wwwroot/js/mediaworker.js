// Decodes animated GIFs into frames off the interface thread, one at a time, and hands the frames back as
// bitmaps. The page downloads the bytes (requests from workers don't reach the launcher's file server) and sends
// them here; big GIFs used to stall the screen while they were decoded, now they never touch the main thread.
const MAX_BYTES = 400 * 1024 * 1024; // the page sends a smaller limit with each GIF
const queue = [];
let busy = false;

onmessage = (e) => {
  const job = e.data;
  if (job.first) queue.unshift(job); else queue.push(job);
  next();
};

async function next() {
  if (busy || !queue.length) return;
  busy = true;
  const { url, data, type, maxSide = 0, maxBytes = MAX_BYTES } = queue.shift();
  try {
    const dec = new ImageDecoder({ data, type: type && type.startsWith('image/') ? type : 'image/gif' });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount;
    const frames = [];
    let t = 0, bytes = 0, w = 0, h = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      // Frames are kept at the size they are shown at (the longest side at most maxSide), not the file's size.
      const scale = maxSide ? Math.min(1, maxSide / Math.max(image.displayWidth, image.displayHeight)) : 1;
      w = Math.max(1, Math.round(image.displayWidth * scale)); h = Math.max(1, Math.round(image.displayHeight * scale));
      bytes += w * h * 4;
      if (bytes > maxBytes) { image.close(); throw new Error('too big'); }
      // Frame durations are in microseconds; very short ones play at 10 fps, as browsers do.
      const ms = image.duration ? image.duration / 1000 : 100;
      t += ms < 20 ? 100 : ms;
      frames.push({ bmp: await createImageBitmap(image, scale < 1 ? { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' } : {}), end: t });
      image.close();
    }
    dec.close();
    if (!frames.length) throw new Error('empty');
    postMessage({ url, ok: true, frames, total: t, w, h }, frames.map((f) => f.bmp));
  } catch (err) {
    postMessage({ url, ok: false, error: String(err) });
  }
  busy = false;
  next();
}

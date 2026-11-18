// Workers Static Assets currently returns the full file for Range requests.
// Keep this adapter limited to the public tutorial, streaming only the requested
// bytes instead of buffering the whole video in Worker memory.
export const TUTORIAL_VIDEO_PATH = "/tutorial/malapit-how-to.mp4";
type AssetFetcher = { fetch(request: Request): Promise<Response> };

function byteRange(value: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  const match = value?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]), last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  if (!size) return "unsatisfiable";
  if (!match[1]) return last ? { start: Math.max(0, size - last), end: size - 1 } : "unsatisfiable";
  if (first >= size || (match[2] && last < first)) return "unsatisfiable";
  return { start: first, end: match[2] ? Math.min(last, size - 1) : size - 1 };
}

function sliceStream(body: ReadableStream<Uint8Array>, start: number, end: number) {
  const reader = body.getReader();
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          const before = offset;
          offset += value.byteLength;
          if (offset <= start) continue;
          controller.enqueue(value.subarray(Math.max(0, start - before), Math.min(value.byteLength, end + 1 - before)));
          if (offset > end) { controller.close(); await reader.cancel(); }
          return;
        }
      } catch (error) { controller.error(error); await reader.cancel().catch(() => {}); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

function fixedLength(body: ReadableStream<Uint8Array>, length: number) {
  if (typeof FixedLengthStream === "undefined") return body;
  const stream = new FixedLengthStream(length);
  void body.pipeTo(stream.writable).catch(() => {});
  return stream.readable;
}

export async function serveTutorialVideo(request: Request, assets: AssetFetcher, expectedSize?: number) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete("Range");
  upstreamHeaders.delete("If-Range");
  upstreamHeaders.set("Accept-Encoding", "identity");
  const asset = await assets.fetch(new Request(request.url, { method: "GET", headers: upstreamHeaders }));
  if (asset.status !== 200 || !asset.body) {
    if (request.method === "HEAD") { await asset.body?.cancel(); return new Response(null, asset); }
    return asset;
  }
  const headers = new Headers(asset.headers);
  const length = headers.get("Content-Length");
  // The asset binding can omit this header even when the edge adds it later.
  // The builder records the exact size alongside this deployment's MP4.
  const size = length === null ? expectedSize ?? NaN : Number(length);
  if (!Number.isSafeInteger(size) || size < 0) {
    if (request.method === "HEAD") { await asset.body.cancel(); return new Response(null, { status: 200, headers }); }
    return asset;
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(size));
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.method === "HEAD") { await asset.body.cancel(); return new Response(null, { status: 200, headers }); }

  const ifRange = request.headers.get("If-Range");
  const modified = headers.get("Last-Modified");
  const matches = !ifRange || (!ifRange.startsWith("W/") && ifRange === headers.get("ETag")) ||
    (modified !== null && Number.isFinite(Date.parse(ifRange)) && Date.parse(modified) <= Date.parse(ifRange));
  const range = matches ? byteRange(request.headers.get("Range"), size) : null;
  if (range === "unsatisfiable") {
    await asset.body.cancel();
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  if (!range) return new Response(fixedLength(asset.body, size), { status: 200, headers });
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range.end - range.start + 1));
  return new Response(fixedLength(sliceStream(asset.body, range.start, range.end), range.end - range.start + 1), { status: 206, headers });
}

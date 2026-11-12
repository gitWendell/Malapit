import { env } from "cloudflare:workers";
import { media } from "../../../db/schema";
import { requireUser, getDb, checkOrigin, routeError, HttpError, eq } from "../../../lib/server";
import { photoStore, photosReady } from "../../../lib/photo-store";
import { photoValidationError } from "../../../lib/photo-validation";
import { PILOT_LIMITS } from "../../../lib/pilot-limits";

async function photoForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;") || !request.body) throw new HttpError(400, "Please choose a photo using the listing form.");
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > PILOT_LIMITS.photoBytes + 16 * 1024) { await reader.cancel(); throw new HttpError(413, "Please resize this photo using the listing form."); }
    parts.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new HttpError(400, "This photo upload was incomplete. Please try again."); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); if (!photosReady(request, env)) throw new HttpError(503, "Photo uploads are being prepared. Please try again later.");
    if (Number(request.headers.get("content-length")) > PILOT_LIMITS.photoBytes + 16 * 1024) throw new HttpError(413, "Please resize this photo using the listing form.");
    const form = await photoForm(request), file = form.get("file");
    if (!(file instanceof File) || file.size < 10 || file.size > PILOT_LIMITS.photoBytes) throw new HttpError(400, "Please choose a photo using the listing form so it can be resized.");
    const bytes = new Uint8Array(await file.arrayBuffer()), invalid = photoValidationError(bytes, file.type);
    if (invalid) throw new HttpError(400, invalid);
    const db = getDb(), id = crypto.randomUUID();
    // Reserve capacity atomically before the external write. Failed or uncertain
    // writes retain their reservation, so retries cannot bypass the global cap.
    await db.insert(media).values({ id, ownerId: user.userId, contentType: file.type, byteSize: bytes.byteLength, state: "pending", createdAt: new Date().toISOString() });
    try {
      await photoStore(request, env).put(id, bytes, file.type);
      await db.update(media).set({ state: "ready" }).where(eq(media.id, id));
    } catch {
      await db.update(media).set({ state: "failed" }).where(eq(media.id, id));
      throw new HttpError(503, "The photo upload could not finish. Please try again later.");
    }
    return Response.json({ url: `/api/media/${id}` }, { status: 201 });
  } catch (e) { return routeError(e); }
}

import { env } from "cloudflare:workers";
import { media } from "../../../db/schema";
import { requireUser, getDb, checkOrigin, routeError, HttpError, and, eq, gte } from "../../../lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); if (!env.BUCKET) throw new HttpError(503, "Photo uploads are temporarily unavailable.");
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) throw new HttpError(413, "Choose a photo smaller than 5 MB.");
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024 || file.size < 10) throw new HttpError(400, "Choose a JPEG, PNG, or WebP photo smaller than 5 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new HttpError(400, "Use a JPEG, PNG, or WebP image.");
    const db = getDb(), recent = await db.select({ id: media.id }).from(media).where(and(eq(media.ownerId, user.userId), gte(media.createdAt, new Date(Date.now() - 86400000).toISOString()))); if (recent.length >= 60) throw new HttpError(429, "You have reached today's photo upload limit.");
    const bytes = new Uint8Array(await file.arrayBuffer()), valid = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 : file.type === "image/png" ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!valid) throw new HttpError(400, "The photo file doesn't match its image format.");
    const id = crypto.randomUUID(); await env.BUCKET.put(id, bytes, { httpMetadata: { contentType: file.type } }); await db.insert(media).values({ id, ownerId: user.userId, contentType: file.type, createdAt: new Date().toISOString() });
    return Response.json({ url: `/api/media/${id}` }, { status: 201 });
  } catch (e) { return routeError(e); }
}

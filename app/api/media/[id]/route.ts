import { env } from "cloudflare:workers";
import { media, listings } from "../../../../db/schema";
import { identity, requireUser, checkOrigin, getDb, eq, routeError, HttpError } from "../../../../lib/server";
import { isListingVisible } from "../../../../lib/availability";
import { photoStore } from "../../../../lib/photo-store";
import { sql } from "drizzle-orm";

const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!validId(id)) throw new HttpError(404, "Photo not found.");
    const user = await identity(), db = getDb();
    const [photo] = await db.select().from(media).where(eq(media.id, id));
    if (!photo || photo.state !== "ready") throw new HttpError(404, "Photo not found.");
    if (photo.ownerId !== user?.userId && !user?.isAdmin) {
      const references = await db.select().from(listings).where(sql`EXISTS (SELECT 1 FROM json_each(${listings.data}, '$.photos') WHERE value = ${`/api/media/${id}`})`);
      if (!references.some(home => isListingVisible(home))) throw new HttpError(404, "Photo not found.");
    }
    const object = await photoStore(request, env).get(id);
    if (!object) throw new HttpError(404, "Photo not found.");
    return new Response(object.body, { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); const user = await requireUser(), { id } = await context.params;
    if (!validId(id)) throw new HttpError(404, "Photo not found.");
    const db = getDb(), [photo] = await db.select().from(media).where(eq(media.id, id));
    if (!photo) return Response.json({ ok: true });
    if (photo.ownerId !== user.userId) throw new HttpError(403, "You can only remove your own photos.");
    if (!env.DB) throw new HttpError(503, "Photo removal is temporarily unavailable.");
    const reserved = await env.DB.prepare(`UPDATE media SET state = 'deleting'
      WHERE id = ? AND owner_id = ? AND state IN ('ready', 'deleting')
      AND NOT EXISTS (SELECT 1 FROM listings, json_each(listings.data, '$.photos') WHERE json_each.value = ?)
      RETURNING id`).bind(id, user.userId, `/api/media/${id}`).first();
    if (!reserved) throw new HttpError(409, "This photo is still used by a listing or needs an upload check.");
    try { await photoStore(request, env).remove(id); }
    catch { throw new HttpError(503, "The photo could not be removed yet. Please try again."); }
    // Free capacity only after storage confirms deletion. A failed delete keeps
    // its reservation, and the listing triggers prevent new references meanwhile.
    await db.delete(media).where(eq(media.id, id));
    return Response.json({ ok: true });
  } catch (error) { return routeError(error); }
}

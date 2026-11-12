import { requireUser, getDb, checkOrigin, routeError, eq, HttpError } from "../../../../lib/server";
import { listings, media } from "../../../../db/schema";
import { listingInput, actionInput } from "../../../../lib/validation";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); const user = await requireUser(), db = getDb(), { id } = await context.params;
    const [row] = await db.select().from(listings).where(eq(listings.id, id)); if (!row) throw new HttpError(404, "Listing not found.");
    const body = actionInput.parse(await request.json());
    if (["approve", "reject"].includes(body.action)) {
      if (!user.isAdmin) throw new HttpError(403, "Only the reviewer can approve listings.");
      if (row.status !== "pending") throw new HttpError(409, "This listing is no longer waiting for review.");
      await db.update(listings).set({ status: body.action === "approve" ? "published" : "changes_requested", reviewNote: body.action === "reject" ? String(body.reason || "Please check your property details and resubmit.").slice(0, 500) : "" }).where(eq(listings.id, id));
    } else {
      if (row.ownerId !== user.userId) throw new HttpError(403, "You can only manage your own listings.");
      if (body.action === "update") {
        const input = listingInput.parse(body.data);
        for (const url of input.photos) { const [photo] = await db.select().from(media).where(eq(media.id, url.split("/").pop()!)); if (!photo || photo.ownerId !== user.userId) throw new HttpError(400, "Please use your own property photos."); }
        const { authorityConfirmed, ...data } = input;
        await db.update(listings).set({ title: data.title, city: data.city, data: JSON.stringify(data), status: "pending", reviewNote: "", confirmedAt: new Date().toISOString() }).where(eq(listings.id, id));
      } else if (body.action === "confirm") {
        if (row.status !== "published") throw new HttpError(409, "Only published listings can have their availability confirmed. Submit this listing for review first.");
        await db.update(listings).set({ confirmedAt: new Date().toISOString() }).where(eq(listings.id, id));
      }
      else if (["pause", "rent", "resubmit"].includes(body.action)) await db.update(listings).set({ status: body.action === "pause" ? "paused" : body.action === "rent" ? "rented" : "pending", ...(body.action === "resubmit" ? { confirmedAt: new Date().toISOString(), reviewNote: "" } : {}) }).where(eq(listings.id, id));
      else throw new HttpError(400, "Choose a valid listing action.");
    }
    return Response.json({ ok: true });
  } catch (e) { return routeError(e); }
}

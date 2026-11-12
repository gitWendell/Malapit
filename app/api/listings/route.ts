import { requireUser, getDb, checkOrigin, routeError, eq, and, gte, HttpError } from "../../../lib/server";
import { listings, media } from "../../../db/schema";
import { listingInput } from "../../../lib/validation";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(), db = getDb(), input = listingInput.parse(await request.json());
    const recent = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.ownerId, user.userId), gte(listings.createdAt, new Date(Date.now() - 86400000).toISOString())));
    if (recent.length >= 10) throw new HttpError(429, "You can submit up to 10 properties per day.");
    for (const url of input.photos) { const [photo] = await db.select().from(media).where(and(eq(media.id, url.split("/").pop()!), eq(media.ownerId, user.userId))); if (!photo) throw new HttpError(400, "Please upload your own property photos."); }
    const id = crypto.randomUUID(), now = new Date().toISOString(), { authorityConfirmed, ...data } = input;
    await db.insert(listings).values({ id, ownerId: user.userId, ownerName: user.displayName || "Property lister", title: data.title, city: data.city, status: "pending", data: JSON.stringify(data), createdAt: now, confirmedAt: now });
    return Response.json({ id, message: "Your property has been submitted for review." }, { status: 201 });
  } catch (e) { return routeError(e); }
}

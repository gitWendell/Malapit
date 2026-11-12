import { requireUser, getDb, checkOrigin, routeError, eq, and, gte, HttpError, findVisibleListing } from "../../../lib/server";
import { inquiries } from "../../../db/schema";
import { inquiryInput, replyInput } from "../../../lib/validation";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(), input = inquiryInput.parse(await request.json()), db = getDb(), property = await findVisibleListing(input.listingId);
    if (property.ownerId === user.userId) throw new HttpError(400, "This is your own property. Manage it from My listings.");
    const recent = await db.select({ id: inquiries.id }).from(inquiries).where(and(eq(inquiries.renterId, user.userId), gte(inquiries.createdAt, new Date(Date.now() - 86400000).toISOString())));
    if (recent.length >= 20) throw new HttpError(429, "You have reached today's inquiry limit. Try again tomorrow.");
    await db.insert(inquiries).values({ id: crypto.randomUUID(), listingId: property.id, listingTitle: property.title, ownerId: property.ownerId, renterId: user.userId, renterName: user.displayName, renterEmail: user.email, message: input.message, moveIn: input.moveIn, occupants: input.occupants, isDemo: property.isDemo ? 1 : 0, createdAt: new Date().toISOString() });
    return Response.json({ ok: true, isDemo: !!property.isDemo }, { status: 201 });
  } catch (e) { return routeError(e); }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(), db = getDb(), body = replyInput.parse(await request.json());
    if (typeof body.id !== "string" || typeof body.reply !== "string" || body.reply.trim().length < 5 || body.reply.length > 2000) throw new HttpError(400, "Write a reply between 5 and 2,000 characters.");
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, body.id)); if (!row || (row.ownerId !== user.userId && !user.isAdmin)) throw new HttpError(403, "You cannot reply to this inquiry.");
    await db.update(inquiries).set({ reply: body.reply.trim() }).where(eq(inquiries.id, row.id)); return Response.json({ ok: true });
  } catch (e) { return routeError(e); }
}

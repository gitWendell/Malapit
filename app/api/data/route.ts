import { identity, getDb, eq, and, gte, or, desc, listingRecord, publicListing, routeError } from "../../../lib/server";
import { listings, savedHomes, inquiries, reports } from "../../../db/schema";
import { AVAILABILITY_WINDOW_MS, isListingVisible } from "../../../lib/availability";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await identity(), db = getDb();
    const now = Date.now();
    const active = await db.select().from(listings).where(and(eq(listings.status, "published"), gte(listings.confirmedAt, new Date(now - AVAILABILITY_WINDOW_MS).toISOString()))).orderBy(desc(listings.createdAt)).limit(250);
    const own = user ? await db.select().from(listings).where(eq(listings.ownerId, user.userId)).orderBy(desc(listings.createdAt)) : [];
    const review = user?.isAdmin ? await db.select().from(listings).where(or(eq(listings.status, "pending"), eq(listings.status, "changes_requested"))).orderBy(desc(listings.createdAt)) : [];
    const saved = user ? await db.select().from(savedHomes).where(eq(savedHomes.userId, user.userId)) : [];
    const messages = user ? await db.select().from(inquiries).where(user.isAdmin ? undefined : or(eq(inquiries.renterId, user.userId), eq(inquiries.ownerId, user.userId))).orderBy(desc(inquiries.createdAt)).limit(100) : [];
    const flags = user?.isAdmin ? await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100) : [];
    return Response.json({ session: user, listings: active.filter(home => isListingVisible(home, now)).map(publicListing), myListings: own.map(listingRecord), reviewListings: review.map(listingRecord), savedIds: saved.map(s => s.listingId), inquiries: messages, reports: flags }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return routeError(e); }
}

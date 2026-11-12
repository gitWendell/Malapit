import { identity, getDb, eq, and, gte, or, desc, listingRecord, publicListing, routeError } from "../../../lib/server";
import { listings, savedHomes, inquiries, reports } from "../../../db/schema";
import { AVAILABILITY_WINDOW_MS, isListingVisible } from "../../../lib/availability";
import { env } from "cloudflare:workers";
import { PILOT_LIMITS, type PilotStatus } from "../../../lib/pilot-limits";
import { signInConfigured } from "../../../lib/supabase-config";
import { isLocalAuth } from "../../../lib/auth";
import { photosReady } from "../../../lib/photo-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await identity(), db = getDb();
    const now = Date.now();
    const active = await db.select().from(listings).where(and(eq(listings.status, "published"), gte(listings.confirmedAt, new Date(now - AVAILABILITY_WINDOW_MS).toISOString()))).orderBy(desc(listings.createdAt)).limit(250);
    const own = user ? await db.select().from(listings).where(eq(listings.ownerId, user.userId)).orderBy(desc(listings.createdAt)) : [];
    const review = user?.isAdmin ? await db.select().from(listings).where(or(eq(listings.status, "pending"), eq(listings.status, "changes_requested"))).orderBy(desc(listings.createdAt)) : [];
    const saved = user ? await db.select().from(savedHomes).where(eq(savedHomes.userId, user.userId)) : [];
    const messages = user ? await db.select().from(inquiries).where(user.isAdmin ? undefined : or(eq(inquiries.renterId, user.userId), eq(inquiries.ownerId, user.userId))).orderBy(desc(inquiries.createdAt)).limit(100) : [];
    const flags = user?.isAdmin ? await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100) : [];
    const propertyUsage = await env.DB!.prepare("SELECT COUNT(*) AS properties FROM listings WHERE status NOT IN ('rented', 'withdrawn')").first<{ properties: number }>();
    const local = isLocalAuth(request, env);
    const pilot: PilotStatus = { signInReady: local || signInConfigured(env), signInProvider: local ? "local" : "google", photosReady: photosReady(request, env), submissionOpen: (propertyUsage?.properties ?? 0) < PILOT_LIMITS.properties, propertiesLimit: PILOT_LIMITS.properties, photosPerProperty: PILOT_LIMITS.photosPerProperty };
    if (user?.isAdmin) {
      const usage = await env.DB!.prepare("SELECT COUNT(*) AS photos, COALESCE(SUM(byte_size), 0) AS bytes, SUM(CASE WHEN state <> 'ready' THEN 1 ELSE 0 END) AS pendingPhotos FROM media").first<{ photos: number; bytes: number; pendingPhotos: number }>();
      pilot.usage = { properties: propertyUsage?.properties ?? 0, photos: usage?.photos ?? 0, bytes: usage?.bytes ?? 0, pendingPhotos: usage?.pendingPhotos ?? 0 };
    }
    return Response.json({ session: user, listings: active.filter(home => isListingVisible(home, now)).map(publicListing), myListings: own.map(listingRecord), reviewListings: review.map(listingRecord), savedIds: saved.map(s => s.listingId), inquiries: messages, reports: flags, pilot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return routeError(e); }
}

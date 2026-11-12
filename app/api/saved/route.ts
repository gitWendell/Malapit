import { requireUser, getDb, checkOrigin, routeError, eq, and, findVisibleListing } from "../../../lib/server";
import { savedHomes } from "../../../db/schema";
import { savedInput } from "../../../lib/validation";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(), { listingId, saved } = savedInput.parse(await request.json());
    if (typeof listingId !== "string" || typeof saved !== "boolean") return Response.json({ error: "Choose a property to save." }, { status: 400 });
    const db = getDb();
    if (saved) { await findVisibleListing(listingId, user.userId); await db.insert(savedHomes).values({ userId: user.userId, listingId }).onConflictDoNothing(); }
    else await db.delete(savedHomes).where(and(eq(savedHomes.userId, user.userId), eq(savedHomes.listingId, listingId)));
    return Response.json({ ok: true });
  } catch (e) { return routeError(e); }
}

import { requireUser, getDb, checkOrigin, routeError, eq, HttpError, findVisibleListing } from "../../../lib/server";
import { reports } from "../../../db/schema";
import { reportInput, resolveReportInput } from "../../../lib/validation";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(), body = reportInput.parse(await request.json());
    if (typeof body.listingId !== "string" || typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.length > 1000) throw new HttpError(400, "Please describe the issue in 10–1,000 characters.");
    await findVisibleListing(body.listingId, user.userId); await getDb().insert(reports).values({ id: crypto.randomUUID(), listingId: body.listingId, userId: user.userId, reason: body.reason.trim(), createdAt: new Date().toISOString() });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) { return routeError(e); }
}
export async function PATCH(request: Request) {
  try { checkOrigin(request); const user = await requireUser(); if (!user.isAdmin) throw new HttpError(403, "Reviewer access required."); const { id } = resolveReportInput.parse(await request.json()); await getDb().update(reports).set({ status: "resolved" }).where(eq(reports.id, id)); return Response.json({ ok: true }); } catch (e) { return routeError(e); }
}

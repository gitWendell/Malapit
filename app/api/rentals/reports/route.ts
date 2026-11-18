import { requireUser } from "../../../../lib/server";
import { rentalError } from "../../../../lib/rentals-server";
import { ownerReportFor } from "../../../../lib/rental-reports-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json(await ownerReportFor(new URL(request.url), await requireUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return rentalError(error); }
}

import { requireUser } from "../../../../lib/server";
import { rentalError } from "../../../../lib/rentals-server";
import { rentalWorkloadFor } from "../../../../lib/rental-workload-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json(await rentalWorkloadFor(new URL(request.url), await requireUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (cause) { return rentalError(cause); }
}

import { requireUser } from "../../../lib/server";
import { rentalError, rentalsFor } from "../../../lib/rentals-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await rentalsFor(await requireUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return rentalError(error); }
}

import { checkOrigin, requireUser } from "../../../../lib/server";
import { rentalError, rentalJson } from "../../../../lib/rentals-server";
import { createRentalBill, rentalBillsFor } from "../../../../lib/rental-bills-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json(await rentalBillsFor(new URL(request.url), await requireUser()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return rentalError(error); }
}
export async function POST(request: Request) {
  try { checkOrigin(request); const user = await requireUser(); return Response.json(await createRentalBill(await rentalJson(request), user), { status: 201 }); }
  catch (error) { return rentalError(error); }
}

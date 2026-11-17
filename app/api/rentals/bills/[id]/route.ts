import { checkOrigin, requireUser } from "../../../../../lib/server";
import { rentalError, rentalJson } from "../../../../../lib/rentals-server";
import { changeRentalBill, rentalBillFor } from "../../../../../lib/rental-bills-server";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(), { id } = await context.params; return Response.json(await rentalBillFor(id, user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return rentalError(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await changeRentalBill(id, await rentalJson(request), user)); }
  catch (error) { return rentalError(error); }
}

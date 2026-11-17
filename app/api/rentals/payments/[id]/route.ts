import { checkOrigin, requireUser } from "../../../../../lib/server";
import { rentalError, rentalJson } from "../../../../../lib/rentals-server";
import { changeRentalPayment } from "../../../../../lib/rental-payments-server";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await changeRentalPayment(id, await rentalJson(request), user)); }
  catch (error) { return rentalError(error); }
}

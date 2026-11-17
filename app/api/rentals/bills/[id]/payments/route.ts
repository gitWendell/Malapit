import { checkOrigin, requireUser } from "../../../../../../lib/server";
import { rentalError, rentalJson } from "../../../../../../lib/rentals-server";
import { createRentalPayment } from "../../../../../../lib/rental-payments-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await createRentalPayment(id, await rentalJson(request), user), { status: 201 }); }
  catch (error) { return rentalError(error); }
}

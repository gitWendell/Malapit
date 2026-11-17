import { checkOrigin, requireUser } from "../../../../../../lib/server";
import { rentalError, rentalJson } from "../../../../../../lib/rentals-server";
import { changeBillingSchedule } from "../../../../../../lib/rental-billing-server";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await changeBillingSchedule(id, await rentalJson(request), user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (cause) { return rentalError(cause); }
}

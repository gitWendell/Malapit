import { checkOrigin, requireUser } from "../../../../../lib/server";
import { changeRentalUnit, rentalError, rentalJson } from "../../../../../lib/rentals-server";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await changeRentalUnit(id, await rentalJson(request), user)); }
  catch (error) { return rentalError(error); }
}

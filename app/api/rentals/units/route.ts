import { checkOrigin, requireUser } from "../../../../lib/server";
import { createRentalUnit, rentalError, rentalJson } from "../../../../lib/rentals-server";
export async function POST(request: Request) {
  try { checkOrigin(request); const user = await requireUser(); return Response.json(await createRentalUnit(await rentalJson(request), user), { status: 201 }); }
  catch (error) { return rentalError(error); }
}

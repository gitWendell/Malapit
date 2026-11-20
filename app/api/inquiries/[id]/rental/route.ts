import { checkOrigin, requireUser } from "../../../../../lib/server";
import { rentalError, rentalJson } from "../../../../../lib/rentals-server";
import { createInquiryRental, inquiryRentalSetup } from "../../../../../lib/inquiry-rentals-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(), { id } = await context.params; return Response.json(await inquiryRentalSetup(id, user), { headers }); } catch (error) { return rentalError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await createInquiryRental(id, await rentalJson(request), user), { status: 201, headers }); } catch (error) { return rentalError(error); }
}

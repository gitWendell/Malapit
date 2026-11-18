import { requireUser } from "../../../../../lib/server";
import { rentalError } from "../../../../../lib/rentals-server";
import { ownerReportExport } from "../../../../../lib/rental-reports-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await ownerReportExport(new URL(request.url), await requireUser()); }
  catch (error) { return rentalError(error); }
}

import { checkOrigin, requireUser } from "../../../../../lib/server";
import { rentalJson } from "../../../../../lib/rentals-server";
import { createInquiryMessage, inquiryMessageError, inquiryMessagesFor } from "../../../../../lib/inquiry-messages-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const user = await requireUser(), { id } = await context.params; return Response.json(await inquiryMessagesFor(id, new URL(request.url), user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return inquiryMessageError(error); }
}
export async function POST(request: Request, context: Context) {
  try { checkOrigin(request); const user = await requireUser(), { id } = await context.params; return Response.json(await createInquiryMessage(id, await rentalJson(request), user), { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return inquiryMessageError(error); }
}

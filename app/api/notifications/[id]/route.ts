import { requireUser } from "../../../../lib/server";
import { notificationFor } from "../../../../lib/notifications-server";
import { notificationHeaders as headers, notificationError } from "../../../../lib/notification-route";
export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const {id}=await context.params;return Response.json({notification:await notificationFor(id,await requireUser())},{headers});}catch(cause){return notificationError(cause);}}

import { checkOrigin, requireUser } from "../../../lib/server";
import { rentalJson } from "../../../lib/rentals-server";
import { notificationsFor, readNotifications } from "../../../lib/notifications-server";
import { notificationHeaders as headers, notificationError } from "../../../lib/notification-route";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{return Response.json(await notificationsFor(new URL(request.url),await requireUser()),{headers});}catch(cause){return notificationError(cause);}}
export async function PATCH(request:Request){try{checkOrigin(request);const user=await requireUser();return Response.json(await readNotifications(await rentalJson(request),user),{headers});}catch(cause){return notificationError(cause);}}

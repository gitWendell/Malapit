import { checkOrigin, requireUser } from "../../../../lib/server";
import { rentalJson } from "../../../../lib/rentals-server";
import { pushDeviceCookie, pushSettings, removePushDevice, savePushSubscription } from "../../../../lib/notifications-server";
import { notificationHeaders, notificationError } from "../../../../lib/notification-route";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{return Response.json(await pushSettings(request,await requireUser()),{headers:notificationHeaders});}catch(cause){return notificationError(cause);}}
export async function POST(request:Request){try{checkOrigin(request);const user=await requireUser(),id=await savePushSubscription(request,await rentalJson(request),user);return Response.json({ok:true},{status:201,headers:{...notificationHeaders,"Set-Cookie":pushDeviceCookie(id,request)}});}catch(cause){return notificationError(cause);}}
export async function DELETE(request:Request){try{checkOrigin(request);await removePushDevice(request,await requireUser());return Response.json({ok:true},{headers:{...notificationHeaders,"Set-Cookie":pushDeviceCookie(null,request)}});}catch(cause){return notificationError(cause);}}

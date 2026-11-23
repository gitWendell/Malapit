import {checkOrigin,requireUser} from "../../../../../lib/server";
import {createDeviceTest} from "../../../../../lib/notifications-server";
import {notificationHeaders as headers,notificationError} from "../../../../../lib/notification-route";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{checkOrigin(request);return Response.json(await createDeviceTest(request,await requireUser()),{status:201,headers});}catch(cause){return notificationError(cause);}}

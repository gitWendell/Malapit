import {requireUser,checkOrigin} from "../../../../../lib/server";
import {rentalJson} from "../../../../../lib/rentals-server";
import {changeOwnerPaymentMethod} from "../../../../../lib/owner-payment-methods-server";
import {paymentDetailsHeaders as headers,paymentDetailsError} from "../../../../../lib/owner-payment-route";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){try{checkOrigin(request);const user=await requireUser(),{id}=await context.params;return Response.json(await changeOwnerPaymentMethod(id,await rentalJson(request),user),{headers});}catch(error){return paymentDetailsError(error);}}

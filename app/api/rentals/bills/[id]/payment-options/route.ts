import {requireUser} from "../../../../../../lib/server";
import {billPaymentOptions} from "../../../../../../lib/owner-payment-methods-server";
import {paymentDetailsHeaders as headers,paymentDetailsError} from "../../../../../../lib/owner-payment-route";
export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const user=await requireUser(),{id}=await context.params;return Response.json(await billPaymentOptions(id,user),{headers});}catch(error){return paymentDetailsError(error);}}

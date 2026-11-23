import {requireUser} from "../../../../../lib/server";
import {paymentQr} from "../../../../../lib/owner-payment-methods-server";
import {paymentDetailsError} from "../../../../../lib/owner-payment-route";
export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const user=await requireUser(),{id}=await context.params;return await paymentQr(id,user);}catch(error){return paymentDetailsError(error);}}

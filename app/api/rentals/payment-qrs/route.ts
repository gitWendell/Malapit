import {requireUser,checkOrigin} from "../../../../lib/server";
import {uploadPaymentQr} from "../../../../lib/owner-payment-methods-server";
import {paymentDetailsHeaders as headers,paymentDetailsError} from "../../../../lib/owner-payment-route";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{checkOrigin(request);return Response.json(await uploadPaymentQr(request,await requireUser()),{status:201,headers});}catch(error){return paymentDetailsError(error);}}

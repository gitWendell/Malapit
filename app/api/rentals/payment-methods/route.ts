import {requireUser,checkOrigin} from "../../../../lib/server";
import {rentalJson} from "../../../../lib/rentals-server";
import {ownPaymentMethods,createOwnerPaymentMethod} from "../../../../lib/owner-payment-methods-server";
import {paymentDetailsHeaders as headers,paymentDetailsError} from "../../../../lib/owner-payment-route";
export const dynamic="force-dynamic";
export async function GET(){try{return Response.json(await ownPaymentMethods(await requireUser()),{headers});}catch(error){return paymentDetailsError(error);}}
export async function POST(request:Request){try{checkOrigin(request);const user=await requireUser();return Response.json(await createOwnerPaymentMethod(await rentalJson(request),user),{status:201,headers});}catch(error){return paymentDetailsError(error);}}

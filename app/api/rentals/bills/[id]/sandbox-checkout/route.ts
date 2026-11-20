import{requireUser,checkOrigin}from"../../../../../../lib/server";
import{rentalJson}from"../../../../../../lib/rentals-server";
import{sandboxForBill,createSandboxCheckout}from"../../../../../../lib/hitpay-sandbox-server";
import{sandboxError}from"../../../../../../lib/hitpay-sandbox-route";
const headers={"Cache-Control":"private, no-store"};export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const user=await requireUser(),{id}=await context.params;return Response.json(await sandboxForBill(id,user),{headers});}catch(error){return sandboxError(error);}}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{checkOrigin(request);const user=await requireUser(),{id}=await context.params;return Response.json(await createSandboxCheckout(id,await rentalJson(request),user,new URL(request.url).origin),{status:201,headers});}catch(error){return sandboxError(error);}}

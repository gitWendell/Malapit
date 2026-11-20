import{requireUser,checkOrigin}from"../../../../../../lib/server";
import{sandboxCheckoutFor}from"../../../../../../lib/hitpay-sandbox-server";
import{sandboxError}from"../../../../../../lib/hitpay-sandbox-route";
const headers={"Cache-Control":"private, no-store"};export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const user=await requireUser(),{id}=await context.params;return Response.json(await sandboxCheckoutFor(id,user),{headers});}catch(error){return sandboxError(error);}}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{checkOrigin(request);const user=await requireUser(),{id}=await context.params;return Response.json(await sandboxCheckoutFor(id,user,true),{headers});}catch(error){return sandboxError(error);}}

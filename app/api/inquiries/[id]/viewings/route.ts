import { checkOrigin, requireUser } from '../../../../../lib/server';
import { rentalJson } from '../../../../../lib/rentals-server';
import { changeViewing, proposeViewing, viewingError, viewingHistory } from '../../../../../lib/inquiry-viewings-server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  try{const user=await requireUser(),{id}=await context.params;return Response.json(await viewingHistory(id,user),{headers});}catch(cause){return viewingError(cause);}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{checkOrigin(request);const user=await requireUser(),{id}=await context.params;return Response.json(await proposeViewing(id,await rentalJson(request),user),{status:201,headers});}catch(cause){return viewingError(cause);}
}
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  try{checkOrigin(request);const user=await requireUser(),{id}=await context.params;return Response.json(await changeViewing(id,await rentalJson(request),user),{headers});}catch(cause){return viewingError(cause);}
}

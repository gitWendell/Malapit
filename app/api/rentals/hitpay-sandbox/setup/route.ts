import {requireUser,checkOrigin,HttpError}from"../../../../../lib/server";
import {sandboxSetup}from"../../../../../lib/hitpay-sandbox-server";
import {sandboxError}from"../../../../../lib/hitpay-sandbox-route";
const headers={"Cache-Control":"private, no-store"};export const dynamic="force-dynamic";
export async function GET(request:Request){try{return Response.json(await sandboxSetup(await requireUser(),new URL(request.url).origin),{headers});}catch(error){return sandboxError(error);}}
export async function POST(request:Request){try{checkOrigin(request);await requireUser();throw new HttpError(410,"Sandbox setup is retired. Open Payment setup in My Rentals.");}catch(error){return sandboxError(error);}}

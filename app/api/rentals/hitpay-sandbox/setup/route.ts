import {requireUser,checkOrigin}from"../../../../../lib/server";
import {sandboxSetup,connectSandbox}from"../../../../../lib/hitpay-sandbox-server";
import {sandboxError}from"../../../../../lib/hitpay-sandbox-route";
const headers={"Cache-Control":"private, no-store"};export const dynamic="force-dynamic";
export async function GET(request:Request){try{return Response.json(await sandboxSetup(await requireUser(),new URL(request.url).origin),{headers});}catch(error){return sandboxError(error);}}
export async function POST(request:Request){try{checkOrigin(request);return Response.json(await connectSandbox(await requireUser()),{headers});}catch(error){return sandboxError(error);}}

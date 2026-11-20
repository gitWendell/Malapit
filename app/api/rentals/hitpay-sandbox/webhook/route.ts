import{sandboxWebhook}from"../../../../../lib/hitpay-sandbox-server";
import{sandboxError}from"../../../../../lib/hitpay-sandbox-route";
export async function POST(request:Request){try{return Response.json(await sandboxWebhook(request),{headers:{"Cache-Control":"no-store"}});}catch(error){return sandboxError(error);}}

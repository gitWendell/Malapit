import {env} from "cloudflare:workers";
import {and,desc,eq,isNull} from "drizzle-orm";
import {z} from "zod";
import {hitpaySandboxCheckouts,settings} from "../db/schema";
import type{AuthIdentity}from"./auth";
import {getDb,HttpError}from"./server";
import {accessibleBill}from"./rental-bills-server";
import {philippinesDay}from"./rentals";
import {sandboxRequestInput,sandboxReference,findSandboxPayment,validateSandboxPayment,verifyHitpaySignature,validSandboxCredential,type SandboxCheckout,type SandboxState}from"./hitpay-sandbox";
import {callSandboxProvider,ProviderFailure} from "./hitpay-sandbox-provider";
const OWNER_SETTING="hitpay_sandbox_owner";
const credentialsReady=()=>validSandboxCredential(env.HITPAY_SANDBOX_API_KEY)&&validSandboxCredential(env.HITPAY_SANDBOX_WEBHOOK_SECRET)&&z.string().uuid().safeParse(env.HITPAY_SANDBOX_BUSINESS_ID).success;
const boundOwner=async()=> (await getDb().select().from(settings).where(eq(settings.key,OWNER_SETTING)).limit(1))[0]?.value||null;
const publicCheckout=(row:typeof hitpaySandboxCheckouts.$inferSelect):SandboxCheckout=>({id:row.id,billId:row.billId,status:row.status as SandboxCheckout["status"],checkoutUrl:row.checkoutUrl,providerId:row.providerId,createdAt:row.createdAt,verifiedAt:row.verifiedAt,amountCents:row.amountCents,currency:"SGD"});
async function provider(path:string,body?:unknown):Promise<unknown>{
 if(!credentialsReady())throw new HttpError(503,"HitPay sandbox credentials are not connected yet.");
 return callSandboxProvider(env.HITPAY_SANDBOX_API_KEY!,path,body);
}
export async function sandboxSetup(user:AuthIdentity,origin:string){
 const owner=await boundOwner();return{isAdmin:user.isAdmin,credentialsReady:credentialsReady(),connected:!!owner,boundToMe:owner===user.userId,businessId:env.HITPAY_SANDBOX_BUSINESS_ID||"",callbackUrl:origin+"/api/rentals/hitpay-sandbox/webhook"};
}
export async function connectSandbox(user:AuthIdentity){
 if(!user.isAdmin)throw new HttpError(403,"Only the Malapit operator can connect this sandbox test business.");
 let response:unknown;
 try{response=await provider("/v1/webhook-events");}
 catch(error){
  if(error instanceof ProviderFailure)throw new HttpError(502,error.status===401||error.status===403?"HitPay rejected the sandbox API key. Copy the API key (not Salt) from the Singapore sandbox business and update the encrypted Cloudflare secret.":error.status?`HitPay returned HTTP ${error.status} while checking the registered sandbox callback.`:"HitPay's sandbox did not respond. Please try the connection check again.");
  throw error;
 }
 const callbacks=z.array(z.object({business_id:z.string(),url:z.string(),event_types:z.array(z.string())})).parse(response);
 if(!callbacks.some(row=>row.business_id===env.HITPAY_SANDBOX_BUSINESS_ID&&row.url==="https://malapit-test.malapit-ph.workers.dev/api/rentals/hitpay-sandbox/webhook"&&row.event_types.includes("payment_request.completed")))throw new HttpError(409,"The sandbox callback does not match this business and Malapit site.");
 await getDb().insert(settings).values({key:OWNER_SETTING,value:user.userId}).onConflictDoNothing();
 if(await boundOwner()!==user.userId)throw new HttpError(409,"This sandbox business is already connected to another operator's units.");
 return{ok:true};
}
export async function sandboxForBill(billId:string,user:AuthIdentity):Promise<SandboxState>{
 const bill=await accessibleBill(billId,user),owner=await boundOwner();
 if(!owner||owner!==bill.ownerId)return{available:false,checkout:null};
 const [row]=await getDb().select().from(hitpaySandboxCheckouts).where(eq(hitpaySandboxCheckouts.billId,billId)).orderBy(desc(hitpaySandboxCheckouts.createdAt)).limit(1);
 return{available:credentialsReady()&&bill.status==="issued",checkout:row?publicCheckout(row):null};
}
async function privateCheckout(id:string,user:AuthIdentity){
 if(!z.string().uuid().safeParse(id).success)throw new HttpError(404,"This test checkout is unavailable.");
 const [row]=await getDb().select().from(hitpaySandboxCheckouts).where(eq(hitpaySandboxCheckouts.id,id)).limit(1);
 if(!row)throw new HttpError(404,"This test checkout is unavailable.");await accessibleBill(row.billId,user);return row;
}
export async function createSandboxCheckout(billId:string,input:unknown,user:AuthIdentity,origin:string){
 const data=sandboxRequestInput.parse(input),bill=await accessibleBill(billId,user),db=getDb();
 if(!credentialsReady()||await boundOwner()!==bill.ownerId)throw new HttpError(503,"HitPay sandbox is not connected for this owner.");
 if(bill.status!=="issued")throw new HttpError(409,"This rent bill was cancelled. Open its current replacement.");
 const [existing]=await db.select().from(hitpaySandboxCheckouts).where(eq(hitpaySandboxCheckouts.id,data.requestId)).limit(1);
 if(existing){if(existing.billId!==billId)throw new HttpError(409,"This test request was already used for another bill.");return publicCheckout(existing);}
 const [open]=await db.select().from(hitpaySandboxCheckouts).where(and(eq(hitpaySandboxCheckouts.billId,billId),/* state is checked atomically by the unique index as well */eq(hitpaySandboxCheckouts.status,"pending"))).limit(1);
 if(open)return publicCheckout(open);
 const now=new Date().toISOString();
 try{await db.insert(hitpaySandboxCheckouts).values({id:data.requestId,billId,ownerId:bill.ownerId,renterId:bill.renterId,actorId:user.userId,businessId:env.HITPAY_SANDBOX_BUSINESS_ID!,createdAt:now,createdDay:philippinesDay(),updatedAt:now});}catch{
  const state=await sandboxForBill(billId,user);if(state.checkout&&["creating","pending","unknown"].includes(state.checkout.status))return state.checkout;throw new HttpError(429,"Sandbox testing has reached its limit. Try again later.");
 }
 try{
  const raw=await provider("/v1/payment-requests",{amount:1,currency:"SGD",payment_methods:["paynow_online"],purpose:"Malapit sandbox test only — no rent payment",reference_number:sandboxReference(data.requestId),redirect_url:origin+"/hitpay-return?checkout="+data.requestId,allow_repeated_payments:"false",expires_after:"30 mins",send_email:"false",send_sms:"false"});
  const metadata=z.object({id:z.string().uuid(),reference_number:z.literal(sandboxReference(data.requestId))}).parse(raw);
  await db.update(hitpaySandboxCheckouts).set({providerId:metadata.id}).where(eq(hitpaySandboxCheckouts.id,data.requestId));
  const result=validateSandboxPayment(raw,data.requestId,metadata.id);
  await db.update(hitpaySandboxCheckouts).set({providerId:result.id,checkoutUrl:result.checkoutUrl,status:result.status,updatedAt:new Date().toISOString(),verifiedAt:result.status==="completed"?new Date().toISOString():null}).where(and(eq(hitpaySandboxCheckouts.id,data.requestId),eq(hitpaySandboxCheckouts.status,"creating")));
 }catch(cause){await db.update(hitpaySandboxCheckouts).set({status:cause instanceof ProviderFailure&&cause.rejected?"failed":"unknown",updatedAt:new Date().toISOString()}).where(and(eq(hitpaySandboxCheckouts.id,data.requestId),eq(hitpaySandboxCheckouts.status,"creating")));throw new HttpError(502,"HitPay did not confirm this checkout. Refresh its status before trying again.");}
 return publicCheckout(await privateCheckout(data.requestId,user));
}
async function refreshRow(row:typeof hitpaySandboxCheckouts.$inferSelect){
 if(!row.providerId&&["creating","unknown"].includes(row.status)){
  const candidate=findSandboxPayment(await provider("/v1/payment-requests?search="+sandboxReference(row.id)+"&per_page=2&current_page=1"),row.id);
  if(!candidate)return row;
  await getDb().update(hitpaySandboxCheckouts).set({providerId:candidate.id}).where(and(eq(hitpaySandboxCheckouts.id,row.id),isNull(hitpaySandboxCheckouts.providerId)));
  row=(await getDb().select().from(hitpaySandboxCheckouts).where(eq(hitpaySandboxCheckouts.id,row.id)).limit(1))[0];
 }
 if(!row.providerId)return row;
 const payment=validateSandboxPayment(await provider("/v1/payment-requests/"+row.providerId),row.id,row.providerId),now=new Date().toISOString();
 // Completed is final for this isolated success test; stale failure events cannot downgrade it.
 await getDb().update(hitpaySandboxCheckouts).set({status:payment.status,checkoutUrl:payment.checkoutUrl,updatedAt:now,verifiedAt:payment.status==="completed"?row.verifiedAt||now:row.verifiedAt}).where(and(eq(hitpaySandboxCheckouts.id,row.id),eq(hitpaySandboxCheckouts.status,row.status)));
 return(await getDb().select().from(hitpaySandboxCheckouts).where(eq(hitpaySandboxCheckouts.id,row.id)).limit(1))[0];
}
export async function sandboxCheckoutFor(id:string,user:AuthIdentity,sync=false){
 let row=await privateCheckout(id,user);
 // Throttle repeated browser checks; signed callbacks bypass this short window.
 if(sync&&row.status!=="completed"&&Date.now()-Date.parse(row.updatedAt)>=5000)row=await refreshRow(row);
 return publicCheckout(row);
}
export async function sandboxWebhook(request:Request){
 if(!credentialsReady())throw new HttpError(503,"Sandbox is not connected.");
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,"Empty callback.");const chunks:Uint8Array[]=[];let length=0;while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>131072){await reader.cancel();throw new HttpError(413,"Callback too large.");}chunks.push(part.value);}const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 if(!await verifyHitpaySignature(raw,request.headers.get("hitpay-signature"),env.HITPAY_SANDBOX_WEBHOOK_SECRET!))throw new HttpError(401,"Invalid callback signature.");
 const payload=z.object({id:z.string().uuid()}).passthrough().parse(JSON.parse(new TextDecoder().decode(raw)));
 const [row]=await getDb().select().from(hitpaySandboxCheckouts).where(eq(hitpaySandboxCheckouts.providerId,payload.id)).limit(1);
 if(!row||row.businessId!==env.HITPAY_SANDBOX_BUSINESS_ID||row.status==="completed")return{ok:true};
 await refreshRow(row);return{ok:true};
}

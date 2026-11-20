import { z } from "zod";
export const HITPAY_SANDBOX_API = "https://api.sandbox.hit-pay.com";
export const HITPAY_SANDBOX_AMOUNT_CENTS = 100;
export const HITPAY_SANDBOX_CURRENCY = "SGD";
export const validSandboxCredential = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_+\/=-]{32,512}$/.test(value);
export const sandboxRequestInput = z.object({requestId:z.string().uuid(),testOnlyConfirmed:z.literal(true)});
export const sandboxStatus = z.enum(["creating","pending","unknown","completed","failed","expired","canceled","inactive"]);
export type SandboxStatus=z.infer<typeof sandboxStatus>;
export type SandboxCheckout={id:string;billId:string;status:SandboxStatus;checkoutUrl:string|null;providerId:string|null;createdAt:string;verifiedAt:string|null;amountCents:number;currency:"SGD"};
export type SandboxState={available:boolean;checkout:SandboxCheckout|null};
export type SandboxSetup={isAdmin:boolean;credentialsReady:boolean;connected:boolean;boundToMe:boolean;businessId:string;callbackUrl:string};
export const sandboxReference=(id:string)=>"malapit-sandbox-"+id;
export function sandboxCheckoutUrl(value:unknown):string{
 if(typeof value!=="string")throw new Error("HitPay did not provide a checkout URL.");
 const url=new URL(value);
 if(url.protocol!=="https:"||!["securecheckout.sandbox.hit-pay.com","checkout.sandbox.hit-pay.com"].includes(url.hostname)||url.username||url.password||url.port||!url.pathname.startsWith("/payment-request/"))throw new Error("HitPay returned an unexpected checkout destination.");
 return url.href;
}
export function validateSandboxPayment(value:unknown,id:string,providerId?:string){
 const data=z.object({id:z.string().uuid(),reference_number:z.string(),amount:z.union([z.string(),z.number()]),currency:z.string(),status:z.enum(["pending","completed","failed","expired","canceled","inactive"]),url:z.string(),allow_repeated_payments:z.literal(false),payments:z.array(z.object({status:z.string(),refunded_amount:z.union([z.string(),z.number()]).optional()})).optional()}).parse(value);
 if(data.reference_number!==sandboxReference(id)||providerId&&data.id!==providerId||Number(data.amount)!==1||data.currency.toUpperCase()!==HITPAY_SANDBOX_CURRENCY)throw new Error("The test payment details do not match this checkout.");
 const checkoutUrl=sandboxCheckoutUrl(data.url);
 if(!new RegExp("/"+data.id+"(?:/checkout)?/?$").test(new URL(checkoutUrl).pathname))throw new Error("The checkout destination does not match this test request.");
 if(data.payments?.some(payment=>Number(payment.refunded_amount||0)>0||["refunded","partially_refunded","succeeded_manually"].includes(payment.status)))throw new Error("This test payment needs review in HitPay.");
 return {...data,checkoutUrl};
}
export async function verifyHitpaySignature(raw:Uint8Array,signature:string|null,secret:string){
 if(!signature||!/^([a-f0-9]{64})$/i.test(signature)||!secret)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const computed=new Uint8Array(await crypto.subtle.sign("HMAC",key,raw as BufferSource));
 const expected=Uint8Array.from(signature.match(/../g)!,pair=>parseInt(pair,16));let diff=0;for(let i=0;i<computed.length;i++)diff|=computed[i]^expected[i];return diff===0;
}

// List results can be paginated. Keep only a single exact opaque reference;
// never expose other provider requests or their customer data to the browser.
export function findSandboxPayment(value:unknown,id:string){
 const rows=z.array(z.unknown()).parse(Array.isArray(value)?value:z.object({data:z.array(z.unknown())}).parse(value).data);
 const identity=z.object({id:z.string().uuid(),reference_number:z.literal(sandboxReference(id))}).passthrough();
 const matches=rows.flatMap(row=>{const result=identity.safeParse(row);return result.success?[result.data]:[];});
 if(matches.length>1)throw new Error("More than one test payment matches this reference. Review it in HitPay.");
 return matches[0]||null;
}

import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ownerPaymentMethods, ownerPaymentQrs } from "../db/schema";
import { qrAccessScope } from "./owner-payment-queries";
import type { AuthIdentity } from "./auth";
import { accessibleBill } from "./rental-bills-server";
import { getDb, HttpError } from "./server";
import { philippinesDay } from "./rentals";
import { receivingCreate, receivingChange, RECEIVING_LIMITS, qrPngError, type OwnerPaymentMethod } from "./owner-payment-methods";

const unavailable = () => new HttpError(404,"These payment details are not available to this account.");
const validId = (id: string) => { if(!z.string().uuid().safeParse(id).success) throw unavailable(); };
const versionAfter = (previous: string) => new Date(Math.max(Date.now(),Date.parse(previous)+1)).toISOString();
export async function ownPaymentMethods(user: AuthIdentity) {
  return { methods: await getDb().select().from(ownerPaymentMethods).where(and(eq(ownerPaymentMethods.ownerId,user.userId),isNull(ownerPaymentMethods.archivedAt))).orderBy(asc(ownerPaymentMethods.createdAt),asc(ownerPaymentMethods.id)).limit(10) as OwnerPaymentMethod[] };
}
export async function createOwnerPaymentMethod(input: unknown,user: AuthIdentity) {
  const data = receivingCreate.parse(input),db = getDb();
  const existing = async () => {
    const [row] = await db.select().from(ownerPaymentMethods).where(eq(ownerPaymentMethods.id,data.requestId)).limit(1);
    if(!row) return false;
    if(row.ownerId !== user.userId || row.archivedAt || !Object.entries(data.details).every(([key,value])=>row[key as keyof typeof row]===value)) throw new HttpError(409,"This request already saved different details. Refresh your payment options.");
    return true;
  };
  if(await existing()) return {id:data.requestId};
  const now = new Date().toISOString();
  try { await db.insert(ownerPaymentMethods).values({id:data.requestId,ownerId:user.userId,...data.details,createdAt:now,updatedAt:now}); }
  catch(error) { if(!await existing()) throw error; }
  return {id:data.requestId};
}
export async function changeOwnerPaymentMethod(id: string,input: unknown,user: AuthIdentity) {
  validId(id);const data=receivingChange.parse(input),db=getDb();
  const [row]=await db.select().from(ownerPaymentMethods).where(and(eq(ownerPaymentMethods.id,id),eq(ownerPaymentMethods.ownerId,user.userId))).limit(1);
  if(!row)throw unavailable();
  if(row.archivedAt){if(data.action==="archive")return{id};throw unavailable();}
  if(data.action==="update"&&row.updatedAt!==data.version&&Object.entries(data.details).every(([key,value])=>row[key as keyof typeof row]===value))return{id};
  if(row.updatedAt!==data.version)throw new HttpError(409,"These payment details changed. Refresh and check the latest version.");
  const now=versionAfter(row.updatedAt);
  const changes=data.action==="archive"?{archivedAt:now,updatedAt:now}:{...data.details,updatedAt:now};
  const saved=await db.update(ownerPaymentMethods).set(changes).where(and(eq(ownerPaymentMethods.id,id),eq(ownerPaymentMethods.updatedAt,data.version),isNull(ownerPaymentMethods.archivedAt))).returning({id:ownerPaymentMethods.id});
  if(!saved.length)throw new HttpError(409,"These payment details changed. Refresh before saving.");
  return {id};
}
export async function billPaymentOptions(id: string,user: AuthIdentity) {
  const bill=await accessibleBill(id,user);
  if(bill.status!=="issued" || bill.remainingCents<=0)return {methods:[] as OwnerPaymentMethod[]};
  return ownPaymentMethods({...user,userId:bill.ownerId});
}
export async function uploadPaymentQr(request: Request,user: AuthIdentity) {
  const id=request.headers.get("x-upload-id")||"";validId(id);
  if(request.headers.get("content-type")!=="image/png")throw new HttpError(415,"Upload the QR using the payment-details form.");
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,"Choose a QR image.");
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>RECEIVING_LIMITS.qrBytes){await reader.cancel();throw new HttpError(413,"This QR image is too large. Choose a cropped QR image.");}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  const error=qrPngError(bytes);if(error)throw new HttpError(400,error);
  const checksum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(value=>value.toString(16).padStart(2,"0")).join("");
  const db=getDb(),old=await db.select({ownerId:ownerPaymentQrs.ownerId,checksum:ownerPaymentQrs.checksum}).from(ownerPaymentQrs).where(eq(ownerPaymentQrs.id,id)).limit(1);
  if(old.length){if(old[0].ownerId!==user.userId||old[0].checksum!==checksum)throw new HttpError(409,"This upload reference was already used. Choose the image again.");return{id};}
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  try{await db.insert(ownerPaymentQrs).values({id,ownerId:user.userId,data:btoa(binary),checksum,byteSize:length,createdAt:new Date().toISOString(),createdDay:philippinesDay()});}
  catch(cause){const [row]=await db.select({ownerId:ownerPaymentQrs.ownerId,checksum:ownerPaymentQrs.checksum}).from(ownerPaymentQrs).where(eq(ownerPaymentQrs.id,id)).limit(1);if(!row||row.ownerId!==user.userId||row.checksum!==checksum)throw cause;}
  return{id};
}
export async function paymentQr(id: string,user: AuthIdentity) {
  validId(id);const db=getDb();
  // An owner, a renter with an unpaid original bill, or the original parties
  // to a report that preserved this QR may read it. Reviewers get no bypass.
  const scope=qrAccessScope(user.userId);
  const [row]=await db.select({data:ownerPaymentQrs.data}).from(ownerPaymentQrs).where(and(eq(ownerPaymentQrs.id,id),scope)).limit(1);
  if(!row)throw unavailable();
  const raw=atob(row.data),bytes=Uint8Array.from(raw,character=>character.charCodeAt(0));
  return new Response(bytes,{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`inline; filename="payment-qr-${id}.png"`}});
}

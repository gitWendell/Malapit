import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ownerPaymentMethods, rentalPayments } from "../db/schema";
import { destinationSnapshot, readDestination, reportedMethod, type OwnerPaymentMethod } from "./owner-payment-methods";
import type { AuthIdentity } from "./auth";
import { accessibleBill } from "./rental-bills-server";
import { getDb, HttpError } from "./server";
import { philippinesDay } from "./rentals";
import { referenceKey, rentalPaymentAction, rentalPaymentInput, type RentalPayment } from "./rental-payments";

export async function createRentalPayment(billId: string, input: unknown, user: AuthIdentity) {
  const data = rentalPaymentInput.parse(input), db = getDb(), id = data.requestId;
  const values = { billId, amountCents: data.amountCents, method: data.method, paidAt: data.paidAt, reference: data.reference, note: data.note, destinationId: data.destinationId || null };
  function validateReceiptRole(owner: boolean) {
    if (owner && !data.receiptConfirmed) throw new HttpError(400, "Check your original records and confirm that you received this payment.");
    if (!owner && (data.receiptConfirmed || data.duplicateReason)) throw new HttpError(400, "Only the owner can confirm receipt or review a repeated reference.");
  }
  const existing = async () => {
    const [row] = await db.select().from(rentalPayments).where(and(eq(rentalPayments.id, id), eq(rentalPayments.submittedBy, user.userId))).limit(1);
    if (!row) return false;
    validateReceiptRole(row.ownerId === user.userId);
    if ((readDestination(row.destinationSnapshot)?.updatedAt || undefined) !== data.destinationVersion) throw new HttpError(409,"This request already saved another payment option. Refresh the bill.");
    if (!Object.entries(values).every(([key, value]) => row[key as keyof typeof row] === value) || row.ownerId === user.userId && (row.duplicateReason || "") !== data.duplicateReason) throw new HttpError(409, "This request already saved different payment details. Refresh the bill before trying again.");
    return true;
  };
  if (await existing()) return { id };
  const bill = await accessibleBill(billId, user), owner = bill.ownerId === user.userId;
  validateReceiptRole(owner);
  if (bill.status !== "issued") throw new HttpError(409, "This bill was cancelled. Open its current replacement before recording a payment.");
  if (bill.pendingCount) throw new HttpError(409, "This bill already has a payment awaiting confirmation. Review or cancel that report first.");
  if (data.amountCents > bill.remainingCents) throw new HttpError(409, "The amount exceeds this bill’s remaining balance in the records.");
  let savedDestination: string | null = null;
  if(data.destinationId){
    const [method]=await db.select().from(ownerPaymentMethods).where(and(eq(ownerPaymentMethods.id,data.destinationId),eq(ownerPaymentMethods.ownerId,bill.ownerId))).limit(1);
    if(!method||method.archivedAt||method.updatedAt!==data.destinationVersion)throw new HttpError(409,"The owner's payment details changed. Reopen the bill and check them before reporting a payment.");
    if(reportedMethod(method.kind as OwnerPaymentMethod["kind"])!==data.method)throw new HttpError(400,"The payment method does not match the selected receiving account.");
    savedDestination=JSON.stringify(destinationSnapshot(method as OwnerPaymentMethod));
  }
  const now = new Date(), timestamp = now.toISOString();
  try { await db.insert(rentalPayments).values({ id, ...values, destinationSnapshot:savedDestination, ownerId: bill.ownerId, renterId: bill.renterId, submittedBy: user.userId, referenceKey: referenceKey(data.reference), status: owner ? "confirmed" : "pending", createdAt: timestamp, createdDay: philippinesDay(now), reviewedAt: owner ? timestamp : null, reviewedBy: owner ? user.userId : null, duplicateReason: owner && data.duplicateReason ? data.duplicateReason : null }); }
  catch (cause) { if (!await existing()) throw cause; }
  return { id };
}

export async function changeRentalPayment(id: string, input: unknown, user: AuthIdentity) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "This payment record is not available to this account.");
  const data = rentalPaymentAction.parse(input), db = getDb();
  const load = async () => { const [row] = await db.select().from(rentalPayments).where(eq(rentalPayments.id, id)).limit(1); if (!row) throw new HttpError(404, "This payment record is not available to this account."); return row as RentalPayment; };
  const row = await load(); await accessibleBill(row.billId, user);
  const owner = row.ownerId === user.userId;
  if (data.action === "cancel" ? owner || row.submittedBy !== user.userId : !owner) throw new HttpError(403, data.action === "cancel" ? "Only the renter who submitted this report can cancel it." : "Only the owner can review or reverse a payment record.");
  const target = ({ confirm: "confirmed", reject: "rejected", cancel: "cancelled", reverse: "reversed" } as const)[data.action];
  function replay(current: RentalPayment) {
    const same = data.action === "confirm" ? (current.duplicateReason || "") === data.duplicateReason : data.action === "reverse" ? current.reversalReason === data.reason : current.decisionReason === data.reason;
    if (current.status !== target || !same) throw new HttpError(409, "This payment record changed. Refresh the bill to see the latest decision.");
    return { id };
  }
  const from = data.action === "reverse" ? "confirmed" : "pending";
  if (row.status !== from) return replay(row);
  const timestamp = new Date().toISOString();
  const changes = data.action === "reverse" ? { status: target, reversedAt: timestamp, reversedBy: user.userId, reversalReason: data.reason }
    : { status: target, reviewedAt: timestamp, reviewedBy: user.userId, decisionReason: data.action === "confirm" ? null : data.reason, duplicateReason: data.action === "confirm" && data.duplicateReason ? data.duplicateReason : null };
  const result = await db.update(rentalPayments).set(changes).where(and(eq(rentalPayments.id, id), eq(rentalPayments.status, from))).returning({ id: rentalPayments.id });
  if (!result.length) return replay(await load());
  return { id };
}

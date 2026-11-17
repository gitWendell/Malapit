import { asc, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { rentalPaymentEvents, rentalPayments } from "../db/schema";
import { getDb } from "./server";
import type { RentalPaymentRecord } from "./rental-payments";

import { duplicateReferenceFlag } from "./rental-payment-sql";
export { confirmedAmount, pendingAmount, pendingCount, remainingAmount, billBalanceColumns } from "./rental-payment-sql";

// Call only after the bill's original owner/renter access check.
export async function paymentHistoryForBill(billId: string, page: number, ownerView: boolean) {
  const db = getDb();
  const rows = await db.select({ ...getTableColumns(rentalPayments), duplicateReference: duplicateReferenceFlag.as("duplicate_reference") }).from(rentalPayments).where(eq(rentalPayments.billId, billId)).orderBy(desc(eq(rentalPayments.status, "pending")), desc(rentalPayments.createdAt), asc(rentalPayments.id)).limit(21).offset(page * 20);
  const displayed = rows.slice(0, 20);
  const events = displayed.length ? await db.select().from(rentalPaymentEvents).where(inArray(rentalPaymentEvents.paymentId, displayed.map(row => row.id))).orderBy(asc(rentalPaymentEvents.createdAt)) : [];
  return { payments: displayed.map(row => ({ ...row, duplicateReference: ownerView && !!row.duplicateReference, events: events.filter(event => event.paymentId === row.id) })) as RentalPaymentRecord[], paymentPage: page, hasMorePayments: rows.length > 20 };
}

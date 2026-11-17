import { sql } from "drizzle-orm";

// Keep outer table names explicit inside correlated subqueries. Drizzle strips
// column qualifiers in single-table selects; bare "id" would bind to the inner
// payment table instead of the outer bill.
export const confirmedAmount = sql<number>`coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id = "rental_bills"."id" AND p.status = 'confirmed'), 0)`;
export const pendingAmount = sql<number>`coalesce((SELECT sum(p.amount_cents) FROM rental_payments p WHERE p.bill_id = "rental_bills"."id" AND p.status = 'pending'), 0)`;
export const pendingCount = sql<number>`(SELECT count(*) FROM rental_payments p WHERE p.bill_id = "rental_bills"."id" AND p.status = 'pending')`;
export const remainingAmount = sql<number>`CASE WHEN "rental_bills"."status" = 'voided' THEN 0 ELSE "rental_bills"."amount_cents" - ${confirmedAmount} END`;
export const billBalanceColumns = { confirmedCents: confirmedAmount.as("confirmed_cents"), pendingCents: pendingAmount.as("pending_cents"), pendingCount: pendingCount.as("pending_count"), remainingCents: remainingAmount.as("remaining_cents") };
export const duplicateReferenceFlag = sql<number>`EXISTS(SELECT 1 FROM rental_payments other WHERE other.owner_id = "rental_payments"."owner_id" AND other.method = "rental_payments"."method" AND other.reference_key = "rental_payments"."reference_key" AND other.status = 'confirmed' AND other.id <> "rental_payments"."id")`;

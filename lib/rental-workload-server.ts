import { and, asc, eq, getTableColumns, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { rentalBillSchedules, rentalBills, rentalConnections, rentalPayments } from "../db/schema";
import type { AuthIdentity } from "./auth";
import { getDb } from "./server";
import { billBalanceColumns, duplicateReferenceFlag, remainingAmount } from "./rental-payment-sql";
import type { RentalWorkload } from "./rental-workload";

export async function rentalWorkloadFor(url: URL, user: AuthIdentity): Promise<RentalWorkload> {
  const { role, page } = z.object({ role: z.enum(["owner", "renter"]), page: z.coerce.number().int().min(0).max(1000) }).parse({ role: url.searchParams.get("role") || "owner", page: url.searchParams.get("page") || 0 });
  const db = getDb();
  if (role === "owner") {
    const scope = and(eq(rentalPayments.ownerId, user.userId), eq(rentalPayments.status, "pending"));
    const [rows, counts, issues] = await Promise.all([
      db.select({ id: rentalPayments.id, billId: rentalPayments.billId, connectionId: rentalBills.connectionId, propertyName: rentalConnections.propertyName, unitName: rentalConnections.unitName, renterName: rentalConnections.renterName, amountCents: rentalPayments.amountCents, method: rentalPayments.method, paidAt: rentalPayments.paidAt, reference: rentalPayments.reference, note: rentalPayments.note, createdAt: rentalPayments.createdAt, duplicateReference: duplicateReferenceFlag }).from(rentalPayments).innerJoin(rentalBills, eq(rentalBills.id, rentalPayments.billId)).innerJoin(rentalConnections, eq(rentalConnections.id, rentalBills.connectionId)).where(scope).orderBy(asc(rentalPayments.createdAt), asc(rentalPayments.id)).limit(21).offset(page * 20),
      db.select({ count: sql<number>`count(*)` }).from(rentalPayments).where(scope),
      db.select({ connectionId: rentalBillSchedules.connectionId, nextMonth: rentalBillSchedules.nextMonth, issue: rentalBillSchedules.issue, propertyName: rentalConnections.propertyName, unitName: rentalConnections.unitName }).from(rentalBillSchedules).innerJoin(rentalConnections, eq(rentalConnections.id, rentalBillSchedules.connectionId)).where(and(eq(rentalBillSchedules.ownerId, user.userId), eq(rentalBillSchedules.status, "attention"))).limit(30),
    ]);
    return { role, page, pendingPayments: rows.slice(0, 20).map(row => ({ ...row, duplicateReference: !!row.duplicateReference })) as RentalWorkload["pendingPayments"], pendingTotal: counts[0].count, scheduleIssues: issues, dueBills: [], dueTotal: 0, hasMore: rows.length > 20 };
  }
  const scope = and(eq(rentalBills.renterId, user.userId), eq(rentalBills.status, "issued"), gt(remainingAmount, 0));
  const [rows, counts] = await Promise.all([
    db.select({ ...getTableColumns(rentalBills), ...billBalanceColumns, propertyName: rentalConnections.propertyName, unitName: rentalConnections.unitName, ownerName: rentalConnections.ownerName, renterName: rentalConnections.renterName }).from(rentalBills).innerJoin(rentalConnections, eq(rentalConnections.id, rentalBills.connectionId)).where(scope).orderBy(asc(rentalBills.dueDate), asc(rentalBills.id)).limit(21).offset(page * 20),
    db.select({ count: sql<number>`count(*)` }).from(rentalBills).where(scope),
  ]);
  return { role, page, pendingPayments: [], pendingTotal: 0, scheduleIssues: [], dueBills: rows.slice(0, 20) as RentalWorkload["dueBills"], dueTotal: counts[0].count, hasMore: rows.length > 20 };
}

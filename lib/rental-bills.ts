import { z } from "zod";
import { isCivilDate, philippinesDay, type RentalConnection } from "./rentals.ts";
import type { BillBalances, RentalPaymentRecord } from "./rental-payments.ts";

export const RENTAL_BILL_LIMITS = { total: 10000, dailyPerOwner: 60, periodDays: 31 } as const;
export const isBillingMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && isCivilDate(value + "-01");
const civil = z.string().refine(isCivilDate, "Enter a valid date.");
const daysBetween = (start: string, end: string) => (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000;

export const rentalBillInput = z.object({
  requestId: z.string().uuid(), connectionId: z.string().uuid(),
  month: z.string().refine(isBillingMonth, "Choose a valid billing month."),
  periodStart: civil, periodEnd: civil, dueDate: civil,
  amountCents: z.number().int().min(1, "Enter an amount greater than zero.").max(100000000, "A rent bill can be at most ₱1,000,000."),
  note: z.string().trim().max(500).default(""), detailsConfirmed: z.literal(true),
}).superRefine((data, context) => {
  if (data.periodStart.slice(0, 7) !== data.month) context.addIssue({ code: "custom", path: ["periodStart"], message: "The covered period must start in the billing month." });
  if (data.periodEnd < data.periodStart) context.addIssue({ code: "custom", path: ["periodEnd"], message: "The covered period must end on or after its start." });
  if (daysBetween(data.periodStart, data.periodEnd) >= RENTAL_BILL_LIMITS.periodDays) context.addIssue({ code: "custom", path: ["periodEnd"], message: "A monthly rent bill can cover up to 31 days." });
});
export const rentalBillAction = z.object({ action: z.literal("void"), confirmed: z.literal(true), reason: z.string().trim().min(5, "Explain the correction in at least 5 characters.").max(400) });
export type CreateRentalBill = z.infer<typeof rentalBillInput>;
export type RentalBill = {
  id: string; connectionId: string; ownerId: string; renterId: string;
  month: string; periodStart: string; periodEnd: string; dueDate: string; amountCents: number; note: string;
  status: "issued" | "voided"; createdAt: string; createdDay: string;
  voidedAt: string | null; voidReason: string | null;
};
export type RentalBillWithBalance = RentalBill & BillBalances;
export type RentalBillSummary = RentalBillWithBalance & { propertyName: string; unitName: string; ownerName: string; renterName: string | null };
export type RentalBillEvent = { id: string; billId: string; actorId: string; actorName: string; action: string; reason: string; createdAt: string };
export type RentalBillDetail = { bill: RentalBillWithBalance; connection: RentalConnection; events: RentalBillEvent[]; currentBillId: string | null; payments: RentalPaymentRecord[]; paymentPage: number; hasMorePayments: boolean };
export type RentalBillsPage = { bills: RentalBillSummary[]; hasMore: boolean; month: string; totals: { count: number; amountCents: number; confirmedCents: number; remainingCents: number; pendingCents: number; pendingCount: number; past: number; today: number; upcoming: number } };

export function billPeriodError(bill: Pick<CreateRentalBill, "periodStart" | "periodEnd">, connection: Pick<RentalConnection, "leaseStart" | "leaseEnd">): string | null {
  if (bill.periodStart < connection.leaseStart || connection.leaseEnd && bill.periodEnd > connection.leaseEnd) return "Keep the covered period within the rental dates shared with your renter.";
  return null;
}
export function monthBounds(month: string) {
  if (!isBillingMonth(month)) throw new Error("Choose a valid billing month.");
  const [year, number] = month.split("-").map(Number);
  return { first: month + "-01", last: month + "-" + String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0") };
}
export function billDefaults(month: string, connection: Pick<RentalConnection, "leaseStart" | "leaseEnd" | "monthlyRentCents" | "dueDay">) {
  const { first, last } = monthBounds(month);
  const periodStart = first < connection.leaseStart ? connection.leaseStart : first;
  const periodEnd = connection.leaseEnd && connection.leaseEnd < last ? connection.leaseEnd : last;
  const due = month + "-" + String(Math.min(connection.dueDay, Number(last.slice(-2)))).padStart(2, "0");
  return { month, periodStart, periodEnd, dueDate: due < periodStart ? periodStart : due, amount: periodStart === first && periodEnd === last ? String(connection.monthlyRentCents / 100) : "" };
}
export function initialBillMonth(connection: Pick<RentalConnection, "leaseStart" | "leaseEnd">, day = philippinesDay()) {
  const afterStart = day.slice(0, 7) < connection.leaseStart.slice(0, 7) ? connection.leaseStart.slice(0, 7) : day.slice(0, 7);
  return connection.leaseEnd && afterStart > connection.leaseEnd.slice(0, 7) ? connection.leaseEnd.slice(0, 7) : afterStart;
}
export const billMonthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(month + "-01T12:00:00+08:00"));
export function billDateStatus(bill: Pick<RentalBill, "status" | "dueDate">, day = philippinesDay()) {
  return bill.status === "voided" ? "voided" : bill.dueDate < day ? "past" : bill.dueDate === day ? "today" : "upcoming";
}
export const billDateLabel = (state: ReturnType<typeof billDateStatus>) => ({ voided: "Cancelled", past: "Due date passed", today: "Due today", upcoming: "Upcoming" }[state]);
